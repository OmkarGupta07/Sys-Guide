SG.add({
  id: 'interview-hld',
  ref: 'A1 A3 A4 A6',
  section: 'Interview skills',
  title: 'How to run an HLD interview',
  short: 'Running an HLD interview',
  blurb: 'A repeatable 45-minute flow, what interviewers score, and the mistakes that sink strong engineers.',
  intro: 'Follow a framework so you stay on time: requirements (functional + non-functional) → core entities → API → high-level design for the features → deep dives for the NFRs. Interviewers score problem solving (finding the core challenge), solution design, technical depth in a few areas, and communication.',
  options: {
    'Requirements first': {
      eli5: 'Before cooking for a party, you ask how many guests, any allergies, and veg or non-veg. Cooking first and asking later wastes everything.',
      industry: [
        'Hello Interview’s delivery framework starts with functional + non-functional requirements.',
        'Interviewers at most product companies expect scoping in the first ~5 minutes.',
        'Agreeing scope turns the interview into a contract you can hit.',
      ],
      def: 'List 3–5 core functional requirements (features), agree what’s out of scope, then non-functional requirements with numbers (consistency vs availability per feature, scale, latency targets, durability). Optionally quick estimates if they change the design.',
      scenarios: [
        'The prompt is vague (“design Instagram”)',
        'You’re tempted to start drawing immediately',
        'You need to decide what to leave out',
      ],
      scale: 'Every NFR you write, you’re expected to address later. Pick the ones that matter for this system.',
    },
    'Entities and API': {
      eli5: 'Naming the main characters of a story and what they can do, before writing the plot.',
      industry: [
        'Core entities (User, Event, Ticket) roughly become tables.',
        'REST endpoints mapped from functional requirements.',
        'Spend about 5 minutes here, not 15.',
      ],
      def: 'List the core entities the system stores and exchanges, then one API endpoint (or system interface) per functional requirement. Keep it quick: plural-noun resources, auth from the token, pagination where lists appear.',
      scenarios: [
        'Bridging from requirements to design',
        'Making sure every feature has an entry point',
        'Interviewer wants to see API judgement',
      ],
      scale: 'Over-detailing request/response fields here eats time you need for deep dives.',
    },
    'Simple high-level design': {
      eli5: 'Drawing a rough map that gets you from home to the office before worrying about traffic shortcuts.',
      industry: [
        'Client → API gateway/LB → services → database (+ blob storage, cache, queue only if needed).',
        'Walk each API endpoint through the boxes.',
        'Data model filled in alongside (keys, indexes).',
      ],
      def: 'A working design that satisfies the functional requirements with as few components as possible. Go endpoint by endpoint, showing the data flow and what’s stored where. Don’t optimize yet; that’s what deep dives are for.',
      scenarios: [
        'After requirements and API are agreed',
        'Showing every feature works end to end',
        'Setting up clear spots for later deep dives',
      ],
      scale: 'Adding Kafka, caches and sharding here without a stated reason is a red flag.',
    },
    'Deep dives on NFRs': {
      eli5: 'Now that the map works, you plan for rush hour, road closures and rain.',
      industry: [
        'Hot keys, celebrity users, sharding math, consistency for bookings, real-time delivery.',
        'Senior candidates drive these proactively; juniors respond to probing.',
        'Usually 2–3 deep dives fill the remaining time.',
      ],
      def: 'Revisit each non-functional requirement and evolve the design to meet it: caching or replicas for latency, sharding for scale, locks/transactions for consistency, queues for spikes, redundancy for availability. Justify each change with numbers and name the trade-off.',
      scenarios: [
        'Meeting latency, scale and consistency targets',
        'Handling failure modes and hot spots',
        'Showing technical depth in a few areas',
      ],
      scale: 'Depth in a few areas beats shallow coverage of everything. Tie each change to an NFR.',
    },
  },
  scenarios: [
    () => ({
      q: 'The interviewer says “Design Ticketmaster” and the candidate immediately starts drawing a load balancer, Kafka and three databases.',
      answer: 'Requirements first',
      hint: 'What should the first five minutes be?',
      steps: ['Without scope, the design has no target.', 'Agree core features: view events, search, book tickets.', 'NFRs: strong consistency for booking, high availability for browsing, scale for popular events.', 'Requirements first.'],
      followups: [
        { q: 'Which is the core challenge to prioritize in Ticketmaster?', options: ['The booking flow under contention (no double-booking, surges)', 'User authentication', 'Profile pictures', 'Email templates'], why: 'Interviewers score your ability to find the hard part.' },
      ],
    }),
    (pick) => {
      const m = pick([15, 20]);
      return {
        q: `A candidate spends ${m} minutes defining every field of every request and response, debating PUT vs PATCH. Only 15 minutes remain for design and deep dives.`,
        answer: 'Entities and API',
        hint: 'Which step got far too much time?',
        steps: ['The API step should take about 5 minutes.', 'Resources + endpoints per feature are enough.', 'Field-level detail can come later if needed.', 'Keep entities and API brief.'],
        followups: [
          { q: 'How should the API show who is acting (e.g. creating a tweet)?', options: ['From the auth token (JWT/session) in the header, not a userId in the body', 'A userId field in the body', 'A query parameter', 'It doesn’t matter'], why: 'A common, easily avoided mistake interviewers notice.' },
        ],
      };
    },
    () => ({
      q: 'For “design Bitly”, the candidate’s first diagram already includes sharding, a Bloom filter, Kafka and a multi-region setup, before showing how a short URL is created and redirected.',
      answer: 'Simple high-level design',
      hint: 'First make the features work with the fewest boxes.',
      steps: ['Complexity without stated need is a red flag.', 'First: create short URL and redirect, end to end.', 'Then use deep dives to scale with justification.', 'Simple high-level design first.'],
      followups: [
        { q: 'When is it right to add a cache in the design?', options: ['When an NFR or estimate shows read load/latency needs it, with a named key and TTL', 'Always, immediately', 'Never in interviews', 'Only for writes'], why: 'Justify components with numbers and requirements.' },
      ],
    }),
    (pick) => {
      const what = pick(['a celebrity with 50M followers posts', 'a hot concert goes on sale', 'a viral link gets 1M clicks a minute']);
      return {
        q: `The basic design works. The interviewer asks what happens when ${what}. There are 15 minutes left.`,
        answer: 'Deep dives on NFRs',
        hint: 'This is where you meet scale and latency targets.',
        steps: ['The design satisfies features; now stress it.', 'Identify the bottleneck (hot key, fan-out, contention).', 'Propose a fix with numbers and trade-offs (cache, sharding, queue, precompute).', 'Deep dive on the NFRs.'],
        followups: [
          { q: 'What separates a senior candidate in deep dives?', options: ['Proactively finding bottlenecks and failure modes, with math, before being asked', 'Using more technologies', 'Talking faster', 'Avoiding trade-offs'], why: 'Mid-level responds to probes; senior drives the conversation.' },
        ],
      };
    },
    () => ({
      q: 'In the last 5 minutes, the interviewer asks whether the design would change if traffic grew 10x. The candidate freezes and says “it should scale”.',
      answer: 'Deep dives on NFRs',
      hint: 'Answer with the specific component that breaks first.',
      steps: ['Name the first bottleneck at 10x (e.g. single DB writes).', 'Show the math.', 'Propose the targeted change (sharding by key, cache, queue) and its trade-off.', 'A crisp deep-dive answer.'],
      followups: [
        { q: 'Best way to recover if you realize mid-interview a choice was wrong?', options: ['Say so, explain why, and adjust the design', 'Hide it', 'Restart the whole design', 'Blame the requirements'], why: 'Self-correction with reasoning is a positive signal.' },
      ],
    }),
  ],
});
