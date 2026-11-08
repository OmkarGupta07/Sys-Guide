SG.add({
  id: 'case-typeahead',
  ref: 'S8 S18',
  section: 'HLD case studies',
  title: 'Design typeahead and search',
  short: 'Typeahead + search',
  blurb: 'Keyword search over billions of posts, fresh within a minute, plus suggestions on every keystroke.',
  intro: 'Two related products. Post search: find posts by keyword, sorted by recency or popularity, with new posts searchable within about a minute and median latency under ~500 ms. Typeahead: suggest the top 5–10 completions for a prefix on every keystroke, within ~100 ms. Both are built on precomputed indexes, because scanning text at query time is hopeless at petabyte scale. Search uses an inverted index (term → post IDs), partitioned by document so writes stay cheap, and fed asynchronously from a Kafka stream of posts and likes. Typeahead uses a trie whose nodes already hold their top-K completions, built offline from query logs. Caching repeated queries is what makes the read path cheap enough to run.',
  options: {
    'Document-partitioned inverted index': {
      eli5: 'Every library branch keeps its own index cards for only the books on its shelves. To find “cricket”, you phone every branch, and each one answers from its own small card box.',
      industry: [
        'Elasticsearch/Lucene: documents routed to shards by hash of ID, every query fanned out to all shards and merged.',
        'Twitter’s Earlybird search clusters, partitioned by tweet and by time slices so recent tweets live on small, fast indexes.',
        'Log platforms that create one index per day so most queries touch only recent indexes.',
      ],
      def: 'An inverted index maps each term to the list of documents that contain it, so a keyword lookup is a direct read instead of a text scan. Partitioning by document (hash of post ID) means a new post updates only one shard; partitioning by term would send one post to hundreds of shards and create hot shards for common words. The cost is scatter-gather: every query hits every shard, so latency follows the slowest one; set a query timeout and return partial results, which search users accept. Add read replicas for query volume.',
      scenarios: [
        'Keyword search over billions of posts with tens of thousands of writes per second',
        'Some words appear in a huge fraction of all posts',
        'Partial results are acceptable if one shard is slow',
      ],
      scale: '500M–1B posts/day × 1 KB ≈ 0.5–1 TB/day, petabytes over a decade, so tens to hundreds of shards. Drop old, unpopular posts from the hot index to keep shards small.',
    },
    'Trie with precomputed top-K per prefix': {
      eli5: 'At a sweet shop, the owner has a little board at each counter section: “top 5 sweets starting with ‘ras’ ”. He doesn’t count sales while you wait; the board was updated last night.',
      industry: [
        'Search-box suggestions (Google, Amazon, Flipkart) served from in-memory prefix structures holding the top completions.',
        'Offline Spark/MapReduce jobs aggregating query logs hourly or daily into ranked suggestion lists.',
        'Browser and CDN caching of prefix responses, plus client debouncing of ~100–200 ms between keystrokes.',
      ],
      def: 'Store every popular query in a trie, and at each node keep the top K (5–10) completions under that prefix, ranked by frequency with recency decay. A lookup is then “walk the prefix, return the stored list”, with no subtree traversal at query time. The trie is rebuilt or updated in batch from aggregated query logs, served from memory, replicated for reads and sharded by prefix range when it outgrows one machine.',
      scenarios: [
        'Suggestions must appear within ~100 ms on every keystroke',
        'Ranking is by how often people searched, not by live document matching',
        'A small staleness window (minutes to a day) for new suggestions is acceptable',
      ],
      scale: 'Keep only queries above a frequency threshold: ~100M distinct queries × ~30 bytes plus top-10 lists fits in tens of GB, so a handful of replicated shards. Keystrokes multiply read QPS 5–10× over searches.',
    },
    'Kafka stream with idempotent bulk upserts': {
      eli5: 'Instead of every customer walking into the kitchen to hand in an order, orders are dropped in a box. The cooks pick up a stack every few seconds and cook them together.',
      industry: [
        'Post creation events on Kafka consumed by an indexer group that bulk-writes to Elasticsearch every few seconds.',
        'Change data capture from a like-count table into a second topic that refreshes popularity fields.',
        'Elasticsearch’s own guidance to batch writes with the _bulk API because indexing (parsing, tokenising) is expensive.',
      ],
      def: 'Write paths publish posts (and edits, deletes) to a durable log. Indexer consumers read it and send batched upserts keyed by post ID, so at-least-once delivery is fine: replaying a message rewrites the same document. Batching amortises the parsing and network cost of indexing; the queue absorbs bursts and lets the index scale independently of the post service. Freshness is the batching interval plus consumer lag, which you monitor against the NFR.',
      scenarios: [
        'New posts must be searchable within a minute, not instantly',
        'Indexing is expensive and arrives in bursts',
        'Consumers may crash and reprocess messages',
      ],
      scale: '~10K posts/s; with 2–5 s batches each indexer sends a few hundred-document bulk requests per second. Consumer lag is the freshness metric to alert on.',
    },
    'Milestone-batched popularity scores': {
      eli5: 'A school scoreboard isn’t repainted for every single run; it’s updated every over. The order of teams is still right, even if the exact number lags a little.',
      industry: [
        'Like counts aggregated in a stream job and pushed to the search index in batches, not per like.',
        'Writing a post’s like count to the index only when it crosses milestones (powers of 2 or 10), then re-ranking the top candidates with fresh counts.',
        'Separate sort orders per keyword: one by time, one by popularity (Redis list plus sorted set, or two Lucene sort fields).',
      ],
      def: 'Likes outnumber posts about 10:1, so updating the index on every like would dwarf post ingestion. Store an approximate popularity score in the index and update it in batches or only at milestones. At query time, pull ~2× the needed candidates by approximate score, fetch exact counts from the like service, and re-sort. Ordering stays roughly right while index writes drop by orders of magnitude.',
      scenarios: [
        'Results must be sortable by likes, and likes arrive at ~100K/s',
        'One viral post receives thousands of likes per second',
        'Exact counts matter only for the few results actually shown',
      ],
      scale: 'Milestone updates turn 1,000 likes into ~10 index writes. Batching over 30 s helps hot posts but barely helps the long tail of posts with one like a minute.',
    },
    'Query result cache + CDN': {
      eli5: 'During an India–Pakistan match, everyone at the paan shop asks “score kya hai?”. The shopkeeper writes it on a slate every minute instead of checking his phone for each person.',
      industry: [
        'Redis caching search result pages keyed by normalised query + sort + page, with a TTL below the freshness target.',
        'CDN caching of non-personalised search and typeahead responses using Cache-Control headers.',
        'Elasticsearch request and filter caches at the shard level for repeated queries.',
      ],
      def: 'Search traffic is skewed: a few queries (trending topics, a match, a film release) make up a large share of requests. Because results aren’t personalised and up to a minute of staleness is allowed, cache full result pages keyed by the normalised query and sort order, with a TTL under the freshness NFR. Putting the same responses on a CDN returns hits in tens of milliseconds and keeps the scatter-gather path for the long tail.',
      scenarios: [
        'A trending query is sent by tens of thousands of users per second',
        'Results are the same for everyone and may be ~1 minute stale',
        'The search cluster is sized for the long tail, not the peak',
      ],
      scale: 'Searches ~10K/s with 10× bursts. A 30–60 s TTL on hot queries can absorb most of a burst; personalised results break CDN caching.',
    },
  },
  scenarios: [
    (pick) => {
      const app = pick(['Twitter/X', 'Facebook', 'Instagram']);
      const posts = pick(['10,000', '6,000', '8,000']);
      return {
        q: `Interviewer: “Design keyword search for ${app} posts.” You estimate ${posts} new posts/s, ~100K likes/s and ~10K searches/s. You write NFRs: median query under 500 ms, high availability, eventual consistency, and “new posts searchable within 1 minute”. Which design decision is shaped most directly by that last NFR?`,
        answer: 'Kafka stream with idempotent bulk upserts',
        hint: 'One minute is a deadline for getting data into the index, not for answering a query.',
        steps: [
          'Freshness of 1 minute (not instant) means indexing can be asynchronous.',
          'That lets you buffer posts in a durable log and index in batches, which is far cheaper per post.',
          'Upserts keyed by post ID make replays safe, so at-least-once consumers are enough.',
          'Consumer lag plus batch interval must stay under 60 s: that is the metric tied to the NFR.',
        ],
        followups: [
          { q: 'Writes (posts + likes ≈ 110K/s) outnumber searches (≈ 10K/s). What does that tell you?', options: ['The system is write-heavy, so ingestion and index updates need as much design as the query path', 'Search systems are always read-heavy, so ignore writes', 'Use strong consistency for the index', 'Drop likes from the design'], why: 'Many candidates assume “search = read-heavy”; the estimate shows the opposite.' },
          { q: 'Consistency or availability for search results?', options: ['Availability: a post appearing 30 s late or a slightly stale count harms nobody', 'Strong consistency: every search must include the latest post', 'Neither matters', 'Consistency, because likes are money'], why: 'Search tolerates staleness and even partial results; payments don’t.' },
        ],
      };
    },
    (pick) => {
      const word = pick(['“the”', '“cricket”', '“love”']);
      return {
        q: `A teammate proposes partitioning the search index by term, so all post IDs for one word sit on one shard and a single-word query reads one node. In testing, each post update touches ~50–200 shards, the shard holding ${word} runs hot, and multi-word queries still fan out to several shards.`,
        answer: 'Document-partitioned inverted index',
        hint: 'Which layout makes each write touch exactly one place?',
        steps: [
          'Term partitioning optimises single-term reads but costs one write per distinct word.',
          'Popular words create shards much hotter than the rest.',
          'Partition by document ID hash instead: each post lands on one shard.',
          'Accept scatter-gather reads, bounded by a query timeout and partial results.',
        ],
        followups: [
          { q: 'With document partitioning, one slow shard delays every query. What is the standard mitigation?', options: ['A per-query timeout that returns results gathered so far, plus replicas', 'Wait for all shards always', 'Move to term partitioning', 'Put all data on one node'], why: 'Search users accept slightly incomplete results; bounded latency matters more.' },
          { q: 'How can you make “latest posts” queries fast without searching the whole history?', options: ['Time-based partitions: keep recent posts in a small, separate index', 'Bigger shards', 'A cron job that sorts the index', 'Term partitioning'], why: 'Most recency queries only need the last hours or days.' },
        ],
      };
    },
    (pick) => {
      const ms = pick(['100', '80', '150']);
      const shop = pick(['an e-commerce site', 'a food app', 'a travel site']);
      return {
        q: `For ${shop}, the search box must show the 8 most popular completions within ${ms} ms on every keystroke. The current version runs a prefix query against the product search cluster, sorts matches by count, and is too slow for short prefixes like “s” or “sa”.`,
        answer: 'Trie with precomputed top-K per prefix',
        hint: 'Short prefixes match millions of items. Don’t sort at query time.',
        steps: [
          'Short prefixes have enormous result sets, so ranking per request is slow.',
          'Suggestions rank by past query frequency, which can be computed offline.',
          'Store the top-K completions directly on each trie node.',
          'A lookup walks a few characters and returns a stored list from memory.',
        ],
        followups: [
          { q: 'How do you cut keystroke traffic before it reaches the servers?', options: ['Debounce on the client and cache prefix responses in the browser/CDN', 'Send every keystroke immediately', 'Use WebSockets for every user', 'Disable suggestions on mobile'], why: 'A 100–200 ms debounce plus caching removes a large share of requests.' },
          { q: 'Why keep only queries above a frequency threshold in the trie?', options: ['Rare queries bloat memory and would never reach a top-K list anyway', 'Rare queries are illegal', 'Tries can’t hold long strings', 'To make updates real-time'], why: 'The long tail costs memory without changing what users see.' },
        ],
      };
    },
    (pick) => {
      const event = pick(['a surprise film trailer', 'an election result', 'a cricketer’s retirement']);
      return {
        q: `After ${event}, a new phrase is searched millions of times within an hour, but your typeahead (trie rebuilt nightly from query logs) doesn’t suggest it until the next morning. Product wants trending queries to appear within ~15 minutes, without rebuilding the full trie that often.`,
        answer: 'Trie with precomputed top-K per prefix',
        hint: 'Keep the same structure; change how and how often it is fed.',
        steps: [
          'The full rebuild is expensive, so keep it for the long-term baseline.',
          'Aggregate recent query counts in short windows (stream job over a few minutes).',
          'Update top-K lists only on the affected prefix nodes, or merge a small “trending” trie at query time.',
          'Rank with recency decay so a burst can enter a top-K list quickly.',
        ],
        followups: [
          { q: 'How do you keep offensive or spam phrases out of suggestions after they trend?', options: ['Filter through a blocklist/moderation step before updating the trie', 'Let users report them later', 'Disable trending', 'Lower K to 1'], why: 'Suggestions are shown unprompted, so they need a filter on the update path.' },
        ],
      };
    },
    (pick) => {
      const rate = pick(['5,000', '12,000', '3,000']);
      return {
        q: `Results can be sorted by likes. Today every like (~100K/s overall, with one viral post getting ${rate} likes/s) triggers an update of that post’s document in the search index. Index write latency spikes, and the cluster spends more time re-indexing likes than indexing new posts.`,
        answer: 'Milestone-batched popularity scores',
        hint: 'The ranking needs the order to be roughly right, not every count to be exact.',
        steps: [
          'Per-like index updates multiply write load ~10× over post ingestion.',
          'Store an approximate score and update it in batches or at milestones (e.g. powers of 2).',
          'At query time, fetch ~2× candidates by approximate score and re-rank with exact counts.',
          'Index writes for likes drop by orders of magnitude.',
        ],
        followups: [
          { q: 'Why doesn’t simple 30-second batching help most posts?', options: ['Most posts get only a like a minute, so a batch usually holds one like', 'Batching is always slower', 'Kafka can’t batch', 'It loses likes'], why: 'Batching helps hot posts; milestones help the long tail too.' },
        ],
      };
    },
    (pick) => {
      const q = pick(['“IPL final”', '“budget 2026”', '“iPhone launch”']);
      const rps = pick(['40,000', '60,000', '25,000']);
      return {
        q: `During a big event the query ${q} arrives ${rps} times per second, all non-personalised. Each request fans out to 60 shards. The cluster CPU hits 95% and p99 latency crosses 3 seconds, even though most of these requests return the same results.`,
        answer: 'Query result cache + CDN',
        hint: 'Same question, same answer, staleness allowed.',
        steps: [
          'Identical, non-personalised queries are being recomputed on every shard.',
          'The freshness NFR allows results up to a minute old.',
          'Cache result pages keyed by normalised query + sort + page with a TTL under 60 s.',
          'Serve them from a CDN edge so hits never reach the cluster.',
        ],
        followups: [
          { q: 'What breaks CDN caching of search results?', options: ['Personalised or permission-filtered results', 'Using JSON', 'Sorting by recency', 'Long queries'], why: 'If results differ per user, a shared edge cache can leak or serve wrong data.' },
          { q: 'The hot cache entry expires and thousands of requests miss at once. Fix?', options: ['Request coalescing or stale-while-revalidate so one request refreshes it', 'Remove the TTL', 'Shorter TTL', 'Add more shards'], why: 'Prevent a stampede by letting one refresh run while others get the old value.' },
        ],
      };
    },
  ],
});
