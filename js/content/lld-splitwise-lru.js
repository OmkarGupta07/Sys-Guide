SG.add({
  id: 'lld-splitwise-lru',
  ref: 'U3 U7',
  section: 'LLD case studies',
  title: 'LLD: Splitwise and LRU cache',
  short: 'Splitwise and LRU',
  blurb: 'Split strategies, a balance sheet that simplifies debts, and an O(1) LRU cache made thread-safe.',
  intro: 'Splitwise tests modelling and money correctness: User, Group, Expense, Split and a per-user balance sheet, behind a single GroupService that talks to a GroupRepository interface. The split type is a Strategy that returns a list of splits, balances live in a map per user per group, and “simplify debts” is a greedy netting algorithm with two heaps. LRU cache tests data structures: O(1) get and put need a HashMap for lookup plus a doubly linked list for recency, or Java’s LinkedHashMap in access order, and then the follow-up is always “make it thread-safe”.',
  options: {
    'Strategy for split types': {
      eli5: 'Four friends share a ₹2,000 dinner: split equally, by exact amounts, or by percentage. Same bill, different rule for dividing it.',
      industry: [
        'Splitwise-style apps offer equal, exact, percentage and shares splits.',
        'Each SplitStrategy validates its own input (exact amounts must sum to the total, percentages to 100).',
        'PhonePe/Paytm bill-split features reuse the same idea for group payments.',
      ],
      def: 'Define SplitStrategy.split(total, participants, metadata) returning List<Split>, where each Split is (user, amount); EqualSplit, ExactSplit and PercentSplit implement it and validate their own input. Expense stores that List<Split> rather than a bare participant list, because a split says who and how much. ExpenseService picks the strategy from a SplitType enum via a factory or EnumMap. Use BigDecimal or integer paise, and give the rounding remainder to one participant so shares always sum to the total.',
      scenarios: [
        'New split types (by shares, by item) are planned',
        'Each split type has different validation rules',
        'Rounding of ₹100 among 3 people must still total ₹100',
      ],
      scale: 'Store money as long paise or BigDecimal; never double. Validation belongs inside each strategy.',
    },
    'Balance sheet with debt simplification': {
      eli5: 'Instead of Asha paying Ravi ₹300 and Ravi paying Meena ₹300, Asha just pays Meena ₹300. Fewer transfers, same result.',
      industry: [
        'Splitwise’s “simplify debts” reduces many pairwise IOUs to a few payments.',
        'Balances kept as Map<userId, Map<userId, amount>> or a net balance per user.',
        'Settlement apps net trips with 6 friends and 40 expenses into 4–5 UPI transfers.',
      ],
      def: 'Each group keeps a BalanceSheet per user — totalPaid, totalExpense (their own share) and a Map<User, amount> where the sign says who owes whom — updated on every expense; zero entries are removed. To simplify, compute each user’s net, drop zeros, then greedily settle the largest debtor against the largest creditor (two heaps), pushing back any remainder. This gives at most n−1 transfers; the exact minimum needs factorial search, so the greedy is the accepted answer. One-to-one expenses outside a group are only netted within each pair.',
      scenarios: [
        'Users want to see “who owes whom” per pair',
        'A group needs the fewest payments to settle up',
        'Showing a single net figure per user',
      ],
      scale: 'Greedy with two PriorityQueues is O(n log n) for n users; per-expense update is O(participants).',
    },
    'HashMap + doubly linked list': {
      eli5: 'A stack of recently read books on your desk plus an index card telling you exactly where each book sits, so you can pull any one out and put it on top instantly.',
      industry: [
        'The standard interview implementation of LRU when built-ins are disallowed.',
        'Linux page cache and many DB buffer pools use list-based LRU variants.',
        'Sentinel head and tail nodes remove null checks at the ends.',
      ],
      def: 'A HashMap<K, Node> finds a node in O(1); a doubly linked list orders nodes by recency. get moves the node to the head; put inserts at the head and, when over capacity, removes the tail node and its map entry. Doubly linked because removing a node needs its predecessor in O(1).',
      scenarios: [
        'Interviewer says “don’t use LinkedHashMap, implement it”',
        'O(1) get and put are required',
        'You need hooks such as onEvict callbacks or custom weights',
      ],
      scale: 'O(1) per op; memory overhead ~2 pointers plus a map entry per key.',
    },
    'LinkedHashMap with accessOrder': {
      eli5: 'Buying a ready-made shelf that already moves the latest-used book to the front, instead of building it yourself.',
      industry: [
        'Small in-process caches in Spring services where a dependency is overkill.',
        'new LinkedHashMap<>(cap, 0.75f, true) plus overriding removeEldestEntry.',
        'Caffeine or Guava for production caches needing TTL and concurrency.',
      ],
      def: 'LinkedHashMap with accessOrder = true moves an entry to the end on every get or put; overriding removeEldestEntry(e) to return size() > capacity evicts the least recently used entry automatically. It is a correct LRU in about 6 lines but it is not thread-safe.',
      scenarios: [
        'Production code needs a simple bounded LRU quickly',
        'Interviewer allows standard library and wants clean code',
        'A single-threaded component needs memoisation with a cap',
      ],
      scale: 'Same O(1) as hand-written; wrap with Collections.synchronizedMap or a lock for multi-threaded use.',
    },
    'Thread-safe LRU': {
      eli5: 'A shared desk of books where only one person rearranges the stack at a time, or several small desks each with its own rule, so people do not trip over each other.',
      industry: [
        'Caffeine (used by Spring Cache) buffers reads and applies recency updates in batches.',
        'Segmented LRU: hash keys to N segments, each with its own lock and list.',
        'ReentrantLock around get/put when correctness matters more than throughput.',
      ],
      def: 'Even get mutates the list in LRU, so a ReadWriteLock does not help: reads are writes. Options: one ReentrantLock around every operation (simple, correct), lock striping across N independent LRU segments (approximate global LRU, higher throughput), or a library like Caffeine. ConcurrentHashMap alone cannot keep recency order.',
      scenarios: [
        'Many request threads share one LRU cache',
        'A global lock shows up as the hot spot in profiling',
        'Interviewer asks “is this safe with 50 threads?”',
      ],
      scale: 'Single lock: fine to ~1M ops/s on a few cores; striping by 16–64 segments scales further at the cost of exact ordering.',
    },
  },
  scenarios: [
    (pick) => {
      const amt = pick([1000, 1200, 2500]);
      const kind = pick(['by percentage (40/30/30)', 'by exact amounts', 'by shares (2:1:1)']);
      return {
        q: `In a Goa-trip group, one expense of ₹${amt} must be split ${kind}. Today ExpenseService has if (type == EQUAL) … else if (type == EXACT) … and product wants two more split types next sprint.`,
        answer: 'Strategy for split types',
        hint: 'The dividing rule varies; recording the expense does not.',
        steps: ['The algorithm for computing shares is what varies.', 'Define SplitStrategy with validate() and computeShares().', 'Map the SplitType enum to strategies in a small factory or EnumMap.', 'New split types are new classes; ExpenseService stays closed.'],
        followups: [
          { q: 'Splitting ₹100 equally among 3 users. What is the correct handling?', options: ['Work in paise and give the 1-paisa remainder to one user so shares sum to ₹100', 'Use double and round each share to 2 decimals', 'Charge each ₹33.33 and drop the rest', 'Throw an error for amounts not divisible by 3'], why: 'Money must reconcile exactly; doubles and naive rounding leak paise.' },
          { q: 'What should the strategy return and Expense store: List<User> participants or List<Split>?', options: ['List<Split> (user + amount), so each share is recorded with its owner', 'List<User>, recomputing shares whenever balances are shown', 'A Map<String, Double> of names to shares', 'Only the total and the split type'], why: 'Unequal and percentage splits cannot be recomputed from a user list alone; a Split carries who and how much.' },
        ],
      };
    },
    (pick) => {
      const n = pick([5, 6, 8]);
      const m = pick([30, 45, 60]);
      return {
        q: `A group of ${n} friends logged ${m} expenses on a trip. The settle-up screen shows ${n * 2} pairwise payments, and users ask for “the fewest UPI transfers”.`,
        answer: 'Balance sheet with debt simplification',
        hint: 'Net first, then match.',
        steps: ['Compute each user’s net balance (owed minus owes).', 'Put creditors and debtors in two max-heaps by amount.', 'Repeatedly settle the largest debtor with the largest creditor for min(of the two).', 'At most n−1 transfers result.'],
        followups: [
          { q: 'Is the greedy guaranteed to give the absolute minimum number of transfers?', options: ['No; the exact minimum is NP-hard, but greedy is good and at most n−1', 'Yes, always', 'Only if all amounts are equal', 'Only for groups under 10'], why: 'Optimal needs subset-sum style search; interviews accept the greedy with this caveat.' },
          { q: 'Two expenses are added at once by different users. What protects the balance sheet?', options: ['Synchronize updates per group (or ConcurrentHashMap.merge per pair)', 'Make amounts volatile', 'Nothing; HashMap handles it', 'Recompute balances only at night'], why: 'Read-modify-write on balances needs atomicity.' },
        ],
      };
    },
    (pick) => {
      const cap = pick([3, 100, 1000]);
      return {
        q: `A machine-coding round: “Implement LRUCache(capacity=${cap}) with get and put in O(1). You may not use LinkedHashMap.” The candidate considers an ArrayList ordered by recency.`,
        answer: 'HashMap + doubly linked list',
        hint: 'Moving an element to the front must not be O(n).',
        steps: ['ArrayList removal from the middle is O(n).', 'HashMap<K, Node> gives O(1) lookup of the node.', 'A doubly linked list lets you unlink and move the node to head in O(1).', 'Evict from tail and remove that key from the map.'],
        followups: [
          { q: 'Why store the key inside each list node?', options: ['When evicting the tail you must remove its key from the map', 'For hashing speed', 'To sort the list', 'Java requires it'], why: 'Without the key, the map entry for the evicted node cannot be found in O(1).' },
          { q: 'Why use dummy head and tail nodes?', options: ['Insert and remove never special-case empty or end positions', 'They store the capacity', 'They make the cache thread-safe', 'They hold the most-used items'], why: 'Sentinels remove null checks and edge-case bugs.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['pincode-to-serviceability lookups', 'user-profile lookups', 'exchange-rate lookups']);
      return {
        q: `A single-threaded batch job in a Spring app repeats ${what}. You need a bounded LRU of 10,000 entries, written in five minutes, with no new dependency.`,
        answer: 'LinkedHashMap with accessOrder',
        hint: 'The JDK already ships an ordered map that can evict.',
        steps: ['No ban on built-ins and single-threaded use.', 'new LinkedHashMap<>(16, 0.75f, true) orders by access.', 'Override removeEldestEntry to return size() > 10000.', 'Done in a few lines, O(1) operations.'],
        followups: [
          { q: 'What does the third constructor argument true do?', options: ['Orders entries by access instead of insertion', 'Makes the map thread-safe', 'Enables TTL expiry', 'Sorts by key'], why: 'accessOrder = true moves each accessed entry to the end.' },
          { q: 'Later the job runs with 8 threads. Simplest correct fix?', options: ['Wrap it with Collections.synchronizedMap or guard with a lock', 'Switch to ConcurrentHashMap and keep LRU behaviour', 'Mark the map volatile', 'Use a HashMap instead'], why: 'Access-order gets mutate the list, so every call needs mutual exclusion.' },
        ],
      };
    },
    (pick) => {
      const t = pick([32, 64, 200]);
      return {
        q: `Your hand-written LRU is shared by ${t} Tomcat threads. Sometimes get() returns null for a key just put, and once the list became a cycle. A teammate suggests a ReadWriteLock so gets can run in parallel.`,
        answer: 'Thread-safe LRU',
        hint: 'Does get() only read?',
        steps: ['Concurrent unlink/link corrupted the list.', 'In LRU, get moves the node, so it is a write; ReadWriteLock read mode is unsafe.', 'Guard every op with one ReentrantLock, or stripe into N segments each with its own lock.', 'For production, prefer Caffeine.'],
        followups: [
          { q: 'What is the trade-off of segmented (striped) LRU?', options: ['Higher throughput but eviction is LRU per segment, not global', 'It needs more threads', 'It removes the need for a HashMap', 'It is O(log n)'], why: 'Each segment evicts its own oldest entry; global order is approximate.' },
          { q: 'synchronized vs ReentrantLock here: when pick ReentrantLock?', options: ['When you need tryLock with timeout, fairness or lock metrics', 'Always; synchronized is deprecated', 'When the method is static', 'When there is only one thread'], why: 'Both give mutual exclusion; ReentrantLock adds controls.' },
        ],
      };
    },
    (pick) => {
      const a = pick(['Asha', 'Rohan', 'Priya']);
      return {
        q: `${a} opens the app and wants to see exactly how much she owes each friend and each friend owes her, updated the moment an expense is added. Where should this data live?`,
        answer: 'Balance sheet with debt simplification',
        hint: 'A per-user, per-counterparty ledger.',
        steps: ['Pairwise amounts are needed instantly.', 'Keep Map<userId, Map<userId, Long>> updated on each expense.', 'Positive means owed to you, negative means you owe.', 'Net and simplify from the same sheet when settling.'],
        followups: [
          { q: 'Which Java call updates a pair’s balance atomically in a ConcurrentHashMap<String, Long>?', options: ['map.merge(key, delta, Long::sum)', 'map.put(key, map.get(key) + delta)', 'map.putIfAbsent(key, delta)', 'map.replace(key, delta)'], why: 'merge is atomic per key; get-then-put races.' },
        ],
      };
    },
    (pick) => {
      const n = pick([22, 25, 40]);
      return {
        q: `A ${n}-person office offsite group has 120 expenses. A teammate replaced the settle-up logic with a backtracking search for the exact minimum number of payments; it now takes minutes and the API times out. The PM still wants few transfers, returned in under a second.`,
        answer: 'Balance sheet with debt simplification',
        hint: 'Exact versus fast enough.',
        steps: ['Exact minimisation explores orderings, roughly factorial in the number of people; past ~20 it is unusable.', 'Compute nets from the balance sheets and drop users at zero.', 'Max-heap of creditors, min-heap of debtors: settle the biggest pair, push back the remainder.', 'O(n log n), at most n−1 transfers, accepted as good enough.'],
        followups: [
          { q: 'Asha and Ravi share one-to-one expenses, and so do Ravi and Meena, outside any group. Should simplify-debts tell Asha to pay Meena directly?', options: ['No; outside a group only net within each pair, since Asha and Meena may not know each other', 'Yes; fewer transfers always wins', 'Yes, but only above ₹500', 'Only if Ravi approves by default'], why: 'Rerouting money between strangers is a product problem; group simplification assumes members know each other.' },
          { q: 'GroupService does new InMemoryGroupRepository() today, and MySQL is coming. Cleanest change?', options: ['Depend on a GroupRepository interface injected via the constructor', 'Add if (useSql) branches inside GroupService', 'Make InMemoryGroupRepository extend a SQL class', 'Make the repository a static Singleton'], why: 'Dependency inversion lets you swap the storage without editing the service.' },
        ],
      };
    },
  ],
});
