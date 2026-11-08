SG.add({
  id: 'hosting',
  ref: 'P1 P2 P3 P4 P5 P6 P7',
  section: 'Infra and cloud',
  title: 'Where to deploy: cheapest to biggest',
  short: 'Hosting ladder',
  blurb: 'Free tiers, one VPS, managed platforms, full cloud, containers at scale, multi-region, and when to climb.',
  intro: 'Every rung adds capability and cost. Start on the lowest rung that meets your NFRs, and know the signal that tells you to climb. Prices change often, so think in orders of magnitude: free, a few dollars, tens, hundreds, thousands per month.',
  options: {
    'Free tier / static hosting': {
      eli5: 'A free stall at the weekend market. Perfect to test your idea; limited space and you follow the market’s rules.',
      industry: [
        'Netlify, Vercel, Cloudflare Pages and GitHub Pages for static sites and SPAs (this app runs on one).',
        'Render, Railway and Fly.io free or hobby tiers for small APIs.',
        'Supabase and Neon free Postgres tiers.',
      ],
      def: 'Managed platforms that host static files on a global CDN for free, plus small free/hobby tiers for APIs and databases. Zero ops, automatic HTTPS, deploy on git push. Limits: sleeping instances, small quotas, little control.',
      scenarios: [
        'Static sites, portfolios, PWAs and prototypes',
        'MVPs with a handful of users',
        'Learning and side projects',
      ],
      scale: 'Static content on a CDN scales to huge traffic for free; dynamic free tiers hit quotas or cold starts quickly.',
    },
    'Single VPS': {
      eli5: 'Renting one small shop for a fixed monthly rent. You arrange everything inside yourself, and it’s cheap, but if it floods, the shop is closed.',
      industry: [
        'Hetzner, DigitalOcean, Linode or a small EC2 instance running Docker + Nginx + Postgres.',
        'Indie products serving thousands of users from one box.',
        'Oracle Cloud’s always-free VM for hobby backends.',
      ],
      def: 'One virtual machine you fully control (roughly $5–40/month): run your app, database and reverse proxy yourself. Cheapest per unit of compute, but you handle updates, backups, security and it’s a single point of failure.',
      scenarios: [
        'Early products with steady, modest traffic',
        'You want full control at minimum cost',
        'Workloads that don’t fit free-tier limits',
      ],
      scale: 'A single modern VPS handles far more than most expect (thousands of requests/s for simple apps). Add backups and monitoring before users depend on it.',
    },
    'Managed PaaS': {
      eli5: 'A food court counter: the building, electricity and cleaning are handled; you just cook. Costs more than a bare shop, but you only worry about your food.',
      industry: [
        'Heroku, Render, Railway paid plans, AWS Elastic Beanstalk, Google Cloud Run.',
        'Managed Postgres/Redis add-ons with backups.',
        'Small teams with no dedicated ops person.',
      ],
      def: 'Push code; the platform builds, runs, scales and patches it, with managed databases and logs. Higher price per unit than a VPS, much less operational work.',
      scenarios: [
        'Small teams that want to ship features, not run servers',
        'Need auto-scaling and managed databases without cloud complexity',
        'Moving off a fragile single VPS',
      ],
      scale: 'Comfortable into the tens or hundreds of thousands of users; cost and limited control eventually push teams to raw cloud.',
    },
    'Full cloud (IaaS + managed services)': {
      eli5: 'Leasing space in a huge industrial park with every service on site: power, security, warehouses, transport. You assemble exactly the setup you need, and pay for each piece.',
      industry: [
        'AWS: EC2/ECS + RDS + S3 + CloudFront + ALB; equivalents on GCP and Azure.',
        'Most funded startups and enterprises.',
        'Reserved and spot instances to control cost.',
      ],
      def: 'Compose building blocks: VMs or containers, managed databases, object storage, CDN, queues, load balancers, IAM, in multiple availability zones. Maximum flexibility and reliability; requires cloud skills and cost discipline.',
      scenarios: [
        'Growing products needing multi-AZ reliability and many managed services',
        'Compliance, networking and security requirements',
        'Traffic large enough that PaaS markups hurt',
      ],
      scale: 'Scales to very large systems; bills can surprise you. Tag resources, set budgets and alerts from day one.',
    },
    'Kubernetes / multi-region': {
      eli5: 'Running a chain of restaurants across countries with a central operations team. Powerful and resilient, but only worth it once you’re big.',
      industry: [
        'EKS/GKE/AKS clusters running hundreds of services.',
        'Active-active regions for global latency and disaster recovery.',
        'Platform teams that build internal tooling for product teams.',
      ],
      def: 'Container orchestration across many machines (and often several regions): auto-scaling, self-healing, rolling deploys, service discovery. Multi-region adds global latency wins and survives a region outage, at significant cost and complexity (data replication, failover).',
      scenarios: [
        'Dozens or hundreds of services and teams',
        'Strict availability SLAs (99.99%+) or global low latency',
        'Disaster recovery across regions',
      ],
      scale: 'Needs dedicated platform/SRE effort. Premature Kubernetes is a common, expensive mistake.',
    },
  },
  scenarios: [
    (pick) => {
      const what = pick(['an offline study PWA', 'a portfolio site', 'a landing page for a new app']);
      return {
        q: `You’re deploying ${what}: only static HTML, CSS and JS, no server-side code. You want HTTPS, a global CDN and zero cost.`,
        answer: 'Free tier / static hosting',
        hint: 'Is there any server to run at all?',
        steps: ['Static files only.', 'Static hosts serve from a CDN with HTTPS for free.', 'Deploys on git push.', 'Free tier / static hosting (Netlify, Vercel, Cloudflare Pages).'],
        followups: [
          { q: 'This static app suddenly gets 1M visitors a day. What happens?', options: ['Usually fine: static files are served from the CDN; check the plan’s bandwidth limits', 'The server crashes', 'You must move to Kubernetes', 'Users need to install a server'], why: 'Static content on a CDN is the cheapest thing to scale.' },
        ],
      };
    },
    (pick) => {
      const u = pick(['2K', '5K', '10K']);
      return {
        q: `A side project API with ${u} daily users outgrew the free tier (cold starts, quota limits). Budget is under $20/month and you’re comfortable with Linux and Docker.`,
        answer: 'Single VPS',
        hint: 'Cheapest real compute you control.',
        steps: ['Free tier limits are the problem.', 'Budget is tiny; skills exist to self-manage.', 'One VPS with Docker, Nginx and Postgres.', 'Single VPS (with automated backups).'],
        followups: [
          { q: 'What must you add before real users depend on that VPS?', options: ['Automated off-box backups, monitoring/alerts and security updates', 'Kubernetes', 'A second region', 'Nothing'], why: 'A single box is a single point of failure; backups are non-negotiable.' },
        ],
      };
    },
    () => ({
      q: 'A 3-person startup keeps getting paged because their self-managed VPS ran out of disk and the database backup script silently failed. Nobody wants to do ops; they want to ship features.',
      answer: 'Managed PaaS',
      hint: 'Trade some money for not running servers.',
      steps: ['Ops work is hurting a tiny team.', 'A PaaS handles builds, scaling, patches and managed DB backups.', 'Higher bill, far less toil.', 'Managed PaaS (Render, Railway, Cloud Run, Heroku).'],
      followups: [
        { q: 'When do teams typically leave a PaaS?', options: ['When cost markups or missing control (networking, compliance) outweigh the convenience at larger scale', 'After the first user', 'Never', 'When they add a second developer'], why: 'Name the trigger for climbing the ladder.' },
      ],
    }),
    (pick) => {
      const what = pick(['a fintech app that needs private networking and audit logs', 'an e-commerce app needing multi-AZ databases and a CDN', 'a B2B SaaS with enterprise security reviews']);
      return {
        q: `You’re building ${what}. You need managed databases across availability zones, object storage, a CDN, queues and fine-grained access control.`,
        answer: 'Full cloud (IaaS + managed services)',
        hint: 'Many managed building blocks plus security controls.',
        steps: ['Multi-AZ reliability and many services needed.', 'Security and networking control required.', 'Compose AWS/GCP/Azure managed services.', 'Full cloud.'],
        followups: [
          { q: 'Simplest guardrail against a surprise cloud bill?', options: ['Budgets and billing alerts plus resource tagging from day one', 'Use bigger instances', 'Turn off logging', 'Avoid managed services'], why: 'Cost visibility is part of the design, not an afterthought.' },
        ],
      };
    },
    (pick) => {
      const n = pick([40, 80, 150]);
      return {
        q: `${n} services owned by many teams, a 99.99% SLA, and users on three continents who need low latency. A whole region outage must not take the product down.`,
        answer: 'Kubernetes / multi-region',
        hint: 'Scale of teams, strict SLA, global users.',
        steps: ['Many services need consistent deploys and scaling.', '99.99% and region-outage survival require multiple regions.', 'Orchestrate with Kubernetes; replicate data across regions.', 'Kubernetes / multi-region.'],
        followups: [
          { q: 'A 5K-user startup asks for Kubernetes across three regions. Your advice?', options: ['Not yet: a VPS or PaaS (or one region with multiple AZs) is cheaper and simpler; revisit when SLA or scale demands it', 'Yes, start big', 'Yes, but only two regions', 'Use bare metal'], why: 'Premature complexity is a classic interview and real-world mistake.' },
        ],
      };
    },
  ],
});
