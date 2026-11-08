SG.add({
  id: 'case-drive',
  ref: 'S17',
  section: 'HLD case studies',
  title: 'Design Dropbox / Google Drive',
  short: 'File sync',
  blurb: 'Upload 50 GB files, sync every device quietly, keep versions, and never silently lose someone’s edit.',
  intro: 'Scope: users upload and download files, a desktop client keeps a local folder in sync with the cloud across all their devices, files and folders can be shared, and recent versions are kept. The NFRs: availability over consistency for reads (seeing an old version for a few seconds is fine), files up to ~50 GB with resumable uploads, fast transfers, and very high sync integrity (eventually every device holds exactly what the server holds, and no edit is silently lost). The usual design: bytes live in blob storage as content-addressed chunks uploaded directly with pre-signed URLs; a metadata database is the source of truth for files, versions and chunk lists; devices sync by reading a change log from a saved cursor; concurrent edits become conflicted copies; and sharing uses permissions inherited down the folder tree. Day 68 covered the upload mechanics; this lesson is the whole system around them.',
  options: {
    'Content-addressed chunks with dedup': {
      eli5: 'A tiffin service that numbers every dabba by what’s inside. If your new order has nine dabbas the kitchen already packed yesterday, only the one new dabba gets cooked and sent.',
      industry: [
        'Dropbox splitting files into blocks (historically 4 MB) named by their SHA-256 hash, and uploading only blocks the server lacks.',
        'Rolling-hash (Rabin) content-defined chunking in rsync-style tools and backup systems, so inserting bytes doesn’t shift every later chunk.',
        'S3 multipart upload with pre-signed URLs per part, so a 50 GB file resumes from the last missing part.',
      ],
      def: 'The client splits each file into chunks (a few MB), hashes each one, and asks the server which hashes it already has; only missing chunks are uploaded, directly to blob storage via pre-signed URLs. A file version is then just an ordered list of chunk hashes. This gives resumable uploads (retry only missing chunks), delta sync (an edit re-sends only changed chunks), parallel transfers, and dedup across versions and even users, since identical chunks are stored once. Fixed-size chunks are simple; content-defined chunking keeps boundaries stable when bytes are inserted mid-file.',
      scenarios: [
        'A 50 GB upload must survive a dropped connection',
        'A one-line edit to a 1 GB file must not re-upload 1 GB',
        'Many versions or users share mostly identical bytes',
      ],
      scale: '50 GB at 100 Mbit/s is over an hour, so resume is mandatory. 4 MB chunks mean ~12,500 chunks per 50 GB file; SHA-256 collisions are practically impossible.',
    },
    'Metadata DB with versioned commits': {
      eli5: 'The godown keeps sacks on shelves, but the ledger at the counter says which sacks make up each customer’s order and which order is the latest. If it isn’t in the ledger, it isn’t delivered.',
      industry: [
        'Dropbox’s metadata layer (originally MySQL, sharded by namespace) mapping paths to versions and block lists, separate from the block store.',
        'Tables like files(file_id, name, parent_id, latest_version), file_versions(file_id, version, chunk_hashes, created_at) and chunks(hash, location).',
        'Google Drive keeping revision history so a user can restore yesterday’s spreadsheet export.',
      ],
      def: 'Bytes and metadata live in different stores: blobs in object storage, and file names, folders, versions and chunk lists in a database that is the single source of truth. An upload is ordered so failures are harmless: upload chunks first, record their locations, and only then commit a new file version row pointing at them; a crash leaves orphan chunks (cleaned by GC), never a version that references missing bytes. Each commit bumps the version number, which gives ordering, history (keep N days of versions cheaply, since versions share chunks) and the base for conflict checks. Metadata for one user or shared folder is sharded together.',
      scenarios: [
        'A client crashes between uploading chunks and saving the file',
        'Users must restore any version from the last 30 days',
        'You must decide what goes in blob storage and what in a database',
      ],
      scale: '~1B uploads/edits a day ≈ 12K commits/s; metadata rows are tiny compared with bytes, so a sharded SQL or NoSQL store handles it, partitioned by user or shared-folder namespace.',
    },
    'Change log with device cursors': {
      eli5: 'The society notice board has numbered notices. Each flat writes down the last number it read, so after a holiday it reads from notice 214 onwards and misses nothing, including “notice 210 is cancelled”.',
      industry: [
        'Dropbox’s /list_folder with a cursor plus a longpoll endpoint that just says “changes exist”, after which the client pulls.',
        'Google Drive’s changes.list with a page token, and push notifications to wake clients.',
        'A per-namespace ordered journal (DB table or Kafka topic) of create, edit, move and delete events.',
      ],
      def: 'Every committed change to a namespace (a user’s files or a shared folder) is appended to an ordered log with a sequence number. Each device stores the cursor of the last entry it applied and asks “what changed after cursor X?”, getting edits, moves and deletes in order; a brand-new device starts from a snapshot and then follows the log. To avoid millions of devices polling hard, a lightweight notification channel (long poll, or push) only says “something changed”, and the client then pulls via the cursor. A periodic reconciliation compares local fingerprints with the server and repairs any drift.',
      scenarios: [
        'Devices miss deletes or renames when syncing by “updated after timestamp”',
        'A laptop comes back online after two weeks offline',
        'Millions of idle devices must learn about changes without hammering the API',
      ],
      scale: 'Polling 10M devices every 10 s is 1M requests/s, almost all empty; a long-poll notifier holds cheap idle connections and only changed namespaces trigger real reads.',
    },
    'Conflicted copy on stale base version': {
      eli5: 'Two cousins both edit the family recipe notebook photocopy while travelling. When they return, Nani doesn’t tear up either page; she keeps both, labelled with their names, and lets them merge.',
      industry: [
        'Dropbox’s “report (Asha’s conflicted copy 2026-03-04).docx” files.',
        'Optimistic concurrency: commit succeeds only if the client’s base version equals the server’s latest version.',
        'Google Docs avoiding the problem for its own formats with real-time operational transforms, which binary files can’t use.',
      ],
      def: 'Every edit carries the version it was based on. The metadata DB commits it only if that base is still the latest (a conditional write); otherwise another device changed the file first. Because files are arbitrary binaries, the server can’t merge them, so it saves the losing edit as a separate “conflicted copy” file (copying the chunk list, not the bytes) and syncs both, letting the user resolve it. This keeps the integrity NFR: no edit is ever silently overwritten, which last-writer-wins by timestamp would do.',
      scenarios: [
        'Two people edit the same file while one is offline',
        'Last-writer-wins by timestamp has been losing users’ work',
        'Files are binary, so automatic merging is impossible',
      ],
      scale: 'Conflicts are rare (a tiny fraction of commits), so a conditional update per commit costs little; the conflicted copy reuses existing chunks, so it adds no blob storage.',
    },
    'Folder ACLs with inherited permissions': {
      eli5: 'In a school, being allowed into Building B means you can enter every classroom in it. The guard checks the building list, not a separate list for each room.',
      industry: [
        'Dropbox shared folders and Google Drive, where sharing a folder grants access to everything inside it.',
        'Google Zanzibar-style relationship tuples (user is viewer of folder; file’s parent is folder) with inheritance resolved by a service.',
        'Storing the top-level shared folder (namespace) ID on every row so a whole tree lives on one shard.',
      ],
      def: 'Permissions (viewer, editor, owner) are granted on files or folders and inherited by everything beneath. Checking access walks up the parent chain until it finds a grant; keeping each shared tree on one shard (keyed by namespace ID) and caching resolved permissions keeps this fast. The alternative is precomputing a flattened “who can see this file” list, which makes reads instant but turns a permission change on a big folder into thousands of writes and risks syncing to someone whose access was just revoked. The same resolution tells the sync system which users’ devices to notify of a change.',
      scenarios: [
        'A folder shared with a 200-person team gains a new member',
        'Moving a file into a shared folder must change who can see it',
        'Finding which devices to notify after a shared file changes',
      ],
      scale: 'Most files are never shared, so per-namespace grants are few; a deep tree means several parent lookups, so cache resolved ACLs (with invalidation on change) and colocate a namespace on one shard.',
    },
  },
  scenarios: [
    (pick) => {
      const size = pick(['50 GB', '20 GB', '35 GB']);
      const speed = pick(['100 Mbit/s', '50 Mbit/s']);
      return {
        q: `Interviewer: “Design Google Drive.” Your NFRs: availability over consistency for reads, files up to ${size}, resumable uploads, fast transfers, and high sync integrity. A user on ${speed} home broadband uploads a ${size} video and the Wi-Fi drops at 80%. Which design decision is mainly driven by the “large files + resumable” NFR?`,
        answer: 'Content-addressed chunks with dedup',
        hint: 'Do the upload-time arithmetic, then ask what must be retried after a failure.',
        steps: [
          `${size} over ${speed} takes well over an hour, so failures mid-upload are expected.`,
          'A single request also hits body limits (API gateways cap requests at around 10 MB).',
          'Split into hashed chunks uploaded directly to blob storage with pre-signed URLs; the server tracks which chunks exist.',
          'After the drop, the client asks which hashes are missing and sends only those.',
        ],
        followups: [
          { q: 'What does “availability over consistency” mean for this product, concretely?', options: ['A user may see the previous version of a file for a few seconds after someone edits it elsewhere, but reads never fail', 'Uploads can be lost if a server fails', 'Two users may overwrite each other silently', 'Files may be corrupted temporarily'], why: 'Brief staleness is acceptable; lost or corrupted data is not.' },
          { q: 'Why not route chunks through your own file service to S3?', options: ['It doubles bandwidth and server load for no benefit; pre-signed URLs let clients write directly to blob storage', 'S3 refuses traffic from servers', 'It is required for security', 'Servers cannot hash data'], why: 'Keep your servers on the metadata path and out of the byte path.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['3%', '5%', '1%']);
      return {
        q: `The desktop client syncs by calling GET /changes?since=<last timestamp> and comparing updated_at. Support tickets show ${n} of devices keep deleted files forever, miss renames, and occasionally skip edits made in the same second by two servers with slightly different clocks.`,
        answer: 'Change log with device cursors',
        hint: 'Timestamps on rows can’t express “this was deleted”, and clocks disagree.',
        steps: [
          'A deleted row has no updated_at to find, and clock skew makes timestamp windows leaky.',
          'Append every commit (create, edit, move, delete) to an ordered per-namespace log with a sequence number.',
          'Each device stores its cursor and asks for entries after it, applying them in order.',
          'Run periodic reconciliation (compare fingerprints) to repair any drift that slips through.',
        ],
        followups: [
          { q: 'A brand-new phone links to an account with 2 million files. Replay the log from the start?', options: ['No: give it a snapshot of current state plus a cursor, then follow the log from there', 'Yes, replay every event ever', 'Copy another device’s disk', 'Sync only files opened today, forever'], why: 'Snapshots bound catch-up time; the log carries changes after the snapshot.' },
        ],
      };
    },
    (pick) => {
      const devices = pick(['10 million', '25 million', '8 million']);
      const sec = pick(['10', '5', '15']);
      return {
        q: `${devices} desktop clients poll “any changes after my cursor?” every ${sec} seconds. Over 99% of responses are empty, yet the sync API needs a large fleet and the metadata DB replicas run hot. Users still want changes to show up within seconds.`,
        answer: 'Change log with device cursors',
        hint: 'Separate “is there anything new?” from “give me what is new”.',
        steps: [
          `${devices} ÷ ${sec} s is hundreds of thousands to millions of mostly empty requests per second.`,
          'Add a lightweight notifier: devices hold a long poll (or receive a push) that only fires when their namespace’s log advances.',
          'On a signal, the device pulls changes from its saved cursor as before.',
          'The cursor stays the source of correctness; notifications are just a hint and may be lost safely.',
        ],
        followups: [
          { q: 'Why is it fine if a notification is occasionally dropped?', options: ['The next periodic check or reconnect still reads from the cursor, so nothing is missed, only delayed', 'Clients never need the change', 'Notifications are stored forever', 'It is not fine; use exactly-once delivery'], why: 'Notify-then-pull makes the hint lossy and the log authoritative.' },
          { q: 'Is a WebSocket per device mandatory here?', options: ['No: seconds of delay is acceptable, so long polling or adaptive polling is simpler; push is an optimisation', 'Yes, files need millisecond updates', 'Yes, HTTP can’t carry file lists', 'No, email users instead'], why: 'Match the mechanism to the freshness the product actually needs.' },
        ],
      };
    },
    (pick) => {
      const who = pick(['Ravi on a flight and Meera in the office', 'two designers in Pune and Berlin', 'a lawyer on a train and her assistant']);
      const file = pick(['contract.docx', 'budget.xlsx', 'logo.psd']);
      return {
        q: `${who} both edit ${file}; one is offline. When the offline laptop reconnects, its upload overwrites the other edit because the server keeps whichever arrives last. Users report hours of lost work.`,
        answer: 'Conflicted copy on stale base version',
        hint: 'The server needs to know what version each edit started from.',
        steps: [
          'Each commit carries its base version; the server accepts it only if the base is still the latest.',
          'Here the base is stale, so the edit is concurrent with another one.',
          'Binary files can’t be merged automatically, so save it as a separate conflicted copy (reusing chunks) and sync both.',
          'No edit is silently lost, satisfying the integrity NFR.',
        ],
        followups: [
          { q: 'Why not resolve with last-writer-wins on device timestamps?', options: ['Clocks drift and it discards one user’s edit without telling anyone', 'Timestamps are too large to store', 'It is what Dropbox does', 'It needs a GPU'], why: 'Silent data loss violates the core promise of a sync product.' },
          { q: 'Does creating the conflicted copy duplicate the file’s bytes in blob storage?', options: ['No: it is a new metadata entry pointing to the same chunk hashes', 'Yes, every byte is copied', 'Yes, and compressed', 'Only for files over 1 GB'], why: 'Content addressing makes copies and versions nearly free.' },
        ],
      };
    },
    (pick) => {
      const team = pick(['200', '1,500', '60']);
      const depth = pick(['9', '12', '7']);
      return {
        q: `A company shares one root folder with ${team} employees; files sit up to ${depth} folders deep. Today every file stores its own list of allowed users, so adding one employee rewrites 4 million rows, and a file moved out of the folder stays visible to the old team for hours.`,
        answer: 'Folder ACLs with inherited permissions',
        hint: 'Grant at the folder, resolve on the way up.',
        steps: [
          'Store the grant once on the shared folder; children inherit it.',
          `Resolve access by walking up to ${depth} parents, keeping the namespace on one shard and caching results.`,
          'A move just changes parent_id, so the new permissions apply immediately.',
          'The same resolution decides which members’ devices get change notifications.',
        ],
        followups: [
          { q: 'What is the main risk of precomputing a flattened permission list per file?', options: ['Huge write amplification on folder changes, and stale lists may sync files to users whose access was revoked', 'Reads become slower', 'It uses no storage', 'Permissions can’t be cached'], why: 'Denormalising speeds reads but makes revocation slow and expensive.' },
        ],
      };
    },
    (pick) => {
      const d = pick(['30', '90', '180']);
      return {
        q: `The client uploads chunks to S3 and writes the file row in one step; when a laptop crashes halfway, other devices see a file whose last chunks don’t exist and fail to open it. Product also wants “restore any version from the last ${d} days” without storing every version in full.`,
        answer: 'Metadata DB with versioned commits',
        hint: 'Order the writes so a crash can only leave garbage, never a broken file.',
        steps: [
          'Upload all chunks first, then record their locations.',
          'Only then commit a new version row (file_id, version, chunk list) in the metadata DB, which other devices read.',
          'A crash before the commit leaves orphan chunks for a GC job, never a version pointing at missing bytes.',
          `Keeping ${d} days of versions is cheap because versions share unchanged chunks.`,
        ],
        followups: [
          { q: 'When can the GC delete a chunk?', options: ['When no live or retained version references it and it is older than a grace period (so in-flight uploads aren’t hit)', 'As soon as it is uploaded', 'Never', 'Whenever S3 is full'], why: 'Reference counting or mark-and-sweep with a grace window keeps GC safe.' },
        ],
      };
    },
    (pick) => {
      const size = pick(['1 GB', '800 MB', '2 GB']);
      return {
        q: `A user edits one paragraph in a ${size} log archive and the client re-uploads all ${size}; teammates’ devices then re-download all ${size}. Also, a popular ${size} onboarding video is uploaded separately by 40,000 employees.`,
        answer: 'Content-addressed chunks with dedup',
        hint: 'Name chunks by their contents and only move the ones the other side lacks.',
        steps: [
          'Split into chunks and hash each one; the version becomes a list of hashes.',
          'Upload and download only hashes the other side doesn’t have (delta sync).',
          'Identical chunks are stored once, so the 40,000 copies of the video cost one set of chunks.',
          'Use content-defined chunking so an insertion near the start doesn’t shift every later chunk.',
        ],
        followups: [
          { q: 'Why can cross-user dedup be a privacy concern?', options: ['“Already have this chunk” responses can reveal that someone else stored a specific file; limit dedup scope or hide it', 'Hashes leak passwords', 'Dedup corrupts files', 'It is never a concern'], why: 'Global dedup can act as a side channel; many systems dedup only within a user or tenant.' },
        ],
      };
    },
  ],
});
