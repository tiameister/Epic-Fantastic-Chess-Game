const PIECE_VALUES = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 0
};

const PST = {
  pawn: [
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    [0.06, 0.08, 0.1, 0.12, 0.12, 0.1, 0.08, 0.06],
    [0.04, 0.06, 0.08, 0.11, 0.11, 0.08, 0.06, 0.04],
    [0.02, 0.04, 0.06, 0.1, 0.1, 0.06, 0.04, 0.02],
    [0.01, 0.02, 0.03, 0.08, 0.08, 0.03, 0.02, 0.01],
    [0.0, 0.01, 0.02, 0.04, 0.04, 0.02, 0.01, 0.0],
    [0.0, 0.0, 0.0, -0.06, -0.06, 0.0, 0.0, 0.0],
    [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
  ],
  knight: [
    [-0.15, -0.08, -0.04, -0.02, -0.02, -0.04, -0.08, -0.15],
    [-0.08, -0.02, 0.02, 0.05, 0.05, 0.02, -0.02, -0.08],
    [-0.04, 0.02, 0.08, 0.1, 0.1, 0.08, 0.02, -0.04],
    [-0.02, 0.05, 0.1, 0.12, 0.12, 0.1, 0.05, -0.02],
    [-0.02, 0.05, 0.1, 0.12, 0.12, 0.1, 0.05, -0.02],
    [-0.04, 0.02, 0.08, 0.1, 0.1, 0.08, 0.02, -0.04],
    [-0.08, -0.02, 0.02, 0.05, 0.05, 0.02, -0.02, -0.08],
    [-0.15, -0.08, -0.04, -0.02, -0.02, -0.04, -0.08, -0.15]
  ],
  bishop: [
    [-0.06, -0.03, -0.02, -0.01, -0.01, -0.02, -0.03, -0.06],
    [-0.03, 0.02, 0.03, 0.04, 0.04, 0.03, 0.02, -0.03],
    [-0.02, 0.03, 0.06, 0.07, 0.07, 0.06, 0.03, -0.02],
    [-0.01, 0.04, 0.07, 0.1, 0.1, 0.07, 0.04, -0.01],
    [-0.01, 0.04, 0.07, 0.1, 0.1, 0.07, 0.04, -0.01],
    [-0.02, 0.03, 0.06, 0.07, 0.07, 0.06, 0.03, -0.02],
    [-0.03, 0.02, 0.03, 0.04, 0.04, 0.03, 0.02, -0.03],
    [-0.06, -0.03, -0.02, -0.01, -0.01, -0.02, -0.03, -0.06]
  ],
  rook: [
    [0.04, 0.05, 0.05, 0.06, 0.06, 0.05, 0.05, 0.04],
    [0.02, 0.03, 0.04, 0.05, 0.05, 0.04, 0.03, 0.02],
    [0.0, 0.01, 0.02, 0.03, 0.03, 0.02, 0.01, 0.0],
    [0.0, 0.01, 0.02, 0.03, 0.03, 0.02, 0.01, 0.0],
    [0.0, 0.01, 0.02, 0.03, 0.03, 0.02, 0.01, 0.0],
    [0.0, 0.01, 0.02, 0.03, 0.03, 0.02, 0.01, 0.0],
    [0.01, 0.02, 0.03, 0.04, 0.04, 0.03, 0.02, 0.01],
    [0.02, 0.03, 0.04, 0.05, 0.05, 0.04, 0.03, 0.02]
  ],
  queen: [
    [-0.04, -0.02, 0.0, 0.02, 0.02, 0.0, -0.02, -0.04],
    [-0.02, 0.01, 0.03, 0.04, 0.04, 0.03, 0.01, -0.02],
    [0.0, 0.03, 0.05, 0.07, 0.07, 0.05, 0.03, 0.0],
    [0.02, 0.04, 0.07, 0.09, 0.09, 0.07, 0.04, 0.02],
    [0.02, 0.04, 0.07, 0.09, 0.09, 0.07, 0.04, 0.02],
    [0.0, 0.03, 0.05, 0.07, 0.07, 0.05, 0.03, 0.0],
    [-0.02, 0.01, 0.03, 0.04, 0.04, 0.03, 0.01, -0.02],
    [-0.04, -0.02, 0.0, 0.02, 0.02, 0.0, -0.02, -0.04]
  ],
  king: [
    [-0.12, -0.12, -0.1, -0.08, -0.08, -0.1, -0.12, -0.12],
    [-0.1, -0.1, -0.08, -0.05, -0.05, -0.08, -0.1, -0.1],
    [-0.08, -0.08, -0.05, -0.02, -0.02, -0.05, -0.08, -0.08],
    [-0.06, -0.05, -0.03, 0.0, 0.0, -0.03, -0.05, -0.06],
    [-0.04, -0.03, -0.01, 0.02, 0.02, -0.01, -0.03, -0.04],
    [-0.02, 0.0, 0.02, 0.04, 0.04, 0.02, 0.0, -0.02],
    [0.0, 0.02, 0.04, 0.05, 0.05, 0.04, 0.02, 0.0],
    [0.0, 0.03, 0.05, 0.06, 0.06, 0.05, 0.03, 0.0]
  ]
};

function pstValue(piece, row, col) {
  const table = PST[piece.type];
  if (!table) {
    return 0;
  }
  if (piece.color === "white") {
    return table[row][col];
  }
  // Mirror table for black
  return table[7 - row][col];
}

export function evaluateBoard(board) {
  let score = 0;
  const pawnFiles = {
    white: Array(8).fill(0),
    black: Array(8).fill(0)
  };

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (!piece) {
        continue;
      }
      const base = PIECE_VALUES[piece.type] ?? 0;
      const positional = pstValue(piece, row, col);
      const value = base + positional;
      score += piece.color === "white" ? value : -value;
      if (piece.type === "pawn") {
        pawnFiles[piece.color][col] += 1;
      }
    }
  }

  // Penalize doubled pawns to avoid "drawish" bar in bad structures.
  for (let file = 0; file < 8; file += 1) {
    if (pawnFiles.white[file] > 1) {
      score -= 0.12 * (pawnFiles.white[file] - 1);
    }
    if (pawnFiles.black[file] > 1) {
      score += 0.12 * (pawnFiles.black[file] - 1);
    }
  }

  return Number(score.toFixed(2));
}

export function evaluatePosition(engine) {
  const boardScore = evaluateBoard(engine.board);

  let whiteMobility = 0;
  let blackMobility = 0;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = engine.getPiece(row, col, engine.board);
      if (!piece) {
        continue;
      }
      const pseudoMoves = engine.getPseudoMovesForPiece(row, col, engine.board, { includeCastling: false });
      if (piece.color === "white") {
        whiteMobility += pseudoMoves.length;
      } else {
        blackMobility += pseudoMoves.length;
      }
    }
  }

  // Mobility is weighted lightly to keep evaluation stable.
  const mobilityScore = (whiteMobility - blackMobility) * 0.035;

  // King pressure: in-check side is significantly worse.
  let kingPressure = 0;
  if (engine.isKingInCheck("white", engine.board)) {
    kingPressure -= 1.2;
  }
  if (engine.isKingInCheck("black", engine.board)) {
    kingPressure += 1.2;
  }

  return Number((boardScore + mobilityScore + kingPressure).toFixed(2));
}

export function materialScore(board) {
  let score = 0;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (!piece) {
        continue;
      }
      const value = PIECE_VALUES[piece.type] ?? 0;
      score += piece.color === "white" ? value : -value;
    }
  }
  return score;
}

export function scoreToBarPercent(score) {
  const clamped = Math.max(-12, Math.min(12, score));
  return ((clamped + 12) / 24) * 100;
}
