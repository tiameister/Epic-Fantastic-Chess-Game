/**
 * ChessHistoryManager
 *
 * Owns the timeline snapshot array, the current-ply cursor, and all UI
 * rendering for the move list, analysis scrubber, eval graph, and review list.
 */
export class ChessHistoryManager {
  /**
   * @param {{ historyList, analysisScrubber, evalGraph, reviewList }} els
   * @param {import('../chess-engine.js').ChessEngine} engine
   * @param {(ply: number, snapshot: object) => void} onNavigate
   */
  constructor(els, engine, onNavigate) {
    this._els        = els;
    this._engine     = engine;
    this._onNavigate = onNavigate;

    /** @type {object[]} */
    this._snapshots  = [];
    this._currentPly = 0;
    this._isViewing  = false;
  }

  // ─── Public getters ───────────────────────────────────────────────────────

  get snapshots()   { return this._snapshots; }
  get currentPly()  { return this._currentPly; }
  get length()      { return this._snapshots.length; }
  get isViewing()   { return this._isViewing; }

  // ─── Snapshot management ─────────────────────────────────────────────────

  /** Rebuild from the engine's current state (e.g. after reset or preset load). */
  rebuild() {
    this._snapshots  = [this._engine.getSnapshot()];
    this._currentPly = 0;
    this._isViewing  = false;
  }

  /** Append a snapshot after a move was committed. */
  push(snapshot) {
    this._snapshots.push(snapshot);
    this._currentPly = this._snapshots.length - 1;
    this._isViewing  = false;
  }

  /** Remove the last snapshot (undo). Returns false if nothing to pop. */
  pop() {
    if (this._snapshots.length <= 1) return false;
    this._snapshots.pop();
    this._currentPly = this._snapshots.length - 1;
    this._isViewing  = false;
    return true;
  }

  /** Navigate to a specific ply index. Calls onNavigate with the snapshot. */
  goTo(ply) {
    if (this._snapshots.length === 0) return;
    const clamped = Math.max(0, Math.min(ply, this._snapshots.length - 1));
    const snapshot = this._snapshots[clamped];
    if (!snapshot) return;

    this._engine.restoreSnapshot(snapshot);
    this._currentPly = clamped;
    this._isViewing  = clamped !== this._snapshots.length - 1;
    this._onNavigate(clamped, snapshot);
  }

  /** If currently viewing history, restore the engine to the latest snapshot. */
  exitViewIfNeeded() {
    if (!this._isViewing) return;
    const latest = this._snapshots[this._snapshots.length - 1];
    if (latest) this._engine.restoreSnapshot(latest);
    this._currentPly = this._snapshots.length - 1;
    this._isViewing  = false;
  }

  // ─── Rendering ───────────────────────────────────────────────────────────

  renderHistory(onPlyClick) {
    const list = this._els.historyList;
    if (!list) return;
    list.innerHTML = "";
    this._engine.moveHistory.forEach((move, index) => {
      const li = document.createElement("li");
      const turnNum = Math.floor(index / 2) + 1;
      const prefix  = index % 2 === 0 ? `${turnNum}.` : `${turnNum}...`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "history-move-btn";
      btn.textContent = `${prefix} ${move.san || move.notation}`;
      btn.addEventListener("click", () => onPlyClick(index + 1));
      li.appendChild(btn);
      list.appendChild(li);
    });
    list.scrollTop = list.scrollHeight;
  }

  renderAnalysis() {
    const scrubber = this._els.analysisScrubber;
    if (!scrubber) return;
    const max = Math.max(0, this._snapshots.length - 1);
    scrubber.max   = String(max);
    scrubber.value = String(Math.min(this._currentPly, max));
    this.drawEvalGraph();
    this.renderReviewList(this._badgeFn);
  }

  /** Provide a badge-lookup function from the UI layer. */
  setBadgeFn(fn) {
    this._badgeFn = fn;
  }

  drawEvalGraph() {
    const canvas = this._els.evalGraph;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(15,23,42,0.8)";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(148,163,184,0.4)";
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    const points = [{ ply: 0, score: 0 }];
    this._engine.moveHistory.forEach((move, index) => {
      points.push({ ply: index + 1, score: Number(move.evalAfter ?? 0) });
    });
    if (points.length < 2) return;

    const maxAbs = Math.max(1, ...points.map((p) => Math.min(10, Math.abs(p.score))));
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth   = 2;
    ctx.beginPath();
    points.forEach((point, i) => {
      const x = (point.ply / (points.length - 1)) * (width - 16) + 8;
      const normalized = Math.max(-10, Math.min(10, point.score)) / maxAbs;
      const y = (height / 2) - (normalized * (height / 2 - 12));
      if (i === 0) ctx.moveTo(x, y);
      else         ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  renderReviewList(getQualityBadge) {
    const list = this._els.reviewList;
    if (!list) return;
    list.innerHTML = "";
    this._engine.moveHistory.forEach((move, index) => {
      if (!move.quality || move.quality === "Neutral") return;
      const li    = document.createElement("li");
      const badge = document.createElement("span");
      badge.className   = "review-badge";
      badge.textContent = move.badge || (getQualityBadge ? getQualityBadge(move.quality) : "");
      const turnNum = Math.floor(index / 2) + 1;
      const better  = (move.quality === "Blunder" || move.quality === "Mistake")
        ? ` Better: ${move.bestMoveSan || move.bestMoveUci || "n/a"}`
        : "";
      li.textContent = `${turnNum}${index % 2 === 0 ? "." : "..."} ${move.san || move.notation} - ${move.quality}.${better}`;
      li.prepend(badge);
      list.appendChild(li);
    });
  }
}
