SG.add({
  id: 'dr',
  ref: 'M9 M10 M11 M12',
  section: 'Operations',
  title: 'Backups, RPO/RTO, multi-region and chaos',
  short: 'Disaster recovery',
  blurb: 'How much data you can lose, how long you can be down, and the cheapest setup that meets both.',
  intro: 'Disaster recovery starts with two numbers: RTO (how long you can be down) and RPO (how much data, in time, you can lose). Tighter numbers need costlier setups, from nightly backups to fully active multi-region systems. A plan you haven’t tested is a hope, not a plan.',
  options: {
    'Backup and restore': {
      eli5: 'Keeping photocopies of important papers in a bank locker. Cheap and safe, but if your house burns down, it takes a while to rebuild everything from the copies.',
      industry: [
        'Nightly database snapshots and S3 backups in another region.',
        'Point-in-time recovery from continuous WAL/binlog archiving (RDS PITR).',
        'Non-critical internal tools and archives.',
      ],
      def: 'Regularly copy data (snapshots, logs) to separate, durable storage, ideally another region and account. Nothing runs on standby; after a disaster you rebuild infrastructure and restore. Cheapest option; RTO of hours, RPO equal to backup frequency (or minutes with log archiving).',
      scenarios: [
        'Non-critical systems where hours of downtime are acceptable',
        'Protection against accidental deletion and ransomware',
        'Compliance retention requirements',
      ],
      scale: 'Backups you’ve never restored may not work: test restores regularly.',
    },
    'Pilot light / warm standby': {
      eli5: 'A gas stove’s pilot light: a tiny flame always burning, so the full burner lights instantly. Warm standby is keeping a small burner going all the time.',
      industry: [
        'A replicated database always running in a second region, app servers off or minimal (pilot light).',
        'A scaled-down copy of the whole stack serving no or little traffic (warm standby).',
        'AWS DR strategies between backup/restore and active-active.',
      ],
      def: 'Keep core components (databases with continuous replication) running in a recovery region; app servers are off (pilot light) or running small (warm standby). On disaster, scale up and fail traffic over. Middle ground: RTO of minutes to tens of minutes, RPO of seconds to minutes, moderate cost.',
      scenarios: [
        'Important systems needing recovery in minutes, not hours',
        'Budget can’t justify two full production stacks',
        'Regulated businesses with defined RTO/RPO',
      ],
      scale: 'Scale-up takes time; automate it and rehearse it.',
    },
    'Active-active multi-region': {
      eli5: 'Two fully staffed branches of a bank in different cities, both serving customers. If one closes, the other already has everyone’s records and simply takes more customers.',
      industry: [
        'Netflix, large payment networks and global SaaS run multiple live regions.',
        'DNS/latency-based routing (Route 53) with health checks.',
        'Multi-region databases (Spanner, DynamoDB global tables, Cassandra).',
      ],
      def: 'Run full production in two or more regions simultaneously, each serving traffic, with data replicated between them. A region failure only shifts traffic: near-zero RTO and RPO (seconds). Most expensive and complex: data consistency across regions, conflict handling, double cost.',
      scenarios: [
        'Mission-critical systems where minutes of downtime are unacceptable',
        'Global users who also benefit from lower latency',
        'Strict SLAs like 99.99% or better',
      ],
      scale: 'Cross-region consistency is the hard part; decide per data type what can be eventually consistent.',
    },
    'Chaos engineering and DR drills': {
      eli5: 'Fire drills at school. You practise leaving the building so that on the real day nobody panics and every exit actually opens.',
      industry: [
        'Netflix Chaos Monkey kills instances in production to prove resilience.',
        'Game days: deliberately failing over a region and timing recovery.',
        'Synthetic monitoring that “fakes” user journeys to detect failures first.',
      ],
      def: 'Deliberately inject failures (kill servers, block network, fail a region) in controlled experiments, and run scheduled DR drills to verify that failover, backups and runbooks actually meet RTO/RPO. Plus postmortems after incidents to fix root causes, blamelessly.',
      scenarios: [
        'You have a DR plan but have never tested it',
        'Confidence that failover really works under pressure',
        'Learning from incidents without blaming individuals',
      ],
      scale: 'Start small (staging, one instance) and expand the blast radius as confidence grows.',
    },
  },
  scenarios: [
    (pick) => {
      const what = pick(['an internal wiki', 'a reporting dashboard used weekly', 'a company’s HR document archive']);
      return {
        q: `For ${what}, the business can tolerate being down for a day and losing up to 24 hours of changes. Budget is minimal.`,
        answer: 'Backup and restore',
        hint: 'Loose RTO and RPO, tight budget.',
        steps: ['RTO ~1 day, RPO ~24 h.', 'Nothing needs to run on standby.', 'Daily backups to another region; restore when needed.', 'Backup and restore.'],
        followups: [
          { q: 'RPO vs RTO in one line?', options: ['RPO = how much data (in time) you can lose; RTO = how long you can be down', 'They’re the same', 'RTO = data loss; RPO = downtime', 'Both measure cost'], why: 'The two numbers that size every DR plan.' },
        ],
      };
    },
    (pick) => {
      const rto = pick([15, 30]);
      return {
        q: `An e-commerce company sets RTO = ${rto} minutes and RPO = 1 minute for its store. Running a second full production stack all the time is too expensive.`,
        answer: 'Pilot light / warm standby',
        hint: 'Minutes to recover, near-continuous data replication, moderate cost.',
        steps: ['RPO 1 min needs continuous database replication to another region.', `RTO ${rto} min allows scaling up app servers after failover.`, 'Keep the database live there; app tier minimal.', 'Pilot light / warm standby.'],
        followups: [
          { q: 'After the primary region recovers, what is “failback”?', options: ['Syncing changes made during the outage back and switching traffic home safely', 'Deleting the backup region', 'Restoring last night’s backup', 'Doing nothing'], why: 'Failback is a planned, tested step too.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['a UPI-style payment switch', 'a stock exchange’s order gateway', 'a global ride-hailing dispatch system']);
      return {
        q: `For ${what}, even 2 minutes of downtime makes headlines, and no confirmed transaction can be lost. Users are in several countries.`,
        answer: 'Active-active multi-region',
        hint: 'Near-zero RTO and RPO.',
        steps: ['RTO and RPO near zero.', 'Full production in multiple regions, all serving traffic.', 'Health-checked routing shifts traffic away from a failed region.', 'Active-active multi-region.'],
        followups: [
          { q: 'Hardest part of active-active?', options: ['Keeping data consistent across regions (conflicts, replication lag) while staying available', 'Buying domain names', 'Writing logs', 'Picking a region name'], why: 'Multi-region is a data problem more than a server problem.' },
        ],
      };
    },
    () => ({
      q: 'A company has a written DR plan with RTO 30 minutes. During a real region outage, failover took 5 hours: credentials had expired, a runbook step was outdated, and nobody had practised.',
      answer: 'Chaos engineering and DR drills',
      hint: 'The plan existed; what was missing?',
      steps: ['Untested plans fail in surprising ways.', 'Run scheduled DR drills and game days.', 'Inject failures deliberately (chaos experiments) and fix what breaks.', 'Chaos engineering and DR drills.'],
      followups: [
        { q: 'What makes a postmortem “blameless”?', options: ['It focuses on how the system and process allowed the failure, not on punishing individuals', 'Nobody writes it', 'It blames the vendor', 'It’s kept secret'], why: 'Blame hides information; blamelessness surfaces root causes.' },
      ],
    }),
    () => ({
      q: 'Ransomware encrypted the production database and the replica, because replication copied the encrypted data instantly. The team assumed replication meant they had backups.',
      answer: 'Backup and restore',
      hint: 'Replication copies mistakes too.',
      steps: ['Replicas mirror every change, including corruption and deletions.', 'Backups are point-in-time copies kept separately.', 'Keep immutable/offline backups in a separate account and test restores.', 'Backup and restore (replication is not a backup).'],
      followups: [
        { q: 'Which feature protects backups from being deleted by an attacker with admin access?', options: ['Immutable backups (object lock) in a separate account', 'A longer password', 'More replicas', 'Faster disks'], why: 'Backups must survive the same compromise that hit production.' },
      ],
    }),
  ],
});
