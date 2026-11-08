SG.add({
  id: 'notify-feed',
  ref: 'R2 R3',
  section: 'Building blocks',
  title: 'Notifications and news feeds',
  short: 'Feeds and notifications',
  blurb: 'Delivering one event to many people: precomputed feeds, the celebrity problem, and push pipelines.',
  intro: 'Feeds and notifications are both fan-out problems: one post or alert must reach thousands or millions of people. The core decision is when you pay for that fan-out: at write time (precompute every follower’s feed), at read time (merge on demand), or a hybrid that treats huge accounts differently. Notifications add delivery concerns on top: a durable queue, workers per channel (push, SMS, email), priorities so OTPs never wait behind marketing, and dedupe on retries. Watch for hot keys: a viral post is one key read by millions.',
  options: {
    'Fan-out on write (push model)': {
      eli5: 'The newspaper boy drops a copy at every subscriber’s door at 6 a.m. Reading is instant because the paper is already waiting for you.',
      industry: [
        'Twitter/X timelines: a new tweet’s ID is pushed into followers’ cached home timelines (Redis lists).',
        'Instagram and LinkedIn precomputed feeds for normal accounts.',
        'Async worker pools reading a queue of new posts and writing post IDs into per-user feed tables.',
      ],
      def: 'When a post is created, look up the author’s followers and append the post ID to each follower’s precomputed feed (a capped list, say the latest 200–500 IDs). Reading the feed is then a single key lookup plus hydrating posts. The work is done asynchronously by workers so the author’s request returns immediately.',
      scenarios: [
        'Read-heavy feeds (reads far outnumber posts) with a tight read latency target',
        'Most authors have modest follower counts (hundreds to a few thousand)',
        'Eventual consistency is fine: a post can take seconds to a minute to appear',
      ],
      scale: 'Storage is cheap: 200 IDs × ~10 bytes ≈ 2 KB per user, ~4 TB for 2B users. The pain is write amplification: one post by a 10M-follower account means 10M writes.',
    },
    'Fan-out on read (pull model)': {
      eli5: 'No delivery boy. Each morning you walk to every shop you like and check their notice boards yourself. Fine if you like five shops; exhausting if you like five thousand.',
      industry: [
        'Early-stage social apps and internal company feeds with small user bases.',
        'Feeds for rarely active users, built only when they actually open the app.',
        'The “celebrity” half of hybrid systems: big accounts’ posts are pulled at read time.',
      ],
      def: 'Store posts once, indexed by author and time. When a user opens the feed, fetch the list of people they follow, query each author’s recent posts (cursor = oldest timestamp seen), merge-sort by time and return a page. No write amplification, always fresh, but read cost grows with the number of follows.',
      scenarios: [
        'Low read volume or small scale where simplicity beats speed',
        'Writes are very frequent but feeds are opened rarely',
        'Pulling posts from a handful of very large accounts inside a hybrid design',
      ],
      scale: 'Following 10,000 accounts means 10,000 queries and a big merge per page load: tail latency explodes. Works when follows per user are small or results are cached.',
    },
    'Hybrid fan-out for celebrities': {
      eli5: 'The newspaper boy delivers papers from local shops to your door, but for the giant national paper everyone reads, you just pick up a copy from the stand on your way.',
      industry: [
        'Twitter/X: tweets from very large accounts are merged in at read time instead of pushed.',
        'Facebook/Instagram-style feeds flag “precomputed” per follow relationship.',
        'Any follower graph with a power-law distribution (a few accounts with millions of followers).',
      ],
      def: 'Fan out on write for normal authors, but skip it for accounts above a threshold (say 100K followers). At read time, take the precomputed feed and merge in the latest posts from the few large accounts the user follows. Caps the write storm per post and keeps the read merge small.',
      scenarios: [
        'A few accounts have millions of followers and post often',
        'Fan-out workers fall behind every time a celebrity posts',
        'You want push-model read speed without unbounded write amplification',
      ],
      scale: 'Typical threshold: 10K–1M followers. Edge cases (users following hundreds of celebrities, accounts crossing the threshold) are often handled with product limits rather than more engineering.',
    },
    'Notification pipeline with priority queues': {
      eli5: 'A post office with separate counters: speed-post for urgent letters, a slow counter for pamphlets. A huge pile of pamphlets never delays your speed-post.',
      industry: [
        'OneSignal/Braze-style services: accept a campaign into Kafka, expand the audience, enqueue per-device messages.',
        'Indian fintech apps keep OTP SMS on a dedicated high-priority queue separate from promotional SMS.',
        'Push workers holding long-lived HTTP/2 connections to Apple APNs and Firebase FCM.',
      ],
      def: 'Accept the notification, persist it to a durable log (Kafka) and acknowledge fast. A fan-out stage resolves the audience (user IDs → device tokens, using user preferences and segments) and enqueues one message per device or address. Channel workers (push, SMS, email) send with retries and backoff, rate limits per provider, and a dedupe key so a retry doesn’t show twice. Separate topics or queues by priority.',
      scenarios: [
        'Transactional alerts (OTP, payment success) must not wait behind bulk campaigns',
        'Sending one message to millions of devices without timeouts',
        'Consumers may crash and retry, so duplicates must be harmless',
      ],
      scale: 'OneSignal reported ~5B messages/day (≈60K/s average). A push worker can send ~1K/s over a few HTTP/2 connections, so ~250 workers cover 250K/s.',
    },
    'Hot-key cache replicas': {
      eli5: 'When everyone in the colony wants the same new comic, the library buys ten identical copies and hands out whichever is free, instead of making a queue for one copy.',
      industry: [
        'A celebrity’s new post being fetched by millions of feeds within minutes.',
        'Cricket score or IPL-final posts read by tens of millions at once.',
        'Facebook’s memcache tier replicating very hot keys across many servers.',
      ],
      def: 'A sharded cache still has a hot shard: every request for post X goes to the one node owning X. For the hottest items, keep copies on several independent cache instances (or add a random suffix to the key) and have readers pick one at random. The database then sees at most N misses instead of millions of reads.',
      scenarios: [
        'One key gets a sudden flood of reads (viral post, live event)',
        'The database or cache shard for one key is throttling while others are idle',
        'Content is immutable or tolerates a short TTL',
      ],
      scale: 'A Redis node handles ~100K+ simple ops/s; one viral post can exceed that. N replicas give roughly N× headroom for that key.',
    },
  },
  scenarios: [
    (pick) => {
      const users = pick(['300 million', '800 million', '2 billion']);
      const ratio = pick([50, 100, 200]);
      return {
        q: `A social app has ${users} users. Feeds are opened ${ratio}× more often than posts are created, the target is p99 under 500 ms to load the first page, and a new post may take up to a minute to appear for followers. Most accounts have a few hundred followers.`,
        answer: 'Fan-out on write (push model)',
        hint: 'Which side is heavier, reads or writes? Pay the cost on the lighter side.',
        steps: ['Reads vastly outnumber writes and read latency is the strict target.', 'Follower counts are modest, so write amplification is bounded.', 'A minute of staleness allows async workers to do the work.', 'Precompute feeds on write.'],
        followups: [
          { q: 'Should the post service write to all followers’ feeds before returning to the author?', options: ['No: enqueue the post and let async fan-out workers do it', 'Yes, it guarantees consistency', 'Yes, but only in one database transaction', 'No, skip the follower feeds entirely'], why: 'A large account would wait seconds or minutes; a queue spreads the writes and keeps posting fast.' },
          { q: 'Which non-functional requirement lets you choose this design?', options: ['Eventual consistency for feeds (a post may appear up to a minute later)', 'Strong consistency for every read', 'Exactly-once delivery to every device', 'Zero storage overhead'], why: 'Async fan-out only works because the product tolerates a short delay.' },
        ],
      };
    },
    (pick) => {
      const f = pick(['40 million', '120 million', '300 million']);
      return {
        q: `In your push-based feed, a cricketer with ${f} followers posts several times during a match. Each post triggers ${f} feed writes, the fan-out queue backs up for 20 minutes, and normal users’ posts are delayed behind it.`,
        answer: 'Hybrid fan-out for celebrities',
        hint: 'Treat the rare giant accounts differently from everyone else.',
        steps: ['Write amplification is proportional to follower count.', 'A handful of huge accounts cause most of the fan-out load.', 'Skip precomputing for them and merge their latest posts at read time.', 'Hybrid fan-out.'],
        followups: [
          { q: 'How does the read path know which follows to pull at read time?', options: ['A flag on the follow relationship (or account) marks it as not precomputed', 'It pulls every follow at read time', 'It asks the celebrity’s phone', 'It guesses from the post length'], why: 'Store the decision with the follow edge, then merge precomputed IDs with pulled posts.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['15,000', '25,000', '40,000']);
      return {
        q: `An internal company app for ${n} employees shows a feed of updates from teams you follow (about 30 teams each). People open it a couple of times a day, the team is two engineers, and updates must show immediately after posting.`,
        answer: 'Fan-out on read (pull model)',
        hint: 'Small scale, few follows, freshness needed, small team.',
        steps: ['Reads are low and each user follows few sources.', 'Merging 30 recent lists per load is cheap.', 'No precomputed copies means no staleness and less to build.', 'Fan-out on read.'],
        followups: [
          { q: 'How should the feed API page through older items reliably?', options: ['Cursor pagination using the timestamp (or ID) of the last item seen', 'Offset pagination with page numbers', 'Return the whole feed every time', 'Random sampling'], why: 'A cursor stays correct as new items arrive at the top; offsets shift and skip or repeat items.' },
        ],
      };
    },
    (pick) => {
      const camp = pick(['a Diwali sale', 'an IPL offer', 'a festive cashback']);
      return {
        q: `A payments app sends ${camp} push and SMS campaign to 30 million users. During the blast, login OTP SMS messages take 4–6 minutes to arrive and users can’t sign in.`,
        answer: 'Notification pipeline with priority queues',
        hint: 'Urgent and bulk traffic are sharing one line.',
        steps: ['Transactional and promotional messages share one queue and provider quota.', 'Separate them into priority topics with dedicated workers and quota.', 'Fan-out of the campaign happens asynchronously from a durable log.', 'A notification pipeline with priority queues.'],
        followups: [
          { q: 'A push worker crashes after sending but before committing its Kafka offset. What prevents the user seeing the message twice?', options: ['A dedupe key per message (e.g. APNs collapse ID or an idempotency key checked before send)', 'Kafka never redelivers', 'Disable retries', 'Send the message to a different device'], why: 'Delivery is at-least-once; the sender must make duplicates harmless.' },
          { q: 'Where should user opt-outs and quiet hours be enforced?', options: ['In the fan-out stage, before messages are enqueued per channel', 'On the user’s phone only', 'Nowhere, send everything', 'In the database backup job'], why: 'Filtering early saves provider cost and respects preferences consistently.' },
        ],
      };
    },
    (pick) => {
      const reads = pick(['2 million', '5 million', '8 million']);
      return {
        q: `A film star’s new post lands at the top of ${reads} feeds within a minute. Feed hydration fetches post bodies from a Redis cluster sharded by post ID; the one shard holding that post is at 100% CPU and timing out while the other shards are idle.`,
        answer: 'Hot-key cache replicas',
        hint: 'Sharding spreads different keys. This is one key.',
        steps: ['All reads for one post hit the shard that owns it.', 'Adding shards doesn’t help a single key.', 'Copy the hot post to several independent cache instances and read one at random.', 'Hot-key cache replicas.'],
        followups: [
          { q: 'Why is putting a cache in front of the database not enough by itself here?', options: ['The cache is sharded by post ID too, so it has the same hot key', 'Caches are slower than databases', 'Redis can’t store posts', 'Caches lose data on every read'], why: 'A hot key moves from the DB shard to the cache shard unless you replicate it.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['5 million', '20 million', '60 million']);
      return {
        q: `A B2B push service lets customers send one notification to a segment such as “city = Pune and plan = premium”, which can match ${n} devices. The API call must return quickly, and the system must survive worker crashes without losing messages.`,
        answer: 'Notification pipeline with priority queues',
        hint: 'Accept fast, persist, then expand and deliver asynchronously.',
        steps: ['Write the request to a durable log and acknowledge.', 'A consumer evaluates the segment and joins users to device tokens.', 'Per-device messages go onto a partitioned topic consumed by push workers.', 'A queued notification pipeline.'],
        followups: [
          { q: 'Why can any push worker send to any device in this design?', options: ['Apple/Google gateways hold the device connections; we just call their API', 'Every worker holds a socket to every phone', 'Devices poll our workers', 'Workers are pinned to users by consistent hashing'], why: 'APNs/FCM keep the device connection, so messages can be round-robined across workers.' },
        ],
      };
    },
  ],
});
