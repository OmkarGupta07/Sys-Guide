SG.add({
  id: 'case-airbnb',
  ref: 'S19',
  section: 'HLD case studies',
  title: 'Design Airbnb',
  short: 'Stay booking',
  blurb: 'Map search with filters over millions of homes, per-night calendars, and bookings that never overlap.',
  intro: 'Scope: hosts list homes with photos, prices and a calendar; guests search a map area or city for dates, guests and filters (price, amenities, type), view a listing, book and pay, and leave reviews after the stay. The NFRs split by feature: search and listing pages must be fast (map search under ~300 ms) and highly available, with seconds of staleness acceptable, while booking must be strongly consistent, so two guests never get the same night. Reads outnumber bookings by 100× or more. The usual design: listings in a relational source of truth replicated via CDC into Elasticsearch for geo + filter search; a per-night availability calendar; a short reservation hold plus a database constraint at booking; a pricing service that quotes nightly rates server-side; and reviews aggregated asynchronously.',
  options: {
    'Elasticsearch geo + filter search': {
      eli5: 'Instead of walking every lane of Goa to find a villa with a pool, you ask the tourist office. They keep cards sorted by area and tagged “pool”, “sea view”, “pets ok”, so they pull the right ten in seconds.',
      industry: [
        'Elasticsearch geo_point fields with geo_bounding_box (the map viewport) or geo_distance queries, combined with price ranges and amenity terms.',
        'Listings replicated from MySQL/Postgres via Kafka or Debezium CDC, so search never touches the booking database.',
        'Results ranked by a model (quality, price, conversion) after the filter step, as Airbnb’s search ranking does.',
      ],
      def: 'A B-tree on (lat, long) can only narrow one dimension, so a map query still scans a whole latitude band. A search engine indexes location (geohash/BKD tree) together with inverted indexes on amenities, type and text, so “homes in this map box, 4 guests, under ₹6,000, with Wi-Fi” is one fast query. The listings DB stays the source of truth and changes flow to the index asynchronously, so search is eventually consistent by design. Search returns candidates; the final availability and price are re-checked on the listing and booking path. At small scale, PostGIS plus Postgres full-text can do the same job.',
      scenarios: [
        '“Search this area” on a map with several filters must return in ~300 ms',
        'Search load must not slow down bookings',
        'Fuzzy text like “goa vila pool” must still match',
      ],
      scale: '~10M listings × a few KB is tens of GB, small for an Elasticsearch cluster; the load is query QPS, handled with replicas, sharding by region and caching popular areas.',
    },
    'Per-night availability calendar': {
      eli5: 'A wall calendar for each flat with one box per night. To check a five-night trip you look at five boxes; to block Diwali week the host just crosses out those boxes.',
      industry: [
        'A table calendar(listing_id, night, status, price) with primary key (listing_id, night).',
        'Hotels using (room_type_id, date, available_quantity) inventory rows, the multi-unit version of the same idea.',
        'Host-blocked nights and imported iCal calendars from other platforms written as blocked rows.',
      ],
      def: 'Model availability as one row per listing per night rather than only as booking ranges. Checking a stay is a fetch of N rows by primary key; blocking, custom nightly prices, minimum stays and imported calendars are just updates to those rows. A year of nights per listing is ~365 small rows, so 10M listings is a few billion rows, partitioned by listing. For search, the index carries a compact availability summary (for example blocked date ranges or a bitmap for the next 12 months) so it can filter by dates; the calendar remains the truth that booking checks.',
      scenarios: [
        'Search shows homes that are already booked for the chosen dates',
        'Hosts need to block nights and set different prices per night',
        'Checking a date range must be a quick indexed lookup',
      ],
      scale: '10M listings × 365 nights ≈ 3.65B rows of a few dozen bytes each: about 100–200 GB, fine when sharded by listing_id.',
    },
    'Reservation hold + DB constraint': {
      eli5: 'When you say “I’ll take this homestay”, the owner pencils your name on those nights for 15 minutes while you pay. The ink entry in the register is made only if nobody’s name is already there.',
      industry: [
        'A booking row in PENDING with expires_at, while calendar rows for those nights move to HELD in the same transaction.',
        'Postgres EXCLUDE USING gist (listing_id WITH =, stay WITH &&) on a daterange to forbid overlapping bookings.',
        'Hotel inventory updates with CHECK (available_quantity >= 0), so the last room can only be taken once.',
      ],
      def: 'When a guest clicks Reserve, one ACID transaction checks the nights are free and marks them held for this booking with an expiry (conditional update on each night, or a unique key on (listing_id, night)); concurrent attempts on any overlapping night fail cleanly. Payment happens during the hold; success confirms the booking, failure or expiry releases the nights. Expired holds are treated as free at read time, with a sweeper cleaning up, so correctness doesn’t depend on a timer firing exactly. The constraint is the real guarantee; any Redis lock in front is only a fast path.',
      scenarios: [
        'Two guests try to book overlapping dates for the same home',
        'A guest needs several minutes to pay without losing the dates',
        'Abandoned checkouts must release nights automatically',
      ],
      scale: 'Bookings are ~1% of traffic (hundreds to a few thousand per second globally); contention is per listing, so sharding by listing_id keeps transactions local and short.',
    },
    'Server-side price quote': {
      eli5: 'The tour operator writes the full price, taxes and all, on a slip with a stamp that says “valid for 30 minutes”. At the counter they honour the slip, not whatever number you say aloud.',
      industry: [
        'Nightly base price plus per-night overrides, weekend and length-of-stay discounts, cleaning fee, service fee and GST.',
        'Airbnb Smart Pricing suggesting rates from demand; hotels using price_min/price_max bands tuned by a model.',
        'A signed or stored quote_id with an expiry that the booking API accepts instead of a client-sent amount.',
      ],
      def: 'The total for a stay depends on each night’s rate, discounts, fees and taxes, and it can change as hosts edit prices. A pricing service computes the total from the calendar and fee rules and returns a quote with an ID and expiry; checkout and booking use that quote, and the booking stores the exact breakdown that was charged. The client never sends a price that the server trusts. Search shows a cached, approximate nightly price; the quote is the authoritative number.',
      scenarios: [
        'Guests see one price in search and a higher one at checkout',
        'A tampered request could submit its own total',
        'Hosts change prices often and per night',
      ],
      scale: 'Quote computation is a few dozen rows and rules, cheap per request; cache base prices in the search index and compute exact quotes only on listing and checkout pages.',
    },
    'Async review aggregation': {
      eli5: 'Guests drop feedback slips in a box. Once an hour the manager tallies them and updates the star rating painted on the signboard, instead of recounting every slip each time someone walks by.',
      industry: [
        'Reviews allowed only for completed stays, with guest and host reviews hidden until both submit or 14 days pass.',
        'A Kafka consumer keeping review_count and rating_sum per listing, idempotent by review ID.',
        'Rating fields pushed into the search index so “4.8+ stars” is a filter and a ranking signal.',
      ],
      def: 'Reviews are written to their own store, sharded by listing_id so a listing’s reviews are read together. Average ratings shown everywhere (search cards, listing page) aren’t computed on read; an event per new review updates a stored count and sum, which then flows to the search index. Because the event pipeline may redeliver, the update must be idempotent, for example by recording processed review IDs. Eventual consistency of a few seconds or minutes is perfectly fine for ratings.',
      scenarios: [
        'Listing pages compute AVG(stars) over thousands of reviews on every view',
        'Ratings must appear on search cards and be filterable',
        'Duplicate review events must not inflate counts',
      ],
      scale: 'Reviews are far fewer than views (perhaps one per stay); a per-listing aggregate row turns an O(reviews) query into O(1).',
    },
  },
  scenarios: [
    (pick) => {
      const city = pick(['Goa', 'Manali', 'Lisbon', 'Bali']);
      const ms = pick(['300', '250', '400']);
      return {
        q: `Interviewer: “Design Airbnb.” You list NFRs: map search for ${city} in under ${ms} ms, reads ~100× bookings, search highly available (seconds of staleness fine), and booking strongly consistent. Which component is mainly shaped by the search NFRs, the part where you deliberately choose availability and speed over freshness?`,
        answer: 'Elasticsearch geo + filter search',
        hint: 'Which store is allowed to be a few seconds behind the truth?',
        steps: [
          'Search combines a map area, dates, guests and several filters, and must be very fast.',
          'Serve it from a search index fed asynchronously (CDC/Kafka) from the listings DB.',
          'That index may lag by seconds, which the NFRs allow for browsing.',
          'Booking separately re-checks the calendar under a strongly consistent transaction.',
        ],
        followups: [
          { q: 'What happens if a guest opens a listing from search that was booked two seconds ago?', options: ['The listing page or Reserve call re-checks the calendar and shows the dates as unavailable', 'They are double-booked', 'Search must be strongly consistent to prevent this', 'The host must cancel one booking'], why: 'Stale search is safe because the booking path is the consistent gate.' },
          { q: 'Why not run search on read replicas of the booking database instead?', options: ['Replicas still lack efficient 2D geo + multi-filter + text indexes; they only remove load from the primary', 'Replicas cannot be read', 'Replicas are strongly consistent', 'It is always better'], why: 'The problem is the index type, not only the load.' },
        ],
      };
    },
    (pick) => {
      const pct = pick(['30%', '22%', '40%']);
      const week = pick(['New Year week', 'Diwali weekend', 'a long weekend']);
      return {
        q: `For ${week}, ${pct} of homes shown in search results turn out to be unavailable when guests open them. Bookings are stored only as (listing_id, start_date, end_date), hosts’ blocked dates live in a separate JSON field, and nothing about availability is in the search index.`,
        answer: 'Per-night availability calendar',
        hint: 'Give each night its own row, then give search a compact summary of it.',
        steps: [
          'Store one row per listing per night with status (free, held, booked, blocked) and price.',
          'Checking a stay becomes a primary-key fetch of N nights; host blocks are just updates.',
          'Push a compact availability summary (blocked ranges or a 12-month bitmap) into the search index to filter by dates.',
          'Booking still re-checks the calendar rows, which stay the source of truth.',
        ],
        followups: [
          { q: 'How many calendar rows does 10M listings × 1 year roughly mean?', options: ['About 3.65 billion small rows, fine when partitioned by listing_id', 'About 10 million', 'About 365 thousand', 'Too many for any database'], why: 'Do the estimate; it shows the design is affordable.' },
        ],
      };
    },
    (pick) => {
      const a = pick(['June 3–6', 'Dec 20–24', 'Mar 10–14']);
      const b = pick(['June 5–8', 'Dec 23–27', 'Mar 13–16']);
      return {
        q: `Two guests click Reserve within 50 ms on the same Udaipur haveli: one for ${a}, the other for ${b}. The service checks “any booking overlapping these dates?” with a SELECT, finds none for both, and inserts both bookings.`,
        answer: 'Reservation hold + DB constraint',
        hint: 'Check-then-insert in two steps is a race; make the database refuse the second one.',
        steps: [
          'Both SELECTs ran before either INSERT, so both saw no overlap.',
          'Hold the nights inside one transaction with a conditional update on each calendar row (or a unique key on listing_id + night).',
          'An overlapping second attempt then fails on at least one shared night.',
          'Postgres can also enforce it directly with an exclusion constraint on daterange overlap.',
        ],
        followups: [
          { q: 'Why can’t a unique index on (listing_id, start_date) prevent this?', options: ['Overlapping stays can start on different dates; uniqueness must be per night or via a range-overlap constraint', 'Unique indexes are slow', 'MySQL lacks unique indexes', 'It does prevent it'], why: 'Overlap is about every night in the range, not the start date.' },
        ],
      };
    },
    (pick) => {
      const mins = pick(['10', '15', '5']);
      return {
        q: `Holds last ${mins} minutes. Today a Redis key with a TTL represents each hold, and a subscriber to Redis key-expiry notifications releases the nights. After a subscriber restart, hundreds of homes stay “held” for days, and occasionally a release fires minutes late.`,
        answer: 'Reservation hold + DB constraint',
        hint: 'Correctness shouldn’t depend on an event that can be lost or late.',
        steps: [
          'Expiry notifications are fire-and-forget pub/sub: missed if no subscriber is connected, and sent only when Redis actually removes the key.',
          'Store the hold in the database with expires_at, in the same transaction that marks the nights.',
          'Treat a hold whose expires_at has passed as free when checking availability.',
          'A periodic sweeper tidies expired holds, but nothing depends on it running on time.',
        ],
        followups: [
          { q: 'Payment succeeds one minute after the hold expired, and someone else has booked the nights. What should happen?', options: ['The confirm step fails its condition, so refund automatically (or offer alternatives); extend holds once payment starts', 'Give both guests the home', 'Cancel the other guest', 'Ignore the payment'], why: 'The database decides; compensations handle the rare loser.' },
        ],
      };
    },
    (pick) => {
      const s = pick(['₹4,200', '₹6,800', '₹3,500']);
      const c = pick(['₹5,600', '₹8,900', '₹4,700']);
      return {
        q: `Guests complain search showed ${s}/night but checkout showed ${c}/night after weekend rates, cleaning fee and GST. Separately, security found the booking API accepts a total_amount field from the app and charges it as sent.`,
        answer: 'Server-side price quote',
        hint: 'One authoritative calculation, done by the server, valid for a while.',
        steps: [
          'Compute nightly rates, discounts, fees and taxes in a pricing service from the calendar and rules.',
          'Return a quote ID with an expiry; show the full breakdown before checkout.',
          'The booking API accepts the quote ID, never a client-supplied amount, and stores the charged breakdown.',
          'Search shows an approximate cached price, clearly labelled, with the total on the listing page.',
        ],
        followups: [
          { q: 'The host raises the price while a guest is on the payment screen with a valid quote. Which price applies?', options: ['The quoted price until the quote expires', 'The new price, silently', 'Whichever is lower, always', 'The booking must be cancelled'], why: 'A quote with an expiry gives the guest a stable, honest price.' },
        ],
      };
    },
    (pick) => {
      const n = pick(['12,000', '30,000', '8,000']);
      return {
        q: `A popular Goa villa has ${n} reviews. Every listing page view and every search card runs SELECT AVG(stars), COUNT(*) FROM reviews WHERE listing_id = ?, and the reviews DB is the top CPU consumer. Product also wants a “4.5+ stars” search filter.`,
        answer: 'Async review aggregation',
        hint: 'Compute the average when a review arrives, not when a page is viewed.',
        steps: [
          'Keep review_count and rating_sum per listing, updated by a consumer of new-review events.',
          'Make the update idempotent by review ID, since events can be redelivered.',
          'Push the rating to the search index so it can filter and rank on it.',
          'A few seconds of lag in ratings is acceptable.',
        ],
        followups: [
          { q: 'Why not update the listing row and insert the review in one transaction?', options: ['Reviews and listings may live on different shards or services, so it would need a distributed transaction', 'Transactions can’t update counters', 'It double-counts', 'It is always wrong'], why: 'Async aggregation avoids cross-shard transactions for a non-critical value.' },
        ],
      };
    },
    (pick) => {
      const z = pick(['15', '12', '18']);
      return {
        q: `Users drag the map over Bengaluru and the app calls “search this area” at zoom level ${z} with 4 guests, price under ₹5,000 and “Wi-Fi + parking”. The query runs on Postgres with a composite B-tree index on (lat, long) and takes 3 seconds, scanning every listing in that latitude band.`,
        answer: 'Elasticsearch geo + filter search',
        hint: 'A one-dimensional index can’t answer a two-dimensional box plus filters.',
        steps: [
          'A composite B-tree narrows latitude, then scans everything in that band for longitude.',
          'Index locations with a geo structure (geohash/BKD tree) next to inverted indexes on amenities and price.',
          'Run a geo_bounding_box query for the viewport combined with the filters.',
          'Feed the index from the listings DB via CDC; it can lag slightly.',
        ],
        followups: [
          { q: 'Why cache by rounded viewport or geohash cell rather than exact coordinates?', options: ['Exact coordinates almost never repeat, so rounding makes nearby users share cache entries', 'Rounding improves accuracy', 'Caches cannot store floats', 'It avoids the need for an index'], why: 'Normalise keys so a cache can actually hit.' },
        ],
      };
    },
  ],
});
