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

function run() {
  testDoubleOfferFlow();
  testDoubleRejectAwardsPoints();
  testGammonScoring();
  console.log("Backgammon tests passed.");
}

run();
