SG.add({
  id: 'search',
  ref: 'R1 O20',
  section: 'Data and storage',
  title: 'Search systems and Elasticsearch',
  short: 'Search systems',
  blurb: 'Building search the way production systems do: a separate index, kept in sync, sharded and ranked.',
  intro: 'Search is almost always a secondary system: the database stays the source of truth, and a search engine (Elasticsearch/OpenSearch) holds an index built for text queries, filters and ranking. The design questions are how to sync it, how to scale it, and how to rank results.',
  options: {
    'Elasticsearch index': {
      eli5: 'A librarian who has read every book and keeps a perfect word index. Ask “books about cricket and India, newest first” and you get a ranked list in seconds.',
      industry: [
        'Product search at e-commerce sites; job search on job portals.',
        'AWS OpenSearch as a managed option.',
        'Log analytics with the ELK stack.',
      ],
      def: 'A distributed search engine built on Lucene inverted indexes. Supports full-text queries with relevance scoring (BM25), fuzzy matching for typos, filters, aggregations (facets) and geo queries. Near-real-time: new documents become searchable after a refresh (~1 second by default).',
      scenarios: [
        'Free-text search with ranking and typo tolerance',
        'Faceted filters (brand, price range, rating counts)',
        'Search and analytics over logs and events',
      ],
      scale: 'Not a primary database: weaker transactional guarantees, eventual visibility. Keep the truth elsewhere.',
    },
    'Sync via CDC / queue': {
      eli5: 'Whenever the main register changes, a clerk copies the change into the index book, a moment later, so the index never needs to be rebuilt by hand.',
      industry: [
        'Debezium streaming Postgres/MySQL changes to Kafka, consumed by an indexer.',
        'DynamoDB Streams → Lambda → OpenSearch.',
        'Periodic full reindexing to repair drift.',
      ],
      def: 'Keep the search index updated asynchronously from the source of truth: capture changes (CDC or domain events), push them through a queue, and have indexers update documents. Avoids dual writes from the app; results lag the database by seconds.',
      scenarios: [
        'Search must reflect database changes within seconds',
        'The app shouldn’t write to two systems',
        'Rebuilding or backfilling an index safely',
      ],
      scale: 'Make indexing idempotent (upsert by ID with version) so replays and duplicates are harmless.',
    },
    'Sharding and replicas': {
      eli5: 'Splitting a huge phone directory into volumes on different shelves so many people can search at once, and keeping copies of each volume in case one goes missing.',
      industry: [
        'Elasticsearch primary shards (split data) and replica shards (copies for reads and failover).',
        'Scatter-gather: a query fans out to all shards and results are merged.',
        'Time-based indexes for logs (one index per day).',
      ],
      def: 'An index is split into primary shards across nodes; each shard has replicas. Queries scatter to all shards and gather/merge top results; replicas add read throughput and fault tolerance. Shard count is fixed at index creation (changes need reindexing or splitting).',
      scenarios: [
        'Index too large for one node',
        'High query volume needs more read capacity',
        'Surviving node failures without losing search',
      ],
      scale: 'Too many tiny shards waste resources; too few huge shards limit parallelism. Size shards deliberately (tens of GB each is a common target).',
    },
    'Relevance ranking': {
      eli5: 'Two shops both sell “red shoes”. The one with “red shoes” in its name, lots of good reviews and fast delivery should appear first, not the one that mentions red once in small print.',
      industry: [
        'BM25 text scoring combined with business signals (sales, ratings) via function scores.',
        'Learning-to-rank models re-ranking the top results.',
        'Boosting fields: title matches count more than description matches.',
      ],
      def: 'Order results by usefulness: text relevance (term frequency, inverse document frequency, field boosts) combined with signals like popularity, freshness, personalization and distance. Often a cheap first-stage retrieval followed by a more expensive re-ranking of the top N.',
      scenarios: [
        'Results are “correct” but in a useless order',
        'Popular or fresh items should rank higher',
        'Personalized results per user',
      ],
      scale: 'Expensive ranking models run only on the top few hundred candidates.',
    },
  },
  scenarios: [
    (pick) => {
      const what = pick(['an electronics store', 'a job portal', 'a recipe site']);
      return {
        q: `Users of ${what} type queries like “wireles earbuds under 3000” and expect typo tolerance, filters for brand and price, and counts per brand. The SQL LIKE query takes 6 seconds.`,
        answer: 'Elasticsearch index',
        hint: 'Full text + fuzzy + facets.',
        steps: ['Free text with typos.', 'Filters and facet counts.', 'LIKE scans can’t do relevance or typos well.', 'A search engine index (Elasticsearch/OpenSearch).'],
        followups: [
          { q: 'Should Elasticsearch become the primary database for products?', options: ['No: keep the database as the source of truth and sync to the index', 'Yes, it’s faster', 'Yes, it has transactions', 'Only for prices'], why: 'Search engines are optimized for retrieval, not as systems of record.' },
        ],
      };
    },
    (pick) => {
      const db = pick(['PostgreSQL', 'MySQL']);
      return {
        q: `Products are written to ${db}. The app also writes to Elasticsearch, but when the second write fails the index silently goes stale. Search should reflect changes within a few seconds.`,
        answer: 'Sync via CDC / queue',
        hint: 'Stop dual writes; follow the source of truth.',
        steps: ['Dual writes partially fail.', 'Capture DB changes (CDC) into a queue.', 'Indexers upsert documents idempotently.', 'Sync via CDC / queue.'],
        followups: [
          { q: 'An old update arrives after a newer one. How does the indexer avoid overwriting new data?', options: ['Use document versions (external version from the DB) and ignore older ones', 'Process in random order', 'Delete and recreate the index', 'Nothing can be done'], why: 'Versioned upserts make out-of-order delivery safe.' },
        ],
      };
    },
    (pick) => {
      const tb = pick([3, 8]);
      return {
        q: `The search index has grown to ${tb} TB and query traffic tripled. A single node is overloaded and its failure would take search down.`,
        answer: 'Sharding and replicas',
        hint: 'Split the data and add copies.',
        steps: ['Too much data for one node.', 'Split into primary shards across nodes.', 'Add replicas for reads and failover.', 'Sharding and replicas.'],
        followups: [
          { q: 'What happens when a query hits a sharded index?', options: ['It scatters to every shard and the coordinating node merges the top results', 'Only one shard is queried', 'Shards are queried one by one until a match', 'The query fails'], why: 'Scatter-gather explains why tail latency of the slowest shard matters.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['“iphone case”', '“running shoes”', '“biryani”']);
      return {
        q: `Searching ${what} returns relevant items, but an obscure product with one sale ranks above bestsellers with thousands of 5-star reviews, and conversions are dropping.`,
        answer: 'Relevance ranking',
        hint: 'Results are right; the order is wrong.',
        steps: ['Text matching works.', 'Business signals aren’t considered.', 'Combine BM25 with popularity, ratings, freshness; re-rank the top N.', 'Relevance ranking.'],
        followups: [
          { q: 'Why re-rank only the top few hundred results with an ML model?', options: ['Expensive models are too slow to run on millions of candidates; a cheap first stage narrows them down', 'Models can’t rank more', 'To hide results', 'It’s required by Elasticsearch'], why: 'Two-stage retrieval keeps latency low.' },
        ],
      };
    },
    () => ({
      q: 'A product was just added in the admin panel, but searching for it returns nothing for about a second, then it appears. The team asks if Elasticsearch is broken.',
      answer: 'Elasticsearch index',
      hint: 'How quickly do new documents become searchable?',
      steps: ['Elasticsearch is near-real-time.', 'New documents become visible after the next refresh (~1 s by default).', 'Expected behaviour, not a bug.', 'Understanding the index.'],
      followups: [
        { q: 'The admin must see the new product immediately after saving. Simplest fix?', options: ['Show it from the database (or refresh=wait_for on that write) for the admin view', 'Set refresh to 1 ms for everything', 'Disable the index', 'Tell admins to wait'], why: 'Targeted read-your-writes beats making the whole cluster slower.' },
      ],
    }),
    () => ({
      q: 'A bookstore index maps “category” as a full-text field. Users clicking the “Fiction” filter also get Non-fiction books, and facet counts by category look wrong.',
      answer: 'Elasticsearch index',
      hint: 'How is the field mapped?',
      steps: ['Full-text (text) fields are analysed into tokens, so “non-fiction” contains “fiction”.', 'Filters and facets need exact values.', 'Map category as a keyword field (exact match, fast aggregations).', 'Fix the index mapping.'],
      followups: [
        { q: 'Users jump to page 500 of results and it’s very slow. Better pagination?', options: ['search_after with a sort key (optionally inside a point-in-time snapshot for consistent pages)', 'from=5000&size=10 always', 'Return all results at once', 'Disable sorting'], why: 'Deep from/size makes every shard collect and sort huge result windows.' },
        { q: 'A ticket system needs to block double-booking. Check seat availability in Elasticsearch?', options: ['No: it’s eventually consistent; do the check in a transactional database', 'Yes, it’s fast', 'Yes, with more replicas', 'Only on weekends'], why: 'Search indexes lag the source of truth.' },
      ],
    }),
    (pick) => {
      const n = pick(['20K', '50K']);
      return {
        q: `Every product document includes a live stock count, updated ${n} times per second. The search cluster spends most of its time merging segments, and search latency has doubled.`,
        answer: 'Sync via CDC / queue',
        hint: 'Elasticsearch is built for reads; look at what’s being written and how.',
        steps: ['Lucene segments are immutable: every update is a delete + new document.', 'Constant tiny updates cause heavy merging.', 'Keep volatile fields (stock) out of the index or batch them through the queue with bulk updates.', 'Fix the sync pipeline.'],
        followups: [
          { q: 'Why are Lucene segments immutable?', options: ['Immutability enables caching, compression and lock-free concurrent reads; updates become soft deletes plus new segments', 'To save disk', 'Because Java requires it', 'They aren’t'], why: 'It’s the core trade-off behind Elasticsearch’s read speed and write cost.' },
        ],
      };
    },
  ],
});
