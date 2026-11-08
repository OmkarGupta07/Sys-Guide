SG.add({
  id: 'case-typeahead',
  ref: 'S8 S18',
  section: 'HLD case studies',
  title: 'Design typeahead and search',
  short: 'Typeahead + search',
  blurb: 'Keyword search over trillions of posts, fresh within a minute, plus suggestions on every keystroke.',
  intro: 'Two related products. Post search: find posts by keyword, sorted by recency or likes, with search under 500 ms and new posts searchable within 1 minute; results are not personalised. Estimate before designing: 1B users posting once and liking ten times a day give ~10K posts/s and ~100K likes/s against ~10K searches/s, so the system is write-heavy, and ten years of posts is ~3.6 PB. Build an inverted index (keyword → post IDs) fed from the post DB by CDC and Kafka, and precompute one capped sorted list per keyword per sort order so a query never sorts millions of IDs. Then scale reads with caching bounded by the freshness NFR, writes with power-of-two like updates and keyword + mod-n sharding, and storage with hot/cold tiers. Typeahead is a separate structure: a trie whose nodes already hold their top-K completions, built from query logs.',
  options: {
    'Inverted index with sorted sets per sort order': {
      eli5: 'A library keeps two cards for every word: one listing books with that word from newest to oldest, one from most borrowed to least. To answer “cricket, newest first” the librarian just reads the top of one card.',
      industry: [
        'Lucene/Elasticsearch: term → postings list, the core of every search engine; scanning text with LIKE ‘%kw%’ is a full table scan.',
        'Redis sorted sets per keyword: time:cricket scored by created time and likes:cricket scored by likes, read with ZREVRANGE and trimmed to the top 1,000.',
        'Post DB → change data capture → Kafka → stateless ingestion workers that tokenise each post and update the lists, replaying from offsets after a crash.',
      ],
      def: 'An inverted index maps each keyword to the IDs of posts containing it, so a lookup is a direct read instead of a scan. Because results are sorted two ways, keep two lists per keyword, each already ordered by its score, and cap them (say the top 1,000) since nobody pages past that. Fetching millions of IDs and sorting at query time is what breaks: 10M IDs × 10 bytes is 100 MB per query. Ingestion is asynchronous: CDC from the post DB into Kafka, then workers tokenise and update the index, so posts land within the 1-minute bound and bursts are absorbed.',
      scenarios: [
        'Keyword search must return sorted results in under 500 ms',
        'Results can be sorted by recency or by likes',
        'Popular keywords match tens of millions of posts',
        'New posts must become searchable within a minute, not instantly',
      ],
      scale: '~10K posts/s × a few dozen keywords ≈ hundreds of thousands of list updates/s. Capping each list at 1,000 IDs bounds memory per keyword regardless of how common the word is.',
    },
    'Keyword + mod-n shards with hot/cold tiers': {
      eli5: 'If one counter at the railway station handles every ticket to Mumbai, its queue never ends. So the station opens four Mumbai counters, and a ticket goes to one of them by the last digit of your form number; rarely asked routes are handled from the back office.',
      industry: [
        'Redis Cluster with keys like cricket:3 (keyword plus postId mod n), so writes for one hot word spread over n nodes and reads gather and merge the n lists.',
        'A count-min sketch tracking how often each keyword is searched in a few MB of memory, to decide which lists stay in Redis.',
        'Rarely searched keywords’ lists moved to S3 and fetched on demand; multi-word phrases indexed as bigrams only when the sketch says they are searched often.',
      ],
      def: 'Sharding by keyword alone puts every write and read for a hot word on one node. Appending postId mod n to the key spreads a keyword over n shards; a query then reads n shards in parallel and merges, so n is a knob trading write spread against read fan-out (an Elasticsearch-style alternative is partitioning by document, where every query hits every shard). Storage is the other limit: most keywords are almost never searched, so estimate search counts with a count-min sketch (small memory, never undercounts) and move cold keywords to cheap blob storage, keeping memory for the hot head.',
      scenarios: [
        'One keyword’s shard is far hotter than the rest',
        'Writes for viral words must spread across machines',
        'The index outgrows memory and most keywords are rarely searched',
        'Deciding which phrases deserve their own index entries',
      ],
      scale: '1B posts/day × 365 × 10 years ≈ 3.6T posts × 1 KB ≈ 3.6 PB of post data, so the index stores only IDs, capped per keyword. Raising n from 1 to 8 cuts a hot key’s write load 8× but makes each read touch 8 shards.',
    },
    'Trie with precomputed top-K per prefix': {
      eli5: 'At a sweet shop, the owner has a little board at each counter section: “top 5 sweets starting with ‘ras’ ”. He doesn’t count sales while you wait; the board was updated last night.',
      industry: [
        'Search-box suggestions (Google, Amazon, Flipkart) served from in-memory prefix structures holding the top completions.',
        'Offline Spark jobs aggregating query logs hourly or daily into ranked suggestion lists, plus a streaming job for trending queries.',
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
    'Power-of-two like updates + re-rank': {
      eli5: 'A school scoreboard isn’t repainted for every run; the scorer only repaints when a team crosses 2, 4, 8, 16, 32… runs. The order of teams on the board is roughly right, and for the final top few you check the live score.',
      industry: [
        'Writing a post’s score to the likes index only when its like count crosses a power of two, so 1,000 likes cause ~10 index writes instead of 1,000.',
        'The search service fetching extra candidates from the approximate list, looking up live counts from the like service, and re-sorting before returning.',
        'Stream jobs (e.g. Flink with 30 s windows) batching likes, which helps viral posts but not the long tail.',
      ],
      def: 'Likes arrive ~10× faster than posts, so updating the index on every like would dwarf post ingestion. Store an approximate score (the last power of two crossed) and update it only when the count crosses the next one. An approximate score is off by at most 2×, so at query time read about twice the needed candidates, fetch exact counts and re-rank. Time batching alone fails because most posts get only a like now and then, so each batch holds one like; power-of-two buckets help every post.',
      scenarios: [
        'Results must be sortable by likes, and likes arrive at ~100K/s',
        'One viral post receives thousands of likes per second',
        'Exact counts matter only for the few results actually shown',
      ],
      scale: 'A post with L likes causes ~log2(L) index writes instead of L: 1M likes → ~20 writes. Re-ranking costs one batched count lookup for ~2× the page size.',
    },
    'Result cache (TTL ≤ freshness) + CDN': {
      eli5: 'During an India–Pakistan match, everyone at the paan shop asks “score kya hai?”. The shopkeeper writes it on a slate every minute instead of checking his phone for each person, because a minute-old score is fine.',
      industry: [
        'A CDN caching the search API with Cache-Control: max-age set under the freshness bound, possible only because results are not personalised.',
        'Redis caching result pages keyed by normalised query + sort + page, with the same TTL.',
        'A small in-process cache on each search node, so a hot query’s expiry causes at most one recompute per node instead of a stampede.',
      ],
      def: 'Search traffic is skewed: a few queries (a match, a film release) make up a large share of requests. Since results are the same for everyone and the NFR allows up to a minute of staleness, cache whole result pages. The freshness NFR sets the TTL: a new post must appear within 1 minute end to end, so ingestion lag plus TTL must stay under 60 s. The CDN is the cheapest layer, answering from the edge in tens of milliseconds; behind it, per-node in-process caches cap how many requests a single expiry can push to the index.',
      scenarios: [
        'A trending query is sent by tens of thousands of users per second',
        'Results are the same for everyone and may be ~1 minute stale',
        'The <500 ms latency NFR must hold during 10× bursts',
      ],
      scale: '~10K searches/s with 10× bursts. With ~20 s ingestion lag, a ~30–40 s TTL keeps the 1-minute bound; personalised results would break CDN caching entirely.',
    },
  },
  scenarios: [
    (pick) => {
      const app = pick(['Facebook', 'Instagram', 'LinkedIn']);
      const lag = pick([10, 20, 25]);
      return {
        q: `Interviewer: “Design keyword search for ${app} posts.” You estimate ~10K posts/s, ~100K likes/s and ~10K searches/s with 10× bursts during big events. NFRs: search under 500 ms, high availability, results not personalised, and “a new post is searchable within 1 minute”. Ingestion (CDC → Kafka → index) runs ~${lag} s behind. Which decision takes its key number directly from the freshness NFR and protects the 500 ms target during bursts?`,
        answer: 'Result cache (TTL ≤ freshness) + CDN',
        hint: 'One minute of allowed staleness is a budget. What else can spend it?',
        steps: [
          'Results are identical for everyone, so whole result pages can be cached and served from a CDN edge.',
          'A post must appear within 60 s end to end: ingestion lag + cache TTL ≤ 60 s.',
          `With ~${lag} s of lag, a TTL of about ${Math.floor((60 - lag) * 0.75)} s leaves a margin.`,
          'Bursts of repeated queries are absorbed at the edge, keeping the index under the 500 ms target.',
        ],
        followups: [
          { q: 'Writes (posts + likes ≈ 110K/s) outnumber searches (≈ 10K/s). What does that tell you?', options: ['The system is write-heavy, so ingestion and like updates need as much design as the query path', 'Search is always read-heavy, so ignore writes', 'Use strong consistency for the index', 'Drop likes from the design'], why: 'Many candidates assume “search = read-heavy”; the estimate says otherwise.' },
          { q: 'A hot query’s cache entry expires and every search node misses at once. Cheapest guard?', options: ['An in-process cache per node, so each node recomputes it at most once', 'Remove the TTL', 'Shorten the TTL', 'Add more index shards'], why: 'The stampede is capped at the number of nodes, not the number of users.' },
          { q: 'Consistency or availability for search results?', options: ['Availability, with eventual consistency bounded at 1 minute', 'Strong consistency: every search must include the latest post', 'Neither matters', 'Consistency, because likes are money'], why: 'A stated bound turns “eventually consistent” into a testable NFR.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['12 million', '40 million', '8 million']);
      return {
        q: `v1 search runs SELECT … WHERE text LIKE ‘%kw%’ on the posts table. After adding an index from word to post IDs it is still slow: for “cricket” it loads ${n} matching IDs, fetches their like counts and created times, and sorts them in the search service before returning 25 results.`,
        answer: 'Inverted index with sorted sets per sort order',
        hint: 'The sort is the expensive part. Do it before anyone asks.',
        steps: [
          'LIKE with a leading wildcard is a full scan; an inverted index fixes lookup, not ordering.',
          'Shipping millions of IDs (10M × 10 B ≈ 100 MB) per query and sorting them can’t meet 500 ms.',
          'Keep two lists per keyword, one scored by time and one by likes, maintained on write.',
          'Cap each at ~1,000 IDs; a query reads the top 25 directly.',
        ],
        followups: [
          { q: 'How does a new post get into these lists within the minute?', options: ['CDC from the post DB into Kafka, then ingestion workers tokenise and update each keyword’s lists', 'The post service writes every keyword list synchronously before replying', 'A nightly batch job', 'The search service scans new posts on each query'], why: 'Asynchronous ingestion absorbs bursts and can replay from offsets after a crash.' },
          { q: 'How do you answer the phrase “Taylor Swift”?', options: ['Intersect both words’ lists and check adjacency, or index the bigram if it is searched often enough', 'Index every possible pair of words', 'Search only for “Taylor”', 'Use LIKE for multi-word queries'], why: 'Bigrams for every pair explode storage; index only frequently searched ones.' },
        ],
      };
    },
    (pick) => {
      const word = pick(['“IPL”', '“election”', '“Diwali”']);
      return {
        q: `Your Redis cluster shards the index by keyword. During a big day, ${word} appears in a large share of new posts and searches: the one node holding it hits 100% CPU on ZADDs while the rest of the cluster idles, and its search latency crosses 2 s.`,
        answer: 'Keyword + mod-n shards with hot/cold tiers',
        hint: 'Split one key into several without losing the ability to read it.',
        steps: [
          'Keyword-only sharding puts every write and read for a hot word on one node.',
          'Key each list by keyword plus postId mod n, so writes spread across n shards.',
          'A query reads the n sub-lists in parallel and merges the top results.',
          'Tune n: higher spreads writes more but adds read fan-out.',
        ],
        followups: [
          { q: 'Why not shard by post ID like Elasticsearch does?', options: ['It also works, but every query must hit every shard; keyword + mod n limits a query to n shards', 'Post-ID sharding loses data', 'Redis forbids it', 'It makes writes touch every shard'], why: 'Both are valid; the difference is how many shards a read touches.' },
        ],
      };
    },
    () => ({
      q: 'After a year, the index holds lists for hundreds of millions of distinct keywords, including typos and rare names, and Redis memory costs are climbing fast. Logs show a few million keywords receive nearly all searches. You need to know which keywords are hot without storing an exact counter for every one.',
      answer: 'Keyword + mod-n shards with hot/cold tiers',
      hint: 'Approximate counts are enough to decide hot versus cold.',
      steps: [
        'Most keywords are almost never searched, yet each holds a list in memory.',
        'Track search frequency with a count-min sketch: a few MB, small overestimates, never undercounts.',
        'Keep hot keywords’ lists in Redis; move cold ones to S3 and fetch them on demand.',
        'Memory now scales with the hot head, not the whole vocabulary.',
      ],
      followups: [
        { q: 'A count-min sketch can be wrong. In which direction, and why is that acceptable here?', options: ['It can overcount, so a few cold keywords stay hot, which wastes a little memory but never hides a hot one', 'It undercounts, so hot keywords move to S3', 'It is exact', 'It can return negative counts'], why: 'Erring toward keeping data in memory is the safe direction.' },
      ],
    }),
    (pick) => {
      const ms = pick(['100', '80', '150']);
      const shop = pick(['an e-commerce site', 'a food app', 'a travel site']);
      return {
        q: `For ${shop}, the search box must show the 8 most popular completions within ${ms} ms on every keystroke. The current version runs a prefix query against the product search index, sorts matches by count, and is too slow for short prefixes like “s” or “sa”.`,
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
          'Aggregate recent query counts in short windows (a stream job over a few minutes).',
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
        q: `Results can be sorted by likes. Today every like (~100K/s overall, one viral post getting ${rate} likes/s) updates that post’s score in every keyword list it belongs to. Index write latency spikes, and the cluster spends far more time on likes than on new posts. A teammate’s 30-second batching job helped the viral post but barely changed total writes.`,
        answer: 'Power-of-two like updates + re-rank',
        hint: 'The ranking needs the order roughly right, not every count exact.',
        steps: [
          'Per-like updates make likes ~10× the write load of posts.',
          'Batching fails for the long tail: most posts get one like per window.',
          'Update the indexed score only when the count crosses a power of two: ~log2(L) writes per post.',
          'At query time read ~2× candidates, fetch live counts and re-sort.',
        ],
        followups: [
          { q: 'Why read about twice as many candidates as you show?', options: ['A bucketed score can be off by up to 2×, so some posts just below the cut-off may really belong above it', 'To fill a cache', 'Because Redis returns pairs', 'To hide deleted posts'], why: 'The over-fetch absorbs the approximation before the exact re-sort.' },
        ],
      };
    },
  ],
});
