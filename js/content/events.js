SG.add({
  id: 'events',
  ref: 'I9 I10 I11 I12 I13',
  section: 'Async and messaging',
  title: 'Event-driven design, event sourcing, CQRS, CDC',
  short: 'Event-driven patterns',
  blurb: 'Keeping derived data in sync, storing history as events, splitting reads from writes, and real-time windows.',
  intro: 'Once events flow through a broker, four patterns appear again and again: capture database changes for other systems (CDC), store events as the source of truth (event sourcing), separate write and read models (CQRS), and compute results over time windows (stream processing).',
  options: {
    'Change data capture (CDC)': {
      eli5: 'A security camera on the warehouse door. Every box that goes in or out is recorded, and other teams update their own lists from the recording, without bothering the warehouse.',
      industry: [
        'Debezium reads the MySQL binlog / Postgres WAL and publishes row changes to Kafka.',
        'Keeping Elasticsearch, caches and warehouses in sync with the main database.',
        'DynamoDB Streams triggering Lambda functions.',
      ],
      def: 'Read the database’s own change log and publish each insert/update/delete as an event, so derived systems (search index, cache, warehouse) update asynchronously. Avoids dual writes and 2PC; derived data is eventually consistent.',
      scenarios: [
        'Search index or cache must follow the main database',
        'Avoid the app writing to two systems (dual writes)',
        'Feeding analytics without querying production',
      ],
      scale: 'Events mirror table rows, not business meaning; derived stores lag by seconds.',
    },
    'Event sourcing': {
      eli5: 'A bank passbook. Instead of only writing today’s balance, every deposit and withdrawal is recorded. The balance is just the sum of all entries, and you can always see how you got there.',
      industry: [
        'Ledgers and wallets: transactions are the truth; balances are derived.',
        'Shopping carts recorded as “item added/removed” events.',
        'Audit-heavy domains (insurance claims, trading).',
      ],
      def: 'Store every state change as an immutable domain event (OrderPlaced, ItemAdded) in an append-only log; current state is computed by replaying events (with periodic snapshots). Gives full history, audit, and the ability to build new views later.',
      scenarios: [
        'Full audit trail and “how did we get here?” questions',
        'New read models must be built from history later',
        'Rebuilding state after a bug by replaying events',
      ],
      scale: 'Replays get slow without snapshots; event schemas must be versioned forever.',
    },
    'CQRS': {
      eli5: 'A restaurant with separate counters: one window takes orders (writes), another big board shows the menu and wait times (reads). Each is designed for its own job.',
      industry: [
        'Order writes in PostgreSQL, product search reads from Elasticsearch.',
        'Feeds precomputed into Redis for reads while posts are written elsewhere.',
        'Dashboards backed by denormalized read tables updated from events.',
      ],
      def: 'Command Query Responsibility Segregation: use different models (and often different stores) for writes and reads. Writes go to a normalized, consistent model; read models are denormalized for fast queries and updated asynchronously (often via events/CDC).',
      scenarios: [
        'Read and write patterns are very different in shape or scale',
        'Complex queries are slowing down the transactional database',
        'Many different views of the same data',
      ],
      scale: 'Read models are eventually consistent; handle read-your-own-writes where users notice.',
    },
    'Stream processing (windows)': {
      eli5: 'Counting cars passing a toll booth every minute. You don’t store every car forever; you keep a running count per minute and publish it.',
      industry: [
        'Ad-click counts per ad per minute with Flink or Kafka Streams.',
        'Fraud detection: “more than 5 card swipes in 1 minute”.',
        'Trending hashtags over the last hour.',
      ],
      def: 'Continuously compute results over unbounded event streams, grouped into time windows: tumbling (fixed, non-overlapping), hopping (fixed size, overlapping), sliding (last N minutes at any moment). Handles late events with event-time and watermarks.',
      scenarios: [
        'Real-time counts, sums or alerts over time',
        'Results needed within seconds, not after a nightly batch',
        'Detecting patterns in event sequences',
      ],
      scale: 'Needs checkpointed state and partitioning by key; late and out-of-order events need a policy.',
    },
  },
  scenarios: [
    (pick) => {
      const what = pick(['an Elasticsearch product index', 'a Redis cache of product pages', 'a data warehouse']);
      return {
        q: `The product service writes to MySQL and also tries to update ${what}. Sometimes the second write fails, and the two drift apart for days.`,
        answer: 'Change data capture (CDC)',
        hint: 'Stop the app from writing to two places.',
        steps: ['Dual writes can partially fail.', 'Let the database be the single source of truth.', 'Stream its change log to update the derived store.', 'CDC.'],
        followups: [
          { q: 'Why not use a distributed transaction (2PC) across MySQL and Elasticsearch?', options: ['2PC is slow, fragile and unsupported by many stores; async CDC is simpler and resilient', 'It’s faster', 'Elasticsearch requires it', 'It guarantees zero latency'], why: 'CDC accepts brief lag to avoid coordination.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['a wallet', 'an insurance claim', 'a trading account']);
      return {
        q: `For ${what}, regulators require the complete history of every change, and the team wants to build new reports from past data that they haven’t thought of yet.`,
        answer: 'Event sourcing',
        hint: 'History is the source of truth.',
        steps: ['Every change must be preserved.', 'Future views need the raw history.', 'Store domain events; derive current state.', 'Event sourcing.'],
        followups: [
          { q: 'Rebuilding an account’s balance from 5 years of events is slow. Fix?', options: ['Periodic snapshots: load the latest snapshot, replay only newer events', 'Delete old events', 'Store balances only', 'Add more RAM'], why: 'Snapshots bound replay time without losing history.' },
        ],
      };
    },
    (pick) => {
      const w = pick(['1,000 writes/s', '2,000 writes/s']);
      return {
        q: `An e-commerce order system handles ${w} with strict transactions, but the catalogue and order-history pages need rich search and filters at 100x that volume, and those queries are slowing checkout.`,
        answer: 'CQRS',
        hint: 'Reads and writes have very different needs.',
        steps: ['Write path needs strong transactions.', 'Read path needs flexible, fast queries at huge scale.', 'Separate write model and read models, synced asynchronously.', 'CQRS.'],
        followups: [
          { q: 'A user places an order and the order-history page (read model) doesn’t show it yet. Fix?', options: ['Show it from the write model or client state right after placing (read-your-own-writes)', 'Make all reads synchronous', 'Remove the read model', 'Tell users to wait'], why: 'CQRS read models lag; patch the visible gap for the author.' },
        ],
      };
    },
    (pick) => {
      const n = pick([3, 5]);
      return {
        q: `Flag a card if it’s swiped more than ${n} times within any 60-second period. Alerts must fire within a few seconds.`,
        answer: 'Stream processing (windows)',
        hint: 'A continuous computation over time.',
        steps: ['Results needed in seconds.', 'Count events per card over a moving time range.', 'A sliding window in a stream processor.', 'Stream processing.'],
        followups: [
          { q: 'Ad clicks counted per ad per exact minute (12:00–12:01, 12:01–12:02). Which window type?', options: ['Tumbling window', 'Sliding window', 'Session window', 'No window'], why: 'Tumbling windows are fixed and non-overlapping.' },
        ],
      };
    },
    () => ({
      q: 'A team wants the analytics warehouse to receive every insert and update from the orders database within seconds, without adding any code to the order service.',
      answer: 'Change data capture (CDC)',
      hint: 'No app changes; tap the database itself.',
      steps: ['Can’t change the app.', 'The database already logs every change.', 'Read the log (binlog/WAL) and stream it.', 'CDC.'],
      followups: [
        { q: 'CDC vs event sourcing: what’s the key difference?', options: ['CDC streams low-level row changes from a DB that stays the truth; event sourcing stores domain events as the truth', 'They’re identical', 'CDC stores intent; event sourcing stores rows', 'Event sourcing needs a SQL database'], why: 'Row-level change feed vs business-level event history.' },
      ],
    }),
  ],
});
