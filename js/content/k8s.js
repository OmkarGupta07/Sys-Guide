SG.add({
  id: 'k8s',
  ref: 'N3 N4 N5 N6',
  section: 'Infra and cloud',
  title: 'Kubernetes',
  short: 'Kubernetes',
  blurb: 'Pods, Deployments, Services and autoscaling: how Kubernetes keeps your desired state true.',
  intro: 'Kubernetes runs containers across many machines. You declare the desired state (“3 replicas of this image, reachable at this name”), and the control plane (API server, scheduler, controllers, etcd) keeps reality matching it: restarting crashed pods, rescheduling from dead nodes, rolling out new versions and scaling with load.',
  options: {
    'Pod': {
      eli5: 'A lunchbox holding one meal (sometimes a meal plus a small side). Kubernetes moves and replaces whole lunchboxes, never individual items inside.',
      industry: [
        'One app container per pod, sometimes with a sidecar (Envoy, log shipper).',
        'Each pod gets its own IP on the cluster network.',
        'Liveness and readiness probes decide restarts and traffic.',
      ],
      def: 'The smallest deployable unit: one or more tightly coupled containers sharing network and storage, scheduled onto a node. Pods are ephemeral; they die and get replaced with new IPs, so nothing should depend on a specific pod.',
      scenarios: [
        'A main container plus a helper sidecar that must run together',
        'Health checks deciding when to restart or route traffic',
        'Understanding why pod IPs keep changing',
      ],
      scale: 'Don’t create bare pods in production; let a Deployment manage them.',
    },
    'Deployment': {
      eli5: 'A standing order to a catering company: “always keep 3 lunchboxes of this menu ready”. If one is dropped, they make another; if you change the menu, they swap boxes a few at a time.',
      industry: [
        'Stateless services declared as Deployments in YAML (or Helm charts).',
        'Rolling updates with maxSurge/maxUnavailable and instant rollback.',
        'StatefulSets for databases that need stable identities and storage.',
      ],
      def: 'A controller that maintains a desired number of identical pod replicas from a template and performs rolling updates and rollbacks. The controller manager continually compares desired vs actual state and fixes drift.',
      scenarios: [
        'Keeping N replicas running despite crashes and node failures',
        'Zero-downtime rolling updates and rollback',
        'Declaring infrastructure as version-controlled YAML',
      ],
      scale: 'Stateful workloads need StatefulSets and persistent volumes, not plain Deployments.',
    },
    'Service': {
      eli5: 'A restaurant’s fixed phone number. Waiters (pods) come and go every shift, but customers always call the same number and someone picks up.',
      industry: [
        'ClusterIP Services giving stable DNS names like payment-svc for internal calls.',
        'LoadBalancer Services and Ingress controllers exposing apps externally.',
        'Load balancing across all healthy pods matching a label selector.',
      ],
      def: 'A stable virtual IP and DNS name in front of a changing set of pods (selected by labels), load-balancing traffic across ready pods. Ingress adds HTTP routing (hosts, paths, TLS) from outside the cluster.',
      scenarios: [
        'Pods restart with new IPs and callers break',
        'Internal service-to-service discovery',
        'Exposing an app outside the cluster',
      ],
      scale: 'Readiness probes control which pods receive traffic; a failing pod is removed from the Service automatically.',
    },
    'Horizontal Pod Autoscaler': {
      eli5: 'A shop manager who watches the queue and calls in extra staff when it gets long, then sends them home when it’s quiet.',
      industry: [
        'HPA scaling on CPU, memory or custom metrics (requests/s, queue depth).',
        'Cluster Autoscaler / Karpenter adding nodes when pods can’t be placed.',
        'KEDA scaling consumers on Kafka or SQS backlog.',
      ],
      def: 'Automatically adjusts the replica count of a Deployment based on observed metrics against a target (e.g. 60% CPU). Works with the cluster autoscaler, which adds or removes nodes so new pods have room.',
      scenarios: [
        'Traffic varies a lot through the day',
        'Queue consumers should scale with backlog',
        'Avoiding paying for peak capacity all day',
      ],
      scale: 'Needs resource requests set on pods; reacts in tens of seconds to minutes, so pre-scale for known spikes.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick([3, 5, 10]);
      return {
        q: `You want ${n} replicas of the order service always running. When a node dies or a pod crashes, replacements should appear automatically, and new versions should roll out a few pods at a time.`,
        answer: 'Deployment',
        hint: 'Declare the desired state; a controller enforces it.',
        steps: ['Desired state: N replicas of an image.', 'A controller recreates missing pods.', 'Rolling updates and rollbacks built in.', 'Deployment.'],
        followups: [
          { q: 'Where does Kubernetes store the cluster’s desired and current state?', options: ['etcd, a consensus-based key-value store', 'In each pod', 'In Docker Hub', 'In the load balancer'], why: 'Backing up etcd backs up the cluster state.' },
        ],
      };
    },
    () => ({
      q: 'The checkout service calls the inventory service by pod IP. Every deploy or crash gives inventory pods new IPs, and checkout starts failing until someone updates the config.',
      answer: 'Service',
      hint: 'Callers need something stable in front of changing pods.',
      steps: ['Pod IPs are ephemeral.', 'A Service gives a stable name and IP.', 'It load-balances across ready pods matching labels.', 'Service.'],
      followups: [
        { q: 'How do you route shop.example.com/api to one Service and /images to another from outside?', options: ['An Ingress (L7 rules by host and path)', 'A bigger pod', 'A ConfigMap', 'etcd'], why: 'Ingress handles HTTP routing and TLS at the cluster edge.' },
      ],
    }),
    () => ({
      q: 'An app container needs a log-shipping helper and a local proxy that must always run alongside it, share its network namespace, and be scheduled together.',
      answer: 'Pod',
      hint: 'Tightly coupled containers scheduled as one unit.',
      steps: ['The helpers must live and die with the app.', 'Containers in one pod share network and volumes.', 'Main container + sidecars in one pod.', 'Pod.'],
      followups: [
        { q: 'A pod is running but still warming its caches. What stops traffic reaching it too early?', options: ['A readiness probe: until it passes, the Service doesn’t send traffic', 'A liveness probe', 'The scheduler', 'Nothing'], why: 'Liveness restarts unhealthy pods; readiness gates traffic.' },
      ],
    }),
    (pick) => {
      const x = pick([5, 8, 10]);
      return {
        q: `Evening traffic is ${x}x the morning load. Right now the service runs at peak size all day, wasting money, and still struggles on unexpected spikes.`,
        answer: 'Horizontal Pod Autoscaler',
        hint: 'Replica count should follow load.',
        steps: ['Load varies a lot.', 'HPA scales replicas on CPU or custom metrics.', 'Cluster autoscaler adds nodes when needed.', 'Horizontal Pod Autoscaler.'],
        followups: [
          { q: 'HPA does nothing: pods have no CPU requests set. Why does that matter?', options: ['HPA computes utilization relative to requests; without requests it can’t scale on CPU', 'It doesn’t matter', 'Requests disable networking', 'Requests are only for logs'], why: 'Set requests and limits on every container.' },
        ],
      };
    },
    () => ({
      q: 'Kafka consumers in Kubernetes fall behind every night when a batch job publishes 50 million events; CPU stays low because they mostly wait on I/O.',
      answer: 'Horizontal Pod Autoscaler',
      hint: 'Scale on the right signal, not CPU.',
      steps: ['CPU isn’t the bottleneck signal here.', 'Scale on consumer lag (custom/external metric, e.g. via KEDA).', 'More consumers up to the number of partitions.', 'Horizontal Pod Autoscaler on lag.'],
      followups: [
        { q: 'Is there a limit to how far Kafka consumers in one group can scale?', options: ['Yes: at most one active consumer per partition', 'No limit', 'Two per partition', 'Only one consumer total'], why: 'Extra consumers beyond the partition count sit idle.' },
      ],
    }),
  ],
});
