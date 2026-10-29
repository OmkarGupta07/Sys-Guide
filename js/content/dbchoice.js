SG.add({
  id: 'dbchoice',
  ref: 'F1, F2, F18, R1',
  section: 'Data and storage',
  title: 'Relational, document, wide-column, key-value or search',
  short: 'Choosing a database',
  blurb: 'Pick a database by access pattern and guarantees, not by hype.',
  intro: 'Start from how the data is written and queried: transactions and joins, flexible documents, huge write volume by key and time, lookups by ID, or free-text search.',
  options: {
    'Relational (PostgreSQL)': {
      eli5: 'A strict accountant’s ledger. Every row has the same columns, every rupee is accounted for, and you can cross-check any page against any other.',
      industry: [
        'Banks, UPI apps and payment systems keep balances and ledgers in relational databases.',
        'Most startups (Zerodha, Shopify, Instagram early on) began on PostgreSQL or MySQL.',
        'Order, inventory and booking systems that need joins and transactions.',
      ],
      def: 'Tables with a fixed schema, related by keys, queried with SQL. ACID transactions, joins, constraints and strong consistency. Scales up easily; scales out with replicas and, with effort, sharding.',
      scenarios: [
        'Money, orders, bookings: anything needing transactions',
        'Data with many relationships and ad-hoc queries',
        'You don’t know the access patterns yet (the safe default)',
      ],
      scale: 'One good PostgreSQL server handles thousands of writes/s and terabytes. Beyond that: read replicas, partitioning, then sharding (Citus, Vitess) or a distributed SQL database.',
    },
    'Document (MongoDB)': {
      eli5: 'A folder of index cards. Each card can have different fields: a phone card lists RAM, a shirt card lists size. You grab the whole card at once.',
      industry: [
        'Product catalogues where every category has different attributes.',
        'Content management systems and user-generated content.',
        'Mobile backends storing JSON-shaped profiles and settings.',
      ],
      def: 'Stores JSON-like documents with flexible schemas. Each document is usually read and written as a whole. Supports indexes and rich queries; multi-document transactions exist but are not its sweet spot.',
      scenarios: [
        'Records of the same type with very different attributes',
        'Data read and written as one self-contained object',
        'Schema changes often during rapid development',
      ],
      scale: 'Scales out with built-in sharding by a shard key. Joins across collections are weak, so model data around how it’s read.',
    },
    'Wide-column (Cassandra)': {
      eli5: 'A giant set of diaries, one per device. You only ever write a new line at the end of a diary, or read a range of days from one diary. Nobody can stop you writing.',
      industry: [
        'Discord stored trillions of messages in Cassandra (later ScyllaDB).',
        'Netflix uses Cassandra for viewing history across regions.',
        'IoT and telemetry: sensor readings by device and time.',
      ],
      def: 'Rows grouped by a partition key and sorted by a clustering key (often time). Masterless, multi-region replication, tunable consistency. Extremely fast writes; queries must follow the key design.',
      scenarios: [
        'Huge write volume: messages, events, sensor data',
        'Queries are always “by key, within a time range”',
        'Must stay writable across regions even during failures',
      ],
      scale: 'Linear write scaling to hundreds of thousands or millions of writes/s by adding nodes. No joins, no ad-hoc queries; design one table per query.',
    },
    'Key-value (Redis/DynamoDB)': {
      eli5: 'A coat check. You hand over a token, you instantly get exactly your coat back. You can’t ask “show me all blue coats”.',
      industry: [
        'Sessions, carts and auth tokens in Redis.',
        'Amazon’s shopping cart was the origin story for Dynamo-style key-value stores.',
        'Feature flags, rate-limit counters and leaderboards.',
      ],
      def: 'Stores values by a unique key with get/put by key, often in memory (Redis) or as a managed, partitioned service (DynamoDB). Single-digit-millisecond or sub-millisecond lookups.',
      scenarios: [
        'Look up by ID only, very fast',
        'Sessions, carts, tokens, counters',
        'Caching computed results',
      ],
      scale: 'Redis: ~100K+ ops/s per node, limited by RAM. DynamoDB: practically unlimited with good partition keys; hot keys are the main risk.',
    },
    'Search engine (Elasticsearch)': {
      eli5: 'The index at the back of a book. Instead of reading every page to find “cricket”, you look it up and it lists every page instantly, even if you misspell it a little.',
      industry: [
        'Product search on e-commerce sites (typos, filters, relevance).',
        'Log search with the ELK stack.',
        'Wikipedia and GitHub use Elasticsearch-family engines for search.',
      ],
      def: 'Builds an inverted index from words to documents, for full-text search, relevance ranking, fuzzy matching, and filters/aggregations. Usually a secondary store synced from the main database.',
      scenarios: [
        'Users type free text, with typos, and expect ranked results',
        'Faceted filters: brand, price range, rating',
        'Searching logs and events',
      ],
      scale: 'Scales out via shards and replicas. Not a source of truth: keep the primary data elsewhere and sync with CDC or a queue.',
    },
  },
  scenarios: [
    (pick) => {
      const what = pick(['UPI-style wallet', 'movie ticket booking', 'stock brokerage order book']);
      return {
        q: `A ${what}: moving money or seats must update two records together, never half-done, and finance runs ad-hoc reports with joins every day.`,
        answer: 'Relational (PostgreSQL)',
        hint: '“Together, never half-done” is a definition you know.',
        steps: [
          'Two records updated atomically = ACID transaction.',
          'Ad-hoc reports with joins = SQL.',
          'Correctness beats raw write speed here.',
          'Choose relational.',
        ],
        followups: [
          { q: 'Two users try to book the last seat at the same moment. How do you prevent a double booking?', options: ['A transaction with a row lock (SELECT … FOR UPDATE) or a unique constraint on seat + show', 'Check availability in the app, then insert', 'Use a bigger server', 'Let both book and refund one later'], why: 'Check-then-act in app code races. Let the database enforce it with locks or constraints.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['200', '800', '2,000']);
      return {
        q: `A marketplace has ${n} product categories. Phones have RAM and camera specs, shirts have size and fabric, books have author and ISBN. Product pages load one product with all its attributes.`,
        answer: 'Document (MongoDB)',
        hint: 'Do all products share the same columns?',
        steps: [
          'Attributes vary wildly per category.',
          'A product page reads one self-contained object.',
          'A fixed schema would need hundreds of nullable columns or an EAV mess.',
          'Choose document.',
        ],
        followups: [
          { q: 'Users also need typo-tolerant search with price and brand filters. Is MongoDB enough?', options: ['Add Elasticsearch for search, synced from MongoDB; keep MongoDB as the source of truth', 'Yes, use regex queries', 'Move everything to Elasticsearch only', 'Use Redis'], why: 'Polyglot persistence: each store does what it’s best at. Search engines aren’t sources of truth.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['300K', '1M', '2M']);
      const what = pick(['chat messages', 'IoT sensor readings', 'ride location pings']);
      return {
        q: `The system ingests ${n} ${what} per second across 3 regions. Reads are always “the latest items for one chat/device/ride, in a time range”. It must stay writable even if a region goes down.`,
        answer: 'Wide-column (Cassandra)',
        hint: 'Write volume, multi-region writes, and a fixed query shape.',
        steps: [
          `${n} writes/s rules out a single primary.`,
          'Queries are always by key + time range.',
          'Multi-region and always writable = masterless replication.',
          'Choose wide-column.',
        ],
        followups: [
          { q: 'What partition key for chat messages?', options: ['(channel_id, time bucket) so one huge channel doesn’t become one giant partition', 'message_id only', 'The same key for all messages', 'The user’s country'], why: 'Partitions must stay bounded. Bucketing by time splits busy channels.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['login sessions', 'shopping carts', 'OTP codes']);
      return {
        q: `You store ${what}. Every read and write is “by ID”, it must take under a millisecond, and items expire on their own after a while.`,
        answer: 'Key-value (Redis/DynamoDB)',
        hint: 'What’s the only query you ever run?',
        steps: [
          'Access is only by key.',
          'Sub-millisecond latency suggests in-memory.',
          'Built-in TTL handles expiry.',
          'Choose key-value.',
        ],
        followups: [
          { q: 'Redis restarts. Are the sessions gone?', options: ['Unless persistence (RDB/AOF) or a replica is enabled, yes; decide whether re-login is acceptable', 'No, Redis never loses data', 'They move to MySQL automatically', 'They are stored in the browser'], why: 'In-memory stores trade durability for speed. Know the default and how to change it.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['electronics store', 'job portal', 'recipe app']);
      return {
        q: `Users of your ${what} type “wireles hedphones under 2000” and expect relevant, ranked results with brand and price filters, in under 200 ms.`,
        answer: 'Search engine (Elasticsearch)',
        hint: 'Typos, ranking, free text.',
        steps: [
          'Free text with typos needs fuzzy matching.',
          'Ranked by relevance, plus filters.',
          'SQL LIKE queries can’t do this fast or well.',
          'Choose a search engine, synced from the main database.',
        ],
        followups: [
          { q: 'How does Elasticsearch stay in sync with the main database?', options: ['Change data capture or a queue: each DB change emits an event that updates the index', 'Users write to both', 'Rebuild the index every second', 'Elasticsearch reads MySQL directly on every search'], why: 'Async sync via CDC/queue keeps the write path fast. Search may lag by seconds; that’s usually fine.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['3K', '5K', '8K']);
      return {
        q: `An MVP with ${n} users: users, products, orders and reviews. Access patterns are still changing every week, and the team knows SQL.`,
        answer: 'Relational (PostgreSQL)',
        hint: 'What’s the safe default when you don’t know the access patterns yet?',
        steps: [
          'Small scale: any database works, so optimise for flexibility.',
          'Relational data with joins (orders → users → products).',
          'Unknown access patterns favour ad-hoc SQL queries.',
          'Choose relational. Add specialised stores later when a need is proven.',
        ],
        followups: [
          { q: 'Someone proposes Cassandra “because it scales”. Your reply?', options: ['At this scale, Cassandra’s fixed query model and ops cost slow us down; PostgreSQL easily handles it', 'Agree, always plan for 1B users', 'Use both from day one', 'Use a spreadsheet'], why: 'Choosing for scale you don’t have is a classic interview red flag. Name the trigger that would change your mind.' },
        ],
      };
    },
  ],
});
