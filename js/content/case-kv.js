SG.add({
  id: 'case-kv',
  ref: 'S13 S14',
  section: 'HLD case studies',
  title: 'Design a distributed cache and key-value store',
  short: 'Cache + KV store',
  blurb: 'Spread keys across nodes, replicate with quorums, evict wisely, tame hot keys, and store on LSM trees.',
  intro: 'A distributed cache (Redis/Memcached-style) and a key-value store (Dynamo/DynamoDB/Cassandra-style) share one API, get(key) and put(key, value), and most of their design. Partition keys across nodes with consistent hashing (or fixed hash slots) so adding nodes moves little data. Replicate each key to N nodes and pick read/write quorums to tune consistency against latency and availability. A cache also needs an eviction policy and TTLs because memory is finite; a store needs durable, write-optimised storage, usually an LSM tree. Hot keys break any even partitioning, so handle them explicitly. Start with the NFRs: latency (sub-ms for a cache, single-digit ms for a store), throughput, durability, and which side of CAP each operation needs.',
  options: {
    'Consistent hashing with virtual nodes': {
      eli5: 'Lockers arranged around a circular hall. Your bag goes to the first locker clockwise from your ticket number. If one locker is removed, only its bags move to the next one; everyone else stays put.',
      industry: [
        'DynamoDB and Cassandra hashing partition keys onto a ring of nodes and virtual nodes.',
        'Redis Cluster’s 16,384 hash slots (CRC16 of the key) assigned to primaries, with clients routing directly.',
        'Memcached clients using ketama consistent hashing so a node failure only remaps its share.',
      ],
      def: 'Hash each key onto a ring; each node owns the range up to its position, and the key goes to the next node clockwise. Adding or removing a node moves only about 1/N of keys, unlike hash mod N which remaps almost everything. Each physical node takes many virtual positions so load evens out and a failed node’s share spreads over many peers. Clients (or a routing layer) keep the ring map and send requests straight to the owner.',
      scenarios: [
        'The cluster grows from 10 to 40 nodes without a mass reshuffle',
        'Nodes fail and are replaced regularly',
        'Load must stay even across heterogeneous machines',
      ],
      scale: 'Going from N to N+1 nodes moves ~1/(N+1) of keys. 100–256 virtual nodes per server keep imbalance to a few percent.',
    },
    'Replication with tunable quorums': {
      eli5: 'A rumour is told to 3 friends. If you insist 2 confirm before you say it’s “saved”, and you ask 2 of them before believing it, you will always reach at least one who heard the latest version.',
      industry: [
        'Cassandra consistency levels (ONE, QUORUM, ALL) chosen per request.',
        'DynamoDB: eventually consistent reads by default, strongly consistent reads (from the partition leader) on request.',
        'The Dynamo paper’s N, R, W settings with sloppy quorums and hinted handoff for always-writable carts.',
      ],
      def: 'Store each key on N replicas (e.g. 3, across availability zones). A write succeeds after W replicas acknowledge; a read queries R replicas and returns the newest version. If R + W > N, every read overlaps the latest write (strong reads); smaller R or W lowers latency and keeps working when replicas are down, at the cost of stale reads. Leaderless stores repair divergence with version vectors or timestamps, read repair and anti-entropy; leader-based ones (DynamoDB) replicate from a partition leader.',
      scenarios: [
        'Some reads must see the latest write, others can be stale',
        'The store must stay writable when a zone is down',
        'Latency budgets differ per operation',
      ],
      scale: 'N = 3, W = 2, R = 2 is the common strong setting; W = 1, R = 1 gives the lowest latency but eventual consistency. Cross-region quorums add tens to hundreds of ms.',
    },
    'Eviction policy with TTLs': {
      eli5: 'A small kitchen fridge: when it’s full, the thing you haven’t touched for longest goes out first, and the milk is thrown out on its expiry date even if there’s space.',
      industry: [
        'Redis maxmemory-policy allkeys-lru or allkeys-lfu for caches.',
        'Per-key TTLs (EXPIRE / SET … EX) bounding staleness for cached database rows.',
        'Memcached’s slab-based LRU for fixed-size cache items.',
      ],
      def: 'A cache has finite memory, so decide what to drop when full: LRU (least recently used) suits most workloads; LFU keeps steadily popular keys and resists one-off scans pushing them out. Add TTLs so data that is never evicted still expires and staleness is bounded. A cache is not the source of truth, so losing entries only costs latency; use jittered TTLs so many keys don’t expire in the same second.',
      scenarios: [
        'The working set is larger than cache memory',
        'Cached rows may be stale for at most a few minutes',
        'A nightly batch scan evicts the hot keys',
      ],
      scale: 'A Redis node holds tens of GB and serves ~100K+ ops/s; with a skewed workload, caching 10–20% of keys often gives 80–90%+ hit rates.',
    },
    'Hot-key mitigation': {
      eli5: 'If everyone in the colony wants water from one tap, add more taps with the same water. Or keep a bottle at home so you don’t walk to the tap every time.',
      industry: [
        'Appending a random suffix (key#0…key#9) to spread one hot key across shards, reading any copy.',
        'Short-lived in-process caches on app servers for the hottest keys (a few seconds TTL).',
        'Request coalescing so only one miss for a key goes to the database at a time.',
      ],
      def: 'Partitioning spreads keys evenly, not traffic: a viral key still lands on one node and can exceed what that node can serve. For read-hot keys, replicate the value under several suffixed keys on different shards, or add a tiny local cache in front. For write-hot counters, split into sub-counters and sum on read. Detect hot keys with per-key metrics or sampling, and coalesce concurrent misses so a hot key expiring doesn’t flood the database.',
      scenarios: [
        'One key gets 500K reads/s while others get a few',
        'A popular key expires and thousands of misses hit the DB',
        'A global counter is incremented by everyone',
      ],
      scale: 'If one shard handles ~100K ops/s, a 500K ops/s key needs ≥5 copies or a local cache absorbing most reads.',
    },
    'LSM-tree storage engine': {
      eli5: 'A busy clerk writes new entries quickly on loose sheets in time order, and at night files and merges them into sorted folders. To find something, check today’s sheets first, then the folders.',
      industry: [
        'Cassandra, ScyllaDB, RocksDB, LevelDB and DynamoDB-style stores using memtables and SSTables.',
        'Bloom filters per SSTable to skip files that can’t contain a key.',
        'Compaction strategies (size-tiered vs levelled) trading write amplification for read speed.',
      ],
      def: 'Writes go to a write-ahead log (for durability) and an in-memory sorted memtable; when full, the memtable is flushed as an immutable sorted file (SSTable). All disk writes are sequential, so write throughput is very high. Reads check the memtable, then SSTables from newest to oldest, using Bloom filters and indexes to skip files. Background compaction merges files and removes overwritten or deleted (tombstoned) keys. B-trees update in place and read faster for point lookups, but handle heavy writes worse.',
      scenarios: [
        'A write-heavy store taking hundreds of thousands of puts per second',
        'Data must survive a crash, unlike a pure cache',
        'Values are overwritten often and old versions must be cleaned up',
      ],
      scale: 'Sequential writes reach hundreds of MB/s per disk; compaction can rewrite data 10× or more (write amplification), which you budget disk I/O for.',
    },
  },
  scenarios: [
    (pick) => {
      const ops = pick(['1 million', '500,000', '2 million']);
      const use = pick(['a shopping cart', 'user session data', 'a product catalogue']);
      return {
        q: `Interviewer: “Design a key-value store for ${use}, ${ops} ops/s, p99 under 10 ms, data must survive node and zone failures.” You list NFRs and the interviewer asks: “Which part of your design lets you choose, per operation, between always available and always up to date?”`,
        answer: 'Replication with tunable quorums',
        hint: 'The knob is how many replicas must answer.',
        steps: [
          'Durability across zones means N replicas (e.g. 3) in different zones.',
          'W and R set how many must acknowledge a write and answer a read.',
          'R + W > N gives strong reads; lower values give lower latency and availability during failures.',
          'So consistency can be chosen per use case: carts stay writable, balances read strongly.',
        ],
        followups: [
          { q: 'With N = 3, which setting guarantees reads see the latest acknowledged write?', options: ['W = 2, R = 2', 'W = 1, R = 1', 'W = 1, R = 2', 'W = 0, R = 3'], why: 'R + W = 4 > 3, so read and write sets overlap.' },
          { q: 'Why do Dynamo-style carts favour availability?', options: ['Rejecting “add to cart” loses sales; merging two cart versions later is cheap', 'Carts don’t need durability', 'Strong consistency is impossible', 'Availability means faster disks'], why: 'The cost of a stale cart is low; the cost of a failed write is lost revenue.' },
        ],
      };
    },
    (pick) => {
      const from = pick(['8', '12', '20']);
      return {
        q: `Your cache cluster routes keys with hash(key) mod ${from}. You add one node for a sale; almost every key now maps to a different node, the hit rate collapses to near zero, and the database is flooded with misses.`,
        answer: 'Consistent hashing with virtual nodes',
        hint: 'Adding one node should move a small slice, not everything.',
        steps: [
          'mod N changes the owner of almost every key when N changes.',
          'Place nodes on a hash ring; each key belongs to the next node clockwise.',
          'A new node takes only ~1/N of keys from its neighbours.',
          'Virtual nodes spread that slice evenly across many existing nodes.',
        ],
        followups: [
          { q: 'How does Redis Cluster achieve the same goal?', options: ['16,384 fixed hash slots assigned to nodes; resharding moves whole slots', 'It uses mod N', 'It replicates every key everywhere', 'Clients pick nodes randomly'], why: 'Fixed slots decouple keys from node count, like a ring.' },
        ],
      };
    },
    (pick) => {
      const gb = pick(['64 GB', '128 GB', '32 GB']);
      return {
        q: `Your Redis cache has ${gb} per node and runs out of memory every afternoon; writes start failing with OOM errors. Some cached rows are days old and users see outdated prices. Every night a reporting job reads millions of rarely used keys once.`,
        answer: 'Eviction policy with TTLs',
        hint: 'Decide what leaves when full, and when data expires anyway.',
        steps: [
          'Set a maxmemory policy so the cache evicts instead of failing writes.',
          'LFU keeps steadily popular keys even after a one-off scan; LRU is the simple default.',
          'Give cached rows TTLs to bound staleness (with jitter).',
          'The database stays the source of truth.',
        ],
        followups: [
          { q: 'Why add random jitter to TTLs?', options: ['So many keys cached at the same time don’t expire together and stampede the DB', 'To save memory', 'Redis requires it', 'To make reads faster'], why: 'Synchronised expiry causes miss storms.' },
        ],
      };
    },
    (pick) => {
      const key = pick(['the IPL live-score key', 'a celebrity’s profile', 'the homepage banner config']);
      const rps = pick(['600,000', '400,000', '900,000']);
      return {
        q: `${key} receives ${rps} reads per second. All of them go to the one cache shard that owns it, which saturates at ~100K ops/s, while the other 30 shards are nearly idle.`,
        answer: 'Hot-key mitigation',
        hint: 'Even hashing spreads keys, not traffic.',
        steps: [
          'Adding shards doesn’t help: the key still has one owner.',
          'Replicate the value under suffixed keys (key#0…key#9) on different shards and read a random copy.',
          'Add a short-TTL local cache on app servers for the hottest few keys.',
          'Coalesce misses so expiry doesn’t flood the database.',
        ],
        followups: [
          { q: 'What is the trade-off of key suffixing?', options: ['Writes must update every copy, and copies may briefly disagree', 'Reads become slower', 'It needs a new database', 'None'], why: 'Fan-out on write buys spread-out reads.' },
        ],
      };
    },
    (pick) => {
      const wps = pick(['300,000', '200,000', '500,000']);
      return {
        q: `You are building the durable store (not the cache). It takes ${wps} puts per second, most of them overwriting existing keys, on a B-tree engine. Random in-place page writes saturate the disks and p99 write latency climbs past 100 ms.`,
        answer: 'LSM-tree storage engine',
        hint: 'Turn random writes into sequential ones.',
        steps: [
          'B-trees update pages in place, causing random I/O for every write.',
          'An LSM tree appends to a WAL and memtable, then flushes sorted SSTables sequentially.',
          'Reads check memtable, then SSTables, skipping files with Bloom filters.',
          'Compaction merges files and drops overwritten and deleted keys.',
        ],
        followups: [
          { q: 'What does an LSM tree trade for its write speed?', options: ['Reads may check several files, and compaction adds background write amplification', 'It loses durability', 'It can’t do point lookups', 'It needs no disk'], why: 'Bloom filters and compaction keep reads acceptable.' },
          { q: 'How is a delete handled?', options: ['A tombstone is written and the key is removed later during compaction', 'The SSTable is rewritten immediately', 'Deletes are not supported', 'The memtable forgets it'], why: 'SSTables are immutable, so deletes are markers until compaction.' },
        ],
      };
    },
    (pick) => {
      const az = pick(['one availability zone', 'a rack of 6 nodes']);
      return {
        q: `During a network partition that isolates ${az}, your store (N = 3, W = 3) rejects every write for affected keys, and the checkout team complains. They say a few seconds of stale reads are fine, but rejected writes are not.`,
        answer: 'Replication with tunable quorums',
        hint: 'W = N means every replica must be reachable.',
        steps: [
          'W = 3 makes every write depend on all three replicas.',
          'Lower W to 2 (or use a sloppy quorum with hinted handoff) so writes succeed with one replica down.',
          'Keep R + W > N where strong reads matter, or accept eventual reads where they don’t.',
          'Repair divergent replicas later with read repair and anti-entropy.',
        ],
        followups: [
          { q: 'Two replicas accepted different writes for the same cart during the partition. How do you resolve it?', options: ['Version vectors to detect the conflict, then merge (e.g. union of cart items)', 'Pick a random one', 'Delete the cart', 'It can’t happen with quorums'], why: 'Concurrent versions must be detected and merged, not silently overwritten.' },
        ],
      };
    },
  ],
});
