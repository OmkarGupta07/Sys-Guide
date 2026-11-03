SG.add({
  id: 'nfr',
  ref: 'A2 J1',
  section: 'Interview skills',
  title: 'Finding the non-functional requirements',
  short: 'Finding NFRs',
  blurb: 'The skill most candidates skip: deciding which quality the whole design must protect.',
  intro: 'Functional requirements are features (“users can book a seat”). Non-functional requirements are qualities (“booking never double-sells”, “p99 under 200 ms”). Your high-level design satisfies the features; every deep dive exists to satisfy an NFR, so weak NFRs leave you with nothing to deep-dive on. A reliable order: (1) consistency or availability, per feature, (2) scale with numbers, (3) latency targets, (4) durability, (5) anything special: security, compliance, cost. Always attach a number or a concrete consequence.',
  options: {
    'Consistency over availability': {
      eli5: 'A cinema with one seat left. It’s better to say “please wait, we’re checking” than to sell the same seat to two people.',
      industry: [
        'Ticketmaster, BookMyShow, IRCTC: a seat must never be sold twice.',
        'UPI and wallets: a balance must never be spent twice.',
        'Stock exchanges and order books: everyone must act on the same price.',
      ],
      def: 'During a network partition, return an error or wait rather than serve stale data. Say it as: “For booking, I’ll prioritise strong consistency: two users must never get the same seat. I accept higher latency or errors there.” Forces single-leader writes, transactions or locks, and sync replication.',
      scenarios: [
        'Stale data would cause a real loss: double booking, overselling, double spending',
        'Inventory with a hard limit (last item, last seat)',
        'Matching or ownership that must be agreed instantly (a match in a dating app)',
      ],
      scale: 'Usually only a slice of the system needs it (booking, payment). Say which slice, and keep the rest available.',
    },
    'Availability over consistency': {
      eli5: 'A notice board in a big school. If the newest notice reaches some floors a minute late, nobody is harmed; a locked notice board would be worse.',
      industry: [
        'Instagram, Twitter and LinkedIn feeds: a post appearing seconds late is fine.',
        'Netflix catalogue and Yelp business pages: slightly old descriptions are fine.',
        'Profile pages and likes counts almost everywhere.',
      ],
      def: 'During a partition, keep serving, even if some users see slightly old data (eventual consistency). Say it as: “Viewing should be highly available; seeing a post a few seconds late is acceptable.” Allows replicas, caches, CDNs, async replication and CDC.',
      scenarios: [
        'Stale data is mildly annoying but not harmful',
        'Read-heavy content: feeds, catalogues, profiles, reviews',
        'Users would rather see something than an error page',
      ],
      scale: 'The default for most read paths. Add read-your-own-writes where a user must see their own change immediately.',
    },
    'Low latency': {
      eli5: 'A lift that arrives in 3 seconds feels magic; one that takes 30 seconds feels broken, even if it always works.',
      industry: [
        'Google typeahead: suggestions must keep up with typing (~100 ms).',
        'Chat and multiplayer games: messages and moves feel live under ~200 ms.',
        'Ad auctions and trading: decisions within milliseconds or the chance is gone.',
      ],
      def: 'A specific response-time target for a specific operation, stated as a percentile: “p99 suggestion latency under 100 ms”. Forces caching, precomputation, in-memory stores, edge/CDN placement, fewer network hops.',
      scenarios: [
        'The product feels broken if a specific action is slow (typing, sending, swiping)',
        'Interactive or real-time features',
        'A deadline where a late answer is worthless',
      ],
      scale: 'Name the operation and the percentile. “Low latency” with no number and no operation earns no credit.',
    },
    'Durability': {
      eli5: 'A bank locker. It can be closed for a day, but whatever you put inside must never vanish.',
      industry: [
        'Dropbox and Google Drive: an uploaded file must never be lost.',
        'Payments and ledgers: a confirmed transaction must survive any crash.',
        'Medical and legal records with retention requirements.',
      ],
      def: 'Once the system says “saved”, the data survives crashes, disk failures and even a lost data centre. Say it as: “Once an upload is acknowledged, it must never be lost.” Forces replication before acknowledging, object storage with multi-zone copies, write-ahead logs, backups.',
      scenarios: [
        'Losing data is worse than being temporarily unavailable',
        'User-created content that can’t be regenerated (files, photos, records)',
        'Financial or legal records',
      ],
      scale: 'Different from availability: data can be safe while the service is down. Costs extra copies and write latency.',
    },
    'Scale (throughput and storage)': {
      eli5: 'A tea stall that makes perfect tea is fine, until 10,000 people arrive at once. Now the challenge is volume, not the recipe.',
      industry: [
        'Ad-click aggregators ingesting billions of events a day.',
        'Uber/Ola location pings from millions of drivers every few seconds.',
        'Logging, metrics and analytics pipelines.',
      ],
      def: 'The defining challenge is the volume of requests, writes or data. Say it with numbers: “100M DAU, ~10K writes/s average, 50K at peak, 5 TB/year.” Forces partitioning, queues and streams, batching, horizontal scaling, cheap storage tiers.',
      scenarios: [
        'Write volume would break a single database',
        'Huge event streams where each event is small and individually unimportant',
        'Storage growth that drives the architecture',
      ],
      scale: 'Always back it with estimates (Day 5 skills). “It should scale” without numbers is not an NFR.',
    },
  },
  scenarios: [
    (pick) => {
      const what = pick(['a concert on BookMyShow', 'a cricket final ticket sale', 'IRCTC Tatkal booking']);
      return {
        q: `Design seat booking for ${what}. Hundreds of thousands of users rush in when sales open; pages are slow but people keep trying. Which NFR should you state first, because it shapes the whole booking design?`,
        answer: 'Consistency over availability',
        hint: 'What is the one outcome that would be a disaster here?',
        steps: [
          'The catastrophic failure is two users getting the same seat.',
          'Slowness or a retry is annoying; a double booking is a real loss.',
          'So booking must prioritise consistency over availability.',
          'Scale and latency matter too, but they are solved inside that constraint.',
        ],
        followups: [
          { q: 'Should the event description page also prioritise consistency?', options: ['No: browsing and search should be highly available; only booking needs strong consistency', 'Yes, the whole system must be consistent', 'Yes, because it’s the same database', 'No NFR applies to browsing'], why: 'Senior answers split NFRs per feature: consistent booking, available browsing.' },
          { q: 'Which of these is a functional requirement, not an NFR?', options: ['Users can hold a seat for 10 minutes while paying', 'Booking p99 latency under 500 ms', 'No seat is ever sold twice', 'The system handles 1M concurrent users'], why: 'Functional = what the user can do. NFR = how well the system does it.' },
        ],
      };
    },
    (pick) => {
      const app = pick(['an Instagram-like', 'a LinkedIn-like', 'a Twitter-like']);
      const dau = pick(['200M', '500M']);
      return {
        q: `Design the home feed for ${app} app with ${dau} daily users. A post may take a while to reach followers. Which NFR do you state first?`,
        answer: 'Availability over consistency',
        hint: 'Is a post showing up a few seconds late harmful?',
        steps: [
          'Stale feed data is harmless.',
          'An error page instead of a feed is bad.',
          'So prioritise availability; eventual consistency is fine.',
          'Then add latency and scale numbers for the feed read path.',
        ],
        followups: [
          { q: 'A user posts and refreshes, but their own post is missing. Which consistency level fixes that without making the whole system strongly consistent?', options: ['Read-your-own-writes', 'Linearizability for all reads', 'Causal consistency for likes only', 'No fix needed'], why: 'Users forgive others’ posts arriving late, not their own.' },
          { q: 'Best way to state the latency NFR?', options: ['“Feed loads with p99 under 500 ms”', '“The feed should be fast”', '“Use Redis”', '“Latency is important”'], why: 'An NFR needs an operation, a percentile and a number. “Use Redis” is a solution, not a requirement.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['Google search', 'Amazon product search', 'Swiggy restaurant search']);
      return {
        q: `Design typeahead suggestions for ${what}. Suggestions update as each letter is typed. Popularity data can be a few hours old. Which NFR decides the design?`,
        answer: 'Low latency',
        hint: 'Staleness is fine. What makes it feel broken?',
        steps: [
          'Hours-old data is fine, so consistency isn’t the driver.',
          'Suggestions must keep pace with typing.',
          'State: “p99 under ~100 ms per keystroke”.',
          'That forces precomputed top-K, in-memory tries, caching near users.',
        ],
        followups: [
          { q: 'Why is “eventually consistent within a few hours” acceptable here?', options: ['Slightly old popularity rankings barely change what users see', 'Typeahead has no data', 'Users never notice anything', 'It isn’t acceptable'], why: 'Saying why staleness is tolerable makes the trade-off explicit.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['Dropbox', 'Google Drive', 'a photo backup app']);
      return {
        q: `Design file upload for ${what}. Users would tolerate the service being down for an hour, but they would leave forever if a file they uploaded disappeared. Which NFR is the non-negotiable one?`,
        answer: 'Durability',
        hint: 'Downtime is tolerated. What isn’t?',
        steps: [
          'Downtime is tolerable: availability is secondary.',
          'Losing an acknowledged upload is unacceptable.',
          'That’s durability: replicate before acknowledging, multi-zone object storage.',
        ],
        followups: [
          { q: 'The user edits the same file on a laptop and a phone while offline. Which NFR conversation does this open?', options: ['Consistency: how to detect and resolve conflicting versions', 'Latency only', 'Durability only', 'None'], why: 'Sync products need a conflict story even if they’re mostly available.' },
          { q: 'How would you phrase the durability NFR?', options: ['“Once an upload is acknowledged, it is never lost, even if a data centre fails”', '“Files are stored in S3”', '“We’ll take backups”', '“Uploads should be fast”'], why: 'State the guarantee, not the tool.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['10B', '20B', '50B']);
      return {
        q: `Design an ad-click aggregator: ${n} clicks per day with spikes during big events. Advertisers view click counts on dashboards that may be up to a minute behind. Which NFR is the defining challenge?`,
        answer: 'Scale (throughput and storage)',
        hint: 'Dashboards can lag. What would actually break?',
        steps: [
          'A minute of lag is allowed, so it isn’t latency or strong consistency.',
          `${n}/day is ~${n === '10B' ? '115K' : n === '20B' ? '230K' : '580K'} clicks/s on average, more at peak.`,
          'Ingesting and aggregating that volume is the core problem.',
          'Scale: streams, partitioning, pre-aggregation.',
        ],
        followups: [
          { q: 'Counts are used to bill advertisers. Which extra NFR must you add?', options: ['Accuracy: no lost or double-counted clicks (idempotent, replayable processing)', 'Sub-10 ms dashboard latency', 'Strong consistency for dashboards', 'None'], why: 'When money depends on counts, correctness joins scale as a first-class NFR.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['a UPI-style wallet', 'a bank transfer system', 'a gift-card balance service']);
      return {
        q: `Design money transfers for ${what}. Two transfers from the same account can arrive at the same moment from different devices. Which NFR comes first?`,
        answer: 'Consistency over availability',
        hint: 'What happens if both transfers read the same old balance?',
        steps: [
          'Both could spend the same money: double spending.',
          'A transfer may be slow or fail, but must never be wrong.',
          'Consistency over availability for balances.',
          'Durability matters too: confirmed transfers must survive crashes.',
        ],
        followups: [
          { q: 'The client times out and retries a transfer. Which requirement prevents a double debit?', options: ['Idempotency: the same request ID applied once', 'Low latency', 'Availability', 'Eventual consistency'], why: 'Retries are inevitable in payments; idempotency makes them safe.' },
        ],
      };
    },
    (pick) => {
      const ms = pick([200, 300, 500]);
      return {
        q: `Design WhatsApp-style messaging. Product says the selling point is that messages feel instant: delivered in under ${ms} ms when both users are online. Losing a message is also unacceptable. Which NFR drives the real-time delivery path?`,
        answer: 'Low latency',
        hint: 'The question is about the delivery path specifically.',
        steps: [
          `The headline target is delivery under ${ms} ms.`,
          'That shapes the path: persistent connections, routing to the right server, no polling.',
          'Durability is also required, but it shapes storage, not the live delivery path.',
          'Low latency for delivery.',
        ],
        followups: [
          { q: 'Which NFR covers “never lose a message”, and what does it force?', options: ['Durability: persist (and replicate) before acknowledging to the sender', 'Availability: show errors less', 'Latency: deliver faster', 'Scale: add servers'], why: 'Real systems have several NFRs; name which part of the design each one shapes.' },
        ],
      };
    },
    (pick) => {
      const d = pick(['1M', '2M', '5M']);
      const s = pick([3, 4, 5]);
      return {
        q: `Design driver location tracking for a ride-hailing app: ${d} active drivers send their GPS position every ${s} seconds. A position that’s a few seconds old is fine. Which NFR defines this component?`,
        answer: 'Scale (throughput and storage)',
        hint: 'Count the writes per second.',
        steps: [
          `${d} ÷ ${s}s ≈ ${Math.round(parseFloat(d) * 1000 / s)}K writes per second.`,
          'Each update is small and soon outdated.',
          'Staleness is fine, so consistency isn’t the issue.',
          'Write throughput is the defining challenge.',
        ],
        followups: [
          { q: 'Should old location points be stored durably forever?', options: ['Usually not for matching: keep the latest position in memory/cache; archive trips separately if needed', 'Yes, every point in a relational database', 'Yes, with sync replication', 'Delete everything immediately'], why: 'Durability needs differ per data type. Live positions are disposable.' },
        ],
      };
    },
    () => ({
      q: 'Design a hospital records system. A doctor’s saved diagnosis must never be lost, even if a whole data centre fails. Loading a record in 2 seconds instead of 200 ms is acceptable. Which NFR is non-negotiable?',
      answer: 'Durability',
      hint: 'Speed is explicitly relaxed. What isn’t?',
      steps: ['Latency is relaxed.', 'Losing a saved diagnosis is unacceptable, even in a disaster.', 'Durability: multi-region replicated storage, backups.', 'Add security and compliance NFRs too.'],
      followups: [
        { q: 'Which other NFR must you mention for medical data?', options: ['Security and privacy compliance: encryption, access control, audit logs', 'Ultra-low latency', 'Eventual consistency', 'Unlimited scale'], why: 'Regulated data always adds security and compliance requirements.' },
      ],
    }),
    () => ({
      q: 'Design a dating app’s swipe-and-match feature. When the second person swipes right, both must see “It’s a match” immediately. Profile photo updates can take a minute to spread. Which NFR applies to the match itself?',
      answer: 'Consistency over availability',
      hint: 'Two people in different regions must agree instantly.',
      steps: ['A match depends on both swipes being seen together.', 'If one region misses the other’s swipe, the match never fires.', 'Strong consistency for swipes/matches.', 'Availability for profiles.'],
      followups: [
        { q: 'How should you state the NFRs for this app in one line?', options: ['“Strong consistency for matches, high availability for viewing profiles, p99 swipe under 200 ms”', '“Everything strongly consistent”', '“Everything eventually consistent”', '“It should scale”'], why: 'One line, per feature, with a number: that’s what interviewers want to hear.' },
      ],
    }),
  ],
});
