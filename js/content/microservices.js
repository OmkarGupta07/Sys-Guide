SG.add({
  id: 'microservices',
  ref: 'K1 K2 K11 K12',
  section: 'Microservices and edge',
  title: 'Monolith, modular monolith or microservices',
  short: 'Service architecture',
  blurb: 'When splitting into services pays off, how to draw the lines, and how to migrate safely.',
  intro: 'Microservices solve organisational and scaling problems, and add distributed-systems problems in exchange. Interviewers reward candidates who start simple and can name the signal that would justify splitting.',
  options: {
    'Monolith': {
      eli5: 'One big kitchen where every dish is cooked. Easy to run with a small team, but if the gas line breaks, nothing gets cooked.',
      industry: [
        'Most startups (Shopify, Stack Overflow, early Instagram) ran on monoliths for years.',
        'One Spring Boot app, one database, one deploy pipeline.',
        'Simple debugging: one log, one stack trace, local transactions.',
      ],
      def: 'One deployable application containing all features, usually with one database. Simple to build, test, deploy and debug; transactions are local. Downsides at scale: whole-app deploys, one bug can take everything down, and all parts scale together.',
      scenarios: [
        'Small team, early product, changing requirements',
        'Under a few hundred thousand users with no extreme hotspots',
        'Strong consistency across features is easy with one database',
      ],
      scale: 'Scales horizontally behind a load balancer for a long time. “Premature microservices” is a common interview red flag.',
    },
    'Modular monolith': {
      eli5: 'One kitchen, but with walled-off stations (bakery, grill, desserts) that only share ingredients through a counter. Later, any station can move into its own building.',
      industry: [
        'Shopify’s large Rails monolith split into enforced components.',
        'Spring Modulith / Java modules enforcing boundaries inside one app.',
        'A stepping stone teams use before extracting services.',
      ],
      def: 'One deployable, but internally divided into modules with clear boundaries (bounded contexts) that talk only through defined interfaces and own their own tables. Keeps operational simplicity while preparing clean seams for future extraction.',
      scenarios: [
        'Codebase is growing messy but team and scale don’t justify many services',
        'You want clear ownership boundaries without network calls',
        'Preparing for future extraction of specific modules',
      ],
      scale: 'Boundaries must be enforced (build checks, module rules) or they erode back into a tangle.',
    },
    'Microservices': {
      eli5: 'Separate small restaurants for pizza, biryani and desserts, each with its own staff and kitchen. Each can grow or close independently, but delivering a full meal needs coordination.',
      industry: [
        'Netflix, Uber, Amazon: hundreds of services owned by independent teams.',
        'Each service owns its database (database-per-service).',
        'Kubernetes + Docker to deploy and run them.',
      ],
      def: 'Independently deployable services, each owning one business capability and its own data, communicating over APIs or events. Enables independent scaling, deployment and team ownership; costs network calls, distributed transactions, observability and operational overhead.',
      scenarios: [
        'Many teams blocked on one shared codebase and deploy',
        'Parts of the system have very different scaling or reliability needs',
        'Different capabilities need different tech or release cadence',
      ],
      scale: 'Needs service discovery, tracing, CI/CD per service, and sagas for cross-service consistency. Shared databases between services are an anti-pattern.',
    },
    'Strangler fig migration': {
      eli5: 'Renovating a house room by room while living in it. Each finished room replaces the old one, until the old house is gone.',
      industry: [
        'Routing /payments to a new service at the gateway while everything else hits the old monolith.',
        'Amazon and many banks migrated monoliths incrementally this way.',
        'Feature flags shifting a percentage of traffic to the new path.',
      ],
      def: 'Incrementally replace a legacy system by putting a routing layer (gateway/proxy) in front, moving one capability at a time to new services, and retiring old code paths when the new ones are proven. Avoids a risky big-bang rewrite.',
      scenarios: [
        'Migrating a large monolith without stopping feature work',
        'Reducing risk of a full rewrite',
        'Extracting one hot or fast-changing capability first',
      ],
      scale: 'Data migration is the hard part: plan dual reads/writes or CDC for the extracted service’s data.',
    },
  },
  scenarios: [
    (pick) => {
      const u = pick(['5K', '20K', '50K']);
      return {
        q: `A 4-person startup with ${u} users is building a food-ordering MVP. The CTO wants 12 microservices on Kubernetes “to be ready for scale”.`,
        answer: 'Monolith',
        hint: 'What does a small team at this scale actually need?',
        steps: ['Small team, small scale, changing product.', 'Microservices add network calls, deploys and distributed transactions.', 'A monolith ships faster and scales fine here.', 'Monolith (structured cleanly).'],
        followups: [
          { q: 'What signal would justify extracting a service later?', options: ['A part with very different scaling/reliability needs, or teams blocked by shared deploys', '“Microservices are modern”', 'Reaching 10 developers exactly', 'Adding a new feature'], why: 'Name the trigger; that’s what interviewers want.' },
        ],
      };
    },
    (pick) => {
      const n = pick([15, 25, 40]);
      return {
        q: `A monolith has grown to ${n} developers. Modules call each other’s internals directly and every change breaks something elsewhere, but the app runs fine on 6 servers and deploys are not the bottleneck.`,
        answer: 'Modular monolith',
        hint: 'The problem is code boundaries, not deployment or scaling.',
        steps: ['Scaling and deploys are fine.', 'The pain is tangled internal dependencies.', 'Enforce module boundaries inside one deployable.', 'Modular monolith.'],
        followups: [
          { q: 'How do modules in a modular monolith share data?', options: ['Through each module’s public interface, not by reading each other’s tables', 'Any module can query any table', 'Through shared global variables', 'By copying the database'], why: 'Owning your data is the boundary that makes later extraction possible.' },
        ],
      };
    },
    (pick) => {
      const t = pick([8, 12, 20]);
      return {
        q: `${t} teams share one codebase. A bug in the ads module took down checkout last week, and image upload needs 20x more servers than everything else, but every deploy scales the whole app.`,
        answer: 'Microservices',
        hint: 'Independent failure, scaling and teams.',
        steps: ['Failures in one area hit everything.', 'One capability needs very different scale.', 'Many teams need independent deploys.', 'Split into services (start with the clearest boundaries).'],
        followups: [
          { q: 'Two services read and write the same orders table. Problem?', options: ['Hidden coupling: schema changes break both; each service should own its data and expose APIs/events', 'No problem, it saves storage', 'It makes transactions faster', 'Only a problem in NoSQL'], why: 'Shared databases undo the independence microservices are meant to give.' },
        ],
      };
    },
    () => ({
      q: 'A bank wants to move its 15-year-old monolith to services without a risky big-bang rewrite. Payments changes most often, so it should go first while everything else keeps running.',
      answer: 'Strangler fig migration',
      hint: 'Replace piece by piece behind a router.',
      steps: ['Big-bang rewrites are high risk.', 'Route payment traffic to a new service at the gateway.', 'Retire old code paths once proven; repeat.', 'Strangler fig.'],
      followups: [
        { q: 'The payments data lives in the monolith’s database. Safest way to move it?', options: ['Sync it to the new service (CDC or dual writes with reconciliation), switch reads gradually, then cut over writes', 'Copy it once over a weekend', 'Let both systems write forever', 'Leave it shared permanently'], why: 'Data migration is the risky part; do it incrementally with verification.' },
      ],
    }),
    (pick) => {
      const what = pick(['orders and payments', 'catalogue and pricing', 'users and authentication']);
      return {
        q: `While splitting into services, the team wants a separate service for every database table. ${what[0].toUpperCase() + what.slice(1)} would become 9 services that call each other on every request.`,
        answer: 'Modular monolith',
        hint: 'Services should follow business capabilities, not tables; until those are clear, keep them together.',
        steps: ['Table-per-service creates chatty, tightly coupled services.', 'Boundaries should be bounded contexts (business capabilities).', 'Keep closely related parts in one module/service.', 'A modular structure first; extract along real capabilities.'],
        followups: [
          { q: 'What is a bounded context?', options: ['A business area with its own model and language (e.g. Billing vs Shipping), a natural service boundary', 'A database table', 'A Kubernetes namespace', 'A REST endpoint'], why: 'DDD bounded contexts are the standard answer for drawing service boundaries.' },
        ],
      };
    },
  ],
});
