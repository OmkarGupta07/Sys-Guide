SG.add({
  id: 'lld-parking-elevator',
  ref: 'U1 U2',
  section: 'LLD case studies',
  title: 'LLD: parking lot and elevator',
  short: 'Parking and elevator',
  blurb: 'Two classic machine-coding prompts: strategies for spots and fees, atomic allocation, states and scheduling.',
  intro: 'Parking lot and elevator are the first LLD prompts most candidates meet. Model the nouns first (ParkingLot, Floor, Spot, Ticket; ElevatorController, Elevator, Request), then ask what varies and what is shared. Varying rules (spot choice, fees) become Strategy; per-object modes become State; shared mutable spots need atomic allocation; displays that react to changes are Observers; and an elevator’s order of stops is a scheduling algorithm you must name and justify.',
  options: {
    'Strategy for allocation and pricing': {
      eli5: 'A mall parking attendant follows a rule card: “nearest to the lift first” on weekdays, “fill the top floor first” on sale days. Swap the card, not the attendant.',
      industry: [
        'Airport and mall lots price by hour, flat day rate or weekend surge; each is a PricingStrategy.',
        'Allocation rules such as nearest-to-entrance, EV spots first, or fill-lowest-floor are swappable SpotAllocationStrategy classes.',
        'Spring injects the active strategy by bean name, so a config change switches behaviour without code edits.',
      ],
      def: 'Put each rule that changes independently behind its own interface: SpotAllocationStrategy.findSpot(vehicle, floors) and PricingStrategy.fee(ticket, exitTime). The ParkingLot depends on the interfaces, so new rules are new classes (Open/Closed) and each can be unit tested alone.',
      scenarios: [
        'Fees differ by vehicle type, time of day or membership',
        'The business wants to change how spots are picked',
        'Elevator dispatch rules may change per building (Strategy for dispatch)',
      ],
      scale: 'One interface per axis of change; do not merge pricing and allocation into one “policy” class or each change touches both.',
    },
    'Atomic spot assignment': {
      eli5: 'Two cars reach the last free spot from two gates. Whoever turns the key on the spot’s lock first gets it; the other driver is told to look elsewhere.',
      industry: [
        'Multi-gate lots: every entry gate thread calls allocate() at the same time.',
        'AtomicReference/AtomicBoolean compareAndSet on spot status claims a spot without a global lock.',
        'When the lot state is in a database, a conditional UPDATE … WHERE status = FREE plays the same role across servers.',
      ],
      def: 'Allocation is a check-then-act on shared state, so it must be atomic. Options: a synchronized allocate() (simple, serialises all gates), a lock per floor or per vehicle type (less contention), or lock-free compareAndSet(FREE, OCCUPIED) on each spot, retrying the next spot on failure. Release must be atomic too.',
      scenarios: [
        'Several entry gates assign spots concurrently',
        'Two cars occasionally receive the same ticket spot',
        'Global synchronized allocate() has become a bottleneck',
      ],
      scale: 'A single lock is fine for tens of gates; per-floor locks or CAS scale further. Across JVMs you need a DB constraint or distributed lock.',
    },
    'Observer for display boards': {
      eli5: 'When a spot fills up, the floor sign and the entrance sign both change on their own, because they are subscribed to the floor’s news.',
      industry: [
        'Entrance boards showing “Floor 2: 14 car spots free”.',
        'A mobile app showing live availability subscribes to the same events.',
        'Elevator hall panels update their floor indicator when the car moves.',
      ],
      def: 'The subject (Floor or ParkingLot) keeps a list of listeners and calls onSpotChanged(event) after each park or unpark. Display boards, apps and metrics implement the listener interface, so new displays need no change to allocation code.',
      scenarios: [
        'Several boards must show free counts per floor and type',
        'New consumers of availability keep being added',
        'Elevator floor indicators must reflect car position',
      ],
      scale: 'Notify after the state change commits; keep listeners fast or hand off to an executor so a slow board never slows a gate.',
    },
    'State pattern for elevator modes': {
      eli5: 'A lift behaves differently when it is resting, going up, going down or switched off for repair, and each mode knows what the buttons should do.',
      industry: [
        'Elevators: Idle, MovingUp, MovingDown, DoorsOpen, Maintenance.',
        'Maintenance or fire mode must ignore hall calls entirely.',
        'The same idea models parking ticket lifecycle (Active, Paid, Lost).',
      ],
      def: 'Each mode is a class implementing ElevatorState with methods such as onRequest(), onArrive() and onTick(); the Elevator delegates to its current state and states decide transitions. It replaces a growing switch on an enum, and illegal actions (moving with doors open) become impossible by construction.',
      scenarios: [
        'Button behaviour depends on the elevator’s current mode',
        'Maintenance and emergency modes are being added',
        'Rules like “never move with doors open” must be enforced',
      ],
      scale: 'For 3–4 simple states an enum with a switch is acceptable in a 60-minute round; move to State classes once behaviour per state grows.',
    },
    'SCAN/LOOK scheduling': {
      eli5: 'Like a bus route: the lift keeps going up, dropping and picking people on the way, and turns around only when nobody ahead needs it.',
      industry: [
        'Real elevators use direction-aware “collective control”, a cousin of disk-arm SCAN/LOOK.',
        'Two TreeSets (stops above, stops below) give next stop in O(log n) with ceiling() and floor().',
        'Dispatchers prefer a car already moving toward the caller, then the nearest idle car.',
      ],
      def: 'LOOK keeps the current direction, serving every stop ahead in order, and reverses only when no stops remain ahead (SCAN would travel to the end floor). Combined with direction-aware dispatch (prefer a car heading toward the call in the same direction), it avoids the zig-zag and starvation that FIFO or pure nearest-stop ordering cause.',
      scenarios: [
        'An elevator zig-zags serving requests in arrival order',
        'Requests at far floors wait forever behind nearby ones',
        'Choosing which of several cars should take a hall call',
      ],
      scale: 'Per car: TreeSet<Integer> up/down stops, O(log F). Dispatch over N cars is O(N) per call, trivial for building sizes.',
    },
  },
  scenarios: [
    (pick) => {
      const gates = pick([3, 4, 6]);
      const lot = pick(['a mall in Pune', 'Bengaluru airport', 'a hospital in Hyderabad']);
      return {
        q: `Parking for ${lot} has ${gates} entry gates, each a separate thread calling allocateSpot(vehicle). In a load test, two cars got tickets for the same spot about once every 2,000 entries.`,
        answer: 'Atomic spot assignment',
        hint: 'Find the shared state and the moment between “check” and “take”.',
        steps: ['Each gate checks spot.isFree() and then marks it occupied.', 'Two threads pass the check before either writes: check-then-act race.', 'Make the claim atomic: compareAndSet(FREE, OCCUPIED) per spot, or lock per floor.', 'On a failed CAS, move to the next candidate spot.'],
        followups: [
          { q: 'Why might AtomicReference<SpotStatus>.compareAndSet beat a synchronized allocateSpot()?', options: ['Gates claiming different spots never block each other', 'It is easier to read than synchronized', 'It avoids the need for any retry logic', 'It also works across multiple servers'], why: 'CAS only conflicts when two gates race for the same spot; a global lock serialises all gates.' },
          { q: 'You use a ReentrantLock per floor. What must surround unlock()?', options: ['A finally block so the lock is released even on exceptions', 'A synchronized block', 'A volatile write', 'Nothing; the JVM releases it at method end'], why: 'Explicit locks are not released automatically, unlike synchronized.' },
        ],
      };
    },
    (pick) => {
      const rule = pick(['weekend surge at 1.5x', 'first 30 minutes free for hospital visitors', 'monthly pass holders pay zero']);
      return {
        q: `The lot charges ₹40/hour for cars and ₹20/hour for bikes. Product now wants “${rule}”, and more rules are expected every quarter. The current fee code is a 60-line if/else in ExitGate.`,
        answer: 'Strategy for allocation and pricing',
        hint: 'The algorithm changes; the exit flow does not.',
        steps: ['Fee calculation varies independently of the exit process.', 'Extract PricingStrategy with fee(ticket, exitTime).', 'Hourly, surge and pass pricing become classes; ExitGate receives one via constructor.', 'New rules are new classes, tested alone.'],
        followups: [
          { q: 'How do you combine surge with vehicle-type rates without a class for every pair?', options: ['Compose: a SurgePricing wraps a base PricingStrategy (decorator-style)', 'Create CarSurgePricing, BikeSurgePricing and so on', 'Add a boolean surge flag to every strategy', 'Put surge into the Ticket class'], why: 'Wrapping avoids a combinatorial explosion of subclasses.' },
          { q: 'Where should the rate per vehicle type live?', options: ['An EnumMap<VehicleType, Integer> injected into the strategy', 'Hard-coded in ExitGate', 'Static fields on Vehicle subclasses', 'In the display board'], why: 'Config-like data in an EnumMap keeps the strategy reusable and testable.' },
        ],
      };
    },
    (pick) => {
      const n = pick([4, 5, 8]);
      return {
        q: `Each of ${n} floors has an LED board showing free spots per vehicle type, and the entrance has a summary board. The mobile team also wants live counts. Today, park() calls each board directly.`,
        answer: 'Observer for display boards',
        hint: 'One event, several independent reactions, more coming.',
        steps: ['park() and unpark() should not know every display.', 'Define AvailabilityListener.onChange(floor, type, freeCount).', 'Boards and the app adapter register with the Floor.', 'New displays plug in without touching allocation.'],
        followups: [
          { q: 'A board’s network call takes 2 seconds. How do you keep gates fast?', options: ['Dispatch notifications on an executor so park() returns immediately', 'Make park() synchronized', 'Call boards before updating the spot', 'Poll boards every second from the gate'], why: 'Async delivery decouples slow observers from the critical path.' },
          { q: 'Which list type is a safe, simple choice for listeners registered while notifications run?', options: ['CopyOnWriteArrayList', 'ArrayList', 'LinkedList', 'Vector with an Iterator'], why: 'Copy-on-write iteration never throws ConcurrentModificationException; listeners change rarely.' },
        ],
      };
    },
    (pick) => {
      const mode = pick(['maintenance mode', 'fire emergency mode', 'VIP express mode']);
      return {
        q: `Elevator.handleRequest() is a switch on an enum (IDLE, UP, DOWN, DOORS_OPEN) duplicated in four methods. Adding ${mode} means editing every switch, and a bug let the car move with doors open.`,
        answer: 'State pattern for elevator modes',
        hint: 'Behaviour depends on the current mode, and modes keep being added.',
        steps: ['The same switch on mode appears in several methods.', 'Make each mode a class implementing ElevatorState.', 'Elevator delegates calls to state; states choose the next state.', 'DoorsOpenState simply has no move transition, so the bug cannot recur.'],
        followups: [
          { q: 'How is State different from Strategy here?', options: ['States change themselves during the object’s life; a strategy is usually chosen by the client and stays', 'They are the same pattern with different names', 'State is for creation, Strategy for behaviour', 'Strategy can hold data, State cannot'], why: 'Structure is similar; intent differs: lifecycle transitions vs pluggable algorithm.' },
        ],
      };
    },
    (pick) => {
      const floors = pick([12, 20, 30]);
      return {
        q: `A ${floors}-floor office tower: the car serves requests in arrival order. At 9 a.m. it goes 3 → 15 → 4 → 14, and people on high floors complain of 4-minute waits.`,
        answer: 'SCAN/LOOK scheduling',
        hint: 'Think about how a bus route avoids going back and forth.',
        steps: ['FIFO ordering ignores direction, causing zig-zag travel.', 'Keep moving in the current direction, serving all stops ahead.', 'Reverse only when nothing remains ahead (LOOK).', 'Store stops in two TreeSets for ordered next-stop lookup.'],
        followups: [
          { q: 'Which Java call gives the next stop above the current floor from a TreeSet<Integer> up?', options: ['up.ceiling(currentFloor)', 'up.first() always', 'up.headSet(currentFloor)', 'up.pollLast()'], why: 'ceiling returns the least element ≥ the given floor.' },
          { q: 'Why not just go to the nearest pending stop each time?', options: ['Far floors can starve while new nearby requests keep arriving', 'It needs more memory', 'It cannot be coded in Java', 'It breaks the State pattern'], why: 'Shortest-seek-first is greedy and unfair; LOOK guarantees progress.' },
        ],
      };
    },
    (pick) => {
      const cars = pick([3, 4, 6]);
      const f = pick([7, 9, 11]);
      return {
        q: `A building has ${cars} elevators. Someone on floor ${f} presses UP. Car A is idle on floor 1; car B is at floor ${f - 3} moving up with a stop at ${f + 4}; car C is at ${f + 1} moving down. Which design decision picks car B?`,
        answer: 'SCAN/LOOK scheduling',
        hint: 'Which car will pass this floor anyway, going the right way?',
        steps: ['Nearest-car would pick C, which is heading away in the wrong direction.', 'Direction-aware dispatch prefers a car moving toward the caller in the same direction.', 'B is below, moving up, and will pass floor ' + f + ' on its route.', 'Fallback order: same-direction approaching, then nearest idle, then nearest overall.'],
        followups: [
          { q: 'The dispatch rule may differ in hospitals (priority for stretcher calls). How do you keep that swappable?', options: ['A DispatchStrategy interface injected into ElevatorController', 'An if on building type inside Elevator', 'Subclass Elevator per building', 'A static flag'], why: 'Dispatch is an algorithm that varies; Strategy isolates it.' },
          { q: 'Hall calls arrive from many threads while a tick loop moves cars. A simple safe design?', options: ['Put calls in a ConcurrentLinkedQueue or BlockingQueue that the tick drains', 'Let each thread modify the TreeSets directly', 'Use volatile on the TreeSet field', 'Ignore it; elevators are slow'], why: 'Single-writer loop plus a thread-safe inbox avoids races on non-thread-safe sets.' },
        ],
      };
    },
  ],
});
