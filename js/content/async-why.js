SG.add({
  id: 'async-why',
  ref: 'I1 I2',
  section: 'Async and messaging',
  title: 'Why async: queues, pub/sub and streams',
  short: 'Async messaging',
  blurb: 'When to stop calling services directly, and which messaging shape fits.',
  intro: 'A direct call works until the callee is slow, down or flooded; then the caller is stuck too. Messaging puts a buffer in between. The shape you pick decides who gets each message: one worker (queue), every subscriber (pub/sub), or anyone, any time, replayable (stream/log).',
  options: {
    'Synchronous call': {
      eli5: 'Phoning a shop and waiting on the line until they answer your question. Fine when they pick up quickly; painful when the line is busy.',
      industry: [
        'Fetching data the user is waiting to see (product details, balance).',
        'Validating a payment card before confirming an order.',
        'Simple internal REST/gRPC calls between services.',
      ],
      def: 'The caller sends a request and waits for the response before continuing. Simple, immediate result and error, but couples availability and latency: if the callee is slow or down, so is the caller.',
      scenarios: [
        'The user needs the result to continue',
        'The operation is fast and the callee is reliable',
        'You need an immediate success/failure answer',
      ],
      scale: 'Chains of synchronous calls multiply latency and failure risk. Add timeouts, retries and circuit breakers.',
    },
    'Message queue': {
      eli5: 'A token system at a bakery. You place your order, get a token, and leave. Bakers pick up orders one by one; each order is baked by exactly one baker.',
      industry: [
        'Background jobs: emails, image resizing, PDF generation (SQS, RabbitMQ).',
        'YouTube-style transcoding jobs consumed by worker fleets.',
        'Absorbing flash-sale spikes so downstream systems work at a steady pace.',
      ],
      def: 'Producers put messages on a queue; each message is delivered to one consumer (competing consumers) and removed after acknowledgement. Decouples timing, absorbs spikes, lets producers and consumers scale independently.',
      scenarios: [
        'Work that can finish later without the user waiting',
        'Spiky load that would overwhelm a downstream service',
        'Distributing jobs across many workers',
      ],
      scale: 'Scale workers on queue depth. Consumers must be idempotent (at-least-once delivery) and have a dead-letter queue.',
    },
    'Pub/sub': {
      eli5: 'A school announcement over the speakers. Every classroom that’s listening hears the same message.',
      industry: [
        '“Order placed” fans out to email, inventory, analytics and loyalty services (SNS, Kafka topics).',
        'Live comments broadcast to all servers holding viewers’ connections.',
        'Cache invalidation messages to every app server.',
      ],
      def: 'Publishers send to a topic; every subscriber (or subscriber group) gets its own copy. The publisher doesn’t know who’s listening, so new reactions can be added without touching it.',
      scenarios: [
        'One event, several independent reactions',
        'Adding new consumers without changing the producer',
        'Broadcasting updates to many servers',
      ],
      scale: 'Each subscriber processes at its own pace; slow subscribers need their own queue/buffer (e.g. SNS → SQS per subscriber).',
    },
    'Event stream (log)': {
      eli5: 'A CCTV recording rather than a live announcement. Anyone can watch from any point in the past, at their own speed, as many times as they like.',
      industry: [
        'Kafka/Kinesis clickstreams feeding analytics, fraud and recommendations.',
        'Change data capture feeding search indexes and warehouses.',
        'Event sourcing: rebuild state by replaying history.',
      ],
      def: 'An ordered, durable, append-only log split into partitions. Messages stay for a retention period after being read; each consumer group tracks its own offset and can replay. Ordering is per partition (per key).',
      scenarios: [
        'High-volume event data read by several teams independently',
        'Replay or backfill history into a new service',
        'Real-time aggregation (windows) over continuous data',
      ],
      scale: 'Very high throughput with batching. Choose the partition key carefully: it decides ordering and hot partitions.',
    },
  },
  scenarios: [
    (pick) => {
      const ms = pick([2500, 3000, 4000]);
      return {
        q: `Checkout takes ${ms} ms because, after saving the order, it synchronously sends a confirmation email, generates a PDF invoice and calls a slow loyalty service. The user only needs to know the order was placed.`,
        answer: 'Message queue',
        hint: 'Does the user need to wait for those side tasks?',
        steps: ['The order write is the only must-wait step.', 'Email, PDF and loyalty can happen seconds later.', 'Enqueue jobs; workers process them.', 'Message queue: checkout returns in ~200 ms.'],
        followups: [
          { q: 'The PDF worker keeps failing on one malformed order. What stops it blocking everything?', options: ['Retry a few times with backoff, then move it to a dead-letter queue', 'Retry forever', 'Delete the queue', 'Process it synchronously'], why: 'Poison messages belong in a DLQ for inspection.' },
        ],
      };
    },
    (pick) => {
      const n = pick([4, 5, 6]);
      return {
        q: `When an order is placed, ${n} separate services must react (email, inventory, analytics, loyalty…). Teams keep adding new reactions, and the order service shouldn’t change each time.`,
        answer: 'Pub/sub',
        hint: 'One event, everyone interested gets a copy.',
        steps: ['One event, many independent consumers.', 'Producer must not know the consumers.', 'Publish “order placed” to a topic; each service subscribes.', 'Pub/sub.'],
        followups: [
          { q: 'With SNS → several SQS queues, why give each subscriber its own queue?', options: ['So a slow or failing subscriber doesn’t lose messages or slow the others', 'To make it cheaper', 'Because SNS can’t send', 'To guarantee global ordering'], why: 'Fan-out to per-subscriber queues isolates their pace and failures.' },
        ],
      };
    },
    (pick) => {
      const r = pick(['500K', '1M']);
      return {
        q: `${r} click events per second must feed analytics, fraud detection and recommendations. Next month a new team wants to reprocess the last 7 days with a new model.`,
        answer: 'Event stream (log)',
        hint: 'Volume, many readers, and replaying the past.',
        steps: ['Huge volume.', 'Several independent consumer groups.', 'Replay requires keeping messages after they’re read.', 'Event stream (Kafka/Kinesis).'],
        followups: [
          { q: 'A team proposes putting each uploaded video file itself on Kafka. Better?', options: ['Store the file in S3 and put a small message with the video ID and S3 URL on Kafka', 'Yes, Kafka handles any size', 'Use a bigger partition', 'Email the file'], why: 'Keep messages small (well under ~1 MB); reference big blobs by URL.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['check a card’s CVV with the bank', 'show the user their wallet balance', 'verify a coupon before showing the final price']);
      return {
        q: `The app must ${what}. The user is staring at the screen waiting for the answer, and the downstream service responds in about 80 ms.`,
        answer: 'Synchronous call',
        hint: 'The user needs the result to continue.',
        steps: ['The result is needed right now.', 'The callee is fast.', 'A queue would only add delay and complexity.', 'Synchronous call (with a timeout).'],
        followups: [
          { q: 'The bank API sometimes hangs for 30 seconds. What protects your service?', options: ['A short timeout plus a circuit breaker that fails fast when the bank is unhealthy', 'Wait forever', 'Retry 100 times immediately', 'Remove the call'], why: 'Synchronous calls need timeouts and circuit breakers to avoid cascading failures.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['100K', '300K']);
      return {
        q: `During a coding contest, ${n} solutions are submitted in 5 minutes. You can afford only a small fleet of sandbox runners, and results may take a minute.`,
        answer: 'Message queue',
        hint: 'Absorb the burst; let a fixed pool drain it.',
        steps: ['Huge burst, limited workers.', 'Results can be delayed.', 'Accept submissions fast, enqueue, workers pull at their pace.', 'Message queue.'],
        followups: [
          { q: 'What metric should drive auto-scaling of runners?', options: ['Queue depth / age of oldest message', 'CPU of the API servers', 'Number of users registered', 'Disk usage'], why: 'Backlog directly measures how far behind the workers are.' },
        ],
      };
    },
  ],
});
