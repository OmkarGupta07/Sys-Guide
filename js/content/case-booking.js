SG.add({
  id: 'case-booking',
  ref: 'S11',
  section: 'HLD case studies',
  title: 'Design BookMyShow',
  short: 'Ticket booking',
  blurb: 'Browse and search shows freely, but never sell one seat twice, even when a million fans arrive at once.',
  intro: 'Scope: users browse and search events (films, concerts, IPL matches), open a seat map, pick seats, pay, and get tickets. The NFRs split by feature: browsing and search must be highly available and fast (search under ~500 ms, reads outnumber bookings ~100:1), while booking must be strongly consistent, so no seat is ever sold twice. Hot events add a third NFR: survive millions of users arriving in the same minute. The usual design is: a seat hold with a TTL (Redis lock, or a status + expiry column) while the user pays, a conditional update in a relational database as the final guard, a virtual waiting queue for hot events, Elasticsearch fed by CDC for search, and aggressive caching of event pages and seat maps.',
  options: {
    'Seat hold with TTL': {
      eli5: 'At a sari shop, the shopkeeper keeps your chosen sari aside for 10 minutes while you fetch money. If you don’t come back, it goes back on the shelf by itself, no argument needed.',
      industry: [
        'Redis SET seat:{showId}:{seatId} userId NX EX 600 when a user picks a seat.',
        'A status + hold_expires_at column: a seat is free if AVAILABLE, or HELD with an expiry in the past.',
        'BookMyShow, Ticketmaster and airline checkouts showing a countdown (“complete payment in 8:59”).',
      ],
      def: 'When a user selects seats, place a short, automatically expiring hold before asking for payment, so they don’t type card details only to learn the seat is gone. In Redis, SET NX with an expiry acquires the hold atomically and frees it on timeout; for several seats, acquire in a fixed order (or one Lua script) and release all on failure. A database alternative treats “HELD with expired timestamp” as available, so correctness never depends on a cleanup cron. Holds only improve the user experience; the final database write still enforces “one seat, one booking”.',
      scenarios: [
        'Users need several minutes to pay after choosing seats',
        'Abandoned checkouts must free seats promptly, not after a cron sweep',
        'Many users click the same seat in the same second',
      ],
      scale: 'One Redis op per seat selected; 10 minute TTLs. With a cron releasing holds every few minutes, hot seats sit locked long after the user left.',
    },
    'Conditional DB update for final booking': {
      eli5: 'The final ticket register at the cinema has one line per seat. The clerk only writes your name if that line is still blank; if someone else’s name is already there, you’re refused.',
      industry: [
        'Postgres: UPDATE tickets SET status = ‘BOOKED’, booking_id = ? WHERE id = ? AND status <> ‘BOOKED’, checking rows affected.',
        'Optimistic concurrency with a version column on each ticket row.',
        'Bookings and tickets in one relational database for ACID transactions across a multi-seat order.',
      ],
      def: 'The source of truth is a tickets table with one row per seat per show. Confirming a booking runs a short ACID transaction that moves each ticket to BOOKED only if it isn’t already booked (conditional update or version check) and creates the booking row; if any seat fails, the whole booking rolls back. This guarantees no double booking even if Redis loses a hold, a TTL expires mid-payment or two services race. Avoid long SELECT … FOR UPDATE locks held during payment; keep the locked section to milliseconds.',
      scenarios: [
        'Double booking is unacceptable under any failure',
        'A multi-seat order must be all-or-nothing',
        'The hold layer (Redis) might fail or expire early',
      ],
      scale: 'Bookings are ~1% of traffic; one Postgres primary handles thousands of short booking transactions per second, and shows can be sharded by event ID.',
    },
    'Virtual waiting queue': {
      eli5: 'For a popular temple darshan, you get a token number at the gate and wait in a hall with a screen showing “now serving 4,120”. Only a few hundred are let into the inner hall at a time.',
      industry: [
        'Ticketmaster and BookMyShow queues for big concerts and IPL finals.',
        'A Redis sorted set ordered by arrival time, admitting batches into an admitted:{eventId} set with a TTL.',
        'Position and estimated wait pushed over SSE/WebSocket so users don’t refresh.',
      ],
      def: 'For hot events, don’t let millions of users hit the seat map and booking service at once. Put them in a queue ordered by arrival (or randomised at sale start for fairness), and admit a controlled batch at a time, issuing a short-lived admission token that the booking service checks. Admitted users see a seat map that is still meaningful; everyone else sees their position and an estimated wait. It turns an uncontrolled spike into a steady flow your booking path is sized for.',
      scenarios: [
        'Ten million fans arrive for 50,000 seats at 10:00 sharp',
        'Seat maps go stale within seconds under contention',
        'The booking service must be protected from the spike',
      ],
      scale: 'Admit maybe 1–5K users per minute per event; queue state is tiny (one sorted-set entry per user), so even 10M entries fit in a Redis cluster.',
    },
    'Elasticsearch fed by CDC': {
      eli5: 'The library’s main register is the truth, but readers search a card catalogue copied from it. A helper copies every new entry to the catalogue a few seconds later.',
      industry: [
        'Searching events by title, artist, venue, city and date with fuzzy matching (“Arijit Sing”).',
        'Debezium or DynamoDB Streams pushing event changes into Elasticsearch.',
        'Geo filters for “shows near me” and facets for language, genre and format (IMAX, 3D).',
      ],
      def: 'LIKE ‘%keyword%’ queries scan the whole events table and can’t meet a ~500 ms target or handle typos. Keep events in the relational database and replicate them to a search engine with an inverted index through change data capture, accepting seconds of lag. Search returns event IDs and summary fields; seat availability is never read from the search index. Postgres full-text (tsvector + GIN) is a lighter option at small scale.',
      scenarios: [
        'Users search by partial names, typos and several filters at once',
        'Search must stay fast even while bookings hammer the main DB',
        'A few seconds of lag for newly added shows is fine',
      ],
      scale: 'Events are few (millions) and change rarely, so the index is small; the load is query volume, handled with replicas and caching of common searches.',
    },
    'Cache for event pages and seat maps': {
      eli5: 'The cinema prints the film poster and timings once and sticks them outside, instead of the manager answering each passer-by. Only the seat chart is redrawn every few seconds.',
      industry: [
        'Event, venue and artist details in Redis/CDN with long TTLs (hours).',
        'Seat availability cached for a few seconds, or pushed as deltas over SSE to open seat maps.',
        'Stateless event services behind a load balancer, scaled horizontally before a big sale.',
      ],
      def: 'Most traffic is reads of data that barely changes: event descriptions, posters, venue layouts. Cache them at the CDN and in Redis with long TTLs, and invalidate on edits. Seat availability changes fast, so cache it briefly or push changes, and accept that it may be a few seconds stale: the hold and the final booking write will catch conflicts. This is where “availability for browsing” is implemented.',
      scenarios: [
        'Read:write ratio around 100:1',
        'A trailer drop sends millions to one event page',
        'Seat maps can be a few seconds stale',
      ],
      scale: 'A CDN serves static event pages at millions of requests per second; Redis serves ~100K reads/s per node for dynamic availability.',
    },
  },
  scenarios: [
    (pick) => {
      const ev = pick(['an IPL final', 'a Coldplay concert in Mumbai', 'a Rajinikanth first-day show']);
      return {
        q: `Interviewer: “Design BookMyShow; assume ${ev} is on sale.” You state NFRs: search under 500 ms, reads ~100× bookings, availability for browsing, and “never sell one seat twice”. Which component is the final enforcer of that last NFR, regardless of what any cache or hold says?`,
        answer: 'Conditional DB update for final booking',
        hint: 'Holds and caches can be wrong. What can’t be?',
        steps: [
          'Caches and seat maps can be stale; that’s acceptable for browsing.',
          'Holds improve the user experience but can expire or be lost.',
          'The ACID transaction that moves tickets to BOOKED only if not already booked is the true guard.',
          'So consistency is required at this one write; everything else favours availability.',
        ],
        followups: [
          { q: 'Why is “consistency vs availability” answered per feature here?', options: ['Browsing can be stale and always up; booking must be correct even if it sometimes errors', 'CAP forces one global answer', 'Booking needs availability more than search', 'Neither matters for tickets'], why: 'Scope NFRs to the part of the system they protect.' },
          { q: 'Why not hold a SELECT … FOR UPDATE lock during the 5–10 minute payment?', options: ['Long-held row locks cause contention, deadlocks and stuck locks after crashes', 'Postgres doesn’t support row locks', 'It would double-book seats', 'Locks are only for NoSQL'], why: 'Keep the database lock to the milliseconds of the final write.' },
        ],
      };
    },
    (pick) => {
      const pct = pick(['18%', '25%', '12%']);
      return {
        q: `Users choose seats, enter payment details, and only then does the booking call discover the seat was taken; ${pct} of payment attempts for popular shows end this way. A later fix marks seats RESERVED with a cron job that frees them every 5 minutes, but now seats look taken long after users abandon checkout.`,
        answer: 'Seat hold with TTL',
        hint: 'Claim the seat before payment, and let the claim end on time by itself.',
        steps: [
          'The seat must be claimed when selected, not when payment completes.',
          'Use a hold that expires automatically at exactly 10 minutes (Redis SET NX EX, or status + expiry column).',
          'Treat expired holds as available at read time, so no cron is needed for correctness.',
          'The final conditional update still guards against any race.',
        ],
        followups: [
          { q: 'A hold expires while the user’s payment is still processing and someone else books the seat. What happens?', options: ['The first booking’s final write fails, so refund the payment automatically; extend the hold when payment starts to make this rare', 'Both get the seat', 'Cancel the second user', 'It can’t happen'], why: 'The DB guard decides; refunds handle the rare loser.' },
          { q: 'Redis holds are in a plain set and expired ones still show as taken on the seat map. Fix?', options: ['Use a sorted set scored by expiry and drop entries with score < now on read', 'Restart Redis hourly', 'Never expire holds', 'Show all seats as free'], why: 'Per-key TTLs don’t clean up members of a set; score by expiry instead.' },
        ],
      };
    },
    (pick) => {
      const users = pick(['10 million', '5 million', '15 million']);
      const seats = pick(['50,000', '35,000', '80,000']);
      return {
        q: `${users} users open the app within 2 minutes of tickets going on sale for ${seats} seats. Seat maps refresh constantly but every seat a user clicks is already held. The booking service is at 100% CPU and users rage-refresh, making it worse.`,
        answer: 'Virtual waiting queue',
        hint: 'Control how many people are inside the shop at once.',
        steps: [
          'Far more users than seats arrive at once; letting all of them pick seats is chaos.',
          'Put users in a queue (Redis sorted set by arrival time) before the seat map.',
          'Admit batches with a short-lived admission token that booking checks.',
          'Push position and estimated wait over SSE so users stop refreshing.',
        ],
        followups: [
          { q: 'Why is real-time seat updates over SSE alone not enough here?', options: ['Seats still vanish within milliseconds; the problem is too many contenders, not stale data', 'SSE doesn’t work on mobile', 'SSE is slower than polling', 'It is enough'], why: 'Fresh data doesn’t help when demand is 200× supply.' },
        ],
      };
    },
    (pick) => {
      const typo = pick(['“Arijit Sing live”', '“kalki 2898 imax”', '“standup comedy bandra”']);
      return {
        q: `Users search ${typo}. The current search runs SELECT … WHERE title LIKE ‘%…%’ on the events table in the booking Postgres primary. It takes 2–4 seconds, misses typos, and slows down bookings when traffic spikes.`,
        answer: 'Elasticsearch fed by CDC',
        hint: 'A different index type, off the booking database.',
        steps: [
          'Leading-wildcard LIKE can’t use a B-tree index and scans everything.',
          'An inverted index supports keyword, fuzzy and filtered queries quickly.',
          'Replicate events to Elasticsearch via CDC; seconds of lag are fine.',
          'Search load no longer touches the booking primary.',
        ],
        followups: [
          { q: 'Should search results show live seat counts from Elasticsearch?', options: ['No: availability changes too fast; read it from the booking system or a short-TTL cache on the event page', 'Yes, update Elasticsearch on every hold', 'Yes, search is the source of truth', 'Only for sold-out shows'], why: 'Keep fast-changing, consistency-sensitive data out of the search index.' },
        ],
      };
    },
    (pick) => {
      const trailer = pick(['a trailer launch', 'a celebrity tweet', 'a cricket semi-final result']);
      return {
        q: `After ${trailer}, 2 million users per minute open the same event page. Each page load reads the event, venue, artist and seat layout from Postgres. Reads are 100× bookings, and the primary’s CPU spike delays booking transactions for other shows.`,
        answer: 'Cache for event pages and seat maps',
        hint: 'Most of that page hasn’t changed in weeks.',
        steps: [
          'Event, venue and artist data are static; serve them from a CDN/Redis with long TTLs.',
          'Seat availability gets a short TTL or pushed updates, and may be seconds stale.',
          'Holds and the final conditional write catch any stale view.',
          'Postgres is left for the small share of booking writes.',
        ],
        followups: [
          { q: 'When an organiser changes the show time, how do caches learn?', options: ['Invalidate the cached keys on update (or via CDC), with TTL as a backstop', 'Wait for the 24 h TTL', 'Restart the CDN', 'Users must clear their cache'], why: 'Event-driven invalidation plus TTL keeps rarely changing data fresh enough.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['four', 'six', 'two']);
      return {
        q: `A family books ${n} adjacent seats. The service holds them one at a time in Redis; the third hold fails because someone else grabbed that seat, but the first two stay held for 10 minutes and the family’s booking errors out.`,
        answer: 'Seat hold with TTL',
        hint: 'A multi-seat hold should behave like one hold.',
        steps: [
          'Partial holds block seats nobody will buy.',
          'Acquire all holds in one atomic Lua script on one node (or in seat-ID order, releasing all on failure).',
          'Return a clear “some seats taken” so the user can pick again.',
          'The final booking transaction still commits all seats or none.',
        ],
        followups: [
          { q: 'Why acquire seat holds in a fixed order across users?', options: ['It prevents two users each holding half of the other’s seats and both failing (deadlock-like)', 'Redis requires sorted keys', 'It speeds up payment', 'Order doesn’t matter'], why: 'Consistent ordering avoids circular waits.' },
        ],
      };
    },
  ],
});
