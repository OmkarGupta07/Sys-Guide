SG.add({
  id: 'case-metrics',
  ref: 'S21',
  section: 'HLD case studies',
  title: 'Design a metrics and logging system',
  short: 'Metrics + logs',
  blurb: 'Swallow millions of data points a second, keep years of history cheaply, search logs, and page the right person.',
  intro: 'Scope: agents on every server and container ship metrics (CPU, latency, error counts) and logs; engineers query dashboards and search logs; alert rules page the on-call when something breaks. The NFRs: a huge, bursty write rate (100K hosts × dozens of metrics every 10 s), writes far outnumbering reads, cheap long retention, dashboard queries in about a second, ingest that never stalls the services it watches, and an alerting path more reliable than anything it monitors. Freshness of a few seconds is fine, so favour availability over consistency. The usual design: agents push into a Kafka buffer; metrics land in a time-series database that compresses, partitions by time, and rolls up old data into coarser tiers; label cardinality is capped; logs go to a separate pipeline (full-text index like ELK, or label index + object storage like Loki); and a rule evaluator feeds a deduplicating, routing alert manager.',
  options: {
    'Agents + Kafka ingest buffer': {
      eli5: 'Every shop in the market drops its daily sales slip in a big post box instead of queuing at the accountant’s desk. The accountant empties the box at his own speed, and nothing is lost if he takes a tea break.',
      industry: [
        'Telegraf, Fluent Bit, Vector or the OpenTelemetry Collector on each host, batching and compressing before sending.',
        'Kafka topics partitioned by metric or tenant between collectors and storage, as Uber, LinkedIn and others do.',
        'Agents buffering locally on disk and adding random jitter so 100K hosts don’t all send at second :00.',
      ],
      def: 'Lightweight agents collect metrics and logs on each machine, batch them and ship them to collectors, which write to a durable log (Kafka). Storage consumers read from Kafka at their own pace, so bursts, slow storage, upgrades or a storage outage don’t lose data or back-pressure the applications; the log can also feed several consumers (TSDB, log index, stream alerting, archive). Agents must be cheap (a few % CPU), drop or sample under pressure rather than harm the host, and jitter their send times. Prometheus-style pull scraping is the main alternative for metrics within a cluster.',
      scenarios: [
        'All hosts report at the same second, spiking writes 10×',
        'Storage maintenance must not lose 20 minutes of data',
        'Several systems need the same telemetry stream',
      ],
      scale: '100K hosts × 50 metrics / 10 s = 500K points/s; with alignment bursts can be 10× that. Kafka handles millions of small messages/s with batching; retain a few hours to days for replay.',
    },
    'Time-series DB with rollups and retention tiers': {
      eli5: 'A milkman writes “same as yesterday” instead of the full order each day, so his diary stays thin. At year end he keeps only monthly totals and throws away the daily pages.',
      industry: [
        'Prometheus TSDB, VictoriaMetrics, M3, InfluxDB and TimescaleDB storing append-only, time-partitioned blocks.',
        'Facebook’s Gorilla compression: delta-of-delta timestamps and XOR-encoded values, averaging about 1.4 bytes per point.',
        'Retention tiers like raw 10 s for 15 days, 1-minute rollups for 90 days, 1-hour rollups for 2 years, old blocks in S3.',
      ],
      def: 'A time-series DB stores each series (metric name + labels) as an append-only, time-ordered stream: writes go to a WAL and an in-memory buffer, then flush as compressed, immutable blocks partitioned by time (LSM-style). Delta-of-delta encoding makes regular timestamps nearly free and XOR encoding shrinks slowly changing values, cutting 16 bytes per point to one or two. Queries pick only blocks overlapping the time range and use a label index to read only matching series. Background jobs downsample old data into min/max/avg/count rollups and delete raw points, so a one-year dashboard reads hours, not billions of points.',
      scenarios: [
        'A relational metrics table needs minutes to chart the last 8 hours',
        'Storage cost grows linearly forever at 10 s resolution',
        'Year-long dashboards must load in about a second',
      ],
      scale: '500K points/s ≈ 43B points/day: ~700 GB/day raw at 16 bytes, ~60 GB/day compressed; rollups make older data 6–360× smaller.',
    },
    'Cardinality limits on labels': {
      eli5: 'A school register has one column per class section. If someone asks for a column per student per day, the register would need millions of columns and nobody could carry it.',
      industry: [
        'Prometheus and Grafana Mimir per-tenant limits on active series and labels per metric.',
        'Rejecting or dropping labels like user_id, request_id or full URL paths at the collector (relabelling).',
        'Sending per-request detail to logs or traces instead, where high-cardinality fields belong.',
      ],
      def: 'Each unique combination of metric name and label values is a separate series with its own in-memory buffer and index entry, so cost scales with the number of series, not points. Labels with unbounded values (user IDs, request IDs, raw URLs, pod IDs that churn) explode series counts and can run ingesters out of memory and make queries slow. Enforce limits per tenant and per metric, normalise values (route templates instead of raw paths), drop offending labels at the collector, and alert teams when their series count jumps. High-cardinality questions go to logs, traces or an analytics store.',
      scenarios: [
        'A deploy adds a user_id label and ingesters run out of memory',
        'One team’s metrics must not take down the shared cluster',
        'Product wants per-user charts from the metrics system',
      ],
      scale: 'A single Prometheus handles a few million active series; one label with 1M values multiplied by 50 endpoints and 5 status codes is 250M series, far beyond that.',
    },
    'Log pipeline: full-text vs label index': {
      eli5: 'One library indexes every word of every book: any search is instant, but the index costs as much as the books. Another only labels shelves by author and year, and you skim the right shelf yourself; it is far cheaper.',
      industry: [
        'ELK/OpenSearch: Logstash or Beats into Elasticsearch, inverted index over every field, hot-warm-cold tiers.',
        'Grafana Loki: indexes only labels (service, env, pod) and stores compressed log chunks in S3, then greps at query time.',
        'Structured JSON logs with a trace_id field to jump between logs, traces and metrics.',
      ],
      def: 'Logs are bigger and messier than metrics, so they get their own pipeline from the same agents and Kafka. A full-text index (Elasticsearch) makes arbitrary searches fast but costs a lot of CPU, RAM and disk, often more than the raw logs; a label-only index (Loki) is many times cheaper because chunks sit compressed in object storage, but queries must first narrow by labels and time, then scan. Choose by query pattern: security and support teams searching any field favour full text; engineers filtering “service X errors in the last hour” favour labels. Either way, use retention tiers and sample noisy debug logs.',
      scenarios: [
        '20 TB/day of logs and the Elasticsearch bill is out of control',
        'Security needs fast searches on arbitrary fields',
        'Engineers mostly filter by service and time, then grep',
      ],
      scale: 'Full-text indexes often take 1–1.5× the raw size; label-indexed chunks in S3 compress raw logs 5–10× and cost cents per GB-month.',
    },
    'Alert evaluator with dedup and routing': {
      eli5: 'A building’s fire panel checks every sensor each minute, ignores a single puff of smoke, and when a whole floor goes off it rings the fire brigade once, not fifty times.',
      industry: [
        'Prometheus rules evaluated every 15–60 s, with “for: 5m” to ignore brief spikes, feeding Alertmanager.',
        'Alertmanager grouping, deduplication, inhibition (suppress “API errors” when “DB down” fires) and routing to PagerDuty or Slack.',
        'A dead man’s switch alert that always fires, so silence itself pages someone.',
      ],
      def: 'Alert rules (thresholds, rates, SLO burn rates) are evaluated on a schedule against recent data, or on the Kafka stream when seconds matter. A condition must hold for a duration before firing to avoid flapping. Firing alerts go to a manager that deduplicates repeats, groups related alerts into one notification, suppresses symptoms of a known root cause, and routes by team and severity with escalation. The alerting path must be more available than what it watches: run it replicated, keep it independent of the main query cluster where possible, and monitor the monitor.',
      scenarios: [
        'A database outage produces 600 pages in five minutes',
        'Alerts flap on and off during brief spikes',
        'Alerting silently stopped when the metrics cluster was overloaded',
      ],
      scale: 'Thousands of rules every 30 s is modest query load; recording rules precompute expensive expressions so evaluation stays cheap.',
    },
  },
  scenarios: [
    (pick) => {
      const hosts = pick(['100,000', '60,000', '200,000']);
      const m = pick(['50', '20', '80']);
      return {
        q: `Interviewer: “Design Datadog-style monitoring.” ${hosts} hosts each report ${m} metrics every 10 s. You list NFRs: absorb bursts (all hosts often report at :00), never lose data during storage upgrades, never slow down the monitored apps, and dashboards may lag a few seconds. Which decision is driven most directly by these ingest NFRs?`,
        answer: 'Agents + Kafka ingest buffer',
        hint: 'Put something durable and elastic between the producers and the database.',
        steps: [
          `${hosts} × ${m} ÷ 10 s is a steady write rate in the hundreds of thousands per second, with aligned bursts several times higher.`,
          'Writing straight into storage means bursts or upgrades either drop data or push back on apps.',
          'Agents batch, jitter and buffer locally; collectors write to Kafka, which absorbs bursts durably.',
          'Storage consumers read at their own pace and can replay after an outage.',
        ],
        followups: [
          { q: 'Availability or consistency for the metrics read path?', options: ['Availability: dashboards a few seconds stale are fine, but the system must keep accepting and serving data', 'Strong consistency: every point must be visible instantly', 'Neither matters', 'Consistency, because metrics are financial data'], why: 'Monitoring values freshness-within-seconds and uptime over exactness.' },
          { q: 'Why add random jitter to agents’ send times?', options: ['It spreads writes across the interval so peak load is close to the average', 'It improves accuracy', 'It encrypts traffic', 'Kafka requires it'], why: 'Aligned reporting turns a 10 s average into a one-second spike.' },
        ],
      };
    },
    (pick) => {
      const rows = pick(['40 billion', '25 billion', '90 billion']);
      const h = pick(['8 hours', '24 hours', '6 hours']);
      return {
        q: `Metrics live in a MySQL table (timestamp, host, metric, value) with ${rows} rows. A Grafana panel showing average CPU for prod web servers over the last ${h} takes 4 minutes, inserts are falling behind at peak, and the table grows by about 1 TB a week.`,
        answer: 'Time-series DB with rollups and retention tiers',
        hint: 'Store each series as a compressed, time-ordered stream, and only read the blocks you need.',
        steps: [
          'A row per point wastes bytes on repeated strings and needs random index updates on every insert.',
          'A TSDB appends to a WAL and memory buffer, then flushes compressed, time-partitioned blocks.',
          `Queries skip blocks outside the ${h} window and read only series matching the labels.`,
          'Delta-of-delta and XOR compression cut storage roughly 10×.',
        ],
        followups: [
          { q: 'Why does delta-of-delta encoding work so well on timestamps?', options: ['Points arrive at a regular interval, so second differences are mostly zero and take about one bit', 'Timestamps are random', 'It encrypts them', 'It sorts them'], why: 'Regularity makes the encoding nearly free.' },
        ],
      };
    },
    (pick) => {
      const yrs = pick(['2 years', '13 months', '3 years']);
      return {
        q: `Capacity planners want CPU trends for ${yrs}. The TSDB keeps every 10-second point forever, so a ${yrs} chart reads billions of points and times out, and disk cost doubles every few months. Nobody needs 10-second detail older than two weeks.`,
        answer: 'Time-series DB with rollups and retention tiers',
        hint: 'Keep detail only while it is useful, and summaries after that.',
        steps: [
          'Keep raw 10 s data for ~15 days on fast disks.',
          'Background jobs roll up into 1-minute and 1-hour aggregates (min, max, avg, count) and delete raw points.',
          'Move older blocks to object storage; the query layer picks the coarsest tier that fits the time range.',
          `A ${yrs} chart now reads thousands of hourly points per series, not billions.`,
        ],
        followups: [
          { q: 'Why store min and max in rollups, not only the average?', options: ['Averages hide spikes; max shows the 100% CPU burst an average smooths away', 'It is required by SQL', 'It saves space', 'Min and max are never used'], why: 'Keep enough summary statistics to answer the questions people ask.' },
          { q: 'Can you compute an accurate p99 latency from hourly averages?', options: ['No: percentiles need histograms or sketches kept in the rollup', 'Yes, average the averages', 'Yes, take the max', 'Only for small hosts'], why: 'Percentiles don’t compose from averages; store histogram buckets.' },
        ],
      };
    },
    (pick) => {
      const before = pick(['3 million', '2 million', '5 million']);
      const after = pick(['180 million', '400 million', '90 million']);
      return {
        q: `A team adds a user_id label to their http_requests_total metric “to debug a customer”. Active series jump from ${before} to ${after} within an hour, ingesters run out of memory and restart in a loop, and every team’s dashboards go blank.`,
        answer: 'Cardinality limits on labels',
        hint: 'Count series, not points.',
        steps: [
          'Each unique label combination is a separate series with memory and index cost.',
          'An unbounded label like user_id multiplies series by the number of users.',
          'Enforce per-tenant series limits and drop or reject unbounded labels at the collector.',
          'Per-user debugging belongs in logs or traces, keyed by user_id there.',
        ],
        followups: [
          { q: 'Which label is safe to keep on a request metric?', options: ['The route template like /orders/{id}, not the raw path', 'The raw URL with IDs', 'The request ID', 'The user’s email'], why: 'Bounded values keep series counts predictable.' },
        ],
      };
    },
    (pick) => {
      const tb = pick(['20 TB', '35 TB', '12 TB']);
      return {
        q: `The company ingests ${tb} of application logs a day into Elasticsearch, indexing every field. The cluster costs more than the production services it supports. Query logs show 95% of searches are “errors from service X in the last hour, then grep for a word”.`,
        answer: 'Log pipeline: full-text vs label index',
        hint: 'Match how much you index to how people actually search.',
        steps: [
          'Full-text indexing every field can cost as much as the raw logs again in storage and RAM.',
          'Most queries filter by service and time first, then scan text.',
          'Index only labels (service, env, level) and keep compressed chunks in object storage, Loki-style.',
          'Keep a smaller full-text index, if needed, for audit or security logs with arbitrary searches.',
        ],
        followups: [
          { q: 'When would you keep Elasticsearch-style full-text indexing despite the cost?', options: ['When users run fast searches on arbitrary fields across large time ranges, like security investigations', 'Never', 'For debug logs only', 'When logs are tiny'], why: 'Pay for full text where the query pattern needs it.' },
        ],
      };
    },
    (pick) => {
      const pages = pick(['600', '350', '900']);
      return {
        q: `When the primary database failed over last night, on-call received ${pages} pages in five minutes: every API, worker and cron fired its own alert. A week earlier, a CPU alert flapped on and off 40 times during brief spikes. And during an overload of the metrics cluster, no alerts fired at all.`,
        answer: 'Alert evaluator with dedup and routing',
        hint: 'Fire on sustained conditions, group and suppress, and watch the watcher.',
        steps: [
          'Require conditions to hold for a duration (for example 5 minutes) to stop flapping.',
          'Send alerts through a manager that dedups, groups by cause and inhibits symptoms when “DB down” fires.',
          'Route by team and severity with escalation.',
          'Run alerting replicated and independent of the main query path, plus a dead man’s switch that pages when alerts stop arriving.',
        ],
        followups: [
          { q: 'Why alert on SLO burn rate rather than raw CPU?', options: ['It pages on user-visible impact and how fast the error budget is burning, not on harmless resource spikes', 'CPU can’t be measured', 'Burn rates are cheaper to store', 'Regulators require it'], why: 'Alert on symptoms users feel; investigate causes with dashboards.' },
        ],
      };
    },
  ],
});
