SG.add({
  id: 'case-chat',
  ref: 'S3',
  section: 'HLD case studies',
  title: 'Design WhatsApp',
  short: 'Chat app',
  blurb: 'Persistent connections, guaranteed delivery to offline devices, cross-server routing and media without clogging chat servers.',
  intro: 'Functional scope: create 1:1 and group chats, send and receive messages, send media, and receive messages that arrived while offline. The NFRs drive everything else: deliver within ~500 ms to online users, never lose a message, scale to billions of users (hundreds of chat servers at ~1–2M connections each), keep as little data on the server as possible for privacy, and tolerate failures. The design follows from those: persistent WebSocket/TLS connections, a durable per-device inbox that is cleared on acknowledgment, a lightweight pub/sub layer to reach users connected to other servers, pre-signed uploads for media, and deleting messages once delivered.',
  options: {
    'WebSocket chat servers (stateful connections)': {
      eli5: 'Like keeping a phone call open with a friend instead of hanging up and redialling every time you want to say something; either side can talk at any moment.',
      industry: [
        'WhatsApp keeps a long-lived TLS connection per device; its Erlang servers famously held ~2M connections each.',
        'Slack, Discord and Messenger web clients use WebSockets for real-time events.',
        'Connections are spread with least-connections load balancing so new servers fill up first.',
      ],
      def: 'Each device keeps one persistent, bidirectional connection to a chat server. The server keeps an in-memory map of user/device → socket and pushes messages instantly. Polling can’t hit sub-second delivery cheaply, and SSE is one-way. Because servers are stateful, the load balancer must keep a connection pinned to its server (L4, or L7 with WebSocket upgrade) and balance by connection count.',
      scenarios: [
        'Messages must arrive in under a second in both directions',
        'Typing indicators and receipts flow constantly',
        'Millions of mostly idle but always-connected devices',
      ],
      scale: '1–2M connections per tuned server, so a billion online devices needs roughly 500–1,000 chat servers. Connections, not CPU, are usually the limiting resource.',
    },
    'Durable inbox with client ACKs': {
      eli5: 'Like a courier who keeps the parcel in the depot until you sign for it. If you’re not home, it waits; once you sign, it’s off the books.',
      industry: [
        'WhatsApp stores undelivered messages server-side until each device acknowledges them.',
        'Messages table plus per-recipient (per-device) inbox rows in DynamoDB/Cassandra.',
        'Signal and iMessage delivering offline queues when a device reconnects.',
      ],
      def: 'On send, the server writes the message and one inbox row per recipient device in one transaction, then tries live delivery. The device ACKs each message ID; only then is its inbox row deleted. On reconnect, the server drains that device’s inbox. This gives at-least-once delivery, so clients dedupe by message ID. Keying the inbox by device, not user, means a phone and a laptop each get every message.',
      scenarios: [
        'Recipients are often offline or switching networks',
        '“A message must never be lost” is a stated NFR',
        'Users have several devices that must each receive everything',
      ],
      scale: 'A DynamoDB transaction holds up to 100 items, which caps a group-plus-devices fan-out per transaction (or forces batching). Inbox rows are short-lived, so the table stays small.',
    },
    'Redis Pub/Sub for cross-server routing': {
      eli5: 'Like an office intercom: you don’t need to know which floor your colleague sits on, you just announce their name and whoever is near them passes it on.',
      industry: [
        'Chat servers subscribe to a channel per connected user and publish to the recipient’s channel.',
        'Used for presence and typing events, where losing one is harmless.',
        'Alternative designs: consistent-hash users to servers with a registry in ZooKeeper/etcd.',
      ],
      def: 'When a device connects, its chat server subscribes to a channel named for that user or device. To deliver, the sender’s server publishes to the recipient’s channel and Redis forwards it to whichever server is subscribed. Pub/Sub is at-most-once, which is acceptable because the durable inbox is the real guarantee. A Kafka topic per user doesn’t work (billions of heavyweight topics); consistent hashing works but makes scaling events painful and can leave hot servers.',
      scenarios: [
        'Sender and recipient are connected to different chat servers',
        'Chat servers are added and removed often',
        'You want simple least-connections balancing instead of fixed user-to-server ownership',
      ],
      scale: 'Every chat server connects to every Redis node (N×M connections); the Redis tier just relays tiny messages, so a modest cluster handles it.',
    },
    'Pre-signed URLs for media': {
      eli5: 'Instead of handing your big sofa to the postman who also carries letters, you get a gate pass to drive it straight to the warehouse, then post a note saying where it is.',
      industry: [
        'WhatsApp and Messenger uploading photos/videos to blob storage, then sending only a reference.',
        'S3/GCS pre-signed PUT URLs with short TTLs, issued by the chat server.',
        'Media expiry and storage quotas so users don’t treat chat as free cloud storage.',
      ],
      def: 'The client asks the chat server for an upload URL, uploads the file directly to object storage, then sends a normal small chat message containing the media reference. Recipients download from storage or a CDN. This keeps multi-hundred-MB uploads off the chat servers, whose job is many tiny messages, and off the database, which is not built for blobs.',
      scenarios: [
        'Users send videos and photos of tens to hundreds of MB',
        'Chat server bandwidth is needed for small, latency-sensitive messages',
        'Media should expire after delivery or a fixed period',
      ],
      scale: 'Object storage handles any size and throughput; a pre-signed URL costs the server one signing call. Expire media after ~30 days or once every recipient has downloaded it.',
    },
    'Minimal server-side retention': {
      eli5: 'A post office that shreds the envelope after delivering the letter. It never keeps a pile of everyone’s mail, so nobody can ask for it later.',
      industry: [
        'WhatsApp deletes messages from its servers once delivered; content is end-to-end encrypted.',
        'Undelivered messages are dropped after about 30 days.',
        'Privacy rules (GDPR/DPDP) making stored data a liability rather than an asset.',
      ],
      def: 'Treat stored messages as a liability: delete a message once every recipient device has acknowledged it, and run a cleanup job that removes anything older than a fixed limit (e.g. 30 days) using a timestamp index. Race conditions in cleanup are bounded by that hard limit. This also caps storage, because most messages are delivered within seconds.',
      scenarios: [
        'Privacy is a headline promise of the product',
        'Message volume would otherwise grow without limit',
        'Offline devices must still get messages within a reasonable window',
      ],
      scale: '1B users × 100 messages/day × 1 KB ≈ 100 TB/day; keeping only undelivered messages (bounded at 30 days) keeps the store at hundreds of TB instead of growing forever.',
    },
  },
  scenarios: [
    (pick) => {
      const users = pick(['2 billion', '1 billion', '500 million']);
      return {
        q: `Interviewer: “Design WhatsApp for ${users} users.” You list your NFRs: online delivery under 500 ms, guaranteed delivery even if the recipient’s phone is off for a day, high throughput, minimal stored data, fault tolerance. Which decision is what actually satisfies “guaranteed delivery”?`,
        answer: 'Durable inbox with client ACKs',
        hint: 'A live connection can’t deliver to a phone that’s switched off.',
        steps: [
          'Live push alone loses messages for offline or disconnected devices.',
          'Persist the message and an inbox row per recipient device before trying delivery.',
          'Delete the inbox row only when that device ACKs the message ID.',
          'Drain the inbox when the device reconnects, so delivery is guaranteed (at least once).',
        ],
        followups: [
          { q: 'Given the inbox, why is at-most-once Redis Pub/Sub acceptable for live delivery?', options: ['The inbox is the guarantee; Pub/Sub only speeds up the common online case', 'Pub/Sub is actually exactly-once', 'Lost messages are fine in chat', 'Clients never go offline'], why: 'A dropped real-time push is redelivered from the inbox on the next sync.' },
          { q: 'Why does the 500 ms NFR rule out simple polling?', options: ['Polling often enough for sub-second delivery would hammer servers with empty requests from billions of devices', 'Polling can’t carry text', 'HTTP doesn’t work on mobile', 'Polling is always slower than 5 seconds'], why: 'Persistent connections are what make sub-second delivery affordable at this scale.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['50', '200', '800']);
      return {
        q: `You scaled to ${n} chat servers behind a least-connections load balancer. Alice is connected to server 3 and Bob to server 17. Alice’s message is saved, but Bob only sees it after reopening the app. A teammate proposes one Kafka topic per user.`,
        answer: 'Redis Pub/Sub for cross-server routing',
        hint: 'Server 3 doesn’t hold Bob’s socket. How does it reach whoever does?',
        steps: [
          'Each server knows only its own sockets, so delivery needs a routing layer between servers.',
          'Kafka isn’t built for billions of tiny, short-lived topics.',
          'Each chat server subscribes to channels for its connected users; senders publish to the recipient’s channel.',
          'Redis Pub/Sub relays it to Bob’s server in milliseconds.',
        ],
        followups: [
          { q: 'What is the main drawback of consistent-hashing users to fixed chat servers instead?', options: ['Adding servers forces users to reconnect and needs careful orchestration; hot servers can appear', 'It can’t route messages at all', 'It needs Kafka', 'It loses durability'], why: 'Fixed ownership turns every scaling event into a migration.' },
        ],
      };
    },
    (pick) => {
      const sz = pick(['150 MB', '400 MB', '1 GB']);
      return {
        q: `Families send ${sz} videos through the same WebSocket used for text. Chat servers’ network links saturate during evening peaks, and “on my way” texts now take 4 seconds. Videos are also being stored as rows in the database.`,
        answer: 'Pre-signed URLs for media',
        hint: 'Huge payloads and tiny messages shouldn’t share a pipe.',
        steps: [
          'Big uploads take chat-server bandwidth needed for small messages.',
          'The database isn’t a blob store.',
          'Issue a pre-signed URL so the client uploads straight to object storage.',
          'Send a normal small message carrying the media reference; recipients download directly.',
        ],
        followups: [
          { q: 'How do you stop users treating chat media as free unlimited storage?', options: ['Expire media after delivery or ~30 days and enforce size quotas', 'Never delete anything', 'Store media in Redis', 'Compress text messages'], why: 'Lifecycle rules and quotas keep storage cost bounded.' },
        ],
      };
    },
    (pick) => {
      const sec = pick(['3', '5', '10']);
      return {
        q: `A prototype has clients call GET /messages every ${sec} seconds and POST to send. Users complain chats feel laggy, battery drain is high, and 95% of polls return nothing. The NFR says delivery under 500 ms, with frequent traffic in both directions.`,
        answer: 'WebSocket chat servers (stateful connections)',
        hint: 'Bidirectional, frequent, low latency.',
        steps: [
          'Polling trades latency for wasted requests; faster polling multiplies the waste.',
          'SSE is server-to-client only, but chat sends constantly in both directions.',
          'A persistent connection per device lets the server push instantly.',
          'Use stateful chat servers with a connection map.',
        ],
        followups: [
          { q: 'Which load-balancing policy suits these chat servers?', options: ['Least connections, keeping each connection pinned to its server', 'Round robin per HTTP request', 'Random per message', 'Hash on message ID'], why: 'Open connections are the scarce resource, and a new server should fill up first.' },
        ],
      };
    },
    (pick) => {
      const days = pick(['forever', 'for 5 years', 'indefinitely']);
      return {
        q: `Today every message is kept ${days} on your servers. Legal flags this as a privacy risk, and storage grows by roughly 100 TB per day (1B users × 100 messages × 1 KB). The product promise is that the company can’t read or hand over old chats.`,
        answer: 'Minimal server-side retention',
        hint: 'Data you don’t keep can’t leak or be subpoenaed.',
        steps: [
          'Stored messages are a liability as well as a cost.',
          'Delete a message once every recipient device has ACKed it.',
          'A cleanup job removes anything older than a hard cap (e.g. 30 days) via a timestamp index.',
          'Storage now holds only undelivered messages.',
        ],
        followups: [
          { q: 'Cleanup and delivery race, and a message could linger a little longer. Is that a problem?', options: ['No: the hard 30-day cap bounds it', 'Yes: use a distributed transaction for every delete', 'Yes: keep everything instead', 'No: messages never race'], why: 'A simple backstop is better than heavy coordination for rare edge cases.' },
        ],
      };
    },
    (pick) => {
      const dev = pick(['laptop', 'tablet', 'second phone']);
      return {
        q: `Users can now link a ${dev} alongside their phone. After an hour offline, the ${dev} shows gaps: messages the phone already received never arrive there. Your inbox rows are keyed by user ID.`,
        answer: 'Durable inbox with client ACKs',
        hint: 'Who acknowledges, the person or the device?',
        steps: [
          'The phone’s ACK deleted the user-level inbox row, so the other device never got it.',
          'Introduce a client/device entity and key inbox rows and channels by device ID.',
          'Each device ACKs independently; a message is cleaned up after the last device ACKs.',
          'Cap linked devices to keep fan-out bounded.',
        ],
        followups: [
          { q: 'A group of 100 members with 3 devices each means 300 inbox rows per message. What constraint bites?', options: ['Transaction size limits (e.g. 100 items in DynamoDB), so batch writes or cap group size and devices', 'None at all', 'WebSocket frame size', 'Redis memory'], why: 'Device fan-out multiplies write volume; product limits keep it bounded.' },
        ],
      };
    },
  ],
});
