// ─── Blackjack Engine ────────────────────────────────────────────────────────
// Pure game logic — zero DOM dependencies.
// Rules: 6-deck shoe, S17 (dealer stands on soft 17), Blackjack pays 3:2,
//        Double Down on any first two cards, Split on same-value pairs (once).
// Multi-player: 1–7 players, sequential betting + turn order, shared dealer.

const SUITS = ["spades", "hearts", "diamonds", "clubs"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const MAX_PLAYERS = 7;

function rankValue(rank) {
  if (rank === "A") return 11;
  if (["J", "Q", "K", "10"].includes(rank)) return 10;
  return parseInt(rank, 10);
}

function buildDeck() {
  const cards = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ suit, rank });
    }
  }
  return cards;
}

function fisherYates(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class BlackjackEngine {
  /**
   * @param {string[]} playerNames  Array of player names (1–7)
   * @param {number}   numDecks       Number of decks in the shoe (default 6)
   * @param {number}   cutPenetration Fraction of shoe dealt before reshuffling (default 0.75)
   * @param {number}   startingBalance Each player's starting balance
   */
  constructor(playerNames = ["Player 1"], numDecks = 6, cutPenetration = 0.75, startingBalance = 1000) {
    this.numDecks = numDecks;
    this.cutPenetration = cutPenetration;
    this.startingBalance = startingBalance;

    // Shoe state
    this.shoe = [];
    this.cutCardPos = 0;
    this.reshuffleNeeded = false;

    // Round state
    this.phase = "idle";       // 'idle' | 'player' | 'dealer' | 'settled'
    this.dealerHand = [];
    this.activePlayers = [];   // players with bets this round
    this.activePlayerIndex = 0; // index into activePlayers
    this.bettingPlayerIndex = 0; // index into this.players (during idle)
    this.roundCount = 0;

    this.players = [];
    this.setupPlayers(playerNames);
    this.buildShoe();
  }

  // ─── Player Management ─────────────────────────────────────────────────────

  setupPlayers(names) {
    const safe = names.slice(0, MAX_PLAYERS);
    this.players = safe.map((name, i) => this._createPlayer(name, i));
    this.bettingPlayerIndex = 0;
    this.activePlayerIndex = 0;
    this.activePlayers = [];
    this.dealerHand = [];
    this.phase = "idle";
  }

  _createPlayer(name, id) {
    return {
      id,
      name,
      balance: this.startingBalance,
      currentBet: 0,
      playerHands: [[]],
      handBets: [0],
      activeHandIndex: 0,
      lastResults: [],
      stats: {
        wins: 0,
        losses: 0,
        pushes: 0,
        blackjacks: 0,
        doubleWins: 0,
        currentStreak: 0,
        bestStreak: 0,
        handsInCurrentShoe: 0,
        lastWasDouble: false,
      },
    };
  }

  get activePlayer() { return this.activePlayers[this.activePlayerIndex] ?? null; }
  get bettingPlayer() { return this.players[this.bettingPlayerIndex] ?? null; }

  // ─── Shoe ──────────────────────────────────────────────────────────────────

  buildShoe() {
    const cards = [];
    for (let d = 0; d < this.numDecks; d++) cards.push(...buildDeck());
    fisherYates(cards);
    this.shoe = cards;
    this.cutCardPos = Math.floor(this.shoe.length * (1 - this.cutPenetration));
    this.reshuffleNeeded = false;
    for (const p of this.players) p.stats.handsInCurrentShoe = 0;
  }

  _dealCard(faceDown = false) {
    if (this.shoe.length === 0) this.buildShoe();
    const card = this.shoe.pop();
    card.faceDown = faceDown;
    if (this.shoe.length <= this.cutCardPos) this.reshuffleNeeded = true;
    return card;
  }

  get shoePenetration() {
    const total = this.numDecks * 52;
    return (total - this.shoe.length) / total;
  }

  // ─── Betting ───────────────────────────────────────────────────────────────

  addBet(amount) {
    if (this.phase !== "idle") return { ok: false, reason: "round_in_progress" };
    const p = this.bettingPlayer;
    if (!p) return { ok: false, reason: "no_player" };
    if (amount <= 0) return { ok: false, reason: "invalid_amount" };
    if (p.currentBet + amount > p.balance) return { ok: false, reason: "insufficient_balance" };
    p.currentBet += amount;
    return { ok: true, playerId: p.id };
  }

  clearBet() {
    if (this.phase !== "idle") return { ok: false, reason: "round_in_progress" };
    const p = this.bettingPlayer;
    if (!p) return { ok: false, reason: "no_player" };
    p.currentBet = 0;
    return { ok: true };
  }

  /** Advance the betting cursor to the next player. Returns true if all players have bet. */
  advanceBettingPlayer() {
    const next = this.bettingPlayerIndex + 1;
    if (next < this.players.length) {
      this.bettingPlayerIndex = next;
      return { done: false, playerId: this.players[next].id };
    }
    return { done: true };
  }

  // ─── Round Lifecycle ───────────────────────────────────────────────────────

  startRound() {
    if (this.phase !== "idle") return { ok: false, reason: "round_in_progress" };

    const bettingPlayers = this.players.filter(p => p.currentBet > 0);
    if (bettingPlayers.length === 0) return { ok: false, reason: "no_bets" };

    if (this.reshuffleNeeded) this.buildShoe();

    // Commit bets and initialise hands
    this.activePlayers = bettingPlayers;
    this.activePlayerIndex = 0;

    // Standard casino deal order: card 1 to each player, then dealer, card 2 to each, then hole
    for (const p of this.activePlayers) {
      p.balance -= p.currentBet;
      p.playerHands = [[this._dealCard()]];
      p.handBets = [p.currentBet];
      p.activeHandIndex = 0;
      p.lastResults = [];
    }
    const dealerCard1 = this._dealCard();
    for (const p of this.activePlayers) {
      p.playerHands[0].push(this._dealCard());
    }
    const dealerHole = this._dealCard(true);
    this.dealerHand = [dealerCard1, dealerHole];

    this.phase = "player";
    this.roundCount++;

    // Natural check
    const dealerBJ = this._dealerHasNatural();
    const naturalPlayerIds = this.activePlayers
      .filter(p => this.isNatural(p.playerHands[0]))
      .map(p => p.id);

    if (dealerBJ || naturalPlayerIds.length > 0) {
      return { ok: true, event: "natural_check", dealerBlackjack: dealerBJ, naturalPlayerIds };
    }
    return { ok: true, event: "round_started" };
  }

  /**
   * Settle all players involved in naturals (player BJ or dealer BJ).
   * Returns results and removes settled players from activePlayers.
   */
  settleNaturals(dealerBJ, naturalPlayerIds) {
    this.dealerHand[1].faceDown = false;
    const results = [];

    for (const p of this.activePlayers) {
      const playerBJ = naturalPlayerIds.includes(p.id);
      if (!playerBJ && !dealerBJ) continue; // this player continues to play normally

      let result, net;
      if (playerBJ && dealerBJ) {
        result = "push";
        net = p.handBets[0];
      } else if (playerBJ) {
        result = "blackjack";
        net = p.handBets[0] + Math.floor(p.handBets[0] * 1.5);
        p.stats.blackjacks++;
      } else {
        result = "dealer_blackjack";
        net = 0;
      }

      p.balance += net;
      p.lastResults = [{ result, net, handIndex: 0, bet: p.handBets[0] }];
      this._recordPlayerRoundStats(p, result === "blackjack", true);
      results.push({ playerId: p.id, playerName: p.name, result, net });
    }

    if (dealerBJ) {
      this.activePlayers = [];
      this.phase = "settled";
    } else {
      this.activePlayers = this.activePlayers.filter(p => !naturalPlayerIds.includes(p.id));
      if (this.activePlayers.length === 0) {
        this.phase = "settled";
      } else {
        this.activePlayerIndex = 0;
      }
    }

    return { results };
  }

  // ─── Player Actions ────────────────────────────────────────────────────────

  hit() {
    if (this.phase !== "player") return { ok: false, reason: "not_player_turn" };
    const p = this.activePlayer;
    const hand = p.playerHands[p.activeHandIndex];
    hand.push(this._dealCard());

    if (this.isBust(hand)) {
      return { ok: true, event: "bust", handIndex: p.activeHandIndex, playerId: p.id };
    }
    if (this.handValue(hand) === 21) {
      return { ok: true, event: "twenty_one", handIndex: p.activeHandIndex, playerId: p.id };
    }
    return { ok: true, event: "hit", handIndex: p.activeHandIndex, playerId: p.id };
  }

  stand() {
    if (this.phase !== "player") return { ok: false, reason: "not_player_turn" };
    return this._advanceHand();
  }

  doubleDown() {
    if (this.phase !== "player") return { ok: false, reason: "not_player_turn" };
    if (!this.canDouble()) return { ok: false, reason: "cannot_double" };

    const p = this.activePlayer;
    const hand = p.playerHands[p.activeHandIndex];
    const extraBet = Math.min(p.handBets[p.activeHandIndex], p.balance);
    p.balance -= extraBet;
    p.handBets[p.activeHandIndex] += extraBet;
    p.stats.lastWasDouble = true;

    hand.push(this._dealCard());
    const busted = this.isBust(hand);
    const res = this._advanceHand();
    return { ok: true, event: busted ? "bust" : "double", handIndex: p.activeHandIndex, playerId: p.id, ...res };
  }

  split() {
    if (this.phase !== "player") return { ok: false, reason: "not_player_turn" };
    if (!this.canSplit()) return { ok: false, reason: "cannot_split" };

    const p = this.activePlayer;
    const hand = p.playerHands[p.activeHandIndex];
    const splitBet = p.handBets[p.activeHandIndex];
    if (splitBet > p.balance) return { ok: false, reason: "insufficient_balance" };

    p.balance -= splitBet;
    const card1 = hand[0];
    const card2 = hand[1];
    const newHand1 = [card1, this._dealCard()];
    const newHand2 = [card2, this._dealCard()];
    p.playerHands.splice(p.activeHandIndex, 1, newHand1, newHand2);
    p.handBets.splice(p.activeHandIndex, 1, splitBet, splitBet);

    return { ok: true, event: "split", handIndex: p.activeHandIndex, playerId: p.id };
  }

  // ─── Dealer Phase ──────────────────────────────────────────────────────────

  dealerPlay() {
    if (this.phase !== "dealer") return { ok: false, reason: "not_dealer_phase" };
    this.dealerHand[1].faceDown = false;
    const drawn = [];
    while (this._dealerShouldHit()) {
      const card = this._dealCard();
      this.dealerHand.push(card);
      drawn.push(card);
    }
    return { ok: true, drawn };
  }

  _dealerShouldHit() {
    return this.handValue(this.dealerHand) < 17;
  }

  // ─── Settlement ────────────────────────────────────────────────────────────

  settle() {
    if (this.phase !== "dealer") return { ok: false, reason: "not_dealer_phase" };
    this.phase = "settled";
    const dealerVal = this.handValue(this.dealerHand);
    const dealerBust = this.isBust(this.dealerHand);
    const allPlayerResults = [];

    for (const p of this.activePlayers) {
      p.lastResults = [];
      let roundWon = false;

      for (let i = 0; i < p.playerHands.length; i++) {
        const hand = p.playerHands[i];
        const bet = p.handBets[i];
        const playerVal = this.handValue(hand);
        const playerBust = this.isBust(hand);

        let result, net;
        if (playerBust)              { result = "lose"; net = 0; }
        else if (dealerBust)         { result = "win";  net = bet * 2; }
        else if (playerVal > dealerVal) { result = "win";  net = bet * 2; }
        else if (playerVal === dealerVal) { result = "push"; net = bet; }
        else                         { result = "lose"; net = 0; }

        p.balance += net;
        p.lastResults.push({ result, net, bet, handIndex: i, playerVal, dealerVal });
        if (result === "win") roundWon = true;
      }

      this._recordPlayerRoundStats(p, roundWon, false);
      allPlayerResults.push({ playerId: p.id, playerName: p.name, results: p.lastResults });
    }

    return { ok: true, allPlayerResults };
  }

  resetForNextRound() {
    this.phase = "idle";
    this.dealerHand = [];
    this.activePlayers = [];
    this.activePlayerIndex = 0;
    this.bettingPlayerIndex = 0;
    for (const p of this.players) {
      p.currentBet = 0;
      p.playerHands = [[]];
      p.handBets = [0];
      p.activeHandIndex = 0;
      p.lastResults = [];
      p.stats.lastWasDouble = false;
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  _advanceHand() {
    const p = this.activePlayer;
    const nextIdx = p.activeHandIndex + 1;
    if (nextIdx < p.playerHands.length) {
      p.activeHandIndex = nextIdx;
      return { ok: true, event: "next_hand", handIndex: nextIdx, playerId: p.id };
    }
    return this._advancePlayer();
  }

  _advancePlayer() {
    const nextIdx = this.activePlayerIndex + 1;
    if (nextIdx < this.activePlayers.length) {
      this.activePlayerIndex = nextIdx;
      this.activePlayers[nextIdx].activeHandIndex = 0;
      return { ok: true, event: "next_player", playerId: this.activePlayers[nextIdx].id };
    }
    this.phase = "dealer";
    return { ok: true, event: "dealer_phase" };
  }

  _recordPlayerRoundStats(p, won, isBlackjack) {
    p.stats.handsInCurrentShoe++;
    if (won) {
      p.stats.wins++;
      p.stats.currentStreak++;
      if (p.stats.currentStreak > p.stats.bestStreak) p.stats.bestStreak = p.stats.currentStreak;
      if (p.stats.lastWasDouble) p.stats.doubleWins++;
    } else if (p.lastResults.every(r => r.result === "push")) {
      p.stats.pushes++;
    } else {
      p.stats.losses++;
      p.stats.currentStreak = 0;
    }
  }

  _dealerHasNatural() {
    const visible = this.dealerHand[0];
    const hole = this.dealerHand[1];
    return this.isNatural([visible, { ...hole, faceDown: false }]);
  }

  // ─── Hand Evaluation ───────────────────────────────────────────────────────

  handValue(cards) {
    let total = 0, aces = 0;
    for (const card of cards) {
      if (card.faceDown) continue;
      if (card.rank === "A") aces++;
      total += rankValue(card.rank);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }

  isSoft(cards) {
    const visible = cards.filter(c => !c.faceDown);
    if (!visible.some(c => c.rank === "A")) return false;
    let hard = 0;
    for (const c of visible) hard += c.rank === "A" ? 1 : rankValue(c.rank);
    return hard + 10 <= 21;
  }

  isBust(cards) { return this.handValue(cards) > 21; }

  isNatural(cards) {
    const visible = cards.filter(c => !c.faceDown);
    if (visible.length !== 2) return false;
    const vals = visible.map(c => rankValue(c.rank));
    return vals.includes(11) && vals.some(v => v === 10);
  }

  canSplit() {
    const p = this.activePlayer;
    if (!p) return false;
    if (p.playerHands.length >= 4) return false;
    const hand = p.playerHands[p.activeHandIndex];
    if (hand.length !== 2) return false;
    if (p.handBets[p.activeHandIndex] > p.balance) return false;
    return rankValue(hand[0].rank) === rankValue(hand[1].rank);
  }

  canDouble() {
    const p = this.activePlayer;
    if (!p) return false;
    const hand = p.playerHands[p.activeHandIndex];
    if (hand.length !== 2) return false;
    return Math.min(p.handBets[p.activeHandIndex], p.balance) > 0;
  }

  // ─── State Snapshot ────────────────────────────────────────────────────────

  getState() {
    const ap = this.activePlayer;
    return {
      phase: this.phase,
      dealerHand: this.dealerHand,
      dealerValue: this.handValue(this.dealerHand),
      players: this.players.map(p => this._playerSnapshot(p)),
      activePlayers: this.activePlayers.map(p => this._playerSnapshot(p)),
      activePlayerIndex: this.activePlayerIndex,
      bettingPlayerIndex: this.bettingPlayerIndex,
      activePlayer: ap ? this._playerSnapshot(ap) : null,
      bettingPlayer: this.bettingPlayer ? this._playerSnapshot(this.bettingPlayer) : null,
      canSplit: this.canSplit(),
      canDouble: this.canDouble(),
      reshuffleNeeded: this.reshuffleNeeded,
      shoePenetration: this.shoePenetration,
      roundCount: this.roundCount,
    };
  }

  _playerSnapshot(p) {
    return {
      id: p.id,
      name: p.name,
      balance: p.balance,
      currentBet: p.currentBet,
      playerHands: p.playerHands,
      handBets: p.handBets,
      activeHandIndex: p.activeHandIndex,
      lastResults: p.lastResults,
      stats: { ...p.stats },
      playerValues: p.playerHands.map(h => this.handValue(h)),
    };
  }
}
