SG.add({
  id: 'case-moderation',
  ref: 'S25',
  section: 'HLD case studies',
  title: 'Design a content moderation platform',
  short: 'Moderation platform',
  blurb: 'Screen a billion posts a day: block the worst instantly, score the rest cheaply, and route doubt to the right humans.',
  intro: 'Scope: every post, image and comment on a large social app is checked against policies (nudity, violence, hate, spam, self-harm, illegal content); the platform removes, demotes, age-gates or sends items to human review, handles user reports and appeals, and learns from every decision. The NFRs: ~1B posts a day (about 12K/s, peaks 3×), only tens of milliseconds added to posting, automated action only above a precision guard-rail (for example 95%), different rules per country and policy, and the real objective is to minimise views of harmful content, not just count removals. Day 70 covered the building blocks; this is the platform: tiered sync and async checks, a cheap-then-expensive model cascade, a policy engine over calibrated scores, prioritised review queues, and an appeals-and-labels loop that retrains the models.',
  options: {
    'Tiered sync and async checks': {
      eli5: 'At the airport, everyone walks through the quick metal detector; only bags that look odd go to the slow X-ray and a hand search. Planes don’t wait for every bag to be hand-searched.',
      industry: [
        'Synchronous hash matching (PhotoDNA, PDQ against industry hash lists) and a fast model before a post goes live, for the most severe categories.',
        'Asynchronous scoring through Kafka after publish, with the post visible or held at reduced distribution meanwhile.',
        'Re-scoring triggers when a post crosses view milestones or gets reports, using fresh behavioural signals.',
      ],
      def: 'Split checks by how much latency and harm each can tolerate. In the posting path, run only fast checks (hash matches of known illegal content, spam rules, a small model) with a budget of tens of milliseconds, blocking only near-certain severe violations. Everything else is published, then scored asynchronously by heavier models via a queue, and can be removed or demoted seconds later. Because the goal is to minimise harmful views, re-score content as it gains reach or reports; behavioural signals (report ratios, negative reactions per view) make later decisions more accurate. Cache content embeddings so re-scoring is cheap.',
      scenarios: [
        'Posting latency can’t grow by more than ~100 ms',
        'Known illegal images must never appear, even for a second',
        'A post looked harmless at upload but is going viral with reports',
      ],
      scale: '1B posts/day ≈ 12K/s average and ~35K/s peaks; the sync path must cost microseconds to milliseconds per item, while async scoring can take seconds.',
    },
    'Cheap-to-expensive model cascade': {
      eli5: 'A hospital triage nurse checks everyone in a minute and sends only worrying cases to the specialist. The specialist is expensive, so she mustn’t see people with just a cold.',
      industry: [
        'A CPU gradient-boosted or small MLP model distilled from the large model, scoring every item.',
        'A multimodal transformer on GPUs scoring only the top few percent of items by the cheap model’s score.',
        'Random sampling of items below the cutoff through the large model and reviewers, to measure missed harm.',
      ],
      def: 'Running a large multimodal model on every post would need thousands of GPUs. Put a lightweight model first, trained to predict the large model’s output (teacher–student distillation), and send only items above a tuned cutoff (say the top 1–10%) to the heavy model. The cutoff sets the cost–recall trade-off; items below it are never seen by the heavy model, so sample a slice of them anyway to estimate what is being missed and to gather training data. Serve models behind a model server with batching, versioning and shadow deployment of new versions.',
      scenarios: [
        'Finance rejects GPU capacity for scoring every post with the big model',
        'Most content is obviously benign',
        'You must know how much harm the cheap stage lets through',
      ],
      scale: 'If the heavy model handles ~200 items/s per GPU, 12K items/s needs ~60 GPUs before peaks; sending only 5% to it cuts that to a handful.',
    },
    'Policy engine with calibrated thresholds': {
      eli5: 'The thermometer gives a number, but the rules decide what to do: 100.5°F means rest at home in one school and a doctor’s note in another. The rules change by place without changing the thermometer.',
      industry: [
        'Isotonic regression or Platt scaling mapping raw scores to calibrated probabilities, refitted for each model version.',
        'Rules like “hate speech, IN: remove if p ≥ 0.95, review if 0.7–0.95, demote if 0.5–0.7”, versioned in a config store.',
        'Country-specific legal requirements (for example takedown deadlines under India’s IT Rules, or EU Digital Services Act duties) encoded as separate policies.',
      ],
      def: 'Models output scores per policy; a separate policy engine maps them to actions. First calibrate scores with reviewer labels per score band, so 0.95 really means about 95% precision, and refit whenever the model changes, so a new model doesn’t silently shift actions. Then apply rules keyed by policy, severity, region and surface: remove, demote, age-gate, add a warning, or queue for review. Keeping thresholds as versioned configuration lets policy and legal teams change behaviour by country without retraining or redeploying models, and every decision is logged with the rule and model version for audits and appeals.',
      scenarios: [
        'A new model version doubles removals overnight at the same threshold',
        'Different countries require different handling for the same content',
        'Automated removal is allowed only above a precision guard-rail',
      ],
      scale: 'Rule evaluation is microseconds per item; the cost is in calibration labels (a few thousand reviews per policy per model version).',
    },
    'Prioritised human review queues': {
      eli5: 'At a busy post office, a parcel marked “urgent medicine” jumps ahead of postcards, and a letter in Tamil goes to the clerk who reads Tamil, not to whoever is free.',
      industry: [
        'Queue priority = calibrated harm probability × severity × predicted views, so viral risky content is reviewed first.',
        'Routing by language, policy expertise and region, with SLAs per queue (for example severe content within 1 hour).',
        'Reviewer tooling: blurred or greyscale previews, context (account history, similar items), keyboard shortcuts, wellness limits and quality audits with double review.',
      ],
      def: 'Humans handle items in the uncertain band, appeals and high-impact cases, and their decisions are also the platform’s labels. Reviewers are scarce, so a FIFO queue wastes them on low-reach items while viral harm waits. Prioritise by expected harmful views (probability × severity × reach) and route by skill and language. Give reviewers tools that show context and protect their wellbeing, measure accuracy with gold-standard items and double review, and feed every decision back into labels and calibration.',
      scenarios: [
        'Viral posts wait days in a FIFO review queue',
        'Content in 20 languages lands with reviewers who can’t read it',
        'Review decisions are inconsistent between reviewers',
      ],
      scale: 'If 0.5% of 1B posts need review, that is 5M items/day; at ~1,000 decisions per reviewer per day you need ~5,000 reviewers, so prioritisation matters enormously.',
    },
    'Appeals and labels feedback loop': {
      eli5: 'A teacher marks papers, students can ask for a re-check, and every mistake found in a re-check goes into the teacher’s notes so next year’s marking is better.',
      industry: [
        'Appeals reviewed by a different, often more senior, reviewer, with overturn rates tracked per policy, language and model version.',
        'Reviewer labels, appeal outcomes and normalised user reports used as training signals (multitask heads for “harmful” and “likely reported”).',
        'Monitoring for drift and adversarial spellings (“g0n”, emoji substitutions), with data augmentation and character-level tokenisers in retraining.',
      ],
      def: 'Every automated or human decision should be appealable, and appeal outcomes are among the most valuable labels because they mark the system’s mistakes. Collect reviewer decisions, appeals, reports and sampled audits into a labelled dataset; retrain on a schedule, evaluate offline on PR-AUC and recall at the target precision, then A/B test by labelling where old and new models disagree. Track overturn and error rates per group (language, region, new versus old accounts) to catch bias. Adversaries adapt to removals, so the loop must run continuously.',
      scenarios: [
        'Appeals overturn many removals in one language',
        'Attackers misspell words to dodge the model',
        'Only 50K expert labels exist to train on',
      ],
      scale: 'Appeals are a small fraction of actions but carry high label value; retraining weekly or faster keeps up with adversarial drift.',
    },
  },
  scenarios: [
    (pick) => {
      const posts = pick(['1 billion', '500 million', '2 billion']);
      const ms = pick(['100 ms', '50 ms', '150 ms']);
      return {
        q: `Interviewer: “Design harmful content detection for a social app with ${posts} posts a day.” NFRs: posting may slow by at most ${ms}, known illegal images must never go live, automated removals need ≥95% precision, and the business goal is to minimise views of harmful content. Your heavy multimodal model takes 300 ms per post. Which design decision follows most directly from these NFRs?`,
        answer: 'Tiered sync and async checks',
        hint: 'Which checks fit the posting budget, and which can run a little later without many views slipping through?',
        steps: [
          `A 300 ms model can’t run in a ${ms} posting budget.`,
          'Run hash matching and a fast model synchronously to block known severe content before it goes live.',
          'Publish the rest and score it asynchronously with the heavy model seconds later.',
          'Because the goal is fewer harmful views, a few seconds of delay costs little, and re-scoring as reach grows catches the viral cases.',
        ],
        followups: [
          { q: 'Why is “minimise harmful views” a better objective than “remove as much harmful content as possible”?', options: ['Harm scales with reach, so it focuses effort on content many people will see and tolerates small delays on low-reach posts', 'It removes more content', 'It needs no precision guard-rail', 'It avoids human review'], why: 'A views-aware objective changes when and what you score.' },
          { q: 'What does a 95% precision guard-rail mean for automated removal?', options: ['Act automatically only where at least ~95% of removed items are truly violating; send the rest to review or demote', 'Remove 95% of harmful content', 'Review 95% of posts', 'Accept 95% false positives'], why: 'Precision guards free expression; recall is maximised within it.' },
        ],
      };
    },
    (pick) => {
      const gpus = pick(['3,000', '1,800', '5,000']);
      const pct = pick(['5%', '2%', '10%']);
      return {
        q: `Running the multimodal transformer on every post needs about ${gpus} GPUs at peak, and finance refuses. Analysis shows over 95% of posts are obviously benign (birthday wishes, food photos). The team can afford the big model on roughly ${pct} of traffic.`,
        answer: 'Cheap-to-expensive model cascade',
        hint: 'Let a cheap model decide which posts deserve the expensive one.',
        steps: [
          'Train a lightweight CPU model to imitate the big model’s scores (distillation).',
          `Score everything cheaply and send only the top ${pct} by score to the big model.`,
          'Set the cutoff by budget, and measure the recall cost by sampling items below it through the big model and reviewers.',
          'Cache content embeddings so later re-scoring doesn’t rerun the image and text encoders.',
        ],
        followups: [
          { q: 'Why train the cheap model on the big model’s outputs rather than only on human labels?', options: ['It learns to rank items the way the big model would, so it rarely filters out what the big model would flag, and teacher scores are plentiful', 'Human labels are illegal', 'It makes the cheap model bigger', 'It removes the need for evaluation'], why: 'Distillation aligns the first stage with the second.' },
        ],
      };
    },
    (pick) => {
      const x = pick(['doubled', 'tripled', 'rose 70%']);
      const country = pick(['Germany', 'India', 'Brazil']);
      return {
        q: `After deploying a new hate-speech model, auto-removals ${x} overnight with the same 0.9 threshold, and appeals spike. Separately, legal says ${country} requires a different handling for one policy than other countries. Today thresholds are hard-coded in the model service.`,
        answer: 'Policy engine with calibrated thresholds',
        hint: 'Make scores mean the same thing across versions, and keep the rules outside the model.',
        steps: [
          'Raw scores from a new model have a different distribution, so 0.9 no longer means the same precision.',
          'Calibrate each model version on reviewer labels per score band (isotonic regression) before it takes actions.',
          'Move thresholds into a versioned policy engine keyed by policy, severity and region.',
          `Add a ${country}-specific rule without retraining or redeploying the model; log rule and model version on each decision.`,
        ],
        followups: [
          { q: 'How should a new model be rolled out safely?', options: ['Shadow it first: score live traffic without acting, calibrate, compare disagreements with reviewers, then ramp up', 'Replace the old model instantly', 'Lower all thresholds', 'Turn off review during rollout'], why: 'Shadow mode plus calibration avoids surprise changes in actions.' },
        ],
      };
    },
    (pick) => {
      const backlog = pick(['2 million', '800,000', '4 million']);
      const lang = pick(['Tamil', 'Bengali', 'Marathi', 'Tagalog']);
      return {
        q: `The review queue is FIFO with a backlog of ${backlog} items. A violent video with 3 million views waited 2 days while reviewers cleared posts with 20 views. ${lang} items are assigned to whoever is free, and many reviewers can’t read them, so they guess.`,
        answer: 'Prioritised human review queues',
        hint: 'Spend scarce reviewer minutes where the expected harm is largest, with people who can judge it.',
        steps: [
          'Rank items by calibrated probability × severity × predicted or current views.',
          `Route by language and policy skill, so ${lang} content goes to ${lang} reviewers.`,
          'Set SLAs per queue (severe content within an hour) and alert on breaches.',
          'Audit reviewer accuracy with gold items and double review; their decisions become labels.',
        ],
        followups: [
          { q: 'Why include predicted views in the priority?', options: ['The same violation harms far more people on a viral post, and that matches the views-based objective', 'Views are easy to fake', 'Reviewers prefer popular posts', 'It reduces the number of reviewers needed to zero'], why: 'Reach multiplies harm.' },
        ],
      };
    },
    (pick) => {
      const rate = pick(['35%', '28%', '42%']);
      return {
        q: `Appeals overturn ${rate} of auto-removals in one language, while elsewhere violators now write “g0n” and swap letters for emoji and slip past the model. The model was trained once, a year ago, on 50,000 expert labels, and nothing from reviews or appeals flows back into it.`,
        answer: 'Appeals and labels feedback loop',
        hint: 'The platform produces new labels every day; use them.',
        steps: [
          'Treat appeal outcomes and reviewer decisions as labels, especially the overturned ones.',
          'Add normalised report rates as an extra training task to multiply usable signal.',
          'Retrain regularly with augmentation for adversarial spellings and character-level tokenisation.',
          'Track overturn and error rates per language and account age to catch bias before rollout.',
        ],
        followups: [
          { q: 'Why is PR-AUC or recall at 95% precision preferred over ROC-AUC here?', options: ['With ~1% positives, ROC-AUC looks high even for weak models; precision–recall metrics reflect the operating point you act at', 'ROC-AUC can’t be computed', 'PR-AUC is cheaper to label', 'They are identical'], why: 'Under heavy class imbalance, measure where you take action.' },
        ],
      };
    },
    (pick) => {
      const views = pick(['2 million', '900,000', '5 million']);
      const reports = pick(['6,000', '2,500', '12,000']);
      return {
        q: `A meme passed all checks at upload (scored 0.2). Twelve hours later it has ${views} views and ${reports} reports, but because classification only runs once at creation, nothing happens until a reviewer stumbles on it.`,
        answer: 'Tiered sync and async checks',
        hint: 'A decision made at upload can be revisited when new evidence arrives.',
        steps: [
          'Trigger async re-scoring when a post crosses view milestones or report thresholds.',
          'Include behavioural features normalised by views (reports per 1,000 views, negative reactions ratio).',
          'Reuse cached text and image embeddings, so re-scoring only adds the cheap behavioural part.',
          'Route the updated score through the policy engine to remove, demote or queue it for urgent review.',
        ],
        followups: [
          { q: 'Why normalise reports by views instead of using the raw count?', options: ['Huge posts always collect some reports; 25 reports on 50 views is far more telling than 25 on a million', 'Raw counts are private', 'It makes reports larger', 'Normalisation is never useful'], why: 'Ratios separate signal from popularity.' },
        ],
      };
    },
  ],
});
