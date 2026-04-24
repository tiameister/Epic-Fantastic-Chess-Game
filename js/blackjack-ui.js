// ─── Blackjack UI ─────────────────────────────────────────────────────────────
// All DOM, animation and challenge logic. Zero engine coupling beyond API calls.
// Multi-player: sequential betting + turn-based play at a shared table.

import { MAX_PLAYERS } from "./blackjack-engine.js";

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
const CHALLENGE_POOL = [
  { id: "streak3",    label: "Hot Hand",       desc: "Win 3 hands in a row",            goal: 3,  type: "streak"    },
  { id: "streak5",    label: "On Fire",        desc: "Win 5 hands in a row",            goal: 5,  type: "streak"    },
  { id: "double",     label: "Double or Nothing", desc: "Win a Double Down",            goal: 1,  type: "double"    },
  { id: "shoe5",      label: "Shoe Beater",    desc: "Win 5 hands before reshuffle",    goal: 5,  type: "shoe"      },
  { id: "blackjack",  label: "Natural!",       desc: "Hit a natural Blackjack",         goal: 1,  type: "blackjack" },
  { id: "comeback",   label: "Comeback Kid",   desc: "Win after going below $500",      goal: 1,  type: "comeback"  },
];

function getDailyChallenges() {
  const seed = Math.floor(Date.now() / 86_400_000);
  const pool = [...CHALLENGE_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (seed * 31 + i * 7) % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3).map(c => ({ ...c, progress: 0, done: false, bonusPaid: false }));
}

const CONFETTI_COUNT = 130;
const SEAT_COLORS = ["#d4af37", "#e07b54", "#5bb8d4", "#8ad45b", "#b87dd4", "#d45b8a", "#5bd4b0"];

export class BlackjackUI {
  constructor(engine, elements, sound) {
    this.engine   = engine;
    this.elements = elements;
    this.sound    = sound;
    this.active   = false;

    this._confettiAnim  = null;
    this._challenges    = getDailyChallenges();
    this._wentBelowHalf = {}; // { [playerId]: bool }
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  init() {
    this._bindLobbyButtons();
    this._renderLobby();
  }

  setActive(active) {
    this.active = active;
    if (active) {
      this._showLobby();
    }
  }

  // ─── Lobby ─────────────────────────────────────────────────────────────────

  _showLobby() {
    const lobby = document.getElementById("bjLobby");
    const game  = document.getElementById("bjGameArea");
    if (lobby) lobby.classList.remove("bj-hidden");
    if (game)  game.classList.add("bj-hidden");
    this._renderLobby();
  }

  _hideLobby() {
    const lobby = document.getElementById("bjLobby");
    const game  = document.getElementById("bjGameArea");
    if (lobby) lobby.classList.add("bj-hidden");
    if (game)  game.classList.remove("bj-hidden");
  }

  _renderLobby() {
    const container = document.getElementById("bjLobbyPlayers");
    if (!container) return;

    // Seed lobby with existing engine players or default
    const names = this.engine.players.length > 0
      ? this.engine.players.map(p => p.name)
      : ["Player 1"];

    container.innerHTML = "";
    names.forEach((name, i) => this._appendLobbyRow(container, name, i));
    this._refreshLobbyButtons();
  }

  _appendLobbyRow(container, name, idx) {
    const row = document.createElement("div");
    row.className = "bj-lobby-player-row";
    row.dataset.row = idx;

    const dot = document.createElement("div");
    dot.className = "bj-lobby-seat-dot";
    dot.style.background = SEAT_COLORS[idx % SEAT_COLORS.length];
    dot.textContent = idx + 1;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "bj-lobby-name-input";
    input.placeholder = `Player ${idx + 1}`;
    input.value = name;
    input.maxLength = 20;
    input.setAttribute("aria-label", `Player ${idx + 1} name`);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "bj-lobby-remove-btn";
    removeBtn.setAttribute("aria-label", "Remove player");
    removeBtn.innerHTML = "✕";
    removeBtn.addEventListener("click", () => this._removeLobbyRow(row));

    row.appendChild(dot);
    row.appendChild(input);
    row.appendChild(removeBtn);
    container.appendChild(row);
  }

  _removeLobbyRow(row) {
    const container = document.getElementById("bjLobbyPlayers");
    const rows = container.querySelectorAll(".bj-lobby-player-row");
    if (rows.length <= 1) return; // always keep at least 1
    row.remove();
    // Re-number remaining rows
    container.querySelectorAll(".bj-lobby-player-row").forEach((r, i) => {
      r.dataset.row = i;
      const dot = r.querySelector(".bj-lobby-seat-dot");
      const inp = r.querySelector(".bj-lobby-name-input");
      if (dot) { dot.textContent = i + 1; dot.style.background = SEAT_COLORS[i % SEAT_COLORS.length]; }
      if (inp) inp.placeholder = `Player ${i + 1}`;
    });
    this._refreshLobbyButtons();
  }

  _refreshLobbyButtons() {
    const container = document.getElementById("bjLobbyPlayers");
    const addBtn    = document.getElementById("bjAddPlayerBtn");
    const startBtn  = document.getElementById("bjStartGameBtn");
    if (!container) return;
    const count = container.querySelectorAll(".bj-lobby-player-row").length;
    if (addBtn)   addBtn.disabled = count >= MAX_PLAYERS;
    if (startBtn) startBtn.disabled = count < 1;
  }

  _bindLobbyButtons() {
    const addBtn   = document.getElementById("bjAddPlayerBtn");
    const startBtn = document.getElementById("bjStartGameBtn");
    const backBtn  = document.getElementById("bjLobbyBackBtn");

    if (addBtn) {
      addBtn.addEventListener("click", () => {
        const container = document.getElementById("bjLobbyPlayers");
        const rows = container.querySelectorAll(".bj-lobby-player-row");
        if (rows.length >= MAX_PLAYERS) return;
        this._appendLobbyRow(container, `Player ${rows.length + 1}`, rows.length);
        this._refreshLobbyButtons();
        // Focus the new input
        const newInput = container.lastElementChild?.querySelector("input");
        if (newInput) { newInput.select(); newInput.focus(); }
      });
    }

    if (startBtn) {
      startBtn.addEventListener("click", () => this._startGame());
    }

    if (backBtn) {
      backBtn.addEventListener("click", () => {
        // Navigate back to game chooser
        document.getElementById("bjBackToChooserBtn")?.click();
      });
    }
  }

  _startGame() {
    const container = document.getElementById("bjLobbyPlayers");
    const rows = container.querySelectorAll(".bj-lobby-player-row");
    const names = Array.from(rows).map(r => {
      const inp = r.querySelector(".bj-lobby-name-input");
      const val = inp?.value.trim();
      return val || inp?.placeholder || "Player";
    });

    // Re-initialise engine with these players
    this.engine.setupPlayers(names);
    this.engine.buildShoe();

    // Reset challenges
    this._challenges = getDailyChallenges();
    this._wentBelowHalf = {};

    // Wire up game buttons (only after players are set)
    this._bindGameButtons();
    this._renderChipSelector();
    this._renderPlayerSeats();
    this._renderChallenges();
    this._syncView();

    this._hideLobby();
    this._playSound("bjShuffle");
  }

  // ─── Game Button Wiring ────────────────────────────────────────────────────

  _bindGameButtons() {
    const el = this.elements;

    // Remove old listeners by replacing nodes (avoids double-binding on re-entry)
    const repl = id => {
      const old = document.getElementById(id);
      if (!old) return old;
      const clone = old.cloneNode(true);
      old.parentNode.replaceChild(clone, old);
      return clone;
    };

    const chipSel     = repl("bjChipSelector");
    const clearBtn    = repl("bjClearBetBtn");
    const nextPlyBtn  = repl("bjNextPlayerBtn");
    const dealBtn     = repl("bjDealBtn");
    const hitBtn      = repl("bjHitBtn");
    const standBtn    = repl("bjStandBtn");
    const doubleBtn   = repl("bjDoubleBtn");
    const splitBtn    = repl("bjSplitBtn");
    const nextRndBtn  = repl("bjNextRoundBtn");
    const newShoeBtn  = repl("bjNewShoeBtn");

    // Update element refs after replacement
    this.elements.bjChipSelector    = chipSel      || el.bjChipSelector;
    this.elements.bjClearBetBtn     = clearBtn     || el.bjClearBetBtn;
    this.elements.bjNextPlayerBtn   = nextPlyBtn;
    this.elements.bjDealBtn         = dealBtn      || el.bjDealBtn;
    this.elements.bjHitBtn          = hitBtn       || el.bjHitBtn;
    this.elements.bjStandBtn        = standBtn     || el.bjStandBtn;
    this.elements.bjDoubleBtn       = doubleBtn    || el.bjDoubleBtn;
    this.elements.bjSplitBtn        = splitBtn     || el.bjSplitBtn;
    this.elements.bjNextRoundBtn    = nextRndBtn   || el.bjNextRoundBtn;

    if (this.elements.bjChipSelector) {
      this.elements.bjChipSelector.addEventListener("click", e => {
        const btn = e.target.closest("[data-bj-chip]");
        if (!btn || btn.disabled) return;
        const value = parseInt(btn.dataset.bjChip, 10);
        const res = this.engine.addBet(value);
        if (res.ok) {
          this._playSound("bjChip");
          const bettingPlayerId = this.engine.bettingPlayer?.id;
          this._animateChipToSeat(btn, value, bettingPlayerId);
          this._updateBettingView();
        } else {
          this._shake(this.elements.bjBetAmount);
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (this.engine.clearBet().ok) {
          this._clearSeatChips(this.engine.bettingPlayerIndex);
          this._updateBettingView();
        }
      });
    }

    if (nextPlyBtn) {
      nextPlyBtn.addEventListener("click", () => this._advanceBetting());
    }

    if (dealBtn) {
      dealBtn.addEventListener("click", () => this._startRound());
    }

    if (hitBtn)    hitBtn.addEventListener("click",    () => this._actionHit());
    if (standBtn)  standBtn.addEventListener("click",  () => this._actionStand());
    if (doubleBtn) doubleBtn.addEventListener("click", () => this._actionDouble());
    if (splitBtn)  splitBtn.addEventListener("click",  () => this._actionSplit());

    if (nextRndBtn) nextRndBtn.addEventListener("click", () => this._nextRound());
    if (newShoeBtn) {
      newShoeBtn.addEventListener("click", () => {
        this.engine.buildShoe();
        this._setStatus("New shoe shuffled — place your bets.");
        this._syncView();
      });
    }
  }

  // ─── Chip Selector ─────────────────────────────────────────────────────────

  _renderChipSelector() {
    const container = this.elements.bjChipSelector;
    if (!container) return;
    container.innerHTML = "";
    for (const chip of CHIP_DENOMINATIONS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.bjChip = chip.value;
      btn.className = `bj-chip bj-chip--selector ${chip.cls}`;
      btn.setAttribute("aria-label", `Bet ${chip.label}`);
      btn.innerHTML = `<span class="bj-chip-label">${chip.label}</span>`;
      container.appendChild(btn);
    }
  }

  // ─── Player Seats ──────────────────────────────────────────────────────────

  _renderPlayerSeats() {
    const container = document.getElementById("bjPlayerSeats");
    if (!container) return;
    container.innerHTML = "";

    const count = this.engine.players.length;
    container.dataset.playerCount = count;

    for (const p of this.engine.players) {
      const seat = document.createElement("div");
      seat.className = "bj-player-seat";
      seat.dataset.playerId = p.id;
      seat.style.setProperty("--seat-color", SEAT_COLORS[p.id % SEAT_COLORS.length]);

      seat.innerHTML = `
        <div class="bj-seat-header">
          <span class="bj-seat-dot"></span>
          <span class="bj-seat-name">${this._esc(p.name)}</span>
          <span class="bj-seat-balance">$${p.balance.toLocaleString()}</span>
        </div>
        <div class="bj-seat-chips" data-pid="${p.id}"></div>
        <div class="bj-seat-bet-amount" data-pid="${p.id}"></div>
        <div class="bj-seat-hands" data-pid="${p.id}"></div>
        <div class="bj-seat-result" data-pid="${p.id}"></div>
      `;
      container.appendChild(seat);
    }
  }

  _getSeat(playerId) {
    return document.querySelector(`.bj-player-seat[data-player-id="${playerId}"]`);
  }

  _updateSeatHeader(playerId) {
    const p = this.engine.players.find(pl => pl.id === playerId);
    if (!p) return;
    const seat = this._getSeat(playerId);
    if (!seat) return;
    const balEl = seat.querySelector(".bj-seat-balance");
    if (balEl) balEl.textContent = `$${p.balance.toLocaleString()}`;
  }

  _setSeatState(playerId, state) {
    const seat = this._getSeat(playerId);
    if (!seat) return;
    seat.classList.remove("bj-seat--betting", "bj-seat--active", "bj-seat--done", "bj-seat--bust", "bj-seat--blackjack");
    if (state) seat.classList.add(`bj-seat--${state}`);
  }

  _clearSeatHands(playerId) {
    const seat = this._getSeat(playerId);
    if (!seat) return;
    const handsEl = seat.querySelector(".bj-seat-hands");
    if (handsEl) handsEl.innerHTML = "";
    const resEl = seat.querySelector(".bj-seat-result");
    if (resEl) resEl.innerHTML = "";
  }

  _clearSeatChips(playerIndex) {
    const pid = this.engine.players[playerIndex]?.id;
    if (pid == null) return;
    const seat = this._getSeat(pid);
    if (!seat) return;
    const chipsEl = seat.querySelector(".bj-seat-chips");
    if (chipsEl) chipsEl.innerHTML = "";
    const betAmtEl = seat.querySelector(".bj-seat-bet-amount");
    if (betAmtEl) betAmtEl.textContent = "";
  }

  _showSeatResult(playerId, text, type) {
    const seat = this._getSeat(playerId);
    if (!seat) return;
    const resEl = seat.querySelector(".bj-seat-result");
    if (resEl) {
      resEl.textContent = text;
      resEl.className = `bj-seat-result bj-seat-result--${type}`;
    }
  }

  // ─── Challenge Panel ───────────────────────────────────────────────────────

  _renderChallenges() {
    const panel = document.getElementById("bjChallengesPanel");
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
      // Use best streak across all players
      const maxStreak = Math.max(0, ...this.engine.players.map(p => p.stats.currentStreak));
      badge.textContent = `🔥 Streak: ${maxStreak}`;
      badge.className = `bj-ch-streak${maxStreak >= 3 ? " bj-ch-streak--hot" : ""}`;
    }
  }

  _evaluateChallenges(allResults) {
    // allResults: array of { playerId, playerName, results[] }
    const bestStreak = Math.max(0, ...this.engine.players.map(p => p.stats.currentStreak));
    const anyWin     = allResults.some(pr => pr.results.some(r => r.result === "win" || r.result === "blackjack"));
    const anyBJ      = allResults.some(pr => pr.results.some(r => r.result === "blackjack"));
    const anyDoubleWin = anyWin && this.engine.players.some(p => p.stats.lastWasDouble);
    const bestShoe   = Math.max(0, ...this.engine.players.map(p => p.stats.handsInCurrentShoe));

    let bonus = 0;
    const earned = [];

    for (const ch of this._challenges) {
      if (ch.done || ch.bonusPaid) continue;
      switch (ch.type) {
        case "streak":    ch.progress = bestStreak; break;
        case "double":    if (anyDoubleWin) ch.progress++; break;
        case "shoe":      ch.progress = anyWin ? bestShoe : ch.progress; break;
        case "blackjack": if (anyBJ) ch.progress++; break;
        case "comeback": {
          const wentBelow = Object.values(this._wentBelowHalf).some(Boolean);
          if (wentBelow && anyWin) ch.progress++;
          break;
        }
      }
      if (ch.progress >= ch.goal && !ch.done) {
        ch.done = true;
        ch.bonusPaid = true;
        const bonusAmt = ch.goal >= 5 ? 150 : ch.type === "streak" ? 100 : 75;
        // Award bonus to all active players
        for (const p of this.engine.activePlayers) p.balance += bonusAmt;
        bonus += bonusAmt;
        earned.push({ label: ch.label, bonusAmt });
      }
    }

    this._updateChallengeList();
    return { bonus, earned };
  }

  // ─── Betting Flow ──────────────────────────────────────────────────────────

  _syncView() {
    const phase = this.engine.phase;
    this._renderPlayerSeats(); // rebuild seats with fresh state
    this._renderShoeIndicator();
    this._updateChallengeList();
    this._showActionControls(false);

    if (phase === "idle") {
      this._enterBettingPhase();
    }

    this._setStatus("Place your bets!");
  }

  _enterBettingPhase() {
    this.engine.bettingPlayerIndex = 0;
    this._updateBettingView();
    this._showBettingControls(true);
  }

  _updateBettingView() {
    const p = this.engine.bettingPlayer;
    if (!p) return;

    // Highlight the active betting seat
    for (const pl of this.engine.players) this._setSeatState(pl.id, null);
    this._setSeatState(p.id, "betting");

    // Update right-side info
    const balEl  = document.getElementById("bjBalance");
    const betEl  = document.getElementById("bjBetAmount");
    const lblEl  = document.getElementById("bjBetPlayerLabel");
    if (balEl)  balEl.textContent = `$${p.balance.toLocaleString()}`;
    if (betEl)  betEl.textContent = `$${p.currentBet}`;
    if (lblEl)  lblEl.textContent = p.name.toUpperCase();

    // Update seat bet amount display
    for (const pl of this.engine.players) {
      const seat = this._getSeat(pl.id);
      if (!seat) continue;
      const betAmtEl = seat.querySelector(".bj-seat-bet-amount");
      if (betAmtEl) betAmtEl.textContent = pl.currentBet > 0 ? `$${pl.currentBet}` : "";
    }

    // Next/Deal button label
    const nextBtn = document.getElementById("bjNextPlayerBtn");
    const isLast  = this.engine.bettingPlayerIndex === this.engine.players.length - 1;
    const anyBet  = this.engine.players.some(pl => pl.currentBet > 0);

    if (nextBtn) {
      if (isLast) {
        nextBtn.textContent = anyBet ? "Deal ›" : "Skip & Deal ›";
        nextBtn.classList.toggle("bj-btn-primary", anyBet);
      } else {
        nextBtn.textContent = p.currentBet > 0 ? "Next Player →" : "Skip →";
        nextBtn.classList.add("bj-btn-primary");
      }
      nextBtn.disabled = false;
    }

    // Chip buttons enabled only in idle
    this.elements.bjChipSelector?.querySelectorAll("[data-bj-chip]").forEach(b => {
      b.disabled = this.engine.phase !== "idle";
    });

    // Status
    this._setStatus(`${p.name}: place your bet, then click Next.`);
  }

  _advanceBetting() {
    const result = this.engine.advanceBettingPlayer();
    if (result.done) {
      // All players have had a chance — deal if anyone has a bet
      const anyBet = this.engine.players.some(p => p.currentBet > 0);
      if (!anyBet) {
        this._setStatus("At least one player must bet. Place a bet first!");
        this._shake(document.getElementById("bjChipSelector"));
        // Reset to player 0
        this.engine.bettingPlayerIndex = 0;
        this._updateBettingView();
        return;
      }
      this._startRound();
    } else {
      this._updateBettingView();
    }
  }

  _showBettingControls(show) {
    const bettingCtrl = document.getElementById("bjBettingControls");
    if (bettingCtrl) bettingCtrl.classList.toggle("bj-hidden", !show);
  }

  // ─── Round Flow ────────────────────────────────────────────────────────────

  async _startRound() {
    if (this.engine.phase !== "idle") return;
    const anyBet = this.engine.players.some(p => p.currentBet > 0);
    if (!anyBet) {
      this._setStatus("At least one player must bet!");
      return;
    }

    // Track comeback challenge
    for (const p of this.engine.players) {
      if (p.balance < this.engine.startingBalance / 2) {
        this._wentBelowHalf[p.id] = true;
      }
    }

    this._showBettingControls(false);
    this._showActionControls(false);

    const res = this.engine.startRound();
    if (!res.ok) {
      this._setStatus("Cannot start round: " + res.reason);
      this._showBettingControls(true);
      return;
    }

    // Clear old hands in all seats
    for (const p of this.engine.players) {
      this._clearSeatHands(p.id);
      this._setSeatState(p.id, null);
    }

    this._playSound("bjDeal");

    // Animate deal in standard casino order
    const s = this.engine.getState();

    // Round 1: each active player gets card 1
    for (const ap of s.activePlayers) {
      await this._dealCardToSeat(ap.id, 0, ap.playerHands[0][0]);
    }
    // Dealer card 1
    await this._dealCard("dealer", 0, s.dealerHand[0]);

    // Round 2: each active player gets card 2
    for (const ap of s.activePlayers) {
      await this._dealCardToSeat(ap.id, 0, ap.playerHands[0][1]);
    }
    // Dealer hole (face-down)
    await this._dealCard("dealer", 1, s.dealerHand[1]);

    this._renderAllValues();

    if (res.event === "natural_check") {
      await this._handleNaturals(res.dealerBlackjack, res.naturalPlayerIds);
      return;
    }

    this._enterPlayerTurn();
  }

  async _handleNaturals(dealerBJ, naturalPlayerIds) {
    await this._sleep(450);
    if (dealerBJ) await this._flipHole();

    const outcome = this.engine.settleNaturals(dealerBJ, naturalPlayerIds);
    this._renderAllValues();

    // Show per-player natural results on their seats
    for (const r of outcome.results) {
      let label, type;
      if (r.result === "blackjack")        { label = "BLACKJACK! 🃏"; type = "blackjack"; }
      else if (r.result === "push")        { label = "PUSH";          type = "push"; }
      else                                 { label = "DEALER BJ";     type = "lose"; }
      this._showSeatResult(r.playerId, label, type);
      this._setSeatState(r.playerId, r.result === "blackjack" ? "blackjack" : "done");
    }

    if (naturalPlayerIds.length > 0 && !dealerBJ) this._playSound("bjBlackjack");
    else if (dealerBJ) this._playSound("bjLose");

    // Check if more players remain to play
    if (this.engine.phase === "player" && this.engine.activePlayers.length > 0) {
      await this._sleep(600);
      this._enterPlayerTurn();
      return;
    }

    // All settled via naturals
    const { bonus, earned } = this._evaluateChallenges(
      this.engine.players
        .filter(p => p.lastResults.length > 0)
        .map(p => ({ playerId: p.id, playerName: p.name, results: p.lastResults }))
    );
    this._updateAllSeatBalances();
    await this._sleep(400);
    this._showMultiOutcome(outcome.results, earned, bonus, true);
    if (naturalPlayerIds.length > 0 && !dealerBJ) this._launchConfetti();
  }

  _enterPlayerTurn() {
    if (this.engine.phase !== "player") return;
    const ap = this.engine.activePlayer;
    if (!ap) return;

    // Highlight active player's seat
    for (const p of this.engine.activePlayers) this._setSeatState(p.id, null);
    this._setSeatState(ap.id, "active");

    // Update right side to active player
    const balEl = document.getElementById("bjBalance");
    const betEl = document.getElementById("bjBetAmount");
    const lblEl = document.getElementById("bjBetPlayerLabel");
    if (balEl) balEl.textContent = `$${ap.balance.toLocaleString()}`;
    if (betEl) betEl.textContent = `$${ap.handBets[ap.activeHandIndex] ?? ap.currentBet}`;
    if (lblEl) lblEl.textContent = ap.name.toUpperCase();

    const multi = this.engine.activePlayers.length > 1;
    const handNum = ap.playerHands.length > 1 ? ` (Hand ${ap.activeHandIndex + 1})` : "";
    this._setStatus(multi
      ? `${ap.name}'s turn${handNum} — Hit, Stand, Double, or Split?`
      : `Your turn${handNum} — Hit, Stand, Double, or Split?`
    );

    this._refreshActionButtons();
    this._showActionControls(true);
  }

  async _actionHit() {
    if (this.engine.phase !== "player") return;
    this._showActionControls(false);

    const res = this.engine.hit();
    if (!res.ok) { this._showActionControls(true); return; }

    const p    = this.engine.activePlayers.find(pl => pl.id === res.playerId);
    const hand = p.playerHands[p.activeHandIndex];
    await this._dealCardToSeat(res.playerId, p.activeHandIndex, hand[hand.length - 1]);
    this._renderAllValues();
    this._playSound("bjDeal");

    if (res.event === "bust") {
      this._setStatus(`${p.name} busts! 💥`);
      this._setSeatState(p.id, "bust");
      this._showSeatResult(p.id, "BUST", "lose");
      await this._sleep(600);
      this.engine.stand();
      await this._afterPlayerAction();
      return;
    }
    if (res.event === "twenty_one") {
      this.engine.stand();
      await this._afterPlayerAction();
      return;
    }

    this._refreshActionButtons();
    this._showActionControls(true);
    this._setStatus(`${p.name}: Hit or Stand?`);
  }

  async _actionStand() {
    if (this.engine.phase !== "player") return;
    this._showActionControls(false);
    this.engine.stand();
    await this._afterPlayerAction();
  }

  async _actionDouble() {
    if (this.engine.phase !== "player") return;
    this._showActionControls(false);
    const ap  = this.engine.activePlayer;
    const pid = ap?.id;
    const res = this.engine.doubleDown();
    if (!res.ok) { this._showActionControls(true); return; }

    const p    = this.engine.players.find(pl => pl.id === pid) ?? ap;
    const hand = p.playerHands[p.activeHandIndex];
    await this._dealCardToSeat(pid, p.activeHandIndex, hand[hand.length - 1]);
    this._renderAllValues();
    this._updateSeatHeader(pid);
    this._playSound("bjDeal");
    await this._afterPlayerAction();
  }

  async _actionSplit() {
    if (this.engine.phase !== "player") return;
    this._showActionControls(false);
    const pid = this.engine.activePlayer?.id;
    const res = this.engine.split();
    if (!res.ok) { this._showActionControls(true); return; }

    this._playSound("bjChip");

    // Rebuild this player's hands from scratch
    const p = this.engine.activePlayers.find(pl => pl.id === pid);
    this._clearSeatHands(pid);
    for (let hi = 0; hi < p.playerHands.length; hi++) {
      for (const card of p.playerHands[hi]) {
        await this._dealCardToSeat(pid, hi, card);
      }
    }
    this._renderAllValues();
    this._updateSeatHeader(pid);
    this._refreshActionButtons();
    this._showActionControls(true);
    const ap = this.engine.activePlayer;
    this._setStatus(`${ap.name}: Split — playing hand ${ap.activeHandIndex + 1} of ${ap.playerHands.length}`);
  }

  async _afterPlayerAction() {
    if (this.engine.phase === "dealer") {
      await this._runDealerPhase();
    } else if (this.engine.phase === "player") {
      // Check if we switched to a new player
      const ap = this.engine.activePlayer;
      if (ap) {
        // Brief pause when moving to next player
        const prevSeat = document.querySelector(".bj-player-seat.bj-seat--active");
        if (prevSeat && prevSeat.dataset.playerId !== String(ap.id)) {
          await this._sleep(400);
        }
        this._enterPlayerTurn();
      }
    }
  }

  async _runDealerPhase() {
    if (this.engine.phase !== "dealer") return;

    // Reset seat highlights
    for (const p of this.engine.activePlayers) this._setSeatState(p.id, null);

    await this._flipHole();
    this._renderAllValues();
    await this._sleep(500);

    this._setStatus("Dealer's turn…");
    const res = this.engine.dealerPlay();
    for (const card of res.drawn) {
      await this._dealCard("dealer", 0, card);
      this._renderAllValues();
      this._playSound("bjDeal");
      await this._sleep(380);
    }

    await this._sleep(350);
    const settlement = this.engine.settle();

    // Show per-player seat results
    for (const pr of settlement.allPlayerResults) {
      const wins   = pr.results.filter(r => r.result === "win").length;
      const losses = pr.results.filter(r => r.result === "lose").length;
      const pushes = pr.results.filter(r => r.result === "push").length;
      let label, type;
      if (wins > 0 && losses === 0)   { label = wins > 1 ? `WIN ×${wins}` : "WIN";   type = "win"; }
      else if (losses > 0 && wins === 0 && pushes === 0) { label = "LOSE";  type = "lose"; }
      else if (pushes === pr.results.length) { label = "PUSH"; type = "push"; }
      else {
        const net = pr.results.reduce((s, r) => s + (r.net - r.bet), 0);
        label = net > 0 ? `+$${net}` : net < 0 ? `-$${Math.abs(net)}` : "PUSH";
        type  = net > 0 ? "win" : net < 0 ? "lose" : "push";
      }
      this._showSeatResult(pr.playerId, label, type);
      this._setSeatState(pr.playerId, type === "win" ? null : type === "push" ? null : "done");
    }

    const { bonus, earned } = this._evaluateChallenges(settlement.allPlayerResults);
    this._updateAllSeatBalances();
    this._showMultiOutcome(
      settlement.allPlayerResults.flatMap(pr => pr.results.map(r => ({ ...r, playerId: pr.playerId, playerName: pr.playerName }))),
      earned, bonus, false
    );

    const anyWin = settlement.allPlayerResults.some(pr => pr.results.some(r => r.result === "win"));
    if (anyWin) this._launchConfetti();
  }

  _nextRound() {
    this._hideOutcome();
    this._stopConfetti();
    this.engine.resetForNextRound();

    // Clear all seats visually
    for (const p of this.engine.players) {
      this._clearSeatHands(p.id);
      this._clearSeatChips(p.id);
      this._setSeatState(p.id, null);
      this._updateSeatHeader(p.id);
    }
    this._clearDealerHand();

    // Check bankrupt players
    const bankruptPlayers = this.engine.players.filter(p => p.balance <= 0);
    for (const p of bankruptPlayers) {
      p.balance = 1000;
      p.stats.currentStreak = 0;
      this._updateSeatHeader(p.id);
    }
    if (bankruptPlayers.length > 0) {
      const names = bankruptPlayers.map(p => p.name).join(", ");
      this._setStatus(`${names} went bankrupt — restarting with $1,000.`);
    }

    this._enterBettingPhase();
    this._renderShoeIndicator();
    this._updateChallengeList();
  }

  // ─── DOM State Sync ────────────────────────────────────────────────────────

  _showActionControls(show) {
    const ctrl = document.getElementById("bjActionControls");
    if (ctrl) ctrl.classList.toggle("bj-hidden", !show);
    this._showBettingControls(!show && this.engine.phase === "idle");
  }

  _clearDealerHand() {
    const dh = document.getElementById("bjDealerHand");
    if (dh) dh.innerHTML = "";
    const dv = document.getElementById("bjDealerValue");
    if (dv) dv.textContent = "";
  }

  _renderAllValues() {
    const s = this.engine.getState();

    // Dealer
    const vis = s.dealerHand.filter(c => !c.faceDown);
    const dvEl = document.getElementById("bjDealerValue");
    if (dvEl) {
      if (vis.length) {
        const val  = this.engine.handValue(vis);
        const soft = this.engine.isSoft(vis);
        dvEl.textContent = `${val}${soft ? " (soft)" : ""}`;
      } else {
        dvEl.textContent = "";
      }
    }

    // Each active player's seat hands
    for (const p of this.engine.activePlayers) {
      const seat = this._getSeat(p.id);
      if (!seat) continue;
      const groups = seat.querySelectorAll(".bj-hand-group");
      groups.forEach((g, i) => {
        const hand = p.playerHands[i];
        if (!hand) return;
        const val    = this.engine.handValue(hand);
        const bust   = this.engine.isBust(hand);
        const soft   = this.engine.isSoft(hand);
        const active = i === p.activeHandIndex && s.phase === "player"
                       && this.engine.activePlayer?.id === p.id;
        const lbl = g.querySelector(".bj-hand-value");
        if (lbl) {
          lbl.textContent = bust ? `${val} — BUST` : `${val}${soft ? " (soft)" : ""}`;
          lbl.className = `bj-hand-value${bust ? " bj-hand-value--bust" : ""}`;
        }
        g.classList.toggle("bj-hand-group--active", active);
      });
    }
  }

  _updateAllSeatBalances() {
    for (const p of this.engine.players) this._updateSeatHeader(p.id);
  }

  _refreshActionButtons() {
    const s = this.engine.getState();
    const dbl = document.getElementById("bjDoubleBtn");
    const spl = document.getElementById("bjSplitBtn");
    if (dbl) dbl.disabled = !s.canDouble;
    if (spl) spl.disabled = !s.canSplit;
  }

  _renderShoeIndicator() {
    const el = document.getElementById("bjShoeIndicator");
    if (!el) return;
    const pct  = Math.round(this.engine.shoePenetration * 100);
    const warn = this.engine.reshuffleNeeded;
    el.textContent = warn ? "SHUFFLE SOON" : `${100 - pct}% left`;
    el.className = `bj-shoe-indicator${warn ? " bj-shoe-indicator--warn" : ""}`;
  }

  _setStatus(text) {
    const el = document.getElementById("bjStatus");
    if (el) el.textContent = text;
  }

  // ─── Card Rendering ────────────────────────────────────────────────────────

  async _dealCardToSeat(playerId, handIndex, card) {
    const el = this._createCard(card);
    const seat = this._getSeat(playerId);
    if (!seat) return;

    const handsEl = seat.querySelector(".bj-seat-hands");
    if (!handsEl) return;

    let group = handsEl.querySelector(`.bj-hand-group[data-hi="${handIndex}"]`);
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
      handsEl.appendChild(group);
    }
    group.querySelector(".bj-hand-cards").appendChild(el);
    await this._animateDeal(el);
  }

  async _dealCard(target, handIndex, card) {
    const el = this._createCard(card);

    if (target === "dealer") {
      const dh = document.getElementById("bjDealerHand");
      if (dh) dh.appendChild(el);
    } else {
      // Legacy: target = player index (unused now but kept for safety)
      const container = document.getElementById("bjPlayerSeats");
      if (container) container.appendChild(el);
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
      const shoe     = document.getElementById("bjShoe");
      if (!shoe) { resolve(); return; }
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
      setTimeout(resolve, 600);
    });
  }

  async _flipHole() {
    const dh = document.getElementById("bjDealerHand");
    if (!dh) return;
    const holeEl = dh.children[1];
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

  _animateChipToSeat(sourceBtn, value, playerId) {
    const chip = CHIP_DENOMINATIONS.find(c => c.value === value);
    if (!chip) return;
    const ghost = document.createElement("div");
    ghost.className = `bj-chip ${chip.cls} bj-chip--ghost`;
    ghost.innerHTML = `<span class="bj-chip-label">${chip.label}</span>`;
    document.body.appendChild(ghost);

    const src  = sourceBtn.getBoundingClientRect();
    const seat = this._getSeat(playerId);
    const tgtEl = seat ? seat.querySelector(".bj-seat-chips") : null;
    const tgt  = tgtEl ? tgtEl.getBoundingClientRect() : src;

    ghost.style.cssText = `left:${src.left + src.width/2 - 26}px;top:${src.top + src.height/2 - 26}px`;
    const dx = tgt.left + tgt.width/2  - src.left - src.width/2;
    const dy = tgt.top  + tgt.height/2 - src.top  - src.height/2;

    requestAnimationFrame(() => {
      ghost.style.transform = `translate(${dx}px,${dy}px) scale(0.7)`;
      ghost.style.opacity = "0";
    });

    setTimeout(() => {
      document.body.removeChild(ghost);
      if (tgtEl) this._addChipToSeat(tgtEl, chip);
    }, 360);
  }

  _addChipToSeat(container, chip) {
    const n  = container.querySelectorAll(".bj-chip").length;
    const el = document.createElement("div");
    el.className = `bj-chip ${chip.cls}`;
    el.style.setProperty("--off", `${Math.min(n * 4, 32)}px`);
    el.innerHTML = `<span class="bj-chip-label">${chip.label}</span>`;
    container.appendChild(el);
  }

  // ─── Outcome Overlay ───────────────────────────────────────────────────────

  _showMultiOutcome(results, earned, bonus, isNaturalsRound) {
    // results: flat array of { playerId, playerName, result, net, bet? }
    //          OR from settle: allPlayerResults flattened

    const el   = this.elements;
    const wins  = results.filter(r => r.result === "win" || r.result === "blackjack").length;
    const loses = results.filter(r => r.result === "lose" || r.result === "dealer_blackjack").length;
    const pushes = results.filter(r => r.result === "push").length;
    const isSingle = this.engine.players.length === 1;

    let title, detail, type;

    if (isSingle) {
      // Single-player: same as original
      if (wins > 0 && loses === 0) {
        const net = results.find(r => r.result === "win" || r.result === "blackjack");
        const bjRes = results.find(r => r.result === "blackjack");
        if (bjRes) {
          title = "BLACKJACK!"; detail = `+$${Math.floor((bjRes.bet ?? bjRes.net - bjRes.net * 2/5) * 1.5)}`; type = "blackjack";
          this._playSound("bjBlackjack");
        } else {
          title = "YOU WIN!"; detail = `+$${net ? net.net - (net.bet ?? 0) : ""}`; type = "win";
          this._playSound("bjWin");
        }
      } else if (loses > 0 && wins === 0) {
        title = "YOU LOSE"; detail = "Better luck next hand"; type = "lose";
        this._playSound("bjLose");
      } else {
        title = "PUSH"; detail = "Bet returned"; type = "push";
      }
    } else {
      // Multi-player summary
      if (wins > 0 && loses === 0)   { title = "WINNERS! 🎉"; type = "win";  this._playSound("bjWin"); }
      else if (loses > 0 && wins === 0) { title = "DEALER WINS"; type = "lose"; this._playSound("bjLose"); }
      else if (pushes === results.length) { title = "ALL PUSH"; type = "push"; }
      else                             { title = "ROUND OVER";  type = wins > loses ? "win" : "lose"; }
      detail = `${wins} Win · ${loses} Lose · ${pushes} Push`;
    }

    // Build per-player result rows
    const playerResultsEl = document.getElementById("bjOutcomePlayerResults");
    if (playerResultsEl) {
      if (!isSingle) {
        // Group by player
        const byPlayer = {};
        for (const r of results) {
          if (!byPlayer[r.playerId]) byPlayer[r.playerId] = { name: r.playerName, results: [] };
          byPlayer[r.playerId].results.push(r);
        }
        playerResultsEl.innerHTML = Object.values(byPlayer).map(pr => {
          const totalNet = pr.results.reduce((s, r) => s + r.net, 0);
          const totalBet = pr.results.reduce((s, r) => s + (r.bet ?? 0), 0);
          const profit   = totalNet - totalBet;
          const tag = pr.results[0]?.result;
          const typeClass = (tag === "blackjack" || tag === "win") ? "win"
                          : tag === "push" ? "push" : "lose";
          const profitStr = profit > 0 ? `+$${profit}` : profit < 0 ? `-$${Math.abs(profit)}` : "push";
          return `<div class="bj-outcome-player-row bj-outcome-player-row--${typeClass}">
            <span class="bj-outcome-player-name">${this._esc(pr.name)}</span>
            <span class="bj-outcome-player-net">${profitStr}</span>
          </div>`;
        }).join("");
        playerResultsEl.classList.remove("bj-hidden");
      } else {
        playerResultsEl.innerHTML = "";
        playerResultsEl.classList.add("bj-hidden");
      }
    }

    this._showOutcome(title, detail, type, earned, bonus);
    if (type === "win" || type === "blackjack") this._launchConfetti();
  }

  _showOutcome(title, detail, type, earned = [], bonus = 0) {
    const el = this.elements;
    if (el.bjOutcomeTitle)  el.bjOutcomeTitle.textContent  = title;
    if (el.bjOutcomeDetail) el.bjOutcomeDetail.textContent = detail;

    const streak = Math.max(0, ...this.engine.players.map(p => p.stats.currentStreak));
    if (el.bjOutcomeStreak) {
      el.bjOutcomeStreak.textContent = streak >= 2 ? `🔥 ${streak} in a row!` : "";
      el.bjOutcomeStreak.className   = `bj-outcome-streak${streak >= 3 ? " bj-outcome-streak--hot" : ""}`;
    }

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

    if (el.bjOutcomeOverlay) {
      el.bjOutcomeOverlay.className = `bj-outcome-overlay bj-outcome--${type}`;
      el.bjOutcomeOverlay.removeAttribute("hidden");
      el.bjOutcomeOverlay.classList.remove("bj-hidden");
      void el.bjOutcomeOverlay.offsetWidth;
      el.bjOutcomeOverlay.classList.add("bj-outcome--visible");
    }

    // Update "Next Round" button text
    const nrBtn = document.getElementById("bjNextRoundBtn");
    if (nrBtn) nrBtn.textContent = "Next Round ›";
  }

  _hideOutcome() {
    const ov = this.elements.bjOutcomeOverlay;
    if (!ov) return;
    ov.classList.remove("bj-outcome--visible");
    setTimeout(() => ov.classList.add("bj-hidden"), 350);
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
        p.x += p.vx; p.y += p.vy; p.rot += p.rspd;
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
    if (this._confettiAnim) { cancelAnimationFrame(this._confettiAnim); this._confettiAnim = null; }
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
    if (!el) return;
    el.classList.remove("bj-shake");
    void el.offsetWidth;
    el.classList.add("bj-shake");
    setTimeout(() => el.classList.remove("bj-shake"), 500);
  }

  _esc(str) {
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
}
