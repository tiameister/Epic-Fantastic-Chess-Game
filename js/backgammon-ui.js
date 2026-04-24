import { DiceAnimator } from "./ui/dice-animator.js";
import { showBackgammonVictory, hideBackgammonVictory, showChessToast } from "./ui/game-feel.js";

export class BackgammonUI {
  constructor(engine, elements) {
    this.engine = engine;
    this.elements = elements;
    this.selectedFrom = null;
    this.active = false;
    this.language = "en";
    this.lastWinAnnounced = "";
    this.lastToastTimeout = null;
    this.dragState = null;
    this.hoverDropPoint = null;
    // Cached DOM references populated by renderBoard() for O(1) drag-hover updates.
    this.pointElements = new Map();
    this.offSlotWhite = null;
    this.offSlotBlack = null;

    // 3-D dice — the animator is re-targeted to the bar container on each board render
    this.diceAnimator    = new DiceAnimator(elements.backgammonDice);
    this._diceCount      = 0;
    this._barDiceEl      = null;   // div inside the bar that holds the 3D dice
    this._pendingSnapTarget = null; // point index where the last one-click move landed
  }

  init() {
    this.elements.backgammonDice.addEventListener("click", () => this.rollDiceFromUI());
    this.elements.backgammonUndoBtn.addEventListener("click", () => {
      const ok = this.engine.undo();
      if (!ok) {
        this.showToast(this.language === "tr" ? "Geri alınacak hamle yok" : "No move to undo");
      }
      this.selectedFrom = null;
      this.hideGameOverModal();
      this.render();
    });
    this.elements.backgammonDoubleBtn.addEventListener("click", () => {
      const result = this.engine.offerDouble();
      if (!result.ok) {
        this.elements.backgammonStatus.textContent = result.reason;
      }
      this.render();
    });
    this.elements.backgammonAcceptDoubleBtn.addEventListener("click", () => {
      const result = this.engine.acceptDouble();
      if (!result.ok) {
        this.elements.backgammonStatus.textContent = result.reason;
      }
      this.render();
    });
    this.elements.backgammonRejectDoubleBtn.addEventListener("click", () => {
      const result = this.engine.rejectDouble();
      if (!result.ok) {
        this.elements.backgammonStatus.textContent = result.reason;
      }
      this.render();
    });
    this.elements.backgammonResetBtn.addEventListener("click", () => {
      if (this.engine.winner) {
        this.engine.startNextGame();
      } else {
        this.engine.reset();
      }
      this.lastWinAnnounced = "";
      this.engine.setDoublingEnabled(this.elements.backgammonDoublingToggle.checked);
      this.selectedFrom = null;
      this.hideGameOverModal();
      this.render();
    });
    this.elements.backgammonNewRoundBtn.addEventListener("click", () => {
      this.engine.startNextGame();
      this.selectedFrom = null;
      this.hideGameOverModal();
      this.render();
    });
    this.elements.backgammonDoublingToggle.addEventListener("change", () => {
      this.engine.setDoublingEnabled(this.elements.backgammonDoublingToggle.checked);
      this.render();
    });
    this.elements.backgammonCheatWhiteToggle.addEventListener("change", () => {
      const on = this.elements.backgammonCheatWhiteToggle.checked;
      this.engine.setWhiteCheatMode(on);
      if (on) {
        showChessToast("⚠️ White cheat mode activated — loaded dice!", "warn");
      }
      this.render();
    });
    this.elements.backgammonLangToggle.addEventListener("change", () => {
      this.language = this.elements.backgammonLangToggle.value;
      this.render();
    });
    document.addEventListener("pointermove", (event) => this.handleDragMove(event));
    document.addEventListener("pointerup", (event) => this.handleDragEnd(event));
    this.engine.setDoublingEnabled(false);
    this.engine.setWhiteCheatMode(false);
    this.render();
  }

  setActive(active) {
    this.active = active;
    if (active) {
      this.render();
    } else {
      this.hideGameOverModal();
    }
  }

  handlePointClick(from) {
    if (!this.active || this.engine.winner) return;
    if (this.engine.doubleOfferedBy) return;
    if (this.engine.movesLeft.length === 0) return;

    // If a different piece is already selected, try a manual move first
    // (preserves the two-click flow as a deliberate override)
    if (this.selectedFrom !== null && this.selectedFrom !== from) {
      const result = this.engine.move(this.selectedFrom, from);
      if (result.ok) {
        this._onMoveExecuted(this.selectedFrom, from, true);
        this.selectedFrom = null;
        return;
      }
      // Magnetic snap fallback
      const snapped = this.getMagneticDestination(this.selectedFrom, from);
      if (snapped !== null) {
        const snapResult = this.engine.move(this.selectedFrom, snapped);
        if (snapResult.ok) {
          this._onMoveExecuted(this.selectedFrom, snapped, true);
          this.selectedFrom = null;
          return;
        }
      }
      // If the click was on another selectable checker, switch selection
      if (this.hasSelectableChecker(from)) {
        this.selectedFrom = from;
        this.render();
        return;
      }
      this.selectedFrom = null;
      this.render();
      return;
    }

    // Deselect on re-click
    if (this.selectedFrom === from) {
      this.selectedFrom = null;
      this.render();
      return;
    }

    // ── ONE-CLICK QUICK MOVE ─────────────────────────────────
    if (!this.hasSelectableChecker(from)) return;

    const legal = this.engine.getLegalMoves().filter((m) => m.from === from);
    if (legal.length === 0) {
      this._shakePoint(from);
      return;
    }

    // Pick the move that uses the first die in the queue;
    // fall back to the next available die if that one doesn't reach this checker.
    const move = this._pickFirstDieMove(legal);
    if (!move) {
      this._shakePoint(from);
      return;
    }

    const result = this.engine.move(from, move.to);
    if (result.ok) {
      this._onMoveExecuted(from, move.to, true);
      this.selectedFrom = null;
    } else {
      // Should not happen — legal was filtered, but guard just in case
      this._shakePoint(from);
      this.render();
    }
  }

  /** Pick the move that uses movesLeft[0]; fall back to any legal move. */
  _pickFirstDieMove(legal) {
    if (!this.engine.movesLeft.length) return null;
    const firstDie = this.engine.movesLeft[0];
    return legal.find((m) => m.die === firstDie) ?? legal[0] ?? null;
  }

  /** Called after a successful engine.move() — plays SFX, animates, re-renders. */
  _onMoveExecuted(from, to, isOneClick = false) {
    this.playCheckerSfx();
    if (isOneClick) {
      // Queue the snap animation class on the landing checker after render
      this._pendingSnapTarget = to;
    }
    this.render();
  }

  /** Shake all checkers on the given point to signal an invalid move. */
  _shakePoint(from) {
    const pointEl = this.pointElements.get(from);
    if (!pointEl) return;
    pointEl.querySelectorAll(".bg-checker").forEach((c) => {
      c.classList.remove("shake");
      void c.offsetWidth;
      c.classList.add("shake");
      c.addEventListener("animationend", () => c.classList.remove("shake"), { once: true });
    });
  }

  startDragChecker(event, fromPoint) {
    if (!this.active || this.engine.winner || this.engine.doubleOfferedBy) return;
    if (this.engine.movesLeft.length === 0) return;
    if (!this.hasSelectableChecker(fromPoint)) return;
    event.preventDefault();
    const legal = this.engine.getLegalMoves().filter((m) => m.from === fromPoint);
    if (legal.length === 0) return;
    this.selectedFrom = fromPoint;
    this.dragState = {
      from: fromPoint,
      pointerId: event.pointerId,
      legalTargets: legal.map((m) => m.to)
    };
    this.hoverDropPoint = null;
    this.render();
  }

  handleDragMove(event) {
    if (!this.dragState) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const pointButton = target?.closest(".bg-point");
    const offSlot = target?.closest(".bg-off-slot");
    const dropPoint = pointButton ? Number(pointButton.dataset.point) : null;

    let newHover;
    if (offSlot && this.dragState.legalTargets.includes("off")) {
      newHover = "off";
    } else if (typeof dropPoint === "number" && this.dragState.legalTargets.includes(dropPoint)) {
      newHover = dropPoint;
    } else {
      newHover = null;
    }

    if (newHover === this.hoverDropPoint) return; // No visual change needed.

    // Patch only the two affected elements instead of rebuilding the entire board.
    this._clearHoverVisual(this.hoverDropPoint);
    this._applyHoverVisual(newHover);
    this.hoverDropPoint = newHover;
  }

  _clearHoverVisual(point) {
    if (point === null || point === undefined) return;
    if (point === "off") {
      this.offSlotWhite?.classList.remove("drop-hover");
      this.offSlotBlack?.classList.remove("drop-hover");
    } else {
      this.pointElements.get(point)?.classList.remove("drop-hover");
    }
  }

  _applyHoverVisual(point) {
    if (point === null || point === undefined) return;
    if (point === "off") {
      this.offSlotWhite?.classList.add("drop-hover");
      this.offSlotBlack?.classList.add("drop-hover");
    } else {
      this.pointElements.get(point)?.classList.add("drop-hover");
    }
  }

  handleDragEnd(event) {
    if (!this.dragState) return;
    if (event.pointerId !== this.dragState.pointerId) return;
    const from = this.dragState.from;
    const drop = this.hoverDropPoint;
    this.dragState = null;
    this.hoverDropPoint = null;
    if (drop === null) {
      this.render();
      return;
    }
    const result = this.engine.move(from, drop);
    if (result.ok) {
      this.selectedFrom = null;
      this.playCheckerSfx();
    }
    this.render();
  }

  hasSelectableChecker(from) {
    const legal = this.engine.getLegalMoves();
    return legal.some((m) => m.from === from);
  }

  getPointLabel(index) {
    return String(index);
  }

  getMagneticDestination(selectedFrom, attemptedPoint) {
    if (typeof selectedFrom !== "number" || typeof attemptedPoint !== "number") {
      return null;
    }
    const legal = this.engine.getLegalMoves().filter((m) => m.from === selectedFrom);
    if (legal.length === 0) return null;
    let nearest = null;
    let bestDistance = Infinity;
    legal.forEach((m) => {
      if (typeof m.to !== "number") return;
      const d = Math.abs(m.to - attemptedPoint);
      if (d < bestDistance) {
        bestDistance = d;
        nearest = m.to;
      }
    });
    if (bestDistance <= 2) return nearest;
    return null;
  }

  buildPoint(index, isTop) {
    const point = document.createElement("button");
    point.type = "button";
    point.className = `bg-point ${isTop ? "top" : "bottom"} ${(index % 2 === 0) ? "light" : "dark"}`;
    point.dataset.point = String(index);
    this.pointElements.set(index, point);
    point.addEventListener("click", () => this.handlePointClick(index));
    const count = this.engine.points[index];
    const owner = count > 0 ? "white" : count < 0 ? "black" : "none";
    const abs = Math.abs(count);
    if (this.selectedFrom === index) point.classList.add("selected");
    const legal = this.engine.getLegalMoves();
    if (legal.some((m) => m.from === index)) point.classList.add("has-legal");
    if (this.selectedFrom !== null && legal.some((m) => m.from === this.selectedFrom && m.to === index)) {
      point.classList.add("legal-dest");
    }
    if (this.hoverDropPoint === index) {
      point.classList.add("drop-hover");
    }

    const label = document.createElement("span");
    label.className = "bg-point-label";
    label.textContent = this.getPointLabel(index);
    point.appendChild(label);
    const hasLegal = legal.some((m) => m.from === index);
    const stack = document.createElement("div");
    stack.className = "bg-stack";
    const visibleCount = Math.min(abs, 5);
    for (let i = 0; i < visibleCount; i += 1) {
      const checker = document.createElement("span");
      checker.className = `bg-checker ${owner}`;
      checker.style.transform = `translateY(${isTop ? -i * 6 : i * 6}px)`;
      if (this.selectedFrom === index) checker.classList.add("lifted");
      const isLastMoveLanding = this.engine.lastMove && this.engine.lastMove.to === index && i === 0;
      if (isLastMoveLanding) {
        checker.classList.add("moved");
      }
      // One-click snap animation on the topmost checker of the landing point
      if (this._pendingSnapTarget === index && i === 0) {
        checker.classList.add("one-click-moved");
        checker.addEventListener("animationend", () => {
          checker.classList.remove("one-click-moved");
          this._pendingSnapTarget = null;
        }, { once: true });
      }
      // Glow: checkers that belong to the current player and have legal moves
      if (hasLegal && owner === this.engine.turn && this.engine.dice.length > 0) {
        checker.classList.add("can-move");
      }
      checker.dataset.fromPoint = String(index);
      checker.addEventListener("pointerdown", (event) => this.startDragChecker(event, index));
      stack.appendChild(checker);
    }
    if (abs > 5) {
      const extra = document.createElement("span");
      extra.className = "bg-extra";
      extra.textContent = `+${abs - 5}`;
      stack.appendChild(extra);
    }
    point.appendChild(stack);
    return point;
  }

  buildBarArea() {
    const bar = document.createElement("div");
    bar.className = "bg-bar";

    const blackBtn = document.createElement("button");
    blackBtn.type = "button";
    blackBtn.className = "bg-bar-slot black";
    blackBtn.textContent = `B ${this.engine.bar.black}`;
    blackBtn.addEventListener("click", () => this.handlePointClick("bar"));
    if (this.selectedFrom === "bar") blackBtn.classList.add("selected");

    // ── Dice area (click to roll) ──────────────────────────────
    const diceContainer = document.createElement("div");
    diceContainer.className = "bg-bar-dice";
    diceContainer.title = this.engine.movesLeft.length > 0
      ? "Dice rolled"
      : "Click to roll dice";
    diceContainer.addEventListener("click", () => {
      if (this.engine.movesLeft.length === 0 && !this.engine.winner && !this.engine.doubleOfferedBy) {
        this.rollDiceFromUI();
      }
    });

    // Re-target the DiceAnimator to this new container each board rebuild
    this._barDiceEl = diceContainer;
    // Rebuild dice inside the new container with current count
    const count = this.engine.dice.length || 2;
    this.diceAnimator._container = diceContainer;
    if (this._diceCount !== count) {
      this.diceAnimator.build(count);
      this._diceCount = count;
    } else {
      // Re-inject the existing scene elements (they were detached by innerHTML="")
      this.diceAnimator._dice.forEach((d) => diceContainer.appendChild(d._scene));
    }
    this._syncDiceDisplay();

    // Roll hint label
    if (this.engine.movesLeft.length === 0 && !this.engine.winner) {
      const hint = document.createElement("div");
      hint.className = "bg-roll-hint";
      hint.textContent = "tap to roll";
      diceContainer.appendChild(hint);
    }

    const whiteBtn = document.createElement("button");
    whiteBtn.type = "button";
    whiteBtn.className = "bg-bar-slot white";
    whiteBtn.textContent = `W ${this.engine.bar.white}`;
    whiteBtn.addEventListener("click", () => this.handlePointClick("bar"));
    if (this.selectedFrom === "bar") whiteBtn.classList.add("selected");

    bar.appendChild(blackBtn);
    bar.appendChild(diceContainer);
    bar.appendChild(whiteBtn);
    return bar;
  }

  buildOffArea() {
    const off = document.createElement("div");
    off.className = "bg-off";

    const whiteSlot = document.createElement("div");
    whiteSlot.className = "bg-off-slot white";
    whiteSlot.addEventListener("click", () => this.handlePointClick("off"));

    const blackSlot = document.createElement("div");
    blackSlot.className = "bg-off-slot black";
    blackSlot.addEventListener("click", () => this.handlePointClick("off"));

    // Cache for efficient drag-hover updates.
    this.offSlotWhite = whiteSlot;
    this.offSlotBlack = blackSlot;

    const legal = this.engine.getLegalMoves();
    const canOff = this.selectedFrom !== null && legal.some((m) => m.from === this.selectedFrom && m.to === "off");
    const bearingState = this.engine.canBearOff(this.engine.turn);
    if (canOff || bearingState) {
      whiteSlot.classList.add("legal-off");
      blackSlot.classList.add("legal-off");
    }
    if (this.hoverDropPoint === "off") {
      whiteSlot.classList.add("drop-hover");
      blackSlot.classList.add("drop-hover");
    }
    whiteSlot.appendChild(this.buildOffStack("white", this.engine.off.white));
    blackSlot.appendChild(this.buildOffStack("black", this.engine.off.black));
    off.appendChild(whiteSlot);
    off.appendChild(blackSlot);
    // Dice have moved to the bar — off area has only the bearing-off slots.
    return off;
  }

  /** Sync the dice visual state (show values, mark used) without animation. */
  _syncDiceDisplay() {
    const values = this.engine.dice.length > 0 ? this.engine.dice : [1, 1];
    this.diceAnimator.showRolled(values);
    if (!this.engine.dice.length) {
      this.diceAnimator.markUsed([0, 1]);
    } else {
      this.diceAnimator.markUsed(this._getUsedDiceIndices());
    }
  }

  /** Determine which visual dice indices have been consumed from movesLeft. */
  _getUsedDiceIndices() {
    const remaining = [...this.engine.movesLeft];
    const used = [];
    this.engine.dice.forEach((v, i) => {
      const idx = remaining.indexOf(v);
      if (idx !== -1) {
        remaining.splice(idx, 1); // still available
      } else {
        used.push(i); // consumed
      }
    });
    return used;
  }

  buildOffStack(color, count) {
    const container = document.createElement("div");
    container.className = "bg-off-stack";
    const label = document.createElement("span");
    label.className = "bg-off-label";
    label.textContent = `${color === "white" ? "W" : "B"} OFF`;
    container.appendChild(label);
    const stack = document.createElement("div");
    stack.className = "bg-off-checkers";
    const visible = Math.min(count, 5);
    for (let i = 0; i < visible; i += 1) {
      const checker = document.createElement("span");
      checker.className = `bg-checker ${color}`;
      checker.style.transform = `translateY(${-i * 4}px)`;
      stack.appendChild(checker);
    }
    if (count > 5) {
      const extra = document.createElement("span");
      extra.className = "bg-extra";
      extra.textContent = `+${count - 5}`;
      stack.appendChild(extra);
    }
    container.appendChild(stack);
    return container;
  }

  renderBoard() {
    const board = this.elements.backgammonBoard;
    board.innerHTML = "";
    this.pointElements.clear();
    this.offSlotWhite = null;
    this.offSlotBlack = null;

    const left = document.createElement("div");
    left.className = "bg-half";
    const right = document.createElement("div");
    right.className = "bg-half";

    const topLeft = document.createElement("div");
    topLeft.className = "bg-row";
    [13, 14, 15, 16, 17, 18].forEach((i) => topLeft.appendChild(this.buildPoint(i, true)));

    const topRight = document.createElement("div");
    topRight.className = "bg-row";
    [19, 20, 21, 22, 23, 24].forEach((i) => topRight.appendChild(this.buildPoint(i, true)));

    const bottomLeft = document.createElement("div");
    bottomLeft.className = "bg-row";
    [12, 11, 10, 9, 8, 7].forEach((i) => bottomLeft.appendChild(this.buildPoint(i, false)));

    const bottomRight = document.createElement("div");
    bottomRight.className = "bg-row";
    [6, 5, 4, 3, 2, 1].forEach((i) => bottomRight.appendChild(this.buildPoint(i, false)));

    left.appendChild(topLeft);
    left.appendChild(bottomLeft);
    right.appendChild(topRight);
    right.appendChild(bottomRight);

    board.appendChild(left);
    board.appendChild(this.buildBarArea()); // dice live here now
    board.appendChild(right);
    board.appendChild(this.buildOffArea());

    // Floating HUD overlay — turn, score, bar counts
    board.appendChild(this._buildBoardHUD());
  }

  _buildBoardHUD() {
    const t = this.translate();
    const hud = document.createElement("div");
    hud.className = "bg-board-hud";
    hud.setAttribute("aria-hidden", "true");

    const { white: ws, black: bs } = this.engine.matchScore;
    const target = this.engine.targetScore;

    if (this.engine.winner) {
      const chip = document.createElement("div");
      chip.className = "bg-hud-chip bg-hud-top-left winner";
      chip.textContent = `🏆 ${this.colorName(this.engine.winner)} wins!`;
      hud.appendChild(chip);
    } else {
      const turnChip = document.createElement("div");
      turnChip.className = "bg-hud-chip bg-hud-top-left";
      const turnText = this.engine.dice.length > 0
        ? `${this.colorName(this.engine.turn)} moving`
        : `${this.colorName(this.engine.turn)} to roll`;
      turnChip.textContent = turnText;
      if (this.engine.whiteCheatMode) turnChip.textContent += " ⚠";
      hud.appendChild(turnChip);
    }

    const scoreChip = document.createElement("div");
    scoreChip.className = "bg-hud-chip bg-hud-top-right";
    scoreChip.textContent = `W ${ws} — B ${bs}  (first to ${target})`;
    hud.appendChild(scoreChip);

    const barChip = document.createElement("div");
    barChip.className = "bg-hud-chip bg-hud-bot-left";
    const bw = this.engine.bar.white, bb = this.engine.bar.black;
    barChip.textContent = `Bar: W ${bw} · B ${bb}`;
    hud.appendChild(barChip);

    if (this.engine.doublingEnabled) {
      const cubeChip = document.createElement("div");
      cubeChip.className = "bg-hud-chip bg-hud-bot-right";
      cubeChip.textContent = `×${this.engine.cubeValue} ${this.engine.cubeOwner ?? t.center}`;
      hud.appendChild(cubeChip);
    }

    return hud;
  }

  renderStatus() {
    const t = this.translate();
    if (this.engine.winner) {
      this.elements.backgammonStatus.textContent = `${this.colorName(this.engine.winner)} ${t.winsGame}`;
      const key = `${this.engine.winner}-${this.engine.lastWinType}-${this.engine.matchScore.white}-${this.engine.matchScore.black}`;
      if (this.lastWinAnnounced !== key) {
        if (this.engine.lastWinType === "gammon" || this.engine.lastWinType === "backgammon") {
          this.playMarsSfx();
        }
        this.lastWinAnnounced = key;
      }
      this.showGameOverModal();
      return;
    }
    if (this.engine.doubleOfferedBy) {
      this.elements.backgammonStatus.textContent = `${this.colorName(this.engine.doubleOfferedBy)} ${t.doubleOffered}`;
      return;
    }
    this.elements.backgammonStatus.textContent = `${this.colorName(this.engine.turn)} ${t.toMove}`;
    if (this.engine.whiteCheatMode) {
      this.elements.backgammonStatus.textContent += this.language === "tr"
        ? " (Beyaz hile modu aktif)"
        : " (White cheat mode ON)";
    }
  }

  renderMeta() {
    const t = this.translate();
    this.elements.backgammonScore.textContent = `${t.matchScore} (${t.to} ${this.engine.targetScore}) - W: ${this.engine.matchScore.white} | B: ${this.engine.matchScore.black}`;
    this.elements.backgammonCube.textContent = this.engine.doublingEnabled
      ? `${t.cube}: ${this.engine.cubeValue} (${this.engine.cubeOwner || t.center})`
      : `${t.cube}: ${t.offCube}`;
    this.elements.backgammonBar.textContent = `${t.bar}: W ${this.engine.bar.white} | B ${this.engine.bar.black}`;
    this.elements.backgammonOff.textContent = `${t.off}: W ${this.engine.off.white} | B ${this.engine.off.black}`;
  }

  renderLegalHints() {
    const legal = this.engine.getLegalMoves();
    this.elements.backgammonHints.innerHTML = "";
    legal.slice(0, 10).forEach((m) => {
      const li = document.createElement("li");
      li.textContent = `${m.from} -> ${m.to} (die ${m.die})`;
      this.elements.backgammonHints.appendChild(li);
    });
  }

  render() {
    // renderBoard() now builds the bar (dice) and HUD overlay in one pass.
    this.renderBoard();
    // renderDice() syncs markUsed state on the bar dice.
    this.renderDice();
    // Status / meta still update the hidden HUD elements for accessibility.
    this.renderStatus();
    this.renderMeta();
    this.renderLegalHints();
    this.updateDoubleButtons();
    this.updateCallout();
    this.updateActionStates();
    this.updateBoardTurnCue();
  }

  renderDice() {
    // Dice now live inside the bar (built by renderBoard → buildBarArea).
    // _syncDiceDisplay() is called from buildBarArea, so this method just
    // keeps the markUsed state fresh after moves.
    if (this._barDiceEl) {
      this._syncDiceDisplay();
    }
  }

  async rollDiceFromUI() {
    const roll = this.engine.rollDice();
    if (!roll) return;
    this.selectedFrom = null;
    this.playDiceSfx();

    const values = this.engine.dice;

    // renderBoard() rebuilds the bar with a fresh dice container and re-targets
    // the DiceAnimator — it must run BEFORE the roll animation.
    this.renderBoard();
    this.renderStatus();
    this.renderMeta();
    this.updateDoubleButtons();
    this.updateActionStates();
    this.updateBoardTurnCue();

    // Animate dice inside the bar (DiceAnimator was re-targeted in renderBoard)
    if (this._diceCount !== values.length) {
      this.diceAnimator.build(values.length);
      this._diceCount = values.length;
    }
    await this.diceAnimator.roll(values);

    // After tumble settles: reveal legal hints and callout
    this.renderLegalHints();
    this.updateCallout();
  }

  updateDoubleButtons() {
    const pending = Boolean(this.engine.doubleOfferedBy);
    const show = this.engine.doublingEnabled;
    this.elements.backgammonDoubleBtn.classList.toggle("hidden", !show);
    this.elements.backgammonAcceptDoubleBtn.classList.toggle("hidden", !show);
    this.elements.backgammonRejectDoubleBtn.classList.toggle("hidden", !show);
    this.elements.backgammonAcceptDoubleBtn.disabled = !pending;
    this.elements.backgammonRejectDoubleBtn.disabled = !pending;
  }

  updateActionStates() {
    const hasMovesToUndo = this.engine.history.length > 0;
    this.elements.backgammonUndoBtn.disabled = !hasMovesToUndo;
    const canRoll = !this.engine.winner && !this.engine.doubleOfferedBy && this.engine.movesLeft.length === 0;
    this.elements.backgammonRollBtn.disabled = !canRoll;
  }

  updateCallout() {
    const t = this.translate();
    if (!this.engine.dice.length) {
      this.elements.backgammonCallout.textContent = "";
      return;
    }
    const [d1, d2] = this.engine.dice;
    if (d1 !== d2) {
      this.elements.backgammonCallout.textContent = "";
      return;
    }
    const text = this.language === "tr"
      ? this.turkishDoubleName(d1)
      : `${d1}${d1} double`;
    this.elements.backgammonCallout.textContent = text;
    this.showToast(text);
  }

  turkishDoubleName(v) {
    const map = {
      1: "Hep Yek",
      2: "Dü Bara",
      3: "Se Se (Gele Gele)",
      4: "Cihar Cihar",
      5: "Penç Penç",
      6: "Düşeş"
    };
    return map[v] || "";
  }

  colorName(c) {
    if (this.language === "tr") return c === "white" ? "Beyaz" : "Siyah";
    return c === "white" ? "White" : "Black";
  }

  translate() {
    if (this.language === "tr") {
      return {
        winsGame: "bu eli kazandı.",
        doubleOffered: "katlama teklif etti. Rakip kabul/red etmeli.",
        toMove: "oynayacak",
        matchScore: "Maç Skoru",
        to: "hedef",
        cube: "Katlama Küpü",
        center: "merkez",
        offCube: "kapalı",
        bar: "Orta",
        off: "Toplanan"
      };
    }
    return {
      winsGame: "wins this game.",
      doubleOffered: "offered a double. Opponent must accept or reject.",
      toMove: "to move",
      matchScore: "Match Score",
      to: "to",
      cube: "Doubling Cube",
      center: "center",
      offCube: "off",
      bar: "Bar",
      off: "Off"
    };
  }

  playDiceSfx() {
    this.playTone(180, 0.08, "square");
    this.playTone(120, 0.1, "triangle", 0.02);
  }

  playCheckerSfx() {
    this.playTone(420, 0.03, "triangle");
  }

  playMarsSfx() {
    this.playTone(740, 0.08, "sawtooth");
    this.playTone(880, 0.1, "triangle", 0.05);
  }

  showToast(text) {
    if (!this.elements.backgammonToast) return;
    const toast = this.elements.backgammonToast;
    toast.textContent = text;
    toast.classList.remove("show");
    void toast.offsetWidth;
    toast.classList.add("show");
    if (this.lastToastTimeout) {
      window.clearTimeout(this.lastToastTimeout);
    }
    this.lastToastTimeout = window.setTimeout(() => toast.classList.remove("show"), 1400);
  }

  showGameOverModal() {
    if (!this.engine.winner) return;
    const t      = this.translate();
    const winner = this.colorName(this.engine.winner);
    const pts    = this.engine.lastWinPoints ?? 0;
    const flavor = this.getVictoryFlavor();
    const { white: ws, black: bs } = this.engine.matchScore ?? { white: 0, black: 0 };
    const target = this.engine.targetScore ?? 7;

    // Keep legacy DOM labels for screen-readers / fallback
    if (this.elements.backgammonGameOverTitle) {
      this.elements.backgammonGameOverTitle.textContent = this.language === "tr" ? "Oyun Bitti" : "Round Over";
    }
    if (this.elements.backgammonGameOverText) {
      this.elements.backgammonGameOverText.textContent = `${winner} ${t.winsGame} (+${pts})`;
    }
    if (this.elements.backgammonGameOverFlavor) {
      this.elements.backgammonGameOverFlavor.textContent = flavor;
    }

    showBackgammonVictory({
      title: this.language === "tr" ? "Oyun Bitti" : "Round Over",
      flavor,
      stats: [
        { value: winner,           label: "Winner"      },
        { value: `+${pts}`,        label: "Points Won"  },
        { value: `${ws} – ${bs}`,  label: "Match Score" },
        { value: `${target}`,      label: "Target"      },
      ],
      onNextRound: () => {
        this.engine.startNextGame();
        this.selectedFrom = null;
        this.lastWinAnnounced = "";
        this.render();
      },
    });
  }

  hideGameOverModal() {
    if (this.elements.backgammonGameOverModal) {
      this.elements.backgammonGameOverModal.classList.add("hidden");
    }
    hideBackgammonVictory();
  }

  updateBoardTurnCue() {
    this.elements.backgammonBoard.classList.toggle("turn-white", this.engine.turn === "white");
    this.elements.backgammonBoard.classList.toggle("turn-black", this.engine.turn === "black");
  }

  getVictoryFlavor() {
    if (this.engine.lastWinType === "backgammon") {
      return this.language === "tr" ? "Backgammon! Usta zaferi." : "Backgammon! Dominant finish.";
    }
    if (this.engine.lastWinType === "gammon") {
      return this.language === "tr" ? "Mars! Bonus puan kazandın." : "Mars/Gammon! Bonus points awarded.";
    }
    if (this.engine.dice.length === 2 && this.engine.dice[0] === 6 && this.engine.dice[1] === 6) {
      return this.language === "tr" ? "Düşeş ile bitiriş!" : "Finished on Düşeş!";
    }
    return this.language === "tr" ? "Yeni tur için hazırsın." : "Ready for the next round.";
  }

  playTone(freq, duration, type = "sine", delay = 0) {
    try {
      const ctx = this.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      this.audioCtx = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = 0.001;
      osc.connect(gain).connect(ctx.destination);
      const start = ctx.currentTime + delay;
      gain.gain.exponentialRampToValueAtTime(0.05, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    } catch {
      // audio optional
    }
  }
}
