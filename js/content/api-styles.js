SG.add({
  id: 'api-styles',
  ref: 'H1 H2 H4 H14',
  section: 'APIs and communication',
  title: 'REST, GraphQL, gRPC and webhooks',
  short: 'API styles',
  blurb: 'REST by default, GraphQL for flexible clients, gRPC inside, webhooks to call others back.',
  intro: 'In most interviews, REST is the right answer for client-facing APIs. Know exactly when to deviate: different clients needing different shapes (GraphQL), fast typed service-to-service calls (gRPC), or notifying another system when something happens (webhooks). Spend no more than about five minutes on the API in an interview.',
  options: {
    'REST': {
      eli5: 'A library with labelled shelves. “GET /books/42” fetches book 42, “POST /books” adds a book. Everyone already knows how libraries work.',
      industry: [
        'Public APIs of Stripe, Razorpay, GitHub and most SaaS products.',
        'Mobile and web backends in Spring Boot (@RestController).',
        'Works with every client, cache, proxy and firewall out of the box.',
      ],
      def: 'Resources (plural nouns mapping to core entities) addressed by URLs, acted on with HTTP methods: GET read, POST create (not idempotent), PUT replace and PATCH update, DELETE remove. Stateless, cacheable, usually JSON.',
      scenarios: [
        'Client-facing APIs (the default, ~95% of interview cases)',
        'Public APIs for third-party developers',
        'Simple CRUD over well-defined entities',
      ],
      scale: 'Scales easily (stateless, cacheable at CDN/proxies). Weakness: fixed response shapes cause over- or under-fetching for diverse clients.',
    },
    'GraphQL': {
      eli5: 'A restaurant where you write exactly what you want on the order slip: “just the dal, no rice, extra papad”. The kitchen sends exactly that, in one trip.',
      industry: [
        'Facebook built it (2012) for its mobile apps on slow networks; open-sourced in 2015.',
        'GitHub’s v4 API and Shopify’s storefront API.',
        'Backends serving web, iOS and Android screens with different data needs.',
      ],
      def: 'A single endpoint where the client sends a query describing exactly which fields (and nested relations) it needs. Avoids over-fetching and multiple round trips. Pitfalls: N+1 queries in resolvers (fix with batching/DataLoader), harder HTTP caching; allows field-level authorization.',
      scenarios: [
        'Many client types need different shapes of the same data',
        'A screen needs nested data that would take several REST calls',
        'Rapidly changing frontends that shouldn’t wait for new endpoints',
      ],
      scale: 'Watch query cost: limit depth/complexity, batch resolvers, and use persisted queries for caching.',
    },
    'gRPC': {
      eli5: 'Two colleagues who agreed on a short code language. Instead of writing long letters, they exchange tiny coded notes, very fast, but outsiders can’t read them.',
      industry: [
        'Internal microservice calls at Google, Netflix, Uber and many fintechs.',
        'Generated, typed clients in Java, Go, Python from one .proto file.',
        'Streaming between services over HTTP/2.',
      ],
      def: 'Remote procedure calls defined in Protocol Buffers: compact binary messages with numbered fields, generated typed clients and servers, HTTP/2 multiplexing and streaming. Much smaller and faster than JSON, but not human-readable and poorly supported by browsers directly.',
      scenarios: [
        'Service-to-service calls inside your own system',
        'High-throughput, low-latency internal APIs',
        'Polyglot services that need a strict shared contract',
      ],
      scale: 'Great internally. For public/browser clients, REST (or gRPC-Web via a proxy) is easier.',
    },
    'Webhooks': {
      eli5: 'Instead of calling the tailor every day to ask “is my suit ready?”, you leave your number and the tailor calls you when it’s done.',
      industry: [
        'Razorpay/Stripe call your server when a payment succeeds or fails.',
        'GitHub calls CI systems on every push.',
        'Shopify notifies apps when orders are created.',
      ],
      def: 'An HTTP callback: when an event happens in system A, A sends a POST to a URL that system B registered. Receivers must verify signatures, respond quickly (queue the work), and be idempotent because senders retry.',
      scenarios: [
        'Notify another company’s system when an event happens',
        'Replace polling a third-party API for status changes',
        'Integrations between SaaS products',
      ],
      scale: 'Expect retries and duplicates; verify signatures (HMAC) and dedupe by event ID.',
    },
  },
  scenarios: [
    (pick) => {
      const what = pick(['a ticket booking app’s public API', 'a food delivery app’s mobile backend', 'an e-commerce site’s API']);
      return {
        q: `You’re designing ${what} for web and mobile. Entities are events/restaurants/products, orders and users. Nothing unusual about the clients.`,
        answer: 'REST',
        hint: 'What’s the safe default?',
        steps: ['Standard client-facing API.', 'Clear entities map to resources.', 'Every client, proxy and CDN understands HTTP/JSON.', 'REST.'],
        followups: [
          { q: 'Which endpoint follows REST conventions best for creating an order?', options: ['POST /orders', 'POST /createOrder', 'GET /orders/create', 'PUT /order/new'], why: 'Plural noun resource; the HTTP method is the verb.' },
          { q: 'Filters like city and date for listing events belong where?', options: ['Query parameters: GET /events?city=pune&date=2026-12-01', 'Path: /events/pune/2026-12-01 always', 'Request body of a GET', 'Headers'], why: 'Path = required identifier, query = optional filters, body = data to create/update.' },
        ],
      };
    },
    (pick) => {
      const n = pick([3, 4, 5]);
      return {
        q: `The same product data feeds ${n} clients: a slim mobile list, a rich desktop page, a smartwatch widget and partner kiosks. Each needs different fields and nested data, and REST endpoints keep multiplying.`,
        answer: 'GraphQL',
        hint: 'Different clients, different shapes, one source.',
        steps: ['Clients need different fields.', 'REST forces endpoint sprawl or over-fetching.', 'Let clients ask for exactly what they need.', 'GraphQL.'],
        followups: [
          { q: 'A query for 100 events each with its venue triggers 101 database queries. Fix?', options: ['Batch resolver loads (DataLoader) into one query for all venues', 'Add more database replicas', 'Switch to SOAP', 'Cache nothing'], why: 'N+1 is the classic GraphQL follow-up.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['20', '40', '80']);
      return {
        q: `${n} internal Java and Go microservices call each other thousands of times per second. JSON parsing shows up in CPU profiles, and teams keep breaking each other’s request formats.`,
        answer: 'gRPC',
        hint: 'Internal, high volume, need a strict contract.',
        steps: ['Calls are internal: you control both sides.', 'Binary protobuf is smaller and faster than JSON.', 'Generated typed clients enforce the contract.', 'gRPC.'],
        followups: [
          { q: 'Why not expose gRPC directly to the public mobile and web API?', options: ['Browsers and third parties expect HTTP/JSON; REST passes proxies and is human-readable', 'gRPC is slower', 'gRPC can’t carry data', 'It’s illegal'], why: 'REST outside, RPC inside is the common split.' },
        ],
      };
    },
    (pick) => {
      const p = pick(['Razorpay', 'Stripe', 'PayU']);
      return {
        q: `Your app needs to know when a customer’s payment on ${p} succeeds or fails. Polling ${p} every few seconds for thousands of orders is wasteful and slow.`,
        answer: 'Webhooks',
        hint: 'Let them call you.',
        steps: ['The event happens in another company’s system.', 'Polling wastes calls and adds delay.', 'Register a URL; they POST events to you.', 'Webhooks.'],
        followups: [
          { q: `${p} retries a webhook and your server gets the same “payment succeeded” twice. What must the handler do?`, options: ['Verify the signature and dedupe by event ID (idempotent handling)', 'Process it twice', 'Return 500 to stop retries', 'Ignore all webhooks'], why: 'Senders retry until they get a 2xx; handlers must be idempotent.' },
        ],
      };
    },
    () => ({
      q: 'An order service, written in Java, must call an inventory service, written in Go, with a strongly typed request, and both teams want compile-time errors if the contract changes.',
      answer: 'gRPC',
      hint: 'Polyglot internal services with a shared schema.',
      steps: ['Internal calls between different languages.', 'A .proto schema generates typed code for both.', 'Contract changes surface at compile time.', 'gRPC.'],
      followups: [
        { q: 'How do you add a new field to a protobuf message safely?', options: ['Add it with a new field number as optional; never reuse old numbers', 'Renumber all fields', 'Delete an old field and reuse its number', 'Change a field’s type'], why: 'Field tags are the wire contract; reusing them corrupts old data.' },
      ],
    }),
  ],
});
