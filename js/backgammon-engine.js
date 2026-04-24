const WHITE = "white";
const BLACK = "black";

function cloneState(engine) {
  return {
    points: [...engine.points],
    bar: { ...engine.bar },
    off: { ...engine.off }
  };
}

export class BackgammonEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.points = Array(25).fill(0);
    this.points[24] = 2;
    this.points[13] = 5;
    this.points[8] = 3;
    this.points[6] = 5;
    this.points[1] = -2;
    this.points[12] = -5;
    this.points[17] = -3;
    this.points[19] = -5;
    this.bar = { white: 0, black: 0 };
    this.off = { white: 0, black: 0 };
    this.turn = WHITE;
    this.dice = [];
    this.movesLeft = [];
    this.winner = null;
    this.matchScore = { white: 0, black: 0 };
    this.targetScore = 7;
    this.cubeValue = 1;
    this.cubeOwner = null;
    this.doubleOfferedBy = null;
    this.doublingEnabled = false;
    this.lastMove = null;
    this.lastWinType = null;
    this.lastWinPoints = 0;
    this.whiteCheatMode = false;
  }

  opposite(player) {
    return player === WHITE ? BLACK : WHITE;
  }

  rollDice() {
    if (this.winner) return;
    if (this.doubleOfferedBy) return;
    if (this.movesLeft.length > 0) return;
    const [d1, d2] = (this.whiteCheatMode && this.turn === WHITE)
      ? this.pickBestDiceForWhite()
      : [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    this.dice = [d1, d2];
    this.movesLeft = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    this.lastMove = null;
    if (this.getLegalMoves().length === 0) {
      this.endTurn();
    }
    return { d1, d2 };
  }

  setWhiteCheatMode(enabled) {
    this.whiteCheatMode = Boolean(enabled);
  }

  hasOwnChecker(point, player, state = null) {
    const points = state ? state.points : this.points;
    const value = points[point];
    return player === WHITE ? value > 0 : value < 0;
  }

  pointCount(point, player, state = null) {
    const points = state ? state.points : this.points;
    const value = points[point];
    if (player === WHITE) return Math.max(0, value);
    return Math.max(0, -value);
  }

  isOpenFor(point, player, state = null) {
    const points = state ? state.points : this.points;
    const value = points[point];
    if (player === WHITE) return value >= -1;
    return value <= 1;
  }

  isInHome(point, player) {
    if (player === WHITE) return point >= 1 && point <= 6;
    return point >= 19 && point <= 24;
  }

  canBearOff(player, state = null) {
    const s = state || cloneState(this);
    if (s.bar[player] > 0) return false;
    for (let p = 1; p <= 24; p += 1) {
      if (!this.hasOwnChecker(p, player, s)) continue;
      if (!this.isInHome(p, player)) return false;
    }
    return true;
  }

  destination(from, die, player) {
    return player === WHITE ? from - die : from + die;
  }

  entryPoint(die, player) {
    return player === WHITE ? 25 - die : die;
  }

  isHigherBearOffAllowed(from, die, player, state = null) {
    const s = state || cloneState(this);
    if (!this.canBearOff(player, s)) return false;
    if (player === WHITE) {
      if (from - die === 0) return true;
      if (from - die < 0) {
        for (let p = from + 1; p <= 6; p += 1) {
          if (this.hasOwnChecker(p, player, s)) return false;
        }
        return true;
      }
      return false;
    }
    if (from + die === 25) return true;
    if (from + die > 25) {
      for (let p = 19; p < from; p += 1) {
        if (this.hasOwnChecker(p, player, s)) return false;
      }
      return true;
    }
    return false;
  }

  getAllSingleMoves(state = null, movesLeft = null, player = null) {
    const s = state || cloneState(this);
    const dice = movesLeft ? [...movesLeft] : [...this.movesLeft];
    const side = player || this.turn;
    const moves = [];
    const mustEnter = s.bar[side] > 0;

    dice.forEach((die, idx) => {
      if (mustEnter) {
        const to = this.entryPoint(die, side);
        if (this.isOpenFor(to, side, s)) {
          moves.push({ from: "bar", to, die, idx, isBearOff: false });
        }
        return;
      }
      for (let from = 1; from <= 24; from += 1) {
        if (!this.hasOwnChecker(from, side, s)) continue;
        const to = this.destination(from, die, side);
        if (to >= 1 && to <= 24 && this.isOpenFor(to, side, s)) {
          moves.push({ from, to, die, idx, isBearOff: false });
          continue;
        }
        if ((to < 1 || to > 24) && this.isHigherBearOffAllowed(from, die, side, s)) {
          moves.push({ from, to: "off", die, idx, isBearOff: true });
        }
      }
    });
    return moves;
  }

  applyMoveToState(baseState, move, player) {
    const s = {
      points: [...baseState.points],
      bar: { ...baseState.bar },
      off: { ...baseState.off }
    };
    if (move.from === "bar") {
      s.bar[player] -= 1;
    } else {
      s.points[move.from] += player === WHITE ? -1 : 1;
    }
    if (move.to === "off") {
      s.off[player] += 1;
      return s;
    }
    const destinationValue = s.points[move.to];
    if (player === WHITE && destinationValue === -1) {
      s.points[move.to] = 0;
      s.bar.black += 1;
    }
    if (player === BLACK && destinationValue === 1) {
      s.points[move.to] = 0;
      s.bar.white += 1;
    }
    s.points[move.to] += player === WHITE ? 1 : -1;
    return s;
  }

  maxMovableCount(state, dice, player) {
    const moves = this.getAllSingleMoves(state, dice, player);
    if (moves.length === 0) return 0;
    let best = 0;
    for (const move of moves) {
      const nextState = this.applyMoveToState(state, move, player);
      const nextDice = dice.filter((_, i) => i !== move.idx);
      best = Math.max(best, 1 + this.maxMovableCount(nextState, nextDice, player));
    }
    return best;
  }

  getLegalMoves() {
    const state = cloneState(this);
    const dice = [...this.movesLeft];
    if (dice.length === 0 || this.winner) return [];
    const all = this.getAllSingleMoves(state, dice, this.turn);
    if (all.length === 0) return [];
    const maxDepth = this.maxMovableCount(state, dice, this.turn);
    let legal = all.filter((move) => {
      const nextState = this.applyMoveToState(state, move, this.turn);
      const nextDice = dice.filter((_, i) => i !== move.idx);
      return 1 + this.maxMovableCount(nextState, nextDice, this.turn) === maxDepth;
    });
    if (maxDepth === 1 && dice.length === 2 && dice[0] !== dice[1]) {
      const highDie = Math.max(dice[0], dice[1]);
      const withHigh = legal.filter((m) => m.die === highDie);
      if (withHigh.length > 0) legal = withHigh;
    }
    return legal;
  }

  move(from, to) {
    const legal = this.getLegalMoves();
    const chosen = legal.find((m) => m.from === from && m.to === to);
    if (!chosen) return { ok: false, reason: "Illegal move." };
    const before = cloneState(this);
    const after = this.applyMoveToState(before, chosen, this.turn);
    this.points = after.points;
    this.bar = after.bar;
    this.off = after.off;
    this.lastMove = { from, to };
    this.movesLeft.splice(chosen.idx, 1);
    if (this.off[this.turn] >= 15) {
      this.winner = this.turn;
      this.movesLeft = [];
      this.applyWinScore(this.turn);
      return { ok: true, gameOver: true };
    }
    if (this.movesLeft.length === 0 || this.getLegalMoves().length === 0) {
      this.endTurn();
    }
    return { ok: true };
  }

  endTurn() {
    this.movesLeft = [];
    this.dice = [];
    this.turn = this.opposite(this.turn);
  }

  offerDouble(player = this.turn) {
    if (!this.doublingEnabled) return { ok: false, reason: "Doubling disabled for Tavla mode." };
    if (this.winner) return { ok: false, reason: "Game already finished." };
    if (this.doubleOfferedBy) return { ok: false, reason: "Double already offered." };
    if (player !== this.turn) return { ok: false, reason: "Only current player can offer double." };
    if (this.movesLeft.length > 0) return { ok: false, reason: "Offer double before using dice." };
    if (this.cubeOwner && this.cubeOwner !== player) return { ok: false, reason: "Cube owned by opponent." };
    this.doubleOfferedBy = player;
    return { ok: true };
  }

  acceptDouble(player = this.turn) {
    if (!this.doubleOfferedBy) return { ok: false, reason: "No double offer pending." };
    if (player === this.doubleOfferedBy) return { ok: false, reason: "Offering player cannot accept." };
    this.cubeValue *= 2;
    this.cubeOwner = player;
    this.doubleOfferedBy = null;
    return { ok: true };
  }

  rejectDouble(player = this.turn) {
    if (!this.doubleOfferedBy) return { ok: false, reason: "No double offer pending." };
    if (player === this.doubleOfferedBy) return { ok: false, reason: "Offering player cannot reject." };
    const winner = this.doubleOfferedBy;
    this.winner = winner;
    this.movesLeft = [];
    this.dice = [];
    this.doubleOfferedBy = null;
    this.applyWinScore(winner, 1);
    return { ok: true, gameOver: true, resignedBy: player };
  }

  applyWinScore(winner, forcedMultiplier = null) {
    const loser = this.opposite(winner);
    let multiplier = forcedMultiplier || this.cubeValue;
    const loserOff = this.off[loser];
    if (!forcedMultiplier) {
      if (loserOff === 0) {
        const loserHasBar = this.bar[loser] > 0;
        const inWinnersHome = winner === WHITE
          ? (this.pointCount(1, loser) + this.pointCount(2, loser) + this.pointCount(3, loser)
            + this.pointCount(4, loser) + this.pointCount(5, loser) + this.pointCount(6, loser)) > 0
          : (this.pointCount(19, loser) + this.pointCount(20, loser) + this.pointCount(21, loser)
            + this.pointCount(22, loser) + this.pointCount(23, loser) + this.pointCount(24, loser)) > 0;
        const isBackgammon = (loserHasBar || inWinnersHome);
        multiplier *= isBackgammon ? 3 : 2;
        this.lastWinType = isBackgammon ? "backgammon" : "gammon";
      } else {
        this.lastWinType = "single";
      }
    } else {
      this.lastWinType = "single";
    }
    this.matchScore[winner] += multiplier;
    this.lastWinPoints = multiplier;
  }

  startNextGame() {
    const preservedScore = { ...this.matchScore };
    const target = this.targetScore;
    const doublingEnabled = this.doublingEnabled;
    this.reset();
    this.matchScore = preservedScore;
    this.targetScore = target;
    this.doublingEnabled = doublingEnabled;
  }

  setDoublingEnabled(enabled) {
    this.doublingEnabled = Boolean(enabled);
    if (!this.doublingEnabled) {
      this.cubeValue = 1;
      this.cubeOwner = null;
      this.doubleOfferedBy = null;
    }
  }

  pickBestDiceForWhite() {
    let bestPair = [6, 6];
    let bestScore = -Infinity;
    for (let d1 = 1; d1 <= 6; d1 += 1) {
      for (let d2 = 1; d2 <= 6; d2 += 1) {
        const dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
        const score = this.bestOutcomeScoreForDice(cloneState(this), dice, WHITE);
        if (score > bestScore) {
          bestScore = score;
          bestPair = [d1, d2];
        }
      }
    }
    return bestPair;
  }

  bestOutcomeScoreForDice(state, dice, player) {
    const moves = this.getAllSingleMoves(state, dice, player);
    if (moves.length === 0) {
      return this.evaluateStateForWhite(state);
    }
    let best = -Infinity;
    for (const move of moves) {
      const nextState = this.applyMoveToState(state, move, player);
      const nextDice = dice.filter((_, i) => i !== move.idx);
      const score = this.bestOutcomeScoreForDice(nextState, nextDice, player);
      if (score > best) {
        best = score;
      }
    }
    return best;
  }

  evaluateStateForWhite(state) {
    const whitePip = this.pipCount(WHITE, state);
    const blackPip = this.pipCount(BLACK, state);
    return (
      state.off.white * 220
      - state.off.black * 140
      - state.bar.white * 90
      + state.bar.black * 70
      - whitePip * 1.2
      + blackPip * 0.8
    );
  }

  pipCount(player, state = null) {
    const s = state || cloneState(this);
    let total = 0;
    for (let p = 1; p <= 24; p += 1) {
      const count = this.pointCount(p, player, s);
      if (count <= 0) continue;
      const distance = player === WHITE ? p : (25 - p);
      total += distance * count;
    }
    total += s.bar[player] * 25;
    return total;
  }
}
