SG.add({
  id: 'cicd-iac',
  ref: 'N7 N8 N10',
  section: 'Infra and cloud',
  title: 'CI/CD, Terraform and serverless',
  short: 'CI/CD + IaC',
  blurb: 'Automate testing, releases and infrastructure, and know when a function beats a server.',
  intro: 'Modern teams automate three things: checking every change (CI), shipping it safely (CD), and creating the servers, networks and databases it runs on (infrastructure as code). Serverless functions remove the servers altogether for short, event-driven work. Decide by asking what is manual and error-prone today: merging untested code, hand-run deploys, click-ops in the cloud console, or paying for idle servers.',
  options: {
    'CI pipeline': {
      eli5: 'A quality checker at the factory gate: every new part is measured and tested before it joins the assembly line, so a bad part never reaches the car.',
      industry: [
        'GitHub Actions or Jenkins running mvn verify, unit tests and static analysis on every pull request.',
        'Branch protection that blocks merging until the build and tests are green.',
        'Building and scanning the Docker image once, then pushing it to ECR with the commit SHA as its tag.',
      ],
      def: 'Continuous integration means every push or pull request automatically triggers a build, tests and checks (lint, security scan) on a clean runner, and the result gates the merge. Developers merge small changes often, so integration bugs show up within minutes instead of at release time.',
      scenarios: [
        'Broken builds and failing tests keep reaching the main branch',
        'Merges are painful because branches live for weeks',
        'You want one tested, versioned artifact per commit',
      ],
      scale: 'Keep the PR pipeline under about 10 minutes: cache dependencies, run tests in parallel, and push slow end-to-end suites to a later stage.',
    },
    'CD pipeline': {
      eli5: 'A conveyor belt from the factory to the showroom with checkpoints on the way. A car moves on only when the previous checkpoint says it is fine, and it can be sent back automatically.',
      industry: [
        'Promoting the same image from dev to staging to production with approval gates.',
        'Canary or blue-green releases with automatic rollback when error rate rises.',
        'GitOps tools like Argo CD syncing Kubernetes manifests from a Git repo.',
      ],
      def: 'Continuous delivery keeps every passing build releasable and deploys it through environments automatically, with a manual approval before production; continuous deployment removes that approval. Good pipelines promote one immutable artifact, use progressive rollouts, run smoke tests, and roll back on bad health signals.',
      scenarios: [
        'Deploys are manual, rare and scary',
        'Staging and production run different builds',
        'You need canary releases and quick rollback',
      ],
      scale: 'Elite teams deploy many times a day; measure lead time, deploy frequency, change failure rate and time to restore (DORA metrics).',
    },
    'Terraform (IaC)': {
      eli5: 'An architect’s blueprint for a building. You don’t tell workers each brick to lay; you hand over the final drawing and they work out what to add or remove to match it.',
      industry: [
        'Creating VPCs, subnets, RDS, EKS clusters and IAM roles from version-controlled code.',
        'Spinning up identical dev, staging and production environments from the same modules.',
        'Running terraform plan in CI on every pull request so reviewers see the exact infrastructure change.',
      ],
      def: 'Terraform is a declarative infrastructure-as-code tool: you describe the desired end state in HCL, and it compares that with its state file and the real cloud to produce a plan of creates, updates and deletes, then applies it in dependency order through providers (AWS, Azure, Kubernetes and many more). It is strongest at provisioning; configuration tools like Ansible are better for setting up software inside servers.',
      scenarios: [
        'Environments are built by clicking in the console and nobody can reproduce them',
        'You need an identical copy of production for staging or a demo',
        'Infrastructure changes must be reviewed like code',
      ],
      scale: 'Keep state remote (for example S3 with locking) and never edit it by hand; split large setups into modules and per-environment state to limit blast radius.',
    },
    'Serverless function': {
      eli5: 'Calling a taxi instead of owning a car. You pay only for the ride, no parking or servicing, but you may wait a moment for it to arrive and can’t keep things in it overnight.',
      industry: [
        'AWS Lambda resizing images when a file lands in S3.',
        'Webhook handlers and cron-style jobs that run a few times an hour.',
        'Lightweight APIs behind API Gateway with very spiky or low traffic.',
      ],
      def: 'Function as a service runs your code on demand in response to events (HTTP, queue, file upload, schedule) with no servers to manage; the platform scales from zero to thousands of instances and bills per request and execution time. Trade-offs: cold starts when a new instance boots, execution time limits (15 minutes on Lambda), statelessness, and cost that overtakes containers at high steady load.',
      scenarios: [
        'Event-driven glue work triggered by uploads, queues or schedules',
        'Traffic is very spiky or near zero for long periods',
        'A tiny team that does not want to run servers',
      ],
      scale: 'Lambda: up to 10,240 MB memory, 15-minute timeout, 1,000 concurrent executions per Region by default (raisable). Java cold starts can be seconds; SnapStart or provisioned concurrency reduce them.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick([12, 25, 40]);
      return {
        q: `A fintech team in Pune has ${n} developers pushing to one Spring Boot repo. Twice this month someone merged code that didn’t compile, and the main branch stayed broken for half a day.`,
        answer: 'CI pipeline',
        hint: 'Catch problems before the merge, not after.',
        steps: ['The problem appears at merge time.', 'Build and test every pull request automatically on a clean runner.', 'Block the merge until checks pass.', 'CI pipeline.'],
        followups: [
          { q: 'The PR build now takes 35 minutes and developers bypass it. What helps most?', options: ['Cache dependencies, parallelise tests, and move slow end-to-end tests to a later stage', 'Remove all tests', 'Run the build only once a week', 'Buy faster laptops'], why: 'A slow pipeline gets ignored; keep the gating stage fast.' },
          { q: 'Continuous integration vs continuous delivery?', options: ['CI builds and tests every change; CD automatically takes passing builds through environments to release', 'They are the same', 'CI deploys to production; CD runs unit tests', 'CD means no tests'], why: 'CI ends with a tested artifact; CD carries it to users.' },
        ],
      };
    },
    (pick) => {
      const d = pick(['once a month', 'every two weeks', 'once a quarter']);
      return {
        q: `An insurance company releases ${d}. A senior engineer SSHes into servers, copies a jar built on his laptop and restarts services. Releases take a whole weekend and rollbacks are guesswork.`,
        answer: 'CD pipeline',
        hint: 'Automate the path from a tested build to production.',
        steps: ['Builds and deploys are manual and unrepeatable.', 'Promote one immutable artifact through staging to production automatically.', 'Add health checks, canary steps and automated rollback.', 'CD pipeline.'],
        followups: [
          { q: 'Why deploy the same image to staging and production instead of rebuilding for each?', options: ['So production runs exactly the bytes that were tested', 'Rebuilding is not allowed by Docker', 'It saves disk space only', 'Staging needs a different language'], why: 'Build once, promote many times.' },
          { q: 'Continuous delivery vs continuous deployment?', options: ['Delivery keeps a manual approval before production; deployment releases every passing change automatically', 'Deployment has no tests', 'Delivery means physical shipping', 'No difference'], why: 'Regulated firms often choose delivery with an approval gate.' },
        ],
      };
    },
    (pick) => {
      const env = pick(['a staging copy', 'a disaster-recovery copy in Hyderabad', 'a demo environment for a big client']);
      return {
        q: `A startup’s AWS setup (VPC, 6 EC2 servers, RDS, security groups, IAM roles) was built by hand in the console over a year. Now they need ${env} that matches production exactly, and nobody remembers every setting.`,
        answer: 'Terraform (IaC)',
        hint: 'Describe infrastructure as code once, create it many times.',
        steps: ['Hand-built infrastructure can’t be reproduced reliably.', 'Write the desired state in code (importing existing resources).', 'Apply the same modules with different variables per environment.', 'Terraform (IaC).'],
        followups: [
          { q: 'What does terraform plan do?', options: ['Compares desired config with state and real resources and shows what would be created, changed or destroyed, without changing anything', 'Deletes everything', 'Applies changes immediately', 'Installs Docker on servers'], why: 'Plan is a preview; apply executes it.' },
          { q: 'Terraform vs Ansible in one line?', options: ['Terraform provisions infrastructure declaratively; Ansible mainly configures software on existing machines', 'Ansible creates VPCs better', 'They are identical', 'Terraform only works on-prem'], why: 'Teams often use both, each for its strength.' },
        ],
      };
    },
    (pick) => {
      const n = pick([3, 5, 8]);
      return {
        q: `${n} engineers run terraform apply from their laptops against the same production account. Last week two applies ran at the same time and the state file got corrupted.`,
        answer: 'Terraform (IaC)',
        hint: 'The tool is right; fix how its state is stored and changed.',
        steps: ['Local state files plus parallel applies cause conflicts.', 'Move state to a remote backend (such as S3) with locking.', 'Run plan on the pull request and apply from the pipeline after review.', 'Terraform (IaC), done properly.'],
        followups: [
          { q: 'Someone changed a security group by hand in the console. What will the next terraform plan show?', options: ['Drift: it proposes changing the resource back to match the code', 'Nothing, Terraform ignores manual changes', 'It deletes the whole VPC', 'It updates the code automatically'], why: 'Declarative tools reconcile real state to the code; avoid click-ops.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['2,000', '5,000', '10,000']);
      return {
        q: `A real-estate app gets about ${n} property photo uploads a day, in bursts after office hours. Each upload needs 3 thumbnail sizes generated in a few seconds. The team doesn’t want a server sitting idle all night.`,
        answer: 'Serverless function',
        hint: 'Short, event-driven work with idle gaps.',
        steps: ['Work is triggered by an event (file landing in S3).', 'Each job runs for seconds; traffic is bursty with long idle periods.', 'Functions scale with uploads and cost nothing when idle.', 'Serverless function.'],
        followups: [
          { q: 'What is a cold start?', options: ['Extra latency when the platform must create a new execution environment and load your code before handling a request', 'A failed deploy', 'A function that runs in winter', 'The first line of code'], why: 'Warm instances reuse the environment and skip it.' },
        ],
      };
    },
    (pick) => {
      const p = pick(['p99 latency jumps to 4 seconds', 'the first request after a quiet spell takes 3–5 seconds', 'login calls occasionally time out']);
      return {
        q: `A payments API written in Java runs on Lambda behind API Gateway. Traffic is low at night, and every morning ${p}. Business wants a quick fix without moving off serverless.`,
        answer: 'Serverless function',
        hint: 'This is a well-known serverless trade-off with known fixes.',
        steps: ['Low traffic lets environments go cold.', 'JVM startup and framework init make cold starts slow.', 'Use SnapStart or provisioned concurrency, and trim startup work.', 'Keep the serverless function, tuned.'],
        followups: [
          { q: 'When is a long-running container service usually better than Lambda?', options: ['Steady high traffic, long-running work over 15 minutes, or needing persistent connections and local state', 'Very spiky traffic with idle periods', 'A webhook called 50 times a day', 'Reacting to S3 uploads'], why: 'At constant high load, per-invocation billing costs more than always-on compute.' },
          { q: 'Lambda’s maximum execution time per invocation?', options: ['15 minutes', '30 seconds', '24 hours', 'Unlimited'], why: 'Longer jobs belong on containers, Batch or Step Functions.' },
        ],
      };
    },
  ],
});
