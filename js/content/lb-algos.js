SG.add({
  id: 'lb-algos',
  ref: 'D3 D5 D6',
  section: 'Scaling',
  title: 'Load balancing algorithms',
  short: 'Load balancing',
  blurb: 'Taking turns, weighting by size, picking the least busy, or keeping a user on one server.',
  intro: 'A load balancer spreads requests across servers, checks their health, and removes broken ones. The algorithm decides who gets the next request; the right one depends on whether servers and requests are alike.',
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
      def: 'Send the next request to the server with the fewest active connections (or outstanding requests). Adapts to uneven request durations.',
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
        'Consistent hashing routes keys to the same cache server.',
      ],
      def: 'Hash a client attribute (IP, cookie, user ID) to pick a server, so the same client lands on the same server. Keeps affinity, but load can be uneven and a server failure moves its users.',
      scenarios: [
        'A server holds per-user state that can’t be moved yet',
        'Routing a key to the server that has it cached',
        'Temporary fix while making servers stateless',
      ],
      scale: 'Uneven if many users share an IP (offices, mobile carriers). Plain modulo hashing reshuffles everyone when servers change; consistent hashing limits that.',
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
        answer: 'IP hash (sticky)',
        hint: 'Route by a hash of the key, consistently.',
        steps: ['Each key lives on one server.', 'Hash-based routing sends a key to the same server every time.', 'Consistent hashing keeps most keys in place when servers change.', 'Hash-based (sticky) routing.'],
        followups: [
          { q: 'Why not hash(key) % N?', options: ['Changing N remaps almost every key, causing a cache miss storm', 'Modulo is too slow', 'It only works with strings', 'Nothing is wrong with it'], why: 'Consistent hashing moves only ~1/N of keys when a server is added.' },
        ],
      };
    },
  ],
});
