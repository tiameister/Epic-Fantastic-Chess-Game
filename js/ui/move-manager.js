/**
 * MoveManager — Centralised pathfinding and validated-intent system.
 *
 * Computes every destination reachable from a selected checker using
 * any valid combination of available dice, then validates each candidate
 * path against the engine's own legality filter so that rule constraints
 * (max-dice usage, higher-die preference) are always respected.
 *
 * The engine remains the ONLY mutation point; MoveManager is pure read.
 *
 * ─── Public API ──────────────────────────────────────────────────────────
 *
 *   mm.getDestinations(from)
 *     → Map<destination, PathInfo>
 *
 *     destination : number (board point) | "off"
 *     PathInfo    : { steps: Step[], isCombined: boolean }
 *     Step        : { from: number|"bar", to: number|"off", die: number }
 *
 *   mm.findPathTo(from, dest)
 *     → PathInfo | null
 *
 * ─────────────────────────────────────────────────────────────────────────
 */
export class MoveManager {
  constructor(engine) {
    this._engine = engine;
  }

  /**
   * Returns every board point (and "off") reachable from `from` using any
   * valid single-die or combined-dice move.
   *
   * Only destinations whose FIRST step is sanctioned by engine.getLegalMoves()
   * are included, ensuring all standard backgammon rules are honoured without
   * duplicating the engine's max-movable / higher-die logic here.
   */
  getDestinations(from) {
    const engine = this._engine;
    const player = engine.turn;
    const state  = this._snap();
    const dice   = [...engine.movesLeft];

    // Recursively explore every reachable point.
    const allPaths = new Map(); // destination → Path[]
    this._explore(from, state, dice, player, [], allPaths);

    // Ask the engine which first steps are legally sanctioned.
    const legalFirst     = engine.getLegalMoves().filter(m => m.from === from);
    const legalFirstDest = new Set(legalFirst.map(m => m.to));

    const result = new Map();

    for (const [dest, paths] of allPaths) {
      // A path is valid only if its first intermediate stop (or the destination
      // itself for a single-die move) is in the engine's legal-move set.
      const valid = paths.filter(p => legalFirstDest.has(p.steps[0].to));
      if (!valid.length) continue;

      // Among valid paths prefer the one using the most dice (greedy).
      const best = valid.reduce((a, b) =>
        b.steps.length > a.steps.length ? b : a
      );

      result.set(dest, { steps: best.steps, isCombined: best.steps.length > 1 });
    }

    return result;
  }

  /** Shorthand: find PathInfo for one specific destination, or null. */
  findPathTo(from, dest) {
    return this.getDestinations(from).get(dest) ?? null;
  }

  // ─── Private ──────────────────────────────────────────────────────────

  /**
   * Recursive DFS over the board.  For every die value (deduped to avoid
   * redundant branches on doubles) compute the landing point, validate
   * accessibility, record the path, then recurse from the intermediate stop.
   */
  _explore(from, state, dice, player, stepsSoFar, result) {
    const tried = new Set();

    for (let i = 0; i < dice.length; i++) {
      const die = dice[i];
      if (tried.has(die)) continue; // dedupe identical dice values
      tried.add(die);

      const { to, isBearOff } = this._computeDest(from, die, player, state);
      if (to === null) continue;

      const step     = { from, to, die };
      const newSteps = [...stepsSoFar, step];

      if (!result.has(to)) result.set(to, []);
      result.get(to).push({ steps: newSteps });

      // Continue from the intermediate point (bear-offs don't continue).
      if (!isBearOff && dice.length > 1) {
        const nextState = this._engine.applyMoveToState(
          state, { from, to, die, idx: i }, player
        );
        const nextDice = dice.filter((_, k) => k !== i);
        this._explore(to, nextState, nextDice, player, newSteps, result);
      }
    }
  }

  /**
   * Compute where a single die lands from `from`, respecting board boundaries
   * and bear-off eligibility.  Returns { to, isBearOff } or { to: null } if
   * the destination is blocked or illegal.
   */
  _computeDest(from, die, player, state) {
    const e = this._engine;

    if (from === "bar") {
      const to = e.entryPoint(die, player);
      return e.isOpenFor(to, player, state)
        ? { to, isBearOff: false }
        : { to: null };
    }

    const raw = e.destination(from, die, player);

    if (raw >= 1 && raw <= 24) {
      return e.isOpenFor(raw, player, state)
        ? { to: raw, isBearOff: false }
        : { to: null };
    }

    // Out of board range — potentially a bear-off.
    return e.isHigherBearOffAllowed(from, die, player, state)
      ? { to: "off", isBearOff: true }
      : { to: null };
  }

  /** Snapshot the engine's board state without mutating it. */
  _snap() {
    return {
      points: [...this._engine.points],
      bar:    { ...this._engine.bar },
      off:    { ...this._engine.off },
    };
  }
}
