SG.add({
  id: 'lld-parking-elevator',
  ref: 'U1 U2',
  section: 'LLD case studies',
  title: 'LLD: parking lot and elevator',
  short: 'Parking and elevator',
  blurb: 'Two classic machine-coding prompts: swappable rules, nearest-spot heaps, clean request types, SCAN and safe concurrency.',
  intro: 'Parking lot and elevator are the first LLD prompts most candidates meet. Spend the first minutes scoping: how many entrances, nearest-spot or any-spot, how many cars, simulation with a step() tick or real hardware. Then model only nouns that hold state or rules (ParkingLot, Spot, Ticket, Terminal; ElevatorController, Elevator, Request — a floor is just an int). Rules that vary (spot choice, fees, payment, dispatch) become Strategy; “nearest spot to this entrance” is a heap per entrance; a request is a small value object with a type enum; an elevator’s stop order is SCAN; and anything shared by several gates or threads needs an atomic claim or a single-writer queue.',
  options: {
    'Strategy for swappable rules': {
      eli5: 'A mall parking attendant follows a rule card: “nearest to the lift first” on weekdays, “fill the top floor first” on sale days. Swap the card, not the attendant.',
      industry: [
        'Parking: SpotAssignmentStrategy, TariffCalculator (hourly, weekend, pass) and PaymentProcessor (cash, card, UPI) are separate interfaces.',
        'Elevators: a DispatchStrategy picks the car — moving toward you in your direction, else nearest idle, else nearest — and a hospital can plug in a different one.',
        'Parking-software vendors ship one codebase to many lots; a config object plus factories wires the right strategies per site.',
      ],
      def: 'Put each rule that changes independently behind its own interface — assignment, tariff, payment, dispatch — and inject the chosen implementation into ParkingLot, ExitTerminal or ElevatorController. New rules are new classes (Open/Closed), each testable alone, and a new site is mostly new configuration rather than new code.',
      scenarios: [
        'Fees differ by vehicle type, time of day or membership',
        'Payment methods keep being added',
        'Elevator dispatch rules differ per building',
        'The same software is installed in an airport and a mall',
      ],
      scale: 'One interface per axis of change; do not merge pricing, payment and assignment into one “policy” class or every change touches all three.',
    },
    'Min-heap per entrance': {
      eli5: 'Each gate guard holds his own list of free spots sorted by how far they are from his gate. He just reads the top line, and crosses that spot off the other guards’ lists too.',
      industry: [
        'Large lots (10k–30k spots, several gates) must give the spot nearest to the gate the car entered from.',
        'Map<entranceId, PriorityQueue<Spot>> ordered by precomputed distance; one heap per entrance.',
        'Lazy deletion: when a polled spot is already taken (claimed via another gate), discard it and poll again.',
      ],
      def: 'Precompute each spot’s distance from every entrance (from the lot’s config). Keep one min-heap per entrance; assigning pops the top of that entrance’s heap. The same spot sits in every heap, so either remove it from the others (O(n) with PriorityQueue.remove, O(log n) with a TreeSet) or skip it lazily when it surfaces. Releasing a spot re-adds it to every heap.',
      scenarios: [
        'The spot must be nearest to the entrance the car used',
        'Thousands of spots make a linear scan per car too slow',
        'Several entrances share the same pool of spots',
      ],
      scale: 'E entrances × N spots entries; assign is O(log N) per heap touched; 4 gates × 30k spots is ~120k heap entries, trivially in memory.',
    },
    'Atomic claims and queue drain': {
      eli5: 'Two cars reach the last free spot from two gates; whoever turns the spot’s key first gets it. In the lift, people drop request slips in a box and only the operator empties the box, so nobody scribbles on his list while he reads it.',
      industry: [
        'Multi-gate lots: every entry-gate thread calls assign() at once; compareAndSet(FREE, TAKEN) on a spot claims it without a global lock.',
        'Elevator simulations: hall-call threads offer to a ConcurrentLinkedQueue; step() drains it into the car’s request set at the start of each tick.',
        'When state lives in a database, UPDATE … WHERE status = \'FREE\' plays the CAS role across servers.',
      ],
      def: 'Check-then-act on shared state must be atomic. Options: one lock around the whole operation (simple, serialises callers — e.g. around requestElevator() and step()), finer locks or lock-free CAS per spot, or a single-writer design where producers only enqueue into a thread-safe queue and one loop applies the changes. Releases and cancels go through the same path.',
      scenarios: [
        'Several entry gates assign spots concurrently',
        'Two hall calls both choose the same idle elevator',
        'step() throws ConcurrentModificationException while new requests arrive',
      ],
      scale: 'One lock is fine for tens of gates or a building; CAS per spot or queue drain scale further. Across JVMs you need a DB constraint or distributed lock.',
    },
    'Request value object with type enum': {
      eli5: 'A lift slip says “floor 5, going up”, “floor 5, going down” or “floor 5, drop me here”. Three clear kinds of slip, never a slip with the direction left blank.',
      industry: [
        'RequestType { PICKUP_UP, PICKUP_DOWN, DESTINATION } instead of a nullable direction field.',
        'A Java record Request(int floor, RequestType type) gets equals/hashCode for free, so a Set dedupes repeated button presses.',
        'Hall panels call requestElevator(floor, HallDirection) so a DESTINATION can never come from a hall.',
      ],
      def: 'Model a request as an immutable value object with a floor and a type enum. Reusing the elevator’s Direction enum allows an impossible IDLE request, and a null direction for in-car presses spreads null checks everywhere. Equality on (floor, type) lets a Set hold pending requests, and narrow method parameters make illegal calls impossible to compile.',
      scenarios: [
        'In-car presses and hall calls share one request class',
        'Pressing the same button five times creates five requests',
        'A null direction keeps causing NullPointerExceptions',
      ],
      scale: 'At most floors × 3 distinct requests per car; a HashSet keeps add, contains and remove O(1).',
    },
    'SCAN/LOOK scheduling': {
      eli5: 'Like a bus route: the lift keeps going up, dropping and picking people on the way, and turns around only when nobody ahead needs it.',
      industry: [
        'Real elevators use direction-aware “collective control”, a cousin of disk-arm SCAN/LOOK.',
        'Two TreeSets (stops above, stops below) give the next stop in O(log n) with ceiling() and floor().',
        'Priority riders get a dedicated express car, because a priority queue would break the sweep.',
      ],
      def: 'Each step(): no requests → IDLE; idle → head toward the nearest request; stop at this floor if there is a DESTINATION here or a PICKUP in the current direction (remove it; stopping is its own tick); nothing ahead → reverse; else move one floor. Unlike FIFO it avoids zig-zag, and unlike nearest-stop-first it cannot starve far floors.',
      scenarios: [
        'An elevator zig-zags serving requests in arrival order',
        'Requests at far floors wait forever behind nearby ones',
        'Deciding whether a moving car should stop at a floor',
      ],
      scale: 'Per car O(1) per tick with a Set scan of ≤30 floors, or O(log F) with TreeSets; trivial for any building.',
    },
  },
  scenarios: [
    (pick) => {
      const gates = pick([3, 4, 6]);
      const lot = pick(['a mall in Pune', 'Bengaluru airport', 'a hospital in Hyderabad']);
      return {
        q: `Parking for ${lot} has ${gates} entry gates, each a separate thread calling assignSpot(vehicle). In a load test, two cars got tickets for the same spot about once every 2,000 entries.`,
        answer: 'Atomic claims and queue drain',
        hint: 'Find the shared state and the moment between “check” and “take”.',
        steps: ['Each gate checks spot.isFree() and then marks it taken.', 'Two threads pass the check before either writes: a check-then-act race.', 'Make the claim atomic: compareAndSet(FREE, TAKEN) per spot, or a lock around assignment.', 'On a failed CAS, move to the next candidate spot.'],
        followups: [
          { q: 'Why might AtomicReference<SpotStatus>.compareAndSet beat a synchronized assignSpot()?', options: ['Gates claiming different spots never block each other', 'It is easier to read than synchronized', 'It avoids the need for any retry logic', 'It also works across multiple servers'], why: 'CAS conflicts only when two gates race for the same spot; a global lock serialises every gate.' },
          { q: 'You use a ReentrantLock per floor. What must surround unlock()?', options: ['A finally block so the lock is released even on exceptions', 'A synchronized block', 'A volatile write', 'Nothing; the JVM releases it at method end'], why: 'Explicit locks are not released automatically, unlike synchronized.' },
        ],
      };
    },
    (pick) => {
      const rule = pick(['weekend rates at 1.5x', 'first 30 minutes free for hospital visitors', 'monthly pass holders pay zero']);
      return {
        q: `The lot charges ₹40/hour for cars and ₹20/hour for bikes, paid by cash or card. Product now wants “${rule}” and UPI next month, with more rules every quarter. Today all of it is a 60-line if/else inside ExitTerminal.`,
        answer: 'Strategy for swappable rules',
        hint: 'The fee rule and the payment method change; the exit flow does not.',
        steps: ['Fee calculation and payment vary independently of the exit process.', 'Extract TariffCalculator.fee(ticket, exitTime) and PaymentProcessor.process(amount).', 'Hourly, weekend and pass tariffs, and cash, card and UPI processors, become classes.', 'ExitTerminal receives them via its constructor; new rules are new classes.'],
        followups: [
          { q: 'Your company will install this at 40 different lots. What should differ between sites?', options: ['A configuration object (layout, spot types, distances, tariffs) that factories turn into objects', 'A fork of the codebase per lot', 'A Singleton ParkingLot with hard-coded floors', 'Subclasses of ParkingLot per city'], why: 'Reuse comes from config-driven wiring; a hard-coded Singleton defeats it.' },
          { q: 'How do you combine weekend rates with vehicle-type rates without a class for every pair?', options: ['Compose: a WeekendTariff wraps a base TariffCalculator (decorator-style)', 'Create CarWeekendTariff, BikeWeekendTariff and so on', 'Add a boolean weekend flag to every tariff', 'Put the weekend rule into the Ticket class'], why: 'Wrapping avoids a combinatorial explosion of subclasses.' },
        ],
      };
    },
    (pick) => {
      const spots = pick(['12,000', '20,000', '30,000']);
      const ent = pick([4, 6]);
      return {
        q: `An airport lot has ${spots} spots and ${ent} entrances. The ticket printed at the entrance must name the free spot nearest to that entrance. Scanning every spot per car takes 40 ms at peak.`,
        answer: 'Min-heap per entrance',
        hint: 'Each entrance needs its own “closest first” ordering.',
        steps: ['Nearest depends on which entrance the car used, so one global order is not enough.', 'Precompute distances and keep one min-heap of free spots per entrance.', 'Pop the top of that entrance’s heap; the spot must also stop counting as free in the other heaps.', 'On exit, push the released spot back into every heap.'],
        followups: [
          { q: 'Removing the taken spot from the other heaps with PriorityQueue.remove(spot) is slow. Better?', options: ['Lazy deletion: leave it, and when it reaches the top of another heap and is taken, discard it and poll again', 'Rebuild every heap after each car', 'Use one ArrayList sorted once at startup', 'Make PriorityQueue synchronized'], why: 'PriorityQueue.remove(Object) is O(n); lazy skipping keeps each operation O(log n).' },
          { q: 'Two cars enter at different gates and both heaps offer the same corner spot. What decides who gets it?', options: ['An atomic claim on the spot (CAS or a lock); the loser polls its heap again', 'Whichever heap is larger', 'The spot’s distance', 'Nothing; heaps prevent it'], why: 'Heaps only rank spots; claiming one is still shared-state concurrency.' },
        ],
      };
    },
    (pick) => {
      const f = pick([4, 6, 8]);
      return {
        q: `In an elevator design, Request has (int floor, Direction direction) reusing the car’s UP/DOWN/IDLE enum; in-car presses set direction to null. A rider pressing floor ${f} five times creates five requests, and step() keeps hitting NullPointerException.`,
        answer: 'Request value object with type enum',
        hint: 'What kinds of request actually exist?',
        steps: ['IDLE is a car state, never a request, and null encodes a third kind badly.', 'Define RequestType { PICKUP_UP, PICKUP_DOWN, DESTINATION }.', 'Make Request an immutable value object with equality on (floor, type).', 'Store pending requests in a Set so repeated presses collapse into one.'],
        followups: [
          { q: 'Simplest Java way to get correct equals and hashCode on (floor, type)?', options: ['Declare it as record Request(int floor, RequestType type)', 'Override only equals', 'Use the object identity default', 'Store requests as Strings like “5-UP”'], why: 'Records generate equals/hashCode from all components; overriding equals without hashCode breaks HashSet.' },
          { q: 'How do you stop a hall panel from sending a DESTINATION request?', options: ['Give the hall method a narrower parameter type (UP or DOWN only) and map it to a RequestType inside', 'Check at runtime and log a warning', 'Document it in a comment', 'Let the elevator ignore it later'], why: 'Narrow types make illegal calls fail at compile time.' },
        ],
      };
    },
    (pick) => {
      const floors = pick([12, 20, 30]);
      return {
        q: `A ${floors}-floor office tower: the car serves requests in arrival order. At 9 a.m. it goes 3 → 15 → 4 → 14, and people on high floors complain of 4-minute waits.`,
        answer: 'SCAN/LOOK scheduling',
        hint: 'Think about how a bus route avoids going back and forth.',
        steps: ['FIFO ordering ignores direction, causing zig-zag travel.', 'Keep moving in the current direction, serving every stop ahead.', 'Reverse only when nothing remains ahead (LOOK).', 'Each step(): stop if a request here matches, else reverse if nothing ahead, else move one floor.'],
        followups: [
          { q: 'The car is going UP and reaches floor 7, where the only request is PICKUP_DOWN. Should it stop?', options: ['No; it serves that request on the way down unless nothing else lies ahead', 'Yes; any request on the floor means stop', 'Yes, and switch direction immediately', 'No, and delete the request'], why: 'Picking up a downward rider while going up just carries them the wrong way.' },
          { q: 'Product wants VIP floors served first. Why not switch the request set to a priority queue?', options: ['It breaks the sweep and brings back zig-zag; a dedicated express car is cleaner', 'Java has no priority queue', 'Priority queues cannot hold records', 'It would use too much memory'], why: 'Priority ordering fights direction ordering; isolating priority in its own car keeps SCAN intact.' },
        ],
      };
    },
    (pick) => {
      const cars = pick([3, 4, 6]);
      const f = pick([7, 9, 11]);
      const b = pick(['a hospital', 'a mall', 'a 40-floor residential tower']);
      return {
        q: `A building has ${cars} elevators. Someone on floor ${f} presses UP; car A is idle on floor 1, car B is at ${f - 3} going up, car C is at ${f + 1} going down. The rule that picks B must be replaceable, because ${b} wants a different one.`,
        answer: 'Strategy for swappable rules',
        hint: 'Which object decides, and how do you let that decision change?',
        steps: ['The controller owns the cars, so it chooses (information expert); each car decides its own stops.', 'Default rule: car moving toward you in your direction, else nearest idle, else nearest.', 'B is below and moving up, so it wins over C, which is closer but heading away.', 'Put the rule behind a DispatchStrategy injected into ElevatorController.'],
        followups: [
          { q: 'Should Floor be a class in this design?', options: ['No; it holds no state or rules here, so an int is enough', 'Yes; every noun needs a class', 'Yes, with a list of elevators inside it', 'Only if floors are numbered from 1'], why: 'Model nouns that own state or behaviour; a floor number does not.' },
        ],
      };
    },
    (pick) => {
      const t = pick([10, 25, 50]);
      return {
        q: `The elevator simulation runs step() on a timer thread while ${t} hall-panel threads call requestElevator(). Sometimes step() throws ConcurrentModificationException, and twice two calls both grabbed the same idle car.`,
        answer: 'Atomic claims and queue drain',
        hint: 'Who is allowed to change the request sets, and when?',
        steps: ['Panel threads mutate the same Set that step() iterates and removes from.', 'Option A: one lock around requestElevator() and step() — simple, but callers block.', 'Option B: panels only offer to a ConcurrentLinkedQueue; step() drains it into the sets at the start of each tick.', 'With B, only the tick thread ever touches the sets, so dispatch and removal cannot race.'],
        followups: [
          { q: 'A rider cancels a request. Where should the removal happen?', options: ['Through the same path as adds: under the lock, or as a cancel message drained by step()', 'Directly from the panel thread on the HashSet', 'In a finaliser', 'Never; let the car arrive anyway'], why: 'Every mutation must follow the one concurrency rule you chose.' },
          { q: 'Why not just swap the HashSet for ConcurrentHashMap.newKeySet()?', options: ['It stops the exception but not the race where two calls pick the same idle car', 'It is slower than a lock in every case', 'It cannot store records', 'It is not in the JDK'], why: 'A thread-safe set makes single operations safe, not the multi-step dispatch decision.' },
        ],
      };
    },
  ],
});
