SG.add({
  id: 'structural-2',
  ref: 'T24 T25 T26 T42',
  section: 'LLD: design patterns',
  title: 'Composite, Bridge, Flyweight',
  short: 'More structural patterns',
  blurb: 'Trees treated like leaves, two dimensions that vary separately, and sharing to save memory.',
  intro: 'Three structural patterns that show up in LLD rounds disguised as file systems, notification systems and text editors, plus Null Object, a small pattern that removes a lot of null checks.',
  options: {
    'Composite': {
      eli5: 'A box can contain items or smaller boxes. To weigh it, you ask everything inside for its weight, and boxes ask their contents in turn.',
      industry: [
        'File systems: a Folder contains Files and Folders; size() works on both.',
        'UI trees: a Panel contains Buttons and other Panels; render() recurses.',
        'Org charts and menu/category trees in e-commerce.',
      ],
      def: 'Compose objects into tree structures and let clients treat single objects (leaves) and groups (composites) through the same interface. Operations recurse through the tree.',
      scenarios: [
        'Part-whole hierarchies: folders, menus, org charts, nested comments',
        'Clients shouldn’t care whether they hold one item or a group',
        'Operations that aggregate over a tree (total size, total price)',
      ],
      scale: 'Watch for very deep trees (recursion depth) and cycles; leaves shouldn’t be forced to implement add()/remove() (ISP).',
    },
    'Bridge': {
      eli5: 'A TV remote and a TV are separate. Any remote model can control any TV brand, so you don’t need a special remote for every TV.',
      industry: [
        'Notifications: type (alert, reminder, promo) × channel (SMS, email, push) without a class per combination.',
        'JDBC: the API (abstraction) is separate from each database driver (implementation).',
        'Shapes × rendering engines (vector, raster) in graphics libraries.',
      ],
      def: 'Split a class that varies in two independent dimensions into two hierarchies, an abstraction and an implementation, connected by composition. Each side can grow without multiplying classes.',
      scenarios: [
        'Two independent dimensions would create N × M subclasses',
        'You want to switch implementations at runtime',
        'Platform-independent abstraction over platform-specific code',
      ],
      scale: 'Planned up front for two known dimensions. Adapter, by contrast, fixes an existing mismatch after the fact.',
    },
    'Flyweight': {
      eli5: 'A printing press keeps one metal block per letter and reuses it on every page, instead of casting a new “e” for each word.',
      industry: [
        'Text editors share one glyph object per character+font; position is stored separately.',
        'Games render thousands of trees sharing one model and texture.',
        'Java’s Integer.valueOf caches -128..127; String interning.',
      ],
      def: 'Share the common, immutable part of many similar objects (intrinsic state) and pass the varying part in from outside (extrinsic state), so millions of objects fit in memory. Usually managed by a factory/cache.',
      scenarios: [
        'Huge numbers of similar objects exhaust memory',
        'Most of each object’s state is identical and immutable',
        'Unique per-object data can be stored or passed separately',
      ],
      scale: 'Only worth it at large counts. Shared state must be immutable, or one change affects everything.',
    },
    'Null Object': {
      eli5: 'Instead of an empty chair that people trip over, you put a polite placeholder in the chair that says “nobody here” and does nothing harmful.',
      industry: [
        'A NoDiscount strategy returning 0 instead of a null discount.',
        'A NoOpLogger used in tests.',
        'Collections.emptyList() instead of returning null.',
      ],
      def: 'Provide an object with the expected interface and neutral, do-nothing behaviour, so callers don’t need null checks. Related: Specification pattern combines business rules (and/or/not) as objects.',
      scenarios: [
        'Code is full of if (x != null) checks for an optional collaborator',
        'A “no-op” behaviour is a valid default',
        'Returning empty results instead of null',
      ],
      scale: 'Don’t hide real errors: use it only when “do nothing” is genuinely correct.',
    },
  },
  scenarios: [
    (pick) => {
      const t = pick(['a file system where folders contain files and folders', 'a restaurant menu with categories, sub-categories and dishes', 'an org chart of managers and employees']);
      return {
        q: `Model ${t}. You need total size/price/headcount for any node, and callers shouldn’t care whether a node is a single item or a group.`,
        answer: 'Composite',
        hint: 'A tree where leaves and groups share one interface.',
        steps: ['Part-whole hierarchy.', 'Same operation on leaves and groups.', 'Groups delegate to children recursively.', 'Composite.'],
        followups: [
          { q: 'Should a File (leaf) implement addChild()?', options: ['No: keep child management on the composite only (or a separate interface)', 'Yes, throw an exception', 'Yes, silently ignore it', 'Files must contain folders'], why: 'Forcing leaves to support child operations breaks ISP and LSP.' },
        ],
      };
    },
    (pick) => {
      const a = pick([3, 4, 5]);
      const b = pick([3, 4]);
      return {
        q: `Notifications come in ${a} types (alert, reminder, promo…) and go over ${b} channels (SMS, email, push…). A class per type-channel pair means ${a * b} classes, and a new channel adds ${a} more.`,
        answer: 'Bridge',
        hint: 'Two independent dimensions multiplying.',
        steps: [`Types × channels = ${a * b} classes.`, 'The two dimensions vary independently.', 'Notification holds a reference to a Channel.', 'Bridge: N + M classes instead of N × M.'],
        followups: [
          { q: 'Bridge vs Adapter in one line?', options: ['Bridge is designed up front to vary two sides independently; Adapter fixes an existing interface mismatch', 'They’re identical', 'Adapter is for UI only', 'Bridge converts interfaces'], why: 'Same structure (composition), different intent and timing.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['1 million characters', '500,000 trees in a game map', '2 million map markers']);
      return {
        q: `An app holds ${n}. Each object stores a heavy shared part (font, model, icon) plus a small unique part (position). Memory is exhausted.`,
        answer: 'Flyweight',
        hint: 'Most of each object is the same.',
        steps: ['Huge object count.', 'The heavy part is identical and immutable.', 'Share it via a factory; keep position outside.', 'Flyweight.'],
        followups: [
          { q: 'Which JDK behaviour is a flyweight?', options: ['Integer.valueOf caching small integers', 'ArrayList resizing', 'Thread pools', 'HashMap rehashing'], why: 'Integer.valueOf(100) returns a shared cached instance.' },
        ],
      };
    },
    () => ({
      q: 'Order code calls discount.apply(total), but many orders have no discount, so the code is full of if (discount != null) checks, and one missing check caused a NullPointerException in production.',
      answer: 'Null Object',
      hint: 'What if “no discount” were a real object?',
      steps: ['Absence is a valid case with obvious behaviour: no change.', 'A NoDiscount implementation returns the total unchanged.', 'Callers never check for null.', 'Null Object.'],
      followups: [
        { q: 'When is Null Object a bad idea?', options: ['When absence is actually an error that should be surfaced', 'Always', 'Never', 'Only in Java'], why: 'Silently doing nothing can hide bugs if “missing” shouldn’t happen.' },
      ],
    }),
    (pick) => {
      const w = pick(['comments with nested replies', 'a product bundle containing products and smaller bundles', 'a permission group containing users and sub-groups']);
      return {
        q: `Model ${w}. Rendering, counting or pricing must work the same on a single item and on any nested group.`,
        answer: 'Composite',
        hint: 'Nested groups, uniform operations.',
        steps: ['Recursive containment.', 'Uniform operation across levels.', 'Composite.'],
        followups: [
          { q: 'A bundle accidentally contains itself. What happens and how to guard?', options: ['Infinite recursion; validate on add() that the child isn’t an ancestor', 'Nothing', 'Java detects it automatically', 'The price doubles once'], why: 'Composites need cycle checks when users can build the tree.' },
        ],
      };
    },
  ],
});
