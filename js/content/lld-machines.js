SG.add({
  id: 'lld-machines',
  ref: 'U10 U12',
  section: 'LLD case studies',
  title: 'LLD: vending machine and ATM',
  short: 'Vending and ATM',
  blurb: 'Machines with modes: State for flows, Chain of Responsibility for notes, safe inventory, commands and payments.',
  intro: 'Vending machines and ATMs are “a device with modes”: the same button does different things depending on whether money is inserted, a card is in, or stock is out. That is the State pattern. Around it sit a few more decisions: dispensing cash in denominations (Chain of Responsibility), keeping stock and cash counts correct under concurrency, recording each operation as a command for audit or undo, and accepting several payment methods (Strategy).',
  options: {
    'State pattern for machine modes': {
      eli5: 'A chai vending machine ignores the “dispense” button until you put in a coin, and refuses coins when it is out of cups. Each mode decides what buttons mean.',
      industry: [
        'Vending: Idle → HasMoney → Dispensing → Idle, plus OutOfStock and Maintenance.',
        'ATM: Idle → CardInserted → PinVerified → TransactionSelected → Dispensing → Ejecting card.',
        'Metro token and parking pay machines follow the same structure.',
      ],
      def: 'Define a MachineState interface with every user action (insertCoin, selectItem, dispense, cancel). Each concrete state implements only what is legal and rejects the rest; the Machine holds a current state and delegates. Transitions live inside states, so adding Maintenance is one new class, not edits to every if/else.',
      scenarios: [
        'Buttons behave differently depending on what happened before',
        'New modes (maintenance, out of service) get added',
        'Illegal sequences like dispense-before-pay must be impossible',
      ],
      scale: 'One class per state; for 3 states an enum switch is acceptable, beyond that State classes pay off.',
    },
    'Chain of Responsibility for cash': {
      eli5: 'A queue of cashiers: the ₹2,000 cashier pays what he can, passes the rest to the ₹500 cashier, who passes the rest to the ₹100 cashier.',
      industry: [
        'ATMs dispense ₹2,000/₹500/₹200/₹100 notes through handler cassettes.',
        'Each handler knows its denomination and remaining note count.',
        'Change-making in vending machines uses the same chain for coins.',
      ],
      def: 'Each DenominationHandler takes as many of its notes as possible (min(amount / value, available)), then passes the remainder to the next handler. The chain order is configured, not hard-coded, so adding a ₹200 cassette is inserting a handler. Compute the plan first and commit only if the remainder is zero, so a failure dispenses nothing.',
      scenarios: [
        'Dispensing an amount using limited notes of several values',
        'A new denomination is added to the machine',
        'Withdrawal must fail cleanly if exact notes are not available',
      ],
      scale: 'O(number of denominations). Greedy is correct for Indian note sets; dry-run before mutating counts.',
    },
    'Thread-safe inventory': {
      eli5: 'Two office staff press “buy” for the last cold coffee at two screens of the same machine. Only one should get it and only one should pay.',
      industry: [
        'Smart vending machines with app ordering plus a touch screen hitting the same stock.',
        'ATM cash counts updated by withdrawals and by the replenishment process.',
        'ConcurrentHashMap<String, AtomicInteger> or a lock around check-and-decrement.',
      ],
      def: 'Stock and cash counts are shared mutable state. Decrement must be a compare-and-act: AtomicInteger with a CAS loop (decrement only if > 0), ConcurrentHashMap.compute per slot, or one lock around reserve-and-charge when several values must change together. Never read, then decrement in two separate steps.',
      scenarios: [
        'Two inputs can buy the same last item',
        'Stock and cash must stay consistent with each other',
        'Restocking runs while sales continue',
      ],
      scale: 'Per-slot atomics have no global contention; use one lock only when an invariant spans several fields.',
    },
    'Command for transactions and audit': {
      eli5: 'Every request is written on a slip (“withdraw ₹3,000 from account X”), filed in order, and can be replayed or reversed later.',
      industry: [
        'ATM operations (Withdraw, Deposit, BalanceEnquiry, Transfer) as command objects with execute().',
        'An audit log required by banks: who, what, when, result.',
        'Compensating undo (reverse a debit if dispensing fails).',
      ],
      def: 'Wrap each operation in a Transaction/Command object with execute() and optionally undo(). The invoker (ATM session) runs commands, logs them, and can retry or compensate. New operations are new classes, and the log of commands is the audit trail.',
      scenarios: [
        'Every operation must be logged for audit',
        'A debit must be reversed if hardware fails to dispense',
        'New transaction types are added (mini statement, PIN change)',
      ],
      scale: 'Log before and after execute with an id; persist the log so it survives a power cut.',
    },
    'Strategy for payment method': {
      eli5: 'At a tea stall you can pay by coins, notes or a UPI QR. The stall gets paid either way; only the method changes.',
      industry: [
        'Vending machines accepting coins, notes, cards and UPI QR.',
        'Each method has its own validation and refund behaviour.',
        'Spring injects List<PaymentStrategy> and picks by supports(type).',
      ],
      def: 'Define PaymentStrategy with pay(amount) and refund(). Coin, Card and UpiPayment implement it; the machine’s HasMoney flow talks only to the interface. It is orthogonal to State: state decides what is allowed now; strategy decides how the money moves.',
      scenarios: [
        'The machine must accept several payment methods',
        'New methods (wallets, RuPay tap) are planned',
        'Each method has different refund rules',
      ],
      scale: 'One class per method; register by enum in an EnumMap for O(1) lookup.',
    },
  },
  scenarios: [
    (pick) => {
      const item = pick(['Lays chips', 'Frooti', 'a Dairy Milk bar']);
      return {
        q: `A vending machine’s VendingMachine class has insertCoin(), select(), dispense() and cancel(), each with if (state == IDLE) … else if (state == HAS_MONEY) …. A bug let someone get ${item} by pressing dispense without paying, and product now wants a Maintenance mode.`,
        answer: 'State pattern for machine modes',
        hint: 'What the buttons mean depends on the current mode.',
        steps: ['Behaviour per action depends on the mode, duplicated across methods.', 'Create IdleState, HasMoneyState, DispensingState, OutOfStockState, MaintenanceState.', 'Machine delegates each action to the current state; states set the next one.', 'IdleState.dispense() rejects the call, so the bug disappears.'],
        followups: [
          { q: 'Who should change the machine’s state: the machine or the state objects?', options: ['The state objects call machine.setState(next) as part of each action', 'The client code calling the machine', 'A static global variable', 'A separate thread polling'], why: 'Keeping transitions in states keeps each mode’s rules in one place.' },
          { q: 'How would you test “cancel in HasMoney refunds the coins” in isolation?', options: ['Create the machine with a mocked PaymentStrategy, put it in HasMoney, call cancel, verify refund()', 'Run the full machine with real coins', 'Test only via the UI', 'You cannot test states separately'], why: 'Injected collaborators make state transitions unit-testable.' },
        ],
      };
    },
    (pick) => {
      const amt = pick([3800, 4600, 7300]);
      return {
        q: `An ATM has cassettes of ₹2,000, ₹500, ₹200 and ₹100 with limited notes each. A user withdraws ₹${amt}. The current code is one method with four nested loops, and the bank is adding a ₹50 cassette.`,
        answer: 'Chain of Responsibility for cash',
        hint: 'Each denomination does its part and passes the rest on.',
        steps: ['Each cassette is a handler with value and count.', 'Handler takes min(amount / value, count) notes, passes the remainder to next.', 'Dry-run the chain; dispense only if the remainder reaches 0.', 'A ₹50 cassette is just a new handler in the chain.'],
        followups: [
          { q: 'The ₹500 cassette is empty. What should the chain do?', options: ['Take zero ₹500 notes and pass the full remainder to the ₹200 handler', 'Throw immediately', 'Dispense ₹2,000 notes instead', 'Skip the remaining handlers'], why: 'Handlers adapt to their own stock; the chain succeeds if later handlers can cover it.' },
          { q: 'Why plan first and commit after?', options: ['If the remainder is not zero, nothing should be dispensed or deducted', 'It is faster', 'Java requires two passes', 'To print a receipt'], why: 'Partial dispensing would leave cash and account out of sync.' },
        ],
      };
    },
    (pick) => {
      const n = pick([2, 3]);
      return {
        q: `A smart vending machine in a Gurugram office takes orders from a touch screen and a mobile app at the same time. The last ${n === 2 ? 'unit' : 'few units'} of cold coffee were sold ${n} times over; refunds are piling up.`,
        answer: 'Thread-safe inventory',
        hint: 'Check stock and take stock must be one step.',
        steps: ['if (stock > 0) stock-- runs on two threads: check-then-act race.', 'Use AtomicInteger with a CAS loop that decrements only when > 0.', 'Charge payment only after the reservation succeeds; restore stock on payment failure.', 'Per-slot atomics avoid a global lock.'],
        followups: [
          { q: 'Which snippet decrements safely only when stock is positive?', options: ['stock.getAndUpdate(s -> s > 0 ? s - 1 : s) and check the old value > 0', 'if (stock.get() > 0) stock.decrementAndGet()', 'stock.set(stock.get() - 1)', 'volatile int stock; stock--'], why: 'getAndUpdate is atomic; the others split check and act.' },
          { q: 'Stock count and cash box must update together. Atomics or a lock?', options: ['A lock: the invariant spans two values', 'Two AtomicIntegers are enough', 'volatile fields', 'Neither; use a HashMap'], why: 'Atomics protect single variables; multi-field invariants need mutual exclusion.' },
        ],
      };
    },
    (pick) => {
      const bank = pick(['SBI', 'HDFC', 'ICICI']);
      return {
        q: `${bank}’s ATM must log every action (withdrawal, deposit, balance enquiry, PIN change) with user, time and result for audit. If the dispenser jams after debiting the account, the debit must be reversed.`,
        answer: 'Command for transactions and audit',
        hint: 'Turn each request into an object you can log and reverse.',
        steps: ['Each operation becomes a Transaction with execute() and undo().', 'The ATM session runs commands and writes them to an audit log.', 'On dispense failure, call undo() on the withdrawal to reverse the debit.', 'New operation types are new command classes.'],
        followups: [
          { q: 'How do you avoid double-debit if the ATM retries after a network timeout?', options: ['Send a unique transaction id so the bank treats repeats as idempotent', 'Retry faster', 'Use synchronized on the ATM', 'Skip the audit log'], why: 'Idempotency keys make retries safe.' },
        ],
      };
    },
    (pick) => {
      const m = pick(['UPI QR', 'RuPay contactless card', 'Paytm wallet']);
      return {
        q: `A vending machine accepts coins and notes today. The client wants ${m} next month and two more methods later. Each method validates and refunds differently, but the item-selection flow is the same.`,
        answer: 'Strategy for payment method',
        hint: 'How money moves varies; the vending flow does not.',
        steps: ['Payment is an interchangeable algorithm.', 'Define PaymentStrategy with pay(amount) and refund().', 'CoinPayment, CardPayment, UpiPayment implement it.', 'HasMoneyState uses the interface; new methods add a class.'],
        followups: [
          { q: 'How do you choose the strategy for an enum PaymentType at runtime?', options: ['EnumMap<PaymentType, PaymentStrategy> filled at startup (or Spring injection)', 'A switch in every state class', 'Reflection on class names', 'instanceof checks'], why: 'A map lookup avoids scattered switches.' },
        ],
      };
    },
    (pick) => {
      const s = pick(['a card is inserted', 'the PIN has been verified']);
      return {
        q: `At an ATM, pressing “Withdraw” must be ignored until ${s}; three wrong PINs must retain the card; and an “out of cash” mode must still allow balance enquiries.`,
        answer: 'State pattern for machine modes',
        hint: 'Same buttons, different meaning per mode.',
        steps: ['The allowed actions depend on the ATM’s current mode.', 'Define Idle, CardInserted, Authenticated, OutOfCash states.', 'Each state accepts only its legal actions and picks the next state.', 'OutOfCash allows enquiry but rejects withdraw.'],
        followups: [
          { q: 'Where should the wrong-PIN counter live?', options: ['In the session/context object the states share', 'A static field on ATM', 'In each state class as a static', 'In the bank card'], why: 'Context data belongs to the session; states stay stateless and reusable.' },
        ],
      };
    },
  ],
});
