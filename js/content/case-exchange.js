SG.add({
  id: 'case-exchange',
  ref: 'S20',
  section: 'HLD case studies',
  title: 'Design a stock exchange',
  short: 'Stock exchange',
  blurb: 'Match buy and sell orders fairly in microseconds, never lose one, and replay the whole day exactly.',
  intro: 'Scope: brokers send orders (limit, market, cancel) for listed symbols; the exchange checks risk, matches buyers and sellers, reports fills back, and publishes market data (best prices, depth, trades) to everyone. The NFRs are unusual: very low and predictable latency (microseconds to low milliseconds), strict fairness (price-time priority, same rules for everyone), no lost or duplicated orders, and determinism so the day can be replayed exactly for recovery and audit. That rules out a database transaction per order. The usual design: gateways with pre-trade risk checks, a sequencer that stamps every input into an ordered, replicated log, one single-threaded in-memory matching engine per symbol (or group of symbols) holding that symbol’s order book, and market data fanned out over sequenced multicast feeds.',
  options: {
    'Order book per symbol': {
      eli5: 'At a sabzi mandi, buyers stand in a line sorted by how much they’ll pay and sellers in a line sorted by how little they’ll accept. When the top buyer and top seller agree, a deal happens; among equal offers, whoever came first goes first.',
      industry: [
        'Bids and asks as sorted price levels (tree map or array indexed by tick), each level a FIFO queue of orders.',
        'A hash map from order ID to its node so cancels and amendments are O(1).',
        'Level 1 (best bid/ask), level 2 (depth per price) and level 3 (every order) views published from the book.',
      ],
      def: 'Each symbol has its own order book: resting buy orders grouped by price, highest first, and resting sell orders, lowest first, with each price level a FIFO queue. An incoming order matches against the opposite side while prices cross, filling in price-time order, and any remainder rests in the book (a limit order) or is cancelled (market or IOC). Keeping a pointer to the best level and an order-ID index makes match, add and cancel near O(1). The whole book lives in memory; it is small (thousands to a few million live orders per symbol).',
      scenarios: [
        'Cancels scan a long list and slow down matching',
        'Finding the best price must not require sorting',
        'Many orders wait at the same price and must fill in arrival order',
      ],
      scale: 'Even a busy book has at most a few million live orders, comfortably in RAM; most activity is near the best prices, so a tick-indexed array of levels is very cache-friendly.',
    },
    'Single-threaded matching engine per symbol': {
      eli5: 'One umpire per match decides every ball in order. Two umpires deciding the same ball at once would argue; one umpire is never confused about what happened first.',
      industry: [
        'LMAX’s single-threaded business logic processor, reported at around 6 million orders per second on one thread.',
        'Exchanges assigning symbols to engine shards (for example A–F on engine 1) so engines run in parallel across symbols.',
        'Busy-spinning threads pinned to CPU cores, no locks and no garbage-collection pauses on the hot path.',
      ],
      def: 'Matching for one symbol must happen in a single total order, so rather than locking a shared book from many threads, give each symbol (or set of symbols) to one thread that processes its inputs sequentially from memory. With no locks, no disk and no network calls on the hot path, one core handles millions of events per second with microsecond latency, and given the same inputs it always produces the same outputs. Scale out by spreading symbols across engines; a single very hot symbol can’t be split, so its engine must be as fast as possible.',
      scenarios: [
        'Latency must be microseconds and predictable',
        'Lock contention is making order handling unfair',
        'More symbols need more throughput',
      ],
      scale: 'One core: millions of events/s; a market with thousands of symbols uses tens of engines. Disk writes go through the log, not the engine.',
    },
    'Sequencer and replicated event log': {
      eli5: 'A token machine at the bank gives every customer a number. Whatever happens later, everyone agrees who came first, and if the clerk faints, a new clerk replays the token list and knows exactly where things stood.',
      industry: [
        'A sequencer stamping each inbound order with a gap-free sequence number before it reaches the engine.',
        'The journal replicated to a hot standby engine that processes the same sequence and can take over in milliseconds.',
        'Event sourcing: the book at any moment is a pure function of the log, used for recovery, audits and regulators’ questions.',
      ],
      def: 'All inputs to a matching engine pass through a sequencer that assigns a strict order and writes them to a durable, replicated log before (or while) the engine processes them. Because the engine is deterministic, any replica fed the same sequence reaches the same state, so a hot standby can take over instantly, a crashed engine can rebuild by replaying from the last snapshot, and the whole day can be reproduced for audit. Outputs (fills, acks, market data) are also sequenced, so consumers can detect gaps. Nothing nondeterministic (wall-clock reads, random numbers, thread timing) may influence matching.',
      scenarios: [
        'An engine crash must not lose acknowledged orders',
        'A standby must reach exactly the primary’s state',
        'Regulators ask to reconstruct the book at 10:31:07',
      ],
      scale: 'Log appends are sequential and small (~100 bytes per order); replication to a nearby standby adds microseconds. Snapshot periodically so replay takes seconds, not hours.',
    },
    'Pre-trade risk checks': {
      eli5: 'Before you enter the auction hall, the guard checks you actually have the money you’re about to bid. If you write a cheque for 100× your balance, it’s torn up at the door.',
      industry: [
        'Order-gateway checks for buying power, position and order-size limits per account or broker.',
        'Price bands and circuit breakers (like NSE’s daily price bands) rejecting orders far from the reference price.',
        'Kill switches that cancel all of a broker’s orders when a runaway algorithm is detected.',
      ],
      def: 'Before an order reaches the sequencer, a risk layer validates it: the account has enough cash or margin (and that amount is reserved), the size and value are within limits, the price is within allowed bands, and the participant is not blocked. These checks must be fast and in memory, keyed by account, so they don’t add milliseconds. They protect the market from fat-finger errors and runaway algorithms, and protect the exchange from settlement failures. Post-trade checks and surveillance run asynchronously off the event log.',
      scenarios: [
        'A trader submits orders far beyond their balance',
        'A typo prices a sell order 90% below market',
        'A broker’s algorithm goes wild and floods orders',
      ],
      scale: 'Must add only microseconds; account state is held in memory per gateway shard and updated from fill events.',
    },
    'Sequenced market data fan-out': {
      eli5: 'The stadium scoreboard broadcasts every ball to everyone at once, numbered. If your radio crackles and you miss ball 214, you ask for a replay of just that ball.',
      industry: [
        'Nasdaq ITCH-style binary feeds over UDP multicast, with sequence numbers and a retransmission service for gaps.',
        'Snapshot (full book) plus incremental updates, so a late joiner starts from a snapshot and then applies deltas.',
        'Brokers re-publishing to retail apps over WebSocket, with conflation (latest price only) for slow clients.',
      ],
      def: 'Every change to a book (new order, cancel, trade) produces a market-data event published to all participants simultaneously, which fairness requires. Inside the exchange network, UDP multicast sends each packet once to every subscriber; sequence numbers let receivers detect gaps and request retransmission, and periodic snapshots let them rebuild state. Publishing is decoupled from matching, so a slow subscriber never slows the engine. Retail fan-out happens downstream at brokers, where updates can be conflated.',
      scenarios: [
        'Thousands of participants need every book update at the same time',
        'Receivers must detect and recover missed updates',
        'Slow consumers must not slow matching',
      ],
      scale: 'Busy feeds carry millions of messages/s at peaks; multicast keeps sender cost constant regardless of subscriber count. Retail apps get conflated updates (a few per second).',
    },
  },
  scenarios: [
    (pick) => {
      const lat = pick(['50 microseconds', '100 microseconds', '200 microseconds']);
      const ord = pick(['500K', '1M', '2M']);
      return {
        q: `Interviewer: “Design a stock exchange.” You state NFRs: p99 order-to-ack latency under ${lat}, peaks of ${ord} orders/s across symbols, strict price-time fairness, and no lost orders. A teammate proposes matching each order inside a Postgres transaction with row locks on the order book. Which design decision best meets the latency and fairness NFRs?`,
        answer: 'Single-threaded matching engine per symbol',
        hint: 'What is the fastest way to apply events to shared state in one strict order?',
        steps: [
          `A disk-backed transaction with locks costs milliseconds and contends, far over ${lat}.`,
          'Fairness needs one total order per symbol, which a single thread gives naturally.',
          'Keep the book in memory, with no locks or I/O on the hot path; durability comes from the sequenced log.',
          `Spread symbols across engines to reach ${ord} orders/s overall.`,
        ],
        followups: [
          { q: 'Which NFR forces the engine to be deterministic?', options: ['No lost orders and fast recovery: a standby or a restart must reach exactly the same state by replaying inputs', 'Low cost', 'Search latency', 'Mobile support'], why: 'Determinism is what makes replay-based durability and failover work.' },
          { q: 'Why is “eventual consistency” unacceptable for the order book?', options: ['Two replicas disagreeing on who traded first means unfair or duplicate fills of real money', 'It is too slow', 'Exchanges use no replicas', 'It is acceptable'], why: 'Matching needs a single agreed order of events.' },
        ],
      };
    },
    (pick) => {
      const live = pick(['400,000', '250,000', '1 million']);
      return {
        q: `The book for a popular symbol is a single list of ${live} live orders. Finding the best bid sorts the list, and each cancel scans it to find the order. During volatile minutes, when most messages are cancels and amendments, latency jumps to tens of milliseconds.`,
        answer: 'Order book per symbol',
        hint: 'Group by price, queue within a price, and index by order ID.',
        steps: [
          'Organise bids and asks as price levels sorted best-first, each a FIFO queue.',
          'Keep a pointer to the best level so the top of book is O(1).',
          'Map order ID → queue node, so cancel and amend are O(1) removals.',
          'Matching walks from the best level while prices cross.',
        ],
        followups: [
          { q: 'Two buy orders at the same price: which fills first under price-time priority?', options: ['The one that arrived (was sequenced) first', 'The larger one', 'A random one', 'The one from the bigger broker'], why: 'Price first, then time.' },
        ],
      };
    },
    (pick) => {
      const t = pick(['10:31:07', '14:02:45', '09:15:30']);
      return {
        q: `The primary matching engine crashed at ${t}. The standby received orders directly from gateways over separate connections, so it saw them in a slightly different order, and after failover its book disagrees with fills already sent to brokers. Some acknowledged orders are missing entirely.`,
        answer: 'Sequencer and replicated event log',
        hint: 'Both engines must see the same inputs in the same order, and inputs must be saved before they count.',
        steps: [
          'Put a sequencer in front: every input gets a gap-free number and is written to a replicated log.',
          'Acknowledge an order only once it is in the log.',
          'Primary and standby both consume that one sequence; with a deterministic engine they stay identical.',
          'On failover the standby continues from the next sequence number; a restart replays from the last snapshot.',
        ],
        followups: [
          { q: 'Why must the engine avoid reading the wall clock while matching?', options: ['Replicas would read different times and could diverge; time must come from the sequenced input', 'Clocks are too slow', 'Regulators forbid clocks', 'It is fine to read it'], why: 'Any nondeterministic input breaks replay.' },
        ],
      };
    },
    (pick) => {
      const bal = pick(['₹10 lakh', '₹2 lakh', '₹50 lakh']);
      const val = pick(['₹5 crore', '₹80 lakh', '₹20 crore']);
      return {
        q: `A client with ${bal} of buying power sends buy orders worth ${val} in two seconds, and another participant fat-fingers a sell order 90% below the last price, which immediately trades against resting bids. Both orders went straight from the gateway to matching.`,
        answer: 'Pre-trade risk checks',
        hint: 'Stop bad orders before they become trades.',
        steps: [
          'Check and reserve buying power per account in memory at the gateway before sequencing.',
          'Enforce order size/value limits and a price band around the reference price.',
          'Reject failing orders with a clear reason; they never reach the book.',
          'Keep the checks in memory so they add only microseconds.',
        ],
        followups: [
          { q: 'Why reserve funds at order entry instead of checking only at execution?', options: ['Many open orders could each pass the balance check and together exceed it', 'Execution is too fast to check', 'Brokers require it', 'It is cheaper'], why: 'Reservation prevents over-commitment across concurrent orders.' },
        ],
      };
    },
    (pick) => {
      const subs = pick(['3,000', '8,000', '1,500']);
      return {
        q: `${subs} brokers and trading firms receive book updates over individual TCP connections from the matching host. During a volatile open, sending to slow subscribers backs up the engine’s output, firms receive updates at different times, and a firm that drops packets has no way to tell what it missed.`,
        answer: 'Sequenced market data fan-out',
        hint: 'Publish once to everyone, number every packet, and keep publishing away from matching.',
        steps: [
          'Decouple: the engine emits events; a separate publisher distributes them.',
          'Use UDP multicast inside the exchange network so every subscriber receives the same packet at the same time.',
          'Number every message; receivers detect gaps and request retransmission, or rebuild from a snapshot.',
          'Retail clients get conflated feeds downstream from brokers.',
        ],
        followups: [
          { q: 'Why is fan-out speed a fairness issue, not only a performance one?', options: ['Whoever sees a price change first can act first; the exchange must not favour anyone', 'It reduces cost', 'It avoids retransmissions', 'It is only performance'], why: 'Equal access to market data is a core exchange obligation.' },
        ],
      };
    },
    (pick) => {
      const sym = pick(['a hot IPO on listing day', 'the index heavyweight on expiry day', 'a meme stock']);
      const x = pick(['20×', '50×', '10×']);
      return {
        q: `Traffic for ${sym} spikes to ${x} normal. The team proposes running four threads on that symbol’s book to “use more cores”. Meanwhile other symbols share engines and are fine.`,
        answer: 'Single-threaded matching engine per symbol',
        hint: 'Parallelism for one book means locks and an unclear order of events.',
        steps: [
          'Four threads on one book need locks and would make “who came first” ambiguous.',
          'Keep the hot symbol on a single engine thread, ideally its own dedicated core and engine.',
          'Make that thread faster (in-memory, no allocation, no I/O) rather than wider.',
          'Scale across symbols by moving other symbols off that engine.',
        ],
        followups: [
          { q: 'What actually bounds a single symbol’s throughput then?', options: ['One core’s event-processing speed, typically millions of events per second when the hot path is lean', 'The number of brokers', 'Disk size', 'Network bandwidth to retail apps'], why: 'Per-symbol order is sequential by nature.' },
        ],
      };
    },
    (pick) => {
      const d = pick(['last Tuesday', 'the expiry day', 'yesterday’s close']);
      return {
        q: `A broker disputes a fill from ${d}, claiming their order should have traded first. Engineers also want to reproduce a rare matching bug seen once at peak load. Today only the final trades are stored, not the inputs.`,
        answer: 'Sequencer and replicated event log',
        hint: 'Keep the inputs in order, and the state can be rebuilt.',
        steps: [
          'Persist every sequenced input (orders, cancels, amendments), not just outputs.',
          'Because the engine is deterministic, replaying the log reproduces the exact book and every fill.',
          'Use periodic snapshots to replay from near the time in question.',
          'The same mechanism powers failover and audits.',
        ],
        followups: [
          { q: 'What must be true of the engine code for this replay to be trustworthy?', options: ['Same version and logic, with no nondeterministic inputs like clocks, randomness or thread timing', 'It must be multithreaded', 'It must use a database', 'Nothing special'], why: 'Determinism plus versioned code makes replay exact.' },
        ],
      };
    },
  ],
});
