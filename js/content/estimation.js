(() => {
  // Two significant figures, as you'd say it in an interview: 11,574 -> "12K".
  const short = (n, units) => {
    let i = 0;
    while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
    return `${parseFloat(n.toPrecision(2))}${units[i]}`;
  };
  const num = (n) => short(n, ['', 'K', 'M', 'B', 'T']);
  const bytes = (n) => short(n, [' B', ' KB', ' MB', ' GB', ' TB', ' PB', ' EB']);
  // Correct value plus distractors, each with the mistake it represents. Duplicates (after rounding) are dropped.
  const mcq = (fmt, correct, wrongs) => {
    const choices = [fmt(correct)];
    const misses = {};
    for (const [v, why] of wrongs) {
      const s = fmt(v);
      if (!choices.includes(s) && choices.length < 4) { choices.push(s); misses[s] = why; }
    }
    return { answer: fmt(correct), choices, misses };
  };

  SG.add({
    id: 'estimation',
    ref: 'C1 C2 C3 C4 C5 C6',
    section: 'Foundations',
    title: 'Back-of-the-envelope estimation',
    short: 'Estimation',
    blurb: 'Turn “100 million users” into requests per second, terabytes and servers in under two minutes.',
    intro: 'Interviewers don’t want exact numbers. They want the right order of magnitude, fast, with assumptions said out loud. Round aggressively: a day is ~100K seconds (86,400), a year ~400 days, 1 KB ≈ 1,000 bytes.',
    options: {
      'QPS': {
        eli5: 'If 1,000 people each ring a shop’s bell 10 times a day, how many rings per second does the shopkeeper hear? Total rings ÷ seconds in a day.',
        industry: [
          'Capacity planning before sales events starts from expected daily users and actions.',
          'Interview HLD rounds expect QPS in the first 5 minutes to justify every later choice.',
          'Peak is typically 2–10x the average (evening peaks, flash sales, IPL finals).',
        ],
        def: 'Average QPS = daily active users × requests per user per day ÷ 86,400 (≈ 100K). Peak QPS = average × peak factor. Split reads and writes, since they scale differently.',
        scenarios: [
          'Deciding whether one database can take the write load',
          'Sizing servers and caches for peak traffic',
          'Comparing read QPS vs write QPS to choose a design',
        ],
        scale: 'Rules of thumb: one app server ~1K–10K simple req/s; one Postgres primary ~a few thousand writes/s; Redis ~100K ops/s per node.',
      },
      'Storage': {
        eli5: 'If you add 10 photos to your album every day, how many albums do you need in 5 years? Per day × days × years.',
        industry: [
          'Photo and video apps plan storage tiers (hot SSD vs cheap object storage) from yearly growth.',
          'Chat apps estimate message storage to decide on Cassandra vs a relational database.',
          'Retention policies (delete after N days) cap storage costs.',
        ],
        def: 'Storage = new items per day × size per item × 365 × years (× replication factor if asked). Separate metadata (small, in a database) from media (large, in object storage).',
        scenarios: [
          'Choosing a database or sharding plan from data size',
          'Deciding hot vs cold storage',
          'Estimating cloud storage cost',
        ],
        scale: 'Useful anchors: a text message ~100 bytes, a tweet with metadata ~1 KB, a photo ~200 KB–2 MB, a minute of HD video ~50–100 MB.',
      },
      'Bandwidth': {
        eli5: 'How wide the road must be: cars per second × how big each car is.',
        industry: [
          'Video platforms estimate egress bandwidth to budget CDN costs.',
          'Network cards and load balancers have throughput limits in Gbps.',
          'Mobile apps compress images to cut bandwidth per request.',
        ],
        def: 'Bandwidth = QPS × average response (or upload) size. Usually given in bytes/s; networks are quoted in bits/s (multiply bytes by 8).',
        scenarios: [
          'Estimating CDN or egress cost',
          'Checking whether one server’s network card is a bottleneck',
          'Deciding to compress, paginate or resize payloads',
        ],
        scale: 'A 10 Gbps NIC moves ~1.25 GB/s. Media-heavy systems are usually bandwidth-bound before CPU-bound.',
      },
      'Servers and memory': {
        eli5: 'If one cashier can serve 100 customers a minute and 1,000 arrive, you need 10 cashiers. And the most popular 20% of snacks go at the front counter.',
        industry: [
          'Teams size fleets from peak QPS ÷ per-server capacity, plus headroom.',
          'The 80/20 rule: about 20% of items get 80% of reads, so caching 20% captures most traffic.',
          'Redis cluster sizing starts from cache memory estimates.',
        ],
        def: 'Servers ≈ peak QPS ÷ QPS per server (then add headroom and redundancy). Cache memory ≈ 20% of daily unique items × item size.',
        scenarios: [
          'Answering “how many servers do you need?”',
          'Sizing a cache cluster',
          'Explaining why caching a small hot set is enough',
        ],
        scale: 'Always add redundancy (N+1, multiple zones) on top of the raw number.',
      },
    },
    scenarios: [
      (pick) => {
        const dau = pick([10e6, 50e6, 100e6, 200e6]);
        const r = pick([5, 10, 20]);
        const avg = (dau * r) / 86400;
        return {
          q: `${num(dau)} daily active users each make ${r} requests per day. What is the average QPS?`,
          ...mcq(num, avg, [
            [(dau * r) / 3600, 'You divided by seconds in an hour (3,600). A day has 86,400 seconds.'],
            [dau / 86400, `You forgot the ${r} requests per user.`],
            [avg * 100, 'Too big by 100x. Recheck: users × requests ÷ 86,400.'],
            [avg / 100, 'Too small by 100x. Recheck the multiplication.'],
          ]),
          hint: 'Users × requests per user ÷ seconds in a day (~100K).',
          steps: [`Requests per day = ${num(dau)} × ${r} = ${num(dau * r)}.`, 'Seconds per day ≈ 86,400 (round to 100K for speed).', `${num(dau * r)} ÷ 86,400 ≈ ${num(avg)} QPS.`],
          followups: [
            { q: 'Why must you also estimate peak, not just average?', options: ['Systems fail at peak; evening or sale traffic can be 2–10x average', 'Average is always wrong', 'Peak is only for databases', 'Interviewers never ask about peak'], why: 'Capacity is sized for the worst hour, not the average one.' },
          ],
        };
      },
      (pick) => {
        const avg = pick([4000, 12000, 30000]);
        const f = pick([3, 5]);
        return {
          q: `Average traffic is ${num(avg)} QPS. Evening peak is ${f}x the average. What peak QPS should you design for?`,
          ...mcq(num, avg * f, [
            [avg, 'That’s the average. Systems must survive the peak.'],
            [avg * f * 10, 'Too big by 10x.'],
            [avg / f, 'You divided instead of multiplying.'],
          ]),
          hint: 'Average × peak factor.',
          steps: [`Peak = ${num(avg)} × ${f}.`, `= ${num(avg * f)} QPS.`, 'Design (and load test) for this, plus headroom.'],
          followups: [
            { q: 'Reads are 100x writes. How does that change your design?', options: ['Optimise reads: caches and read replicas; writes can stay on one primary longer', 'Shard writes immediately', 'Nothing changes', 'Use only NoSQL'], why: 'The read:write ratio decides whether you scale reads (cache, replicas) or writes (sharding, queues).' },
          ],
        };
      },
      (pick) => {
        const p = pick([1e6, 5e6, 10e6]);
        const s = pick([200e3, 500e3, 2e6]);
        const y = 5;
        const total = p * s * 365 * y;
        return {
          q: `Users upload ${num(p)} photos per day, ${bytes(s)} each on average. How much storage do you need for ${y} years (ignore replication)?`,
          ...mcq(bytes, total, [
            [p * s, 'That’s one day. Multiply by 365 × 5.'],
            [p * s * 365, 'That’s one year. The question asks for 5.'],
            [total * 1000, 'Too big by 1,000x. Check KB vs MB.'],
          ]),
          hint: 'Per day × 365 × years.',
          steps: [`Per day: ${num(p)} × ${bytes(s)} = ${bytes(p * s)}.`, `Per year: × 365 ≈ ${bytes(p * s * 365)}.`, `${y} years: ≈ ${bytes(total)}.`],
          followups: [
            { q: 'Where do the photos and their metadata go?', options: ['Photos in object storage (S3) behind a CDN; metadata (owner, URL, time) in a database', 'Everything in MySQL as BLOBs', 'Photos on the app servers’ disks', 'Everything in Redis'], why: 'Separating large blobs from small metadata is a standard HLD move.' },
          ],
        };
      },
      (pick) => {
        const q = pick([2000, 5000, 10000]);
        const s = pick([100e3, 500e3, 1e6]);
        const bw = q * s;
        return {
          q: `An image API serves ${num(q)} requests/s with an average response of ${bytes(s)}. What outbound bandwidth is needed, in bytes per second?`,
          ...mcq((v) => bytes(v) + '/s', bw, [
            [bw * 8, 'That’s bits, not bytes (you multiplied by 8).'],
            [bw / 1000, 'Too small by 1,000x. Check the size units.'],
            [bw * 60, 'That’s per minute, not per second.'],
          ]),
          hint: 'QPS × response size.',
          steps: [`${num(q)} × ${bytes(s)}.`, `≈ ${bytes(bw)}/s.`, `In network terms that’s about ${bytes(bw * 8).replace('B', 'b')}ps.`],
          followups: [
            { q: 'Bandwidth is your biggest cost. Cheapest big win?', options: ['Serve resized/compressed images (WebP) through a CDN', 'Buy faster servers', 'Add read replicas', 'Use HTTP/1.1'], why: 'Smaller payloads plus edge caching cut both latency and egress cost.' },
          ],
        };
      },
      (pick) => {
        const n = pick([10e6, 50e6, 100e6]);
        const s = pick([1e3, 5e3, 10e3]);
        const mem = 0.2 * n * s;
        return {
          q: `${num(n)} unique items are read each day, ${bytes(s)} each. Using the 80/20 rule, how much cache memory should you plan?`,
          ...mcq(bytes, mem, [
            [n * s, 'That caches 100% of items. The 80/20 rule says ~20% covers most reads.'],
            [0.02 * n * s, 'That’s 2%, not 20%.'],
            [mem * 365, 'That’s a year of daily caches. Cache the daily hot set.'],
          ]),
          hint: '20% of the daily items × item size.',
          steps: ['About 20% of items get 80% of reads.', `20% × ${num(n)} = ${num(0.2 * n)} items.`, `× ${bytes(s)} ≈ ${bytes(mem)}.`],
          followups: [
            { q: 'The estimate is 400 GB but one Redis node has 64 GB. What now?', options: ['Shard the cache across a Redis cluster (several nodes)', 'Use disk instead', 'Cache 64 GB and ignore the rest', 'Give up on caching'], why: 'Distributed caches split keys across nodes, usually with consistent hashing.' },
          ],
        };
      },
      (pick) => {
        const peak = pick([30000, 60000, 120000]);
        const cap = pick([500, 1000, 2000]);
        const n = Math.ceil(peak / cap);
        return {
          q: `Peak traffic is ${num(peak)} QPS. Load tests show one app server handles ${num(cap)} QPS. How many servers before redundancy?`,
          ...mcq(num, n, [
            [n * 10, 'Too many by 10x.'],
            [Math.max(1, Math.round(n / 10)), 'Too few by 10x.'],
            [peak, 'That’s the QPS, not a server count.'],
          ]),
          hint: 'Peak QPS ÷ QPS per server.',
          steps: [`${num(peak)} ÷ ${num(cap)}.`, `= ${num(n)} servers.`, 'Then add headroom (~30%) and spread across availability zones.'],
          followups: [
            { q: 'Why add servers beyond the raw number?', options: ['Headroom for spikes and redundancy for failures/deploys (N+1, multiple zones)', 'Servers are cheap, so always double', 'Load balancers need an even number', 'No reason'], why: 'Running at 100% means any failure or spike becomes an outage.' },
          ],
        };
      },
    ],
  });
})();
