SG.add({
  id: 'case-leaderboard',
  ref: 'S24',
  section: 'HLD case studies',
  title: 'Design a gaming leaderboard',
  short: 'Leaderboard',
  blurb: 'Show the top 100 and “your rank” among hundreds of millions of players in milliseconds, without letting cheaters win.',
  intro: 'Scope: games report players’ scores after matches; players see the top N, their own rank, and the players just around them, on global, regional, daily, weekly and season boards. The NFRs: rank and top-N reads in tens of milliseconds, very high write bursts (tournament endings), scores visible within a few seconds (eventual consistency is fine for display), durable scores (a crash must not erase anyone’s progress), and integrity, because prizes depend on the board. A relational ORDER BY or COUNT(*) WHERE score > x doesn’t scale to this, so the usual design is: Redis sorted sets per board for O(log n) updates and ranks; sharding plus approximate rank for giant global boards; one key per time window; score writes buffered through a queue into a durable store and then Redis; and server-authoritative validation of every score.',
  options: {
    'Redis sorted set per board': {
      eli5: 'A cricket points table that rearranges itself the instant a team scores, so anyone can ask “what position are we?” and get the answer straight away instead of recounting every team.',
      industry: [
        'ZINCRBY or ZADD to update a score, ZREVRANGE 0 99 for the top 100, ZREVRANK for a player’s rank.',
        '“Players around me”: ZREVRANK, then ZREVRANGE rank−5 rank+5.',
        'Composite scores (points × 10^10 + (MAX_TS − achieved_at)) to break ties in favour of whoever got there first.',
      ],
      def: 'A sorted set keeps members ordered by score using a skip list plus a hash map, so updates, rank lookups and range reads are O(log n) and served from memory in well under a millisecond. Each board is one key, members are player IDs and scores are their points. Because Redis is single-threaded, each command is atomic, so concurrent score updates never interleave badly. Ties need an explicit rule; encoding a time component into the score makes ordering deterministic. Redis is the fast serving layer; the durable record of scores lives elsewhere.',
      scenarios: [
        '“What is my rank?” must answer in milliseconds for millions of players',
        'Show the top 100 and the 10 players around me',
        'Players with equal scores must be ordered by who scored first',
      ],
      scale: 'About 100 bytes per member including overhead: 10M players ≈ 1 GB per board, and a node does 100K+ operations per second.',
    },
    'Sharded boards with approximate rank': {
      eli5: 'For a national exam with crores of students, the board publishes exact marks for toppers, but tells everyone else “you’re in the top 7%”, worked out from how many students fell in each marks band.',
      industry: [
        'Sharding by player hash into N sorted sets, then merging each shard’s top K to get the exact global top K.',
        'A score histogram (count of players per score bucket) to estimate any player’s rank or percentile in O(buckets).',
        'Mobile games showing exact ranks for the top 10,000 and “top 3%” for everyone else.',
      ],
      def: 'One sorted set lives on one Redis node, so a board with hundreds of millions of players can exceed one node’s memory and throughput. Shard players across several sorted sets by hash; the exact global top K is the merge of each shard’s top K, since each player lives in exactly one shard. Exact rank for an arbitrary player would need a count from every shard, so for most players use an approximate rank from a histogram of scores (or sum of ZCOUNT across shards when exactness matters). Alternatively shard by score range, which gives exact ranks but creates hot shards at popular scores and moves players between shards as they improve.',
      scenarios: [
        'A global board has 500M+ players and won’t fit one node',
        'Exact ranks matter only near the top',
        'Rank queries must stay fast as the player count keeps growing',
      ],
      scale: '800M members × ~100 bytes ≈ 80 GB, over one node’s comfortable limit; 16 shards bring each to ~5 GB, and the top-K merge is 16 small reads.',
    },
    'Time-windowed boards as separate keys': {
      eli5: 'Each week the school starts a fresh house points chart on a new sheet and pins up the old one in the corridor for a while. Nobody has to rub out last week’s chart.',
      industry: [
        'Keys like lb:daily:2026-11-08, lb:weekly:2026-W45 and lb:season:12, each updated on every score event.',
        'EXPIRE on old window keys so they disappear after the archive job has copied the final results.',
        'ZUNIONSTORE of hourly keys to build a “last 24 hours” board when an approximate sliding window is acceptable.',
      ],
      def: 'Instead of resetting a board by deleting millions of members, write every score event to one key per active window (daily, weekly, season, all-time). A new period simply starts a new empty key; the old one is kept read-only for display and prize calculation, archived to durable storage, then expired. Tumbling windows aligned to calendar periods are simplest; a sliding window can be approximated by combining smaller buckets. Each extra window multiplies write cost, so offer only the windows the product needs.',
      scenarios: [
        'Weekly boards must reset at Monday 00:00 without a pause',
        'Players want daily, weekly and all-time boards at once',
        'Last season’s final standings must stay visible',
      ],
      scale: 'Four windows mean four ZINCRBYs per score event; at 100K events/s that is 400K ops/s spread across the cluster.',
    },
    'Queue-buffered score writes': {
      eli5: 'After a big match, scorers drop their sheets in a box at the stadium office. Clerks enter them into the official register at a steady pace, then update the big screen; a power cut can’t lose a sheet in the box.',
      industry: [
        'Game servers publish match results to Kafka partitioned by player ID; consumers write the durable store and then Redis.',
        'A durable scores table (DynamoDB, Cassandra or Postgres) as the source of truth, used to rebuild Redis after a failure.',
        'Idempotent consumers keyed by match ID, so a redelivered result doesn’t add points twice.',
      ],
      def: 'Scores arrive in bursts (thousands of matches ending together) and must never be lost, but Redis alone can lose recent writes on failover. Game servers publish each validated match result to a durable queue; consumers apply it to a durable scores store and then update the Redis boards, batching where possible. The queue absorbs bursts, decouples game servers from leaderboard outages, and allows replay; Redis can be rebuilt from the durable store at any time. Display lags by seconds, which the NFRs allow.',
      scenarios: [
        'A tournament ending sends 300K score updates in a minute',
        'A Redis failover lost the last two minutes of scores',
        'Duplicate match results must not double-count',
      ],
      scale: 'Kafka absorbs hundreds of thousands of events per second; partitioning by player keeps one player’s updates ordered.',
    },
    'Server-authoritative score validation': {
      eli5: 'In a chess tournament the arbiter records the result, not the players. If someone walks up claiming they won 500 games in an hour, the arbiter checks the scoresheets before writing anything down.',
      industry: [
        'Scores computed by the game server from the match simulation, never accepted from the client.',
        'Plausibility rules: maximum points per minute, impossible completion times, statistical outliers flagged for review.',
        'Shadow bans and pre-payout audits on top-ranked players before tournament prizes are released.',
      ],
      def: 'If clients can submit their own scores, the board will be topped by fabricated numbers within days. Make the game server (or a validation service that replays or checks signed match data) the only source of scores, and accept writes only from authenticated servers. Add plausibility checks and rate limits, flag outliers for review rather than blocking instantly, and audit the top of the board before rewards. Cheaters can be removed from boards (ZREM) and their scores corrected in the durable store.',
      scenarios: [
        'Impossible scores appear at the top of the board',
        'Real money or prizes depend on final ranks',
        'The client app calls the score API directly',
      ],
      scale: 'Validation is cheap per match (a few checks); heavier replay-based checks can run asynchronously only for scores that would enter the top ranks.',
    },
  },
  scenarios: [
    (pick) => {
      const dau = pick(['50 million', '20 million', '120 million']);
      const ms = pick(['50 ms', '100 ms', '30 ms']);
      return {
        q: `Interviewer: “Design a leaderboard for a mobile game with ${dau} daily players.” NFRs: top 100 and “my rank” in under ${ms}, scores visible within a few seconds, never lose a score, prizes for the weekly top 100. A teammate suggests SELECT COUNT(*) FROM scores WHERE score > :mine on Postgres for rank. Which decision best meets the rank-latency NFR?`,
        answer: 'Redis sorted set per board',
        hint: 'You need a structure that knows positions, not one that recounts.',
        steps: [
          'COUNT(*) WHERE score > x scans a large part of the index for every rank request.',
          'A sorted set keeps members ordered, so ZREVRANK and ZREVRANGE are O(log n) in memory.',
          `That comfortably answers in well under ${ms}.`,
          'Durability comes from a separate source of truth; Redis serves reads.',
        ],
        followups: [
          { q: 'Is eventual consistency acceptable for this board?', options: ['Yes for display (seconds of lag is fine); final prize standings are computed from the durable store after the window closes', 'No, every read must be strongly consistent', 'Yes, and prizes can use whatever Redis shows', 'No, use two-phase commit'], why: 'Split the NFR: relaxed for display, strict for payouts.' },
          { q: 'Why not a min-heap of the top 100 only?', options: ['A heap gives the top K but can’t answer “my rank” for everyone else', 'Heaps are slower than SQL', 'Heaps can’t hold 100 items', 'It is the better choice'], why: 'Rank for every player needs the full ordering.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['800 million', '500 million', '1.2 billion']);
      return {
        q: `The all-time global board has ${n} players in a single sorted set. The node is at 90% memory, failovers take minutes to resync, and every ZINCRBY in the world hits that one Redis thread. Product says exact ranks only matter for the top 10,000.`,
        answer: 'Sharded boards with approximate rank',
        hint: 'Spread players across sets, merge the top, estimate the rest.',
        steps: [
          `${n} × ~100 bytes is tens of gigabytes on one node and one thread for all writes.`,
          'Shard players by hash into N sorted sets on different nodes.',
          'Exact top K = merge of each shard’s top K, because each player is in one shard.',
          'For everyone else, estimate rank from a score histogram and show a percentile.',
        ],
        followups: [
          { q: 'Why not shard by score range instead of player hash?', options: ['Popular score ranges become hot shards, and players move shards as their scores change', 'Score ranges can’t be computed', 'Hash sharding gives exact ranks for free', 'Redis forbids it'], why: 'Range sharding gives exact ranks but uneven load and constant migrations.' },
        ],
      };
    },
    (pick) => {
      const m = pick(['30 million', '12 million', '60 million']);
      return {
        q: `The weekly board is one key; every Monday at 00:00 a job runs DEL on it after copying results. With ${m} members the delete blocks Redis for several seconds, every game’s leaderboard calls time out, and scores sent during the reset are lost.`,
        answer: 'Time-windowed boards as separate keys',
        hint: 'Don’t reset a board; start a new one.',
        steps: [
          'Write each score event to a key per window, like lb:weekly:2026-W45.',
          'At Monday 00:00 writers simply start using the next week’s key; nothing is deleted on the hot path.',
          'Archive the old key’s final standings, then let it EXPIRE (or UNLINK it, which frees memory in the background).',
          'Daily, season and all-time boards work the same way, each one extra write per event.',
        ],
        followups: [
          { q: 'How could you offer “last 24 hours” rather than “today”?', options: ['Keep hourly keys and ZUNIONSTORE the last 24 periodically (an approximate sliding window)', 'Delete scores older than 24 h one by one on every write', 'It is impossible', 'Use a single key with TTL 24 h'], why: 'Combine small tumbling buckets to approximate a sliding window.' },
        ],
      };
    },
    (pick) => {
      const burst = pick(['300,000', '150,000', '500,000']);
      return {
        q: `When a tournament ends, ${burst} match results arrive within a minute. Game servers write directly to Redis; Redis CPU hits 100%, some game servers time out and drop results, and a failover last week lost two minutes of scores with no way to recover them.`,
        answer: 'Queue-buffered score writes',
        hint: 'Absorb the burst durably, then apply it; keep a real source of truth.',
        steps: [
          'Game servers publish match results to Kafka, partitioned by player ID.',
          'Consumers write the durable scores store first, then update Redis, batching where possible.',
          'Bursts queue up instead of timing out; display lags by seconds.',
          'If Redis loses data, rebuild it from the durable store or replay the topic.',
        ],
        followups: [
          { q: 'A consumer crashes after updating Redis but before committing its offset. What prevents double points?', options: ['Idempotent processing keyed by match ID (record applied match IDs, or set absolute scores)', 'Kafka never redelivers', 'Redis rejects duplicates automatically', 'Nothing; it is acceptable'], why: 'At-least-once delivery needs idempotent consumers.' },
        ],
      };
    },
    (pick) => {
      const s = pick(['99,999,999', '2,147,483,647', '50,000,000']);
      return {
        q: `Within a day of launch, the top 20 of the global board all have scores of ${s}, while the best honest players sit around 40,000. The mobile app calls POST /scores with the score it computed locally. A ₹10 lakh prize goes to the weekly winner.`,
        answer: 'Server-authoritative score validation',
        hint: 'Who should be trusted to say what the score was?',
        steps: [
          'The client can be modified, so client-submitted scores can’t be trusted.',
          'Have the game server compute or verify the score from the match, and accept writes only from authenticated servers.',
          'Add plausibility checks (points per minute, maximum possible score) and flag outliers.',
          'Audit top players before paying prizes; remove cheaters with ZREM and fix the durable store.',
        ],
        followups: [
          { q: 'Why flag suspicious scores for review instead of auto-banning?', options: ['Rules have false positives; review avoids banning skilled honest players', 'Bans are expensive to store', 'Redis can’t remove players', 'Cheaters never return'], why: 'Automated detection plus human review balances fairness and safety.' },
        ],
      };
    },
    (pick) => {
      const pts = pick(['8,450', '12,000', '3,300']);
      return {
        q: `Two players both reach ${pts} points; one got there 3 hours earlier. Support tickets complain that their order on the board flips randomly between refreshes, and the tournament rules say the earlier achiever ranks higher.`,
        answer: 'Redis sorted set per board',
        hint: 'Put the tie-break inside the score itself.',
        steps: [
          'Members with equal scores are ordered by member name, not by time.',
          'Encode a composite score: points × 10^10 + (MAX_TS − achieved_at_seconds).',
          'Higher points still win; at equal points, the earlier time gives a larger score.',
          'ZREVRANK and ZREVRANGE now return a stable, rule-compliant order.',
        ],
        followups: [
          { q: 'What limit must you watch when packing two values into one score?', options: ['Sorted-set scores are doubles, exact only up to 2^53, so the combined number must stay under that', 'Scores must be strings', 'Only 32-bit integers are allowed', 'There is no limit'], why: 'Exceeding 53 bits silently loses precision and breaks ordering.' },
        ],
      };
    },
  ],
});
