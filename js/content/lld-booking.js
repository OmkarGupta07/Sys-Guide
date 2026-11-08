SG.add({
  id: 'lld-booking',
  ref: 'U4 U8',
  section: 'LLD case studies',
  title: 'LLD: BookMyShow with concurrency',
  short: 'Booking and rate limiter',
  blurb: 'Per-show seat state, seat holds with expiry, optimistic vs pessimistic locking, and a token-bucket class.',
  intro: 'BookMyShow is the concurrency LLD prompt. The flow is city → movies → theatres and shows → seats → payment → ticket, with entities Movie, Theatre (owning Screens), Screen (owning Seats with a category like SILVER, GOLD, PLATINUM), Show (movie + screen + start time), Booking, Payment and Ticket. The first trap is where “booked” lives: a Seat belongs to a Screen and is reused by every show, so booking state must live per Show. The second is the race: two users must never get the same seat, so the claim must be atomic (putIfAbsent in memory, a version or status check in the DB, or a short lock), held for a few minutes with an expiry while the user pays, then confirmed. The rate limiter LLD is its sibling: per-user state that must also be updated atomically.',
  options: {
    'Per-show seat map with putIfAbsent': {
      eli5: 'Each show has its own seating chart pinned at the counter. Whoever writes their name in a box first owns it; the clerk only lets one pen touch a box at a time.',
      industry: [
        'Show holds ConcurrentHashMap<String, SeatHold> seatHolds; claiming is seatHolds.putIfAbsent(seatId, hold) == null.',
        'In the database the same idea is a unique constraint on (show_id, seat_id) in a show_seat or booking_seat table.',
        'Screen and Seat stay immutable layout objects shared by all shows; only the per-show map changes.',
      ],
      def: 'Keep seat state on the Show, not on the Seat, because one physical seat appears in many shows a day. Store it in a ConcurrentHashMap keyed by seat ID and claim with putIfAbsent (or computeIfAbsent): the check and the insert happen as one atomic step, so two threads can’t both see the seat free. A plain List<String> bookedSeatIds with contains() then add() is a check-then-act race, and wrapping the whole BookingService in synchronized makes every show in the city wait on one lock. If BookingService is a singleton, make it thread-safe too (enum, holder idiom, or simply a Spring bean), not a lazy getInstance with an unguarded null check.',
      scenarios: [
        'Two threads in one JVM book the same seat at the same moment',
        'Booking state must differ between the 10 a.m. and 9 p.m. shows on one screen',
        'You must avoid one global lock across all shows',
      ],
      scale: 'O(1) per claim; locking is per map bin, so different seats and shows don’t block each other. Works inside one JVM only; across instances use the DB constraint or Redis.',
    },
    'Seat hold with expiry': {
      eli5: 'At a movie counter the clerk keeps your chosen seats aside for 10 minutes while you fetch cash. If you don’t return, they go back on sale by themselves.',
      industry: [
        'BookMyShow and PVR hold seats for about 8–10 minutes during payment, with a countdown on screen.',
        'SeatHold(userId, expiresAt) in the per-show map, or a ShowSeat row with status HELD, held_by and hold_expires_at.',
        'For many app servers during an IPL or concert drop: Redis SET hold:{showId}:{seatId} userId NX EX 600.',
      ],
      def: 'Selecting a seat creates a temporary hold with an expiry, not a booking. Payment success turns HELD into BOOKED with a guarded update (only if still held by this user and not expired); timeout or failure releases it. Check expiry lazily on every read (an expired hold counts as free) and sweep old ones in the background, so a crashed client never blocks seats. Lock on selection, never while the user is only viewing the seat map.',
      scenarios: [
        'Users take minutes to pay after choosing seats',
        'Abandoned checkouts block seats for everyone else',
        'The payment webhook may arrive after the hold ended',
        'Several app servers must share the holds',
      ],
      scale: 'Typical hold 5–10 min. Lazy expiry check on read plus a ScheduledExecutorService sweep every 30–60 s; Redis TTL removes the sweep entirely.',
    },
    'Optimistic version column': {
      eli5: 'Two people fill the same library slip. The librarian accepts whichever slip still matches the shelf’s current version number; the other is told to pick again.',
      industry: [
        'JPA @Version on ShowSeat: UPDATE … SET status = ‘HELD’, version = v + 1 WHERE id = ? AND version = v.',
        'A conditional update WHERE status = ‘AVAILABLE’ is the same idea without an extra column.',
        'In memory: AtomicReference<SeatStatus>.compareAndSet for a single seat.',
      ],
      def: 'Read without locking, then write only if the row hasn’t changed since you read it. If 0 rows are updated, someone else won; tell the user “seat just taken” at once. No lock is held while anyone waits, so it suits normal days when collisions are rare, and it works across many app instances because the database does the check.',
      scenarios: [
        'Most shows aren’t sold out; collisions are rare',
        'You must not hold DB locks across user think-time',
        'Several app servers update the same seat table',
      ],
      scale: 'Cheap when conflicts are under a few percent; under heavy contention most attempts fail and must pick again.',
    },
    'Pessimistic seat locking': {
      eli5: 'You put your hand on the whole row of seats and say “wait” before deciding which ones to take; others queue until you let go.',
      industry: [
        'SELECT … FOR UPDATE on the chosen ShowSeat rows inside a short transaction.',
        'In memory: a ReentrantLock per Show, or per-seat locks taken in sorted seat-ID order.',
        'Rules that must read several seats before writing, such as “don’t leave a single empty seat between bookings”.',
      ],
      def: 'Lock the rows (or objects) before reading and updating them, so competing transactions wait instead of failing. It fits when a decision depends on reading several seats together, or a multi-seat hold must be all-or-nothing. Keep the lock only for the milliseconds of check-and-hold, never during payment and never while the user is just looking. Lock several seats in a fixed order (by seat ID) to avoid deadlocks.',
      scenarios: [
        'A seating rule needs a consistent view of neighbouring seats',
        'A multi-seat hold must be all-or-nothing',
        'Optimistic retries keep failing on the same few rows',
      ],
      scale: 'Serialises requests on the locked rows; keep transactions to milliseconds and order lock acquisition.',
    },
    'Token bucket limiter class': {
      eli5: 'Each customer gets a jar that refills with one token every second, up to 10. Every request takes a token; an empty jar means wait.',
      industry: [
        'Per-user limits on the booking API during big releases, so bots can’t grab every seat.',
        'Guava RateLimiter and Bucket4j implement token buckets in Java.',
        'Spring Cloud Gateway’s Redis rate limiter keeps a token bucket per key.',
      ],
      def: 'A TokenBucket holds capacity, refillRatePerSec, tokens and lastRefillNanos; tryAcquire() adds elapsed × rate tokens (capped at capacity), then takes one if available, all under synchronized or a CAS loop. A RateLimiter keeps ConcurrentHashMap<userId, TokenBucket>, creating buckets with computeIfAbsent. Behind a RateLimitStrategy interface, a sliding or fixed window can be swapped in.',
      scenarios: [
        'Per-user request limits with short bursts allowed',
        'Interviewer asks for a rate limiter class in 45 minutes',
        'Thousands of users each need independent limits',
      ],
      scale: 'O(1) per call, ~50 bytes per bucket; evict idle buckets. Across servers move the state to Redis with a Lua script.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick(['2', '3', '5']);
      return {
        q: `Code review of an in-memory BookingService: Show has List<String> bookedSeatIds, and book() does “if (!bookedSeatIds.contains(seatId)) bookedSeatIds.add(seatId)”. Under a load test with 200 threads, ${n} seats per show end up sold to two users. A teammate suggests making book() synchronized.`,
        answer: 'Per-show seat map with putIfAbsent',
        hint: 'The check and the claim must be one step, without one lock for the whole city.',
        steps: [
          'contains() then add() is check-then-act: two threads both see “free” and both add.',
          'A synchronized book() fixes it but makes every show wait on one lock.',
          'Give each Show a ConcurrentHashMap<String, SeatHold> and claim with putIfAbsent(seatId, hold).',
          'A null return means you won; anything else means the seat is taken.',
        ],
        followups: [
          { q: 'BookingService.getInstance() does “if (instance == null) instance = new BookingService()”. What’s wrong?', options: ['Two threads can both see null and create two instances; use an enum, the holder idiom, or a DI-managed bean', 'Nothing, singletons are always thread-safe', 'The constructor must be public', 'It should use a static block that calls System.gc()'], why: 'Lazy init without synchronisation is a race of its own.' },
          { q: 'Does putIfAbsent still protect you when the service runs on 4 instances?', options: ['No, each JVM has its own map; use a DB unique constraint on (show_id, seat_id) or Redis', 'Yes, ConcurrentHashMap is distributed', 'Yes, if the map is static', 'Only with volatile'], why: 'In-memory atomicity stops at the process boundary.' },
        ],
      };
    },
    (pick) => {
      const t = pick(['10:00', '13:30', '18:15']);
      return {
        q: `A candidate models Seat(id, row, category, boolean isBooked) inside Screen.seats. After a user books seat D5 for the ${t} show on Screen 2, D5 shows as taken for all five shows on that screen today.`,
        answer: 'Per-show seat map with putIfAbsent',
        hint: 'Which object differs between two shows on the same screen?',
        steps: [
          'Screen owns Seats as fixed layout (composition: they don’t exist without the screen), shared by every show.',
          'Booking state belongs to one show, so it must hang off Show, not Seat.',
          'Give Show its own seat map keyed by seat ID, and keep Seat immutable.',
          'The same map then gives you atomic claims with putIfAbsent.',
        ],
        followups: [
          { q: 'What should getAllShows(movie, city) return to fit the “pick theatre, then show” screen?', options: ['Map<Theatre, List<Show>>', 'List<Seat>', 'Map<Seat, Show>', 'A single Show'], why: 'Group shows by theatre, matching how the user browses.' },
          { q: 'Seat prices differ by category (SILVER, GOLD, PLATINUM) and by show time. Which pattern keeps that swappable?', options: ['Strategy: a PricingStrategy chosen per show', 'Singleton', 'Observer', 'Adapter'], why: 'Pricing is an interchangeable rule.' },
        ],
      };
    },
    (pick) => {
      const m = pick([8, 10, 15]);
      const city = pick(['Chennai', 'Kolkata', 'Mumbai']);
      return {
        q: `A ${city} multiplex: users select seats, then spend up to ${m} minutes on UPI or card payment. About 30% abandon checkout, and those seats stay unavailable until the show starts.`,
        answer: 'Seat hold with expiry',
        hint: 'Selection shouldn’t be a permanent claim.',
        steps: [
          'Selecting a seat must reserve it only temporarily.',
          `Store a SeatHold with userId and expiresAt = now + ${m} min.`,
          'Treat expired holds as free on read; a scheduled sweep removes them.',
          'Payment success turns HELD into BOOKED.',
        ],
        followups: [
          { q: 'Why check expiry lazily on read, not only in the sweep?', options: ['Seats become free exactly on time even if the sweep runs late', 'It saves memory', 'Sweeps aren’t allowed in Java', 'It makes payment faster'], why: 'Lazy checks close the gap between expiry and the next sweep.' },
          { q: 'A payment success webhook arrives 2 minutes after the hold expired and the seat was sold to someone else. What should confirm do?', options: ['Its guarded update (still held by this user, not expired) fails, so mark the booking failed and refund', 'Overwrite the other user’s booking', 'Book both users', 'Ignore it and keep the money'], why: 'A conditional transition plus refund keeps late callbacks safe.' },
          { q: 'Which Java tool fits the periodic sweep in one JVM?', options: ['ScheduledExecutorService.scheduleAtFixedRate', 'Thread.sleep in the request thread', 'A static initializer', 'System.gc()'], why: 'A scheduled executor runs the sweep on its own thread.' },
        ],
      };
    },
    (pick) => {
      const ev = pick(['an IPL playoff', 'a Diljit Dosanjh concert', 'a superstar’s Diwali release']);
      return {
        q: `Tickets for ${ev} open at noon. The booking service runs on 8 instances, and seat holds currently sit in each instance’s ConcurrentHashMap, so users on different instances hold the same seat. Holds must still expire after 10 minutes without a cleanup job.`,
        answer: 'Seat hold with expiry',
        hint: 'Holds need one shared home with a built-in timer.',
        steps: [
          'Per-JVM maps can’t coordinate 8 instances.',
          'Move holds to Redis: SET hold:{showId}:{seatId} userId NX EX 600.',
          'NX makes the claim atomic across instances; EX makes it expire on time.',
          'Confirm still runs a guarded DB update, since Redis can lose holds.',
        ],
        followups: [
          { q: 'A thread does SET key userId, then EXPIRE key 600, and crashes in between. Result?', options: ['The hold never expires and the seat is stuck; use SET with NX and EX in one command', 'Redis expires it after a day by default', 'Nothing, SET implies a TTL', 'The seat is booked twice'], why: 'Claim and expiry must be one atomic command.' },
          { q: 'How do you release a hold safely when payment fails?', options: ['Delete only if the value still equals your userId (a small Lua script)', 'DEL the key without checking', 'Wait for the TTL every time', 'FLUSHALL'], why: 'Otherwise you might delete a hold another user took after yours expired.' },
        ],
      };
    },
    (pick) => {
      const pct = pick(['2%', '3%', '5%']);
      return {
        q: `On a normal Tuesday only ${pct} of seat-hold attempts collide. The service runs on 6 instances against one MySQL show_seat table, and the DBA forbids holding row locks for more than a few milliseconds.`,
        answer: 'Optimistic version column',
        hint: 'Conflicts are rare; locks are expensive.',
        steps: [
          'Collisions are rare, so most requests shouldn’t wait.',
          'Add @Version and update WHERE id = ? AND version = ? (or WHERE status = ‘AVAILABLE’).',
          'If 0 rows changed, the seat was taken: tell the user immediately.',
          'No lock is held between read and write, and the DB coordinates all 6 instances.',
        ],
        followups: [
          { q: 'In JPA, what signals an optimistic conflict?', options: ['OptimisticLockException (ObjectOptimisticLockingFailureException in Spring)', 'A NullPointerException', 'A deadlock error', 'A silent overwrite'], why: '@Version makes the update fail when the version changed.' },
          { q: 'Why doesn’t a Java synchronized block solve this?', options: ['It only coordinates threads inside one JVM, not 6 instances', 'synchronized is too slow for SQL', 'It can’t be used with Spring', 'It leaks memory'], why: 'Cross-instance races need DB-level or distributed coordination.' },
        ],
      };
    },
    (pick) => {
      const k = pick([2, 3, 4]);
      return {
        q: `The cinema adds a rule: a booking of ${k} seats must not leave a single empty seat stranded between two taken ones. To decide, the service must read the whole row, choose seats, and hold them, while other users book in the same row. MySQL, short transactions.`,
        answer: 'Pessimistic seat locking',
        hint: 'The decision depends on several rows staying still while you read them.',
        steps: [
          'The rule reads neighbouring seats, so their state must not change mid-decision.',
          'SELECT … FOR UPDATE the row’s ShowSeat records in seat-ID order inside one transaction.',
          `Check the rule, mark the ${k} seats HELD, commit within milliseconds.`,
          'Competing bookings wait briefly instead of breaking the rule.',
        ],
        followups: [
          { q: 'User A locks seats 5 then 6, user B locks 6 then 5. What prevents deadlock?', options: ['Always acquire locks in sorted seat-ID order', 'Use more threads', 'Lock in the order the user clicked', 'Mark the status volatile'], why: 'A global order removes the circular wait.' },
          { q: 'A design locks the seat rows as soon as a user opens the seat map. Problem?', options: ['Viewers who never book block everyone; lock only on select/hold, for milliseconds', 'Nothing, it is safest', 'It double-books seats', 'MySQL can’t lock on read'], why: 'Lock on the write path, never on browsing.' },
          { q: 'In memory, why might tryLock(200, MILLISECONDS) beat lock()?', options: ['The request gives up quickly instead of waiting behind a stuck holder', 'ReentrantLock requires it', 'It makes the lock fair', 'It removes the need for finally'], why: 'Timeouts bound waiting and let you show “try again”.' },
        ],
      };
    },
    (pick) => {
      const n = pick([5, 10, 20]);
      return {
        q: `Write an in-process RateLimiter for the booking API: each user may make ${n} requests per second with short bursts up to ${n * 2}. 50,000 active users, 200 server threads.`,
        answer: 'Token bucket limiter class',
        hint: 'A per-user jar of tokens that refills over time.',
        steps: [
          `TokenBucket(capacity = ${n * 2}, refill = ${n}/s) with lazy refill on each call.`,
          'tryAcquire() refills by elapsed time, then takes a token if one is available.',
          'Make tryAcquire synchronized per bucket (or a CAS loop).',
          'Keep buckets in a ConcurrentHashMap and create them with computeIfAbsent.',
        ],
        followups: [
          { q: 'Why computeIfAbsent rather than get() then put()?', options: ['It creates the bucket atomically so two threads never get different buckets', 'It is shorter to type', 'It sorts the keys', 'It evicts old buckets'], why: 'get-then-put races, the same bug as contains-then-add on seats.' },
          { q: 'Which clock should the refill maths use?', options: ['System.nanoTime(), which is monotonic', 'System.currentTimeMillis(), the wall clock', 'new Date()', 'LocalDateTime.now()'], why: 'Wall clocks can jump (NTP); nanoTime only moves forward.' },
        ],
      };
    },
  ],
});
