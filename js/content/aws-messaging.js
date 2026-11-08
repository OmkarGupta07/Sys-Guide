SG.add({
  id: 'aws-messaging',
  ref: 'O13 O14 O21',
  section: 'Infra and cloud',
  title: 'AWS messaging: SQS, SNS, EventBridge, Kinesis',
  short: 'AWS messaging',
  blurb: 'Queues, fan-out, event routing, ordered streams and workflows: pick by who consumes and how.',
  intro: 'AWS messaging services answer different questions. SQS: “one worker should process each job, eventually.” SNS: “push this message to many subscribers right now.” EventBridge: “route events by their content to many targets, including schedules and SaaS sources.” Kinesis or MSK: “keep an ordered, replayable log for many independent readers.” Step Functions: “run these steps in order with retries and compensation.” Decide by number of consumers, need for ordering and replay, throughput, and whether you need orchestration.',
  options: {
    'SQS': {
      eli5: 'A token queue at a busy bank. Each token is served by exactly one free clerk, and if a clerk walks away mid-task, the token goes back into the queue.',
      industry: [
        'Buffering order events so a slow invoicing service can catch up after a sale spike.',
        'Background jobs (emails, PDF generation) processed by an autoscaled worker fleet.',
        'Dead-letter queues collecting poison messages for inspection.',
      ],
      def: 'Amazon SQS is a fully managed message queue. Standard queues offer nearly unlimited throughput with at-least-once delivery and best-effort ordering; FIFO queues guarantee order within a message group and deduplication, with lower throughput. A received message is hidden for the visibility timeout (default 30 s, up to 12 h) and reappears if not deleted; after maxReceiveCount failures it moves to a dead-letter queue.',
      scenarios: [
        'Decoupling a producer from a slower consumer',
        'Load-levelling traffic spikes for a worker fleet',
        'Each message must be handled by exactly one worker',
      ],
      scale: 'Messages up to 1 MiB, retained 4 days by default (max 14). FIFO: about 300 API calls per second per action without batching, far more with batching or high-throughput mode.',
    },
    'SNS': {
      eli5: 'A school announcement over the loudspeaker: one message, every classroom hears it at the same time.',
      industry: [
        'An “order placed” topic fanning out to SQS queues for inventory, email and analytics.',
        'Sending SMS, email or mobile push notifications.',
        'Subscription filter policies so each subscriber gets only relevant messages.',
      ],
      def: 'Amazon SNS is a managed pub/sub service: publishers send to a topic, and SNS pushes copies to all subscribers (SQS, Lambda, HTTP endpoints, email, SMS, mobile push). It does not store messages for later reading, so the SNS→SQS fan-out pattern gives each consumer its own durable queue. FIFO topics exist for ordered fan-out to FIFO queues.',
      scenarios: [
        'One event must reach several independent services',
        'Push notifications or SMS to users',
        'Fan-out into multiple SQS queues for durable processing',
      ],
      scale: 'Very high publish throughput; push-based with retries, so pair with SQS when subscribers may be slow or down.',
    },
    'EventBridge': {
      eli5: 'A smart post-room clerk who reads each envelope and sends it to every department that asked for that kind of letter, and also rings a bell at fixed times every day.',
      industry: [
        'Routing domain events between microservices with content-based rules.',
        'Receiving SaaS events (for example from Zendesk or Shopify partners) without writing webhooks.',
        'EventBridge Scheduler running millions of one-off or cron schedules.',
      ],
      def: 'Amazon EventBridge is a serverless event bus. Events (JSON) arrive from AWS services, your apps or SaaS partners; rules match them by content and route them to targets like Lambda, SQS, Step Functions or API destinations. It adds schema discovery, archive and replay, Pipes for point-to-point integrations, and a Scheduler for timed invocations.',
      scenarios: [
        'Many services reacting to events filtered by fields',
        'Integrating third-party SaaS events',
        'Cron jobs and delayed one-time tasks without servers',
      ],
      scale: 'Higher latency than SNS (typically tens to hundreds of ms) but much richer filtering; billed per event published.',
    },
    'Kinesis / MSK': {
      eli5: 'A CCTV recording rather than a live announcement. Everything is recorded in order, and different teams can rewind and watch the same footage at their own pace.',
      industry: [
        'Clickstream and app events read by analytics, fraud detection and S3 archival independently.',
        'IoT telemetry from delivery bikes processed in order per vehicle.',
        'MSK (managed Kafka) for teams already using Kafka APIs, Kafka Connect and Kafka Streams.',
      ],
      def: 'Kinesis Data Streams and Amazon MSK provide durable, ordered, replayable logs. Records with the same partition key go to the same shard (Kinesis) or partition (Kafka), preserving order; many consumer groups read independently and can rewind. Kinesis is AWS-native and serverless-friendly (on-demand or provisioned shards); MSK runs Apache Kafka with its ecosystem.',
      scenarios: [
        'Several consumers must each read every event',
        'Ordering per key and the ability to replay history',
        'High-volume real-time analytics pipelines',
      ],
      scale: 'Kinesis shard: about 1 MB/s or 1,000 records/s in, 2 MB/s out; retention 24 hours by default, up to 365 days.',
    },
    'Step Functions': {
      eli5: 'A wedding planner with a checklist: book the venue, then caterer, then decorator. If the caterer cancels, the planner follows the plan to cancel the venue booking too.',
      industry: [
        'Order sagas: reserve stock, charge payment, book courier, with compensations on failure.',
        'KYC or loan workflows that wait days for a human approval step.',
        'Fan-out batch processing with Map states and built-in retries.',
      ],
      def: 'AWS Step Functions is a serverless workflow orchestrator. You define a state machine (tasks, choices, parallel and map states, waits) that calls Lambda and many AWS services directly, with retries, timeouts and catch blocks. Standard workflows run up to a year with full history; Express workflows suit high-volume, short (up to 5 minutes) flows.',
      scenarios: [
        'Multi-step business processes with retries and compensation',
        'Long-running workflows with waits or human approval',
        'Replacing tangled chains of Lambdas calling each other',
      ],
      scale: 'Standard is billed per state transition, Express per request and duration; use Express for very high-volume event processing.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick(['20,000', '80,000', '150,000']);
      return {
        q: `During a Diwali sale, checkout produces ${n} invoice-generation jobs a minute, but the PDF service handles only a fraction of that. Jobs can be done a few minutes late, but none may be lost.`,
        answer: 'SQS',
        hint: 'Buffer work so one worker handles each job at its own pace.',
        steps: ['Producer is faster than consumer.', 'Each job needs one worker, eventually.', 'An SQS queue buffers jobs; workers scale on queue depth.', 'SQS.'],
        followups: [
          { q: 'A job takes 2 minutes but the visibility timeout is 30 seconds. What happens?', options: ['The message reappears and another worker processes it too: duplicate work', 'SQS deletes it', 'The worker crashes', 'Nothing'], why: 'Set the timeout above processing time and make consumers idempotent.' },
          { q: 'One malformed message keeps failing forever. Fix?', options: ['Configure a dead-letter queue with a maxReceiveCount', 'Increase retention to 14 days', 'Switch to SNS', 'Delete the queue'], why: 'DLQs isolate poison messages.' },
        ],
      };
    },
    (pick) => {
      const a = pick(['a stock-trading app', 'a wallet ledger', 'a seat-booking system']);
      return {
        q: `In ${a}, commands for the same account must be processed strictly in order and exactly once (no duplicate debits), at a few hundred messages per second.`,
        answer: 'SQS',
        hint: 'A queue type that keeps order per group and removes duplicates.',
        steps: ['Order matters per account; duplicates are harmful.', 'SQS FIFO orders by message group ID and deduplicates.', 'Use the account ID as the message group ID.', 'SQS (FIFO).'],
        followups: [
          { q: 'Why use accountId rather than one fixed message group ID?', options: ['Different groups are processed in parallel; one group serialises everything', 'It is required to be unique per message', 'It encrypts the message', 'It doesn’t matter'], why: 'Order is per group; more groups means more parallelism.' },
        ],
      };
    },
    (pick) => {
      const n = pick([3, 4, 5]);
      return {
        q: `When an order is placed, ${n} separate services (inventory, email, loyalty points, analytics…) must each get their own copy and process it independently, even if one of them is down for an hour.`,
        answer: 'SNS',
        hint: 'One message, many copies, each durable.',
        steps: ['Several independent consumers need every message.', 'SNS fans a message out to all subscribers.', 'Subscribe one SQS queue per service so downtime doesn’t lose messages.', 'SNS (with SNS→SQS fan-out).'],
        followups: [
          { q: 'Why not subscribe the services directly via HTTP to SNS?', options: ['If a service is down for long, retries eventually give up; an SQS queue stores messages until it recovers', 'SNS doesn’t support HTTP', 'HTTP is faster', 'Queues are free'], why: 'SNS pushes; SQS holds.' },
        ],
      };
    },
    (pick) => {
      const s = pick(['Shopify', 'Zendesk', 'Auth0']);
      return {
        q: `A D2C brand wants to react to events from ${s} and from its own services: route “refund.requested” events over 5,000 rupees to a fraud check, others to a Lambda, and also run a nightly 2 a.m. report job.`,
        answer: 'EventBridge',
        hint: 'Content-based routing, SaaS sources and schedules in one service.',
        steps: ['Routing depends on event fields like type and amount.', 'A SaaS partner is an event source.', 'Rules match patterns; Scheduler handles the 2 a.m. job.', 'EventBridge.'],
        followups: [
          { q: 'A bug dropped two hours of events in a consumer. What EventBridge feature helps recover?', options: ['Archive and replay events to the bus', 'Increasing Lambda memory', 'SQS visibility timeout', 'Route 53 failover'], why: 'Archives keep events for later replay.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['50,000', '200,000', '500,000']);
      return {
        q: `A ride-hailing app ingests ${n} location pings per second. Fraud detection, live ETA, and an S3 archiver must each read all pings, in order per driver, and the data team wants to replay yesterday’s data after fixing a bug.`,
        answer: 'Kinesis / MSK',
        hint: 'Many readers, ordering per key, replay.',
        steps: ['Multiple consumers each need every event.', 'Order matters per driver; replay is required.', 'A stream partitioned by driverId keeps order and retains history.', 'Kinesis / MSK.'],
        followups: [
          { q: 'SQS vs Kinesis in one line?', options: ['SQS: each message consumed once and deleted. Kinesis: ordered log that many consumers read and replay', 'Kinesis deletes after one read', 'SQS supports replay', 'They are identical'], why: 'Queue vs log is the core distinction.' },
          { q: 'When choose MSK over Kinesis?', options: ['When you need Kafka APIs and ecosystem (Connect, Streams) or are migrating existing Kafka', 'When you want fewer features', 'For one-off cron jobs', 'For SMS notifications'], why: 'MSK is managed Kafka; Kinesis is AWS-native.' },
        ],
      };
    },
    (pick) => {
      const s = pick(['reserve stock, charge the card, book a courier', 'verify KYC, run a credit check, disburse the loan', 'hold a seat, take payment, issue a ticket']);
      return {
        q: `A checkout flow must ${s}. If a later step fails, earlier steps must be undone, each step needs retries with backoff, and support wants to see exactly where each order is stuck.`,
        answer: 'Step Functions',
        hint: 'Ordered steps, retries, compensation and visibility.',
        steps: ['This is a saga across services.', 'Each step needs retries and failures need compensating actions.', 'A state machine orchestrates steps with catch blocks and visual history.', 'Step Functions.'],
        followups: [
          { q: 'Standard vs Express workflows?', options: ['Standard: long-running (up to a year), full history. Express: high-volume, short (up to 5 minutes), cheaper per run', 'Express runs for a year', 'Standard is only for Lambda', 'No difference'], why: 'Match workflow type to duration and volume.' },
          { q: 'Orchestration vs choreography for sagas?', options: ['Orchestration: a central coordinator drives steps. Choreography: services react to each other’s events', 'They are the same', 'Choreography needs Step Functions', 'Orchestration has no failure handling'], why: 'Orchestration makes complex flows easier to see and debug.' },
        ],
      };
    },
  ],
});
