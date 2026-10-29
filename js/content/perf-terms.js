SG.add({
  id: 'perf-terms',
  ref: 'B10 B11 M6 A2',
  section: 'Foundations',
  title: 'Latency, throughput and availability',
  short: 'Non-functional requirements',
  blurb: 'The four words every HLD interview starts with: how fast, how much, how often up, how safe.',
  intro: 'Functional requirements say what the system does. Non-functional requirements say how well: latency, throughput, availability and durability. Name them with numbers in the first five minutes of any design interview.',
  options: {
    'Latency': {
      eli5: 'How long one pizza takes to reach your door after you order it.',
      industry: [
        'Amazon found that every extra 100 ms of page latency cost measurable sales.',
        'Search and typeahead target under 100–200 ms per keystroke.',
        'Teams track p50, p95 and p99 latency, not just averages.',
      ],
      def: 'Time for one request to complete, end to end. Measured in percentiles: p99 = 99% of requests are faster than this. Reference points: RAM ~100 ns, SSD read ~100 µs, same-region network ~0.5 ms, India to US ~200 ms round trip.',
      scenarios: [
        'Individual requests feel slow even when the system isn’t busy',
        'Real-time features with tight budgets (typing, games, trading)',
        'Global users far from your servers',
      ],
      scale: 'Fixed by doing less per request: caching, fewer round trips, data closer to users (CDN, regions), better indexes.',
    },
    'Throughput': {
      eli5: 'How many pizzas the shop can deliver per hour. One pizza can be fast while the shop still can’t handle a Friday night rush.',
      industry: [
        'Payment systems plan for peak transactions per second during sales (Big Billion Days).',
        'Kafka clusters are sized in messages or MB per second.',
        'Load tests measure requests per second before a launch.',
      ],
      def: 'Work completed per unit time (requests/s, messages/s, MB/s). Limited by the slowest shared resource. Independent of latency: you can have low latency but low throughput, or the reverse.',
      scenarios: [
        'The system falls over during peaks even though single requests are fast',
        'Batch jobs must process N records within a window',
        'Sizing servers, queues and databases for peak load',
      ],
      scale: 'Raised by parallelism: more servers, partitions, workers, batching. Find the bottleneck first (CPU, DB, network).',
    },
    'Availability': {
      eli5: 'How often the shop is open when you want pizza. “Open 99.9% of the time” still means closed about 9 hours a year.',
      industry: [
        'Cloud services publish SLAs like 99.95% or 99.99%, with credits if missed.',
        'Payment and UPI systems aim for four nines or better.',
        'Teams set SLOs (internal targets) and track SLIs (measured success rate).',
      ],
      def: 'The fraction of time the system serves requests successfully. 99.9% ≈ 8.8 hours down/year, 99.99% ≈ 53 minutes, 99.999% ≈ 5 minutes. SLA = promise to customers, SLO = internal target, SLI = the measurement.',
      scenarios: [
        'The business promises an uptime number',
        'Deploys, patches or single machines cause outages',
        'Deciding how much redundancy to pay for',
      ],
      scale: 'Raised by removing single points of failure: redundancy, health checks, failover, multi-AZ. Each extra nine costs roughly 10x more effort.',
    },
    'Durability': {
      eli5: 'If you hand the shop your birthday cake order, they never lose it, even if the shop catches fire. Open or closed is a different question.',
      industry: [
        'Amazon S3 is designed for 99.999999999% (11 nines) durability by storing copies across facilities.',
        'Databases write to a write-ahead log and replicas before acknowledging commits.',
        'Kafka keeps replicated copies of each partition.',
      ],
      def: 'The guarantee that acknowledged data is not lost, even through crashes or disasters. Achieved with replication, write-ahead logs, backups. Different from availability: data can be safe while the service is down.',
      scenarios: [
        'Losing even one record is unacceptable (payments, photos, medical data)',
        'Surviving disk, machine or data-centre loss',
        'Deciding what “saved” really means before replying “OK”',
      ],
      scale: 'Costs extra copies and write latency (waiting for replicas). Trade it per data type: payments need it, view counters may not.',
    },
  },
  scenarios: [
    (pick) => {
      const ms = pick([1500, 2000, 3000]);
      return {
        q: `Search results take ${ms} ms to appear, even at 3 AM when the servers are nearly idle. Users say the app “feels slow”.`,
        answer: 'Latency',
        hint: 'The system isn’t busy, yet each request is slow.',
        steps: ['Idle servers rule out a capacity problem.', 'Each single request takes too long.', `This is a latency problem (${ms} ms per request).`, 'Look at per-request work: queries, round trips, distance.'],
        followups: [
          { q: 'Average latency is 120 ms but users still complain. What do you check?', options: ['p95/p99: a slow tail can hurt many users even with a good average', 'The median only', 'CPU temperature', 'Nothing, 120 ms is fine'], why: 'Averages hide tails. A page making 10 calls hits the p99 often.' },
        ],
      };
    },
    (pick) => {
      const peak = pick(['5,000', '10,000', '20,000']);
      return {
        q: `Each payment takes only 50 ms, but the system tops out at 400 payments/s. The upcoming sale needs ${peak} payments/s.`,
        answer: 'Throughput',
        hint: 'Single requests are fast. What’s the limit?',
        steps: ['50 ms per payment is fine: latency is not the issue.', `Capacity is 400/s vs a need of ${peak}/s.`, 'This is a throughput problem.', 'Find the bottleneck and add parallelism.'],
        followups: [
          { q: 'What’s the first step before adding servers?', options: ['Load test and profile to find the actual bottleneck (DB, locks, CPU, external API)', 'Double every component', 'Increase timeouts', 'Rewrite in Go'], why: 'Scaling the wrong component wastes money and changes nothing.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['99.9%', '99.99%']);
      const mins = n === '99.9%' ? 'about 8.8 hours' : 'about 53 minutes';
      return {
        q: `The contract promises ${n} uptime per year. The current setup has one app server and one database, and monthly patching takes each down for 30 minutes.`,
        answer: 'Availability',
        hint: 'What does the number in the contract measure?',
        steps: [`${n} allows ${mins} of downtime a year.`, 'Planned patching alone uses 12 hours a year.', 'Single machines are single points of failure.', 'This is an availability requirement: add redundancy and failover.'],
        followups: [
          { q: 'SLA vs SLO vs SLI: which is the internal target?', options: ['SLO', 'SLA', 'SLI', 'All the same'], why: 'SLA = promise to customers, SLO = internal goal (stricter), SLI = the actual measurement.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['user photos', 'medical reports', 'signed contracts']);
      return {
        q: `Users upload ${what}. A few minutes of downtime is tolerable, but losing a single uploaded file would be a disaster, even if a whole data centre burns down.`,
        answer: 'Durability',
        hint: '“Down for a while” is fine. What isn’t?',
        steps: ['Downtime is acceptable: availability is secondary.', 'Losing data is unacceptable.', 'Store copies across machines and locations before acknowledging.', 'This is durability.'],
        followups: [
          { q: 'Can a system be durable but not available?', options: ['Yes: data is safely stored but the service can be down', 'No, they’re the same thing', 'Only on weekends', 'Only with SQL'], why: 'Interviewers like this distinction: safe data vs reachable service.' },
        ],
      };
    },
    (pick) => {
      const ms = pick([100, 150, 200]);
      return {
        q: `Product says: “When a user sends a chat message, the other person must see it within ${ms} ms, for 99% of messages.”`,
        answer: 'Latency',
        hint: 'A time limit on each individual message.',
        steps: ['It’s a per-message time budget.', `Stated as p99 < ${ms} ms.`, 'This is a latency requirement.'],
        followups: [
          { q: 'Roughly how long is a network round trip from India to the US?', options: ['~200 ms', '~2 ms', '~2 seconds', '~20 µs'], why: 'Distance sets a floor on latency, which is why global apps put servers near users.' },
        ],
      };
    },
  ],
});
