SG.add({
  id: 'di-layers',
  ref: 'T40 T41 T62 T63',
  section: 'LLD: architecture',
  title: 'Dependency injection and layered architecture',
  short: 'DI and layers',
  blurb: 'How Spring wires your app, and how controllers, services, repositories and ports keep it testable.',
  intro: 'Most Java LLD answers live inside a Spring Boot structure. Know who creates objects (the container), where each kind of logic belongs (layers), and how to keep business rules independent of frameworks (hexagonal).',
  options: {
    'Dependency injection': {
      eli5: 'A restaurant kitchen where the manager hands each cook the tools they need. Cooks don’t go shopping for knives themselves, so swapping a knife brand is easy.',
      industry: [
        'Spring’s IoC container creates beans and injects them through constructors.',
        'Unit tests pass mocks (Mockito) into constructors without starting Spring.',
        'Profiles inject different implementations per environment (real SMS vs fake).',
      ],
      def: 'Objects receive their dependencies from outside (usually via the constructor) instead of creating them with new. Inversion of Control: the container builds the object graph. Enables swapping implementations and testing in isolation.',
      scenarios: [
        'Classes create their own collaborators and can’t be tested in isolation',
        'Different implementations per environment or tenant',
        'Avoiding hidden global state (static singletons)',
      ],
      scale: 'Prefer constructor injection with final fields; field injection hides dependencies and needs reflection in tests.',
    },
    'Layered architecture': {
      eli5: 'A restaurant: waiters take orders (controllers), chefs decide how to cook (services), and storekeepers fetch ingredients (repositories). Waiters never cook.',
      industry: [
        'Spring Boot apps with @RestController → @Service → @Repository.',
        'Most enterprise Java codebases follow this layout.',
        'Transactions (@Transactional) usually live in the service layer.',
      ],
      def: 'Split code by responsibility: presentation/controller (HTTP, validation, mapping), service (business rules, transactions), repository/data access (persistence). Each layer depends only on the one below.',
      scenarios: [
        'Business logic is leaking into controllers',
        'SQL is scattered across many classes',
        'You need a clear place for transactions and validation',
      ],
      scale: 'Simple and familiar. Risk: “anemic” services that just pass data through, or services that depend directly on framework/DB details.',
    },
    'Repository and DTO': {
      eli5: 'The repository is the storekeeper who knows where every ingredient is. The DTO is the plate the waiter carries out: only what the customer should see, nicely arranged.',
      industry: [
        'Spring Data JPA repositories (OrderRepository extends JpaRepository).',
        'Response DTOs hide internal fields like passwordHash or internal IDs.',
        'MapStruct maps entities to DTOs.',
      ],
      def: 'Repository: a collection-like interface for loading and saving aggregates, hiding persistence details. DTO (data transfer object): a simple object shaped for an API or another layer, decoupled from the database entity.',
      scenarios: [
        'API responses expose internal entity fields',
        'Changing a database column breaks API clients',
        'Persistence code duplicated across services',
      ],
      scale: 'Mapping adds a little boilerplate; it buys freedom to change the database without breaking APIs.',
    },
    'Hexagonal (ports and adapters)': {
      eli5: 'A laptop with USB ports. The laptop doesn’t care whether you plug in a mouse, a keyboard or a pen drive, as long as it fits the port.',
      industry: [
        'Domain code defines ports (PaymentPort, OrderStore); adapters implement them for Razorpay, Postgres, Kafka.',
        'Clean Architecture and DDD codebases at fintechs and large product companies.',
        'Testing business rules with in-memory adapters, no database needed.',
      ],
      def: 'The domain/business core defines interfaces (ports) for everything it needs from the outside world; infrastructure provides adapters (REST controllers, DB repositories, message consumers). Dependencies point inward, so the core has no framework or database imports.',
      scenarios: [
        'Business rules must survive a change of database, queue or vendor',
        'Several entry points (REST, Kafka consumer, CLI) share the same logic',
        'Fast tests of domain logic without infrastructure',
      ],
      scale: 'More interfaces and mapping. Worth it for complex domains; overkill for simple CRUD.',
    },
  },
  scenarios: [
    (pick) => {
      const d = pick(['new SmtpEmailSender()', 'new RazorpayClient(apiKey)', 'new JdbcOrderDao(dataSource)']);
      return {
        q: `OrderService’s constructor does ${d}. Unit tests can’t run without real infrastructure, and staging can’t use a fake implementation.`,
        answer: 'Dependency injection',
        hint: 'Who should create the collaborator?',
        steps: ['The service builds its own dependency.', 'Tests and environments can’t swap it.', 'Accept an interface in the constructor; let Spring inject it.', 'Dependency injection.'],
        followups: [
          { q: 'Spring bean default scope?', options: ['Singleton: one instance per application context', 'Prototype: new instance each time', 'Request', 'Session'], why: 'So beans must be stateless or thread-safe.' },
        ],
      };
    },
    (pick) => {
      const n = pick([200, 400, 600]);
      return {
        q: `A @RestController method is ${n} lines long: it validates input, calculates discounts, opens a transaction, runs SQL and sends emails.`,
        answer: 'Layered architecture',
        hint: 'Everything is in the HTTP layer.',
        steps: ['HTTP, business rules and persistence are mixed.', 'Controller: request/response only.', 'Service: rules and transactions; repository: data access.', 'Layered architecture.'],
        followups: [
          { q: 'Where should @Transactional usually go?', options: ['On service methods that represent one business operation', 'On controllers', 'On every repository method only', 'On DTOs'], why: 'A business operation defines the transaction boundary.' },
        ],
      };
    },
    () => ({
      q: 'GET /users/{id} returns the JPA User entity directly. The JSON now includes passwordHash, and renaming a column broke the mobile app.',
      answer: 'Repository and DTO',
      hint: 'The API is coupled to the database entity.',
      steps: ['The entity leaks internal fields.', 'Database changes ripple into clients.', 'Return a UserResponse DTO mapped from the entity.', 'Repository + DTO separation.'],
      followups: [
        { q: 'Returning entities with lazy relations from a controller often causes what?', options: ['LazyInitializationException or accidental huge JSON (N+1 loads)', 'Faster responses', 'Nothing', 'Compile errors'], why: 'Another reason to map to DTOs inside the transaction.' },
      ],
    }),
    (pick) => {
      const n = pick(['REST API, a Kafka consumer and a nightly batch job', 'mobile API, admin API and a partner SFTP import']);
      return {
        q: `The same “create order” rules must run from a ${n}. The team also plans to move from MySQL to DynamoDB next year and wants the business rules untouched.`,
        answer: 'Hexagonal (ports and adapters)',
        hint: 'Many entry points, swappable infrastructure, stable core.',
        steps: ['Several inbound adapters share one core.', 'Storage will change.', 'Core defines ports; adapters plug in on both sides.', 'Hexagonal architecture.'],
        followups: [
          { q: 'In hexagonal architecture, which direction do dependencies point?', options: ['Inward: adapters depend on the domain’s ports, never the reverse', 'Outward: domain depends on the database', 'Both ways', 'No dependencies allowed'], why: 'The domain stays free of framework and database imports.' },
        ],
      };
    },
    () => ({
      q: 'Two implementations of NotificationSender exist: real SMS in production and a logging fake in development. The choice should depend on configuration, not code changes.',
      answer: 'Dependency injection',
      hint: 'The container picks the implementation.',
      steps: ['One interface, several implementations.', 'Selection by environment.', 'Spring profiles or @ConditionalOnProperty inject the right bean.', 'Dependency injection.'],
      followups: [
        { q: 'Two beans implement the same interface and Spring fails to start. Fix?', options: ['Mark one @Primary or use @Qualifier at the injection point', 'Delete the interface', 'Use field injection', 'Restart the server'], why: 'Ambiguous beans need an explicit choice.' },
      ],
    }),
  ],
});
