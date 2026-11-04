SG.add({
  id: 'clean-code',
  ref: 'T60 T61 T64 T65 T66 T67',
  section: 'LLD: craft',
  title: 'Clean code, testing and code smells',
  short: 'Clean code',
  blurb: 'What reviewers and machine-coding interviewers actually mark you down for.',
  intro: 'Machine-coding rounds grade readability, error handling and testability as much as correctness. Learn to spot the smell, name it, and apply the standard fix.',
  options: {
    'Meaningful names, small functions': {
      eli5: 'Labelled jars in a kitchen (“sugar”, “salt”) versus jars marked “x1”, “x2”. One mistake with unlabelled jars ruins the dish.',
      industry: [
        'Code reviews at most product companies reject names like data2, tmp, flag.',
        'Replacing magic numbers (if status == 3) with enums/constants (OrderStatus.SHIPPED).',
        'Extract-method refactoring in IntelliJ.',
      ],
      def: 'Names reveal intent (calculateLateFee, not calc); functions do one thing at one level of abstraction and stay short; no magic numbers or boolean flag parameters that change behaviour. Code should read like a description of what it does.',
      scenarios: [
        'A 300-line method with nested ifs',
        'Magic numbers and cryptic abbreviations',
        'Boolean parameters like process(order, true, false)',
      ],
      scale: 'The cheapest improvement with the biggest readability gain; interviewers notice immediately.',
    },
    'Exception handling': {
      eli5: 'A smoke alarm that’s been switched off because it was annoying. The fire still happens; you just find out much later.',
      industry: [
        'Spring’s @ControllerAdvice mapping exceptions to clean API errors.',
        'Custom domain exceptions (InsufficientBalanceException) instead of generic RuntimeException.',
        'try-with-resources closing streams and connections.',
      ],
      def: 'Don’t swallow exceptions (empty catch blocks); catch only what you can handle; fail fast on invalid input; use specific exception types; preserve the cause when wrapping; release resources with try-with-resources/finally; don’t use exceptions for normal control flow.',
      scenarios: [
        'Empty catch blocks hiding failures',
        'catch (Exception e) everywhere',
        'Resources (connections, files) leaking on errors',
      ],
      scale: 'Handle at the boundary (controller advice, job runner) and log once with context, not at every layer.',
    },
    'Immutability and value objects': {
      eli5: 'A printed train ticket. Nobody can secretly change the date on it; if you need a different date, you get a new ticket.',
      industry: [
        'Java records and final fields for DTOs and money/value types.',
        'Money(amount, currency) instead of passing raw doubles around.',
        'String, LocalDate and BigDecimal are immutable in the JDK.',
      ],
      def: 'Immutable objects can’t change after creation: thread-safe by default, safe to share and cache, easier to reason about. Value objects wrap primitives with meaning and validation (Email, Money, PhoneNumber), equal by value.',
      scenarios: [
        'Shared objects mutated unexpectedly by another part of the code',
        'Primitive obsession: strings and doubles passed around for emails and money',
        'Thread-safety bugs from shared mutable state',
      ],
      scale: 'Creating new objects is cheap in modern JVMs; use builders for complex immutable objects.',
    },
    'Testable design': {
      eli5: 'A car whose parts unbolt easily. A mechanic can test the brakes on their own without driving the whole car around town.',
      industry: [
        'JUnit + Mockito with constructor-injected dependencies.',
        'Injecting a Clock instead of calling LocalDateTime.now() directly.',
        'Test pyramid: many unit tests, fewer integration tests, few end-to-end tests.',
      ],
      def: 'Design so units can be tested in isolation: inject dependencies (including time and randomness), keep business logic out of framework code, avoid static/global state, and keep functions pure where possible. Hard-to-test code is usually tightly coupled code.',
      scenarios: [
        'Tests need a real database or network to run',
        'Logic depends on the current time or random values',
        'Static singletons make tests interfere with each other',
      ],
      scale: 'If a class needs ten mocks to test, it probably does too much (SRP).',
    },
    'Code smells and anti-patterns': {
      eli5: 'A smell in the fridge doesn’t tell you exactly what’s rotten, but it tells you to look.',
      industry: [
        'God class: a 5,000-line OrderManager that everyone edits.',
        'Feature envy, long parameter lists, duplicated code, shotgun surgery.',
        'Golden hammer: using one favourite tool (or pattern) for everything.',
      ],
      def: 'Surface signs of deeper design problems: god classes, long methods, duplicated logic, long parameter lists, feature envy (a method using another class’s data more than its own), shotgun surgery (one change touches many classes). Fix with small refactorings backed by tests.',
      scenarios: [
        'One class knows and does everything',
        'A single change requires edits in ten places',
        'Patterns forced in where simple code would do',
      ],
      scale: 'Refactor in small, test-covered steps; don’t mix refactoring with behaviour changes.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick([250, 400, 600]);
      return {
        q: `A method processOrder(o, true, false, 3) is ${n} lines long with five levels of nested ifs. Nobody remembers what the booleans or 3 mean.`,
        answer: 'Meaningful names, small functions',
        hint: 'Readability first: names, size, flags, magic numbers.',
        steps: ['Boolean flags and magic numbers hide intent.', 'One huge method mixes many steps.', 'Extract named methods; replace flags with separate methods or enums.', 'Meaningful names, small functions.'],
        followups: [
          { q: 'Best replacement for the magic number 3 meaning “shipped”?', options: ['An enum constant like OrderStatus.SHIPPED', 'A comment next to it', 'A static int called THREE', 'Leave it'], why: 'Enums make invalid values impossible and intent obvious.' },
        ],
      };
    },
    () => ({
      q: 'Payment code has catch (Exception e) { } in several places. A bug silently failed thousands of refunds for a week before anyone noticed.',
      answer: 'Exception handling',
      hint: 'Errors were swallowed.',
      steps: ['Empty catch blocks hide failures.', 'Catch specific exceptions you can handle; let others propagate.', 'Log with context once at the boundary and alert.', 'Exception handling.'],
      followups: [
        { q: 'You wrap a SQLException in a custom exception. What must you keep?', options: ['The original cause: new RefundFailedException("...", e)', 'Nothing, just the message', 'Only the stack trace as a string', 'The SQL password'], why: 'Losing the cause makes production debugging painful.' },
      ],
    }),
    (pick) => {
      const what = pick(['an Order’s list of items', 'a shared Config object', 'a Money amount']);
      return {
        q: `A method returns ${what} to callers, and one caller modified it, unexpectedly changing data for every other user of the object. It’s also accessed from several threads.`,
        answer: 'Immutability and value objects',
        hint: 'Shared mutable state.',
        steps: ['Callers can mutate shared state.', 'Threads make it worse.', 'Return immutable objects/copies; model values as immutable types.', 'Immutability.'],
        followups: [
          { q: 'Why is double a bad type for money?', options: ['Binary floating point can’t represent many decimals exactly (0.1 + 0.2 ≠ 0.3); use BigDecimal or paise as long in a Money type', 'It’s too big', 'It’s immutable', 'It’s slow'], why: 'A classic interview and production bug.' },
        ],
      };
    },
    () => ({
      q: 'A late-fee calculator calls LocalDate.now() and a static DatabaseUtil.query() internally. The tests only pass on certain days and need a live database.',
      answer: 'Testable design',
      hint: 'Hidden dependencies on time and static infrastructure.',
      steps: ['Time and DB are hidden dependencies.', 'Inject a Clock and a repository interface.', 'Tests pass a fixed clock and a fake repository.', 'Testable design.'],
      followups: [
        { q: 'Roughly how should a healthy test suite be shaped?', options: ['Many fast unit tests, fewer integration tests, very few end-to-end tests', 'Mostly end-to-end tests', 'Only manual tests', 'Only integration tests'], why: 'The test pyramid keeps feedback fast and reliable.' },
      ],
    }),
    (pick) => {
      const n = pick(['5,000', '8,000']);
      return {
        q: `OrderManager has ${n} lines: it validates, prices, applies coupons, talks to the payment gateway, sends emails and generates reports. Every feature touches it and merge conflicts are constant.`,
        answer: 'Code smells and anti-patterns',
        hint: 'Name the smell.',
        steps: ['One class does everything: a god class.', 'It violates SRP and causes constant conflicts.', 'Extract cohesive classes (PricingService, CouponService…) behind interfaces, with tests.', 'Code smell: god class.'],
        followups: [
          { q: 'Changing the tax rule requires edits in 12 different classes. Which smell?', options: ['Shotgun surgery', 'Feature envy', 'Golden hammer', 'Long parameter list'], why: 'One reason to change scattered across many places.' },
        ],
      };
    },
  ],
});
