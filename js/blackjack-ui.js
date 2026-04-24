// ─── Blackjack UI ─────────────────────────────────────────────────────────────
// Handles all DOM rendering, animations, and user interaction for the Blackjack
// module. Follows the same Engine/UI decoupling pattern as Chess and Backgammon.

const SUIT_SYMBOL = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };
const SUIT_COLOR = { spades: "black", hearts: "red", diamonds: "red", clubs: "black" };

const CHIP_DENOMINATIONS = [
  { value: 5,   label: "$5",   cls: "bj-chip--red"    },
  { value: 10,  label: "$10",  cls: "bj-chip--blue"   },
  { value: 25,  label: "$25",  cls: "bj-chip--green"  },
  { value: 50,  label: "$50",  cls: "bj-chip--purple" },
  { value: 100, label: "$100", cls: "bj-chip--black"  },
];

// Confetti particle count
const CONFETTI_COUNT = 120;

export class BlackjackUI {
  /**
   * @param {import('./blackjack-engine.js').BlackjackEngine} engine
   * @param {Object} elements  DOM element map from app.js
   * @param {import('./sound.js').GameSound} sound
   */
  constructor(engine, elements, sound) {
    this.engine = engine;
    this.elements = elements;
    this.sound = sound;
    this.active = false;
    this._confettiAnim = null;
    this._dealQueue = Promise.resolve();
    this._naturalHandled = false;
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  init() {
    this._bindButtons();
    this._renderChipSelector();
    this._render();
  }

  setActive(active) {
    this.active = active;
  }

  // ─── Button Wiring ─────────────────────────────────────────────────────────

  _bindButtons() {
    const el = this.elements;

    // Chip selector (values set dynamically by _renderChipSelector)
    el.bjChipSelector.addEventListener("click", e => {
      const btn = e.target.closest(".bj-chip-btn");
      if (!btn) return;
      const value = parseInt(btn.dataset.value, 10);
      const res = this.engine.addBet(value);
      if (res.ok) {
        this._playSound("bjChip");
        this._animateChipToBetArea(btn, value);
        this._updateBetDisplay();
      } else {
        this._shakeElement(el.bjBetAmount);
      }
    });

    el.bjClearBetBtn.addEventListener("click", () => {
      const res = this.engine.clearBet();
      if (res.ok) {
        this._updateBetDisplay();
        el.bjChipsDisplay.innerHTML = "";
      }
    });

    el.bjDealBtn.addEventListener("click", () => this._startRound());
    el.bjHitBtn.addEventListener("click", () => this._actionHit());
    el.bjStandBtn.addEventListener("click", () => this._actionStand());
    el.bjDoubleBtn.addEventListener("click", () => this._actionDouble());
    el.bjSplitBtn.addEventListener("click", () => this._actionSplit());
    el.bjNextRoundBtn.addEventListener("click", () => this._nextRound());
    el.bjNewShoeBtn.addEventListener("click", () => {
      this.engine.buildShoe();
      this._setStatus("New shoe shuffled. Place your bet.");
      this._render();
    });
  }

  // ─── Chip Selector Rendering ───────────────────────────────────────────────

  _renderChipSelector() {
    const container = this.elements.bjChipSelector;
    container.innerHTML = "";
    for (const chip of CHIP_DENOMINATIONS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `bj-chip-btn ${chip.cls}`;
      btn.dataset.value = chip.value;
      btn.setAttribute("aria-label", `Bet ${chip.label}`);
      btn.innerHTML = `<span class="bj-chip-label">${chip.label}</span>`;
      container.appendChild(btn);
    }
  }

  // ─── Round Flow ────────────────────────────────────────────────────────────

  async _startRound() {
    if (this.engine.phase !== "idle") return;
    if (this.engine.currentBet <= 0) {
      this._setStatus("Place a bet first!");
      this._shakeElement(this.elements.bjChipSelector);
      return;
    }

    this._setActionsVisible(false);
    this._clearTable();

    const res = this.engine.startRound();
    if (!res.ok) {
      this._setStatus(res.reason === "insufficient_balance" ? "Insufficient balance." : "Cannot start round.");
      return;
    }

    this._updateBetDisplay();

    // Deal animation: P1, D1, P2, D2 (dealer 2nd is face-down)
    const state = this.engine.getState();
    await this._dealCardAnimated("dealer", 0, state.dealerHand[0]);
    await this._dealCardAnimated("player", 0, state.playerHands[0][0]);
    await this._dealCardAnimated("dealer", 1, state.dealerHand[1]); // face-down
    await this._dealCardAnimated("player", 0, state.playerHands[0][1]);

    this._renderHandValues();

    if (res.event === "natural_check") {
      await this._handleNaturals(res.playerBlackjack, res.dealerBlackjack);
      return;
    }

    this._setActionButtonStates();
    this._setActionsVisible(true);
    this._setStatus("Your turn — Hit, Stand, Double, or Split?");
  }

  async _handleNaturals(playerBJ, dealerBJ) {
    await this._sleep(400);
    if (dealerBJ) {
      await this._revealDealerHole();
    }
    const outcome = this.engine.settleNaturals(playerBJ, dealerBJ);
    this._renderHandValues();

    if (outcome.result === "blackjack") {
      this._playSound("bjBlackjack");
      await this._sleep(300);
      this._showOutcome("BLACKJACK! 🃏", `+$${outcome.net - this.engine.handBets[0]}`, "win");
      this._launchConfetti();
    } else if (outcome.result === "push") {
      this._showOutcome("PUSH", "Bet returned", "push");
    } else {
      this._playSound("bjLose");
      this._showOutcome("DEALER BLACKJACK", `$0 returned`, "lose");
    }
    this._updateBalanceDisplay();
  }

  async _actionHit() {
    if (this.engine.phase !== "player") return;
    this._setActionsVisible(false);

    const res = this.engine.hit();
    if (!res.ok) return;

    const state = this.engine.getState();
    const hand = state.playerHands[state.activeHandIndex];
    await this._dealCardAnimated("player", state.activeHandIndex, hand[hand.length - 1]);
    this._renderHandValues();
    this._playSound("bjDeal");

    if (res.event === "bust") {
      await this._sleep(300);
      if (this.engine.phase === "dealer") {
        await this._runDealerPhase();
      } else {
        this._setStatus("Bust! 💥");
        await this._sleep(500);
        await this._runDealerPhase();
      }
      return;
    }

    if (res.event === "twenty_one") {
      await this._sleep(200);
      this.engine.stand();
      if (this.engine.phase === "dealer") {
        await this._runDealerPhase();
        return;
      }
    }

    this._setActionButtonStates();
    this._setActionsVisible(true);
    this._setStatus("Your turn.");
  }

  async _actionStand() {
    if (this.engine.phase !== "player") return;
    this._setActionsVisible(false);
    this.engine.stand();
    if (this.engine.phase === "dealer") {
      await this._runDealerPhase();
    } else {
      this._setActionButtonStates();
      this._setActionsVisible(true);
      this._setStatus(`Playing hand ${this.engine.activeHandIndex + 1}…`);
    }
  }

  async _actionDouble() {
    if (this.engine.phase !== "player") return;
    this._setActionsVisible(false);
    const res = this.engine.doubleDown();
    if (!res.ok) {
      this._setActionsVisible(true);
      return;
    }

    const state = this.engine.getState();
    // The active hand index may have already advanced; use the hand that was doubled
    const handIdx = res.handIndex ?? 0;
    const hand = this.engine.playerHands[handIdx] ?? state.playerHands[0];
    await this._dealCardAnimated("player", handIdx, hand[hand.length - 1]);
    this._updateBetDisplay();
    this._renderHandValues();
    this._playSound("bjDeal");

    if (this.engine.phase === "dealer") {
      await this._runDealerPhase();
    } else {
      this._setActionButtonStates();
      this._setActionsVisible(true);
    }
  }

  async _actionSplit() {
    if (this.engine.phase !== "player") return;
    this._setActionsVisible(false);
    const res = this.engine.split();
    if (!res.ok) {
      this._setActionsVisible(true);
      return;
    }

    this._playSound("bjChip");
    this._clearTable();
    const state = this.engine.getState();

    // Re-render all hands after split
    for (let hi = 0; hi < state.playerHands.length; hi++) {
      for (const card of state.playerHands[hi]) {
        await this._dealCardAnimated("player", hi, card);
      }
    }
    this._renderHandValues();
    this._updateBetDisplay();

    this._setActionButtonStates();
    this._setActionsVisible(true);
    this._setStatus(`Split — playing hand ${this.engine.activeHandIndex + 1} of ${state.playerHands.length}.`);
  }

  async _runDealerPhase() {
    if (this.engine.phase !== "dealer") return;

    await this._revealDealerHole();
    this._playSound("bjDeal");
    this._renderHandValues();
    await this._sleep(500);

    const res = this.engine.dealerPlay();
    for (const card of res.drawn) {
      await this._dealCardAnimated("dealer", 0, card);
      this._renderHandValues();
      this._playSound("bjDeal");
      await this._sleep(350);
    }

    await this._sleep(300);
    const settlement = this.engine.settle();
    this._updateBalanceDisplay();
    this._showSettlementOutcome(settlement.results);
  }

  _nextRound() {
    this._hideOutcome();
    this._stopConfetti();
    this.engine.resetForNextRound();
    this.elements.bjChipsDisplay.innerHTML = "";
    this._clearTable();
    this._setActionsVisible(false);
    this._render();
  }

  // ─── DOM Rendering ─────────────────────────────────────────────────────────

  _render() {
    const state = this.engine.getState();
    this._updateBalanceDisplay();
    this._updateBetDisplay();
    this._renderShoeIndicator(state.shoePenetration, state.reshuffleNeeded);
    this._setStatus(
      state.phase === "idle"
        ? "Place your bet and deal to begin."
        : state.phase === "settled"
        ? "Round over — start next round."
        : "In progress."
    );
  }

  _clearTable() {
    this.elements.bjDealerHand.innerHTML = "";
    this.elements.bjPlayerHandWrapper.innerHTML = "";
    this.elements.bjDealerValue.textContent = "";
  }

  _renderHandValues() {
    const state = this.engine.getState();
    // Dealer: only show visible cards value
    const dealerVisible = state.dealerHand.filter(c => !c.faceDown);
    if (dealerVisible.length > 0) {
      const val = this.engine.handValue(dealerVisible);
      this.elements.bjDealerValue.textContent = `Dealer: ${val}${this.engine.isSoft(dealerVisible) ? " (soft)" : ""}`;
    } else {
      this.elements.bjDealerValue.textContent = "";
    }

    // Player hands — update value labels on hand wrappers
    const wrappers = this.elements.bjPlayerHandWrapper.querySelectorAll(".bj-hand-group");
    wrappers.forEach((wrapper, i) => {
      const hand = state.playerHands[i];
      if (!hand) return;
      const val = this.engine.handValue(hand);
      const label = wrapper.querySelector(".bj-hand-value");
      if (!label) return;
      const bust = this.engine.isBust(hand);
      const soft = this.engine.isSoft(hand);
      const active = i === state.activeHandIndex && state.phase === "player";
      label.textContent = bust ? `${val} — BUST` : `${val}${soft ? " (soft)" : ""}`;
      label.className = `bj-hand-value${bust ? " bj-hand-value--bust" : ""}${active ? " bj-hand-value--active" : ""}`;
      wrapper.classList.toggle("bj-hand-group--active", active);
    });
  }

  _updateBalanceDisplay() {
    this.elements.bjBalance.textContent = `Balance: $${this.engine.balance}`;
  }

  _updateBetDisplay() {
    this.elements.bjBetAmount.textContent = `$${this.engine.currentBet}`;
    const dealBtn = this.elements.bjDealBtn;
    const inBettingPhase = this.engine.phase === "idle";
    dealBtn.disabled = !inBettingPhase || this.engine.currentBet <= 0;
    this.elements.bjClearBetBtn.disabled = !inBettingPhase;
    // Disable chip buttons if round in progress
    this.elements.bjChipSelector.querySelectorAll(".bj-chip-btn").forEach(btn => {
      btn.disabled = !inBettingPhase;
    });
  }

  _renderShoeIndicator(penetration, reshuffleNeeded) {
    const el = this.elements.bjShoeIndicator;
    if (!el) return;
    const pct = Math.round(penetration * 100);
    el.textContent = reshuffleNeeded ? "SHUFFLE SOON" : `Shoe: ${pct}% dealt`;
    el.className = `bj-shoe-indicator${reshuffleNeeded ? " bj-shoe-indicator--warn" : ""}`;
  }

  _setActionButtonStates() {
    const state = this.engine.getState();
    this.elements.bjDoubleBtn.disabled = !state.canDouble;
    this.elements.bjSplitBtn.disabled = !state.canSplit;
  }

  _setActionsVisible(visible) {
    this.elements.bjActionControls.classList.toggle("bj-hidden", !visible);
    this.elements.bjBettingControls.classList.toggle("bj-hidden", visible || this.engine.phase !== "idle");
  }

  _setStatus(text) {
    this.elements.bjStatus.textContent = text;
  }

  // ─── Card Rendering ────────────────────────────────────────────────────────

  /**
   * Creates a card element and appends it to the appropriate hand container,
   * then plays the deal slide animation.
   */
  async _dealCardAnimated(target, handIndex, card) {
    const el = this._createCardElement(card);

    if (target === "dealer") {
      this.elements.bjDealerHand.appendChild(el);
    } else {
      let group = this.elements.bjPlayerHandWrapper.querySelector(
        `.bj-hand-group[data-hand-index="${handIndex}"]`
      );
      if (!group) {
        group = document.createElement("div");
        group.className = "bj-hand-group";
        group.dataset.handIndex = handIndex;
        const valueLabel = document.createElement("div");
        valueLabel.className = "bj-hand-value";
        group.appendChild(valueLabel);
        const cardRow = document.createElement("div");
        cardRow.className = "bj-hand-cards";
        group.appendChild(cardRow);
        this.elements.bjPlayerHandWrapper.appendChild(group);
      }
      group.querySelector(".bj-hand-cards").appendChild(el);
    }

    // Trigger deal animation
    await this._animateDeal(el);
    return el;
  }

  _createCardElement(card) {
    const wrapper = document.createElement("div");
    wrapper.className = `bj-card${card.faceDown ? " bj-card--facedown" : ""}`;
    if (!card.faceDown) {
      wrapper.classList.add(`bj-card--${SUIT_COLOR[card.suit]}`);
    }

    const inner = document.createElement("div");
    inner.className = "bj-card-inner";

    const front = document.createElement("div");
    front.className = "bj-card-face bj-card-front";
    front.innerHTML = `
      <span class="bj-card-rank bj-card-rank--tl">${card.rank}</span>
      <span class="bj-card-suit bj-card-suit--tl">${SUIT_SYMBOL[card.suit]}</span>
      <span class="bj-card-suit bj-card-suit--center">${SUIT_SYMBOL[card.suit]}</span>
      <span class="bj-card-suit bj-card-suit--br">${SUIT_SYMBOL[card.suit]}</span>
      <span class="bj-card-rank bj-card-rank--br">${card.rank}</span>
    `;

    const back = document.createElement("div");
    back.className = "bj-card-face bj-card-back";
    back.innerHTML = `<div class="bj-card-back-pattern"></div>`;

    inner.appendChild(front);
    inner.appendChild(back);
    wrapper.appendChild(inner);

    // Store card data for flip
    wrapper._cardData = card;
    return wrapper;
  }

  _animateDeal(cardEl) {
    return new Promise(resolve => {
      // Compute offset from shoe to card's actual rendered position
      const shoe = this.elements.bjShoe;
      const shoeRect = shoe.getBoundingClientRect();
      const cardRect = cardEl.getBoundingClientRect();
      const dx = shoeRect.left + shoeRect.width / 2 - (cardRect.left + cardRect.width / 2);
      const dy = shoeRect.top + shoeRect.height / 2 - (cardRect.top + cardRect.height / 2);

      cardEl.style.setProperty("--bj-deal-dx", `${dx}px`);
      cardEl.style.setProperty("--bj-deal-dy", `${dy}px`);
      cardEl.classList.add("bj-card--dealing");

      const onEnd = () => {
        cardEl.classList.remove("bj-card--dealing");
        cardEl.removeEventListener("animationend", onEnd);
        resolve();
      };
      cardEl.addEventListener("animationend", onEnd);

      // Fallback
      setTimeout(resolve, 650);
    });
  }

  async _revealDealerHole() {
    const holeEl = this.elements.bjDealerHand.children[1];
    if (!holeEl) return;

    holeEl.classList.add("bj-card--flipping");
    await this._sleep(200);
    holeEl.classList.remove("bj-card--facedown");
    holeEl.classList.add(`bj-card--${SUIT_COLOR[this.engine.dealerHand[1].suit]}`);
    holeEl.querySelector(".bj-card-face.bj-card-front").innerHTML = this._frontHTML(this.engine.dealerHand[1]);
    await this._sleep(250);
    holeEl.classList.remove("bj-card--flipping");
    this._playSound("bjFlip");
  }

  _frontHTML(card) {
    return `
      <span class="bj-card-rank bj-card-rank--tl">${card.rank}</span>
      <span class="bj-card-suit bj-card-suit--tl">${SUIT_SYMBOL[card.suit]}</span>
      <span class="bj-card-suit bj-card-suit--center">${SUIT_SYMBOL[card.suit]}</span>
      <span class="bj-card-suit bj-card-suit--br">${SUIT_SYMBOL[card.suit]}</span>
      <span class="bj-card-rank bj-card-rank--br">${card.rank}</span>
    `;
  }

  // ─── Chip Animation ────────────────────────────────────────────────────────

  _animateChipToBetArea(sourceBtn, value) {
    const chip = CHIP_DENOMINATIONS.find(c => c.value === value);
    if (!chip) return;

    // Clone for flight animation
    const ghost = document.createElement("div");
    ghost.className = `bj-chip ${chip.cls} bj-chip--ghost`;
    ghost.innerHTML = `<span class="bj-chip-label">${chip.label}</span>`;
    document.body.appendChild(ghost);

    const srcRect = sourceBtn.getBoundingClientRect();
    const tgtRect = this.elements.bjChipsDisplay.getBoundingClientRect();

    ghost.style.left = `${srcRect.left + srcRect.width / 2 - 28}px`;
    ghost.style.top = `${srcRect.top + srcRect.height / 2 - 28}px`;

    const dx = tgtRect.left + tgtRect.width / 2 - srcRect.left - srcRect.width / 2;
    const dy = tgtRect.top + tgtRect.height / 2 - srcRect.top - srcRect.height / 2;

    requestAnimationFrame(() => {
      ghost.style.transform = `translate(${dx}px, ${dy}px) scale(0.75)`;
      ghost.style.opacity = "0";
    });

    setTimeout(() => {
      document.body.removeChild(ghost);
      // Add a chip to the display stack
      this._addChipToStack(chip);
    }, 380);
  }

  _addChipToStack(chip) {
    const stack = this.elements.bjChipsDisplay;
    const existing = stack.querySelectorAll(".bj-chip").length;
    const el = document.createElement("div");
    el.className = `bj-chip ${chip.cls}`;
    el.style.setProperty("--bj-chip-offset", `${existing * 4}px`);
    el.innerHTML = `<span class="bj-chip-label">${chip.label}</span>`;
    stack.appendChild(el);
  }

  // ─── Outcome / Confetti ────────────────────────────────────────────────────

  _showSettlementOutcome(results) {
    const wins = results.filter(r => r.result === "win").length;
    const losses = results.filter(r => r.result === "lose").length;
    const pushes = results.filter(r => r.result === "push").length;
    const totalNet = results.reduce((sum, r) => sum + r.net, 0);
    const totalBet = results.reduce((sum, r) => sum + r.bet, 0);
    const profit = totalNet - totalBet;

    let title, detail, type;
    const dealerBust = this.engine.isBust(this.engine.dealerHand);

    if (wins > 0 && losses === 0) {
      title = dealerBust ? "DEALER BUSTS — YOU WIN!" : "YOU WIN!";
      detail = `+$${profit}`;
      type = "win";
      this._playSound("bjWin");
      this._launchConfetti();
    } else if (losses > 0 && wins === 0 && pushes === 0) {
      title = this.engine.isBust(this.engine.playerHands[0]) ? "BUST — YOU LOSE" : "DEALER WINS";
      detail = `-$${totalBet}`;
      type = "lose";
      this._playSound("bjLose");
    } else if (pushes === results.length) {
      title = "PUSH";
      detail = "Bets returned";
      type = "push";
    } else {
      title = "SPLIT RESULT";
      const parts = results.map(r =>
        r.result === "win" ? `Hand ${r.handIndex + 1}: Win +$${r.net - r.bet}`
        : r.result === "push" ? `Hand ${r.handIndex + 1}: Push`
        : `Hand ${r.handIndex + 1}: Lose`
      ).join(" | ");
      detail = parts;
      type = profit >= 0 ? "win" : "lose";
      if (profit > 0) { this._playSound("bjWin"); this._launchConfetti(); }
      else this._playSound("bjLose");
    }

    this._showOutcome(title, detail, type);
  }

  _showOutcome(title, detail, type) {
    this.elements.bjOutcomeTitle.textContent = title;
    this.elements.bjOutcomeDetail.textContent = detail;
    this.elements.bjOutcomeOverlay.className = `bj-outcome-overlay bj-outcome--${type}`;
    this.elements.bjOutcomeOverlay.classList.remove("bj-hidden");
    void this.elements.bjOutcomeOverlay.offsetWidth; // reflow for animation
    this.elements.bjOutcomeOverlay.classList.add("bj-outcome--visible");
  }

  _hideOutcome() {
    this.elements.bjOutcomeOverlay.classList.remove("bj-outcome--visible");
    setTimeout(() => this.elements.bjOutcomeOverlay.classList.add("bj-hidden"), 400);
  }

  _launchConfetti() {
    const canvas = this.elements.bjConfettiCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const particles = Array.from({ length: CONFETTI_COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      w: Math.random() * 10 + 6,
      h: Math.random() * 6 + 4,
      color: ["#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD"][Math.floor(Math.random() * 7)],
      vx: (Math.random() - 0.5) * 3,
      vy: Math.random() * 3 + 2,
      rot: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 6,
      opacity: 1,
    }));

    let frame = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rotSpeed;
        if (frame > 90) p.opacity -= 0.012;
      }
      frame++;
      if (frame < 180 && particles.some(p => p.opacity > 0)) {
        this._confettiAnim = requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    this._confettiAnim = requestAnimationFrame(animate);
  }

  _stopConfetti() {
    if (this._confettiAnim) {
      cancelAnimationFrame(this._confettiAnim);
      this._confettiAnim = null;
    }
    const canvas = this.elements.bjConfettiCanvas;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // ─── Sound ─────────────────────────────────────────────────────────────────

  _playSound(kind) {
    if (!this.sound) return;
    if (typeof this.sound[kind] === "function") {
      this.sound[kind]();
    }
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  _shakeElement(el) {
    el.classList.remove("bj-shake");
    void el.offsetWidth;
    el.classList.add("bj-shake");
    setTimeout(() => el.classList.remove("bj-shake"), 500);
  }
}
