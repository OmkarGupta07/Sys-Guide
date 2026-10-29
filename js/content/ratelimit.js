SG.add({
  id: 'ratelimit',
  ref: 'K5',
  section: 'Microservices and edge',
  title: 'Token bucket, leaky bucket, fixed or sliding window',
  short: 'Rate limiting',
  blurb: 'Four ways to say “slow down”, and which abuse or burst each one handles.',
  intro: 'A rate limiter protects your service and your wallet. The algorithm decides whether bursts are allowed, whether output is smoothed, and how precise the limit is at window edges.',
  options: {
    'Token bucket': {
      eli5: 'A jar fills with one candy every second, up to 10. Each request eats a candy. Saved candies let you grab several at once, but never more than the jar holds.',
      industry: [
        'Stripe and AWS API Gateway use token buckets: a steady rate plus a burst allowance.',
        'Mobile app backends allow the burst of calls fired when the app opens.',
        'Network traffic shaping in routers and Linux tc.',
      ],
      def: 'Tokens refill at a fixed rate up to a capacity. A request consumes a token, or is rejected if none remain. Enforces an average rate while allowing bursts up to the bucket size.',
      scenarios: [
        'Public APIs where short bursts are normal and fine',
        'App start fires 15 calls at once, then goes quiet',
        'You want both an average limit and a burst limit',
      ],
      scale: 'Two numbers per key (tokens, last refill time), so memory is tiny. Store in Redis with an atomic Lua script to share across servers.',
    },
    'Leaky bucket': {
      eli5: 'A bucket with a small hole. Pour in as fast as you like, but water drips out at one steady speed. If the bucket overflows, the extra spills away.',
      industry: [
        'Nginx limit_req is a leaky bucket: it queues and smooths requests to a fixed rate.',
        'Shopify’s REST Admin API documented its limit as a leaky bucket.',
        'Senders to SMS or email providers that allow only N messages per second.',
      ],
      def: 'Requests enter a fixed-size queue that is drained at a constant rate. Output is perfectly smooth; when the queue is full, new requests are dropped.',
      scenarios: [
        'A downstream system accepts only a steady rate (SMS gateway, bank API)',
        'You must smooth spiky traffic, not just cap it',
        'Protecting a fragile legacy service',
      ],
      scale: 'Queue size times keys sets memory. Adds latency because requests wait in line. Not for user-facing APIs where bursts should be instant.',
    },
    'Fixed window': {
      eli5: 'A ticket counter that hands out 100 tickets per hour and resets at exactly 2:00, 3:00, 4:00.',
      industry: [
        'Daily or monthly quotas on free API tiers (“1,000 requests per day”).',
        'Simple per-minute limits with Redis INCR + EXPIRE.',
        'Internal tools where a little imprecision doesn’t matter.',
      ],
      def: 'Count requests per key in fixed time slots (e.g. per minute). Reject once the count passes the limit; the counter resets at the slot boundary.',
      scenarios: [
        'Quotas per day or month',
        'Simplest possible limiter with one counter per key',
        'Bursts at window edges are acceptable',
      ],
      scale: 'One counter per key per window: the cheapest option. Weakness: up to 2x the limit can pass around a boundary (end of one window + start of the next).',
    },
    'Sliding window': {
      eli5: 'A guard who checks “how many times did you enter in the last 60 minutes?” at every moment, not since the clock struck the hour.',
      industry: [
        'Cloudflare’s rate limiting uses a sliding window counter.',
        'Login and OTP protection: “max 5 attempts in any 15 minutes”.',
        'Anti-abuse rules where attackers time requests at window edges.',
      ],
      def: 'Limits requests in any rolling window. A sliding log stores each timestamp (exact, memory-heavy); a sliding counter blends the current and previous window counts (approximate, cheap).',
      scenarios: [
        'Security limits: login attempts, OTP sends, password reset',
        'You must close the fixed-window boundary loophole',
        'Fairness matters more than simplicity',
      ],
      scale: 'Sliding log costs memory per request (Redis sorted set per key). Sliding counter costs about the same as fixed window, with a small approximation error.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick([10, 15, 20]);
      return {
        q: `When your mobile app opens it fires ${n} API calls at once, then about 1 call every few seconds. You want to cap each user at 2 requests/s on average without breaking app start.`,
        answer: 'Token bucket',
        hint: 'Should a short burst be allowed if the average is fine?',
        steps: [
          `A burst of ${n} at startup is legitimate.`,
          'The limit is about the average rate.',
          `A bucket with capacity ~${n} and refill 2/s allows the burst and enforces the average.`,
          'Choose token bucket.',
        ],
        followups: [
          { q: 'You run 20 API servers. Where does the bucket live?', options: ['In Redis, updated with an atomic Lua script so all servers share one count per user', 'In each server’s memory', 'In MySQL with a row lock per request', 'In the mobile app'], why: 'Per-server buckets let users multiply their limit by the server count. A shared atomic store fixes it.' },
          { q: 'A request is rejected. What should the API return?', options: ['HTTP 429 Too Many Requests with a Retry-After header', 'HTTP 500', 'HTTP 200 with an empty body', 'Close the connection silently'], why: '429 + Retry-After tells good clients exactly when to retry and makes the limit debuggable.' },
        ],
      };
    },
    (pick) => {
      const r = pick([50, 100, 200]);
      const what = pick(['SMS gateway', 'bank payout API', 'email provider']);
      return {
        q: `Your notification service gets spikes of 10K messages in a few seconds, but the ${what} you call rejects anything above ${r} requests/s.`,
        answer: 'Leaky bucket',
        hint: 'Do you need to reject the spike, or reshape it?',
        steps: [
          `The downstream needs a steady ${r}/s.`,
          'You don’t want to drop the spike, you want to spread it out.',
          'A queue drained at a constant rate does exactly that.',
          'Choose leaky bucket.',
        ],
        followups: [
          { q: 'The spike is 10x bigger than the bucket. What happens to the overflow?', options: ['It’s dropped or rejected, so put a durable queue (SQS/Kafka) in front to hold it', 'The bucket grows forever', 'It drains faster automatically', 'The downstream accepts the extra'], why: 'A leaky bucket has a fixed size. For “never lose a message”, buffer in a durable queue and drain at the safe rate.' },
        ],
      };
    },
    (pick) => {
      const q = pick(['1,000 requests per day', '10,000 requests per month', '500 requests per day']);
      return {
        q: `Free-tier API keys get ${q}. You’re a team of 3 and want the simplest thing. A user squeezing a few extra calls around midnight is acceptable.`,
        answer: 'Fixed window',
        hint: 'How precise does it need to be? What’s the simplest data structure?',
        steps: [
          'It’s a quota, not abuse protection.',
          'Edge bursts are explicitly acceptable.',
          'One counter per key per period: Redis INCR + EXPIRE.',
          'Choose fixed window.',
        ],
        followups: [
          { q: 'What exactly is the fixed-window weakness?', options: ['Up to 2x the limit can pass across a boundary: the end of one window plus the start of the next', 'It forgets counts randomly', 'It can’t use Redis', 'It blocks all requests at the boundary'], why: 'Knowing the flaw and why it’s acceptable here is what interviewers look for.' },
        ],
      };
    },
    (pick) => {
      const n = pick([3, 5]);
      const m = pick([10, 15, 30]);
      return {
        q: `Login must allow at most ${n} failed attempts in any ${m} minutes. Attackers have been timing bursts right at minute boundaries to double their attempts.`,
        answer: 'Sliding window',
        hint: '“In any N minutes” and “timing at boundaries” are the clues.',
        steps: [
          'This is security, so the limit must be exact.',
          'Attackers exploit fixed-window boundaries.',
          `A rolling ${m}-minute window has no boundary to exploit.`,
          'Choose sliding window (a log is fine at this tiny count).',
        ],
        followups: [
          { q: 'Do you limit per IP address or per username?', options: ['Both: per username stops guessing one account, per IP stops one source spraying many accounts', 'Only per IP', 'Only per username', 'Neither, use a CAPTCHA only'], why: 'Attackers rotate IPs or rotate usernames. Layer the keys.' },
        ],
      };
    },
    (pick) => {
      const n = pick([3, 5]);
      return {
        q: `Each phone number can request at most ${n} OTP SMS in any rolling hour. Each SMS costs you money, and abusers script requests to drain your balance.`,
        answer: 'Sliding window',
        hint: 'Money is at stake. Which algorithm has no loophole?',
        steps: [
          'Every extra SMS costs money, so precision matters.',
          '“Any rolling hour” is the definition of a sliding window.',
          `The count is tiny (${n}), so storing timestamps is cheap.`,
          'Choose sliding window.',
        ],
        followups: [
          { q: 'Where should this check run?', options: ['Server side (gateway or OTP service) with a shared store, never only in the app', 'Only in the mobile app UI', 'In the SMS provider', 'In the browser’s local storage'], why: 'Client-side limits are trivially bypassed. Trust boundaries live on the server.' },
        ],
      };
    },
  ],
});
