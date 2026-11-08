SG.add({
  id: 'case-docs',
  ref: 'S12',
  section: 'HLD case studies',
  title: 'Design Google Docs',
  short: 'Collaborative docs',
  blurb: 'Many people typing in one document: a server that orders edits, sticky routing, an op log and live cursors.',
  intro: 'Scope: create and open documents, let several users edit the same document at once with changes visible to others in ~200 ms, show cursors and presence, keep version history with restore, and allow offline editing that syncs later; sharing, comments and mobile are out of scope. The NFRs: local edits feel instant (apply optimistically), every copy converges to the same text, no acknowledged edit is lost, and the service stays available. The core tension is low latency versus consistency. Estimation changes the focus: ~100M documents active a month, ~2% open at once is ~2M live sessions, and ~2M WebSockets at ~10 KB each is ~20 GB of RAM just for connections, so connection and session management is the bottleneck, not storage. The usual design: a WebSocket to a collaboration server that owns each open document, OT on that server to order and transform operations, an append-only op log with periodic snapshots, ephemeral presence, and CRDT-style merging where long offline periods matter.',
  options: {
    'OT on a central document server': {
      eli5: 'Two people dictate changes to one typist. The typist hears “insert at word 5” after already adding a word earlier in the line, so she shifts it to word 6 before typing. Everyone then gets the typist’s copy.',
      industry: [
        'Google Docs uses operational transformation (from the Jupiter/Wave lineage): the server assigns a version to each operation and transforms late ones.',
        'Etherpad and many collaborative code editors run OT with a central server.',
        'Clients send {docId, base version, op} over the WebSocket and apply the server’s broadcast {server version, transformed op}.',
      ],
      def: 'Each edit is an operation (insert “x” at 42, delete 3 at 10) tagged with the document version it was based on. One server per document receives operations, orders them, transforms each against the operations committed since its base version (N+1 … M) so positions still mean the same thing, assigns the next version and broadcasts. Example: text “AC”, user 1 inserts B at 1 and user 2 inserts D at 1 at the same time; applied naively the copies become “ABDC” and “ADBC”, but transforming user 2’s insert past user 1’s gives D at 2, and both see “ABDC”. Equal positions need a fixed tie-break such as client ID. Clients apply their own edits instantly and transform incoming ones against their unacknowledged local edits.',
      scenarios: [
        'Two users type at the same position at the same time',
        'All copies must end up identical',
        'Edits should feel instant locally and reach others in ~200 ms',
      ],
      scale: 'A transform should take under a millisecond; one document rarely exceeds tens of ops/s, and Google Docs lets about 100 people work in a file at once.',
    },
    'Document-to-server affinity': {
      eli5: 'Everyone working on the same wedding planning goes to the same aunty’s house, not to different houses. Otherwise each house would have a different guest list.',
      industry: [
        'Consistent hashing of document ID to collaboration servers, with a routing layer that sends every editor of a document to its owner.',
        'Ownership recorded in ZooKeeper or etcd (a lease), so two servers never both think they own a document.',
        'When a document goes idle, the owner writes a checkpoint and releases it; the next open can land anywhere.',
      ],
      def: 'OT needs one ordering point per document, so all WebSocket connections for one document must reach the server that owns it. Route by document ID with consistent hashing (so adding servers moves few documents) and keep ownership explicit with a lease. On a crash, the lease expires, clients reconnect, the new owner loads the latest snapshot and replays the log tail, and each client sends the last server version it saw and gets the ops since. The alternative is stateless servers that keep document state in Redis and share ops via pub/sub: more resilient to crashes, but an extra network hop on every keystroke; sticky ownership is simpler and faster, at the cost of a reconnect surge when a server dies.',
      scenarios: [
        'Users editing the same document land on different servers',
        'Millions of documents are open at once',
        'A collaboration server crashes mid-session',
      ],
      scale: '~2M live sessions ÷ ~50–100K WebSockets per server ≈ 20–40 servers before headroom; consistent hashing moves only ~1/N of documents when one is added.',
    },
    'Operation log + periodic snapshots': {
      eli5: 'A cricket scorer writes every ball in the scorebook. To know the score you don’t replay 300 balls each time; at every over end he writes the total, and you add only the balls since.',
      industry: [
        'An append-only op log (docId, version, clientId, op) in Postgres or Cassandra, partitioned by document and ordered by version.',
        'Snapshots of the full document every ~100 ops written to object storage, with the current document kept hot in Redis.',
        'Version history and “restore this version” built from the same snapshots and log.',
      ],
      def: 'Persist every operation before acknowledging it to the client: the log is the source of truth and makes edits durable. Opening a document means reading the latest snapshot plus the operations after it, so periodically compact the log into a snapshot and archive or trim old operations. This keeps load time and storage under control and gives version history almost for free. Acknowledge only after the durable write, so a server crash never loses an edit the user saw as saved.',
      scenarios: [
        'No acknowledged edit may be lost if a server crashes',
        'A document has millions of operations after a year',
        'Users want to see and restore earlier versions',
      ],
      scale: '2M sessions × ~3 keystrokes/s ≈ 6M ops/s × ~50 bytes ≈ 300 MB/s of log writes; bodies are ~100M × 200 KB ≈ 20 TB, and history is ~10× that.',
    },
    'Ephemeral presence and cursors': {
      eli5: 'In a group video call you see who is present and who is speaking, but nobody writes down every time someone nodded. When the call ends, that information disappears.',
      industry: [
        'Coloured cursors and selection highlights in Google Docs and Figma.',
        'Cursor updates that bypass OT and go best-effort over the same WebSocket or a pub/sub channel, throttled to at most one per ~100 ms per user.',
        'Presence kept in server memory or Redis with a TTL, refreshed by a heartbeat every ~10 s, never written to the document store.',
      ],
      def: 'Cursor positions and “who is here” change constantly and are useless after a few seconds, so treat them as ephemeral state: keep them in memory or a short-TTL Redis key, broadcast to the other editors, and let them expire when heartbeats stop. They don’t need OT’s guarantees; losing one update is fine because the next one replaces it. Positions are still expressed against a document version and shifted by incoming edits so cursors stay on the right word. Fan-out is O(n²) in the number of editors, so throttle updates and send only cursors inside each viewer’s visible area.',
      scenarios: [
        'Users want to see others’ cursors and selections live',
        'Presence must vanish when someone closes the tab',
        'Writing cursor moves to the database is overloading it',
      ],
      scale: '100 editors × 10 cursor updates/s = 1,000 messages/s per doc, each fanned out to 99 others: about 100K deliveries/s for one document unless you throttle and filter by viewport.',
    },
    'CRDT-based sync for offline edits': {
      eli5: 'Each friend keeps their own copy of the trip plan in their notebook while hiking without signal. Every item has a unique tag, so when they meet, the notebooks can be merged in any order and end up the same.',
      industry: [
        'Yjs and Automerge, CRDT libraries behind many offline-first and local-first editors.',
        'Figma using CRDT-inspired, server-authoritative merging for design objects.',
        'Hybrid editors that use OT (or a server order) for live sessions and CRDT-style merging for long offline periods.',
      ],
      def: 'A sequence CRDT (such as RGA or Logoot) gives every character a stable unique ID, so an insert says “put B after character X42” instead of “at position 1”, and a delete leaves a tombstone. These operations commute and are idempotent, so they merge correctly in any order, even twice, without a central server transforming them: good for long offline periods and peer-to-peer sync. The costs are metadata overhead and tombstones that keep growing; you can only garbage-collect them outside a retention window (for example 30 days or 1,000 versions) that offline clients may still refer to. With OT, offline works only for short gaps, because a client returning after hours sends hundreds of ops against an old version.',
      scenarios: [
        'Users edit for hours offline and must merge cleanly later',
        'There is no single server to order operations (peer-to-peer or multi-region)',
        'You can afford extra metadata per character',
      ],
      scale: 'CRDT metadata can be several times the document text size; tombstone garbage collection within a retention window is essential for long-lived documents.',
    },
  },
  scenarios: [
    (pick) => {
      const docs = pick([100, 50, 200]);
      const live = docs * 0.02; // millions of live sessions
      return {
        q: `Interviewer: “Design Google Docs.” You estimate ${docs}M documents active a month, ~2% open at any moment, ~3 keystrokes a second per active editor. NFRs: your own typing must feel instant, others see it within ~200 ms, every user ends with identical text, and no acknowledged edit is lost. Which decision delivers the “instant and identical” pair?`,
        answer: 'OT on a central document server',
        hint: 'Someone has to decide the order of concurrent edits, without making you wait for it.',
        steps: [
          `${docs}M × 2% ≈ ${live}M live sessions; × 3 keystrokes/s ≈ ${live * 3}M ops/s overall, but only tens per second per document.`,
          'Locking the document per keystroke would make typing wait on the network, which breaks “instant”.',
          'Clients apply edits locally at once and send ops with their base version.',
          'One server per document orders ops and transforms late ones, so the broadcast stream makes every copy converge.',
        ],
        followups: [
          { q: `With ~${live}M WebSockets at ~10 KB each, what is the first bottleneck to design for?`, options: [`Connections and session memory: ~${live * 10} GB just for sockets, spread over many servers`, `Document storage, because ${docs}M bodies won’t fit on disk`, 'CPU for transforms, because OT is expensive', 'Database reads when documents are opened'], why: 'Ops are tiny and bodies are a few tens of TB; holding millions of long-lived connections is the hard part.' },
          { q: 'What consistency model fits a collaborative editor?', options: ['Eventual consistency with guaranteed convergence: copies may differ for a moment but always end identical', 'Strong consistency with a lock per keystroke', 'Read-your-writes only, since each user sees their own edits', 'Last write wins on the whole document'], why: 'Users tolerate a brief lag but not permanently different documents, or lost edits.' },
        ],
      };
    },
    (pick) => {
      const text = pick([['AC', 'B', 'D', 'ABDC', 'ADBC'], ['PT', 'A', 'O', 'PAOT', 'POAT']]);
      return {
        q: `To skip the server, clients send ops straight to each other. The text is “${text[0]}”. User 1 inserts “${text[1]}” at position 1 and user 2 inserts “${text[2]}” at position 1 at the same moment; each applies its own op, then the other’s as received. One screen shows “${text[3]}”, the other “${text[4]}”, and they never fix themselves.`,
        answer: 'OT on a central document server',
        hint: 'A position only means something relative to the version it was made on.',
        steps: [
          'Send every op to one server for the document, tagged with its base version.',
          `The server commits user 1’s op first, then transforms user 2’s insert past it: “${text[2]}” at 1 becomes “${text[2]}” at 2.`,
          `It broadcasts the ordered, transformed ops, and both screens show “${text[3]}”.`,
          'Clients transform incoming ops against their own unacknowledged ones.',
        ],
        followups: [
          { q: 'Both inserts are at exactly the same position. How does the server choose which goes first?', options: ['A fixed, deterministic tie-break such as lower client ID first, so every copy decides the same way', 'Whichever client has the faster network', 'At random, since both are valid', 'It rejects one op and asks that user to retype'], why: 'Any rule works as long as every participant applies the same one.' },
          { q: 'How would you catch a convergence bug in production?', options: ['Periodically hash the server’s document and compare with sampled clients; any mismatch is a P0', 'Wait for users to report garbled text', 'Re-run all ops nightly and diff the output', 'Count WebSocket disconnects'], why: 'Divergence is silent, so you have to check for it; also track keystroke-to-remote-screen p95 (alert above ~500 ms) and transform time (under 1 ms).' },
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
          'Make ownership explicit with a lease in ZooKeeper/etcd so two servers never both own it.',
          'On failure, the new owner loads snapshot + log and clients reconnect.',
        ],
        followups: [
          { q: 'Why consistent hashing rather than docId mod N?', options: ['Adding or removing a server moves only ~1/N of documents instead of almost all', 'It is more secure', 'It balances CPU perfectly across servers', 'mod N can’t handle string IDs'], why: 'Every moved document means reconnecting all its editors.' },
          { q: 'The alternative is stateless servers with document state in Redis and ops shared over pub/sub. What do you trade?', options: ['Better crash resilience, but an extra network hop on every keystroke and a harder single ordering point', 'Lower latency, but more memory', 'Nothing; it is strictly better', 'Simpler code, but no version history'], why: 'Sticky ownership is simpler and faster; stateless survives crashes more gracefully. Either is defensible if you state the trade-off.' },
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
          'Periodically compact the log into a full snapshot (e.g. every ~100 ops) in object storage.',
          'Open = latest snapshot + operations after it, with the live document cached in Redis.',
          'Old operations can be archived; version history comes from snapshots and the log.',
        ],
        followups: [
          { q: 'Which store suits the operation log?', options: ['A write-optimised store partitioned by document ID and ordered by version (e.g. Cassandra, or Postgres at smaller scale)', 'An in-memory cache only, flushed on shutdown', 'A search index such as Elasticsearch', 'Object storage, one file per operation'], why: 'Append-heavy, read by document in version order.' },
          { q: 'A user clicks “restore yesterday’s version”. What does the system do?', options: ['Load the nearest snapshot before that time, replay ops up to it, and append the result as a new version', 'Delete every op after yesterday', 'Reload yesterday’s Redis backup', 'Ask every editor’s client for its copy'], why: 'Restoring is a new edit on top of the log, so history stays intact and other editors converge as usual.' },
        ],
      };
    },
    (pick) => {
      const qps = pick(['200,000', '500,000', '1 million']);
      return {
        q: `Every cursor movement goes through OT and is written to the documents database so other editors can query it. Cursor writes now run at ${qps} per second, far more than real edits, and stale cursors of people who closed the tab hang around for hours.`,
        answer: 'Ephemeral presence and cursors',
        hint: 'Does anyone need yesterday’s cursor position?',
        steps: [
          'Cursors are short-lived and worthless after a few seconds, and losing one update is harmless.',
          'Send them best-effort, outside OT, over the WebSocket or pub/sub; keep presence in memory or Redis with a TTL.',
          'Refresh presence with a heartbeat every ~10 s, so a closed tab disappears when its key expires.',
          'Throttle to at most one update per ~100 ms per user; nothing reaches the database.',
        ],
        followups: [
          { q: 'A company-wide doc has 2,000 people open at once. What breaks first with presence?', options: ['Fan-out: every cursor update goes to everyone else, which is O(n²); send only cursors in each viewer’s visible area and cap or summarise the rest', 'Redis runs out of memory for presence keys', 'OT transforms become slow', 'The op log fills up'], why: '2,000 × 1,999 deliveries per round is millions of messages; filter by viewport and show “+1,900 others”.' },
          { q: 'Another user inserts text above my cursor. How does my cursor stay on the right word?', options: ['Its position is shifted by incoming operations, like any position tied to a version', 'Cursors are reloaded from the database', 'It jumps, and users accept that', 'The paragraph is locked while I edit'], why: 'A position is only meaningful relative to a version.' },
        ],
      };
    },
    (pick) => {
      const hrs = pick(['six-hour flights', 'week-long field trips without internet', 'long train journeys']);
      return {
        q: `Your users are researchers who edit shared notes during ${hrs}, then reconnect. With your OT design, reconnecting clients send hundreds of pending operations based on very old versions; transforms are slow and some merges produce garbled paragraphs. The product must become offline-first.`,
        answer: 'CRDT-based sync for offline edits',
        hint: 'Long divergence without a central ordering point.',
        steps: [
          'OT handles short disconnects, but long divergence means huge transform chains.',
          'A sequence CRDT gives each character a unique ID, so “insert after X42” merges in any order.',
          'Devices sync whenever connected; the server becomes a relay and store, and live sessions can still use OT.',
          'Accept metadata overhead and garbage-collect tombstones outside a retention window.',
        ],
        followups: [
          { q: 'Main cost of CRDTs compared with OT?', options: ['Extra metadata (IDs, tombstones) per character that keeps growing until garbage-collected', 'They need a central server to order ops', 'They can diverge under concurrent edits', 'Typing locally becomes slower'], why: 'Convergence without a coordinator is paid for in metadata.' },
          { q: 'Why can’t you delete tombstones as soon as text is deleted?', options: ['A client still offline may send “insert after” a deleted character; without the tombstone it can’t be placed', 'Tombstones are needed for search', 'Deleting them costs too much CPU', 'Regulations require keeping deleted text'], why: 'GC only what no client could still reference, e.g. older than 30 days or 1,000 versions.' },
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
          'Leases prevent two owners during the handover; idle documents are checkpointed and released.',
        ],
        followups: [
          { q: 'What must clients do to survive a server switch without losing typing?', options: ['Keep unacknowledged ops locally, reconnect with the last server version they saw, receive the ops since, and resend their own', 'Reload the page and discard edits', 'Lock the document until the new server is ready', 'Nothing; the old server forwards them'], why: 'Client-side pending ops plus the durable log make handover safe.' },
          { q: 'A server with 50K connections dies and all its clients reconnect at once. What softens the surge?', options: ['Reconnect with random jitter and exponential backoff, so new owners load documents gradually', 'Have clients retry every 100 ms until they succeed', 'Keep a spare server idle with the same documents loaded', 'Make clients wait for the dead server to restart'], why: 'Synchronised retries create a thundering herd; jitter spreads it out.' },
        ],
      };
    },
  ],
});
