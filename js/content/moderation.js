SG.add({
  id: 'moderation',
  ref: 'R7 R15',
  section: 'Building blocks',
  title: 'Content moderation, spam and fraud',
  short: 'Trust and safety',
  blurb: 'Layered defences against harmful content, spam and fraud: hashes, models, humans, users and limits.',
  intro: 'No single technique catches everything, so trust and safety systems are layered. Cheap exact checks (hash matching) block known bad content instantly. ML classifiers score new content, and only act automatically above a calibrated precision bar. Uncertain or high-stakes cases go to human reviewers, prioritised by how many people would see them. Users add signal through reports and get a path to appeal mistakes. Spam and fraud are often stopped earlier, at the account and request level, with rate limits, velocity checks and bot detection. The goal is usually framed as minimising views of harmful content subject to a precision guardrail, not “remove as much as possible”.',
  options: {
    'Hash matching of known content': {
      eli5: 'Shops share photos of known shoplifters at the entrance. The guard doesn’t need to judge anyone new; he just checks faces against the wall.',
      industry: [
        'Microsoft PhotoDNA and NCMEC hash lists for child sexual abuse material.',
        'GIFCT shared hash database for terrorist content across platforms.',
        'YouTube Content ID fingerprints for copyrighted audio/video.',
      ],
      def: 'Compute a fingerprint of each upload and look it up in a database of known violating content. Cryptographic hashes catch exact copies; perceptual hashes (PDQ, PhotoDNA, video fingerprints) survive resizing, cropping and re-encoding. Very high precision and cheap enough to run on every upload, but it only finds content someone has already identified.',
      scenarios: [
        'Re-uploads of content already removed or reported by industry partners',
        'Legal obligations to block specific known material immediately',
        'A cheap first filter before expensive models',
      ],
      scale: 'A hash lookup is microseconds, so it runs synchronously on every upload. Zero recall on genuinely new content.',
    },
    'ML classifier with calibrated thresholds': {
      eli5: 'A trained sniffer dog at the airport. It can smell things it has never seen before, but it’s not perfect, so it only stops you on its own when it’s really sure.',
      industry: [
        'Meta’s multimodal (text + image) integrity classifiers on billions of posts a day.',
        'Gmail spam classifiers; Perspective API toxicity scores.',
        'Two-stage cascades: a cheap model (e.g. gradient-boosted trees) screens everything, a heavy transformer scores the risky few percent.',
      ],
      def: 'A model scores each item using content (text, images), behaviour (normalised negative reactions, reports per view) and author signals (account age, history). Scores are calibrated (e.g. isotonic regression against human labels) into probabilities, and actions are tied to thresholds: auto-remove above the precision bar (say 95%), demote or send to review below it. Evaluate with PR-AUC and recall at the target precision, not ROC-AUC, because positives are rare.',
      scenarios: [
        'New, never-seen harmful content at large volume',
        'Automated action is allowed only above a set precision',
        'Re-scoring as a post gains views and reports',
      ],
      scale: 'At 1B posts/day, running a large model on everything is costly; a light model forwarding ~1–10% to the heavy one cuts cost massively. Sample below the cut-line to measure missed recall.',
    },
    'Human review queue': {
      eli5: 'The sniffer dog barks but isn’t sure. A customs officer opens the bag and decides. Officers are few, so the most suspicious bags go first.',
      industry: [
        'Meta, YouTube and TikTok employ large moderation teams working prioritised queues.',
        'Marketplaces (OLX, Amazon) reviewing flagged listings and sellers.',
        'Reviewer decisions labelled at each score band to calibrate and retrain models.',
      ],
      def: 'Items the model is unsure about, or that are high-impact (likely to go viral, sensitive categories), go into queues ordered by expected harm, such as score × predicted views. Reviewers apply policy consistently, and their decisions become training and evaluation labels. Expensive and slow, so it’s reserved for where machines are not confident enough.',
      scenarios: [
        'Scores fall in the uncertain band below the auto-action threshold',
        'Mistakes are very costly (news, politics, legal content)',
        'You need ground-truth labels to calibrate and evaluate models',
      ],
      scale: 'Reviewers handle hundreds of items per day each; with 1% of a billion posts flagged, queues must be prioritised by reach, not first-in-first-out.',
    },
    'User reports and appeals': {
      eli5: 'Neighbours can ring the society secretary about a problem, and anyone who gets fined can ask the committee to look again.',
      industry: [
        'Report buttons on every post; reports normalised by views become model features and training labels.',
        'Appeals required by regulations such as the EU Digital Services Act and India’s IT Rules grievance process.',
        'Meta’s Oversight Board as a final appeals layer for hard cases.',
      ],
      def: 'Reports give a huge, cheap stream of weak labels and surface harms models miss; they feed review queues and multitask training (predicting “will this be reported?”). Appeals let people contest removals, routing them to a different reviewer; overturn rates measure false positives and catch over-enforcement on particular groups, such as new users.',
      scenarios: [
        'Discovering new abuse patterns the model has never seen',
        'Wrongly removed creators need a way to contest decisions',
        'Regulation requires notice and a grievance or appeal process',
      ],
      scale: 'Reports are noisy and can be brigaded; weight reporters by past accuracy and normalise by views. Appeal volume is a few percent of actions but needs its own SLA.',
    },
    'Rate limits and bot detection': {
      eli5: 'A sweet shop that lets each child buy only five laddoos a minute and watches for the same kid coming back in different hats.',
      industry: [
        'Signup and posting limits per account, device and IP; CAPTCHA or Turnstile challenges on suspicious traffic.',
        'Payment velocity checks against card testing (many tiny charges on stolen cards).',
        'Device fingerprinting and account-age rules at Stripe Radar, WhatsApp and dating apps.',
      ],
      def: 'Stop abuse at the request and account level before content even exists: per-entity rate limits (token bucket), velocity rules (N actions per window per card, device, IP), reputation scores, device fingerprints and challenges for suspected bots. Cheap, real-time and effective against scale attacks; combined with ML risk scores for subtler fraud.',
      scenarios: [
        'Bursts of fake signups or identical spam links from automated accounts',
        'Card testing: many small transactions from new accounts',
        'Credential stuffing or scraping traffic',
      ],
      scale: 'Checks must run in single-digit milliseconds (Redis counters). Attackers rotate IPs, so key limits on devices, cards and accounts too.',
    },
  },
  scenarios: [
    (pick) => {
      const kind = pick(['a terrorist propaganda video', 'a known abuse image', 'a banned violent clip']);
      return {
        q: `${kind[0].toUpperCase() + kind.slice(1)} was removed yesterday, but copies keep reappearing, slightly cropped and re-encoded, at 2,000 uploads an hour. Partner platforms already share fingerprints of it.`,
        answer: 'Hash matching of known content',
        hint: 'You already know exactly what you are looking for.',
        steps: ['The content is known, not new.', 'Perceptual hashes match near-duplicates despite crops and re-encoding.', 'A lookup on every upload blocks it before anyone sees it.', 'Hash matching.'],
        followups: [
          { q: 'Why perceptual hashes rather than SHA-256 here?', options: ['Any re-encode changes a cryptographic hash; perceptual hashes stay close for visually similar media', 'SHA-256 is too slow', 'Perceptual hashes are reversible', 'SHA-256 can’t hash videos'], why: 'Re-uploads are rarely byte-identical.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['500 million', '1 billion', '2 billion']);
      const p = pick([90, 95, 98]);
      return {
        q: `A social network gets ${n} new posts a day; about 1% are harmful, most of it never seen before. Policy says automated removal is allowed only when the system is at least ${p}% precise, and the business goal is to minimise views of harmful content.`,
        answer: 'ML classifier with calibrated thresholds',
        hint: 'New content, huge volume, and a precision bar for automatic action.',
        steps: ['Hashes can’t catch new content and humans can’t review a billion posts.', 'Score each post with a model using content, behaviour and author features.', `Calibrate scores and auto-act only above ${p}% precision; demote or review below.`, 'A calibrated ML classifier.'],
        followups: [
          { q: 'Which offline metric fits a 1%-positive problem with a precision guardrail?', options: [`Recall at ${p}% precision (and PR-AUC)`, 'ROC-AUC alone', 'Accuracy', 'Mean squared error'], why: 'ROC-AUC saturates with rare positives; recall at the operating precision matches the business rule.' },
          { q: 'Running the big multimodal model on every post is too expensive. What’s the standard fix?', options: ['A cheap first-stage model forwards only the riskiest few percent to the heavy model', 'Run it on every 100th post only', 'Remove image features', 'Use a bigger GPU'], why: 'Cascades cut cost; sample below the cut-line to check for missed harm.' },
        ],
      };
    },
    (pick) => {
      const band = pick(['0.6–0.95', '0.5–0.9', '0.7–0.95']);
      return {
        q: `Your classifier auto-removes above 0.95. Posts scoring ${band} are left up, including some that later go viral and turn out to be harmful. You have 300 reviewers and cannot look at everything in that band.`,
        answer: 'Human review queue',
        hint: 'Uncertain cases plus limited people: decide what to look at first.',
        steps: ['The model is not confident enough to act alone in this band.', 'Send these to human reviewers.', 'Order the queue by expected harm, such as score × predicted views, not arrival time.', 'A prioritised human review queue.'],
        followups: [
          { q: 'Besides making decisions, what else do reviewer labels give you?', options: ['Ground truth to calibrate scores and evaluate or retrain models', 'Nothing useful', 'Faster uploads', 'Lower storage'], why: 'Labels at each score band drive calibration and measurement.' },
        ],
      };
    },
    (pick) => {
      const reg = pick(['the EU Digital Services Act', 'India’s IT Rules grievance requirements', 'a new national online safety law']);
      return {
        q: `Creators complain that their posts were removed by mistake, with no way to contest it, and new accounts seem to be removed far more often than old ones. Meanwhile ${reg} requires users to be able to flag content and challenge decisions.`,
        answer: 'User reports and appeals',
        hint: 'Give users a voice in both directions.',
        steps: ['Users need to flag harmful content and contest removals.', 'Appeals go to a different reviewer and overturn rates measure false positives.', 'Slicing error rates by group (e.g. new users) reveals biased enforcement.', 'User reports and appeals.'],
        followups: [
          { q: 'A coordinated group mass-reports a journalist’s posts. How do you keep reports useful?', options: ['Weight reporters by past accuracy and normalise reports by views before acting', 'Remove anything with 100 reports', 'Ignore all reports', 'Ban the reporters automatically'], why: 'Raw report counts are easy to game.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['8,000', '15,000', '40,000']);
      return {
        q: `Overnight, ${n} new accounts an hour sign up from a few IP ranges and device fingerprints, each posting the same crypto-scam link within seconds of creation. The classifier catches some posts, but new accounts keep coming.`,
        answer: 'Rate limits and bot detection',
        hint: 'Stop the factory, not just the products.',
        steps: ['The attack is automated account creation at scale.', 'Limit signups and posts per IP, device and new account; challenge suspicious sessions.', 'Use account age and velocity as risk signals.', 'Rate limits and bot detection.'],
        followups: [
          { q: 'Attackers rotate through thousands of IPs. What else should limits key on?', options: ['Device fingerprints, accounts, phone numbers and payment instruments', 'Nothing else', 'The time of day only', 'The post’s font'], why: 'IP-only limits are easy to evade with proxies.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['600', '2,000', '5,000']);
      return {
        q: `A payment gateway sees ${n} ₹1 authorisations in ten minutes from 40 brand-new merchant accounts, each with a different card number. Most are declined; a few succeed. This is classic card testing before bigger fraud.`,
        answer: 'Rate limits and bot detection',
        hint: 'Volume and speed are the tell.',
        steps: ['Many tiny attempts, new accounts, many cards: a velocity pattern.', 'Apply velocity limits per account, device, IP and card BIN.', 'Block or challenge before the request reaches the bank.', 'Rate limits and bot detection, backed by a risk score.'],
        followups: [
          { q: 'Where should this check sit in the payment flow?', options: ['Synchronously before authorisation, as a fast risk check', 'In the nightly reconciliation job', 'After the bank settles', 'Only in the monthly report'], why: 'Fraud must be blocked before money moves.' },
        ],
      };
    },
  ],
});
