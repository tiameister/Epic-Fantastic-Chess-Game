import { COLOR, STATE } from "./constants.js";
import { evaluatePosition } from "./evaluation.js";

function opposite(color) {
  return color === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE;
}

function perspective(score, side) {
  return side === COLOR.WHITE ? score : -score;
}

function evaluateTerminal(engine, side) {
  if (engine.gameState === STATE.CHECKMATE) {
    return engine.winner === side ? 12 : -12;
  }
  if (engine.gameState === STATE.STALEMATE) {
    return 0;
  }
  if (engine.gameState === STATE.DRAW) {
    return 0;
  }
  if (engine.gameState === STATE.TIMEOUT) {
    return engine.winner === side ? 12 : -12;
  }
  return perspective(evaluatePosition(engine), side);
}

function listLegalMovesForColor(engine, color, moveLimit = 64) {
  const originalTurn = engine.turn;
  engine.turn = color;
  const moves = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = engine.getPiece(row, col, engine.board);
      if (!piece || piece.color !== color) {
        continue;
      }
      const legal = engine.getLegalMoves(row, col);
      legal.forEach((to) => {
        moves.push({
          from: { row, col },
          to: { row: to.row, col: to.col },
          isCapture: Boolean(to.isCapture)
        });
      });
    }
  }
  engine.turn = originalTurn;
  // Prefer tactical forcing moves for early cutoffs.
  moves.sort((a, b) => Number(b.isCapture) - Number(a.isCapture));
  return moves.slice(0, moveLimit);
}

function hasMateInOne(engine, side) {
  const root = engine.getSnapshot();
  const moves = listLegalMovesForColor(engine, side, 48);
  for (const move of moves) {
    engine.restoreSnapshot(root);
    engine.turn = side;
    const result = engine.move(move.from, move.to);
    if (result.ok && engine.gameState === STATE.CHECKMATE && engine.winner === side) {
      engine.restoreSnapshot(root);
      return true;
    }
  }
  engine.restoreSnapshot(root);
  return false;
}

function bestTwoPlyWorstCase(engine, side) {
  const root = engine.getSnapshot();
  const myMoves = listLegalMovesForColor(engine, side, 14);
  if (myMoves.length === 0) {
    return evaluateTerminal(engine, side);
  }

  let bestWorstCase = -Infinity;
  for (const myMove of myMoves) {
    engine.restoreSnapshot(root);
    engine.turn = side;
    const myResult = engine.move(myMove.from, myMove.to);
    if (!myResult.ok) {
      continue;
    }
    if (engine.gameState !== STATE.IN_PROGRESS && engine.gameState !== STATE.CHECK) {
      bestWorstCase = Math.max(bestWorstCase, evaluateTerminal(engine, side));
      continue;
    }

    const opp = opposite(side);
    const oppMoves = listLegalMovesForColor(engine, opp, 12);
    if (oppMoves.length === 0) {
      bestWorstCase = Math.max(bestWorstCase, evaluateTerminal(engine, side));
      continue;
    }

    let worstResponse = Infinity;
    const afterMyMove = engine.getSnapshot();
    for (const oppMove of oppMoves) {
      engine.restoreSnapshot(afterMyMove);
      engine.turn = opp;
      const oppResult = engine.move(oppMove.from, oppMove.to);
      if (!oppResult.ok) {
        continue;
      }
      const value = evaluateTerminal(engine, side);
      if (value < worstResponse) {
        worstResponse = value;
      }
    }
    bestWorstCase = Math.max(bestWorstCase, worstResponse);
  }

  engine.restoreSnapshot(root);
  return bestWorstCase;
}

export function getTacticalSignal(engine, baseScore) {
  const side = engine.turn;
  const enemy = opposite(side);

  if (hasMateInOne(engine, side)) {
    return {
      score: side === COLOR.WHITE ? 11.5 : -11.5,
      label: `Mate in 1 for ${side === COLOR.WHITE ? "White" : "Black"}`
    };
  }
  if (hasMateInOne(engine, enemy)) {
    return {
      score: side === COLOR.WHITE ? -10.8 : 10.8,
      label: `${side === COLOR.WHITE ? "White" : "Black"} under mate threat`
    };
  }

  const basePerspective = perspective(baseScore, side);
  const bestWorstCase = bestTwoPlyWorstCase(engine, side);
  const tacticalDelta = bestWorstCase - basePerspective;

  if (tacticalDelta >= 2.2) {
    return {
      score: baseScore + (side === COLOR.WHITE ? 1.8 : -1.8),
      label: "Tactical winning sequence available"
    };
  }
  if (tacticalDelta <= -2.2) {
    return {
      score: baseScore + (side === COLOR.WHITE ? -1.8 : 1.8),
      label: "Blunder danger - only narrow defenses"
    };
  }

  return null;
}
