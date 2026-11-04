SG.add({
  id: 'resilience',
  ref: 'K7 K8 K9 K10',
  section: 'Microservices and edge',
  title: 'Circuit breakers, retries, timeouts, bulkheads',
  short: 'Resilience patterns',
  blurb: 'Stopping one slow dependency from taking your whole system down.',
  intro: 'In a system of many services, something is always slow or failing. Resilience patterns contain the damage: give up quickly (timeouts), try again carefully (retries with backoff and jitter), stop calling a broken service (circuit breaker), and isolate resources so one failure can’t starve everything (bulkheads). Degrade gracefully instead of failing completely.',
  options: {
    'Timeout': {
      eli5: 'If a shopkeeper doesn’t answer within a minute, you leave and try elsewhere, rather than standing at the counter all day.',
      industry: [
        'HTTP client connect/read timeouts in RestTemplate, WebClient, OkHttp.',
        'Database query timeouts and connection-pool acquire timeouts.',
        'Every call in a Netflix-style service mesh has a deadline.',
      ],
      def: 'An upper bound on how long to wait for a call. Without it, slow dependencies hold threads and connections indefinitely, exhausting pools and spreading the failure upstream.',
      scenarios: [
        'Threads pile up waiting on a slow dependency',
        'Default “infinite” timeouts in HTTP clients or DB drivers',
        'Request latency budgets across several calls',
      ],
      scale: 'Set timeouts from the caller’s latency budget (e.g. p99 of the dependency plus margin), shorter downstream than upstream.',
    },
    'Retry with backoff': {
      eli5: 'If a call doesn’t go through, you don’t redial 100 times in a second. You wait a bit, then longer, and add a random pause so everyone isn’t redialling at the same moment.',
      industry: [
        'AWS SDKs retry throttled calls with exponential backoff and jitter.',
        'Spring Retry / Resilience4j Retry around flaky HTTP calls.',
        'Kafka producers retrying sends to brokers.',
      ],
      def: 'Retry transient failures (timeouts, 503, throttling) a limited number of times with exponentially growing delays plus random jitter. Only retry idempotent operations (or use idempotency keys). Don’t retry permanent errors (400, 401).',
      scenarios: [
        'Occasional transient network errors or throttling',
        'Brief failovers in a dependency',
        'Idempotent reads and writes',
      ],
      scale: 'Unlimited or synchronized retries create retry storms that keep a struggling service down. Cap attempts; add jitter.',
    },
    'Circuit breaker': {
      eli5: 'A fuse in your house. When something shorts, the fuse trips and cuts power to that circuit, protecting everything else, and you test it again later.',
      industry: [
        'Resilience4j (successor to Netflix Hystrix) in Spring Boot.',
        'Envoy/Istio outlier detection ejecting unhealthy hosts.',
        'Payment gateways falling back to another provider when one is failing.',
      ],
      def: 'Track failures to a dependency; when the error rate crosses a threshold, open the circuit and fail fast (or use a fallback) without calling it. After a cool-down, allow a few trial calls (half-open); close the circuit if they succeed.',
      scenarios: [
        'A dependency is down or very slow for minutes',
        'Avoid wasting threads and adding load on a failing service',
        'Serving a fallback (cached data, default) instead of erroring',
      ],
      scale: 'Tune thresholds and windows per dependency; expose circuit state in metrics and alerts.',
    },
    'Bulkhead': {
      eli5: 'Ships are split into watertight compartments. If one floods, the others stay dry and the ship floats.',
      industry: [
        'Separate thread pools or connection pools per downstream dependency.',
        'Kubernetes resource limits per service.',
        'Separate queues for premium vs free users so one can’t starve the other.',
      ],
      def: 'Isolate resources (threads, connections, instances, queues) per dependency or workload so a failure or overload in one area can’t consume everything. Often combined with load shedding (reject low-priority work under stress) and graceful degradation.',
      scenarios: [
        'One slow dependency exhausts the shared thread pool',
        'Critical and non-critical work share the same resources',
        'Noisy tenants affecting others',
      ],
      scale: 'More pools = more tuning. Size each from its own traffic and latency.',
    },
  },
  scenarios: [
    (pick) => {
      const s = pick(['recommendation', 'reviews', 'shipping-estimate']);
      return {
        q: `The product page calls a ${s} service with the HTTP client’s default settings. That service started hanging for minutes, and now all 200 Tomcat threads are stuck waiting, so even the home page is down.`,
        answer: 'Timeout',
        hint: 'The calls never give up.',
        steps: ['Calls wait indefinitely.', 'Threads are exhausted, so unrelated pages fail too.', 'Bound every call with a short timeout.', 'Timeout first (then circuit breaker and bulkhead).'],
        followups: [
          { q: 'The product page should still load without that section. What’s this called?', options: ['Graceful degradation: render the page without that section or with a cached fallback', 'Failover', 'Sharding', 'Rate limiting'], why: 'Non-critical features should fail softly.' },
        ],
      };
    },
    (pick) => {
      const pct = pick([1, 2, 3]);
      return {
        q: `About ${pct}% of calls to a payment-status API fail with 503 for a second or two during the provider’s deploys, then succeed. The call is a read.`,
        answer: 'Retry with backoff',
        hint: 'Transient and idempotent.',
        steps: ['Failures are brief and transient.', 'The call is a safe, idempotent read.', 'Retry a few times with exponential backoff and jitter.', 'Retry with backoff.'],
        followups: [
          { q: 'Why add random jitter to the backoff?', options: ['So thousands of clients don’t retry in synchronized waves (thundering herd)', 'To make retries slower for no reason', 'Jitter is only for UDP', 'To reduce log size'], why: 'Synchronized retries can keep a recovering service down.' },
          { q: 'Which response should NOT be retried?', options: ['400 Bad Request', '503 Service Unavailable', '429 Too Many Requests (after Retry-After)', 'A connection timeout on a GET'], why: 'Client errors won’t succeed by repeating.' },
        ],
      };
    },
    (pick) => {
      const m = pick([5, 10, 20]);
      return {
        q: `A third-party SMS provider has been completely down for ${m} minutes. Every request still tries it, waits for the timeout, and adds load to your system and theirs.`,
        answer: 'Circuit breaker',
        hint: 'Stop calling something you know is broken.',
        steps: ['The dependency is clearly down.', 'Calling it wastes time and threads.', 'Open the circuit: fail fast or use a fallback; probe later.', 'Circuit breaker.'],
        followups: [
          { q: 'What happens in the half-open state?', options: ['A few trial calls are allowed; success closes the circuit, failure reopens it', 'All traffic flows normally', 'The service is deleted', 'Calls queue forever'], why: 'Half-open is how the breaker detects recovery safely.' },
          { q: 'Good fallback for OTP SMS when the provider’s circuit is open?', options: ['Route to a secondary SMS provider (or offer voice/WhatsApp OTP)', 'Pretend the SMS was sent', 'Retry forever', 'Disable login'], why: 'Fallbacks should keep the user’s goal achievable.' },
        ],
      };
    },
    (pick) => {
      const s = pick(['a slow PDF-generation service', 'a struggling analytics API', 'a flaky image-processing service']);
      return {
        q: `All outgoing calls share one 100-thread pool. When ${s} slows down, it occupies every thread, and calls to the healthy payment service start failing too.`,
        answer: 'Bulkhead',
        hint: 'One dependency is consuming a shared resource.',
        steps: ['A shared pool lets one bad dependency starve others.', 'Give each dependency its own bounded pool.', 'Payment keeps its threads even when PDFs are slow.', 'Bulkhead.'],
        followups: [
          { q: 'Under extreme load, which requests should be rejected first?', options: ['Low-priority ones (analytics, recommendations) via load shedding, protecting checkout', 'Checkout requests', 'Random requests', 'Requests from premium users'], why: 'Shed the least valuable work first.' },
        ],
      };
    },
    () => ({
      q: 'An order service retries failed calls to inventory 5 times immediately with no delay. Inventory had a short blip, but the retries multiplied traffic 5x and it couldn’t recover for 20 minutes.',
      answer: 'Retry with backoff',
      hint: 'The retries themselves caused the outage.',
      steps: ['Immediate retries amplify load on a struggling service.', 'Space retries out exponentially with jitter.', 'Cap attempts and combine with a circuit breaker.', 'Retry with backoff (done properly).'],
      followups: [
        { q: 'Which combination is the standard resilience stack for a remote call?', options: ['Timeout + limited retries with backoff/jitter + circuit breaker (+ bulkhead)', 'Infinite retries', 'No timeout, just a circuit breaker', 'Only logging'], why: 'Each pattern covers a different failure mode.' },
      ],
    }),
    () => ({
      q: 'A nightly database snapshot halves the database’s speed. Service B’s queries start timing out and B retries them. Service A, calling B, also times out and retries. Soon both services are down, and restarting B doesn’t help because A floods it immediately.',
      answer: 'Circuit breaker',
      hint: 'Something must stop the callers from hammering a struggling dependency.',
      steps: ['A slow dependency plus retries snowballs: a cascading failure.', 'Restarts don’t help while callers keep flooding.', 'A circuit breaker in A trips when B fails, failing fast and giving B (and the DB) room to recover; it resets automatically.', 'Circuit breaker (with alerts when it trips).'],
      followups: [
        { q: 'What’s wrong with setting a 3-second timeout on a call that normally takes 4 seconds?', options: ['Every call times out and retries add load: timeouts must exceed normal latency', 'Nothing', 'It makes calls faster', 'Timeouts don’t affect retries'], why: 'Timeouts are tuned from real latency, not guessed.' },
      ],
    }),
  ],
});
