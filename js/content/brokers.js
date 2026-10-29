SG.add({
  id: 'brokers',
  ref: 'I5',
  section: 'Async and messaging',
  title: 'Kafka, RabbitMQ, SQS or Redis Pub/Sub',
  short: 'Message brokers',
  blurb: 'A queue for jobs, a router for rules, a log for history, or a speaker for broadcasts.',
  intro: 'All four move messages from producers to consumers. The difference is what happens after a message is read: deleted, routed, kept for replay, or never stored at all.',
  options: {
    'SQS': {
      eli5: 'A post office drop box. You drop a letter, one postman picks it up and delivers it, and it’s gone. You never run the post office.',
      industry: [
        'Booking apps push “send confirmation email” to SQS so the booking API replies instantly.',
        'Media teams queue “transcode this upload” jobs, each picked up by exactly one worker.',
        'AWS startups run background jobs without operating any queue servers.',
      ],
      def: 'Amazon SQS is a fully managed queue. Each message is processed by one consumer, then deleted. Standard queues are at-least-once with best-effort ordering; FIFO queues add ordering and deduplication at lower throughput.',
      scenarios: [
        'Send emails or SMS after signup without slowing the API',
        'Spread slow jobs (resize, transcode, PDF) across auto-scaled workers',
        'Absorb a traffic spike so the database isn’t hit all at once',
        'You’re on AWS and want zero operations',
      ],
      scale: 'From zero to very high throughput with no servers to manage; pay per request. Weak at: replay, complex routing, many independent readers of the same message.',
    },
    'RabbitMQ': {
      eli5: 'A smart mailroom clerk. Reads the label on each parcel, routes it to the right desk (urgent, billing, refunds), and waits for a signature before forgetting it.',
      industry: [
        'Fintech teams route payment events by type and priority to different processors.',
        'Python shops run Celery task queues on RabbitMQ (Instagram did early on).',
        'Microservices use it for per-message acks, retries, and request/reply.',
      ],
      def: 'RabbitMQ is an open-source broker (AMQP). Producers publish to exchanges; routing rules (direct, topic, fanout, headers) deliver to queues. Messages are removed after the consumer acks.',
      scenarios: [
        'Route “order.india.cod” to one queue and “order.us.card” to another',
        'Priority queues: premium users’ jobs first',
        'Per-message retry and dead-letter queues for failed tasks',
        'Self-hosted or multi-cloud, where SQS isn’t available',
      ],
      scale: 'Thousands to tens of thousands of messages/s per cluster. Sweet spot: rich routing and task queues. Not built for replay or millions of msg/s.',
    },
    'Kafka': {
      eli5: 'A CCTV recorder. Every event is written to tape, in order, and kept for days. Anyone can rewind and watch from any point, independently.',
      industry: [
        'LinkedIn built Kafka for activity tracking: billions of events a day.',
        'Uber streams trip and location events into pricing, ETAs and fraud checks.',
        'Food delivery apps stream order events to analytics, notifications and search at the same time.',
      ],
      def: 'Apache Kafka is a distributed, append-only log. Topics are split into partitions, ordered within each partition. Messages are kept for a retention period whether or not they’re read; each consumer group tracks its own offset and can replay.',
      scenarios: [
        'Clickstream or telemetry at hundreds of thousands of events/s',
        'Many independent teams consuming the same events',
        'Replay the last N days into a new service',
        'Event sourcing, audit logs, change data capture from databases',
      ],
      scale: 'Hundreds of thousands to millions of msg/s. Sweet spot: throughput + replay + many consumer groups. Heavy to operate; overkill below ~1K msg/s unless you need replay.',
    },
    'Redis Pub/Sub': {
      eli5: 'The school PA speaker. Everyone in the building hears it right now. If you were outside, you missed it, and nobody recorded it.',
      industry: [
        'Chat backends tell every app server “user 42 is online now”.',
        'Apps broadcast “product 9 changed” so every server drops it from its local cache.',
        'Live dashboards push counter updates between servers.',
      ],
      def: 'Redis Pub/Sub is fire-and-forget broadcast. Publishers send to a channel, and only currently connected subscribers receive it. No persistence, no ack, no replay.',
      scenarios: [
        'Routing WebSocket messages between chat servers',
        'Broadcasting cache-invalidation signals',
        'Presence and typing indicators, where losing one is harmless',
      ],
      scale: 'Very low latency and cheap if you already run Redis. A disconnected subscriber loses messages. Need durability? Use Redis Streams, a queue, or Kafka.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick(['2K', '20K', '80K']);
      const job = pick(['send a welcome email', 'resize the profile photo', 'generate a PDF invoice']);
      return {
        q: `Your startup runs fully on AWS with 2 backend developers. After each of ${n} daily signups you must ${job}. Nobody wants to manage queue servers.`,
        answer: 'SQS',
        hint: 'Who will operate the queue? Do you need routing or replay?',
        steps: [
          'Simple job queue: one worker per message.',
          `Low volume (${n}/day), no replay, no routing rules.`,
          'Small team on AWS, so zero operations matters most.',
          'Choose SQS.',
        ],
        followups: [
          { q: 'The worker crashes halfway through a job. Is the message lost?', options: ['No. The visibility timeout expires, the message reappears, and another worker retries; after N failures it goes to a DLQ', 'Yes, SQS deletes on read', 'It stays inside the crashed worker', 'SQS emails you the message'], why: 'At-least-once delivery means retries, so make the job idempotent (don’t send the email twice).' },
        ],
      };
    },
    (pick) => {
      const r = pick(['300K', '1M', '2M']);
      const d = pick([3, 7, 14]);
      return {
        q: `A food delivery app emits ${r} events/s (clicks, location pings, order updates). Analytics, fraud and search teams each need every event, and a new ML team wants the last ${d} days replayed.`,
        answer: 'Kafka',
        hint: 'Look at the volume, the number of independent readers, and the word “replayed”.',
        steps: [
          `Volume: ${r} events/s.`,
          'Many independent consumer groups read the same stream.',
          `Replaying ${d} days means messages must be kept after they’re read.`,
          'Choose Kafka.',
        ],
        followups: [
          { q: 'All events for one order must be processed in order. How?', options: ['Use order_id as the partition key so all its events land in one partition', 'Use a single partition for the whole topic', 'Sort by timestamp in the consumer', 'Kafka can’t guarantee any order'], why: 'Kafka orders only within a partition. The key decides both ordering and load spread; one partition kills throughput.' },
          { q: 'One restaurant chain is 40% of all traffic, keyed by restaurant_id. Problem?', options: ['Hot partition: one consumer is overloaded. Key by order_id, or split that tenant across sub-keys', 'No problem, Kafka auto-balances keys', 'Add more brokers only', 'Switch to SQS'], why: 'Hot keys are the classic sharding problem. It shows up in Kafka, databases and caches alike.' },
        ],
      };
    },
    (pick) => {
      const m = pick(['2K', '5K', '10K']);
      return {
        q: `A payment service handles ${m} msg/s. “refund.urgent” must go to a priority processor, “refund.normal” to a batch processor, and every “payment.*” event to audit. You’re self-hosted on-premises.`,
        answer: 'RabbitMQ',
        hint: 'The routing rules are the key detail.',
        steps: [
          `Moderate volume: ${m}/s.`,
          'Pattern-based routing (refund.urgent, payment.*) is exactly a topic exchange.',
          'Priorities, per-message acks and retries are needed.',
          'Self-hosted rules out SQS. Choose RabbitMQ.',
        ],
        followups: [
          { q: 'One refund message keeps failing forever. What do you do?', options: ['Retry with backoff a few times, then move it to a dead-letter queue and alert', 'Retry forever', 'Delete it silently', 'Restart RabbitMQ'], why: 'A poison message blocks the queue. A DLQ isolates it so humans can inspect it.' },
        ],
      };
    },
    (pick) => {
      const s = pick([10, 40, 120]);
      return {
        q: `You run ${s} app servers, each with an in-memory cache of product prices. When a price changes, every server must drop that entry within milliseconds. Missing one signal is acceptable because entries also expire after 60s.`,
        answer: 'Redis Pub/Sub',
        hint: 'Is it okay to lose a message? Do you need history?',
        steps: [
          `Broadcast to all ${s} servers.`,
          'Speed matters; durability doesn’t, because the TTL is the safety net.',
          'No replay needed.',
          'Choose Redis Pub/Sub.',
        ],
        followups: [
          { q: 'What if losing a signal became unacceptable?', options: ['Move to Redis Streams or Kafka so a restarted server catches up from its last ID', 'Publish each message 3 times', 'Use a bigger Redis', 'Turn off the cache'], why: 'Pub/Sub has no memory. Durability needs a log or a queue.' },
        ],
      };
    },
    (pick) => {
      const v = pick(['video transcoding', 'PDF report generation', 'ML image tagging']);
      return {
        q: `On AWS, users upload files that need ${v}. Each job takes 2 to 10 minutes and must be done by exactly one worker. Uploads spike 20x on weekends.`,
        answer: 'SQS',
        hint: 'One job, one worker, and spikes. What absorbs them cheaply?',
        steps: [
          'Work queue: each job goes to one worker.',
          'Spiky load: the queue buffers it; auto-scale workers on queue depth.',
          'Long jobs: set the visibility timeout above the job time.',
          'Choose SQS.',
        ],
        followups: [
          { q: 'Jobs take 10 minutes but the visibility timeout is 30 seconds. What happens?', options: ['The message reappears mid-job and a second worker starts the same job', 'Nothing, SQS waits for the worker', 'The job is deleted', 'The worker speeds up'], why: 'The timeout must exceed processing time, or the worker must extend it with a heartbeat.' },
        ],
      };
    },
    () => ({
      q: 'A bank must keep an ordered, replayable history of every account change for audits, and to rebuild balances if a bug corrupts them. Volume is 50K events/s.',
      answer: 'Kafka',
      hint: '“Rebuild” and “history” are the clues.',
      steps: [
        'Need an ordered, durable log.',
        'Replaying to rebuild state is event sourcing.',
        'Long retention; consumers can re-read from the beginning.',
        'Choose Kafka.',
      ],
      followups: [
        { q: 'Why not RabbitMQ here?', options: ['RabbitMQ deletes messages after ack, so there’s nothing to replay', 'RabbitMQ can’t handle 50K msg/s at all', 'RabbitMQ has no ordering', 'RabbitMQ is paid software'], why: 'A queue is work to finish and forget. A log is history to keep and re-read.' },
      ],
    }),
  ],
});
