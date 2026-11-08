SG.add({
  id: 'lld-services',
  ref: 'U11 U13 U14 U15',
  section: 'LLD case studies',
  title: 'LLD: library, hotel, cab, notifications',
  short: 'Service-style LLDs',
  blurb: 'Business LLDs: layering, swappable rules, lifecycles, notification channels and safe assignment.',
  intro: 'Library, hotel, cab booking and notification service look different but share a skeleton: entities (Book/BookCopy/Member, Room/Reservation/Guest, Rider/Driver/Ride, Notification/Channel), repositories that store them, services that hold the use cases, and a few rules that keep changing. Decide where code lives (layering), which rules are pluggable (Strategy), which objects have a lifecycle (State), how events reach users (Observer plus channel strategies), and how two requests never get the same room or driver.',
  options: {
    'Repository + service layering': {
      eli5: 'The library cupboard (repository) only stores and finds books. The librarian (service) applies the rules: who can borrow, for how long, and the fine.',
      industry: [
        'Spring: @Repository for storage, @Service for use cases, @RestController for HTTP.',
        'In machine coding, in-memory repositories (ConcurrentHashMap) behind an interface you could swap for JPA.',
        'Book (title, ISBN) vs BookCopy (barcode, status): many copies of one book.',
      ],
      def: 'Repositories hide storage behind interfaces (BookRepository.findById, save); services implement use cases (issueBook, returnBook) using repositories and domain objects; controllers or a driver only parse input. Each layer is testable alone, and swapping in-memory for a database touches only repositories.',
      scenarios: [
        'A god class mixes storage, rules and printing',
        'Interviewer asks “how would you plug in a real DB later?”',
        'Separating Book from its physical copies',
      ],
      scale: 'In-memory ConcurrentHashMap repos are fine for a round; interfaces keep the DB swap cheap.',
    },
    'Strategy for fines, pricing and matching': {
      eli5: 'A hotel uses one rate card on weekdays and another during Diwali; a cab app uses “nearest driver” normally and “highest rated” for premium rides. Same desk, different rule cards.',
      industry: [
        'Library fines: per-day, capped, or waived for staff (FineStrategy).',
        'Hotel pricing: seasonal, weekend, corporate rates (PricingStrategy).',
        'Cab matching: nearest, least-recently-assigned, rating-based (DriverMatchingStrategy).',
      ],
      def: 'Each business rule that varies independently gets an interface with implementations chosen by config or context: FineStrategy.fine(daysLate), PricingStrategy.price(room, dates), MatchingStrategy.pick(ride, drivers). Services depend on the interfaces, so new rules are added without editing use-case code.',
      scenarios: [
        'Fines, prices or matching rules differ by member, season or ride type',
        'Product changes rules every few weeks',
        'Each rule needs isolated unit tests',
      ],
      scale: 'Keep strategies stateless and thread-safe; pick via EnumMap or Spring bean map.',
    },
    'State for booking and ride lifecycle': {
      eli5: 'A ride goes requested → driver assigned → driver arrived → in progress → completed. You cannot “end” a ride that never started.',
      industry: [
        'Ride: REQUESTED → ACCEPTED → ARRIVED → STARTED → COMPLETED, or CANCELLED.',
        'Hotel reservation: BOOKED → CHECKED_IN → CHECKED_OUT, or CANCELLED / NO_SHOW.',
        'Library copy: AVAILABLE → ISSUED → RETURNED (or LOST, RESERVED).',
      ],
      def: 'Model each lifecycle as an enum with allowed transitions (or State classes when behaviour per state grows). Every action checks the current status, then moves it atomically. Cancellation fees, refunds and notifications hang off transitions, making illegal sequences fail fast with a clear exception.',
      scenarios: [
        'Actions are allowed only in certain statuses',
        'Cancellation rules depend on how far a ride or booking has progressed',
        'Two actions (cancel and start) can race',
      ],
      scale: 'Transition checks are O(1); conditional updates (WHERE status = ?) make them safe across servers.',
    },
    'Observer + Strategy for notification channels': {
      eli5: 'When your parcel ships, the shop rings a bell. Your SMS, email and app each hear it, and each knows how to deliver in its own way.',
      industry: [
        'Events (BookDue, RideAssigned, PaymentFailed) published; NotificationService subscribes.',
        'Channel strategies: SmsSender, EmailSender, PushSender, WhatsAppSender behind one interface.',
        'User preferences decide channels; templates decide text.',
      ],
      def: 'Domain services publish events (Observer, or Spring ApplicationEventPublisher) without knowing who listens. A NotificationService listener picks channels from user preferences and sends through a ChannelSender strategy per channel. New channels are a new class; new events need no changes to senders. Send asynchronously with retries.',
      scenarios: [
        'Several channels must be supported and more added',
        'Business code should not know about SMS or email',
        'Users choose which channels they want',
      ],
      scale: 'Fan-out on an executor or queue; a slow SMS provider must not block booking threads.',
    },
    'Concurrent room and cab assignment': {
      eli5: 'Two receptionists must never give the same room key to two guests, and two riders must never get the same driver.',
      industry: [
        'Hotel: room-night availability checked and reserved atomically for a date range.',
        'Cab: driver status AVAILABLE → ASSIGNED via compareAndSet so one ride wins.',
        'Library: last copy reserved by two members at once.',
      ],
      def: 'Assignment is check-then-act on shared state. Make it atomic: compareAndSet on a driver’s AtomicReference<Status>, a lock per room (acquire in sorted order for multi-room bookings), or a DB unique constraint on (room_id, date). On failure, try the next candidate.',
      scenarios: [
        'Two requests can grab the same room or driver',
        'A booking covers several nights and must be all-or-nothing',
        'Many riders request at once in one area',
      ],
      scale: 'Per-resource CAS scales best; a unique index on (room_id, night) is the cross-server safety net.',
    },
  },
  scenarios: [
    (pick) => {
      const lib = pick(['a college library in Pune', 'a city library in Mysuru', 'a corporate library in Noida']);
      return {
        q: `For ${lib}, a candidate’s LibrarySystem class stores books in a HashMap, checks member limits, computes fines and prints receipts, all in one 500-line class. The interviewer asks how you would move to MySQL later.`,
        answer: 'Repository + service layering',
        hint: 'Separate “where it is stored” from “what the rules are”.',
        steps: ['Storage, rules and output are tangled.', 'BookRepository/MemberRepository interfaces with in-memory implementations.', 'LendingService implements issue/return using repositories.', 'Swapping to MySQL replaces repository implementations only.'],
        followups: [
          { q: 'The library has 5 copies of one title. How do you model it?', options: ['Book (ISBN, title) with many BookCopy (barcode, status)', 'One Book with a count field only', 'Five Book objects with the same ISBN', 'A list of strings'], why: 'Copies have their own status and history; the title is shared.' },
        ],
      };
    },
    (pick) => {
      const r = pick(['₹5/day capped at ₹200', '₹10/day, waived for staff', '₹2/day for children’s books']);
      const h = pick(['Diwali week surcharge', 'corporate rates', 'weekend pricing']);
      return {
        q: `Two teams’ requirements: the library fine is “${r}” and changes yearly; the hotel needs ${h} on top of base room rates. Both currently use if/else inside the service.`,
        answer: 'Strategy for fines, pricing and matching',
        hint: 'Rules that vary should be objects.',
        steps: ['The rule changes independently of the use case.', 'FineStrategy.fine(daysLate, member) and PricingStrategy.price(room, nights).', 'Services receive strategies through constructors.', 'New rules are new classes, tested alone.'],
        followups: [
          { q: 'How should days late be computed in Java?', options: ['ChronoUnit.DAYS.between(dueDate, returnDate) with LocalDate', 'Subtract Date.getTime() and divide by 86,400,000', 'Compare strings', 'Use System.nanoTime()'], why: 'java.time handles calendars correctly.' },
        ],
      };
    },
    (pick) => {
      const at = pick(['after the driver has arrived', 'after the ride has started', 'twice within one second']);
      return {
        q: `A cab app: a rider presses cancel ${at}. Today the code just sets status = CANCELLED, so riders cancel mid-ride and drivers get no fee.`,
        answer: 'State for booking and ride lifecycle',
        hint: 'What is allowed depends on where the ride is now.',
        steps: ['Ride has a lifecycle with legal transitions.', 'Define RideStatus and allowed transitions (STARTED cannot go to CANCELLED).', 'Cancellation after ARRIVED charges a fee via the transition handler.', 'Apply transitions atomically (compare current status).'],
        followups: [
          { q: 'Cancel and start arrive at the same time. How do you make only one succeed in memory?', options: ['AtomicReference<RideStatus>.compareAndSet(expected, next)', 'Two separate if checks', 'volatile status', 'Thread.sleep before writing'], why: 'CAS makes the transition a single atomic step.' },
        ],
      };
    },
    (pick) => {
      const ch = pick(['WhatsApp', 'push notifications', 'voice calls']);
      return {
        q: `RideService, BookingService and LendingService each call SmsClient directly. Product wants email and ${ch} too, chosen per user preference, and does not want booking to fail when SMS is down.`,
        answer: 'Observer + Strategy for notification channels',
        hint: 'Publish events; let a notifier pick channels.',
        steps: ['Business services should not know delivery channels.', 'Publish domain events; a NotificationService listens (Observer).', 'ChannelSender interface with SMS, email, ' + ch + ' implementations (Strategy).', 'Send asynchronously with retries so failures do not break bookings.'],
        followups: [
          { q: 'In Spring, how do you make the listener run off the request thread?', options: ['@EventListener with @Async (and an executor), or @TransactionalEventListener(AFTER_COMMIT) + @Async', 'Make it static', 'Use synchronized', 'Call it from the controller'], why: 'Async listeners decouple latency and failures.' },
          { q: 'Why AFTER_COMMIT for a “booking confirmed” notification?', options: ['So you never notify about a booking that later rolled back', 'It is faster', 'It retries automatically', 'It avoids templates'], why: 'Events tied to commits avoid false notifications.' },
        ],
      };
    },
    (pick) => {
      const n = pick([2, 3, 5]);
      return {
        q: `A hotel has one deluxe room left for 14–16 Dec. ${n} receptionists and the website submit bookings at the same second, and the room was double-booked twice last month.`,
        answer: 'Concurrent room and cab assignment',
        hint: 'Check availability and reserve must be one step.',
        steps: ['Check-then-reserve across threads races.', 'Treat each room-night as a resource: lock per room, or unique (room_id, night) constraint.', 'Reserve all nights or none; lock rooms in id order for multi-room bookings.', 'Losers see “sold out” and try another room.'],
        followups: [
          { q: 'Why a DB unique constraint even if you have Java locks?', options: ['Locks protect one JVM; the constraint protects across all servers', 'Constraints are faster than locks', 'Java locks do not work with dates', 'It replaces the need for transactions'], why: 'Defence in depth across instances.' },
        ],
      };
    },
    (pick) => {
      const zone = pick(['Koramangala', 'Andheri', 'Connaught Place']);
      return {
        q: `At 9 a.m. in ${zone}, 300 riders request cabs within a minute. Matching picks the nearest available driver, and the same driver was assigned to two rides several times.`,
        answer: 'Concurrent room and cab assignment',
        hint: 'Picking and claiming a driver must be atomic.',
        steps: ['Two matchers both see the same driver as AVAILABLE.', 'Claim with driver.status.compareAndSet(AVAILABLE, ASSIGNED).', 'If it fails, try the next nearest candidate.', 'The matching rule itself stays a Strategy.'],
        followups: [
          { q: 'Product wants “prefer drivers with rating ≥ 4.7 for Premier”. What changes?', options: ['Add a new MatchingStrategy; the atomic claim code stays the same', 'Rewrite the claim logic', 'Add synchronized to Driver', 'Create a PremierDriver subclass'], why: 'Selection rule and safe claiming are separate concerns.' },
          { q: 'How do you sort candidates by distance then rating in Java?', options: ['Comparator.comparingDouble(d -> d.distance).thenComparing(Driver::getRating, Comparator.reverseOrder())', 'Collections.shuffle', 'A TreeMap by name', 'Arrays.sort without comparator'], why: 'Comparator chaining expresses multi-key ordering clearly.' },
        ],
      };
    },
  ],
});
