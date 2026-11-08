SG.add({
  id: 'media-files',
  ref: 'R4 R10',
  section: 'Building blocks',
  title: 'Media pipelines and file sync',
  short: 'Media and files',
  blurb: 'Moving big files: direct uploads to blob storage, chunking, transcoding, CDNs and delta sync.',
  intro: 'Large files never travel through your app servers. Bytes go straight to object storage (S3/GCS) via pre-signed URLs, and only metadata lives in your database. Big uploads are split into chunks so they can run in parallel and resume after failure. Video then goes through an async pipeline: segment into a few seconds each, transcode into several bitrates, write a manifest, and serve through a CDN so the player can switch quality as the network changes. File sync (Dropbox) reuses chunks differently: fingerprint each chunk so only changed chunks move.',
  options: {
    'Pre-signed direct upload': {
      eli5: 'Instead of handing your parcel to the receptionist who walks it to the warehouse, the receptionist gives you a one-time gate pass and you drive straight to the warehouse yourself.',
      industry: [
        'YouTube/Instagram-style apps: client asks the API for a signed URL, then PUTs bytes directly to S3/GCS.',
        'Dropbox/Google Drive-style uploads of documents and photos.',
        'Profile picture and KYC document uploads in Indian fintech apps.',
      ],
      def: 'The client sends only metadata (name, size, type) to your service, which records a “pending” row and returns a short-lived signed URL scoped to one object key (and optionally content type/size). The client uploads directly to object storage. Completion is confirmed by a storage event notification (or the server verifying the object exists), not by trusting the client.',
      scenarios: [
        'Request bodies exceed gateway limits (AWS API Gateway caps at 10 MB)',
        'App servers are wasting bandwidth and CPU relaying file bytes',
        'Uploads must be authorised without exposing the bucket publicly',
      ],
      scale: 'Removes your servers from the data path entirely; object storage scales to huge throughput. URLs typically expire in minutes.',
    },
    'Chunked resumable upload': {
      eli5: 'Moving house with 500 numbered boxes instead of trying to carry the whole house at once. If the van breaks down, you only re-send the boxes that didn’t arrive.',
      industry: [
        'S3 multipart upload (parts of 5 MB+, up to 10,000 parts) and GCS resumable uploads.',
        'Dropbox and Google Drive desktop clients uploading multi-GB files.',
        'Video uploads from phones on patchy 4G.',
      ],
      def: 'Split the file on the client into fixed chunks (say 5–10 MB), upload them in parallel, and track which chunks have succeeded (in the metadata DB or via the storage API). After a disconnect, the client asks which parts exist and sends only the missing ones; the store assembles the final object.',
      scenarios: [
        'Files of tens of GB over unreliable networks',
        'Users must resume after closing the laptop or losing Wi-Fi',
        'Uploads should use the full available bandwidth via parallel parts',
      ],
      scale: '50 GB at 100 Mbps is ~70 minutes; without resume, any failure restarts from zero. Parallel parts often give several times the throughput of one stream.',
    },
    'Transcoding with adaptive bitrate (HLS/DASH)': {
      eli5: 'A restaurant that prepares the same dish in small, medium and large plates. When you’re in a hurry (slow network), the waiter quietly brings the smaller plate so you never wait.',
      industry: [
        'YouTube, Netflix, Hotstar: every upload becomes 240p…4K renditions in 2–10 second segments.',
        'Apple HLS and MPEG-DASH manifests listing segments per quality.',
        'Live cricket streams switching quality mid-match as mobile signal varies.',
      ],
      def: 'After upload, an async DAG of workers splits the video into short segments at keyframes, transcodes each segment into several resolutions/bitrates in parallel, stores them in object storage, and writes a manifest. The player downloads the manifest, starts with a low or estimated bitrate, and picks each next segment’s quality from measured bandwidth.',
      scenarios: [
        'Viewers on 3G and fibre must both start playback fast',
        'Network quality changes during playback',
        'Long videos must start in under a second without downloading the whole file',
      ],
      scale: 'Storage multiplies by the number of renditions; transcoding is CPU/GPU heavy but stateless and parallel per segment. A 4K segment on a 2 Mbps link can take ~20 s, so low renditions are essential.',
    },
    'CDN edge delivery': {
      eli5: 'Instead of every Bengaluru customer ordering from the one factory in Delhi, popular items are stocked in a local warehouse a few kilometres away.',
      industry: [
        'Netflix Open Connect boxes inside ISPs; YouTube’s Google Global Cache.',
        'CloudFront/Akamai serving video segments and manifests.',
        'Shared viral files or public downloads (software installers).',
      ],
      def: 'Edge servers near users cache popular content (video segments, manifests, images) so requests don’t travel to the origin region. Cuts latency and origin egress. Best for content many people read; less useful when each user mostly reads their own private files.',
      scenarios: [
        'A global audience is far from the storage region',
        'A small share of content gets most of the views',
        'Origin bandwidth bills are exploding',
      ],
      scale: 'Edge hit ratios of 90%+ are common for popular video. Costs real money, so weigh it: for private files read by their owner, a CDN may not pay off.',
    },
    'Chunk fingerprinting and delta sync': {
      eli5: 'When you correct one page of a 300-page book, you send your friend just that page with its page number, not the whole book again.',
      industry: [
        'Dropbox’s block-level sync: files split into blocks identified by content hash.',
        'rsync and Git use content hashing to send only what changed.',
        'Backup tools deduplicating identical blocks across users and versions.',
      ],
      def: 'Split files into chunks and identify each by a hash of its bytes (its fingerprint). The file’s metadata is an ordered list of chunk hashes. On a change, only chunks whose hashes differ are uploaded or downloaded; identical chunks (even across files or users) are stored once. Clients find changes by polling (adaptively) or reading a change log from a cursor, and run periodic reconciliation to repair drift.',
      scenarios: [
        'Small edits to large files must sync quickly',
        'Many users store identical files and storage cost matters',
        'Sync must be verifiable: compare hashes to detect corruption or drift',
      ],
      scale: 'Editing 1 MB inside a 2 GB file moves ~one chunk instead of 2 GB. Fixed-size chunks shift on inserts; content-defined chunking fixes that.',
    },
  },
  scenarios: [
    (pick) => {
      const sz = pick(['500 MB', '2 GB', '8 GB']);
      return {
        q: `Your upload API accepts ${sz} files in the POST body, goes through an API gateway with a 10 MB body limit, and the file service then re-uploads the bytes to S3. Uploads fail and the service’s network bill doubled.`,
        answer: 'Pre-signed direct upload',
        hint: 'Why are the bytes passing through your servers at all?',
        steps: ['The gateway limit blocks large bodies.', 'Relaying bytes through the service wastes bandwidth twice.', 'Send metadata to the service, get a signed URL, upload straight to storage.', 'Pre-signed direct upload.'],
        followups: [
          { q: 'How should the metadata row flip from “uploading” to “uploaded”?', options: ['A storage event notification (or server-side check of the object), not the client’s word', 'The client calls “done” and we trust it', 'A nightly scan only', 'The CDN tells us'], why: 'Trusting the client can leave metadata and storage inconsistent; verify from the store.' },
        ],
      };
    },
    (pick) => {
      const sz = pick(['20 GB', '50 GB', '120 GB']);
      return {
        q: `A video editor uploads ${sz} raw footage from a café over flaky Wi-Fi. Each time the connection drops, the upload restarts from 0%. Users want to close the laptop and continue tomorrow.`,
        answer: 'Chunked resumable upload',
        hint: 'Make progress survive failures.',
        steps: ['Single-request uploads lose everything on failure.', 'Split into parts and track which parts succeeded.', 'On resume, send only missing parts; parallel parts also speed it up.', 'Chunked resumable upload.'],
        followups: [
          { q: 'Why are upload chunks (5–10 MB, arbitrary byte ranges) different from streaming segments (2–10 s at keyframes)?', options: ['Upload chunks minimise request overhead; playback segments are cut for fast start and quality switching', 'They are the same thing', 'Upload chunks must be smaller', 'Streaming segments are only for audio'], why: 'Each chunking serves a different goal, so videos are chunked twice.' },
        ],
      };
    },
    (pick) => {
      const net = pick(['3G', 'a 2 Mbps hostel Wi-Fi', 'a crowded stadium’s mobile network']);
      return {
        q: `Your video app stores one 4K MP4 per upload. Users on ${net} wait 15–20 seconds before the first frame and playback keeps freezing. Product wants first frame in under 500 ms on any connection.`,
        answer: 'Transcoding with adaptive bitrate (HLS/DASH)',
        hint: 'One size can’t fit every network.',
        steps: ['One high-bitrate file is too heavy for slow links.', 'Segment and transcode into several bitrates asynchronously after upload.', 'The player reads a manifest and picks each segment’s quality from measured bandwidth.', 'Transcoding plus adaptive bitrate streaming.'],
        followups: [
          { q: 'A transcoding worker dies halfway through a video. What makes recovery clean?', options: ['Per-segment jobs in a queue/DAG with retries; idempotent outputs keyed by segment and rendition', 'Restart the whole upload from the user', 'Mark the video failed forever', 'Transcode on the viewer’s phone'], why: 'Stateless, idempotent per-segment work can simply be retried.' },
          { q: 'Which NFR justifies processing uploads asynchronously?', options: ['Availability over consistency: a new video can take minutes to become watchable', 'Strong consistency for uploads', 'Zero storage cost', 'Exactly-once playback'], why: 'Viewers can watch other content while the new video is processed.' },
        ],
      };
    },
    (pick) => {
      const region = pick(['Mumbai', 'São Paulo', 'Jakarta']);
      return {
        q: `All video segments are served from one storage region in the US. Viewers in ${region} see slow starts, and 5% of videos account for 80% of views. Egress from the origin is the biggest line on the cloud bill.`,
        answer: 'CDN edge delivery',
        hint: 'Popular, shared content far from the users.',
        steps: ['Distance adds latency to every segment request.', 'Views are concentrated on few popular videos, so caching works.', 'Edge caches near viewers serve segments and manifests.', 'CDN delivery.'],
        followups: [
          { q: 'For Dropbox-style private files that are mostly read by their owner, is a CDN a must?', options: ['Not necessarily: low reuse means low hit ratio, so cost may outweigh benefit', 'Yes, always', 'Yes, CDNs are free', 'No, CDNs can’t serve files'], why: 'CDNs pay off when many users read the same content.' },
        ],
      };
    },
    (pick) => {
      const sz = pick(['2 GB', '6 GB', '15 GB']);
      return {
        q: `A designer edits a few layers in a ${sz} Photoshop file stored in your sync app. Every save re-uploads the whole file and other devices re-download all of it, taking ten minutes.`,
        answer: 'Chunk fingerprinting and delta sync',
        hint: 'Most of the file didn’t change.',
        steps: ['Represent the file as a list of chunk hashes.', 'On save, hash chunks and compare with the stored list.', 'Upload and download only chunks whose hashes changed.', 'Delta sync with fingerprints.'],
        followups: [
          { q: 'How should the desktop client learn about remote changes?', options: ['Poll with adaptive frequency (or read a change log from a cursor) plus periodic reconciliation', 'A WebSocket per folder open forever is required', 'Re-download everything hourly', 'Ask the user to refresh'], why: 'Sync can tolerate seconds of delay; polling is simpler than persistent sockets, and reconciliation catches drift.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['10 million', '40 million', '90 million']);
      return {
        q: `A viral exam-notes PDF has been uploaded by ${n} separate users to your cloud drive. Storage is growing much faster than unique content, and the finance team asks why you store the same bytes millions of times.`,
        answer: 'Chunk fingerprinting and delta sync',
        hint: 'Identify content by what it is, not by who uploaded it.',
        steps: ['Identical bytes produce identical hashes.', 'Store each unique chunk once and reference it from many file entries.', 'Uploads of known chunks can even be skipped.', 'Content fingerprinting enables deduplication.'],
        followups: [
          { q: 'What risk does cross-user deduplication introduce?', options: ['Leaking whether a file exists (an attacker checks if a known file is “already uploaded”)', 'Files become larger', 'Hashes make downloads slower', 'It breaks chunking'], why: 'Dedup across users can reveal existence of content; many systems dedupe per user or add protections.' },
        ],
      };
    },
  ],
});
