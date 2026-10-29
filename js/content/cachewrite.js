SG.add({
  id: 'cachewrite',
  ref: 'E2',
  section: 'Caching',
  title: 'Cache-aside, write-through, write-back or write-around',
  short: 'Caching strategies',
  blurb: 'Who writes to the cache, when, and what you risk: stale reads, slow writes, or lost data.',
  intro: 'Reading from a cache is easy. The hard part is writes: keep the cache and the database in sync without making writes slow or risking data loss.',
  options: {
    'Cache-aside': {
      eli5: 'You check your notebook first. If the answer isn’t there, you look it up in the library and write it in your notebook for next time.',
      industry: [
        'The default pattern in most Spring Boot + Redis apps (@Cacheable works this way).',
        'Product catalogues and user profiles on e-commerce sites.',
        'Facebook’s memcache layer is the classic large-scale cache-aside example.',
      ],
      def: 'The application reads the cache; on a miss it reads the database and fills the cache. On writes, it updates the database and deletes the cache entry. The cache only holds data that was actually read.',
      scenarios: [
        'Read-heavy data, with brief staleness acceptable',
        'You want the cache to be optional: if Redis dies, the app still works',
        'Only a small hot subset of data is read often',
      ],
      scale: 'Works from one Redis node to large clusters. Watch for a stampede when a hot key expires: use request coalescing or jittered TTLs.',
    },
    'Write-through': {
      eli5: 'Every time you update the library book, you update your notebook in the same moment. Your notebook is never out of date, but each update takes a bit longer.',
      industry: [
        'User settings and session data where the next read must show the new value.',
        'Inventory counts read immediately after an update.',
        'AWS DAX for DynamoDB is a write-through cache.',
      ],
      def: 'Every write goes to the cache and the database synchronously as one operation. Reads always find fresh data; writes pay the latency of both.',
      scenarios: [
        'Read-after-write must be fresh',
        'Data is read soon and often after being written',
        'You can accept slightly slower writes',
      ],
      scale: 'Write latency = cache + database. Caches data that may never be read, so pair it with TTLs. Not for write-heavy firehoses.',
    },
    'Write-back': {
      eli5: 'You scribble updates in your notebook and copy them to the library once an hour. Super fast, but if you lose the notebook before copying, those updates are gone.',
      industry: [
        'YouTube-style view counters and likes: increment in Redis, flush to the database in batches.',
        'Game leaderboards and live scores.',
        'CPU caches and OS page caches work this way.',
      ],
      def: 'Writes go only to the cache and are acknowledged immediately; the cache flushes to the database asynchronously, often batched. Fastest writes, with a risk of losing unflushed data.',
      scenarios: [
        'Very write-heavy counters or metrics',
        'Losing a few seconds of data on a crash is acceptable',
        'Batching many small writes protects the database',
      ],
      scale: 'Absorbs huge write rates (tens of thousands per second per key range). Reduce the loss window with Redis persistence (AOF) and replication.',
    },
    'Write-around': {
      eli5: 'You put new books straight on the library shelf and don’t copy them into your notebook. You only copy a book if someone actually asks for it.',
      industry: [
        'Bulk imports and nightly batch loads.',
        'Audit logs and archives that are written constantly but rarely read.',
        'Media uploads where most files are never viewed again.',
      ],
      def: 'Writes go directly to the database, skipping the cache. Data enters the cache only when it’s read later (usually with cache-aside reads).',
      scenarios: [
        'Write once, read rarely or much later',
        'Bulk loads that would flush useful data out of the cache',
        'Logs, archives, historical records',
      ],
      scale: 'Keeps the cache full of genuinely hot data. The first read after a write is always a miss.',
    },
  },
  scenarios: [
    (pick) => {
      const ratio = pick(['100:1', '1000:1', '500:1']);
      const what = pick(['product catalogue', 'restaurant menu', 'blog article']);
      return {
        q: `A ${what} service has a read:write ratio of ${ratio}. Showing a slightly old price or description for up to a minute is fine. If Redis goes down, the site must keep working.`,
        answer: 'Cache-aside',
        hint: 'Who should own filling the cache? What if the cache is gone?',
        steps: [
          'Read-heavy, and staleness is tolerated.',
          'The cache must be optional, so the app talks to the database directly on a miss.',
          'Only items actually read get cached.',
          'Choose cache-aside.',
        ],
        followups: [
          { q: 'When the price changes, do you update the cache entry or delete it?', options: ['Delete it, so the next read reloads fresh data and two racing writers can’t leave a stale value', 'Update it in place, always', 'Leave it until the TTL', 'Flush the whole cache'], why: 'Delete-on-write avoids races where an older value overwrites a newer one in the cache.' },
          { q: 'A hot key expires and 5,000 requests hit the database at once. Name and fix?', options: ['Cache stampede: use a lock/request coalescing so one request refills, plus jittered TTLs', 'Cache penetration: add a Bloom filter', 'Cache avalanche: add more CPUs', 'Replication lag: add replicas'], why: 'Stampede = many misses for the same key. Let one request rebuild while others wait or serve stale.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['50K', '200K', '1M']);
      const what = pick(['video view counter', 'post like counter', 'game score']);
      return {
        q: `A ${what} receives ${n} increments per second at peak. If a crash loses the last few seconds of increments, nobody will notice.`,
        answer: 'Write-back',
        hint: 'Can the database take every single write? Is a small loss acceptable?',
        steps: [
          `${n} writes/s would crush a relational database.`,
          'A small loss window is explicitly acceptable.',
          'Increment in cache, flush batched totals periodically.',
          'Choose write-back.',
        ],
        followups: [
          { q: 'How do you shrink the data-loss window?', options: ['Enable Redis AOF persistence and replication, and flush to the database more often', 'Write to the database too on every increment', 'Use a bigger Redis instance', 'Disable the TTL'], why: 'Write-back trades durability for speed. Persistence and replication buy back some durability.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['notification preferences', 'account privacy settings', 'shipping address']);
      return {
        q: `A user saves their ${what}, and the very next screen reads it back. Reads are frequent, writes are occasional, and showing the old value would confuse users.`,
        answer: 'Write-through',
        hint: 'Read-after-write freshness is the requirement.',
        steps: [
          'The next read must show the new value.',
          'Writes are occasional, so slightly slower writes are fine.',
          'Writing cache and database together keeps them in sync.',
          'Choose write-through.',
        ],
        followups: [
          { q: 'The database write succeeds but the cache write fails. Now what?', options: ['Delete or expire the cache key and retry, so readers fall back to the database rather than see stale data', 'Ignore it', 'Roll back the database', 'Restart the app servers'], why: 'Two systems can’t be updated atomically. Pick the failure mode where readers see correct data.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['10M', '50M']);
      const what = pick(['historical transactions', 'archived orders', 'audit log entries']);
      return {
        q: `A nightly job imports ${n} ${what}. They’re rarely read, and when read it’s usually months later. The cache currently holds today’s hot products.`,
        answer: 'Write-around',
        hint: 'What happens to the hot data if all this goes through the cache?',
        steps: [
          'Write once, read rarely.',
          `Pushing ${n} rows through the cache would evict today’s hot data.`,
          'Write straight to the database; let reads fill the cache only if needed.',
          'Choose write-around.',
        ],
        followups: [
          { q: 'What’s the cost of write-around?', options: ['The first read after a write is always a cache miss', 'Data can be lost on crash', 'Writes become very slow', 'The cache becomes inconsistent forever'], why: 'You accept a cold first read in exchange for keeping the cache full of truly hot data.' },
        ],
      };
    },
    () => ({
      q: 'A chat app writes an audit record for every message (thousands per second). Investigators read them only during rare security reviews.',
      answer: 'Write-around',
      hint: 'How likely is a record to be read soon after it’s written?',
      steps: [
        'Write-heavy, read almost never.',
        'Caching these would waste memory and evict useful data.',
        'Write directly to the database or log store.',
        'Choose write-around.',
      ],
      followups: [
        { q: 'Would write-back be a reasonable alternative here?', options: ['No. Audit logs must not be lost, and write-back risks losing unflushed data', 'Yes, it’s always faster', 'Yes, audit data doesn’t matter', 'Only on weekends'], why: 'Durability requirements rule out write-back for anything legal or financial.' },
      ],
    }),
  ],
});
