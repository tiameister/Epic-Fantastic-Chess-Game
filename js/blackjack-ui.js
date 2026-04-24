// ─── Blackjack UI ─────────────────────────────────────────────────────────────
// All DOM, animation and challenge logic. Zero engine coupling beyond API calls.

const SUIT_SYMBOL = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };
const SUIT_COLOR  = { spades: "black", hearts: "red", diamonds: "red", clubs: "black" };

const CHIP_DENOMINATIONS = [
  { value: 5,   label: "$5",   cls: "bj-chip--red"    },
  { value: 10,  label: "$10",  cls: "bj-chip--blue"   },
  { value: 25,  label: "$25",  cls: "bj-chip--green"  },
  { value: 50,  label: "$50",  cls: "bj-chip--purple" },
  { value: 100, label: "$100", cls: "bj-chip--black"  },
];

// ── Challenge definitions ──────────────────────────────────────────────────
// Each has: id, label, desc, goal (number), type (streak|double|shoe|blackjack)
const CHALLENGE_POOL = [
  { id: "streak3",    label: "Hot Hand",       desc: "Win 3 hands in a row",            goal: 3,  type: "streak"    },
  { id: "streak5",    label: "On Fire",        desc: "Win 5 hands in a row",            goal: 5,  type: "streak"    },
  { id: "double",     label: "Double or Nothing", desc: "Win a Double Down",            goal: 1,  type: "double"    },
  { id: "shoe5",      label: "Shoe Beater",    desc: "Win 5 hands before reshuffle",    goal: 5,  type: "shoe"      },
  { id: "blackjack",  label: "Natural!",       desc: "Hit a natural Blackjack",         goal: 1,  type: "blackjack" },
  { id: "comeback",   label: "Comeback Kid",   desc: "Win after going below $500",      goal: 1,  type: "comeback"  },
];
// Pick 3 challenges seeded by the current calendar day
function getDailyChallenges() {
  const seed = Math.floor(Date.now() / 86_400_000); // day number
  const pool = [...CHALLENGE_POOL];
  // deterministic shuffle with the day seed
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (seed * 31 + i * 7) % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3).map(c => ({ ...c, progress: 0, done: false, bonusPaid: false }));
}

const CONFETTI_COUNT = 130;

export class BlackjackUI {
  constructor(engine, elements, sound) {
    this.engine   = engine;
    this.elements = elements;
    this.sound    = sound;
    this.active   = false;

    this._confettiAnim  = null;
    this._challenges    = getDailyChallenges();
    this._wentBelowHalf = false; // tracks "comeback" challenge condition
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  init() {
    this._bindButtons();
    this._renderChipSelector();
    this._renderChallenges();
    this._syncView();
  }

  setActive(active) {
    this.active = active;
  }

  // ─── Button Wiring ─────────────────────────────────────────────────────────

  _bindButtons() {
    const el = this.elements;

    // Chip selector — event delegation
    el.bjChipSelector.addEventListener("click", e => {
      const btn = e.target.closest("[data-bj-chip]");
      if (!btn || btn.disabled) return;
      const value = parseInt(btn.dataset.bjChip, 10);
      const res = this.engine.addBet(value);
      if (res.ok) {
        this._playSound("bjChip");
        this._animateChipToBetArea(btn, value);
        this._updateBetDisplay();
      } else {
        this._shake(el.bjBetAmount);
      }
    });

    el.bjClearBetBtn.addEventListener("click", () => {
      if (this.engine.clearBet().ok) {
        this._updateBetDisplay();
        el.bjChipsDisplay.innerHTML = "";
      }
    });

    el.bjDealBtn.addEventListener("click", () => this._startRound());
    el.bjHitBtn.addEventListener("click",   () => this._actionHit());
    el.bjStandBtn.addEventListener("click", () => this._actionStand());
    el.bjDoubleBtn.addEventListener("click",() => this._actionDouble());
    el.bjSplitBtn.addEventListener("click", () => this._actionSplit());

    // "Next Round" is inside the outcome overlay card
    el.bjNextRoundBtn.addEventListener("click", () => this._nextRound());
    el.bjNewShoeBtn.addEventListener("click",   () => {
      this.engine.buildShoe();
      this._setStatus("New shoe shuffled — place your bet.");
      this._syncView();
    });
  }

  // ─── Chip Selector ─────────────────────────────────────────────────────────

  _renderChipSelector() {
    const container = this.elements.bjChipSelector;
    container.innerHTML = "";
    for (const chip of CHIP_DENOMINATIONS) {
      const btn = document.createElement("button");
      btn.type = "button";
      // data attr for delegation; both base + denomination classes for styling
      btn.dataset.bjChip = chip.value;
      btn.className = `bj-chip bj-chip--selector ${chip.cls}`;
      btn.setAttribute("aria-label", `Bet ${chip.label}`);
      btn.innerHTML = `<span class="bj-chip-label">${chip.label}</span>`;
      container.appendChild(btn);
    }
  }

  // ─── Challenge Panel ───────────────────────────────────────────────────────

  _renderChallenges() {
    const panel = this.elements.bjChallengesPanel;
    if (!panel) return;
    panel.innerHTML = `
      <div class="bj-ch-header">
        <span class="bj-ch-title">Daily Challenges</span>
        <span class="bj-ch-streak" id="bjStreakBadge">Streak: 0</span>
      </div>
      <div class="bj-ch-list" id="bjChallengeList"></div>
    `;
    this._updateChallengeList();
  }

  _updateChallengeList() {
    const list = document.getElementById("bjChallengeList");
    if (!list) return;
    list.innerHTML = this._challenges.map((c, i) => `
      <div class="bj-ch-item${c.done ? " bj-ch-done" : ""}" data-ch="${i}">
        <span class="bj-ch-icon">${c.done ? "✓" : "○"}</span>
        <div class="bj-ch-info">
          <strong class="bj-ch-name">${c.label}</strong>
          <span class="bj-ch-desc">${c.desc}</span>
        </div>
        <div class="bj-ch-prog">
          <div class="bj-ch-bar">
            <div class="bj-ch-fill" style="width:${Math.min(100, Math.round(c.progress / c.goal * 100))}%"></div>
          </div>
          <span class="bj-ch-count">${Math.min(c.progress, c.goal)}/${c.goal}</span>
        </div>
      </div>
    `).join("");

    const badge = document.getElementById("bjStreakBadge");
    if (badge) {
      const streak = this.engine.stats.currentStreak;
      badge.textContent = `🔥 Streak: ${streak}`;
      badge.className = `bj-ch-streak${streak >= 3 ? " bj-ch-streak--hot" : ""}`;
    }
  }

  /** Evaluate challenges after every round. Returns total bonus earned. */
  _evaluateChallenges(results) {
    const stats = this.engine.stats;
    const won   = results.some(r => r.result === "win" || r.result === "blackjack");
    let bonus   = 0;
    const earned = [];

    for (const ch of this._challenges) {
      if (ch.done || ch.bonusPaid) continue;
      let before = ch.progress;
      switch (ch.type) {
        case "streak":
          ch.progress = stats.currentStreak;
          break;
        case "double":
          if (won && stats.lastWasDouble) ch.progress++;
          break;
        case "shoe":
          ch.progress = won ? stats.handsInCurrentShoe : ch.progress;
          break;
        case "blackjack":
          if (results.some(r => r.result === "blackjack")) ch.progress++;
          break;
        case "comeback":
          if (this._wentBelowHalf && won) ch.progress++;
          break;
      }
      if (ch.progress >= ch.goal && !ch.done) {
        ch.done = true;
        ch.bonusPaid = true;
        const bonusAmt = ch.goal >= 5 ? 150 : ch.type === "streak" ? 100 : 75;
        this.engine.balance += bonusAmt;
        bonus += bonusAmt;
        earned.push({ label: ch.label, bonusAmt });
      }
    }

    this._updateChallengeList();
    return { bonus, earned };
  }

  // ─── Round Flow ────────────────────────────────────────────────────────────

  async _startRound() {
    if (this.engine.phase !== "idle") return;
    if (this.engine.currentBet <= 0) {
      this._setStatus("Place a bet first!");
      this._shake(this.elements.bjChipSelector);
      return;
    }

    // Track comeback challenge
    if (this.engine.balance < this.engine.startingBalance / 2) {
      this._wentBelowHalf = true;
    }

    this._showActionControls(false);
    this._clearTable();

    const res = this.engine.startRound();
    if (!res.ok) {
      const msg = res.reason === "insufficient_balance"
        ? "Insufficient balance — clear bet or go all-in!"
        : "Cannot start round.";
      this._setStatus(msg);
      this._showActionControls(false); // restore betting view
      return;
    }

    this._updateBetDisplay();
    this._playSound("bjDeal");

    // Classic deal order: Player · Dealer · Player · Dealer (hole)
    const s = this.engine.getState();
    await this._dealCard("dealer", 0, s.dealerHand[0]);
    await this._dealCard("player", 0, s.playerHands[0][0]);
    await this._dealCard("dealer", 1, s.dealerHand[1]); // face-down hole
    await this._dealCard("player", 0, s.playerHands[0][1]);
    this._renderValues();

    if (res.event === "natural_check") {
      await this._handleNaturals(res.playerBlackjack, res.dealerBlackjack);
      return;
    }

    this._refreshActionButtons();
    this._showActionControls(true);
    this._setStatus("Your turn — Hit, Stand, Double, or Split?");
  }

  async _handleNaturals(playerBJ, dealerBJ) {
    await this._sleep(450);
    if (dealerBJ) await this._flipHole();
    const outcome = this.engine.settleNaturals(playerBJ, dealerBJ);
    this._renderValues();

    let title, detail, type;
    if (outcome.result === "blackjack") {
      title  = "BLACKJACK!";
      detail = `+$${Math.floor(this.engine.handBets[0] * 1.5)} (3:2 payout)`;
      type   = "blackjack";
      this._playSound("bjBlackjack");
    } else if (outcome.result === "push") {
      title  = "PUSH";
      detail = "Bet returned — both have Blackjack";
      type   = "push";
    } else {
      title  = "DEALER BLACKJACK";
      detail = "Better luck next hand";
      type   = "lose";
      this._playSound("bjLose");
    }

    const { bonus, earned } = this._evaluateChallenges([{ result: outcome.result }]);
    this._updateBalanceDisplay();
    await this._sleep(250);
    this._showOutcome(title, detail, type, earned, bonus);
    if (type === "blackjack") this._launchConfetti();
  }

  async _actionHit() {
    if (this.engine.phase !== "player") return;
    this._showActionControls(false);

    const res = this.engine.hit();
    if (!res.ok) { this._showActionControls(true); return; }

    const s    = this.engine.getState();
    const hand = s.playerHands[s.activeHandIndex];
    await this._dealCard("player", s.activeHandIndex, hand[hand.length - 1]);
    this._renderValues();
    this._playSound("bjDeal");

    if (res.event === "bust") {
      this._setStatus("Bust! 💥");
      await this._sleep(600);
      await this._runDealerPhase();
      return;
    }
    if (res.event === "twenty_one") {
      this.engine.stand();
      if (this.engine.phase === "dealer") { await this._runDealerPhase(); return; }
    }

    this._refreshActionButtons();
    this._showActionControls(true);
    this._setStatus("Your turn.");
  }

  async _actionStand() {
    if (this.engine.phase !== "player") return;
    this._showActionControls(false);
    this.engine.stand();
    if (this.engine.phase === "dealer") {
      await this._runDealerPhase();
    } else {
      this._refreshActionButtons();
      this._showActionControls(true);
      this._setStatus(`Playing hand ${this.engine.activeHandIndex + 1}…`);
    }
  }

  async _actionDouble() {
    if (this.engine.phase !== "player") return;
    this._showActionControls(false);
    const res = this.engine.doubleDown();
    if (!res.ok) { this._showActionControls(true); return; }

    const handIdx = res.handIndex ?? this.engine.activeHandIndex;
    const hand    = this.engine.playerHands[handIdx];
    await this._dealCard("player", handIdx, hand[hand.length - 1]);
    this._updateBetDisplay();
    this._renderValues();
    this._playSound("bjDeal");

    if (this.engine.phase === "dealer") {
      await this._runDealerPhase();
    } else {
      this._refreshActionButtons();
      this._showActionControls(true);
    }
  }

  async _actionSplit() {
    if (this.engine.phase !== "player") return;
    this._showActionControls(false);
    const res = this.engine.split();
    if (!res.ok) { this._showActionControls(true); return; }

    this._playSound("bjChip");
    this._clearTable();
    const s = this.engine.getState();
    for (let hi = 0; hi < s.playerHands.length; hi++) {
      for (const card of s.playerHands[hi]) {
        await this._dealCard("player", hi, card);
      }
    }
    this._renderValues();
    this._updateBetDisplay();
    this._refreshActionButtons();
    this._showActionControls(true);
    this._setStatus(`Split — playing hand ${this.engine.activeHandIndex + 1} of ${s.playerHands.length}`);
  }

  async _runDealerPhase() {
    if (this.engine.phase !== "dealer") return;
    await this._flipHole();
    this._renderValues();
    await this._sleep(500);

    const res = this.engine.dealerPlay();
    for (const card of res.drawn) {
      await this._dealCard("dealer", 0, card);
      this._renderValues();
      this._playSound("bjDeal");
      await this._sleep(380);
    }

    await this._sleep(350);
    const settlement = this.engine.settle();
    const { bonus, earned } = this._evaluateChallenges(settlement.results);
    this._updateBalanceDisplay();
    this._showSettlementOutcome(settlement.results, earned, bonus);
  }

  _nextRound() {
    this._hideOutcome();
    this._stopConfetti();
    this.engine.resetForNextRound();
    this.elements.bjChipsDisplay.innerHTML = "";
    this._clearTable();
    this._syncView();

    // Bankrupt check
    if (this.engine.balance <= 0) {
      this._showBankrupt();
    }
  }

  // ─── DOM State Sync ────────────────────────────────────────────────────────

  /** Master sync: called on init, nextRound, new shoe. */
  _syncView() {
    const phase = this.engine.phase;
    this._updateBalanceDisplay();
    this._updateBetDisplay();
    this._renderShoeIndicator();
    this._updateChallengeList();

    // Betting controls: visible only when idle
    this.elements.bjBettingControls.classList.toggle("bj-hidden", phase !== "idle");
    // Action controls: always hidden on sync (re-shown after deal)
    this.elements.bjActionControls.classList.add("bj-hidden");

    this._setStatus(
      phase === "idle"    ? "Place your bet and deal to begin."
      : phase === "settled" ? "Round over."
      : "In progress."
    );
  }

  _showActionControls(show) {
    const phase = this.engine.phase;
    this.elements.bjActionControls.classList.toggle("bj-hidden", !show);
    // Betting controls: only visible when in idle phase AND action controls hidden
    this.elements.bjBettingControls.classList.toggle("bj-hidden", show || phase !== "idle");
  }

  _clearTable() {
    this.elements.bjDealerHand.innerHTML = "";
    this.elements.bjPlayerHandWrapper.innerHTML = "";
    this.elements.bjDealerValue.textContent = "";
  }

  _renderValues() {
    const s = this.engine.getState();

    // Dealer — only count visible cards
    const vis = s.dealerHand.filter(c => !c.faceDown);
    if (vis.length) {
      const val = this.engine.handValue(vis);
      const soft = this.engine.isSoft(vis);
      this.elements.bjDealerValue.textContent = `${val}${soft ? " (soft)" : ""}`;
    } else {
      this.elements.bjDealerValue.textContent = "";
    }

    // Player hands
    const groups = this.elements.bjPlayerHandWrapper.querySelectorAll(".bj-hand-group");
    groups.forEach((g, i) => {
      const hand = s.playerHands[i];
      if (!hand) return;
      const val  = this.engine.handValue(hand);
      const bust = this.engine.isBust(hand);
      const soft = this.engine.isSoft(hand);
      const active = i === s.activeHandIndex && s.phase === "player";
      const lbl  = g.querySelector(".bj-hand-value");
      if (lbl) {
        lbl.textContent = bust ? `${val} — BUST` : `${val}${soft ? " (soft)" : ""}`;
        lbl.className = `bj-hand-value${bust ? " bj-hand-value--bust" : ""}`;
      }
      g.classList.toggle("bj-hand-group--active", active);
    });
  }

  _updateBalanceDisplay() {
    const b = this.engine.balance;
    this.elements.bjBalance.textContent = `$${b.toLocaleString()}`;
  }

  _updateBetDisplay() {
    const bet   = this.engine.currentBet;
    const idle  = this.engine.phase === "idle";
    this.elements.bjBetAmount.textContent = `$${bet}`;
    this.elements.bjDealBtn.disabled = !idle || bet <= 0;
    this.elements.bjClearBetBtn.disabled = !idle;
    this.elements.bjChipSelector.querySelectorAll("[data-bj-chip]").forEach(b => {
      b.disabled = !idle;
    });
  }

  _refreshActionButtons() {
    const s = this.engine.getState();
    this.elements.bjDoubleBtn.disabled = !s.canDouble;
    this.elements.bjSplitBtn.disabled  = !s.canSplit;
  }

  _renderShoeIndicator() {
    const el = this.elements.bjShoeIndicator;
    if (!el) return;
    const pct  = Math.round(this.engine.shoePenetration * 100);
    const warn = this.engine.reshuffleNeeded;
    el.textContent = warn ? "SHUFFLE SOON" : `${100 - pct}% left`;
    el.className = `bj-shoe-indicator${warn ? " bj-shoe-indicator--warn" : ""}`;
  }

  _setStatus(text) {
    this.elements.bjStatus.textContent = text;
  }

  // ─── Card Rendering ────────────────────────────────────────────────────────

  async _dealCard(target, handIndex, card) {
    const el = this._createCard(card);

    if (target === "dealer") {
      this.elements.bjDealerHand.appendChild(el);
    } else {
      let group = this.elements.bjPlayerHandWrapper.querySelector(
        `.bj-hand-group[data-hi="${handIndex}"]`
      );
      if (!group) {
        group = document.createElement("div");
        group.className = "bj-hand-group";
        group.dataset.hi = handIndex;
        const lbl = document.createElement("div");
        lbl.className = "bj-hand-value";
        group.appendChild(lbl);
        const row = document.createElement("div");
        row.className = "bj-hand-cards";
        group.appendChild(row);
        this.elements.bjPlayerHandWrapper.appendChild(group);
      }
      group.querySelector(".bj-hand-cards").appendChild(el);
    }

    await this._animateDeal(el);
  }

  _createCard(card) {
    const w = document.createElement("div");
    w.className = `bj-card${card.faceDown ? " bj-card--facedown" : " bj-card--" + SUIT_COLOR[card.suit]}`;

    const inner = document.createElement("div");
    inner.className = "bj-card-inner";

    const front = document.createElement("div");
    front.className = "bj-card-face bj-card-front";
    if (!card.faceDown) front.innerHTML = this._frontHTML(card);

    const back = document.createElement("div");
    back.className = "bj-card-face bj-card-back";
    back.innerHTML = `<div class="bj-card-back-pattern"></div>`;

    inner.appendChild(front);
    inner.appendChild(back);
    w.appendChild(inner);
    w._cardData = card;
    return w;
  }

  _frontHTML(card) {
    const s = SUIT_SYMBOL[card.suit];
    return `
      <span class="bj-cr bj-cr--tl">${card.rank}</span>
      <span class="bj-cs bj-cs--tl">${s}</span>
      <span class="bj-cs bj-cs--c">${s}</span>
      <span class="bj-cs bj-cs--br">${s}</span>
      <span class="bj-cr bj-cr--br">${card.rank}</span>`;
  }

  _animateDeal(cardEl) {
    return new Promise(resolve => {
      const shoe     = this.elements.bjShoe;
      const shoeRect = shoe.getBoundingClientRect();
      const cardRect = cardEl.getBoundingClientRect();
      const dx = shoeRect.left + shoeRect.width  / 2 - (cardRect.left + cardRect.width  / 2);
      const dy = shoeRect.top  + shoeRect.height / 2 - (cardRect.top  + cardRect.height / 2);

      cardEl.style.setProperty("--bj-dx", `${dx}px`);
      cardEl.style.setProperty("--bj-dy", `${dy}px`);
      cardEl.classList.add("bj-card--dealing");

      const done = () => {
        cardEl.classList.remove("bj-card--dealing");
        cardEl.removeEventListener("animationend", done);
        resolve();
      };
      cardEl.addEventListener("animationend", done);
      setTimeout(resolve, 600); // fallback
    });
  }

  async _flipHole() {
    const holeEl = this.elements.bjDealerHand.children[1];
    if (!holeEl || !holeEl.classList.contains("bj-card--facedown")) return;

    holeEl.classList.add("bj-card--flipping");
    await this._sleep(180);
    holeEl.classList.remove("bj-card--facedown");
    holeEl.classList.add(`bj-card--${SUIT_COLOR[this.engine.dealerHand[1].suit]}`);
    holeEl.querySelector(".bj-card-front").innerHTML = this._frontHTML(this.engine.dealerHand[1]);
    await this._sleep(200);
    holeEl.classList.remove("bj-card--flipping");
    this._playSound("bjFlip");
  }

  // ─── Chip Animation ────────────────────────────────────────────────────────

  _animateChipToBetArea(sourceBtn, value) {
    const chip = CHIP_DENOMINATIONS.find(c => c.value === value);
    if (!chip) return;
    const ghost = document.createElement("div");
    ghost.className = `bj-chip ${chip.cls} bj-chip--ghost`;
    ghost.innerHTML = `<span class="bj-chip-label">${chip.label}</span>`;
    document.body.appendChild(ghost);

    const src = sourceBtn.getBoundingClientRect();
    const tgt = this.elements.bjChipsDisplay.getBoundingClientRect();
    ghost.style.cssText = `left:${src.left + src.width/2 - 26}px;top:${src.top + src.height/2 - 26}px`;

    const dx = tgt.left + tgt.width/2  - src.left - src.width/2;
    const dy = tgt.top  + tgt.height/2 - src.top  - src.height/2;
    requestAnimationFrame(() => {
      ghost.style.transform = `translate(${dx}px,${dy}px) scale(0.7)`;
      ghost.style.opacity = "0";
    });
    setTimeout(() => { document.body.removeChild(ghost); this._addChip(chip); }, 360);
  }

  _addChip(chip) {
    const stack   = this.elements.bjChipsDisplay;
    const n       = stack.querySelectorAll(".bj-chip").length;
    const el      = document.createElement("div");
    el.className  = `bj-chip ${chip.cls}`;
    el.style.setProperty("--off", `${Math.min(n * 5, 40)}px`);
    el.innerHTML  = `<span class="bj-chip-label">${chip.label}</span>`;
    stack.appendChild(el);
  }

  // ─── Outcome Overlay ───────────────────────────────────────────────────────

  _showSettlementOutcome(results, earned, bonus) {
    const wins   = results.filter(r => r.result === "win").length;
    const losses = results.filter(r => r.result === "lose").length;
    const pushes = results.filter(r => r.result === "push").length;
    const totalBet = results.reduce((s, r) => s + r.bet, 0);
    const totalNet = results.reduce((s, r) => s + r.net, 0);
    const profit   = totalNet - totalBet;
    const dealerBust = this.engine.isBust(this.engine.dealerHand);

    let title, detail, type;
    if (wins > 0 && losses === 0) {
      title  = dealerBust ? "DEALER BUSTS — YOU WIN!" : "YOU WIN!";
      detail = `+$${profit}`;
      type   = "win";
      this._playSound("bjWin");
    } else if (losses > 0 && wins === 0 && pushes === 0) {
      const playerBust = this.engine.isBust(this.engine.playerHands[0]);
      title  = playerBust ? "BUST — YOU LOSE" : "DEALER WINS";
      detail = `-$${totalBet}`;
      type   = "lose";
      this._playSound("bjLose");
    } else if (pushes === results.length) {
      title  = "PUSH";
      detail = "Bets returned";
      type   = "push";
    } else {
      // mixed (split result)
      title  = "SPLIT RESULT";
      detail = results.map(r =>
        r.result === "win"  ? `H${r.handIndex + 1}: +$${r.net - r.bet}`
        : r.result === "push" ? `H${r.handIndex + 1}: Push`
        : `H${r.handIndex + 1}: -$${r.bet}`
      ).join("  ·  ");
      type   = profit > 0 ? "win" : profit < 0 ? "lose" : "push";
      if (profit > 0) this._playSound("bjWin");
      else this._playSound("bjLose");
    }

    this._showOutcome(title, detail, type, earned, bonus);
    if (type === "win") this._launchConfetti();
  }

  _showOutcome(title, detail, type, earned = [], bonus = 0) {
    const el = this.elements;

    el.bjOutcomeTitle.textContent  = title;
    el.bjOutcomeDetail.textContent = detail;

    // Streak badge
    const streak = this.engine.stats.currentStreak;
    if (el.bjOutcomeStreak) {
      el.bjOutcomeStreak.textContent = streak >= 2 ? `🔥 ${streak} in a row!` : "";
      el.bjOutcomeStreak.className   = `bj-outcome-streak${streak >= 3 ? " bj-outcome-streak--hot" : ""}`;
    }

    // Challenge bonus line
    if (el.bjOutcomeBonus) {
      if (earned.length > 0) {
        el.bjOutcomeBonus.innerHTML = earned.map(e =>
          `<span class="bj-bonus-tag">✦ ${e.label} +$${e.bonusAmt}</span>`
        ).join(" ");
        el.bjOutcomeBonus.classList.remove("bj-hidden");
      } else {
        el.bjOutcomeBonus.innerHTML = "";
        el.bjOutcomeBonus.classList.add("bj-hidden");
      }
    }

    el.bjOutcomeOverlay.className = `bj-outcome-overlay bj-outcome--${type}`;
    // Remove hidden before animation tick
    el.bjOutcomeOverlay.removeAttribute("hidden");
    el.bjOutcomeOverlay.classList.remove("bj-hidden");
    void el.bjOutcomeOverlay.offsetWidth; // force reflow
    el.bjOutcomeOverlay.classList.add("bj-outcome--visible");
  }

  _hideOutcome() {
    const ov = this.elements.bjOutcomeOverlay;
    ov.classList.remove("bj-outcome--visible");
    setTimeout(() => ov.classList.add("bj-hidden"), 350);
  }

  _showBankrupt() {
    this.elements.bjOutcomeTitle.textContent  = "BANKRUPT";
    this.elements.bjOutcomeDetail.textContent = "Your balance hit zero. Starting fresh with $1,000.";
    if (this.elements.bjOutcomeBonus) {
      this.elements.bjOutcomeBonus.innerHTML = "";
      this.elements.bjOutcomeBonus.classList.add("bj-hidden");
    }
    if (this.elements.bjOutcomeStreak) {
      this.elements.bjOutcomeStreak.textContent = "";
    }
    this.elements.bjNextRoundBtn.textContent = "Start Over";
    this.elements.bjOutcomeOverlay.className = "bj-outcome-overlay bj-outcome--bankrupt";
    this.elements.bjOutcomeOverlay.classList.remove("bj-hidden");
    void this.elements.bjOutcomeOverlay.offsetWidth;
    this.elements.bjOutcomeOverlay.classList.add("bj-outcome--visible");

    // Reset engine balance and challenges
    this.engine.balance = 1000;
    this.engine.stats.currentStreak = 0;
    this._challenges = getDailyChallenges();
    this._wentBelowHalf = false;
  }

  // ─── Confetti ──────────────────────────────────────────────────────────────

  _launchConfetti() {
    const canvas = this.elements.bjConfettiCanvas;
    if (!canvas) return;
    canvas.width  = canvas.offsetWidth  || 600;
    canvas.height = canvas.offsetHeight || 400;
    const ctx = canvas.getContext("2d");
    const COLORS = ["#FFD700","#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD","#98FB98"];

    const particles = Array.from({ length: CONFETTI_COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: -Math.random() * canvas.height * 0.5,
      w: Math.random() * 12 + 6,
      h: Math.random() * 7 + 4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      vx: (Math.random() - 0.5) * 3.5,
      vy: Math.random() * 3 + 1.5,
      rot: Math.random() * 360,
      rspd: (Math.random() - 0.5) * 7,
      opacity: 1,
    }));

    let frame = 0;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * Math.PI / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rspd;
        if (frame > 80) p.opacity -= 0.011;
      }
      frame++;
      if (frame < 200 && particles.some(p => p.opacity > 0)) {
        this._confettiAnim = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    this._confettiAnim = requestAnimationFrame(tick);
  }

  _stopConfetti() {
    if (this._confettiAnim) {
      cancelAnimationFrame(this._confettiAnim);
      this._confettiAnim = null;
    }
    const c = this.elements.bjConfettiCanvas;
    if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height);
  }

  // ─── Sound ─────────────────────────────────────────────────────────────────

  _playSound(kind) {
    if (this.sound && typeof this.sound[kind] === "function") this.sound[kind]();
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  _shake(el) {
    el.classList.remove("bj-shake");
    void el.offsetWidth;
    el.classList.add("bj-shake");
    setTimeout(() => el.classList.remove("bj-shake"), 500);
  }
}
