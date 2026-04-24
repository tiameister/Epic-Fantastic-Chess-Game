import { BackgammonEngine } from "../backgammon-engine.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function testDoubleOfferFlow() {
  const e = new BackgammonEngine();
  e.setDoublingEnabled(true);
  const offer = e.offerDouble("white");
  assert(offer.ok, "White should be able to offer opening double");
  const accept = e.acceptDouble("black");
  assert(accept.ok, "Black should be able to accept double");
  assert(e.cubeValue === 2, "Cube should become 2");
  assert(e.cubeOwner === "black", "Cube owner should become acceptor");
}

function testDoubleRejectAwardsPoints() {
  const e = new BackgammonEngine();
  e.setDoublingEnabled(true);
  e.offerDouble("white");
  const reject = e.rejectDouble("black");
  assert(reject.ok, "Reject should resolve game");
  assert(e.winner === "white", "Offerer should win on reject");
  assert(e.matchScore.white === 1, "Reject should award 1 point");
}

function testGammonScoring() {
  const e = new BackgammonEngine();
  e.setDoublingEnabled(true);
  e.cubeValue = 2;
  e.points = Array(25).fill(0);
  e.off.white = 15;
  e.off.black = 0;
  e.applyWinScore("white");
  assert(e.matchScore.white === 4, "Gammon should be cube*2");
}

function testWhiteCheatModeBias() {
  const e = new BackgammonEngine();
  e.setWhiteCheatMode(true);
  const sample = [];
  for (let i = 0; i < 6; i += 1) {
    e.movesLeft = [];
    e.dice = [];
    const roll = e.rollDice();
    sample.push((roll.d1 + roll.d2));
  }
  const avg = sample.reduce((a, b) => a + b, 0) / sample.length;
  assert(avg >= 7, "Cheat mode should bias white toward stronger rolls");
}

function testCanBearOffStrictCount() {
  const e = new BackgammonEngine();
  e.points = Array(25).fill(0);
  e.bar.white = 0;
  e.off.white = 14;
  e.points[1] = 1;
  e.points[2] = 1;
  assert(!e.canBearOff("white"), "Bear off should fail when home+off is not exactly 15");
}

function testHigherDieBearOffRule() {
  const e = new BackgammonEngine();
  e.points = Array(25).fill(0);
  e.turn = "white";
  e.points[4] = 1;
  e.off.white = 14;
  e.movesLeft = [6];
  const legal = e.getLegalMoves();
  assert(legal.some((m) => m.from === 4 && m.to === "off"), "Higher die should bear off highest checker when eligible");
}

function testUndoRestoresState() {
  const e = new BackgammonEngine();
  e.setWhiteCheatMode(false);
  e.dice = [6, 1];
  e.movesLeft = [6, 1];
  const legal = e.getLegalMoves();
  assert(legal.length > 0, "Should have legal moves from initial setup");
  const initialTurn = e.turn;
  const move = legal[0];
  const result = e.move(move.from, move.to);
  assert(result.ok, "Move should succeed");
  const undone = e.undo();
  assert(undone, "Undo should succeed after one move");
  assert(e.turn === initialTurn, "Undo should restore turn");
}

function testWinningMoveClearsDiceState() {
  const e = new BackgammonEngine();
  e.points = Array(25).fill(0);
  e.turn = "white";
  e.off.white = 14;
  e.points[1] = 1;
  e.dice = [1, 2];
  e.movesLeft = [1, 2];
  const result = e.move(1, "off");
  assert(result.ok && result.gameOver, "Winning bear-off should finish game");
  assert(e.winner === "white", "White should be winner");
  assert(e.movesLeft.length === 0, "Moves should be cleared at game end");
  assert(e.dice.length === 0, "Dice should be cleared at game end");
}

function testBarEntryIsMandatory() {
  const e = new BackgammonEngine();
  e.points = Array(25).fill(0);
  e.turn = "white";
  e.bar.white = 1;
  e.points[8] = 2; // own checker on board should be ignored until bar enters
  e.points[24] = -2; // blocked for die 1
  e.points[23] = 0;  // open for die 2
  e.dice = [1, 2];
  e.movesLeft = [1, 2];

  const legal = e.getLegalMoves();
  assert(legal.length === 1, "Only one bar-entry move should be legal");
  assert(legal[0].from === "bar" && legal[0].to === 23, "Must enter from bar using open die");
}

function testForcedHigherDieWhenOnlyOneMovePossible() {
  const e = new BackgammonEngine();
  e.points = Array(25).fill(0);
  e.turn = "white";
  e.bar.white = 1;
  // Both entries are open, but no second move is possible after either entry.
  e.points[24] = 0;   // die 1 entry
  e.points[23] = 0;   // die 2 entry
  e.points[22] = -2;  // blocks follow-up move from either entry
  e.dice = [1, 2];
  e.movesLeft = [1, 2];

  const legal = e.getLegalMoves();
  assert(legal.length === 1, "Only one move should remain");
  assert(legal[0].die === 2, "Higher die must be forced when only one die can be played");
  assert(legal[0].from === "bar" && legal[0].to === 23, "Forced move should use higher die entry point");
}

function testAmbiguousBearOffConsumesBetterDie() {
  const e = new BackgammonEngine();
  e.points = Array(25).fill(0);
  e.turn = "white";
  e.off.white = 13;
  e.points[4] = 1;
  e.points[6] = 1;
  e.dice = [4, 6];
  e.movesLeft = [4, 6];

  const result = e.move(4, "off");
  assert(result.ok, "Ambiguous bear-off should still be legal");
  assert(e.movesLeft.length === 1, "Exactly one die should remain after first bear-off");
  assert(e.movesLeft[0] === 6, "Engine should keep larger die for the stronger continuation");
}

function testDoublesProvideFourMoves() {
  const e = new BackgammonEngine();
  e.points = Array(25).fill(0);
  e.turn = "white";
  e.points[24] = 4;
  e.dice = [6, 6];
  e.movesLeft = [6, 6, 6, 6];

  for (let i = 0; i < 4; i += 1) {
    const legal = e.getLegalMoves();
    assert(legal.length > 0, `Double sequence step ${i + 1} should have legal move`);
    const chosen = legal.find((m) => m.from === 24) || legal[0];
    const result = e.move(chosen.from, chosen.to);
    assert(result.ok, `Double sequence step ${i + 1} should execute`);
  }
  assert(e.movesLeft.length === 0, "All four dice from doubles should be consumed");
}

function run() {
  testDoubleOfferFlow();
  testDoubleRejectAwardsPoints();
  testGammonScoring();
  testWhiteCheatModeBias();
  testCanBearOffStrictCount();
  testHigherDieBearOffRule();
  testUndoRestoresState();
  testWinningMoveClearsDiceState();
  testBarEntryIsMandatory();
  testForcedHigherDieWhenOnlyOneMovePossible();
  testAmbiguousBearOffConsumesBetterDie();
  testDoublesProvideFourMoves();
  console.log("Backgammon tests passed.");
}

run();
