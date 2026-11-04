SG.add({
  id: 'prob-ds',
  ref: 'G2 G3 G4 G5',
  section: 'Distributed systems',
  title: 'Bloom filters, HyperLogLog, count-min, Merkle trees',
  short: 'Big-data structures',
  blurb: 'Trading a little accuracy for huge memory savings, and spotting differences between huge datasets cheaply.',
  intro: 'These structures earn points only when your estimates show a real space problem and the system can tolerate a small error. Don’t reach for them on small data; a HashSet is simpler and exact. Merkle trees are the exact one here: they find which parts of two huge datasets differ.',
  options: {
    'Bloom filter': {
      eli5: 'A bouncer with a list of initials only. If your initials aren’t on it, you’re definitely not invited. If they are, you’re probably invited, but sometimes two guests share initials.',
      industry: [
        'Web crawlers checking “have we crawled this URL?” for billions of URLs.',
        'Cassandra, HBase and RocksDB skip disk files that can’t contain a key.',
        'Chrome once used one to check URLs against a malicious-site list.',
      ],
      def: 'An approximate set: k hash functions set bits in an m-bit array. Answers “definitely not present” or “probably present” (false positives possible, never false negatives). Tiny memory compared with storing items; can’t list or (in the basic form) delete items.',
      scenarios: [
        'Membership checks over a huge set where memory is tight',
        'Skipping expensive lookups for items that definitely don’t exist',
        'A small false-positive rate is acceptable',
      ],
      scale: 'Roughly 10 bits per item gives ~1% false positives, whatever the item size.',
    },
    'HyperLogLog': {
      eli5: 'Guessing how many people visited a fair from the rarest lottery number anyone drew. Seeing a very rare number suggests many people came. Many small guesses averaged give a good estimate.',
      industry: [
        'Redis PFADD / PFCOUNT for unique visitors in ~12 KB per counter.',
        'Daily active users and unique viewers per video.',
        'Databases estimating column cardinality for query planning.',
      ],
      def: 'Estimates the number of distinct items (cardinality) using fixed, tiny memory: hash each item, track the maximum run of leading/trailing zeros in many registers, combine with a harmonic mean. Typical error ~1–2%. Counters can be merged (e.g. per-day into per-week).',
      scenarios: [
        'Count unique users/IPs/items at huge scale',
        'Approximate is fine (analytics, dashboards)',
        'Many counters (one per video/page) must fit in memory',
      ],
      scale: 'Memory stays constant no matter how many items. Can’t tell you which items, only how many.',
    },
    'Count-min sketch': {
      eli5: 'Several tally sheets with a few columns each; every name adds a mark in one column per sheet. To guess a name’s count, check all its columns and take the smallest: it might be a bit too high, never too low.',
      industry: [
        'Top-K / heavy hitters: trending hashtags, most-viewed products.',
        'Detecting abusive IPs in network traffic.',
        'Frequency estimates inside caches (e.g. TinyLFU admission).',
      ],
      def: 'Approximate counts in fixed memory: d rows of w counters, one hash per row; increment one counter per row; query = minimum across rows. Over-estimates only (collisions add), never under-estimates. Often paired with a min-heap to track top-K.',
      scenarios: [
        'Approximate frequency of items in a massive stream',
        'Top-K trending items',
        'Rate or abuse detection where exact per-key counters are too big',
      ],
      scale: 'Accuracy set by width and depth; the item list for top-K must be kept separately (e.g. a heap).',
    },
    'Merkle tree': {
      eli5: 'Comparing two huge photo albums by first comparing a single summary of each, then the summaries of each half, and so on, only opening the pages where summaries differ.',
      industry: [
        'Cassandra/Dynamo anti-entropy repair between replicas.',
        'Git commits and blockchains (Bitcoin) use hash trees.',
        'File sync and backup tools finding changed blocks.',
      ],
      def: 'A tree of hashes: leaves hash data blocks, parents hash their children, the root summarises everything. Two replicas compare roots; if equal, they’re identical; if not, they descend only into differing branches. Exact, unlike the others here.',
      scenarios: [
        'Find which parts of two large replicas differ',
        'Verify data integrity cheaply',
        'Sync only changed blocks',
      ],
      scale: 'Comparison cost is proportional to the number of differences × log(size), not the total size.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick(['1 billion', '5 billion']);
      return {
        q: `A web crawler must check “have we already crawled this URL?” for ${n} URLs. Storing all URLs in memory needs terabytes. Re-crawling a page occasionally is acceptable.`,
        answer: 'Bloom filter',
        hint: 'Membership, huge set, small error OK.',
        steps: ['Membership question over a huge set.', 'Memory is the constraint.', 'Occasional false positive just skips or re-checks a page.', 'Bloom filter (gigabytes instead of terabytes).'],
        followups: [
          { q: 'Which error can a Bloom filter make?', options: ['False positive: says “probably present” for an item never added', 'False negative: misses an added item', 'Both', 'Neither'], why: 'Bits only get set, never cleared, so added items are always found.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['10M', '50M']);
      return {
        q: `You need the number of unique viewers for each of ${n} videos, updated in real time. Keeping a set of user IDs per video would need far too much memory; ±2% is fine.`,
        answer: 'HyperLogLog',
        hint: 'Counting distinct items, tiny fixed memory.',
        steps: ['Distinct count, not total views.', 'Too many per-video sets for memory.', 'Fixed ~KB per counter with small error.', 'HyperLogLog (Redis PFADD/PFCOUNT).'],
        followups: [
          { q: 'Can you merge daily HyperLogLogs into a weekly unique count?', options: ['Yes: HLLs merge (PFMERGE) without double counting', 'No', 'Only by adding the numbers', 'Only for Mondays'], why: 'Mergeability is a key reason HLL is used in analytics.' },
        ],
      };
    },
    (pick) => {
      const k = pick([10, 20, 50]);
      return {
        q: `Show the top ${k} trending hashtags from a stream of 500K posts per second. Keeping an exact counter for every hashtag ever seen is too much memory; slight over-counting is fine.`,
        answer: 'Count-min sketch',
        hint: 'Approximate frequencies plus a top-K.',
        steps: ['Need frequencies, not membership or distinct counts.', 'Fixed-memory approximate counts.', 'Pair with a min-heap of the current top-K.', 'Count-min sketch.'],
        followups: [
          { q: 'Can a count-min sketch under-count an item?', options: ['No: collisions only add, so it over-estimates', 'Yes, often', 'Only for rare items', 'Only after deletes'], why: 'It returns an upper bound.' },
        ],
      };
    },
    (pick) => {
      const tb = pick([2, 5, 10]);
      return {
        q: `Two replicas each hold ${tb} TB. After a network glitch, a few thousand keys may differ. Copying everything to compare would take hours.`,
        answer: 'Merkle tree',
        hint: 'Compare summaries, descend only where they differ.',
        steps: ['Need exactly which ranges differ.', 'Hash trees summarise ranges.', 'Compare roots, descend into mismatched branches only.', 'Merkle tree.'],
        followups: [
          { q: 'Which well-known tool relies on hash trees to detect changes?', options: ['Git', 'Excel', 'Nginx', 'cron'], why: 'Commits, trees and blobs are content-addressed hashes.' },
        ],
      };
    },
    () => ({
      q: 'An LSM-tree database has dozens of SSTable files on disk. A lookup for a key that doesn’t exist would read every file. You want to skip files that can’t contain the key.',
      answer: 'Bloom filter',
      hint: '“Definitely not here” is exactly what’s needed.',
      steps: ['Each file gets a small in-memory filter.', 'If the filter says “not present”, skip the file.', 'False positives cost only an extra disk read.', 'Bloom filter per SSTable.'],
      followups: [
        { q: 'Your set has 50,000 items and plenty of RAM. Bloom filter?', options: ['No: a HashSet is exact and simple at this size', 'Yes, always', 'Use HyperLogLog', 'Use a Merkle tree'], why: 'Use approximations only when estimates show a real space problem.' },
      ],
    }),
  ],
});
