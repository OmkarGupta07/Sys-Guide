SG.add({
  id: 'case-exchange',
  ref: 'S20',
  section: 'HLD case studies',
  title: 'Design a stock exchange',
  short: 'Stock exchange',
  blurb: 'Match buy and sell orders fairly, never double-fill or lose one, and replay the whole day exactly.',
  intro: 'Scope: users place orders (market, limit, stop, stop-limit, day) through a broker; the broker’s order management service (OMS) gives each order an ID, checks and reserves funds, and forwards it; the matching engine matches buyers and sellers in price-time order; fills go back to users, settlement happens later (T+1 in India and, since May 2024, the US), and market data streams to everyone. The NFRs drive everything: order ack under ~10 ms, internal market data under ~1 ms, strict sequential processing per symbol (no double fill, no overfill), zero downtime in market hours and zero data loss. The core trade-off is correctness over availability: when unsure, reject the order rather than risk money. Throughput is modest (a few thousand orders/s at the open even for a big broker), so the design is shaped by ordering and correctness, not raw volume: in-memory risk with reserved cash, a sequencer and replicated log, one single-threaded engine per symbol, and sequenced market-data fan-out.',
  options: {
    'Order book per symbol': {
      eli5: 'At a sabzi mandi, buyers stand in a line sorted by how much they’ll pay and sellers in a line sorted by how little they’ll accept. When the top buyer and top seller agree, a deal happens; among equal offers, whoever came first goes first.',
      industry: [
        'Bids and asks as price levels, each level a FIFO queue (doubly linked list) of orders, plus a map from price to level and a pointer to the best price.',
        'A hash map from order ID to its list node so cancels and amendments are O(1) removals.',
        'Level 1 (best bid/ask), level 2 (depth per price) and level 3 (every order) views published from the book.',
      ],
      def: 'Each symbol has its own in-memory order book: resting buy orders grouped by price, highest first, and resting sell orders, lowest first, with each price level a FIFO queue. An incoming order matches against the opposite side while prices cross, filling in price-time order; a big market order may walk several levels (that price drift is slippage) and an order can be partially filled, so order state includes filled and remaining quantity. Whatever is left rests (limit) or is cancelled (market/IOC). With a best-price pointer, a price→level map and an order-ID index, a typical fill, add or cancel is O(1).',
      scenarios: [
        'Cancels scan a long list and slow down matching',
        'Finding the best price must not require sorting',
        'Many orders wait at the same price and must fill in arrival order',
        'A large market order eats through several price levels',
      ],
      scale: 'Even a busy book has at most a few million live orders, comfortably in RAM; most activity is near the best prices, so a price-indexed array of levels is very cache-friendly.',
    },
    'Single-threaded matching engine per symbol': {
      eli5: 'One umpire per match decides every ball in order. Two umpires deciding the same ball at once would argue; one umpire is never confused about what happened first.',
      industry: [
        'LMAX’s single-threaded business logic processor, reported at around 6 million orders per second on one thread.',
        'Engines partitioned by symbol (for example a Kafka-style partition or shard per symbol group) so they run in parallel across symbols.',
        'Busy-spinning threads pinned to CPU cores, with the book in memory and a write-ahead log for recovery, and no locks or GC pauses on the hot path.',
      ],
      def: 'The NFR “strict sequential processing per symbol, no double fill, no overfill” means one total order of events per book. Instead of locking a shared book from many threads, give each symbol (or set of symbols) to one thread that applies its inputs one by one from memory. With no locks, no disk and no network calls on the hot path, one core handles millions of events per second with microsecond latency, and the same inputs always produce the same outputs. Scale by spreading symbols across engines; a single hot symbol can’t be split, so its engine is made lean, not wide. If an engine’s input queue backs up, the gateway stops accepting orders for it rather than queue them unboundedly.',
      scenarios: [
        'Latency must be low and predictable',
        'Lock contention is making order handling unfair or double-filling',
        'More symbols need more throughput',
      ],
      scale: 'One core: millions of events/s, far above a big broker’s ~3–4K orders/s at the open; thousands of symbols fit on tens of engines. Alert when an engine’s queue depth passes ~1,000.',
    },
    'Sequencer and replicated event log': {
      eli5: 'A token machine at the bank gives every customer a number. Whatever happens later, everyone agrees who came first, and if the clerk faints, a new clerk replays the token list and knows exactly where things stood.',
      industry: [
        'A sequencer stamping each inbound order with a gap-free sequence number before it reaches the engine.',
        'The journal replicated to a hot standby engine that processes the same sequence and can take over in milliseconds.',
        'An append-only, write-once (WORM) audit store kept for years (the US SEC rule 17a-4 asks for six years for many records), so any fill can be explained later.',
      ],
      def: 'All inputs to a matching engine pass through a sequencer that assigns a strict order and writes them to a durable, replicated log before they count. Because the engine is deterministic, any replica fed the same sequence reaches the same state: a hot standby takes over instantly (zero downtime), a crashed engine rebuilds by replaying from the last snapshot (zero data loss), and the whole day can be reproduced for disputes and regulators. Outputs (acks, fills, market data) are sequenced too, so consumers can detect gaps. Nothing nondeterministic (wall-clock reads, random numbers, thread timing) may influence matching.',
      scenarios: [
        'An engine crash must not lose acknowledged orders',
        'A standby must reach exactly the primary’s state',
        'Regulators or a broker ask to reconstruct the book at 10:31:07',
      ],
      scale: 'Log appends are sequential and small (~100 bytes per order); replication to a nearby standby adds microseconds. Snapshot periodically so replay takes seconds, not hours.',
    },
    'Reserved cash + fail-closed risk check': {
      eli5: 'At a wedding buffet with a fixed budget, the caterer sets money aside for each dish as soon as you order it, not when it arrives. And if the person checking the budget steps out, no new orders are taken until they return.',
      industry: [
        'Brokers moving cash from “available” to “reserved” on order entry with an atomic Redis DECRBY or check-and-set, rejecting the order if available would go below zero.',
        'Price bands and circuit breakers: per-stock bands (NSE daily bands, US limit-up/limit-down) and market-wide halts (S&P 500 down 7%, 13%, 20%).',
        'Kill switches that cancel all of a client’s or broker’s orders when a runaway algorithm is detected.',
      ],
      def: 'Before an order is sequenced, an in-memory risk check validates it and reserves what it could cost: available cash drops and reserved cash rises in one atomic step. A fill turns reserved cash into a realised trade (the trade-date balance changes at once, the settled ledger only at settlement, T+1); a cancel releases the reservation. Checking balances only at execution lets several open orders each pass and together overspend. The check also enforces size limits and price bands. If the risk engine is down or slow, the system fails closed: it rejects new orders rather than letting unchecked ones through, because correctness beats availability when money is involved.',
      scenarios: [
        'A trader’s open orders together exceed their balance',
        'The risk service is down at market open',
        'A typo prices a sell order 90% below market',
        'A runaway algorithm floods orders',
      ],
      scale: 'Must add only a millisecond or two; per-account state is held in memory or Redis, sharded by account. Alert if risk p99 passes ~5 ms.',
    },
    'Sequenced market data fan-out': {
      eli5: 'The stadium scoreboard broadcasts every ball to everyone at once, numbered. If your radio crackles and you miss ball 214, you ask for a replay of just that ball.',
      industry: [
        'Exchange feeds like Nasdaq ITCH over UDP multicast, with sequence numbers and a retransmission service for gaps.',
        'Brokers putting market events on Kafka partitioned by symbol, feeding WebSocket gateways (~100K connections each) that push to apps.',
        'Snapshot (full book) plus incremental updates, so a late joiner starts from a snapshot, and conflation (latest price only) for slow clients.',
      ],
      def: 'Every change to a book produces a market-data event that must reach all participants quickly and fairly. Publishing is decoupled from matching, so a slow subscriber never slows the engine. Inside the exchange network, UDP multicast sends each packet once to every subscriber; sequence numbers let receivers detect gaps and ask for retransmission, and periodic snapshots let them rebuild. For retail apps, a broker streams events through a log partitioned by symbol to a fleet of WebSocket gateways, sends a snapshot on subscribe and then increments, and conflates updates for slow phones.',
      scenarios: [
        'Thousands of participants need every book update at the same time',
        'Millions of app users watch live prices',
        'Receivers must detect and recover missed updates',
        'Slow consumers must not slow matching',
      ],
      scale: '8,000 symbols × ~50 updates/s ≈ 400K events/s; ~2M concurrent app connections ÷ ~100K per gateway ≈ 20 gateways. Alert when market-data lag passes ~100 ms.',
    },
  },
  scenarios: [
    (pick) => {
      const acc = pick([10, 23, 40]);
      const perDay = acc * 0.3; // 10% trade daily × 3 orders each, in millions
      const avg = Math.round((perDay * 1e6) / 23400 / 10) * 10; // 6.5 h trading day
      const peak = avg * 10;
      return {
        q: `Interviewer: “Design the trading core for a broker with ${acc} million funded accounts.” You estimate 10% trade on a given day with ~3 orders each, and the open runs at ~10× the average. NFRs: order ack under 10 ms, no double fill or overfill, zero data loss, no downtime in market hours. A teammate says the volume needs a giant multithreaded matching cluster. Which decision do these NFRs actually call for?`,
        answer: 'Single-threaded matching engine per symbol',
        hint: 'Work out the orders per second first, then ask which NFR is the hard one.',
        steps: [
          `${acc}M × 10% × 3 ≈ ${perDay.toFixed(1)}M orders/day; over a 6.5-hour session that is ~${avg}/s, and ~${peak}/s at a 10× open.`,
          'That volume is small for one core, so throughput is not what shapes the design.',
          '“No double fill or overfill” needs one strict order of events per book; one thread per symbol gives it without locks.',
          'Keep the book in memory for the 10 ms ack; durability comes from the sequenced log, and symbols spread across engines.',
        ],
        followups: [
          { q: `A candidate says “${perDay.toFixed(1)}M orders a day over 5 hours is about ${Math.round((perDay * 1e6) / 18000 * 4 / 100) * 100}/s”. What is the right figure?`, options: [`About ${Math.round((perDay * 1e6) / 18000 / 10) * 10}/s over 5 hours (5 h = 18,000 s), roughly 10× that at the open`, `About ${Math.round((perDay * 1e6) / 18000 * 4 / 100) * 100}/s, as stated`, `About ${Math.round((perDay * 1e6) / 3600 / 100) * 100}/s, because most orders arrive in one hour`, `About ${Math.round((perDay * 1e6) / 86400 / 10) * 10}/s, spreading orders over 24 hours`], why: 'Divide by the seconds in the window, then apply a peak factor; don’t spread over 24 h for a market that is open only part of the day.' },
          { q: 'Which way does this system lean on the consistency-vs-availability trade-off?', options: ['Correctness first: reject or pause orders rather than risk a wrong fill', 'Availability first: accept every order and fix balances later', 'Neither, because orders are idempotent', 'Availability first, because traders hate rejections'], why: 'A rejected order is an annoyance; a double fill is real money lost.' },
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
          'Organise bids and asks as price levels, each a FIFO doubly linked list.',
          'Keep a price→level map and a pointer to the best level, so the top of book is O(1).',
          'Map order ID → list node, so cancel and amend are O(1) removals.',
          'Matching walks from the best level while prices cross.',
        ],
        followups: [
          { q: 'Two buy orders at the same price: which fills first under price-time priority?', options: ['The one that arrived (was sequenced) first', 'The larger one', 'The one from the bigger broker', 'They split the fill pro rata'], why: 'Price first, then time. Pro-rata matching exists in some futures markets, but equities use price-time.' },
          { q: 'A market buy for 5,000 shares meets only 1,000 at the best ask. What happens?', options: ['It fills 1,000 there and keeps walking higher ask levels until filled, paying a worse average price (slippage)', 'It waits until 5,000 are available at the best ask', 'It is rejected because it cannot fill at one price', 'It fills 1,000 and the rest rests as a limit order at that price'], why: 'Market orders take whatever liquidity exists; that is why users are warned about slippage and why limit orders exist.' },
        ],
      };
    },
    (pick) => {
      const t = pick(['10:31:07', '14:02:45', '09:15:30']);
      return {
        q: `The primary matching engine crashed at ${t}. The standby received orders directly from gateways over separate connections, so it saw them in a slightly different order, and after failover its book disagrees with fills already sent to users. Some acknowledged orders are missing entirely.`,
        answer: 'Sequencer and replicated event log',
        hint: 'Both engines must see the same inputs in the same order, and inputs must be saved before they count.',
        steps: [
          'Put a sequencer in front: every input gets a gap-free number and is written to a replicated log.',
          'Acknowledge an order only once it is in the log.',
          'Primary and standby both consume that one sequence; with a deterministic engine they stay identical.',
          'On failover the standby continues from the next sequence number; a restart replays from the last snapshot.',
        ],
        followups: [
          { q: 'Why must the engine avoid reading the wall clock while matching?', options: ['Replicas would read different times and could diverge; time must come from the sequenced input', 'Reading the clock costs too many microseconds', 'Regulators forbid timestamps inside the engine', 'Clock reads would break price-time priority for orders at the same price'], why: 'Any nondeterministic input breaks replay.' },
          { q: 'A broker disputes a fill from last month. What lets you prove what happened?', options: ['Every sequenced input kept in an append-only, write-once audit store; replaying it through the same engine version reproduces the fill', 'The final trades table, which records every fill', 'Application logs from the engine hosts', 'Asking the counterparty broker for their records'], why: 'Outputs alone can’t explain why; ordered inputs plus deterministic code can. Regulators expect such records to be immutable and kept for years.' },
        ],
      };
    },
    (pick) => {
      const bal = pick(['₹1 lakh', '₹2 lakh', '₹50,000']);
      const n = pick(['5', '8', '4']);
      return {
        q: `A user with ${bal} available places ${n} buy orders within a second, each worth about ${bal}. The risk check reads the balance, sees enough cash for each order on its own, and passes all of them; the balance is only reduced when trades settle a day later. Most of the orders fill, and the user now owes far more than they had.`,
        answer: 'Reserved cash + fail-closed risk check',
        hint: 'Open orders are a promise to pay; the money should stop being “available” the moment the order is placed.',
        steps: [
          'On each order, atomically move its cost from available to reserved (Redis DECRBY or check-and-set), rejecting it if available would go below zero.',
          `Now the first order reserves ${bal}, and the rest see nothing left and are rejected.`,
          'A fill turns reserved cash into a realised trade; a cancel or expiry releases it back to available.',
          'Keep this in memory or Redis per account, so it adds at most a millisecond or two.',
        ],
        followups: [
          { q: 'Why an atomic decrement instead of “read balance, check, then write”?', options: ['Two orders can read the same balance at once and both pass; an atomic operation lets only one win', 'Atomic operations are cheaper than a read', 'Redis can’t do reads and writes in the same call', 'It avoids writing an audit record'], why: 'Check-then-act across concurrent requests is the classic race; do the check and the change in one step.' },
          { q: 'A fill happens today. When does the user’s settled cash change?', options: ['At settlement, T+1 (one business day later) in India and the US; the trade-date balance changes immediately', 'Immediately, because the fill is final', 'At T+2, the standard everywhere', 'At the end of the trading day, when the books close'], why: 'Track a trade-date balance for risk and the UI, and a settled ledger that moves on settlement. The US moved from T+2 to T+1 in May 2024.' },
        ],
      };
    },
    (pick) => {
      const t = pick(['9:15 at the open', '9:16, a minute after the open', 'the first minute of an expiry day']);
      return {
        q: `At ${t}, the risk service starts timing out. An engineer suggests letting orders through unchecked for a few minutes so customers aren’t blocked, then reconciling balances afterwards. Meanwhile the matching engine’s input queue is climbing past 1,000 orders.`,
        answer: 'Reserved cash + fail-closed risk check',
        hint: 'Which is worse here: a rejected order, or an order nobody could pay for?',
        steps: [
          'Unchecked orders can overspend, breach limits or carry fat-finger prices, and fills can’t be undone.',
          'Fail closed: if the risk check can’t answer within its budget, reject the order with a clear “try again” reason.',
          'Apply backpressure: when the engine queue backs up, the gateway stops accepting new orders instead of queuing unboundedly.',
          'Alert on risk p99 above ~5 ms and engine queue depth above ~1,000, so humans step in quickly.',
        ],
        followups: [
          { q: 'Someone types a sell price 90% below the last trade. Which check stops it?', options: ['A price band around the reference price (per-stock bands or limit-up/limit-down), checked before sequencing', 'The matching engine, which refuses trades that are too cheap', 'A post-trade surveillance job that reverses the trade', 'The buyer’s broker, which notices the bargain'], why: 'Bands reject fat-finger prices up front; market-wide breakers (S&P 500 down 7/13/20%) halt the whole market.' },
          { q: 'Why not run the risk check asynchronously after the order is sent to matching?', options: ['By the time it answers, the order may already have filled; risk must gate the order', 'Async checks are less accurate', 'The matching engine can’t accept unchecked orders by protocol', 'It would double the network cost'], why: 'Pre-trade means before the trade. Post-trade surveillance is a separate, async layer.' },
        ],
      };
    },
    (pick) => {
      const users = pick(['2 million', '1.5 million', '3 million']);
      const syms = pick(['8,000', '5,000', '10,000']);
      return {
        q: `${users} users have the app open at the open, watching prices across ${syms} symbols that each update ~50 times a second. Today the matching engine pushes every update straight to each user over REST polling, the engine slows when phones are slow, and a user who loses signal has no idea which updates they missed.`,
        answer: 'Sequenced market data fan-out',
        hint: 'Separate publishing from matching, number the stream, and push through a dedicated connection tier.',
        steps: [
          `${syms} symbols × 50 updates/s is hundreds of thousands of events a second; matching must not do that work.`,
          'The engine emits sequenced events to a log partitioned by symbol; a market-data service builds snapshots and increments.',
          `WebSocket gateways at ~100K connections each serve ${users} users with a few dozen servers; each client subscribes to symbols, gets a snapshot, then deltas.`,
          'Sequence numbers reveal gaps (resync from a snapshot), and slow clients get conflated latest-price updates.',
        ],
        followups: [
          { q: 'Inside the exchange, why UDP multicast to member firms rather than a TCP stream each?', options: ['One packet reaches every firm at the same moment, which is fair, and sender cost doesn’t grow with subscribers', 'Multicast is guaranteed to deliver every packet', 'TCP can’t carry binary data', 'Multicast encrypts data automatically'], why: 'Equal, simultaneous access is a fairness duty; gaps are handled by sequence numbers and retransmission.' },
          { q: 'Which number would you alert on for this feed?', options: ['Market-data lag (event time to client) above ~100 ms', 'Total number of symbols listed', 'Disk usage on the matching host', 'Number of orders rejected for low balance'], why: 'Lag is what users feel and what makes prices stale.' },
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
          'Four threads on one book need locks and would make “who came first” ambiguous, risking double fills.',
          'Keep the hot symbol on a single engine thread, ideally its own dedicated core and engine.',
          'Make that thread faster (in-memory, no allocation, no I/O) rather than wider.',
          'Scale across symbols by moving other symbols off that engine.',
        ],
        followups: [
          { q: 'What actually bounds a single symbol’s throughput then?', options: ['One core’s event-processing speed, typically millions of events per second when the hot path is lean', 'The number of brokers sending orders', 'The write speed of the order database', 'Network bandwidth to retail apps'], why: 'Per-symbol order is sequential by nature, and one lean core is far faster than real order flow.' },
        ],
      };
    },
  ],
});
