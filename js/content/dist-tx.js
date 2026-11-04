SG.add({
  id: 'dist-tx',
  ref: 'J11 J12 J13 K13',
  section: 'Distributed systems',
  title: '2PC, Saga and the outbox pattern',
  short: 'Distributed transactions',
  blurb: 'Keeping several services consistent when one database transaction can no longer cover everything.',
  intro: 'Charge card, reserve stock, record ledger: easy in one database, hard across three services. The industry answer is almost always: avoid it if you can (keep data that changes together in one database); otherwise a saga, usually orchestrated, with idempotent steps and a transactional outbox. Two-phase commit lives inside distributed databases, not across services.',
  options: {
    'Two-phase commit (2PC)': {
      eli5: 'A wedding officiant asks both people “do you?” and only declares them married when both say yes. If the officiant faints between the vows and the announcement, everyone is stuck at the altar.',
      industry: [
        'Inside distributed databases: Google Spanner, CockroachDB, YugabyteDB.',
        'XA transactions in older enterprise Java stacks.',
        'Rarely used across microservices today.',
      ],
      def: 'A coordinator asks all participants to prepare (do the work, persist it, lock rows, vote yes/no), then tells all to commit or abort. Gives atomicity across participants, but it’s blocking: a coordinator crash after votes leaves participants holding locks, and the slowest participant sets the pace.',
      scenarios: [
        'Atomic commits within one distributed database system',
        'Few, tightly coupled, highly available participants',
        'Strong consistency is mandatory and latency is acceptable',
      ],
      scale: 'Poor fit across independent services: locks held across network calls, availability tied to every participant.',
    },
    'Saga (choreography)': {
      eli5: 'A relay race with no coach. Each runner starts when they see the previous one arrive. Works for a short race; with many runners, nobody knows where the baton is.',
      industry: [
        'Order placed → payment service charges → inventory reserves, each reacting to events on Kafka.',
        'Small e-commerce flows with 2–4 steps.',
        'Notification fan-out reacting to business events.',
      ],
      def: 'A sequence of local transactions where each service publishes an event after its step and the next service reacts. On failure, services publish failure events and run compensating actions (refund, release stock). Decentralized; no single coordinator.',
      scenarios: [
        'Short flows with few, independent steps',
        'Teams want loose coupling and no central component',
        'Simple compensation logic',
      ],
      scale: 'At 5+ steps, flow and failure state are scattered across services; debugging means reading many logs.',
    },
    'Saga (orchestration)': {
      eli5: 'A wedding planner with a checklist calls the caterer, then the decorator, then the band. If the band cancels, the planner knows exactly which bookings to cancel, in what order.',
      industry: [
        'Temporal (from Uber’s Cadence) and AWS Step Functions.',
        'Uber, Netflix and DoorDash payment and fulfillment flows.',
        'Travel booking: flight + hotel + car with rollbacks.',
      ],
      def: 'A durable orchestrator drives each step (“charge card”, then “reserve stock”…), records progress, and runs compensations in the right order on failure. After a crash it resumes from stored state. No locks held across services; eventual consistency.',
      scenarios: [
        'Long or branching flows with many steps',
        'You need to see exactly where each transaction is stuck',
        'Complex compensation rules defined in one place',
      ],
      scale: 'The industry default at scale. Steps and compensations must be idempotent because retries happen.',
    },
    'Transactional outbox': {
      eli5: 'Instead of saving a letter in your diary and separately running to the post office (and maybe forgetting), you write the letter into the diary’s “to post” page in the same sitting. A clerk later posts everything on that page.',
      industry: [
        'Debezium reading an outbox table via CDC and publishing to Kafka.',
        'A poller publishing unsent outbox rows every second.',
        'Used with sagas so each step’s event is never lost.',
      ],
      def: 'Fixes the dual-write problem: write business data and the outgoing event into the same database in one local transaction (event goes into an outbox table). A relay (CDC or polling) publishes outbox rows to the broker. Either both happen or neither.',
      scenarios: [
        'A service must update its database and publish an event reliably',
        'Events sometimes go missing or describe writes that rolled back',
        'Saga steps triggering the next step',
      ],
      scale: 'Delivery is at-least-once, so consumers must be idempotent.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick([4, 6, 7]);
      return {
        q: `Booking a holiday spans ${n} services: payment, flights, hotel, car, insurance… If the hotel fails, earlier steps must be undone in the right order, and support needs to see exactly where any booking is stuck.`,
        answer: 'Saga (orchestration)',
        hint: 'Many steps, ordered compensations, visibility.',
        steps: ['Many services, each with its own database.', 'Need ordered compensations on failure.', 'Need central visibility of progress.', 'Orchestrated saga (Temporal/Step Functions).'],
        followups: [
          { q: 'The refund compensation call times out and is retried. What must be true?', options: ['The refund is idempotent (keyed), so a retry can’t refund twice', 'Nothing', 'Retries must be disabled', 'Use 2PC instead'], why: 'Compensations are just more distributed calls; they need idempotency too.' },
        ],
      };
    },
    () => ({
      q: 'An order flow has just two steps: when an order is placed, the notification service sends an email and the loyalty service adds points. Neither needs to undo the other.',
      answer: 'Saga (choreography)',
      hint: 'Short, independent reactions to an event.',
      steps: ['Few steps, independent services.', 'Little or no compensation logic.', 'Each reacts to “order placed”.', 'Choreography is enough.'],
      followups: [
        { q: 'When do teams typically move from choreography to orchestration?', options: ['When flows grow to many steps/branches and tracking state across services becomes painful', 'Immediately', 'Never', 'When they adopt REST'], why: 'Start simple, switch when visibility and compensation complexity demand it.' },
      ],
    }),
    (pick) => {
      const s = pick(['payment', 'order', 'inventory']);
      return {
        q: `The ${s} service saves to its database and then publishes an event to Kafka. Sometimes the publish fails after the commit, so the next saga step never starts; other times the event goes out but the DB transaction rolls back.`,
        answer: 'Transactional outbox',
        hint: 'Two separate writes to two systems can’t be atomic.',
        steps: ['This is the dual-write problem.', 'Write the event into an outbox table in the same transaction.', 'A relay (CDC/poller) publishes it afterwards.', 'Transactional outbox.'],
        followups: [
          { q: 'Can the relay publish the same outbox event twice?', options: ['Yes, after a crash; consumers must dedupe by event ID', 'No, never', 'Only with Kafka', 'Only if the DB is slow'], why: 'Outbox gives at-least-once publication.' },
        ],
      };
    },
    () => ({
      q: 'Inside a globally distributed SQL database, a single transaction updates rows living on shards in three regions. The database must commit all of them atomically.',
      answer: 'Two-phase commit (2PC)',
      hint: 'This is within one database system, not across independent services.',
      steps: ['All participants are parts of one tightly coupled database.', 'It handles coordination and recovery internally.', 'This is where 2PC is used in practice (Spanner, CockroachDB).', '2PC.'],
      followups: [
        { q: 'Why is hand-built 2PC across independent microservices discouraged?', options: ['It blocks: locks held across services, and a coordinator crash can stall everyone', 'It’s too fast', 'It loses data by design', 'It isn’t consistent'], why: 'Availability and latency suffer badly; sagas are the industry answer.' },
      ],
    }),
    (pick) => {
      const s = pick(['stock reservation', 'seat hold', 'driver assignment']);
      return {
        q: `Three autonomous teams own order, ${s} and notification services. The flow is short: order created → ${s} → notify. If ${s} fails, it publishes a failure event and the order service marks the order cancelled. Teams don’t want a central component.`,
        answer: 'Saga (choreography)',
        hint: 'Short flow, event reactions, no central coordinator wanted.',
        steps: ['Three steps, simple compensation.', 'Each service reacts to the previous event.', 'Failure events trigger compensation upstream.', 'Choreographed saga.'],
        followups: [
          { q: 'What is the first question to ask before any distributed transaction design?', options: ['Can the data that must change together live in one database?', 'Which saga tool is fastest?', 'How many Kafka partitions?', 'Should we use 2PC?'], why: 'Service boundaries that split atomic data are a design smell.' },
        ],
      };
    },
  ],
});
