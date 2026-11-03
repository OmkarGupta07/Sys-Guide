SG.add({
  id: 'api-design',
  ref: 'H5 H6 H7 H8 H11 H12 H13',
  section: 'APIs and communication',
  title: 'API design: versioning, pagination, idempotency',
  short: 'API design details',
  blurb: 'The follow-ups that come after your endpoints: pages, retries, versions, security and slow work.',
  intro: 'After you list endpoints, interviewers usually probe pagination and security, then retries and evolution. Each has a standard answer and a standard trap.',
  options: {
    'Cursor pagination': {
      eli5: 'A bookmark. Instead of “page 7”, you say “continue right after the page I was on”, so new pages inserted earlier don’t confuse you.',
      industry: [
        'Twitter/Instagram feeds and Slack message history use cursors.',
        'Stripe’s list APIs use starting_after / ending_before.',
        'Offset pagination (?page=3&limit=25) still fine for small, stable admin lists.',
      ],
      def: 'Return a cursor (usually the last item’s sort key, encoded) with each page; the next request asks for items after it (WHERE id < cursor ORDER BY id DESC LIMIT 25). Stable under inserts and fast on large tables. Offset/page pagination is simpler but skips or repeats items when data changes, and gets slow at deep offsets.',
      scenarios: [
        'Feeds and timelines with constant new writes',
        'Very large tables where OFFSET 1,000,000 is slow',
        'Infinite scroll',
      ],
      scale: 'Needs a stable, indexed sort key. Can’t jump to “page 50” directly; offset can.',
    },
    'Idempotency key': {
      eli5: 'Each payment form gets a unique token. If you press submit twice, the cashier sees the same token and only charges you once.',
      industry: [
        'Stripe and Razorpay accept an Idempotency-Key header on payment APIs.',
        'Order creation in e-commerce under flaky mobile networks.',
        'Message consumers that must tolerate redelivery.',
      ],
      def: 'The client generates a unique key per logical operation and sends it with a non-idempotent request (POST). The server stores the key with the result; repeats with the same key return the original result instead of acting again.',
      scenarios: [
        'Payments and order creation that clients may retry',
        'Network timeouts where the client doesn’t know if it worked',
        'At-least-once message processing',
      ],
      scale: 'Store keys with a TTL (e.g. 24h) in a fast store; use a unique constraint to win races between concurrent duplicates.',
    },
    'API versioning': {
      eli5: 'A phone charger port. When the new port arrives, old phones still work with old chargers for a while, so nobody wakes up to a dead phone.',
      industry: [
        'URL versions (/v1/orders) at Twitter, Uber and many public APIs.',
        'Header or date-based versions (Stripe-Version: 2024-06-20).',
        'Mobile apps that can’t force every user to update immediately.',
      ],
      def: 'Evolve an API without breaking existing clients: add fields (backward compatible) freely; for breaking changes (removing/renaming fields, changing meaning) publish a new version via URL, header or media type, run both, and deprecate the old one with a timeline.',
      scenarios: [
        'Breaking changes with clients you don’t control (mobile apps, partners)',
        'Gradual migrations between response formats',
        'Public developer APIs',
      ],
      scale: 'Each live version is code to maintain; prefer additive changes and sunset old versions deliberately.',
    },
    'Async API (202 + status)': {
      eli5: 'At a photo studio you drop off the film and get a token. You come back later, show the token, and collect the prints when they’re ready.',
      industry: [
        'Video uploads: “processing…” until transcoding finishes.',
        'Report and data export endpoints.',
        'Bulk imports and ML inference jobs.',
      ],
      def: 'For slow work, accept the request, enqueue a job, and return 202 Accepted with a job ID/status URL. The client polls GET /jobs/{id} (or receives a webhook/push) until it’s done. Keeps request threads free and avoids timeouts.',
      scenarios: [
        'Work takes longer than a normal request timeout (seconds to minutes)',
        'Bulk or batch operations',
        'Expensive processing that should be queued and scaled separately',
      ],
      scale: 'Combine with a queue and workers; add webhooks or push to avoid heavy polling.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick(['5,000', '20,000', '50,000']);
      return {
        q: `An Instagram-like feed API uses ?page=N&size=20. Users report seeing the same posts twice and missing others while scrolling, because ${n} new posts arrive every minute.`,
        answer: 'Cursor pagination',
        hint: 'Pages shift when new items are inserted at the top.',
        steps: ['Offsets shift as new posts are inserted.', 'Items repeat or are skipped.', 'Ask for “items after the last one I saw”.', 'Cursor pagination.'],
        followups: [
          { q: 'What should the cursor usually encode?', options: ['The last item’s sort key (e.g. created_at + id), often base64-encoded', 'The page number', 'The total row count', 'The user’s password'], why: 'Stable, indexed sort keys make cursor queries fast and correct.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['“Place order”', '“Pay now”', '“Send money”']);
      return {
        q: `On a weak 3G network, ${what} times out after the server actually succeeded. The app retries, and the customer is charged twice.`,
        answer: 'Idempotency key',
        hint: 'The retry must be recognised as the same operation.',
        steps: ['POST isn’t idempotent: a retry acts again.', 'The client doesn’t know whether the first attempt worked.', 'Send a unique key; the server returns the stored result for repeats.', 'Idempotency key.'],
        followups: [
          { q: 'Two identical requests with the same key arrive at the same millisecond on different servers. How do you stop both from processing?', options: ['A unique constraint (or atomic SETNX) on the key so only one insert wins', 'Check-then-insert in application code', 'Sleep randomly', 'Hope it doesn’t happen'], why: 'Check-then-act races; let the store enforce uniqueness atomically.' },
        ],
      };
    },
    (pick) => {
      const f = pick(['rename “price” to “amount” and change it to paise', 'split “name” into first and last name', 'remove the “discount” field']);
      return {
        q: `You must ${f} in the orders API. Millions of users run old app versions that won’t update for months.`,
        answer: 'API versioning',
        hint: 'This is a breaking change for clients you can’t update.',
        steps: ['It’s a breaking change.', 'Old clients must keep working.', 'Ship /v2 (or a version header), keep /v1, announce deprecation.', 'API versioning.'],
        followups: [
          { q: 'Which change usually does NOT need a new version?', options: ['Adding a new optional field to a response', 'Removing a field', 'Renaming a field', 'Changing a field’s unit'], why: 'Additive changes are backward compatible if clients ignore unknown fields.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['export 2 million transactions to CSV', 'transcode an uploaded video', 'generate a yearly tax report']);
      return {
        q: `An endpoint must ${what}. It takes 2 to 10 minutes; the load balancer times out requests at 60 seconds and app threads are blocked meanwhile.`,
        answer: 'Async API (202 + status)',
        hint: 'Don’t hold the request open for minutes.',
        steps: ['Work outlives the request timeout.', 'Enqueue a job; return 202 with a job ID.', 'Client polls status or gets notified.', 'Async API.'],
        followups: [
          { q: 'Better than clients polling every second?', options: ['Notify on completion via webhook, push notification or SSE', 'Poll every 100 ms', 'Keep the HTTP request open longer', 'Email the CSV as an attachment always'], why: 'Push completion events to avoid wasteful polling.' },
        ],
      };
    },
    () => ({
      q: 'A billing worker consumes “charge customer” messages from SQS, which delivers at least once. Occasionally the same message arrives twice and customers get charged twice.',
      answer: 'Idempotency key',
      hint: 'Duplicates are guaranteed to happen sometimes. How do you make them harmless?',
      steps: ['At-least-once delivery means duplicates.', 'Each message carries a unique operation ID.', 'Record processed IDs; skip repeats.', 'Idempotency key.'],
      followups: [
        { q: 'POST /tweets has body { text, userId }. What’s the security problem?', options: ['Anyone could post as anyone; the author must come from the verified JWT/session token, not the body', 'Nothing', 'Text should be in the URL', 'It should be GET'], why: 'Never trust identity sent in the body; derive it from authentication.' },
        { q: 'A logged-in user requests another user’s private draft. Which status?', options: ['403 Forbidden (or 404 to avoid revealing it exists)', '401 Unauthorized', '200 with empty body', '500'], why: '401 = not authenticated; 403 = authenticated but not allowed.' },
      ],
    }),
  ],
});
