SG.add({
  id: 'storage-types',
  ref: 'F16 F17 F19 F20 V2',
  section: 'Data and storage',
  title: 'Object, block and file storage; OLTP vs OLAP',
  short: 'Storage types',
  blurb: 'Where large files, disks, shared folders and analytics data really belong.',
  intro: 'A database row is the wrong home for a 4 MB photo, and a transactional database is the wrong engine for scanning a billion rows. Pick storage by object size, access pattern and who reads it.',
  options: {
    'Object storage': {
      eli5: 'A huge warehouse with numbered lockers. You hand over a box and get a locker number; anyone with the number can collect it. You can’t edit what’s inside, only replace the box.',
      industry: [
        'Photos, videos and documents on Instagram, YouTube and Dropbox live in S3/GCS-style stores.',
        'Static website assets, logs, backups and ML training data.',
        'S3 is designed for 99.999999999% (11 nines) durability.',
      ],
      def: 'Stores immutable blobs by key in a flat namespace (folders are just name prefixes), replicated or erasure-coded across racks and zones. Accessed over HTTP. Patterns: metadata + URL in your database; pre-signed URLs for direct client upload/download; multipart upload for large files (S3: 5 MB minimum parts, up to 5 TB per object).',
      scenarios: [
        'Large, mostly static files: media, documents, backups, logs',
        'Clients upload or download big files without passing through your servers',
        'Cheap, extremely durable storage at any scale',
      ],
      scale: 'Practically unlimited and cheap. Not for frequent small in-place edits or queries: keep searchable metadata in a database.',
    },
    'Block storage': {
      eli5: 'A blank hard disk plugged into one computer. The computer formats it and decides how to arrange everything on it.',
      industry: [
        'AWS EBS volumes attached to EC2 instances.',
        'Database data directories (Postgres, MySQL) on SSD volumes.',
        'Boot disks for virtual machines.',
      ],
      def: 'Raw fixed-size blocks presented as a disk to one machine, which puts a filesystem or database on top. Lowest latency and supports in-place random writes. Usually attached to a single instance at a time.',
      scenarios: [
        'A database’s data files',
        'Low-latency random reads and writes',
        'Operating system and application disks',
      ],
      scale: 'Size and IOPS are provisioned per volume. Not shareable across many servers like object or file storage.',
    },
    'File storage': {
      eli5: 'A shared network drive in an office. Everyone sees the same folders and files and can open them at the same time.',
      industry: [
        'AWS EFS, Azure Files and NFS shares mounted by many servers.',
        'Legacy apps that expect a shared POSIX filesystem.',
        'Shared content directories for CMS and media processing.',
      ],
      def: 'A hierarchical filesystem (folders, paths, permissions, locking) shared over the network by many machines at once (NFS/SMB). Supports in-place edits and familiar file APIs.',
      scenarios: [
        'Several servers need the same files with normal file paths',
        'Lift-and-shift of apps that write to local folders',
        'Shared working directories for batch or media jobs',
      ],
      scale: 'More expensive than object storage and harder to scale to billions of files; prefer object storage for new web apps.',
    },
    'Column store (OLAP)': {
      eli5: 'Instead of filing each student’s full report card together, you file all maths marks together, all science marks together. Averaging the maths marks of 10,000 students becomes one quick sweep.',
      industry: [
        'Snowflake, BigQuery, Redshift and ClickHouse for analytics.',
        'Parquet files in data lakes on S3.',
        'Business dashboards over billions of rows.',
      ],
      def: 'Stores each column’s values together instead of each row’s. Queries read only needed columns; similar values compress extremely well (run-length, dictionary encoding); per-chunk min/max lets queries skip data (predicate pushdown). OLAP = analytics over many rows; OLTP = many small transactions.',
      scenarios: [
        'Aggregations (sum, avg, count) over huge tables',
        'Reporting and BI that shouldn’t slow down production',
        'Data warehouses and lakes fed by ETL/ELT or CDC',
      ],
      scale: 'Scans billions of rows fast; slow for single-row lookups and frequent updates. Keep OLTP and OLAP separate.',
    },
  },
  scenarios: [
    (pick) => {
      const what = pick(['4 MB profile photos', 'PDF invoices', '50 MB voice notes']);
      return {
        q: `A team stores ${what} as BLOB columns in the users table. Queries listing users are slow, replicas lag, and restoring last night’s backup took 6 hours.`,
        answer: 'Object storage',
        hint: 'Large files are bloating everything the database does.',
        steps: ['Large blobs inflate pages, replication and backups.', 'Move files to object storage.', 'Keep metadata and the object’s URL/key in the database.', 'Object storage.'],
        followups: [
          { q: 'How should a mobile client upload a 200 MB video without it passing through your API servers?', options: ['Server issues a pre-signed URL; client uploads directly (multipart for large files)', 'Base64 it into a JSON request', 'FTP to the app server', 'Store it in Redis first'], why: 'Pre-signed URLs keep heavy bandwidth off your servers while staying secure.' },
          { q: 'Where should the photo’s owner, caption and upload time live?', options: ['In the database, alongside the object’s key/URL', 'Inside the image file', 'Only in object storage metadata', 'In the CDN'], why: 'Metadata must be queryable; object stores aren’t databases.' },
        ],
      };
    },
    () => ({
      q: 'You’re self-hosting PostgreSQL on a cloud VM. Its data directory needs low-latency random reads and writes on a disk attached to that one machine.',
      answer: 'Block storage',
      hint: 'A disk for a single server, edited in place.',
      steps: ['Databases rewrite pages in place.', 'They need low-latency random I/O.', 'A disk volume attached to one machine.', 'Block storage (e.g. EBS).'],
      followups: [
        { q: 'Why not run Postgres directly on S3?', options: ['Objects are immutable and accessed over HTTP; databases need fast in-place block writes', 'S3 is too small', 'S3 is not durable', 'Postgres forbids it'], why: 'Object storage can’t modify bytes in the middle of a file.' },
      ],
    }),
    (pick) => {
      const n = pick([4, 6, 10]);
      return {
        q: `A legacy CMS writes uploaded images to /var/www/uploads. You’re scaling it to ${n} servers and can’t rewrite the code yet; all servers must see the same files at the same path.`,
        answer: 'File storage',
        hint: 'Many servers, one shared folder, no code changes.',
        steps: ['The app expects a normal filesystem path.', 'All servers must share it.', 'Mount a network filesystem on every server.', 'File storage (NFS/EFS).'],
        followups: [
          { q: 'What’s the long-term better design for a web app?', options: ['Move uploads to object storage behind a CDN and store URLs in the database', 'Keep adding NFS servers', 'Copy files to every server nightly', 'Store files in the session'], why: 'File shares are a migration bridge; object storage + CDN is the scalable target.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['2 billion', '5 billion', '10 billion']);
      return {
        q: `Analysts run “total revenue by city by month” over ${n} order rows. Running it on the production Postgres takes 40 minutes and slows checkout.`,
        answer: 'Column store (OLAP)',
        hint: 'Aggregating a few columns over a huge number of rows.',
        steps: ['Analytics scans a few columns across billions of rows.', 'Row storage reads every column of every row.', 'Column stores read only needed columns, compressed.', 'Move it to an OLAP column store/warehouse.'],
        followups: [
          { q: 'How does data get from Postgres into the warehouse without slowing production?', options: ['CDC or batch ETL/ELT from a replica into the warehouse', 'Analysts query production at night', 'Dual-write from the app', 'Copy-paste exports'], why: 'Separate OLTP and OLAP, connected by a pipeline.' },
          { q: 'Why do column stores compress so well?', options: ['Values in one column are similar, so run-length and dictionary encoding shrink them', 'They store less data', 'They delete old rows', 'They use bigger disks'], why: 'Similar adjacent values compress far better than mixed row data.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['application logs', 'nightly database backups', 'ML training datasets']);
      return {
        q: `You must keep ${what}: terabytes per month, written once, read rarely, and they must survive the loss of a whole data centre at the lowest cost.`,
        answer: 'Object storage',
        hint: 'Write once, read rarely, huge, cheap, durable.',
        steps: ['Immutable, large, rarely read.', 'Needs multi-zone durability.', 'Cost matters most.', 'Object storage (with cheaper archive tiers).'],
        followups: [
          { q: 'How do you cut cost for data rarely read after 30 days?', options: ['Lifecycle rules moving objects to infrequent-access/archive tiers', 'Delete it immediately', 'Move it to block storage', 'Compress it into the database'], why: 'Storage classes and lifecycle policies are a standard cost lever.' },
        ],
      };
    },
    () => ({
      q: 'Finance must report on 7 years of orders (billions of rows) for audits, while the production database should keep only recent, active orders small and fast.',
      answer: 'Column store (OLAP)',
      hint: 'Long-term analytical history versus hot transactional data.',
      steps: ['Recent orders: OLTP database, kept lean.', 'Seven years of history for reports: analytical workload.', 'Feed history into a warehouse; archive old rows out of OLTP.', 'Column store (OLAP) for the reporting side.'],
      followups: [
        { q: 'What’s a soft delete?', options: ['Marking a row deleted (e.g. deleted_at) instead of removing it, so it can be restored or audited', 'Deleting slowly', 'Deleting from cache only', 'Moving the row to S3'], why: 'Soft deletes support undo and audit; remember to filter them out of normal queries.' },
        { q: 'You must add a NOT NULL column to a 500M-row table without downtime. Safest approach?', options: ['Add it nullable, backfill in batches, then add the constraint', 'ALTER TABLE with a default in one go at peak time', 'Drop and recreate the table', 'Stop the app for a day'], why: 'Zero-downtime migrations are done in small, reversible steps.' },
      ],
    }),
  ],
});
