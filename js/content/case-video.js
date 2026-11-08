SG.add({
  id: 'case-video',
  ref: 'S6',
  section: 'HLD case studies',
  title: 'Design YouTube / Netflix',
  short: 'Video streaming',
  blurb: 'Upload huge videos reliably, process them asynchronously into adaptive streams, serve from the edge, and count views at scale.',
  intro: 'Two core flows: upload a video and watch it. The NFRs make it hard: files up to ~256 GB, first frame in ~500 ms even on a slow mobile link, 1M uploads/day and 100M+ daily viewers, and availability over consistency (a new video may take minutes to become watchable). Split the video into metadata (a small database row) and bytes (object storage). Upload with multipart pre-signed URLs and trust storage events, not the client. Process with an asynchronous DAG that segments at keyframes and transcodes each rendition in parallel. Play back through HLS/DASH manifests that let the player switch bitrate per segment. Serve everything from a CDN. Count views without hot-row updates.',
  options: {
    'Multipart upload to object storage': {
      eli5: 'Moving house with a tempo too small for everything: you send the furniture in many numbered trips straight to the new house, and the watchman there, not you, confirms everything arrived.',
      industry: [
        'S3 multipart upload / GCS resumable upload with pre-signed URLs per part, used by YouTube-style uploaders.',
        'S3 event notifications (or EventBridge) triggering a worker that marks the video “uploaded”.',
        'Clients retrying only failed parts, so uploads survive flaky networks.',
      ],
      def: 'The client first POSTs metadata (title, size), which creates a row with status “pending” and returns pre-signed URLs for each part. It uploads parts (5 MB–5 GB each, up to 10,000) directly to object storage, in parallel and retryable, then completes the upload. The storage event, not a client callback, updates the metadata to “uploaded” and starts processing, because a client can crash or lie.',
      scenarios: [
        'Files are far bigger than any API gateway body limit (e.g. 10 MB)',
        'Uploads take hours and connections drop',
        'Metadata must reliably reflect what is actually in storage',
      ],
      scale: 'Single PUT maxes at 5 GB; multipart allows objects up to 5 TB. App servers handle only small JSON, so bytes never cross them.',
    },
    'Async chunk-and-transcode DAG': {
      eli5: 'A big wedding kitchen: one cook cuts all the vegetables into portions, then ten cooks each make a different dish from every portion at the same time, and a supervisor ticks off each dish and remakes any that burn.',
      industry: [
        'Netflix and YouTube splitting sources into segments and encoding each segment × rendition in parallel.',
        'Orchestrators (Temporal, Step Functions, Airflow, Netflix Conductor) tracking every task with retries.',
        'Outputs: H.264/VP9/AV1 renditions from 240p to 4K, thumbnails, captions, then a manifest.',
      ],
      def: 'After upload, a pipeline splits the source at keyframes into short segments (2–10 s), fans out one task per segment per rendition (resolution/bitrate/codec), then joins: writes outputs to object storage, builds manifests and marks the video “ready”. Because it’s a DAG of small idempotent tasks, failures retry one task instead of the whole video, and a long film finishes in minutes. Upload parts (byte ranges) and playback segments (keyframe-aligned) are different things for different jobs.',
      scenarios: [
        'Transcoding a 3-hour source serially takes many hours',
        'A worker crash must not restart the whole video',
        'Many output formats and resolutions are needed per upload',
      ],
      scale: 'A 2-hour film in 4-second segments is ~1,800 segments × ~6 renditions ≈ 10K tasks; with enough workers it completes in minutes. Workers are stateless and autoscale on queue depth.',
    },
    'Adaptive bitrate manifests (HLS/DASH)': {
      eli5: 'Like a tap that the player can open wider or narrower every few seconds: on good Wi-Fi it pours 4K, on a crowded train it drops to 360p, and the video never stops.',
      industry: [
        'Apple HLS (.m3u8) and MPEG-DASH (.mpd) used by YouTube, Netflix, Hotstar and Prime Video.',
        'Players (ExoPlayer, AVPlayer, hls.js) measuring throughput and buffer and switching rendition per segment.',
        'Starting at a low bitrate for a fast first frame, then stepping up.',
      ],
      def: 'A manifest lists every rendition and the ordered segment URLs for each. The player downloads the manifest, starts with a rendition it can fetch quickly, and keeps choosing the next segment’s bitrate from measured bandwidth and buffer level. That gives a fast first frame on poor links and smooth playback when the network changes, which a single big MP4 can’t do.',
      scenarios: [
        'Viewers on 3G/4G as well as fibre',
        'Networks change mid-video (Wi-Fi to mobile)',
        'First frame must appear within ~500 ms',
      ],
      scale: 'A 2-second 4K segment (~5 MB) takes ~20 s on a 2 Mbps link, while a 360p segment (~150 KB) takes under a second, so per-segment switching is what makes the latency NFR reachable.',
    },
    'CDN for segments and manifests': {
      eli5: 'Instead of every customer travelling to the factory, popular sweets are stocked in the corner shop in every neighbourhood.',
      industry: [
        'Netflix Open Connect appliances inside ISPs; YouTube’s Google Global Cache.',
        'CloudFront/Akamai caching immutable segments with long TTLs and manifests with short ones.',
        'Pre-positioning a big release’s segments to edges before launch.',
      ],
      def: 'Serve segments and manifests from edge caches near viewers; object storage is only the origin. Segments are immutable, so they cache with long TTLs and very high hit ratios; popular titles can be pushed to edges ahead of demand, while the long tail is fetched from origin on a miss. This cuts latency and origin egress cost, which dominates the bill at video scale.',
      scenarios: [
        'Millions of viewers start the same title at the same time',
        'Origin egress cost is the biggest line on the bill',
        'Viewers are far from the storage region',
      ],
      scale: 'Video is most of internet traffic; a 95%+ edge hit ratio means origin serves only a few percent of bytes. Request coalescing at the edge stops thundering herds on cache misses.',
    },
    'Sharded counters for view counts': {
      eli5: 'Instead of one person at the gate clicking a counter for a stadium crowd, each entry gate has its own clicker, and someone adds up the clickers every minute.',
      industry: [
        'View events to Kafka, aggregated in stream processors (Flink/Spark) and flushed to the metadata store periodically.',
        'Redis INCR on N sub-keys per hot video (views:{id}:{0..N}) summed when read.',
        'YouTube showing approximate, delayed counts while fraud filtering runs.',
      ],
      def: 'Don’t run UPDATE videos SET views = views + 1 per play: a viral video turns its row into a lock hotspot. Emit a view event, aggregate in memory or a stream processor, and write totals every few seconds; or spread a hot counter across many sub-keys and sum them on read. Counts are eventually consistent, which matches the NFRs, and the event stream also feeds analytics and recommendations.',
      scenarios: [
        'A viral video gets tens of thousands of views per second',
        'Counts may lag by seconds but must not slow playback',
        'Views must be filtered for bots before they count',
      ],
      scale: 'One row handles a few hundred to a few thousand updates/s; batching 10 s of views into one write per video cuts writes by orders of magnitude.',
    },
  },
  scenarios: [
    (pick) => {
      const mbps = pick(['2 Mbps', '1.5 Mbps', '3 Mbps']);
      return {
        q: `Interviewer: “Design YouTube: 1M uploads/day, 100M daily viewers, videos up to 256 GB.” You write NFRs: availability over consistency for new uploads, support huge files, scale, and “first frame within 500 ms, even on a ${mbps} mobile connection”. Which design decision exists mainly because of that last NFR?`,
        answer: 'Adaptive bitrate manifests (HLS/DASH)',
        hint: 'Work out how long one 4K segment takes on that link.',
        steps: [
          'A 2-second 4K segment is ~5 MB; at ~2 Mbps that’s ~20 seconds before the first frame.',
          'You need the same video at several bitrates, and a way for the player to pick one per segment.',
          'A manifest lists renditions and segments; the player starts low and adapts.',
          'Adaptive bitrate streaming via HLS/DASH meets the latency NFR.',
        ],
        followups: [
          { q: 'Which NFR lets you process uploads asynchronously before they are watchable?', options: ['Availability over consistency: a new video appearing minutes later is acceptable', 'Strong consistency for uploads', 'Low-latency streaming', 'Durability of metadata'], why: 'Eventual visibility of new uploads lets heavy processing run in the background.' },
          { q: 'Why split “video” into metadata and bytes as separate entities?', options: ['They are stored differently: a small row in a database vs huge blobs in object storage', 'Metadata is larger than the video', 'Databases store video better', 'For no real reason'], why: 'Different size, access pattern and store; designs go wrong when they’re mixed.' },
        ],
      };
    },
    (pick) => {
      const pct = pick(['2%', '4%', '6%']);
      return {
        q: `Uploads go straight to S3 via multipart, and when finished the app calls POST /videos/{id}/complete to flip status to “uploaded”. About ${pct} of videos stay “pending” forever (the app was killed or the phone went offline before that call), and some scripts call /complete for objects that don’t exist.`,
        answer: 'Multipart upload to object storage',
        hint: 'Who actually knows that the object exists?',
        steps: [
          'Client callbacks are unreliable and can’t be trusted.',
          'Keep direct multipart upload with pre-signed part URLs.',
          'Subscribe a worker to the storage “object created” event to update metadata and start processing.',
          'The metadata now reflects what is really in storage.',
        ],
        followups: [
          { q: 'Why are upload parts not reused as playback segments?', options: ['Parts are arbitrary byte ranges sized for transfer; playback segments must start at keyframes and last a few seconds', 'They are identical', 'Players can’t read S3', 'Parts are encrypted'], why: 'Each chunking serves a different purpose.' },
        ],
      };
    },
    (pick) => {
      const hrs = pick(['3-hour', '6-hour', '10-hour']);
      return {
        q: `A creator uploads a ${hrs} livestream recording. One transcoder VM processes the whole file into all resolutions, taking most of a day; when the VM is preempted at 80%, the job restarts from zero. Creators complain videos take ages to go live.`,
        answer: 'Async chunk-and-transcode DAG',
        hint: 'Make the work small, parallel and individually retryable.',
        steps: [
          'Split the source at keyframes into short segments.',
          'Fan out one task per segment × rendition to many stateless workers.',
          'An orchestrator tracks tasks, retries failures individually, then builds manifests.',
          'Time to “ready” drops from hours to minutes, and failures cost one task.',
        ],
        followups: [
          { q: 'One rendition task fails permanently. What should the pipeline do?', options: ['Retry it, then publish the other renditions and mark that one missing for repair rather than blocking everything', 'Delete the whole video', 'Restart all tasks', 'Ignore it silently'], why: 'Partial availability with alerting beats all-or-nothing for long jobs.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['10 million', '25 million', '4 million']);
      const show = pick(['a new season of a hit series', 'a cricket highlights package', 'a blockbuster film release']);
      return {
        q: `${show[0].toUpperCase() + show.slice(1)} launches at 8 p.m.; ${n} viewers will press play within an hour. Today all segments come from one S3 region, origin egress is the biggest line on the bill, and a test launch saw the origin overwhelmed by identical requests.`,
        answer: 'CDN for segments and manifests',
        hint: 'Same immutable bytes, wanted by millions, all at once.',
        steps: [
          'Segments are immutable and requested identically by huge numbers of viewers.',
          'Serve them from edge caches near viewers with long TTLs; keep manifests on short TTLs.',
          'Pre-position the launch title at edges and coalesce misses so origin sees one request per object.',
          'Latency and egress cost both drop.',
        ],
        followups: [
          { q: 'What about the long tail of rarely watched videos?', options: ['Let them be fetched from origin on a miss and age out of the edge; don’t pre-push them', 'Push every video to every edge', 'Never use a CDN for them', 'Store them only in the CDN'], why: 'Edge capacity goes to what’s popular in each region.' },
        ],
      };
    },
    (pick) => {
      const vps = pick(['20,000', '50,000', '100,000']);
      return {
        q: `Each play runs UPDATE videos SET views = views + 1 on the metadata database. A viral video now gets ${vps} views per second; that row’s lock queue makes metadata reads for the watch page time out, which slows playback start for everyone watching it.`,
        answer: 'Sharded counters for view counts',
        hint: 'Exact, instant counts are not an NFR; fast pages are.',
        steps: [
          'Every play contends on one row, which becomes a hotspot.',
          'Emit view events to a log (or increment N sharded sub-counters in Redis).',
          'Aggregate and write totals every few seconds per video.',
          'Counts are eventually consistent; the watch path no longer touches that row.',
        ],
        followups: [
          { q: 'Where would search and recommendations get new video metadata and view counts from?', options: ['CDC / event streams from the metadata store and view log into the search index and analytics', 'Querying the primary database on every search', 'From the CDN logs only', 'From the client'], why: 'Derived systems subscribe to changes instead of loading the source of truth.' },
        ],
      };
    },
    (pick) => {
      const from = pick(['home Wi-Fi', 'office broadband', 'a hotel network']);
      return {
        q: `A viewer starts an episode in 1080p on ${from}, then walks out to an auto-rickshaw and switches to a weak 4G signal. The player keeps requesting 1080p segments, the buffer empties and the video freezes every 20 seconds.`,
        answer: 'Adaptive bitrate manifests (HLS/DASH)',
        hint: 'The choice of quality should be made again for every segment.',
        steps: [
          'The bandwidth changed but the rendition didn’t.',
          'With a multi-rendition manifest, the player re-estimates bandwidth and buffer for each segment.',
          'It steps down to 480p/360p segments to keep the buffer healthy, and steps back up later.',
          'Adaptive bitrate keeps playback smooth.',
        ],
        followups: [
          { q: 'Who decides which rendition to fetch next?', options: ['The client player, using measured throughput and buffer level', 'The transcoder', 'The metadata database', 'The CDN at upload time'], why: 'Only the client sees its live network conditions.' },
        ],
      };
    },
  ],
});
