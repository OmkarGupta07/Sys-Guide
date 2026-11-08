SG.add({
  id: 'case-notify',
  ref: 'S5',
  section: 'HLD case studies',
  title: 'Design a notification service',
  short: 'Notification service',
  blurb: 'A multi-channel notification platform: fast intake, templates and preferences, dedupe, retries, DLQs and provider failover.',
  intro: 'You are not building APNs or FCM; you are building the platform that sits in front of them (and SMS/email providers) for many product teams or tenants. Functional scope: register devices and contacts, send to a user or a segment through templates, respect preferences, and schedule sends. The NFRs: accept a send request in milliseconds even for millions of recipients, never silently lose a notification (at-least-once), avoid visible duplicates, sustain ~100K–250K deliveries/s, and stay up when a provider fails. So: buffer through Kafka and fan out with workers, render templates and check preferences before sending, dedupe with idempotency keys, retry with backoff and park failures in a DLQ, and keep more than one provider per channel.',
  options: {
    'Kafka-buffered fan-out pipeline': {
      eli5: 'Like a wedding invitation desk: you hand over the guest list and leave. The team behind the desk works out addresses, prints cards and hands them to couriers at their own pace.',
      industry: [
        'OneSignal/Braze-style APIs that acknowledge after a durable Kafka write, then fan out asynchronously.',
        'Stages: intake topic → segment resolver (users → devices) → per-channel send topics → sender workers.',
        'Sender pools keeping persistent HTTP/2 connections to APNs/FCM.',
      ],
      def: 'The API validates the request, writes one message to a durable log and returns a notification ID; the slow work happens later. Resolver workers expand the target (user, list or segment query) into recipients and devices, write one small job per device to channel-specific topics, and stateless sender workers deliver to providers. Each stage scales on its own, a crash resumes from committed offsets, and bursts queue up instead of timing out callers. Scheduled sends (“9 a.m. in each user’s time zone”) wait in a table indexed by send time, and a poller enqueues them when due. Separate topics per priority keep OTPs ahead of campaigns.',
      scenarios: [
        'One call must reach millions of devices without blocking the caller',
        'Notifications must not be lost when workers crash',
        'Throughput spikes (campaigns, breaking news) far above average',
      ],
      scale: '250K pushes/s at ~1K/s per sender connection pool means ~250 sender workers. Millions of 4 KB jobs are only a few GB in Kafka, written in seconds with large batches.',
    },
    'Templates and user preferences check': {
      eli5: 'A sweet shop with ready printed boxes for each festival (you just add the name), and a register of who said “no calls after 9 p.m.” or “only SMS, please”.',
      industry: [
        'Template stores with versioned, localised bodies per channel (push title, SMS text, HTML email).',
        'Preference centres: opt-outs per category, channel choice, quiet hours, time zone.',
        'Frequency caps (e.g. max 3 marketing pushes/day per user) enforced with per-user counters in Redis.',
      ],
      def: 'Callers send a template ID plus variables, not raw text; the platform renders per channel and locale, so copy changes don’t need deploys and legal can review templates. Before sending, every job checks the user’s preferences: category opt-outs, preferred channels, quiet hours in their time zone (defer, don’t drop), and per-user frequency caps. Transactional messages (OTP, payment alerts) bypass marketing caps but still respect hard opt-outs.',
      scenarios: [
        'Users complain about promotions at night or too many per day',
        'Many teams send in several languages and channels',
        'Regulations require honouring unsubscribe and consent per category',
      ],
      scale: 'Preferences are read on every send, so cache them (user ID → prefs) with short TTLs; frequency-cap counters are cheap Redis INCRs with day-long TTLs.',
    },
    'Idempotency keys and dedupe': {
      eli5: 'Each courier parcel has a tracking number. If two delivery boys turn up with the same number, the guard accepts only the first.',
      industry: [
        'Caller-supplied idempotency keys on the send API, stored for 24 hours.',
        'Per-device delivery keys (notification ID + device ID) checked in Redis with SET NX before sending.',
        'APNs apns-collapse-id and FCM collapse_key so repeats replace rather than stack on the device.',
      ],
      def: 'At-least-once pipelines will redeliver after crashes, rebalances and retries, so dedupe at two levels. The API stores the caller’s idempotency key so a retried request doesn’t start a second campaign. Senders record a delivery key (notification ID + device) atomically before calling the provider and skip if it already exists. Provider collapse IDs give a last line of defence on the device. Derive keys from the notification’s identity, not its text, or two genuinely different alerts with the same words would merge.',
      scenarios: [
        'A consumer crash or rebalance resends a batch',
        'The calling service retries the send API after a timeout',
        'Duplicate OTPs or payment alerts confuse users',
      ],
      scale: 'Dedupe keys are tiny and short-lived (hours to a day), so millions per hour fit easily in a Redis cluster with TTLs.',
    },
    'Retries with backoff and DLQ': {
      eli5: 'If nobody opens the door, the postman tries again later, then later again; after a few tries the letter goes to the “return to sender” shelf instead of blocking his whole route.',
      industry: [
        'Retry topics with increasing delays (1 min, 5 min, 30 min) before a dead-letter topic.',
        'Classifying provider responses: 429/5xx are retryable; APNs 410 Unregistered or invalid tokens are permanent.',
        'DLQ dashboards and replay tools for on-call engineers after an outage.',
      ],
      def: 'Classify every failure. Transient ones (timeouts, 5xx, 429 throttling) go to retry topics with exponential backoff and jitter, so the main partition keeps flowing. Permanent ones are not retried: invalid or unregistered tokens are deleted from the device table, bad payloads go to a dead-letter queue. After N attempts or a deadline (an OTP is useless after 5 minutes), park the job in the DLQ, alert, and allow replay once the cause is fixed.',
      scenarios: [
        'A provider is throttling or briefly failing',
        'One bad message keeps failing and blocks its partition',
        'Old device tokens keep returning “unregistered”',
      ],
      scale: 'Separate retry topics keep a backlog of failures from delaying fresh sends; give each message a TTL so late, stale notifications are dropped rather than sent.',
    },
    'Multi-provider failover': {
      eli5: 'A caterer books two milk suppliers. If one van breaks down on the wedding morning, the second one delivers and the guests never notice.',
      industry: [
        'SMS routed across several aggregators (e.g. Twilio, Gupshup, Kaleyra) by health, price and region.',
        'Email sent via SES with SendGrid as a fallback.',
        'Circuit breakers per provider that open on error-rate spikes and shift traffic automatically.',
      ],
      def: 'For channels with interchangeable vendors (SMS, email, voice), keep two or more providers behind one internal interface. Track each provider’s error rate and latency; a circuit breaker opens when one degrades and routing shifts to the healthy one, with weighted routing for cost and gradual shift-back after recovery. Push has a single gateway per platform (APNs, FCM), so for push you fall back to another channel (e.g. SMS for an OTP) instead.',
      scenarios: [
        'An SMS vendor has an outage during a sale and OTPs stop',
        'One provider is much cheaper or more reliable for a given country',
        'Critical alerts need a fallback channel when push fails',
      ],
      scale: 'Failover should take seconds (breaker thresholds over ~10–30 s windows). Keep enough contracted capacity on the backup to carry 100% of critical traffic.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick(['5 million', '20 million', '50 million']);
      const rate = pick(['100,000', '250,000', '500,000']);
      return {
        q: `Interviewer: “Build a OneSignal-like service. A customer calls POST /notifications with a segment that may match ${n} devices.” You agree on NFRs: the API responds in under 100 ms, no notification is lost even if workers crash, and the system sustains ${rate} deliveries/s. Which decision do these NFRs drive first?`,
        answer: 'Kafka-buffered fan-out pipeline',
        hint: 'The caller can’t wait for millions of sends, and nothing may be dropped.',
        steps: [
          'Sending inline would take minutes and lose work on any crash.',
          'Write the request durably to Kafka, return an ID immediately.',
          'Resolver workers expand the segment into device jobs; sender workers deliver.',
          'Committed offsets let crashed workers resume, giving at-least-once delivery with no loss.',
        ],
        followups: [
          { q: 'At ~1,000 pushes/s per sender’s connection pool, how many senders for 250K/s?', options: ['About 250, horizontally scaled behind the send topic', 'One large server', 'About 25', '25,000'], why: '250,000 ÷ 1,000 = 250; senders are stateless, so they scale out freely.' },
          { q: 'Which delivery guarantee is realistic to promise, and what does it imply?', options: ['At-least-once, so you must dedupe to avoid visible duplicates', 'Exactly-once end to end to the phone', 'At-most-once, losing some is fine', 'No guarantee'], why: 'Retries and redelivery are unavoidable; dedupe makes them invisible.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['order-shipped pushes', 'payment-received alerts', 'OTP SMS']);
      return {
        q: `After a Kafka consumer group rebalance during a deploy, thousands of users receive the same ${what} two or three times. The pipeline is at-least-once by design, and a teammate suggests using a hash of the message text as the collapse ID.`,
        answer: 'Idempotency keys and dedupe',
        hint: 'Redelivery will happen; make the second send a no-op, keyed on identity.',
        steps: [
          'Rebalances replay uncommitted batches, so duplicates are expected.',
          'Before calling the provider, SET NX a delivery key (notification ID + device ID) with a TTL.',
          'Skip the send if the key already exists; also set the provider collapse ID.',
          'Key on the notification’s identity, not its text.',
        ],
        followups: [
          { q: 'Why is “hash of the text” a poor dedupe key?', options: ['Two genuinely different notifications with identical text (e.g. two ₹500 payments) would wrongly merge', 'Hashes are too slow', 'Text is always unique', 'Providers reject hashes'], why: 'Identity is the event, not its wording.' },
          { q: 'The calling service times out and retries POST /notifications. How do you avoid a second campaign?', options: ['Store the caller’s idempotency key and return the original notification ID', 'Reject all retries', 'Send twice and apologise', 'Rely on Kafka ordering'], why: 'Idempotency at the API boundary stops duplicates before they multiply.' },
        ],
      };
    },
    (pick) => {
      const sale = pick(['Big Billion Day', 'an IPL final', 'a festive sale']);
      return {
        q: `During ${sale}, your only SMS aggregator starts returning 503 for 20 minutes. Login OTPs fail, retries pile up, and conversion drops sharply. The OTP NFR is “delivered within 30 seconds, 99.9% of the time”.`,
        answer: 'Multi-provider failover',
        hint: 'Retrying the same broken vendor won’t meet a 30-second NFR.',
        steps: [
          'A single provider is a single point of failure for a critical channel.',
          'Integrate a second (and third) SMS provider behind one interface.',
          'A per-provider circuit breaker opens on the error spike and routes to the healthy one.',
          'Shift back gradually after recovery; keep backup capacity for all OTP traffic.',
        ],
        followups: [
          { q: 'Push has only APNs/FCM. What is the fallback for a critical push?', options: ['Fall back to another channel, e.g. SMS or email for an OTP or security alert', 'Switch to a second APNs', 'Retry forever', 'Drop it'], why: 'There’s no alternative push gateway, but there are alternative channels.' },
        ],
      };
    },
    (pick) => {
      const pct = pick(['3%', '8%', '12%']);
      return {
        q: `${pct} of push sends fail. Most are APNs 410 “Unregistered” for old tokens; some are 429 throttling. Senders retry everything immediately in a loop, so one partition is stuck on a single bad payload and fresh notifications behind it are 15 minutes late.`,
        answer: 'Retries with backoff and DLQ',
        hint: 'Different failures need different handling, and failures shouldn’t block fresh sends.',
        steps: [
          'Classify errors: 410/invalid token is permanent, so delete the token and don’t retry.',
          '429/5xx are transient, so move them to delayed retry topics with exponential backoff and jitter.',
          'Bad payloads or exhausted retries go to a DLQ with alerting and replay.',
          'The main partition keeps flowing.',
        ],
        followups: [
          { q: 'An OTP has been retrying for 6 minutes. What should happen?', options: ['Drop it once its TTL expires, because a stale OTP is useless and confusing', 'Keep retrying for a day', 'Send it by email instead, hours later', 'Move it to the front of the queue'], why: 'Notifications have a shelf life; expired ones should not be delivered.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['12', '15', '20']);
      return {
        q: `Five product teams each send their own promotions. Some users get ${n} marketing pushes a day, some at 2 a.m. local time, and uninstalls rise. Copy is hardcoded in each team’s service, so fixing a typo in the Hindi version needs a deploy.`,
        answer: 'Templates and user preferences check',
        hint: 'Who decides what the user wants, and where does the text live?',
        steps: [
          'Teams send template ID + variables; the platform renders per channel and locale.',
          'Every job checks preferences: category opt-outs, channel choice and quiet hours in the user’s time zone.',
          'Per-user frequency caps (Redis counters) limit marketing volume across all teams.',
          'Transactional messages bypass caps but honour hard opt-outs.',
        ],
        followups: [
          { q: 'A promo arrives during the user’s quiet hours. What should happen?', options: ['Defer it to the end of quiet hours (or drop it if it has expired)', 'Send it anyway', 'Convert it to SMS', 'Delete the user’s preferences'], why: 'Quiet hours delay non-urgent messages; they don’t cancel them by default.' },
          { q: 'Where should the preference lookup sit so it doesn’t slow every send?', options: ['A cache of user → preferences with short TTLs, invalidated on change', 'A database query per send without caching', 'Inside the mobile app', 'In the template'], why: 'Preferences are read on every send but change rarely.' },
        ],
      };
    },
    (pick) => {
      const hrs = pick(['2 hours', '45 minutes', '4 hours']);
      return {
        q: `An email provider outage lasted ${hrs}. Your senders retried each failed email 3 times within a minute and then logged an error. 1.2 million transactional emails (invoices, password resets) are now simply gone, and nobody can resend them.`,
        answer: 'Retries with backoff and DLQ',
        hint: 'Failures need somewhere to wait, not a log line.',
        steps: [
          'Quick back-to-back retries exhaust themselves during any real outage.',
          'Use backoff retry topics that span minutes to hours with jitter.',
          'After the limit, park messages in a durable DLQ, not a log.',
          'Replay the DLQ once the provider recovers (skipping expired ones such as stale reset links).',
        ],
        followups: [
          { q: 'What else would have reduced the impact of this outage?', options: ['A second email provider behind a circuit breaker', 'Larger log files', 'Sending emails synchronously', 'Turning off retries'], why: 'DLQs recover after the fact; failover avoids the gap.' },
        ],
      };
    },
  ],
});
