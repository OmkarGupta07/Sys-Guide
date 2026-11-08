SG.add({
  id: 'aws-data',
  ref: 'O3 O4 O5 O6',
  section: 'Infra and cloud',
  title: 'AWS data: S3, RDS, DynamoDB, ElastiCache',
  short: 'AWS data',
  blurb: 'Objects, relational, key-value and cache: choose by access pattern, consistency and cost.',
  intro: 'AWS has a managed store for each data shape. S3 holds files and blobs cheaply and durably; RDS and Aurora run relational databases with joins and transactions; DynamoDB gives single-digit-millisecond key-value access at any scale if you design keys around your queries; ElastiCache keeps hot data in memory. Start from the access pattern (by key, by query, by file, by hot read), then check consistency needs, scale and price.',
  options: {
    'S3': {
      eli5: 'A huge, safe godown with numbered lockers. You can store anything, pay by the shelf space, and move old boxes to a cheaper basement you rarely visit.',
      industry: [
        'User uploads, invoices, KYC documents and media, served through CloudFront.',
        'Data lakes and log archives queried with Athena.',
        'Lifecycle rules moving old objects to Infrequent Access or Glacier classes.',
      ],
      def: 'Amazon S3 is object storage: objects (up to 5 TB each) in buckets, addressed by key, designed for 11 nines of durability with strong read-after-write consistency. Storage classes trade price against access cost and speed: Standard, Intelligent-Tiering, Standard-IA, One Zone-IA, Glacier Instant/Flexible Retrieval and Deep Archive. Pre-signed URLs grant time-limited upload or download without making the bucket public.',
      scenarios: [
        'Storing files, images, backups and logs',
        'Letting mobile clients upload directly without passing bytes through your servers',
        'Automatically moving cold data to cheaper tiers',
      ],
      scale: 'Effectively unlimited storage; thousands of requests per second per prefix. Glacier Deep Archive costs a small fraction of Standard but retrieval takes hours.',
    },
    'RDS / Aurora': {
      eli5: 'A well-run accounts office with a ledger. Every entry is checked and balanced, a photocopy is kept in a second office in case of fire, and helpers can read copies to answer questions.',
      industry: [
        'Orders, payments and user accounts in Postgres or MySQL with ACID transactions.',
        'Multi-AZ deployments for automatic failover in production.',
        'Read replicas or Aurora replicas serving reports and read-heavy APIs.',
      ],
      def: 'Amazon RDS runs managed relational engines (Postgres, MySQL, MariaDB, Oracle, SQL Server) with backups, patching and point-in-time restore. Multi-AZ keeps a synchronous standby in another AZ for automatic failover (availability, not read scaling). Read replicas are asynchronous copies for scaling reads. Aurora is AWS’s cloud-native MySQL/Postgres-compatible engine with storage replicated six ways across three AZs and up to 15 low-lag replicas.',
      scenarios: [
        'Relational data with joins, constraints and transactions',
        'Production databases that must survive an AZ failure',
        'Read-heavy workloads that need replicas',
      ],
      scale: 'Scales up vertically and out for reads; write scaling beyond one primary needs sharding or a different store.',
    },
    'DynamoDB': {
      eli5: 'A giant post office sorting room. If you know the exact pin code and house number, your letter is found instantly, no matter how many letters there are. Asking “all letters mentioning cricket” is slow.',
      industry: [
        'Shopping carts, sessions, device state and user profiles accessed by key.',
        'High-write event tables with TTL for automatic expiry.',
        'Global tables for multi-Region active-active apps.',
      ],
      def: 'Amazon DynamoDB is a serverless key-value and document database. Items (up to 400 KB) live in partitions chosen by the partition key; a sort key enables range queries within a partition. Global secondary indexes add alternate query patterns (eventually consistent). Capacity is on-demand (pay per request, no planning) or provisioned with auto scaling (cheaper for steady, predictable traffic).',
      scenarios: [
        'Huge scale with simple, known access patterns by key',
        'Spiky or unpredictable traffic with no servers to manage',
        'Low-latency lookups at millions of requests per second',
      ],
      scale: 'Each partition handles about 3,000 reads and 1,000 writes per second; a skewed partition key creates hot partitions and throttling.',
    },
    'ElastiCache': {
      eli5: 'A notepad on the counter with the 20 most asked prices. The shopkeeper reads it instantly instead of walking to the back store every time.',
      industry: [
        'Caching product pages and user profiles in front of RDS (cache-aside).',
        'Sessions, rate-limit counters and leaderboards with Redis/Valkey data structures.',
        'Pub/sub and short-lived OTP storage with TTLs.',
      ],
      def: 'Amazon ElastiCache is managed in-memory caching with Valkey, Redis OSS or Memcached engines, as node-based clusters or a serverless option. Valkey/Redis offers rich data types, replication with Multi-AZ failover, persistence options and cluster-mode sharding. Memcached is a simpler, multi-threaded pure cache with no replication or persistence.',
      scenarios: [
        'Read-heavy data that is expensive to compute or query',
        'Sub-millisecond counters, sessions or leaderboards',
        'Protecting a database from traffic spikes',
      ],
      scale: 'Sub-millisecond latency; size the cache for the hot working set and set TTLs; plan for cold-cache stampedes after failover.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick(['20 MB', '50 MB', '200 MB']);
      return {
        q: `A KYC app lets users upload Aadhaar-masked documents and selfie videos of up to ${n} from the mobile app. Upload traffic is currently passing through the API servers and saturating their bandwidth.`,
        answer: 'S3',
        hint: 'Let clients send bytes straight to storage, securely.',
        steps: ['Files are blobs: object storage fits.', 'The API should only authorise, not carry bytes.', 'Issue a short-lived pre-signed PUT URL; the app uploads directly to S3.', 'S3.'],
        followups: [
          { q: 'How do you keep 7-year-old KYC files cheaply while still deleting them after the retention period?', options: ['S3 lifecycle rules: transition to Glacier classes, then expire', 'Copy them to EBS', 'Keep them in Standard forever', 'Move them to DynamoDB'], why: 'Lifecycle policies automate tiering and deletion.' },
          { q: 'Why not just make the bucket public so the app can upload?', options: ['Anyone could read or write; pre-signed URLs grant one object, one action, for a short time', 'Public buckets are slower', 'S3 doesn’t allow public buckets', 'It costs more'], why: 'Keep Block Public Access on and use scoped, expiring URLs.' },
        ],
      };
    },
    (pick) => {
      const p = pick(['a payments ledger', 'loan applications', 'insurance policies']);
      return {
        q: `A fintech stores ${p} with foreign keys, multi-row transactions and month-end reports with joins. Production must fail over automatically if an AZ goes down.`,
        answer: 'RDS / Aurora',
        hint: 'Relational data, transactions, high availability.',
        steps: ['Joins, constraints and ACID transactions point to a relational database.', 'Managed RDS or Aurora removes backup and patching work.', 'Enable Multi-AZ for automatic failover.', 'RDS / Aurora.'],
        followups: [
          { q: 'Multi-AZ vs read replica?', options: ['Multi-AZ: synchronous standby for failover, not for reads. Read replica: async copy for scaling reads', 'Both are the same', 'Read replicas give automatic failover only', 'Multi-AZ doubles write throughput'], why: 'One is for availability, the other for read scale.' },
        ],
      };
    },
    (pick) => {
      const r = pick([10, 20, 30]);
      return {
        q: `A shopping app’s Postgres primary sits at 85% CPU, and ${r}x more traffic is reads (product and order-history views) than writes. Slightly stale order history (a second or two) is acceptable.`,
        answer: 'RDS / Aurora',
        hint: 'Scale reads without changing databases.',
        steps: ['Load is read-dominated.', 'Stale-by-seconds reads are acceptable.', 'Add read replicas (or Aurora replicas) and route reads there.', 'RDS / Aurora read replicas.'],
        followups: [
          { q: 'Right after placing an order, the user sees an empty order list. Why?', options: ['Replica lag: the read went to an async replica before the write arrived; read your own writes from the primary', 'The write failed', 'Aurora loses data', 'The cache is full'], why: 'Route read-after-write paths to the primary.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['50,000', '200,000', '1 million']);
      return {
        q: `A gaming company stores player state looked up only by playerId, with ${n} writes per second at peak tournaments and near zero at 4 a.m. They want no capacity planning or servers.`,
        answer: 'DynamoDB',
        hint: 'Key lookups, massive and spiky scale, serverless.',
        steps: ['Access is by a single key.', 'Traffic is huge and very spiky.', 'DynamoDB on-demand scales automatically and bills per request.', 'DynamoDB.'],
        followups: [
          { q: 'When is provisioned capacity better than on-demand?', options: ['Steady, predictable traffic where auto-scaled provisioned capacity costs less', 'Unknown new workloads', 'Very spiky traffic', 'Never'], why: 'On-demand trades a higher unit price for zero planning.' },
        ],
      };
    },
    (pick) => {
      const k = pick(['status = “PENDING”', 'today’s date', 'a single merchantId used by one huge seller']);
      return {
        q: `An orders table in DynamoDB uses ${k} as its partition key. Writes are throttled even though total table capacity is far from its limit, and the team also needs to query orders by customerId.`,
        answer: 'DynamoDB',
        hint: 'The store is fine; the key design is not.',
        steps: ['Few distinct key values concentrate traffic on one partition.', 'Choose a high-cardinality key such as orderId (or add a suffix to spread writes).', 'Add a GSI on customerId for the second query pattern.', 'DynamoDB with better key design.'],
        followups: [
          { q: 'GSI vs LSI?', options: ['GSI: different partition key, add anytime, eventually consistent. LSI: same partition key, different sort key, defined at table creation', 'Same thing', 'LSIs can be added anytime', 'GSIs are strongly consistent only'], why: 'Most new designs use GSIs.' },
          { q: 'Maximum item size in DynamoDB?', options: ['400 KB', '4 MB', '1 GB', 'Unlimited'], why: 'Store large blobs in S3 and keep a pointer.' },
        ],
      };
    },
    (pick) => {
      const n = pick([30, 50, 80]);
      return {
        q: `During a festive sale, the product-detail API hits RDS ${n} thousand times a minute for the same 2,000 popular products. The database is near its limit, and prices change only every few minutes.`,
        answer: 'ElastiCache',
        hint: 'Same hot reads over and over.',
        steps: ['A small hot set gets most reads.', 'Data can be a few minutes stale.', 'Cache-aside in Valkey/Redis with a TTL offloads the database.', 'ElastiCache.'],
        followups: [
          { q: 'Valkey/Redis vs Memcached on ElastiCache?', options: ['Valkey/Redis: data structures, replication, failover, persistence. Memcached: simple multi-threaded cache, no replication', 'Memcached supports sorted sets', 'Redis has no TTLs', 'They are identical'], why: 'Pick Memcached only for plain, disposable caching.' },
          { q: 'Thousands of requests miss the cache at once when a hot key expires. Fix?', options: ['Request coalescing or locking per key, plus jittered TTLs', 'Remove TTLs entirely', 'Scale RDS down', 'Disable the cache'], why: 'Avoid the thundering-herd stampede.' },
        ],
      };
    },
  ],
});
