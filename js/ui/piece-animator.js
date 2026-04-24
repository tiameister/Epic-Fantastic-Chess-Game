/**
 * PieceAnimator — smooth Lerp movement for chess pieces.
 *
 * Usage pattern (call sites in ChessUI):
 *
 *   // 1. Before engine.move() — snapshot the from-square
 *   this.pieceAnimator.prepare(boardEl, fromRow, fromCol);
 *
 *   // 2. After render() rebuilds the board — play the ghost overlay
 *   await this.pieceAnimator.play(boardEl, boardFrame, toRow, toCol);
 *
 * The ghost element overlays the freshly-rendered board and travels
 * from the captured from-rect to the to-rect, giving the illusion of
 * smooth movement without blocking DOM consistency.
 */
export class PieceAnimator {
  constructor() {
    this._pending = null; // { icon, colorClass, fromRect }
  }

  /**
   * Snapshot the source square's position and glyph BEFORE the board rebuilds.
   * Must be called while the old DOM still reflects the position.
   */
  prepare(boardEl, fromRow, fromCol) {
    const sq = boardEl.querySelector(`[data-row="${fromRow}"][data-col="${fromCol}"]`);
    if (!sq) { this._pending = null; return; }

    const pieceEl = sq.querySelector(".piece");
    if (!pieceEl) { this._pending = null; return; }

    this._pending = {
      icon: pieceEl.textContent,
      colorClass: pieceEl.classList.contains("light") ? "light" : "dark",
      fromRect: sq.getBoundingClientRect(),
    };
  }

  /**
   * Spawn and animate the ghost piece from the captured from-rect to the
   * current position of the to-square.  Returns a Promise that resolves
   * when the animation is complete (≈ 220 ms).
   */
  async play(boardEl, boardFrame, toRow, toCol) {
    const pending = this._pending;
    this._pending = null;
    if (!pending || !boardFrame) return;

    const toSq = boardEl.querySelector(`[data-row="${toRow}"][data-col="${toCol}"]`);
    if (!toSq) return;

    const toRect = toSq.getBoundingClientRect();
    const frameRect = boardFrame.getBoundingClientRect();

    // Position the ghost at the centre of the from-square (relative to the frame)
    const startX = pending.fromRect.left - frameRect.left + pending.fromRect.width  / 2;
    const startY = pending.fromRect.top  - frameRect.top  + pending.fromRect.height / 2;
    const endX   = toRect.left   - frameRect.left + toRect.width   / 2;
    const endY   = toRect.top    - frameRect.top  + toRect.height  / 2;

    const dx = endX - startX;
    const dy = endY - startY;

    // If the piece barely moved (undo edge case) skip the animation
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;

    const ghost = document.createElement("span");
    ghost.className = `piece ${pending.colorClass} anim-ghost-piece`;
    ghost.textContent = pending.icon;
    ghost.style.left = `${startX}px`;
    ghost.style.top  = `${startY}px`;
    boardFrame.appendChild(ghost);

    // Hide the real piece in the destination square while the ghost arrives
    const realPiece = toSq.querySelector(".piece");
    if (realPiece) realPiece.style.opacity = "0";

    const dist   = Math.hypot(dx, dy);
    const dur    = Math.max(140, Math.min(280, dist * 0.45)); // scale duration to distance

    await ghost.animate(
      [
        { transform: "translate(-50%, -50%) scale(1.08)",   opacity: 0.92, offset: 0    },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 1,    offset: 1    },
      ],
      { duration: dur, easing: "cubic-bezier(0.17, 0.67, 0.36, 1)", fill: "forwards" }
    ).finished;

    ghost.remove();
    if (realPiece) realPiece.style.opacity = "";
  }

  /**
   * Animate a captured piece with a burst-and-shrink effect (called on
   * the capture square BEFORE the board rebuilds so the old piece is visible).
   */
  async animateCapture(boardEl, boardFrame, captureRow, captureCol) {
    const sq = boardEl.querySelector(`[data-row="${captureRow}"][data-col="${captureCol}"]`);
    if (!sq) return;

    const pieceEl = sq.querySelector(".piece");
    if (!pieceEl) return;

    const rect      = sq.getBoundingClientRect();
    const frameRect = boardFrame.getBoundingClientRect();
    const cx        = rect.left - frameRect.left + rect.width  / 2;
    const cy        = rect.top  - frameRect.top  + rect.height / 2;

    const ghost = document.createElement("span");
    ghost.className = `piece ${pieceEl.classList.contains("light") ? "light" : "dark"} anim-ghost-piece`;
    ghost.textContent = pieceEl.textContent;
    ghost.style.left = `${cx}px`;
    ghost.style.top  = `${cy}px`;
    boardFrame.appendChild(ghost);

    ghost.animate(
      [
        { transform: "translate(-50%, -50%) scale(1)",   opacity: 0.9, offset: 0 },
        { transform: "translate(-50%, -56%) scale(1.15)", opacity: 1,   offset: 0.15 },
        { transform: "translate(-50%, -50%) scale(0.1)",  opacity: 0,   offset: 1 },
      ],
      { duration: 320, easing: "cubic-bezier(0.4, 0, 0.6, 1)", fill: "forwards" }
    ).finished.then(() => ghost.remove());
  }
}
