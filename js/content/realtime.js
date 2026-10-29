SG.add({
  id: 'realtime',
  ref: 'H3',
  section: 'Communication',
  title: 'Polling, long polling, SSE or WebSocket',
  short: 'Real-time updates',
  blurb: 'How fresh data reaches the screen, and what each choice costs at scale.',
  intro: 'Every “live” feature is a choice between asking repeatedly, waiting for an answer, listening to a stream, or opening a two-way line. Decide by direction, frequency and scale.',
  options: {
    'Polling': {
      eli5: 'A kid asks mom “is dinner ready?” every five minutes. Simple, but most answers are “not yet”.',
      industry: [
        'Flipkart/Amazon order status pages refresh on open or every few minutes, because status changes a handful of times a day.',
        'CI dashboards (Jenkins, GitHub Actions UI) poll build status, where a few seconds of delay is harmless.',
        'Email clients using IMAP check for new mail on an interval when push isn’t available.',
      ],
      def: 'The client sends a normal HTTP request on a fixed interval and the server answers immediately, with or without new data. Stateless and cache-friendly, but wastes requests when nothing changed.',
      scenarios: [
        'Data changes rarely (minutes to days) and a short delay is fine',
        'Status pages: refund, passport, delivery estimate',
        'You want the simplest thing that works, with CDN or cache in front',
        'Clients are behind networks that break long-lived connections',
      ],
      scale: 'Cost = users ÷ interval. 100K users polling every 30s ≈ 3.3K req/s, mostly empty. Fine for slow-changing data; wasteful below ~10s intervals.',
    },
    'Long polling': {
      eli5: 'The kid asks once, and mom only replies when dinner is actually ready. Then the kid asks again.',
      industry: [
        'Early Facebook chat and Gmail used long polling before WebSockets were widely supported.',
        'Enterprise tools inside strict corporate proxies still fall back to it (Socket.IO and SignalR do this automatically).',
        'Telegram Bot API offers getUpdates long polling for bots that can’t expose a webhook.',
      ],
      def: 'The client sends a request and the server holds it open until data arrives or a timeout passes, then the client immediately re-requests. Near real-time over plain HTTP.',
      scenarios: [
        'Need near real-time, but WebSocket and streaming are blocked by proxies',
        'Fallback transport for a WebSocket app',
        'Bots or clients that can’t receive inbound connections',
      ],
      scale: 'Each waiting client holds one request. Needs non-blocking servers (Netty, WebFlux, Node) to hold thousands cheaply; thread-per-request servers choke.',
    },
    'SSE': {
      eli5: 'Mom shouts updates from the kitchen. The kid just listens and never has to ask.',
      industry: [
        'ChatGPT and Claude stream answer tokens to the browser with SSE.',
        'Live cricket and stock tickers push score and price updates one way.',
        'Swiggy/Zomato-style rider tracking: the server pushes location, the customer only watches.',
      ],
      def: 'Server-Sent Events: a long-lived HTTP response where the server streams text events to the client. One-way (server to client), with automatic reconnect and last-event-ID built in.',
      scenarios: [
        'Server to client only, frequent updates',
        'Live scores, dashboards, notifications feed, rider on a map',
        'Streaming AI responses token by token',
        'You want push without the complexity of WebSocket',
      ],
      scale: 'One open connection per viewer. Scale with many stateless SSE nodes + pub/sub (Redis, Kafka) to fan events to the node holding each user. Millions of viewers: add an edge/fan-out tier.',
    },
    'WebSocket': {
      eli5: 'A walkie-talkie. Once it’s on, both sides can talk any time, instantly.',
      industry: [
        'WhatsApp Web, Slack and Discord keep a WebSocket for messages, typing and presence.',
        'Multiplayer games and live quiz apps send moves both ways many times a second.',
        'Figma and Google Docs-style collaborative editors stream edits both ways.',
      ],
      def: 'A persistent, full-duplex TCP connection created by upgrading an HTTP request. Both sides send frames at any time with very low overhead.',
      scenarios: [
        'Both client and server send frequently',
        'Chat, typing indicators, presence',
        'Multiplayer games, collaborative editing',
        'Trading terminals where the client also sends orders over the same channel',
      ],
      scale: 'Stateful: each user is pinned to one server. Needs an L7 load balancer that supports upgrades, a session registry (who is on which server) and pub/sub between servers. Plan for reconnect storms.',
    },
  },
  scenarios: [
    (pick) => {
      const app = pick(['Swiggy-like food delivery', 'Ola-like cab', 'courier tracking']);
      const users = pick(['8K', '50K', '2M']);
      const sec = pick([2, 3, 5]);
      return {
        q: `Your ${app} app has ${users} active users. The rider’s location must update on the customer’s map every ${sec} seconds. The customer never sends anything on this screen.`,
        answer: 'SSE',
        hint: 'Who sends data, in which direction, and how often?',
        steps: [
          'Direction: server to client only.',
          `Frequency: every ${sec}s. Polling that fast means ${users} requests every few seconds, mostly wasted.`,
          'Nothing flows back, so a two-way WebSocket is unused capability.',
          'One-way + frequent = SSE.',
        ],
        followups: [
          { q: 'Why not WebSocket? It would also work.', options: ['It would, but two-way is unused. SSE is plain HTTP with built-in reconnect, so infra is simpler', 'WebSocket is slower than SSE', 'WebSocket can’t carry location data', 'SSE uses binary frames so it’s smaller'], why: 'Pick the simplest tool that meets the need. Unused capability is extra cost and complexity.' },
          { q: `${users} customers now hold open connections. How do you scale?`, options: ['Many stateless SSE servers behind an L7 LB, with Redis pub/sub routing each rider’s updates to the server holding that customer', 'One large server with more RAM', 'Store connections in MySQL', 'Switch to polling every second'], why: 'Long-lived connections pin users to servers, so you need a pub/sub layer to route events to the right server.' },
        ],
      };
    },
    (pick) => {
      const app = pick(['WhatsApp-like chat', 'Slack-like team chat', 'customer support live chat']);
      return {
        q: `You’re building a ${app}. Users send and receive messages instantly and see “typing…” indicators.`,
        answer: 'WebSocket',
        hint: 'Does the client also push data often?',
        steps: [
          'Direction: both ways (messages and typing events).',
          'Frequency: many small events per minute.',
          'A new HTTP request per event wastes setup cost and adds latency.',
          'Two-way + frequent = WebSocket.',
        ],
        followups: [
          { q: 'A user’s phone switches from Wi-Fi to 4G mid-chat. What happens?', options: ['The socket drops; the client reconnects with backoff and fetches missed messages since its last message ID', 'Messages are lost, which is acceptable', 'The server keeps the same socket across networks', 'The app switches to SMS'], why: 'Mobile connections are fragile. Design for reconnect + resync instead of assuming the socket survives.' },
          { q: 'User A and user B are connected to different servers. How does A’s message reach B?', options: ['A session registry (Redis) maps user to server, and a broker/pub-sub delivers the message to B’s server', 'Broadcast every message to every connected user', 'A’s phone connects directly to B’s phone', 'Store it and wait for B to poll'], why: 'Same core idea as any stateful connection: you need a routing layer between servers.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['e-commerce order', 'bank refund', 'passport application']);
      const sec = pick([10, 30, 60]);
      return {
        q: `The ${what} status page. The status changes about 3 times over several days. Users open the screen occasionally, and ${sec}-second freshness is fine.`,
        answer: 'Polling',
        hint: 'How often does the data actually change?',
        steps: [
          'Changes are rare: a few times over days.',
          `Users tolerate a ${sec}s delay.`,
          'Holding an open connection per user for this wastes server memory.',
          'Rare changes + tolerant users = simple polling (or fetch on screen open).',
        ],
        followups: [
          { q: 'Why not SSE, so it “feels real-time”?', options: ['Millions of idle open connections for 3 updates over days cost far more than occasional cheap GETs', 'SSE can’t send status text', 'Polling is always faster', 'SSE requires WebSocket underneath'], why: 'Match the tool to the update rate. Real-time is a cost, not a free upgrade.' },
          { q: 'Polling traffic spikes 10x during a sale. Cheapest fix?', options: ['Cache the status response with a short TTL, and send a push notification when it changes', 'Buy 10x the servers', 'Poll more often', 'Move everything to WebSocket'], why: 'Caching absorbs repeated reads; event-based push removes the need to poll quickly.' },
        ],
      };
    },
    (pick) => {
      const app = pick(['internal HR portal', 'bank branch dashboard', 'hospital staff app']);
      return {
        q: `The ${app} must show new alerts within a few seconds. It runs inside a strict corporate network whose proxy kills WebSocket and streaming connections.`,
        answer: 'Long polling',
        hint: 'What does the network actually allow?',
        steps: [
          'Need: near real-time.',
          'Constraint: WebSocket and streaming (SSE) are blocked.',
          'Fast polling would hammer the servers with empty requests.',
          'Long polling uses ordinary request/response, so it passes the proxy and still delivers quickly.',
        ],
        followups: [
          { q: 'What’s the main server-side cost of long polling?', options: ['Each waiting client holds a request open, so you need non-blocking servers to hold many cheaply', 'It can’t carry JSON', 'It isn’t HTTP', 'It only works on Wi-Fi'], why: 'Thread-per-request servers run out of threads. In Java use async servlets, WebFlux or Netty.' },
        ],
      };
    },
    (pick) => {
      const ev = pick(['IPL cricket match', 'election results night', 'stock market opening']);
      const users = pick(['500K', '5M', '20M']);
      return {
        q: `${users} viewers watch a live ${ev} page. Scores update every few seconds. Viewers never send anything.`,
        answer: 'SSE',
        hint: 'Do viewers ever send anything back?',
        steps: [
          'One-way: server to many viewers.',
          'Frequent updates, so polling would be wasteful.',
          'Huge fan-out: the design also needs an edge or fan-out layer.',
          'One-way + frequent = SSE.',
        ],
        followups: [
          { q: `${users} open connections directly on your origin servers. Is that okay?`, options: ['No. Publish once to an edge/fan-out tier that replicates to viewers', 'Yes, one server can handle it', 'Use a bigger database', 'Let viewers read the database directly'], why: 'Fan-out is solved by layering: the origin publishes once, edge nodes copy to viewers.' },
        ],
      };
    },
    (pick) => {
      const g = pick(['multiplayer quiz game', 'online chess', 'shared whiteboard']);
      return {
        q: `A ${g}: each player’s moves must appear on everyone’s screen within 100 ms, and every player is constantly sending moves.`,
        answer: 'WebSocket',
        hint: 'One-way or two-way? How strict is the latency?',
        steps: [
          'Two-way and frequent.',
          'A 100 ms budget leaves no room for a new request per move.',
          'Two-way + low latency = WebSocket (or WebRTC/UDP for fast action games).',
        ],
        followups: [
          { q: 'Two players move at the same instant. Who wins?', options: ['The server is the source of truth: it orders the moves and broadcasts the result', 'Whoever has the faster phone', 'Both moves apply', 'The clients vote'], why: 'Clients are untrusted and unordered. An authoritative server orders events.' },
        ],
      };
    },
  ],
});
