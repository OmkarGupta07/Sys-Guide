SG.add({
  id: 'indexes',
  ref: 'F5 F6 F7 F13',
  section: 'Data and storage',
  title: 'Indexes, B-trees and LSM trees',
  short: 'Indexes and storage engines',
  blurb: 'Why a query is slow, which index fixes it, and when the storage engine itself is the answer.',
  intro: 'Most slow-query problems in interviews (and in real jobs) are index problems. Know the main index shapes, the cost they add to writes, and why write-heavy databases use LSM trees instead of B-trees.',
  options: {
    'B-tree index': {
      eli5: 'A dictionary sorted alphabetically with guide words at the top of each page. You jump straight to the right page instead of reading every word.',
      industry: [
        'The default index type in PostgreSQL, MySQL InnoDB and Oracle.',
        'Primary keys and foreign keys are B-tree indexed.',
        'Range queries like “orders between two dates” and ORDER BY use them.',
      ],
      def: 'A balanced, sorted tree giving O(log n) lookups, range scans and ordered reads. Each index speeds reads on its columns but adds work to every insert, update and delete.',
      scenarios: [
        'Equality and range lookups on a column (WHERE created_at > …)',
        'Sorting and pagination by an indexed column',
        'Foreign key joins',
      ],
      scale: 'Read-optimised. Too many indexes slow writes and use memory; index what queries actually filter on.',
    },
    'Composite index': {
      eli5: 'A phone book sorted by surname, then first name. Great for “Sharma, Rahul”, useless for finding everyone named “Rahul” alone.',
      industry: [
        'Indexes like (user_id, created_at) power “my latest orders” queries.',
        'Covering indexes include every column a query needs, so the table isn’t touched (index-only scan).',
        'Query plans (EXPLAIN) show whether the leftmost columns are used.',
      ],
      def: 'An index on several columns in a specific order. Works for queries using a leftmost prefix of those columns (leftmost-prefix rule). If it contains all columns a query reads, it’s a covering index.',
      scenarios: [
        'Queries filter on one column and sort or filter on another',
        'Avoiding table lookups with a covering index',
        'Replacing several single-column indexes with one well-ordered index',
      ],
      scale: 'Column order is the whole game: equality columns first, then range/sort columns.',
    },
    'LSM tree': {
      eli5: 'Instead of filing each letter into the cabinet immediately, you drop it into an inbox tray. Later, you sort whole trays and merge them into the cabinet in big batches.',
      industry: [
        'Cassandra, RocksDB, ScyllaDB, HBase and LevelDB use LSM trees.',
        'Write-heavy workloads: logs, metrics, chat messages, IoT.',
        'Bloom filters skip files that can’t contain a key during reads.',
      ],
      def: 'Log-Structured Merge tree: writes go to an in-memory table and an append-only log, then get flushed to sorted immutable files (SSTables) that are merged in the background (compaction). Very fast writes; reads may check several files.',
      scenarios: [
        'Extremely write-heavy workloads',
        'Append-mostly data (events, time series, messages)',
        'When B-tree random writes become the bottleneck',
      ],
      scale: 'Huge write throughput. Costs: read amplification and background compaction I/O. B-trees win for read-heavy, update-in-place work.',
    },
    'Denormalization': {
      eli5: 'Writing the customer’s name directly on each delivery slip, instead of writing only a customer number and looking the name up every time.',
      industry: [
        'Storing author_name on each post to avoid a join on every feed read.',
        'Precomputed counters (like_count) instead of COUNT(*) on every request.',
        'NoSQL data models designed around read patterns.',
      ],
      def: 'Deliberately duplicating data across tables or documents to avoid joins and expensive aggregations at read time. The opposite of normalization (each fact stored once). Trades write complexity and consistency effort for fast reads.',
      scenarios: [
        'Read-heavy pages that join many tables on every request',
        'Counts or totals recomputed constantly',
        'Data models for NoSQL stores without joins',
      ],
      scale: 'Every duplicate must be kept in sync (transactions, events, or background jobs). Normalise first; denormalise proven hot paths.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick(['5M', '20M', '80M']);
      const col = pick(['email', 'phone_number', 'order_number']);
      return {
        q: `A login query SELECT * FROM users WHERE ${col} = ? takes 3 seconds on a table of ${n} rows. EXPLAIN shows a full table scan.`,
        answer: 'B-tree index',
        hint: 'The database is reading every row to find one.',
        steps: ['Full scan for an equality lookup.', `Index ${col}: O(log n) lookup instead of reading ${n} rows.`, 'A unique B-tree index (also enforces uniqueness).', 'B-tree index.'],
        followups: [
          { q: 'The query is now fast, but inserts got a bit slower. Why?', options: ['Every insert must also update the index', 'Indexes lock the whole table', 'B-trees are slow to read', 'The query cache was cleared'], why: 'Indexes trade write cost for read speed. Don’t add them blindly.' },
        ],
      };
    },
    (pick) => {
      const w = pick(['user_id', 'restaurant_id', 'customer_id']);
      return {
        q: `“Latest 20 orders for a ${w.replace('_id', '')}” runs WHERE ${w} = ? ORDER BY created_at DESC LIMIT 20. There’s an index on ${w} and a separate one on created_at, yet the query still sorts thousands of rows.`,
        answer: 'Composite index',
        hint: 'One filter column plus one sort column.',
        steps: ['Filter on one column, sort on another.', 'Two single indexes can’t give filtered + sorted rows together.', `An index on (${w}, created_at) returns them already in order.`, 'Composite index.'],
        followups: [
          { q: `With an index on (${w}, created_at), which query can NOT use it efficiently?`, options: ['WHERE created_at > ? (without the first column)', `WHERE ${w} = ?`, `WHERE ${w} = ? AND created_at > ?`, `WHERE ${w} = ? ORDER BY created_at`], why: 'Leftmost-prefix rule: the index is sorted by the first column first.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['500K', '1M', '2M']);
      return {
        q: `A metrics platform ingests ${n} data points per second, rarely updates them, and reads recent ranges for dashboards. The B-tree database can’t keep up with writes.`,
        answer: 'LSM tree',
        hint: 'Which storage design turns random writes into sequential ones?',
        steps: ['Massive write rate, append-only data.', 'B-trees do random in-place updates.', 'LSM trees buffer in memory and write sorted files sequentially.', 'Choose an LSM-based store (Cassandra, RocksDB, a TSDB).'],
        followups: [
          { q: 'What background process do LSM stores need, and what does it cost?', options: ['Compaction: merges files, costing disk I/O and CPU', 'Vacuum of B-tree pages', 'Re-indexing every hour', 'Nothing'], why: 'Compaction is the price of fast writes; it must be tuned in production.' },
        ],
      };
    },
    (pick) => {
      const n = pick([4, 5, 6]);
      return {
        q: `The home feed joins ${n} tables (posts, users, likes, comments counts…) for every request. It’s read 1,000x more than it’s written, and the joins dominate response time.`,
        answer: 'Denormalization',
        hint: 'Pay at write time so reads are cheap.',
        steps: [`${n}-table joins on every read.`, 'Reads massively outnumber writes.', 'Store author name, counts, etc. with the post.', 'Denormalize the hot read path.'],
        followups: [
          { q: 'A user changes their display name. What’s the cost now?', options: ['Every copy must be updated (often asynchronously), so old posts may briefly show the old name', 'Nothing', 'The user must re-register', 'The database rejects the change'], why: 'Denormalization moves complexity to writes. Say it out loud in interviews.' },
        ],
      };
    },
    (pick) => {
      const c = pick(['status, total, created_at', 'name, price', 'email, last_login']);
      return {
        q: `A hot query reads only (${c}) for a user’s rows. It uses an index to find rows but then fetches each full row from the table, which is the slow part.`,
        answer: 'Composite index',
        hint: 'What if the index already had every column the query needs?',
        steps: ['The index finds rows, then table lookups dominate.', 'Include the selected columns in the index.', 'The query becomes an index-only scan.', 'A covering (composite) index.'],
        followups: [
          { q: 'Your Spring app loads 100 orders, then runs one query per order to load its customer. Name?', options: ['N+1 query problem; fix with a join fetch or batch loading', 'Cache stampede', 'Write skew', 'Hot partition'], why: 'N+1 is the most common ORM performance bug in Java interviews.' },
        ],
      };
    },
  ],
});
