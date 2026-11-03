SG.add({
  id: 'cap',
  ref: 'J1 J2 J3 J4',
  section: 'Distributed systems',
  title: 'CAP, PACELC and consistency models',
  short: 'CAP and consistency',
  blurb: 'What really happens when replicas disagree, and the five levels of “consistent”.',
  intro: 'In a distributed system, network partitions will happen, so the real CAP choice is: when replicas can’t talk, do you return an error (consistency) or possibly stale data (availability)? PACELC adds that even when nothing is broken, you trade latency for consistency. Between “strong” and “eventual” sit levels interviewers love: read-your-writes and causal.',
  options: {
    'CP (consistency first)': {
      eli5: 'Two bank branches lose their phone line. Rather than risk paying out the same money twice, both refuse withdrawals until the line is back.',
      industry: [
        'Seat booking, inventory and payments choose CP for the critical path.',
        'ZooKeeper and etcd refuse writes without a majority (quorum).',
        'Google Spanner offers globally strong consistency using synchronized clocks.',
      ],
      def: 'During a partition, nodes that can’t confirm they have the latest data refuse or delay requests. Reads are linearizable (never go back in time). Implemented with a single leader + sync replication, consensus (Raft/Paxos), or majority quorums.',
      scenarios: [
        'Stale reads cause real damage (double booking, overspending)',
        'Locks, leader election, configuration that everyone must agree on',
        'Unique constraints across the system (usernames, seat IDs)',
      ],
      scale: 'Costs availability during failures and latency always (waiting for replicas). Apply only where needed.',
    },
    'AP (availability first)': {
      eli5: 'Two branches of a library lose contact but keep lending books. Their records disagree for a while and get reconciled later.',
      industry: [
        'Cassandra and DynamoDB (default settings) stay writable across failures.',
        'Social feeds, likes, view counts, product catalogues.',
        'DNS and CDNs serve cached, possibly stale answers.',
      ],
      def: 'During a partition, every reachable node keeps answering, possibly with stale data. Replicas converge later (eventual consistency) using techniques like last-write-wins, version vectors, or CRDTs.',
      scenarios: [
        'An error is worse than slightly old data',
        'Read-heavy, globally distributed content',
        'Write-anywhere systems that must survive region outages',
      ],
      scale: 'Scales and survives failures well. You must design for conflicts and for users noticing staleness.',
    },
    'Read-your-writes': {
      eli5: 'You change your WhatsApp profile photo. You must see the new one instantly, or you’ll think it failed. Your friends seeing it a few seconds later is fine.',
      industry: [
        'Profile edits, settings, posting a comment and seeing it immediately.',
        'Routing a user’s reads to the primary for a few seconds after they write.',
        'Session stickiness to the replica that took the write.',
      ],
      def: 'A user always sees their own latest writes, even if other users may still see older data. Weaker than strong consistency, much cheaper, and fixes the most visible staleness bug.',
      scenarios: [
        'A user edits something and immediately views it',
        'Read replicas with replication lag',
        'Eventually consistent systems where only the author needs freshness',
      ],
      scale: 'Implement by reading from the leader after a write, tracking the user’s last write timestamp/version, or caching the user’s own write client-side.',
    },
    'Causal consistency': {
      eli5: 'In a group chat, nobody should ever see “Haha, same!” before the message it’s replying to, even if messages arrive a little late.',
      industry: [
        'Comment threads and chat replies.',
        'Collaborative tools where an edit depends on an earlier edit.',
        'Social apps: a “like” must never appear before the post exists.',
      ],
      def: 'Operations that are causally related (B happened because of A) are seen by everyone in the same order. Unrelated operations may be seen in different orders. Tracked with version vectors or causal metadata.',
      scenarios: [
        'Replies, reactions and follow-ups must not appear before their cause',
        'You don’t need global order, only cause-before-effect',
      ],
      scale: 'Stronger than eventual, weaker and cheaper than strong. Needs dependency tracking.',
    },
    'PACELC (latency vs consistency)': {
      eli5: 'Even on a normal day with no broken phone lines, double-checking with the other branch before answering makes every customer wait a little longer.',
      industry: [
        'DynamoDB lets each read choose strongly consistent (slower, costlier) or eventually consistent.',
        'Cassandra’s consistency level per query (ONE vs QUORUM).',
        'Choosing async replication for speed on normal days.',
      ],
      def: 'If there is a Partition, choose Availability or Consistency; Else (normal operation), choose Latency or Consistency. Captures the everyday cost of strong consistency, which CAP ignores.',
      scenarios: [
        'Deciding per query how fresh data must be',
        'Explaining why strong consistency is slower even without failures',
        'Tuning quorum sizes (R, W) for speed vs freshness',
      ],
      scale: 'Most real decisions are the “ELC” part: everyday latency vs freshness, not partitions.',
    },
  },
  scenarios: [
    (pick) => {
      const what = pick(['the last unit of a limited-edition sneaker', 'seat 14C on a flight', 'a unique username during signup']);
      return {
        q: `The US and EU data centres lose contact. A user in each region tries to claim ${what} at the same moment.`,
        answer: 'CP (consistency first)',
        hint: 'Is serving stale data here harmful?',
        steps: ['Only one claim may succeed.', 'Stale reads would let both succeed.', 'Refuse or delay one side until it can confirm.', 'CP for this operation.'],
        followups: [
          { q: 'What does the user in the cut-off region experience?', options: ['An error or a wait (“try again”) instead of a possibly wrong success', 'An instant success', 'Nothing changes', 'Their data is deleted'], why: 'CP trades availability during the partition for correctness.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['a Netflix movie description', 'a Yelp restaurant’s opening hours', 'a social post’s like count']);
      return {
        q: `A network partition splits your regions. Users in Asia might see ${what} that’s a few minutes out of date until the link recovers.`,
        answer: 'AP (availability first)',
        hint: 'Would users rather see an error page?',
        steps: ['Staleness here is harmless.', 'An error page is worse.', 'Keep serving; reconcile later.', 'AP.'],
        followups: [
          { q: 'Two regions both update the same like count during the partition. How do they reconcile without losing likes?', options: ['A counter CRDT (e.g. per-region counters that are summed)', 'Last write wins on the total', 'Reject both updates', 'Ask the user'], why: 'CRDTs merge concurrent updates mathematically; last-write-wins would drop likes.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['their bio', 'their profile photo', 'a comment they just posted']);
      return {
        q: `A user updates ${what}, the page reloads from a read replica, and their change is missing. Other users seeing the old version for a few seconds is acceptable.`,
        answer: 'Read-your-writes',
        hint: 'Only the author needs to see it immediately.',
        steps: ['Replica lag hides the user’s own write.', 'Others don’t need it instantly.', 'Guarantee the author sees their own writes.', 'Read-your-writes.'],
        followups: [
          { q: 'Simplest implementation?', options: ['Route that user’s reads to the leader for a short window after they write', 'Make all replicas synchronous', 'Disable replicas', 'Add a CDN'], why: 'Targeted fix: only the writer pays the cost, only briefly.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['a reply appears before the comment it answers', 'a “like” notification arrives for a post that doesn’t exist yet', 'an edit to a document appears before the paragraph it edits']);
      return {
        q: `In a globally replicated app, some users see that ${what}. Global ordering of all events isn’t needed.`,
        answer: 'Causal consistency',
        hint: 'Only cause-before-effect ordering matters.',
        steps: ['Effect is visible before its cause.', 'Unrelated events can be in any order.', 'Preserve ordering only for causally related operations.', 'Causal consistency.'],
        followups: [
          { q: 'Which mechanism tracks “happened-before” between replicas?', options: ['Version vectors (or Lamport clocks for a total order)', 'Wall-clock timestamps only', 'Random IDs', 'Hashing'], why: 'Wall clocks drift; logical clocks capture causality.' },
        ],
      };
    },
    (pick) => {
      const p = pick(['DynamoDB', 'Cassandra']);
      return {
        q: `On a normal day with no failures, the team notices strongly consistent reads in ${p} are slower and cost more than eventually consistent ones. A manager asks why, since “nothing is broken”.`,
        answer: 'PACELC (latency vs consistency)',
        hint: 'CAP only talks about partitions. What about normal days?',
        steps: ['No partition is involved.', 'Strong reads must coordinate with more replicas.', 'That costs latency (and money) every time.', 'PACELC: else, latency vs consistency.'],
        followups: [
          { q: 'N = 3 replicas, R = 1, W = 1. What do you get?', options: ['Fast reads and writes, but reads may be stale (R + W ≤ N)', 'Strong consistency', 'No availability', 'Data loss on every write'], why: 'R + W > N is needed for reads to overlap the latest write.' },
        ],
      };
    },
    () => ({
      q: 'A distributed lock service must guarantee that once a lock moves from node A to node B, no client ever again sees A as the holder, even if the leader crashes mid-replication.',
      answer: 'CP (consistency first)',
      hint: 'Reads must never go back in time.',
      steps: ['Locks require everyone to agree on one holder.', 'A stale read could let two clients act as holder.', 'Needs linearizable storage: consensus or a majority quorum.', 'CP.'],
      followups: [
        { q: 'Why isn’t a single leader with async replication enough here?', options: ['If the leader crashes before replicating, a follower can serve an older value: reads go back in time', 'It is enough', 'Leaders can’t store locks', 'Async is always linearizable'], why: 'Linearizability needs agreement before acknowledging, i.e. consensus (Raft, Paxos).' },
      ],
    }),
  ],
});
