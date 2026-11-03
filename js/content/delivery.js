SG.add({
  id: 'delivery',
  ref: 'I6 I7 I8',
  section: 'Async and messaging',
  title: 'Delivery guarantees, DLQs and backpressure',
  short: 'Delivery guarantees',
  blurb: 'Lose it, duplicate it, or pay for exactly once, plus what to do with messages that keep failing.',
  intro: 'Every messaging design answer gets the same follow-up: “what if the consumer crashes?”. The honest answer in almost all real systems is at-least-once delivery with idempotent consumers, a dead-letter queue for poison messages, and backpressure when consumers fall behind.',
  options: {
    'At-most-once': {
      eli5: 'Throwing a newspaper at a house once. If it lands in a puddle, nobody throws another.',
      industry: [
        'Metrics and telemetry where a lost sample doesn’t matter.',
        'Live video frames, typing indicators, presence pings.',
        'Fire-and-forget logs at very high volume.',
      ],
      def: 'Each message is delivered zero or one times: the consumer acknowledges (or the offset is committed) before processing, and nothing is retried. Fast and simple; messages can be lost on failure.',
      scenarios: [
        'Losing an occasional message is acceptable',
        'Duplicates would be worse than gaps',
        'Ultra-high-volume, low-value data',
      ],
      scale: 'Cheapest. Never for payments, orders or anything users would notice missing.',
    },
    'At-least-once': {
      eli5: 'A courier who keeps redelivering until someone signs. You might receive the same parcel twice if the signature got lost, but you’ll never miss it.',
      industry: [
        'The default for SQS, RabbitMQ and Kafka consumers.',
        'Payments, orders and notifications with idempotent handlers.',
        'Web crawlers that commit the offset only after the page is stored.',
      ],
      def: 'Acknowledge (commit the offset) only after processing succeeds; on failure the message is redelivered. Nothing is lost, but duplicates happen, so consumers must be idempotent (dedupe by message ID, upserts, conditional writes).',
      scenarios: [
        'Messages must not be lost',
        'Processing can be made idempotent',
        'The industry-standard answer for business events',
      ],
      scale: 'Pair with idempotency keys and a DLQ. This is what most interview answers should say.',
    },
    'Exactly-once': {
      eli5: 'A bank transfer that must happen once, no matter how many times the button is pressed or the network hiccups. It’s possible, but needs a lot of careful bookkeeping.',
      industry: [
        'Kafka transactions for read-process-write pipelines entirely within Kafka (e.g. Kafka Streams).',
        'Flink checkpoints with transactional sinks.',
        'Often “effectively once” = at-least-once delivery + idempotent processing.',
      ],
      def: 'Each message’s effect happens once. True end-to-end exactly-once only holds inside systems that coordinate transactions (Kafka→Kafka with transactions). Once you write to an external database or API, you’re back to at-least-once and need idempotency anyway.',
      scenarios: [
        'Stream processing where both input and output live in the same transactional system',
        'Aggregations where double counting is unacceptable and supported by the platform',
      ],
      scale: 'Costs throughput and complexity. Be sceptical of “just use Kafka exactly-once” for side effects.',
    },
    'Dead-letter queue': {
      eli5: 'Post office “undeliverable” bin. After a few failed attempts, the letter goes there so the postman can keep delivering everything else.',
      industry: [
        'SQS redrive policy moves messages after maxReceiveCount failures.',
        'RabbitMQ dead-letter exchanges.',
        'Kafka: retry topics + a DLQ topic built by the application.',
      ],
      def: 'A separate queue/topic where messages go after N failed processing attempts, so a “poison” message doesn’t block or endlessly retry. Engineers inspect, fix and replay them. Often combined with retry queues and exponential backoff.',
      scenarios: [
        'One bad message keeps failing and blocking others',
        'You need visibility into failed messages',
        'Separating transient failures (retry) from permanent ones',
      ],
      scale: 'Alert on DLQ size; a DLQ nobody watches is just a slower way to lose data.',
    },
  },
  scenarios: [
    (pick) => {
      const what = pick(['CPU metrics every second from 50K servers', 'typing indicators in a chat app', 'live location pings shown on a map']);
      return {
        q: `You’re processing ${what}. Missing an occasional message is invisible to users, and processing a duplicate would just add noise.`,
        answer: 'At-most-once',
        hint: 'Is a lost message a problem here?',
        steps: ['Each message is low value and soon replaced.', 'Loss is acceptable.', 'Skip retries for speed and simplicity.', 'At-most-once.'],
        followups: [
          { q: 'Would at-most-once be acceptable for “order placed” events?', options: ['No: a lost order is a real loss; use at-least-once with idempotent consumers', 'Yes', 'Only at night', 'Only for big orders'], why: 'Choose delivery semantics per message type, by the cost of loss.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['“send order confirmation email”', '“credit loyalty points”', '“update search index for product”']);
      return {
        q: `A worker handles ${what} messages. Losing one is unacceptable. Occasionally a worker crashes after doing the work but before acknowledging, so the message is delivered again.`,
        answer: 'At-least-once',
        hint: 'No loss allowed, and duplicates are already happening.',
        steps: ['Loss is unacceptable, so retry until acknowledged.', 'Crashes between work and ack cause duplicates.', 'Make the handler idempotent.', 'At-least-once + idempotency.'],
        followups: [
          { q: 'When should a Kafka consumer commit its offset?', options: ['After the work is fully done (e.g. data stored), not when the message is received', 'Immediately on receipt', 'Never', 'Once a day'], why: 'Committing before finishing turns a crash into a lost message.' },
          { q: 'Simplest way to make “credit 50 points for order 123” idempotent?', options: ['Record processed message/order IDs (unique constraint) and skip repeats', 'Add 50 again and subtract later', 'Use at-most-once', 'Sleep before processing'], why: 'Dedupe by a stable ID.' },
        ],
      };
    },
    () => ({
      q: 'A Kafka Streams job reads payments from one topic, aggregates totals per merchant, and writes results to another Kafka topic. Double counting would misreport revenue.',
      answer: 'Exactly-once',
      hint: 'Input and output both live inside Kafka.',
      steps: ['Read-process-write entirely within Kafka.', 'Kafka transactions can commit output and offsets atomically.', 'Double counting is unacceptable.', 'Exactly-once (supported here).'],
      followups: [
        { q: 'The job now also calls an external payout API for each merchant. Still exactly-once?', options: ['No: external side effects fall back to at-least-once, so the payout call needs an idempotency key', 'Yes, Kafka guarantees it', 'Yes, if the API is fast', 'Only with more partitions'], why: 'Exactly-once stops at the boundary of the transactional system.' },
      ],
    }),
    (pick) => {
      const n = pick([3, 5]);
      return {
        q: `One malformed “resize image” message crashes the worker every time. It’s been retried thousands of times, and other messages are piling up behind it.`,
        answer: 'Dead-letter queue',
        hint: 'Get the poison message out of the way.',
        steps: ['The failure is permanent, not transient.', 'Endless retries waste capacity and block others.', `After ~${n} attempts, move it aside for inspection.`, 'Dead-letter queue.'],
        followups: [
          { q: 'Kafka has no built-in consumer retry/DLQ like SQS. Common pattern?', options: ['Publish failures to a retry topic with an attempt count, then to a DLQ topic after N attempts', 'Restart Kafka', 'Delete the partition', 'Ignore the message'], why: 'Retry topics + DLQ topic is the standard Kafka pattern.' },
        ],
      };
    },
    (pick) => {
      const db = pick(['PostgreSQL', 'MySQL', 'DynamoDB']);
      return {
        q: `“Payment confirmed” events come from Kafka and the consumer writes them to ${db}. A teammate says: “Just enable Kafka exactly-once and we never need to worry about duplicates.” What do you actually rely on?`,
        answer: 'At-least-once',
        hint: 'Where does Kafka’s exactly-once guarantee stop?',
        steps: ['Kafka exactly-once covers Kafka-to-Kafka transactions.', `Writing to ${db} is an external side effect.`, 'Redelivery is still possible, so duplicates can reach the database.', 'At-least-once delivery + idempotent writes (unique payment ID).'],
        followups: [
          { q: 'Which is an example of backpressure?', options: ['Producers slow down or get rejected (429) when the queue is above a threshold', 'Deleting old messages silently', 'Doubling message size', 'Turning off acknowledgements'], why: 'Backpressure pushes the slowdown back to the source instead of letting buffers explode.' },
        ],
      };
    },
  ],
});
