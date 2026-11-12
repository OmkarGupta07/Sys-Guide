SG.add({
  id: 'lld-infra',
  ref: 'U9 U17 U18',
  section: 'LLD case studies',
  title: 'LLD: logger, pub-sub queue, task scheduler',
  short: 'Logger, queue, scheduler',
  blurb: 'Infrastructure LLDs: level handling, async appenders, topic offsets, delay-ordered scheduling and retries.',
  intro: 'Logger, in-memory pub-sub and task scheduler are “build a tiny piece of infrastructure” prompts, common at PhonePe and Flipkart machine-coding rounds. They test producer–consumer thinking and Java concurrency more than business modelling. For each, ask: who produces, who consumes, what order, what happens when a consumer is slow or fails. Then pick the structure: a handler chain, a bounded BlockingQueue, a log with per-subscriber offsets, a time-ordered heap, and retries with backoff.',
  options: {
    'Chain of Responsibility for log levels': {
      eli5: 'A complaint passes desk to desk: the clerk handles small issues, the manager handles bigger ones, the director handles the worst. Each desk decides “mine or pass it on”.',
      industry: [
        'Log4j/Logback: level threshold per logger, then appenders (console, file, remote).',
        'A DEBUG handler, INFO handler and ERROR handler linked so each writes or forwards.',
        'Servlet filters and Spring Security filter chains use the same idea.',
      ],
      def: 'Each LogHandler has a level and a next handler; it writes messages at or above its level to its sinks and forwards to next. Adding a level or a sink is a new handler, not edits to an if/else. The Logger itself is one shared instance: a Singleton, or better, a bean injected via DI so tests can replace it.',
      scenarios: [
        'Different levels go to different destinations',
        'New levels or sinks will be added',
        'Interviewer asks how the logger is made globally available',
      ],
      scale: 'Level check first, cheaply; build the message string only if the level is enabled.',
    },
    'Async appender with BlockingQueue': {
      eli5: 'Instead of waiting at the post office yourself, you drop letters in a box and a postman carries them later. If the box is full, you decide: wait or throw the junk mail away.',
      industry: [
        'Logback AsyncAppender and Log4j2 async loggers keep request threads off disk I/O.',
        'ArrayBlockingQueue(capacity) between app threads and one writer thread.',
        'Full-queue policy: block, drop DEBUG first, or count dropped messages.',
      ],
      def: 'Producers offer() log events into a bounded BlockingQueue; one consumer thread take()s and writes to the sink, batching where possible. Bounded capacity gives backpressure; a policy decides block vs drop when full. On shutdown, stop accepting, drain the queue, then flush (a shutdown hook).',
      scenarios: [
        'Disk or network logging slows request latency',
        'Bursts of log lines during incidents',
        'Logs must not be lost on graceful shutdown',
      ],
      scale: 'A capacity of 1K–10K events; the single writer keeps file writes ordered.',
    },
    'Topics with per-subscriber offsets': {
      eli5: 'A class notebook where the teacher keeps writing new lines. Each student has a bookmark showing how far they have read; nobody tears pages out for the others.',
      industry: [
        'Kafka-style design: append-only list per topic, each consumer group stores an offset.',
        'Replay: reset a subscriber’s offset to reprocess messages.',
        'Slow subscribers fall behind without blocking fast ones.',
      ],
      def: 'Each Topic holds an append-only List<Message> (thread-safe, e.g. CopyOnWriteArrayList or a locked ArrayList) and never hands out its mutable list: getters return an unmodifiable view. Each Subscriber has its own AtomicInteger offset (wrapped with it in a TopicSubscriber). Publishing appends first, then wakes the workers. Subscribers sit behind an ISubscriber interface (id, consume(message)), so any consumer can plug in. This decouples subscribers and allows replay, unlike push-only Observer.',
      scenarios: [
        'Multiple independent subscribers per topic',
        'A subscriber must be able to replay from an earlier point',
        'One slow subscriber must not slow the others',
      ],
      scale: 'Memory grows with retained messages; add retention (drop below the minimum offset) for long runs.',
    },
    'Per-subscriber worker with compare-and-set offset': {
      eli5: 'Each student has their own helper who reads the notebook aloud to them. If the helper is told to go back to page 2 while reading page 5, he must not carry on to page 6 as if nothing happened.',
      industry: [
        'One worker thread per (topic, subscriber), created lazily on first message and parked with wait() when caught up.',
        'Within one subscriber messages are processed in order; across subscribers the same message runs in parallel.',
        'Kafka consumer offset seek/reset has the same hazard: a rewind must beat an in-flight commit.',
      ],
      def: 'The worker loops: if offset >= topic size, wait(); else read messages[offset], call consume(), then advance with offset.compareAndSet(old, old + 1). If an admin reset the offset to 2 while the worker was busy with message 5, the CAS fails and the rewind wins; a plain increment would overwrite it with 6 (or 3 after a stale read) and lose the replay. publish() appends to the topic, then notifies the subscriber workers so idle ones wake. Prefer an ExecutorService or a fixed pool over spawning a fresh thread per publish.',
      scenarios: [
        'Offset can be reset by another thread while a worker is consuming',
        'Each subscriber must see messages in order, but subscribers run in parallel',
        'Idle workers must not spin and must wake when a message is published',
      ],
      scale: 'One thread per active subscriber-topic pair, so thousands of subscribers need a pooled or event-driven worker model; CAS has no lock and does not block the reset.',
    },
    'Delay-ordered scheduler': {
      eli5: 'An alarm clock list sorted by time: the person at the top of the list is woken first; everyone else waits.',
      industry: [
        'ScheduledExecutorService for fixed-delay and fixed-rate jobs in Spring apps.',
        'DelayQueue or PriorityQueue ordered by next run time with a worker pool.',
        'Cron-like schedulers recompute the next run time after each execution.',
      ],
      def: 'Store tasks in a min-heap keyed by nextRunAt (PriorityBlockingQueue or DelayQueue). Worker threads take the earliest task, wait until its time, run it on a pool, and for recurring tasks reinsert with the next time. In Java, ScheduledThreadPoolExecutor already implements this; a hand-rolled version shows the heap plus a Condition await with timeout.',
      scenarios: [
        'Run tasks at a given time or after a delay',
        'Recurring jobs every N seconds',
        'Earliest-due task must run first even if added last',
      ],
      scale: 'O(log n) insert and poll; one long task must not block others, so execute on a separate pool.',
    },
    'Retry with exponential backoff': {
      eli5: 'If a shop is closed, you come back in 1 minute, then 2, then 4, not every second, and you stop after a few tries.',
      industry: [
        'Failed scheduled tasks or subscriber deliveries retried at 1s, 2s, 4s … with jitter.',
        'Spring Retry @Retryable(backoff = @Backoff(delay=1000, multiplier=2)).',
        'After max attempts, move to a dead-letter list for manual review.',
      ],
      def: 'On failure, reschedule the task with delay = base × 2^attempt plus random jitter, up to a max attempts count; then send it to a dead-letter queue. Retries must be idempotent-safe. Implemented by putting the task back in the scheduler’s heap with a later run time, not by sleeping in the worker.',
      scenarios: [
        'A task depends on a flaky downstream',
        'Failed messages must not block the queue forever',
        'Retries should not stampede a recovering service',
      ],
      scale: 'Typical: 3–5 attempts, cap delay at 30–60 s, jitter ±50%.',
    },
  },
  scenarios: [
    (pick) => {
      const sink = pick(['a file', 'Slack via webhook', 'an ELK endpoint']);
      return {
        q: `Design a logger: DEBUG goes to console only, INFO and WARN to console and file, ERROR to console, file and ${sink}. New levels (TRACE, FATAL) may be added.`,
        answer: 'Chain of Responsibility for log levels',
        hint: 'Each level decides to handle and/or pass along.',
        steps: ['Routing depends on level and may grow.', 'Link handlers: each writes if the level meets its threshold, then forwards.', 'Sinks (appenders) are pluggable objects per handler.', 'New levels are new handlers in the chain.'],
        followups: [
          { q: 'Singleton logger vs DI-injected logger: why do interviewers like DI?', options: ['Tests can inject a fake logger and there is no hidden global state', 'Singletons cannot be thread-safe', 'DI is faster at runtime', 'Java forbids static instances'], why: 'DI keeps one instance but makes it replaceable.' },
          { q: 'Thread-safe lazy Singleton in Java with the least code?', options: ['An enum singleton or a holder class', 'A public static field assigned in main', 'Double-checked locking without volatile', 'A synchronized constructor'], why: 'Class loading guarantees safe one-time initialisation.' },
        ],
      };
    },
    (pick) => {
      const p99 = pick([40, 80, 120]);
      return {
        q: `A payments API’s p99 jumped from 15 ms to ${p99} ms after adding file logging; profiling shows request threads blocked on FileOutputStream.write during traffic spikes.`,
        answer: 'Async appender with BlockingQueue',
        hint: 'Take the slow I/O off the request path.',
        steps: ['Request threads do disk I/O synchronously.', 'Producers offer events to a bounded ArrayBlockingQueue.', 'One background thread take()s and writes, batching flushes.', 'On full queue: drop low-priority logs or block, by policy; drain on shutdown.'],
        followups: [
          { q: 'Why bounded rather than unbounded LinkedBlockingQueue?', options: ['An unbounded queue can grow until OutOfMemoryError when the sink is slow', 'Bounded queues are faster to iterate', 'Unbounded queues are not thread-safe', 'Bounded queues sort messages'], why: 'Bounds provide backpressure and protect memory.' },
          { q: 'offer() vs put() on a full queue?', options: ['offer returns false immediately (can drop); put blocks until space', 'They are identical', 'put drops the oldest element', 'offer throws InterruptedException'], why: 'Choose by whether losing logs or slowing producers is worse.' },
        ],
      };
    },
    (pick) => {
      const subs = pick([3, 4, 5]);
      return {
        q: `Build an in-memory message queue: topic “order-events” has ${subs} subscribers (billing, analytics, SMS…). Analytics is 10× slower than the rest and sometimes must reprocess the last hour of messages.`,
        answer: 'Topics with per-subscriber offsets',
        hint: 'Each reader keeps its own place in a shared log.',
        steps: ['Pushing to all subscribers synchronously lets the slow one block others.', 'Store messages in an append-only list per topic.', 'Each subscriber has its own offset and worker thread.', 'Replay = reset that subscriber’s offset.'],
        followups: [
          { q: 'How does a subscriber worker wait for new messages without busy-spinning?', options: ['wait/notifyAll on the topic (or a Condition) signalled by publish', 'while(true) with no sleep', 'Thread.sleep(1) in a loop forever', 'System.gc()'], why: 'Condition signalling wakes workers only when there is data.' },
          { q: 'Why AtomicInteger for each offset?', options: ['It may be read by monitors and reset by an admin thread while the worker advances it', 'int cannot hold offsets', 'It makes the list thread-safe', 'It sorts messages'], why: 'Visibility and atomic updates across threads.' },
        ],
      };
    },
    (pick) => {
      const at = pick([5, 8, 12]);
      return {
        q: `In your pub-sub queue a worker thread is consuming message ${at} for subscriber billing and does offset.incrementAndGet() afterwards. Meanwhile an admin resets billing’s offset to 2 to replay. After the reset, the worker keeps going from ${at + 1} and the replay never happens.`,
        answer: 'Per-subscriber worker with compare-and-set offset',
        hint: 'The worker’s “advance by one” must only apply if nobody changed the offset meanwhile.',
        steps: ['Read the current offset, consume messages[current].', 'Advance with offset.compareAndSet(current, current + 1), not a blind increment.', 'If a reset happened, CAS fails, the loop re-reads the new offset (2) and replays from there.', 'When offset >= size the worker wait()s; publish() appends and notifies.'],
        followups: [
          { q: 'Within one subscriber, can two messages be consumed at the same time in this design?', options: ['No; one worker per subscriber processes messages in order, while different subscribers run in parallel', 'Yes, every message gets its own thread', 'Only on reset', 'Only for the first subscriber'], why: 'Ordering per subscriber is the point of one worker per (topic, subscriber); parallelism is across subscribers.' },
          { q: 'publish() starts a new Thread every time to fan out. What is the better approach?', options: ['Submit to an ExecutorService, or keep long-lived workers and just notify them', 'Keep creating threads; they are free', 'Do the fan-out under a global lock', 'Use Thread.sleep to throttle'], why: 'Unbounded thread creation costs memory and scheduling; pools or parked workers reuse threads.' },
          { q: 'Why add the message to the topic before waking the workers?', options: ['A woken worker must be able to see the message when it checks offset against size', 'Order does not matter', 'Messages must be sorted first', 'notify only works after add'], why: 'Otherwise the worker may re-check, find nothing and sleep again, missing the message.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['10,000', '50,000']);
      return {
        q: `A task scheduler holds ${n} one-off tasks (“send reminder at 18:30”, “expire coupon at midnight”) added in random order. The current design scans the full list every second to find due tasks.`,
        answer: 'Delay-ordered scheduler',
        hint: 'You only ever need the earliest task.',
        steps: ['Scanning is O(n) every tick.', 'Keep tasks in a min-heap (PriorityBlockingQueue/DelayQueue) by runAt.', 'Worker waits until the head is due, then hands it to an execution pool.', 'Recurring tasks are reinserted with the next runAt.'],
        followups: [
          { q: 'A new task is added that is due earlier than the current head while the worker is waiting. What must happen?', options: ['Signal the worker so it re-checks the head and waits a shorter time', 'Nothing; it will run after the current head', 'Restart the JVM', 'Sort the heap manually'], why: 'DelayQueue handles this; a hand-rolled version must signal its Condition.' },
          { q: 'Which JDK class already does fixed-rate scheduling with a pool?', options: ['ScheduledThreadPoolExecutor', 'ForkJoinPool', 'Timer with one thread only is equivalent and better', 'CompletableFuture'], why: 'It uses a delay-ordered work queue and a thread pool.' },
        ],
      };
    },
    (pick) => {
      const svc = pick(['an SMS gateway', 'a partner bank API', 'a GST invoice service']);
      return {
        q: `Scheduled tasks call ${svc}, which fails about 5% of the time for a few seconds. Today a failed task is retried immediately in a tight loop, hammering the service during outages.`,
        answer: 'Retry with exponential backoff',
        hint: 'Space out retries and give up eventually.',
        steps: ['Immediate retries amplify outages.', 'Reschedule with delay = base × 2^attempt plus jitter.', 'Cap attempts (e.g. 5), then move to a dead-letter list.', 'Ensure the task is idempotent so retries are safe.'],
        followups: [
          { q: 'Why add jitter?', options: ['So many failed tasks do not all retry at the same instant', 'It makes retries faster', 'It is required by HTTP', 'To avoid logging'], why: 'Jitter spreads load and avoids synchronized retry waves.' },
          { q: 'Should the worker Thread.sleep for the backoff?', options: ['No; reinsert the task with a later runAt so the worker stays free', 'Yes, it is simplest', 'Only for the first retry', 'Only in production'], why: 'Sleeping holds a pool thread idle and blocks other due tasks.' },
        ],
      };
    },
    (pick) => {
      const lvl = pick(['ERROR', 'WARN']);
      return {
        q: `Ops wants ${lvl} and above from the “payments” package to also go to a PagerDuty sink, without changing how other packages log. You already have DEBUG/INFO/ERROR handlers linked in order.`,
        answer: 'Chain of Responsibility for log levels',
        hint: 'Add a link; do not rewrite the chain.',
        steps: ['The requirement is a new routing rule for some messages.', 'Create a handler that matches level ≥ ' + lvl + ' and package = payments.', 'Insert it in the chain; it writes to the pager sink and forwards.', 'Existing handlers are untouched.'],
        followups: [
          { q: 'How do you avoid building expensive log strings when DEBUG is off?', options: ['Check isDebugEnabled() or use parameterised messages like log.debug("x={}", x)', 'Always concatenate first', 'Use System.out', 'Log at ERROR instead'], why: 'Parameterised logging defers formatting until needed.' },
        ],
      };
    },
  ],
});
