SG.add({
  id: 'replication',
  ref: 'F8 F9 F12',
  section: 'Data and storage',
  title: 'Replication and read replicas',
  short: 'Replication',
  blurb: 'One leader or many, wait for copies or not, and what users see when copies lag.',
  intro: 'Replication keeps copies of data on several machines for availability, read scaling and locality. The design choices are who accepts writes, and whether a write waits for copies. Each choice has a failure story interviewers will ask about.',
  options: {
    'Leader-follower': {
      eli5: 'One teacher writes on the board; students copy into their notebooks. Anyone can read a notebook, but only the teacher writes.',
      industry: [
        'PostgreSQL and MySQL primary with read replicas (AWS RDS/Aurora).',
        'MongoDB replica sets with one primary.',
        'Kafka partitions have one leader and follower replicas.',
      ],
      def: 'All writes go to one leader, which streams changes to followers. Reads can go to followers. On leader failure, a follower is promoted (failover).',
      scenarios: [
        'Read-heavy apps that need more read capacity',
        'A standby copy for fast failover',
        'Running reports away from the primary',
      ],
      scale: 'Write capacity is still one machine. Followers lag behind the leader with async replication.',
    },
    'Multi-leader': {
      eli5: 'Two shops in different cities each keep their own register and sync totals every night. Both can sell, but they may both sell the last item.',
      industry: [
        'Multi-region databases accepting writes in each region (e.g. MySQL group replication setups, CouchDB).',
        'Offline-first apps where each device is a leader that syncs later.',
        'Collaborative editing, where every client edits locally.',
      ],
      def: 'Several nodes accept writes and replicate to each other. Writes are fast locally and survive a region outage, but concurrent writes to the same data conflict and need resolution (last-write-wins, merging, CRDTs).',
      scenarios: [
        'Users in several regions must write with low latency',
        'Each region must keep accepting writes if another is cut off',
        'Offline-capable clients that sync later',
      ],
      scale: 'Conflict resolution is the hard part. Avoid it for data like balances unless conflicts are designed away.',
    },
    'Leaderless (quorum)': {
      eli5: 'You give your message to any 3 of 5 friends. Later you ask any 3 of them what it said; at least one of them definitely heard the latest version.',
      industry: [
        'Amazon Dynamo’s design, Cassandra and ScyllaDB.',
        'Tunable consistency: write ONE for speed, QUORUM for safety.',
        'Read repair and hinted handoff heal stale replicas.',
      ],
      def: 'Any replica accepts reads and writes. With N replicas, writes wait for W acks and reads query R replicas; if R + W > N, reads overlap the latest write. Highly available, no failover step.',
      scenarios: [
        'Always-writable systems that tolerate node failures without failover',
        'Huge write volume across many nodes',
        'Per-query trade-off between consistency and latency',
      ],
      scale: 'Scales writes across nodes. Weak spots: conflict handling and reasoning about consistency.',
    },
    'Synchronous replication': {
      eli5: 'The teacher doesn’t move on until at least one student confirms they copied the line. Slower, but nothing written is ever lost if the teacher faints.',
      industry: [
        'AWS RDS Multi-AZ synchronously replicates to a standby.',
        'Payment ledgers configure synchronous standbys in PostgreSQL.',
        'Raft-based databases (etcd, CockroachDB) commit after a majority acks.',
      ],
      def: 'A write is acknowledged only after at least one replica (or a majority) has it. No data loss on leader failure, at the cost of higher write latency and stalls if replicas are slow. Async replication is the opposite trade-off.',
      scenarios: [
        'Zero data loss on failover (money, orders)',
        'Strong consistency for reads from replicas',
        'Compliance requirements for durability',
      ],
      scale: 'Adds a network round trip to every write; cross-region sync replication is slow. Often one sync replica plus async others.',
    },
  },
  scenarios: [
    (pick) => {
      const r = pick(['50:1', '100:1', '200:1']);
      return {
        q: `An e-commerce database has a read:write ratio of ${r}. Varied product and search queries overload the primary, but writes are fine on one machine.`,
        answer: 'Leader-follower',
        hint: 'More read capacity, writes stay in one place.',
        steps: ['Reads are the bottleneck; writes fit on one machine.', 'Keep one leader for writes.', 'Add followers to serve reads.', 'Leader-follower with read replicas.'],
        followups: [
          { q: 'A user updates their address and the next page shows the old one. Why, and fix?', options: ['Replication lag on an async replica; route that user’s reads to the leader for a short time after a write', 'The write failed silently', 'The cache is full', 'The index is missing'], why: 'Read-your-writes consistency is the standard follow-up for replicas.' },
        ],
      };
    },
    (pick) => {
      const r = pick(['India and Europe', 'the US and Singapore', 'Mumbai and Frankfurt']);
      return {
        q: `Users in ${r} must save documents with low latency, and each region must keep accepting edits even if the link between regions goes down for an hour.`,
        answer: 'Multi-leader',
        hint: 'Both regions must accept writes independently.',
        steps: ['Low-latency local writes in each region.', 'Each region must keep writing during a partition.', 'A leader per region, syncing both ways.', 'Multi-leader, with conflict resolution.'],
        followups: [
          { q: 'Both regions edit the same document title during the outage. What happens?', options: ['A write conflict: resolve with last-write-wins, merging, or CRDTs, chosen per data type', 'The database picks randomly and tells nobody', 'Both regions crash', 'It can’t happen'], why: 'Interviewers want you to name the conflict and a resolution strategy.' },
        ],
      };
    },
    (pick) => {
      const n = pick([6, 12, 24]);
      return {
        q: `A ${n}-node cluster stores user activity. Any node may fail at any time, writes must never stop, and there should be no failover step or single leader.`,
        answer: 'Leaderless (quorum)',
        hint: 'No leader to fail over.',
        steps: ['Writes must continue through node failures.', 'No leader, no failover.', 'Write to W replicas, read from R, with R + W > N for overlap.', 'Leaderless (Cassandra/Dynamo style).'],
        followups: [
          { q: 'N = 3. Which setting guarantees reads see the latest write?', options: ['W = 2, R = 2', 'W = 1, R = 1', 'W = 1, R = 2', 'W = 0, R = 3'], why: 'R + W > N means every read set overlaps every write set.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['a payments ledger', 'a stock-trading order book', 'a bank’s account balances']);
      return {
        q: `For ${what}, the leader crashed and a follower took over, but the last 2 seconds of committed transactions were missing on it. That must never happen again.`,
        answer: 'Synchronous replication',
        hint: 'The leader confirmed writes before any copy had them.',
        steps: ['Async replication: committed writes weren’t on the follower yet.', 'Failover lost them.', 'Acknowledge only after a replica (or majority) has the write.', 'Synchronous replication.'],
        followups: [
          { q: 'What’s the cost?', options: ['Higher write latency, and writes stall if the sync replica is slow or down (unless you fall back)', 'Reads become slower', 'More storage only', 'None'], why: 'Durability vs latency is the core replication trade-off.' },
        ],
      };
    },
    () => ({
      q: 'Finance runs heavy reports every hour that slow down checkout. The reports can be a minute behind real-time data.',
      answer: 'Leader-follower',
      hint: 'Move the readers off the primary; slight staleness is fine.',
      steps: ['Heavy reads hurt the primary.', 'Slight staleness is acceptable.', 'Point reports at a follower (read replica).', 'Leader-follower.'],
      followups: [
        { q: 'Reports grow to scanning billions of rows. Next step?', options: ['Move analytics to a warehouse (OLAP) fed by CDC or ETL', 'More replicas forever', 'Bigger primary', 'Run reports less often'], why: 'OLTP replicas aren’t built for big analytics; warehouses are.' },
      ],
    }),
  ],
});
