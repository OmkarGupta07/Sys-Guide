SG.add({
  id: 'deploys',
  ref: 'M7 M8',
  section: 'Operations',
  title: 'Rolling, blue-green, canary and feature flags',
  short: 'Deployment strategies',
  blurb: 'Shipping new versions without downtime, and limiting the blast radius when something is wrong.',
  intro: 'Every deploy is a risk. Strategies trade speed, cost, rollback time and how many users see a bad release. Most teams combine them: rolling or canary for the binary, feature flags for the features inside it.',
  options: {
    'Rolling deployment': {
      eli5: 'Replacing the bulbs in a hall one at a time. The room never goes dark, but for a while some bulbs are old and some are new.',
      industry: [
        'Kubernetes Deployments roll pods gradually (maxSurge / maxUnavailable).',
        'AWS ECS and Auto Scaling Group instance refresh.',
        'The default for most stateless services.',
      ],
      def: 'Update instances in batches while the rest keep serving traffic. No extra environment needed and no downtime. Old and new versions run side by side during the rollout, rollback means rolling back again, and you can’t choose which users get the new version.',
      scenarios: [
        'Routine releases of stateless services',
        'No budget for a duplicate environment',
        'Zero downtime required, but no user targeting needed',
      ],
      scale: 'Both versions must be compatible with the same database schema and APIs during the rollout.',
    },
    'Blue-green': {
      eli5: 'Two identical stages at a concert. The band rehearses on the empty stage, then the spotlight swings over in one move; if it sounds bad, swing it back.',
      industry: [
        'AWS CodeDeploy blue/green, Kubernetes with two Deployments behind one Service.',
        'Releases where instant rollback is essential.',
        'Testing the full production stack before any user sees it.',
      ],
      def: 'Run two identical production environments. Deploy and test on the idle one (green), then switch the load balancer/DNS from blue to green for everyone at once. Rollback = switch back. Costs double infrastructure during the switch and needs careful handling of shared data.',
      scenarios: [
        'Instant, low-risk rollback is a priority',
        'You want to test the new version in a production-identical environment first',
        'Infrequent, high-stakes releases',
      ],
      scale: 'Database changes must work for both colours; all users switch at once, so no gradual exposure.',
    },
    'Canary release': {
      eli5: 'Miners took a canary into the mine; if the bird got sick, everyone left before getting hurt. Send the new version to a few users first and watch.',
      industry: [
        'Netflix, Google and Facebook release to 1% → 10% → 50% → 100% with automated analysis.',
        'Service mesh or load balancer weighted routing.',
        'Canary by region, device type or internal employees first.',
      ],
      def: 'Route a small, chosen slice of traffic (percentage, region, user group) to the new version, compare its error rates and latency with the old version, then ramp up or roll back automatically. Limits blast radius and allows targeting; needs good metrics and automation.',
      scenarios: [
        'Large user base where a bad release would hurt many people',
        'You want real-traffic validation before full rollout',
        'Targeting a region or user segment first',
      ],
      scale: 'Without automated health comparison, canaries are just slow rollouts.',
    },
    'Feature flags': {
      eli5: 'A light switch built into the wall before the lamp arrives. The wiring is there; you decide later who gets the light on.',
      industry: [
        'LaunchDarkly, Unleash, Flagsmith, or in-house flag services.',
        'A/B experiments and gradual feature rollouts to 5% of users.',
        'Kill switches to disable a misbehaving feature instantly.',
      ],
      def: 'Ship code with new features turned off, then enable them per user, segment or percentage at runtime, without a redeploy. Separates deploying code from releasing features; enables A/B tests and instant kill switches. Old flags must be cleaned up (flag debt).',
      scenarios: [
        'Releasing a feature to some users while code is already deployed for all',
        'A/B testing two variants',
        'Instantly disabling a feature in an incident',
      ],
      scale: 'Every flag doubles a code path to test; remove flags once a feature is fully launched.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick([20, 40, 60]);
      return {
        q: `A stateless API runs on ${n} pods. The team ships small changes daily, can’t afford downtime, and doesn’t need to choose which users see the new version.`,
        answer: 'Rolling deployment',
        hint: 'Simple, routine, no spare environment.',
        steps: ['Stateless, frequent, low-risk releases.', 'Replace pods in batches while others serve.', 'No duplicate environment or targeting needed.', 'Rolling deployment.'],
        followups: [
          { q: 'Mid-rollout, old and new pods run together. What must be true?', options: ['Both versions work with the same database schema and API contracts', 'Nothing', 'Old pods must be stopped first', 'Users must log out'], why: 'Backward-compatible changes (expand, then contract) make rolling deploys safe.' },
        ],
      };
    },
    () => ({
      q: 'A payments platform releases monthly. Each release must be tested on full production infrastructure before any customer sees it, and rollback must take seconds, not a redeploy.',
      answer: 'Blue-green',
      hint: 'Two identical environments, one switch.',
      steps: ['Test on a production-identical environment first.', 'Switch all traffic at once via the load balancer.', 'Rollback = flip back to the old environment.', 'Blue-green.'],
      followups: [
        { q: 'Main cost of blue-green?', options: ['Running two full production environments (plus keeping shared data compatible)', 'It always causes downtime', 'It can’t roll back', 'It needs feature flags'], why: 'Instant rollback is paid for in infrastructure.' },
      ],
    }),
    (pick) => {
      const u = pick(['50M', '200M']);
      return {
        q: `An app with ${u} users is releasing a new recommendation engine. A bug could hurt engagement for everyone, so the team wants to expose it to 1% of traffic, compare error rates and latency automatically, then ramp up.`,
        answer: 'Canary release',
        hint: 'A small slice of real traffic, measured, then expanded.',
        steps: ['Huge blast radius if wrong.', 'Send 1% of traffic, compare metrics with the baseline.', 'Ramp to 10%, 50%, 100% or roll back automatically.', 'Canary release.'],
        followups: [
          { q: 'What makes a canary safe rather than just slow?', options: ['Automated comparison of canary vs baseline metrics with automatic rollback', 'Releasing at night', 'Using bigger servers', 'Skipping tests'], why: 'Canaries rely on good observability.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['a new checkout design', 'a redesigned search results page', 'a new pricing page']);
      return {
        q: `Product wants to show ${what} to 10% of users, measure conversion against the old one, and switch it off instantly if something breaks, all without redeploying.`,
        answer: 'Feature flags',
        hint: 'Separate deploying code from releasing a feature.',
        steps: ['Both variants live in the deployed code.', 'A flag decides per user who sees which.', 'Turn off instantly as a kill switch.', 'Feature flags (A/B test).'],
        followups: [
          { q: 'Six months later the codebase has 300 old flags. Problem?', options: ['Flag debt: dead code paths and combinations that are hard to test; remove launched flags', 'None', 'Flags speed things up', 'Users see random features'], why: 'Flags need a cleanup process.' },
        ],
      };
    },
    () => ({
      q: 'A release renames a database column the old version still reads. During the rolling deploy, half the pods crash with SQL errors.',
      answer: 'Rolling deployment',
      hint: 'Which strategy ran old and new code side by side, and what should the migration have looked like?',
      steps: ['In a rolling deploy, old and new versions overlap.', 'A breaking schema change breaks the old pods.', 'Use expand-and-contract: add the new column, write both, migrate, then remove the old one in a later release.', 'Rolling deployment needs backward-compatible migrations.'],
      followups: [
        { q: 'What is the “expand and contract” pattern?', options: ['Add new schema alongside old, migrate gradually, remove old only after nothing uses it', 'Grow then shrink the server count', 'Compress the database', 'Drop and recreate the table'], why: 'It’s how zero-downtime schema changes are done.' },
      ],
    }),
  ],
});
