SG.add({
  id: 'case-docs',
  ref: 'S12',
  section: 'HLD case studies',
  title: 'Design Google Docs',
  short: 'Collaborative docs',
  blurb: 'Many people typing in one document: a server that orders edits, sticky routing, an op log and live cursors.',
  intro: 'Scope: create documents, let several users edit the same document at once, show each other’s changes in real time, and show cursors and presence. The NFRs: edits appear for others within ~100–200 ms, every copy converges to the same text (eventual consistency, but guaranteed convergence), no acknowledged edit is ever lost, and the system scales to millions of open documents with up to ~100 editors each. The usual design: clients hold a WebSocket to a collaboration server; all editors of one document are routed to the same server (document affinity), which orders and transforms operations (OT); operations are appended to a durable log and periodically compacted into snapshots; cursors and presence travel the same socket but are never stored. Offline editing either replays pending operations through the server or uses CRDTs.',
  options: {
    'OT on a central document server': {
      eli5: 'Two people dictate changes to one typist. The typist hears “insert at word 5” after already adding a word earlier in the line, so she shifts it to word 6 before typing. Everyone then gets the typist’s copy.',
      industry: [
        'Google Docs (Jupiter-style OT): the server assigns a revision number to each operation and transforms late ones.',
        'Etherpad and many collaborative code editors using OT with a central server.',
        'Clients send operations tagged with the base revision they were made on, and apply the server’s transformed stream.',
      ],
      def: 'Each edit is an operation (insert “x” at 42, delete 3 at 10) tagged with the document revision it was based on. One server per document receives operations, orders them, transforms each against operations committed since its base revision so positions still make sense, assigns the next revision, and broadcasts. Clients apply their own edits optimistically and transform incoming ones against unacknowledged local edits. A single ordering point makes OT tractable and gives guaranteed convergence with low latency.',
      scenarios: [
        'Two users type at the same position at the same time',
        'All copies must end up identical',
        'Edits should feel instant locally and reach others in ~100 ms',
      ],
      scale: 'A document server handles thousands of ops/s across its documents; one document rarely exceeds tens of ops/s. Google Docs caps live editors around 100 per document.',
    },
    'Document-to-server affinity': {
      eli5: 'Everyone working on the same wedding planning goes to the same aunty’s house, not to different houses. Otherwise each house would have a different guest list.',
      industry: [
        'Consistent hashing of document ID to collaboration servers, with a routing layer or gateway that looks up the owner.',
        'A coordination store (ZooKeeper/etcd or a lease table) recording which server currently owns each document.',
        'On server failure, leases expire and documents move to another server, which reloads from the snapshot + log.',
      ],
      def: 'OT needs one ordering point per document, so all WebSocket connections for one document must reach the same collaboration server. Route by document ID with consistent hashing (so adding servers moves few documents) and keep ownership explicit with a lease, so two servers never both think they own a document. When a server dies or the ring changes, clients reconnect, the new owner loads the latest snapshot and replays the log tail, and editing resumes. Scale out by adding servers; each holds many documents.',
      scenarios: [
        'Users editing the same document land on different servers',
        'Millions of documents are open at once',
        'A collaboration server crashes mid-session',
      ],
      scale: 'A server can hold ~50–100K WebSocket connections; millions of concurrent users means tens to hundreds of servers. Consistent hashing moves only ~1/N of documents when one is added.',
    },
    'Operation log + periodic snapshots': {
      eli5: 'A cricket scorer writes every ball in the scorebook. To know the score you don’t replay 300 balls each time; at every over end he writes the total, and you add only the balls since.',
      industry: [
        'Appending each committed operation (doc ID, revision, op, author, time) to a durable store such as Cassandra/DynamoDB or Postgres.',
        'Background compaction writing a full document snapshot every N operations or minutes, often to blob storage.',
        'Version history (“see changes from yesterday”) derived from the same log.',
      ],
      def: 'Persist every operation before acknowledging it to the client: the log is the source of truth and makes edits durable. Loading a document means reading the latest snapshot plus the operations after it, so periodically compact the log into a snapshot and archive or trim old operations. This keeps load time and storage under control and gives version history for free. Acknowledge only after the durable write, so a server crash never loses an edit the user saw as saved.',
      scenarios: [
        'No acknowledged edit may be lost if a server crashes',
        'A document has millions of operations after a year',
        'Users want to see and restore earlier versions',
      ],
      scale: 'Ops are tiny (~100 bytes) but frequent; a busy doc creates millions per year. Snapshot every ~1,000 ops so loading replays at most ~1,000.',
    },
    'Ephemeral presence and cursors': {
      eli5: 'In a group video call you see who is present and who is speaking, but nobody writes down every time someone nodded. When the call ends, that information disappears.',
      industry: [
        'Coloured cursors and selection highlights in Google Docs, Figma and Notion.',
        'Cursor updates sent over the same WebSocket, throttled to ~10–20 per second per user.',
        'Presence held in collaboration-server memory (or Redis with short TTL), never written to the document store.',
      ],
      def: 'Cursor positions and “who is here” change constantly and are useless after a few seconds, so treat them as ephemeral state: keep them in memory on the document’s server, broadcast to other editors, drop them on disconnect or timeout, and never persist them. Cursor positions are expressed relative to the document revision and transformed like edits so they stay in the right place. Throttle updates to keep bandwidth sane with many editors.',
      scenarios: [
        'Users want to see others’ cursors and selections live',
        'Presence must vanish when someone closes the tab',
        'Writing cursor moves to the database is overloading it',
      ],
      scale: '100 editors × 10 cursor updates/s = 1,000 messages/s per doc, fanned out to 99 others: throttle and batch, and cap live editors per document.',
    },
    'CRDT-based sync for offline edits': {
      eli5: 'Each friend keeps their own copy of the trip plan in their notebook while hiking without signal. Every item has a unique tag, so when they meet, the notebooks can be merged in any order and end up the same.',
      industry: [
        'Yjs and Automerge powering offline-first editors and local-first apps.',
        'Figma using CRDT-inspired, server-authoritative merging for design objects.',
        'Apple Notes and similar apps syncing edits made on planes and trains.',
      ],
      def: 'A CRDT gives every character or element a unique, ordered identity, so concurrent edits merge correctly in any order without a central server transforming them. That suits long offline periods, peer-to-peer sync and multi-region writes. The costs are metadata overhead (IDs and tombstones for deleted text) that needs garbage collection, and more complex rich-text semantics. With OT, offline edits work only for shorter gaps: the client keeps pending operations with their base revision and the server transforms them on reconnect, which becomes expensive and conflict-prone after hours of divergence.',
      scenarios: [
        'Users edit for hours offline and must merge cleanly later',
        'There is no single server to order operations (peer-to-peer or multi-region)',
        'You can afford extra metadata per character',
      ],
      scale: 'CRDT metadata can be several times the document text size; tombstone compaction is essential for long-lived documents.',
    },
  },
  scenarios: [
    (pick) => {
      const editors = pick(['20', '50', '100']);
      return {
        q: `Interviewer: “Design Google Docs.” You write NFRs: edits visible to others within ~200 ms, every user ends up with identical text, no acknowledged edit is lost, and up to ${editors} simultaneous editors per document. Which decision delivers the “identical text, low latency” pair?`,
        answer: 'OT on a central document server',
        hint: 'Someone has to decide the order of concurrent edits.',
        steps: [
          'Locks would make typing wait on the network, which breaks the latency NFR.',
          'Clients apply edits instantly and send operations with their base revision.',
          'One server per document orders operations and transforms late ones so positions stay correct.',
          'Broadcasting the ordered stream makes every copy converge.',
        ],
        followups: [
          { q: 'What consistency model fits a collaborative editor?', options: ['Eventual consistency with guaranteed convergence: copies may differ for a moment but always end identical', 'Strong consistency with a lock per keystroke', 'No consistency needed', 'Read-your-writes only'], why: 'Users tolerate a brief lag but not permanently different documents.' },
          { q: 'Why is “last write wins” on the whole document wrong?', options: ['Concurrent edits to different parts would silently erase each other', 'It is too slow', 'It needs a CRDT', 'It is fine for text'], why: 'Merging at the operation level preserves everyone’s work.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['12', '30', '60']);
      return {
        q: `You run ${n} collaboration servers behind a round-robin load balancer. Two people editing the same document get connected to different servers; each server orders operations independently, and their screens drift apart after a few minutes of editing.`,
        answer: 'Document-to-server affinity',
        hint: 'OT assumes exactly one ordering point per document.',
        steps: [
          'Round-robin spreads one document’s editors across servers.',
          'Route by document ID (consistent hashing) so all its connections reach one server.',
          'Make ownership explicit with a lease so two servers never both own it.',
          'On failure, the new owner loads snapshot + log and clients reconnect.',
        ],
        followups: [
          { q: 'Why consistent hashing rather than docId mod N?', options: ['Adding or removing a server moves only ~1/N of documents instead of almost all', 'It is more secure', 'It balances CPU perfectly', 'mod N can’t handle strings'], why: 'Every moved document means reconnecting all its editors.' },
        ],
      };
    },
    (pick) => {
      const mins = pick(['30 seconds', '2 minutes', '5 minutes']);
      return {
        q: `To save database writes, collaboration servers keep the document in memory and flush it every ${mins}. A server crashes, and users lose edits they saw on screen as saved. Separately, a two-year-old document now takes 40 seconds to open because it replays every operation since creation.`,
        answer: 'Operation log + periodic snapshots',
        hint: 'Two problems: durability before ack, and how much history to replay.',
        steps: [
          'Append each operation to a durable log before acknowledging it.',
          'Periodically compact the log into a full snapshot (e.g. every ~1,000 ops).',
          'Open = latest snapshot + operations after it.',
          'Old operations can be archived; version history comes from snapshots and the log.',
        ],
        followups: [
          { q: 'Which store suits the operation log?', options: ['A write-optimised store partitioned by document ID, ordered by revision (e.g. Cassandra/DynamoDB)', 'An in-memory cache only', 'A search index', 'A CDN'], why: 'Append-heavy, read by document in revision order.' },
        ],
      };
    },
    (pick) => {
      const qps = pick(['200,000', '500,000', '1 million']);
      return {
        q: `Every cursor movement is written to the documents database so other editors can query it. Cursor writes now run at ${qps} per second, far more than real edits, and stale cursors of people who closed the tab hang around in documents for hours.`,
        answer: 'Ephemeral presence and cursors',
        hint: 'Does anyone need yesterday’s cursor position?',
        steps: [
          'Cursors are short-lived and worthless after a few seconds.',
          'Keep them in the document server’s memory and broadcast over the WebSockets.',
          'Remove them on disconnect or after a short timeout.',
          'Throttle updates per user; nothing reaches the database.',
        ],
        followups: [
          { q: 'Another user inserts text above my cursor. How does my cursor stay on the right word?', options: ['Cursor positions are transformed against operations like edits are', 'Cursors are recomputed from the DB', 'They jump, users accept it', 'Lock the paragraph'], why: 'A position is only meaningful relative to a revision.' },
        ],
      };
    },
    (pick) => {
      const hrs = pick(['six-hour flights', 'week-long field trips without internet', 'long train journeys']);
      return {
        q: `Your users are researchers who edit shared notes during ${hrs}, then reconnect. With your OT design, reconnecting clients send hundreds of pending operations based on very old revisions; transforms are slow and some merges produce garbled paragraphs. The product must become offline-first.`,
        answer: 'CRDT-based sync for offline edits',
        hint: 'Long divergence without a central ordering point.',
        steps: [
          'OT handles short disconnects, but long divergence means huge transform chains.',
          'A CRDT gives each element a unique identity, so edits merge in any order.',
          'Devices sync whenever connected; the server becomes a relay and store.',
          'Accept metadata overhead and plan tombstone garbage collection.',
        ],
        followups: [
          { q: 'Main cost of CRDTs compared with OT?', options: ['Extra metadata (IDs, tombstones) per element and trickier garbage collection', 'They need a central server', 'They can’t converge', 'They are slower to type in locally'], why: 'Convergence without a coordinator is paid for in metadata.' },
        ],
      };
    },
    (pick) => {
      const users = pick(['10 million', '30 million', '5 million']);
      return {
        q: `At peak, ${users} users have documents open. Each WebSocket server holds ~50K connections. Product asks how you will add servers on Monday mornings without breaking documents that are being edited, and how a server crash affects users.`,
        answer: 'Document-to-server affinity',
        hint: 'Scale out by moving documents, not by splitting them.',
        steps: [
          'Divide users by connections per server to get a fleet of hundreds of servers.',
          'Consistent hashing on document ID means a new server takes over only a small slice of documents.',
          'Moved or orphaned documents: clients reconnect, the new owner loads snapshot + log tail.',
          'Leases prevent two owners during the handover.',
        ],
        followups: [
          { q: 'What must clients do to survive a server switch without losing typing?', options: ['Keep unacknowledged ops locally and resend them with their base revision after reconnecting', 'Reload the page and discard edits', 'Lock the document', 'Nothing, the old server forwards them'], why: 'Client-side pending ops plus the durable log make handover safe.' },
        ],
      };
    },
  ],
});
