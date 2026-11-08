SG.add({
  id: 'vpc',
  ref: 'N9 O17',
  section: 'Infra and cloud',
  title: 'VPCs, subnets and network security',
  short: 'VPC',
  blurb: 'Public vs private subnets, NAT, security groups vs NACLs, endpoints and safe admin access.',
  intro: 'A VPC is your own private network inside an AWS Region, split into subnets that each live in one Availability Zone. A subnet is “public” only because its route table sends 0.0.0.0/0 to an internet gateway; everything else (app servers, databases) should sit in private subnets. Then layer security: security groups on each resource, NACLs on each subnet, endpoints to reach AWS services privately, and Session Manager instead of open SSH.',
  options: {
    'Public subnet + internet gateway': {
      eli5: 'The shop counter facing the street. Customers can walk up to it directly, so you only put the counter and the cashier there, never the safe.',
      industry: [
        'Placing internet-facing load balancers (ALB/NLB) in public subnets across 2–3 AZs.',
        'Hosting NAT gateways, which themselves need a route to the internet gateway.',
        'Small single-server setups where an EC2 instance needs a public IP.',
      ],
      def: 'A subnet whose route table has a default route (0.0.0.0/0) to the VPC’s internet gateway. Resources in it can have public IPs and be reached from the internet, subject to security groups and NACLs. The internet gateway is horizontally scaled and highly available, and itself has no hourly charge.',
      scenarios: [
        'Exposing a load balancer to customers on the internet',
        'Hosting NAT gateways for private subnets',
        'A quick prototype that needs a public IP',
      ],
      scale: 'Keep only entry points here; public IPv4 addresses are billed per hour, so fewer public resources also saves money.',
    },
    'Private subnet + NAT gateway': {
      eli5: 'The kitchen behind the shop. Staff can send a runner out to buy supplies, but no customer can walk in from the street.',
      industry: [
        'App servers and EKS worker nodes pulling packages and calling payment APIs like Razorpay.',
        'RDS databases in private (isolated) subnets with no internet route at all.',
        'A NAT gateway per AZ, or the newer regional NAT gateway, for resilient outbound access.',
      ],
      def: 'A private subnet has no route to the internet gateway, so nothing on the internet can initiate connections to it. For outbound-only internet access, its route table sends 0.0.0.0/0 to a managed NAT gateway, which translates private addresses to its public IP. Return traffic is allowed; new inbound connections are not.',
      scenarios: [
        'Servers must call external APIs but must not be reachable from outside',
        'Databases and internal services that should never be public',
        'Meeting audit rules that ban public IPs on app servers',
      ],
      scale: 'NAT gateways bill per hour and per GB processed; heavy S3 or ECR traffic through NAT is a classic surprise bill (use endpoints).',
    },
    'Security group': {
      eli5: 'A bouncer at each flat’s door with a guest list. If you were let in, you are automatically allowed back out.',
      industry: [
        'Database security group allowing port 5432 only from the app tier’s security group.',
        'ALB security group allowing 443 from anywhere; app instances allowing traffic only from the ALB.',
        'Lambda and ECS tasks in a VPC each getting their own security group.',
      ],
      def: 'A stateful virtual firewall attached to network interfaces (instances, RDS, Lambda ENIs). It has allow rules only, evaluates all rules together, and automatically permits return traffic for allowed connections. Rules can reference other security groups instead of IP ranges, which is how tiers are usually locked down.',
      scenarios: [
        'Only the app tier may talk to the database',
        'Per-resource rules that follow instances as they scale',
        'Least-privilege network access between microservices',
      ],
      scale: 'The main tool for day-to-day network security; default is deny all inbound, allow all outbound.',
    },
    'Network ACL': {
      eli5: 'A security checkpoint at the gate of the whole housing society. It checks everyone going in and out separately and can turn away a specific troublemaker by name.',
      industry: [
        'Blocking a known malicious IP range at the subnet level during an attack.',
        'Compliance rules that require an explicit deny layer per subnet.',
        'A coarse second layer of defence behind security groups.',
      ],
      def: 'A stateless firewall at the subnet boundary with numbered allow and deny rules evaluated in order, lowest number first. Because it is stateless, you must allow return traffic explicitly, including ephemeral ports (roughly 1024–65535). The default NACL allows everything.',
      scenarios: [
        'You need an explicit deny for specific IPs or ranges',
        'A subnet-wide guardrail regardless of instance settings',
        'Defence in depth required by an auditor',
      ],
      scale: 'Rule limits are small (tens of rules) and changes affect the whole subnet, so keep NACLs simple and use security groups for detail.',
    },
    'VPC endpoint / PrivateLink': {
      eli5: 'A private corridor from your building straight into the bank next door, so you never step onto the busy road.',
      industry: [
        'Free gateway endpoints for S3 and DynamoDB that keep traffic off the NAT gateway.',
        'Interface endpoints for ECR, Secrets Manager, SQS and STS inside private subnets.',
        'SaaS vendors exposing their service to customer VPCs over PrivateLink.',
      ],
      def: 'VPC endpoints let resources in private subnets reach AWS services without an internet gateway or NAT. Gateway endpoints (S3, DynamoDB) are route-table entries with no charge; interface endpoints (PrivateLink) put an ENI with a private IP in your subnet and bill per hour and per GB. PrivateLink also exposes your own service privately to other VPCs or accounts.',
      scenarios: [
        'Large S3 or ECR traffic is inflating NAT gateway bills',
        'Regulations say traffic to AWS services must not cross the internet',
        'Sharing one internal service with other VPCs without peering whole networks',
      ],
      scale: 'Gateway endpoints are free; interface endpoints cost per AZ per hour, so add them for services you actually call heavily.',
    },
    'SSM Session Manager': {
      eli5: 'Instead of leaving a back door open for the repair man, you give him a visitor pass at reception that is logged and expires when he leaves.',
      industry: [
        'Shell access to private EC2 instances with no inbound port 22 open at all.',
        'IAM-controlled access with every session logged to CloudWatch or S3 for audit.',
        'Replacing a bastion (jump) host and its shared SSH keys.',
      ],
      def: 'AWS Systems Manager Session Manager gives browser or CLI shell access to instances through the SSM agent, which makes outbound connections to the SSM service. No bastion host, no open inbound ports, no SSH keys to rotate; access is granted by IAM and sessions can be recorded. A bastion host is the older pattern: a hardened public instance you SSH through.',
      scenarios: [
        'Engineers need emergency access to private servers',
        'Auditors want every admin session logged',
        'You want to close port 22 everywhere',
      ],
      scale: 'Needs the SSM agent and an instance role; private-only subnets need SSM interface endpoints or NAT for the agent to connect.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick([2, 3]);
      return {
        q: `A food-delivery startup is laying out its VPC in Mumbai across ${n} AZs. Customers must reach the app over HTTPS through a load balancer. Where should the load balancer live?`,
        answer: 'Public subnet + internet gateway',
        hint: 'What makes a subnet reachable from the internet?',
        steps: ['The load balancer is the only thing customers should reach directly.', 'It needs subnets whose route table points to an internet gateway.', 'One public subnet per AZ for resilience; app servers stay private.', 'Public subnet + internet gateway.'],
        followups: [
          { q: 'What actually makes a subnet “public” in AWS?', options: ['Its route table has a 0.0.0.0/0 route to an internet gateway', 'Its name contains “public”', 'It has a larger CIDR block', 'It is in the first AZ'], why: 'Public vs private is purely a routing decision.' },
          { q: 'A subnet lives in how many Availability Zones?', options: ['Exactly one; a VPC spans all AZs in its Region', 'All AZs in the Region', 'Two', 'Any number'], why: 'High availability needs subnets in multiple AZs.' },
        ],
      };
    },
    (pick) => {
      const api = pick(['Razorpay', 'an SMS gateway', 'a GST verification API']);
      return {
        q: `Order-service instances must call ${api} on the internet, but security policy says no app server may have a public IP or be reachable from outside.`,
        answer: 'Private subnet + NAT gateway',
        hint: 'Outbound yes, inbound no.',
        steps: ['App servers go in private subnets with no public IPs.', 'Outbound internet calls go through a NAT gateway in a public subnet.', 'Return traffic flows back; unsolicited inbound is impossible.', 'Private subnet + NAT gateway.'],
        followups: [
          { q: 'With one NAT gateway in AZ-a, what happens to private instances in AZ-b if AZ-a fails?', options: ['They lose outbound internet access; use a NAT gateway per AZ (or a regional NAT gateway)', 'Nothing, NAT gateways span all AZs automatically in that setup', 'They get public IPs', 'Traffic moves to the internet gateway'], why: 'A zonal NAT gateway is a single-AZ dependency.' },
        ],
      };
    },
    () => ({
      q: 'A Postgres RDS instance should accept connections only from the 12 application instances behind the ALB. Those instances scale in and out every day, so their IPs keep changing.',
      answer: 'Security group',
      hint: 'A rule that follows the instances, not their IPs.',
      steps: ['IP-based rules break as instances change.', 'Give the app tier a security group.', 'Allow 5432 on the database security group only from the app security group.', 'Security group.'],
      followups: [
        { q: 'Security groups are stateful. What does that mean?', options: ['If inbound traffic is allowed, the reply is automatically allowed out', 'Each rule stores a database row', 'They remember IPs forever', 'They block return traffic'], why: 'NACLs, being stateless, need explicit rules both ways.' },
        { q: 'Can a security group contain a deny rule?', options: ['No, security groups only have allow rules', 'Yes, deny rules are evaluated first', 'Only for IPv6', 'Only on RDS'], why: 'For explicit denies, use a network ACL (or AWS WAF at L7).' },
      ],
    }),
    (pick) => {
      const cidr = pick(['203.0.113.0/24', '198.51.100.0/24', '192.0.2.0/24']);
      return {
        q: `During a scraping attack, the security team wants to block all traffic from ${cidr} to every resource in two public subnets immediately, regardless of individual instance settings.`,
        answer: 'Network ACL',
        hint: 'You need an explicit deny at the subnet level.',
        steps: ['Security groups can’t express deny rules.', 'A NACL applies to the whole subnet and supports deny.', 'Add a low-numbered deny rule for the range.', 'Network ACL.'],
        followups: [
          { q: 'After tightening a custom NACL, outbound replies to clients break. Why?', options: ['NACLs are stateless: you must allow return traffic on ephemeral ports explicitly', 'The internet gateway is down', 'Security groups override NACLs', 'DNS stopped working'], why: 'Forgetting ephemeral ports is the classic NACL mistake.' },
        ],
      };
    },
    (pick) => {
      const tb = pick([20, 40, 80]);
      return {
        q: `A video-analytics company moves about ${tb} TB a month between EKS pods in private subnets and S3. The NAT gateway data-processing line is now one of the biggest items on the AWS bill.`,
        answer: 'VPC endpoint / PrivateLink',
        hint: 'Reach S3 without going through NAT.',
        steps: ['S3 traffic currently flows through the NAT gateway and is charged per GB.', 'An S3 gateway endpoint adds a private route to S3.', 'Gateway endpoints have no hourly or data charge.', 'VPC endpoint.'],
        followups: [
          { q: 'Gateway endpoint vs interface endpoint?', options: ['Gateway: route-table entry, only S3 and DynamoDB, free. Interface: ENI with private IP, many services, billed', 'Same thing', 'Interface is free, gateway is billed', 'Gateway endpoints need a NAT'], why: 'Use gateway endpoints for S3/DynamoDB first.' },
        ],
      };
    },
    (pick) => {
      const n = pick([15, 30, 60]);
      return {
        q: `A bank’s ${n} engineers SSH into private servers through a bastion host with shared keys. Auditors flag the open port 22, the key sprawl and the lack of session logs.`,
        answer: 'SSM Session Manager',
        hint: 'Access without open inbound ports or keys.',
        steps: ['The bastion is internet-facing and keys are hard to rotate.', 'Session Manager uses IAM for access and the SSM agent’s outbound connection.', 'Close port 22; log every session.', 'SSM Session Manager.'],
        followups: [
          { q: 'The instances are in subnets with no NAT and no internet. What else does Session Manager need?', options: ['Interface VPC endpoints for SSM services, plus an instance role', 'A public IP on each instance', 'Port 22 open to the internet', 'A bigger instance'], why: 'The agent must reach the SSM APIs somehow.' },
        ],
      };
    },
    () => ({
      q: 'Fifty partner banks need to call your loan-eligibility service from their own AWS accounts. You must not expose it to the internet or peer whole VPCs with overlapping CIDRs.',
      answer: 'VPC endpoint / PrivateLink',
      hint: 'Expose one service privately, not a whole network.',
      steps: ['Peering connects whole networks and fails with overlapping CIDRs.', 'Put the service behind an NLB and publish it as an endpoint service.', 'Each partner creates an interface endpoint in their VPC.', 'PrivateLink.'],
      followups: [
        { q: 'Why does PrivateLink tolerate overlapping CIDRs when VPC peering does not?', options: ['Consumers reach the service through an ENI in their own VPC, so no routes between the two networks are needed', 'It uses IPv6 only', 'It goes over the public internet', 'It merges the VPCs'], why: 'Traffic is one-way to a single service, not network-to-network.' },
      ],
    }),
  ],
});
