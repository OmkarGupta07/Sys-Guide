SG.add({
  id: 'consensus',
  ref: 'J5 J6 J7 J10',
  section: 'Distributed systems',
  title: 'Leader election, consensus and distributed locks',
  short: 'Consensus and locks',
  blurb: 'Getting machines to agree on one leader, one value or one lock holder, even when some fail.',
  intro: 'Some facts must be agreed by every node: who the leader is, who holds a lock, which config is current. Consensus algorithms (Raft, Paxos) provide this using majorities. Coordination services (ZooKeeper, etcd) package it for you. Fencing tokens protect against old leaders that don’t know they’ve been replaced.',
  options: {
    'Raft consensus': {
      eli5: 'A class picks a monitor by majority vote. If the monitor stops showing up, someone calls a new vote. Two monitors can’t both win, because two majorities of the same class always share at least one student.',
      industry: [
        'etcd (Kubernetes’ brain), Consul and CockroachDB use Raft.',
        'Kafka’s KRaft mode replaced ZooKeeper with Raft.',
        'ZooKeeper uses a similar protocol called Zab; Google’s Chubby uses Paxos.',
      ],
      def: 'Nodes elect a leader for a numbered term by majority vote (randomized timeouts avoid split votes). The leader appends commands to a replicated log and commits an entry once a majority has it. A candidate wins only if its log is at least as up to date, so committed entries survive leader changes.',
      scenarios: [
        'Several replicas must agree on an ordered log of changes',
        'Exactly one leader must exist at any time',
        'Strongly consistent metadata that survives node failures',
      ],
      scale: 'Needs a majority alive: 3 nodes tolerate 1 failure, 5 tolerate 2. Every write waits for a majority, so it’s for metadata, not bulk data.',
    },
    'Coordination service': {
      eli5: 'A notary office everyone trusts. It doesn’t store your whole life, just the few important records everyone must agree on.',
      industry: [
        'ZooKeeper for Kafka (older versions), HBase and Hadoop.',
        'etcd storing all Kubernetes cluster state.',
        'Leader election, service registries, config and locks.',
      ],
      def: 'A small, strongly consistent key-value store built on consensus (ZooKeeper, etcd, Consul), offering primitives like ephemeral nodes, watches, leases and compare-and-set. Used for configuration, leader election, membership and locks, not application data.',
      scenarios: [
        'Which node is the leader / which partition lives where',
        'Service membership and health',
        'Configuration that must be identical everywhere',
      ],
      scale: 'Too slow for high-volume application writes; keep it to small, critical metadata.',
    },
    'Distributed lock': {
      eli5: 'A single key to the server room hanging in the office. Whoever has the key works inside; others wait. If someone leaves with the key and vanishes, the key must expire.',
      industry: [
        'Redis SET key value NX PX 30000 for best-effort locks (e.g. avoid duplicate cron runs).',
        'ZooKeeper/etcd locks with leases for correctness-critical cases.',
        'Ensuring only one instance runs a scheduled job.',
      ],
      def: 'Mutual exclusion across machines. Needs an expiry/lease so a crashed holder doesn’t block forever. Redis locks are fast but can be unsafe under failover or long pauses; consensus-based locks are safer. Either way, protect the resource with fencing tokens.',
      scenarios: [
        'Only one worker should run a job at a time across a cluster',
        'Serializing access to an external resource',
        'Avoiding duplicate processing from many instances',
      ],
      scale: 'A lock with a lease can expire while the holder is paused (GC), so two holders may act. That’s why fencing tokens exist.',
    },
    'Fencing token': {
      eli5: 'Each new shift supervisor gets a higher badge number. The warehouse only accepts orders from the highest badge it has seen, so a supervisor from last night’s shift can’t give orders anymore.',
      industry: [
        'Raft terms / epochs reject messages from deposed leaders.',
        'Storage that rejects writes with a lower lock token than the last seen.',
        'Kafka’s controller and leader epochs.',
      ],
      def: 'A monotonically increasing number issued with each lock grant or leadership term. The protected resource remembers the highest token it has seen and rejects requests with older tokens, so a stale holder (e.g. after a long GC pause or network partition) can’t corrupt data.',
      scenarios: [
        'A lock holder may pause and resume after its lease expired',
        'An old leader comes back after a partition',
        'Split-brain protection for a shared resource',
      ],
      scale: 'Requires the resource (database, storage) to check the token on every write.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick([3, 5]);
      return {
        q: `You need ${n} replicas of a configuration store that agree on every change in the same order and keep working if ${(n - 1) / 2} of them fail.`,
        answer: 'Raft consensus',
        hint: 'Ordered agreement with majority voting.',
        steps: ['Replicas must agree on an ordered log.', 'Must tolerate minority failures.', 'Leader-based majority replication.', 'Raft (or Paxos).'],
        followups: [
          { q: 'Why do Raft clusters usually have an odd number of nodes?', options: ['A 4-node cluster tolerates the same 1 failure as a 3-node one; odd sizes maximize fault tolerance per node', 'Even numbers are illegal', 'Odd numbers are faster to hash', 'No reason'], why: 'Majority of 4 is 3, so it still only tolerates 1 failure.' },
          { q: 'Why does Raft use randomized election timeouts?', options: ['So followers don’t all start elections at once and split the vote', 'To save power', 'To encrypt votes', 'To pick the fastest CPU'], why: 'Randomness breaks ties quickly.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['which broker is the controller', 'which partition lives on which node', 'which instance is the active scheduler']);
      return {
        q: `Your cluster must always agree on ${what}. It changes rarely, but a wrong answer would corrupt data. You don’t want to implement consensus yourself.`,
        answer: 'Coordination service',
        hint: 'Small, critical metadata, packaged consensus.',
        steps: ['Small, rarely changing, critical metadata.', 'Must be strongly consistent.', 'Use etcd/ZooKeeper/Consul rather than building Raft.', 'Coordination service.'],
        followups: [
          { q: 'Should you store all user posts in ZooKeeper too?', options: ['No: every write goes through consensus, which is too slow for bulk app data', 'Yes, it’s consistent', 'Yes, it’s a database', 'Only images'], why: 'Use it for coordination, not as your main database.' },
        ],
      };
    },
    (pick) => {
      const n = pick([6, 12, 20]);
      return {
        q: `A nightly billing job runs on all ${n} app instances, so customers are billed ${n} times. Only one instance should run it each night.`,
        answer: 'Distributed lock',
        hint: 'Mutual exclusion across machines.',
        steps: ['Many instances, one job.', 'They need to agree who runs it.', 'Acquire a lock with a lease; others skip.', 'Distributed lock (plus idempotent billing).'],
        followups: [
          { q: 'Why must the lock have an expiry/lease?', options: ['If the holder crashes, the lock must free itself or the job never runs again', 'To make it faster', 'For logging', 'It shouldn’t'], why: 'Locks without leases turn crashes into permanent blocks.' },
        ],
      };
    },
    () => ({
      q: 'A worker holding a lock pauses for 40 seconds in garbage collection. Its 30-second lease expires, another worker takes the lock and writes, then the first worker wakes up and also writes, corrupting the file.',
      answer: 'Fencing token',
      hint: 'The storage must reject the stale holder.',
      steps: ['Leases can expire while a holder is paused.', 'Two holders then act.', 'Each lock grant carries an increasing token; storage rejects older tokens.', 'Fencing token.'],
      followups: [
        { q: 'Where must the fencing token be checked?', options: ['At the protected resource on every write', 'Only in the lock service', 'In the client logs', 'Nowhere'], why: 'Only the resource can stop the stale writer.' },
      ],
    }),
    () => ({
      q: 'After a network partition heals, a former database leader comes back still believing it’s the leader and starts accepting writes, while the cluster has already elected a new leader.',
      answer: 'Fencing token',
      hint: 'Leaders need a number that only goes up.',
      steps: ['Two nodes think they lead: split brain.', 'Each leadership term has a higher epoch number.', 'Followers and storage reject requests from the lower term.', 'Fencing token / term number.'],
      followups: [
        { q: 'In Raft, what plays the role of the fencing token?', options: ['The term number', 'The log length', 'The node’s IP', 'The heartbeat interval'], why: 'Messages with an older term are rejected.' },
      ],
    }),
  ],
});
