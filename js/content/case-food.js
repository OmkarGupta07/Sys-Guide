SG.add({
  id: 'case-food',
  ref: 'S15',
  section: 'HLD case studies',
  title: 'Design Swiggy / Zomato',
  short: 'Food delivery',
  blurb: 'Find restaurants that deliver to you, match a fair nearby rider fast, run the delivery as a state machine, and track it cheaply.',
  intro: 'Scope: users find restaurants that deliver to them and place an order; once the restaurant accepts, a delivery partner is matched, picks up and delivers while the customer watches a map. In an interview, say which slice you will go deep on (often matching and tracking) and what is out of scope (routing and ETA as a separate service). The numbers set the NFRs: a city like Mumbai does ~1M deliveries a day at ~10 per rider, so ~1 lakh riders sending a location every 2–3 seconds. Matching must take seconds and be fair to riders, and an order must never go to two riders or be lost; browsing and rider locations can be slightly stale. The key decisions: an in-memory per-city rider index written back to the database, offers sent to nearby riders in growing batches, a delivery state machine, a persistent socket for riders but plain polling for customers, and a geo index for discovery.',
  options: {
    'In-memory per-city rider index (write-back)': {
      eli5: 'The dispatcher at each city’s office keeps a whiteboard of every rider and where they are right now, and copies it into the register at the end of each hour, not every time someone moves.',
      industry: [
        'Rider ID → latest location, rating and deliveries today kept in Redis or an in-process grid, sharded by city.',
        'The relational database (riders, ratings, orders) is updated asynchronously from that cache.',
        'Ratings kept as a running sum and count, so an update is two increments, not a recalculation.',
      ],
      def: 'Matching reads current rider state thousands of times a second and that state changes every few seconds, so keep it in memory, partitioned by city (a rider in Pune never serves Mumbai). Location and counters are written back to a normalized SQL store asynchronously, because losing a few seconds of location on a crash is harmless: the next ping replaces it. Durable business facts such as order state and payments still go to the database synchronously.',
      scenarios: [
        'Matching must read every nearby rider’s state within milliseconds',
        'Location updates are frequent, small and replaceable',
        'Cities are independent, so they make a natural shard key',
      ],
      scale: '1 lakh riders per big city × 1 ping/3 s ≈ 33K updates/s per city; each rider entry is ~100 B, so a city fits in a few tens of MB of memory.',
    },
    'Batched offers to nearby riders, with fairness': {
      eli5: 'Instead of shouting the job to the whole auto stand or asking drivers one by one, the dispatcher calls the ten best-placed drivers, then twenty more if nobody picks up.',
      industry: [
        'Quadtree, geohash or H3 cells around the restaurant to fetch ~100–150 candidate riders.',
        'Offers pushed in waves (10, then 20, …) until one rider accepts.',
        'Scoring by time to pickup and drop, rating, and deliveries already done today to spread earnings.',
      ],
      def: 'Find candidates in the geo cells around the restaurant, score them (time to reach the restaurant relative to food-ready time, rating, and how many orders they already have today), and offer to the best batch first. Widen the batch only if nobody accepts within a few seconds. Offering to one rider at a time is slow; offering to all 150 creates a stampede and trains riders to ignore offers. The fairness term stops the best-rated rider near a busy hub from getting every order while others sit idle and quit.',
      scenarios: [
        'An order must find a rider in seconds at dinner peak',
        'Some riders get far more orders than others in the same area',
        'Offering to riders one by one leaves food waiting',
      ],
      scale: 'A geofence of a few km gives ~100–150 candidates; scoring them in memory takes microseconds, so latency is dominated by riders responding.',
    },
    'Delivery state machine with a saga': {
      eli5: 'The order slip travels from counter to kitchen to delivery boy, stamped at each step. Only one delivery boy can sign for it, and if the kitchen can’t make it the cashier returns your money.',
      industry: [
        'Delivery states: searching → assigned → at restaurant → picked up → delivered (or cancelled), in a Delivery Management service separate from the Rider Manager.',
        'Conditional updates (UPDATE … SET rider = ? WHERE id = ? AND state = ‘SEARCHING’) so only the first acceptance wins.',
        'Orchestrated sagas (e.g. Temporal) with compensations like an automatic refund when the restaurant rejects.',
      ],
      def: 'Store each order and delivery as a state machine in a relational database and allow only legal transitions with conditional updates; that is what stops two riders from both getting the same order. The order spans payments, restaurants and logistics with no shared transaction, so run it as a saga where each step has a compensating action (refund on rejection, re-match if a rider cancels). Publish each transition through an outbox for notifications and tracking, and make “place order” idempotent so a retried tap doesn’t create two orders.',
      scenarios: [
        'Two riders tap “accept” on the same order within milliseconds',
        'The restaurant rejects an order after payment succeeded',
        'An order must never be lost or duplicated during a crash',
      ],
      scale: 'A few thousand orders/s nationally at peak, each with ~8–10 transitions: modest write load, sharded by city or order ID.',
    },
    'Rider socket + customer polling for tracking': {
      eli5: 'The delivery boy keeps a walkie-talkie line open to the office all shift. You, the customer, just phone the office now and then to ask where he is.',
      industry: [
        'Rider app holds a WebSocket to the Rider Manager whenever on duty, sending location every 2–3 s and receiving offers instantly.',
        'Customer app calls GET /rider-location?orderId=… every 2–3 s while the map screen is open, served from cache.',
        'Push to customers (WebSocket/SSE with pub/sub per order) as an upgrade if data shows people watch the whole trip.',
      ],
      def: 'Riders need a persistent connection: they send frequent updates and must receive offers within a second. Customers are different: most open the map, glance and leave, so holding a socket per customer costs memory and routing for little benefit. Let customers poll a cheap endpoint that reads the latest location from the in-memory cache, never the order database. If analytics show customers keep the map open for the whole trip, switch them to push.',
      scenarios: [
        'Riders must receive offers instantly and stream their location',
        'Most customers check the map for a few seconds and close it',
        'Location reads are currently hitting the order database',
      ],
      scale: '1 lakh riders per city = 1 lakh sockets (a handful of servers). Even 2 lakh customers polling every 3 s is ~70K cache reads/s, which a small Redis cluster serves.',
    },
    'Geo-indexed restaurant discovery': {
      eli5: 'Instead of reading the whole city’s phone book, you open the page for your pincode and the next ones, and only see shops that actually deliver to your street.',
      industry: [
        'Elasticsearch geo_distance / geo_shape queries with cuisine, rating and “open now” filters.',
        'Each restaurant’s serviceable area stored as a polygon or set of H3/geohash cells, so “delivers to me” is a lookup.',
        'Listings cached per cell in Redis or a CDN and refreshed when restaurants edit menus.',
      ],
      def: 'Discovery is read-heavy, geo-filtered search: restaurants whose delivery area contains the user’s location, filtered by open status, cuisine and rating, ranked by distance, ETA and relevance. Precompute each restaurant’s serviceable cells, index them in a search engine fed by CDC from the restaurant database, and cache results per cell. Menus and prices may be a little stale here because they are re-checked at checkout.',
      scenarios: [
        'Show only restaurants that deliver to the user’s exact address',
        'Search and filters must load in ~200 ms at dinner peak',
        'Restaurant open/close status changes through the day',
      ],
      scale: '~3 lakh restaurants nationally is small for an index; the load is query volume (tens of thousands/s at peak), served by replicas and per-cell caches.',
    },
  },
  scenarios: [
    (pick) => {
      const deliveries = pick(['10 lakh', '8 lakh', '12 lakh']);
      const ping = pick(['3', '2']);
      return {
        q: `Interviewer: “Design rider matching for Mumbai: ${deliveries} deliveries a day.” A rider does ~10 a day and sends a location every ${ping} seconds. NFRs: find a rider within seconds, never give one order to two riders, keep working through the dinner peak. A teammate wants every location update written to the riders table in PostgreSQL and matching to query it. What do you propose for rider state?`,
        answer: 'In-memory per-city rider index (write-back)',
        hint: 'Work out how many riders and writes per second first.',
        steps: [
          'Deliveries ÷ 10 per rider gives roughly 1 lakh riders in the city.',
          `One update every ${ping} s from each of them is tens of thousands of writes per second, all of them overwrites.`,
          'Keep rider ID → location, rating, deliveries today in memory, sharded by city, and match from there.',
          'Write locations and counters back to SQL asynchronously; a lost ping is replaced seconds later.',
        ],
        followups: [
          { q: 'Which data must NOT be write-back?', options: ['Order and delivery state, and payments: written synchronously to the database', 'Rider locations', 'Deliveries-today counters', 'Rider rating running totals'], why: 'Losing a location is harmless; losing an assignment or a payment is not.' },
          { q: 'Why is city a good shard key here?', options: ['Matching never crosses cities, so each city’s riders and orders live together', 'Cities have equal traffic', 'It hides data from other services', 'SQL needs it'], why: 'A shard key that matches the query keeps every match on one node (very large cities can be split by zone).' },
        ],
      };
    },
    (pick) => {
      const cand = pick(['120', '150', '100']);
      return {
        q: `The geofence around a restaurant returns ${cand} free riders. Version 1 offered to the single best rider and waited 30 s for each refusal, so food went cold. Version 2 pinged all ${cand} at once; most tapped too late, got “already taken”, and started ignoring offers.`,
        answer: 'Batched offers to nearby riders, with fairness',
        hint: 'Somewhere between one and everyone.',
        steps: [
          'One at a time is slow; everyone at once is a stampede that wastes riders’ attention.',
          'Score candidates by time to restaurant versus food-ready time, rating and load.',
          'Offer to the top ~10; if nobody accepts in a few seconds, offer to the next ~20.',
          'The first acceptance wins; the others see the offer disappear.',
        ],
        followups: [
          { q: 'When should matching start for a dish that takes 20 minutes to prepare?', options: ['Around the expected ready time minus the rider’s travel time', 'Immediately at order placement', 'After the food is packed', 'At random'], why: 'A rider waiting 15 minutes at the restaurant is wasted supply at peak.' },
        ],
      };
    },
    (pick) => {
      const top = pick(['25', '30', '22']);
      return {
        q: `In Koramangala, the five top-rated riders parked near a food court each do ${top} deliveries a day while riders a kilometre away do 3 and are quitting. Matching picks the highest score, and the score is only distance and rating.`,
        answer: 'Batched offers to nearby riders, with fairness',
        hint: 'What is missing from the score?',
        steps: [
          'Pure distance-plus-rating keeps picking the same riders near the hotspot.',
          'Add a fairness term, such as deliveries or earnings so far today, to the score.',
          'Batches now include riders who are slightly farther but have had less work.',
          'Supply stays healthy because more riders earn enough to stay on.',
        ],
        followups: [
          { q: 'Where does “deliveries today” come from at matching time?', options: ['The rider entry in the in-memory city index, incremented on each completion', 'A daily SQL report', 'Asking the rider app', 'Recomputed from all orders on every match'], why: 'Matching reads only in-memory state; counters are written back later.' },
        ],
      };
    },
    (pick) => {
      const ms = pick(['40 ms', '15 ms', '80 ms']);
      return {
        q: `Two riders in the same batch tap “accept” on one order ${ms} apart. The matching service checks “is the order still unassigned?”, then writes the rider ID, and both checks pass. Both riders reach the restaurant for one parcel.`,
        answer: 'Delivery state machine with a saga',
        hint: 'Make the check and the write one atomic step.',
        steps: [
          'Check-then-write in two steps is a race.',
          'Model the delivery as states: searching → assigned → picked up → delivered.',
          'Accept with a conditional update: set rider and state only WHERE state = ‘SEARCHING’.',
          'The second update affects 0 rows, so that rider is told it was taken.',
        ],
        followups: [
          { q: 'Why keep Delivery Management separate from the Rider Manager?', options: ['Order lifecycle needs durable, consistent state; rider matching and locations are fast, in-memory and loss-tolerant', 'Microservices are always better', 'They use different languages', 'To avoid using a database'], why: 'Different NFRs (consistency versus speed) justify a split.' },
        ],
      };
    },
    (pick) => {
      const pct = pick(['70%', '80%', '65%']);
      return {
        q: `To show live tracking, the team plans a WebSocket for every customer with an active order. Analytics show ${pct} of customers open the map for under 20 seconds and come back once or twice. Riders already keep a socket open to receive offers.`,
        answer: 'Rider socket + customer polling for tracking',
        hint: 'The two apps use the map very differently.',
        steps: [
          'Riders send updates every few seconds and must get offers instantly: a persistent socket fits.',
          'Most customers glance and leave, so a socket per customer is mostly idle cost.',
          'Let customers poll GET /rider-location?orderId every 2–3 s while the map is open.',
          'Serve it from the location cache; revisit push if usage shows people watching the whole trip.',
        ],
        followups: [
          { q: 'The polling endpoint currently reads from the orders database and its CPU is pegged. Fix?', options: ['Read the latest location from the in-memory rider cache, keyed by the order’s rider', 'Poll less often, every 60 s', 'Add more database replicas only', 'Store every location point in the orders table'], why: 'Locations are ephemeral; keep the database out of the hot read path.' },
        ],
      };
    },
    (pick) => {
      const pct = pick(['2%', '4%', '1%']);
      return {
        q: `About ${pct} of orders are paid, then rejected by the restaurant because an item is out of stock. Today the order is marked cancelled, refunds go through a manual ticket, and some customers are charged with no food and no refund for days.`,
        answer: 'Delivery state machine with a saga',
        hint: 'Every step that can fail needs an undo step.',
        steps: [
          'Payment and restaurant acceptance are separate services with no shared transaction.',
          'Run the order as a saga: payment succeeded → restaurant rejected → automatic refund.',
          'Persist each state so the saga resumes after a crash.',
          'Emit events through an outbox so the customer is notified immediately.',
        ],
        followups: [
          { q: 'Why not a two-phase commit across payment, restaurant and order services?', options: ['External parties (payment gateways, restaurants) can’t take part, and it blocks on failures', 'It is always faster', '2PC can’t handle money', 'Sagas are not allowed for payments'], why: 'Sagas with compensations fit long-running, multi-party workflows.' },
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
  ],
});
