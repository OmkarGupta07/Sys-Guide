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
    'Incremental win check from the last move': {
      eli5: 'Only the line through the disc you just dropped can newly become a winner, so you look outward from that one spot instead of re-reading the whole grid.',
      industry: [
        'Connect Four: after a drop at (row, col), count same-coloured discs both ways along 4 directions (horizontal, vertical, two diagonals); 4 or more wins.',
        'Tic-tac-toe on n×n: rows[n], cols[n], diag, antiDiag counters with +1 for X and −1 for O; a counter hitting ±n wins in O(1).',
        'Gomoku (5 in a row on 15×15) uses the same outward walk from the last move.',
      ],
      def: 'A win can only involve the cell that was just played, so check from there. For k-in-a-row games (Connect Four, Gomoku), walk from the last move in 4 directions, count same-coloured cells on both sides plus the disc itself, and win at k: O(k) per move. For classic n×n tic-tac-toe, per-row/column/diagonal counters give O(1). Have place-disc return the row it landed in so the win check knows where to start. Use a Strategy for win rules only when variants really exist; four fixed directions do not need four checker classes.',
      scenarios: [
        'Board is large and moves are frequent',
        'Connect Four: you must find four in a row on a 6×7 grid',
        'Interviewer asks the complexity of checking a winner',
      ],
      scale: 'O(k) per move (O(1) with counters) versus O(rows × cols) for a full scan.',
    },
    'Game referee, Board grid, state enum': {
      eli5: 'The board is the physical plastic grid; it only knows where discs sit. The referee knows whose turn it is and who won.',
      industry: [
        'Connect Four: Board owns grid, canPlace, placeDisc and checkWin; Game owns players, current player and game state.',
        'GameState enum {IN_PROGRESS, WON, DRAW} instead of isOver, hasWinner and isDraw booleans, which allow 8 combinations when only 3 are valid.',
        'Board stores a DiscColor enum, not Player objects, so it stays testable without players.',
      ],
      def: 'Give each class one job (SRP): Board handles grid physics and bounds/full-column checks; Game handles turn order, state and winner and calls makeMove(player, column), which rejects moves out of turn, after game over, or into a full column cleanly. Model status as one enum, not several booleans. Return a result code or enum rather than a bare boolean if callers need the reason. Keep the UI out of scope.',
      scenarios: [
        'Board size or win length changes in future',
        'Add undo or a bot without rewriting the board',
        'Status flags are drifting out of sync',
      ],
      scale: 'Undo is a stack of Move(player, row, col) in Game; a bot is a separate chooseMove(board) class and Game and Board are untouched.',
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
        answer: 'Incremental win check from the last move',
        hint: 'Only the row, column and diagonals of the last move can change.',
        steps: ['Scanning is O(n²) per move.', 'Keep rows[n], cols[n], diag, antiDiag counters.', 'Add +1 for X, −1 for O at (r, c); update diag if r == c, anti if r + c == n − 1.', 'Win when any updated counter reaches ±n: O(1).'],
        followups: [
          { q: 'Variant: win with k = 5 in a row on a 15×15 board (Gomoku). Do the counters still work?', options: ['No; walk outward from the last move in 4 directions, O(k); add a WinningStrategy only if several rule sets must coexist', 'Yes, unchanged', 'Only if k divides n', 'Only on square boards'], why: 'Full-line counters only detect n in a row; the outward walk handles any k.' },
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
      const r = pick([6, 8]);
      const c = pick([7, 9]);
      return {
        q: `Connect Four on a ${r}×${c} grid: after each drop, the candidate rescans every row, column and diagonal of the whole board for four in a row. The interviewer says: “discs only ever change at one cell per move.”`,
        answer: 'Incremental win check from the last move',
        hint: 'What is the only cell that can have just created a new line?',
        steps: ['A full scan is O(rows × cols) per move and checks lines nothing touched.', 'Make placeDisc return the row the disc landed in.', 'From (row, col) walk both ways along horizontal, vertical, diagonal and anti-diagonal and count matching colours (disc itself counts once).', 'Win when any direction totals 4 or more: O(4) work per move.'],
        followups: [
          { q: 'Why does the walk in each direction need to go both ways from the new disc?', options: ['The new disc can be in the middle of the four, not only at an end', 'Java loops must run twice', 'To handle draws', 'Because the board wraps around'], why: 'Count right plus left (and up plus down, and both diagonals) plus 1 for the disc itself.' },
          { q: 'Should you add four WinChecker classes (Horizontal, Vertical, ...) behind a Strategy interface?', options: ['Not unless win rules truly vary; four fixed directions are about 10 lines of loop', 'Always, to show design patterns', 'Yes, because Java needs interfaces for loops', 'Only for the vertical case'], why: 'Patterns that add classes without a real axis of change are over-engineering; mention the option and explain why you skip it.' },
        ],
      };
    },
    (pick) => {
      const f = pick(['an undo button', 'a computer opponent', 'a 10×10 board']);
      return {
        q: `A Connect Four design has one class holding the grid, the current player, three booleans (isOver, hasWinner, isDraw) and the UI printing. The product owner now wants ${f}, and a bug set isOver=true with hasWinner=false and isDraw=true.`,
        answer: 'Game referee, Board grid, state enum',
        hint: 'Which class would you point to for each change, and can an impossible state even be represented?',
        steps: ['Three booleans give 8 states but only 3 are valid; use one GameState enum.', 'Board owns the grid and its rules (bounds, full column, win check); Game owns turn, state and winner.', 'Board stores a DiscColor, not Player, so it needs no knowledge of who is playing.', 'Each new feature then touches one class: undo is a move stack in Game, a bot only chooses a column, board size is a constructor argument.'],
        followups: [
          { q: 'How do you add undo?', options: ['Game keeps a stack of Move(player, row, col); undo pops, clears that cell on Board and restores current player and state', 'Copy the whole board after every move into a list and swap it back', 'Make Board store the history of players', 'Reject undo as out of scope for every game'], why: 'All moves flow through Game.makeMove, so it is the single place to record history.' },
          { q: 'Bot opponent: what changes?', options: ['Add a small bot class with chooseMove(board) and let the driver loop call it; Game and Board stay the same', 'Rewrite Board with an AI method', 'Make Disc an interface', 'Copy Game into BotGame'], why: 'Choosing a move is outside the rules of the game, so keep it out of Game and Board.' },
        ],
      };
    },
  ],
});
