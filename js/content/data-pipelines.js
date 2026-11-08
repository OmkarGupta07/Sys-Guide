SG.add({
  id: 'data-pipelines',
  ref: 'R8 R13 V1 V3 V4',
  section: 'Building blocks',
  title: 'Analytics, recommendations and big data',
  short: 'Data pipelines',
  blurb: 'Turning raw events into answers: stream vs batch, reconciliation, OLAP storage and two-stage recommendations.',
  intro: 'Analytics systems separate the write path (absorb a firehose of raw events) from the read path (answer aggregate queries fast). Stream processors like Flink aggregate events in time windows within seconds; batch engines like Spark recompute over full history and are the accurate fallback. Many real systems run both: streaming for freshness, a periodic batch job to reconcile. Aggregates and history live in column-oriented OLAP stores or partitioned Parquet files. Recommendations follow a similar split: cheap candidate generation narrows millions of items to hundreds, then an expensive ranker orders them.',
  options: {
    'Stream processing with windows': {
      eli5: 'A ticket counter clerk who keeps a running tally of tickets sold in the current minute and writes the total on the board the moment the minute ends.',
      industry: [
        'Ad click aggregation: Kafka/Kinesis → Flink tumbling 1-minute windows per ad ID.',
        'Uber surge pricing and Swiggy delivery ETAs from live event streams.',
        'Fraud signals computed over sliding windows of recent transactions.',
      ],
      def: 'Events flow through a durable log (Kafka, Kinesis) partitioned by key; a stream processor (Flink, Kafka Streams, Spark Structured Streaming) keeps per-key state in memory and emits results per window (tumbling, sliding, session), optionally with early partial results. Uses event time and watermarks to handle late events, and checkpoints state plus source offsets so it can recover.',
      scenarios: [
        'Metrics must be visible within seconds, not minutes',
        'Continuous high-volume events (clicks, views, payments)',
        'Real-time alerts or features computed over recent windows',
      ],
      scale: 'Scale by partitions: Kinesis shards take ~1 MB/s or 1,000 records/s each. Hot keys need a suffix (ad ID + 0..N) to spread across partitions, then re-merge.',
    },
    'Batch processing (Spark/MapReduce)': {
      eli5: 'The shop owner who, after closing, counts every bill from the whole day carefully. Slow and only once a day, but the total is exact.',
      industry: [
        'Nightly Spark jobs over data lakes on S3 or HDFS to build reports and ML training sets.',
        'Recomputing metrics after a bug by re-running over raw history.',
        'Hadoop MapReduce in older stacks; Spark and BigQuery in modern ones.',
      ],
      def: 'Process large bounded datasets in parallel: map (filter, extract, key) then shuffle and reduce (aggregate) across a cluster, reading and writing files in object storage. High throughput and simple to reason about and re-run, but latency is minutes to hours and each job has start-up overhead.',
      scenarios: [
        'Reports or models over months or years of history',
        'Recomputing or backfilling after logic changes',
        'Work where hours of latency are acceptable',
      ],
      scale: 'Handles petabytes by adding nodes; scheduling it every few minutes adds heavy overhead, so it is a poor fit for near-real-time.',
    },
    'Stream plus batch reconciliation': {
      eli5: 'The clerk keeps the live tally on the board, and every night the accountant recounts the bills and quietly corrects any number the clerk got wrong.',
      industry: [
        'Ad platforms: Flink for live dashboards, daily Spark over raw clicks in S3 to fix billing numbers.',
        'Lambda architecture (speed layer + batch layer) at LinkedIn and Twitter in the 2010s.',
        'Payment and usage-based billing systems that must be both live and exact.',
      ],
      def: 'Run the streaming path for freshness, and also dump raw events to object storage. A scheduled batch job recomputes the same aggregates from the raw data; a reconciler compares and overwrites differences and alerts if drift grows. A pure stream-only design is “Kappa”; batch + speed layers is “Lambda”; mixing them practically is fine.',
      scenarios: [
        'Numbers drive money (billing, payouts) and must be exact eventually',
        'You also need near-real-time views',
        'Bugs, bad deploys or late events can corrupt stream results',
      ],
      scale: 'Doubles some compute and logic, so use it when accuracy is worth it. Reconcile hourly or daily depending on business needs.',
    },
    'OLAP store with columnar partitions': {
      eli5: 'Instead of one giant register where you read every line, the library keeps a separate ledger per month, with each column (date, amount, shop) bound separately, so totals are quick to add up.',
      industry: [
        'ClickHouse, Apache Druid, Apache Pinot behind real-time dashboards (Uber, Flipkart, Zomato analytics).',
        'BigQuery, Snowflake and Redshift for warehouse queries.',
        'Parquet files in S3 partitioned by date (dt=2025-01-15/) queried by Athena, Trino or Spark.',
      ],
      def: 'Store analytics data column by column with compression, pre-aggregated where possible (ad ID, minute, count), and partitioned by time (plus a key such as advertiser) so queries scan only relevant partitions and columns. Separates read-heavy analytics from the write-optimised event store, so neither slows the other.',
      scenarios: [
        'Dashboards with GROUP BY over billions of rows must answer in under a second',
        'Queries usually filter by time range and a few columns',
        'Write and read workloads are interfering with each other',
      ],
      scale: 'Columnar compression often gives 5–10× smaller data; partition pruning can cut scans from terabytes to gigabytes. Too many tiny files or partitions hurts performance.',
    },
    'Two-stage recommendations': {
      eli5: 'A shop assistant first pulls 50 shirts in your size and style from a warehouse of 100,000, then carefully lays out the best 10 in order for you.',
      industry: [
        'YouTube’s candidate generation network then ranking network.',
        'Netflix, Amazon and Flipkart “recommended for you” and similar items.',
        'Instagram Explore and short-video feeds with retrieval then ranking stages.',
      ],
      def: 'Candidate generation cheaply retrieves a few hundred to a few thousand items from millions using collaborative filtering, embeddings with approximate nearest-neighbour search, co-watch graphs or popularity. A heavier ranking model scores those candidates with rich user, item and context features to predict engagement, then business rules re-rank (diversity, freshness, filtering seen items). Features and embeddings are built by batch and stream pipelines.',
      scenarios: [
        'Personalised lists from catalogues of millions within ~100–200 ms',
        'Ranking models are too expensive to run on every item',
        'Combining several retrieval sources (similar items, trending, followed creators)',
      ],
      scale: 'Scoring 10M items per request is impossible; retrieving ~500 by ANN in milliseconds and ranking those is routine. Cold-start users and items need popularity or content-based fallbacks.',
    },
  },
  scenarios: [
    (pick) => {
      const rate = pick(['10,000', '50,000', '200,000']);
      return {
        q: `An ad platform receives ${rate} clicks per second at peak. Advertisers want click counts per ad at 1-minute granularity, visible within seconds of the minute closing. Today a Spark job runs every 5 minutes and dashboards lag.`,
        answer: 'Stream processing with windows',
        hint: 'Freshness is the problem; batch start-up overhead limits how often you can run.',
        steps: ['Batch every few minutes can’t meet seconds-level freshness.', 'Put clicks on a partitioned stream keyed by ad ID.', 'A stream processor aggregates 1-minute windows in memory and writes results (with early partial results if wanted).', 'Stream processing with windows.'],
        followups: [
          { q: 'One celebrity ad’s clicks overload a single stream shard. What do you do?', options: ['Add a suffix to hot keys (ad ID + 0..N) to spread across shards, then merge per ad', 'Drop extra clicks', 'Make the shard bigger by config only', 'Switch to batch'], why: 'Key salting splits a hot key; the aggregator recombines it.' },
          { q: 'A Flink worker crashes mid-window. What lets it recover without losing clicks?', options: ['Stream retention plus committed offsets/checkpoints let it replay from where it left off', 'Nothing, the clicks are gone', 'The browser resends them', 'A bigger heap'], why: 'The durable log is the safety net; recovery re-reads events.' },
        ],
      };
    },
    (pick) => {
      const span = pick(['three years', 'five years', '18 months']);
      return {
        q: `Data science needs a training dataset built from ${span} of raw clickstream (about 400 TB in S3) every night, with joins against user and item tables. Results are needed by 6 a.m.; nobody needs them sooner.`,
        answer: 'Batch processing (Spark/MapReduce)',
        hint: 'Huge history, hours of latency are fine.',
        steps: ['The input is a large bounded dataset of history.', 'Latency of hours is acceptable.', 'A distributed batch job scans, joins and aggregates in parallel.', 'Batch processing with Spark.'],
        followups: [
          { q: 'Why not use a stream processor for this?', options: ['It’s a one-shot computation over years of history; batch is simpler and cheaper for bounded data', 'Streams can’t read S3', 'Batch is always faster per event', 'Streams don’t support joins'], why: 'Pick batch for bounded, latency-tolerant work.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['advertiser invoices', 'creator payouts', 'API usage bills']);
      return {
        q: `Your Flink pipeline powers live dashboards, but ${what} are computed from the same counts. A bad deploy last week double-counted 0.3% of events for six hours, and late events are sometimes dropped. Finance requires the numbers to be exact by end of day.`,
        answer: 'Stream plus batch reconciliation',
        hint: 'Keep the live view, add an accurate safety net.',
        steps: ['Stream results can be wrong after bugs, crashes or late data.', 'Archive raw events to object storage as well.', 'A daily batch job recomputes and a reconciler fixes differences and alerts.', 'Stream plus batch reconciliation.'],
        followups: [
          { q: 'Is mixing streaming and batch “wrong” because it’s neither pure Lambda nor Kappa?', options: ['No: these are guidelines, and a practical hybrid is common', 'Yes, you must pick one', 'Yes, Kappa forbids batch', 'Only allowed with Hadoop'], why: 'Interviewers reward practical trade-offs over textbook purity.' },
        ],
      };
    },
    (pick) => {
      const rows = pick(['8 billion', '30 billion', '100 billion']);
      return {
        q: `Advertiser dashboards run GROUP BY ad_id, minute queries directly on a Cassandra table of ${rows} raw click events. Queries take 40 seconds and slow down event ingestion. The target is under 1 second.`,
        answer: 'OLAP store with columnar partitions',
        hint: 'A write-optimised event store is the wrong shape for aggregate reads.',
        steps: ['Range scans and aggregations over raw rows are slow on a write-optimised store.', 'Pre-aggregate and store results in a column-oriented OLAP store partitioned by time.', 'Separating read and write paths also isolates faults and contention.', 'An OLAP store with columnar partitions.'],
        followups: [
          { q: 'What partitioning helps most for “last 7 days for my ads” queries?', options: ['Partition by time and shard by advertiser so queries prune to a few partitions', 'Partition by a random UUID', 'One partition for everything', 'Partition by ad title'], why: 'Prune on the filters queries actually use.' },
        ],
      };
    },
    (pick) => {
      const items = pick(['10 million', '50 million', '200 million']);
      return {
        q: `A shopping app wants a personalised “for you” row from ${items} products, returned within 150 ms. The ranking model uses hundreds of features and takes about 1 ms per item.`,
        answer: 'Two-stage recommendations',
        hint: 'Do the math: 1 ms per item times the catalogue.',
        steps: ['Scoring every item would take hours per request.', 'Retrieve a few hundred candidates cheaply (embeddings + ANN, co-purchase, trending).', 'Run the heavy ranker only on those, then apply business rules.', 'Two-stage recommendations.'],
        followups: [
          { q: 'A brand-new user has no history. What do you recommend?', options: ['Popularity, location and content-based fallbacks until signals arrive', 'Nothing', 'Random items only', 'The same items as yesterday’s user'], why: 'Cold start needs non-personalised candidate sources.' },
        ],
      };
    },
    (pick) => {
      const tb = pick(['60 TB', '200 TB', '1 PB']);
      return {
        q: `Analysts query ${tb} of event logs stored in S3 as one folder of JSON files. A query for a single day still scans everything and costs hundreds of dollars on Athena.`,
        answer: 'OLAP store with columnar partitions',
        hint: 'Read less data: fewer files and fewer columns.',
        steps: ['Row-based JSON in one folder forces full scans.', 'Convert to Parquet (columnar, compressed).', 'Partition by date (and maybe event type) so queries prune.', 'Columnar partitioned storage.'],
        followups: [
          { q: 'Your job writes millions of 10 KB Parquet files per day. What problem appears?', options: ['Small-file overhead slows queries; compact into files of hundreds of MB', 'Parquet can’t store small files', 'Nothing', 'Files get encrypted'], why: 'Per-file overhead dominates with tiny files.' },
        ],
      };
    },
  ],
});
