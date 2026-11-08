SG.add({
  id: 'case-scheduler',
  ref: 'S22',
  section: 'HLD case studies',
  title: 'Design a distributed job scheduler',
  short: 'Job scheduler',
  blurb: 'Run millions of cron and one-off jobs on time, on any free worker, without skipping or double-running them.',
  intro: 'Scope: users register jobs (a binary or container in object storage, plus a cron schedule, a one-off time, or a DAG of dependencies); the system starts each run close to its scheduled time on any available worker, retries failures, and shows run status and logs. The NFRs: millions of runs a day with start times within a few seconds of schedule, a scheduler with no single point of failure, and a job never silently skipped. Exactly-once execution across machines isn’t achievable cheaply, so you promise at-least-once and make repeats harmless. The usual design: a job store indexed by (status, next_run_at); several schedulers that each own a partition under a lease; a pull-based queue with visibility timeouts and heartbeats feeding a worker pool; retries with backoff and a dead-letter queue; idempotent jobs; and fencing tokens so a stale worker can’t do damage.',
  options: {
    'Job store indexed by next run time': {
      eli5: 'A dhobi’s register sorted by delivery date. Each morning he reads only today’s page, not the whole book, and when a weekly customer’s clothes go out he writes next week’s date on a new line.',
      industry: [
        'A runs table with an index on (status, next_run_at), queried with WHERE status = ‘PENDING’ AND next_run_at <= now() LIMIT 1000.',
        'Cron expressions parsed (for example with cron-utils or Quartz) to compute the next fire time when a run is created or finishes.',
        'Quartz misfire policies and Airflow catch-up settings deciding whether missed runs fire late or are skipped.',
      ],
      def: 'Keep job definitions (schedule, binary location, retry policy) separate from runs. Each upcoming run is a row with next_run_at and status; an index on those columns lets a scheduler fetch only due runs in milliseconds instead of scanning everything. When a cron run is picked up, compute the following fire time from the expression (in the job’s time zone, handling DST) and insert that next run, so there is always exactly one pending run per schedule. Bumping next_run_at forward when a run is dispatched doubles as a timeout: if nothing completes it, it becomes due again. Partition the table by hash of job ID so polling spreads across shards.',
      scenarios: [
        'The scheduler scans the whole jobs table every minute',
        'Cron jobs must fire close to their time in the right time zone',
        'You must decide what happens to runs missed during an outage',
      ],
      scale: '10M runs/day ≈ 115/s on average, with spikes at :00 of each hour; an indexed range query returns due rows in milliseconds even with hundreds of millions of rows.',
    },
    'Partitioned schedulers with leases': {
      eli5: 'Five ticket checkers on a long train each own two coaches. If one goes home sick, his coaches are handed to someone else, but two checkers never punch the same coach.',
      industry: [
        'Each scheduler instance holding a lease (ZooKeeper, etcd or a DB row with expiry) on a set of job-table partitions.',
        'Postgres SELECT … FOR UPDATE SKIP LOCKED so several pollers can claim different due rows without blocking each other.',
        'Kubernetes CronJob controller and Airflow’s HA scheduler using leader election or row locks for the same reason.',
      ],
      def: 'One scheduler process is a single point of failure, but two schedulers polling the same rows dispatch every job twice. Split the job store into partitions and give each scheduler a lease on some of them; if a scheduler dies, its lease expires and another takes over its partitions within seconds. Within a partition, claim due rows atomically (conditional update of status from PENDING to QUEUED, or SKIP LOCKED) so even an overlap during a lease handover dispatches each run once. More partitions and schedulers scale polling linearly.',
      scenarios: [
        'A single scheduler box is a single point of failure',
        'Running two copies of the scheduler doubles every job',
        'Polling must scale beyond one machine',
      ],
      scale: 'Leases of 10–30 s give failover within that window; tens of partitions per scheduler spread millions of runs a day easily.',
    },
    'Pull queue with visibility timeout': {
      eli5: 'Cooks in a big kitchen take the next order slip from the rail when their hands are free. If a cook takes a slip and then disappears, the slip pops back onto the rail after ten minutes for someone else.',
      industry: [
        'SQS visibility timeouts, with workers calling ChangeMessageVisibility as a heartbeat for long jobs.',
        'RabbitMQ with prefetch=1 so a worker takes one job at a time and unacked messages are redelivered when it disconnects.',
        'Separate queues per job class (small, large, GPU) with timeouts suited to each, as in Jordan’s multi-level queues.',
      ],
      def: 'Schedulers push due runs onto a queue, and idle workers pull from it, so load balances itself: a busy worker simply doesn’t take more. When a worker takes a job, the message becomes invisible for a timeout; the worker heartbeats to extend it while running and deletes it on completion. If the worker crashes, the message reappears and another worker takes it. A partitioned log like Kafka fits badly here, because one long job blocks everything behind it in that partition while other consumers sit idle.',
      scenarios: [
        'Some workers idle while others have long backlogs',
        'A worker can die mid-job and the job must be picked up again',
        'Jobs vary from seconds to hours',
      ],
      scale: 'A worker pool of thousands of machines pulling from SQS or RabbitMQ handles thousands of dispatches per second; heartbeat every ~1/3 of the timeout.',
    },
    'At-least-once retries with idempotent jobs': {
      eli5: 'If the courier isn’t sure the parcel reached you, he comes again, and you just say “already got it” instead of paying twice. Each parcel has a number, so a second visit changes nothing.',
      industry: [
        'Each run carries a run_id used as an idempotency key for its side effects (UPSERT, payments with idempotency keys, “email already sent” table).',
        'Exponential backoff with jitter (1 s, 2 s, 4 s … capped) and a max-attempts policy per job.',
        'A dead-letter queue and a FAILED status with the error, alerting the owner instead of retrying forever.',
      ],
      def: 'Crashes, lost acks, timeouts and failovers all cause retries, so the system guarantees each run executes at least once, and possibly more. Make that safe by making jobs idempotent (same run ID gives the same result: upserts, dedupe tables, idempotency keys on external calls) or by tolerating rare repeats when harmless. Retries use exponential backoff with jitter so a downstream outage isn’t hammered, and after N attempts the run goes to a dead-letter queue and FAILED status for a human. Exactly-once would need distributed transactions across the scheduler, queue and every side effect, which is slow and usually impossible.',
      scenarios: [
        'An ack is lost and the queue redelivers a finished job',
        'A downstream outage makes thousands of jobs fail at once',
        'A job keeps crashing on bad input',
      ],
      scale: 'Backoff caps (for example 10 attempts over ~1 hour) bound retry load; a DLQ turns a poison job from infinite load into one alert.',
    },
    'Fencing tokens on job leases': {
      eli5: 'Each new shift guard gets a badge with a higher number. The godown door only opens for the highest badge it has seen, so a guard from an old shift who wanders back can’t get in.',
      industry: [
        'A lease service (etcd revision, ZooKeeper zxid, or a DB counter) issuing a monotonically increasing token with each job lease.',
        'Writes to the job’s output table guarded by WHERE fence_token < :token, rejecting stale writers.',
        'Martin Kleppmann’s well-known critique of TTL-only locks, which recommends fencing tokens for correctness.',
      ],
      def: 'A lock with a TTL stops two workers running the same job at the same time only if nobody pauses. A worker that stalls (GC pause, network partition) can lose its lease, another worker takes over, and the first then resumes and writes stale results. A fencing token fixes this: each lease grant comes with a higher number, and the storage or service receiving the job’s side effects rejects any write carrying an older token. Use it where concurrent runs would corrupt state; where outputs are idempotent, idempotency alone may be enough.',
      scenarios: [
        'A paused worker resumes after its lease expired and overwrites newer results',
        'Two runs of the same job must never both commit',
        'TTL locks alone have caused corrupted outputs',
      ],
      scale: 'One extra integer per lease and a conditional write per output; negligible cost compared with the jobs themselves.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick(['5 million', '20 million', '2 million']);
      const s = pick(['2 seconds', '5 seconds', '10 seconds']);
      return {
        q: `Interviewer: “Design a distributed job scheduler.” You estimate ${n} runs a day and require starts within ${s} of schedule and no single point of failure. The interviewer asks: “Can you promise every job runs exactly once?” Which design decision does your honest answer to that NFR lead to?`,
        answer: 'At-least-once retries with idempotent jobs',
        hint: 'What guarantee can you actually keep when acks get lost and machines die?',
        steps: [
          'Lost acks, crashes and failovers mean the system can’t always know whether a run finished.',
          'Choose “never skipped”: retry until confirmed, which is at-least-once.',
          'Make repeats harmless with a run_id idempotency key on side effects.',
          'Add backoff, max attempts and a DLQ so failures don’t retry forever.',
        ],
        followups: [
          { q: 'Why not just use two-phase commit to get exactly-once?', options: ['It would have to span the scheduler, queue and every external side effect, which is slow, fragile and often impossible (e.g. sending an email)', 'It is always fast', 'Queues forbid it', 'It gives at-most-once'], why: 'Exactly-once effects come from idempotency, not from distributed transactions.' },
          { q: 'Which matters more for the job store’s user-facing status page: strong consistency or availability?', options: ['Availability: status can lag a few seconds and be served from replicas', 'Strong consistency for every read', 'Neither', 'Only the dispatch path matters, not status'], why: 'Keep the strongly consistent work on the claim path; status reads can be eventually consistent.' },
        ],
      };
    },
    (pick) => {
      const rows = pick(['80 million', '300 million', '50 million']);
      return {
        q: `Every 30 seconds the scheduler runs SELECT * FROM jobs and evaluates each row’s cron expression in Java to see if it is due. With ${rows} job rows the pass takes 4 minutes, so hourly jobs start up to 5 minutes late, and the DB CPU sits at 90%.`,
        answer: 'Job store indexed by next run time',
        hint: 'Work out “when is it due next?” once, store it, and index it.',
        steps: [
          'Precompute each schedule’s next fire time and store one pending run row per job.',
          'Index (status, next_run_at) and fetch only rows with next_run_at <= now().',
          'When a run is dispatched, compute and insert the following run from the cron expression.',
          'Partition the table by hash of job ID so several pollers share the load.',
        ],
        followups: [
          { q: 'The scheduler was down for 2 hours. An hourly job missed two runs. What should happen?', options: ['Apply the job’s misfire policy: usually run once now and continue, or catch up if the owner asked for it', 'Run all missed runs at once, always', 'Silently skip them, always', 'Delete the job'], why: 'Misfire handling is a product decision; make it explicit per job.' },
        ],
      };
    },
    (pick) => {
      const pct = pick(['100%', 'about 80%']);
      return {
        q: `The scheduler runs on one VM. Last month it died during a kernel upgrade and no jobs ran for 40 minutes. The team then ran a second copy for redundancy, and ${pct} of jobs started executing twice.`,
        answer: 'Partitioned schedulers with leases',
        hint: 'Several schedulers, but each run claimed by exactly one.',
        steps: [
          'Split the job store into partitions and run several schedulers.',
          'Each scheduler holds a lease (etcd/ZooKeeper/DB) on its partitions; on failure another takes over within the lease TTL.',
          'Claim due runs atomically (UPDATE … SET status = ‘QUEUED’ WHERE status = ‘PENDING’, or SKIP LOCKED).',
          'Overlap during a handover can’t double-dispatch because the claim is conditional.',
        ],
        followups: [
          { q: 'What does SELECT … FOR UPDATE SKIP LOCKED add?', options: ['Concurrent pollers each take different unlocked due rows instead of blocking on or duplicating the same ones', 'It deletes locked rows', 'It makes reads eventually consistent', 'It sorts rows by time'], why: 'It turns a table into a safe multi-consumer work queue.' },
        ],
      };
    },
    (pick) => {
      const long = pick(['a 3-hour ETL job', 'a 90-minute report', 'a 2-hour ML training job']);
      return {
        q: `Due runs are written to a Kafka topic with 12 partitions, one worker per partition. When ${long} lands on a partition, hundreds of 5-second jobs queued behind it wait for hours, while other workers sit idle. When a worker crashes mid-job, nobody notices for a long time.`,
        answer: 'Pull queue with visibility timeout',
        hint: 'Let any free worker take the next job, and bring a job back if its worker goes quiet.',
        steps: [
          'Kafka orders and assigns work per partition, so one long job blocks the rest of that partition.',
          'Use a queue where idle workers pull one job at a time (SQS, RabbitMQ with prefetch 1).',
          'A taken job is invisible for a timeout; the worker heartbeats to extend it and deletes it on success.',
          'If heartbeats stop, the job reappears for another worker; long jobs can go to their own queue.',
        ],
        followups: [
          { q: 'Why heartbeat instead of setting a 4-hour visibility timeout for everything?', options: ['A crashed worker’s job would stay hidden for 4 hours; heartbeats keep the timeout short yet allow long runs', 'SQS forbids long timeouts', 'Heartbeats make jobs faster', 'It avoids idempotency'], why: 'Short timeout + heartbeat gives fast failure detection without killing long jobs.' },
        ],
      };
    },
    (pick) => {
      const p = pick(['90-second', '2-minute', '45-second']);
      return {
        q: `A worker holding a 60-second lease on a nightly billing job hits a ${p} GC pause. The lease expires, a second worker takes over and finishes the job correctly. Then the first worker wakes up and writes its stale, half-computed totals over the correct ones.`,
        answer: 'Fencing tokens on job leases',
        hint: 'The storage needs a way to tell an old lease holder from the current one.',
        steps: [
          'A TTL lock can’t stop a paused process from believing it still holds the lease.',
          'Issue a monotonically increasing token with every lease grant.',
          'Writes to the billing output carry the token, and storage rejects any token older than the latest seen.',
          'The stale worker’s write is refused; the newer result stands.',
        ],
        followups: [
          { q: 'Would idempotency alone have prevented this?', options: ['Not if the two runs compute different results from different states; fencing stops the stale writer', 'Yes, always', 'Only with Kafka', 'Only if both workers are on the same host'], why: 'Idempotency handles repeats of the same result; fencing handles stale, conflicting writers.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['40,000', '15,000', '120,000']);
      return {
        q: `A partner API goes down for 20 minutes. ${n} webhook-delivery jobs fail and are retried immediately in a tight loop, generating millions of requests that keep the partner down longer. One job with a malformed payload has been retried 2 million times since last week.`,
        answer: 'At-least-once retries with idempotent jobs',
        hint: 'Retry, but slower each time, and give up into a place humans look.',
        steps: [
          'Use exponential backoff with jitter so retries thin out and don’t arrive in sync.',
          'Cap attempts per job; after the cap, move it to a dead-letter queue with status FAILED and the error.',
          'Alert the owner on DLQ growth; poison inputs stop consuming capacity.',
          'Retries stay safe because each delivery carries the run_id as an idempotency key.',
        ],
        followups: [
          { q: 'Why add random jitter to the backoff?', options: ['Without it, all failed jobs retry at the same instants and hit the partner in synchronised waves', 'It makes jobs idempotent', 'It reduces storage', 'It sorts the queue'], why: 'Jitter spreads retries out in time.' },
        ],
      };
    },
  ],
});
