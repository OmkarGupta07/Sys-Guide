SG.add({
  id: 'geo-text',
  ref: 'G6 G7 G8',
  section: 'Distributed systems',
  title: 'Geohash, quadtree, trie and inverted index',
  short: 'Geo and text indexes',
  blurb: 'Specialised indexes for “near me”, “starts with”, and “contains this word”.',
  intro: 'A normal B-tree sorts one dimension. “Drivers within 2 km” needs 2D closeness; “suggestions as I type” needs prefixes; “posts containing cricket” needs word lookup. Each has a classic structure, and production systems mostly reuse sorted indexes by encoding the problem cleverly.',
  options: {
    'Geohash / H3 cells': {
      eli5: 'Cutting a map into lettered squares, then each square into smaller lettered squares. Two places with the same first few letters are usually close together.',
      industry: [
        'Redis GEO commands store a geohash integer in a sorted set.',
        'Uber’s H3 hexagons (open-sourced 2018) for dispatch and surge pricing.',
        'Google S2 cells power MongoDB’s 2dsphere index.',
      ],
      def: 'Encode latitude/longitude into a single hierarchical key (geohash string/integer, S2 or H3 cell ID) so nearby points share prefixes and a normal sorted index can range-scan them. Longer keys = smaller cells. Query the target cell plus its neighbours, then filter by exact distance.',
      scenarios: [
        'Points that move constantly (drivers, delivery partners)',
        'Very high write rates: a move is just a new integer key',
        '“Nearby” queries on any database with a sorted index',
      ],
      scale: 'Cheap writes and simple storage. Boundary effects mean always querying neighbouring cells; best for points, not complex shapes.',
    },
    'Quadtree / R-tree': {
      eli5: 'Splitting a map into four, and splitting any crowded part into four again, until every box has only a few shops. Dense cities get many tiny boxes; empty deserts stay as one big box.',
      industry: [
        'R-trees in PostGIS and SQLite for shapes like delivery zones and roads.',
        'Quadtrees in map tile systems and game collision detection.',
        'Yelp-style “restaurants in this area” with mostly static places.',
      ],
      def: 'Custom spatial trees. Quadtrees recursively split space into four cells, adapting to density (great in memory). R-trees group objects by bounding rectangles in a balanced, disk-friendly tree, and handle polygons and lines (“which zone contains this address?”).',
      scenarios: [
        'Shapes and polygons: delivery zones, regions, routes',
        'Mostly static points with uneven density',
        'In-memory spatial lookups (games, maps)',
      ],
      scale: 'Exact geometry, but updates are costlier; not ideal for millions of constantly moving points.',
    },
    'Trie': {
      eli5: 'A dictionary arranged as a branching path: c → ca → cat. Typing letters walks down the path, and everything below your position starts with what you typed.',
      industry: [
        'Typeahead/autocomplete: Google search suggestions.',
        'Phone contact search and IDE code completion.',
        'IP routing tables (longest prefix match).',
      ],
      def: 'A tree where each edge is a character; a node represents a prefix. Lookup is O(length of prefix). For autocomplete, store the top-K popular completions at each node so suggestions return instantly.',
      scenarios: [
        'Prefix search: suggestions as the user types',
        'Longest-prefix matching',
        'Dictionary/spell-check lookups',
      ],
      scale: 'Memory-hungry for big vocabularies; precompute top-K per node offline and shard by prefix.',
    },
    'Inverted index': {
      eli5: 'The index at the back of a book: “cricket → pages 12, 45, 210”. To find every page mentioning cricket, you don’t read the book; you look up one word.',
      industry: [
        'Elasticsearch, Solr and Lucene.',
        'Twitter/LinkedIn search across posts.',
        'Log search in the ELK stack.',
      ],
      def: 'A map from each term to the list of documents (and positions) containing it. Text is tokenised and normalised (lower-case, stemming) before indexing. Queries intersect/union posting lists and rank results (e.g. BM25).',
      scenarios: [
        'Full-text search: “find documents containing these words”',
        'Search with ranking, typos and filters',
        'Log and event search',
      ],
      scale: 'Shard by document; writes are batched into segments. Usually a secondary index synced from the main database.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick(['1M', '3M']);
      const s = pick([3, 4, 5]);
      return {
        q: `${n} drivers report their location every ${s} seconds. Riders need the nearest drivers within 2 km instantly. Writes are huge and constant.`,
        answer: 'Geohash / H3 cells',
        hint: 'Points, constant movement, very high writes.',
        steps: ['Points only, moving constantly.', 'Each update must be cheap.', 'Encode location as a cell ID in a sorted index; query cell + neighbours.', 'Geohash / H3.'],
        followups: [
          { q: 'A rider stands right on a cell boundary and misses a driver 10 m away. Fix?', options: ['Query the rider’s cell plus its neighbouring cells, then filter by exact distance', 'Use longer geohashes', 'Ignore it', 'Move the rider'], why: 'Boundary effects are the standard geohash follow-up.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['which delivery zone contains this address', 'whether a route crosses a restricted area', 'which city ward a complaint location falls in']);
      return {
        q: `You must answer ${what}. Zones are complex polygons that change rarely, and answers must be geometrically exact.`,
        answer: 'Quadtree / R-tree',
        hint: 'Shapes, not points.',
        steps: ['Polygons and lines, exact containment.', 'Rarely updated.', 'R-tree spatial index (PostGIS).', 'Quadtree / R-tree.'],
        followups: [
          { q: 'Why not use an R-tree for 3M moving drivers?', options: ['Frequent updates are costly for spatial trees; encoded cell keys handle heavy writes better', 'R-trees can’t store points', 'R-trees are inaccurate', 'No reason'], why: 'Shapes → trees; moving points at scale → encoded keys.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['Google-style search suggestions', 'product name autocomplete', 'contact name search on a phone']);
      return {
        q: `Build ${what}: as each letter is typed, show the top 5 completions starting with that prefix in under 50 ms.`,
        answer: 'Trie',
        hint: 'Everything starting with a prefix.',
        steps: ['Prefix lookups on every keystroke.', 'A trie walks the prefix in O(length).', 'Store top-K completions at each node.', 'Trie.'],
        followups: [
          { q: 'How do you keep the trie fast for billions of searches?', options: ['Precompute top-K per prefix offline (batch job) and serve from memory/cache', 'Compute rankings live on every keystroke', 'Store it only on disk', 'Use a relational LIKE query'], why: 'Typeahead is read-heavy; do the heavy ranking work offline.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['500M', '2B']);
      return {
        q: `Users must search ${n} posts by any words they contain, with results ranked by relevance, in under 200 ms.`,
        answer: 'Inverted index',
        hint: 'Word → documents.',
        steps: ['Full-text lookup by words.', 'Scanning documents is impossible at this size.', 'Map terms to posting lists; rank results.', 'Inverted index (Elasticsearch/Lucene).'],
        followups: [
          { q: 'Why lower-case and stem words (“running” → “run”) before indexing?', options: ['So different forms of a word match the same posting list', 'To save CPU only', 'It’s required by HTTP', 'To encrypt text'], why: 'Text analysis decides what “matches” means.' },
        ],
      };
    },
    () => ({
      q: 'A restaurant-discovery app lists about 2 million restaurants that almost never move. Density varies hugely: thousands in central Mumbai, few in rural areas. Queries are “restaurants in this map area”.',
      answer: 'Quadtree / R-tree',
      hint: 'Static points with very uneven density.',
      steps: ['Points rarely change.', 'Density is very uneven.', 'A quadtree adapts cell size to density (fits in memory at this size).', 'Quadtree.'],
      followups: [
        { q: 'Same app, but now it tracks 1M delivery riders moving every 5 seconds. Which choice changes?', options: ['Use encoded cell keys (geohash/H3) for the moving riders; keep the tree for static restaurants', 'Rebuild the quadtree every 5 seconds', 'Put riders in a trie', 'Use an inverted index'], why: 'Different data, different index: static vs moving.' },
      ],
    }),
  ],
});
