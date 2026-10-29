SG.add({
  id: 'web-request',
  ref: 'B1 B2 B3 B5 B7 B8',
  section: 'Foundations',
  title: 'How a request reaches your server',
  short: 'Web request basics',
  blurb: 'DNS, IP and ports, HTTP and HTTPS: the four layers behind every click.',
  intro: 'When you type a URL and press enter, four things happen: the name becomes an address (DNS), a connection reaches a machine and a program (IP and ports), a request is spoken in a shared language (HTTP), and it’s protected on the way (TLS). Most production bugs at this level live in one of these four.',
  options: {
    'DNS': {
      eli5: 'Your phone’s contact list. You tap “Mom”, the phone looks up her number. DNS turns “amazon.in” into the server’s number (IP address).',
      industry: [
        'Every website uses DNS; providers like Route 53 and Cloudflare answer billions of lookups a day.',
        'Netflix and Hotstar use GeoDNS so users in different countries get the nearest data centre.',
        'Teams migrating servers lower DNS TTLs in advance, so the switch spreads quickly.',
      ],
      def: 'The Domain Name System maps names to records: A (name to IPv4), AAAA (IPv6), CNAME (alias to another name), MX (mail). Answers are cached for their TTL by browsers, OS and resolvers, so changes take up to the TTL to spread.',
      scenarios: [
        'Users still hit an old server after a migration (cached records, TTL)',
        'Routing users to the nearest region with one domain (GeoDNS)',
        'Pointing www and api subdomains at different hosts (CNAME)',
        'Simple failover between data centres at the DNS level',
      ],
      scale: 'Lookups are cached everywhere, so DNS itself rarely limits scale. The trade-off is TTL: long TTL means fewer lookups but slow changes; short TTL means fast failover but more queries.',
    },
    'IP and ports': {
      eli5: 'An IP address is a building’s street address. A port is the flat number inside. The postman needs both to deliver to the right door.',
      industry: [
        'Spring Boot listens on port 8080 by default, Postgres on 5432, Redis on 6379, HTTPS on 443.',
        'Cloud servers often have a private IP (10.x, 172.16–31.x, 192.168.x) reachable only inside the network.',
        'Home routers and cloud NAT gateways let many private machines share one public IP.',
      ],
      def: 'IP routes packets between machines; a port identifies the process on that machine. Private IPs aren’t reachable from the internet; NAT and load balancers bridge them. In the OSI model this is layers 3 (network) and 4 (transport), below HTTP at layer 7.',
      scenarios: [
        'An app runs but nobody outside can reach it (firewall, wrong port, private IP)',
        'Two services clash because they use the same port',
        'Servers need outbound internet without being publicly exposed (NAT)',
      ],
      scale: 'Rarely a scaling limit, often a reachability or security issue. Expose only what’s needed: public load balancer on 443, app servers on private IPs.',
    },
    'HTTP': {
      eli5: 'A shared language for asking and answering. “GET me page 5”, “POST this new order”. The reply always starts with a code: 200 means OK, 404 means not found.',
      industry: [
        'Every REST API (Razorpay, Stripe, GitHub) uses HTTP methods and status codes.',
        'CDNs and browsers decide what to cache by reading HTTP headers.',
        'Retry libraries decide whether a retry is safe from the method (GET/PUT are idempotent, POST is not).',
      ],
      def: 'A request/response protocol. Methods (GET, POST, PUT, PATCH, DELETE) express intent; status codes (2xx success, 3xx redirect, 4xx client error, 5xx server error) express outcome; headers carry metadata (auth, caching, content type). Stateless: each request carries everything needed.',
      scenarios: [
        'Clients can’t tell errors from success because everything returns 200',
        'Retries create duplicates because the method isn’t idempotent',
        'Caches or proxies behave wrongly due to headers',
        'Choosing 400 vs 401 vs 403 vs 404 vs 409',
      ],
      scale: 'Statelessness is what makes HTTP servers easy to scale horizontally. Correct status codes and headers let CDNs, proxies and clients do work for you.',
    },
    'HTTPS and TLS': {
      eli5: 'Sending a letter in a locked box. Only the receiver has the key, and a trusted notary (the certificate authority) has confirmed the receiver is who they claim to be.',
      industry: [
        'Browsers mark plain HTTP sites “Not secure”; app stores require HTTPS for APIs.',
        'Load balancers and Nginx usually terminate TLS, then talk to app servers inside a private network.',
        'Let’s Encrypt gives free certificates, renewed automatically.',
      ],
      def: 'TLS encrypts HTTP traffic and authenticates the server. The handshake verifies the server’s certificate (signed by a trusted CA), agrees on keys, then all data is encrypted. TLS 1.3 needs one round trip for a new connection.',
      scenarios: [
        'Passwords or tokens could be read on public Wi-Fi',
        'Users must be sure they’re talking to the real server',
        'Deciding where TLS terminates (load balancer vs app)',
      ],
      scale: 'The handshake costs a round trip and CPU, so reuse connections (keep-alive) and terminate TLS at the load balancer or edge.',
    },
  },
  scenarios: [
    (pick) => {
      const h = pick([6, 12, 24]);
      return {
        q: `You moved your app to a new server with a new IP and updated the DNS record. ${h} hours later, some users still reach the old server. The record’s TTL was ${h * 2} hours.`,
        answer: 'DNS',
        hint: 'Who remembers the old address, and for how long?',
        steps: [
          'The new record is correct, yet some users see the old IP.',
          'Resolvers and devices cache records until the TTL expires.',
          `A ${h * 2}-hour TTL means caches can serve the old IP for up to ${h * 2} hours.`,
          'This is DNS caching.',
        ],
        followups: [
          { q: 'How should you plan the next migration?', options: ['Lower the TTL (e.g. to 60s) a day before, migrate, then raise it again', 'Set the TTL to zero forever', 'Ask users to restart their phones', 'Change the domain name'], why: 'TTL changes only apply after old caches expire, so lower it ahead of time.' },
        ],
      };
    },
    (pick) => {
      const where = pick(['café Wi-Fi', 'airport Wi-Fi', 'a hotel network']);
      return {
        q: `Your login page sends the password over plain HTTP. A security tester on ${where} captured a user’s password with a packet sniffer.`,
        answer: 'HTTPS and TLS',
        hint: 'The data was readable on the way.',
        steps: [
          'Plain HTTP travels as readable text.',
          'Anyone on the same network can capture it.',
          'TLS encrypts the traffic and proves the server’s identity.',
          'Serve everything over HTTPS.',
        ],
        followups: [
          { q: 'What does the TLS certificate prove?', options: ['That a trusted CA verified this server owns the domain', 'That the server has no bugs', 'That the user’s password is strong', 'That the data is stored encrypted'], why: 'Certificates are about identity in transit, not storage or code quality.' },
        ],
      };
    },
    (pick) => {
      const port = pick([8080, 3000, 5000]);
      return {
        q: `Your Spring Boot app runs fine on the cloud VM (curl localhost:${port} works there), but nobody on the internet can open it. The VM only has a 10.0.x.x address.`,
        answer: 'IP and ports',
        hint: 'Look at the address and the door number.',
        steps: [
          'The process runs, so the code is fine.',
          '10.0.x.x is a private IP: not routable from the internet.',
          `Port ${port} must also be allowed by the firewall/security group.`,
          'Fix reachability: public IP or load balancer, and open the right port.',
        ],
        followups: [
          { q: 'What’s the production-grade way to expose it?', options: ['A public load balancer on 443 forwarding to the app’s private IP and port', 'Give every app server a public IP and open all ports', 'Run the app on port 80 as root', 'Share the private IP with users'], why: 'Keep app servers private; expose one hardened entry point.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['order', 'user', 'product']);
      return {
        q: `Your API returns 200 OK with a body like {"error": "${what} not found"} for every failure. Mobile clients show blank screens, and the CDN cached an error response for an hour.`,
        answer: 'HTTP',
        hint: 'What’s the first thing any client or proxy reads in a response?',
        steps: [
          'Clients and caches trust the status code before the body.',
          '200 tells them everything worked, so they cache and render it.',
          `A missing ${what} should be 404; bad input 400; server failure 500.`,
          'Use HTTP semantics correctly.',
        ],
        followups: [
          { q: 'A logged-in user tries to open another user’s invoice. Which status code?', options: ['403 Forbidden (or 404 to hide that it exists)', '401 Unauthorized', '400 Bad Request', '500 Internal Server Error'], why: '401 means “who are you?” (not authenticated); 403 means “I know you, but no”.' },
        ],
      };
    },
    (pick) => {
      const c = pick(['India, Europe and the US', 'Asia and South America', 'India and Australia']);
      return {
        q: `You run servers in ${c}. Everyone uses the same domain, but each user should be sent to the nearest region automatically.`,
        answer: 'DNS',
        hint: 'Which step happens before any connection is made?',
        steps: [
          'Routing must happen before a connection exists.',
          'GeoDNS answers the same name with different IPs by the user’s location.',
          'Users connect straight to the nearest region.',
          'This is a DNS solution.',
        ],
        followups: [
          { q: 'Which record type points app.example.com at another hostname like lb-123.aws.com?', options: ['CNAME', 'A', 'MX', 'TXT'], why: 'A maps to an IP; CNAME aliases one name to another; MX is for mail.' },
        ],
      };
    },
    () => ({
      q: 'On a slow network, the mobile app’s “Place order” request timed out and the app retried automatically. The customer was charged twice.',
      answer: 'HTTP',
      hint: 'Which methods are safe to repeat?',
      steps: [
        'The first request probably succeeded; only the response was lost.',
        'POST is not idempotent: repeating it creates a new order.',
        'Retries are only automatically safe for idempotent methods, or with an idempotency key.',
        'This is about HTTP method semantics.',
      ],
      followups: [
        { q: 'How do you make the order POST safe to retry?', options: ['Client sends an Idempotency-Key header; the server stores it and returns the original result on repeats', 'Turn off retries everywhere', 'Use GET instead of POST', 'Add a 5-second sleep before retrying'], why: 'Idempotency keys are how Stripe and Razorpay make payment APIs retry-safe.' },
      ],
    }),
  ],
});
