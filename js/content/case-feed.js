SG.add({
  id: 'case-feed',
  ref: 'S4',
  section: 'HLD case studies',
  title: 'Design a news feed',
  short: 'News feed',
  blurb: 'A full chronological-feed walk-through: data model, precomputed feeds, async fan-out, celebrity accounts and paging.',
  intro: 'Scope: create a post, follow a user, and view a paginated, chronological feed of posts from people you follow. The NFRs: a post may take up to ~1 minute to appear in feeds (eventual consistency, so favour availability), feeds load in ~500 ms, and the system has billions of users with a very skewed follower distribution. Reads dominate, so do the work at write time: keep a precomputed feed per user, fill it with async workers fed by CDC or a queue, look up followers through a reverse index, skip fan-out for huge accounts and merge their posts at read time, and page with a cursor.',
  options: {
    'Precomputed feed table (fan-out on write)': {
      eli5: 'Instead of visiting 100 friends every morning to ask what’s new, each friend drops a note in your letterbox when they post. Reading your feed is just opening the box.',
      industry: [
        'Twitter’s home timelines held as per-user lists of tweet IDs in Redis.',
        'Instagram and Facebook materialising candidate feeds ahead of ranking.',
        'A feed table partitioned by viewer ID, sorted by post time, storing only post IDs.',
      ],
      def: 'Keep, per user, a capped list of recent post IDs (e.g. 200–800) from accounts they follow, partitioned by viewer and sorted by time. Building a feed at read time means querying every followee’s posts and merging them, which is too slow for someone following thousands. With a precomputed list, a feed request is one partition read plus fetching post bodies (hydration), usually from cache.',
      scenarios: [
        'Feeds are read far more often than posts are written',
        'Users follow hundreds or thousands of accounts',
        'Feed loads must stay under a few hundred ms',
      ],
      scale: '200 post IDs × ~10 bytes ≈ 2 KB per user; 2B users ≈ 4 TB in total, which is cheap. The cost moves to write fan-out: one write per follower.',
    },
    'Async fan-out workers via CDC/queue': {
      eli5: 'The newspaper office prints one copy, then a team of delivery boys drops copies at every house. The editor doesn’t wait at the door until every house has one.',
      industry: [
        'Post DB change data capture (Debezium) → Kafka → fan-out consumers writing feed rows.',
        'Worker pools splitting a big follower list into batches of a few thousand.',
        'Idempotent feed inserts keyed by (viewer, post ID), so retries are safe.',
      ],
      def: 'The post service only writes the post and returns. A change event (CDC from the post table, or an outbox row) goes to Kafka; workers read the author’s followers and insert the post ID into each follower’s feed. Big follower lists are split into sub-jobs so many workers share them. Writes are idempotent, so at-least-once retries are fine. CDC avoids the dual-write bug where the post is saved but the event is lost.',
      scenarios: [
        'Posting must stay fast even for authors with many followers',
        'A crash halfway through fan-out must not lose deliveries',
        'Feeds may lag posts by seconds up to the ~1-minute NFR',
      ],
      scale: 'An author with 50K followers creates 50K feed writes; split into 50 jobs of 1K, it finishes in seconds. Consumer lag is the metric to alert on against the freshness NFR.',
    },
    'Follow table with reverse index': {
      eli5: 'A school register lists, for each student, who their friends are. To announce something to everyone who counts Riya as a friend, you also need the reverse list, so you keep a second register.',
      industry: [
        'DynamoDB follow table (follower → followee) plus a GSI (followee → follower).',
        'Cassandra: a second table keyed by followee, kept in sync by CDC.',
        'Twitter’s FlockDB, built for exactly these two adjacency lookups.',
      ],
      def: 'Store follow edges partitioned by follower (“whom do I follow?”) and maintain the reverse view partitioned by followee (“who follows X?”), which is what fan-out needs. Use a managed global secondary index or a CDC-maintained second table; both are eventually consistent, which is fine here. A graph database is overkill: the only queries are one-hop lists, not multi-hop traversals.',
      scenarios: [
        'Fan-out must list all followers of an author quickly',
        'The feed service must list everyone a user follows',
        'Someone proposes Neo4j for simple follow lists',
      ],
      scale: 'Paged range reads (DynamoDB returns ≤1 MB per page, roughly 100K small rows) are fine for most accounts; accounts with millions of followers need paging and are better handled by the celebrity path.',
    },
    'Hybrid merge for celebrity accounts': {
      eli5: 'The school sends each parent a personal note about their child, but the principal’s announcement goes on the notice board, and every parent reads the board when they visit.',
      industry: [
        'Twitter skipping fan-out for very large accounts and merging their tweets at read time.',
        'A cached set of “popular” author IDs (e.g. >100K followers) refreshed by a daily job.',
        'Facebook/Instagram mixing pushed and pulled candidates before ranking.',
      ],
      def: 'Mark authors above a follower threshold as popular (a flag on the follow edge, or a cached set of IDs). Fan-out workers skip them. At read time the feed service reads the precomputed list, fetches recent posts from the few popular accounts the user follows (cached, since everyone asks for the same ones), and merges by time. This caps both write amplification and read work.',
      scenarios: [
        'A handful of accounts have tens or hundreds of millions of followers',
        'Fan-out for one post would mean 100M+ writes',
        'Most users follow only a few such accounts',
      ],
      scale: 'If 0.1% of 1B users are popular, that’s 1M IDs × 8 bytes ≈ 8 MB, small enough to cache in every server. Read cost grows with the number of celebrities a user follows, so product limits help.',
    },
    'Cursor pagination on timestamp': {
      eli5: 'Like a bookmark in a diary: “show me entries older than 3 March, 4:15 p.m.” Even if new pages are added at the front, your place doesn’t shift.',
      industry: [
        'Twitter and Instagram APIs returning a next_cursor / max_id instead of page numbers.',
        'Feed queries such as WHERE viewer = ? AND created_at < :cursor ORDER BY created_at DESC LIMIT 25.',
        'Clients prefetching the next page when the user is halfway down the current one.',
      ],
      def: 'Return a page of N items plus a cursor encoding the last item’s position (timestamp plus post ID as a tie-breaker). The next request asks for items strictly older than the cursor. Unlike OFFSET, it doesn’t skip or repeat items when new posts arrive at the top, and the cost doesn’t grow with depth because it’s a range seek on the sort key.',
      scenarios: [
        'Infinite scroll on a feed that keeps receiving new posts',
        'Deep scrolling must stay as fast as the first page',
        'Merging several sorted sources (feed list + celebrity posts)',
      ],
      scale: 'Each page is an index seek plus LIMIT, constant time at any depth. OFFSET 10,000 still reads and throws away 10,000 rows.',
    },
  },
  scenarios: [
    (pick) => {
      const users = pick(['2 billion', '1 billion', '600 million']);
      const sec = pick(['60', '30', '120']);
      return {
        q: `Interviewer: “Facebook-style chronological feed, ${users} users.” You agree on NFRs: a new post may take up to ${sec} seconds to appear in followers’ feeds, feed loads under 500 ms, and availability over consistency. Average users follow 200 accounts, and some follow 5,000. Which decision does the 500 ms read NFR most directly drive?`,
        answer: 'Precomputed feed table (fan-out on write)',
        hint: 'What does one feed load cost if you build it when the user asks?',
        steps: [
          'Building at read time means querying every followee’s posts and merging them, 5,000 queries for heavy users.',
          'Reads vastly outnumber posts, so do the work once at write time.',
          'Keep a per-user list of recent post IDs, partitioned by viewer and sorted by time.',
          'A feed load becomes one partition read plus cached hydration.',
        ],
        followups: [
          { q: 'Which NFR gives you room to do that fan-out asynchronously?', options: ['The agreed freshness window: posts may take up to a minute to appear', 'The 500 ms read latency', 'Strong consistency', 'Durability of posts'], why: 'Eventual consistency for feeds lets fan-out run on a queue instead of inside the post request.' },
          { q: 'Rough storage for 200 post IDs per user across 2B users?', options: ['About 4 TB (2 KB × 2B), which is cheap', 'About 4 PB', 'About 4 GB', 'Too much to store'], why: '200 × 10 bytes = 2 KB per user; 2 KB × 2×10^9 ≈ 4×10^12 bytes.' },
        ],
      };
    },
    (pick) => {
      const f = pick(['40,000', '80,000', '150,000']);
      return {
        q: `A news publisher’s page has ${f} followers. When it posts, the post service writes the post and then loops over every follower writing feed rows inside the same HTTP request. The editor’s “Publish” button spins for a minute, and a pod restart halfway left half the followers without the post.`,
        answer: 'Async fan-out workers via CDC/queue',
        hint: 'Take the fan-out out of the request path, and make it survive crashes.',
        steps: [
          'Synchronous fan-out makes posting latency grow with the follower count.',
          'Write the post, return, and emit an event via CDC/outbox to Kafka.',
          'Workers split the follower list into batches and insert feed rows idempotently.',
          'Retries after a crash simply resume, with no lost or duplicate rows.',
        ],
        followups: [
          { q: 'Why CDC/outbox rather than “save post, then publish to Kafka” in application code?', options: ['If the publish fails after the save, the post silently never fans out (dual-write problem)', 'Kafka can’t accept app writes', 'CDC is faster than any write', 'It removes the need for workers'], why: 'Deriving the event from the committed row guarantees every saved post produces one.' },
        ],
      };
    },
    (pick) => {
      const store = pick(['DynamoDB', 'Cassandra', 'a sharded MySQL']);
      return {
        q: `Your follow table in ${store} is partitioned by follower ID, so “whom does Priya follow?” is one partition read. The fan-out worker needs “who follows author X?”, which today scans every partition. A teammate suggests moving follows to a graph database.`,
        answer: 'Follow table with reverse index',
        hint: 'You need the same edges, looked up from the other end.',
        steps: [
          'Fan-out needs a lookup by followee, which the current key can’t serve.',
          'Maintain a reverse view partitioned by followee (GSI, or a second table synced by CDC).',
          'Eventual consistency is fine, because a new follower missing one post briefly is harmless.',
          'A graph DB is overkill for one-hop lists.',
        ],
        followups: [
          { q: 'When would a graph database actually be justified?', options: ['Multi-hop queries such as “friends of friends who also follow each other”', 'Listing someone’s followers', 'Storing post IDs', 'Cursor pagination'], why: 'Graph engines earn their cost on traversals, not adjacency lists.' },
        ],
      };
    },
    (pick) => {
      const f = pick(['120 million', '185 million', '60 million']);
      return {
        q: `Feeds are precomputed for everyone. A tech CEO with ${f} followers posts 20 times a day; each post means ${f} feed writes, and his follower list alone takes hundreds of 1 MB pages to read. Most users follow at most 10 accounts this large.`,
        answer: 'Hybrid merge for celebrity accounts',
        hint: 'Don’t push the posts nearly everyone will read anyway; let readers pull them.',
        steps: [
          'Fan-out cost scales with followers, and for this author it’s enormous.',
          'Flag authors above a threshold (say 100K followers) as popular and skip their fan-out.',
          'At read time, fetch recent posts from the few popular accounts the user follows (cached) and merge them with the precomputed list.',
          'Writes are capped and reads stay small.',
        ],
        followups: [
          { q: 'How does the feed service quickly know which followees are “popular”?', options: ['A small cached set of popular IDs (≈8 MB for 1M users) refreshed by a periodic job, or a flag on the follow edge', 'Count followers on every request', 'Ask each author’s client', 'Fan out anyway and check later'], why: 'Counting follower rows on the hot path is expensive; precompute the classification.' },
          { q: 'Millions of feeds now request the CEO’s latest post body. What protects its storage partition?', options: ['Cache hot posts, with several independent cache copies so one key isn’t one node', 'Shard the cache by post ID only', 'Add more database replicas only', 'Disable the post'], why: 'A sharded cache still puts one hot key on one node; replicate hot entries.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['25', '20', '50']);
      return {
        q: `The feed API uses ?page=3&size=${n} (OFFSET). Users scrolling during a cricket final see the same posts twice whenever new posts arrive, and page 400 takes 3 seconds to load.`,
        answer: 'Cursor pagination on timestamp',
        hint: 'Remember where you were, not how many rows to skip.',
        steps: [
          'OFFSET shifts when new items are inserted at the top, causing repeats.',
          'Deep offsets read and throw away every skipped row.',
          'Return a cursor (last created_at plus post ID) and query “older than cursor, LIMIT n”.',
          'That is stable under inserts and costs the same at any depth.',
        ],
        followups: [
          { q: 'Why include the post ID in the cursor, not just the timestamp?', options: ['To break ties when several posts share a timestamp, so none are skipped or repeated', 'IDs sort alphabetically', 'Timestamps are secret', 'It makes the cursor shorter'], why: 'A compound sort key makes the position unique.' },
        ],
      };
    },
    (pick) => {
      const pct = pick(['0.5%', '1%', '2%']);
      return {
        q: `Your post service saves each post to the database and then calls producer.send() to Kafka for fan-out. About ${pct} of posts never show up in any follower’s feed: the send times out or the pod dies just after the commit. Posting latency must stay low.`,
        answer: 'Async fan-out workers via CDC/queue',
        hint: 'Make the fan-out trigger part of the committed data itself.',
        steps: [
          'Save-then-publish is a dual write; a failure between them loses the event.',
          'Use CDC on the post table (or an outbox row in the same transaction) to produce the event.',
          'Fan-out workers consume it at least once and write feed rows idempotently.',
          'Every committed post now fans out, with no extra latency for the author.',
        ],
        followups: [
          { q: 'Why can workers safely retry a batch?', options: ['Feed inserts keyed by (viewer, post ID) are idempotent, so a duplicate overwrites itself', 'Kafka guarantees exactly-once to the database', 'Retries are never needed', 'Each retry uses a new post ID'], why: 'Idempotent writes turn at-least-once delivery into an effectively-once result.' },
        ],
      };
    },
  ],
});
