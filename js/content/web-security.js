SG.add({
  id: 'web-security',
  ref: 'L8 L9 L10 L11',
  section: 'Security',
  title: 'OWASP, CORS, DDoS and WAF',
  short: 'Web and API security',
  blurb: 'The classic attacks on web APIs, and the specific defence each one needs.',
  intro: 'APIs are doors into your system. The OWASP Top 10 lists the usual break-ins: injection, broken access control, XSS, CSRF and more. Each attack has a specific, well-known defence; interviewers expect you to match them and to layer protections at the edge (WAF, rate limits) and in the code.',
  options: {
    'Injection (SQL/NoSQL)': {
      eli5: 'A form asks “your name?” and someone writes “Ravi; also open the safe”. If the clerk reads it out as an instruction, the safe gets opened.',
      industry: [
        'Classic login bypass: \' OR \'1\'=\'1 in a concatenated SQL query.',
        'NoSQL injection with MongoDB operators like {"$ne": null} in JSON input.',
        'Fixed with PreparedStatement, JPA/Hibernate parameters and ORM query builders.',
      ],
      def: 'Untrusted input is mixed into a query or command and executed as code. Prevent with parameterized queries/prepared statements, ORM parameter binding, strict input validation and least-privilege database accounts.',
      scenarios: [
        'Search boxes, login forms and filters that build queries from input',
        'Admin tools with “raw query” features',
        'Any string concatenation into SQL, shell commands or LDAP',
      ],
      scale: 'One injectable endpoint can expose the whole database; scanning tools find them quickly.',
    },
    'XSS': {
      eli5: 'Someone writes a note on the class noticeboard that secretly says “everyone who reads this, give me your lunch money”, and every reader obeys.',
      industry: [
        'Stored XSS in comments, reviews or profile names that runs in other users’ browsers.',
        'React/Angular auto-escape by default; dangerouslySetInnerHTML bypasses it.',
        'Content-Security-Policy headers restricting which scripts may run.',
      ],
      def: 'Cross-site scripting: attacker-supplied script is served to and executed in other users’ browsers, stealing tokens or acting as them. Prevent by escaping output by context, sanitising rich HTML, a Content-Security-Policy, and HttpOnly cookies so scripts can’t read session IDs.',
      scenarios: [
        'User-generated content displayed to others (comments, chat, bios)',
        'Rendering HTML from user input',
        'Tokens stored where JavaScript can read them',
      ],
      scale: 'One stored XSS can hit every viewer of a popular page.',
    },
    'CSRF and CORS': {
      eli5: 'CSRF: a stranger tricks you into signing a cheque while you’re already logged into the bank. CORS: the bank’s rule about which websites are even allowed to talk to it from your browser.',
      industry: [
        'SameSite=Lax/Strict cookies and CSRF tokens in Spring Security and Django.',
        'Access-Control-Allow-Origin limited to app.yourdomain.com.',
        'Bearer tokens in headers are not sent automatically, so they aren’t CSRF-prone.',
      ],
      def: 'CSRF: a malicious site makes the victim’s browser send a request that automatically carries their cookie. Defend with CSRF tokens, SameSite cookies, and not using GET for state changes. CORS is a browser rule: the server declares which origins may read its responses; it is not a substitute for authentication.',
      scenarios: [
        'Cookie-based sessions on state-changing endpoints',
        'Frontend on one domain calling an API on another',
        'Deciding which origins may call your API from browsers',
      ],
      scale: 'Access-Control-Allow-Origin: * with credentials is a classic misconfiguration.',
    },
    'Edge protection (WAF, DDoS, rate limits)': {
      eli5: 'A security guard and turnstile at the building entrance: suspicious visitors are stopped at the gate, and crowds are let in at a safe pace.',
      industry: [
        'Cloudflare, AWS Shield and AWS WAF in front of public endpoints.',
        'Per-IP, per-user, per-endpoint and global rate limits at the API gateway.',
        'Admin APIs reachable only inside a VPN or private network.',
      ],
      def: 'Stop bad traffic before it reaches your services: CDN/DDoS protection absorbs floods, a web application firewall blocks known attack patterns (injection signatures, bad bots), rate limits cap abuse per client and overall, and private networks hide internal APIs entirely.',
      scenarios: [
        'Public APIs facing bots and floods',
        'Brute-force login or scraping attempts',
        'Internal tools that should never be internet-facing',
      ],
      scale: 'Edge defences complement, not replace, secure code: a WAF won’t fix broken access control.',
    },
  },
  scenarios: [
    (pick) => {
      const what = pick(['a product search box', 'the login form', 'an order-history filter']);
      return {
        q: `In ${what}, the backend builds SQL with string concatenation: "... WHERE name = '" + input + "'". A tester enters ' OR '1'='1 and gets every row in the table.`,
        answer: 'Injection (SQL/NoSQL)',
        hint: 'Input is being executed as part of the query.',
        steps: ['User input became SQL code.', 'Use parameterized queries / prepared statements so input is always data.', 'Also validate input and use a least-privilege DB user.', 'Injection.'],
        followups: [
          { q: 'Does a MongoDB backend make injection impossible?', options: ['No: NoSQL injection works with operator objects like {"$ne": null}; validate types and use safe query builders', 'Yes', 'Only with JSON', 'Only on weekends'], why: 'Any query built from untrusted input can be injected.' },
        ],
      };
    },
    (pick) => {
      const where = pick(['product reviews', 'chat messages', 'user profile names']);
      return {
        q: `An attacker saves a <script> in ${where}. Every user who views the page runs it, and it sends their session token to the attacker’s server.`,
        answer: 'XSS',
        hint: 'Malicious script runs in other users’ browsers.',
        steps: ['Stored user content is rendered as executable HTML.', 'Escape output by context; sanitise any allowed HTML.', 'Add a Content-Security-Policy; keep tokens in HttpOnly cookies.', 'Cross-site scripting.'],
        followups: [
          { q: 'Why do HttpOnly cookies reduce XSS damage?', options: ['JavaScript can’t read them, so injected scripts can’t steal the session ID', 'They encrypt the page', 'They block all scripts', 'They make XSS impossible'], why: 'Defence in depth: limit what a successful XSS can take.' },
        ],
      };
    },
    () => ({
      q: 'A user is logged into their bank (session cookie). They open a malicious page that silently submits a hidden form to bank.com/transfer. The browser attaches the cookie automatically and the transfer succeeds.',
      answer: 'CSRF and CORS',
      hint: 'The request is forged by another site, riding on the user’s cookie.',
      steps: ['Cookies are sent automatically with cross-site requests.', 'Require a CSRF token the attacker can’t know; set SameSite cookies.', 'Never change state with GET.', 'Cross-site request forgery.'],
      followups: [
        { q: 'Does a strict CORS policy alone prevent this attack?', options: ['No: a simple form POST doesn’t need CORS permission; CSRF tokens/SameSite are the defence', 'Yes, always', 'Only on HTTPS', 'Only for JSON APIs'], why: 'CORS controls who can read responses, not whether a browser sends simple requests.' },
      ],
    }),
    (pick) => {
      const n = pick(['10K', '50K']);
      return {
        q: `A botnet of ${n} IPs, each staying under the per-IP rate limit, floods the public API with login attempts and suspicious query strings. Services are slowing down.`,
        answer: 'Edge protection (WAF, DDoS, rate limits)',
        hint: 'Stop it before it reaches your services.',
        steps: ['Per-IP limits alone are bypassed by many IPs.', 'Add a global limit, per-account login limits, and a WAF/bot protection at the edge.', 'Use a DDoS-protecting CDN in front.', 'Edge protection.'],
        followups: [
          { q: 'The internal admin API is publicly reachable but “nobody knows the URL”. Fix?', options: ['Put it on a private network/VPN and require authentication; obscurity isn’t security', 'Use a longer URL', 'Rename it weekly', 'Disable logging'], why: 'Internal tools shouldn’t be internet-facing at all.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['5,000', '20,000']);
      return {
        q: `Attackers try ${n} passwords per hour against individual user accounts on the login endpoint, rotating IP addresses.`,
        answer: 'Edge protection (WAF, DDoS, rate limits)',
        hint: 'Limit attempts, at the edge and per account.',
        steps: ['Brute force against accounts.', 'Rate-limit per account and per IP, add progressive delays/CAPTCHA after failures.', 'WAF/bot detection at the edge; alert on spikes.', 'Edge protection (plus MFA for users).'],
        followups: [
          { q: 'GET /api/invoices/1043 works for its owner; changing it to 1044 shows another customer’s invoice. What fixes this?', options: ['Server-side ownership checks on every request (broken access control / IDOR)', 'A WAF rule', 'A stricter rate limit', 'Longer invoice IDs only'], why: 'OWASP’s #1 risk; only code-level authorization fixes it, not edge tools.' },
        ],
      };
    },
  ],
});
