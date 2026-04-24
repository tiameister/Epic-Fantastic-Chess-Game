export const PIECE_ICONS = {
  white: {
    king: "♔",
    queen: "♕",
    rook: "♖",
    bishop: "♗",
    knight: "♘",
    pawn: "♙"
  },
  black: {
    king: "♚",
    queen: "♛",
    rook: "♜",
    bishop: "♝",
    knight: "♞",
    pawn: "♟"
  }
};

export const COLOR = {
  WHITE: "white",
  BLACK: "black"
};

export const STATE = {
  IN_PROGRESS: "In Progress",
  CHECK: "Check",
  CHECKMATE: "Checkmate",
  STALEMATE: "Stalemate",
  DRAW: "Draw",
  TIMEOUT: "Timeout",
  RESIGN: "Resign"
};

/** Piece types eligible for pawn promotion, in display order. */
export const PROMOTION_TYPES = ["queen", "rook", "bishop", "knight"];

/** Move quality thresholds (centipawn-equivalent deltas from the moving side's perspective). */
export const EVAL_THRESHOLDS = {
  BLUNDER: -1.8,
  MISTAKE: -0.8,
  GOOD: 0.45,
  GREAT: 1.2,
  WINNING: 6.0
};

/** Default game settings. */
export const DEFAULTS = {
  CLOCK_SECONDS: 600,
  BG_TARGET_SCORE: 7
};
