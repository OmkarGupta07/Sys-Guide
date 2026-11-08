SG.add({
  id: 'case-chat',
  ref: 'S3',
  section: 'HLD case studies',
  title: 'Design WhatsApp',
  short: 'Chat app',
  blurb: 'Ack once durable, fan out into per-user inboxes, cache group membership next to the stream, and sync offline devices without gaps.',
  intro: 'Functional scope: create 1:1 and group chats, add and remove members, send messages and media, see every chat’s messages in a fixed order, and catch up on missed messages after being offline. The NFRs drive the design: 1B users sending ~100B messages a day (over 1M per second), delivery within a couple of seconds, never losing an acknowledged message, and a deterministic order inside each chat. So the sender is acknowledged as soon as the message is durable; the message is fanned out asynchronously into one inbox per recipient (the news-feed pattern again); a stream consumer keeps group membership cached beside the message stream; and devices sync from their inbox using the time the server received each message. How devices get new messages is a real trade-off: persistent connections with a routing layer (what WhatsApp does) or polling one inbox shard (simpler, slower).',
  options: {
    'WebSocket chat servers (stateful connections)': {
      eli5: 'Like keeping a phone call open with a friend instead of hanging up and redialling every time you want to say something; either side can talk at any moment.',
      industry: [
        'WhatsApp keeps a long-lived TLS connection per device; its Erlang servers famously held ~2M connections each.',
        'A registry (Redis pub/sub channels, or a user → server map in ZooKeeper/etcd) lets the sender’s server reach whichever server holds the recipient’s socket.',
        'Slack, Discord and Messenger web clients push events over WebSockets, falling back to fetching on reconnect.',
      ],
      def: 'Each device keeps one persistent, bidirectional connection to a chat server, which keeps an in-memory map of device → socket and pushes new messages instantly. Because servers are stateful, you need a routing layer to reach a recipient on another server (pub/sub channel per connected user, or a presence registry) and least-connections balancing with connections pinned. The simpler alternative is clients polling their own inbox shard every second or two: no routing map to keep correct, but more latency, battery and wasted requests. Either way the inbox, not the live push, is the delivery guarantee.',
      scenarios: [
        'Messages, typing indicators and receipts must arrive in well under a second',
        'Millions of mostly idle but always-connected devices',
        'Sender and recipient are connected to different chat servers',
      ],
      scale: '1–2M connections per tuned server, so a billion online devices needs roughly 500–1,000 chat servers. Connections, not CPU, are usually the limit.',
    },
    'Ack once durable, deliver async': {
      eli5: 'At the post office counter you get a receipt the moment your letter is logged in the register, not after it reaches every relative, and never before it is logged.',
      industry: [
        'WhatsApp’s single grey tick means “the server has it”; delivery and read ticks come later from the recipients.',
        'The chat server writes to a replicated store (Cassandra/HBase) or Kafka and acks once that write succeeds.',
        'Clients retry unacked sends with the same client-generated message ID, so a retry never duplicates.',
      ],
      def: 'Acknowledge the sender as soon as the message is durably stored (a replicated database write or Kafka append), then deliver to recipients asynchronously. Waiting for every recipient makes the sender’s tick as slow as the slowest phone in a 500-member group; acking before the write means a crash silently loses a message the user thinks was sent. The client retries until it gets the ack, using a stable message ID so the server dedupes. This gives at-least-once delivery, and the message store partitioned by chat ID gives per-chat ordering and scroll-back.',
      scenarios: [
        '“An acknowledged message is never lost” is a stated NFR',
        'Large groups would make waiting for every recipient slow',
        'Phones on flaky networks resend the same message',
      ],
      scale: '100B messages/day ≈ 1.2M writes/s; at ~200 B each that is ~20 TB/day of messages, so the store is sharded by chat ID across many nodes.',
    },
    'Fan-out to per-user inbox (CDC + Kafka)': {
      eli5: 'Instead of every person searching the whole office mail room for letters with their name, the clerk drops a copy into each person’s own pigeonhole as letters come in.',
      industry: [
        'Debezium reads the messages table’s change log into Kafka, and consumers write one inbox row per member.',
        'Inbox table (user/device ID, receive timestamp, message ID) in Cassandra or DynamoDB, partitioned by recipient.',
        'Same pattern as fan-out-on-write news feeds: being in a chat is like following its members.',
      ],
      def: 'The messages table is partitioned by chat ID, so “what did I miss in all my chats?” would scatter-gather across every shard. Instead, fan out on write: CDC streams each new message into Kafka, and consumers write one row into each member’s inbox, partitioned by receiver. A device then syncs with one query to one partition: everything since the last receive timestamp it saw. Use CDC rather than having the chat server write both tables, which fails halfway. Key inbox rows by message ID so redelivery is idempotent, index them by the time the server received them (creation times arrive out of order), key per device when users have several, and trim old rows.',
      scenarios: [
        'Offline devices must catch up on every chat in one cheap query',
        'Writing the message and the inbox rows separately leaves gaps when one write fails',
        'A phone and a laptop must each receive every message',
      ],
      scale: 'Fan-out multiplies writes by group size (capped ~500, average ~10), so ~1M messages/s becomes ~10M inbox writes/s, spread by user ID across partitions.',
    },
    'Co-partitioned membership cache': {
      eli5: 'The clerk sorting mail for building B keeps building B’s resident list on his own desk, so he never walks to the main office to ask who lives where.',
      industry: [
        'Kafka Streams joining a messages topic with a chat_members CDC topic, both keyed by chat ID.',
        'The membership table is a changelog-backed state store, so a restarted consumer rebuilds its cache.',
        'Google Zanzibar uses globally ordered timestamps to make permission changes and content safe to compare.',
      ],
      def: 'Fan-out needs the member list for every message. Rather than querying the membership database 1M times a second, partition both the messages CDC topic and the chat_members CDC topic by chat ID with the same number of partitions. Each consumer then sees all messages and all membership changes for its chats, and caches only those members locally. This also orders membership changes against messages: if a user is removed and someone posts right after, the message carries the sender’s membership version or timestamp, and a consumer whose cache is older refreshes before fanning out. Across two devices this needs globally comparable timestamps, which is a hard problem.',
      scenarios: [
        'Fan-out consumers hammer the membership table on every message',
        'A removed member still receives the next message in the group',
        'A consumer crash must not lose its view of who is in each chat',
      ],
      scale: '10B chats × ~10 members = 100B membership rows × 16 B ≈ 1.6 TB in total; each consumer holds only its slice in memory.',
    },
    'Pre-signed URLs for media': {
      eli5: 'Instead of handing your big sofa to the postman who also carries letters, you get a gate pass to drive it straight to the warehouse, then post a note saying where it is.',
      industry: [
        'WhatsApp and Messenger uploading photos and videos to blob storage, then sending only a reference.',
        'S3/GCS pre-signed PUT URLs with short TTLs, issued by the chat server.',
        'Media expiry and storage quotas so users don’t treat chat as free cloud storage.',
      ],
      def: 'The client asks the chat server for an upload URL, uploads the file directly to object storage, then sends a normal small chat message containing the media reference. Recipients download from storage or a CDN. This keeps multi-hundred-MB uploads off the chat servers, whose job is many tiny messages, and off the message database, which is not built for blobs.',
      scenarios: [
        'Users send videos and photos of tens to hundreds of MB',
        'Chat server bandwidth is needed for small, latency-sensitive messages',
        'Media should expire after delivery or a fixed period',
      ],
      scale: 'Object storage handles any size and throughput; a pre-signed URL costs the server one signing call. Expire media after ~30 days or once every recipient has downloaded it.',
    },
  },
  scenarios: [
    (pick) => {
      const users = pick(['1 billion', '2 billion', '800 million']);
      const msgs = pick(['100 billion', '60 billion', '150 billion']);
      return {
        q: `Interviewer: “Design WhatsApp for ${users} users sending ${msgs} messages a day.” Your NFRs: delivered within 2 seconds, an acknowledged message is never lost, fixed order within each chat, groups up to 500. A teammate suggests showing the sender’s tick only after every group member’s phone has received the message. What do you propose instead?`,
        answer: 'Ack once durable, deliver async',
        hint: 'Which NFR is the sender’s tick actually promising?',
        steps: [
          'The tick promises durability, not delivery; waiting for 500 phones ties it to the slowest one, which may be offline for a day.',
          'Acking before writing breaks “never lost”: a crash drops a message the sender believes was sent.',
          'Write to a replicated store or Kafka, ack, then fan out to recipients asynchronously.',
          'Clients retry with the same message ID until acked, so retries are safe.',
        ],
        followups: [
          { q: 'Roughly how many writes per second do 100 billion messages a day mean?', options: ['About 1.2 million per second (100B ÷ ~86,400 s), more at peak', 'About 12,000 per second', 'About 120 million per second', 'About 100,000 per second'], why: 'A day is ~86,400 s ≈ 10⁵, so divide by 10⁵ and plan for 2–3× at peak.' },
          { q: 'Which NFR decides how you partition the messages table?', options: ['Per-chat ordering and scroll-back: partition by chat ID', 'Low latency: partition by sender’s country', 'Durability: partition by message size', 'Availability: partition randomly'], why: 'All of a chat’s messages on one partition gives a single order and a cheap range scan for history.' },
        ],
      };
    },
    (pick) => {
      const shards = pick(['64', '200', '500']);
      return {
        q: `Messages are stored in one table sharded by chat ID across ${shards} shards. When a phone reconnects after a flight, the app asks “what did I miss in all my 300 chats?”, which queries every shard and takes 8 seconds. The NFR says catch-up should feel instant.`,
        answer: 'Fan-out to per-user inbox (CDC + Kafka)',
        hint: 'Shape the data around the read: “everything for me”.',
        steps: [
          'Sharding by chat ID is right for scroll-back but makes per-user reads scatter-gather.',
          'Fan out on write: one inbox row per member, partitioned by receiver user ID.',
          'Stream new messages through CDC into Kafka; consumers write the inbox rows in parallel.',
          'The reconnecting device reads one partition: everything since its last seen timestamp.',
        ],
        followups: [
          { q: 'Why CDC instead of the chat server writing the message and the inbox rows itself?', options: ['A dual write can fail halfway, leaving a stored message missing from some inboxes; CDC derives inbox rows from the committed write', 'CDC is faster than a database write', 'The chat server can’t talk to two tables', 'CDC gives exactly-once delivery to phones'], why: 'One source of truth, with everything else derived from its change log, avoids partial failures.' },
          { q: 'Users link a laptop as well as a phone, and the laptop misses messages the phone already read. What fixes it?', options: ['Key inbox rows and sync position per device, not per user', 'Make the phone forward messages to the laptop', 'Delete inbox rows faster', 'Use a bigger Kafka cluster'], why: 'Each device has its own catch-up position.' },
        ],
      };
    },
    (pick) => {
      const rate = pick(['1M', '800K', '1.5M']);
      return {
        q: `Fan-out consumers handle ${rate} messages per second. For each one they query the chat_members table to find recipients, and that database is now the bottleneck at 90% CPU even with read replicas. Membership changes are rare compared with messages.`,
        answer: 'Co-partitioned membership cache',
        hint: 'Bring the member list to the consumer instead of asking for it each time.',
        steps: [
          'Membership is read on every message but changes rarely: a classic cache case.',
          'Stream chat_members changes into Kafka via CDC, keyed by chat ID.',
          'Give the messages topic the same key and partition count, so one consumer owns both streams for a chat.',
          'Each consumer caches members only for its chats; the database leaves the hot path.',
        ],
        followups: [
          { q: 'What happens if the members topic has 32 partitions and the messages topic has 48?', options: ['A chat’s messages and its membership changes land on different consumers, so the local cache is wrong', 'Nothing; partition counts don’t matter', 'Kafka rejects the setup', 'Messages are delivered twice'], why: 'Co-partitioning needs the same key and the same partition count.' },
          { q: 'A consumer restarts. How does it rebuild its member cache?', options: ['From a changelog-backed state store (e.g. Kafka Streams) or by replaying the compacted members topic', 'It can’t; members are lost', 'Ask every client to resend its groups', 'Query all chats from the database at once'], why: 'Kafka Streams makes that local state recoverable.' },
        ],
      };
    },
    (pick) => {
      const who = pick(['an ex-colleague', 'a former flatmate', 'a cousin']);
      return {
        q: `An admin removes ${who} from a family group and immediately posts a message about them. The removal and the message travel through different CDC streams, the message reaches the fan-out consumer first, and the removed person receives it.`,
        answer: 'Co-partitioned membership cache',
        hint: 'The consumer needs to know whether its member list is older than the message.',
        steps: [
          'Two streams mean the message can overtake the membership change.',
          'Attach the sender’s membership version or change timestamp to the message.',
          'If the consumer’s cached membership is older, it waits for or reloads the newer membership first.',
          'Co-partitioning by chat ID keeps both streams on the same consumer, so this check is local.',
        ],
        followups: [
          { q: 'Why is this hard when the removal is done on one device and the message is sent from another?', options: ['The two devices’ clocks aren’t comparable without globally ordered timestamps (e.g. Spanner’s TrueTime in Zanzibar)', 'Two devices can’t be in one group', 'Kafka forbids it', 'It isn’t; it works the same'], why: 'Ordering events across machines needs a shared notion of time or version.' },
        ],
      };
    },
    (pick) => {
      const gap = pick(['2 seconds', '5 seconds', '1 second']);
      return {
        q: `Devices sync with “give me inbox rows created after T”, using the creation time the sender’s phone stamped. A message stamped at 10:00:00 arrives at the inbox ${gap} late, after a device already synced up to 10:00:01, so that device never sees it.`,
        answer: 'Fan-out to per-user inbox (CDC + Kafka)',
        hint: 'Which timestamp only moves forward in the inbox itself?',
        steps: [
          'Creation timestamps arrive out of order, so “after T” skips late arrivals.',
          'Stamp each inbox row with the time the database received it.',
          'Add a local secondary index on that receive timestamp in the inbox partition.',
          'Devices sync “received after T”, and message ID as the row key keeps redelivery idempotent.',
        ],
        followups: [
          { q: 'The partition’s leader fails over and the new leader’s clock is 3 s behind. What can go wrong?', options: ['New rows get older timestamps than ones already synced, so they are skipped; the new leader must wait until its clock passes the last timestamp used', 'Nothing; clocks don’t matter', 'Messages get duplicated forever', 'Devices sync twice as fast'], why: 'Receive timestamps must stay monotonic per partition across failovers.' },
        ],
      };
    },
    (pick) => {
      const sec = pick(['3', '5', '10']);
      return {
        q: `A prototype has every client poll its inbox every ${sec} seconds. Users complain chats feel laggy and batteries drain, and 95% of polls return nothing. The NFR says messages and typing indicators should arrive in under a second, in both directions.`,
        answer: 'WebSocket chat servers (stateful connections)',
        hint: 'Bidirectional, frequent, low latency.',
        steps: [
          'Faster polling cuts latency but multiplies empty requests across a billion devices.',
          'SSE is server-to-client only; chat sends constantly in both directions.',
          'Keep a persistent connection per device and push new messages instantly.',
          'Add a routing layer so a server can reach a recipient connected elsewhere; the inbox still backs up missed pushes.',
        ],
        followups: [
          { q: 'What do you take on by switching from polling to persistent connections?', options: ['Keeping a correct device → server map (or pub/sub) as servers come and go, plus reconnect storms on deploys', 'Nothing; it is strictly simpler', 'Losing the inbox', 'Giving up message ordering'], why: 'Polling one inbox shard avoids routing state; that is why some designs accept the latency.' },
          { q: 'Which load-balancing policy suits these chat servers?', options: ['Least connections, keeping each connection pinned to its server', 'Round robin per HTTP request', 'Random per message', 'Hash on message ID'], why: 'Open connections are the scarce resource, and a new server should fill up first.' },
        ],
      };
    },
    (pick) => {
      const sz = pick(['150 MB', '400 MB', '1 GB']);
      return {
        q: `Families send ${sz} videos through the same WebSocket used for text. Chat servers’ network links saturate during evening peaks, “on my way” texts take 4 seconds, and the videos are being stored as rows in the messages table.`,
        answer: 'Pre-signed URLs for media',
        hint: 'Huge payloads and tiny messages shouldn’t share a pipe.',
        steps: [
          'Big uploads take chat-server bandwidth needed for small messages.',
          'The messages table isn’t a blob store.',
          'Issue a pre-signed URL so the client uploads straight to object storage.',
          'Send a normal small message carrying the media reference; recipients download from storage or a CDN.',
        ],
        followups: [
          { q: 'How do you stop users treating chat media as free unlimited storage?', options: ['Expire media after delivery or ~30 days and enforce size quotas', 'Never delete anything', 'Store media in Redis', 'Compress text messages'], why: 'Lifecycle rules and quotas keep storage cost bounded.' },
        ],
      };
    },
  ],
});
