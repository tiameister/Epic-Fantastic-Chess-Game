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

function run() {
  testDoubleOfferFlow();
  testDoubleRejectAwardsPoints();
  testGammonScoring();
  testWhiteCheatModeBias();
  testCanBearOffStrictCount();
  testHigherDieBearOffRule();
  testUndoRestoresState();
  console.log("Backgammon tests passed.");
}

run();
