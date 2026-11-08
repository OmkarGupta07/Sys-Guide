SG.add({
  id: 'case-ratelimiter',
  ref: 'S2',
  section: 'HLD case studies',
  title: 'Design a rate limiter',
  short: 'Rate limiter',
  blurb: 'An end-to-end distributed limiter: where it sits, who it counts, shared atomic state, failures and live rule changes.',
  intro: 'You already know the algorithms (token bucket is the usual pick); this case study is about everything around them. The functional requirements are short: identify the client, allow or reject against configurable rules, and return a clear 429 with headers. The NFRs shape the design: each check adds under ~10 ms, the limiter handles ~1M requests/s, and it stays available, so slightly stale rules or counts are acceptable. That leads to five decisions: enforce at the gateway, identify clients in layers, keep buckets in sharded Redis updated atomically with Lua, decide what happens when Redis fails, and push rule changes instead of polling.',
  options: {
    'Rate limit at the API gateway': {
      eli5: 'A bouncer at the club door turns troublemakers away before they get in, instead of security guards chasing them around the dance floor.',
      industry: [
        'Kong, Envoy, NGINX and AWS API Gateway enforcing per-key and per-route limits at the edge.',
        'Cloudflare and Akamai rate-limiting rules applied before traffic reaches the origin.',
        'Regional gateways placed close to users, each with its own nearby Redis.',
      ],
      def: 'Enforce limits in the component every request already passes through (API gateway or load balancer), before routing to any service. Limits held in each service’s memory have no global view, and a separate limiter service adds a network hop on every request; the edge avoids both. The catch is limited context: the gateway sees only what’s in the request (headers, path, IP, JWT claims), so attributes like a premium tier must be carried in the token.',
      scenarios: [
        'Every request must be checked with minimal extra latency',
        'Abusive traffic should be stopped before it costs backend CPU',
        'Many microservices need the same limits enforced in one place',
      ],
      scale: 'Gateways scale horizontally; their check cost is one Redis round trip (~0.5–2 ms in the same data centre with pooled connections). Keep Redis in the same region and zone as the gateway.',
    },
    'Layered client identity (user, API key, IP)': {
      eli5: 'A society gate guard knows residents by flat number, delivery partners by company badge, and strangers only by face, and gives each a different allowance.',
      industry: [
        'GitHub: 5,000 requests/hour per authenticated token, 60/hour per IP for anonymous calls.',
        'Stripe and OpenAI limits per API key and organisation, with tiers by plan.',
        'Login and OTP endpoints limited per IP, per account and per phone number at once.',
      ],
      def: 'Decide what “a client” is per rule: user ID from the JWT for logged-in traffic, API key for developers and partners, IP (or device fingerprint) for anonymous traffic, often several at once (per user AND per IP AND per endpoint). Higher tiers get bigger buckets. IP alone is weak: carrier-grade NAT puts thousands of mobile users behind one IP, and attackers rotate IPs.',
      scenarios: [
        'Mixed anonymous, logged-in and partner traffic on the same API',
        'Plans or tiers with different limits',
        'Abuse that hops between accounts from one IP, or between IPs on one account',
      ],
      scale: 'Each identity dimension adds one bucket (one key) per check. Two or three dimensions per request is typical, so plan Redis operations accordingly.',
    },
    'Shared Redis buckets with Lua scripts': {
      eli5: 'All the ticket windows at a railway station look at one shared seat chart, and only one clerk may tick and update a seat at a time, so no seat is sold twice.',
      industry: [
        'Token buckets stored as Redis hashes (tokens, last_refill), updated by one Lua script per check.',
        'Redis Cluster sharding buckets by client key across 16,384 hash slots.',
        'Envoy’s global rate-limit service and similar backends keeping counters in Redis.',
      ],
      def: 'Bucket state lives in a shared in-memory store so every gateway instance sees the same counts. The read-refill-decide-write sequence must be atomic, otherwise two gateways read “1 token left” and both allow; a Lua script runs the whole sequence inside Redis in one step. Shard by client key (Redis Cluster hash slots) because one node can’t hold the whole load, and add replicas for failover.',
      scenarios: [
        'Many gateway instances must enforce one global limit per client',
        'Concurrent requests from one client race on the same bucket',
        'Load exceeds what one Redis node can serve',
      ],
      scale: 'One Redis node does ~100K ops/s; a check with a read and a write is ~2 ops, so ~50K checks/s per node. 1M checks/s ÷ 50K = 20 shards, plus headroom, so 25–30. Memory is tiny: tens of bytes per bucket.',
    },
    'Fail-safe mode with local fallback': {
      eli5: 'If the society’s visitor register goes missing, the guard doesn’t let everyone in or lock the gate. He keeps a rough tally on a notepad until the register is back.',
      industry: [
        'Gateways falling back to per-instance in-memory limits when the shared store is unreachable.',
        'Envoy’s failure_mode_deny setting, which explicitly picks fail-open or fail-closed.',
        'Login/OTP limiters failing closed (security), general read APIs failing open or degrading.',
      ],
      def: 'Decide up front what happens when the limiter’s state store is unreachable. Fail open lets everything through: the site stays up, but fragile backends are unprotected and can cascade. Fail closed rejects everything: backends are safe, but the product is down. A practical middle ground is local, per-gateway approximate limits (limit ÷ number of gateways) until Redis recovers, plus replicas so a shard failover takes seconds. Security-sensitive endpoints usually fail closed.',
      scenarios: [
        'A Redis shard or the network to it fails',
        'Backends behind the limiter can’t survive unthrottled traffic',
        'Some endpoints (login, OTP, payments) must never be left unprotected',
      ],
      scale: 'Async replica promotion takes seconds and may lose a few counts; letting a client get a handful of extra requests is an acceptable price for availability.',
    },
    'Push-based dynamic rules (etcd/ZooKeeper watch)': {
      eli5: 'Instead of every shopkeeper calling the market office every minute to ask “any new rules?”, the office announces changes on the loudspeaker the moment they happen.',
      industry: [
        'Rules stored in etcd, ZooKeeper or Consul; gateways watch keys and reload in memory.',
        'Envoy and Istio receiving configuration through streaming xDS pushes.',
        'Feature-flag and config services (LaunchDarkly-style) streaming updates to SDKs.',
      ],
      def: 'Keep rules (per route, per tier, per tenant) in a configuration store. Each gateway loads them into memory at start-up and subscribes to changes over a long-lived connection, so updates arrive in about a second with no per-request lookup. Rules hardcoded at deploy time need a redeploy to change; polling a database every few seconds is slow and wastes CPU; reading rules from Redis on every check adds latency.',
      scenarios: [
        'Ops must throttle an abusive tenant right now',
        'Different limits per plan, endpoint or customer that change often',
        'Rule lookups must not add latency to every request',
      ],
      scale: 'Rules are small (KBs to a few MB) and change rarely, so they fit in every gateway’s memory. Watches cost one connection per gateway.',
    },
  },
  scenarios: [
    (pick) => {
      const rps = pick(['1 million', '500,000', '2 million']);
      const ms = pick(['10', '5', '15']);
      return {
        q: `Interviewer: “Rate-limit our social app’s public API: 100M daily users, about ${rps} requests per second.” You propose these NFRs: each check adds under ${ms} ms, the limiter scales to that load, and it prefers availability. Which design decision does the latency NFR push you towards first?`,
        answer: 'Rate limit at the API gateway',
        hint: 'Count the network hops each placement adds to a normal request.',
        steps: [
          'Limits held in each service’s memory are fast but have no global view, so clients get N× their limit.',
          'A separate limiter service called by every service adds a full extra hop per request.',
          'Enforcing at the gateway, which every request already crosses, adds only one Redis round trip.',
          'So place the limiter at the gateway and keep Redis close to it.',
        ],
        followups: [
          { q: 'Why choose availability over consistency for a rate limiter?', options: ['Briefly stale rules or counts are fine; a limiter that blocks while rules propagate takes the product down', 'Counts must be exact, like a ledger', 'Availability doesn’t apply to backend components', 'Consistency would make it faster'], why: 'Letting a few extra requests through for a few seconds is harmless; refusing all traffic isn’t.' },
          { q: 'Which phrasing of the latency NFR is interview-ready?', options: ['“Rate-limit checks add under 10 ms to each request”', '“The system should be low latency”', '“Fast”', '“Latency is not important for internal components”'], why: 'Say what is fast and give a number; then the design can be held to it.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['10', '20', '40']);
      return {
        q: `Your limiter keeps token buckets in each gateway’s memory. With ${n} gateway instances behind a round-robin load balancer, a scraper limited to 100 requests/minute actually gets about ${n}00 through. You move buckets to Redis, but under bursts two gateways still both allow the “last” token.`,
        answer: 'Shared Redis buckets with Lua scripts',
        hint: 'Shared state fixes the first bug; what fixes the race?',
        steps: [
          'Per-instance buckets multiply the limit by the number of instances.',
          'A shared Redis bucket gives every gateway the same count.',
          'Read → refill → decide → write from two gateways interleaves, so both allow.',
          'Run the whole check as one Lua script so Redis executes it atomically.',
        ],
        followups: [
          { q: 'At 1M checks/s with ~2 Redis ops per check, how many shards do you need?', options: ['About 20 at ~100K ops/s each, plus headroom, sharded by client key', 'One large node is enough', 'Two, one per availability zone', '1,000, one per gateway'], why: '1M × 2 ops ÷ 100K ops/node ≈ 20; hashing on client ID sends each client to exactly one shard.' },
          { q: 'Why shard by client ID rather than spread a client’s keys randomly?', options: ['Each check must find that client’s bucket on one known node, atomically', 'Random spreading is faster', 'Redis can’t shard', 'So every node holds every bucket'], why: 'Atomic Lua scripts run on one node; the key decides which node.' },
        ],
      };
    },
    (pick) => {
      const isp = pick(['a mobile carrier', 'a large campus Wi-Fi', 'an office proxy']);
      return {
        q: `Your API limits everyone to 100 requests/minute per IP. Thousands of real users behind ${isp} share one public IP and get 429s every evening, while a paying partner with an API key is throttled like an anonymous visitor.`,
        answer: 'Layered client identity (user, API key, IP)',
        hint: 'Who exactly is the “client” for each kind of traffic?',
        steps: [
          'IP is a poor identity: NAT groups many users together, and attackers rotate IPs.',
          'Use the user ID from the JWT for logged-in users and the API key for partners.',
          'Keep a looser per-IP rule for anonymous traffic, and stack rules where needed.',
          'Give each tier its own bucket size.',
        ],
        followups: [
          { q: 'Premium users get 10× limits, but the gateway can’t query the user database. How does it know?', options: ['Put the plan/tier as a claim in the signed JWT the gateway already validates', 'Call the user service on every request', 'Guess from the IP', 'Give everyone premium limits'], why: 'The edge only sees the request, so the request has to carry the context.' },
        ],
      };
    },
    (pick) => {
      const svc = pick(['GPU inference service', 'search cluster', 'legacy billing API']);
      return {
        q: `One of 20 Redis shards holding token buckets dies for 40 seconds. Behind the gateway is a ${svc} that falls over above 2× normal load. If you let everything through it collapses; if you reject everything for 5% of users, they see the app as down.`,
        answer: 'Fail-safe mode with local fallback',
        hint: 'Neither open nor closed is good here; is there something in between?',
        steps: [
          'Fail open risks a cascading failure of the fragile backend.',
          'Fail closed turns a cache outage into a user-visible outage.',
          'Fall back to approximate per-gateway in-memory limits until the shard recovers.',
          'Add replicas so failover is quick; keep login/OTP endpoints fail-closed.',
        ],
        followups: [
          { q: 'Redis replicas replicate asynchronously. What do you lose on failover?', options: ['A few recent bucket updates, so a client may get a few extra requests, which is acceptable', 'All buckets', 'Nothing, ever', 'Rules configuration'], why: 'You chose availability; slightly lenient counts are the trade-off.' },
        ],
      };
    },
    (pick) => {
      const who = pick(['a scraping bot', 'a misbehaving tenant', 'a partner’s runaway script']);
      return {
        q: `At 2 a.m. ${who} is hammering one endpoint. Limits are hardcoded in the gateway build, so changing them means a 25-minute redeploy. A teammate suggests the gateways poll the rules table every second; there are 300 gateway instances.`,
        answer: 'Push-based dynamic rules (etcd/ZooKeeper watch)',
        hint: 'Rules change rarely but must apply quickly, and lookups must not slow down every request.',
        steps: [
          'Hardcoded rules are too slow to change.',
          'Polling every second wastes CPU and database load, and still lags.',
          'Store rules in etcd/ZooKeeper; gateways load them into memory and watch for changes.',
          'Changes are pushed within about a second, with no per-request lookup.',
        ],
        followups: [
          { q: 'Why not read the rules key from Redis on every rate-limit check?', options: ['It adds an extra operation and latency to every request for data that rarely changes', 'Redis can’t store rules', 'It’s more consistent, so it’s better', 'Gateways have no memory'], why: 'Keep hot-path work minimal; cache rarely changing config in memory.' },
        ],
      };
    },
    (pick) => {
      const city = pick(['Tokyo', 'Mumbai', 'São Paulo']);
      return {
        q: `Users in ${city} hit your regional gateway, but all token buckets live in one Redis cluster in us-east-1. Each check now adds ~180 ms and opens a new TCP connection. Your NFR was under 10 ms.`,
        answer: 'Rate limit at the API gateway',
        hint: 'Placement covers geography as well as which component.',
        steps: [
          'The check sits on the hot path, so its round trip is paid on every request.',
          'Run regional gateways, each with its own Redis in the same region and zone.',
          'Use pooled, persistent connections to skip handshakes per check.',
          'Limits become per-region, which is usually acceptable.',
        ],
        followups: [
          { q: 'What should a throttled client receive?', options: ['HTTP 429 with limit/remaining/reset headers and Retry-After, returned immediately', 'HTTP 500', 'A queued request answered minutes later', 'A silent drop'], why: 'Fail fast with clear headers so well-behaved clients back off; queueing interactive calls only builds backlog.' },
        ],
      };
    },
  ],
});
