SG.add({
  id: 'auth',
  ref: 'L1 L2 L3 L4',
  section: 'Security',
  title: 'Sessions, JWT, OAuth2 and access control',
  short: 'Auth',
  blurb: 'Who are you (authentication), what may you do (authorization), and how the proof travels with each request.',
  intro: 'Authentication proves identity; authorization decides permissions. The proof travels as a session ID (server looks it up: easy to revoke, needs a shared store) or a signed token (server only verifies a signature: stateless, hard to revoke, so pair it with a short expiry and a refresh token). OAuth2 lets one app act on your behalf in another without your password; OpenID Connect adds “who logged in” on top. Access rules are usually roles (RBAC) or attributes (ABAC).',
  options: {
    'Session cookie': {
      eli5: 'A cloakroom token. The token itself means nothing; the counter looks it up to find your coat.',
      industry: [
        'Classic Spring/Django/Rails web apps with HttpOnly session cookies.',
        'Sessions stored in Redis so any app server can look them up.',
        'Banks and admin panels that need instant logout everywhere.',
      ],
      def: 'After login the server creates a session record (user, roles, expiry) and gives the browser an opaque random ID in an HttpOnly, Secure cookie. Each request, the server looks the session up. Easy to revoke (delete the record); needs a shared session store when you have many servers.',
      scenarios: [
        'Browser-based web apps on your own domain',
        'You need instant revocation (logout, ban, password change)',
        'Sensitive apps where data should stay on the server, not in the client',
        'You already run Redis or a central database anyway',
      ],
      scale: 'A Redis lookup per request adds ~1 ms and a network hop; the store must be highly available or every server fails together. Protect against CSRF (SameSite cookies, tokens).',
    },
    'JWT access token': {
      eli5: 'A signed visitor badge with your name, role and expiry printed on it. Any guard can check the signature without calling the front desk, but a badge can’t be “un-printed” until it expires.',
      industry: [
        'Mobile and SPA backends, API gateways validating tokens at the edge.',
        'Microservices trusting a token issued by one auth service.',
        'Short-lived access tokens (5–15 min) plus refresh tokens.',
      ],
      def: 'A JSON Web Token carries claims (user ID, roles, expiry) plus a signature. Any service with the key can verify it locally, with no lookup: stateless and fast. HMAC (shared secret) is fine when every verifier is trusted; RSA/ECDSA (private key signs, public key verifies) suits microservices and third parties, since verifiers never hold a signing key. Hard to revoke before expiry, so keep it short-lived.',
      scenarios: [
        'Many services/gateways must verify identity without a central lookup',
        'Mobile apps and third-party API clients',
        'Stateless horizontal scaling',
        'Services owned by other teams or vendors verifying with only a public key',
      ],
      scale: 'Don’t put secrets in the payload (it’s only encoded, not encrypted). Long-lived JWTs are a security risk.',
    },
    'Refresh token + short access token': {
      eli5: 'A day pass that expires in 15 minutes, plus a membership card kept in the office safe. When the pass expires, you show the card at one desk to get a new pass, and the desk can cancel the card.',
      industry: [
        'Mobile banking and e-commerce apps that keep you logged in for weeks.',
        'SPAs calling APIs with a 5–15 minute access token.',
        'Auth servers (Keycloak, Auth0, Cognito) issuing rotating refresh tokens.',
      ],
      def: 'The access token (a JWT) lives about 15 minutes and goes on every request. The refresh token lives days or weeks, is sent only to the token endpoint, and is stored server-side so it can be revoked. When the access token expires the client silently swaps the refresh token for a new one. A stolen access token is useful for minutes; a stolen refresh token can be cut off.',
      scenarios: [
        'Stateless JWTs but users must stay logged in for 30 days',
        'You want revocation without a lookup on every request',
        'Limiting damage from a leaked access token',
      ],
      scale: 'The refresh endpoint is the only stateful, hot-path-free check, so it sees a tiny fraction of traffic. Rotate refresh tokens on use and detect reuse.',
    },
    'OAuth2 / OpenID Connect': {
      eli5: 'Giving a valet a special car key that only drives the car, can’t open the boot, and stops working tomorrow, instead of handing over your house keys.',
      industry: [
        '“Sign in with Google” (OpenID Connect on top of OAuth2).',
        'A printing app accessing your Google Photos with limited scope.',
        'SSO across company apps via Okta, Auth0, Keycloak or Cognito.',
      ],
      def: 'OAuth2 is delegated authorization: the user authenticates at the authorization server and consents to scopes; the client gets an authorization code, exchanges it (with its client secret, or PKCE for mobile/SPA) for an access token, and calls the resource server. The client never sees the user’s password. OIDC adds an ID token saying who the user is; SSO reuses one login across apps.',
      scenarios: [
        'A third-party app needs limited access to user data in your system',
        '“Sign in with Google/Microsoft”',
        'Single sign-on across many internal apps',
      ],
      scale: 'Use the authorization-code flow with PKCE for public clients; never the old implicit flow or password sharing.',
    },
    'RBAC / ABAC': {
      eli5: 'RBAC: your job title decides which doors your badge opens. ABAC: the door also checks the time, the building and whether the room is yours.',
      industry: [
        'Admin / editor / viewer roles in SaaS dashboards (RBAC).',
        '“A doctor can read records of their own patients, in their own hospital” (ABAC).',
        'AWS IAM policies with conditions; Spring Security @PreAuthorize.',
      ],
      def: 'Authorization models. RBAC grants permissions to roles and roles to users: simple and auditable. ABAC evaluates attributes of the user, resource and context (owner, department, time, region): flexible and fine-grained. Always enforce on the server, at the resource, not just by hiding UI buttons.',
      scenarios: [
        'Deciding who can view, edit or delete something',
        'Multi-tenant apps where users must only see their own tenant',
        'Rules depending on ownership or context',
      ],
      scale: 'Role explosion is RBAC’s failure mode; ABAC’s is policy complexity. Many systems combine both.',
    },
  },
  scenarios: [
    (pick) => {
      const what = pick(['an internet-banking web portal', 'an admin panel for support staff', 'a stock-trading web dashboard']);
      return {
        q: `For ${what}, security requires that when an account is locked or the user clicks “log out of all devices”, access stops within seconds. It’s a browser app on your own domain.`,
        answer: 'Session cookie',
        hint: 'Which mechanism can be revoked instantly?',
        steps: ['Instant revocation is required.', 'A session record can simply be deleted.', 'Use an HttpOnly, Secure, SameSite session cookie with sessions in Redis.', 'Session cookie.'],
        followups: [
          { q: 'Sessions are in memory of each of 6 app servers behind a load balancer and users keep getting logged out. Fix?', options: ['Move sessions to a shared store like Redis (or use sticky sessions as a stopgap)', 'Switch to HTTP/2', 'Lengthen the cookie name', 'Disable the load balancer'], why: 'Any server must be able to look up any session.' },
          { q: 'Why mark the cookie HttpOnly?', options: ['JavaScript can’t read it, so an XSS bug can’t steal the session', 'It makes requests faster', 'It enables HTTP/2', 'It encrypts the database'], why: 'HttpOnly limits the damage of XSS.' },
        ],
      };
    },
    (pick) => {
      const n = pick([20, 40, 80]);
      return {
        q: `A mobile app talks to ${n} microservices behind an API gateway. Each service needs the user’s ID and roles, and calling a central session store on every hop adds latency and a single point of failure.`,
        answer: 'JWT access token',
        hint: 'Let every service verify identity locally.',
        steps: ['Many services need identity on every request.', 'A signed token can be verified locally with a public key.', 'Keep it short-lived; use refresh tokens.', 'JWT access token.'],
        followups: [
          { q: 'A user’s JWT is stolen and is valid for 24 hours. What would have limited the damage?', options: ['Short-lived access tokens (minutes) plus revocable refresh tokens', 'A bigger signature', 'Storing the password in the token', 'Base64-encoding it twice'], why: 'JWTs can’t easily be revoked, so keep their lifetime short.' },
          { q: 'Is the JWT payload secret?', options: ['No: it’s only Base64-encoded; anyone can read the claims, so never put secrets in it', 'Yes, it’s encrypted', 'Only on HTTPS', 'Only the roles are hidden'], why: 'Signing proves integrity, not confidentiality.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['a photo-printing app wants to read your Google Photos', 'a budgeting app wants read-only access to your bank transactions', 'a scheduling tool wants to read your Outlook calendar']);
      return {
        q: `${what[0].toUpperCase() + what.slice(1)}. Users must not give it their password, access should be limited to what it needs, and they must be able to revoke it later.`,
        answer: 'OAuth2 / OpenID Connect',
        hint: 'Delegated, scoped, revocable access.',
        steps: ['A third party needs limited access on the user’s behalf.', 'User logs in and consents at the provider; the app gets a scoped access token.', 'The app never sees the password; tokens expire or are revoked.', 'OAuth2.'],
        followups: [
          { q: 'In the authorization-code flow, what does the client exchange for the access token?', options: ['The authorization code plus its client credentials (or PKCE verifier)', 'The user’s password', 'A cookie from the user’s browser', 'Nothing, the token comes first'], why: 'The code goes through the browser; the token exchange happens back-channel.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['a hospital records system', 'a multi-tenant HR SaaS', 'a school management app']);
      return {
        q: `In ${what}, rules are like “a user may view a record only if it belongs to their own organisation and they’re assigned to it”. Simple roles keep multiplying into dozens of special cases.`,
        answer: 'RBAC / ABAC',
        hint: 'Permissions depend on attributes of the user and the resource.',
        steps: ['Pure roles explode into special cases.', 'Rules depend on ownership, tenant and assignment attributes.', 'Use attribute-based checks (often on top of a few roles), enforced on the server.', 'ABAC (with RBAC).'],
        followups: [
          { q: 'The frontend hides the “Delete” button for viewers. Is that enough?', options: ['No: the server must check permissions on every request; hidden buttons are not security', 'Yes', 'Only on mobile', 'Yes, if the code is minified'], why: 'Authorization must be enforced server-side.' },
        ],
      };
    },
    (pick) => {
      const days = pick([14, 30, 90]);
      return {
        q: `A mobile shopping app uses stateless JWTs, and users must stay logged in for ${days} days. Security says a stolen access token must be useless within 15 minutes, and a lost phone must be cut off without a lookup on every API call.`,
        answer: 'Refresh token + short access token',
        hint: 'Split the token into a short-lived one used everywhere and a long-lived one used rarely.',
        steps: ['A single long-lived JWT is a big theft window and cannot be revoked.', 'Issue a 15-minute access token for API calls.', `Issue a ${days}-day refresh token, stored server-side and sent only to the token endpoint.`, 'Revoking the refresh token ends access within 15 minutes.'],
        followups: [
          { q: 'How often is the refresh token sent?', options: ['Only to the token endpoint when the access token has expired', 'On every API request', 'Inside every JWT', 'Never, it stays on the server'], why: 'Keeping it off normal requests shrinks its exposure.' },
          { q: 'How do you cut off a user instantly with this design?', options: ['Revoke the refresh token; accept up to one access-token lifetime of lag (or add a small denylist)', 'Wait for the refresh token to expire', 'Change the JWT algorithm', 'Nothing can be done'], why: 'The access token cannot be recalled, so its short lifetime bounds the delay.' },
        ],
      };
    },
    (pick) => {
      const n = pick([12, 30, 60]);
      return {
        q: `Your auth service signs JWTs. ${n} services, some run by partner teams you don’t fully trust, must verify tokens. Security refuses to hand the signing secret to partners.`,
        answer: 'JWT access token',
        hint: 'Can verifiers be given something that cannot sign?',
        steps: ['A shared HMAC secret would let any verifier forge tokens.', 'Sign with a private key (RSA/ECDSA) kept only by the auth service.', 'Publish the public key (e.g. a JWKS endpoint) so any service verifies locally.', 'JWT with asymmetric signing.'],
        followups: [
          { q: 'When is HMAC (HS256) acceptable?', options: ['A monolith or a few fully trusted services sharing one secret', 'Whenever third parties verify', 'Never', 'Only for refresh tokens'], why: 'Symmetric is simpler and faster but every verifier can also sign.' },
          { q: 'Why can’t you just put the user’s phone number in the payload “because it’s signed”?', options: ['Signing gives integrity, not secrecy: the payload is only Base64-encoded and readable', 'Signed payloads are encrypted', 'Phone numbers are too long', 'The signature would break'], why: 'Use JWE or keep sensitive data server-side.' },
        ],
      };
    },
    () => ({
      q: 'A company has 25 internal tools, each with its own login. Employees reuse weak passwords, and when someone leaves, IT must disable 25 accounts.',
      answer: 'OAuth2 / OpenID Connect',
      hint: 'One identity, one login, many apps.',
      steps: ['Many separate logins are weak and hard to off-board.', 'Use one identity provider (Okta, Azure AD, Keycloak).', 'Apps trust it via OIDC/SAML: single sign-on; disabling one account removes access everywhere.', 'SSO with OpenID Connect.'],
      followups: [
        { q: 'Authentication vs authorization in one line?', options: ['Authentication = who you are; authorization = what you’re allowed to do', 'They’re the same', 'Authorization = who you are', 'Authentication = what you can do'], why: 'A basic but frequently asked distinction.' },
      ],
    }),
  ],
});
