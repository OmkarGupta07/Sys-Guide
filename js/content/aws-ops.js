SG.add({
  id: 'aws-ops',
  ref: 'O16 O18 O19 O22 O23',
  section: 'Infra and cloud',
  title: 'IAM, CloudWatch, Cognito and Well-Architected',
  short: 'AWS ops',
  blurb: 'Who can do what, how you see problems, where secrets live, how users log in, and how to review a design.',
  intro: 'Running on AWS safely means answering five questions. Who (or what) is allowed to call which API? IAM roles and least-privilege policies. What is happening right now? CloudWatch metrics, logs and alarms plus X-Ray traces. Where do passwords and keys live? Secrets Manager and KMS. How do end users sign up and log in? Cognito. Is the whole design sound? The Well-Architected Framework. Each AWS service has an Azure and GCP twin; knowing the mapping helps in multi-cloud interviews.',
  options: {
    'IAM roles and least privilege': {
      eli5: 'Office access cards: a temporary visitor card opens only the meeting room for today, while the old habit of handing out master keys means one lost key opens everything.',
      industry: [
        'EC2 instance roles, ECS task roles and EKS pod identities instead of access keys in config files.',
        'GitHub Actions assuming a deploy role through OIDC with no stored AWS keys.',
        'Separate AWS accounts per environment under AWS Organizations with guardrail policies.',
      ],
      def: 'AWS IAM controls authentication and authorisation for AWS APIs. Users are long-lived identities (best avoided for people; use SSO via IAM Identity Center), roles are assumed identities that hand out short-lived credentials, and policies are JSON documents of allowed or denied actions on resources. Least privilege means granting only the actions and resources needed; an explicit deny always wins. Azure equivalent: Microsoft Entra ID with Azure RBAC; GCP: Cloud IAM.',
      scenarios: [
        'Applications need AWS access without hard-coded keys',
        'Limiting the blast radius of a leaked credential',
        'CI/CD pipelines deploying into AWS accounts',
      ],
      scale: 'IAM Access Analyzer and last-accessed data help trim unused permissions; never use the root user for daily work.',
    },
    'CloudWatch + X-Ray': {
      eli5: 'The dashboard and CCTV of a factory: gauges show temperature and speed, alarms ring when something crosses a line, and recordings show exactly which machine slowed a particular order.',
      industry: [
        'Alarms on ALB 5xx rate, p99 latency and SQS queue age paging the on-call engineer.',
        'Centralised application logs searched with CloudWatch Logs Insights.',
        'X-Ray (or OpenTelemetry) traces showing which downstream call slowed a request.',
      ],
      def: 'Amazon CloudWatch collects metrics, logs and events from AWS services and your apps, with dashboards, alarms (which can trigger scaling or notifications) and log queries. AWS X-Ray provides distributed tracing across services, showing a service map and per-request timing. Azure equivalent: Azure Monitor and Application Insights; GCP: Cloud Monitoring, Cloud Logging and Cloud Trace.',
      scenarios: [
        'Alerting on errors and latency before customers complain',
        'Finding which microservice causes slow requests',
        'Searching logs across many instances',
      ],
      scale: 'Log ingestion and retention can become a large bill; set retention periods and sample traces rather than recording everything.',
    },
    'Secrets Manager / KMS': {
      eli5: 'A bank locker for your keys. The bank (KMS) keeps the master key in a vault that never leaves the building, and the locker service (Secrets Manager) changes your door codes on schedule.',
      industry: [
        'Database passwords stored in Secrets Manager with automatic rotation for RDS.',
        'KMS customer-managed keys encrypting S3, EBS, RDS and DynamoDB data at rest.',
        'Envelope encryption of sensitive fields like PAN or Aadhaar numbers in application code.',
      ],
      def: 'AWS Secrets Manager stores and rotates secrets (DB credentials, API keys), fetched at runtime through IAM-controlled calls. AWS KMS manages encryption keys in hardware-backed modules; keys never leave KMS unencrypted, every use is logged in CloudTrail, and services use envelope encryption (a data key encrypted by a KMS key). Systems Manager Parameter Store is a cheaper option for config and simple secrets. Azure: Key Vault; GCP: Secret Manager and Cloud KMS.',
      scenarios: [
        'Removing passwords from code, env files and Git',
        'Rotating database credentials automatically',
        'Encryption at rest with auditable key usage',
      ],
      scale: 'Cache secrets in the app for minutes instead of calling the API on every request; KMS has per-Region request quotas.',
    },
    'Cognito': {
      eli5: 'A ready-made reception desk for your building that handles visitor registration, ID checks and “sign in with Google”, so you don’t build your own.',
      industry: [
        'Sign-up and login with email, phone OTP and social providers for a mobile app.',
        'Issuing JWTs that API Gateway or an ALB validate before calling the backend.',
        'Identity pools giving app users temporary AWS credentials to upload directly to S3.',
      ],
      def: 'Amazon Cognito provides customer identity: user pools are a user directory and OIDC/OAuth 2.0 provider (sign-up, login, MFA, social and SAML federation, JWT tokens), and identity pools exchange those identities for temporary, scoped AWS credentials. It removes the need to build password storage, MFA and token handling yourself. Azure: Microsoft Entra External ID (formerly Azure AD B2C); GCP: Identity Platform / Firebase Authentication.',
      scenarios: [
        'Customer login for web and mobile apps',
        'Social and enterprise SSO federation',
        'Letting app users access AWS resources directly with scoped permissions',
      ],
      scale: 'Billed per monthly active user; large consumer apps compare it against Auth0, Keycloak or Firebase on cost and features.',
    },
    'Well-Architected Framework': {
      eli5: 'A building inspector’s checklist: is it safe, will it stand in an earthquake, is it affordable to maintain, can people work efficiently in it? You tick through each area before moving in.',
      industry: [
        'Pre-launch reviews of a new platform using the Well-Architected Tool.',
        'Cost-optimisation reviews after a surprise bill.',
        'Reliability reviews after an outage to find single points of failure.',
      ],
      def: 'The AWS Well-Architected Framework is a set of design principles and review questions across six pillars: operational excellence, security, reliability, performance efficiency, cost optimisation and sustainability. Teams review workloads against it to find high-risk issues and prioritise fixes. Azure and Google Cloud publish similar frameworks.',
      scenarios: [
        'Reviewing a design end to end before launch',
        'Structuring trade-off discussions in an interview',
        'Finding risks after incidents or cost spikes',
      ],
      scale: 'A lens, not a service: it costs nothing, and its questions map neatly onto interview NFRs.',
    },
  },
  scenarios: [
    (pick) => {
      const w = pick(['a public GitHub repo', 'a Slack channel', 'a Docker image pushed to Docker Hub']);
      return {
        q: `A developer at a lending startup leaked an AWS access key with AdministratorAccess in ${w}. Within an hour, someone launched GPU instances in three Regions. How should apps and pipelines get AWS access from now on?`,
        answer: 'IAM roles and least privilege',
        hint: 'No long-lived keys, and only the permissions needed.',
        steps: ['Long-lived admin keys are dangerous when leaked.', 'Use roles for EC2/ECS/Lambda and OIDC for CI, giving short-lived credentials.', 'Scope each policy to needed actions and resources.', 'IAM roles and least privilege.'],
        followups: [
          { q: 'IAM user vs role vs policy?', options: ['User: long-lived identity. Role: assumable identity with temporary credentials. Policy: the JSON permissions attached to either', 'All three are the same', 'Policies are users', 'Roles have permanent passwords'], why: 'Prefer roles and SSO; minimise users.' },
          { q: 'A policy allows s3:* but another attached policy explicitly denies s3:DeleteObject. Can the role delete?', options: ['No, an explicit deny always wins', 'Yes, allow wins', 'Only on weekends', 'It depends on the Region'], why: 'Evaluation: explicit deny > allow > implicit deny.' },
        ],
      };
    },
    (pick) => {
      const n = pick([12, 20, 35]);
      return {
        q: `A travel portal has ${n} microservices. Customers report that hotel search sometimes takes 8 seconds, but every service’s average latency looks fine, and nobody knows which hop is slow.`,
        answer: 'CloudWatch + X-Ray',
        hint: 'Follow one request across services.',
        steps: ['Averages hide slow paths across services.', 'Distributed tracing shows time spent in each hop of a request.', 'Add p99 latency alarms in CloudWatch.', 'CloudWatch + X-Ray.'],
        followups: [
          { q: 'Why alarm on p99 latency instead of average?', options: ['Averages hide the slow tail that real users feel', 'p99 is cheaper', 'Averages are not supported', 'p99 shows CPU'], why: 'Tail latency matters at scale.' },
          { q: 'GCP and Azure equivalents of CloudWatch?', options: ['Cloud Monitoring/Logging and Azure Monitor', 'BigQuery and Cosmos DB', 'Cloud Run and AKS', 'Pub/Sub and Event Hubs'], why: 'Know the monitoring names across clouds.' },
        ],
      };
    },
    (pick) => {
      const n = pick([8, 15, 25]);
      return {
        q: `An audit at a health-tech company finds the production database password in ${n} application.properties files and CI variables, unchanged for two years. Auditors also want proof of who decrypted patient records.`,
        answer: 'Secrets Manager / KMS',
        hint: 'Central secret storage with rotation and auditable keys.',
        steps: ['Secrets are scattered and never rotated.', 'Move them to Secrets Manager and enable automatic rotation.', 'Encrypt data with KMS keys; CloudTrail logs every key use.', 'Secrets Manager / KMS.'],
        followups: [
          { q: 'What is envelope encryption?', options: ['Data is encrypted with a data key, and that data key is encrypted with a KMS master key', 'Encrypting emails only', 'Storing keys next to data in plain text', 'Encrypting twice with the same key'], why: 'Large data never needs to travel to KMS.' },
          { q: 'AWS Secrets Manager’s Azure equivalent?', options: ['Azure Key Vault', 'Azure Blob Storage', 'Azure Functions', 'Azure Front Door'], why: 'GCP’s is Secret Manager (keys in Cloud KMS).' },
        ],
      };
    },
    (pick) => {
      const n = pick(['5 lakh', '20 lakh', '50 lakh']);
      return {
        q: `A grocery app expects ${n} customers. It needs phone-OTP and Google login, MFA for high-value orders, and JWTs that API Gateway can validate. The team doesn’t want to store passwords themselves.`,
        answer: 'Cognito',
        hint: 'Managed customer identity that issues tokens.',
        steps: ['Building auth, MFA and token handling is risky and slow.', 'Cognito user pools manage sign-up, login, federation and MFA.', 'API Gateway validates Cognito JWTs.', 'Cognito.'],
        followups: [
          { q: 'User pool vs identity pool?', options: ['User pool: authenticates users and issues JWTs. Identity pool: swaps an identity for temporary AWS credentials', 'Same thing', 'Identity pool stores passwords', 'User pool gives IAM credentials only'], why: 'Use identity pools when the app calls AWS directly, e.g. S3 uploads.' },
        ],
      };
    },
    (pick) => {
      const w = pick(['a new UPI-based payments platform', 'a hospital records system', 'a national exam results portal']);
      return {
        q: `Before launching ${w}, the CTO wants a structured review covering security, reliability, cost, performance, operations and environmental impact, with a list of high-risk issues to fix.`,
        answer: 'Well-Architected Framework',
        hint: 'A standard set of pillars and questions.',
        steps: ['The request is a holistic design review, not one service.', 'AWS’s framework has six pillars matching these concerns.', 'Run a Well-Architected review and prioritise high-risk findings.', 'Well-Architected Framework.'],
        followups: [
          { q: 'Which is NOT one of the six Well-Architected pillars?', options: ['Scalability', 'Reliability', 'Sustainability', 'Cost optimisation'], why: 'The six: operational excellence, security, reliability, performance efficiency, cost optimisation, sustainability.' },
        ],
      };
    },
    (pick) => {
      const c = pick(['Azure', 'Google Cloud']);
      return {
        q: `An interviewer at a multi-cloud consultancy asks how you’d secure a design on AWS and then map it to ${c}: apps must call storage and queues with no stored keys, each service only able to touch its own resources.`,
        answer: 'IAM roles and least privilege',
        hint: 'Workload identity with narrow permissions.',
        steps: ['No stored keys means workload identities (roles).', 'Each service gets its own role with resource-scoped policies.', 'Map to managed identities (Azure) or service accounts (GCP).', 'IAM roles and least privilege.'],
        followups: [
          { q: 'Match: EC2, S3, Lambda, DynamoDB on Azure?', options: ['Virtual Machines, Blob Storage, Azure Functions, Cosmos DB', 'AKS, Files, Logic Apps, SQL Database', 'App Service, Disks, Event Grid, Table Storage only', 'VMs, Cosmos DB, Functions, Blob Storage'], why: 'Common cross-cloud mapping asked in interviews.' },
          { q: 'Match: EC2, S3, Lambda, DynamoDB on Google Cloud?', options: ['Compute Engine, Cloud Storage, Cloud Run functions, Firestore (or Bigtable)', 'GKE, Filestore, App Engine, Spanner only', 'Compute Engine, BigQuery, Pub/Sub, Cloud SQL', 'Cloud Run, Cloud Storage, Dataflow, Memorystore'], why: 'Cloud Functions is now called Cloud Run functions.' },
        ],
      };
    },
  ],
});
