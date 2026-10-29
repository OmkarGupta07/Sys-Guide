SG.add({
  id: 'ids-hashing',
  ref: 'G1 G9',
  section: 'Distributed systems',
  title: 'Consistent hashing and unique IDs',
  short: 'Hashing and IDs',
  blurb: 'Placing keys on servers without mass reshuffles, and generating IDs with no central counter.',
  intro: 'Two building blocks appear in almost every distributed design. Consistent hashing decides which node owns a key and keeps movement small when nodes change. ID generation decides how to create unique (often sortable) IDs across many servers.',
  options: {
    'Consistent hashing': {
      eli5: 'Seats around a round table, numbered like a clock. Each guest sits at the next empty seat clockwise from their number. When a new seat is added, only the guests right next to it move.',
      industry: [
        'Cassandra, DynamoDB and Riak place data on a hash ring.',
        'Memcached clients and CDNs route keys to cache servers this way.',
        'Discord used it to route guilds to servers.',
      ],
      def: 'Nodes and keys are hashed onto the same ring; each key belongs to the next node clockwise. Adding or removing a node moves only about 1/N of keys. Virtual nodes (many points per server) even out the load.',
      scenarios: [
        'Distributing keys across cache or storage nodes that come and go',
        'Avoiding a full reshuffle when scaling a cluster',
        'Load balancing stateful connections by key',
      ],
      scale: 'Use virtual nodes (e.g. 100–256 per server) to avoid uneven arcs, and to weight bigger servers.',
    },
    'UUID': {
      eli5: 'Every person picks a 36-character random code. The chance two people pick the same one is so tiny you can ignore it, and nobody has to coordinate.',
      industry: [
        'Request IDs, idempotency keys and correlation IDs.',
        'Client-generated IDs in offline-first mobile apps.',
        'Java’s UUID.randomUUID() (version 4).',
      ],
      def: 'A 128-bit identifier generated independently anywhere with negligible collision risk. v4 is random (not sortable); newer v7 is time-ordered. Large (16 bytes) and random v4 keys fragment B-tree indexes.',
      scenarios: [
        'IDs created on clients or many services with no coordination',
        'Idempotency and correlation IDs',
        'Hiding counts (random IDs don’t reveal how many orders you have)',
      ],
      scale: 'No bottleneck at all. Random v4 primary keys hurt insert performance in B-trees; prefer v7 or Snowflake for database keys.',
    },
    'Snowflake ID': {
      eli5: 'An ID made of the current time, the machine’s badge number and a counter: “10:42:05, machine 7, ticket 3”. Unique, and sorts by time.',
      industry: [
        'Twitter created Snowflake for tweet IDs.',
        'Discord and Instagram use Snowflake-style 64-bit IDs.',
        'Sortable IDs make “latest first” queries and pagination simple.',
      ],
      def: 'A 64-bit ID: ~41 bits of timestamp (ms), ~10 bits of machine/worker ID, ~12 bits of per-millisecond sequence. Generated locally with no coordination, roughly time-sortable, fits in a long.',
      scenarios: [
        'High-volume IDs that must be unique and sortable by time',
        'Compact 64-bit primary keys across many servers',
        'Feeds and timelines ordered by ID',
      ],
      scale: 'About 4,096 IDs per millisecond per worker. Needs unique worker IDs and reasonably synced clocks (clock moving backwards is the classic bug).',
    },
    'Ticket server': {
      eli5: 'A token machine at the bank: everyone takes the next number from the same machine. Simple and strictly increasing, but if the machine breaks, nobody gets a number.',
      industry: [
        'Flickr’s ticket servers handed out IDs from MySQL auto-increment.',
        'Database sequences (PostgreSQL SEQUENCE) in single-database systems.',
        'Range allocation: a service hands each server a block of 1,000 IDs at a time.',
      ],
      def: 'A central service or database sequence issues increasing numbers. Simple and dense (no gaps from randomness), but a bottleneck and single point of failure unless replicated or batched into ID ranges.',
      scenarios: [
        'Short, sequential, human-friendly IDs (invoice numbers)',
        'Systems small enough for one central counter',
        'When strict ordering or density matters',
      ],
      scale: 'Batch allocation (hand out ranges) and two servers issuing odd/even numbers remove most of the bottleneck.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick([8, 10, 16]);
      return {
        q: `A cache cluster of ${n} nodes uses hash(key) % ${n}. Adding one node remapped almost every key, the hit rate collapsed, and the database was overwhelmed.`,
        answer: 'Consistent hashing',
        hint: 'You want adding a node to move only a small share of keys.',
        steps: ['Modulo hashing depends on N, so changing N moves most keys.', 'A hash ring moves only ~1/N of keys.', 'Consistent hashing.'],
        followups: [
          { q: 'One server ends up owning a much bigger arc of the ring. Fix?', options: ['Virtual nodes: place each server at many points on the ring', 'Restart that server', 'Use modulo instead', 'Delete keys randomly'], why: 'Virtual nodes smooth the distribution and allow weighting by capacity.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['10K', '50K', '100K']);
      return {
        q: `Hundreds of app servers create ${n} posts per second. IDs must be unique, fit in a 64-bit long, and sort roughly by creation time for feeds. No central coordinator.`,
        answer: 'Snowflake ID',
        hint: 'Unique, sortable, compact, generated locally.',
        steps: ['No central counter (too slow, single point of failure).', 'Needs time ordering and 64 bits.', 'Timestamp + worker ID + sequence.', 'Snowflake ID.'],
        followups: [
          { q: 'A server’s clock jumps backwards by 2 seconds. Risk?', options: ['Duplicate or out-of-order IDs; the generator must wait or refuse until the clock catches up', 'Nothing', 'IDs become longer', 'The database rejects all inserts'], why: 'Clock skew is the classic Snowflake failure mode.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['a mobile app that creates notes offline', 'a request tracing header across 20 services', 'an idempotency key for payment requests']);
      return {
        q: `You need IDs for ${what}. They’re generated in many places with no way to coordinate, and sort order doesn’t matter.`,
        answer: 'UUID',
        hint: 'Generated anywhere, no coordination, ordering irrelevant.',
        steps: ['Created on clients or many services.', 'No coordination possible.', 'Random 128-bit IDs have negligible collision risk.', 'UUID.'],
        followups: [
          { q: 'Why can random UUID v4 primary keys slow down MySQL/Postgres inserts?', options: ['Random keys insert all over the B-tree, causing page splits and poor cache locality', 'UUIDs are always duplicated', 'Databases can’t index UUIDs', 'They’re too short'], why: 'Time-ordered IDs (UUID v7, Snowflake) insert at the end of the index.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['GST invoice numbers', 'bank cheque numbers', 'ticket numbers printed for a single venue']);
      return {
        q: `${what[0].toUpperCase() + what.slice(1)} must be strictly sequential with no gaps, as required by auditors. Volume is a few hundred per minute from one service.`,
        answer: 'Ticket server',
        hint: 'Strictly sequential, low volume.',
        steps: ['Strict sequence is a legal requirement.', 'Low volume: a central counter is no bottleneck.', 'A database sequence or ticket service.', 'Ticket server.'],
        followups: [
          { q: 'Volume grows 100x and the single counter becomes a bottleneck. Common fix (if gaps are allowed)?', options: ['Hand out ID ranges in batches (e.g. 1,000 at a time) to each server', 'Use random numbers', 'Add a sleep', 'Use timestamps only'], why: 'Range allocation removes most round trips to the central counter.' },
        ],
      };
    },
    (pick) => {
      const n = pick([50, 100, 200]);
      return {
        q: `${n} chat servers hold user connections. Each user’s messages should be routed to the server owning that user, and servers are added during peak hours without reconnecting everyone.`,
        answer: 'Consistent hashing',
        hint: 'Map users to servers so adding servers moves few users.',
        steps: ['Each user is owned by one server.', 'Servers come and go with load.', 'A ring moves only the users near the new server.', 'Consistent hashing.'],
        followups: [
          { q: 'Which of these is NOT a use of consistent hashing?', options: ['Generating sortable unique IDs', 'Placing data on Cassandra nodes', 'Routing keys to cache servers', 'Sharding WebSocket users across servers'], why: 'IDs are a separate problem (Snowflake, UUID). Hashing places keys; it doesn’t create them.' },
        ],
      };
    },
  ],
});
