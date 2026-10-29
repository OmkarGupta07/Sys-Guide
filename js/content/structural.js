SG.add({
  id: 'structural',
  ref: 'T20 T21 T22 T23',
  section: 'LLD: design patterns',
  title: 'Structural patterns: Adapter, Decorator, Proxy, Facade',
  short: 'Structural patterns',
  blurb: 'Four wrappers that look identical in a class diagram but have completely different intent.',
  intro: 'All four wrap another object. The question is why: to convert an interface (Adapter), add behaviour (Decorator), control access (Proxy), or simplify a whole subsystem (Facade). Interviewers ask exactly that.',
  options: {
    'Adapter': {
      eli5: 'A travel plug adapter. Your Indian charger doesn’t fit a UK socket, so the adapter converts one shape into the other.',
      industry: [
        'Wrapping a vendor SDK (old SMS provider’s API) to match your NotificationSender interface.',
        'Java’s Arrays.asList and InputStreamReader adapt one type to another.',
        'Spring MVC’s HandlerAdapter lets different controller types plug into the same dispatcher.',
      ],
      def: 'Converts the interface of an existing class into the interface clients expect, so incompatible classes can work together without changing either.',
      scenarios: [
        'Integrating a third-party or legacy class whose API doesn’t match yours',
        'Swapping vendors behind your own interface',
        'Reusing old code in a new design',
      ],
      scale: 'Keep adapters thin: translation only, no business logic.',
    },
    'Decorator': {
      eli5: 'A plain coffee, then add milk, then add sugar, then add whipped cream. Each addition wraps the drink and adds something, and you can combine them any way.',
      industry: [
        'Java I/O: new BufferedReader(new InputStreamReader(new FileInputStream(...))).',
        'Adding logging, caching or retries around a service without changing it.',
        'Spring’s @Transactional and @Cacheable work through wrapping proxies that decorate behaviour.',
      ],
      def: 'Attaches extra behaviour to an object dynamically by wrapping it in objects with the same interface. Decorators can be stacked in any combination, avoiding a subclass per combination.',
      scenarios: [
        'Optional features that combine freely (compression + encryption + logging)',
        'Adding cross-cutting behaviour without touching the original class',
        'Avoiding a class explosion of feature combinations',
      ],
      scale: 'Many layers can be hard to debug; keep each decorator focused on one concern.',
    },
    'Proxy': {
      eli5: 'A celebrity’s manager. You talk to the manager, who decides whether you get access, and may answer simple questions without bothering the celebrity.',
      industry: [
        'Hibernate lazy-loading proxies load an entity only when a field is first accessed.',
        'Spring AOP proxies add security checks around beans.',
        'Remote proxies (gRPC/RMI stubs) make a network call look like a local method.',
      ],
      def: 'Provides a stand-in with the same interface that controls access to the real object: lazy creation (virtual proxy), permission checks (protection proxy), remote access (remote proxy), or caching.',
      scenarios: [
        'Delay creating an expensive object until it’s actually used',
        'Check permissions before allowing a call',
        'Represent a remote service as a local object',
      ],
      scale: 'Differs from Decorator by intent: Proxy controls access to one subject; Decorator adds features and is meant to be stacked.',
    },
    'Facade': {
      eli5: 'A hotel concierge. You say “plan my evening”, and they book the taxi, the restaurant and the show. You don’t call each one yourself.',
      industry: [
        'A CheckoutService that coordinates inventory, payment, shipping and notifications behind one call.',
        'SLF4J is a facade over logging frameworks.',
        'Spring’s JdbcTemplate hides connection, statement and result-set handling.',
      ],
      def: 'Provides one simple, higher-level interface to a complex subsystem of many classes. Clients call the facade; the subsystem stays available for advanced use.',
      scenarios: [
        'Clients must coordinate many classes to do one common task',
        'Hiding a complex library behind a simple API',
        'Reducing coupling between layers or modules',
      ],
      scale: 'A facade that grows into a god class is a smell; split by use case.',
    },
  },
  scenarios: [
    (pick) => {
      const v = pick(['an old SMS vendor whose SDK has sendMsg(String phone, String text, int priority)', 'a legacy payment library with doTxn(Map params)', 'a weather API returning XML']);
      return {
        q: `Your code expects a NotificationSender (or PaymentGateway, or JSON client) interface. You must integrate ${v}, and you can’t change the vendor code.`,
        answer: 'Adapter',
        hint: 'Two interfaces that don’t fit each other.',
        steps: ['Existing class, incompatible interface.', 'You can’t modify it.', 'Wrap it in a class that implements your interface and translates calls.', 'Adapter.'],
        followups: [
          { q: 'Should the adapter also apply business rules, like retrying failed payments?', options: ['No: keep it pure translation; put retries in a decorator or the service', 'Yes, it’s convenient', 'Only for payments', 'Only if the vendor is slow'], why: 'Single responsibility: adapters translate, nothing else.' },
        ],
      };
    },
    (pick) => {
      const f = pick(['compression, encryption and logging', 'caching, retries and metrics', 'rate limiting, auth checks and audit logging']);
      return {
        q: `A DataStream (or service client) needs optional ${f}. Customers enable different combinations, and making a subclass for each combination is already at 8 classes.`,
        answer: 'Decorator',
        hint: 'Features that stack in any combination.',
        steps: ['Optional features, any combination.', 'Subclasses multiply per combination.', 'Wrap the object in layers, each adding one feature.', 'Decorator.'],
        followups: [
          { q: 'Which JDK API is the textbook Decorator example?', options: ['java.io streams (BufferedInputStream wrapping FileInputStream)', 'java.util.Collections.sort', 'java.lang.String', 'Thread'], why: 'Each I/O wrapper adds one capability around the same InputStream interface.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['a high-resolution image', 'a large report object', 'an Order’s 10,000 line items']);
      return {
        q: `Loading ${what} is expensive, but most screens never display it. You want a placeholder with the same interface that loads the real thing only on first use.`,
        answer: 'Proxy',
        hint: 'Control when the real object is created.',
        steps: ['Expensive object, often unused.', 'A stand-in with the same interface delays creation.', 'Loads on first real access.', 'Virtual proxy (lazy loading).'],
        followups: [
          { q: 'A classic bug with Hibernate’s lazy proxies?', options: ['LazyInitializationException when the field is touched after the session closed', 'They load everything twice', 'They break equals() on Strings', 'They disable transactions'], why: 'Lazy proxies need an open session when they finally load.' },
        ],
      };
    },
    () => ({
      q: 'Only admins may call deleteUser() on UserService. You want the check to happen in front of the real service, with the same interface, so callers don’t change.',
      answer: 'Proxy',
      hint: 'Same interface, controlling access to the real object.',
      steps: ['Access control in front of one real subject.', 'Same interface, so callers are unchanged.', 'Protection proxy.'],
      followups: [
        { q: 'Decorator vs Proxy: what really separates them?', options: ['Intent: Proxy controls access to its subject; Decorator adds behaviour and is designed to stack', 'Proxies can’t share an interface', 'Decorators can’t wrap objects', 'There’s no difference in intent'], why: 'Structurally they’re almost identical, so interviewers test intent.' },
      ],
    }),
    (pick) => {
      const n = pick([5, 6, 7]);
      return {
        q: `To place an order, the controller calls ${n} classes in a precise order: inventory reserve, price calculation, payment, shipping booking, notification… Every new client copies this sequence.`,
        answer: 'Facade',
        hint: 'Clients need one simple entry point to a complex subsystem.',
        steps: ['Many classes, one common task.', 'Clients duplicate the coordination.', 'A placeOrder() method hides the sequence.', 'Facade.'],
        followups: [
          { q: 'Which logging library is a well-known facade?', options: ['SLF4J', 'Log4j core appenders', 'System.out', 'JUnit'], why: 'SLF4J offers one API over Logback, Log4j and others.' },
        ],
      };
    },
  ],
});
