SG.add({
  id: 'solid-1',
  ref: 'T2',
  section: 'LLD: foundations',
  title: 'SOLID part 1: SRP, OCP, LSP',
  short: 'SOLID 1',
  blurb: 'One reason to change, open for extension, and subclasses that keep their promises.',
  intro: 'SOLID questions come as code smells: “what’s wrong with this class?”. Learn to see the smell, name the principle, and describe the fix in one sentence.',
  options: {
    'Single Responsibility (SRP)': {
      eli5: 'A Swiss army knife is handy, but if the scissors break you send the whole knife for repair. Separate tools break and get fixed separately.',
      industry: [
        'Spring apps split controller (HTTP), service (business rules) and repository (data access).',
        'Email sending, PDF generation and auditing live in their own classes, called by a service.',
        'A “God class” like UserManager with 3,000 lines is the classic SRP violation.',
      ],
      def: 'A class should have one reason to change, meaning it serves one actor or concern. If changes requested by different people (finance, marketing, ops) all touch the same class, split it.',
      scenarios: [
        'One class handles business logic, formatting, persistence and notifications',
        'A small change in one feature forces retesting unrelated features',
        'Merge conflicts keep happening in the same huge class',
      ],
      scale: 'Not about “one method per class”. It’s about one axis of change. Over-splitting into tiny classes is also a smell.',
    },
    'Open/Closed (OCP)': {
      eli5: 'A phone with a charging port: you add new chargers without opening the phone and rewiring it.',
      industry: [
        'New payment methods are added as new PaymentStrategy classes, not new if/else branches.',
        'Spring picks up new @Component implementations of an interface without changing callers.',
        'Plugin systems (IDE extensions, Jenkins plugins) extend behaviour without editing the core.',
      ],
      def: 'Software should be open for extension but closed for modification: add new behaviour by adding code (new classes), not by editing tested code. Usually achieved with interfaces and polymorphism.',
      scenarios: [
        'A switch/if-else on type grows with every new feature',
        'Adding a variant means editing a central, risky class',
        'You want new behaviour without retesting old behaviour',
      ],
      scale: 'Apply it where change actually happens. Abstracting everything “just in case” violates YAGNI.',
    },
    'Liskov Substitution (LSP)': {
      eli5: 'If you order a bicycle and get an electric bicycle, you can still ride it like a bicycle. If you get a toy bicycle that collapses when you sit on it, that’s broken substitution.',
      industry: [
        'The Square extends Rectangle problem: setWidth() changes height, breaking Rectangle’s contract.',
        'Java’s unmodifiable lists throw UnsupportedOperationException on add(), a known LSP trade-off.',
        'Subclasses that throw “not supported” for inherited methods are a red flag in code review.',
      ],
      def: 'Objects of a subclass must be usable anywhere the parent type is expected without breaking correctness: no stronger preconditions, no weaker postconditions, no surprising exceptions.',
      scenarios: [
        'A subclass throws UnsupportedOperationException for parent methods',
        'Code checks instanceof to avoid a subclass’s behaviour',
        'A subclass silently changes what a parent method guarantees',
      ],
      scale: 'Fix by redesigning the hierarchy: split interfaces, or use composition instead of inheritance.',
    },
  },
  scenarios: [
    (pick) => {
      const extra = pick(['sends welcome emails and writes audit logs', 'generates PDF reports and sends SMS', 'formats CSV exports and caches results']);
      return {
        q: `UserService registers users, validates passwords, and also ${extra}. A change to the email template forced the team to retest registration.`,
        answer: 'Single Responsibility (SRP)',
        hint: 'How many different reasons does this class have to change?',
        steps: ['Registration rules, messaging and reporting are different concerns.', 'Each concern changes for different people and reasons.', 'Split them; UserService calls the others.', 'SRP violation.'],
        followups: [
          { q: 'Does SRP mean every class should have one method?', options: ['No: one reason to change (one concern), which can need several methods', 'Yes', 'Only for services', 'Only in microservices'], why: 'Interviewers test whether you know SRP is about cohesion, not size.' },
        ],
      };
    },
    (pick) => {
      const t = pick(['customer type (regular, gold, platinum)', 'shipping partner (Delhivery, BlueDart, Ekart)', 'file format (CSV, PDF, Excel)']);
      return {
        q: `A central class has a switch on ${t}. Every new variant means editing this class, and last month a new case broke an old one.`,
        answer: 'Open/Closed (OCP)',
        hint: 'New behaviour should be added, not edited in.',
        steps: ['Each variant is a modification of tested code.', 'Instead: an interface, one class per variant.', 'New variants are new classes; old code stays untouched.', 'OCP violation.'],
        followups: [
          { q: 'Which pattern most directly applies OCP here?', options: ['Strategy (with a factory or Spring map to pick the implementation)', 'Singleton', 'Builder', 'Observer'], why: 'Strategy is OCP made concrete: new algorithm = new class.' },
        ],
      };
    },
    () => ({
      q: 'Square extends Rectangle. A method that takes a Rectangle sets width 5 and height 4, then asserts area is 20. With a Square it gets 16.',
      answer: 'Liskov Substitution (LSP)',
      hint: 'Can the subclass be used wherever the parent is expected?',
      steps: ['Rectangle promises width and height change independently.', 'Square breaks that promise.', 'Code written for Rectangle fails with Square.', 'LSP violation.'],
      followups: [
        { q: 'Best fix?', options: ['Don’t make Square a subclass of Rectangle; use a common Shape interface with area()', 'Add if (shape instanceof Square) checks', 'Make setters throw exceptions', 'Make all fields public'], why: 'Real-world “is-a” doesn’t guarantee a behavioural “is-a”.' },
      ],
    }),
    (pick) => {
      const c = pick(['ReadOnlyList extends ArrayList', 'Penguin extends Bird (which has fly())', 'FreeAccount extends Account (which has withdraw())']);
      return {
        q: `${c}, and the subclass throws UnsupportedOperationException for an inherited method. Callers started adding instanceof checks to avoid crashes.`,
        answer: 'Liskov Substitution (LSP)',
        hint: 'Callers had to special-case the subclass.',
        steps: ['The subclass can’t do what the parent promises.', 'Callers now need instanceof checks.', 'The subclass isn’t substitutable.', 'LSP violation.'],
        followups: [
          { q: 'How would you redesign Bird/Penguin?', options: ['Split capabilities: Bird base, plus a Flyable interface only flying birds implement', 'Penguin.fly() does nothing silently', 'Remove Penguin', 'Make fly() static'], why: 'Segregating interfaces by capability removes the false promise (a hint of ISP, coming tomorrow).' },
        ],
      };
    },
    (pick) => {
      const c = pick(['Invoice', 'Report', 'Order']);
      return {
        q: `The ${c} class calculates totals and taxes, and also renders itself as HTML and as PDF. Finance changes tax rules monthly; design changes the layout weekly.`,
        answer: 'Single Responsibility (SRP)',
        hint: 'Two different teams keep editing the same class.',
        steps: ['Tax rules (finance) and layout (design) are separate reasons to change.', 'Both teams touch the same class.', `Split: ${c} (data + rules) and ${c}Renderer(s).`, 'SRP violation.'],
        followups: [
          { q: 'After splitting, adding an Excel renderer should not touch existing classes. Which principle is that?', options: ['Open/Closed', 'Liskov', 'Dependency Inversion', 'DRY'], why: 'SRP and OCP often work together: split by concern, then extend by adding classes.' },
        ],
      };
    },
  ],
});
