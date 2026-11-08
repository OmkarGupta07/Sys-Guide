SG.add({
  id: 'aws-edge',
  ref: 'O7 O9 O10 O11',
  section: 'Infra and cloud',
  title: 'AWS edge: ALB/NLB, CloudFront, Route 53, API Gateway',
  short: 'AWS edge',
  blurb: 'How requests reach you: DNS, CDN, load balancers and a managed API front door.',
  intro: 'A request to your app usually passes through Route 53 (DNS: which endpoint?), then CloudFront (CDN: can the edge answer from cache?), then a load balancer or API Gateway (who handles it?), and finally your compute. ALB understands HTTP and routes by path or host; NLB moves TCP/UDP packets fast with static IPs; API Gateway adds auth, throttling and API keys for APIs, often in front of Lambda. Choose by protocol layer, latency, features needed at the edge and cost per request.',
  options: {
    'ALB': {
      eli5: 'A receptionist who reads the letter’s subject line and sends it to the right department: billing letters to billing, complaints to support.',
      industry: [
        'Routing /api/orders and /api/payments to different ECS services or EKS pods.',
        'Host-based routing for many subdomains on one load balancer.',
        'HTTPS termination with ACM certificates and AWS WAF in front of web apps.',
      ],
      def: 'The Application Load Balancer works at layer 7 (HTTP/HTTPS, HTTP/2, gRPC, WebSockets). It routes on path, host, headers, query strings and methods to target groups (EC2, IPs, containers, Lambda), terminates TLS, runs health checks and integrates with WAF and Cognito/OIDC authentication.',
      scenarios: [
        'Many microservices behind one entry point with path routing',
        'HTTPS web apps needing WAF and TLS termination',
        'Blue-green or weighted target groups for releases',
      ],
      scale: 'Scales automatically but ramps up over minutes; the default choice for HTTP workloads. Billed per hour plus load-balancer capacity units.',
    },
    'NLB': {
      eli5: 'A fast toll gate that waves cars through by lane number without opening the boot. Very quick, but it doesn’t know what’s inside.',
      industry: [
        'Game servers, IoT and MQTT brokers over raw TCP or UDP.',
        'Static IPs per AZ that partners can whitelist in their firewalls.',
        'Fronting a service exposed to other VPCs via PrivateLink.',
      ],
      def: 'The Network Load Balancer works at layer 4 (TCP, UDP, TLS). It handles millions of requests per second with very low latency, provides one static IP per AZ (or Elastic IPs), preserves client source IPs and supports long-lived connections. It cannot route on HTTP paths or headers.',
      scenarios: [
        'Non-HTTP protocols like TCP or UDP',
        'Clients that require fixed, whitelistable IPs',
        'Extreme throughput or PrivateLink endpoint services',
      ],
      scale: 'Designed for sudden huge spikes without pre-warming; pair with an ALB behind it if you need both static IPs and L7 routing.',
    },
    'CloudFront': {
      eli5: 'Opening small branch shops in every city stocked with your best sellers, so customers don’t travel to the main factory in Mumbai.',
      industry: [
        'Serving images, JS bundles and video from S3 through edge caches near users.',
        'Caching API GET responses for a few seconds to absorb read storms.',
        'Signed URLs or cookies for paid video content; WAF and Shield at the edge.',
      ],
      def: 'Amazon CloudFront is AWS’s CDN, with hundreds of edge locations worldwide (including many Indian cities). It caches content from origins (S3, ALB, any HTTP server) according to cache policies and TTLs, terminates TLS close to users and reuses warm connections to the origin. Origin Access Control keeps S3 buckets private; CloudFront Functions and Lambda@Edge run small logic at the edge.',
      scenarios: [
        'Static assets and media for users spread across regions',
        'Reducing origin load and data transfer cost',
        'Protecting origins with WAF, Shield and private S3 access',
      ],
      scale: 'Cache hit ratio is the key metric; version file names (app.v42.js) instead of relying on invalidations.',
    },
    'Route 53': {
      eli5: 'A telephone directory that can give different numbers depending on where you’re calling from, and skips a number if that office is closed.',
      industry: [
        'Latency-based routing between Mumbai and Singapore deployments.',
        'Failover routing to a DR Region when health checks fail.',
        'Weighted records sending 5% of traffic to a new stack.',
      ],
      def: 'Amazon Route 53 is managed DNS with domain registration and health checks. Routing policies decide which record to return: simple, weighted, latency-based, failover, geolocation, geoproximity, multivalue answer and IP-based. Alias records point apex domains at AWS resources like ALBs and CloudFront at no query cost.',
      scenarios: [
        'Sending users to the nearest or healthiest Region',
        'Gradual traffic shifting between stacks',
        'Country-specific content or data-residency routing',
      ],
      scale: 'Very high availability (AWS offers a 100% SLA). Failover speed is limited by health-check intervals and record TTLs, so keep TTLs short (for example 60 s) on failover records.',
    },
    'API Gateway': {
      eli5: 'A security desk at an office tower: checks your ID, limits how many visitors each company can bring per hour, and then sends you to the right floor.',
      industry: [
        'Serverless APIs: API Gateway in front of Lambda functions.',
        'Partner APIs with API keys, usage plans and per-client throttling.',
        'WebSocket APIs for chat or live updates without managing servers.',
      ],
      def: 'Amazon API Gateway is a managed front door for APIs: REST APIs (feature-rich: API keys, usage plans, request validation, caching, WAF), HTTP APIs (cheaper, lower latency, JWT authorizers) and WebSocket APIs. It handles auth (IAM, Cognito, Lambda authorizers), throttling, CORS and routing to Lambda, HTTP backends or private services via VPC links.',
      scenarios: [
        'Exposing Lambda functions as HTTP APIs',
        'Per-client keys, quotas and throttling for partner APIs',
        'Managed WebSocket connections',
      ],
      scale: 'Default account throttle about 10,000 requests per second per Region (lower in some newer Regions such as Hyderabad), raisable; integration timeout around 29–30 seconds by default; billed per request, so very high steady traffic may be cheaper on an ALB.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick([8, 12, 20]);
      return {
        q: `A quick-commerce company runs ${n} Spring Boot services on ECS. They want one HTTPS entry point where /cart goes to the cart service, /search to search, and so on, plus WAF rules against bots.`,
        answer: 'ALB',
        hint: 'Routing on HTTP paths needs a layer 7 balancer.',
        steps: ['Routing depends on the URL path.', 'Only an L7 load balancer reads paths and hosts.', 'ALB routes to target groups per service and integrates with WAF.', 'ALB.'],
        followups: [
          { q: 'ALB vs NLB in one line?', options: ['ALB: layer 7, routes on HTTP content. NLB: layer 4, fast TCP/UDP with static IPs', 'NLB routes on paths', 'ALB supports UDP', 'They are identical'], why: 'Match the balancer to the protocol layer you need.' },
        ],
      };
    },
    (pick) => {
      const b = pick(['three PSU banks', 'a government payments switch', 'a large telecom partner']);
      return {
        q: `Your UPI-adjacent service must accept TLS connections from ${b} whose firewalls only allow traffic to a fixed list of IP addresses. Traffic is TCP with long-lived connections.`,
        answer: 'NLB',
        hint: 'Fixed IPs and layer 4.',
        steps: ['Partners whitelist IPs, so the entry point needs static addresses.', 'ALB IPs change; NLB gives a static IP or Elastic IP per AZ.', 'Long-lived TCP/TLS connections suit layer 4.', 'NLB.'],
        followups: [
          { q: 'You need static IPs AND path-based routing. What works?', options: ['NLB in front with an ALB as its target', 'Assign Elastic IPs to an ALB', 'Use Route 53 only', 'Not possible on AWS'], why: 'NLB supports ALB-type targets for this exact case.' },
        ],
      };
    },
    (pick) => {
      const c = pick(['Guwahati, Kochi and Jaipur', 'tier-2 and tier-3 cities across India', 'India, the Gulf and Southeast Asia']);
      return {
        q: `An OTT app serves posters, JS bundles and video segments from an S3 bucket in Mumbai. Users in ${c} complain of slow loads, and S3 data-transfer costs are climbing.`,
        answer: 'CloudFront',
        hint: 'Serve static content close to users.',
        steps: ['Content is static and requested repeatedly.', 'Every request travels to one Region.', 'A CDN caches it at edge locations near users and offloads the origin.', 'CloudFront.'],
        followups: [
          { q: 'How do you stop people bypassing CloudFront and reading the S3 bucket directly?', options: ['Keep the bucket private and allow only CloudFront via Origin Access Control', 'Make the bucket public', 'Rename the bucket', 'Use a bigger TTL'], why: 'OAC lets only your distribution read the origin.' },
          { q: 'You deploy a new app.js but users still get the old one. Best long-term practice?', options: ['Version file names (content hash) so each deploy uses new URLs', 'Invalidate everything every minute', 'Disable caching', 'Set TTL to one year with the same name'], why: 'Immutable, versioned assets avoid invalidation games.' },
        ],
      };
    },
    (pick) => {
      const r = pick(['Singapore', 'Frankfurt', 'Hyderabad']);
      return {
        q: `A SaaS company runs active stacks in Mumbai and ${r}. Each user should hit whichever Region gives them lower latency, and if one Region’s health checks fail, all traffic should go to the other.`,
        answer: 'Route 53',
        hint: 'The decision happens at DNS lookup time.',
        steps: ['Choosing a Region per user is a DNS decision.', 'Latency-based routing returns the lowest-latency Region.', 'Attach health checks so unhealthy Regions are skipped.', 'Route 53.'],
        followups: [
          { q: 'Which routing policy sends exactly 10% of traffic to a new stack?', options: ['Weighted', 'Geolocation', 'Simple', 'Multivalue'], why: 'Weights split traffic proportionally.' },
          { q: 'A law requires Indian users to be served from India only. Which policy?', options: ['Geolocation', 'Latency-based', 'Weighted', 'Failover'], why: 'Latency can change; geolocation follows the user’s location.' },
        ],
      };
    },
    (pick) => {
      const n = pick([40, 100, 250]);
      return {
        q: `A credit-score startup exposes its API to ${n} partner fintechs. Each partner needs its own key, a monthly quota and per-second throttling, and the backend is a set of Lambda functions.`,
        answer: 'API Gateway',
        hint: 'Keys, quotas and throttling per client in front of Lambda.',
        steps: ['Backends are Lambda functions.', 'Per-partner keys, quotas and throttles are needed.', 'API Gateway REST APIs offer usage plans and API keys.', 'API Gateway.'],
        followups: [
          { q: 'Are API keys enough to authenticate partners?', options: ['No, they identify clients for usage plans; use IAM, OAuth/JWT or mTLS for real authentication', 'Yes, they are strong secrets', 'Keys replace TLS', 'Keys encrypt the payload'], why: 'API keys are for metering, not security.' },
          { q: 'HTTP API vs REST API in API Gateway?', options: ['HTTP API: cheaper and faster with fewer features. REST API: usage plans, API keys, request validation, caching', 'HTTP API supports more features', 'REST API is WebSocket only', 'No difference'], why: 'Pick HTTP API unless you need REST-only features.' },
        ],
      };
    },
    () => ({
      q: 'A live cricket-score app wants to push ball-by-ball updates to browsers over persistent connections. The team runs everything on Lambda and doesn’t want to manage connection servers.',
      answer: 'API Gateway',
      hint: 'Managed persistent connections for a serverless backend.',
      steps: ['Push updates need persistent two-way connections.', 'Lambda alone can’t hold connections.', 'API Gateway WebSocket APIs keep connections and invoke Lambda per message.', 'API Gateway.'],
      followups: [
        { q: 'How does the backend send a message to one connected client?', options: ['Post to the connection’s ID through the API Gateway management (callback) API', 'Open a socket from Lambda to the browser', 'Use DNS', 'Email the client'], why: 'Store connection IDs (for example in DynamoDB) and post to them.' },
      ],
    }),
  ],
});
