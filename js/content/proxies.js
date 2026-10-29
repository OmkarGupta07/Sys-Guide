SG.add({
  id: 'proxies',
  ref: 'B12 D4 D7 H9',
  section: 'Scaling',
  title: 'Proxies, load balancers and API gateways',
  short: 'Proxies and gateways',
  blurb: 'Five middlemen that look alike on a diagram but solve different problems.',
  intro: 'Forward proxies act for clients; reverse proxies act for servers. Load balancers spread traffic at L4 (connections) or L7 (HTTP). API gateways add API-level policies. In interviews, name the one you need and why.',
  options: {
    'Forward proxy': {
      eli5: 'Sending a friend to buy something on your behalf. The shop sees your friend, not you.',
      industry: [
        'Corporate proxies filter and log employee web traffic.',
        'Egress proxies give servers one fixed outbound IP that partners can whitelist.',
        'VPNs and privacy proxies hide the client’s IP.',
      ],
      def: 'Sits in front of clients and makes outbound requests for them. The destination sees the proxy, not the client. Used for filtering, caching, anonymity and controlled egress.',
      scenarios: [
        'Control or log what clients inside a network can access',
        'Outbound calls must come from a fixed IP',
        'Hide client identity',
      ],
      scale: 'Concerned with outbound traffic. Not used to scale your own service.',
    },
    'Reverse proxy': {
      eli5: 'A hotel receptionist. Guests talk to reception, never knocking on staff rooms; reception passes requests to the right person.',
      industry: [
        'Nginx in front of Spring Boot: TLS, gzip, static files, timeouts.',
        'Cloudflare acts as a global reverse proxy for millions of sites.',
        'Hiding internal server addresses and ports.',
      ],
      def: 'Sits in front of servers and accepts client requests for them. Handles TLS termination, compression, caching, static files, and can load-balance. Clients only see the proxy.',
      scenarios: [
        'One entry point in front of an app: TLS, compression, static files',
        'Hide internal servers',
        'Add caching or buffering in front of a slow app',
      ],
      scale: 'Nginx handles tens of thousands of connections per box. Load balancers are a specialised reverse proxy.',
    },
    'L4 load balancer': {
      eli5: 'A traffic cop who only looks at the car’s number plate, not what’s inside, and waves it to a lane. Very fast.',
      industry: [
        'AWS Network Load Balancer for TCP/UDP at millions of requests per second.',
        'Game servers and custom binary protocols.',
        'Fronting databases or MQTT brokers.',
      ],
      def: 'Balances at the transport layer using IPs and ports, without reading HTTP. Very fast, protocol-agnostic, supports TCP/UDP, but can’t route by URL, header or cookie.',
      scenarios: [
        'Non-HTTP protocols (game traffic, MQTT, databases)',
        'Extreme throughput with minimal latency',
        'Static IPs and pass-through TLS',
      ],
      scale: 'Millions of connections with very low overhead. Often placed in front of L7 proxies.',
    },
    'L7 load balancer': {
      eli5: 'A mailroom clerk who opens the envelope, reads “Billing” or “Support”, and sends it to the right team.',
      industry: [
        'AWS ALB routes /api/* and /images/* to different target groups.',
        'Kubernetes Ingress (Nginx, Envoy) routes by host and path.',
        'Header-based routing for A/B tests and canaries.',
      ],
      def: 'Balances at the application layer (HTTP). Can route by path, host, headers or cookies, terminate TLS, and do retries or rewrites. More CPU per request than L4.',
      scenarios: [
        'Route different URLs or hosts to different services',
        'Cookie-based stickiness or header-based canaries',
        'HTTP-aware health checks',
      ],
      scale: 'Plenty for most web traffic. Heavier per request than L4; scale it horizontally.',
    },
    'API gateway': {
      eli5: 'Airport security plus information desk. It checks your boarding pass, limits how many go through, and points you to the right gate.',
      industry: [
        'AWS API Gateway, Kong, Apigee and Spring Cloud Gateway.',
        'Mobile backends with dozens of microservices behind one public API.',
        'Public developer APIs with keys, quotas and usage plans.',
      ],
      def: 'An L7 entry point for APIs that adds cross-cutting policies: authentication (JWT/API keys), rate limiting, request transformation, aggregation, versioning, logging and quotas.',
      scenarios: [
        'Many microservices behind one public entry point',
        'Central auth, rate limits and quotas per API key',
        'Aggregating several backend calls for a client',
      ],
      scale: 'Every request passes through it, so it must scale horizontally. Keep business logic out of it.',
    },
  },
  scenarios: [
    () => ({
      q: 'A partner bank only accepts API calls from whitelisted IPs. Your 40 app servers have changing private IPs and call the bank directly.',
      answer: 'Forward proxy',
      hint: 'This is about outbound calls from your servers.',
      steps: ['The problem is outbound traffic.', 'Route it through a proxy (or NAT gateway) with one fixed public IP.', 'The bank whitelists that IP.', 'Forward (egress) proxy.'],
      followups: [
        { q: 'What’s the difference between forward and reverse proxies in one line?', options: ['Forward acts for clients making outbound requests; reverse acts for servers receiving inbound requests', 'Forward is faster', 'Reverse is only for HTTPS', 'No difference'], why: 'Direction and who it represents: that’s the whole distinction.' },
      ],
    }),
    (pick) => {
      const a = pick(['Spring Boot', 'Node.js', 'Django']);
      return {
        q: `A single ${a} app is exposed directly on port 8080. You want HTTPS, gzip compression, cached static files, and to hide the app server, without changing app code.`,
        answer: 'Reverse proxy',
        hint: 'One thing in front of the app, handling generic web concerns.',
        steps: ['All needs are generic HTTP concerns.', 'Put Nginx in front: TLS, gzip, static files.', 'The app stays private behind it.', 'Reverse proxy.'],
        followups: [
          { q: 'TLS terminates at Nginx. Is traffic from Nginx to the app encrypted?', options: ['Not unless you configure it; usually fine inside a private network, re-encrypt if compliance requires', 'Always', 'Never possible', 'Only with HTTP/3'], why: 'Know where encryption ends; compliance (e.g. PCI) may need end-to-end TLS.' },
        ],
      };
    },
    (pick) => {
      const p = pick(['/api/payments and /api/search', 'shop.example.com and admin.example.com', '/v1/* and /v2/*']);
      return {
        q: `Requests for ${p} must go to different backend services, and you need cookie-based stickiness for one of them.`,
        answer: 'L7 load balancer',
        hint: 'Routing depends on what’s inside the HTTP request.',
        steps: ['Routing by path/host and cookies needs HTTP awareness.', 'L4 can’t see URLs or cookies.', 'An L7 balancer (ALB, Nginx, Envoy) can.', 'L7 load balancer.'],
        followups: [
          { q: 'When would you still put an L4 balancer in front of L7 proxies?', options: ['For huge connection volume, static IPs or DDoS absorption, with L7 behind for routing', 'Never', 'Only for HTTP/1.1', 'To read cookies faster'], why: 'Large systems layer them: fast L4 at the edge, smart L7 behind.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['2M', '5M']);
      return {
        q: `A multiplayer game uses a custom binary protocol over TCP and UDP. ${n} concurrent players need the lowest possible balancing overhead.`,
        answer: 'L4 load balancer',
        hint: 'It isn’t HTTP, and overhead must be minimal.',
        steps: ['Custom protocol: nothing HTTP to inspect.', 'Needs TCP and UDP support.', 'Minimal overhead at millions of connections.', 'L4 load balancer (e.g. NLB).'],
        followups: [
          { q: 'Can an L4 balancer route /login to a different service?', options: ['No: it doesn’t parse HTTP paths', 'Yes', 'Only with HTTPS', 'Only with UDP'], why: 'Path routing is an L7 feature.' },
        ],
      };
    },
    (pick) => {
      const n = pick([15, 30, 50]);
      return {
        q: `${n} microservices sit behind one public mobile API. You need JWT validation, per-client rate limits, API keys for partners, and to combine 3 backend calls into one response for the home screen.`,
        answer: 'API gateway',
        hint: 'These are API policies, not just routing.',
        steps: ['Auth, rate limits, keys and aggregation are API-level concerns.', 'A plain load balancer only routes.', 'An API gateway centralises these policies.', 'API gateway.'],
        followups: [
          { q: 'Should the gateway also calculate order discounts?', options: ['No: keep business logic in services; the gateway handles cross-cutting concerns', 'Yes, it sees every request', 'Only for mobile', 'Only on sale days'], why: 'A gateway full of business logic becomes a bottleneck and a monolith.' },
        ],
      };
    },
    () => ({
      q: 'An office wants all employee web traffic to pass through one point that blocks gambling sites and logs which domains were visited.',
      answer: 'Forward proxy',
      hint: 'It acts for the employees (the clients).',
      steps: ['Traffic goes outbound from clients.', 'The proxy filters and logs on their behalf.', 'Forward proxy.'],
      followups: [
        { q: 'Which middleman would hide your own servers from the internet?', options: ['Reverse proxy', 'Forward proxy', 'DNS', 'A VPN on the client'], why: 'Reverse proxies represent servers; forward proxies represent clients.' },
      ],
    }),
  ],
});
