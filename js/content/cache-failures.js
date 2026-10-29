SG.add({
  id: 'cache-failures',
  ref: 'E5 E6 E7',
  section: 'Caching',
  title: 'When caches fail: stampede, penetration, avalanche',
  short: 'Cache failure modes',
  blurb: 'Four ways a cache turns into an outage, and the standard fix for each.',
  intro: 'A cache that usually absorbs 95% of reads becomes dangerous when it suddenly doesn’t. Interviewers love these failure modes because each has a precise name and a precise fix.',
  options: {
    'Cache stampede': {
      eli5: 'The one shop selling concert tickets opens its doors, and 5,000 people rush the single counter at the same moment.',
      industry: [
        'A celebrity profile or flash-sale product expires from Redis and thousands of requests rebuild it at once.',
        'Facebook’s memcache paper describes “leases” to stop this thundering herd.',
        'Spring’s @Cacheable(sync = true) lets only one thread compute a missing value.',
      ],
      def: 'Also called thundering herd or dog-piling: when one hot key expires or is evicted, many concurrent requests miss together and all hit the database to rebuild the same value.',
      scenarios: [
        'A single very hot key expires under heavy traffic',
        'Expensive recomputation (seconds) for a popular item',
        'Database CPU spikes exactly when a key’s TTL ends',
      ],
      scale: 'Fixes: a lock or request coalescing so one request rebuilds while others wait or get the stale value; refresh hot keys before expiry; serve stale-while-revalidate.',
    },
    'Cache penetration': {
      eli5: 'Pranksters keep asking a shopkeeper for an item that doesn’t exist. Each time, the shopkeeper walks to the warehouse to check, and comes back empty-handed.',
      industry: [
        'Bots requesting random product IDs that don’t exist, bypassing the cache every time.',
        'Attackers scanning /users/{random-id} to overload the database.',
        'Bloom filters in front of Cassandra and HBase avoid disk lookups for missing keys.',
      ],
      def: 'Requests for keys that don’t exist in the cache or the database. Since there’s nothing to cache, every request reaches the database.',
      scenarios: [
        'Lookups for random or invalid IDs',
        'Malicious traffic hammering non-existent keys',
        'Hit rate drops while the database is flooded with empty results',
      ],
      scale: 'Fixes: cache the “not found” result with a short TTL (negative caching); a Bloom filter of valid IDs; validate IDs at the edge; rate-limit abusers.',
    },
    'Cache avalanche': {
      eli5: 'Every streetlight in the city was installed on the same day with the same bulb life, so they all go dark the same night.',
      industry: [
        'A cache warmed by one batch job at midnight, with a fixed 1-hour TTL, expires all at 1 AM.',
        'A Redis node restarts and comes back empty, sending all its traffic to the database.',
        'Teams add random jitter to TTLs and keep cache clusters replicated.',
      ],
      def: 'A large fraction of keys disappear at once, through synchronised expiry or a cache node failing, so the database suddenly receives most of the read traffic.',
      scenarios: [
        'Many keys set at the same time with the same TTL',
        'A cache node or cluster restarts empty',
        'Periodic database spikes at regular intervals',
      ],
      scale: 'Fixes: TTL jitter (e.g. 60 min ± 10); replicated, persistent cache clusters; warm the cache gradually; rate-limit or circuit-break database calls.',
    },
    'Hot key': {
      eli5: 'One counter in a supermarket sells the only discounted item. That single counter has a mile-long queue while the others are empty.',
      industry: [
        'A viral tweet or an IPL score key gets millions of reads per second on one Redis shard.',
        'Twitter and Weibo replicate celebrity data to many cache nodes.',
        'Local in-process caches absorb the hottest keys before they reach Redis.',
      ],
      def: 'One key receives so much traffic that the single cache shard holding it becomes the bottleneck, even though the cluster overall has spare capacity.',
      scenarios: [
        'One celebrity, product or live event dominates traffic',
        'One Redis node at 100% CPU while others are idle',
        'Network bandwidth of one shard saturates',
      ],
      scale: 'Fixes: a short-lived local (in-process) cache for hot keys; replicate the key as key#1..key#N across shards and read a random copy; read replicas for the cache.',
    },
  },
  scenarios: [
    (pick) => {
      const what = pick(['a celebrity’s profile', 'the flash-sale product page', 'today’s top news story']);
      const s = pick([2, 3, 5]);
      return {
        q: `The cache entry for ${what} expires every 10 minutes. Rebuilding it takes ${s} seconds. Each time it expires, thousands of requests miss at once and database CPU hits 100%.`,
        answer: 'Cache stampede',
        hint: 'One key, many simultaneous misses.',
        steps: ['A single hot key expires.', `Thousands of requests miss during the ${s}-second rebuild.`, 'They all query the database for the same value.', 'Cache stampede (thundering herd).'],
        followups: [
          { q: 'Simplest robust fix?', options: ['Let one request take a lock and rebuild while others wait briefly or get the stale value', 'Shorter TTL', 'Bigger database', 'Remove the cache'], why: 'Request coalescing turns thousands of identical rebuilds into one.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['20K', '50K', '100K']);
      return {
        q: `Bots request /products/{id} with random IDs that don’t exist, ${n} times a minute. The cache never has them, so every request hits the database, which returns nothing.`,
        answer: 'Cache penetration',
        hint: 'The keys don’t exist anywhere.',
        steps: ['Keys missing from both cache and database.', 'Nothing gets cached, so every request reaches the database.', 'Cache penetration.'],
        followups: [
          { q: 'Which data structure answers “definitely not a valid ID” cheaply in memory?', options: ['A Bloom filter of all valid IDs', 'A sorted array of IDs on disk', 'A Redis list', 'A B-tree index'], why: 'Bloom filters have no false negatives, so a “not present” answer can skip the database safely.' },
          { q: 'Without a Bloom filter, quickest mitigation?', options: ['Cache the “not found” result with a short TTL (negative caching)', 'Return 500', 'Increase database RAM', 'Turn off the cache'], why: 'Negative caching makes repeated misses cheap.' },
        ],
      };
    },
    (pick) => {
      const t = pick(['1:00 AM', '2:00 AM', '6:00 AM']);
      return {
        q: `A nightly job warms 2 million cache keys at once, all with a 1-hour TTL. Every night at ${t} the database is flooded for a few minutes, and nothing else is unusual.`,
        answer: 'Cache avalanche',
        hint: 'Many keys, same expiry time.',
        steps: ['All keys share the same TTL from the same moment.', 'They expire together.', 'Most reads fall through to the database at once.', 'Cache avalanche.'],
        followups: [
          { q: 'One-line fix?', options: ['Add random jitter to TTLs so expiries spread out', 'Make the TTL exactly 2 hours', 'Run the job twice', 'Use FIFO eviction'], why: 'Jitter turns one cliff into a gentle slope.' },
        ],
      };
    },
    () => ({
      q: 'One Redis node restarted after a crash and came back empty. For the next 15 minutes the database was overloaded and the site slowed down for everyone.',
      answer: 'Cache avalanche',
      hint: 'A big chunk of cached data vanished at once.',
      steps: ['A whole node’s keys disappeared together.', 'All its traffic fell through to the database.', 'Cache avalanche (from node failure).'],
      followups: [
        { q: 'How do you prevent this next time?', options: ['Replicas for each cache shard plus persistence (AOF/RDB) and circuit breakers on database calls', 'Restart Redis faster', 'Disable eviction', 'Use one bigger Redis node'], why: 'Treat the cache as critical infrastructure once the database can’t survive without it.' },
      ],
    }),
    (pick) => {
      const what = pick(['a viral cricket score', 'a celebrity’s new post', 'a limited-edition sneaker drop']);
      return {
        q: `During ${what}, one Redis shard runs at 100% CPU serving a single key at 400K reads/s. The other 9 shards are nearly idle. The key never expires.`,
        answer: 'Hot key',
        hint: 'It never expires, so it isn’t a stampede. Look at where the load lands.',
        steps: ['One key, enormous read rate.', 'Hashing pins it to one shard.', 'That shard saturates while others idle.', 'Hot key.'],
        followups: [
          { q: 'Best fix?', options: ['A short local in-process cache for that key, and/or replicate it as key#1..N across shards', 'Add more shards', 'Increase the TTL', 'Delete the key'], why: 'Adding shards doesn’t help: the same key still hashes to one place.' },
        ],
      };
    },
  ],
});
