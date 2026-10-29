SG.add({
  id: 'scaling',
  ref: 'Q1, Q2, Q3, Q4, D1, E8, F10, F12',
  section: 'Scaling',
  title: 'What do you add next?',
  short: 'Scaling bottlenecks',
  blurb: 'Read the symptom, find the bottleneck, add the one piece that fixes it.',
  intro: 'Scaling isn’t adding everything at once. Each component fixes one specific bottleneck. Learn to match the symptom to the fix, and to say why you didn’t add the others yet.',
  options: {
    'CDN': {
      eli5: 'Instead of every kid walking to the one big library in Delhi, put copies of the popular books in every neighbourhood.',
      industry: [
        'Netflix, Hotstar and YouTube serve video from edge servers near viewers.',
        'Every large site serves JS, CSS and images from Cloudflare, Akamai or CloudFront.',
        'Software downloads and app updates.',
      ],
      def: 'A geographically distributed network of edge servers that caches static (and some dynamic) content close to users, cutting latency and offloading the origin.',
      scenarios: [
        'Users far from your servers see slow page or image loads',
        'Static assets dominate bandwidth',
        'Traffic spikes for the same content (launch, live event)',
      ],
      scale: 'Worth it from the first 1K users if you serve images or video: free tiers exist. Version asset URLs so updates don’t need cache invalidation.',
    },
    'Load balancer + more servers': {
      eli5: 'One cashier has a long queue. Open more counters, and put someone at the door pointing each customer to a free counter.',
      industry: [
        'AWS ALB/NLB, Nginx or HAProxy in front of nearly every web service.',
        'Zero-downtime deploys: take servers out one at a time behind the LB.',
        'Health checks remove a crashed server automatically.',
      ],
      def: 'Run several stateless app servers and distribute requests among them with a load balancer (L4 or L7). Adds capacity and removes the single point of failure.',
      scenarios: [
        'App servers are CPU or memory bound, while the database is fine',
        'One server is a single point of failure',
        'You need deploys without downtime',
      ],
      scale: 'Typical step around 10K–100K users. Requires stateless servers: move sessions to Redis or JWTs first.',
    },
    'Cache': {
      eli5: 'Keep the answers to the most-asked questions on a sticky note on your desk, instead of going to the library each time.',
      industry: [
        'Redis or Memcached in front of the database for hot products, profiles and feeds.',
        'Facebook and Twitter serve most reads from cache clusters.',
        'Caching expensive computed results such as recommendations.',
      ],
      def: 'An in-memory store holding frequently read data so most reads skip the database. Effective when a small set of keys gets most of the traffic.',
      scenarios: [
        'The database is busy with the same reads over and over',
        'A hot 1–20% of data gets most of the traffic',
        'Brief staleness is acceptable',
      ],
      scale: 'Usually the first and cheapest fix for read load, from ~10K users on. A high hit rate (>90%) can cut database reads 10x.',
    },
    'Read replicas': {
      eli5: 'The head chef writes the recipes. Photocopies go to several assistant chefs, so many people can read recipes at once without bothering the head chef.',
      industry: [
        'AWS RDS/Aurora read replicas for reporting and read-heavy APIs.',
        'Analytics and admin dashboards run on a replica, away from production writes.',
        'GitHub and Shopify route many read queries to replicas.',
      ],
      def: 'Copies of the primary database that receive changes asynchronously and serve read queries. Writes still go to the primary.',
      scenarios: [
        'Read load is high and varied, so a cache hit rate stays low',
        'Heavy reports slow down production',
        'Writes are fine; reads are the bottleneck',
      ],
      scale: 'Common at ~100K+ users. Replication lag means reads can be slightly stale: route read-your-own-writes to the primary.',
    },
    'Sharding': {
      eli5: 'One phone book is too heavy to carry, so split it: A–H in one book, I–P in another, Q–Z in a third. Each book is small and fast.',
      industry: [
        'Instagram sharded PostgreSQL by user ID.',
        'Discord, Uber and Pinterest shard data across many database nodes.',
        'Vitess (YouTube) and Citus shard MySQL and PostgreSQL.',
      ],
      def: 'Split one dataset across multiple independent databases by a shard key (hash, range, or directory). Each shard holds a subset and takes a subset of the writes.',
      scenarios: [
        'The single primary can’t keep up with writes',
        'Data no longer fits comfortably on one machine',
        'You’ve already used caching and replicas',
      ],
      scale: 'A late step (often 1M+ users or heavy writes). Costly: cross-shard queries, resharding, hot shards. Exhaust simpler options first.',
    },
    'Message queue': {
      eli5: 'A restaurant takes your order and gives you a token immediately. The kitchen works through orders at its own pace; you don’t stand at the counter waiting.',
      industry: [
        'Checkout returns instantly while emails, invoices and analytics happen asynchronously.',
        'Uploads queue transcoding jobs for worker fleets.',
        'Spike buffering during flash sales.',
      ],
      def: 'Put slow or non-critical work on a queue (SQS, RabbitMQ, Kafka) and process it with background workers. Decouples request latency from downstream work and absorbs spikes.',
      scenarios: [
        'An API is slow because it does side tasks synchronously',
        'Traffic spikes overwhelm a downstream service',
        'Work can finish a few seconds later without the user waiting',
      ],
      scale: 'Useful at any stage once there’s slow side work. Brings retries, idempotency and monitoring of queue depth with it.',
    },
  },
  scenarios: [
    (pick) => {
      const far = pick(['Europe', 'the US', 'Australia']);
      const pct = pick([60, 70, 80]);
      return {
        q: `Your servers are in Mumbai. Users in ${far} complain pages take 6+ seconds to load. Images, JS and CSS are ${pct}% of the bytes sent. Server CPU and the database are fine.`,
        answer: 'CDN',
        hint: 'Is the problem compute, or distance?',
        steps: [
          'Servers and database are healthy, so it’s not capacity.',
          `Users are far away, and ${pct}% of bytes are static.`,
          'Serving static files from an edge near users fixes latency.',
          'Add a CDN.',
        ],
        followups: [
          { q: 'You changed the logo but users still see the old one. Best fix?', options: ['Versioned file names (logo.v2.png or a content hash) so the new URL bypasses old caches', 'Turn the CDN off', 'Ask users to clear their cache', 'Set TTL to 0 forever'], why: 'Versioned URLs make invalidation unnecessary and keep long TTLs safe.' },
        ],
      };
    },
    (pick) => {
      const users = pick(['20K', '40K', '60K']);
      return {
        q: `With ${users} users, your single app server hits 95% CPU at peak, and every deploy means a few minutes of downtime. Database CPU is at 25%.`,
        answer: 'Load balancer + more servers',
        hint: 'Which machine is hot, and what else hurts?',
        steps: [
          'The app server is the bottleneck, not the database.',
          'One server is also a single point of failure and makes deploys painful.',
          'Several stateless servers behind a load balancer add capacity and enable rolling deploys.',
          'Add a load balancer and more app servers.',
        ],
        followups: [
          { q: 'Users get logged out randomly after you add servers. Why?', options: ['Sessions were stored in one server’s memory; move them to Redis or use stateless tokens', 'The load balancer is broken', 'Cookies don’t work with load balancers', 'The database dropped sessions'], why: 'Horizontal scaling needs stateless app servers. Sticky sessions are a workaround, not a fix.' },
        ],
      };
    },
    (pick) => {
      const pct = pick([1, 2, 5]);
      const what = pick(['product pages', 'restaurant menus', 'celebrity profiles']);
      return {
        q: `Database CPU is at 90%. Logs show the top ${pct}% of ${what} receive 80% of all queries, the same rows read thousands of times a minute. Writes are low.`,
        answer: 'Cache',
        hint: 'The same rows, read over and over.',
        steps: [
          'Read-heavy, write-light.',
          'A tiny hot set gets most of the traffic: ideal hit rate.',
          'Serving those from memory removes most database load cheaply.',
          'Add a cache (Redis, cache-aside).',
        ],
        followups: [
          { q: 'Why a cache rather than read replicas here?', options: ['The hot set is tiny and repetitive, so a cache serves it from memory far cheaper and faster than more database copies', 'Replicas can’t serve reads', 'Caches never go stale', 'Replicas need sharding first'], why: 'Replicas scale varied reads; caches crush repetitive reads. Match the tool to the read pattern.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['admin reports', 'search listing pages with many filter combinations', 'analytics dashboards']);
      return {
        q: `The primary database is overloaded by reads from ${what}. Queries vary so much that a cache hit rate stays under 20%. Write volume is comfortably handled.`,
        answer: 'Read replicas',
        hint: 'Reads are the problem, but they don’t repeat.',
        steps: [
          'Reads are the bottleneck; writes are fine.',
          'Low cache hit rate: queries are too varied to cache.',
          'Copies of the database can serve these reads.',
          'Add read replicas.',
        ],
        followups: [
          { q: 'A user updates their profile and the next page shows the old data. Why?', options: ['Replication lag: route that user’s reads to the primary right after a write (read-your-writes)', 'The write failed', 'The cache is broken', 'The load balancer reordered the requests'], why: 'Async replicas lag behind. Interviewers expect you to name this and its fix.' },
        ],
      };
    },
    (pick) => {
      const w = pick(['30K', '50K', '80K']);
      const tb = pick([6, 10, 15]);
      return {
        q: `Your single primary database is maxed out at ${w} writes/s. You already have caching and read replicas. Data is ${tb} TB and growing 1 TB a month.`,
        answer: 'Sharding',
        hint: 'Caches and replicas help reads. What helps writes?',
        steps: [
          'The bottleneck is writes on one primary.',
          'Caches and replicas only offload reads.',
          `Data size (${tb} TB, growing) also strains one machine.`,
          'Shard: split the data so each primary takes a slice of the writes.',
        ],
        followups: [
          { q: 'What makes a good shard key?', options: ['High cardinality, spreads writes evenly, and matches the main query (e.g. user_id), so most queries hit one shard', 'Creation date', 'Country', 'A boolean like is_active'], why: 'A bad key creates hot shards or forces cross-shard queries on every request.' },
        ],
      };
    },
    (pick) => {
      const ms = pick([1800, 2500, 3000]);
      return {
        q: `Checkout takes ${ms} ms. Profiling shows 200 ms for the order write; the rest is sending email, generating a PDF invoice and updating analytics, all synchronous.`,
        answer: 'Message queue',
        hint: 'Does the user need to wait for all of that?',
        steps: [
          'The core write is fast.',
          'Side tasks don’t need to finish before responding.',
          'Put them on a queue; workers process them asynchronously.',
          'Add a message queue. Checkout drops to ~200 ms.',
        ],
        followups: [
          { q: 'The email worker retries and the customer gets two emails. Fix?', options: ['Make the consumer idempotent: record processed message IDs and skip duplicates', 'Turn off retries', 'Use a faster queue', 'Send emails synchronously again'], why: 'Queues deliver at least once. Consumers must tolerate duplicates.' },
        ],
      };
    },
  ],
});
