SG.add({
  id: 'eviction',
  ref: 'E3 E4',
  section: 'Caching',
  title: 'Cache eviction and Redis',
  short: 'Eviction policies',
  blurb: 'When memory is full, who gets thrown out: the oldest, the least recent, the least popular, or the expired?',
  intro: 'Caches are small by design. The eviction policy decides what to forget when space runs out, and TTL decides what to forget when it’s too old. Redis lets you pick both, plus data structures that make many designs trivial.',
  options: {
    'LRU': {
      eli5: 'Your phone’s recent-apps list. The app you haven’t opened for the longest time is the first to be closed when memory runs low.',
      industry: [
        'Redis maxmemory-policy allkeys-lru (approximated LRU).',
        'Browser and OS page caches.',
        'Java’s LinkedHashMap with accessOrder=true and removeEldestEntry().',
      ],
      def: 'Least Recently Used: evict the item not accessed for the longest time. Assumes recent use predicts future use. O(1) with a hash map plus a doubly linked list.',
      scenarios: [
        'Recently accessed data is likely to be accessed again soon',
        'General-purpose cache with no better signal',
        'User-specific recent items (recently viewed, sessions)',
      ],
      scale: 'The default choice. Weakness: a one-time scan of many items can flush genuinely popular ones.',
    },
    'LFU': {
      eli5: 'A shop keeps its best-selling items at the front. Something bought once by a tourist doesn’t replace the bestsellers.',
      industry: [
        'Redis allkeys-lfu for workloads with stable popular keys.',
        'CDNs protecting popular content from one-off requests.',
        'Caffeine (Java) uses W-TinyLFU, combining frequency and recency.',
      ],
      def: 'Least Frequently Used: evict the item with the fewest accesses. Keeps consistently popular items; often uses decaying counts so old popularity fades.',
      scenarios: [
        'A stable set of popular items (top songs, trending products)',
        'Occasional bulk scans must not flush the hot set',
      ],
      scale: 'Needs counters per key. Without decay, yesterday’s hit can squat in the cache forever.',
    },
    'FIFO': {
      eli5: 'A queue at the ticket counter: whoever came in first leaves first, no matter how important they are.',
      industry: [
        'Simple ring buffers of recent log lines or sensor readings.',
        'Embedded systems where simplicity and predictability matter.',
        'Rarely the best choice for general caches.',
      ],
      def: 'First In, First Out: evict the oldest inserted item, ignoring how often or recently it’s used. Simplest to implement.',
      scenarios: [
        'Data whose value depends only on age (latest N readings)',
        'Extremely simple or constrained environments',
      ],
      scale: 'Cheap, but usually a worse hit rate than LRU for real user traffic.',
    },
    'TTL expiry': {
      eli5: 'Milk with an expiry date. After that date you throw it out, even if you still have space in the fridge.',
      industry: [
        'OTP codes expire after 5 minutes (Redis SET key value EX 300).',
        'Session tokens with idle timeouts.',
        'Exchange rates or prices cached for 60 seconds.',
      ],
      def: 'Each entry has a time-to-live and is removed (or treated as missing) once it expires, regardless of memory pressure. Bounds staleness rather than size. Usually combined with an eviction policy.',
      scenarios: [
        'Data must disappear after a fixed time (OTPs, sessions)',
        'Data goes stale on a known schedule (prices, rates)',
        'Bounding how stale a cache can get',
      ],
      scale: 'Many keys with the same TTL can expire together and cause a load spike; add random jitter.',
    },
  },
  scenarios: [
    (pick) => {
      const w = pick(['recently viewed products', 'recently opened chats', 'recently played songs']);
      return {
        q: `A cache holds each user’s ${w}. Memory is fixed. What a user touched recently is the best predictor of what they’ll touch next.`,
        answer: 'LRU',
        hint: 'Recency is the signal.',
        steps: ['Recent use predicts next use.', 'Evict what hasn’t been touched for the longest.', 'LRU.'],
        followups: [
          { q: 'How do you implement LRU get/put in O(1)?', options: ['HashMap for lookup + doubly linked list for recency order (or LinkedHashMap with accessOrder)', 'Sort all keys by time on each access', 'An ArrayList scanned from the start', 'A TreeMap only'], why: 'LRU cache is one of the most-asked LLD coding questions.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['50K', '100K']);
      return {
        q: `A music app caches the top songs, which stay popular for weeks. Every night an analytics job reads ${n} rarely played songs once each, and the next morning the popular songs are all cache misses.`,
        answer: 'LFU',
        hint: 'One-time reads are pushing out the long-term favourites.',
        steps: ['The nightly scan touches many items once.', 'Under LRU they look “recent” and evict the hits.', 'Frequency protects consistently popular items.', 'LFU.'],
        followups: [
          { q: 'Another way to protect the cache from the analytics job?', options: ['Have the job bypass the cache (write-around reads) or use a separate cache', 'Make the cache bigger forever', 'Run the job twice', 'Disable the cache at night'], why: 'Don’t let bulk jobs pollute the user-facing cache.' },
        ],
      };
    },
    (pick) => {
      const m = pick([2, 5, 10]);
      return {
        q: `OTP codes must stop working exactly ${m} minutes after they’re generated, even if the cache has plenty of free memory.`,
        answer: 'TTL expiry',
        hint: 'Memory isn’t the reason to remove them.',
        steps: ['Removal is driven by time, not space.', `Set each key with a ${m}-minute TTL.`, 'Redis: SET otp:phone code EX ' + m * 60 + '.', 'TTL expiry.'],
        followups: [
          { q: 'You cached 1M product prices, all with a 60s TTL set at the same moment. What happens?', options: ['They all expire together and hit the database at once; add random jitter to TTLs', 'Nothing', 'Redis crashes', 'Prices become negative'], why: 'Synchronized expiry causes a cache avalanche (tomorrow’s topic).' },
        ],
      };
    },
    (pick) => {
      const n = pick([100, 500, 1000]);
      return {
        q: `A device keeps the last ${n} temperature readings in memory for a live chart. Older readings are simply less useful, and the code must be as simple as possible.`,
        answer: 'FIFO',
        hint: 'Value depends only on age.',
        steps: ['Only the latest N matter.', 'Access patterns don’t change value.', 'A ring buffer drops the oldest.', 'FIFO.'],
        followups: [
          { q: 'Why is FIFO usually worse than LRU for user-facing caches?', options: ['It evicts popular old items even if they’re used constantly', 'It’s slower', 'It uses more memory', 'It can’t evict'], why: 'FIFO ignores usage, so hit rates suffer for real traffic.' },
        ],
      };
    },
    (pick) => {
      const m = pick([15, 30]);
      return {
        q: `Login sessions must expire after ${m} minutes of inactivity. Each new request should extend the session.`,
        answer: 'TTL expiry',
        hint: 'Time-based expiry that resets on use.',
        steps: ['Sessions must vanish after inactivity.', `Set a ${m}-minute TTL; refresh it (EXPIRE) on each request.`, 'Sliding TTL expiry.'],
        followups: [
          { q: 'Which Redis structure suits a leaderboard (top 10 scores, rank of a user)?', options: ['Sorted set (ZADD, ZREVRANGE, ZRANK)', 'List', 'String', 'Set'], why: 'Sorted sets give O(log N) updates and rank queries: perfect for leaderboards.' },
        ],
      };
    },
  ],
});
