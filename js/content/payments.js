SG.add({
  id: 'payments',
  ref: 'R6 R14',
  section: 'Building blocks',
  title: 'Payments, ledgers and multi-tenancy',
  short: 'Payments and tenants',
  blurb: 'Moving money safely: idempotent APIs, append-only double-entry ledgers, reconciliation, and tenant isolation.',
  intro: 'Payment systems pick consistency over availability: a short error is better than a double charge or a lost rupee. Four ideas carry most of the weight. Idempotency keys turn retries into safe replays. A double-entry ledger records every movement as balanced, immutable entries, so balances can always be rebuilt. Reconciliation against bank or PSP settlement files catches what your own systems got wrong. And because payment platforms serve many merchants, you must choose how strongly to isolate tenants: shared tables keyed by tenant, or separate databases for those who need it.',
  options: {
    'Idempotency keys': {
      eli5: 'Each cheque has a unique number. If the bank sees the same cheque number twice, it knows it’s the same cheque and won’t pay it twice.',
      industry: [
        'Stripe’s Idempotency-Key header on POST /payments and refunds, stored ~24 hours.',
        'UPI and card flows: a client-generated request ID per checkout attempt.',
        'Internal ledgers keyed by (client ID, idempotency key) with a stored response.',
      ],
      def: 'The client generates a unique key per intent (one checkout attempt) and sends it with every retry. The server claims the key atomically (unique constraint on client + key), stores a fingerprint of the request, and saves the final response in the same transaction as the money movement. A retry with the same key and payload returns the stored response; a different payload with the same key is rejected; an in-flight duplicate gets 409 or waits.',
      scenarios: [
        'Clients retry on timeouts and users double-tap “Pay”',
        'A response is lost after the charge actually succeeded',
        'Two identical requests arrive at the same instant',
      ],
      scale: 'Keys are kept for a bounded window (24 hours to 30 days). A cache can short-circuit repeats, but the database unique constraint is the real guard.',
    },
    'Double-entry ledger': {
      eli5: 'A khata book where every transaction is written on two lines, “Ramesh −₹50” and “Suresh +₹50”, in ink. You never erase; to fix a mistake you write a new correcting line.',
      industry: [
        'Stripe, Square, PayPal and every bank core keep append-only double-entry ledgers.',
        'Wallets (Paytm, PhonePe) record user, merchant and fee accounts as entries.',
        'Uber/Airbnb payout ledgers, rebuilt into balances by projections.',
      ],
      def: 'Every transaction is a set of entries (account, signed amount, currency) that sum to zero, committed atomically. Entries are immutable: corrections are new reversal transactions linked to the original. Balances are a derived, versioned view of the entries, so they can be rebuilt and audited at any time.',
      scenarios: [
        'Balances must be explainable and auditable for years',
        'Money moves between users, merchants, fees and reserves',
        'Fixing mistakes without destroying history',
      ],
      scale: 'Hot accounts (a big merchant) serialise writes; lock accounts in a fixed ID order or use optimistic versions, and partition by ledger or tenant to keep transfers local.',
    },
    'Reconciliation with settlement files': {
      eli5: 'At the end of the month you tick every line of your bank statement against your own diary. Anything that doesn’t match gets circled and investigated.',
      industry: [
        'Payment gateways matching daily acquirer/bank settlement files (SFTP/S3) against their ledger.',
        'UPI apps reconciling with NPCI and bank reports.',
        'Internal reconcilers comparing projected balances with the sum of ledger entries.',
      ],
      def: 'A batch job downloads the external source of truth (bank/PSP settlement reports), matches each record to internal transactions by unique transaction ID (never by amount or timestamp alone), marks matches as settled, and pushes mismatches to an exceptions queue for automatic refund/repair or manual review. It catches bugs, timeouts with unknown outcomes and missed webhooks.',
      scenarios: [
        'A charge timed out and you don’t know if the bank captured it',
        'Bank and internal records disagree',
        'Finance needs proof that what you recorded is what actually moved',
      ],
      scale: 'Runs daily or hourly over millions of rows; time zones and cut-offs mean records cross day boundaries, so match on IDs you passed to the bank.',
    },
    'Shared tables with tenant ID (pooled)': {
      eli5: 'One big apartment building: every family shares the lifts and pipes, but each flat has a number on the door and keys only open your own flat.',
      industry: [
        'Most SaaS products (Shopify, Freshworks, Zoho apps) run many tenants per database.',
        'Postgres row-level security keyed on tenant_id.',
        'Stripe-style platforms sharding by merchant ID so each merchant’s rows sit together.',
      ],
      def: 'All tenants share the same schema and tables; every row carries a tenant_id, every query filters by it (enforced by middleware or row-level security), and shards are chosen by tenant. Cheapest and simplest to operate: one migration, one fleet. Weakest isolation: a bug in a WHERE clause can leak data, and a noisy tenant affects neighbours. Schema-per-tenant is a middle ground.',
      scenarios: [
        'Thousands of small tenants with similar needs',
        'Cost per tenant must be low and onboarding instant',
        'One team must run migrations across all tenants at once',
      ],
      scale: 'Scales to millions of tenants by sharding on tenant ID. Watch per-tenant quotas and rate limits for noisy neighbours, and move huge tenants to dedicated shards.',
    },
    'Database per tenant (silo)': {
      eli5: 'Each family gets its own house with its own gate and meter. More expensive, but your neighbour’s party never floods your kitchen.',
      industry: [
        'Enterprise and banking SaaS offering “dedicated” tiers.',
        'Salesforce/Atlassian data residency options for regulated customers.',
        'Fintech platforms giving large bank partners their own database and encryption keys.',
      ],
      def: 'Each tenant gets its own database (or cluster/account), so data, encryption keys, backups, region and performance are isolated. Strongest isolation and easiest per-tenant restore or deletion, but the most expensive: every migration and upgrade runs N times and fleet management becomes the main job.',
      scenarios: [
        'Regulators or contracts demand physical data isolation or a specific region',
        'Tenants need their own keys, backups or restore points',
        'A few very large tenants whose load must not affect others',
      ],
      scale: 'Practical for tens to a few thousand tenants; beyond that, automation of migrations and monitoring dominates cost. Many products mix tiers: pooled by default, silo for premium.',
    },
  },
  scenarios: [
    (pick) => {
      const amt = pick(['₹2,499', '₹14,999', '$89']);
      return {
        q: `Customers report being charged ${amt} twice. Logs show the mobile app timed out after 10 seconds and retried the POST /payments call, but the first call had already succeeded at the bank.`,
        answer: 'Idempotency keys',
        hint: 'The retry is the same intent, not a new payment.',
        steps: ['Network timeouts make the client unsure, so it retries.', 'The server can’t tell a retry from a new payment.', 'A client-generated key per checkout attempt lets the server return the stored result.', 'Idempotency keys.'],
        followups: [
          { q: 'Two copies of the same request arrive simultaneously and both miss the Redis check. What actually prevents a double charge?', options: ['A unique constraint on (client, key) claimed in the same DB transaction as the payment', 'Redis alone', 'Hoping it’s rare', 'A longer TTL'], why: 'Cache checks race; the database constraint lets exactly one request own the key.' },
          { q: 'A retry reuses the same key but with amount 60 instead of 50. What should happen?', options: ['Reject it as a conflict: the stored request fingerprint doesn’t match', 'Charge 60', 'Charge 110', 'Return the old response silently'], why: 'The key names one intent; the fingerprint proves the payload is the same.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['3 million', '12 million', '40 million']);
      return {
        q: `A wallet with ${n} users stores one balance column per user and updates it with UPDATE … SET balance = balance − 50. Auditors can’t explain how some balances reached their values, and a bug last month left money that appears in neither the sender’s nor the receiver’s history.`,
        answer: 'Double-entry ledger',
        hint: 'Record movements, not just the latest number.',
        steps: ['A mutable balance hides history and allows one-sided updates.', 'Record each transfer as balanced entries that sum to zero, committed together.', 'Derive balances from entries so they can be rebuilt and audited.', 'Double-entry ledger.'],
        followups: [
          { q: 'Two transfers touch the same hot merchant account at once. How do you avoid deadlocks and lost updates?', options: ['Lock affected accounts in a fixed order (or use optimistic versions) and retry with the same idempotency identity', 'Remove all locking', 'Write to a cache first', 'Let the last write win'], why: 'Deterministic ordering prevents deadlocks; versions catch concurrent changes.' },
        ],
      };
    },
    (pick) => {
      const amt = pick(['$50', '₹4,000', '€120']);
      return {
        q: `Your payment database marks a ${amt} transaction as failed because the bank call timed out, but the next morning’s acquirer settlement file shows the bank captured it. This happens a few hundred times a day.`,
        answer: 'Reconciliation with settlement files',
        hint: 'Who is the real source of truth for money that moved?',
        steps: ['Timeouts create unknown outcomes your system can’t resolve alone.', 'The bank’s settlement file is the final truth.', 'Match by transaction ID, mark settled, and queue mismatches for refund or review.', 'Reconciliation.'],
        followups: [
          { q: 'Why match on a unique transaction ID you passed to the bank, not on amount and timestamp?', options: ['Amounts repeat and clocks/time zones differ, so only IDs match reliably', 'Timestamps are always exact', 'Amounts are unique', 'Banks don’t send amounts'], why: 'A charge at 23:59:59 can show up as the next day at the bank.' },
          { q: 'How should the merchant learn that a payment succeeded without the dual-write problem?', options: ['Write the status and an outbox row in one transaction; a relay publishes to Kafka and webhook workers deliver with retries', 'Call the webhook inside the DB transaction', 'Publish to Kafka then update the DB', 'Email the merchant'], why: 'The outbox gives at-least-once webhooks that are never lost; merchants dedupe by event ID.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['20,000', '80,000', '250,000']);
      return {
        q: `A billing SaaS for Indian small businesses has ${n} shops, most with a few hundred invoices a month. Pricing is ₹299/month, so infrastructure per tenant must be tiny, and new shops should be live in seconds.`,
        answer: 'Shared tables with tenant ID (pooled)',
        hint: 'Many small, similar tenants and a tight budget.',
        steps: ['A database per shop would cost more than the subscription.', 'Shared schema with tenant_id on every row is cheap and instant to onboard.', 'Enforce isolation with row-level security and shard by tenant as you grow.', 'Pooled multi-tenancy.'],
        followups: [
          { q: 'What is the biggest risk of this model, and a common guard?', options: ['A missing tenant filter leaks data; enforce it centrally (row-level security or a mandatory query layer)', 'Migrations are impossible', 'It can’t scale past 100 tenants', 'Backups don’t work'], why: 'Isolation is logical, so it must be enforced in one place, not in every query by hand.' },
        ],
      };
    },
    (pick) => {
      const bank = pick(['a large private bank', 'a European insurer', 'a government lender']);
      return {
        q: `Your payments platform signs ${bank} as a customer. Their contract requires their data in a specific region, encrypted with their own keys, restorable independently, and unaffected by other customers’ load spikes.`,
        answer: 'Database per tenant (silo)',
        hint: 'Contractual and regulatory isolation, not just logical filtering.',
        steps: ['Requirements are physical isolation, own keys, own restore point and region.', 'Shared tables can’t give separate keys, backups or performance.', 'Give this tenant a dedicated database (or cluster).', 'Silo tenancy, often as a premium tier beside a pooled default.'],
        followups: [
          { q: 'What gets harder as the number of silo tenants grows?', options: ['Running migrations, upgrades and monitoring across many databases', 'Writing a single query', 'Encrypting data', 'Choosing a region'], why: 'Operational cost scales with the number of databases, so automation is essential.' },
        ],
      };
    },
    (pick) => {
      const amt = pick(['₹500', '₹12,000', '$300']);
      return {
        q: `Support finds a ${amt} transfer was posted to the wrong merchant last week. A developer proposes editing the merchant ID on the existing ledger rows so the books look right.`,
        answer: 'Double-entry ledger',
        hint: 'What happens to the audit trail if rows are edited?',
        steps: ['Committed entries must never be edited or deleted.', 'Post a balanced reversal transaction linked to the original.', 'Then post the correct transfer as a new transaction.', 'The double-entry ledger keeps full, explainable history.'],
        followups: [
          { q: 'A balance projection is found to be wrong. What do you repair?', options: ['Rebuild the projection from immutable entries; never edit the ledger to match the view', 'Edit ledger entries to match the balance', 'Delete the account', 'Ignore it'], why: 'Entries are the truth; balances are derived and can be rebuilt.' },
        ],
      };
    },
  ],
});
