SG.add({
  id: 'lld-commerce',
  ref: 'U16 U19 U20',
  section: 'LLD case studies',
  title: 'LLD: cart, auction, food delivery',
  short: 'Cart, auction, delivery',
  blurb: 'Commerce LLDs: stacked discounts, stock reservation, safe highest bids, order states and partner assignment.',
  intro: 'Shopping cart, online auction and food delivery are the commerce LLDs Flipkart, Swiggy and Zomato like. A cart is a list of items plus pricing rules that stack; stock must be reserved, not just checked; an auction has many bidders watching one changing highest bid; and a food order moves through a strict lifecycle while a delivery partner is chosen by a rule that keeps changing. Name the decision for each requirement and show how it stays correct under concurrency.',
  options: {
    'Composable discount rules': {
      eli5: 'At checkout the cashier applies coupons one after another: 10% off, then ₹100 off above ₹999, then free delivery. Each coupon is its own little rule.',
      industry: [
        'Flipkart/Amazon: bank offers, coupons and combo deals stack in a defined order.',
        'DiscountRule interface (Strategy); a chain or Decorator wraps the base price.',
        'Rules loaded from config so marketing can launch offers without a deploy.',
      ],
      def: 'Each pricing rule implements DiscountRule.apply(cart, currentPrice) and returns a new price plus a line explaining it. The cart total runs the base price through an ordered list of rules (or Decorators wrapping a PriceCalculator). Stacking order, exclusivity (“not combinable with other coupons”) and a floor of ₹0 are explicit. Use BigDecimal or paise.',
      scenarios: [
        'Several offers must stack in a defined order',
        'Marketing adds new offer types often',
        'The bill must show which discount gave how much',
      ],
      scale: 'O(rules × items) per checkout; keep rules stateless so they are safe to share across threads.',
    },
    'Inventory reservation': {
      eli5: 'When you put the last pair of shoes in your basket at the shop, the staff keeps it at the counter for 15 minutes so nobody else buys it while you pay.',
      industry: [
        'Flash sales (Big Billion Days) reserve stock at checkout, release on payment failure or timeout.',
        'available / reserved counters per SKU, updated atomically.',
        'Food delivery: restaurant item availability toggled off when sold out.',
      ],
      def: 'At checkout, move quantity from available to reserved atomically (CAS loop, lock per SKU, or UPDATE … SET available = available − q WHERE available ≥ q). On payment success, convert reserved to sold; on failure or expiry, return it. Adding to cart does not reserve; checkout does.',
      scenarios: [
        'Flash sales where stock is far smaller than demand',
        'Payment can fail after the user clicks “pay”',
        'Oversold orders are causing cancellations',
      ],
      scale: 'Per-SKU atomic updates; hot SKUs may need sharded stock counters or a queue.',
    },
    'Observer + atomic highest bid': {
      eli5: 'At a village auction, the auctioneer shouts each new highest bid so everyone hears it, and only accepts a bid that beats the current one.',
      industry: [
        'Online auctions (eBay style, IPL player auction apps) notify all watchers on each new top bid.',
        'Outbid notifications to the previous highest bidder.',
        'Auction close is scheduled; late bids rejected.',
      ],
      def: 'Auction keeps highestBid and a list of BidListener observers. placeBid(b) must atomically compare with the current highest and replace it: synchronized method, ReentrantLock, or AtomicReference<Bid>.compareAndSet in a loop. After a successful update, notify observers (asynchronously) and tell the previous leader they were outbid. Reject bids after endTime.',
      scenarios: [
        'Many bidders bid at the same moment',
        'All watchers must see each new top bid',
        'The previous leader must be told they were outbid',
      ],
      scale: 'One lock or CAS per auction: contention only among bidders on the same item.',
    },
    'Order state machine': {
      eli5: 'A food order slip moves through stamps: placed, accepted by restaurant, being cooked, picked up, delivered. You cannot deliver food that was never cooked.',
      industry: [
        'Swiggy/Zomato: PLACED → ACCEPTED → PREPARING → READY → PICKED_UP → DELIVERED, or CANCELLED / REJECTED.',
        'Cancellation and refund rules depend on the stage.',
        'Each transition emits an event for tracking screens and notifications.',
      ],
      def: 'Order status is an enum with an allowed-transition map (or State classes). Actions from restaurant, partner and customer call transition(expected, next), checked and applied atomically. Side effects (refunds, notifications, partner assignment) are triggered by transitions, so the lifecycle stays the single source of truth.',
      scenarios: [
        'Customer cancels after the restaurant has started cooking',
        'Restaurant and delivery partner update the same order',
        'Refund rules depend on the current stage',
      ],
      scale: 'O(1) transitions; persist status history for support and disputes.',
    },
    'Strategy for partner assignment': {
      eli5: 'Choosing which delivery rider takes the order: the nearest one, the one who has waited longest, or the one already heading that way with another order.',
      industry: [
        'Nearest-available, fairness (least orders today) or batching (same direction) rules.',
        'Different rules for peak hours, rain or big orders.',
        'A/B testing two assignment algorithms by city.',
      ],
      def: 'Define PartnerAssignmentStrategy.assign(order, candidates). Implementations rank candidates with a Comparator (distance, idle time, rating) and the service claims the top one atomically, falling back to the next if the claim fails. The strategy is chosen per city or time via config.',
      scenarios: [
        'Assignment rules vary by city, time or weather',
        'Ops wants to A/B test a new algorithm',
        'Fairness between partners matters',
      ],
      scale: 'Candidate list from a geo index (tens of riders); ranking is O(k log k).',
    },
  },
  scenarios: [
    (pick) => {
      const o = pick(['10% off with HDFC cards (max ₹1,500)', 'flat ₹200 off above ₹1,999', 'buy 2 get 1 free on T-shirts']);
      return {
        q: `A cart service must support “${o}” plus a site-wide coupon, applied in a defined order, and show each saving on the bill. Marketing plans a new offer type every sale.`,
        answer: 'Composable discount rules',
        hint: 'Each offer is its own rule; the total runs through them.',
        steps: ['Offers vary and stack.', 'DiscountRule.apply(cart, price) returns new price + description.', 'CartPricer applies an ordered list (or Decorator chain) of rules.', 'Floor at ₹0 and enforce “not combinable” flags.'],
        followups: [
          { q: 'Why BigDecimal (or paise as long) instead of double for prices?', options: ['double cannot represent many decimal amounts exactly, causing paise errors', 'BigDecimal is faster', 'double cannot be negative', 'Java requires it for money'], why: 'Floating point rounding breaks totals.' },
          { q: 'Decorator vs a list of strategies for discounts: what does Decorator add?', options: ['Each wrapper can wrap any calculator, so rules compose at runtime without the cart knowing the order logic', 'It is faster', 'It removes the need for interfaces', 'It is thread-safe by default'], why: 'Both work; Decorator makes composition the structure itself.' },
        ],
      };
    },
    (pick) => {
      const stock = pick([100, 500, 1000]);
      const users = pick(['50,000', '2 lakh']);
      return {
        q: `Flash sale: ${stock} units of a phone, ${users} users click “Buy now” within 2 minutes. 20% of payments fail. Last year the site sold 1.3× the stock and had to cancel orders.`,
        answer: 'Inventory reservation',
        hint: 'Checking stock is not the same as holding it.',
        steps: ['Check-then-decrement oversells under concurrency.', 'Atomically move qty from available to reserved at checkout.', 'Confirm on payment success; release on failure or a 10-minute timeout.', 'Users beyond stock see “sold out” immediately.'],
        followups: [
          { q: 'Single SQL statement that reserves only if stock is enough?', options: ['UPDATE sku SET available = available - ? WHERE id = ? AND available >= ? (check rows updated)', 'SELECT available then UPDATE in code', 'INSERT a new row per unit', 'DELETE the SKU'], why: 'Conditional update is an atomic compare-and-decrement.' },
          { q: 'Should adding to the cart reserve stock?', options: ['Usually no; reserve at checkout, or carts would lock stock for days', 'Yes, always', 'Only for cheap items', 'Only on mobile'], why: 'Carts are long-lived and mostly abandoned.' },
        ],
      };
    },
    (pick) => {
      const item = pick(['a vintage Royal Enfield', 'a signed cricket bat', 'a fancy number plate']);
      return {
        q: `An online auction for ${item}: 300 bidders watch; in the last 10 seconds, 40 bids arrive at once. A lower bid sometimes overwrites a higher one, and watchers see stale prices.`,
        answer: 'Observer + atomic highest bid',
        hint: 'Compare-and-replace the top bid as one step, then tell everyone.',
        steps: ['if (bid > highest) highest = bid races between threads.', 'Make placeBid atomic: synchronized, ReentrantLock, or AtomicReference CAS loop.', 'After success, notify watchers and the outbid user (async).', 'Reject bids after endTime.'],
        followups: [
          { q: 'Why notify observers outside the lock?', options: ['A slow listener would otherwise block every other bid', 'Observers cannot be called inside locks', 'It changes the winner', 'It saves memory'], why: 'Keep critical sections small; notify after the state change.' },
          { q: 'Two bids of the same amount arrive together. Fair rule?', options: ['The first accepted (earlier timestamp/sequence) wins; equal bids do not replace', 'The larger user id wins', 'Random choice', 'Both win'], why: 'Strictly greater replaces; ties go to the earlier bid.' },
        ],
      };
    },
    (pick) => {
      const stage = pick(['the restaurant has started preparing', 'the partner has picked up the food', 'the restaurant rejected it a minute ago']);
      return {
        q: `In a food-delivery LLD, a customer taps cancel after ${stage}. Today the code sets order.status = CANCELLED and always issues a full refund.`,
        answer: 'Order state machine',
        hint: 'What cancel means depends on the current stage.',
        steps: ['Order has a strict lifecycle with stage-specific rules.', 'Define allowed transitions per status in an EnumMap.', 'Cancel from PREPARING gives a partial refund; from PICKED_UP it is not allowed.', 'Transitions are atomic and emit events for tracking.'],
        followups: [
          { q: 'Restaurant marks READY while the customer cancels. How do you prevent a lost update?', options: ['Conditional transition: update only if status is still the expected one', 'Last write wins', 'Ask the user', 'Use two separate status fields'], why: 'Compare-and-set on status makes one action win cleanly.' },
        ],
      };
    },
    (pick) => {
      const rule = pick(['batch orders going the same direction', 'prefer partners idle for the longest time', 'avoid two-wheelers for 15 kg orders']);
      return {
        q: `Swiggy-style ops want to change partner assignment in Bengaluru to “${rule}” during peak hours, and A/B test it against nearest-partner in Chennai.`,
        answer: 'Strategy for partner assignment',
        hint: 'The algorithm changes by city and time; the order flow does not.',
        steps: ['Assignment rule varies by context.', 'Define PartnerAssignmentStrategy.assign(order, candidates).', 'Pick the strategy per city/time from config.', 'Claim the chosen partner atomically; fall back to the next.'],
        followups: [
          { q: 'How do you claim a partner safely when two orders pick the same one?', options: ['partner.status.compareAndSet(AVAILABLE, ASSIGNED); on failure try the next candidate', 'Assign both orders', 'Use volatile status only', 'Sleep and retry the same partner'], why: 'CAS makes the claim atomic.' },
        ],
      };
    },
    (pick) => {
      const n = pick([3, 5]);
      return {
        q: `A cart has ${n} items from one seller. At checkout the order should reserve all items or none: if one is out of stock, nothing is held and the user sees which item failed.`,
        answer: 'Inventory reservation',
        hint: 'All-or-nothing across several SKUs.',
        steps: ['Each SKU must be reserved atomically.', 'Reserve in sorted SKU order to avoid deadlocks.', 'If any fails, release the ones already reserved.', 'Return which SKU failed.'],
        followups: [
          { q: 'Why sort SKUs before locking them?', options: ['Two carts locking the same SKUs in opposite order would deadlock', 'Sorting makes the cart cheaper', 'Locks require sorted keys', 'For prettier logs'], why: 'Global lock ordering prevents circular waits.' },
        ],
      };
    },
  ],
});
