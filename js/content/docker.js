SG.add({
  id: 'docker',
  ref: 'N1 N2',
  section: 'Infra and cloud',
  title: 'Linux essentials and Docker',
  short: 'Docker',
  blurb: 'VMs vs containers, images vs containers, and where your data actually lives.',
  intro: 'Containers package an app with everything it needs and run it the same way on a laptop, a CI runner or a cloud server. Unlike virtual machines, they share the host’s Linux kernel, so they are small and start in seconds. Know the pieces: Dockerfile → image → registry → container, plus volumes for data that must survive.',
  options: {
    'Virtual machine': {
      eli5: 'Renting a whole separate flat in a building: your own kitchen, own walls, own locks. Very private, but it takes time and money to set up each one.',
      industry: [
        'EC2 instances and on-prem VMware hosts.',
        'Running different operating systems (Windows and Linux) on one physical server.',
        'Strong isolation for untrusted or multi-tenant workloads.',
      ],
      def: 'A hypervisor (bare-metal or hosted) slices one physical machine into several virtual machines, each with its own full guest OS and virtual hardware. Strong isolation and OS flexibility, but heavier (GBs) and slower to boot (minutes) than containers.',
      scenarios: [
        'You need a different OS or kernel than the host',
        'Strong isolation between tenants or untrusted code',
        'Legacy apps that expect a full machine',
      ],
      scale: 'Most containers in the cloud actually run on VMs; the two complement each other.',
    },
    'Container image': {
      eli5: 'A sealed recipe box: ingredients, steps and tools inside. Anyone with a kitchen can cook the exact same dish from it.',
      industry: [
        'Spring Boot app images built from a Dockerfile in CI.',
        'Small base images like Alpine or distroless to reduce size and attack surface.',
        'Images pushed to Docker Hub, ECR or GHCR and pulled by servers.',
      ],
      def: 'A read-only, layered blueprint containing a minimal OS userland, your app, its dependencies and config, built from a Dockerfile. Stored and versioned in a registry. Many containers can run from the same image; tags identify versions.',
      scenarios: [
        'Making builds reproducible across laptops, CI and production',
        '“Works on my machine” bugs from different environments',
        'Shipping a versioned artifact to many servers',
      ],
      scale: 'Layer ordering matters: copy dependency files before source code so rebuilds reuse cached layers.',
    },
    'Running container': {
      eli5: 'A dish cooked from the recipe box. You can cook ten plates from the same box, and each plate can be eaten or thrown away without touching the box.',
      industry: [
        'docker run / Kubernetes pods running app instances.',
        'Horizontal scaling by starting more containers from one image.',
        'Ephemeral containers replaced on every deploy.',
      ],
      def: 'A running, isolated process created from an image, sharing the host kernel (isolation via namespaces and cgroups) with its own thin writable layer. Starts in seconds and is disposable: anything written inside is lost when the container is removed.',
      scenarios: [
        'Running many isolated instances of the same service',
        'Fast scale-out and replacement',
        'Packaging microservices with different dependencies on one host',
      ],
      scale: 'Treat containers as cattle, not pets: never rely on data inside them.',
    },
    'Volume': {
      eli5: 'A locker outside the kitchen. Whatever you put in the locker is still there after the dish is finished and the plate is thrown away.',
      industry: [
        'Postgres or MySQL containers storing data on a mounted volume.',
        'Kubernetes PersistentVolumes backed by EBS or network disks.',
        'Shared upload folders mounted into containers (better: object storage).',
      ],
      def: 'Storage managed outside the container’s lifecycle and mounted into it. Data in a volume survives container restarts, upgrades and removal. Required for databases or anything stateful running in containers.',
      scenarios: [
        'Running a database in a container',
        'Data must survive redeploys',
        'Sharing files between a container and the host',
      ],
      scale: 'Stateless app containers shouldn’t need volumes; put durable data in managed databases or object storage.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick([4, 6, 8]);
      return {
        q: `A team of ${n} developers keeps hitting “works on my machine”: different JDK versions, OS libraries and config cause bugs that only appear in production.`,
        answer: 'Container image',
        hint: 'Package the environment with the app.',
        steps: ['Environments differ between laptops, CI and production.', 'Build one image containing the runtime, dependencies and app.', 'Run the same image everywhere.', 'Container image.'],
        followups: [
          { q: 'Why copy pom.xml (or build.gradle) and download dependencies before copying the source code in a Dockerfile?', options: ['Dependency layers stay cached when only source code changes, so rebuilds are much faster', 'Docker requires it', 'It makes the image encrypted', 'It reduces runtime memory'], why: 'Layer caching works top-down; put rarely changing steps first.' },
        ],
      };
    },
    () => ({
      q: 'A security team needs to run customer-provided code from many companies on the same physical servers, with the strongest practical isolation, and some customers need Windows.',
      answer: 'Virtual machine',
      hint: 'Different OSes and strong isolation.',
      steps: ['Containers share the host kernel: weaker isolation and Linux-only on a Linux host.', 'Each VM has its own kernel and OS.', 'Untrusted, multi-OS workloads favour VMs (or micro-VMs).', 'Virtual machine.'],
      followups: [
        { q: 'Main reason containers start faster than VMs?', options: ['They don’t boot a full guest OS; they share the host kernel', 'They use more RAM', 'They skip networking', 'They run in the browser'], why: 'No OS boot means seconds instead of minutes.' },
      ],
    }),
    (pick) => {
      const n = pick([10, 20, 50]);
      return {
        q: `Traffic spikes during a sale, and you need ${n} identical instances of the order service within a minute, then scale back down after.`,
        answer: 'Running container',
        hint: 'Many disposable instances from one blueprint.',
        steps: ['One image, many instances.', 'Containers start in seconds.', 'Disposable: add or remove freely behind a load balancer.', 'Running containers.'],
        followups: [
          { q: 'A container writes uploaded files to its own filesystem, then gets replaced on deploy. What happens to the files?', options: ['They’re lost: the container’s writable layer is deleted with it', 'They move to the new container', 'They’re saved to the image', 'They go to Docker Hub'], why: 'Use volumes or object storage for anything that must persist.' },
        ],
      };
    },
    () => ({
      q: 'You run PostgreSQL in a Docker container for a small internal tool. After an upgrade the container was recreated and every table was empty.',
      answer: 'Volume',
      hint: 'Where did the data live?',
      steps: ['Data lived in the container’s writable layer.', 'Recreating the container deleted it.', 'Mount a volume at the database’s data directory.', 'Volume.'],
      followups: [
        { q: 'For production data, what’s usually better than a database in a container on one VM?', options: ['A managed database (RDS, Cloud SQL) with backups and replicas', 'More containers', 'Storing data in the image', 'A bigger writable layer'], why: 'Stateful services need durability features containers don’t provide alone.' },
      ],
    }),
    (pick) => {
      const s = pick(['1.2 GB', '900 MB', '2 GB']);
      return {
        q: `The app image is ${s} because it’s built on a full OS image with compilers and build tools. Pulls are slow on every deploy and the security scanner reports hundreds of vulnerabilities.`,
        answer: 'Container image',
        hint: 'Shrink what you ship.',
        steps: ['The image carries build tools it doesn’t need at runtime.', 'Use a multi-stage build: compile in one stage, copy only the jar into a slim runtime image.', 'Smaller image: faster pulls, fewer vulnerabilities.', 'Fix the container image.'],
        followups: [
          { q: 'Image vs container in one line?', options: ['Image = read-only blueprint; container = a running instance of it with its own writable layer', 'They’re the same', 'Container = blueprint; image = running', 'Image = a VM'], why: 'A basic but frequently asked distinction.' },
        ],
      };
    },
  ],
});
