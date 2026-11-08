SG.add({
  id: 'collab-jobs',
  ref: 'R5 R9 R11 R12',
  section: 'Building blocks',
  title: 'Collaboration, leaderboards and job scheduling',
  short: 'Real-time patterns',
  blurb: 'Common real-time building blocks: OT vs CRDT, sorted sets, hot counters, live fan-out and delayed jobs.',
  intro: 'Many interview systems reuse a small set of real-time patterns. Collaborative editors merge concurrent edits with OT (a central server transforms operations) or CRDTs (data types that merge by themselves). Rankings and “nearby” queries fit Redis sorted sets. Like and view counters on hot items need writes spread out or aggregated instead of one row updated by everyone. Live comments need server push (SSE) plus pub/sub so a comment reaches viewers connected to other servers. And “do this at 9 a.m. tomorrow” needs a durable delayed-job scheduler, not an in-memory timer.',
  options: {
    'Operational transformation (OT)': {
      eli5: 'Two students edit the same class notes. The teacher receives each change in order and adjusts later ones (“you meant line 6, since a line was added above”) before writing them on the board.',
      industry: [
        'Google Docs, which uses a central server ordering and transforming operations.',
        'Etherpad and early collaborative editors.',
        'Collaborative code editors with a single authoritative session server per document.',
      ],
      def: 'Each edit is an operation (insert “a” at position 5). A central server orders operations per document and transforms each incoming one against operations the client hadn’t seen, so all replicas converge. Simple data model and compact, but it needs a central sequencer per document and transform functions are subtle to get right.',
      scenarios: [
        'Always-online editing with a server in the loop',
        'A central service can own each document’s session',
        'You want small operations and a well-trodden approach',
      ],
      scale: 'Route all editors of one document to the same session server (consistent hashing by doc ID). A few hundred concurrent editors per doc is typical.',
    },
    'CRDTs': {
      eli5: 'Everyone keeps their own copy of a shared shopping list, written with special rules so that when phones sync later, in any order, everyone ends up with exactly the same list.',
      industry: [
        'Figma (CRDT-inspired), Apple Notes, and local-first apps using Yjs or Automerge.',
        'Redis Enterprise and Riak for multi-region counters and sets.',
        'Offline-capable note and whiteboard apps that sync later.',
      ],
      def: 'Conflict-free replicated data types are structures (counters, sets, sequences with unique position IDs) whose merge is commutative and idempotent, so replicas that apply the same set of edits in any order converge without a central server. Great for offline and peer-to-peer; costs extra metadata per character or element and needs garbage collection.',
      scenarios: [
        'Users edit offline and sync later',
        'Multi-region or peer-to-peer replicas without a single sequencer',
        'Merging must never ask the user to resolve conflicts',
      ],
      scale: 'Metadata can be several times the document size without compaction. Merges are local and fast, so no central bottleneck.',
    },
    'Redis sorted set (leaderboards and geo)': {
      eli5: 'A cricket scoreboard that re-orders itself the instant anyone’s score changes, so “top 10” and “where am I?” are always one glance away.',
      industry: [
        'Game and quiz leaderboards (ZINCRBY, ZREVRANGE, ZREVRANK).',
        'Dream11-style contest rankings and trending lists.',
        'Redis GEO (built on sorted sets with geohash scores) for “drivers within 2 km” in ride-hailing.',
      ],
      def: 'A sorted set keeps members ordered by score in a skip list, giving O(log N) updates, rank lookups and top-K range reads. Redis GEO stores locations as geohash-encoded scores in a sorted set, so radius searches are range scans. Keep the durable record in a database and treat Redis as the fast index.',
      scenarios: [
        'Live top-K rankings and “my rank” for millions of players',
        'Frequently changing scores that must be reflected instantly',
        'Proximity queries on moving objects (drivers, riders, delivery agents)',
      ],
      scale: 'One sorted set handles tens of millions of members and ~100K ops/s per node. For bigger boards, shard by score range or region, or keep exact top-K and approximate rank for the long tail.',
    },
    'Sharded or aggregated counters': {
      eli5: 'Instead of one cashier counting every vote at a huge rally, ten cashiers each count their own queue and someone adds up the ten totals every few seconds.',
      industry: [
        'Facebook/Instagram like counts kept in a derived table fed by change data capture and Kafka.',
        'Google Cloud Firestore’s distributed counter pattern (N shards summed on read).',
        'YouTube view counts that lag and are reconciled later.',
      ],
      def: 'Don’t make every like update one hot row. Either split the counter into N shards (random shard per increment, sum on read) or keep the source of truth as like rows and update a separate count asynchronously: CDC → Kafka partitioned by post ID → a consumer that batches +1/−1 and stores the last applied offset for exactly-once. Reads come from a cache; counts may lag slightly.',
      scenarios: [
        'One item receives hundreds or thousands of increments per second',
        'The user must see their own like immediately, but the total can lag',
        'Counting rows on every read is too slow',
      ],
      scale: 'Even 50M likes in a day is ~600/s on one post; a single Kafka partition consumer with batching handles that. Sharded counters trade read cost (sum N) for write spread.',
    },
    'Pub/sub fan-out over SSE': {
      eli5: 'Each hall in a wedding venue has its own announcer. The main desk shouts updates over the PA system, and each hall’s announcer only repeats those meant for the guests in their hall.',
      industry: [
        'Facebook Live, YouTube Live and Twitch chat comments.',
        'Live cricket score and commentary feeds.',
        'Redis pub/sub channels between write servers and connection servers.',
      ],
      def: 'Viewers hold a server-sent events connection (one-way, plain HTTP, auto-reconnect) to a real-time server, which keeps an in-memory map of video → connections. Comments are posted over normal HTTP, saved to the database, then published to a pub/sub channel chosen by hash(video ID) mod N. Real-time servers subscribe only to channels for videos their viewers watch, and push to matching connections. Co-locating viewers of one video on the same servers cuts the fan-out.',
      scenarios: [
        'Many passive readers, few writers (live comments, scores)',
        'Connections spread across many servers must all receive an event',
        'Latency target around 200 ms from post to screen',
      ],
      scale: 'A tuned server holds on the order of 1M connections; 1M streams × 1K viewers needs ~1,000 connection servers. Use hashed channels, not one topic per video.',
    },
    'Durable delayed-job scheduler': {
      eli5: 'A hotel wake-up call register. Requests are written in the book, not remembered by the receptionist, so even if she goes home, the night clerk still calls you at 6 a.m.',
      industry: [
        'Reminder notifications (“your cart expires in 1 hour”), scheduled payouts and EMI auto-debits.',
        'Uber/DoorDash timeouts: auto-cancel an order if no driver accepts in 5 minutes.',
        'Temporal timers, Quartz with a JDBC store, SQS delay queues (max 15 minutes), Redis sorted sets scored by run time.',
      ],
      def: 'Persist each job with its run_at time in a durable store (DB table indexed by run_at, or time-bucketed partitions). Scheduler workers repeatedly claim due jobs with a lease (e.g. SELECT … FOR UPDATE SKIP LOCKED or a conditional update), enqueue them for executors, and mark them done. Leases expire so crashed workers’ jobs are retried; execution is at-least-once, so jobs must be idempotent.',
      scenarios: [
        'Millions of one-off jobs scheduled minutes to months ahead',
        'Jobs must survive deploys and server crashes',
        'Recurring cron work that must run exactly once per period across a fleet',
      ],
      scale: 'Partition the job table by time bucket or hash to spread polling; one Postgres table with SKIP LOCKED handles thousands of jobs per second before you need sharding.',
    },
  },
  scenarios: [
    (pick) => {
      const app = pick(['a Google Docs-style editor', 'a shared spreadsheet', 'a collaborative code pad']);
      return {
        q: `You are building ${app}. Users are always online, every document already has a session service that loads it, and you want the smallest per-edit payloads and a battle-tested approach.`,
        answer: 'Operational transformation (OT)',
        hint: 'There is a natural central authority per document.',
        steps: ['Clients are online and a server owns each document session.', 'The server can order operations and transform concurrent ones.', 'No need for per-character merge metadata.', 'OT with a central server.'],
        followups: [
          { q: 'How do you make sure all editors of one document reach the same session server?', options: ['Route by document ID (consistent hashing or a session registry)', 'Random load balancing', 'One server per user', 'DNS round-robin'], why: 'OT needs one sequencer per document.' },
        ],
      };
    },
    (pick) => {
      const ctx = pick(['field engineers in remote villages', 'pilots on flights', 'students in hostels with patchy Wi-Fi']);
      return {
        q: `A notes app is used by ${ctx}. They edit shared documents offline for hours, and when they reconnect, edits from several people must merge automatically without asking anyone to resolve conflicts.`,
        answer: 'CRDTs',
        hint: 'No server is available to order operations while people edit.',
        steps: ['Edits happen offline, so no central sequencer sees them in order.', 'Replicas must converge whatever order merges happen in.', 'CRDT merges are commutative and idempotent.', 'CRDTs.'],
        followups: [
          { q: 'What is the main cost of sequence CRDTs?', options: ['Extra metadata per element (unique IDs, tombstones) that needs compaction', 'They need a central server', 'They lose edits', 'They can’t work offline'], why: 'Convergence without coordination is paid for in metadata.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['5 million', '20 million', '50 million']);
      return {
        q: `A fantasy cricket contest has ${n} participants. Points update every ball, users want the top 100 and their own rank refreshed within a second, and scores change thousands of times per second.`,
        answer: 'Redis sorted set (leaderboards and geo)',
        hint: 'Ordered by score, cheap rank lookups, constant updates.',
        steps: ['A SQL ORDER BY plus COUNT for rank on every request is too slow.', 'A sorted set gives O(log N) updates and rank queries.', 'Top-K is a range read.', 'Redis sorted set.'],
        followups: [
          { q: 'Redis restarts and loses data. What protects you?', options: ['Scores are persisted in the database; rebuild the set from it (plus AOF/replicas)', 'Nothing, users start from zero', 'The CDN', 'Browser cache'], why: 'Treat Redis as a fast index over durable data.' },
        ],
      };
    },
    (pick) => {
      const r = pick(['1 km', '2 km', '3 km']);
      return {
        q: `A bike-taxi app has 400,000 drivers sending GPS updates every 4 seconds. When a rider books, you need the drivers within ${r}, sorted by distance, in under 50 ms.`,
        answer: 'Redis sorted set (leaderboards and geo)',
        hint: 'Frequent location updates and a radius query; Redis has a structure built on sorted sets for this.',
        steps: ['100K location writes per second rule out a heavy spatial DB for the hot path.', 'Redis GEO stores geohash scores in a sorted set.', `GEOSEARCH returns members within ${r} quickly.`, 'Redis sorted set (GEO).'],
        followups: [
          { q: 'Why does a geohash work as a sort score?', options: ['Nearby points share geohash prefixes, so a radius becomes a few score ranges', 'It encrypts locations', 'It sorts by driver rating', 'It stores only the city'], why: 'Geohashing turns 2D proximity into 1D ranges (with neighbouring-cell checks at edges).' },
        ],
      };
    },
    (pick) => {
      const rate = pick(['600', '1,500', '3,000']);
      return {
        q: `A film trailer post receives ${rate} likes per second at launch. Each like does UPDATE posts SET like_count = like_count + 1, and the row lock causes timeouts. Users must see their own like immediately; the total may be a few seconds stale.`,
        answer: 'Sharded or aggregated counters',
        hint: 'One hot row is the bottleneck; the total can lag.',
        steps: ['Store the like itself (user, post) as the source of truth for “did I like this?”.', 'Stop updating one row per like.', 'Aggregate asynchronously (CDC → Kafka by post ID → batched counter) or spread across counter shards.', 'Sharded or aggregated counters.'],
        followups: [
          { q: 'The counter consumer crashes and replays Kafka messages. How do you avoid double counting?', options: ['Store the last applied partition offset with the count and skip older messages', 'Hope it doesn’t crash', 'Recount the whole table each time', 'Use a bigger cache'], why: 'Saving offset and count together makes the update effectively exactly-once.' },
          { q: 'Which consistency does the “did I like it?” check need?', options: ['Read-your-writes: read from the leader (or a quorum) for the user’s own like', 'Eventual is fine', 'None', 'Linearizable global counter'], why: 'Users notice if their own like disappears on refresh; totals can lag.' },
        ],
      };
    },
    (pick) => {
      const v = pick(['the IPL final', 'a World Cup match', 'a big product launch']);
      return {
        q: `During ${v}, 2 million viewers watch one live stream and post 5,000 comments per second. Viewers are spread over 300 connection servers; a comment hitting one server must reach viewers on all the others within about 200 ms. Most viewers never comment.`,
        answer: 'Pub/sub fan-out over SSE',
        hint: 'One-way push to many readers, across many servers.',
        steps: ['Mostly reads: server-to-client push fits SSE better than WebSockets.', 'Each connection server only knows its own viewers.', 'Publish comments to a channel by hash(video ID); servers with viewers of that video subscribe and push.', 'Pub/sub fan-out over SSE.'],
        followups: [
          { q: 'Why not create one Kafka topic per live video?', options: ['Millions of topics and constant subscribe/unsubscribe are impractical; hash videos into N channels', 'Kafka is too fast', 'Topics can’t hold text', 'It’s the recommended approach'], why: 'Bounded hashed channels keep broker overhead manageable; Redis pub/sub suits churny subscriptions.' },
        ],
      };
    },
    (pick) => {
      const job = pick(['send a reminder 24 hours before each doctor appointment', 'auto-cancel unpaid orders after 30 minutes', 'retry failed EMI auto-debits after 3 days']);
      return {
        q: `You must ${job}, for about 10 million items a day. The current code uses in-memory timers on app servers, and jobs vanish whenever a server restarts or is deployed.`,
        answer: 'Durable delayed-job scheduler',
        hint: 'Timers must survive the process that created them.',
        steps: ['In-memory timers die with the process.', 'Persist jobs with run_at in a durable store.', 'Workers claim due jobs with leases and retry on expiry; handlers are idempotent.', 'A durable delayed-job scheduler.'],
        followups: [
          { q: 'Two scheduler instances poll the same table. How do you avoid both running the same job?', options: ['Claim with a lease: SELECT … FOR UPDATE SKIP LOCKED or a conditional status update', 'Run only one instance forever', 'Let both run and hope', 'Sleep a random time'], why: 'Atomic claims prevent double pickup; idempotency covers lease-expiry retries.' },
          { q: 'Why not just use an SQS delay queue for all of these?', options: ['SQS delays max out at 15 minutes, so long delays need a stored schedule', 'SQS can’t deliver messages', 'SQS is always slower than a DB', 'It can’t be used from Java'], why: 'Short delays fit queue features; days or months need a persisted run_at.' },
        ],
      };
    },
  ],
});
