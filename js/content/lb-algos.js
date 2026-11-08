SG.add({
  id: 'lb-algos',
  ref: 'D3 D5 D6',
  section: 'Scaling',
  title: 'Load balancing algorithms',
  short: 'Load balancing',
  blurb: 'Taking turns, weighting by size, picking the least busy, or keeping a user or key on one server.',
  intro: 'A load balancer spreads requests across servers, checks their health, and removes broken ones; it can sit between any two tiers (clients and app servers, app servers and caches, caches and databases). The algorithm decides who gets the next request: taking turns is often enough, weights handle unequal servers, least connections handles uneven work, and hashing keeps a user or key on the server that already has its data. Two more choices come up in interviews. L4 balancers route on IP and port without reading the request, so they are faster; L7 balancers read paths, headers and cookies, so they can route smarter. And the balancer itself must not be a single point of failure: run a pair active-passive (a standby takes over on a missed heartbeat) or active-active (both serve, more throughput, but per-balancer state is split).',
  options: {
    'Round robin': {
      eli5: 'Dealing cards: one to each player in turn, round and round.',
      industry: [
        'Default in Nginx, HAProxy and most cloud load balancers.',
        'Stateless API fleets of identical instances.',
        'DNS round robin spreads traffic across several IPs (crudely).',
      ],
      def: 'Send each new request to the next server in order. Simple and fair when servers are identical and requests cost about the same.',
      scenarios: [
        'Identical servers, short and similar requests',
        'A sensible default before you have data',
      ],
      scale: 'Breaks down when requests vary a lot in cost or servers differ in size.',
    },
    'Weighted round robin': {
      eli5: 'Dealing cards, but the bigger player gets two cards each round because they can hold more.',
      industry: [
        'Mixed fleets during hardware upgrades (old small + new large instances).',
        'Canary releases: 5% of traffic to the new version, 95% to the old.',
        'Gradual migration between data centres.',
      ],
      def: 'Round robin where each server has a weight; a server with weight 3 gets three times the requests of weight 1. Used for unequal capacity and for traffic splitting.',
      scenarios: [
        'Servers of different sizes in one pool',
        'Canary or gradual rollouts by percentage',
        'Shifting traffic between regions or versions',
      ],
      scale: 'Weights are static; they don’t react to live load. Combine with health checks.',
    },
    'Least connections': {
      eli5: 'At the bank, you join the counter with the shortest queue, not just the next counter in line.',
      industry: [
        'WebSocket and long-polling servers where connections last minutes or hours.',
        'APIs mixing quick reads with slow report exports.',
        'Available in HAProxy, Nginx Plus and AWS ALB (least outstanding requests).',
      ],
      def: 'Send the next request to the server with the fewest active connections (or outstanding requests). Adapts to uneven request durations. A close cousin, lowest response time, picks the server with the best running-average latency; both keep live state on the balancer, which gets split if two balancers run active-active.',
      scenarios: [
        'Request durations vary widely',
        'Long-lived connections (WebSocket, streaming)',
        'Some servers get stuck with slow requests under round robin',
      ],
      scale: 'Needs the balancer to track live connections; slightly more overhead, much better balance for uneven work.',
    },
    'IP hash (sticky)': {
      eli5: 'Every time you visit the café, the same waiter serves you because the host assigns waiters by your table number.',
      industry: [
        'Legacy apps that keep sessions in server memory.',
        'Cookie-based sticky sessions on AWS ALB.',
        'Hashing a user ID header at L7 so each user returns to the server that knows them.',
      ],
      def: 'Hash a client attribute (IP, cookie, user ID) to pick a server, so the same client lands on the same server. Keeps affinity, but load can be uneven and a server failure moves its users.',
      scenarios: [
        'A server holds per-user state that can’t be moved yet',
        'Routing a key to the server that has it cached',
        'Temporary fix while making servers stateless',
      ],
      scale: 'Uneven if many users share an IP (offices, mobile carriers). Plain modulo hashing reshuffles everyone when servers change; consistent hashing limits that.',
    },
    'Consistent hashing': {
      eli5: 'Houses around a circular road, each served by the next post office clockwise. Open a new post office and only the houses just before it switch; everyone else keeps their postman.',
      industry: [
        'Routing keys to cache nodes in Memcached clients, Envoy ring-hash and Nginx “hash … consistent”.',
        'Cassandra and DynamoDB placing data partitions on a ring of nodes.',
        'Keeping a user on the same app server so its local cache stays warm, without breaking when servers are added.',
      ],
      def: 'Place servers (as many virtual nodes each) and keys on a hash ring; a key goes to the first server clockwise from it. Adding or removing a server moves only the keys on one arc, about 1/N of them, whereas hash mod N remaps almost every key when N changes and empties every cache at once. Use it when servers hold per-key state such as cached data; it can run at L4 (hash the client IP) or L7 (hash a user ID or URL).',
      scenarios: [
        'Each cache node holds different keys and requests must reach the right one',
        'Servers are added or removed often, e.g. autoscaling for a sale',
        'Per-server local caches should stay warm for the same users',
      ],
      scale: 'Adding the 11th node moves ~9% of keys instead of ~90% with mod N; 100–200 virtual nodes per server keep the load within a few percent of even.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick([4, 6, 10]);
      return {
        q: `${n} identical stateless API servers. Every request is a quick JSON lookup taking about 20 ms.`,
        answer: 'Round robin',
        hint: 'Servers are equal, requests are equal.',
        steps: ['Identical servers.', 'Uniform, short requests.', 'Taking turns spreads load evenly.', 'Round robin.'],
        followups: [
          { q: 'One server crashes. How does the load balancer avoid it?', options: ['Health checks: it stops routing to servers that fail a periodic check', 'It can’t; users see errors until a human fixes it', 'DNS updates automatically', 'Clients retry forever'], why: 'Health checks are part of every load balancer design answer.' },
        ],
      };
    },
    (pick) => {
      const big = pick([2, 3]);
      return {
        q: `Your pool has ${big} new 16-core servers and 4 old 4-core servers. With equal turns, the small ones max out while the big ones idle.`,
        answer: 'Weighted round robin',
        hint: 'Capacity differs per server.',
        steps: ['Servers have unequal capacity.', 'Equal turns overload the small ones.', 'Give the 16-core servers ~4x the weight.', 'Weighted round robin.'],
        followups: [
          { q: 'You want 5% of users on the new release first. How?', options: ['Weighted routing: 5% weight to the new version’s servers, then increase', 'Deploy to all servers at once', 'Ask 5% of users to update', 'Use IP hash'], why: 'Weighted routing is how canary releases are done at the load balancer.' },
        ],
      };
    },
    (pick) => {
      const s = pick([30, 60, 120]);
      return {
        q: `Most requests take 50 ms, but report exports take up to ${s} seconds. With round robin, some servers pile up exports and get slow while others sit idle.`,
        answer: 'Least connections',
        hint: 'Requests are not equal in cost.',
        steps: ['Request durations vary hugely.', 'Round robin ignores how busy a server is.', 'Send new work to the server with the fewest active requests.', 'Least connections.'],
        followups: [
          { q: 'A better long-term fix for slow exports?', options: ['Move exports to a background job queue and return a download link later', 'Bigger servers', 'Longer timeouts', 'Block exports'], why: 'Slow work belongs off the request path.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['200K', '1M']);
      return {
        q: `A chat service holds ${n} WebSocket connections that stay open for hours. Newer servers end up with far fewer connections than older ones.`,
        answer: 'Least connections',
        hint: 'Connections are long-lived. What should decide where a new one goes?',
        steps: ['Long-lived connections accumulate unevenly.', 'New connections should go where load is lowest.', 'Least connections balances live counts.'],
        followups: [
          { q: 'You deploy and restart a server holding 50K sockets. What happens?', options: ['50K clients reconnect at once; spread it with jittered backoff and gradual draining', 'Nothing', 'Clients wait for that exact server', 'Messages are re-sent twice'], why: 'Reconnect storms are a classic WebSocket scaling issue.' },
        ],
      };
    },
    () => ({
      q: 'A legacy Java app keeps login sessions in each server’s memory. Rewriting session handling will take two months, but you need 3 servers next week.',
      answer: 'IP hash (sticky)',
      hint: 'Users must keep hitting the server that knows them, for now.',
      steps: ['Session state is local to each server.', 'A user must return to the same server.', 'Sticky routing (IP hash or cookie) keeps affinity.', 'Temporary: plan to move sessions to Redis.'],
      followups: [
        { q: 'A whole office of 2,000 users shares one public IP. Problem with IP hash?', options: ['They all land on the same server; use cookie-based stickiness instead', 'No problem', 'The office can’t connect', 'HTTPS breaks'], why: 'NAT makes many users look like one IP.' },
      ],
    }),
    (pick) => {
      const n = pick([5, 10, 20]);
      return {
        q: `${n} cache servers each hold different keys. Requests for a key should go to the server that already has it, and adding a server shouldn’t reshuffle every key.`,
        answer: 'Consistent hashing',
        hint: 'Route by a hash of the key, in a way that survives a change in server count.',
        steps: ['Each key lives on one server.', 'Hashing the key sends it to the same server every time.', 'With hash mod N, changing N remaps nearly every key.', 'A hash ring moves only ~1/N of keys: consistent hashing.'],
        followups: [
          { q: 'Why not hash(key) % N?', options: ['Changing N remaps almost every key, causing a cache miss storm', 'Modulo is too slow', 'It only works with strings', 'Nothing is wrong with it'], why: 'Consistent hashing moves only ~1/N of keys when a server is added.' },
          { q: 'With 3 physical nodes on the ring, one node gets 50% of keys. Fix?', options: ['Give each node many virtual nodes spread around the ring', 'Use mod N instead', 'Add a bigger node', 'Hash every key twice'], why: 'Virtual nodes smooth out uneven arcs.' },
        ],
      };
    },
    (pick) => {
      const from = pick([8, 12, 16]);
      return {
        q: `${from} app servers each keep a local in-memory cache of user profiles, and the load balancer routes by hash(userId) mod ${from}. For a sale you autoscale to ${from + 4} servers, and the cache hit rate drops from 92% to 10% while the database melts.`,
        answer: 'Consistent hashing',
        hint: 'How many users changed servers when N changed?',
        steps: [
          'Mod N sends almost every user to a different server once N changes.',
          'Every local cache goes cold at once and the database takes the misses.',
          'A hash ring moves only the users on the new servers’ arcs.',
          'Route by consistent hashing on the user ID.',
        ],
        followups: [
          { q: 'The user ID is in a request header. Which kind of load balancer can hash on it?', options: ['L7: it parses the HTTP request, at some CPU cost', 'L4: it reads headers faster', 'DNS round robin', 'Any balancer; headers are visible at the IP layer'], why: 'L4 sees only IPs and ports; reading headers, paths or cookies needs L7.' },
        ],
      };
    },
    (pick) => {
      const rps = pick(['50K', '120K', '200K']);
      return {
        q: `A single load balancer handles ${rps} requests/s in front of 30 identical servers, and every request is a cheap, similar lookup. Last month it crashed and the whole site was down for 20 minutes although every app server was healthy. You add a second balancer and both will serve traffic. Which routing policy should they run?`,
        answer: 'Round robin',
        hint: 'Which policy needs no state that the two balancers would have to share?',
        steps: [
          'Two balancers in active-active each see only their own half of the traffic.',
          'Policies that track connection counts or response times then work from split, partial state.',
          'Requests here are cheap and alike, so round robin balances just as well with no state at all.',
          'Run round robin on both, behind one virtual IP, with health checks on the servers.',
        ],
        followups: [
          { q: 'When would you choose active-passive over active-active for the balancers?', options: ['When one balancer can carry all the traffic and you want simple failover with all routing state in one place', 'When you need double the throughput', 'When there are no health checks', 'Never; active-passive cannot fail over'], why: 'A passive standby (heartbeats via ZooKeeper or keepalived) is simpler; active-active buys throughput.' },
          { q: 'You need maximum throughput and only IP and port routing. Which layer?', options: ['L4: it forwards connections without decoding the request, so it is faster', 'L7, because it is always faster', 'L7, because L4 can’t balance TCP', 'Neither; use DNS only'], why: 'L4 skips parsing; L7 trades speed for content-aware routing.' },
        ],
      };
    },
  ],
});
