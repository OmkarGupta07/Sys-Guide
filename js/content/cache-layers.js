SG.add({
  id: 'cache-layers',
  ref: 'E1 E8 E9',
  section: 'Caching',
  title: 'Where to cache: browser, CDN, app, database',
  short: 'Cache layers',
  blurb: 'The closer to the user, the faster and cheaper. Each layer caches different things.',
  intro: 'A request can be answered at several layers: the user’s own browser, an edge server nearby, your application’s cache, or the database’s memory. Good designs cache at the layer closest to the user that’s still correct.',
  options: {
    'Browser cache': {
      eli5: 'Keeping a copy of the school timetable in your bag instead of checking the notice board every morning.',
      industry: [
        'JS/CSS bundles with hashed names cached for a year (Cache-Control: max-age, immutable).',
        'ETag / If-None-Match lets the browser revalidate and get a tiny 304 Not Modified.',
        'Service workers cache whole apps offline (like this app).',
      ],
      def: 'The client stores responses locally, controlled by HTTP headers: Cache-Control (max-age, no-store, private), ETag/Last-Modified for revalidation. The fastest cache: zero network.',
      scenarios: [
        'The same user re-downloads unchanged static files',
        'Revalidating content cheaply (304 responses)',
        'Offline-capable apps',
      ],
      scale: 'Free capacity on every device. You can’t purge it remotely, so version file names instead.',
    },
    'CDN': {
      eli5: 'Instead of every kid walking to the one big library in Delhi, put copies of the popular books in every neighbourhood.',
      industry: [
        'Netflix, Hotstar and YouTube serve video from edge servers.',
        'Cloudflare, Akamai and CloudFront serve images and scripts worldwide.',
        'Micro-caching API responses for 1–5 seconds during huge events.',
      ],
      def: 'A network of edge servers caching content near users. Pull CDNs fetch from your origin on first request; push CDNs are uploaded to in advance. Cuts latency and origin load; shared across users.',
      scenarios: [
        'Static assets and media for users far from your servers',
        'Same content requested by many users (live scores, product images)',
        'Absorbing traffic spikes and some DDoS',
      ],
      scale: 'Handles global traffic with high hit rates. Never cache personalised responses publicly (Cache-Control: private).',
    },
    'Application cache': {
      eli5: 'A chef keeps the most-ordered sauce ready in a bowl instead of cooking it fresh for every dish.',
      industry: [
        'Redis/Memcached in front of the database for profiles, product details, sessions.',
        'Spring’s @Cacheable with Redis or Caffeine (in-process).',
        'Caching expensive computed results like recommendations.',
      ],
      def: 'A cache your application controls: in-process (Caffeine) or distributed (Redis). Stores computed or fetched data, including per-user data, with TTLs and invalidation you define.',
      scenarios: [
        'Expensive queries or computations repeated often',
        'Per-user or personalised data that can’t go on a CDN',
        'Reducing database read load',
      ],
      scale: 'In-process is fastest but per-server (can disagree); Redis is shared across servers and scales with clustering.',
    },
    'Database cache': {
      eli5: 'The librarian keeps the most-borrowed books on the front desk instead of fetching them from the basement every time.',
      industry: [
        'PostgreSQL shared_buffers and the OS page cache keep hot pages in RAM.',
        'MySQL InnoDB buffer pool.',
        'Sizing database RAM so the working set (hot data + indexes) fits.',
      ],
      def: 'The database’s own memory cache for data and index pages. Automatic and always consistent; effective when the working set fits in RAM. No application changes needed.',
      scenarios: [
        'Queries are slow because hot indexes don’t fit in memory and hit disk',
        'You want faster reads with zero code changes or staleness',
      ],
      scale: 'Bounded by the database machine’s RAM. When the working set outgrows it, add memory, then an application cache or replicas.',
    },
  },
  scenarios: [
    (pick) => {
      const s = pick(['2 MB', '3 MB', '5 MB']);
      return {
        q: `Every time a user opens your dashboard, their browser re-downloads the same ${s} JavaScript bundle, even though it changes only once a week.`,
        answer: 'Browser cache',
        hint: 'The same user, the same file, every time.',
        steps: ['Same user downloads unchanged files repeatedly.', 'Let the browser keep them: long max-age.', 'Put a content hash in the file name so new releases get a new URL.', 'Browser cache.'],
        followups: [
          { q: 'Why hash file names (app.3f9a.js) instead of short cache times?', options: ['Long caching stays safe: a new release has a new URL, so nobody gets stale code', 'Hashes compress better', 'Browsers require it', 'It hides the code'], why: 'You can’t purge users’ browsers; versioned URLs make purging unnecessary.' },
        ],
      };
    },
    (pick) => {
      const w = pick(['Europe and the US', 'Southeast Asia and the Middle East', 'all over India']);
      return {
        q: `Product images load slowly for shoppers in ${w}. All images are served from one origin server. The images are identical for everyone.`,
        answer: 'CDN',
        hint: 'Identical content, distant users.',
        steps: ['Same images for every user.', 'Distance from the origin adds latency.', 'Edge servers near users cache and serve them.', 'CDN.'],
        followups: [
          { q: 'Push or pull CDN for a catalogue of 10M images where most are rarely viewed?', options: ['Pull: edges fetch on first request, so only popular images get cached', 'Push all 10M everywhere', 'Neither', 'Push only the rare ones'], why: 'Pull CDNs naturally cache what’s actually requested.' },
        ],
      };
    },
    (pick) => {
      const ms = pick([800, 1500, 2000]);
      return {
        q: `A “Recommended for you” section takes ${ms} ms to compute for each user. Users refresh the home page often, and the result can be 10 minutes old.`,
        answer: 'Application cache',
        hint: 'It’s personalised, so it can’t be shared at the edge.',
        steps: ['Expensive computation.', 'Different per user: a public CDN can’t cache it.', 'Store per-user results in Redis with a 10-minute TTL.', 'Application cache.'],
        followups: [
          { q: 'In-process cache (Caffeine) vs Redis across 10 servers: what’s the catch with in-process?', options: ['Each server has its own copy: lower hit rate and servers can disagree after updates', 'It’s slower than Redis', 'It can’t store objects', 'No catch'], why: 'Shared caches stay consistent across servers; local caches trade that for speed.' },
        ],
      };
    },
    (pick) => {
      const ram = pick([4, 8]);
      const idx = pick([20, 30]);
      return {
        q: `The database has ${ram} GB RAM, but the frequently used tables and indexes total ${idx} GB, so hot queries keep reading from disk. The team doesn’t want to change application code.`,
        answer: 'Database cache',
        hint: 'The hot data doesn’t fit in the database’s memory.',
        steps: [`Working set (${idx} GB) > RAM (${ram} GB).`, 'Pages get evicted and reread from disk.', 'More RAM / a bigger buffer pool keeps them in memory.', 'Database cache, no code changes.'],
        followups: [
          { q: 'Why is the database’s own cache never stale?', options: ['It caches the database’s own pages, updated on every write', 'It has a short TTL', 'It is cleared every second', 'It isn’t; it’s often stale'], why: 'Only caches outside the database need invalidation strategies.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['5M', '20M']);
      return {
        q: `During a cricket final, ${n} users fetch the same live scoreboard JSON every few seconds. It changes once per ball, and 2 seconds of staleness is fine.`,
        answer: 'CDN',
        hint: 'Identical response for millions, short staleness allowed.',
        steps: ['Everyone gets the same response.', 'Short staleness is acceptable.', 'Micro-cache at the edge for 1–2 seconds.', 'CDN: the origin sees a tiny fraction of requests.'],
        followups: [
          { q: 'A logged-in user’s wallet balance API: may the CDN cache it?', options: ['No: mark it Cache-Control: private/no-store so shared caches never store it', 'Yes, for 1 second', 'Yes, with a long TTL', 'Only on weekends'], why: 'Caching personal data at a shared layer can leak it to other users.' },
        ],
      };
    },
    () => ({
      q: 'Your API returns the user’s settings with an ETag. The client sends If-None-Match on the next request, and if nothing changed the server replies 304 with no body.',
      answer: 'Browser cache',
      hint: 'Who keeps the copy here?',
      steps: ['The client keeps the last copy.', 'It asks “has it changed?” with the ETag.', '304 = reuse your copy: tiny response.', 'Browser (HTTP) caching via revalidation.'],
      followups: [
        { q: 'What does Cache-Control: no-cache mean?', options: ['Store it, but revalidate with the server before every reuse', 'Never store it', 'Cache forever', 'Only CDNs may cache it'], why: 'no-cache ≠ no-store. A classic trick question.' },
      ],
    }),
  ],
});
