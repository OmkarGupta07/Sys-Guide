SG.add({
  id: 'behavioral-2',
  ref: 'T32 T35 T36 T37 T38 T39',
  section: 'LLD: design patterns',
  title: 'Command, Template Method, Iterator, Mediator, Visitor, Memento',
  short: 'More behavioral patterns',
  blurb: 'Requests as objects, fixed skeletons, hidden traversal, a central coordinator, new operations without editing classes, and undo.',
  intro: 'These six show up in LLD rounds as features: undo/redo, report pipelines, chat rooms, exporting a document tree to several formats. Match the feature to the pattern and explain what it saves you.',
  options: {
    'Command': {
      eli5: 'A waiter writes your order on a slip and pins it in the kitchen. The slip can wait in a queue, be cancelled, or be cooked again.',
      industry: [
        'Undo/redo in editors: each action is a command with execute() and undo().',
        'Job queues: a serialized command object is pushed and executed later by a worker.',
        'Java’s Runnable/Callable passed to an ExecutorService.',
      ],
      def: 'Wrap a request as an object with everything needed to run it. The sender doesn’t know how it’s executed; commands can be queued, logged, retried, scheduled or undone.',
      scenarios: [
        'Undo/redo or an action history',
        'Queue, schedule or retry operations',
        'Buttons, menu items or remote controls that trigger configurable actions',
      ],
      scale: 'Undo needs each command to store enough state to reverse itself (or pair with Memento).',
    },
    'Template Method': {
      eli5: 'A recipe card says: boil water, add the main ingredient, add spices, serve. Each dish fills in “main ingredient” and “spices”; the order never changes.',
      industry: [
        'Spring’s JdbcTemplate and RestTemplate: fixed flow, you supply the variable callback.',
        'Report generators: fetch → format → export, with format differing per report.',
        'JUnit’s setUp → test → tearDown lifecycle.',
      ],
      def: 'A base class defines the algorithm’s fixed sequence in a final method and lets subclasses override specific steps (hooks). Reuse via inheritance; the order can’t be broken by subclasses.',
      scenarios: [
        'Several workflows share the same steps in the same order',
        'Only a few steps differ between variants',
        'The framework must control the order (e.g. always clean up)',
      ],
      scale: 'Inheritance-based. If steps vary independently or at runtime, prefer Strategy.',
    },
    'Iterator': {
      eli5: 'A TV remote’s “next channel” button. You don’t need to know how channels are stored; you just press next.',
      industry: [
        'Java’s Iterator and the for-each loop over any Collection.',
        'Database cursors and paginated API clients that fetch pages lazily.',
        'Traversing trees or graphs in different orders (BFS, DFS) with the same interface.',
      ],
      def: 'Provide a way to access elements of a collection one by one without exposing how it’s stored. Different iterators can traverse the same collection differently.',
      scenarios: [
        'Hide whether data is an array, a tree or paged remote results',
        'Several traversal orders over the same structure',
        'Lazy loading of large or infinite sequences',
      ],
      scale: 'Watch concurrent modification while iterating (ConcurrentModificationException).',
    },
    'Mediator': {
      eli5: 'Planes don’t talk to each other directly; they all talk to the control tower, which coordinates who lands when.',
      industry: [
        'Chat rooms: users send to the room, which forwards to others.',
        'UI dialogs where changing one field enables/disables others via a controller.',
        'Air traffic control and auction systems.',
      ],
      def: 'Centralize communication between many objects in one mediator, so they don’t reference each other directly. Turns many-to-many dependencies into one-to-many.',
      scenarios: [
        'Many components interact with each other in tangled ways',
        'Chat rooms, auctions, multiplayer lobbies',
        'Form fields that depend on each other',
      ],
      scale: 'The mediator can grow into a god object; split by responsibility.',
    },
    'Visitor': {
      eli5: 'A tax inspector visits a shop, a factory and a farm. Each lets the inspector in, and the inspector knows how to inspect each kind. Next year a safety inspector visits the same places without changing them.',
      industry: [
        'Compilers and linters walk syntax trees with visitors (type checking, code generation).',
        'Exporting a document tree to HTML, PDF and Markdown.',
        'Applying tax/discount rules across different product types.',
      ],
      def: 'Add new operations to a stable set of element classes without modifying them. Each element accepts a visitor and calls the visitor method for its own type (double dispatch).',
      scenarios: [
        'Element types are stable but new operations keep being added',
        'Operations across a heterogeneous structure (AST, document tree)',
        'Keeping unrelated logic (export, pricing) out of element classes',
      ],
      scale: 'Adding a new element type forces changes to every visitor. Use when types are stable.',
    },
    'Memento': {
      eli5: 'Saving your game before a boss fight. If things go badly, you load the save and everything is exactly as it was.',
      industry: [
        'Undo in text editors and drawing apps by snapshotting state.',
        'Game save points and checkpoints.',
        'Form drafts restored after a crash.',
      ],
      def: 'Capture an object’s internal state in a snapshot (memento) without exposing its internals, so it can be restored later. A caretaker stores mementos but can’t read them.',
      scenarios: [
        'Undo/rollback to an exact earlier state',
        'Checkpoints before risky operations',
        'Saving state without breaking encapsulation',
      ],
      scale: 'Snapshots can be memory-heavy; store diffs or limit history size.',
    },
  },
  scenarios: [
    (pick) => {
      const app = pick(['a text editor', 'a drawing app', 'a spreadsheet']);
      return {
        q: `In ${app}, every user action (type, delete, format) must be undoable and redoable, and actions should be logged for crash recovery.`,
        answer: 'Command',
        hint: 'Each action becomes an object you can store and reverse.',
        steps: ['Actions need to be stored, replayed and reversed.', 'Wrap each as an object with execute() and undo().', 'Keep undo and redo stacks of commands.', 'Command.'],
        followups: [
          { q: 'Undoing “apply filter to image” is hard to compute in reverse. What helps?', options: ['Store a snapshot of the previous state (Memento) inside the command', 'Disallow undo', 'Recompute from scratch each time', 'Use Singleton'], why: 'Command + Memento is a classic pairing for complex undo.' },
        ],
      };
    },
    (pick) => {
      const r = pick(['sales, inventory and payroll reports', 'CSV, Excel and PDF data imports', 'Swiggy, Zomato and Uber Eats order sync jobs']);
      return {
        q: `Three workflows (${r}) all do: connect → fetch data → transform → write output → close. Only “fetch” and “transform” differ, and the order must never change.`,
        answer: 'Template Method',
        hint: 'Fixed skeleton, a few steps differ.',
        steps: ['Same steps, same order.', 'Only some steps vary.', 'A base class with a final run() calls abstract fetch()/transform().', 'Template Method.'],
        followups: [
          { q: 'Template Method vs Strategy?', options: ['Template Method varies steps via inheritance with a fixed skeleton; Strategy swaps a whole algorithm via composition at runtime', 'They’re the same', 'Strategy needs inheritance', 'Template Method is for UI only'], why: 'A frequent interview comparison.' },
        ],
      };
    },
    () => ({
      q: 'A catalog class stores products in an array today, may move to a tree tomorrow, and later to pages fetched from an API. Callers just want to loop over products.',
      answer: 'Iterator',
      hint: 'Callers shouldn’t know how items are stored.',
      steps: ['Storage will change.', 'Callers only need “next item”.', 'Expose an iterator; hide the structure.', 'Iterator.'],
      followups: [
        { q: 'What does Java throw if you remove from an ArrayList inside a for-each loop?', options: ['ConcurrentModificationException', 'NullPointerException', 'IndexOutOfBoundsException', 'Nothing'], why: 'Use iterator.remove() or removeIf instead.' },
      ],
    }),
    (pick) => {
      const n = pick([10, 50, 200]);
      return {
        q: `In a group chat with ${n} members, each User object currently keeps references to every other user to send messages, and adding a member updates everyone.`,
        answer: 'Mediator',
        hint: 'Replace many-to-many links with one hub.',
        steps: ['Every user knows every other user.', 'Introduce a ChatRoom that users send to.', 'The room forwards to members.', 'Mediator.'],
        followups: [
          { q: 'Mediator vs Observer?', options: ['Mediator coordinates two-way interactions among peers; Observer broadcasts one-way from a subject to subscribers', 'They’re identical', 'Observer has a central hub', 'Mediator is only for UI'], why: 'Both decouple, but the communication shape differs.' },
        ],
      };
    },
    (pick) => {
      const f = pick(['HTML, PDF and Markdown', 'JSON, XML and plain text', 'word count, spell check and PDF export']);
      return {
        q: `A document is a tree of Paragraph, Image and Table elements, which rarely change. New operations (${f}) are added every quarter, and the team doesn’t want to edit the element classes each time.`,
        answer: 'Visitor',
        hint: 'Stable element types, growing list of operations.',
        steps: ['Element types are stable.', 'Operations keep growing.', 'Each operation is a visitor; elements accept(visitor).', 'Visitor.'],
        followups: [
          { q: 'Product now adds a new element type, Video. What’s the cost?', options: ['Every existing visitor must add a visitVideo method', 'Nothing', 'Only one class changes', 'Visitors are deleted'], why: 'Visitor makes adding operations easy and adding types hard.' },
        ],
      };
    },
    () => ({
      q: 'A game must let players save before a boss fight and restore everything (position, health, inventory) exactly, without exposing the Player class’s private fields to the save system.',
      answer: 'Memento',
      hint: 'Snapshot private state and restore it later.',
      steps: ['Exact state must be restorable.', 'Encapsulation must be preserved.', 'Player creates an opaque snapshot; a caretaker stores it.', 'Memento.'],
      followups: [
        { q: 'Saves are huge and players keep 100 of them. Mitigation?', options: ['Store diffs/incremental snapshots or cap history size', 'Save less often forever', 'Make fields public', 'Use Singleton'], why: 'Mementos trade memory for exact restoration.' },
      ],
    }),
  ],
});
