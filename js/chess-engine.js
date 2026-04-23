import { COLOR, STATE } from "./constants.js";

const BACK_RANK = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

export class ChessEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.board = this.createInitialBoard();
    this.turn = COLOR.WHITE;
    this.gameState = STATE.IN_PROGRESS;
    this.winner = null;
    this.lastMove = null;
    this.enPassantTarget = null;
    this.moveHistory = [];
    this.snapshotHistory = [];
  }

  charToPiece(char, preserveCastling = false) {
    const isUpper = char === char.toUpperCase();
    const color = isUpper ? COLOR.WHITE : COLOR.BLACK;
    const map = {
      k: "king",
      q: "queen",
      r: "rook",
      b: "bishop",
      n: "knight",
      p: "pawn"
    };
    const type = map[char.toLowerCase()];
    if (!type) {
      return null;
    }
    return {
      type,
      color,
      hasMoved: !preserveCastling
    };
  }

  loadFenPlacement(fenPlacement, turn = COLOR.WHITE, preserveCastling = false) {
    const rows = fenPlacement.split("/");
    if (rows.length !== 8) {
      return false;
    }

    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let r = 0; r < 8; r += 1) {
      let col = 0;
      for (const token of rows[r]) {
        if (/\d/.test(token)) {
          col += Number(token);
          continue;
        }
        const piece = this.charToPiece(token, preserveCastling);
        if (!piece || col > 7) {
          return false;
        }
        board[r][col] = piece;
        col += 1;
      }
      if (col !== 8) {
        return false;
      }
    }

    this.board = board;
    this.turn = turn;
    this.gameState = STATE.IN_PROGRESS;
    this.winner = null;
    this.lastMove = null;
    this.enPassantTarget = null;
    this.moveHistory = [];
    this.snapshotHistory = [];
    this.evaluateGameState();
    return true;
  }

  createInitialBoard() {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let c = 0; c < 8; c += 1) {
      board[0][c] = this.makePiece(BACK_RANK[c], COLOR.BLACK);
      board[1][c] = this.makePiece("pawn", COLOR.BLACK);
      board[6][c] = this.makePiece("pawn", COLOR.WHITE);
      board[7][c] = this.makePiece(BACK_RANK[c], COLOR.WHITE);
    }
    return board;
  }

  makePiece(type, color) {
    return { type, color, hasMoved: false };
  }

  isInside(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }

  opposite(color) {
    return color === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE;
  }

  cloneBoard(board = this.board) {
    return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
  }

  getPiece(row, col, board = this.board) {
    if (!this.isInside(row, col)) {
      return null;
    }
    return board[row][col];
  }

  getPseudoMovesForPiece(row, col, board = this.board, options = { includeCastling: true }) {
    const piece = this.getPiece(row, col, board);
    if (!piece) {
      return [];
    }

    switch (piece.type) {
      case "pawn":
        return this.getPawnMoves(row, col, piece, board);
      case "knight":
        return this.getKnightMoves(row, col, piece, board);
      case "bishop":
        return this.getSlidingMoves(row, col, piece, board, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
      case "rook":
        return this.getSlidingMoves(row, col, piece, board, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
      case "queen":
        return this.getSlidingMoves(row, col, piece, board, [
          [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]
        ]);
      case "king":
        return this.getKingMoves(row, col, piece, board, options.includeCastling);
      default:
        return [];
    }
  }

  getPawnMoves(row, col, piece, board) {
    const moves = [];
    const dir = piece.color === COLOR.WHITE ? -1 : 1;
    const startRow = piece.color === COLOR.WHITE ? 6 : 1;
    const oneStep = row + dir;

    if (this.isInside(oneStep, col) && !this.getPiece(oneStep, col, board)) {
      moves.push({ row: oneStep, col, isCapture: false });
      const twoStep = row + 2 * dir;
      if (row === startRow && this.isInside(twoStep, col) && !this.getPiece(twoStep, col, board)) {
        moves.push({ row: twoStep, col, isCapture: false });
      }
    }

    for (const deltaCol of [-1, 1]) {
      const targetRow = row + dir;
      const targetCol = col + deltaCol;
      if (!this.isInside(targetRow, targetCol)) {
        continue;
      }
      const target = this.getPiece(targetRow, targetCol, board);
      if (target && target.color !== piece.color) {
        moves.push({ row: targetRow, col: targetCol, isCapture: true });
      }
    }

    if (board === this.board && this.enPassantTarget) {
      const ep = this.enPassantTarget;
      if (ep.captureColor === piece.color && ep.row === row + dir && Math.abs(ep.col - col) === 1) {
        moves.push({
          row: ep.row,
          col: ep.col,
          isCapture: true,
          isEnPassant: true,
          capturedPawn: { row: ep.pawnRow, col: ep.pawnCol }
        });
      }
    }

    return moves;
  }

  getKnightMoves(row, col, piece, board) {
    const moves = [];
    const jumps = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];

    for (const [dr, dc] of jumps) {
      const nr = row + dr;
      const nc = col + dc;
      if (!this.isInside(nr, nc)) {
        continue;
      }
      const target = this.getPiece(nr, nc, board);
      if (!target) {
        moves.push({ row: nr, col: nc, isCapture: false });
      } else if (target.color !== piece.color) {
        moves.push({ row: nr, col: nc, isCapture: true });
      }
    }

    return moves;
  }

  getSlidingMoves(row, col, piece, board, directions) {
    const moves = [];
    for (const [dr, dc] of directions) {
      let nr = row + dr;
      let nc = col + dc;
      while (this.isInside(nr, nc)) {
        const target = this.getPiece(nr, nc, board);
        if (!target) {
          moves.push({ row: nr, col: nc, isCapture: false });
        } else {
          if (target.color !== piece.color) {
            moves.push({ row: nr, col: nc, isCapture: true });
          }
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
    return moves;
  }

  getKingMoves(row, col, piece, board, includeCastling = true) {
    const moves = [];
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) {
          continue;
        }
        const nr = row + dr;
        const nc = col + dc;
        if (!this.isInside(nr, nc)) {
          continue;
        }
        const target = this.getPiece(nr, nc, board);
        if (!target) {
          moves.push({ row: nr, col: nc, isCapture: false });
        } else if (target.color !== piece.color) {
          moves.push({ row: nr, col: nc, isCapture: true });
        }
      }
    }

    if (includeCastling && board === this.board && !piece.hasMoved && !this.isKingInCheck(piece.color, board)) {
      const enemyColor = this.opposite(piece.color);
      const kingSide = this.getCastleMove(row, col, piece, board, "king", enemyColor);
      const queenSide = this.getCastleMove(row, col, piece, board, "queen", enemyColor);
      if (kingSide) {
        moves.push(kingSide);
      }
      if (queenSide) {
        moves.push(queenSide);
      }
    }
    return moves;
  }

  getCastleMove(row, col, piece, board, side, enemyColor) {
    const rookCol = side === "king" ? 7 : 0;
    const step = side === "king" ? 1 : -1;
    const rook = this.getPiece(row, rookCol, board);
    if (!rook || rook.type !== "rook" || rook.color !== piece.color || rook.hasMoved) {
      return null;
    }

    const edgeCol = side === "king" ? 6 : 1;
    for (let c = col + step; step > 0 ? c <= edgeCol : c >= edgeCol; c += step) {
      if (this.getPiece(row, c, board)) {
        return null;
      }
      if ((side === "king" || c >= 2) && this.isSquareAttacked(row, c, enemyColor, board)) {
        return null;
      }
    }

    const throughSquares = side === "king" ? [5, 6] : [3, 2];
    for (const squareCol of throughSquares) {
      if (this.isSquareAttacked(row, squareCol, enemyColor, board)) {
        return null;
      }
    }

    return {
      row,
      col: side === "king" ? 6 : 2,
      isCapture: false,
      isCastle: true,
      rookFrom: { row, col: rookCol },
      rookTo: { row, col: side === "king" ? 5 : 3 }
    };
  }

  applyMoveOnBoard(board, from, to, moveMeta = null) {
    const nextBoard = this.cloneBoard(board);
    const piece = nextBoard[from.row][from.col];
    const move = moveMeta || {};

    if (move.isEnPassant && move.capturedPawn) {
      nextBoard[move.capturedPawn.row][move.capturedPawn.col] = null;
    }

    nextBoard[to.row][to.col] = piece;
    nextBoard[from.row][from.col] = null;
    piece.hasMoved = true;

    if (move.isCastle && move.rookFrom && move.rookTo) {
      const rook = nextBoard[move.rookFrom.row][move.rookFrom.col];
      nextBoard[move.rookFrom.row][move.rookFrom.col] = null;
      nextBoard[move.rookTo.row][move.rookTo.col] = rook;
      if (rook) {
        rook.hasMoved = true;
      }
    }

    if (piece.type === "pawn" && (to.row === 0 || to.row === 7)) {
      piece.type = "queen";
    }
    return nextBoard;
  }

  findKing(color, board = this.board) {
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = this.getPiece(row, col, board);
        if (piece && piece.type === "king" && piece.color === color) {
          return { row, col };
        }
      }
    }
    return null;
  }

  isKingInCheck(color, board = this.board) {
    const kingPos = this.findKing(color, board);
    if (!kingPos) {
      return false;
    }

    const enemyColor = this.opposite(color);
    return this.isSquareAttacked(kingPos.row, kingPos.col, enemyColor, board);
  }

  isSquareAttacked(row, col, byColor, board = this.board) {
    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        const piece = this.getPiece(r, c, board);
        if (!piece || piece.color !== byColor) {
          continue;
        }

        if (piece.type === "pawn") {
          const dir = piece.color === COLOR.WHITE ? -1 : 1;
          for (const dc of [-1, 1]) {
            if (r + dir === row && c + dc === col) {
              return true;
            }
          }
          continue;
        }

        const moves = this.getPseudoMovesForPiece(r, c, board, { includeCastling: false });
        if (moves.some((move) => move.row === row && move.col === col)) {
          return true;
        }
      }
    }
    return false;
  }

  getLegalMoves(row, col) {
    const piece = this.getPiece(row, col, this.board);
    if (!piece || piece.color !== this.turn) {
      return [];
    }

    const candidateMoves = this.getPseudoMovesForPiece(row, col, this.board);
    return candidateMoves.filter((move) => {
      const simulated = this.applyMoveOnBoard(
        this.board,
        { row, col },
        { row: move.row, col: move.col },
        move
      );
      return !this.isKingInCheck(piece.color, simulated);
    });
  }

  hasAnyLegalMove(color) {
    const originalTurn = this.turn;
    this.turn = color;
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = this.getPiece(row, col, this.board);
        if (!piece || piece.color !== color) {
          continue;
        }
        if (this.getLegalMoves(row, col).length > 0) {
          this.turn = originalTurn;
          return true;
        }
      }
    }
    this.turn = originalTurn;
    return false;
  }

  evaluateGameState() {
    const inCheck = this.isKingInCheck(this.turn, this.board);
    const hasMove = this.hasAnyLegalMove(this.turn);

    if (!hasMove && inCheck) {
      this.gameState = STATE.CHECKMATE;
      this.winner = this.opposite(this.turn);
      return;
    }
    if (!hasMove) {
      this.gameState = STATE.STALEMATE;
      this.winner = null;
      return;
    }
    if (inCheck) {
      this.gameState = STATE.CHECK;
      this.winner = null;
      return;
    }
    this.gameState = STATE.IN_PROGRESS;
    this.winner = null;
  }

  move(from, to) {
    const legalMoves = this.getLegalMoves(from.row, from.col);
    const chosen = legalMoves.find((m) => m.row === to.row && m.col === to.col);
    if (!chosen) {
      return { ok: false, reason: "Illegal move." };
    }

    const movingPiece = this.getPiece(from.row, from.col, this.board);
    const targetBeforeMove = this.getPiece(to.row, to.col, this.board);
    this.snapshotHistory.push(this.getSnapshot());
    this.board = this.applyMoveOnBoard(this.board, from, to, chosen);
    this.lastMove = {
      from,
      to,
      meta: {
        isCapture: Boolean(targetBeforeMove) || Boolean(chosen.isEnPassant),
        isCastle: Boolean(chosen.isCastle),
        isEnPassant: Boolean(chosen.isEnPassant)
      }
    };
    this.updateEnPassantTarget(movingPiece, from, to);
    this.turn = this.opposite(this.turn);
    this.evaluateGameState();
    this.pushMoveHistory(movingPiece, from, to, chosen, targetBeforeMove);
    return { ok: true };
  }

  updateEnPassantTarget(piece, from, to) {
    this.enPassantTarget = null;
    if (!piece || piece.type !== "pawn") {
      return;
    }
    if (Math.abs(to.row - from.row) === 2) {
      this.enPassantTarget = {
        row: (from.row + to.row) / 2,
        col: from.col,
        pawnRow: to.row,
        pawnCol: to.col,
        captureColor: this.opposite(piece.color)
      };
    }
  }

  pushMoveHistory(piece, from, to, move, target) {
    const capture = Boolean(target) || Boolean(move.isEnPassant);
    const pieceSymbolMap = {
      king: "K",
      queen: "Q",
      rook: "R",
      bishop: "B",
      knight: "N",
      pawn: ""
    };
    const pieceSymbol = pieceSymbolMap[piece.type] ?? "";
    const file = String.fromCharCode(97 + to.col);
    const rank = 8 - to.row;
    let notation = `${pieceSymbol}${capture ? "x" : ""}${file}${rank}`;

    if (piece.type === "pawn" && capture) {
      const fromFile = String.fromCharCode(97 + from.col);
      notation = `${fromFile}x${file}${rank}`;
    }

    if (move.isCastle) {
      notation = to.col === 6 ? "O-O" : "O-O-O";
    }

    if (this.gameState === STATE.CHECKMATE) {
      notation += "#";
    } else if (this.gameState === STATE.CHECK) {
      notation += "+";
    }

    this.moveHistory.push({
      turn: piece.color,
      from,
      to,
      notation
    });
  }

  getSnapshot() {
    return {
      board: this.cloneBoard(this.board),
      turn: this.turn,
      gameState: this.gameState,
      winner: this.winner,
      lastMove: this.lastMove
        ? {
          from: { ...this.lastMove.from },
          to: { ...this.lastMove.to },
          meta: this.lastMove.meta ? { ...this.lastMove.meta } : null
        }
        : null,
      enPassantTarget: this.enPassantTarget ? { ...this.enPassantTarget } : null,
      moveHistory: this.moveHistory.map((m) => ({
        ...m,
        from: { ...m.from },
        to: { ...m.to }
      }))
    };
  }

  restoreSnapshot(snapshot) {
    this.board = this.cloneBoard(snapshot.board);
    this.turn = snapshot.turn;
    this.gameState = snapshot.gameState;
    this.winner = snapshot.winner;
    this.lastMove = snapshot.lastMove
      ? {
        from: { ...snapshot.lastMove.from },
        to: { ...snapshot.lastMove.to },
        meta: snapshot.lastMove.meta ? { ...snapshot.lastMove.meta } : null
      }
      : null;
    this.enPassantTarget = snapshot.enPassantTarget ? { ...snapshot.enPassantTarget } : null;
    this.moveHistory = snapshot.moveHistory.map((m) => ({
      ...m,
      from: { ...m.from },
      to: { ...m.to }
    }));
  }

  undo() {
    if (this.snapshotHistory.length === 0) {
      return false;
    }
    const previous = this.snapshotHistory.pop();
    this.restoreSnapshot(previous);
    return true;
  }

  endByTimeout(loserColor) {
    this.gameState = STATE.TIMEOUT;
    this.winner = this.opposite(loserColor);
  }
}
