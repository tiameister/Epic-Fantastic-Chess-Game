import { ChessEngine } from "../chess-engine.js";
import { STATE } from "../constants.js";
import { evaluatePosition } from "../evaluation.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sq(coord) {
  const file = coord.charCodeAt(0) - 97;
  const rank = Number(coord[1]);
  return { row: 8 - rank, col: file };
}

function move(engine, from, to, options = {}) {
  const result = engine.move(sq(from), sq(to), options);
  assert(result.ok, `Move ${from}${to} should be legal`);
}

function perft(engine, depth) {
  if (depth === 0) {
    return 1;
  }
  const snapshot = engine.getSnapshot();
  const color = engine.turn;
  const moves = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = engine.getPiece(row, col, engine.board);
      if (!piece || piece.color !== color) {
        continue;
      }
      const legal = engine.getLegalMoves(row, col);
      legal.forEach((to) => {
        moves.push({ from: { row, col }, to: { row: to.row, col: to.col }, promotionType: to.promotionType || null });
      });
    }
  }
  let nodes = 0;
  for (const current of moves) {
    engine.restoreSnapshot(snapshot);
    const result = engine.move(current.from, current.to, current.promotionType ? { promotionType: current.promotionType } : {});
    if (!result.ok) {
      continue;
    }
    nodes += perft(engine, depth - 1);
  }
  engine.restoreSnapshot(snapshot);
  return nodes;
}

function testPerft() {
  const engine = new ChessEngine();
  assert(perft(engine, 1) === 20, "Perft depth 1 should be 20");
  assert(perft(engine, 2) === 400, "Perft depth 2 should be 400");
}

function testCastlingThroughCheckDisallowed() {
  const engine = new ChessEngine();
  engine.loadFenPlacement("5r2/8/8/8/8/8/8/4K2R", "white", false);
  const kingMoves = engine.getLegalMoves(7, 4);
  assert(!kingMoves.some((m) => m.isCastle && m.col === 6), "Kingside castling through attacked square must be illegal");
}

function testEnPassantWindow() {
  const engine = new ChessEngine();
  move(engine, "e2", "e4");
  move(engine, "a7", "a6");
  move(engine, "e4", "e5");
  move(engine, "d7", "d5");
  const immediate = engine.getLegalMoves(sq("e5").row, sq("e5").col);
  assert(immediate.some((m) => m.isEnPassant), "En passant should be available immediately");
  move(engine, "g1", "f3");
  move(engine, "a6", "a5");
  const later = engine.getLegalMoves(sq("e5").row, sq("e5").col);
  assert(!later.some((m) => m.isEnPassant), "En passant should expire after one move");
}

function testPromotionChoice() {
  const engine = new ChessEngine();
  engine.loadFenPlacement("8/P6k/8/8/8/8/8/4K3", "white", false);
  const result = engine.move(sq("a7"), sq("a8"), { promotionType: "knight" });
  assert(result.ok, "Promotion move should be legal");
  const promoted = engine.getPiece(sq("a8").row, sq("a8").col, engine.board);
  assert(promoted?.type === "knight", "Pawn should promote to chosen piece type");
}

function testInsufficientMaterialDraw() {
  const engine = new ChessEngine();
  engine.loadFenPlacement("7k/8/8/8/8/8/8/4K3", "white", false);
  assert(engine.gameState === STATE.DRAW, "Kings only should be draw");
  assert(engine.drawReason === "Insufficient material", "Expected insufficient material draw reason");
}

function testThreefoldRepetition() {
  const engine = new ChessEngine();
  engine.loadFenPlacement("7k/8/8/8/8/8/8/4K3", "white", false);
  // Replace with kings + rook so legal non-capturing repetition cycle is possible.
  engine.loadFenPlacement("7k/8/8/8/8/8/8/R3K3", "white", false);
  move(engine, "a1", "a2");
  move(engine, "h8", "h7");
  move(engine, "a2", "a1");
  move(engine, "h7", "h8");
  move(engine, "a1", "a2");
  move(engine, "h8", "h7");
  move(engine, "a2", "a1");
  move(engine, "h7", "h8");
  assert(engine.gameState === STATE.DRAW, "Position repetition should result in draw");
  assert(engine.drawReason === "Threefold repetition", "Expected threefold repetition reason");
}

function testFiftyMoveRule() {
  const engine = new ChessEngine();
  engine.loadFenPlacement("7k/8/8/8/8/8/8/R3K3", "white", false);
  engine.halfmoveClock = 99;
  move(engine, "a1", "a2");
  assert(engine.gameState === STATE.DRAW, "50-move rule should trigger draw at halfmove 100");
  assert(engine.drawReason === "50-move rule", "Expected 50-move rule reason");
}

function testEvaluationDeterminism() {
  const engine = new ChessEngine();
  const a = evaluatePosition(engine);
  const b = evaluatePosition(engine);
  assert(a === b, "Evaluation should be deterministic on unchanged position");
}

function run() {
  testPerft();
  testCastlingThroughCheckDisallowed();
  testEnPassantWindow();
  testPromotionChoice();
  testInsufficientMaterialDraw();
  testThreefoldRepetition();
  testFiftyMoveRule();
  testEvaluationDeterminism();
  console.log("All engine tests passed.");
}

run();
