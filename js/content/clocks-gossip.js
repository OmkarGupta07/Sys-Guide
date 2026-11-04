SG.add({
  id: 'clocks-gossip',
  ref: 'J8 J9 J14',
  section: 'Distributed systems',
  title: 'Clocks, gossip and the fallacies of distributed computing',
  short: 'Clocks and gossip',
  blurb: 'Why timestamps lie, how nodes learn who’s alive, and the assumptions that break distributed systems.',
  intro: 'Machines don’t share a clock, networks drop and delay messages, and nobody has a global view. These tools let systems order events and spread information anyway, and the fallacies list reminds you what not to assume.',
  options: {
    'Lamport clock': {
      eli5: 'Every letter you send carries a number one higher than any number you’ve seen. You can’t tell real time from it, but you can always put letters in an order everyone agrees on.',
      industry: [
        'Ordering writes in multi-leader or leaderless systems after the fact.',
        'Total ordering of events with a node-ID tiebreak.',
        'The basis for many logical-time ideas in distributed databases.',
      ],
      def: 'A logical counter per node: increment on each event; when receiving a message, set counter = max(local, received) + 1. If A happened before B, A’s timestamp is smaller. Adding node ID as a tiebreaker gives a consistent total order, but it can’t tell whether two events were concurrent.',
      scenarios: [
        'All nodes must agree on one order of events',
        'Wall clocks are unreliable for ordering',
        'Cheap ordering metadata (one number per event)',
      ],
      scale: 'Constant size, but the total order is arbitrary for concurrent events.',
    },
    'Vector clock': {
      eli5: 'Each person keeps a small table: “how many updates have I seen from Asha, Ravi and Meera?”. Comparing two tables shows whether one update came after another, or whether they happened independently.',
      industry: [
        'Amazon Dynamo and Riak detected conflicting versions this way.',
        'Causal consistency in collaborative and offline-first apps.',
        'Version vectors for sync conflict detection.',
      ],
      def: 'A vector of counters, one per node. Comparing two vectors tells you if one happened before the other or if they are concurrent (neither dominates), which signals a conflict to resolve. Size grows with the number of nodes.',
      scenarios: [
        'Detecting concurrent, conflicting updates',
        'Causal ordering (replies after the messages they answer)',
        'Sync between replicas or devices',
      ],
      scale: 'O(nodes) metadata per value; pruned or bounded in practice.',
    },
    'Gossip protocol': {
      eli5: 'A rumour in a village: each person tells a few random friends every minute. Very soon everyone knows, even though nobody announced it centrally.',
      industry: [
        'Cassandra and DynamoDB-style clusters share membership and node health via gossip.',
        'Consul/Serf (SWIM protocol) for failure detection.',
        'Spreading cluster metadata without a central server.',
      ],
      def: 'Each node periodically exchanges state with a few random peers; information spreads epidemically to all nodes in roughly O(log N) rounds. Combined with heartbeats for failure detection (“I haven’t heard from node X”). Decentralized and resilient, eventually consistent.',
      scenarios: [
        'Large clusters need membership and health without a single coordinator',
        'Spreading metadata to thousands of nodes',
        'Failure detection that tolerates node and network failures',
      ],
      scale: 'Scales to thousands of nodes; information takes a few rounds to converge.',
    },
    'Fallacies of distributed computing': {
      eli5: 'Planning a road trip assuming roads never close, traffic never happens, and petrol is free. Plans built on those assumptions fail on the first day.',
      industry: [
        'Outages caused by assuming the network is reliable (no retries/timeouts).',
        'Latency budgets blown by chatty service calls.',
        'Security breaches from trusting internal networks.',
      ],
      def: 'Eight false assumptions: the network is reliable; latency is zero; bandwidth is infinite; the network is secure; topology doesn’t change; there is one administrator; transport cost is zero; the network is homogeneous. Good designs assume the opposite. Also: wall clocks drift (NTP skew), so never order critical events purely by timestamps.',
      scenarios: [
        'Reviewing a design for hidden network assumptions',
        'Explaining why retries, timeouts and idempotency exist',
        'Using timestamps from different machines to decide order',
      ],
      scale: 'A checklist to run through in every deep dive.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick([3, 5]);
      return {
        q: `${n} replicas accept writes. You need every node to agree on the same total order of all writes after the fact, using minimal metadata, and you accept that ties between concurrent writes are broken arbitrarily.`,
        answer: 'Lamport clock',
        hint: 'One number per event, total order, ties by node ID.',
        steps: ['Need a total order everyone agrees on.', 'Minimal metadata: a single counter.', 'Concurrent ties broken by node ID.', 'Lamport clock.'],
        followups: [
          { q: 'What can a Lamport clock NOT tell you?', options: ['Whether two events were concurrent', 'That a happened-before b implies a smaller timestamp', 'A consistent order', 'Anything'], why: 'Vector clocks are needed to detect concurrency.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['a shopping cart edited on phone and laptop while offline', 'a note edited on two devices at once', 'a profile updated in two regions during a partition']);
      return {
        q: `You need to detect when ${what} produced two versions where neither includes the other, so the app can merge or ask the user.`,
        answer: 'Vector clock',
        hint: 'Detect concurrency, not just order.',
        steps: ['Need to know if versions conflict.', 'Per-node counters show if one version dominates.', 'Neither dominates = concurrent = conflict.', 'Vector clock.'],
        followups: [
          { q: 'Amazon’s Dynamo paper used this for the shopping cart. How were conflicts resolved?', options: ['The client merged versions (union of cart items)', 'Last write wins always', 'The cart was deleted', 'The server picked randomly'], why: 'Application-level merges keep data rather than silently dropping it.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['500', '1,000', '3,000']);
      return {
        q: `A ${n}-node storage cluster must let every node know which nodes are alive and what ranges they own, without a central server that could fail.`,
        answer: 'Gossip protocol',
        hint: 'Spread information peer to peer.',
        steps: ['Large cluster, no central coordinator wanted.', 'Each node shares state with random peers periodically.', 'Information spreads to all nodes quickly.', 'Gossip protocol.'],
        followups: [
          { q: 'Roughly how fast does gossip reach all N nodes?', options: ['About O(log N) rounds', 'O(N²) rounds', 'One round', 'Never'], why: 'Epidemic spread is why gossip scales.' },
        ],
      };
    },
    () => ({
      q: 'Two servers record payment events using their own System.currentTimeMillis(). One server’s clock is 300 ms ahead, so a refund appears to happen before the payment it refunds.',
      answer: 'Fallacies of distributed computing',
      hint: 'An assumption about time across machines broke.',
      steps: ['Wall clocks on different machines drift.', 'Timestamps from different nodes can’t order causally related events reliably.', 'Use logical clocks, a single sequencer, or causal IDs.', 'A classic distributed-systems fallacy.'],
      followups: [
        { q: 'Which is one of the eight fallacies?', options: ['“Latency is zero”', '“Disks are fast”', '“Java is slow”', '“Users are patient”'], why: 'Others: the network is reliable, bandwidth is infinite, topology doesn’t change…' },
      ],
    }),
    () => ({
      q: 'A design calls 12 internal services in sequence for each request, with no timeouts or retries, because “they’re all in the same data centre, so the network is fast and reliable”.',
      answer: 'Fallacies of distributed computing',
      hint: 'Which assumptions are being made?',
      steps: ['Assumes the network is reliable and latency is zero.', '12 sequential hops multiply latency and failure probability.', 'Add timeouts, retries, parallel calls, fewer hops.', 'Fallacies of distributed computing.'],
      followups: [
        { q: 'If each of 12 services is 99.9% available, roughly what is the chain’s availability?', options: ['About 98.8% (0.999¹²)', '99.9%', '99.99%', '100%'], why: 'Serial dependencies multiply failure probability.' },
      ],
    }),
  ],
});
