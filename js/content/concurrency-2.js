SG.add({
  id: 'concurrency-2',
  ref: 'T51 T52 T54 T55',
  section: 'LLD: concurrency',
  title: 'Thread pools, futures and concurrent collections',
  short: 'Concurrency toolkit',
  blurb: 'ExecutorService, CompletableFuture, BlockingQueue and ConcurrentHashMap: the java.util.concurrent essentials.',
  intro: 'Machine-coding rounds expect you to use the JDK’s concurrency toolkit instead of raw threads and synchronized everywhere. Pick the tool by the shape of the problem: run many tasks, combine async results, hand work between threads, share a map, or split one big CPU job into pieces.',
  options: {
    'Thread pool (ExecutorService)': {
      eli5: 'A restaurant with a fixed team of 10 waiters. New customers wait for a free waiter instead of the owner hiring a new waiter for every customer.',
      industry: [
        'Executors.newFixedThreadPool / ThreadPoolExecutor for background tasks.',
        'Tomcat and Spring’s @Async use pools under the hood.',
        'Java 21 virtual threads for huge numbers of blocking tasks.',
      ],
      def: 'Reuse a bounded set of worker threads to run submitted tasks from a queue. Avoids the cost and danger of creating a thread per task, bounds concurrency, and supports shutdown and futures. Fixed pool = set size; single = strictly sequential; cached = grows without limit (risky under bursts); scheduled = delayed or periodic. execute(Runnable) fire-and-forgets; submit() returns a Future, and a task’s exception only surfaces at future.get(). When both threads and queue are full, a rejection policy decides what happens.',
      scenarios: [
        'Many independent tasks to run concurrently',
        'Creating a new Thread per request is exhausting memory',
        'Limiting concurrency against a downstream system',
      ],
      scale: 'Bound both pool size and queue size; an unbounded queue hides overload until memory runs out. Size CPU-bound pools ≈ cores, IO-bound pools larger.',
    },
    'CompletableFuture': {
      eli5: 'Ordering food, drinks and dessert from three counters at once, then sitting down only when all three trays have arrived.',
      industry: [
        'Calling price, stock and reviews services in parallel to build a product page.',
        'Chaining async steps: fetch user → fetch orders → compute summary.',
        'Spring WebClient and reactive code interoperating with futures.',
      ],
      def: 'A composable future: start async tasks (supplyAsync), chain transformations (thenApply/thenCompose), combine results (thenCombine, allOf), add timeouts (orTimeout) and handle errors (exceptionally for a fallback value, handle for success or failure) without blocking threads in between. Total time becomes the slowest call, not the sum.',
      scenarios: [
        'Several independent remote calls whose results are combined',
        'Async pipelines with error handling and timeouts',
        'Reducing latency from sum-of-calls to max-of-calls',
      ],
      scale: 'Default tasks run on the shared ForkJoinPool common pool (about cores minus one threads): blocking IO there starves every other async task, so pass your own executor.',
    },
    'BlockingQueue (producer-consumer)': {
      eli5: 'A conveyor belt between the kitchen and the packing team. Cooks put dishes on it; packers take them off. If the belt is full, cooks wait; if empty, packers wait.',
      industry: [
        'In-process job pipelines: crawler fetchers feed parser threads.',
        'Logging frameworks buffering log events to a writer thread.',
        'ThreadPoolExecutor itself is built on a BlockingQueue.',
      ],
      def: 'A thread-safe queue whose put() blocks when full and take() blocks when empty (ArrayBlockingQueue, LinkedBlockingQueue). The classic way to hand work from producer threads to consumer threads with natural backpressure.',
      scenarios: [
        'Producers and consumers run at different speeds',
        'Handing work between thread groups inside one process',
        'Bounded buffering with backpressure',
      ],
      scale: 'In-process only. Across machines, use a real message queue.',
    },
    'ConcurrentHashMap': {
      eli5: 'A post office with many separate counters for different PIN codes. Many people are served at the same time, unless they need the same counter.',
      industry: [
        'In-memory caches and registries shared by request threads.',
        'Per-user rate-limit buckets in a single-server limiter.',
        'Counting with merge()/compute() atomically per key.',
      ],
      def: 'A thread-safe map that allows concurrent reads and fine-grained locking on writes (per bin since Java 8). Atomic per-key operations: putIfAbsent, computeIfAbsent, merge. Iteration is weakly consistent and doesn’t throw ConcurrentModificationException. Null keys and values are rejected, because get() returning null would be ambiguous between “absent” and “just removed by another thread”.',
      scenarios: [
        'A map shared by many threads',
        'Atomic per-key updates (counters, lazy initialization)',
        'Replacing Collections.synchronizedMap or a HashMap with locks',
      ],
      scale: 'Atomic per key only; multi-key invariants still need extra locking. Don’t do slow work inside computeIfAbsent.',
    },
    'ForkJoinPool (divide and conquer)': {
      eli5: 'A big pile of exam papers split among teachers; a teacher who finishes early steals papers from the busiest teacher’s pile.',
      industry: [
        'Parallel streams and Arrays.parallelSort run on the common ForkJoinPool.',
        'Summing, searching or transforming a 50-million-element array in chunks.',
        'CompletableFuture default async tasks also use it.',
      ],
      def: 'A pool built for recursive CPU-bound work: a big task forks into smaller subtasks until they are small enough to compute directly, then joins the results. Idle workers steal queued subtasks from busy ones (work stealing), keeping all cores busy. Not meant for blocking IO.',
      scenarios: [
        'One huge CPU-bound job that splits into independent pieces',
        'Parallel sort or sum over a large array',
        'Recursive algorithms like merge sort or tree traversal',
      ],
      scale: 'Gains stop near the core count; splitting tiny tasks costs more than it saves. Never block inside it.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick(['10K', '50K']);
      return {
        q: `A service starts a new Thread for each of ${n} incoming image-resize tasks per minute. Under bursts it runs out of memory and the OS refuses to create threads.`,
        answer: 'Thread pool (ExecutorService)',
        hint: 'Reuse a bounded set of workers.',
        steps: ['Thread-per-task is unbounded and expensive.', 'Submit tasks to a fixed pool with a bounded queue.', 'Concurrency stays under control.', 'Thread pool.'],
        followups: [
          { q: 'Why is newCachedThreadPool dangerous for a bursty workload?', options: ['It creates a new thread whenever none is idle, with no upper bound', 'It only ever uses one thread', 'It drops every task', 'It cannot run Callables'], why: 'A burst can create thousands of threads and exhaust memory.' },
          { q: 'submit() vs execute() when the task throws?', options: ['submit captures the exception in the Future (seen at get()); execute lets it hit the thread’s uncaught-exception handler', 'They behave identically', 'submit crashes the pool', 'execute returns the exception'], why: 'Forgetting to call get() silently hides submit failures.' },
          { q: 'The pool’s queue is full. Sensible behaviour?', options: ['A rejection policy: reject with 429/“try later” or run in caller (CallerRunsPolicy) to apply backpressure', 'Grow the queue forever', 'Drop tasks silently', 'Create more threads without limit'], why: 'Bounded queues need an explicit overload policy.' },
        ],
      };
    },
    (pick) => {
      const n = pick([3, 4, 5]);
      return {
        q: `Building a product page needs ${n} independent calls (price, stock, reviews…), each ~150 ms. Done one after another, the page takes ${n * 150} ms.`,
        answer: 'CompletableFuture',
        hint: 'Run them at the same time and combine.',
        steps: ['The calls don’t depend on each other.', 'Start all asynchronously.', 'Combine with allOf / thenCombine.', `CompletableFuture: ~150 ms instead of ${n * 150} ms.`],
        followups: [
          { q: 'The reviews call sometimes hangs. How do you keep the page fast?', options: ['completeOnTimeout/orTimeout with a fallback (e.g. no reviews section)', 'join() and wait forever', 'Retry 10 times synchronously', 'Remove async'], why: 'Async doesn’t remove the need for timeouts and fallbacks.' },
        ],
      };
    },
    () => ({
      q: 'In a web crawler, 4 fetcher threads download pages faster than 8 parser threads can parse them. Memory blows up because fetched pages pile up in an ArrayList.',
      answer: 'BlockingQueue (producer-consumer)',
      hint: 'Producers and consumers at different speeds, within one process.',
      steps: ['Classic producer-consumer.', 'An unbounded list has no backpressure (and isn’t thread-safe).', 'A bounded BlockingQueue makes fetchers wait when it’s full.', 'BlockingQueue.'],
      followups: [
        { q: 'With 5 producers and 10 consumers on one BlockingQueue, how do consumers stop cleanly?', options: ['A poison-pill item per consumer, or shutdown of the executor after draining', 'Call Thread.stop()', 'Make the queue unbounded', 'Nothing, they exit alone'], why: 'A blocked take() needs a signal to wake and exit.' },
        { q: 'Producers add 1,000 orders/s but consumers handle 100/s. What does a bounded queue do?', options: ['put() blocks producers when full, applying backpressure without errors', 'Throws OutOfMemoryError', 'Silently drops orders', 'Speeds up consumers'], why: 'The bound turns overload into waiting instead of memory growth.' },
        { q: 'The crawler is now spread across 50 machines. Still BlockingQueue?', options: ['No: use a distributed queue (SQS/Kafka) between machines', 'Yes, one per machine is enough', 'Use a static ArrayList', 'Use ConcurrentHashMap'], why: 'BlockingQueue is in-process only.' },
      ],
    }),
    (pick) => {
      const what = pick(['per-user request counts in an in-memory rate limiter', 'a cache of loaded product objects', 'counts of words seen by many parser threads']);
      return {
        q: `Many threads update ${what} stored in a HashMap. You see lost updates and occasional infinite loops / corrupted state.`,
        answer: 'ConcurrentHashMap',
        hint: 'A shared map needs safe concurrent updates per key.',
        steps: ['HashMap isn’t thread-safe.', 'Use a concurrent map.', 'Use merge()/compute() for atomic per-key updates.', 'ConcurrentHashMap.'],
        followups: [
          { q: 'Why does ConcurrentHashMap reject null values, unlike HashMap?', options: ['get() == null would be ambiguous: absent, or removed by another thread a moment ago', 'Nulls use too much memory', 'It was a Java 5 bug', 'Only keys may be null'], why: 'A single-threaded HashMap can resolve the ambiguity with containsKey; a concurrent one cannot.' },
          { q: 'Which is atomic in ConcurrentHashMap?', options: ['map.merge(key, 1, Integer::sum)', 'if (!map.containsKey(k)) map.put(k, v)', 'map.put(k, map.get(k) + 1)', 'All of these'], why: 'Separate get-then-put calls race; compute/merge do it atomically.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['50 million', '100 million', '200 million']);
      return {
        q: `A nightly job must compute statistics over an in-memory array of ${n} numbers on a 16-core server. Each chunk can be processed independently, and the partial results are then combined. The work is pure CPU, no IO.`,
        answer: 'ForkJoinPool (divide and conquer)',
        hint: 'Split recursively, let idle cores help the busy ones.',
        steps: ['The work is CPU-bound and splits cleanly.', 'Recursively halve the range until each piece is small (a threshold).', 'Idle workers steal pending pieces, balancing uneven chunks.', 'Join the partial results: ForkJoinPool.'],
        followups: [
          { q: 'Why not run blocking HTTP calls inside the common ForkJoinPool?', options: ['It has only about cores-1 threads, so blocked workers starve every parallel stream and async task', 'HTTP is not allowed in Java', 'It would use too little CPU', 'It forces single-threaded execution'], why: 'Use a separate executor sized for IO.' },
          { q: 'Rough pool size for a CPU-bound pool versus an IO-bound pool?', options: ['About the core count for CPU-bound; larger (cores × (1 + wait/compute)) for IO-bound', 'Same for both', 'Always 1', 'Always 1000'], why: 'IO-bound threads spend time waiting, so more can overlap.' },
        ],
      };
    },
    () => ({
      q: 'An order service calls inventory, pricing and loyalty in parallel. If any one fails or times out after 300 ms, it should substitute a default for just that part, and the response must still return. Circuit-breaker libraries are not allowed in this exercise.',
      answer: 'CompletableFuture',
      hint: 'Attach a per-call fallback and then wait for all of them.',
      steps: ['Three independent async calls.', 'Add orTimeout/completeOnTimeout and exceptionally to each future.', 'Combine with allOf(...).join().', 'CompletableFuture with per-call fallbacks.'],
      followups: [
        { q: 'exceptionally vs handle?', options: ['exceptionally supplies a fallback only on failure; handle receives both result and exception', 'They are identical', 'handle only runs on success', 'exceptionally blocks the thread'], why: 'handle covers both outcomes in one stage.' },
        { q: 'Your async tasks make blocking JDBC calls on the default pool and everything stalls under load. Why?', options: ['The common pool is small and gets starved; supply a dedicated executor', 'JDBC is not thread-safe', 'CompletableFuture is single-threaded', 'allOf cancels tasks'], why: 'Blocking inside the shared pool starves unrelated work.' },
      ],
    }),
    () => ({
      q: 'A report job must fetch a user, then (using the user’s region) fetch regional prices, then compute a summary, all without blocking a request thread between steps.',
      answer: 'CompletableFuture',
      hint: 'Dependent async steps chained together.',
      steps: ['Each step depends on the previous result.', 'Chain them asynchronously.', 'thenCompose for async-dependent steps, thenApply for transforms.', 'CompletableFuture.'],
      followups: [
        { q: 'thenApply vs thenCompose?', options: ['thenApply maps a value; thenCompose flattens a function that returns another CompletableFuture', 'They’re identical', 'thenCompose is synchronous', 'thenApply only handles errors'], why: 'Like map vs flatMap.' },
      ],
    }),
  ],
});
