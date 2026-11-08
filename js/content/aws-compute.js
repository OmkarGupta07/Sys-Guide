SG.add({
  id: 'aws-compute',
  ref: 'O1 O2 O8 O12 O15',
  section: 'Infra and cloud',
  title: 'AWS compute: EC2, Lambda, ECS, EKS',
  short: 'AWS compute',
  blurb: 'Regions and AZs, then VMs, autoscaling groups, functions and containers: pick the right level of control.',
  intro: 'AWS is split into Regions (for example Mumbai ap-south-1 and Hyderabad ap-south-2), each with several isolated Availability Zones (separate data centres a few kilometres apart), plus hundreds of edge locations for CloudFront and Route 53. Compute choices trade control for convenience: EC2 gives you whole VMs, Auto Scaling Groups keep a fleet healthy across AZs, ECS/Fargate and EKS run containers, and Lambda runs functions with no servers at all. Pick the least operational burden that still fits your runtime, traffic shape and team skills.',
  options: {
    'EC2 (pricing models)': {
      eli5: 'Renting a car: daily rental is flexible but costly, a yearly lease is cheaper if you’ll drive it anyway, and a last-minute discount car is very cheap but the agency can take it back with short notice.',
      industry: [
        'On-Demand for new or unpredictable workloads; Savings Plans or Reserved Instances for the steady baseline.',
        'Spot Instances for CI runners, batch jobs and stateless workers at up to about 90% off.',
        'Choosing families by need: C for CPU-heavy, R for memory-heavy, G/P for GPUs, Graviton for better price-performance.',
      ],
      def: 'EC2 provides virtual machines in many instance types (CPU, memory, storage, network mixes) with full OS control. Pricing: On-Demand (per second, no commitment), Savings Plans or Reserved Instances (1 or 3 year commitment for large discounts), and Spot (spare capacity, deep discounts, but can be reclaimed with a 2-minute warning).',
      scenarios: [
        'Software that needs full OS control, special drivers or licences',
        'Cutting the bill for a steady 24×7 baseline',
        'Cheap, interruptible batch or CI capacity',
      ],
      scale: 'Typical mix: commitments for the baseline, On-Demand for peaks, Spot for fault-tolerant work. Commitments save up to roughly 70%.',
    },
    'Auto Scaling Group across AZs': {
      eli5: 'A shift manager for a chain of three branches. If staff at one branch fall sick or the branch closes, she sends replacements to the other branches and hires extra people when queues grow.',
      industry: [
        'Web fleets behind an ALB spread over 3 AZs in Mumbai, replacing unhealthy instances automatically.',
        'Target tracking on average CPU or requests per target, plus scheduled scaling before known peaks.',
        'Rolling AMI updates through launch templates and instance refresh.',
      ],
      def: 'An Auto Scaling Group keeps a desired number of EC2 instances (between a min and max) built from a launch template, spread across the AZs you choose. It replaces instances that fail EC2 or load-balancer health checks and scales on policies (target tracking, step, scheduled, predictive). Combined with a load balancer, it gives self-healing, multi-AZ capacity.',
      scenarios: [
        'A fleet must survive the loss of one Availability Zone',
        'Traffic varies through the day and capacity should follow',
        'Unhealthy instances should be replaced without a human',
      ],
      scale: 'Spread over at least 2–3 AZs; new instances take minutes to boot, so pre-scale (scheduled scaling or warm pools) for flash sales.',
    },
    'Lambda': {
      eli5: 'A cook who appears the moment an order arrives and vanishes when it is done. You pay per dish, but the first dish after a quiet spell takes a little longer.',
      industry: [
        'Processing S3 uploads, SQS messages and DynamoDB stream events.',
        'Scheduled jobs via EventBridge Scheduler instead of a cron server.',
        'Low or spiky traffic APIs behind API Gateway.',
      ],
      def: 'AWS Lambda runs functions in response to events and scales automatically, billing per request and per millisecond of duration based on memory. No servers or patching. Limits: up to 15 minutes per invocation, up to 10,240 MB memory (CPU scales with memory), 6 MB synchronous payloads, and a default regional concurrency of 1,000 that can be raised.',
      scenarios: [
        'Event-driven glue between AWS services',
        'Traffic that is zero for long stretches, then bursts',
        'Small teams avoiding server management',
      ],
      scale: 'Cheap at low and bursty volume; at steady high throughput, containers are usually cheaper. Watch cold starts for Java (SnapStart helps).',
    },
    'ECS on Fargate': {
      eli5: 'Sending your packed tiffin boxes with a delivery service: you decide what goes in each box and how many, and they handle the scooters, drivers and routes.',
      industry: [
        'Spring Boot microservices as ECS services behind an ALB, with no EC2 hosts to patch.',
        'Scheduled or queue-driven batch tasks that run longer than Lambda allows.',
        'Small platform teams that want containers without learning Kubernetes.',
      ],
      def: 'Amazon ECS is AWS’s own container orchestrator: you define task definitions (image, CPU, memory, IAM role) and services that keep N tasks running behind a load balancer. Fargate is serverless capacity for ECS (and EKS): AWS runs each task on managed infrastructure, billing per vCPU and GB-second, so you never manage instances.',
      scenarios: [
        'Containerised services without wanting to run Kubernetes',
        'Long-running jobs beyond Lambda’s 15-minute limit',
        'A team that wants zero host maintenance',
      ],
      scale: 'Fargate costs more per vCPU than well-packed EC2 but removes host ops; ECS itself has no control-plane fee.',
    },
    'EKS': {
      eli5: 'Hiring a professional orchestra conductor who follows the world-standard sheet music. Any trained musician can join, but you still pay for and manage the orchestra.',
      industry: [
        'Large platforms with dozens of microservices standardising on Kubernetes, Helm and Argo CD.',
        'Multi-cloud or hybrid setups that want the same Kubernetes APIs everywhere.',
        'Using ecosystem tools like Karpenter, KEDA, Istio and operators for Kafka or databases.',
      ],
      def: 'Amazon EKS is managed Kubernetes: AWS runs a highly available control plane across AZs, and your pods run on EC2 managed node groups, Karpenter-provisioned nodes or Fargate. You get the full Kubernetes ecosystem and portability, at the cost of more complexity and a per-cluster hourly fee.',
      scenarios: [
        'The team already knows Kubernetes and wants portability',
        'Many services needing operators, service mesh or custom controllers',
        'Hybrid or multi-cloud with one deployment model',
      ],
      scale: 'Each cluster has a control-plane fee (about 0.10 USD per hour on standard support); upgrades every Kubernetes minor version are your responsibility.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick([20, 40, 60]);
      return {
        q: `An edtech company runs ${n} m-family EC2 instances 24×7 for its core platform, with load that barely changes month to month. Finance wants to cut compute spend without re-architecting.`,
        answer: 'EC2 (pricing models)',
        hint: 'Steady usage you’ll keep paying for anyway.',
        steps: ['Usage is steady and predictable.', 'On-Demand prices pay for flexibility you don’t need.', 'Commit with Savings Plans or Reserved Instances for 1 or 3 years.', 'EC2 pricing models.'],
        followups: [
          { q: 'Which workload suits Spot Instances best?', options: ['Stateless, retryable batch jobs or CI runners that tolerate interruption', 'The primary database', 'A single payment server', 'Stateful leader nodes'], why: 'Spot can be reclaimed with a 2-minute warning.' },
        ],
      };
    },
    (pick) => {
      const n = pick([500, 2000, 5000]);
      return {
        q: `A media firm must transcode ${n} hours of video every night. Jobs are checkpointed and safely retryable, and the deadline is 6 a.m. They want the cheapest compute possible.`,
        answer: 'EC2 (pricing models)',
        hint: 'Interruptible work, lowest price.',
        steps: ['Jobs are fault-tolerant and can retry.', 'Spot capacity is deeply discounted.', 'Spread across several instance types and AZs to reduce interruptions.', 'EC2 Spot pricing.'],
        followups: [
          { q: 'How do you make a Spot fleet less likely to be interrupted all at once?', options: ['Diversify across many instance types and AZs and use capacity-optimised allocation', 'Use one instance type only', 'Turn off checkpoints', 'Run in a single AZ'], why: 'Spot pools differ; diversity spreads the risk.' },
        ],
      };
    },
    (pick) => {
      const az = pick(['ap-south-1a', 'ap-south-1b', 'ap-south-1c']);
      return {
        q: `A ticket-booking site runs 6 EC2 instances, all in ${az}. When that AZ had a power issue, the whole site went down for 2 hours. They also want capacity to grow during evening rushes.`,
        answer: 'Auto Scaling Group across AZs',
        hint: 'Self-healing capacity spread over failure domains.',
        steps: ['All instances in one AZ is a single point of failure.', 'An ASG spreads instances across 2–3 AZs behind a load balancer.', 'It replaces unhealthy instances and scales with load.', 'Auto Scaling Group across AZs.'],
        followups: [
          { q: 'Region vs Availability Zone vs edge location?', options: ['Region = geographic area with multiple AZs; AZ = isolated data centre(s) in it; edge location = CDN/DNS point of presence near users', 'They are the same', 'An AZ contains multiple Regions', 'Edge locations run EC2 for you'], why: 'Design HA across AZs, DR across Regions, and latency with edge.' },
          { q: 'Why do a flash sale’s first minutes still see errors even with autoscaling?', options: ['New instances take minutes to launch and warm up; pre-scale with scheduled scaling or warm pools', 'ASGs only scale down', 'Load balancers block new instances', 'AZs are offline'], why: 'Reactive scaling lags sudden spikes.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['300', '1,000', '4,000']);
      return {
        q: `A logistics company receives about ${n} delivery-proof photos an hour from drivers, mostly 8 a.m. to 8 p.m. Each needs a quick compress-and-tag step after landing in S3. Nights are nearly idle.`,
        answer: 'Lambda',
        hint: 'Short work triggered by an AWS event, idle at night.',
        steps: ['Each task is seconds long and triggered by S3.', 'Traffic drops to near zero at night.', 'Lambda scales with uploads and bills only per use.', 'Lambda.'],
        followups: [
          { q: 'A Lambda in a VPC needs to reach a private RDS. What is a common scaling risk?', options: ['Many concurrent functions exhaust database connections; use RDS Proxy', 'Lambda can’t run in a VPC', 'RDS blocks Lambda by design', 'It has no risk'], why: 'Functions scale fast; databases don’t accept unlimited connections.' },
        ],
      };
    },
    (pick) => {
      const n = pick([6, 10, 15]);
      return {
        q: `A 5-person startup has ${n} Dockerised Spring Boot services. Nobody on the team knows Kubernetes, and they don’t want to patch or right-size EC2 hosts. Some jobs run 40 minutes.`,
        answer: 'ECS on Fargate',
        hint: 'Containers, minimal ops, no Kubernetes learning curve.',
        steps: ['Workloads are already containers.', 'Lambda’s 15-minute limit rules it out for the long jobs.', 'ECS is simpler than Kubernetes; Fargate removes host management.', 'ECS on Fargate.'],
        followups: [
          { q: 'Fargate vs ECS on EC2 instances?', options: ['Fargate: no hosts to manage, pay per task size; EC2 launch type: you manage hosts but can pack them tightly and use commitments or Spot', 'Fargate is always cheaper', 'EC2 launch type can’t use load balancers', 'They are identical'], why: 'Trade operational effort against unit cost.' },
        ],
      };
    },
    (pick) => {
      const n = pick([80, 120, 200]);
      return {
        q: `A large Indian bank’s platform team runs ${n} microservices, already uses Helm, Argo CD and Kafka operators on-prem Kubernetes, and wants the same model in AWS with a path to other clouds.`,
        answer: 'EKS',
        hint: 'They want the standard, portable orchestrator.',
        steps: ['The team has deep Kubernetes skills and tooling.', 'Portability and ecosystem tools matter.', 'EKS manages the control plane; they keep Kubernetes APIs.', 'EKS.'],
        followups: [
          { q: 'Main downside of EKS compared with ECS?', options: ['More complexity: cluster upgrades, add-ons and Kubernetes expertise, plus a per-cluster fee', 'It can’t autoscale', 'It doesn’t support Docker images', 'It only runs in one AZ'], why: 'Choose EKS for ecosystem and portability, ECS for simplicity on AWS.' },
        ],
      };
    },
  ],
});
