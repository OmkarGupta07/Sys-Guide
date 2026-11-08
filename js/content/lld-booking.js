SG.add({
  id: 'lld-booking',
  ref: 'U4 U8',
  section: 'LLD case studies',
  title: 'LLD: BookMyShow with concurrency',
  short: 'Booking and rate limiter',
  blurb: 'Seat holds with expiry, optimistic vs pessimistic locking, booking states, and a token-bucket class.',
  intro: 'BookMyShow is the concurrency LLD prompt: Movie, Theatre, Screen, Show, Seat, ShowSeat, Booking, Payment. The core question is how two users can never get the same seat: hold seats for a few minutes, then confirm on payment. Decide how the hold is made safe (optimistic version check or pessimistic lock), how it expires, and how booking moves through its states. The rate limiter LLD is its sibling: a small class design where per-user state must be updated atomically.',
  options: {
    'Seat hold with expiry': {
      eli5: 'At a movie counter the clerk keeps your chosen seats aside for 10 minutes while you fetch cash. If you do not return, they go back on sale.',
      industry: [
        'BookMyShow and PVR hold seats for roughly 8–10 minutes during payment.',
        'IRCTC Tatkal and concert ticketing hold inventory while the payment gateway responds.',
        'Holds stored as ShowSeat(status=HELD, heldBy, holdExpiresAt) or as Redis keys with TTL.',
      ],
      def: 'Selecting seats creates a temporary hold with an expiry time, not a booking. Payment success converts HELD to BOOKED; timeout or failure releases them. Expiry is enforced lazily (a held seat whose expiresAt has passed counts as free) and swept by a scheduled job, so a crashed client never locks seats forever.',
      scenarios: [
        'Users take minutes to pay after choosing seats',
        'Abandoned checkouts block seats for everyone else',
        'Payment gateway can be slow or fail',
      ],
      scale: 'Typical hold 5–10 min. Lazy expiry check + a ScheduledExecutorService sweep every 30–60 s.',
    },
    'Optimistic seat locking': {
      eli5: 'Two people fill the same library slip. The librarian accepts whichever slip still matches the shelf’s current version number; the other is told to pick again.',
      industry: [
        'JPA @Version on ShowSeat: UPDATE … SET status=HELD, version=v+1 WHERE id=? AND version=v.',
        'Conditional updates (WHERE status = AVAILABLE) on popular shows.',
        'In-memory: AtomicReference<SeatStatus>.compareAndSet for each seat.',
      ],
      def: 'Read without locking, then write only if the seat has not changed since you read it (version or status check). If 0 rows are updated, someone else won; report “seat just taken”. No locks are held while the user thinks, so it scales well when conflicts are rare.',
      scenarios: [
        'Most shows are not sold out; conflicts are rare',
        'You must not hold DB locks across user think-time',
        'Multiple app servers update the same seat table',
      ],
      scale: 'Cheap when conflicts are under a few percent; under heavy contention many users see retry errors.',
    },
    'Pessimistic seat locking': {
      eli5: 'You put your hand on the seat and say “mine” before checking anything else; others wait until you let go.',
      industry: [
        'SELECT … FOR UPDATE on the chosen ShowSeat rows inside a short transaction.',
        'In-memory: ReentrantLock per show, or locks per seat acquired in sorted seat order.',
        'First-day-first-show releases where thousands of users target the same rows.',
      ],
      def: 'Lock the rows (or objects) before checking and updating them, so competing transactions wait. Keep the lock only for the short check-and-hold step, never during payment. When locking several seats, always lock in a fixed order (by seat id) to avoid deadlocks.',
      scenarios: [
        'A blockbuster opening where most requests collide',
        'A multi-seat hold must be all-or-nothing',
        'Retry storms from optimistic failures hurt users',
      ],
      scale: 'Contention serialises requests on hot rows; keep transactions to milliseconds and order lock acquisition.',
    },
    'Booking state machine': {
      eli5: 'An order slip moves through stamps, “held”, “paid”, “confirmed” or “cancelled”, and a clerk refuses to stamp out of order.',
      industry: [
        'Booking: CREATED → SEATS_HELD → PAYMENT_PENDING → CONFIRMED, or → EXPIRED / FAILED / CANCELLED.',
        'Payment callbacks from Razorpay or PayU can arrive late or twice; states make them safe.',
        'Refund flows only start from CONFIRMED or CANCELLED_BY_USER.',
      ],
      def: 'Model Booking status as an enum with allowed transitions (an EnumMap<Status, Set<Status>> or State classes). Every transition is checked and done atomically (compare current status and set new). Late or duplicate payment callbacks become no-ops or trigger refunds instead of double-booking.',
      scenarios: [
        'A payment success arrives after the hold expired',
        'The same payment webhook is delivered twice',
        'Cancellation and refund rules depend on the current status',
      ],
      scale: 'Transitions are O(1); store an idempotency key (payment id) to dedupe callbacks.',
    },
    'Token bucket limiter class': {
      eli5: 'Each customer gets a jar that refills with one token every second up to 10. Every request takes a token; an empty jar means wait.',
      industry: [
        'Per-user API limits on booking endpoints during big releases.',
        'Guava RateLimiter and Bucket4j implement token buckets in Java.',
        'Spring Cloud Gateway’s Redis rate limiter uses a token bucket per key.',
      ],
      def: 'A TokenBucket holds capacity, refillRatePerSec, tokens and lastRefillNanos; tryAcquire() lazily adds elapsed × rate tokens (capped), then takes one if available, all under synchronized or a CAS loop. A RateLimiter keeps ConcurrentHashMap<userId, TokenBucket> created with computeIfAbsent. Behind a RateLimitStrategy interface, sliding window or fixed window can be swapped in.',
      scenarios: [
        'Per-user request limits with allowed short bursts',
        'Interviewer asks for a rate limiter class in 45 minutes',
        'Thousands of users each need independent limits',
      ],
      scale: 'O(1) per call, ~50 bytes per bucket; evict idle buckets. Across servers move state to Redis with a Lua script.',
    },
  },
  scenarios: [
    (pick) => {
      const m = pick([8, 10, 15]);
      const city = pick(['Chennai', 'Kolkata', 'Mumbai']);
      return {
        q: `A ${city} multiplex: users select seats, then spend up to ${m} minutes on UPI or card payment. About 30% abandon checkout, and those seats stay unavailable until the show starts.`,
        answer: 'Seat hold with expiry',
        hint: 'Selection should not be a permanent claim.',
        steps: ['Selecting a seat must reserve it only temporarily.', 'Store HELD with heldBy and expiresAt = now + ' + m + ' min.', 'Treat expired holds as free on read; a scheduled sweep releases them.', 'Payment success converts HELD to BOOKED.'],
        followups: [
          { q: 'Which Java tool fits the periodic sweep of expired holds in one JVM?', options: ['ScheduledExecutorService.scheduleAtFixedRate', 'Thread.sleep in the request thread', 'A static initializer', 'System.gc()'], why: 'A scheduled executor runs the sweep on its own thread at fixed intervals.' },
          { q: 'Why also check expiry lazily on read, not only in the sweep?', options: ['Seats become free exactly on time even if the sweep runs late', 'It saves memory', 'Sweeps are not allowed in Java', 'It makes payment faster'], why: 'Lazy checks remove the gap between expiry and the next sweep.' },
        ],
      };
    },
    (pick) => {
      const pct = pick(['2%', '3%', '5%']);
      return {
        q: `On a normal Tuesday, only ${pct} of seat-hold attempts collide. The service runs on 6 instances against one MySQL table, and the DBA forbids holding row locks for more than a few milliseconds.`,
        answer: 'Optimistic seat locking',
        hint: 'Conflicts are rare; locks are expensive.',
        steps: ['Collisions are rare, so most requests should not wait.', 'Use a version column or WHERE status = AVAILABLE in the UPDATE.', 'If 0 rows changed, the seat was taken: tell the user immediately.', 'No locks are held between read and write.'],
        followups: [
          { q: 'In JPA, what signals an optimistic conflict?', options: ['OptimisticLockException (ObjectOptimisticLockingFailureException in Spring)', 'A NullPointerException', 'A deadlock error', 'A silent overwrite'], why: '@Version makes the update fail when the version changed.' },
          { q: 'Why does a Java synchronized block not solve this here?', options: ['It only coordinates threads inside one JVM, not 6 instances', 'synchronized is too slow for SQL', 'It cannot be used with Spring', 'It leaks memory'], why: 'Cross-instance races need DB-level or distributed coordination.' },
        ],
      };
    },
    (pick) => {
      const movie = pick(['a superstar’s Diwali release', 'a cricket World Cup final screening', 'an Avengers premiere']);
      return {
        q: `First-day-first-show for ${movie}: 40,000 users try to hold the same 300 seats within 60 seconds. With optimistic updates, 95% of attempts fail and clients retry in a storm.`,
        answer: 'Pessimistic seat locking',
        hint: 'When nearly everyone collides, make them queue instead of retry.',
        steps: ['Conflict rate is extreme, so optimistic retries waste work.', 'Lock the seat rows (SELECT … FOR UPDATE) in a short transaction.', 'Lock multiple seats in ascending seat id to avoid deadlocks.', 'Release immediately after setting HELD; never during payment.'],
        followups: [
          { q: 'User A holds seats 5 then 6, user B holds 6 then 5. What prevents deadlock?', options: ['Always acquire locks in sorted seat-id order', 'Use more threads', 'Lock seats in the order the user clicked', 'Use volatile seat status'], why: 'A global order removes the circular wait.' },
          { q: 'Ticket price varies by seat category and show time. Which pattern keeps that swappable?', options: ['Strategy (PricingStrategy per category/time rule)', 'Singleton', 'Observer', 'Adapter'], why: 'Pricing is an interchangeable algorithm.' },
        ],
      };
    },
    (pick) => {
      const gw = pick(['Razorpay', 'PayU', 'Cashfree']);
      return {
        q: `A ${gw} success webhook arrives 12 minutes after the 10-minute hold expired; the seat has since been sold to someone else. Separately, the same webhook is sometimes delivered twice.`,
        answer: 'Booking state machine',
        hint: 'What status is the booking in when the callback lands?',
        steps: ['Booking moved PAYMENT_PENDING → EXPIRED at minute 10.', 'Transition EXPIRED → CONFIRMED is not allowed, so trigger a refund instead.', 'A duplicate callback for an already CONFIRMED booking is a no-op (idempotent on payment id).', 'Transitions are checked and applied atomically.'],
        followups: [
          { q: 'How do you represent allowed transitions compactly in Java?', options: ['EnumMap<BookingStatus, EnumSet<BookingStatus>>', 'A list of strings', 'A boolean per pair of fields', 'Reflection on method names'], why: 'EnumMap and EnumSet are fast, type-safe and readable.' },
          { q: 'Two threads try to move the same booking from PAYMENT_PENDING at once. How do you make it atomic in the DB?', options: ['UPDATE … SET status=? WHERE id=? AND status=PAYMENT_PENDING and check rows updated', 'Read then write in two statements', 'Use a static variable', 'Retry until it works'], why: 'A conditional update is a compare-and-set on status.' },
        ],
      };
    },
    (pick) => {
      const n = pick([5, 10, 20]);
      return {
        q: `Write an in-process RateLimiter for the booking API: each user may make ${n} requests per second with short bursts up to ${n * 2}. 50,000 active users, 200 server threads.`,
        answer: 'Token bucket limiter class',
        hint: 'Per-user jar of tokens that refills over time.',
        steps: [`TokenBucket(capacity=${n * 2}, refill=${n}/s) with lazy refill on each call.`, 'tryAcquire() refills by elapsed time, then takes a token if one is available.', 'Make tryAcquire synchronized per bucket (or a CAS loop).', 'Store buckets in ConcurrentHashMap and create with computeIfAbsent.'],
        followups: [
          { q: 'Why computeIfAbsent rather than get() then put()?', options: ['It creates the bucket atomically so two threads never get different buckets', 'It is shorter to type', 'It sorts the keys', 'It evicts old buckets'], why: 'get-then-put races and can lose one thread’s tokens.' },
          { q: 'Which clock should refill math use?', options: ['System.nanoTime(), monotonic', 'System.currentTimeMillis(), wall clock', 'new Date()', 'LocalDateTime.now()'], why: 'Wall clocks can jump (NTP); nanoTime only moves forward.' },
        ],
      };
    },
    (pick) => {
      const k = pick([4, 6]);
      return {
        q: `A family selects ${k} adjacent seats. The hold must be all-or-nothing: either all ${k} become HELD or none do. In-memory design, one JVM, seats are objects in a Show.`,
        answer: 'Pessimistic seat locking',
        hint: 'Several objects must change together.',
        steps: ['A single CAS per seat could leave a partial hold.', `Sort the ${k} seats by id and lock each (or take one lock per show).`, 'Check all are available, mark all HELD, then unlock in finally.', 'If any is taken, mark none and return failure.'],
        followups: [
          { q: 'Why might tryLock(200, MILLISECONDS) be better than lock() here?', options: ['A request gives up quickly instead of waiting behind a stuck holder', 'It is required for ReentrantLock', 'It makes locks fair', 'It avoids the need for finally'], why: 'Timeouts bound waiting and let you show “try again”.' },
        ],
      };
    },
  ],
});
