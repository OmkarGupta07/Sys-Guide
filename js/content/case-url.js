SG.add({
  id: 'case-url',
  ref: 'S1 S23',
  section: 'HLD case studies',
  title: 'Design a URL shortener and Pastebin',
  short: 'URL shortener',
  blurb: 'Short unique codes, millisecond redirects for a read-heavy workload, and blobs in object storage for Pastebin.',
  intro: 'A URL shortener is two APIs: POST /urls returns a short code, GET /{code} redirects. The interesting parts are the non-functional ones: codes must be unique and short (6–8 base62 characters), redirects must be fast (under ~200 ms) and highly available, and reads outnumber writes by 100–1000×, so eventual consistency on new links is fine. Decide how to generate codes (a global counter or random codes with a collision check), put a cache in front of the database, and choose 302 or 301 based on whether you need to see every click. Pastebin is the same design, except the content is a large immutable blob, so it goes to object storage behind a CDN while the database keeps only metadata.',
  options: {
    'Counter + base62 short codes': {
      eli5: 'Like token numbers at a bank counter: each new customer gets the next number, so two people can never hold the same token. Writing the number in base62 just makes it shorter.',
      industry: [
        'Redis INCR as a global counter, each write server leasing blocks of 1,000 IDs so it rarely makes a network call.',
        'Ticket-server or Snowflake-style ID services, base62-encoded into codes like bit.ly/3xK9a.',
        'Libraries such as Sqids that shuffle sequential numbers one-to-one so codes look random but never collide.',
      ],
      def: 'Every new link takes the next value of a counter shared by all write servers (Redis INCR, a ticket table, or block leases), and the number is base62-encoded (0–9, A–Z, a–z). A unique number gives a unique code, so you don’t need a lookup before inserting. The downside is that sequential codes can be guessed and enumerated, so add a one-to-one shuffle (bijective encoding) or rate limits if that matters.',
      scenarios: [
        'Several write servers must never hand out the same code',
        'You want to skip the extra “does this code exist?” read on every create',
        'Codes must stay at 6–7 characters for years of growth',
      ],
      scale: '62^6 ≈ 56.8 billion and 62^7 ≈ 3.5 trillion codes. A single Redis counter handles ~100K INCR/s, and leasing blocks of 1,000 cuts that load 1,000×. Losing a partly used block on a crash is harmless.',
    },
    'Random/hash code with collision check': {
      eli5: 'Like picking a random locker number for each new student. Usually it’s free, but before handing over the key you peek inside to make sure nobody already has it.',
      industry: [
        'Shorteners that generate random 7–8 character codes and insert with a unique constraint, retrying on conflict.',
        'Hashing the long URL (MD5/Murmur/SHA-256), base62-encoding it and taking the first 7 characters.',
        'Pastebin-style services with unguessable paste IDs, so people can’t browse other users’ pastes.',
      ],
      def: 'Generate a random number (or hash the long URL), base62-encode it and cut it to N characters. Because of the birthday paradox, collisions happen long before the code space is full, so every create must detect them: insert under a primary-key/unique constraint and retry with a new code on conflict. A hash is no better than a random number here; its output is just as random.',
      scenarios: [
        'Codes must not be guessable or enumerable',
        'There is no shared counter service and the team wants fewer moving parts',
        'Create traffic is low, so one extra read or a retried insert costs nothing',
      ],
      scale: 'With 1 billion random codes in a 62^6 (56.8B) space you expect millions of collisions (≈ n²/2N ≈ 9M), so a check is required. Moving to 7–8 characters makes retries rare but never zero.',
    },
    'Redis cache for redirects': {
      eli5: 'A chaiwala keeps the most-ordered teas ready on the counter instead of brewing each one from scratch. Popular links answer from memory, and only rare ones go to the store room.',
      industry: [
        'Bitly-style services serving redirects from Redis/Memcached with an LRU policy.',
        'Read-through or look-aside caches keyed by short code, with the long URL as the value.',
        'Absorbing hot links (an influencer’s giveaway URL) that would otherwise overload one database shard.',
      ],
      def: 'The redirect path checks an in-memory cache (key = short code, value = long URL plus expiry) before the database. On a miss it reads the indexed primary key, fills the cache and redirects. LRU eviction fits because a small share of links gets most clicks and old links go cold. The cache isn’t the source of truth, so losing it only costs latency for a while.',
      scenarios: [
        'Reads outnumber writes 100–1000× and redirects must stay under ~200 ms',
        'A few viral links receive most of the traffic',
        'The database is fine for storage but struggles with peak read QPS',
      ],
      scale: '100M DAU × ~1 redirect/day ≈ 1K/s average, 10–100K/s at peak. One Redis node serves ~100K reads/s in under a millisecond. 1B rows × ~500 bytes ≈ 500 GB, so the database often doesn’t even need sharding.',
    },
    'Redirect status choice (302 vs 301)': {
      eli5: 'A 301 is telling a friend “the shop has moved, remember the new address”, so they never ask you again. A 302 is “today it’s over there”, so they ask you every time, and you know each time someone is going.',
      industry: [
        'Bitly and most commercial shorteners use 301/302 depending on whether click analytics are needed.',
        'Marketing links that must count every click use 302 (or 307) so each request reaches the server.',
        'Permanent vanity redirects (old domain to new domain) use 301 so browsers and CDNs cache them.',
      ],
      def: 'A 301 (permanent) lets browsers and intermediaries cache the redirect, so repeat clicks may never reach you: cheaper, but you lose analytics and visibility, and changing or expiring the link later is hard. A 302 (temporary) is not cached by default, so every click hits your service: you can count clicks, enforce expiry and notice when traffic suddenly drops. Most designs pick 302.',
      scenarios: [
        'Customers pay for click analytics on their links',
        'Links have expiration times that must be enforced',
        'Cost matters more than visibility and links never change',
      ],
      scale: '302 keeps every click on your servers (plan for peak QPS). 301 offloads repeat clicks to browser caches, but you lose any control over that traffic.',
    },
    'Object storage + CDN for paste content': {
      eli5: 'A library catalogue card tells you which shelf a book is on; the heavy book sits on the shelf, not in the card drawer. The database holds the card, object storage holds the book, and a CDN is a branch library near your home.',
      industry: [
        'Pastebin/GitHub Gist-style services storing paste bodies in S3/GCS, with metadata in a database.',
        'Clients uploading directly to S3 using pre-signed PUT URLs so app servers never handle the bytes.',
        'CloudFront/Cloudflare caching immutable pastes at the edge, with S3 lifecycle rules for expiry.',
      ],
      def: 'Large immutable content (100 KB average pastes, up to GBs) goes into object storage, and the database row keeps only short code, object key, owner and expiry. The client gets a pre-signed URL, uploads directly, then asks the server to claim a short code for that object; reads resolve the code and fetch the content through a CDN. Big text kept in database rows hurts page-cache efficiency, holds locks longer and makes replication slow and expensive.',
      scenarios: [
        'Users paste 100 KB to several GB of text',
        'Popular pastes are read worldwide and never change',
        'Expired content must be deleted to keep storage bills under control',
      ],
      scale: '600M pastes/month × 100 KB ≈ 57 TB/month. Without cleanup, the bill keeps growing every month. Single PUTs to S3 max out at 5 GB; anything larger needs multipart upload.',
    },
  },
  scenarios: [
    (pick) => {
      const dau = pick(['100 million', '50 million', '200 million']);
      const ratio = pick(['1000:1', '500:1', '200:1']);
      return {
        q: `Interviewer: “Design a link shortener for ${dau} daily users, about 1 billion links in total, and a read:write ratio of ${ratio}.” You have the two APIs. Before deep dives you must state your non-functional requirements and say which component they will drive. Which part of the design does your most important NFR point to?`,
        answer: 'Redis cache for redirects',
        hint: 'Which path runs a thousand times for every create, and what does a user notice on it?',
        steps: [
          'NFRs: redirects under ~200 ms, high availability, unique codes, and scale to the stated users and links.',
          'Writes are about 1 per second, while redirects are ~1K/s on average and 10–100K/s at peak.',
          'So latency and availability on the read path matter most; new links can be eventually consistent.',
          'An in-memory cache in front of the indexed database is the main way to meet them.',
        ],
        followups: [
          { q: 'Consistency or availability for this system, and why?', options: ['Availability with eventual consistency: a new link showing up a few seconds late hurts nobody', 'Strong consistency: every read must see the latest write', 'Neither matters for a shortener', 'Consistency, because links are like bank balances'], why: 'There’s natural delay before anyone clicks a newly shared link; a ticket or payment system can’t tolerate stale reads, a shortener can.' },
          { q: 'Why not spend the first five minutes on detailed storage and bandwidth estimates?', options: ['Do the math when a number will change a decision, e.g. proving 500 GB fits one database', 'Estimates are never useful', 'Interviewers require them up front', 'They replace the NFR list'], why: 'Calculations earn their time when they decide something, such as whether to shard.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['4', '8', '12']);
      return {
        q: `You scaled the write service to ${n} instances behind a load balancer. Each instance keeps its own in-memory counter starting at 0 and base62-encodes it. Within an hour, two customers report their short links open each other’s pages.`,
        answer: 'Counter + base62 short codes',
        hint: 'The idea is right; the state is in the wrong place.',
        steps: [
          'Every instance hands out 1, 2, 3… so codes collide across instances.',
          'Move the counter out of the instances into one shared, atomic counter (Redis INCR or a ticket service).',
          'Let each instance lease a block (e.g. 1,000 numbers) to avoid a network call per create.',
          'A shared counter with base62 encoding gives codes that are unique by construction.',
        ],
        followups: [
          { q: 'An instance crashes after using 300 of its 1,000 leased numbers. What should you do?', options: ['Nothing: skip the remaining 700, since the code space is in the trillions', 'Recover them with a distributed transaction', 'Restart the counter from 0', 'Stop all writes until it’s fixed'], why: 'Gaps are harmless; uniqueness is what matters.' },
          { q: 'Competitors are counting your links by incrementing codes. Cheapest fix that keeps the counter?', options: ['Pass the number through a one-to-one shuffle (bijective encoding) before base62', 'Switch to MD5 of the long URL', 'Make codes 20 characters long', 'Use 301 redirects'], why: 'A bijection keeps uniqueness but hides the sequence.' },
        ],
      };
    },
    (pick) => {
      const qps = pick(['20', '50', '200']);
      return {
        q: `A security review says your share links for private documents must not be guessable or enumerable. There is no shared counter infrastructure, create traffic is about ${qps} links per second, and the team prefers the fewest moving parts.`,
        answer: 'Random/hash code with collision check',
        hint: 'Unpredictable codes, and low write volume makes an extra check cheap.',
        steps: [
          'Sequential counters are predictable unless you add extra machinery.',
          'Random 7–8 character base62 codes are unguessable and need no coordination.',
          'Collisions are still possible, so insert under a unique constraint and retry on conflict.',
          'At this write rate the extra read or retry costs nothing.',
        ],
        followups: [
          { q: 'Why can’t you skip the collision check with 6-character codes and 1 billion links?', options: ['The birthday paradox: expected collisions run into the millions long before 56.8B codes are used', 'Collisions are impossible with random numbers', 'Base62 guarantees uniqueness', 'Only hashes collide, random numbers don’t'], why: 'Expected collisions ≈ n²/2N ≈ 10^18 / 1.1×10^11 ≈ 9 million.' },
          { q: 'Someone suggests hashing the long URL instead of a random number “to avoid collisions”. Does it help?', options: ['No: a truncated hash is just as random, so you still need the check', 'Yes, hashes never collide', 'Yes, but only with SHA-256', 'It removes the need for a database'], why: 'Truncating a hash to 6–7 characters leaves the same collision maths.' },
        ],
      };
    },
    (pick) => {
      const team = pick(['marketing', 'growth', 'partnerships']);
      return {
        q: `Your shortener returns 301 to keep server costs low. The ${team} team now sells per-link click analytics, but dashboards show far fewer clicks than partners see in their own logs, and an expired link keeps working for users who clicked it before.`,
        answer: 'Redirect status choice (302 vs 301)',
        hint: 'Who is answering the repeat clicks?',
        steps: [
          '301 is permanent, so browsers and intermediaries cache it and repeat clicks never reach you.',
          'That breaks analytics, expiry enforcement and your ability to see when traffic drops.',
          'Switch to 302 (temporary) so every click hits your service and can be logged.',
          'Accept the extra QPS and scale it with the cache.',
        ],
        followups: [
          { q: 'You also put redirects behind a CDN to cut latency. What does that do to analytics?', options: ['The edge answers repeat clicks too, so you need edge logs or a short edge TTL', 'Nothing changes', 'CDNs can’t cache redirects', 'It makes 301 behave like 302'], why: 'Any cache in front of you hides hits, whether it’s a browser or a CDN.' },
        ],
      };
    },
    (pick) => {
      const avg = pick(['100 KB', '250 KB', '60 KB']);
      return {
        q: `You extend the shortener into a Pastebin. The first version stores each paste (average ${avg}, max 5 GB) in a Postgres TEXT column. Replica lag climbs, cross-AZ replication fees spike, cache hit rates drop, and app servers’ network links saturate under uploads.`,
        answer: 'Object storage + CDN for paste content',
        hint: 'Large immutable blobs don’t belong in transactional rows or on your app servers’ network links.',
        steps: [
          'Big rows waste database pages, slow replication and hold locks longer.',
          'Put paste bodies in S3/GCS; the database keeps code → object key, owner and expiry.',
          'The client uploads directly with a pre-signed URL, then claims a short code.',
          'Reads go through a CDN, because pastes never change and a few go viral.',
        ],
        followups: [
          { q: 'Which order avoids short codes that point at nothing?', options: ['Upload to object storage first, then claim the short code; clean up orphaned objects later', 'Claim the code first, then upload', 'Do both in a distributed transaction', 'Let the client choose the order'], why: 'A failed upload after claiming leaves a dead link; an orphaned object is just garbage to sweep.' },
          { q: 'Users choose any expiry time. How can a cleanup job find expired objects cheaply?', options: ['Name objects starting with the expiry timestamp so listing (lexicographic order) returns them oldest first', 'Scan the whole bucket daily', 'Lifecycle rules per arbitrary second', 'Query the database rows, which may already be reused'], why: 'S3 lists keys in order, so a fixed-width expiry prefix works like an index; lifecycle rules only suit a few fixed windows.' },
        ],
      };
    },
    (pick) => {
      const rps = pick(['40,000', '80,000', '150,000']);
      return {
        q: `A cricketer tweets a short link to a giveaway. The redirect for that one code jumps to ${rps} requests per second, all landing on the single database shard that owns it, while the other shards idle.`,
        answer: 'Redis cache for redirects',
        hint: 'One key is hot; the data never changes.',
        steps: [
          'You can’t predict which link will go viral, so you can’t pre-place it on its own shard.',
          'The mapping is tiny and effectively immutable, which makes it ideal to cache.',
          'A cache with LRU eviction keeps hot codes in memory and spares the shard.',
          'Cache redirects (and replicate very hot keys if one cache node saturates).',
        ],
        followups: [
          { q: 'The cache cluster restarts and is empty. What happens?', options: ['Latency rises while misses fill it from the database; correctness is unaffected', 'All links break permanently', 'Redirects return 404 until a manual reload', 'Counter values are lost'], why: 'The database is the source of truth; a cold cache only hurts speed.' },
        ],
      };
    },
  ],
});
