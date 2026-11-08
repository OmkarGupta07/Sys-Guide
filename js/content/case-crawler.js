SG.add({
  id: 'case-crawler',
  ref: 'S9',
  section: 'HLD case studies',
  title: 'Design a web crawler',
  short: 'Web crawler',
  blurb: 'Crawl 10 billion pages in days: a pipeline of queues, polite per-domain limits, retries and dedup.',
  intro: 'A crawler starts from seed URLs, fetches pages, extracts text (for search or LLM training) and new links, and repeats. The functional part is small; the NFRs drive everything: fault tolerance (never lose progress), politeness (obey robots.txt, about one request per second per domain), efficiency (e.g. 10B pages in 5 days) and scale. Split the work into stages joined by durable queues, store raw HTML in blob storage, retry failures with exponential backoff and a dead-letter queue, rate-limit per domain, and size the fetcher fleet from network bandwidth. Deduplicate URLs and content, and cap depth to escape crawler traps.',
  options: {
    'Pipelined stages with durable queues': {
      eli5: 'A dabbawala chain: one person collects tiffins, another sorts them at the station, a third delivers. If the sorter falls ill, the collected tiffins wait safely on the rack instead of being lost.',
      industry: [
        'Fetcher → blob store (raw HTML in S3) → parser stage, linked by SQS/Kafka queues carrying only URL IDs.',
        'Common Crawl-style archives storing raw pages so new extraction logic can rerun without refetching.',
        'A metadata DB (DynamoDB/Postgres) tracking each URL’s status, depth, last crawl time and blob location.',
      ],
      def: 'Instead of one service that resolves DNS, fetches, parses and enqueues links in a single step, split fetching and processing into stages connected by durable queues. Fetchers save raw HTML to blob storage and enqueue a small message; parsers read it, extract text and links, and push new URLs to the frontier queue. Each stage scales and fails independently, a crash loses at most in-flight work, and changing the extractor doesn’t require recrawling. Queues should carry IDs, not multi-MB pages.',
      scenarios: [
        'A fetcher crash must not lose hours of progress',
        'Parsing logic changes often and pages shouldn’t be refetched',
        'Fetching is network-bound while parsing is CPU-bound',
      ],
      scale: '10B pages × ~30 KB of HTML ≈ 300 TB of raw HTML in blob storage. Parsers autoscale on queue depth (e.g. ECS/Fargate or Lambda).',
    },
    'Retries with backoff and a dead-letter queue': {
      eli5: 'If a shop’s shutter is down, the delivery boy comes back after 1 hour, then 4 hours, then next day. After five tries he returns the parcel to the depot and stops wasting trips.',
      industry: [
        'SQS visibility timeouts: an unacknowledged message reappears for another worker; ChangeMessageVisibility sets the next delay.',
        'Delay computed from the receive count (exponential backoff) and a redrive policy sending messages to a DLQ after ~5 attempts.',
        'Kafka alternative: retry topics with next-attempt timestamps, which works but is more custom code.',
      ],
      def: 'Fetches fail often: timeouts, 5xx errors, DNS failures. Don’t retry with in-memory timers, which vanish on a crash and hammer the site. Keep the URL in a durable queue, make it invisible for an exponentially growing delay after each failure, and move it to a dead-letter queue after N attempts so a dead site stops consuming capacity. Workers acknowledge (delete) a message only after the stage succeeds, so a worker crash makes the message reappear automatically.',
      scenarios: [
        'Some sites time out or return 503 intermittently',
        'Crawler machines can die mid-fetch',
        'Permanently dead sites must stop being retried',
      ],
      scale: 'SQS visibility timeout defaults to 30 s and can go up to 12 hours. 5 attempts at 1 min, 4 min, 16 min… covers transient outages without endless retries.',
    },
    'Per-domain politeness and rate limiting': {
      eli5: 'A good guest rings the bell once and waits, and reads the “no entry beyond this point” board. A rude one leans on the bell and walks into every room.',
      industry: [
        'Fetching and caching robots.txt per domain, honouring Disallow rules (and Crawl-delay where given).',
        'A per-domain lock or sliding-window counter in Redis so many crawler machines together stay at ~1 request/s per domain.',
        'Deferring a URL whose domain was hit too recently by pushing it back into the queue with a delay plus jitter.',
      ],
      def: 'Politeness is an NFR: overload a site and you get blocked or cause an outage. Store each domain’s robots.txt rules and last-fetch time in the metadata store. Before fetching, check the rules and acquire a short per-domain token (Redis SET NX with TTL equal to the crawl delay, or a sliding-window counter). If the domain is busy, delay the message rather than spin. Throughput comes from crawling millions of domains in parallel, not from hitting one domain hard. Add jitter so deferred URLs don’t all return at the same moment.',
      scenarios: [
        'Thousands of a big site’s URLs sit in the frontier at once',
        'Many crawler machines may pick URLs from the same domain',
        'A site’s robots.txt forbids some paths',
      ],
      scale: 'At ~1 req/s per domain, a site with 10M pages takes ~115 days alone, so huge domains need prioritisation; overall throughput comes from breadth across millions of domains.',
    },
    'Bandwidth-sized fetcher fleet with DNS caching': {
      eli5: 'To move a mountain of sand in five days, you first ask how much one truck carries per trip, then hire enough trucks. And you don’t ask for directions at every turn when you already know the route.',
      industry: [
        'Network-optimised instances (tens to hundreds of Gbps) running many async fetch connections each.',
        'Local DNS caches and multiple resolvers, after the Mercator crawler found DNS could take most of a fetch thread’s time.',
        'HEAD requests to skip huge files and timeouts to drop slow servers.',
      ],
      def: 'Fetching is I/O-bound, so estimate from bandwidth: pages per second per machine ≈ usable bandwidth ÷ page size, then divide total pages by that rate to size the fleet against the deadline. Use asynchronous I/O to keep thousands of connections open per machine. DNS becomes a bottleneck at thousands of lookups per second, so cache resolutions per domain and spread queries across several resolvers. Skip huge or non-text resources early.',
      scenarios: [
        'The crawl must finish within a fixed deadline',
        'DNS lookups slow every fetch',
        'You must justify the number of machines with numbers',
      ],
      scale: '200 Gbps ÷ 8 ÷ 2 MB ≈ 12,500 pages/s; at ~30% utilisation ≈ 3,750 pages/s. 10B ÷ 3,750 ≈ 31 days on one machine, so ~8 machines meet 5 days.',
    },
    'URL and content deduplication': {
      eli5: 'A postman keeps a list of houses already visited today, and if two letters have exactly the same text, he delivers only one. He also stops following “turn left at the next lane” notes after 20 turns.',
      industry: [
        'Normalising URLs (lowercase host, remove fragments and tracking params) and checking a URL table before enqueueing.',
        'Hashing page content and indexing the hash to skip mirrors and duplicate pages.',
        'Bloom filters (e.g. RedisBloom) as a compact “seen” set, accepting a few false positives (skipped pages).',
      ],
      def: 'The web is full of duplicates: the same page under many URLs, mirrored sites, and endless calendar or session-ID links. Normalise URLs and check the metadata store before enqueueing; hash fetched content and skip pages whose hash already exists. A Bloom filter saves memory but can wrongly report “seen” and skip a page; never a false “new”. Track link depth from the seed and stop at ~15–20 hops to escape crawler traps.',
      scenarios: [
        'Many URLs lead to the same content',
        'A site generates infinite links (calendars, session IDs)',
        'Duplicate text would pollute an LLM training set',
      ],
      scale: '10B URLs × ~8-byte hash ≈ 80 GB, fine for an indexed DB column. A Bloom filter at 1% false positives needs ~10 bits per item ≈ 12.5 GB.',
    },
  },
  scenarios: [
    (pick) => {
      const pages = pick(['10 billion', '5 billion', '20 billion']);
      const days = pick(['5', '7', '10']);
      return {
        q: `Interviewer: “Crawl about ${pages} pages to collect text for training an LLM, and have the data ready within ${days} days.” You list NFRs: fault tolerance, politeness, scalability, and efficiency (finish within ${days} days). Which decision turns the efficiency NFR into a concrete number in your design?`,
        answer: 'Bandwidth-sized fetcher fleet with DNS caching',
        hint: 'A deadline becomes a machine count once you know one machine’s throughput.',
        steps: [
          'Fetching is I/O-bound, so per-machine throughput ≈ usable bandwidth ÷ average page size.',
          'With ~200 Gbps, 2 MB pages and ~30% utilisation, one machine does ~3,750 pages/s.',
          'Total pages ÷ (rate × seconds in the deadline) gives the fleet size.',
          'Then remove hidden bottlenecks like DNS so the estimate holds.',
        ],
        followups: [
          { q: 'Which NFR do candidates most often forget for crawlers, and why does it matter?', options: ['Politeness: overloading sites gets you blocked and can take them down', 'Strong consistency of the URL table', 'Sub-10 ms latency', 'GDPR deletion'], why: 'Without per-domain limits the crawler is effectively a DDoS tool.' },
          { q: 'What is a reasonable thing to declare out of scope early?', options: ['JavaScript-rendered pages and non-text media', 'Fault tolerance', 'robots.txt', 'Storing the extracted text'], why: 'Scoping keeps the design on the core text crawl; headless rendering can be a later extension.' },
        ],
      };
    },
    (pick) => {
      const hrs = pick(['six', 'nine', 'twelve']);
      return {
        q: `Your v1 crawler is one service per machine: pop URL, resolve DNS, fetch, extract text, store, push links. After ${hrs} hours a bad deploy crashes every instance, and because the frontier lived in process memory, the crawl restarts from the seeds. The data team also wants to rerun a new text extractor over pages already fetched.`,
        answer: 'Pipelined stages with durable queues',
        hint: 'Separate the slow, flaky step from the rest, and persist between steps.',
        steps: [
          'Keep the frontier in a durable queue, not in memory.',
          'Split into fetch and parse stages; fetchers store raw HTML in blob storage.',
          'Queue messages carry URL IDs; a metadata DB records status and blob location.',
          'A crash loses only in-flight work, and re-extraction reads stored HTML.',
        ],
        followups: [
          { q: 'Why not put the HTML itself in the queue message?', options: ['Queues are built for small messages with tight size caps; blobs belong in object storage', 'Queues reject HTML', 'It is always slower to read S3', 'It breaks robots.txt'], why: 'Pass a pointer, store the payload elsewhere.' },
        ],
      };
    },
    (pick) => {
      const pct = pick(['8%', '5%', '12%']);
      return {
        q: `About ${pct} of fetches fail with timeouts or 503s. The fetcher retries each one in a loop after 2 seconds, held in memory. Several small sites are now hammered by retries, crashed fetchers lose their pending retries, and URLs from domains that went offline months ago are retried forever.`,
        answer: 'Retries with backoff and a dead-letter queue',
        hint: 'Durable, spaced out, and with a stopping point.',
        steps: [
          'In-memory retry state is lost on crash and has no backoff.',
          'Leave the message in a durable queue and make it invisible for an exponentially growing delay.',
          'Acknowledge only after success, so crashed workers’ messages reappear.',
          'After ~5 attempts, move the URL to a dead-letter queue and mark the site offline.',
        ],
        followups: [
          { q: 'Why does a visibility timeout guarantee a crashed worker’s URL isn’t lost?', options: ['The message is never deleted until acknowledged, so it reappears when the timeout expires', 'The worker writes it to disk first', 'SQS copies it to every worker', 'It is lost, you need a cron job'], why: 'Delete-after-success turns crashes into retries.' },
        ],
      };
    },
    (pick) => {
      const site = pick(['a large news site', 'a government portal', 'an online encyclopedia']);
      const n = pick(['40', '120', '300']);
      return {
        q: `${n} crawler machines all pull from one frontier. Because ${site} links heavily to itself, its URLs dominate the queue, and it receives hundreds of requests per second from you. Its admin blocks your IP range, and you also notice you fetched paths its robots.txt disallows.`,
        answer: 'Per-domain politeness and rate limiting',
        hint: 'The limit must hold across all machines, per domain.',
        steps: [
          'Store robots.txt rules per domain and drop disallowed URLs.',
          'Coordinate across machines with a shared per-domain token (Redis SET NX with TTL = crawl delay) or sliding window.',
          'If the domain is busy, push the URL back with a delay plus jitter instead of fetching.',
          'Throughput comes from breadth across many domains, not depth on one.',
        ],
        followups: [
          { q: 'Why add jitter to deferred URLs?', options: ['Otherwise many deferred URLs for a domain wake at the same instant and collide again', 'Jitter makes fetches faster', 'robots.txt requires it', 'To randomise the crawl order for fairness to users'], why: 'Synchronised retries recreate the burst you were avoiding.' },
        ],
      };
    },
    (pick) => {
      const ms = pick(['120', '200', '80']);
      return {
        q: `Profiling shows fetcher threads spend most of their time waiting on DNS: each lookup takes ~${ms} ms, your resolver starts rate-limiting you at thousands of lookups per second, and throughput falls to a third of the bandwidth estimate. Most URLs belong to domains you resolved minutes ago.`,
        answer: 'Bandwidth-sized fetcher fleet with DNS caching',
        hint: 'Your capacity plan assumed only bandwidth mattered.',
        steps: [
          'The fleet was sized from bandwidth, but DNS is now the bottleneck.',
          'Cache resolutions per domain (respecting TTLs), since URLs cluster by domain.',
          'Spread remaining lookups across several resolvers.',
          'Throughput returns to the bandwidth-based estimate.',
        ],
        followups: [
          { q: 'How else can you avoid wasting bandwidth on useless fetches?', options: ['Send a HEAD first and skip non-HTML or very large files (e.g. > 10 MB)', 'Fetch everything twice', 'Disable timeouts', 'Fetch images to extract alt text'], why: 'The fleet size assumed ~2 MB pages; giant files break that.' },
        ],
      };
    },
    (pick) => {
      const trap = pick(['a calendar with “next month” links forever', 'session IDs added to every URL', 'endlessly nested category filters']);
      return {
        q: `Your crawler spends days on one site that generates ${trap}, and the text corpus contains the same article thousands of times from mirror sites and print-friendly URLs.`,
        answer: 'URL and content deduplication',
        hint: 'Two problems: the same content under many URLs, and URLs that never end.',
        steps: [
          'Normalise URLs and check a seen-URL table before enqueueing.',
          'Hash fetched content and skip pages whose hash already exists.',
          'Store depth per URL and stop following links past ~15–20 hops.',
          'The crawler escapes traps and the corpus stays clean.',
        ],
        followups: [
          { q: 'A Bloom filter says a URL was seen. What can go wrong?', options: ['It can be a false positive, so a few new pages are skipped; it never misses a seen URL', 'It can say “new” for seen URLs', 'Nothing, it is exact', 'It deletes the URL'], why: 'Bloom filters have false positives, never false negatives.' },
        ],
      };
    },
  ],
});
