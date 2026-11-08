SG.add({
  id: 'observability',
  ref: 'M1 M2 M3 M4 M5',
  section: 'Operations',
  title: 'Logs, metrics, traces and alerts',
  short: 'Observability',
  blurb: 'Knowing what your system is doing, why it broke, and getting woken up only when users are affected.',
  intro: 'Monitoring tells you something is wrong; observability helps you find why. Metrics show trends and trigger alerts, logs explain what happened inside a service, and traces follow one request across many services. Alerts should fire on user-visible symptoms tied to SLOs.',
  options: {
    'Metrics': {
      eli5: 'A car dashboard: speed, fuel, engine temperature. You glance at numbers over time and notice when something drifts.',
      industry: [
        'Prometheus scraping counters and histograms, visualised in Grafana.',
        'The RED method (Rate, Errors, Duration) per service; USE (Utilization, Saturation, Errors) per resource.',
        'Micrometer in Spring Boot exporting JVM and HTTP metrics.',
      ],
      def: 'Numeric time series (request rate, error rate, latency percentiles, CPU, queue depth) with labels. Cheap to store and query, ideal for dashboards and alerts. They tell you that something changed, not exactly why.',
      scenarios: [
        'Dashboards for latency, errors and throughput',
        'Alerting when p99 latency or error rate crosses a threshold',
        'Capacity planning from trends',
      ],
      scale: 'Watch label cardinality: a label per user ID creates millions of series and can sink Prometheus.',
    },
    'Structured logs': {
      eli5: 'A ship’s logbook: every important event written with time and details, so later you can read exactly what happened.',
      industry: [
        'JSON logs shipped to ELK/EFK (Elasticsearch, Logstash/Fluent Bit, Kibana), Loki or Splunk.',
        'Every log line carries a request/trace ID.',
        'Log levels (ERROR, WARN, INFO, DEBUG) tuned per environment.',
      ],
      def: 'Timestamped event records, ideally structured (JSON fields) and centralised so you can search across services. Best for the detailed “what happened” behind an error. Include context (user, order ID, trace ID); never log secrets or full card numbers.',
      scenarios: [
        'Debugging a specific failed request or exception',
        'Audit trails of who did what',
        'Searching across many instances after the fact',
      ],
      scale: 'Log volume costs real money; sample noisy debug logs and set retention policies.',
    },
    'Distributed tracing': {
      eli5: 'A parcel tracking page: every hub the parcel passed through, with times, so you can see exactly where it got stuck.',
      industry: [
        'OpenTelemetry instrumentation exporting to Jaeger, Zipkin, Datadog, New Relic.',
        'Trace IDs propagated in headers (W3C traceparent) across HTTP and Kafka.',
        'Finding the slow service in a checkout that touches 8 services.',
      ],
      def: 'A trace is the tree of spans for one request across services, each span with timing and metadata, linked by a propagated trace ID. Shows where latency and errors occur in a call chain. OpenTelemetry provides vendor-neutral instrumentation, so backends can be swapped by changing exporters.',
      scenarios: [
        'A request is slow and passes through many services',
        'Understanding dependencies between services',
        'Correlating logs from different services for one request',
      ],
      scale: 'Tracing every request is expensive at scale; sample (e.g. 1%, plus all errors/slow requests).',
    },
    'SLO-based alerting': {
      eli5: 'A smoke alarm should ring for smoke in the house, not every time someone lights a candle. Alert on what actually hurts people.',
      industry: [
        'Google SRE practice: alert on error-budget burn rate against SLOs.',
        'PagerDuty/Opsgenie on-call rotations with runbooks.',
        'Symptom alerts (checkout errors > 1%) instead of cause alerts (CPU 80%).',
      ],
      def: 'Define SLOs (e.g. 99.9% of checkouts succeed within 1 s) and page humans only when users are affected or the error budget is burning fast. Lower-priority signals go to tickets or dashboards. Every page should be actionable and link to a runbook.',
      scenarios: [
        'On-call engineers drowning in noisy alerts',
        'Deciding what deserves a 3 AM page',
        'Balancing reliability work against feature work (error budgets)',
      ],
      scale: 'Alert fatigue makes people ignore real incidents; prune alerts ruthlessly.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick([6, 8, 12]);
      return {
        q: `Checkout is slow for some users. One click passes through ${n} services (cart, pricing, inventory, payment, shipping…). Each team says their service looks fine on its own dashboard.`,
        answer: 'Distributed tracing',
        hint: 'You need to follow one request across all services.',
        steps: ['Per-service views can’t show the end-to-end path.', 'Propagate a trace ID; each service records spans.', 'The trace shows exactly which hop is slow.', 'Distributed tracing (OpenTelemetry + Jaeger/Datadog).'],
        followups: [
          { q: 'Why instrument with OpenTelemetry instead of a vendor’s SDK?', options: ['It’s vendor-neutral: you can switch backends by changing exporters, not code', 'It’s always faster', 'It replaces logs', 'Vendors forbid their SDKs'], why: 'Avoiding lock-in is the main benefit.' },
        ],
      };
    },
    () => ({
      q: 'You want a dashboard of requests per second, error rate and p95/p99 latency for every service, plus alerts when they degrade. Storage must stay cheap for a year of history.',
      answer: 'Metrics',
      hint: 'Numbers over time, aggregated.',
      steps: ['Trends and thresholds, not individual events.', 'Time-series metrics are compact and fast to query.', 'Prometheus + Grafana (RED metrics per service).', 'Metrics.'],
      followups: [
        { q: 'A teammate adds user_id as a label on a request counter. Problem?', options: ['High cardinality: millions of time series can overload the metrics system', 'None', 'Labels must be numbers', 'It hides errors'], why: 'Put per-user details in logs or traces, not metric labels.' },
      ],
    }),
    (pick) => {
      const what = pick(['order 98231 failed to ship', 'a refund was issued twice for one customer', 'one user can’t log in since yesterday']);
      return {
        q: `Support reports that ${what}. You need to see exactly what happened, step by step, with the error messages and IDs involved, across 40 server instances.`,
        answer: 'Structured logs',
        hint: 'Detailed records of specific events, searchable centrally.',
        steps: ['You need event-level detail for one case.', 'Centralised, structured logs are searchable by order or user ID.', 'Trace IDs link log lines across services.', 'Structured logs.'],
        followups: [
          { q: 'Which of these must never appear in logs?', options: ['Passwords, full card numbers and access tokens', 'Order IDs', 'Timestamps', 'Trace IDs'], why: 'Logs are widely accessible and retained; secrets in them are a breach.' },
        ],
      };
    },
    (pick) => {
      const n = pick([50, 120, 300]);
      return {
        q: `The on-call engineer gets ${n} alerts a week: CPU above 70%, disk above 60%, one pod restarted… Most need no action, and last week a real checkout outage was missed in the noise.`,
        answer: 'SLO-based alerting',
        hint: 'Alert on what users feel.',
        steps: ['Cause-based alerts create noise.', 'Define SLOs for user journeys (checkout success, latency).', 'Page only on SLO violation or fast error-budget burn; route the rest to tickets.', 'SLO-based alerting.'],
        followups: [
          { q: 'What should every paging alert include?', options: ['A link to a runbook with first diagnostic and mitigation steps', 'A random emoji', 'The full source code', 'Nothing, keep it short'], why: 'Actionable pages shorten incidents.' },
        ],
      };
    },
    () => ({
      q: 'Tracing every one of 200K requests per second is overloading the tracing backend and costing a fortune, but you still need to debug slow and failing requests.',
      answer: 'Distributed tracing',
      hint: 'Keep tracing, but not everything.',
      steps: ['Full tracing at this volume is too expensive.', 'Sample a small percentage of normal traffic.', 'Always keep traces for errors and slow requests (tail-based sampling).', 'Distributed tracing with sampling.'],
      followups: [
        { q: 'Monitoring vs observability?', options: ['Monitoring tells you something is wrong; observability lets you ask why from the data you collect', 'They are identical', 'Observability is only logs', 'Monitoring is only traces'], why: 'Metrics alert you; logs and traces explain.' },
      ],
    }),
    (pick) => {
      const avg = pick([120, 180, 250]);
      return {
        q: `The dashboard shows average API latency of ${avg} ms, so the team says “we’re fine”. Yet a steady stream of users complain that checkout sometimes takes several seconds.`,
        answer: 'Metrics',
        hint: 'Averages hide the slow tail. Which numbers should you track?',
        steps: ['An average blends many fast requests with a few very slow ones.', 'Track percentiles: p50, p95, p99.', 'p99 = the latency 99% of requests are at or below, so the slowest 1% shows up.', 'Metrics, measured as percentiles.'],
        followups: [
          { q: 'Which are the “four golden signals”?', options: ['Latency, traffic, errors, saturation', 'CPU, RAM, disk, network', 'Logs, metrics, traces, alerts', 'Uptime, downtime, MTTR, MTBF'], why: 'The minimum set to watch for any user-facing service.' },
          { q: 'A typical debugging flow when a page fires is…', options: ['Alert (metric spike) → trace (which service/span) → logs (exact error)', 'Logs first, always', 'Restart everything', 'Check traces only'], why: 'Each pillar answers a different question: what, where, why.' },
        ],
      };
    },
  ],
});
