SG.add({
  id: 'behavioral',
  ref: 'T30, T31, T33, T34',
  section: 'LLD: design patterns',
  title: 'Strategy, Observer, State or Chain of Responsibility',
  short: 'Behavioral patterns',
  blurb: 'The four patterns interviewers reach for most in LLD rounds, and how to tell them apart.',
  intro: 'All four replace a growing if/else with objects. The question is what varies: the algorithm, who gets told, the object’s current mode, or who handles a request.',
  options: {
    'Strategy': {
      eli5: 'To get to college you can take a bus, a bike or the metro. The trip is the same; you just swap how you travel.',
      industry: [
        'Payment checkout: UPI, card, wallet and net banking behind one PaymentStrategy interface.',
        'Spring’s Resource loading and PasswordEncoder implementations are swappable strategies.',
        'Java’s Comparator: sort the same list by price, rating or date.',
      ],
      def: 'Define a family of interchangeable algorithms behind one interface; the client picks one at runtime. Removes if/else on “which algorithm” and satisfies the Open/Closed principle.',
      scenarios: [
        'Several ways to do the same job, chosen at runtime',
        'New variants get added often (new payment method, new discount)',
        'You want to test each algorithm in isolation',
      ],
      scale: 'Code smell it fixes: a switch on “type” that grows with every feature. The client chooses; strategies don’t know about each other.',
    },
    'Observer': {
      eli5: 'You subscribe to a YouTube channel. When a new video drops, every subscriber gets notified. The creator doesn’t know or care who you are.',
      industry: [
        'Order placed → email, SMS, inventory and analytics all react.',
        'Spring ApplicationEventPublisher and @EventListener.',
        'UI frameworks: buttons notify click listeners; stock tickers update several widgets.',
      ],
      def: 'A subject keeps a list of observers and notifies all of them when its state changes. Publishers and subscribers are decoupled; new subscribers are added without changing the subject.',
      scenarios: [
        'One event, many independent reactions',
        'New listeners get added often',
        'The source shouldn’t depend on the listeners',
      ],
      scale: 'In one process it’s Observer; across services the same idea becomes pub/sub (Kafka, SNS). Watch for slow listeners blocking the subject.',
    },
    'State': {
      eli5: 'A traffic light. Pressing the pedestrian button does different things depending on whether it’s red, yellow or green, and each light knows which comes next.',
      industry: [
        'Order lifecycle: Created → Paid → Shipped → Delivered, with cancel allowed only before shipping.',
        'Vending machines and ATMs: the same button behaves differently by mode.',
        'TCP connection states; document workflows (draft, review, published).',
      ],
      def: 'An object delegates behaviour to a state object, and switches state objects as it moves through its lifecycle. Each state class handles only the actions valid in that state.',
      scenarios: [
        'The same action behaves differently depending on the current mode',
        'There are clear lifecycle transitions',
        'if (status == …) checks are spreading everywhere',
      ],
      scale: 'Looks like Strategy in code. Difference: the object itself changes state over time (states know the transitions); in Strategy the client picks once.',
    },
    'Chain of Responsibility': {
      eli5: 'A complaint goes to the class monitor. If they can’t solve it, it goes to the teacher, then the principal. Each one either handles it or passes it on.',
      industry: [
        'Spring Security and Servlet filter chains: auth → logging → rate limit → controller.',
        'Expense approvals by amount: team lead → manager → director.',
        'Support escalation L1 → L2 → L3.',
      ],
      def: 'Pass a request along a chain of handlers. Each handler either processes it, or passes it to the next. The sender doesn’t know which handler will deal with it.',
      scenarios: [
        'Several possible handlers, decided at runtime',
        'Ordered processing steps that can stop the request early',
        'You want to add or reorder steps without touching the sender',
      ],
      scale: 'Keep chains short and the order explicit. Make sure a request can’t fall off the end unhandled.',
    },
  },
  scenarios: [
    (pick) => {
      const n = pick([4, 5, 6]);
      return {
        q: `At checkout the user picks one of ${n} payment methods (UPI, card, wallet, net banking…). Product wants to add BNPL next month without touching the checkout code.`,
        answer: 'Strategy',
        hint: 'Same job, different algorithms, chosen by the user.',
        steps: [
          'Same goal (pay), different algorithms.',
          'The client (user’s choice) selects one at runtime.',
          'Adding BNPL should be a new class, not a new if/else branch (Open/Closed).',
          'Choose Strategy.',
        ],
        followups: [
          { q: 'Who creates the right PaymentStrategy object from the user’s choice?', options: ['A factory (or a Map of type to strategy injected by Spring) so checkout code never changes', 'The checkout method with a switch', 'Each strategy decides for itself', 'The database'], why: 'Strategy + Factory is the classic pair: the factory picks, the strategy executes.' },
        ],
      };
    },
    (pick) => {
      const n = pick([3, 4, 5]);
      return {
        q: `When an order is placed, ${n} things must happen: email, SMS, inventory update, analytics… A new “loyalty points” feature must also react, without changing OrderService.`,
        answer: 'Observer',
        hint: 'One event, many reactions.',
        steps: [
          'One event: order placed.',
          'Many independent reactions.',
          'OrderService shouldn’t know about each listener.',
          'Choose Observer.',
        ],
        followups: [
          { q: 'The SMS listener takes 3 seconds and slows checkout. Fix?', options: ['Run listeners asynchronously (@Async or a message queue) so the subject doesn’t wait', 'Remove SMS', 'Make checkout wait longer', 'Merge all listeners into one'], why: 'Synchronous observers inherit the slowest listener’s latency.' },
        ],
      };
    },
    (pick) => {
      const m = pick(['vending machine', 'ATM', 'parking ticket machine']);
      return {
        q: `The ${m}: pressing “dispense” does nothing when idle, asks for payment when an item is selected, dispenses after payment, and shows “sold out” when empty. Status checks are spreading across every method.`,
        answer: 'State',
        hint: 'Does the same action behave differently based on the machine’s current mode?',
        steps: [
          'Same action, different behaviour per mode.',
          'Clear transitions: idle → selected → paid → dispensing.',
          'if (status == …) is spreading everywhere.',
          'Choose State: one class per state.',
        ],
        followups: [
          { q: 'Strategy and State look identical in code. What’s the real difference?', options: ['In State the object changes its own state as it transitions; in Strategy the client picks an algorithm and it usually stays fixed', 'State is faster', 'Strategy can’t use interfaces', 'There is no difference'], why: 'Interviewers ask this almost every time these two patterns come up.' },
        ],
      };
    },
    (pick) => {
      const a = pick(['10K', '25K']);
      return {
        q: `Expense claims under ₹${a} are approved by the team lead, under ₹1L by the manager, and anything higher by the director. Finance may add a “CFO above ₹10L” rule later.`,
        answer: 'Chain of Responsibility',
        hint: 'Each approver either handles it or passes it on.',
        steps: [
          'Several possible handlers in order.',
          'Each decides: handle it, or pass it to the next.',
          'Adding the CFO should mean adding a handler to the chain.',
          'Choose Chain of Responsibility.',
        ],
        followups: [
          { q: 'Where have you used this pattern in Spring?', options: ['The Servlet/Spring Security filter chain: each filter handles or calls chain.doFilter()', '@Autowired', 'JPA repositories', 'application.properties'], why: 'Linking a pattern to real framework code shows depth.' },
        ],
      };
    },
    (pick) => {
      const what = pick(['festive sale', 'coupon code', 'Prime-member price']);
      return {
        q: `The cart total can be calculated with no discount, a ${what}, or a flat cashback. Marketing switches the active rule several times a week at runtime.`,
        answer: 'Strategy',
        hint: 'Is this a lifecycle, or a choice between algorithms?',
        steps: [
          'Different ways to compute the same thing (the total).',
          'Chosen from outside at runtime.',
          'No lifecycle: the cart doesn’t move through discount states.',
          'Choose Strategy.',
        ],
        followups: [
          { q: 'Now two discounts must stack (coupon + cashback). Which pattern helps?', options: ['Decorator or Composite: wrap or combine strategies so each adds its effect', 'Singleton', 'State', 'Observer'], why: 'Patterns combine. Recognising when one stops being enough is senior-level thinking.' },
        ],
      };
    },
    () => ({
      q: 'An order is Created, then Paid, then Shipped, then Delivered. Cancel is allowed before Shipped, refund only after Paid, and invalid actions must throw clear errors.',
      answer: 'State',
      hint: 'Which actions are valid depends on where the order is in its lifecycle.',
      steps: [
        'Lifecycle with explicit transitions.',
        'Valid actions depend on the current state.',
        'Each state class allows only its own actions.',
        'Choose State.',
      ],
      followups: [
        { q: 'Why not just an enum and a switch in OrderService?', options: ['It works for 2–3 states, but every new state or action edits a growing switch everywhere, violating Open/Closed', 'Enums are slow', 'Java has no switch', 'It’s always wrong'], why: 'A good answer admits when the simple solution is fine, and names the point where it stops being fine.' },
      ],
    }),
  ],
});
