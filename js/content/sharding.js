SG.add({
  id: 'sharding',
  ref: 'F10 F11 F15',
  section: 'Data and storage',
  title: 'Sharding and partitioning',
  short: 'Sharding',
  blurb: 'How to split data across machines by range, hash, lookup or location, and what each one breaks.',
  intro: 'Sharding splits one dataset across many databases so each holds and serves a slice. The shard key decides everything: even load, which queries stay on one shard, and how painful resharding will be.',
  options: {
    'Range sharding': {
      eli5: 'Splitting a phone book into volumes: A–F, G–M, N–S, T–Z. Easy to find a range of names, but the “S” volume may be far thicker than “X”.',
      industry: [
        'HBase and Bigtable split tables into key ranges (regions/tablets).',
        'Time-based partitions: one table per month for logs or orders.',
        'MongoDB ranged shard keys.',
      ],
      def: 'Each shard owns a contiguous range of the key (dates, IDs, names). Range queries hit few shards, but sequential or popular keys create hot shards.',
      scenarios: [
        'Queries scan ranges (time windows, alphabetical ranges)',
        'Time-series data partitioned by month or day',
        'Archiving old ranges cheaply',
      ],
      scale: 'Watch for hot spots: all new writes with increasing keys (timestamps) land on the last shard.',
    },
    'Hash sharding': {
      eli5: 'Dealing students into 4 classrooms by a scrambled number from their roll number. Classrooms fill evenly, but finding “roll numbers 100 to 200” means visiting every room.',
      industry: [
        'Cassandra and DynamoDB hash the partition key.',
        'Instagram sharded PostgreSQL by a hash of user ID.',
        'Redis Cluster maps keys to 16,384 hash slots.',
      ],
      def: 'A hash of the shard key picks the shard. Spreads keys and load evenly; range queries must ask every shard. Consistent hashing reduces data movement when shards change.',
      scenarios: [
        'Even write distribution is the priority',
        'Access is mostly by exact key (user_id, order_id)',
        'Avoiding hot spots from sequential keys',
      ],
      scale: 'Even load, but cross-shard queries (ranges, joins, global sorting) become scatter-gather.',
    },
    'Directory-based': {
      eli5: 'A school office register saying which classroom each student is in. Flexible: move a student and just update the register. But everyone must check the register first.',
      industry: [
        'Multi-tenant SaaS: a lookup table maps each tenant to a database.',
        'Big customers moved to their own dedicated shard.',
        'Vitess and similar systems keep a mapping service.',
      ],
      def: 'A lookup service maps each key (or tenant) to its shard. Any placement is possible and keys can move individually, but the directory is an extra hop and a critical dependency.',
      scenarios: [
        'Tenants of very different sizes need custom placement',
        'Moving individual heavy customers without resharding everyone',
        'Placement rules that hash or ranges can’t express',
      ],
      scale: 'Cache the directory aggressively and make it highly available; it’s on every request path.',
    },
    'Geo sharding': {
      eli5: 'Each state keeps its own residents’ records in its own office. Local lookups are fast and the records stay within the state.',
      industry: [
        'Uber and food delivery apps partition by city or region.',
        'Data residency laws (GDPR, India’s rules) keep users’ data in-country.',
        'Multi-region SaaS deploys a stack per region.',
      ],
      def: 'Partition data by geography (country, region, city). Keeps data near users and helps with legal data residency; cross-region queries and users who travel need care.',
      scenarios: [
        'Data residency requirements',
        'Most queries are local (city-level matching, local search)',
        'Low latency for users in different regions',
      ],
      scale: 'Regions differ hugely in size, so big regions may need further sharding inside.',
    },
  },
  scenarios: [
    (pick) => {
      const what = pick(['logs', 'IoT readings', 'order history']);
      return {
        q: `A system stores ${what}. Almost every query is “give me data between date X and date Y”, and data older than 2 years is archived monthly.`,
        answer: 'Range sharding',
        hint: 'The queries are ranges over time.',
        steps: ['Queries scan time ranges.', 'Archiving whole months is easy if months are partitions.', 'Partition by time range.', 'Range sharding.'],
        followups: [
          { q: 'What’s the risk with pure time-based ranges?', options: ['All new writes hit the newest partition: a write hot spot', 'Range queries get slower', 'Old data can’t be read', 'None'], why: 'Monotonically increasing keys concentrate writes. Combine with a hash prefix if write load is high.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['50K', '100K', '200K']);
      return {
        q: `A social app does ${n} writes/s keyed by user_id. Access is almost always “this user’s data”. One shard must not get more load than others.`,
        answer: 'Hash sharding',
        hint: 'Exact-key access, even load wanted.',
        steps: ['Access by exact user_id.', 'Even spread across shards is the priority.', 'hash(user_id) picks the shard.', 'Hash sharding.'],
        followups: [
          { q: 'You add a 5th shard. With hash(user_id) % N, how many users move?', options: ['About 80%: almost everyone; consistent hashing would move only ~20%', 'About 20%', 'None', 'Exactly one'], why: 'Modulo hashing reshuffles most keys when N changes. Consistent hashing is tomorrow’s lesson.' },
        ],
      };
    },
    (pick) => {
      const big = pick(['one enterprise tenant with 40% of all data', 'three huge customers and 10,000 tiny ones', 'a government client that must be isolated']);
      return {
        q: `A B2B SaaS has ${big}. You need to place specific tenants on their own databases and move them without touching others.`,
        answer: 'Directory-based',
        hint: 'Placement is a per-tenant decision.',
        steps: ['Tenants differ wildly in size and needs.', 'Placement must be chosen per tenant.', 'A lookup table maps tenant → shard; move one by updating it.', 'Directory-based sharding.'],
        followups: [
          { q: 'The directory service goes down. What happens?', options: ['Nothing can find its shard, so the whole system stops; replicate it and cache lookups', 'Only writes stop', 'Nothing, it’s optional', 'Shards pick themselves'], why: 'The directory is a single point of failure unless made highly available.' },
        ],
      };
    },
    (pick) => {
      const c = pick(['European users under GDPR', 'Indian users’ payment data', 'users in 30 countries with local laws']);
      return {
        q: `Regulations require that ${c} stay stored in their own region. Most requests only touch the user’s own region.`,
        answer: 'Geo sharding',
        hint: 'Where the data physically lives is a legal requirement.',
        steps: ['Data residency is mandatory.', 'Requests are mostly local.', 'Partition by region.', 'Geo sharding.'],
        followups: [
          { q: 'A user moves from Germany to India. What must happen?', options: ['A controlled migration of their data between regional shards (and legal review)', 'Nothing', 'Duplicate their data in both regions automatically', 'Delete their account'], why: 'Geo sharding needs a plan for users who change region.' },
        ],
      };
    },
    (pick) => {
      const c = pick(['city', 'zone']);
      return {
        q: `A ride-hailing app matches riders and drivers who are always in the same ${c}. Each ${c}’s data is read and written by nearby users, and latency must be low.`,
        answer: 'Geo sharding',
        hint: 'Who talks to whom, and where are they?',
        steps: [`Matching happens within a ${c}.`, 'Queries are local.', `Partition by ${c}/region, close to users.`, 'Geo sharding.'],
        followups: [
          { q: 'Mumbai has 20x the traffic of a small city. Problem?', options: ['Mumbai’s shard becomes hot; split it further (by geohash cell or sub-zone)', 'No problem', 'Merge all cities', 'Rate-limit Mumbai'], why: 'Uneven geography is the classic weakness of geo sharding.' },
        ],
      };
    },
  ],
});
