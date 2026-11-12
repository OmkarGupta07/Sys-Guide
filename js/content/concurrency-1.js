SG.add({
  id: 'concurrency-1',
  ref: 'T50 T53',
  section: 'LLD: concurrency',
  title: 'Java concurrency basics',
  short: 'Concurrency basics',
  blurb: 'Race conditions, visibility, atomic counters and deadlocks, the bugs machine-coding rounds hide in plain sight.',
  intro: 'LLD and machine-coding rounds (parking lot, BookMyShow, rate limiter) almost always ask “is this thread-safe?”. Know the five tools and the bug each one fixes: locks for compound steps, volatile for visibility, atomics for one variable, tryLock for lock-or-give-up, and lock ordering for deadlocks.',
  options: {
    'synchronized / lock': {
      eli5: 'A single-occupancy changing room with a lock. Only one person inside at a time; others wait outside.',
      industry: [
        'Booking the last seat: check-and-reserve must happen as one step.',
        'synchronized blocks around a small critical section in booking code.',
        'Guarding compound operations on shared objects (check-then-act).',
      ],
      def: 'Mutual exclusion: only one thread runs the critical section at a time, making compound operations (read-modify-write, check-then-act) atomic. synchronized locks an object (this for instance methods, the Class object for static ones), guarantees visibility, and releases automatically even if an exception is thrown. It gives no fairness or ordering guarantee and cannot time out.',
      scenarios: [
        'Check-then-act races (if available, then reserve)',
        'Several fields must change together consistently',
        'Shared mutable state accessed by many threads',
      ],
      scale: 'Contention serializes threads; keep critical sections tiny and lock as narrowly as possible. Blocked threads do no other work.',
    },
    'ReentrantLock (tryLock)': {
      eli5: 'A changing-room lock where you may knock, wait ten seconds, then walk away to do something else, instead of standing outside forever.',
      industry: [
        'tryLock(timeout) when locking two accounts or two seats, to back off instead of hanging.',
        'Fair locks so long-waiting threads are not starved.',
        'Multiple Condition objects (notFull, notEmpty) in a hand-written bounded buffer.',
      ],
      def: 'ReentrantLock is an explicit lock: lock(), tryLock() (immediate or with a timeout), lockInterruptibly(), optional fairness and several Conditions. The same thread can re-acquire it and must unlock the same number of times. Always unlock in finally, because a forgotten unlock leaves every other thread waiting forever. Prefer plain synchronized when you don’t need these features.',
      scenarios: [
        'A thread must give up or retry if a lock isn’t available within 200 ms',
        'You need fairness or interruptible waiting',
        'Lock and unlock happen in different methods',
      ],
      scale: 'More code and more ways to misuse (missing unlock). Fair mode lowers throughput.',
    },
    'volatile': {
      eli5: 'A notice board everyone reads directly, instead of each person keeping an old photocopy in their pocket.',
      industry: [
        'A boolean running/stop flag read by a worker thread loop.',
        'Double-checked locking for lazy singletons (the instance field must be volatile).',
        'Configuration references swapped atomically for readers.',
      ],
      def: 'Guarantees visibility and ordering: writes to a volatile field are immediately visible to other threads, and it prevents certain reorderings. It does NOT make compound operations like count++ atomic.',
      scenarios: [
        'One thread writes a flag, others read it',
        'Publishing a fully built immutable object reference',
        'A loop that never sees another thread’s update',
      ],
      scale: 'Cheap, but only for single reads/writes. For read-modify-write use atomics or locks.',
    },
    'Atomic variables': {
      eli5: 'A ticket machine that hands out numbers one at a time with a single press, so two people never get the same number, without a guard standing at the door.',
      industry: [
        'AtomicInteger/AtomicLong counters for requests, IDs, rate limits.',
        'LongAdder for very high-contention counters (metrics).',
        'compareAndSet loops for lock-free updates.',
      ],
      def: 'java.util.concurrent.atomic classes use hardware compare-and-swap (CAS) to make single-variable read-modify-write operations atomic without locking (incrementAndGet, compareAndSet).',
      scenarios: [
        'Shared counters incremented by many threads',
        'Lock-free updates of a single value',
        'Generating sequence numbers in-process',
      ],
      scale: 'Great for one variable. For invariants spanning several variables, use a lock.',
    },
    'Deadlock prevention': {
      eli5: 'Two people in a narrow corridor, each waiting for the other to step back. Agree a rule, like “the one going north always steps back”, and the standoff never happens.',
      industry: [
        'Money transfers that lock two accounts.',
        'Database transactions locking rows in different orders.',
        'Thread dumps (jstack) showing “Found one Java-level deadlock”.',
      ],
      def: 'A deadlock happens when threads hold locks while waiting for each other’s locks in a cycle. Prevent it by acquiring locks in a global order (e.g. by account ID), using tryLock with timeouts so no thread waits forever, or holding fewer locks at once. In a live JVM a thread dump (jstack) prints “Found one Java-level deadlock”. Related: livelock (threads keep reacting, no progress) and starvation (a thread never gets a turn).',
      scenarios: [
        'Code that locks two or more resources',
        'Threads hang forever under load',
        'Transfers between pairs of entities',
      ],
      scale: 'Lock ordering is the standard interview answer; timeouts are the safety net.',
    },
  },
  scenarios: [
    (pick) => {
      const what = pick(['the last seat in a show', 'the last parking spot', 'the last unit of a product']);
      return {
        q: `Two threads run: if (isAvailable(x)) reserve(x); for ${what} at the same moment. Both see “available” and both reserve.`,
        answer: 'synchronized / lock',
        hint: 'Check and act must be one indivisible step.',
        steps: ['This is a check-then-act race.', 'Both checks happen before either reserve.', 'Make check+reserve atomic with a lock (or a DB constraint).', 'synchronized / lock.'],
        followups: [
          { q: 'Does synchronized guarantee which waiting thread goes first?', options: ['No: it gives mutual exclusion only, with no ordering or fairness guarantee', 'Yes, FIFO', 'Yes, by thread priority', 'Only for static methods'], why: 'Use a fair ReentrantLock if arrival order matters.' },
          { q: 'Your app runs on 5 servers. Is a Java lock enough?', options: ['No: it only protects one JVM; use a DB row lock/constraint or a distributed lock', 'Yes', 'Yes, if it’s static', 'Only with volatile'], why: 'In-process locks don’t coordinate across machines.' },
        ],
      };
    },
    () => ({
      q: 'A background worker loops while (running) { … }. Another thread sets running = false to stop it, but the worker never stops on some machines.',
      answer: 'volatile',
      hint: 'The worker may be reading a stale cached value.',
      steps: ['The write isn’t guaranteed visible to the other thread.', 'Mark the flag volatile.', 'Reads then see the latest write.', 'volatile.'],
      followups: [
        { q: 'Can volatile fix a race condition?', options: ['No: it gives visibility, not atomicity of read-modify-write', 'Yes, always', 'Yes, for ints', 'Only with static fields'], why: 'Races need atomicity.' },
          { q: 'Does volatile make count++ thread-safe?', options: ['No: count++ is read-modify-write; use AtomicInteger or a lock', 'Yes', 'Only for long', 'Only on 64-bit JVMs'], why: 'Visibility isn’t atomicity.' },
      ],
    }),
    (pick) => {
      const n = pick(['10K', '50K', '100K']);
      return {
        q: `A request counter is incremented by ${n} requests per second across 200 threads with count++. The final number is always lower than the real count.`,
        answer: 'Atomic variables',
        hint: 'A single shared variable, read-modify-write.',
        steps: ['count++ is read, add, write: increments get lost.', 'One variable only.', 'AtomicLong.incrementAndGet() (or LongAdder) uses CAS.', 'Atomic variables.'],
        followups: [
          { q: 'How does AtomicInteger update without a lock?', options: ['Compare-and-swap: read, compute, write only if unchanged, otherwise retry', 'It blocks other threads at the OS level', 'It copies the whole object', 'It uses a hidden synchronized block'], why: 'CAS retries instead of blocking.' },
          { q: 'Under extreme contention, which counter scales better than AtomicLong?', options: ['LongAdder (spreads updates across cells, sums on read)', 'Integer', 'volatile long', 'synchronized long'], why: 'LongAdder trades exact instantaneous reads for throughput.' },
        ],
      };
    },
    () => ({
      q: 'transfer(a, b) locks account a then account b. Under load, a transfer from A to B and another from B to A hang forever.',
      answer: 'Deadlock prevention',
      hint: 'Two threads, two locks, opposite order.',
      steps: ['Thread 1 holds A, waits for B; thread 2 holds B, waits for A.', 'That’s a cycle: deadlock.', 'Always lock the lower account ID first.', 'Deadlock prevention via lock ordering.'],
      followups: [
        { q: 'Which tool shows a deadlock in a running JVM?', options: ['A thread dump (jstack / VisualVM)', 'A heap dump only', 'GC logs', 'The application log level'], why: 'Thread dumps list threads blocked on monitors and detect deadlocks.' },
      ],
    }),
    (pick) => {
      const ms = pick([100, 200, 500]);
      return {
        q: `A seat-hold service must lock two inventory rows. If the second lock isn’t available within ${ms} ms, it should release the first, wait briefly and retry, rather than block a request thread indefinitely.`,
        answer: 'ReentrantLock (tryLock)',
        hint: 'Which lock lets you give up?',
        steps: ['synchronized can wait forever and cannot be timed out.', 'ReentrantLock.tryLock(timeout) returns false instead of blocking.', 'On false, release the held lock and retry later.', 'ReentrantLock with tryLock.'],
        followups: [
          { q: 'What classic bug does ReentrantLock add that synchronized avoids?', options: ['Forgetting unlock() on an exception path; always unlock in finally', 'It can’t be re-entered by the same thread', 'It doesn’t guarantee visibility', 'It only works with static fields'], why: 'synchronized releases automatically; explicit locks do not.' },
          { q: 'Does a fair ReentrantLock make the app faster?', options: ['No: it grants the lock in arrival order, which usually lowers throughput but prevents starvation', 'Yes, always', 'It removes deadlocks', 'It makes volatile unnecessary'], why: 'Fairness is a trade-off, not a speed-up.' },
        ],
      };
    },
    () => ({
      q: 'A service freezes about once a week under load, and a restart fixes it. CPU is near zero while it is frozen. A thread dump (jstack) shows two threads BLOCKED, each waiting on a lock the other holds.',
      answer: 'Deadlock prevention',
      hint: 'Circular wait between threads holding locks.',
      steps: ['Zero CPU plus BLOCKED threads waiting on each other means a cycle.', 'jstack reports it as a Java-level deadlock.', 'Impose one global lock order, or use tryLock with a timeout.', 'Deadlock prevention.'],
      followups: [
        { q: 'Which is NOT a deadlock-prevention technique?', options: ['Adding more threads to the pool', 'Global lock ordering', 'tryLock with timeout', 'Holding fewer locks at once'], why: 'More threads just give more victims.' },
        { q: 'Threads keep retrying and backing off in step, using CPU but making no progress. What is that called?', options: ['Livelock', 'Deadlock', 'Starvation', 'A memory leak'], why: 'Livelock: active but stuck; randomised back-off helps.' },
      ],
    }),
    (pick) => {
      const n = pick([3, 4]);
      return {
        q: `A seat map object has ${n} fields that must change together (bookedCount, availableCount, seatStatus[]). Readers sometimes see bookedCount updated but availableCount not yet.`,
        answer: 'synchronized / lock',
        hint: 'Several variables, one invariant.',
        steps: ['The invariant spans several fields.', 'Atomics protect only single variables.', 'Update and read them under the same lock.', 'synchronized / lock.'],
        followups: [
          { q: 'Many readers, few writers on this seat map. Which lock improves throughput?', options: ['ReadWriteLock (many concurrent readers, exclusive writer)', 'Two synchronized blocks', 'volatile on every field', 'No lock'], why: 'Read-write locks let reads proceed in parallel.' },
        ],
      };
    },
  ],
});
