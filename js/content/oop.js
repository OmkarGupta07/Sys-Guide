SG.add({
  id: 'oop',
  ref: 'T1 T5 T6',
  section: 'LLD: foundations',
  title: 'OOP pillars in Java',
  short: 'OOP pillars',
  blurb: 'Encapsulation, abstraction, inheritance and polymorphism, with the real bugs each one prevents.',
  intro: 'Interviewers don’t want textbook definitions. They want you to spot which pillar is missing in a piece of code and what goes wrong because of it.',
  options: {
    'Encapsulation': {
      eli5: 'A TV remote. You press buttons; you can’t touch the circuit board inside. The remote protects its insides from being broken by mistake.',
      industry: [
        'BankAccount exposes deposit()/withdraw() with checks, never a public balance field.',
        'Java records and immutable value objects hide state and prevent invalid changes.',
        'JPA entities guard invariants inside methods instead of public setters everywhere.',
      ],
      def: 'Bundle data with the methods that operate on it, and hide the data (private fields). Other code changes state only through methods that enforce rules (invariants).',
      scenarios: [
        'Invalid state appears because any code can set fields directly',
        'Validation is duplicated across callers',
        'You want to change internal representation without breaking callers',
      ],
      scale: 'Smell: public fields, or setters for everything. Fix: private state + behaviour methods that validate.',
    },
    'Abstraction': {
      eli5: 'Driving a car: you use the steering wheel and pedals. You don’t need to know how fuel injection works.',
      industry: [
        'A PaymentGateway interface hides whether Razorpay, Stripe or PayU is behind it.',
        'JDBC and Spring Data hide the database driver details.',
        'List hides whether it’s an ArrayList or a LinkedList.',
      ],
      def: 'Expose what an object does, hide how it does it. Implemented with interfaces and abstract classes. Callers depend on the contract, not the implementation.',
      scenarios: [
        'Callers know too much about vendor or library details',
        'Switching an implementation forces changes everywhere',
        'You need to mock a dependency in tests',
      ],
      scale: 'Interface vs abstract class: interface for a capability many unrelated classes can have; abstract class when subclasses share state and code.',
    },
    'Inheritance': {
      eli5: 'A child inherits their parent’s surname and house. They can add their own things, but they really are part of that family.',
      industry: [
        'SavingsAccount and CurrentAccount extend Account, sharing deposit logic.',
        'Spring’s abstract base classes (e.g. OncePerRequestFilter) give subclasses shared behaviour.',
        'Exceptions: IllegalArgumentException extends RuntimeException.',
      ],
      def: 'A subclass reuses and extends a parent class (“is-a”). Gives code reuse, but couples the child to the parent’s internals. Correct only when the child can be used anywhere the parent is expected.',
      scenarios: [
        'Classes share real “is-a” identity and common state/logic',
        'Framework hooks (template methods) in a base class',
        'Exception hierarchies',
      ],
      scale: 'Deep hierarchies become fragile. If it’s really “has-a” or behaviours vary independently, prefer composition.',
    },
    'Polymorphism': {
      eli5: 'Saying “speak” to a dog, a cat and a parrot. Same command, each responds in its own way.',
      industry: [
        'A List<Notification> where email, SMS and push each implement send() differently.',
        'Spring injects different implementations of the same interface by profile.',
        'Method overloading like println(int) vs println(String).',
      ],
      def: 'One interface, many forms. Runtime polymorphism (overriding) picks the implementation from the object’s actual type; compile-time polymorphism (overloading) picks by parameter types.',
      scenarios: [
        'Replacing if/else on type with method calls on a common interface',
        'Treating a mixed collection uniformly',
        'Same operation name for different parameter types (overloading)',
      ],
      scale: 'The engine behind most design patterns (Strategy, State, Observer). If you see instanceof chains, polymorphism is missing.',
    },
  },
  scenarios: [
    (pick) => {
      const f = pick(['balance', 'stockCount', 'seatCount']);
      return {
        q: `A class has a public field ${f}. A bug in an unrelated report module set it to a negative number, and nobody noticed for a week.`,
        answer: 'Encapsulation',
        hint: 'Who was allowed to change the field?',
        steps: ['Any code could write the field directly.', 'No rule was enforced at the point of change.', `Make ${f} private and change it only via methods that validate.`, 'Encapsulation was missing.'],
        followups: [
          { q: 'Is adding a public setter for every private field enough?', options: ['No. A plain setter is still a public field in disguise; expose behaviour (withdraw, reserve) with validation', 'Yes, private + setters is encapsulation', 'Yes, if you use Lombok', 'No, fields must be static'], why: 'Encapsulation is about protecting invariants, not about the keyword private.' },
        ],
      };
    },
    (pick) => {
      const v = pick(['Razorpay', 'Stripe', 'PayU']);
      return {
        q: `CheckoutService builds ${v} HTTP requests, signs them, and parses ${v}’s JSON directly. Switching providers means rewriting checkout, and you can’t unit test it without hitting ${v}.`,
        answer: 'Abstraction',
        hint: 'Checkout should know what payment does, not how.',
        steps: ['Checkout depends on vendor details.', 'Introduce a PaymentGateway interface with pay()/refund().', `${v} becomes one implementation; tests use a fake.`, 'Abstraction was missing.'],
        followups: [
          { q: 'Interface or abstract class for PaymentGateway?', options: ['Interface: providers share a contract but no common state or code', 'Abstract class, always', 'Neither, use a static utility class', 'Enum'], why: 'Use an abstract class only when implementations genuinely share state or code.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['email, SMS and push', 'email, WhatsApp and push', 'SMS, push and Slack']);
      return {
        q: `You loop over a list of notifications (${n}) and call send() on each. Each type sends differently, and the loop never checks the type.`,
        answer: 'Polymorphism',
        hint: 'Same call, different behaviour, decided at runtime.',
        steps: ['One method name: send().', 'Each class overrides it.', 'The JVM picks the implementation by the object’s real type.', 'Runtime polymorphism.'],
        followups: [
          { q: 'Overloading vs overriding: which one is decided at runtime?', options: ['Overriding (dynamic dispatch on the object type)', 'Overloading', 'Both', 'Neither'], why: 'Overloading is resolved at compile time from parameter types.' },
        ],
      };
    },
    () => ({
      q: 'SavingsAccount and CurrentAccount share the same fields (number, holder, balance) and the same deposit logic. Each is genuinely a kind of account.',
      answer: 'Inheritance',
      hint: 'Is there a real “is-a” relationship with shared state?',
      steps: ['Both truly are Accounts.', 'They share state and behaviour.', 'An abstract Account base class removes duplication.', 'Inheritance fits.'],
      followups: [
        { q: 'Square extends Rectangle, and setWidth() on a Square silently changes its height. What principle breaks?', options: ['Liskov substitution: a Square can’t be used everywhere a Rectangle is expected', 'Encapsulation', 'Single responsibility', 'Nothing breaks'], why: '“is-a” in real life isn’t enough; the subclass must keep the parent’s behaviour promises.' },
      ],
    }),
    (pick) => {
      const t = pick(['int and double', 'String and char[]', 'int and long']);
      return {
        q: `A Calculator has add(...) twice: one version for ${t.split(' and ')[0]} values and one for ${t.split(' and ')[1]} values. The compiler picks which to call from the argument types.`,
        answer: 'Polymorphism',
        hint: 'Same name, different parameter types.',
        steps: ['Same method name, different signatures.', 'Chosen at compile time from argument types.', 'This is compile-time polymorphism (overloading).'],
        followups: [
          { q: 'Composition vs aggregation: a Car has an Engine created and destroyed with it; a Team has Players who exist on their own. Which is composition?', options: ['Car–Engine (the part’s lifecycle is owned by the whole)', 'Team–Player', 'Both', 'Neither'], why: 'Composition = strong ownership of lifecycle. Aggregation = “has” but parts live independently.' },
        ],
      };
    },
  ],
});
