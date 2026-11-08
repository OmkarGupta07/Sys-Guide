SG.add({
  id: 'case-uber',
  ref: 'S7',
  section: 'HLD case studies',
  title: 'Design Uber',
  short: 'Ride hailing',
  blurb: 'Fare estimates, a firehose of driver locations, fast proximity search, and matching that never double-books a driver.',
  intro: 'Scope: a rider gets a fare estimate, requests a ride, gets matched with a nearby driver, and the driver accepts and navigates to pickup and drop-off. The NFRs split by feature: matching must be consistent (one driver per ride, one offer per driver at a time) and fast (match or fail within ~1 minute), everything else should be highly available, and the system must absorb surges of hundreds of thousands of requests in one city. Millions of drivers pinging every few seconds means ~600K location writes/s, so locations go into an in-memory geo index. Offers use a short-lived distributed lock per driver, rides live in a durable state machine, requests are buffered in region-partitioned queues, and clients send fewer, smarter location updates.',
  options: {
    'Redis geo index for driver locations': {
      eli5: 'A city map divided into numbered squares, with a sticky note in each square listing which autos are there right now. To find autos near you, look at your square and its neighbours.',
      industry: [
        'Redis GEOADD/GEOSEARCH (geohash in a sorted set) for “drivers within 2 km”.',
        'Uber’s H3 hexagonal cells for even neighbour distances and surge zones.',
        'Short TTLs on location entries so drivers who close the app disappear automatically.',
      ],
      def: 'Store each available driver’s latest position in an in-memory geospatial index keyed by geohash (or H3) cell, sharded by region. Proximity queries check the rider’s cell and its neighbours, then sort by distance or ETA. Geohash cells are computed, not maintained, so constant updates are cheap; a quadtree adapts to density but must rebalance on every move. A relational table with B-tree indexes on lat and long handles neither 2D range queries nor this write rate well.',
      scenarios: [
        'Millions of drivers update their position every few seconds',
        'Find available drivers within a radius in milliseconds',
        'Locations are ephemeral; only the latest matters',
      ],
      scale: '3M active drivers ÷ 5 s ≈ 600K writes/s; a Redis cluster handles 100K+ ops/s per node, so tens of shards partitioned by city/region. Durable history, if needed, goes to a separate log.',
    },
    'Distributed driver lock with TTL': {
      eli5: 'When the dispatcher offers you a trip, a “reserved” tag is hung on your auto for 10 seconds. Other dispatchers see the tag and call someone else; if you don’t answer, the tag drops off by itself.',
      industry: [
        'Redis SET driver:{id} rideId NX PX 10000 before sending an offer.',
        'DynamoDB conditional writes with TTL as an alternative lock table.',
        'The same pattern as seat holds in ticket booking (Ticketmaster/BookMyShow).',
      ],
      def: 'Before offering a ride to a driver, the matching instance atomically acquires a lock on that driver with a TTL equal to the offer window (SET NX with expiry). If it fails, the driver already has an offer, so try the next candidate. If the driver doesn’t respond, the lock expires by itself, with no cron sweep and no stuck “request sent” status. Within one matching instance, a loop offers the ride to one driver at a time.',
      scenarios: [
        'Many matching servers may pick the same nearest driver at once',
        'Offers must expire automatically if ignored',
        'Consistency is required for matching but not for the rest of the system',
      ],
      scale: 'One lock operation per offer is trivial load. TTL must match the offer timeout (e.g. 10 s); a cron that releases stale locks every minute would leave drivers idle for up to ~55 s.',
    },
    'Ride state machine in a durable DB': {
      eli5: 'A trip sheet in the depot ledger: requested → matched → picked up → completed. Any clerk on any shift can read the sheet and carry on; nothing important lives only in one clerk’s head.',
      industry: [
        'Ride rows with explicit statuses, changed only by conditional updates (UPDATE … WHERE status = ‘requested’ AND driver_id IS NULL).',
        'An active-ride row per rider (and per driver) to block duplicate requests.',
        'Uber’s workflow and trip services persisting every transition so any instance can resume.',
      ],
      def: 'Persist every ride and every state transition in a durable database; servers hold no truth of their own. Transitions are guarded conditional writes, so if two drivers accept, only one update succeeds. A per-rider active-ride record stops a second request while one is open, and lets any server resume a ride after a crash or reconnect. Write that record before the ride row, so a ride can never exist without the rider being able to find it.',
      scenarios: [
        'A matching or WebSocket server crashes mid-ride',
        'Two drivers tap “Accept” at the same instant',
        'A rider must not be able to open two rides at once',
      ],
      scale: 'Ride writes are modest (thousands/s globally); shard by city/region or ride ID. The hot data is a ride’s status, not location, which stays in the geo index.',
    },
    'Region-partitioned ride request queue': {
      eli5: 'At a railway station after a concert, separate queues for each auto stand, so a long wait for the far-off stand doesn’t hold up people going to the busy one.',
      industry: [
        'Kafka/SQS topics partitioned by city or geo cell feeding matching workers.',
        'Regional deployments (cells) so one city’s surge doesn’t affect another.',
        'Unacknowledged requests redelivered if a matching worker dies mid-match.',
      ],
      def: 'Put ride requests on a durable queue partitioned by region instead of calling matching synchronously. Surges wait in the queue while matching workers autoscale; a worker that crashes during its minute-long search doesn’t lose the request, because it is redelivered when not acknowledged. Partitioning by region stops a hard-to-match rural request from blocking easy city requests behind it, and keeps work near the region’s geo index.',
      scenarios: [
        'A stadium or New Year’s Eve surge of 100K+ requests in minutes',
        'Matching takes seconds to a minute per request and workers can die',
        'Different areas have very different supply',
      ],
      scale: 'Partitions per city or zone give ordering and isolation; consumer lag per partition shows where supply is short.',
    },
    'Adaptive client location updates': {
      eli5: 'A parked auto driver doesn’t phone the stand every five seconds to say “still here”. He calls when he moves, and more often when he’s near busy spots.',
      industry: [
        'Driver apps sending updates faster when moving or near demand, slower when parked or off-duty.',
        'No updates at all while offline; status changes sent as events instead.',
        'Client-side batching and distance thresholds (send only after moving ~50 m).',
      ],
      def: 'Let the driver client decide how often to send its location based on status (available, on trip, offline), speed, distance moved and nearby demand. A parked or offline driver sends almost nothing; a moving driver near a hotspot sends every few seconds. This cuts write load several times over with little loss in matching accuracy, and saves battery and data.',
      scenarios: [
        'Location ingest is the biggest cost in the system',
        'Many drivers are idle or parked for long periods',
        'Matching accuracy matters only near active demand',
      ],
      scale: 'Going from a fixed 5 s to adaptive updates can take ~600K writes/s down to ~100K, which means fewer geo shards and less mobile data per driver.',
    },
  },
  scenarios: [
    (pick) => {
      const city = pick(['Bengaluru', 'Mumbai', 'New York']);
      return {
        q: `Interviewer: “Design Uber for ${city} and beyond.” You state NFRs: match within 1 minute or fail clearly, each ride gets exactly one driver and no driver gets two offers at once, high availability for everything outside matching, and surges of 100K requests per region. Which NFR is the one where you choose consistency over availability, and which decision enforces it?`,
        answer: 'Distributed driver lock with TTL',
        hint: 'Which mistake would be fatal: a stale fare estimate, or two riders sent the same driver?',
        steps: [
          'Fare estimates, ride history and the rest can be eventually consistent and highly available.',
          'Matching can’t: one ride per driver and one offer per driver at a time.',
          'Many matching instances run in parallel, so they need a shared, atomic claim on each driver.',
          'A distributed lock (SET NX with TTL) per driver enforces it and expires on its own.',
        ],
        followups: [
          { q: 'Why is “consistency vs availability” not one global choice here?', options: ['Different features need different guarantees: strict for matching, available for the rest', 'CAP forces one choice for the whole product', 'Uber needs no consistency', 'Availability is never important'], why: 'Good NFRs are scoped to the part of the system they apply to.' },
          { q: 'Why not mark the driver “request_sent” in the database and clear stale ones with a cron job?', options: ['The cron interval leaves drivers stuck long after the 10 s offer expired; a TTL lock frees them exactly on time', 'Databases can’t store statuses', 'Cron jobs are always faster', 'It would double-charge riders'], why: 'A per-minute sweep against a 10 s window wastes up to ~50 s of driver time.' },
        ],
      };
    },
    (pick) => {
      const drivers = pick(['3 million', '2 million', '5 million']);
      const sec = pick(['5', '4', '3']);
      return {
        q: `${drivers} active drivers send their location every ${sec} seconds. The first design stores lat and long columns in Postgres with B-tree indexes and runs a bounding-box query per ride request. Writes queue up and nearby-driver queries take seconds.`,
        answer: 'Redis geo index for driver locations',
        hint: 'Very high write rate, 2D proximity, and only the latest position matters.',
        steps: [
          `Write rate is ${drivers} ÷ ${sec} s, i.e. hundreds of thousands per second, far beyond one relational primary.`,
          'B-trees index one dimension; a lat/long box scans many rows.',
          'Use an in-memory geo index (geohash/H3 cells), sharded by region, with TTLs on entries.',
          'Query the rider’s cell plus its neighbours in milliseconds.',
        ],
        followups: [
          { q: 'Quadtree or geohash for driver locations, and why?', options: ['Geohash: cells are computed, so constant updates are cheap; quadtrees must rebalance as points move', 'Quadtree: it is always faster', 'Neither works for moving objects', 'Geohash, because it adapts to density'], why: 'Quadtrees suit dense, mostly static data (Yelp); geohash suits frequent writes.' },
        ],
      };
    },
    (pick) => {
      const cost = pick(['40%', '55%', '35%']);
      return {
        q: `Location ingest is now ${cost} of your infrastructure bill. Telemetry shows that at any moment about half of “online” drivers are parked at a stand or on a break, yet every app still sends GPS every 5 seconds. Product says matching accuracy away from busy areas can be a little lower.`,
        answer: 'Adaptive client location updates',
        hint: 'The cheapest write is the one the phone never sends.',
        steps: [
          'Fixed-rate pings waste writes on drivers whose position isn’t changing or doesn’t matter.',
          'Have the client adapt: send on movement or distance thresholds, faster near demand, rarely when parked or off-duty.',
          'Ingest drops several times over, saving shards and battery.',
          'Matching near demand stays accurate.',
        ],
        followups: [
          { q: 'A driver closes the app without going offline. How do you stop matching them?', options: ['Give location entries a short TTL so missing pings drop them from the index', 'Keep them forever', 'Run a daily cleanup job', 'Ask the rider to check'], why: 'Expiry turns silence into “unavailable” automatically.' },
        ],
      };
    },
    (pick) => {
      const ev = pick(['a stadium concert', 'an IPL match', 'New Year’s Eve']);
      return {
        q: `When ${ev} ends, 120,000 ride requests arrive in one city within 10 minutes. Matching is called synchronously; instances run out of capacity, some crash mid-search and their requests vanish, and a few hard-to-match suburban requests hold up city-centre ones.`,
        answer: 'Region-partitioned ride request queue',
        hint: 'Absorb the burst durably, and isolate areas from each other.',
        steps: [
          'Synchronous matching can’t absorb a spike, and loses work on crashes.',
          'Enqueue requests durably; matching workers pull and autoscale.',
          'Unacknowledged requests are redelivered if a worker dies.',
          'Partition by region or zone so one slow area doesn’t block others.',
        ],
        followups: [
          { q: 'What metric tells you a zone needs more drivers (or surge pricing)?', options: ['Consumer lag / queue depth for that zone’s partition', 'CPU of the API gateway', 'Database disk usage', 'Number of riders registered'], why: 'A growing backlog per zone is demand outrunning supply.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['two', 'three']);
      return {
        q: `To speed up matching during a surge, the system started offering a ride to ${n} drivers at once. Now ${n} drivers sometimes tap “Accept” within the same 200 ms and all head to the pickup, and the rider sees a different driver’s name each time the app refreshes.`,
        answer: 'Ride state machine in a durable DB',
        hint: 'Exactly one transition from “requested” to “matched” may succeed.',
        steps: [
          'Each accept tries to move the ride from requested to matched.',
          'Make that a conditional write: UPDATE rides SET driver = ? WHERE id = ? AND status = ‘requested’.',
          'Only one succeeds; the others get “already taken” and are released.',
          'The persisted state is the single source of truth all servers read.',
        ],
        followups: [
          { q: 'Why not keep the ride’s state in the matching server’s memory?', options: ['A crash would lose it, and other servers couldn’t resume or see it', 'Memory is too small', 'It’s fine if you use sticky sessions', 'Databases are slower, so memory is always better'], why: 'Persist every transition so any instance can pick up where another left off.' },
        ],
      };
    },
    (pick) => {
      const s = pick(['WebSocket server', 'matching instance', 'API pod']);
      return {
        q: `A rider requests a ride; the ${s} handling it crashes, and the app reconnects to a different server. That server has no record of the request, so the rider taps again, and now two rides are being matched for one person.`,
        answer: 'Ride state machine in a durable DB',
        hint: 'The new server must be able to find the rider’s open ride.',
        steps: [
          'Request state lived on the crashed server.',
          'Write a per-rider active-ride record first, then the ride row, both durably.',
          'On any (re)connection, look up the rider’s active ride and resume it; block a second request.',
          'Servers become replaceable; the database is the truth.',
        ],
        followups: [
          { q: 'Why write the active-ride record before the ride row?', options: ['If the second write fails, the rider’s record points at nothing and the error is visible; the reverse could leave an orphan ride matched to nobody who knows about it', 'Order doesn’t matter', 'To make it a distributed transaction', 'Because rides are cheaper to write'], why: 'Order your two writes so that a partial failure can be seen and fixed.' },
        ],
      };
    },
  ],
});
