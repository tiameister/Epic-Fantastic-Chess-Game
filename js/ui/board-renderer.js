import { COLOR, PIECE_ICONS, STATE } from "../constants.js";

/**
 * ChessBoardRenderer
 *
 * Owns the board DOM and the squareElements cache. Receives all the data it
 * needs on each render() call so it stays decoupled from ChessUI internal state.
 */
export class ChessBoardRenderer {
  constructor({ board, particleLayer, boardFrame }) {
    this.boardEl = board;
    this.particleLayer = particleLayer;
    this.boardFrame = boardFrame;
    /** @type {Map<string, HTMLElement>} */
    this.squareElements = new Map();
    this._lastRenderKey = "";
  }

  /**
   * Re-renders the board only when the visual state has changed.
   * @param {{ engine, selected, legalMoves, orientation }} ctx
   */
  render(ctx) {
    const { engine, selected, legalMoves, orientation } = ctx;
    const key = this._buildKey(engine, selected, legalMoves, orientation);
    if (key === this._lastRenderKey) return;
    this._lastRenderKey = key;
    this._buildBoard(engine, selected, legalMoves, orientation);
  }

  /** Force-invalidates the cached render key so the next render() always repaints. */
  invalidate() {
    this._lastRenderKey = "";
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  _buildKey(engine, selected, legalMoves, orientation) {
    const sel = selected ? `${selected.row},${selected.col}` : "-";
    const legal = legalMoves.map((m) => `${m.row},${m.col}`).join("|");
    const last = engine.lastMove
      ? `${engine.lastMove.from.row},${engine.lastMove.from.col}:${engine.lastMove.to.row},${engine.lastMove.to.col}`
      : "-";
    return [engine.serializeBoard(), orientation, sel, legal, last, engine.gameState].join(";");
  }

  _buildBoard(engine, selected, legalMoves, orientation) {
    this.boardEl.innerHTML = "";
    this.squareElements.clear();

    const checkSquare = engine.gameState === STATE.CHECK
      ? engine.findKing(engine.turn, engine.board)
      : null;

    const rows = orientation === COLOR.WHITE
      ? [...Array(8).keys()]
      : [...Array(8).keys()].reverse();
    const cols = orientation === COLOR.WHITE
      ? [...Array(8).keys()]
      : [...Array(8).keys()].reverse();

    for (const row of rows) {
      for (const col of cols) {
        const square = this._buildSquare(row, col, engine, selected, legalMoves, checkSquare, orientation);
        this.boardEl.appendChild(square);
        this.squareElements.set(`${row},${col}`, square);
      }
    }
  }

  _buildSquare(row, col, engine, selected, legalMoves, checkSquare, orientation) {
    const square = document.createElement("div");
    square.className = `square ${(row + col) % 2 === 0 ? "white" : "black"}`;
    square.dataset.row = String(row);
    square.dataset.col = String(col);
    square.setAttribute("role", "button");
    square.setAttribute("tabindex", "0");
    square.setAttribute("aria-label", `Square ${String.fromCharCode(97 + col)}${8 - row}`);

    if (selected && selected.row === row && selected.col === col) {
      square.classList.add("selected");
    }

    if (engine.lastMove) {
      const { from, to, meta } = engine.lastMove;
      if ((from.row === row && from.col === col) || (to.row === row && to.col === col)) {
        square.classList.add("last-move");
      }
      if (to.row === row && to.col === col) {
        square.classList.add("just-moved");
        if (meta?.isCapture) square.classList.add("capture-hit");
      }
    }

    const candidate = legalMoves.find((m) => m.row === row && m.col === col);
    if (candidate) {
      square.classList.add(candidate.isCapture ? "capture" : "move");
    }

    if (checkSquare && checkSquare.row === row && checkSquare.col === col) {
      square.classList.add("in-check");
    }

    const piece = engine.getPiece(row, col, engine.board);
    if (piece) {
      const pieceNode = document.createElement("span");
      pieceNode.className = `piece ${piece.color === COLOR.WHITE ? "light" : "dark"}`;
      pieceNode.textContent = PIECE_ICONS[piece.color][piece.type];
      square.appendChild(pieceNode);
    }

    // Predictive ghost: show semi-transparent copy of the moving piece on
    // each legal non-capture destination so the player can "see" the move.
    if (candidate && !candidate.isCapture && selected && !piece) {
      const movingPiece = engine.getPiece(selected.row, selected.col, engine.board);
      if (movingPiece) {
        const ghost = document.createElement("span");
        ghost.className = `piece ${movingPiece.color === COLOR.WHITE ? "light" : "dark"} ghost-piece`;
        ghost.setAttribute("aria-hidden", "true");
        ghost.textContent = PIECE_ICONS[movingPiece.color][movingPiece.type];
        square.appendChild(ghost);
      }
    }

    const isBottomRank = orientation === COLOR.WHITE ? row === 7 : row === 0;
    const isLeftFile  = orientation === COLOR.WHITE ? col === 0 : col === 7;

    if (isBottomRank) {
      const fileLabel = document.createElement("span");
      fileLabel.className = "coord file";
      fileLabel.textContent = String.fromCharCode(97 + (orientation === COLOR.WHITE ? col : 7 - col));
      square.appendChild(fileLabel);
    }
    if (isLeftFile) {
      const rankLabel = document.createElement("span");
      rankLabel.className = "coord rank";
      rankLabel.textContent = String(orientation === COLOR.WHITE ? 8 - row : row + 1);
      square.appendChild(rankLabel);
    }

    return square;
  }

  // ─── Effects ─────────────────────────────────────────────────────────────

  spawnCaptureParticles(row, col, capturedColor) {
    const squareEl = this.squareElements.get(`${row},${col}`);
    if (!squareEl || !this.particleLayer || !this.boardFrame) return;

    const squareRect = squareEl.getBoundingClientRect();
    const frameRect  = this.boardFrame.getBoundingClientRect();
    const centerX = squareRect.left - frameRect.left + squareRect.width  / 2;
    const centerY = squareRect.top  - frameRect.top  + squareRect.height / 2;
    const baseColor = capturedColor === COLOR.WHITE ? "#f8fafc" : "#111827";

    for (let i = 0; i < 22; i += 1) {
      const particle = document.createElement("span");
      particle.className = "capture-particle";
      const size  = 3 + Math.random() * 5;
      const drift = (Math.random() - 0.5) * 70;
      const rise  = -20 - Math.random() * 70;
      const fall  = 80  + Math.random() * 120;
      particle.style.cssText = `
        width:${size}px; height:${size}px;
        left:${centerX}px; top:${centerY}px;
        background:${baseColor};
        --drift:${drift}px; --rise:${rise}px; --fall:${fall}px;
      `;
      this.particleLayer.appendChild(particle);
      window.setTimeout(() => particle.remove(), 900);
    }
  }

  applyMoveQualityEffects(assessment) {
    if (!assessment || !this.boardFrame) return;

    const flash = (cls, duration) => {
      this.boardFrame.classList.remove(cls);
      void this.boardFrame.offsetWidth;
      this.boardFrame.classList.add(cls);
      window.setTimeout(() => this.boardFrame.classList.remove(cls), duration);
    };

    if (assessment.label === "Blunder") {
      this.boardFrame.classList.remove("blunder-hit", "glitch-hit");
      void this.boardFrame.offsetWidth;
      this.boardFrame.classList.add("blunder-hit", "glitch-hit");
      window.setTimeout(() => this.boardFrame.classList.remove("blunder-hit", "glitch-hit"), 420);
    }
    if (assessment.isHighValueCapture) flash("blunder-hit", 240);
    if (assessment.shouldMock)         flash("glitch-hit", 320);
  }
}
