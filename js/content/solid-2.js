SG.add({
  id: 'solid-2',
  ref: 'T2 T3 T4',
  section: 'LLD: foundations',
  title: 'SOLID part 2 and design principles',
  short: 'SOLID 2 and principles',
  blurb: 'Small interfaces, depending on abstractions, composition over inheritance, and not overbuilding.',
  intro: 'The second half of SOLID plus the principles reviewers quote most. Each one names a specific pain: fat interfaces, untestable code, class explosions, and over-engineering.',
  options: {
    'Interface Segregation (ISP)': {
      eli5: 'A restaurant menu split into veg and non-veg. A vegetarian shouldn’t have to read through every meat dish.',
      industry: [
        'Spring Data splits CrudRepository, PagingAndSortingRepository and others so you implement only what you need.',
        'Java’s Collection hierarchy separates List, Set and Queue capabilities.',
        'Printer/Scanner/Fax interfaces: a basic printer implements only Printer.',
      ],
      def: 'Clients shouldn’t be forced to depend on methods they don’t use. Prefer several small, role-specific interfaces over one fat interface.',
      scenarios: [
        'Implementations throw “not supported” for half an interface',
        'A change to one method forces unrelated classes to recompile/retest',
        'Different clients use different subsets of an interface',
      ],
      scale: 'Split by role or client. Don’t split down to one method per interface without a reason.',
    },
    'Dependency Inversion (DIP)': {
      eli5: 'A lamp plugs into a standard socket, not wired directly into the power station. You can change the power source without rewiring the lamp.',
      industry: [
        'Spring’s dependency injection: services depend on interfaces, Spring injects implementations.',
        'Unit tests inject mocks (Mockito) instead of real databases.',
        'Hexagonal/clean architecture: business logic defines ports, infrastructure implements them.',
      ],
      def: 'High-level modules shouldn’t depend on low-level modules; both depend on abstractions. In practice: depend on interfaces, and receive dependencies via constructor injection instead of creating them with new.',
      scenarios: [
        'A service does new MySqlRepository() inside and can’t be unit tested',
        'Swapping a database, queue or vendor forces business-logic changes',
        'You need different implementations per environment',
      ],
      scale: 'Constructor injection + interfaces at boundaries (DB, external APIs, messaging). Not every class needs an interface.',
    },
    'Composition over inheritance': {
      eli5: 'Lego vs a carved statue. With Lego you snap pieces together and swap them; a statue is fixed once carved.',
      industry: [
        'Game engines use components (Movement, Health, Render) instead of deep entity hierarchies.',
        'Java’s Collections.synchronizedList wraps a list rather than subclassing every list type.',
        'Strategy and Decorator patterns are composition in action.',
      ],
      def: 'Build behaviour by holding references to other objects (has-a) instead of extending classes (is-a). Behaviours can vary independently and change at runtime, and subclasses aren’t coupled to parent internals.',
      scenarios: [
        'Several independent behaviours combine into a class explosion of subclasses',
        'Behaviour must change at runtime',
        'A subclass breaks when the parent’s internals change',
      ],
      scale: 'Inheritance is still right for true “is-a” with shared behaviour. Composition is the default when unsure.',
    },
    'DRY, KISS and YAGNI': {
      eli5: 'Don’t write the same recipe in three notebooks (DRY). Make tea, not a tea factory (KISS). Don’t buy a 12-seat dining table for a family of two “in case” (YAGNI).',
      industry: [
        'Shared validation and tax logic live in one place so one fix updates everything.',
        'Startups ship a monolith on one database before considering microservices.',
        'Reviewers reject speculative abstractions and config nobody asked for.',
      ],
      def: 'DRY: every piece of knowledge has one authoritative place. KISS: prefer the simplest design that works. YAGNI (you aren’t gonna need it): don’t build features or flexibility before there’s a real need.',
      scenarios: [
        'The same business rule is copy-pasted in many places',
        'A design has layers and plugins for requirements that don’t exist',
        'A simple problem got a complex framework',
      ],
      scale: 'Balance: DRY overdone creates wrong abstractions coupling unrelated code. Duplicate twice, abstract on the third time.',
    },
  },
  scenarios: [
    (pick) => {
      const i = pick(['Printer with print(), scan() and fax()', 'Worker with work(), eat() and sleep()', 'Vehicle with drive(), fly() and sail()']);
      return {
        q: `An interface ${i}. Most implementations need only one or two methods and throw UnsupportedOperationException for the rest.`,
        answer: 'Interface Segregation (ISP)',
        hint: 'Implementations are forced to accept methods they can’t support.',
        steps: ['The interface mixes several roles.', 'Implementers must stub methods they don’t use.', 'Split into small role interfaces; classes implement only what they support.', 'ISP violation.'],
        followups: [
          { q: 'Which earlier principle is this also breaking?', options: ['Liskov: callers can’t safely use every implementation through the interface', 'DRY', 'KISS', 'None'], why: 'Fat interfaces force “not supported” methods, which break substitutability.' },
        ],
      };
    },
    (pick) => {
      const r = pick(['MySqlOrderRepository', 'RazorpayClient', 'SmtpEmailSender']);
      return {
        q: `OrderService creates its dependency inside its constructor with new ${r}(). Unit tests hit the real system, and switching providers means editing OrderService.`,
        answer: 'Dependency Inversion (DIP)',
        hint: 'Who decides which implementation OrderService uses?',
        steps: ['High-level logic is bound to a low-level class.', 'Depend on an interface instead.', 'Inject the implementation through the constructor (Spring does this).', 'DIP violation.'],
        followups: [
          { q: 'Constructor vs field injection in Spring: which is preferred and why?', options: ['Constructor: dependencies are explicit, fields can be final, and tests can pass mocks without Spring', 'Field injection: less code', 'Setter injection, always', 'No difference'], why: 'Constructor injection makes required dependencies impossible to forget.' },
        ],
      };
    },
    (pick) => {
      const b = pick(['fly/no-fly and quack/squeak/silent ducks', 'cash/card payment and home/store delivery orders', 'email/SMS channel and urgent/normal priority notifications']);
      return {
        q: `You need every combination of ${b}. The team created a subclass per combination, and the count keeps multiplying.`,
        answer: 'Composition over inheritance',
        hint: 'Several independent behaviours, each with variants.',
        steps: ['Independent dimensions multiply subclasses.', 'Each dimension can be its own object (strategy).', 'The class holds the behaviours it needs and can swap them.', 'Composition over inheritance.'],
        followups: [
          { q: 'With composition, how would you change a duck’s flying at runtime?', options: ['Call setFlyBehavior(new NoFly()) to swap the held strategy object', 'Create a new subclass', 'Use reflection', 'Restart the app'], why: 'Runtime flexibility is a key advantage of composition.' },
        ],
      };
    },
    (pick) => {
      const n = pick([5, 8]);
      return {
        q: `For an MVP that only supports UPI, a developer built a plugin system, a config DSL and an abstract factory hierarchy to support ${n} future payment providers. Nobody has asked for them.`,
        answer: 'DRY, KISS and YAGNI',
        hint: 'Is this complexity solving a real, current problem?',
        steps: ['Only one provider is needed now.', `The flexibility for ${n} providers is speculative.`, 'It adds code to maintain with no benefit today.', 'YAGNI (and KISS): build it when it’s needed.'],
        followups: [
          { q: 'When would adding a PaymentGateway interface be justified?', options: ['When a second provider is actually needed, or to mock the provider in tests', 'Always, from day one', 'Never', 'Only in microservices'], why: 'Abstract when there’s a real second use: a second implementation, or a test seam.' },
        ],
      };
    },
    (pick) => {
      const k = pick(['GST calculation', 'discount eligibility rule', 'phone number validation']);
      return {
        q: `The same ${k} was copy-pasted into 6 classes. The rule changed, and 2 copies were missed, so customers saw different results on different screens.`,
        answer: 'DRY, KISS and YAGNI',
        hint: 'One piece of knowledge, many copies.',
        steps: ['Knowledge is duplicated.', 'Changes must be applied everywhere, and some get missed.', 'Put the rule in one place and call it.', 'DRY violation.'],
        followups: [
          { q: 'Two methods look identical but represent different business rules that change independently. Merge them?', options: ['No: DRY is about duplicated knowledge, not code that happens to look alike', 'Yes, always merge identical code', 'Only if they’re in the same class', 'Only if longer than 10 lines'], why: 'A wrong abstraction couples unrelated rules, which is worse than duplication.' },
        ],
      };
    },
  ],
});
