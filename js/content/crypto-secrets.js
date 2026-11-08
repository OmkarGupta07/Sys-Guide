SG.add({
  id: 'crypto-secrets',
  ref: 'L5 L6 L7 L12',
  section: 'Security',
  title: 'Hashing, encryption, secrets and privacy',
  short: 'Crypto and secrets',
  blurb: 'Which tool protects passwords, data in transit, data at rest and API keys, and the mistakes that leak them.',
  intro: 'Hashing is one-way (passwords); encryption is reversible with a key (data). TLS protects data moving over the network; encryption at rest protects stored data; a secrets manager keeps keys and passwords out of code. Privacy rules (GDPR, India’s DPDP Act) decide what you may store and for how long.',
  options: {
    'Password hashing': {
      eli5: 'Instead of keeping your house key, the guard keeps a mould that only your key fits. If the mould is stolen, nobody can rebuild the key from it easily.',
      industry: [
        'bcrypt, scrypt and Argon2 in Spring Security’s PasswordEncoder.',
        'Unique random salt per user, stored with the hash.',
        'Breach lists like Have I Been Pwned to block common passwords.',
      ],
      def: 'Store a slow, salted, one-way hash of each password (bcrypt/Argon2), never the password or a reversible encryption of it. Login re-hashes the input and compares. Salt defeats precomputed rainbow tables; slowness defeats brute force.',
      scenarios: [
        'Storing user passwords',
        'Verifying credentials without being able to read them',
        'Limiting damage if the user table leaks',
      ],
      scale: 'Fast hashes like MD5/SHA-256 alone are wrong for passwords: GPUs try billions per second.',
    },
    'TLS in transit': {
      eli5: 'Sending a letter in a locked box. The box key is agreed secretly at the start, and only the two of you can open it.',
      industry: [
        'HTTPS everywhere; TLS 1.3 in modern browsers and load balancers.',
        'mTLS between microservices in a service mesh.',
        'Let’s Encrypt and AWS Certificate Manager for free certificates.',
      ],
      def: 'TLS encrypts data moving between client and server and authenticates the server with a certificate. The handshake uses asymmetric crypto (server key pair, Diffie-Hellman) to agree a symmetric session key, which then encrypts the bulk data quickly. TLS 1.3 needs one round trip instead of two.',
      scenarios: [
        'Any data crossing a network, public or internal',
        'Preventing eavesdropping on public Wi-Fi',
        'Service-to-service traffic with mutual authentication (mTLS)',
      ],
      scale: 'Terminate TLS at the load balancer; re-encrypt internally if compliance requires end-to-end encryption.',
    },
    'Encryption at rest': {
      eli5: 'Locking files in a safe inside the office. Even if a thief carries off the cabinet, they can’t read anything without the safe’s key.',
      industry: [
        'AWS KMS-encrypted EBS volumes, S3 buckets and RDS databases.',
        'Field-level encryption for card numbers, Aadhaar or health data.',
        'Envelope encryption: data keys encrypted by a master key in KMS/HSM.',
      ],
      def: 'Encrypt stored data (disks, backups, database fields) with keys managed in a key management service. Protects against stolen disks, leaked backups and some insider access. Envelope encryption keeps master keys inside KMS/HSM; rotate keys and audit their use.',
      scenarios: [
        'Sensitive personal, financial or health data in databases and backups',
        'Compliance (PCI DSS, HIPAA, DPDP/GDPR)',
        'Backups stored with third parties',
      ],
      scale: 'Disk encryption doesn’t stop an attacker who queries through your app; combine with access control.',
    },
    'Secrets management': {
      eli5: 'Keeping the master keys in a bank locker that logs every visit, instead of taped under the office desk.',
      industry: [
        'HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager, Kubernetes Secrets (with encryption).',
        'Short-lived, automatically rotated database credentials.',
        'Secret scanning on GitHub to catch committed keys.',
      ],
      def: 'Store API keys, DB passwords and certificates in a dedicated secrets manager with access control, audit logs and rotation, and inject them at runtime. Never hard-code them or commit them to git; prefer short-lived credentials and per-service identities.',
      scenarios: [
        'An API key or DB password is in source code or a .env file in git',
        'Many services need credentials with different permissions',
        'Rotating keys without redeploying',
      ],
      scale: 'A key pushed to a public repo is found by bots within minutes; rotate immediately, don’t just delete the commit.',
    },
  },
  scenarios: [
    (pick) => {
      const how = pick(['plain text', 'MD5 hashes without salt', 'AES-encrypted with the key in the same server config']);
      return {
        q: `A startup stores user passwords as ${how}. A database dump just leaked online.`,
        answer: 'Password hashing',
        hint: 'Passwords should never be recoverable, even by you.',
        steps: ['Plain text, fast hashes and reversible encryption are all recoverable.', 'Use a slow, salted password hash (bcrypt/Argon2).', 'Force resets for affected users.', 'Password hashing.'],
        followups: [
          { q: 'What does a per-user salt prevent?', options: ['Precomputed rainbow-table attacks and identical hashes for identical passwords', 'All brute force', 'Phishing', 'SQL injection'], why: 'Salt makes each hash unique; slowness makes guessing expensive.' },
        ],
      };
    },
    () => ({
      q: 'During the HTTPS handshake, the client and server must agree on a key to encrypt the rest of the session, even though everything they send can be observed on the network.',
      answer: 'TLS in transit',
      hint: 'Asymmetric crypto to agree, symmetric crypto for the data.',
      steps: ['The certificate proves the server’s identity.', 'Key exchange (Diffie-Hellman in TLS 1.3) derives a shared secret without sending it.', 'Bulk data uses fast symmetric encryption with that session key.', 'TLS.'],
      followups: [
        { q: 'Why not use asymmetric encryption for all the data?', options: ['It’s far slower; symmetric encryption is used for bulk data after the handshake', 'It’s less secure', 'Browsers don’t support it', 'It needs UDP'], why: 'Hybrid crypto gets security and speed.' },
        { q: 'What did TLS 1.3 improve over TLS 1.2?', options: ['One round-trip handshake instead of two, and removed weak options like RSA key exchange', 'It removed encryption', 'It uses UDP only', 'Nothing'], why: 'Fewer round trips = faster connections.' },
      ],
    }),
    (pick) => {
      const what = pick(['customers’ card numbers', 'patients’ medical reports', 'users’ Aadhaar numbers']);
      return {
        q: `A database holds ${what}. Nightly backups go to a third-party storage provider, and auditors ask what happens if a backup file or disk is stolen.`,
        answer: 'Encryption at rest',
        hint: 'Protect the stored copies themselves.',
        steps: ['Stored data and backups can leak physically or via third parties.', 'Encrypt disks, backups and especially sensitive fields.', 'Keep keys in KMS/HSM (envelope encryption), rotate and audit.', 'Encryption at rest.'],
        followups: [
          { q: 'Should card numbers be stored at all?', options: ['Ideally not: tokenize via the payment gateway and store only a token and last 4 digits', 'Yes, in plain text', 'Yes, base64-encoded', 'Only in logs'], why: 'The safest sensitive data is data you never store (data minimisation).' },
        ],
      };
    },
    () => ({
      q: 'A developer committed the production database password and a payment API key to a public GitHub repo. They deleted the file in the next commit an hour later.',
      answer: 'Secrets management',
      hint: 'Is deleting the file enough? Where should secrets live?',
      steps: ['The secret remains in git history and was likely scraped by bots.', 'Rotate the credentials immediately.', 'Move secrets into a secrets manager, injected at runtime; enable secret scanning.', 'Secrets management.'],
      followups: [
        { q: 'Best kind of database credential for services?', options: ['Short-lived, automatically rotated credentials per service (e.g. from Vault)', 'One shared root password', 'A password in the Docker image', 'No password'], why: 'Short lifetimes and per-service identities limit blast radius.' },
      ],
    }),
    (pick) => {
      const law = pick(['GDPR', 'India’s DPDP Act']);
      return {
        q: `Under ${law}, a user asks you to delete all their personal data. It lives in the main database, the analytics warehouse, logs and backups.`,
        answer: 'Encryption at rest',
        hint: 'Privacy design: know where personal data lives and minimise it. Which option enables “crypto-shredding”?',
        steps: ['Personal data must be findable and deletable everywhere.', 'Minimise what you store and keep a data map.', 'Encrypt per-user data with a per-user key; deleting the key renders all copies (even backups) unreadable: crypto-shredding.', 'Encryption at rest (with per-user keys).'],
        followups: [
          { q: 'What is data minimisation?', options: ['Collect and keep only the personal data you actually need, for as long as needed', 'Compress the database', 'Delete all data monthly', 'Store data only in caches'], why: 'Less personal data = less risk and simpler compliance.' },
        ],
      };
    },
  ],
});
