SG.add({
  id: 'creational',
  ref: 'T10 T11 T12 T13 T14',
  section: 'LLD: design patterns',
  title: 'Creational patterns',
  short: 'Creational patterns',
  blurb: 'One instance, the right subclass, step-by-step construction, or a copy of a template.',
  intro: 'Creational patterns answer “how should this object be created?”. Each solves a specific pain with new: too many instances, callers knowing concrete classes, huge constructors, or expensive setup.',
  options: {
    'Singleton': {
      eli5: 'A country has one president at a time. Everyone who asks for “the president” gets the same person.',
      industry: [
        'Spring beans are singletons by default: one instance per application context.',
        'Shared resources like a connection pool or a configuration registry.',
        'Java’s Runtime.getRuntime().',
      ],
      def: 'Ensure a class has exactly one instance with a global access point. In Java, prefer an enum or the holder idiom for thread safety, or let a DI container manage the single instance.',
      scenarios: [
        'One shared, expensive resource (config, pool, cache client)',
        'All callers must see the same state',
      ],
      scale: 'Overuse = hidden global state that makes tests hard. In Spring, rely on singleton beans plus injection instead of hand-written getInstance().',
    },
    'Factory': {
      eli5: 'At a vending machine you press “cola” and get a cola. You don’t need to know which shelf it comes from or how it was made.',
      industry: [
        'NotificationFactory.create("SMS") returns an SmsNotifier.',
        'Calendar.getInstance() and Spring’s BeanFactory.',
        'Abstract factory: a UI theme factory that creates matching buttons and checkboxes.',
      ],
      def: 'Encapsulate object creation so callers ask for what they need and get the right implementation without naming concrete classes. Abstract Factory creates families of related objects that must match.',
      scenarios: [
        'Choose an implementation from input or config at runtime',
        'Hide concrete classes from callers',
        'Create families of matching objects (Abstract Factory)',
      ],
      scale: 'Pairs naturally with Strategy. A Map<String, Impl> injected by Spring is a lightweight factory.',
    },
    'Builder': {
      eli5: 'Ordering a Subway sandwich: choose bread, then cheese, then veggies, then sauce, one step at a time, then “make it”.',
      industry: [
        'Lombok’s @Builder and Java records with builders.',
        'HttpRequest.newBuilder() in Java’s HTTP client.',
        'StringBuilder and test data builders.',
      ],
      def: 'Construct a complex object step by step with readable named methods, then build() it, often as an immutable object with validation at the end. Replaces telescoping constructors with many optional parameters.',
      scenarios: [
        'Many optional parameters (telescoping constructors)',
        'Immutable objects that need validation before creation',
        'Readable construction in tests',
      ],
      scale: 'Overkill for objects with 2–3 required fields.',
    },
    'Prototype': {
      eli5: 'Photocopying a filled-in form and changing just the name, instead of filling a blank form from scratch each time.',
      industry: [
        'Games clone a configured enemy template instead of loading assets again.',
        'Spring prototype-scoped beans return a fresh instance each time.',
        'Document editors duplicate a slide or shape.',
      ],
      def: 'Create new objects by copying an existing, configured instance (clone), then tweaking. Useful when creation is expensive or the configuration is complex.',
      scenarios: [
        'Creating from scratch is expensive (disk, network, heavy setup)',
        'Many similar objects differing slightly',
        'You need copies of objects whose class you don’t know at compile time',
      ],
      scale: 'Watch shallow vs deep copy: a shallow clone shares nested objects.',
    },
  },
  scenarios: [
    (pick) => {
      const r = pick(['application configuration loaded from a 2 MB file', 'a connection pool to the database', 'an in-process cache client']);
      return {
        q: `Every class currently creates its own ${r}. It’s expensive, and instances disagree with each other. There should be exactly one, shared.`,
        answer: 'Singleton',
        hint: 'Exactly one instance, everyone shares it.',
        steps: ['Expensive to create.', 'All callers must share the same state.', 'One instance, global access.', 'Singleton (in Spring: a singleton bean).'],
        followups: [
          { q: 'Safest way to write a thread-safe singleton in plain Java?', options: ['An enum with one value (or the static holder idiom)', 'A static field initialised in getInstance() without locking', 'synchronized on every getInstance() call only', 'A public static non-final field'], why: 'Enum singletons are thread-safe and serialisation-safe by design.' },
        ],
      };
    },
    (pick) => {
      const t = pick(['"EMAIL", "SMS" or "PUSH"', '"PDF", "CSV" or "XLSX"', '"UPI", "CARD" or "WALLET"']);
      return {
        q: `Callers get a type string like ${t} and must create the right handler. Right now every caller has the same if/else and imports every concrete class.`,
        answer: 'Factory',
        hint: 'Who should decide which class to create?',
        steps: ['Creation logic is duplicated in callers.', 'Callers depend on every concrete class.', 'Move creation into one factory; callers ask by type.', 'Factory.'],
        followups: [
          { q: 'The app supports light and dark themes, and each needs a matching Button, Checkbox and Menu. Which variant?', options: ['Abstract Factory: one factory per theme creates the whole matching family', 'Singleton', 'Builder', 'Prototype'], why: 'Abstract Factory guarantees related objects come from the same family.' },
        ],
      };
    },
    (pick) => {
      const n = pick([10, 12, 15]);
      return {
        q: `An HTTP request object has ${n} fields, mostly optional (timeout, headers, retries, proxy…). Constructors look like new Request(url, null, null, 30, null, true, …) and bugs come from swapped arguments.`,
        answer: 'Builder',
        hint: 'Many optional parameters, readability matters.',
        steps: ['Telescoping constructor with many optional params.', 'Positional nulls cause swapped-argument bugs.', 'Named steps + build() with validation.', 'Builder.'],
        followups: [
          { q: 'Where should the Builder validate required fields?', options: ['In build(), before creating the (ideally immutable) object', 'In every setter only', 'Nowhere', 'In the caller'], why: 'Validating once in build() guarantees no invalid object ever exists.' },
        ],
      };
    },
    (pick) => {
      const n = pick([500, 1000, 5000]);
      return {
        q: `A game spawns ${n} enemies of the same type. Each needs a model, animations and stats loaded from disk, which takes 200 ms. Only position and health differ.`,
        answer: 'Prototype',
        hint: 'Creation from scratch is the expensive part.',
        steps: ['Setup is expensive and identical.', 'Only small fields differ.', 'Configure one template, clone it, adjust position/health.', 'Prototype.'],
        followups: [
          { q: 'Clones share the same animation list object and one enemy’s changes affect all. Why?', options: ['Shallow copy: nested objects are shared; deep-copy mutable parts', 'Java clones are always deep', 'The garbage collector merged them', 'It’s a Singleton'], why: 'Shallow vs deep copy is the classic Prototype follow-up.' },
        ],
      };
    },
    () => ({
      q: 'A User object must be immutable. Name and email are required; phone, address and preferences are optional. Invalid users must never exist in memory.',
      answer: 'Builder',
      hint: 'Immutable, partly optional, validated at creation.',
      steps: ['Immutable: all fields set at creation.', 'Several optional fields.', 'Validation before the object exists.', 'Builder.'],
      followups: [
        { q: 'Which Lombok annotation generates this?', options: ['@Builder', '@Singleton', '@Factory', '@Data only'], why: 'Lombok’s @Builder is common in Spring codebases.' },
      ],
    }),
  ],
});
