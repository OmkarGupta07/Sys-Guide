SG.add({
  id: 'case-booking',
  ref: 'S11',
  section: 'HLD case studies',
  title: 'Design BookMyShow',
  short: 'Ticket booking',
  blurb: 'Browse and search shows freely, but never sell one seat twice, even when a million fans arrive at once.',
  intro: 'Scope: users view an event with its seat map, search events, and book tickets; adding events is an admin feature you can leave out. The NFRs split by feature, which is the CAP point interviewers want: search and event pages must be highly available and fast (search under ~500 ms), while booking must be strongly consistent so no seat is ever sold twice. Reads dwarf writes (~100:1, about 1% of viewers book), and hot events bring surges of 10–100 million users for 10–100 thousand seats. Booking is two-phase: reserve a seat with a 10-minute Redis hold (SET NX EX), then confirm after payment with a guarded UPDATE in Postgres. Around that sit a virtual waiting queue for hot events, Elasticsearch with cached queries for search, and heavy caching of event data with live seat updates over SSE.',
  options: {
    'Seat hold with TTL': {
      eli5: 'At a sari shop, the shopkeeper keeps your chosen sari aside for 10 minutes while you fetch money. If you don’t come back, it goes back on the shelf by itself, no argument needed.',
      industry: [
        'Redis SET hold:{ticketId} {userId} NX EX 600 on reserve; NX makes it a lock, EX makes it end on time without any cleanup job.',
        'The seat map is “tickets AVAILABLE in Postgres minus ticket IDs with a live Redis hold”, so the DB only stores AVAILABLE or BOOKED.',
        'BookMyShow, Ticketmaster and airline checkouts showing a countdown (“complete payment in 8:59”).',
      ],
      def: 'Booking is two-phase: POST /booking/reserve places a short, automatically expiring hold, then PUT /booking/confirm takes payment and books. The hold lives in Redis, not in booking-service memory, because the service runs on many instances. SET NX EX acquires it atomically and expires it exactly on time. A cron that releases RESERVED rows every 10 minutes is late by up to a full interval (a 10-minute hold can last 19), and a status + reserved_at column treated as “stale means free” works but muddles every query. For several seats, acquire in one Lua script or in seat-ID order and release all on failure. Holds only protect the user experience; the final DB write still enforces “one seat, one booking”.',
      scenarios: [
        'Users need several minutes to pay after choosing seats',
        'Abandoned checkouts must free seats on time, not after a cron sweep',
        'The booking service is horizontally scaled, so holds can’t live in its memory',
        'Many users click the same seat in the same second',
      ],
      scale: 'One Redis op per seat reserved, 10-minute TTL; a single Redis node handles ~100K ops/s. Losing Redis loses holds for at most 10 minutes; it never causes double booking.',
    },
    'Conditional DB update for final booking': {
      eli5: 'The final ticket register at the cinema has one line per seat. The clerk only writes your name if that line is still blank; if someone else’s name is already there, you’re refused.',
      industry: [
        'Postgres: UPDATE tickets SET status = ‘BOOKED’, user_id = ? WHERE id = ? AND status = ‘AVAILABLE’, then check rows affected.',
        'Stripe payment intent on confirm; the webhook marks the booking BOOKED, and a loser of the race is refunded.',
        'Bookings and tickets in one relational database, sharded by event_id, for ACID across a multi-seat order.',
      ],
      def: 'The source of truth is a tickets table with one row per seat per event. Confirming runs a short ACID transaction that moves each ticket to BOOKED only if it is still AVAILABLE and creates the booking row; if any seat fails, the whole booking rolls back. This guarantees no double booking even if Redis loses a hold, a TTL expires mid-payment, or two services race: the first to pay wins and the other gets an error and a refund. That bad experience is rare and acceptable, a product trade-off worth saying aloud. Never hold SELECT … FOR UPDATE locks during payment; keep the locked section to milliseconds.',
      scenarios: [
        'Double booking is unacceptable under any failure',
        'A multi-seat order must be all-or-nothing',
        'The hold layer (Redis) might crash or expire early',
      ],
      scale: 'Bookings are ~1% of traffic; one Postgres primary handles thousands of short booking transactions per second. Shard by event_id only when the numbers say so.',
    },
    'Virtual waiting queue': {
      eli5: 'For a popular temple darshan, you get a token number at the gate and wait in a hall with a screen showing “now serving 4,120”. Only a few hundred are let into the inner hall at a time.',
      industry: [
        'Ticketmaster queues for Taylor Swift and BookMyShow queues for Coldplay and IPL finals, switched on by an admin only for hot events.',
        'A Redis sorted set scored by arrival time (or a random score at sale start, for fairness), admitting batches as seats sell.',
        'Position and estimated wait pushed over SSE, so users don’t refresh and add load.',
      ],
      def: 'For hot events, don’t let millions of users reach the seat map and booking service at once. Put them in a queue and admit a controlled batch at a time, giving each admitted user a short-lived token that the booking service checks. Admitted users see a seat map that still means something; everyone else sees their position. The queue is a deliberate choke point: it turns an uncontrolled spike into a steady flow your booking path is sized for, and it also fixes the user experience of every click hitting an already-held seat.',
      scenarios: [
        'Ten million fans arrive for 50,000 seats at 10:00 sharp',
        'Every seat a user clicks is already held by someone else',
        'The booking service must be protected from the spike',
      ],
      scale: 'Admit a few thousand users per minute per event; one sorted-set entry per user, so even 10M waiting users fit easily in a Redis cluster.',
    },
    'Elasticsearch with cached search': {
      eli5: 'The library’s main register is the truth, but readers search a card catalogue copied from it. The front desk also keeps a slip with answers to the ten questions everyone asks.',
      industry: [
        'Searching events by name, performer, venue, city and date with typo tolerance (“Arijit Sing”) and geo filters for “near me”.',
        'Events kept in sync from Postgres by CDC (Debezium) or by the app writing to both.',
        'Popular searches cached: Elasticsearch’s node query cache, Redis keyed by the normalised query, or the CDN caching the search API for 30–60 seconds.',
      ],
      def: 'LIKE ‘%term%’ scans the whole events table and can’t meet a ~500 ms target or handle typos. Replicate events into Elasticsearch (inverted index, geo queries) and accept seconds of lag. It is not the primary store: it lacks transactions and its durability is weaker. Search returns event summaries only; seat availability is never read from the index. For repeated queries, add a cache; a CDN cache helps only when the query space is small, not for raw latitude/longitude or personalised results.',
      scenarios: [
        'Users search by partial names, typos and several filters at once',
        'Search must stay fast even while bookings hammer the main DB',
        'The same few searches repeat thousands of times a minute',
      ],
      scale: 'Events are few (millions) and change rarely, so the index is small; the load is query volume, handled with replicas and a 30–60 s cache of common searches.',
    },
    'Cached event data + SSE seat map': {
      eli5: 'The cinema prints the film poster and timings once and sticks them outside, instead of the manager answering each passer-by. Only the seat chart is redrawn live as seats go.',
      industry: [
        'Event, venue and performer details in Redis and the CDN with long TTLs, invalidated on admin edits.',
        'Tickets not cached: availability comes from the DB and Redis holds, with changes pushed to open seat maps over Server-Sent Events.',
        'Stateless event services behind an API gateway, autoscaled before a big sale.',
      ],
      def: 'Most traffic reads data that rarely changes: event descriptions, posters, venue layouts. Cache it heavily and invalidate on edits. Seat availability changes every second, so don’t cache it for long; push changes to open seat maps instead. SSE fits because updates only flow server to client; WebSocket is two-way and more than needed, and long polling is fine only if users leave the page quickly. Any view that is still a little stale is caught by the hold and the final guarded write.',
      scenarios: [
        'Read:write ratio around 100:1',
        'A trailer drop sends millions to one event page',
        'Users keep clicking seats that were taken seconds ago',
      ],
      scale: 'A CDN serves static event pages at millions of requests per second; one SSE server holds tens of thousands of open connections.',
    },
  },
  scenarios: [
    (pick) => {
      const ev = pick(['an IPL final', 'a Coldplay concert in Mumbai', 'a Rajinikanth first-day show']);
      const users = pick(['10 million', '20 million', '5 million']);
      return {
        q: `Interviewer: “Design BookMyShow; ${ev} goes on sale at 10:00.” You list NFRs: search under 500 ms, reads ~100× bookings, ${users} users may arrive for about 50,000 seats, browsing always up, and “never sell one seat twice”. Which component is the final enforcer of that last NFR, whatever any cache or hold says?`,
        answer: 'Conditional DB update for final booking',
        hint: 'Holds and caches can be wrong. What can’t be?',
        steps: [
          'Caches and seat maps can be seconds stale; that is fine for browsing, which favours availability.',
          'Holds improve the experience but can expire, or vanish if Redis fails.',
          'The ACID transaction that books a ticket only WHERE status = ‘AVAILABLE’ is the real guard.',
          'So strong consistency is required at this one write, and the rest of the system can favour availability.',
        ],
        followups: [
          { q: 'Why is “consistency vs availability” answered per feature here?', options: ['Browsing can be slightly stale and must stay up; booking must be correct even if it sometimes errors', 'CAP forces one answer for the whole system', 'Booking needs availability more than search does', 'Neither matters for ticketing'], why: 'Scope each NFR to the part of the system it protects.' },
          { q: `${users} users for 50,000 seats. Which NFR does that number add?`, options: ['Survive sudden surges for hot events without the booking path falling over', 'Store petabytes of ticket data', 'Very low write latency for every booking', 'Multi-region strong consistency'], why: 'Demand far beyond supply is a spike-handling NFR, not a storage one.' },
          { q: 'Why not hold a SELECT … FOR UPDATE lock during the 5–10 minute payment?', options: ['Long-held row locks cause contention and stuck locks after crashes', 'Postgres doesn’t support row locks', 'It would double-book seats', 'Row locks only work in NoSQL'], why: 'Keep database locks to the milliseconds of the final write.' },
        ],
      };
    },
    (pick) => {
      const pct = pick(['18%', '25%', '12%']);
      return {
        q: `Users pick seats, enter payment details, and only then learn the seat was taken; ${pct} of payment attempts for popular shows end this way. A first fix marks seats RESERVED and a cron frees them every 10 minutes, but some holds now last 19 minutes and abandoned seats look taken long after users leave. The booking service runs on 12 instances.`,
        answer: 'Seat hold with TTL',
        hint: 'Claim the seat before payment, and let the claim end on time by itself.',
        steps: [
          'Claim the seat at reserve time, not when payment completes.',
          'Put the hold in Redis, shared by all 12 instances, with SET hold:{ticketId} userId NX EX 600.',
          'The key expires exactly at 10 minutes; no cron is involved in correctness.',
          'The seat map is DB AVAILABLE minus live holds, and the final guarded UPDATE still catches any race.',
        ],
        followups: [
          { q: 'Why SET … NX EX rather than a plain SET followed by EXPIRE?', options: ['It checks, sets and adds the expiry in one atomic step, so two users can’t both win and no hold lives forever', 'Plain SET is slower', 'EXPIRE doesn’t exist in Redis', 'NX encrypts the value'], why: 'Without NX a second user overwrites the hold; a crash between SET and EXPIRE leaves a hold that never expires.' },
          { q: 'A hold expires while the user’s payment is still processing and someone else books the seat. What happens?', options: ['The first user’s guarded UPDATE fails, so refund them; extend the hold when payment starts to make this rare', 'Both users get the seat', 'Cancel the second user’s booking', 'It can’t happen'], why: 'The DB guard decides; refunds handle the rare loser.' },
          { q: 'A family reserves 4 seats one at a time and the third fails. What should the hold logic do?', options: ['Release the two it took (or grab all four in one Lua script) and say which seat is gone', 'Keep the two holds for 10 minutes', 'Retry the third seat forever', 'Book the two seats anyway'], why: 'Partial holds block seats nobody will buy.' },
        ],
      };
    },
    (pick) => {
      const seat = pick(['F12', 'C7', 'K3']);
      return {
        q: `At 20:00 the Redis node holding seat holds crashes and restarts empty. Two users who were mid-checkout both go on to pay for seat ${seat}, and a third user now reserves it too. The team asks how you stop the seat being sold twice.`,
        answer: 'Conditional DB update for final booking',
        hint: 'Which layer never forgets?',
        steps: [
          'Holds were lost, so for up to 10 minutes several users can believe they hold the seat.',
          'Each confirm runs UPDATE tickets SET status = ‘BOOKED’ WHERE id = ? AND status = ‘AVAILABLE’.',
          'Only the first succeeds (1 row); the others see 0 rows, the booking rolls back and their payments are refunded.',
          'Correctness never depended on Redis, only the user experience did.',
        ],
        followups: [
          { q: 'Is “first to pay wins, the other gets an error” acceptable?', options: ['Yes, it is rare and safe; a product decision to accept briefly worse UX over adding a strongly consistent lock service', 'No, it is double booking', 'No, so make Redis the source of truth', 'Yes, because nobody notices'], why: 'Name the trade-off: rare bad UX, never a wrong sale.' },
          { q: 'Why not move holds into the booking service’s memory to avoid Redis failures?', options: ['Instances are horizontally scaled, so each would see different holds', 'Java can’t store maps', 'Memory is slower than Redis', 'It would make search slower'], why: 'Shared state for many instances belongs in a shared store.' },
        ],
      };
    },
    (pick) => {
      const users = pick(['10 million', '5 million', '15 million']);
      const seats = pick(['50,000', '35,000', '80,000']);
      return {
        q: `${users} users open the app within 2 minutes of tickets going on sale for ${seats} seats. Seat maps now update live over SSE, yet every seat a user clicks is already held. The booking service is at 100% CPU and users rage-refresh, making it worse.`,
        answer: 'Virtual waiting queue',
        hint: 'Control how many people are inside the shop at once.',
        steps: [
          'Demand is hundreds of times supply; letting everyone pick seats at once is chaos.',
          'An admin enables the queue for this event: a Redis sorted set before the seat map.',
          'Admit batches as seats sell, each with a short-lived admission token that booking checks.',
          'Push position and estimated wait over SSE so users stop refreshing.',
        ],
        followups: [
          { q: 'Why are live seat updates alone not enough here?', options: ['Seats still go within milliseconds; the problem is too many contenders, not stale data', 'SSE doesn’t work on mobile', 'SSE is slower than polling', 'They are enough'], why: 'Fresh data doesn’t help when demand is 200× supply.' },
          { q: 'Users who opened the app at 09:59 complain that people who arrived at 10:00 got in first. What queue ordering is fairest at sale start?', options: ['Give everyone present at opening a random position, then order later arrivals by time', 'Order strictly by request timestamp', 'Let premium users skip the queue silently', 'Sort by user ID'], why: 'Network luck at the opening second isn’t fair; randomise that first cohort.' },
        ],
      };
    },
    (pick) => {
      const typo = pick(['“Arijit Sing live”', '“kalki 2898 imax”', '“standup comedy bandra”']);
      return {
        q: `Users search ${typo}. Search runs SELECT … WHERE name LIKE ‘%…%’ on the events table in the booking Postgres primary. It takes 2–4 seconds, misses typos, and slows bookings when traffic spikes. The NFR is search under 500 ms.`,
        answer: 'Elasticsearch with cached search',
        hint: 'A different kind of index, away from the booking database.',
        steps: [
          'A leading-wildcard LIKE can’t use a B-tree index, so it scans every row.',
          'An inverted index answers keyword, fuzzy and filtered queries in milliseconds.',
          'Sync events to Elasticsearch through CDC; a few seconds of lag is fine.',
          'Search load no longer touches the booking primary.',
        ],
        followups: [
          { q: 'Should search results show live seat counts from Elasticsearch?', options: ['No: availability changes too fast; read it from the booking system on the event page', 'Yes, update Elasticsearch on every hold', 'Yes, search is the source of truth', 'Only for sold-out shows'], why: 'Keep fast-changing, consistency-critical data out of the search index.' },
          { q: 'Why not make Elasticsearch the only store for events and tickets?', options: ['No transactions and weaker durability; keep Postgres as the source of truth', 'It can’t store text', 'It is slower than LIKE', 'It can’t run on Linux'], why: 'Search engines are derived indexes, not systems of record.' },
        ],
      };
    },
    (pick) => {
      const q = pick(['“concerts in Mumbai this weekend”', '“movies near me today”', '“IPL tickets”']);
      const n = pick(['40,000', '80,000', '25,000']);
      return {
        q: `Search for ${q} now arrives ${n} times a minute during a big sale, and the Elasticsearch cluster’s CPU is at 85%. Results only need to be about a minute fresh, and the same handful of queries make up most traffic.`,
        answer: 'Elasticsearch with cached search',
        hint: 'Most of these requests ask the exact same question.',
        steps: [
          'The query mix is repetitive and a minute of staleness is acceptable.',
          'Cache results in Redis keyed by the normalised query (or let the CDN cache the search API for 30–60 s).',
          'Elasticsearch’s own node query cache also helps repeated filters.',
          'Only cache misses reach the cluster, so CPU falls sharply.',
        ],
        followups: [
          { q: 'When does CDN caching of search results stop working?', options: ['When queries carry raw latitude/longitude or are personalised, so almost no two are identical', 'When results are JSON', 'When the CDN is in India', 'When there are more than 100 events'], why: 'High-cardinality keys give a near-zero hit rate; round the location or cache by city instead.' },
        ],
      };
    },
    (pick) => {
      const trigger = pick(['a trailer launch', 'a celebrity tweet', 'a cricket semi-final result']);
      return {
        q: `After ${trigger}, 2 million users a minute open the same event page. Each load reads event, venue, performer and all tickets from Postgres, and the seat map polls every 30 seconds, so users keep clicking seats that went 20 seconds ago. The primary’s CPU spike delays bookings for other shows.`,
        answer: 'Cached event data + SSE seat map',
        hint: 'Most of that page hasn’t changed in weeks; the rest changes every second.',
        steps: [
          'Event, venue and performer data barely change: serve them from Redis and the CDN with long TTLs.',
          'Tickets are not cached; changes to availability are pushed to open seat maps over SSE.',
          'Polling stops, so Postgres load drops and maps are close to live.',
          'Holds and the guarded final write catch whatever is still stale.',
        ],
        followups: [
          { q: 'Why SSE rather than WebSocket for the seat map?', options: ['Updates flow only server to client; SSE is simpler over plain HTTP, and WebSocket’s two-way channel isn’t needed', 'WebSocket can’t send JSON', 'SSE supports more browsers than HTTP', 'WebSocket is always slower'], why: 'Pick the simplest channel that matches the direction of data.' },
          { q: 'An organiser changes the show time. How do caches learn?', options: ['Invalidate the cached keys on update (or via CDC), with TTL as a backstop', 'Wait for the 24-hour TTL', 'Restart the CDN', 'Ask users to clear their cache'], why: 'Event-driven invalidation plus TTL keeps rarely changing data fresh enough.' },
        ],
      };
    },
  ],
});
