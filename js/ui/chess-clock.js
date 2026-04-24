import { STATE } from "../constants.js";

/**
 * ChessClock
 *
 * Owns all clock state (timers, remaining time, increment/delay) and the
 * rendering of the two time labels. Emits timeout via an onTimeout callback.
 */
export class ChessClock {
  /**
   * @param {{ whiteTimeLabel, blackTimeLabel, pauseClockBtn, timeControl }} els
   * @param {import('../chess-engine.js').ChessEngine} engine
   * @param {(loserColor: string) => void} onTimeout
   */
  constructor(els, engine, onTimeout) {
    this._els     = els;
    this._engine  = engine;
    this._onTimeout = onTimeout;

    this.timeRemaining  = { white: 600, black: 600 };
    this.snapshotHistory = [];
    this._timerId       = null;
    this._isPaused      = false;
    this._hasStarted    = false;
    this._isUntimed     = false;
    this._incrementSeconds = 0;
    this._delaySeconds     = 0;
    this._activeDelay      = 0;
  }

  // ─── Public getters ───────────────────────────────────────────────────────

  get isPaused()         { return this._isPaused; }
  get hasStarted()       { return this._hasStarted; }
  set hasStarted(v)      { this._hasStarted = v; }
  get isUntimed()        { return this._isUntimed; }
  get incrementSeconds() { return this._incrementSeconds; }
  get delaySeconds()     { return this._delaySeconds; }

  // ─── Control ─────────────────────────────────────────────────────────────

  reset() {
    const raw = String(this._els.timeControl.value || "600|0|0").split("|");
    const base = Number(raw[0] ?? 600);
    this._incrementSeconds = Number(raw[1] ?? 0);
    this._delaySeconds     = Number(raw[2] ?? 0);
    this._activeDelay      = this._delaySeconds;
    this._isUntimed        = base <= 0;
    this.timeRemaining     = { white: base, black: base };
    this._isPaused         = false;
    this._els.pauseClockBtn.textContent = "Pause Clock";
    this.stop();
  }

  start() {
    this.stop();
    if (!this._hasStarted || this._isPaused || this._isUntimed) return;
    if (this._engine.isGameOver()) return;
    if (this.timeRemaining.white <= 0 && this.timeRemaining.black <= 0) return;

    this._activeDelay = this._delaySeconds;
    this._timerId = window.setInterval(() => this._tick(), 1000);
  }

  stop() {
    if (this._timerId) {
      window.clearInterval(this._timerId);
      this._timerId = null;
    }
  }

  toggle() {
    if (this._engine.isGameOver()) return;

    this._isPaused = !this._isPaused;
    this._els.pauseClockBtn.textContent = this._isPaused ? "Resume Clock" : "Pause Clock";

    if (this._isPaused) {
      this.stop();
      return "paused";
    }
    this.start();
    return "resumed";
  }

  /** Call after each move to add increment to the side that just moved. */
  addIncrement(color) {
    if (!this._isUntimed && this._incrementSeconds > 0) {
      this.timeRemaining[color] += this._incrementSeconds;
    }
    this._activeDelay = this._delaySeconds;
  }

  /** Snapshot current times for undo history. */
  snapshot() {
    return { ...this.timeRemaining };
  }

  /** Push a snapshot onto the history stack. */
  pushSnapshot(snap) {
    this.snapshotHistory.push(snap);
  }

  /** Pop and restore the most recent snapshot. Returns false if none. */
  popSnapshot() {
    const snap = this.snapshotHistory.pop();
    if (!snap) return false;
    this.timeRemaining.white = snap.white;
    this.timeRemaining.black = snap.black;
    return true;
  }

  // ─── Rendering ───────────────────────────────────────────────────────────

  render() {
    if (this._isUntimed) {
      this._els.whiteTimeLabel.textContent = "∞";
      this._els.blackTimeLabel.textContent = "∞";
      return;
    }
    this._els.whiteTimeLabel.textContent = this._formatTime(this.timeRemaining.white);
    this._els.blackTimeLabel.textContent = this._formatTime(this.timeRemaining.black);
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  _tick() {
    const side = this._engine.turn;
    if (this._activeDelay > 0) {
      this._activeDelay -= 1;
      this.render();
      return;
    }
    this.timeRemaining[side] = Math.max(0, this.timeRemaining[side] - 1);
    this.render();
    if (this.timeRemaining[side] <= 0) {
      this.stop();
      this._onTimeout(side);
    }
  }

  _formatTime(seconds) {
    const safe = Math.max(0, seconds);
    const m = Math.floor(safe / 60).toString().padStart(2, "0");
    const s = (safe % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }
}
