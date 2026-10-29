SG.add({
  id: 'scale-basics',
  ref: 'D1 D2 D8 D9',
  section: 'Scaling',
  title: 'Vertical, horizontal and stateless scaling',
  short: 'Scaling basics',
  blurb: 'Bigger machine or more machines, and the two rules that make “more machines” work.',
  intro: 'Scaling starts with two moves: make one machine bigger, or add more machines. More machines only work if servers keep no local state, and the system only stays up if no single machine is irreplaceable.',
  options: {
    'Vertical scaling': {
      eli5: 'Your one delivery bike is too slow, so you buy a faster bike. Easy, but there’s a fastest bike money can buy, and if it breaks, deliveries stop.',
      industry: [
        'Most startups first upgrade their single database server to a larger instance.',
        'Stack Overflow famously served huge traffic from a few very powerful servers.',
        'Cloud consoles let you resize an EC2/RDS instance in minutes.',
      ],
      def: 'Add CPU, RAM or faster disks to an existing machine. No code changes, but there’s a hardware ceiling, cost rises steeply at the top, resizing often needs a restart, and it’s still one machine.',
      scenarios: [
        'Early stage: one server is close to its limit and the team is small',
        'Databases, which are harder to split than app servers',
        'A quick fix while a longer-term design is prepared',
      ],
      scale: 'Great up to large single instances (hundreds of GB RAM). Doesn’t remove the single point of failure.',
    },
    'Horizontal scaling': {
      eli5: 'Instead of one faster bike, you hire ten riders. If one is sick, nine still deliver, and on festival nights you hire extra.',
      industry: [
        'Web and API tiers run many identical instances behind a load balancer.',
        'Auto Scaling Groups / Kubernetes HPA add instances when CPU or traffic rises.',
        'Hotstar scales out massively before IPL matches.',
      ],
      def: 'Add more machines and spread the load across them. Nearly unlimited and fault-tolerant, but needs a load balancer, stateless servers and more operational care. Auto-scaling adds/removes machines with demand.',
      scenarios: [
        'You’ve hit the largest sensible instance size',
        'Traffic is spiky (evening peaks, sales, live events)',
        'You need to survive machine failures without downtime',
      ],
      scale: 'The standard way past ~10K–100K users for app servers. Databases scale out later via replicas and sharding.',
    },
    'Stateless services': {
      eli5: 'A call centre where any agent can help you because your case history is in a shared system, not in one agent’s notebook.',
      industry: [
        'Sessions stored in Redis or as JWTs instead of server memory.',
        'Uploaded files go to S3, not the app server’s local disk.',
        'Twelve-factor apps keep processes stateless and disposable.',
      ],
      def: 'A server keeps no client-specific data between requests; any instance can handle any request. State lives in shared stores (database, cache, object storage). Prerequisite for horizontal scaling and auto-scaling.',
      scenarios: [
        'Users get logged out or lose carts after adding servers',
        'Files saved on one server can’t be found by another',
        'Servers can’t be killed or replaced without losing data',
      ],
      scale: 'Moves the problem to the shared stores, which then need their own scaling (Redis cluster, replicas).',
    },
    'Redundancy (no single point of failure)': {
      eli5: 'Keep a spare tyre. One flat shouldn’t end the trip.',
      industry: [
        'Databases run with a standby replica that takes over on failure (RDS Multi-AZ).',
        'At least two load balancers and app servers across availability zones.',
        'Netflix’s Chaos Monkey kills instances to prove redundancy works.',
      ],
      def: 'Duplicate every critical component so a single failure doesn’t take the system down. Includes failover (automatic switch to the standby) and spreading across failure domains (zones, regions).',
      scenarios: [
        'One machine’s reboot or crash takes the whole app down',
        'The business sets an uptime SLA',
        'Maintenance must happen without downtime',
      ],
      scale: 'Two of everything across two zones is the common baseline. Multi-region is far more expensive; justify it with the SLA.',
    },
  },
  scenarios: [
    (pick) => {
      const u = pick(['2K', '5K', '8K']);
      return {
        q: `An MVP with ${u} users runs on one small server at 85% CPU. Two developers, no time for redesign, and a 5-minute restart at night is acceptable.`,
        answer: 'Vertical scaling',
        hint: 'What’s the fastest fix with no code changes?',
        steps: ['Small scale, small team, urgent.', 'A bigger instance fixes CPU with zero code changes.', 'A short restart is acceptable.', 'Scale vertically now; plan horizontal later.'],
        followups: [
          { q: 'What risk remains after upgrading?', options: ['It’s still a single point of failure: if it dies, the app is down', 'None', 'The database gets slower', 'Users must reinstall the app'], why: 'Vertical scaling buys capacity, not availability.' },
        ],
      };
    },
    (pick) => {
      const f = pick(['doubles every quarter', 'grows 10x during sale days', 'spikes 8x during live matches']);
      return {
        q: `You’re already on the largest instance size your cloud offers, and traffic ${f}.`,
        answer: 'Horizontal scaling',
        hint: 'You can’t buy a bigger machine.',
        steps: ['The vertical ceiling is reached.', 'Growth/spikes need elastic capacity.', 'Add instances behind a load balancer, with auto-scaling.', 'Scale horizontally.'],
        followups: [
          { q: 'What must be true of the app servers first?', options: ['They must be stateless (sessions and files in shared stores)', 'They must use Java', 'They must share one disk', 'Nothing'], why: 'Without statelessness, the load balancer sends users to servers that don’t know them.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['shopping carts', 'login sessions', 'multi-step form progress']);
      return {
        q: `After going from 1 to 4 app servers, users randomly lose their ${what}. Everything worked with one server.`,
        answer: 'Stateless services',
        hint: 'Where was that data living?',
        steps: [`The ${what} lived in one server’s memory.`, 'The load balancer now sends requests to other servers.', 'Move the state to Redis (or the database, or a token).', 'Make the servers stateless.'],
        followups: [
          { q: 'Sticky sessions would also “fix” it. Why is that weaker?', options: ['A server crash still loses those users’ data, and load spreads unevenly', 'Sticky sessions are illegal', 'They don’t work with HTTPS', 'They’re slower than Redis'], why: 'Sticky sessions hide state instead of removing it.' },
        ],
      };
    },
    () => ({
      q: 'User profile photos are saved to the app server’s local disk. With 3 servers, a photo uploaded via server A shows as broken when the page is served by server B.',
      answer: 'Stateless services',
      hint: 'Files are state too.',
      steps: ['The file exists only on server A’s disk.', 'Other servers can’t see it.', 'Store uploads in shared object storage (S3) and serve via CDN.', 'Make the servers stateless.'],
      followups: [
        { q: 'Should the upload even pass through the app server?', options: ['Often no: issue a pre-signed URL so the client uploads straight to S3', 'Yes, always', 'Use FTP', 'Email the files'], why: 'Pre-signed URLs offload heavy bandwidth from your servers.' },
      ],
    }),
    (pick) => {
      const m = pick(['20', '30', '45']);
      return {
        q: `The single database server was rebooted for a security patch, and the whole app was down for ${m} minutes. The business now demands no downtime for maintenance.`,
        answer: 'Redundancy (no single point of failure)',
        hint: 'What happens when the only copy is offline?',
        steps: ['One database = single point of failure.', 'Add a standby replica in another zone.', 'Fail over during maintenance or crashes.', 'Redundancy.'],
        followups: [
          { q: 'Primary and standby both run in the same rack. Problem?', options: ['They share a failure domain: one power or network fault takes both out; spread across zones', 'No problem', 'They’ll be too fast', 'Licensing issues'], why: 'Redundancy only works if copies fail independently.' },
        ],
      };
    },
    (pick) => {
      const e = pick(['IPL evenings', 'lunch hours', 'Diwali sale days']);
      return {
        q: `Traffic rises 10x during ${e} and is near zero at 3 AM. You’re paying for peak capacity all day.`,
        answer: 'Horizontal scaling',
        hint: 'Capacity should follow demand.',
        steps: ['Demand varies a lot through the day.', 'Fixed capacity wastes money off-peak.', 'Auto-scaling adds and removes instances with load.', 'Horizontal scaling (auto-scaling).'],
        followups: [
          { q: 'The match starts at 7:30 PM and traffic jumps 10x in two minutes. Reactive scaling is too slow. Fix?', options: ['Scheduled/predictive scaling: scale out before 7:30', 'Scale on CPU only', 'Turn off auto-scaling', 'Ask users to join slowly'], why: 'New instances take minutes to boot; known events need pre-warming.' },
        ],
      };
    },
  ],
});
