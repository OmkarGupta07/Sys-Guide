SG.add({
  id: 'acid',
  ref: 'F3 F4 F14',
  section: 'Data and storage',
  title: 'Transactions, isolation and locking',
  short: 'Isolation and locking',
  blurb: 'Which anomaly is hurting you, and the cheapest isolation or lock that stops it.',
  intro: 'ACID promises atomic, consistent, isolated and durable transactions. The “I” has levels: stronger isolation prevents more anomalies but costs throughput. Interviews ask you to match an anomaly to the fix, and to choose optimistic or pessimistic locking.',
  options: {
    'Read committed': {
      eli5: 'You can only read pages of a shared notebook that the writer has finished. You never see half-written sentences, but the page may change between two of your glances.',
      industry: [
        'Default isolation level in PostgreSQL, Oracle and SQL Server.',
        'Good enough for most web requests that read and write a few rows.',
        'Prevents dirty reads, the worst anomaly.',
      ],
      def: 'Each statement sees only data committed before it began. Prevents dirty reads; allows non-repeatable reads (a row changes between two reads in the same transaction) and phantoms.',
      scenarios: [
        'You must never show uncommitted (possibly rolled back) data',
        'Typical CRUD transactions',
        'Default choice when nothing stronger is needed',
      ],
      scale: 'High concurrency, low locking. Pair with explicit locks where a specific race matters.',
    },
    'Repeatable read': {
      eli5: 'When you start reading, you get a photocopy of the notebook. However long you take, your copy doesn’t change.',
      industry: [
        'MySQL InnoDB’s default isolation level.',
        'Reports that read the same rows several times and must get consistent numbers.',
        'PostgreSQL implements it as snapshot isolation.',
      ],
      def: 'The transaction sees a consistent snapshot: rows read once give the same values when read again. Prevents dirty and non-repeatable reads; phantom behaviour depends on the engine (MySQL uses gap locks; Postgres snapshots avoid them).',
      scenarios: [
        'A transaction reads the same data several times and needs stable values',
        'Consistent multi-query reports',
        'Calculations across rows that must not shift mid-transaction',
      ],
      scale: 'Snapshots cost some storage (MVCC versions) and long transactions keep old versions alive.',
    },
    'Serializable': {
      eli5: 'Only one person may use the shared notebook at a time, or at least the result must look exactly as if they took turns.',
      industry: [
        'Financial rules spanning many rows (e.g. “total on-call doctors must stay ≥ 1”).',
        'PostgreSQL’s Serializable Snapshot Isolation aborts conflicting transactions instead of locking.',
        'Used selectively, because of retry and throughput costs.',
      ],
      def: 'The strongest level: the outcome equals some one-at-a-time order of transactions. Prevents all anomalies, including phantoms and write skew. Conflicting transactions may be aborted and must be retried.',
      scenarios: [
        'Invariants across multiple rows (write skew)',
        'Correctness matters far more than throughput',
        'Phantom rows would break a decision',
      ],
      scale: 'Lowest concurrency; applications must handle serialization failures with retries.',
    },
    'Optimistic locking': {
      eli5: 'Two people edit a shared document. Instead of locking it, each notes the version number. When saving, if the version changed, the second person is told to reload and try again.',
      industry: [
        'JPA/Hibernate @Version columns.',
        'DynamoDB conditional writes and HTTP ETag/If-Match updates.',
        'Wiki and CMS editors warning “this page was changed since you opened it”.',
      ],
      def: 'No lock while reading. Each row has a version; an update succeeds only if the version is unchanged (UPDATE … WHERE id = ? AND version = ?). On conflict, retry or report. Pessimistic locking (SELECT … FOR UPDATE) instead locks the row up front.',
      scenarios: [
        'Conflicts are rare, and you don’t want to hold locks during user think time',
        'Long-running edits (forms, documents)',
        'Distributed or stateless services updating shared rows',
      ],
      scale: 'Great under low contention. Under heavy contention (a hot seat or counter) retries pile up; pessimistic locks or atomic updates work better.',
    },
  },
  scenarios: [
    (pick) => {
      const what = pick(['an order total', 'a wallet balance', 'a stock count']);
      return {
        q: `A dashboard showed ${what} from a transaction that was later rolled back. Customers acted on a number that never really existed.`,
        answer: 'Read committed',
        hint: 'The reader saw uncommitted data.',
        steps: ['Reading uncommitted data is a dirty read.', 'Read committed prevents dirty reads.', 'It’s the default in Postgres, so the system was likely on Read uncommitted.', 'Use Read committed (at least).'],
        followups: [
          { q: 'Which anomaly can still happen under Read committed?', options: ['Non-repeatable read: the same row read twice in one transaction can change', 'Dirty read', 'Lost durability', 'None'], why: 'Read committed only guarantees each statement sees committed data.' },
        ],
      };
    },
    (pick) => {
      const n = pick([3, 4, 5]);
      return {
        q: `A month-end report runs ${n} queries over the same accounts in one transaction. Another process updates balances meanwhile, so the report’s totals don’t add up across queries.`,
        answer: 'Repeatable read',
        hint: 'The same rows return different values within one transaction.',
        steps: ['Rows change between reads in one transaction: non-repeatable reads.', 'The report needs one consistent snapshot.', 'Repeatable read (snapshot) gives stable values.'],
        followups: [
          { q: 'Why not run every transaction as Serializable to be safe?', options: ['It reduces concurrency and forces retries on conflicts; use it only where invariants need it', 'It’s not supported by Postgres', 'It loses data', 'It’s always faster'], why: 'Stronger isolation is a cost, not a free upgrade.' },
        ],
      };
    },
    () => ({
      q: 'Rule: at least one doctor must be on call. Two doctors, both on call, each check “is someone else on call?” at the same moment, both see yes, and both go off call. Now nobody is on call.',
      answer: 'Serializable',
      hint: 'Each transaction updated a different row, yet together they broke a rule.',
      steps: ['Each transaction reads the same set and writes a different row.', 'No row conflict, so weaker levels allow it.', 'This anomaly is write skew.', 'Serializable prevents it.'],
      followups: [
        { q: 'Without Serializable, how else could you prevent it?', options: ['Lock the rows being checked (SELECT … FOR UPDATE on all on-call doctors)', 'Add an index', 'Increase the timeout', 'Use read uncommitted'], why: 'Explicitly locking the read set turns write skew into a normal conflict.' },
      ],
    }),
    (pick) => {
      const what = pick(['a product description in an admin panel', 'a support ticket', 'a wiki page']);
      return {
        q: `Two staff members open ${what}, edit for several minutes, and save. The second save silently overwrites the first person’s changes. Conflicts are rare.`,
        answer: 'Optimistic locking',
        hint: 'Rare conflicts, long think time. Don’t hold locks for minutes.',
        steps: ['This is a lost update.', 'Conflicts are rare and edits are long.', 'Add a version column; update only if the version is unchanged, else ask to reload.', 'Optimistic locking.'],
        followups: [
          { q: 'Which JPA annotation enables this?', options: ['@Version', '@Lock(PESSIMISTIC_WRITE) only', '@Transactional(readOnly = true)', '@Id'], why: 'Hibernate adds the version check to every UPDATE automatically.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['profile', 'address book', 'saved cart']);
      return {
        q: `A user edits their ${what} from both phone and laptop through a stateless REST API. If one device saves after the other changed it, the API must reject the stale save with 412 instead of overwriting. Holding database locks between requests isn’t possible.`,
        answer: 'Optimistic locking',
        hint: 'No locks between requests; detect the conflict at save time.',
        steps: ['Stateless API: you can’t hold a lock across requests.', 'Send the version (ETag) with the read.', 'Save with If-Match; reject if the version changed.', 'Optimistic locking.'],
        followups: [
          { q: 'Flash sale: 20K users race for the last 100 units. Is optimistic locking still the best fit?', options: ['No: nearly every attempt conflicts and retries pile up; use an atomic UPDATE … SET stock = stock - 1 WHERE stock > 0', 'Yes, always', 'Yes, with unlimited retries', 'Use Serializable for every request'], why: 'Optimistic locking shines with rare conflicts; heavy contention needs atomic updates or a queue.' },
        ],
      };
    },
  ],
});
