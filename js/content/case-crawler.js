SG.add({
  id: 'case-crawler',
  ref: 'S9',
  section: 'HLD case studies',
  title: 'Design a web crawler',
  short: 'Web crawler',
  blurb: 'Crawl 10 billion pages in 5 days: a two-stage pipeline, queue retries, per-domain politeness and dedupe.',
  intro: 'Ask what the crawl is for first; here it is collecting web text to train an LLM: 10 billion pages of ~2 MB each, finished within 5 days. The functional part is small (seed URLs in, text out); the NFRs drive everything: fault tolerance (a crash never loses progress), politeness (obey robots.txt, about one request per second per domain), scale (10B pages) and efficiency (the 5-day deadline). Write the data flow as steps (frontier → DNS → fetch → extract text → store → extract links → repeat), then split the flaky fetch step from parsing with a queue that carries pointers to S3. Retry through the queue with backoff and a dead-letter queue, rate-limit per domain with jitter, dedupe URLs and content, and size the fetcher fleet from bandwidth maths. Do maths only where it decides something.',
  options: {
    'Two-stage pipeline with S3 pointers': {
      eli5: 'A dabbawala chain: one person collects tiffins and leaves them on a numbered rack, and a slip with the rack number goes to the sorter. If the sorter falls ill, the tiffins wait safely on the rack instead of being lost.',
      industry: [
        'Stage 1 fetchers save raw HTML to S3 and enqueue only the URL and the S3 key; stage 2 parsers read the key, store extracted text in S3 and push new URLs to the frontier.',
        'Common Crawl-style archives keeping raw pages so a new extractor (OCR, image alt text) reruns over stored HTML without refetching anything.',
        'A URL metadata table (DynamoDB or Postgres, keyed by URL) holding status, depth, last crawl time and S3 location.',
      ],
      def: 'Instead of one service that resolves DNS, fetches, parses and enqueues links in a single step, split the error-prone network fetch from CPU-bound parsing, with a durable queue between them. Fetchers write raw HTML to blob storage and enqueue a small message (URL + S3 key); parsers pick it up, extract text and links, and add new URLs to the frontier. Each stage scales and fails on its own, a crash loses only in-flight work, and changing the extractor only means rerunning stage 2. Messages carry pointers because pages average ~2 MB while Kafka’s default message limit is 1 MB and SQS allows far less.',
      scenarios: [
        'A fetcher crash must not lose hours of progress',
        'Parsing logic will change and pages shouldn’t be refetched',
        'Fetching is network-bound while parsing is CPU-bound',
        'Pages are larger than the queue’s message size limit',
      ],
      scale: '10B pages × ~2 MB ≈ 20 PB of raw HTML in S3; extracted text is a small fraction. Parsers sit downstream of the bottleneck and autoscale on queue depth.',
    },
    'Retries with backoff and a dead-letter queue': {
      eli5: 'If a shop’s shutter is down, the delivery boy comes back after 1 hour, then 4 hours, then next day. After five tries he returns the parcel to the depot and stops wasting trips.',
      industry: [
        'SQS: a received message stays invisible for the visibility timeout; if the worker crashes it reappears, and a successful worker deletes it.',
        'Backoff in SQS is the consumer’s job: it calls ChangeMessageVisibility with a delay computed from the receive count; a redrive policy with maxReceiveCount = 5 moves the message to a DLQ.',
        'Kafka has no per-message retry: teams publish failed URLs to a retry topic with a next-attempt time in the message, and a consumer waits until that time.',
      ],
      def: 'Fetches fail often: timeouts, 5xx errors, DNS failures. Don’t retry with in-memory sleeps, which vanish on a crash and hammer the site. Keep the URL in the durable queue and only delete (acknowledge) it after the stage succeeds, so a crashed worker’s message reappears by itself. Grow the delay exponentially per attempt, and after N receives move the URL to a dead-letter queue so dead sites stop consuming capacity. SQS does not grow the visibility timeout on its own; your consumer sets it per message.',
      scenarios: [
        'Some sites time out or return 503 intermittently',
        'Crawler machines can die mid-fetch',
        'Permanently dead sites must stop being retried',
        'The team uses Kafka, which has no built-in retry delay',
      ],
      scale: 'SQS visibility timeout defaults to 30 s, max 12 hours. Delays of 30 s, 2 min, 8 min, 32 min… with maxReceiveCount = 5 cover transient outages without endless retries. Kafka retains messages for 7 days by default.',
    },
    'Domain table + per-domain rate limiter': {
      eli5: 'A good guest reads the “no entry beyond this point” board, rings the bell once and waits. If the host is busy, he takes a short walk of a slightly random length and comes back, instead of everyone ringing again at once.',
      industry: [
        'A domain table (domain, last crawled, robots.txt disallow rules, crawl delay), cached in memory, checked before every fetch.',
        'A Redis sliding-window limiter per domain so many fetcher machines together stay at ~1 request/s per domain.',
        'Re-queueing a too-early URL with a delay of the crawl delay plus random jitter, and a smarter frontier that interleaves domains so one site can’t flood the queue.',
      ],
      def: 'Politeness is an NFR: hammer a site and you get blocked or take it down. Fetch robots.txt once per domain and store its rules and crawl delay in a domain table. Before fetching, drop disallowed paths (acknowledge and discard), then ask a shared per-domain limiter (Redis sliding window at ~1 req/s). If the domain is busy, put the URL back with a delay plus jitter rather than spin or sleep. Throughput comes from crawling millions of domains in parallel, not from hitting one domain hard.',
      scenarios: [
        'Thousands of a big site’s URLs sit in the frontier at once',
        'Many crawler machines may pick URLs from the same domain',
        'A site’s robots.txt forbids some paths or sets a crawl delay',
        'Deferred URLs keep colliding when they come back',
      ],
      scale: 'At 1 req/s, one domain gives at most 86,400 pages a day, so a 10M-page site needs ~115 days alone; 10B pages in 5 days needs ~23,000 pages/s spread over a very wide set of domains.',
    },
    'Bandwidth-sized fetcher fleet with DNS caching': {
      eli5: 'To move a mountain of sand in five days, you first ask how much one truck carries per trip, then hire enough trucks. And you don’t stop to ask for directions at every turn when you already know the route.',
      industry: [
        'Network-optimised instances (up to ~400 Gbps) running thousands of async fetch connections each.',
        'DNS results cached (locally or in Redis) and lookups spread round-robin across several DNS providers, so no single resolver throttles the crawl.',
        'Checking Content-Length and skipping huge or non-text files, plus timeouts that drop slow servers.',
      ],
      def: 'Fetching is I/O-bound, so estimate from bandwidth: pages per second per machine ≈ usable bandwidth ÷ page size; divide total pages by that rate to size the fleet against the deadline, then add headroom. Use async I/O so one machine keeps thousands of connections open. DNS becomes a hidden bottleneck at thousands of lookups per second, so cache resolutions per domain (respecting TTLs) and use multiple DNS providers. Parsers don’t need this maths: they sit after the bottleneck and autoscale.',
      scenarios: [
        'The crawl must finish within a fixed deadline',
        'DNS lookups slow every fetch',
        'You must justify the number of machines with numbers',
      ],
      scale: '400 Gbps ÷ 8 ÷ 2 MB = 25,000 pages/s in theory; at ~30% usable ≈ 7,500 pages/s. 10B ÷ 7,500 ≈ 1.3M s ≈ 15 days on one machine, so ~4 machines finish in about 4 days.',
    },
    'URL key + content-hash dedupe': {
      eli5: 'A postman keeps a register of houses already visited today, and if two letters have exactly the same text, he delivers only one. He also stops following “turn left at the next lane” notes after 20 turns.',
      industry: [
        'Normalised URL as the primary key of the URL metadata table, inserted when enqueued, so a seen URL is never queued twice.',
        'A hash of the page HTML stored with an index on it (a DynamoDB GSI) or in a Redis set, to skip mirrors and duplicate pages.',
        'Bloom filters (e.g. RedisBloom) only when memory is genuinely tight, accepting that a false positive silently skips a new page.',
      ],
      def: 'The web is full of duplicates: the same page under many URLs, mirrors, print versions and endless calendar or session-ID links. Normalise URLs and use the URL as the metadata table’s key; hash fetched content and skip pages whose hash already exists. An exact store of 10B hashes fits in memory or an indexed column, so a Bloom filter is only worth it under a stated memory limit: it can wrongly say “seen” and skip a page, but never wrongly say “new”. Store depth per URL and stop at ~20 hops to escape crawler traps.',
      scenarios: [
        'Many URLs lead to the same content',
        'A site generates infinite links (calendars, session IDs)',
        'Duplicate text would pollute an LLM training set',
        'Someone proposes a Bloom filter without a memory constraint',
      ],
      scale: '10B hashes × ~20 bytes ≈ 200 GB: one large Redis instance or an indexed column. A Bloom filter at 1% false positives needs ~10 bits per item ≈ 12.5 GB.',
    },
  },
  scenarios: [
    (pick) => {
      const pages = pick([10, 20, 5]);
      const days = pick([5, 7, 10]);
      const rate = 7500; // pages/s per 400 Gbps machine at ~30% utilisation of 2 MB pages
      const raw = (pages * 1e9) / (rate * days * 86400);
      const plan = Math.max(2, Math.ceil(raw * 1.5));
      return {
        q: `Interviewer: “Crawl about ${pages} billion pages (~2 MB each) to collect text for training an LLM, and have it done within ${days} days.” You write NFRs: fault tolerant, polite (robots.txt, ≤1 request/s per domain), scales to ${pages}B pages, finishes within ${days} days. Which decision turns the deadline NFR into a concrete number of machines?`,
        answer: 'Bandwidth-sized fetcher fleet with DNS caching',
        hint: 'A deadline becomes a machine count once you know one machine’s throughput.',
        steps: [
          'Fetching is I/O-bound, so one machine’s rate ≈ usable bandwidth ÷ page size.',
          '400 Gbps ÷ 8 ÷ 2 MB = 25,000 pages/s in theory; at ~30% usable ≈ 7,500 pages/s.',
          `${pages}B ÷ (7,500 × ${days} days × 86,400 s) ≈ ${raw.toFixed(1)} machines; round up with headroom to ~${plan}.`,
          'Then remove hidden bottlenecks like DNS so the estimate holds.',
        ],
        followups: [
          { q: 'Politeness caps you at 1 request/s per domain. What does that imply for the deadline?', options: ['One domain yields ≤86,400 pages a day, so throughput must come from crawling many domains in parallel', 'Nothing, politeness only affects robots.txt', 'Add more machines to crawl each domain faster', 'Politeness can be dropped for large sites'], why: 'More machines don’t help one domain; breadth across domains does.' },
          { q: 'Why don’t you size the parser fleet with the same maths?', options: ['Parsers sit after the fetch bottleneck and can autoscale on queue depth', 'Parsing needs no machines', 'Parsers must match fetchers one to one', 'Parsing is network-bound too'], why: 'Spend estimation effort only where it decides the design.' },
          { q: 'Which NFR is most often forgotten for crawlers, and why does it matter?', options: ['Politeness: without per-domain limits you get blocked and can take sites down', 'Strong consistency of the URL table', 'Sub-10 ms read latency', 'Multi-region writes'], why: 'An impolite crawler is effectively a DDoS tool.' },
        ],
      };
    },
    (pick) => {
      const hrs = pick(['six', 'nine', 'twelve']);
      return {
        q: `Your v1 crawler is one service per machine: pop URL, resolve DNS, fetch, extract text, store, push links. After ${hrs} hours a bad deploy crashes every instance, and because the frontier lived in memory, the crawl restarts from the seeds. A teammate’s fix puts the full HTML into Kafka messages between steps, but ~2 MB pages are rejected. The data team also wants to rerun a new text extractor over pages already fetched.`,
        answer: 'Two-stage pipeline with S3 pointers',
        hint: 'Separate the flaky step from the rest, persist between them, and pass a reference.',
        steps: [
          'Keep the frontier in a durable queue, not in memory.',
          'Stage 1 only fetches and writes raw HTML to S3; stage 2 parses.',
          'The queue message carries the URL and S3 key, well under Kafka’s 1 MB default limit.',
          'A crash loses only in-flight work, and re-extraction reruns stage 2 over stored HTML.',
        ],
        followups: [
          { q: 'Why split exactly at the fetch step?', options: ['Fetching is the error-prone, network-bound part; isolating it means parse failures and fetch failures retry separately', 'Fetching is the cheapest step', 'Parsers need DNS', 'It halves storage'], why: 'Cut the pipeline where the failure modes and resource profiles differ.' },
          { q: 'Where is each URL’s status, depth and S3 location kept?', options: ['A URL metadata table keyed by URL', 'Inside the queue message only', 'In the parser’s memory', 'In the robots.txt cache'], why: 'Queues are transient; the metadata table is the record of progress.' },
        ],
      };
    },
    (pick) => {
      const pct = pick(['8%', '5%', '12%']);
      return {
        q: `About ${pct} of fetches fail with timeouts or 503s. The fetcher retries each in a loop after 2 seconds, held in memory. Small sites are hammered by retries, crashed fetchers lose their pending retries, and URLs from domains that died months ago are retried forever. The frontier is an SQS queue.`,
        answer: 'Retries with backoff and a dead-letter queue',
        hint: 'Durable, spaced out, and with a stopping point.',
        steps: [
          'In-memory retry state is lost on crash and has no backoff.',
          'Delete the SQS message only after success, so a crashed worker’s message reappears after the visibility timeout.',
          'On failure, call ChangeMessageVisibility with a delay that grows per receive (30 s, 2 min, 8 min…).',
          'A redrive policy with maxReceiveCount = 5 moves dead URLs to a DLQ.',
        ],
        followups: [
          { q: 'A teammate says “SQS backs off exponentially for us automatically.” Correct?', options: ['No: the timeout is fixed per queue unless the consumer changes it per message, so backoff is your code', 'Yes, SQS doubles it each time', 'Yes, but only for FIFO queues', 'No, SQS can’t delay messages at all'], why: 'SQS gives you invisibility and receive counts; the growing delay is yours.' },
          { q: 'Why does a visibility timeout guarantee a crashed worker’s URL isn’t lost?', options: ['The message isn’t deleted until acknowledged, so it reappears when the timeout expires', 'The worker writes it to disk first', 'SQS copies it to every worker', 'It is lost; you need a cron job'], why: 'Delete-after-success turns crashes into retries.' },
        ],
      };
    },
    () => ({
      q: 'The company standardises on Kafka instead of SQS. Failed fetches still need to wait 1 minute, then 5, then 30 before retrying, and must stop after 5 attempts, but Kafka has no visibility timeout and committing the offset of a failed URL would lose it.',
      answer: 'Retries with backoff and a dead-letter queue',
      hint: 'Kafka can’t hide a message for a while, so encode the wait in the data.',
      steps: [
        'Kafka tracks consumer-group offsets and retains messages by time (7 days by default); it has no per-message delay.',
        'On failure, publish the URL to a retry topic with an attempt count and a next-attempt timestamp, then commit the original offset.',
        'The retry consumer waits until that timestamp before refetching.',
        'After 5 attempts, publish to a dead-letter topic instead.',
      ],
      followups: [
        { q: 'Why might a team pick SQS here even with Kafka elsewhere?', options: ['Visibility timeouts, receive counts and DLQ redrive are built in, so retries need far less custom code', 'SQS is always faster', 'Kafka can’t store URLs', 'SQS keeps messages forever'], why: 'Choose the queue whose features match the retry problem.' },
      ],
    }),
    (pick) => {
      const site = pick(['a large news site', 'a government portal', 'an online encyclopedia']);
      const n = pick(['40', '120', '300']);
      return {
        q: `${n} crawler machines pull from one frontier. Because ${site} links heavily to itself, its URLs dominate the queue and it gets hundreds of requests per second from you. Its admin blocks your IP range, and you also fetched paths its robots.txt disallows.`,
        answer: 'Domain table + per-domain rate limiter',
        hint: 'The limit must hold across all machines, per domain.',
        steps: [
          'Store robots.txt rules and crawl delay per domain; acknowledge and drop disallowed URLs.',
          'Before fetching, check a shared Redis sliding-window limiter at ~1 req/s for that domain.',
          'If it’s too soon, put the URL back with a delay of the crawl delay plus random jitter.',
          'Interleave domains in the frontier so throughput comes from breadth, not one site.',
        ],
        followups: [
          { q: 'Why add jitter to deferred URLs?', options: ['Otherwise many deferred URLs for a domain wake at the same instant and collide again', 'Jitter makes fetches faster', 'robots.txt requires it', 'It randomises crawl order for fairness to users'], why: 'Synchronised retries recreate the burst you were avoiding.' },
          { q: 'Why not let each machine keep its own per-domain timer?', options: ['Each machine would allow 1 req/s, so 100 machines send 100 req/s to the same domain', 'Timers are slow in Java', 'It would break DNS caching', 'Machines can’t read robots.txt'], why: 'A per-domain limit must be shared to be a real limit.' },
        ],
      };
    },
    (pick) => {
      const ms = pick(['120', '200', '80']);
      return {
        q: `Profiling shows fetcher threads spend most of their time waiting on DNS: each lookup takes ~${ms} ms, your one resolver starts rate-limiting you at thousands of lookups per second, and throughput falls to a third of the bandwidth estimate. Most URLs belong to domains you resolved minutes ago.`,
        answer: 'Bandwidth-sized fetcher fleet with DNS caching',
        hint: 'Your capacity plan assumed only bandwidth mattered.',
        steps: [
          'The fleet was sized from bandwidth, but DNS is now the bottleneck.',
          'Cache resolutions per domain (respecting TTLs), since URLs cluster by domain.',
          'Spread the remaining lookups round-robin across several DNS providers.',
          'Throughput returns to the bandwidth estimate.',
        ],
        followups: [
          { q: 'How else can you avoid wasting bandwidth on useless fetches?', options: ['Check Content-Length or send a HEAD first and skip non-HTML or very large files', 'Fetch everything twice', 'Disable timeouts', 'Fetch images to extract alt text'], why: 'The fleet size assumed ~2 MB pages; giant files break that.' },
        ],
      };
    },
    (pick) => {
      const trap = pick(['a calendar with “next month” links forever', 'session IDs added to every URL', 'endlessly nested category filters']);
      return {
        q: `Your crawler spends days on one site that generates ${trap}, and the text corpus contains the same article thousands of times from mirror sites and print-friendly URLs. You have plenty of memory and DynamoDB capacity.`,
        answer: 'URL key + content-hash dedupe',
        hint: 'Two problems: the same content under many URLs, and URLs that never end.',
        steps: [
          'Normalise URLs and use them as the metadata table’s key, so a seen URL isn’t queued again.',
          'Hash fetched HTML and skip pages whose hash exists (DynamoDB GSI or a ~200 GB Redis set).',
          'Store depth per URL and stop following links past ~20 hops.',
          'The crawler escapes traps and the corpus stays clean.',
        ],
        followups: [
          { q: 'A candidate jumps straight to a Bloom filter. What is the weakness of that answer here?', options: ['Exact hashes fit in ~200 GB, and a Bloom filter’s false positives silently skip new pages; it only pays off under a stated memory limit', 'Bloom filters can say “new” for seen pages', 'Bloom filters are exact', 'Bloom filters need a GPU'], why: 'Name the constraint before reaching for a probabilistic structure.' },
        ],
      };
    },
  ],
});
