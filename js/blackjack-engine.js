// ─── Blackjack Engine ────────────────────────────────────────────────────────
// Pure game logic — zero DOM dependencies.
// Rules: 6-deck shoe, S17 (dealer stands on soft 17), Blackjack pays 3:2,
//        Double Down on any first two cards, Split on same-value pairs (once).

const SUITS = ["spades", "hearts", "diamonds", "clubs"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

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
   * @param {number} numDecks       Number of decks in the shoe (default 6)
   * @param {number} cutPenetration Fraction of shoe dealt before reshuffling (default 0.75)
   * @param {number} startingBalance Player starting balance
   */
  constructor(numDecks = 6, cutPenetration = 0.75, startingBalance = 1000) {
    this.numDecks = numDecks;
    this.cutPenetration = cutPenetration;
    this.balance = startingBalance;

    // Shoe state
    this.shoe = [];
    this.cutCardPos = 0;       // cards remaining in shoe at which reshuffle is flagged
    this.reshuffleNeeded = false;

    // Round state
    this.phase = "idle";       // 'idle' | 'player' | 'dealer' | 'settled'
    this.currentBet = 0;       // accumulated bet before dealing
    this.dealerHand = [];      // [{suit, rank, faceDown}]
    this.playerHands = [[]];   // array of hands (split creates extra hands)
    this.handBets = [0];       // bet per hand
    this.activeHandIndex = 0;
    this.lastResults = [];     // [{ result, net, handIndex }]
    this.roundCount = 0;

    // ── Stats (used by challenge system) ──────────────────────────────────
    this.stats = {
      wins: 0,
      losses: 0,
      pushes: 0,
      blackjacks: 0,
      doubleWins: 0,
      currentStreak: 0,
      bestStreak: 0,
      handsInCurrentShoe: 0,  // wins counted in current shoe before reshuffle
      lastWasDouble: false,   // flag so UI can credit doubleWins
    };

    this.buildShoe();
  }

  // ─── Shoe ──────────────────────────────────────────────────────────────────

  buildShoe() {
    const cards = [];
    for (let d = 0; d < this.numDecks; d++) {
      cards.push(...buildDeck());
    }
    fisherYates(cards);
    this.shoe = cards;
    // Cut card: when remaining cards drop below this threshold, flag reshuffle
    this.cutCardPos = Math.floor(this.shoe.length * (1 - this.cutPenetration));
    this.reshuffleNeeded = false;
    this.stats.handsInCurrentShoe = 0;
  }

  _dealCard(faceDown = false) {
    if (this.shoe.length === 0) {
      this.buildShoe();
    }
    const card = this.shoe.pop();
    card.faceDown = faceDown;
    // Flag reshuffle once cut card is passed (checked before next round starts)
    if (this.shoe.length <= this.cutCardPos) {
      this.reshuffleNeeded = true;
    }
    return card;
  }

  get shoePenetration() {
    const total = this.numDecks * 52;
    const dealt = total - this.shoe.length;
    return dealt / total;
  }

  // ─── Betting ───────────────────────────────────────────────────────────────

  addBet(amount) {
    if (this.phase !== "idle") return { ok: false, reason: "round_in_progress" };
    if (amount <= 0) return { ok: false, reason: "invalid_amount" };
    if (this.currentBet + amount > this.balance) {
      return { ok: false, reason: "insufficient_balance" };
    }
    this.currentBet += amount;
    return { ok: true };
  }

  clearBet() {
    if (this.phase !== "idle") return { ok: false, reason: "round_in_progress" };
    this.currentBet = 0;
    return { ok: true };
  }

  // ─── Round Lifecycle ───────────────────────────────────────────────────────

  startRound() {
    if (this.phase !== "idle") return { ok: false, reason: "round_in_progress" };
    if (this.currentBet <= 0) return { ok: false, reason: "no_bet" };
    if (this.currentBet > this.balance) return { ok: false, reason: "insufficient_balance" };

    if (this.reshuffleNeeded) {
      this.buildShoe();
    }

    this.balance -= this.currentBet;
    this.playerHands = [[this._dealCard(), this._dealCard()]];
    this.dealerHand = [this._dealCard(), this._dealCard(true)]; // second card face-down
    this.handBets = [this.currentBet];
    this.activeHandIndex = 0;
    this.lastResults = [];
    this.phase = "player";
    this.roundCount++;

    // Check for natural blackjack immediately
    const playerBJ = this.isNatural(this.playerHands[0]);
    const dealerBJ = this._dealerHasNatural();

    if (playerBJ || dealerBJ) {
      return { ok: true, event: "natural_check", playerBlackjack: playerBJ, dealerBlackjack: dealerBJ };
    }

    return { ok: true, event: "round_started" };
  }

  /** Settle immediately when naturals are involved (called by UI after animation). */
  settleNaturals(playerBJ, dealerBJ) {
    this.dealerHand[1].faceDown = false; // reveal hole card
    this.phase = "settled";

    let result, net;
    if (playerBJ && dealerBJ) {
      result = "push";
      net = this.handBets[0]; // return bet
    } else if (playerBJ) {
      result = "blackjack";
      net = this.handBets[0] + Math.floor(this.handBets[0] * 1.5); // 3:2 payout
      this.stats.blackjacks++;
    } else {
      result = "dealer_blackjack";
      net = 0;
    }

    this.balance += net;
    this.lastResults = [{ result, net, handIndex: 0 }];
    this._recordRoundStats(result === "blackjack", result === "blackjack");
    return { result, net };
  }

  // ─── Player Actions ────────────────────────────────────────────────────────

  hit() {
    if (this.phase !== "player") return { ok: false, reason: "not_player_turn" };
    const hand = this.playerHands[this.activeHandIndex];
    hand.push(this._dealCard());

    if (this.isBust(hand)) {
      return { ok: true, event: "bust", handIndex: this.activeHandIndex };
    }
    if (this.handValue(hand) === 21) {
      return { ok: true, event: "twenty_one", handIndex: this.activeHandIndex };
    }
    return { ok: true, event: "hit", handIndex: this.activeHandIndex };
  }

  stand() {
    if (this.phase !== "player") return { ok: false, reason: "not_player_turn" };
    return this._advanceHand();
  }

  doubleDown() {
    if (this.phase !== "player") return { ok: false, reason: "not_player_turn" };
    if (!this.canDouble()) return { ok: false, reason: "cannot_double" };

    const hand = this.playerHands[this.activeHandIndex];
    const extraBet = Math.min(this.handBets[this.activeHandIndex], this.balance);
    this.balance -= extraBet;
    this.handBets[this.activeHandIndex] += extraBet;
    this.stats.lastWasDouble = true;

    hand.push(this._dealCard());
    const busted = this.isBust(hand);
    const res = this._advanceHand();
    return { ok: true, event: busted ? "bust" : "double", handIndex: this.activeHandIndex, ...res };
  }

  split() {
    if (this.phase !== "player") return { ok: false, reason: "not_player_turn" };
    if (!this.canSplit()) return { ok: false, reason: "cannot_split" };

    const hand = this.playerHands[this.activeHandIndex];
    const splitBet = this.handBets[this.activeHandIndex];
    if (splitBet > this.balance) return { ok: false, reason: "insufficient_balance" };

    this.balance -= splitBet;

    // Create two new hands from the pair
    const card1 = hand[0];
    const card2 = hand[1];
    const newHand1 = [card1, this._dealCard()];
    const newHand2 = [card2, this._dealCard()];

    this.playerHands.splice(this.activeHandIndex, 1, newHand1, newHand2);
    this.handBets.splice(this.activeHandIndex, 1, splitBet, splitBet);

    return { ok: true, event: "split", handIndex: this.activeHandIndex };
  }

  // ─── Dealer Phase ──────────────────────────────────────────────────────────

  /** Reveal hole card and run dealer draw sequence. Returns cards drawn. */
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
    const val = this.handValue(this.dealerHand);
    // S17: stand on soft 17 (val < 17 only)
    return val < 17;
  }

  // ─── Settlement ────────────────────────────────────────────────────────────

  settle() {
    if (this.phase !== "dealer") return { ok: false, reason: "not_dealer_phase" };
    this.phase = "settled";
    const dealerVal = this.handValue(this.dealerHand);
    const dealerBust = this.isBust(this.dealerHand);
    this.lastResults = [];

    let roundWon = false;

    for (let i = 0; i < this.playerHands.length; i++) {
      const hand = this.playerHands[i];
      const bet = this.handBets[i];
      const playerVal = this.handValue(hand);
      const playerBust = this.isBust(hand);

      let result, net;
      if (playerBust) {
        result = "lose";
        net = 0;
      } else if (dealerBust) {
        result = "win";
        net = bet * 2;
      } else if (playerVal > dealerVal) {
        result = "win";
        net = bet * 2;
      } else if (playerVal === dealerVal) {
        result = "push";
        net = bet;
      } else {
        result = "lose";
        net = 0;
      }

      this.balance += net;
      this.lastResults.push({ result, net, bet, handIndex: i, playerVal, dealerVal });
      if (result === "win") roundWon = true;
    }

    this._recordRoundStats(roundWon, false);
    return { ok: true, results: this.lastResults };
  }

  resetForNextRound() {
    this.phase = "idle";
    this.currentBet = 0;
    this.dealerHand = [];
    this.playerHands = [[]];
    this.handBets = [0];
    this.activeHandIndex = 0;
    this.stats.lastWasDouble = false;
  }

  _recordRoundStats(won, isBlackjack) {
    this.stats.handsInCurrentShoe++;
    if (won) {
      this.stats.wins++;
      this.stats.currentStreak++;
      if (this.stats.currentStreak > this.stats.bestStreak) {
        this.stats.bestStreak = this.stats.currentStreak;
      }
      if (this.stats.lastWasDouble) {
        this.stats.doubleWins++;
      }
    } else if (this.lastResults.every(r => r.result === "push")) {
      this.stats.pushes++;
      // Push doesn't break streak
    } else {
      this.stats.losses++;
      this.stats.currentStreak = 0;
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  _advanceHand() {
    const nextIndex = this.activeHandIndex + 1;
    if (nextIndex < this.playerHands.length) {
      this.activeHandIndex = nextIndex;
      return { ok: true, event: "next_hand", handIndex: nextIndex };
    }
    // All hands done — move to dealer phase
    this.activeHandIndex = 0;
    this.phase = "dealer";
    return { ok: true, event: "dealer_phase" };
  }

  _dealerHasNatural() {
    // We can peek at the hole card only for natural detection
    const visible = this.dealerHand[0];
    const hole = this.dealerHand[1];
    const twoCardHand = [visible, { ...hole, faceDown: false }];
    return this.isNatural(twoCardHand);
  }

  // ─── Hand Evaluation ───────────────────────────────────────────────────────

  handValue(cards) {
    let total = 0;
    let aces = 0;
    for (const card of cards) {
      if (card.faceDown) continue;
      const v = rankValue(card.rank);
      if (card.rank === "A") aces++;
      total += v;
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return total;
  }

  isSoft(cards) {
    const visible = cards.filter(c => !c.faceDown);
    if (!visible.some(c => c.rank === "A")) return false;
    let hard = 0;
    for (const c of visible) {
      hard += c.rank === "A" ? 1 : rankValue(c.rank);
    }
    return hard + 10 <= 21;
  }

  isBust(cards) {
    return this.handValue(cards) > 21;
  }

  isNatural(cards) {
    const visible = cards.filter(c => !c.faceDown);
    if (visible.length !== 2) return false;
    const vals = visible.map(c => rankValue(c.rank));
    return vals.includes(11) && vals.some(v => v === 10);
  }

  canSplit() {
    if (this.playerHands.length >= 4) return false; // max 4 hands
    const hand = this.playerHands[this.activeHandIndex];
    if (hand.length !== 2) return false;
    if (this.handBets[this.activeHandIndex] > this.balance) return false;
    return rankValue(hand[0].rank) === rankValue(hand[1].rank);
  }

  canDouble() {
    const hand = this.playerHands[this.activeHandIndex];
    if (hand.length !== 2) return false;
    const extra = Math.min(this.handBets[this.activeHandIndex], this.balance);
    return extra > 0;
  }

  getState() {
    return {
      phase: this.phase,
      balance: this.balance,
      currentBet: this.currentBet,
      dealerHand: this.dealerHand,
      playerHands: this.playerHands,
      handBets: this.handBets,
      activeHandIndex: this.activeHandIndex,
      dealerValue: this.handValue(this.dealerHand),
      playerValues: this.playerHands.map(h => this.handValue(h)),
      canSplit: this.canSplit(),
      canDouble: this.canDouble(),
      reshuffleNeeded: this.reshuffleNeeded,
      shoePenetration: this.shoePenetration,
      roundCount: this.roundCount,
      lastResults: this.lastResults,
      stats: { ...this.stats },
    };
  }
}
