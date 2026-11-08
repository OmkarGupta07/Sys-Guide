SG.add({
  id: 'interview-lld',
  ref: 'A5 T7',
  section: 'Interview skills',
  title: 'How to run an LLD interview',
  short: 'Running an LLD interview',
  blurb: 'Clarify, model entities, draw relationships, apply the right patterns, then write clean, runnable code.',
  intro: 'LLD and machine-coding rounds test whether you can turn requirements into clean, extensible, working code in 45–90 minutes. A reliable flow: clarify requirements → identify entities and their responsibilities → relationships (class diagram) → apply patterns only where they solve a real problem → code the core flow end to end → handle concurrency and edge cases.',
  options: {
    'Clarify requirements': {
      eli5: 'Before building a cupboard, you ask how many shelves, how much weight, and whether it needs a lock.',
      industry: [
        'Parking lot: how many floors, vehicle types, payment methods, multiple entry gates?',
        'Machine-coding rounds at Flipkart, Swiggy, Uber and PhonePe start with a requirements doc and questions.',
        'Interviewers often hide constraints you’re expected to ask about (concurrency, extensibility).',
      ],
      def: 'Ask about scope, actors, core use cases, constraints (concurrency, scale of in-memory data), and what must be extensible. Write the agreed use cases down as a checklist you’ll implement.',
      scenarios: [
        'The prompt is one line (“design a parking lot”)',
        'You’re unsure which features are in scope',
        'Hidden requirements like concurrent bookings',
      ],
      scale: 'Five minutes of questions saves thirty minutes of rework.',
    },
    'Entities and responsibilities': {
      eli5: 'Listing the people in a restaurant (chef, waiter, cashier) and exactly what each one is responsible for.',
      industry: [
        'Nouns from use cases become classes: ParkingLot, Floor, Spot, Ticket, Payment.',
        'Verbs become methods on the class that owns the data.',
        'Enums for fixed sets (VehicleType, SpotStatus).',
      ],
      def: 'Extract nouns as candidate classes and assign each a single clear responsibility; put behaviour where the data lives. Use enums for fixed categories and interfaces where variation is expected.',
      scenarios: [
        'Turning use cases into classes',
        'Avoiding a god class like ParkingManager doing everything',
        'Deciding which concepts deserve their own class',
      ],
      scale: 'Too few classes → god objects; too many → ceremony. Aim for cohesive, testable units.',
    },
    'Relationships and class diagram': {
      eli5: 'Drawing a family tree: who owns whom, who knows whom, and who is a kind of whom.',
      industry: [
        'UML-style boxes with fields/methods and arrows for has-a, is-a, uses.',
        'Composition (Floor owns Spots) vs association (Ticket refers to Vehicle).',
        'Interfaces for strategies (PricingStrategy, SpotAllocationStrategy).',
      ],
      def: 'Show how classes relate: inheritance (is-a), composition/aggregation (has-a), dependencies, and interfaces. A quick class diagram aligns you with the interviewer before coding.',
      scenarios: [
        'Before writing code, to confirm the structure',
        'Explaining extensibility points',
        'Spotting wrong inheritance early',
      ],
      scale: 'A rough diagram is enough; perfect UML syntax isn’t graded.',
    },
    'Patterns where they fit': {
      eli5: 'Using the right kitchen tool for the job: a whisk for eggs, not because whisks are cool.',
      industry: [
        'Strategy for pricing or spot allocation, State for vending machines and elevators.',
        'Observer for notifications, Factory for creating vehicles/payments, Singleton for the lot (via DI).',
        'Interviewers ask “why this pattern?”',
      ],
      def: 'Apply a pattern only when it solves a concrete requirement (variation, lifecycle, notification, creation). Name it and say what it buys you; don’t force patterns in.',
      scenarios: [
        'A requirement says “add new pricing rules easily”',
        'An object behaves differently by state',
        'Several components react to one event',
      ],
      scale: 'Pattern overload makes code harder to read; justify each one.',
    },
    'Working code and concurrency': {
      eli5: 'A cupboard that looks great on paper is useless if the doors don’t open. Build it and test the doors.',
      industry: [
        'Machine-coding rounds expect runnable code with a demo main() or tests.',
        'Thread safety for shared state (two cars, one spot; two users, one seat).',
        'Clean names, small methods, custom exceptions.',
      ],
      def: 'Implement the core happy path end to end first, then edge cases and errors, then concurrency: identify shared mutable state and protect it (locks, atomic operations, concurrent collections, DB constraints). Show a small driver or tests.',
      scenarios: [
        'Time is running out with nothing runnable yet',
        'Two threads can grab the same resource',
        'Interviewer asks to extend a feature live',
      ],
      scale: 'Working, readable, extensible beats complete-but-broken.',
    },
  },
  scenarios: [
    () => ({
      q: 'The prompt is “Design a parking lot.” A candidate starts writing a Vehicle class immediately, and 20 minutes later learns there are 3 entry gates handling cars concurrently and EV charging spots.',
      answer: 'Clarify requirements',
      hint: 'What should happen in the first five minutes?',
      steps: ['Hidden requirements changed the design.', 'Ask about vehicle types, gates, payments, concurrency, special spots.', 'Write agreed use cases as a checklist.', 'Clarify requirements first.'],
      followups: [
        { q: 'Which requirement most changes the code for a parking lot?', options: ['Multiple gates assigning spots concurrently (thread safety)', 'The colour of tickets', 'The lot’s name', 'Logging format'], why: 'Concurrency forces locking or atomic allocation.' },
      ],
    }),
    (pick) => {
      const n = pick([600, 900]);
      return {
        q: `A candidate’s ParkingLotManager class is ${n} lines: it assigns spots, calculates fees, processes payments, prints tickets and sends SMS.`,
        answer: 'Entities and responsibilities',
        hint: 'Responsibilities need owners.',
        steps: ['A god class hides structure and blocks extension.', 'Split by responsibility: SpotAllocator, FeeCalculator, PaymentService, TicketPrinter, Notifier.', 'Put behaviour with the data it uses.', 'Entities and responsibilities.'],
        followups: [
          { q: 'Where should “is this spot free?” logic live?', options: ['On ParkingSpot (it owns its status) or the allocator that manages spots', 'In the main method', 'In the SMS service', 'In a static utility'], why: 'Behaviour belongs near the data it reads.' },
        ],
      };
    },
    () => ({
      q: 'A candidate makes Car, Bike and Truck extend ParkingSpot because “they all go in a spot”.',
      answer: 'Relationships and class diagram',
      hint: 'Is a car a kind of parking spot?',
      steps: ['A car is not a spot: wrong “is-a”.', 'A spot holds a vehicle (association); vehicles share a Vehicle base or interface.', 'Sketching relationships catches this early.', 'Relationships and class diagram.'],
      followups: [
        { q: 'Floor “has” ParkingSpots that are created and destroyed with it. Which relationship?', options: ['Composition', 'Inheritance', 'Aggregation with independent lifecycle', 'No relationship'], why: 'Composition: the part’s lifecycle is owned by the whole.' },
      ],
    }),
    (pick) => {
      const r = pick(['weekend surge pricing and EV charging fees', 'monthly passes and hourly rates', 'airport-style pricing by vehicle size']);
      return {
        q: `Requirements say pricing rules (${r}) will change often and must be swappable without editing the checkout code.`,
        answer: 'Patterns where they fit',
        hint: 'A family of interchangeable algorithms.',
        steps: ['Pricing varies and changes often.', 'Define a PricingStrategy interface with implementations.', 'Inject or select the strategy at runtime.', 'Strategy pattern, applied because a requirement demands it.'],
        followups: [
          { q: 'An elevator behaves differently when idle, moving up, moving down or under maintenance. Which pattern?', options: ['State', 'Strategy', 'Singleton', 'Builder'], why: 'Behaviour depends on the object’s current mode and transitions.' },
        ],
      };
    },
    () => ({
      q: 'Two entry gates call allocateSpot() at the same instant, and both cars get the same last spot. The demo passed earlier because it was single-threaded.',
      answer: 'Working code and concurrency',
      hint: 'Shared mutable state, check-then-act.',
      steps: ['Two threads read “free” before either marks it taken.', 'Make allocation atomic: synchronized section, lock per floor, or atomic compare-and-set on spot status.', 'Add a concurrent test.', 'Concurrency handled in working code.'],
      followups: [
        { q: 'Time is almost up and you have perfect class diagrams but no running code. What should you have done?', options: ['Implement the core happy path end to end first, then refine', 'Draw more diagrams', 'Write only interfaces', 'Explain verbally instead of coding'], why: 'Machine-coding rounds are graded on working code.' },
      ],
    }),
  ],
});
