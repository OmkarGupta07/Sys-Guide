SG.add({
  id: 'case-food',
  ref: 'S15',
  section: 'HLD case studies',
  title: 'Design Swiggy / Zomato',
  short: 'Food delivery',
  blurb: 'Find restaurants that deliver to you, place an order reliably, assign a nearby rider, and track it live.',
  intro: 'Scope: users browse restaurants that can deliver to their location, view menus, place and pay for an order; the restaurant accepts it; a delivery partner is assigned, picks it up and delivers while the user watches on a map with an ETA. The NFRs differ per part: discovery and menus must be fast (~200 ms) and highly available, and can be slightly stale; ordering and payment must be consistent and durable (never lose or duplicate an order); partner assignment must be fast and never give one order to two riders; tracking needs low-latency push. Traffic is very peaky at lunch and dinner and in rain. The main decisions: a geo-aware search index for discovery, a durable order state machine coordinated with a saga, a geo index plus short locks for rider assignment, pub/sub over WebSockets for tracking, and zone-level ETA and surge models.',
  options: {
    'Geo-indexed restaurant discovery': {
      eli5: 'Instead of reading the whole city’s phone book, you open the page for your pincode and the next ones, and only see shops that actually deliver to your street.',
      industry: [
        'Elasticsearch geo_distance / geo_shape queries combined with cuisine, rating and “open now” filters.',
        'Each restaurant’s serviceable area stored as a polygon or set of H3/geohash cells, so “delivers to me” is a lookup.',
        'Menus and listings cached per zone in Redis/CDN, refreshed when restaurants edit them.',
      ],
      def: 'Discovery is a read-heavy, geo-filtered search: restaurants whose delivery area contains the user’s location, filtered by open status, cuisine and rating, ranked by distance, ETA and relevance. Precompute each restaurant’s serviceable cells (or polygon) and index them in a search engine with geo support, fed from the restaurant/menu database by CDC. Cache results per cell, since nearby users see nearly the same list. Menus and prices may be a little stale here, but are re-checked at checkout.',
      scenarios: [
        'Show only restaurants that deliver to the user’s exact address',
        'Search and filters must load in ~200 ms at dinner peak',
        'Restaurant open/close status changes through the day',
      ],
      scale: '~300K restaurants in a country is small for an index; the load is query volume (tens of thousands/s at peak), served by replicas and per-cell caches.',
    },
    'Durable order state machine with a saga': {
      eli5: 'The order slip travels from counter to kitchen to delivery boy, stamped at each step. If the kitchen can’t make it, the slip goes back and the cashier returns your money, step by step.',
      industry: [
        'Order states: created → payment_pending → paid → accepted → preparing → picked_up → delivered (or cancelled/refunded).',
        'Orchestrated sagas (e.g. Temporal, or an order service driving steps) with compensations like refund on restaurant rejection.',
        'Idempotency keys on “place order” so a retried tap doesn’t create two orders.',
      ],
      def: 'An order touches payments, restaurants and logistics, so there is no single ACID transaction. Store the order and every transition durably in a relational database, allow only legal transitions via conditional updates, and drive the cross-service steps as a saga: each step has a compensating action (refund if the restaurant rejects, reassign if a rider cancels). Publish each transition as an event (via an outbox) for notifications, tracking and analytics. Place-order calls are idempotent.',
      scenarios: [
        'The restaurant rejects an order after payment succeeded',
        'An order must never be lost or duplicated during a crash',
        'Many services need to react to each status change',
      ],
      scale: 'Peak a few thousand orders/s nationally, each with ~8–10 transitions: modest writes, sharded by city or order ID.',
    },
    'Geo index + lock for rider assignment': {
      eli5: 'The dispatcher looks at the map squares around the restaurant, sees which free riders are inside, and puts a “booked” tag on one for 30 seconds while asking him. Nobody else can tag him meanwhile.',
      industry: [
        'Rider locations in Redis GEO or H3 cells, updated every few seconds from the rider app.',
        'Redis SET rider:{id} orderId NX EX 30 before sending an offer, so two orders never claim one rider.',
        'Batching: assigning two nearby orders from one restaurant cluster to one rider.',
      ],
      def: 'Keep available riders’ latest positions in an in-memory geo index sharded by city. For an order, query riders near the restaurant, score them by distance, ETA to the restaurant relative to food-ready time, and current load, then offer to the best one under a short TTL lock so concurrent assignments can’t pick the same rider. If the rider declines or the lock expires, try the next. Start assignment shortly before the food is ready so riders don’t wait at the restaurant.',
      scenarios: [
        'Thousands of orders compete for nearby riders at dinner peak',
        'Two assignment workers might choose the same rider',
        'Riders shouldn’t wait 15 minutes at the restaurant',
      ],
      scale: '~300K active riders pinging every 5 s ≈ 60K location writes/s; Redis geo shards per city handle that easily.',
    },
    'Live tracking over WebSockets with pub/sub': {
      eli5: 'Instead of calling the delivery boy every minute to ask “kahan ho?”, you watch his dot move on the map; his phone tells the server, and the server tells your phone.',
      industry: [
        'Rider location published to a channel per order (Redis pub/sub, Kafka) and pushed to the customer over WebSocket/SSE.',
        'Gateway servers that hold the customer connection subscribe only to orders of connected users.',
        'Fallback to polling every 10–15 s for weak connections.',
      ],
      def: 'During delivery, the rider app sends locations every few seconds. The location service publishes each update on the order’s channel; the gateway holding the customer’s WebSocket subscribes and pushes it. Location points are ephemeral: keep the latest in memory and a coarse trail for disputes, not every point in the order database. Push is far cheaper than millions of users polling a database.',
      scenarios: [
        'Customers watch the rider move on the map',
        'Millions of active orders at peak would overwhelm polling',
        'Tracking data matters only while the order is in transit',
      ],
      scale: '1M in-transit orders × 1 update/4 s ≈ 250K pushes/s, spread across gateway servers holding ~50K connections each.',
    },
    'Zone-level ETA and surge pricing': {
      eli5: 'On a rainy evening the auto stand has few autos and many people, so fares go up a little and the waiting time board changes, which brings more drivers out and makes some people wait.',
      industry: [
        'ETA models using prep time per restaurant, rider travel time and current load per zone.',
        'Surge or rain fees and “high demand” banners computed per H3 cell from demand vs available riders.',
        'Temporarily reducing the delivery radius in a stressed zone to protect delivery times.',
      ],
      def: 'Divide the city into zones (H3 cells), and compute supply (free riders), demand (open orders) and recent delivery times every minute in a stream job. Feed these into an ETA model (prep time + pickup travel + drop travel) shown before checkout, and into pricing and radius controls: raise delivery fees, show longer ETAs or shrink serviceable areas when demand outruns supply. Accuracy improves trust; these numbers can be eventually consistent.',
      scenarios: [
        'Heavy rain doubles orders while riders go offline',
        'Users complain that ETAs are wildly wrong at peak',
        'Delivery times in one area explode during a cricket match',
      ],
      scale: 'Thousands of zones recomputed every 30–60 s by a stream processor (Flink/Kafka Streams); results cached and read at every listing and checkout.',
    },
  },
  scenarios: [
    (pick) => {
      const city = pick(['Bengaluru', 'Delhi NCR', 'Hyderabad']);
      const orders = pick(['3,000', '5,000', '2,000']);
      return {
        q: `Interviewer: “Design Swiggy for ${city} and the rest of India; peak ${orders} orders per second at dinner.” You split NFRs: browsing highly available and slightly stale is OK; ordering must never lose or duplicate an order or a payment. Which decision implements the second NFR?`,
        answer: 'Durable order state machine with a saga',
        hint: 'An order spans payments, restaurants and riders, with no single transaction.',
        steps: [
          'Store the order and each transition durably; conditional updates allow only legal moves.',
          'Make “place order” idempotent so a retried tap doesn’t create a second order.',
          'Drive payment, restaurant acceptance and rider assignment as a saga with compensations.',
          'Publish transitions through an outbox so no downstream service misses one.',
        ],
        followups: [
          { q: 'Which parts can favour availability over consistency?', options: ['Restaurant listings, menus, ratings and ETAs', 'Payment capture', 'Order status transitions', 'Rider assignment locks'], why: 'Stale menus are re-checked at checkout; money and order state are not.' },
          { q: 'Why do peak-hour numbers matter in your NFRs?', options: ['Lunch, dinner and rain create 5–10× spikes, so capacity and queues are planned for peaks, not averages', 'They don’t matter', 'Only average load matters for cost', 'Peaks only affect the CDN'], why: 'Food delivery traffic is extremely time-of-day dependent.' },
        ],
      };
    },
    (pick) => {
      const km = pick(['5 km', '7 km', '4 km']);
      return {
        q: `Restaurant listing runs a SQL query computing the distance from the user to every restaurant in the city and keeps those within ${km}. It takes 1.5 s at dinner, and users still see restaurants that refuse to deliver across a river or highway.`,
        answer: 'Geo-indexed restaurant discovery',
        hint: 'Distance isn’t the same as “delivers here”, and full scans are slow.',
        steps: [
          'Precompute each restaurant’s serviceable area as cells or a polygon.',
          'Index them in a geo-capable search engine with cuisine, rating and open-now filters.',
          'Look up the user’s cell to get candidates instantly, then rank.',
          'Cache results per cell; nearby users get nearly identical lists.',
        ],
        followups: [
          { q: 'A menu price changed a minute ago but the cached listing shows the old one. Is that acceptable?', options: ['Yes, if the price is re-validated at checkout from the source of truth', 'No, disable caching', 'Yes, and charge the old price forever', 'No, use strong consistency for search'], why: 'Stale browse data is fine when the commit step checks it.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['two', 'three']);
      return {
        q: `At peak, ${n} assignment workers process orders from neighbouring restaurants at the same moment and all pick the same nearest free rider. He receives ${n} offers, accepts one, and the other orders sit unassigned for minutes until a timeout notices.`,
        answer: 'Geo index + lock for rider assignment',
        hint: 'Claim the rider atomically before offering.',
        steps: [
          'Find candidate riders near the restaurant from the geo index.',
          'Before offering, acquire SET rider:{id} orderId NX EX 30.',
          'If the lock fails, move to the next candidate immediately.',
          'An ignored offer frees the rider automatically when the TTL expires.',
        ],
        followups: [
          { q: 'When should assignment start for a dish that takes 20 minutes to prepare?', options: ['Close to the expected ready time minus the rider’s travel time', 'Immediately at order placement', 'After the food is packed', 'At random'], why: 'Riders waiting at restaurants is wasted supply at peak.' },
        ],
      };
    },
    (pick) => {
      const users = pick(['800,000', '1.5 million', '500,000']);
      return {
        q: `${users} customers are tracking deliveries at the same time. Each app polls GET /orders/{id}/location every 3 seconds, which reads the order database. The database CPU is pegged, and riders’ dots still jump in large steps.`,
        answer: 'Live tracking over WebSockets with pub/sub',
        hint: 'Push changes instead of asking for them.',
        steps: [
          'Polling multiplies load by users and returns nothing new most of the time.',
          'Publish rider locations to a per-order channel from the location service.',
          'The gateway holding the customer’s WebSocket subscribes and pushes updates.',
          'Keep only the latest location in memory; the order DB stays out of the path.',
        ],
        followups: [
          { q: 'Redis pub/sub is at-most-once. Is that OK for tracking?', options: ['Yes: a missed location is replaced by the next one seconds later', 'No, use exactly-once Kafka transactions', 'No, store every point first', 'Only for VIP users'], why: 'Ephemeral, frequently refreshed data tolerates drops.' },
        ],
      };
    },
    (pick) => {
      const cond = pick(['heavy rain', 'an India–Pakistan match', 'New Year’s Eve']);
      return {
        q: `During ${cond}, orders in central Mumbai double while a third of riders go offline. Shown ETAs say 30 minutes but deliveries take 75, cancellations spike, and riders in nearby suburbs sit idle.`,
        answer: 'Zone-level ETA and surge pricing',
        hint: 'Measure supply and demand per area, then act on it.',
        steps: [
          'Compute supply, demand and recent delivery times per zone every minute.',
          'Feed them into ETAs so users see realistic times before ordering.',
          'Raise delivery fees or show surge to pull riders in and smooth demand.',
          'Shrink the serviceable radius in stressed zones if needed.',
        ],
        followups: [
          { q: 'Does the surge multiplier need strong consistency across servers?', options: ['No: a value a minute old is fine, as long as the price shown is honoured at checkout', 'Yes, use distributed transactions', 'Yes, lock all zones', 'It must be per-request exact'], why: 'Pricing signals are approximate; the committed price is what matters.' },
        ],
      };
    },
    (pick) => {
      const pct = pick(['2%', '4%', '1%']);
      return {
        q: `About ${pct} of orders are paid, then rejected by the restaurant (item out of stock). Today the order is marked cancelled, but refunds are handled by a manual ticket, and some customers are charged with no food and no refund for days.`,
        answer: 'Durable order state machine with a saga',
        hint: 'Every step that can fail needs an undo step.',
        steps: [
          'Payment and restaurant acceptance are separate services; no shared transaction.',
          'Model the order as a saga: payment succeeded → restaurant rejected → compensate with an automatic refund.',
          'Persist each step so the saga resumes after crashes.',
          'Emit events so the user is notified immediately.',
        ],
        followups: [
          { q: 'Why not use a two-phase commit across payment, restaurant and order services?', options: ['External parties (payment gateways, restaurants) can’t join it, and it blocks on failures', 'It is always faster', '2PC can’t handle money', 'Sagas are not allowed for payments'], why: 'Sagas with compensations fit long-running, multi-party workflows.' },
        ],
      };
    },
  ],
});
