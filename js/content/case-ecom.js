SG.add({
  id: 'case-ecom',
  ref: 'S16',
  section: 'HLD case studies',
  title: 'Design an e-commerce flash sale',
  short: 'Flash sale',
  blurb: 'A million clicks in one second for 10,000 items: atomic stock, shielded edges, queues and timed holds.',
  intro: 'A flash sale (Big Billion Days, a sneaker drop, a phone launch) sells a limited stock at a fixed moment, so traffic jumps from near zero to a million requests in seconds. The NFRs pull hard against each other: absorb the burst (1M+ concurrent requests), strict consistency on stock (sell exactly the inventory, never one more), acknowledge a purchase attempt in under ~100 ms, and degrade gracefully instead of crashing. The usual design: serve everything static from a CDN and filter bots and repeats at the edge; reserve stock with an atomic check-and-decrement in Redis (sharded across keys so one CPU core isn’t the limit); hand successful reservations to Kafka so slower order and payment work runs at a safe rate; and hold reserved stock for a few minutes, returning it if payment doesn’t complete. Autoscaling is too slow; pre-warm capacity before the sale.',
  options: {
    'Atomic stock decrement in Redis': {
      eli5: 'One shopkeeper with a box of 100 coupons hands them out one by one. Because only he touches the box, he can never give out a 101st coupon, however big the crowd.',
      industry: [
        'A Redis Lua script: if stock > 0 then DECR and create a hold key, else return sold out, all in one atomic step.',
        'Preloading the sale’s inventory count into Redis before the start.',
        'A relational backstop: UPDATE inventory SET qty = qty − 1 WHERE sku = ? AND qty > 0 when the order is written.',
      ],
      def: 'Database row locks on one inventory row can’t take a million concurrent updates. Load the stock count into Redis and run check-and-decrement as one Lua script: Redis runs scripts one at a time, so no two requests can both see the last unit. The script also records who holds the unit. Because Redis replication is asynchronous, a failover can lose recent decrements, so keep a final conditional update in the order database as the guard against overselling. Alternatives lose: a queue as the gate adds delay and only per-partition order; ZooKeeper sequential nodes give strict order but are a low-throughput quorum-write system; multi-master (active-active) counters converge eventually, so two nodes can both see stock left.',
      scenarios: [
        'Zero overselling while a million users click at once',
        'Check-then-decrement must not race',
        'Response to the purchase attempt must be ~100 ms',
      ],
      scale: 'A single Redis core runs ~100K simple scripts/s; that is the ceiling for one stock key, which is why hot inventory gets sharded.',
    },
    'Inventory sharded across keys': {
      eli5: 'Instead of one counter with all 10,000 tokens and a huge crowd, open ten counters with 1,000 tokens each. Ten queues move ten times faster.',
      industry: [
        'Splitting stock into sku:{id}:shard:{0..N} keys placed on different Redis primaries.',
        'Routing a user to a shard by hash of user ID, and trying another shard if theirs is empty.',
        'Periodically rebalancing leftover units from slow shards to fast ones near the end of the sale.',
      ],
      def: 'Even an atomic script on one key is limited by one Redis CPU core, and every request for the product is a hot key. Split the stock across N independent keys on different nodes and route each request to one shard (hash of user ID, or random). Each shard decrements atomically, so overselling is still impossible, and throughput grows with N. Handle the side effect: a shard can run out while others still have stock, so on “empty” try another shard (or rebalance) before telling the user it’s sold out. Routing by hash of user ID also makes “one unit per customer” cheap: all of a user’s requests land on one shard, where a local unique constraint on (sale, user) rejects the second buy, and a failed payment simply gives the unit back to that shard. The cost is approximate fairness: a user who clicked later may win on a less crowded shard.',
      scenarios: [
        'One account must not buy two units of a limited drop',
        'One product’s stock key is the bottleneck at peak',
        'Throughput needed is several times one Redis node',
        'Users must not see “sold out” while units remain elsewhere',
      ],
      scale: '10 shards ≈ 10× the decrement throughput (~1M/s). Final sold count = sum of shards, never more than the preloaded total.',
    },
    'Edge shielding: CDN, WAF and rate limits': {
      eli5: 'Before a big cricket match, the stadium has gates outside, checks tickets there and turns away people without them, so the crowd inside the stadium stays manageable.',
      industry: [
        'CDN serving product pages, images, JS/CSS and a cached server-time endpoint for the countdown.',
        'An L7 web application firewall and bot detection blocking scripted buyers and scalpers.',
        'API-gateway token bucket of ~1 checkout request per user per second, returning 429 at the edge; origin accepts traffic only from the CDN.',
      ],
      def: 'Most flash-sale traffic is reads (refreshing the page, watching the countdown) and repeat clicks. Serve all static content and the countdown from a CDN, pre-warmed before the sale, with stale-while-revalidate so the “coming soon → on sale” flip doesn’t stampede the origin. Put a WAF and bot detection in front, enforce per-user rate limits at the gateway, and lock the origin so it accepts traffic only from the CDN. Pre-provision capacity: CPU-based autoscaling reacts in minutes, the spike lasts seconds.',
      scenarios: [
        'Millions refresh the product page in the minutes before the sale',
        'Bots and scalpers fire thousands of requests per second',
        'Users mash the Buy button repeatedly',
      ],
      scale: 'A CDN can absorb ~99% of read traffic. Per-user limits turn 10 frantic clicks into 1 backend request.',
    },
    'Kafka buffer for the order pipeline': {
      eli5: 'The token counter works in seconds, but the billing desk takes a minute per customer. So token holders wait in a hall and are called to billing one by one at a pace the desk can handle.',
      industry: [
        'Successful Redis reservations published as checkout events to Kafka; the API returns 202 Accepted with a ticket ID.',
        'Order workers consuming at a steady rate, writing pending orders to Postgres and creating payment links.',
        'Clients short-polling a status endpoint backed by a cache until the payment link appears.',
      ],
      def: 'Reserving stock is fast; creating the order, calling the payment gateway and writing to Postgres is slow. Decouple them: after a successful reservation, publish an event and immediately return 202 with a ticket ID. Workers drain the queue at the rate the database and payment provider can handle, and write status to a read-optimised cache that the client polls every couple of seconds. Short polling is simpler than holding a million WebSockets for a wait that lasts seconds.',
      scenarios: [
        '50,000 reservations succeed in 2 seconds but the DB handles 1,000 orders/s',
        'The payment gateway has its own rate limits',
        'Users wait only seconds for their payment link',
      ],
      scale: '50K reservations ÷ 1K orders/s ≈ 50 s to drain: fine for users who already hold their unit. 10K users polling every 2 s ≈ 5K cache reads/s.',
    },
    'Timed hold with sweeper': {
      eli5: 'At a mobile shop sale, the phone is kept aside in your name for 5 minutes. If you don’t pay, the manager checks the register and puts it back on the counter for the next person.',
      industry: [
        'Hold record created with a 5-minute expiry at reservation time; the order row starts as PENDING_PAYMENT.',
        'Payment-gateway webhooks confirming the order and clearing the hold.',
        'An expiration worker scanning PENDING_PAYMENT orders older than 5 minutes, cancelling them and incrementing stock on the same Redis shard.',
      ],
      def: 'A reservation is only half a sale: users abandon payment or their card is declined. Give every reserved unit a deadline. On payment success (webhook), confirm the order and delete the hold. Otherwise an expiration worker, driven by the database (not Redis keyspace expiry events, which are fire-and-forget and can be missed), cancels expired pending orders and atomically returns the unit to the shard it came from. Make the return idempotent so a retried sweep doesn’t add stock twice.',
      scenarios: [
        'Reserved units must not be lost to abandoned checkouts',
        'Payment can take minutes or fail',
        'Returned stock must go back exactly once',
      ],
      scale: 'With 5-minute holds and ~20% abandonment, a 10,000-unit sale returns ~2,000 units to later buyers.',
    },
  },
  scenarios: [
    (pick) => {
      const units = pick(['10,000', '5,000', '1,000']);
      const users = pick(['1 million', '2 million', '800,000']);
      return {
        q: `Interviewer: “Design a flash sale for a new phone: ${units} units, ${users} users clicking Buy within the first seconds.” You state NFRs: absorb the burst, acknowledge each attempt in under 100 ms, degrade gracefully, and “sell exactly ${units}, never one more”. Which decision enforces that last NFR on the hot path?`,
        answer: 'Atomic stock decrement in Redis',
        hint: 'Check-then-decrement must be one indivisible step, and fast.',
        steps: [
          'A database row lock on one inventory row can’t take this concurrency.',
          'Preload stock into Redis; a Lua script checks stock > 0 and decrements in one step.',
          'Redis runs one script at a time, so two requests can never take the last unit.',
          'Keep a conditional update in the order DB as a backstop in case of a Redis failover.',
        ],
        followups: [
          { q: 'Why is strict consistency on stock compatible with high availability elsewhere?', options: ['Only the stock counter needs it; pages, countdown and status can be cached and stale', 'It isn’t; CAP forbids it', 'Everything must be strongly consistent', 'Availability isn’t needed in a sale'], why: 'Scope the strict requirement to the one counter that must be exact.' },
          { q: 'Why not rely on autoscaling to meet the burst NFR?', options: ['It reacts in minutes, the spike arrives in seconds; pre-warm capacity before the sale', 'Autoscaling is too expensive', 'Cloud providers forbid it', 'It is fine'], why: 'Known, scheduled spikes call for pre-provisioning.' },
        ],
      };
    },
    (pick) => {
      const peak = pick(['400,000', '600,000', '1 million']);
      return {
        q: `The atomic Lua script works, but all ${peak} attempts per second for the product hit one stock key on one Redis primary. Its single CPU core is at 100% and p99 latency is 2 seconds, while other Redis nodes are idle.`,
        answer: 'Inventory sharded across keys',
        hint: 'Correct per key, but one key has one core.',
        steps: [
          'One key lives on one node and is executed by one thread.',
          'Split the stock across N keys on different nodes (e.g. 10 × 1,000 units).',
          'Route each request to one shard; each still decrements atomically.',
          'Throughput scales with N, and the total sold can’t exceed the preloaded total.',
        ],
        followups: [
          { q: 'Why is perfect first-come-first-served ordering usually dropped here?', options: ['Strict global order needs one serialising point, which caps throughput; sharding trades small unfairness for no oversell and speed', 'Fairness is illegal', 'Redis cannot order commands', 'Users prefer random winners'], why: 'Correctness (no oversell, no early sold-out) and latency come first; a few seconds of unfairness is accepted.' },
          { q: 'User A is routed to an empty shard while others have stock. What should happen?', options: ['Try another shard (or rebalance leftovers) before returning sold out', 'Tell them sold out', 'Let the shard go negative', 'Merge all shards back into one key'], why: 'Sharding must not create false “sold out” responses.' },
        ],
      };
    },
    (pick) => {
      const bots = pick(['40%', '60%', '30%']);
      return {
        q: `In the 10 minutes before the sale, millions of users refresh the product page and the countdown, and the origin servers fall over before the sale starts. At the start, ${bots} of checkout requests come from bots, and real users click Buy 8–10 times each.`,
        answer: 'Edge shielding: CDN, WAF and rate limits',
        hint: 'Stop traffic as far from your servers as possible.',
        steps: [
          'Serve product pages, assets and a cached server-time countdown from a pre-warmed CDN.',
          'Use a WAF and bot detection to drop scripted traffic.',
          'Rate-limit checkout to ~1 request per user per second at the gateway (429 at the edge).',
          'Restrict the origin to accept traffic only from the CDN.',
        ],
        followups: [
          { q: 'When the page flips from “coming soon” to “on sale”, the CDN cache expires and millions miss at once. Fix?', options: ['Pre-warm the new version and use stale-while-revalidate so one request refreshes it', 'Disable the CDN at sale time', 'Lower the TTL to 0', 'Add more origin servers only'], why: 'Prevent a cache stampede at the exact moment of peak.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['50,000', '30,000', '80,000']);
      return {
        q: `${n} reservations succeed in the first 2 seconds. The API then synchronously creates the order in Postgres and calls the payment gateway for each one. Postgres handles ~1,000 order inserts per second, connections pile up, and successful buyers see timeouts and retry.`,
        answer: 'Kafka buffer for the order pipeline',
        hint: 'The fast step and the slow step shouldn’t run at the same pace.',
        steps: [
          'After the Redis reservation, publish a checkout event and return 202 with a ticket ID.',
          'Workers drain the queue at the rate Postgres and the gateway can handle.',
          'Workers write status and the payment link to a cache.',
          'Clients short-poll the cache every ~2 s until the link appears.',
        ],
        followups: [
          { q: 'A teammate suggests putting every click into Kafka first and deciding winners in the consumers. Why is that wrong for the stock decision?', options: ['It adds queue delay that breaks the ~100 ms answer, and order holds only per partition; decide at the atomic counter, queue only the slow work after', 'Kafka loses messages by default', 'Kafka cannot handle 1M messages/s', 'Consumers cannot count'], why: 'Use the queue to smooth slow work, not to make the instant yes/no.' },
          { q: 'Why short polling rather than WebSockets for this wait?', options: ['The wait lasts seconds; holding a million persistent connections costs far more than cheap cached polls', 'WebSockets can’t send JSON', 'Polling is real-time', 'Browsers block WebSockets'], why: 'Pick the push channel only when the cost is justified.' },
        ],
      };
    },
    (pick) => {
      const pct = pick(['20%', '15%', '25%']);
      return {
        q: `After the sale ends, ${pct} of reserved units were never paid for: users closed the payment page or cards were declined. Those units stay decremented in Redis, so the product showed “sold out” while thousands of real buyers were still waiting. A Redis key-expiry listener meant to return them missed many events.`,
        answer: 'Timed hold with sweeper',
        hint: 'Every reservation needs a deadline enforced from durable state.',
        steps: [
          'Give each reservation a 5-minute deadline; the order starts as PENDING_PAYMENT.',
          'The payment webhook confirms the order and clears the hold.',
          'An expiration worker scans the database for expired pending orders and cancels them.',
          'It increments stock on the original shard, idempotently.',
        ],
        followups: [
          { q: 'Why not rely on Redis keyspace notifications for expiry?', options: ['They are fire-and-forget; a disconnected listener misses events and units are lost forever', 'They are too slow', 'Redis has no TTLs', 'They cost money'], why: 'Recovery must be driven from durable state, not best-effort events.' },
          { q: 'A payment succeeds 10 seconds after the hold expired and the unit was resold. What now?', options: ['The order’s confirm step fails its conditional check, so refund automatically', 'Ship two phones', 'Cancel the second buyer', 'Ignore it'], why: 'The source of truth decides; refunds handle the rare loser.' },
        ],
      };
    },
    (pick) => {
      const units = pick(['1,000', '2,000', '500']);
      const dup = pick(['40', '120', '65']);
      return {
        q: `The policy for a ${units}-unit drop is one unit per customer. Stock is already split across 10 Redis shards and requests are routed randomly. After the sale, ${dup} customers hold two units each because their two clicks landed on different shards, while some other customers were told “sold out”.`,
        answer: 'Inventory sharded across keys',
        hint: 'Where do a given user’s requests land, and where is the uniqueness check?',
        steps: [
          'Random routing scatters one user’s clicks over many shards, so no single shard can see the duplicate.',
          'Route by hash of user ID so a user always hits the same shard.',
          'Enforce uniqueness there with an atomic “has this user already bought?” check or a unique (sale, user) constraint.',
          'On payment failure, return the unit to the same shard so the quota stays exact.',
        ],
        followups: [
          { q: 'What is the NFR trade-off of hashing by user instead of random routing?', options: ['Load may be uneven and fairness only approximate, but duplicates are impossible', 'Slower reads', 'Less durability', 'More expensive CDN'], why: 'Locality of a user’s requests buys correctness; a hot shard may empty earlier.' },
        ],
      };
    },
    (pick) => {
      const units = pick(['1,000', '2,000', '500']);
      const extra = pick(['37', '112', '19']);
      return {
        q: `A sneaker drop had ${units} pairs. The reserve endpoint does GET stock from Redis, checks it is above 0 in application code, then calls DECR. Load tests passed, but on launch day ${extra} more orders were accepted than there were pairs, and the counter ended negative.`,
        answer: 'Atomic stock decrement in Redis',
        hint: 'Each command is atomic on its own; the pair is not.',
        steps: [
          'GET and DECR are separate commands, so many requests read “1 left” before any decrement lands.',
          'Move the check and decrement into one Lua script (or DECR and roll back if the result is below 0).',
          'Redis runs the script as one indivisible step, so the last unit is taken exactly once.',
          'Keep a conditional update in the order DB as a final backstop.',
        ],
        followups: [
          { q: 'Why not use a ZooKeeper sequential-node counter instead of Redis?', options: ['It is strictly ordered but every write goes through a quorum, so throughput is far below the sale’s peak and few teams run it', 'It cannot count', 'It oversells by design', 'It only works for strings'], why: 'Consistency is fine; the write rate is the problem.' },
          { q: 'Redis fails over to a replica that missed the last few decrements. How do you still avoid overselling?', options: ['A conditional UPDATE … WHERE qty > 0 in the order database rejects the extra reservations', 'Trust the replica', 'Restart the sale', 'Disable replication'], why: 'Asynchronous replication can lose writes; the durable store has the last word.' },
        ],
      };
    },
  ],
});
