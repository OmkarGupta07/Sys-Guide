SG.add({
  id: 'discovery',
  ref: 'K3 K4 H10',
  section: 'Microservices and edge',
  title: 'Service discovery, mesh, sidecar, BFF',
  short: 'Service plumbing',
  blurb: 'How services find each other, and where cross-cutting network logic and client-specific APIs live.',
  intro: 'Once there are many services with instances coming and going, something must answer “where is the payment service right now?”, enforce retries and mTLS consistently, and shape APIs for each client type.',
  options: {
    'Service discovery': {
      eli5: 'A school office register that always knows which classroom each teacher is in today, even when they move rooms.',
      industry: [
        'Kubernetes Services and DNS (payment-svc.default.svc.cluster.local).',
        'Netflix Eureka and HashiCorp Consul registries.',
        'AWS Cloud Map / ECS service discovery.',
      ],
      def: 'A registry of healthy service instances and their addresses. Instances register (or are registered by the platform) and are removed when unhealthy. Client-side discovery: the caller queries the registry and picks an instance. Server-side discovery: the caller hits a load balancer/DNS name that routes for it.',
      scenarios: [
        'Instances scale up and down and IPs keep changing',
        'Callers must avoid unhealthy instances automatically',
        'Hard-coded hostnames break on every deploy',
      ],
      scale: 'The registry must be highly available (often backed by a consensus store like etcd). Use health checks to keep it accurate.',
    },
    'Service mesh': {
      eli5: 'Every building in a campus gets the same security guard and courier desk, managed by one central office, so individual departments don’t each hire their own.',
      industry: [
        'Istio and Linkerd on Kubernetes.',
        'Uniform mTLS between all services without code changes.',
        'Traffic splitting, retries, timeouts and telemetry configured centrally.',
      ],
      def: 'An infrastructure layer that handles service-to-service networking (mTLS, retries, timeouts, circuit breaking, traffic shifting, metrics) via proxies next to every service, controlled by a central control plane. Moves networking concerns out of application code.',
      scenarios: [
        'Many services in many languages need consistent security and resilience',
        'Zero-trust mTLS between every service',
        'Canary traffic shifting and per-call telemetry without code changes',
      ],
      scale: 'Adds latency per hop and significant operational complexity; worth it at dozens+ of services, not five.',
    },
    'Sidecar': {
      eli5: 'A motorcycle sidecar: a separate seat bolted alongside, carrying extra cargo so the rider doesn’t have to.',
      industry: [
        'Envoy proxy sidecars in Istio pods.',
        'Log shippers (Fluent Bit) running next to the app container.',
        'Secrets agents (Vault agent) injecting credentials.',
      ],
      def: 'A helper process/container deployed alongside each service instance (same pod/host) that adds capabilities like proxying, logging, config or secrets, without changing the application. The building block of service meshes.',
      scenarios: [
        'Adding a capability to apps in many languages without changing each one',
        'Shipping logs or metrics from every instance',
        'Proxying traffic for mTLS or retries',
      ],
      scale: 'One extra container per instance costs CPU/memory; keep sidecars lean.',
    },
    'Backend for frontend (BFF)': {
      eli5: 'A personal shopper for each type of customer. The mobile shopper picks light, quick items; the desktop shopper fills a bigger cart. Both shop at the same stores.',
      industry: [
        'SoundCloud and Netflix popularised per-client BFFs.',
        'A mobile BFF trimming payloads and combining 5 service calls into 1.',
        'Separate BFFs for web, mobile and partner APIs.',
      ],
      def: 'A dedicated backend layer per client type that aggregates and shapes data from downstream services for that client’s needs. Keeps client-specific logic out of core services and out of a single overloaded gateway.',
      scenarios: [
        'Mobile and web need very different response shapes',
        'Clients make many calls to build one screen',
        'One gateway is filling up with client-specific special cases',
      ],
      scale: 'Each BFF is code to maintain; owned ideally by the client team. GraphQL can serve a similar role.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick([10, 30, 60]);
      return {
        q: `The order service calls payment at a hard-coded IP. With auto-scaling, payment now runs ${n} instances whose IPs change on every deploy, and calls keep hitting dead instances.`,
        answer: 'Service discovery',
        hint: 'Callers need an up-to-date list of healthy instances.',
        steps: ['Instance addresses change constantly.', 'Callers need a live registry with health checks.', 'Use Kubernetes Service DNS, Consul or Eureka.', 'Service discovery.'],
        followups: [
          { q: 'Client-side vs server-side discovery?', options: ['Client-side: caller queries the registry and load-balances itself; server-side: caller hits a stable name/LB that routes', 'They’re identical', 'Client-side needs no registry', 'Server-side requires every client to know all IPs'], why: 'Kubernetes Services are server-side; Eureka with Ribbon was client-side.' },
        ],
      };
    },
    (pick) => {
      const n = pick([40, 80, 150]);
      return {
        q: `${n} services in Java, Go and Node need mutual TLS between every pair, consistent retries and timeouts, and per-call latency metrics. Each team implements these differently today.`,
        answer: 'Service mesh',
        hint: 'Uniform network policy across many services and languages.',
        steps: ['Cross-cutting networking needs.', 'Implementing in every language is inconsistent.', 'Move it into proxies managed by a control plane.', 'Service mesh (Istio/Linkerd).'],
        followups: [
          { q: 'You have only 5 services, all in Java. Is a mesh worth it?', options: ['Probably not: a shared library (Resilience4j) and TLS at the LB are simpler', 'Yes, always', 'Yes, it removes all latency', 'Only for databases'], why: 'Meshes pay off at many services and languages.' },
        ],
      };
    },
    () => ({
      q: 'Every pod must ship its logs to a central system and receive database credentials from Vault, but the app teams don’t want to add any code for this.',
      answer: 'Sidecar',
      hint: 'A helper container next to each app.',
      steps: ['Same capability needed by every instance.', 'No app code changes allowed.', 'Run a helper container in the same pod.', 'Sidecar.'],
      followups: [
        { q: 'How does a service mesh relate to sidecars?', options: ['Most meshes inject a proxy sidecar (e.g. Envoy) into every pod, managed by a control plane', 'Meshes replace sidecars with databases', 'They’re unrelated', 'Sidecars are only for logging'], why: 'The mesh data plane is usually a fleet of sidecar proxies.' },
      ],
    }),
    (pick) => {
      const n = pick([5, 6, 7]);
      return {
        q: `The mobile home screen calls ${n} services and downloads large payloads designed for the desktop site. On 3G it takes 8 seconds. The desktop site is happy with the current APIs.`,
        answer: 'Backend for frontend (BFF)',
        hint: 'A layer shaped for one client type.',
        steps: ['Mobile needs fewer calls and smaller payloads.', 'Desktop shouldn’t be forced to change.', 'A mobile BFF aggregates and trims responses.', 'Backend for frontend.'],
        followups: [
          { q: 'How is a BFF different from a single API gateway?', options: ['A BFF is tailored to one client and contains its aggregation logic; a gateway handles cross-cutting concerns for all', 'They’re identical', 'A BFF only handles auth', 'A gateway is per client'], why: 'Often both exist: gateway at the edge, BFFs behind it.' },
        ],
      };
    },
    (pick) => {
      const p = pick(['canary 5% of traffic to v2 of the pricing service', 'shift traffic gradually from the old to the new search service']);
      return {
        q: `You want to ${p} and roll back instantly, across many services, without changing application code or DNS.`,
        answer: 'Service mesh',
        hint: 'Traffic rules managed centrally between services.',
        steps: ['Fine-grained traffic shifting between service versions.', 'No app or DNS changes.', 'Mesh routing rules (e.g. Istio VirtualService weights).', 'Service mesh.'],
        followups: [
          { q: 'What is a cost of every request going through sidecar proxies?', options: ['Extra latency per hop and more CPU/memory per pod', 'No cost', 'Data loss', 'Disabled encryption'], why: 'Meshes trade some latency and resources for uniform control.' },
        ],
      };
    },
  ],
});
