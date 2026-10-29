SG.add({
  id: 'transport',
  ref: 'B4 B6 B9',
  section: 'Foundations',
  title: 'TCP, UDP and HTTP versions',
  short: 'Transport protocols',
  blurb: 'Reliable or fast, one request at a time or many at once.',
  intro: 'Under every request is a transport choice. TCP guarantees order and delivery, UDP trades that for speed, and HTTP/2 and HTTP/3 change how many requests share one connection. Connection reuse matters as much as the protocol.',
  options: {
    'TCP': {
      eli5: 'A registered courier. Every parcel is numbered, signed for, and resent if lost. Safe and in order, but slower to start.',
      industry: [
        'HTTP/1.1 and HTTP/2, databases (Postgres, MySQL), Kafka and SSH all run on TCP.',
        'Connection pools (HikariCP, HTTP client pools) reuse TCP connections to skip setup cost.',
        'Payment and banking traffic relies on TCP’s ordered, complete delivery.',
      ],
      def: 'Connection-oriented transport: a 3-way handshake, then ordered, reliable byte streams with retransmission, flow control and congestion control. A lost packet delays everything after it on that connection (head-of-line blocking).',
      scenarios: [
        'Every byte must arrive, in order (payments, files, database traffic)',
        'Most request/response APIs',
        'High request rates where reusing connections (keep-alive, pooling) saves latency',
      ],
      scale: 'Setup costs a round trip (plus TLS). At thousands of requests per second, always reuse connections: keep-alive and connection pools.',
    },
    'UDP': {
      eli5: 'Throwing paper planes with notes. Fast and simple, but some may get lost or arrive out of order, and nobody checks.',
      industry: [
        'DNS queries use UDP: tiny request, tiny answer, just retry if lost.',
        'Video calls (Zoom, Meet, WhatsApp calls) and online games: a late packet is useless anyway.',
        'Live streaming protocols and VoIP.',
      ],
      def: 'Connectionless transport: no handshake, no delivery or order guarantee, no retransmission. Lowest latency and overhead; the application handles loss if it cares.',
      scenarios: [
        'Real-time audio/video where late data is worse than lost data',
        'Fast-paced multiplayer games',
        'Tiny request/response exchanges like DNS',
      ],
      scale: 'Very cheap per message and great for fan-out, but you build your own reliability where needed.',
    },
    'HTTP/2': {
      eli5: 'Instead of one checkout line per customer, one cashier serves many customers’ items at once, interleaved, on one counter.',
      industry: [
        'Most major websites and CDNs serve HTTP/2 to browsers.',
        'gRPC is built on HTTP/2 streams.',
        'Pages with many small assets load faster without needing many connections.',
      ],
      def: 'Multiplexes many requests as streams over one TCP connection, with binary framing and header compression. Removes HTTP/1.1’s one-request-at-a-time per connection limit, but a lost TCP packet still stalls all streams.',
      scenarios: [
        'Pages load dozens of small resources',
        'Service-to-service calls with gRPC',
        'Reducing connection count and header overhead',
      ],
      scale: 'One connection per client instead of ~6, so less load on servers and load balancers. Usually just a server/CDN setting.',
    },
    'HTTP/3 (QUIC)': {
      eli5: 'Like HTTP/2, but each customer’s items travel in separate boxes. If one box is delayed, the others still arrive. And the order survives if you change shops mid-way.',
      industry: [
        'Google, YouTube and Cloudflare serve HTTP/3 widely.',
        'Mobile apps on flaky networks benefit most.',
        'Connection migration keeps sessions alive when a phone switches Wi-Fi to 4G.',
      ],
      def: 'HTTP over QUIC, a transport built on UDP with its own reliability per stream, built-in TLS 1.3, faster connection setup, and connection IDs that survive IP changes. Fixes TCP head-of-line blocking.',
      scenarios: [
        'Mobile users on lossy or switching networks',
        'Latency-sensitive global apps',
        'When packet loss is stalling HTTP/2 traffic',
      ],
      scale: 'Mostly enabled at the CDN/edge. Some corporate networks block UDP, so clients fall back to HTTP/2.',
    },
  },
  scenarios: [
    (pick) => {
      const what = pick(['a bank transfer API', 'a file upload service', 'database replication']);
      return {
        q: `You’re choosing the transport for ${what}. Every byte must arrive, in order, and nothing can be silently dropped.`,
        answer: 'TCP',
        hint: 'Which one guarantees delivery and order?',
        steps: ['Completeness and order are mandatory.', 'TCP retransmits lost packets and preserves order.', 'Choose TCP.'],
        followups: [
          { q: 'Your service opens a new TCP + TLS connection for each of 5,000 calls/s to another service, and latency is high. Fix?', options: ['Reuse connections with keep-alive and a connection pool', 'Switch to UDP', 'Add more CPUs', 'Increase timeouts'], why: 'Each new connection costs handshake round trips. Pooling (HikariCP, HTTP client pools) removes that cost.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['a video calling app', 'a fast-paced online shooter game', 'live voice chat']);
      return {
        q: `For ${what}, a packet that arrives 300 ms late is useless. You’d rather skip it and keep going.`,
        answer: 'UDP',
        hint: 'Is waiting for a resend worth it?',
        steps: ['Late data is worse than missing data.', 'TCP would stall everything to resend lost packets.', 'UDP delivers what arrives, immediately.', 'Choose UDP.'],
        followups: [
          { q: 'The game still needs “player bought an item” to never be lost. How?', options: ['Add reliability for those messages only (acks/resend), or send them over a separate reliable channel', 'Switch the whole game to TCP', 'Send it 10 times over UDP and hope', 'Ignore it'], why: 'Real games mix: unreliable for movement, reliable for important events.' },
        ],
      };
    },
    (pick) => {
      const n = pick([60, 80, 120]);
      return {
        q: `A product page loads ${n} small images, scripts and styles. Over HTTP/1.1 the browser opens 6 connections and the rest wait in line. You want them to share one connection in parallel.`,
        answer: 'HTTP/2',
        hint: 'You want many requests interleaved on one connection.',
        steps: [`${n} resources but only 6 at a time on HTTP/1.1.`, 'HTTP/2 multiplexes many streams on one TCP connection.', 'Usually a server/CDN switch, no app change.', 'Choose HTTP/2.'],
        followups: [
          { q: 'Which popular RPC framework runs on HTTP/2?', options: ['gRPC', 'GraphQL', 'SOAP', 'WebSocket'], why: 'gRPC uses HTTP/2 streams for multiplexing and bidirectional streaming.' },
        ],
      };
    },
    (pick) => {
      const loss = pick([2, 3, 5]);
      return {
        q: `Mobile users on 4G see ${loss}% packet loss. With HTTP/2, one lost packet stalls every request on the connection, and switching from Wi-Fi to 4G drops the session.`,
        answer: 'HTTP/3 (QUIC)',
        hint: 'You need streams that don’t block each other, and connections that survive network changes.',
        steps: ['TCP head-of-line blocking stalls all HTTP/2 streams.', 'QUIC handles loss per stream.', 'Connection IDs survive an IP change.', 'Choose HTTP/3.'],
        followups: [
          { q: 'Some corporate users can’t use HTTP/3 at all. Why, and what happens?', options: ['Their network blocks UDP; clients fall back to HTTP/2 over TCP', 'HTTP/3 needs a special browser plugin', 'HTTP/3 only works on Wi-Fi', 'They get a 500 error'], why: 'QUIC runs on UDP, which some firewalls block. Fallback is automatic.' },
        ],
      };
    },
    () => ({
      q: 'A resolver needs to translate a domain name to an IP: one tiny question, one tiny answer. If it’s lost, just ask again.',
      answer: 'UDP',
      hint: 'Is a handshake worth it for one small question?',
      steps: ['One small request/response.', 'A TCP handshake would double the latency.', 'Retrying a lost query is trivial.', 'This is why DNS uses UDP.'],
      followups: [
        { q: 'When does DNS fall back to TCP?', options: ['When the response is too large for a UDP packet (or for zone transfers)', 'Never', 'Always on mobile', 'When the domain is .com'], why: 'Large answers and zone transfers use TCP; the common case is UDP.' },
      ],
    }),
  ],
});
