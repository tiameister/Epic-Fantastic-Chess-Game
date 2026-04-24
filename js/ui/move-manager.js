/**
 * MoveManager — Centralised pathfinding for the Backgammon UI.
 *
 * Computes every destination reachable from a selected checker using any
 * legal combination of available dice.
 *
 * Design principle:
 *   Step 1  — Engine authority: only first moves returned by
 *             engine.getLegalMoves() are used as starting points.  This
 *             automatically enforces all standard rules: bar-entry priority,
 *             max-dice-usage constraint, higher-die-first preference.
 *
 *   Step 2+ — Free extension: subsequent steps use engine.getAllSingleMoves()
 *             on the simulated post-first-move state, without re-running the
 *             expensive max-depth filter on every intermediate position.
 *
 * Public API:
 *   mm.getDestinations(from)
 *     → Map<destination, PathInfo>
 *
 *     destination : number (board point) | "off"
 *     PathInfo    : { steps: Step[], isCombined: boolean }
 *     Step        : { from: number|"bar", to: number|"off", die: number }
 */
export class MoveManager {
  constructor(engine) {
    this._engine = engine;
  }

  /**
   * Returns every board point (and "off") reachable from `from` using any
   * valid single-die or multi-die combination.
   *
   * Combined paths (isCombined: true) take priority over single-die paths
   * when both reach the same destination.
   */
  getDestinations(from) {
    const engine = this._engine;
    const player = engine.turn;

    // Engine-validated first moves — respects all standard Backgammon rules.
    const legalFirst = engine.getLegalMoves().filter(m => m.from === from);
    if (legalFirst.length === 0) return new Map();

    const result   = new Map();
    const baseState = this._snap();
    const fullDice  = [...engine.movesLeft];

    // Deduplicate by (from, to, die) so that identical dice slots (e.g. [4,4,4,4])
    // don't repeat the same exploration branch four times.
    const seenFirst = new Set();
    for (const m1 of legalFirst) {
      const key = `${m1.from}|${m1.to}|${m1.die}`;
      if (seenFirst.has(key)) continue;
      seenFirst.add(key);

      // Record the single-die destination (unless a combined path already exists).
      if (!result.has(m1.to)) {
        result.set(m1.to, {
          steps: [{ from: m1.from, to: m1.to, die: m1.die }],
          isCombined: false,
        });
      }

      if (m1.to === "off") continue; // bear-off ends the checker's journey

      // Simulate the board after this first move and explore further dice.
      const stateAfterFirst = engine.applyMoveToState(baseState, m1, player);
      const diceAfterFirst  = fullDice.filter((_, i) => i !== m1.idx);

      if (diceAfterFirst.length > 0) {
        this._extend(
          [{ from: m1.from, to: m1.to, die: m1.die }],
          m1.to,
          stateAfterFirst,
          diceAfterFirst,
          engine,
          player,
          result,
        );
      }
    }

    return result;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Recursively extend a path by trying each remaining die from the
   * intermediate position `from` on the simulated `state`.
   *
   * @param {Step[]}  pathSoFar  - moves committed so far (including first step)
   * @param {*}       from       - current checker position (number | "bar")
   * @param {object}  state      - simulated board state after pathSoFar
   * @param {number[]} diceLeft  - remaining dice values to try
   */
  _extend(pathSoFar, from, state, diceLeft, engine, player, result) {
    const tried = new Set();

    for (let i = 0; i < diceLeft.length; i++) {
      const die = diceLeft[i];
      if (tried.has(die)) continue; // skip duplicate values (e.g. doubles)
      tried.add(die);

      // getAllSingleMoves handles bar-entry and bear-off rules correctly for
      // the simulated state without the costly max-depth filter.
      const moves = engine
        .getAllSingleMoves(state, [die], player)
        .filter(m => m.from === from);

      for (const m of moves) {
        const newPath = [
          ...pathSoFar,
          { from: m.from, to: m.to, die: m.die },
        ];
        const dest = m.to;

        // Combined (multi-die) paths override single-die paths to the same dest.
        if (!result.has(dest) || !result.get(dest).isCombined) {
          result.set(dest, { steps: newPath, isCombined: true });
        }

        if (dest === "off") continue; // bear-off terminates this branch

        // Recurse if there are still dice to use from the new position.
        if (diceLeft.length > 1) {
          const nextState = engine.applyMoveToState(
            state,
            { from: m.from, to: m.to, die, idx: 0 },
            player,
          );
          const nextDice = diceLeft.filter((_, k) => k !== i);
          this._extend(newPath, dest, nextState, nextDice, engine, player, result);
        }
      }
    }
  }

  /** Snapshot the live engine state without mutating it. */
  _snap() {
    return {
      points: [...this._engine.points],
      bar:    { ...this._engine.bar },
      off:    { ...this._engine.off },
    };
  }
}
