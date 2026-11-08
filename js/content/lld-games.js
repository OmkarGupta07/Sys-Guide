SG.add({
  id: 'lld-games',
  ref: 'U5 U6',
  section: 'LLD case studies',
  title: 'LLD: snake and ladder, tic-tac-toe, chess',
  short: 'Board games',
  blurb: 'Board modelling, O(1) win checks, polymorphic chess pieces, turn order and testable dice.',
  intro: 'Board games are popular machine-coding prompts because the rules are known, so the interviewer can judge your modelling. Keep a Game class that owns the loop, a Board that owns cells, and Players that take turns. Then pick the right tool for each rule: data (a map of jumps) instead of special classes, counters instead of scanning the board, polymorphism for piece moves, a queue for turns, and an injected dice so tests are deterministic.',
  options: {
    'Board, Cell and Jump modelling': {
      eli5: 'A snake and a ladder are the same thing really: “if you land here, go there”. One goes down, one goes up.',
      industry: [
        'Snake and ladder: Map<Integer, Integer> jumps from start to end square.',
        'Validation at load time: no jump starts on 1 or 100, no two jumps share a start, no cycles.',
        'Board configs read from JSON so new boards need no code.',
      ],
      def: 'Model the board as a size plus a Map<Integer, Jump> (or two maps), where Snake and Ladder are both a Jump(start, end); the sign of end − start tells which. Player position is an int. This keeps move logic to one lookup and lets boards be configured as data rather than classes per square.',
      scenarios: [
        'Snakes and ladders must be configurable per board',
        'Designing which classes a board game really needs',
        'Adding new square types (a “skip a turn” cell)',
      ],
      scale: 'O(1) per move via HashMap; a 100-square board with 20 jumps is trivial memory.',
    },
    'O(1) win-check counters': {
      eli5: 'Instead of rereading the whole tic-tac-toe grid after every move, keep a tally for each row, column and diagonal. When any tally hits 3, someone has won.',
      industry: [
        'Tic-tac-toe on n×n boards (and Connect Four variants) in interviews.',
        'rows[n], cols[n], diag, antiDiag: +1 for player X, −1 for O.',
        'Same idea as maintaining aggregates incrementally instead of recomputing.',
      ],
      def: 'Keep int[] rows, int[] cols and two diagonal counters. On a move at (r, c), add +1 or −1 for the player; if any affected counter’s absolute value equals n, that player wins. This makes win checking O(1) per move instead of O(n²). Put it behind a WinningStrategy interface so variants (k-in-a-row, Connect Four) can swap in.',
      scenarios: [
        'Board size n is large (n = 100) and moves are frequent',
        'Win rules may change between game variants',
        'Interviewer asks the complexity of checking a winner',
      ],
      scale: 'O(n) memory, O(1) per move; brute force is O(n²) per move.',
    },
    'Factory + polymorphic piece moves': {
      eli5: 'Every chess piece knows its own way of moving. You do not ask the board “how does a knight move?”; you ask the knight.',
      industry: [
        'Abstract Piece with canMove(board, from, to); King, Queen, Rook, Bishop, Knight, Pawn override it.',
        'PieceFactory.create(type, colour) builds the starting position.',
        'Shared helpers for sliding pieces (rook, bishop, queen) check the path is clear.',
      ],
      def: 'Piece is an abstract class with colour and an abstract canMove(); each subclass encodes its rule. A factory (or the board set-up) creates pieces from a PieceType enum. The Game validates generic rules (your turn, not capturing your own piece, not leaving your king in check) and delegates piece-specific movement polymorphically, removing a giant switch.',
      scenarios: [
        'Each piece type has different movement rules',
        'Creating the initial chess position from a layout',
        'Adding a fairy piece (archbishop) in a variant',
      ],
      scale: 'Move validation O(board size) at worst for sliding pieces; check detection scans opponent pieces.',
    },
    'Turn queue': {
      eli5: 'Players sit in a circle and pass the dice to the left. Whoever finishes stands up and the circle closes.',
      industry: [
        'Deque<Player>: poll the front, play, offer back to the end unless they have finished.',
        'Snake and ladder with 2–4 players where winners leave and the game continues.',
        'Card games with skip or reverse turns use a Deque in both directions.',
      ],
      def: 'Keep players in an ArrayDeque. Each turn: poll the next player, play the move, and offer them back unless they won or quit. It makes turn order explicit, handles players dropping out naturally, and avoids index arithmetic with modulo.',
      scenarios: [
        'Players take turns in fixed order',
        'Finished players leave while the rest continue',
        'Extra turn on rolling a 6',
      ],
      scale: 'O(1) per turn; ArrayDeque is faster than LinkedList and not thread-safe (fine for a game loop).',
    },
    'Injectable Dice': {
      eli5: 'For a practice game, you use loaded dice that always roll what you planned, so you can check the rules work.',
      industry: [
        'Dice interface with roll(); RandomDice uses ThreadLocalRandom, FixedDice returns a scripted sequence.',
        'Unit tests for “land on 98, snake to 28” become deterministic.',
        'Multiple-dice or crooked-dice variants without changing Game.',
      ],
      def: 'Do not call new Random() inside Game. Depend on a Dice interface passed through the constructor (dependency injection). Production uses a random implementation; tests use a fixed sequence or a seeded Random. This is Strategy plus DI, and it is what makes game logic testable.',
      scenarios: [
        'You need repeatable tests of random game rules',
        'Variants use two dice or a special die',
        'Interviewer asks “how would you test this?”',
      ],
      scale: 'No runtime cost; a seeded Random(42) also reproduces a bug run exactly.',
    },
  },
  scenarios: [
    (pick) => {
      const s = pick([16, 47, 62]);
      const e = pick([6, 19, 24]);
      return {
        q: `In a snake and ladder design, a candidate creates SnakeCell and LadderCell subclasses for each of 100 Cell objects. The interviewer adds: “boards come from config, e.g. a snake from ${s} to ${e}”.`,
        answer: 'Board, Cell and Jump modelling',
        hint: 'A snake and a ladder are the same shape of rule.',
        steps: ['Both snakes and ladders map a start square to an end square.', 'Model a Jump(start, end) and store Map<Integer, Jump>.', 'Move = position + roll, then apply jumps.get(position) if present.', 'Validate config: no duplicate starts, no jump on the last square.'],
        followups: [
          { q: 'A roll would take the player past 100. Common rule and where does it live?', options: ['Stay in place; the Game’s move logic checks position + roll > size', 'Wrap to 1; in Dice', 'Move to 100 anyway; in Player', 'Throw an exception'], why: 'Rule is part of the game’s movement logic, not the dice or player.' },
        ],
      };
    },
    (pick) => {
      const n = pick([3, 10, 100]);
      return {
        q: `Tic-tac-toe on an ${n}×${n} board. After each move, checkWinner() scans every row, column and both diagonals. The interviewer asks you to make it faster per move.`,
        answer: 'O(1) win-check counters',
        hint: 'Only the row, column and diagonals of the last move can change.',
        steps: ['Scanning is O(n²) per move.', 'Keep rows[n], cols[n], diag, antiDiag counters.', 'Add +1 for X, −1 for O at (r, c); update diag if r == c, anti if r + c == n − 1.', 'Win when any updated counter reaches ±n: O(1).'],
        followups: [
          { q: 'Variant: win with k = 5 in a row on a 15×15 board (Gomoku). Do the counters still work?', options: ['No; check from the last move outward in 4 directions, O(k), behind a WinningStrategy', 'Yes, unchanged', 'Only if k divides n', 'Only on square boards'], why: 'Full-line counters only detect n in a row; strategy makes the rule swappable.' },
        ],
      };
    },
    (pick) => {
      const p = pick(['knight', 'bishop', 'pawn']);
      return {
        q: `A chess design has one validateMove(piece, from, to) with a 200-line switch on piece type. A bug in the ${p} branch broke castling, and a chess-variant client wants a new piece type.`,
        answer: 'Factory + polymorphic piece moves',
        hint: 'Let each piece know its own movement rule.',
        steps: ['Movement rules vary by type: classic polymorphism.', 'Abstract Piece.canMove(board, from, to); each subclass implements it.', 'A factory builds pieces from a PieceType enum for the starting layout.', 'Game checks shared rules (turn, own-piece capture, king in check) then delegates.'],
        followups: [
          { q: 'Rook, bishop and queen all slide. How do you avoid duplicating path checks?', options: ['A shared helper (or SlidingPiece base) that checks the squares between from and to', 'Copy the loop into each class', 'Put it in the King class', 'Skip path checks'], why: 'Common behaviour goes in a shared method; specifics stay in subclasses.' },
          { q: 'Where should “a move cannot leave your own king in check” be enforced?', options: ['In Game/RuleValidator after piece-level validation', 'Inside every Piece subclass', 'In the factory', 'In the Board’s toString'], why: 'It is a game-level rule independent of the piece type.' },
        ],
      };
    },
    (pick) => {
      const n = pick([3, 4]);
      return {
        q: `Snake and ladder with ${n} players: the game should continue until only one player remains, finishers leave the rotation, and rolling a 6 gives an extra turn. The current code uses currentIndex = (currentIndex + 1) % players.size() and breaks when someone is removed.`,
        answer: 'Turn queue',
        hint: 'Who plays next should be a data structure, not arithmetic.',
        steps: ['Index arithmetic breaks when the list shrinks.', 'Hold players in an ArrayDeque.', 'poll() the next player; offerLast() them back unless they finished.', 'On a 6, offerFirst() to give an extra turn.'],
        followups: [
          { q: 'Why ArrayDeque over LinkedList here?', options: ['Faster, less memory, no node allocation per element', 'It is thread-safe', 'It allows nulls', 'It is sorted'], why: 'ArrayDeque is the recommended general-purpose queue/stack in Java.' },
        ],
      };
    },
    (pick) => {
      const sq = pick([97, 98, 99]);
      return {
        q: `You want a unit test: “a player on ${sq - 5} who rolls 5 lands on ${sq}, hits a snake and goes to 28.” The Game currently calls new Random().nextInt(6) + 1 inside play().`,
        answer: 'Injectable Dice',
        hint: 'Randomness inside the class makes tests flaky.',
        steps: ['Hidden randomness makes the outcome untestable.', 'Introduce a Dice interface with roll().', 'Pass it into Game via the constructor.', 'Tests pass a FixedDice returning 5; production passes RandomDice.'],
        followups: [
          { q: 'Which Random is best for a multi-threaded production dice?', options: ['ThreadLocalRandom.current()', 'A shared new Random() with synchronized', 'Math.random() in a loop', 'SecureRandom for every roll'], why: 'ThreadLocalRandom avoids contention on a shared seed.' },
          { q: 'Without changing Game, you want two dice summed. How?', options: ['A new Dice implementation (or a composite of two dice)', 'Add a boolean twoDice to Game', 'Subclass Game', 'Call roll() twice in Game'], why: 'The dependency is the extension point.' },
        ],
      };
    },
    (pick) => {
      const v = pick(['Connect Four', 'a 4×4 tic-tac-toe where 4 in a row wins', 'tic-tac-toe with a 3-player variant']);
      return {
        q: `The same game engine must support classic tic-tac-toe and ${v}. The interviewer asks how you keep the win rule pluggable while staying fast.`,
        answer: 'O(1) win-check counters',
        hint: 'Separate “how do I check a win” from the game loop, and keep it incremental.',
        steps: ['Win rules vary between variants.', 'Define WinningStrategy.isWin(board, lastMove).', 'Classic: row/col/diagonal counters, O(1) per move.', 'Variants plug in their own incremental check from the last move.'],
        followups: [
          { q: 'Why check only from the last move?', options: ['Only lines through the last move can have changed', 'It is required by Java', 'Older moves are erased', 'To save memory only'], why: 'Incremental checks avoid rescanning unchanged lines.' },
        ],
      };
    },
  ],
});
