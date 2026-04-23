import { COLOR, PIECE_ICONS, STATE } from "./constants.js";
import { PRESETS } from "./presets.js";
import { evaluatePosition, materialScore, scoreToBarPercent } from "./evaluation.js";
import { getTacticalSignal } from "./tactical-eval.js";
import { createStateStore } from "./state/store.js";

export class ChessUI {
  constructor(engine, elements, sound, progression = null, evaluator = null, training = null, storage = null) {
    this.engine = engine;
    this.elements = elements;
    this.sound = sound;
    this.progression = progression;
    this.evaluator = evaluator;
    this.training = training;
    this.storage = storage;
    this.selected = null;
    this.legalMoves = [];
    this.orientation = COLOR.WHITE;
    this.autoFlipEnabled = false;
    this.timerId = null;
    this.isClockPaused = false;
    this.hasClockStarted = false;
    this.isUntimed = false;
    this.incrementSeconds = 0;
    this.delaySeconds = 0;
    this.activeDelayRemaining = 0;
    this.timeRemaining = {
      white: 600,
      black: 600
    };
    this.clockSnapshotHistory = [];
    this.isEvalVisible = true;
    this.lastEvaluationScore = this.evaluateScore();
    this.currentMoveQuality = "Neutral";
    this.heartbeatLevel = 0;
    this.squareElements = new Map();
    this.matchRecorded = false;
    this.matchStats = this.createEmptyMatchStats();
    this.lastEvalSnapshot = { score: 0, label: "" };
    this.pendingPromotion = null;
    this.timelineSnapshots = [];
    this.currentPly = 0;
    this.isViewingHistory = false;
    this.activeTab = "game";
    this.layoutPreset = "default";
    this.gamePersisted = false;
    this.lastBoardRenderKey = "";
    this.stateStore = createStateStore({
      gameState: { turn: this.engine.turn, status: this.engine.gameState, result: null, ply: 0 },
      uiState: {
        selectedSquare: null,
        legalHighlights: [],
        orientation: this.orientation,
        modals: { promotion: false, gameOver: false }
      },
      metaState: {
        settings: { autoFlip: this.autoFlipEnabled, showEval: this.isEvalVisible },
        profile: null
      }
    });
  }

  init() {
    this.elements.themeSelect.addEventListener("change", () => {
      this.applyTheme(this.elements.themeSelect.value);
      this.render("Theme updated.");
    });

    this.elements.presetSelect.addEventListener("change", () => {
      this.applyPreset(this.elements.presetSelect.value);
    });
    this.elements.layoutPreset.addEventListener("change", () => {
      this.layoutPreset = this.elements.layoutPreset.value;
      this.applyLayoutPreset();
      this.render("Layout preset updated.");
    });

    this.elements.timeControl.addEventListener("change", () => {
      this.resetClocks();
      this.clockSnapshotHistory = [];
      this.hasClockStarted = this.engine.moveHistory.some((move) => move.turn === COLOR.WHITE);
      this.startClock();
      this.render("Time control updated.");
    });

    this.elements.autoFlipToggle.addEventListener("change", () => {
      this.autoFlipEnabled = this.elements.autoFlipToggle.checked;
      if (this.autoFlipEnabled) {
        this.orientation = this.engine.turn;
      }
      this.stateStore.dispatch({ type: "UI/SET_ORIENTATION", payload: this.orientation });
      this.render(this.autoFlipEnabled ? "Auto flip enabled." : "Auto flip disabled.");
    });

    this.elements.flipBtn.addEventListener("click", () => {
      this.orientation = this.orientation === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE;
      this.stateStore.dispatch({ type: "UI/SET_ORIENTATION", payload: this.orientation });
      this.render("Board orientation changed.");
    });

    this.elements.toggleEvalBtn.addEventListener("click", () => {
      this.isEvalVisible = !this.isEvalVisible;
      this.elements.evalPanel.classList.toggle("hidden", !this.isEvalVisible);
      this.elements.toggleEvalBtn.textContent = this.isEvalVisible ? "Hide Eval" : "Show Eval";
      this.render(this.isEvalVisible ? "Evaluation bar shown." : "Evaluation bar hidden.");
    });
    this.elements.pauseClockBtn.addEventListener("click", () => this.togglePauseClock());
    this.elements.offerDrawBtn.addEventListener("click", () => this.offerDraw());
    this.elements.resignBtn.addEventListener("click", () => this.resignGame());
    this.elements.rematchBtn.addEventListener("click", () => this.rematch());

    this.elements.undoBtn.addEventListener("click", () => {
      if (this.isViewingHistory) {
        this.goToPly(this.timelineSnapshots.length - 1);
      }
      const didUndo = this.engine.undo();
      if (!didUndo) {
        this.render("No moves available to undo.");
        return;
      }
      if (this.timelineSnapshots.length > 1) {
        this.timelineSnapshots.pop();
      }
      this.currentPly = this.timelineSnapshots.length - 1;
      this.isViewingHistory = false;
      const prevClocks = this.clockSnapshotHistory.pop();
      if (prevClocks) {
        this.timeRemaining.white = prevClocks.white;
        this.timeRemaining.black = prevClocks.black;
      }
      this.hasClockStarted = this.engine.moveHistory.some((move) => move.turn === COLOR.WHITE);
      if (this.autoFlipEnabled) {
        this.orientation = this.engine.turn;
      }
      this.startClock();
      this.selected = null;
      this.legalMoves = [];
      this.stateStore.dispatch({ type: "UI/CLEAR_SELECTION" });
      this.playSound("move");
      this.render("Last move undone.");
    });

    this.elements.resetBtn.addEventListener("click", () => {
      this.resetGame();
    });

    this.elements.playAgainBtn.addEventListener("click", () => {
      this.resetGame();
    });

    this.elements.historyStartBtn.addEventListener("click", () => this.goToPly(0));
    this.elements.historyPrevBtn.addEventListener("click", () => this.goToPly(Math.max(0, this.currentPly - 1)));
    this.elements.historyNextBtn.addEventListener("click", () => this.goToPly(Math.min(this.timelineSnapshots.length - 1, this.currentPly + 1)));
    this.elements.historyEndBtn.addEventListener("click", () => this.goToPly(this.timelineSnapshots.length - 1));
    this.elements.exportPgnBtn.addEventListener("click", () => this.exportPgn());
    this.elements.importPgnBtn.addEventListener("click", () => this.elements.importPgnInput.click());
    this.elements.importPgnInput.addEventListener("change", (event) => this.importPgn(event));
    this.elements.continueLastBtn.addEventListener("click", () => this.continueLastGame());
    this.elements.savedGamesSearch.addEventListener("input", () => this.renderSavedGames());
    this.elements.analysisScrubber.addEventListener("input", () => {
      const value = Number(this.elements.analysisScrubber.value);
      this.goToPly(value);
    });
    this.elements.trainingOffBtn.addEventListener("click", () => this.activateTrainingMode("off"));
    this.elements.openingTrainerBtn.addEventListener("click", () => this.activateTrainingMode("opening"));
    this.elements.puzzleModeBtn.addEventListener("click", () => this.activateTrainingMode("puzzle"));
    this.elements.endgameDrillBtn.addEventListener("click", () => this.activateTrainingMode("drill"));
    this.elements.nextTrainingBtn.addEventListener("click", () => this.nextTrainingPosition());
    this.elements.exportProfileBtn.addEventListener("click", () => this.exportProfile());
    this.elements.importProfileBtn.addEventListener("click", () => this.elements.importProfileInput.click());
    this.elements.importProfileInput.addEventListener("change", (event) => this.importProfile(event));
    this.elements.tabGameBtn.addEventListener("click", () => this.setActiveTab("game"));
    this.elements.tabAnalysisBtn.addEventListener("click", () => this.setActiveTab("analysis"));
    this.elements.tabProfileBtn.addEventListener("click", () => this.setActiveTab("profile"));
    this.elements.tabQuestsBtn.addEventListener("click", () => this.setActiveTab("quests"));

    this.applyTheme(this.elements.themeSelect.value);
    this.applyLayoutPreset();
    this.setActiveTab("game");
    this.registerKeyboardShortcuts();
    this.rebuildTimelineFromCurrent();
    this.resetClocks();
    this.startClock();
    this.renderProfile();
    this.renderMetaProgress();
    this.renderTrainingStatus();
    this.renderSavedGames();
    this.render("Select a piece to begin.");
  }

  createEmptyMatchStats() {
    return {
      blunders: { white: 0, black: 0 },
      checksGiven: { white: 0, black: 0 },
      captures: { white: 0, black: 0 }
    };
  }

  resetGame() {
    this.engine.reset();
    this.elements.presetSelect.value = "standard";
    this.selected = null;
    this.legalMoves = [];
    this.clockSnapshotHistory = [];
    this.hasClockStarted = false;
    this.orientation = COLOR.WHITE;
    this.isClockPaused = false;
    this.activeDelayRemaining = this.delaySeconds;
    this.currentMoveQuality = "Neutral";
    this.lastEvaluationScore = this.evaluateScore();
    this.sound.stopHeartbeat();
    this.sound.stopRhythm();
    this.heartbeatLevel = 0;
    this.elements.boardFrame.classList.remove("critical", "blunder-hit", "glitch-hit");
    this.matchRecorded = false;
    this.matchStats = this.createEmptyMatchStats();
    this.pendingPromotion = null;
    this.gamePersisted = false;
    this.closePromotionPrompt();
    this.rebuildTimelineFromCurrent();
    this.toggleGameOverPanel(false);
    this.renderTrainingStatus();
    this.resetClocks();
    this.startClock();
    this.render("New game started.");
  }

  setMessage(text) {
    this.elements.messageLabel.textContent = text;
  }

  colorName(color) {
    return color === COLOR.WHITE ? "White" : "Black";
  }

  evaluateScore(depth = 1) {
    if (this.evaluator && typeof this.evaluator.evaluate === "function") {
      const result = this.evaluator.evaluate(this.engine, depth);
      return Number(result?.score ?? 0);
    }
    return evaluatePosition(this.engine);
  }

  statusText() {
    switch (this.engine.gameState) {
      case STATE.CHECK:
        return `${this.colorName(this.engine.turn)} in Check`;
      case STATE.CHECKMATE:
        return `Checkmate - ${this.colorName(this.engine.winner)} wins`;
      case STATE.STALEMATE:
        return "Stalemate - Draw";
      case STATE.DRAW:
        return `Draw - ${this.engine.drawReason || "Rule draw"}`;
      case STATE.TIMEOUT:
        return `Timeout - ${this.colorName(this.engine.winner)} wins`;
      default:
        return "In Progress";
    }
  }

  getCheckKingSquare() {
    if (this.engine.gameState !== STATE.CHECK) {
      return null;
    }
    return this.engine.findKing(this.engine.turn, this.engine.board);
  }

  handleSquareClick(row, col) {
    if (this.isClockPaused) {
      this.setMessage("Clock paused. Resume before making a move.");
      return;
    }
    if (this.pendingPromotion) {
      this.setMessage("Finish pawn promotion first.");
      return;
    }
    if (
      this.engine.gameState === STATE.CHECKMATE
      || this.engine.gameState === STATE.STALEMATE
      || this.engine.gameState === STATE.DRAW
      || this.engine.gameState === STATE.TIMEOUT
    ) {
      this.setMessage("Game over. Press New Game to play again.");
      return;
    }

    const clickedPiece = this.engine.getPiece(row, col, this.engine.board);

    if (!this.selected) {
      if (!clickedPiece) {
        return;
      }
      if (clickedPiece.color !== this.engine.turn) {
        this.setMessage(`It's ${this.colorName(this.engine.turn)}'s turn.`);
        return;
      }
      this.select(row, col);
      return;
    }

    const isSameSquare = this.selected.row === row && this.selected.col === col;
    if (isSameSquare) {
      this.selected = null;
      this.legalMoves = [];
      this.render("Selection cleared.");
      return;
    }

    const isLegalMove = this.legalMoves.some((m) => m.row === row && m.col === col);
    if (isLegalMove) {
      const clockSnapshot = { ...this.timeRemaining };
      const movingSide = this.engine.turn;
      const scoreBefore = this.evaluateScore();
      const materialBefore = materialScore(this.engine.board);
      const chosen = this.legalMoves.find((m) => m.row === row && m.col === col);
      const targetBeforeMove = this.engine.getPiece(row, col, this.engine.board);
      const bestMoveHint = this.computeBestMoveHint(movingSide);
      const from = { ...this.selected };
      const to = { row, col };
      this.selected = null;
      this.legalMoves = [];
      if (this.engine.isPromotionMove(from, to)) {
        this.pendingPromotion = {
          from,
          to,
          chosen,
          targetBeforeMove,
          movingSide,
          clockSnapshot,
          scoreBefore,
          materialBefore,
          bestMoveHint
        };
        this.openPromotionPrompt(movingSide);
        this.render("Choose a promotion piece.");
        return;
      }

      const result = this.commitMove({
        from,
        to,
        chosen,
        targetBeforeMove,
        movingSide,
        clockSnapshot,
        scoreBefore,
        materialBefore,
        bestMoveHint
      });
      this.startClock();
      this.render(result.ok ? "Move completed." : result.reason);
      this.playStateSound();
      return;
    }

    if (clickedPiece && clickedPiece.color === this.engine.turn) {
      this.select(row, col);
      return;
    }

    this.render("Invalid destination. Choose a highlighted move.");
  }

  commitMove(context, promotionType = null) {
    this.exitHistoryViewIfNeeded();
    const result = this.engine.move(context.from, context.to, promotionType ? { promotionType } : {});
    if (!result.ok) {
      return result;
    }
    const {
      movingSide,
      clockSnapshot,
      chosen,
      targetBeforeMove,
      scoreBefore,
      materialBefore,
      to,
      bestMoveHint
    } = context;

    if (movingSide === COLOR.WHITE) {
      this.hasClockStarted = true;
    }
    if (!this.isUntimed && this.incrementSeconds > 0) {
      this.timeRemaining[movingSide] += this.incrementSeconds;
    }
    this.activeDelayRemaining = this.delaySeconds;
    this.clockSnapshotHistory.push(clockSnapshot);
    const scoreAfter = this.evaluateScore();
    const materialAfter = materialScore(this.engine.board);
    const moveAssessment = this.assessMoveQuality(
      scoreBefore,
      scoreAfter,
      materialBefore,
      materialAfter,
      movingSide,
      chosen,
      targetBeforeMove
    );
    this.currentMoveQuality = moveAssessment.label;
    const latestMove = this.engine.moveHistory[this.engine.moveHistory.length - 1];
    if (latestMove) {
      latestMove.evalBefore = scoreBefore;
      latestMove.evalAfter = scoreAfter;
      latestMove.quality = moveAssessment.label;
      latestMove.tags = this.buildMoveTags(moveAssessment);
      latestMove.badge = this.getQualityBadge(moveAssessment.label);
      latestMove.bestMoveUci = bestMoveHint?.uci || null;
      latestMove.bestMoveSan = bestMoveHint?.san || null;
      this.handleTrainingProgress(latestMove);
    }
    if (moveAssessment.label === "Blunder") {
      this.matchStats.blunders[movingSide] += 1;
    }
    this.playMoveSound(chosen, moveAssessment);
    this.applyMoveQualityEffects(moveAssessment);
    if (moveAssessment.isCapture) {
      this.matchStats.captures[movingSide] += 1;
      this.spawnCaptureParticles(to.row, to.col, targetBeforeMove?.color ?? this.oppositeColor(movingSide));
      if (this.progression) {
        this.progression.recordCapture(1);
      }
    }
    if (this.engine.gameState === STATE.CHECK) {
      this.matchStats.checksGiven[movingSide] += 1;
      if (this.progression) {
        this.progression.recordCheck(1);
      }
    }
    if (this.progression) {
      this.progression.recordMoveQuality({ label: moveAssessment.label, delta: moveAssessment.delta });
    }
    if (this.autoFlipEnabled) {
      this.orientation = this.engine.turn;
    }
    this.lastEvaluationScore = scoreAfter;
    this.awardMoveXp(moveAssessment);
    this.timelineSnapshots.push(this.engine.getSnapshot());
    this.currentPly = this.timelineSnapshots.length - 1;
    this.isViewingHistory = false;
    this.persistOngoingGame();
    return result;
  }

  buildMoveTags(moveAssessment) {
    const tags = [];
    if (moveAssessment.isCapture) tags.push("capture");
    if (moveAssessment.label === "Great Move") tags.push("great");
    if (moveAssessment.label === "Blunder") tags.push("blunder");
    if (moveAssessment.label === "Mistake") tags.push("mistake");
    return tags;
  }

  select(row, col) {
    this.selected = { row, col };
    this.legalMoves = this.engine.getLegalMoves(row, col);
    this.stateStore.dispatch({
      type: "UI/SELECT_SQUARE",
      payload: {
        selectedSquare: { row, col },
        legalHighlights: this.legalMoves.map((m) => ({ row: m.row, col: m.col }))
      }
    });
    if (this.legalMoves.length === 0) {
      this.render("No legal moves for this piece.");
      return;
    }
    this.render("Choose one of the highlighted moves.");
  }

  render(optionalMessage) {
    if (optionalMessage) {
      this.setMessage(optionalMessage);
    }

    this.elements.turnLabel.textContent = this.colorName(this.engine.turn);
    this.elements.activeSideBadge.textContent = `${this.colorName(this.engine.turn)} to move`;
    this.elements.activeSideBadge.classList.remove("white", "black");
    this.elements.activeSideBadge.classList.add(this.engine.turn === COLOR.WHITE ? "white" : "black");
    this.elements.stateLabel.textContent = this.statusText();
    this.elements.moveQualityLabel.textContent = this.currentMoveQuality;
    this.elements.moveQualityLabel.className = "quality-label";
    this.elements.moveQualityLabel.classList.add(this.currentMoveQuality.toLowerCase().replace(/\s+/g, "-"));
    this.lastEvalSnapshot = this.getEvaluationSnapshot();
    this.renderProfile();
    this.renderMetaProgress();
    this.renderHistory();
    this.renderAnalysisPanel();
    this.renderTrainingStatus();
    this.renderTimers();
    this.renderEvaluation(this.lastEvalSnapshot);
    this.renderBoard();
    this.updateGameOverPanel();
    this.updateCriticalAtmosphere();
    this.sound.updateMood(this.lastEvalSnapshot.score, this.engine.turn);
    this.syncStore();
  }

  setActiveTab(tabKey) {
    this.activeTab = tabKey;
    const sections = document.querySelectorAll("[data-tab-section]");
    sections.forEach((section) => {
      section.classList.toggle("hidden-tab", section.getAttribute("data-tab-section") !== tabKey);
    });
    const tabButtons = [this.elements.tabGameBtn, this.elements.tabAnalysisBtn, this.elements.tabProfileBtn, this.elements.tabQuestsBtn];
    tabButtons.forEach((btn) => {
      if (!btn) return;
      btn.classList.toggle("active", btn.dataset.tabTarget === tabKey);
    });
  }

  applyLayoutPreset() {
    document.body.classList.remove("layout-focus", "layout-analysis", "layout-training");
    if (this.layoutPreset === "focus") {
      document.body.classList.add("layout-focus");
      return;
    }
    if (this.layoutPreset === "analysis") {
      document.body.classList.add("layout-analysis");
      return;
    }
    if (this.layoutPreset === "training") {
      document.body.classList.add("layout-training");
    }
  }

  applyPreset(presetId) {
    const preset = PRESETS[presetId];
    if (!preset) {
      this.render("Preset not found.");
      return;
    }

    if (preset.id === "standard") {
      this.engine.reset();
    } else {
      this.engine.loadFenPlacement(preset.fenPlacement, preset.turn, false);
    }

    this.selected = null;
    this.legalMoves = [];
    this.stateStore.dispatch({ type: "UI/CLEAR_SELECTION" });
    this.clockSnapshotHistory = [];
    this.hasClockStarted = false;
    this.pendingPromotion = null;
    this.closePromotionPrompt();
    this.orientation = this.autoFlipEnabled ? this.engine.turn : COLOR.WHITE;
    this.currentMoveQuality = "Neutral";
    this.lastEvaluationScore = this.evaluateScore();
    this.sound.stopHeartbeat();
    this.sound.stopRhythm();
    this.heartbeatLevel = 0;
    this.elements.boardFrame.classList.remove("critical", "blunder-hit", "glitch-hit");
    this.matchStats = this.createEmptyMatchStats();
    this.rebuildTimelineFromCurrent();
    this.isClockPaused = false;
    this.elements.pauseClockBtn.textContent = "Pause Clock";
    this.toggleGameOverPanel(false);
    this.resetClocks();
    this.startClock();
    this.playSound("move");
    this.renderTrainingStatus();
    this.render(`${preset.name} loaded.`);
  }

  activateTrainingMode(mode) {
    if (!this.training) {
      return;
    }
    this.training.mode = mode;
    if (mode === "opening") {
      this.resetGame();
      this.render("Opening trainer started.");
    } else if (mode === "puzzle") {
      this.loadPuzzlePosition(this.training.getCurrentPuzzle());
      this.render("Puzzle mode started.");
    } else if (mode === "drill") {
      this.loadDrillPosition(this.training.getCurrentDrill());
      this.render("Endgame drill started.");
    } else {
      this.render("Training mode disabled.");
    }
  }

  nextTrainingPosition() {
    if (!this.training) {
      return;
    }
    if (this.training.mode === "puzzle") {
      this.loadPuzzlePosition(this.training.nextPuzzle());
      this.render("Loaded next puzzle.");
      return;
    }
    if (this.training.mode === "drill") {
      this.loadDrillPosition(this.training.nextDrill());
      this.render("Loaded next endgame drill.");
      return;
    }
    this.render("Next position is available for puzzle/drill modes.");
  }

  loadPuzzlePosition(puzzle) {
    this.engine.loadFenPlacement(puzzle.fen, puzzle.turn, false);
    this.selected = null;
    this.legalMoves = [];
    this.rebuildTimelineFromCurrent();
    this.hasClockStarted = false;
    this.resetClocks();
    this.renderTrainingStatus();
  }

  loadDrillPosition(drill) {
    this.engine.loadFenPlacement(drill.fen, drill.turn, false);
    this.selected = null;
    this.legalMoves = [];
    this.rebuildTimelineFromCurrent();
    this.hasClockStarted = false;
    this.resetClocks();
    this.renderTrainingStatus();
  }

  handleTrainingProgress(latestMove) {
    if (!this.training || !latestMove) {
      return;
    }
    if (this.training.mode === "opening") {
      const expected = this.training.activeOpening.moves[latestMove.ply - 1];
      if (!expected) {
        this.setMessage(`Opening line complete: ${this.training.activeOpening.name}.`);
        return;
      }
      if (latestMove.uci === expected) {
        this.setMessage(`Book move played: ${latestMove.san}`);
      } else {
        this.setMessage(`Out of book. Expected ${expected}, played ${latestMove.uci}.`);
      }
      return;
    }
    if (this.training.mode === "puzzle") {
      const puzzle = this.training.getCurrentPuzzle();
      if (latestMove.uci === puzzle.goalUci) {
        this.training.streak += 1;
        if (this.progression) {
          this.progression.recordPuzzleResult(true);
        }
        this.setMessage(`Puzzle solved! Streak ${this.training.streak}.`);
      } else {
        this.training.streak = 0;
        if (this.progression) {
          this.progression.recordPuzzleResult(false);
        }
        this.setMessage(`Not the goal move. Expected ${puzzle.goalUci}.`);
      }
    }
  }

  renderTrainingStatus() {
    if (!this.training || !this.elements.trainingStatusText) {
      return;
    }
    if (this.training.mode === "opening") {
      this.elements.trainingStatusText.textContent = `Opening Trainer: ${this.training.activeOpening.name}`;
    } else if (this.training.mode === "puzzle") {
      const puzzle = this.training.getCurrentPuzzle();
      this.elements.trainingStatusText.textContent = `Puzzle: ${puzzle.name} - ${puzzle.goalText}`;
    } else if (this.training.mode === "drill") {
      const drill = this.training.getCurrentDrill();
      this.elements.trainingStatusText.textContent = `Endgame Drill: ${drill.name} - ${drill.objective}`;
    } else {
      this.elements.trainingStatusText.textContent = "Training mode is currently off.";
    }
    if (this.elements.trainingStreakText) {
      this.elements.trainingStreakText.textContent = `Puzzle Streak: ${this.training.streak}`;
    }
  }

  applyTheme(themeName) {
    document.body.dataset.theme = themeName || "default";
  }

  resetClocks() {
    const [baseValue, incrementValue, delayValue] = String(this.elements.timeControl.value || "600|0|0").split("|");
    const baseSeconds = Number(baseValue);
    this.incrementSeconds = Number(incrementValue || 0);
    this.delaySeconds = Number(delayValue || 0);
    this.activeDelayRemaining = this.delaySeconds;
    this.isUntimed = baseSeconds <= 0;
    this.timeRemaining.white = baseSeconds;
    this.timeRemaining.black = baseSeconds;
    this.isClockPaused = false;
    this.elements.pauseClockBtn.textContent = "Pause Clock";
  }

  formatTime(seconds) {
    const safe = Math.max(0, seconds);
    const m = Math.floor(safe / 60).toString().padStart(2, "0");
    const s = (safe % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  renderTimers() {
    if (this.isUntimed) {
      this.elements.whiteTimeLabel.textContent = "∞";
      this.elements.blackTimeLabel.textContent = "∞";
      return;
    }
    this.elements.whiteTimeLabel.textContent = this.formatTime(this.timeRemaining.white);
    this.elements.blackTimeLabel.textContent = this.formatTime(this.timeRemaining.black);
  }

  startClock() {
    if (this.timerId) {
      window.clearInterval(this.timerId);
    }
    if (
      !this.hasClockStarted
      || this.isClockPaused
      || this.isUntimed
      || (
        this.timeRemaining.white <= 0
        && this.timeRemaining.black <= 0
      )
    ) {
      return;
    }

    if (
      this.engine.gameState === STATE.CHECKMATE
      || this.engine.gameState === STATE.STALEMATE
      || this.engine.gameState === STATE.DRAW
      || this.engine.gameState === STATE.TIMEOUT
    ) {
      return;
    }
    this.activeDelayRemaining = this.delaySeconds;

    this.timerId = window.setInterval(() => {
      const side = this.engine.turn;
      if (this.activeDelayRemaining > 0) {
        this.activeDelayRemaining -= 1;
        this.renderTimers();
        return;
      }
      this.timeRemaining[side] -= 1;
      if (this.timeRemaining[side] <= 0) {
        this.timeRemaining[side] = 0;
        this.engine.endByTimeout(side);
        window.clearInterval(this.timerId);
      }
      this.renderTimers();
      if (this.engine.gameState === STATE.TIMEOUT) {
        this.render("Time expired.");
      }
    }, 1000);
  }

  togglePauseClock() {
    if (
      this.engine.gameState === STATE.CHECKMATE
      || this.engine.gameState === STATE.STALEMATE
      || this.engine.gameState === STATE.DRAW
      || this.engine.gameState === STATE.TIMEOUT
    ) {
      return;
    }
    this.isClockPaused = !this.isClockPaused;
    this.elements.pauseClockBtn.textContent = this.isClockPaused ? "Resume Clock" : "Pause Clock";
    if (this.isClockPaused && this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = null;
      this.render("Clock paused.");
      return;
    }
    this.startClock();
    this.render("Clock resumed.");
  }

  resignGame() {
    if (
      this.engine.gameState === STATE.CHECKMATE
      || this.engine.gameState === STATE.STALEMATE
      || this.engine.gameState === STATE.DRAW
      || this.engine.gameState === STATE.TIMEOUT
    ) {
      return;
    }
    this.engine.gameState = STATE.CHECKMATE;
    this.engine.winner = this.oppositeColor(this.engine.turn);
    this.engine.drawReason = "";
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    this.playSound("gameOver");
    this.render(`${this.colorName(this.engine.turn)} resigned.`);
  }

  offerDraw() {
    if (
      this.engine.gameState === STATE.CHECKMATE
      || this.engine.gameState === STATE.STALEMATE
      || this.engine.gameState === STATE.DRAW
      || this.engine.gameState === STATE.TIMEOUT
    ) {
      return;
    }
    this.engine.gameState = STATE.DRAW;
    this.engine.winner = null;
    this.engine.drawReason = "Draw agreed (local)";
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    this.playSound("gameOver");
    this.render("Draw agreed.");
  }

  rematch() {
    this.resetGame();
    this.render("Rematch started.");
  }

  updateGameOverPanel() {
    const isGameOver = (
      this.engine.gameState === STATE.CHECKMATE
      || this.engine.gameState === STATE.STALEMATE
      || this.engine.gameState === STATE.DRAW
      || this.engine.gameState === STATE.TIMEOUT
    );
    this.toggleGameOverPanel(isGameOver);
    if (!isGameOver) {
      return;
    }
    this.persistFinishedGameIfNeeded();
    this.sound.stopHeartbeat();
    this.heartbeatLevel = 0;
    if (!this.matchRecorded && this.progression) {
      const winner = this.engine.winner ?? null;
      const noBlunderWin = Boolean(winner) && this.matchStats.blunders[winner] === 0;
      this.progression.completeMatch(winner, { noBlunderWin });
      this.matchRecorded = true;
      this.renderProfile();
      this.renderMetaProgress();
    }

    if (this.engine.gameState === STATE.CHECKMATE) {
      this.elements.gameOverTitle.textContent = "Checkmate";
      this.elements.gameOverText.textContent = `${this.colorName(this.engine.winner)} wins the game.`;
      return;
    }
    if (this.engine.gameState === STATE.STALEMATE) {
      this.elements.gameOverTitle.textContent = "Stalemate";
      this.elements.gameOverText.textContent = "No legal moves remain. It's a draw.";
      return;
    }
    if (this.engine.gameState === STATE.DRAW) {
      this.elements.gameOverTitle.textContent = "Draw";
      this.elements.gameOverText.textContent = this.engine.drawReason || "Draw by rule.";
      return;
    }
    this.elements.gameOverTitle.textContent = "Timeout";
    this.elements.gameOverText.textContent = `${this.colorName(this.engine.winner)} wins on time.`;
  }

  toggleGameOverPanel(show) {
    this.elements.gameOverPanel.classList.toggle("hidden", !show);
    this.stateStore.dispatch({ type: "UI/SET_MODAL", payload: { key: "gameOver", value: show } });
  }

  renderEvaluation(snapshot = null) {
    if (!this.isEvalVisible) {
      return;
    }
    const evaluation = snapshot || this.getEvaluationSnapshot();
    const percent = scoreToBarPercent(evaluation.score);
    if (window.innerWidth <= 760) {
      this.elements.evalFill.style.width = `${percent}%`;
      this.elements.evalFill.style.height = "100%";
    } else {
      this.elements.evalFill.style.height = `${percent}%`;
      this.elements.evalFill.style.width = "100%";
    }
    if (evaluation.label) {
      this.elements.evalText.textContent = `Evaluation: ${evaluation.label}`;
      return;
    }
    const score = evaluation.score;
    const label = score > 0.25 ? "White better" : score < -0.25 ? "Black better" : "Equal";
    const prefix = score > 0 ? "+" : "";
    this.elements.evalText.textContent = `Evaluation: ${prefix}${score.toFixed(2)} (${label})`;
  }

  getEvaluationSnapshot() {
    if (this.engine.gameState === STATE.CHECKMATE) {
      if (this.engine.winner === COLOR.WHITE) {
        return { score: 10, label: "Mate - White wins" };
      }
      return { score: -10, label: "Mate - Black wins" };
    }
    if (this.engine.gameState === STATE.STALEMATE) {
      return { score: 0, label: "Draw - Stalemate" };
    }
    if (this.engine.gameState === STATE.DRAW) {
      return { score: 0, label: `Draw - ${this.engine.drawReason || "Rule draw"}` };
    }
    if (this.engine.gameState === STATE.TIMEOUT) {
      if (this.engine.winner === COLOR.WHITE) {
        return { score: 10, label: "Timeout - White wins" };
      }
      return { score: -10, label: "Timeout - Black wins" };
    }

    let score = this.evaluateScore();
    const tacticalSignal = getTacticalSignal(this.engine, score);
    if (tacticalSignal) {
      return tacticalSignal;
    }
    // Add a visible urgency bump while in-check so evaluations feel less "flat".
    if (this.engine.gameState === STATE.CHECK) {
      score += this.engine.turn === COLOR.WHITE ? -1.5 : 1.5;
    }
    return { score, label: "" };
  }

  renderHistory() {
    this.elements.historyList.innerHTML = "";
    this.engine.moveHistory.forEach((move, index) => {
      const li = document.createElement("li");
      const turnNum = Math.floor(index / 2) + 1;
      const prefix = index % 2 === 0 ? `${turnNum}.` : `${turnNum}...`;
      const moveBtn = document.createElement("button");
      moveBtn.type = "button";
      moveBtn.className = "history-move-btn";
      moveBtn.textContent = `${prefix} ${move.san || move.notation}`;
      moveBtn.addEventListener("click", () => this.goToPly(index + 1));
      li.appendChild(moveBtn);
      this.elements.historyList.appendChild(li);
    });
    this.elements.historyList.scrollTop = this.elements.historyList.scrollHeight;
  }

  renderAnalysisPanel() {
    if (!this.elements.analysisScrubber) {
      return;
    }
    const max = Math.max(0, this.timelineSnapshots.length - 1);
    this.elements.analysisScrubber.max = String(max);
    this.elements.analysisScrubber.value = String(Math.min(this.currentPly, max));
    this.drawEvalGraph();
    this.renderReviewList();
    this.renderSavedGames();
  }

  persistOngoingGame() {
    if (!this.storage) {
      return;
    }
    const moves = this.engine.moveHistory.map((m) => ({ uci: m.uci, san: m.san || m.notation }));
    this.storage.saveOngoing({
      moves,
      timestamp: Date.now()
    });
  }

  persistFinishedGameIfNeeded() {
    if (!this.storage || this.gamePersisted) {
      return;
    }
    const pgn = this.buildPgn();
    this.storage.saveFinishedGame({
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      timestamp: Date.now(),
      result: this.engine.winner ? `${this.colorName(this.engine.winner)} wins` : "Draw",
      reason: this.engine.drawReason || this.engine.gameState,
      pgn
    });
    this.storage.clearOngoing();
    this.gamePersisted = true;
    this.renderSavedGames();
  }

  renderSavedGames() {
    if (!this.storage || !this.elements.savedGamesList) {
      return;
    }
    const query = this.elements.savedGamesSearch?.value || "";
    const games = this.storage.searchGames(query);
    this.elements.savedGamesList.innerHTML = "";
    games.forEach((game) => {
      const li = document.createElement("li");
      const date = new Date(game.timestamp).toLocaleString();
      li.textContent = `${date} - ${game.result} (${game.reason})`;
      this.elements.savedGamesList.appendChild(li);
    });
  }

  buildPgn() {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const resultToken = this.engine.winner === COLOR.WHITE ? "1-0"
      : this.engine.winner === COLOR.BLACK ? "0-1"
        : "1/2-1/2";
    const headers = [
      `[Event "Royal Chess Local"]`,
      `[Site "Local"]`,
      `[Date "${yyyy}.${mm}.${dd}"]`,
      `[White "Player White"]`,
      `[Black "Player Black"]`,
      `[Result "${resultToken}"]`
    ];
    const moves = [];
    this.engine.moveHistory.forEach((move, index) => {
      if (index % 2 === 0) {
        moves.push(`${Math.floor(index / 2) + 1}. ${move.san || move.notation}`);
      } else {
        moves.push(move.san || move.notation);
      }
    });
    return `${headers.join("\n")}\n\n${moves.join(" ")} ${resultToken}`.trim();
  }

  exportPgn() {
    const pgn = this.buildPgn();
    const blob = new Blob([pgn], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "royal-chess-game.pgn";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    this.render("PGN exported.");
  }

  async importPgn(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const ok = this.replayFromPgn(text);
      this.render(ok ? "PGN imported." : "PGN import failed.");
    } catch {
      this.render("PGN import failed.");
    } finally {
      event.target.value = "";
    }
  }

  replayFromPgn(rawText) {
    this.resetGame();
    const stripped = rawText
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/\{[^}]*\}/g, " ")
      .replace(/\d+\.(\.\.)?/g, " ")
      .replace(/1-0|0-1|1\/2-1\/2|\*/g, " ");
    const tokens = stripped.split(/\s+/).map((t) => t.trim()).filter(Boolean);
    for (const token of tokens) {
      const clean = token.replace(/[+#]/g, "");
      if (!this.applySanToken(clean)) {
        return false;
      }
    }
    return true;
  }

  applySanToken(token) {
    const side = this.engine.turn;
    const snapshot = this.engine.getSnapshot();
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = this.engine.getPiece(row, col, this.engine.board);
        if (!piece || piece.color !== side) continue;
        const legal = this.engine.getLegalMoves(row, col);
        for (const move of legal) {
          this.engine.restoreSnapshot(snapshot);
          const result = this.engine.move({ row, col }, { row: move.row, col: move.col }, move.promotionType ? { promotionType: move.promotionType } : {});
          if (!result.ok) continue;
          const latest = this.engine.moveHistory[this.engine.moveHistory.length - 1];
          const san = (latest?.san || latest?.notation || "").replace(/[+#]/g, "");
          if (san === token) {
            this.timelineSnapshots.push(this.engine.getSnapshot());
            this.currentPly = this.timelineSnapshots.length - 1;
            return true;
          }
        }
      }
    }
    this.engine.restoreSnapshot(snapshot);
    return false;
  }

  continueLastGame() {
    if (!this.storage) {
      return;
    }
    const ongoing = this.storage.loadOngoing();
    if (!ongoing || !Array.isArray(ongoing.moves) || ongoing.moves.length === 0) {
      this.render("No ongoing saved game found.");
      return;
    }
    this.resetGame();
    for (const move of ongoing.moves) {
      if (!move.uci || move.uci.length < 4) {
        continue;
      }
      const from = {
        row: 8 - Number(move.uci[1]),
        col: move.uci.charCodeAt(0) - 97
      };
      const to = {
        row: 8 - Number(move.uci[3]),
        col: move.uci.charCodeAt(2) - 97
      };
      const promo = move.uci.length >= 5
        ? ({ q: "queen", r: "rook", b: "bishop", n: "knight" }[move.uci[4].toLowerCase()] || null)
        : null;
      const result = this.engine.move(from, to, promo ? { promotionType: promo } : {});
      if (!result.ok) {
        break;
      }
      this.timelineSnapshots.push(this.engine.getSnapshot());
      this.currentPly = this.timelineSnapshots.length - 1;
    }
    this.render("Continued last saved game.");
  }

  drawEvalGraph() {
    const canvas = this.elements.evalGraph;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(15,23,42,0.8)";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(148,163,184,0.4)";
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    const points = [{ ply: 0, score: 0 }];
    this.engine.moveHistory.forEach((move, index) => {
      points.push({ ply: index + 1, score: Number(move.evalAfter ?? 0) });
    });
    if (points.length < 2) {
      return;
    }
    const maxAbs = Math.max(1, ...points.map((p) => Math.min(10, Math.abs(p.score))));
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((point, i) => {
      const x = (point.ply / (points.length - 1)) * (width - 16) + 8;
      const normalized = Math.max(-10, Math.min(10, point.score)) / maxAbs;
      const y = (height / 2) - (normalized * (height / 2 - 12));
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  renderReviewList() {
    const list = this.elements.reviewList;
    if (!list) {
      return;
    }
    list.innerHTML = "";
    this.engine.moveHistory.forEach((move, index) => {
      if (!move.quality || move.quality === "Neutral") {
        return;
      }
      const li = document.createElement("li");
      const badge = document.createElement("span");
      badge.className = "review-badge";
      badge.textContent = move.badge || this.getQualityBadge(move.quality);
      const turnNum = Math.floor(index / 2) + 1;
      const better = (move.quality === "Blunder" || move.quality === "Mistake")
        ? ` Better: ${move.bestMoveSan || move.bestMoveUci || "n/a"}`
        : "";
      li.textContent = `${turnNum}${index % 2 === 0 ? "." : "..."} ${move.san || move.notation} - ${move.quality}.${better}`;
      li.prepend(badge);
      list.appendChild(li);
    });
  }

  getQualityBadge(label) {
    const map = {
      "Blunder": "??",
      "Mistake": "?",
      "Neutral": "?!",
      "Good Move": "!",
      "Great Move": "!!",
      "Winning Advantage": "!!"
    };
    return map[label] || "?!";
  }

  computeBestMoveHint(movingSide) {
    const snapshot = this.engine.getSnapshot();
    let best = null;
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const piece = this.engine.getPiece(row, col, this.engine.board);
        if (!piece || piece.color !== movingSide) {
          continue;
        }
        const legal = this.engine.getLegalMoves(row, col);
        for (const candidate of legal) {
          this.engine.restoreSnapshot(snapshot);
          const result = this.engine.move(
            { row, col },
            { row: candidate.row, col: candidate.col },
            candidate.promotionType ? { promotionType: candidate.promotionType } : {}
          );
          if (!result.ok) {
            continue;
          }
          const score = this.evaluateScore();
          const perspective = movingSide === COLOR.WHITE ? score : -score;
          const candidateMove = this.engine.moveHistory[this.engine.moveHistory.length - 1];
          if (!best || perspective > best.perspective) {
            best = {
              perspective,
              score,
              san: candidateMove?.san || null,
              uci: `${String.fromCharCode(97 + col)}${8 - row}${String.fromCharCode(97 + candidate.col)}${8 - candidate.row}`
            };
          }
        }
      }
    }
    this.engine.restoreSnapshot(snapshot);
    return best;
  }

  rebuildTimelineFromCurrent() {
    this.timelineSnapshots = [this.engine.getSnapshot()];
    this.currentPly = 0;
    this.isViewingHistory = false;
  }

  goToPly(ply) {
    if (this.timelineSnapshots.length === 0) {
      return;
    }
    const clamped = Math.max(0, Math.min(ply, this.timelineSnapshots.length - 1));
    const snapshot = this.timelineSnapshots[clamped];
    if (!snapshot) {
      return;
    }
    this.engine.restoreSnapshot(snapshot);
    this.currentPly = clamped;
    this.isViewingHistory = clamped !== this.timelineSnapshots.length - 1;
    this.selected = null;
    this.legalMoves = [];
    this.stateStore.dispatch({ type: "UI/CLEAR_SELECTION" });
    this.render(this.isViewingHistory ? `Viewing move ${clamped}.` : "Back to latest position.");
  }

  exitHistoryViewIfNeeded() {
    if (!this.isViewingHistory) {
      return;
    }
    const latest = this.timelineSnapshots[this.timelineSnapshots.length - 1];
    if (latest) {
      this.engine.restoreSnapshot(latest);
    }
    this.currentPly = this.timelineSnapshots.length - 1;
    this.isViewingHistory = false;
  }

  registerKeyboardShortcuts() {
    window.addEventListener("keydown", (event) => {
      const target = event.target;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "select" || tag === "textarea") {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "n") this.resetGame();
      if (key === "u") this.elements.undoBtn.click();
      if (key === "f") this.elements.flipBtn.click();
      if (key === "r") this.resignGame();
      if (key === "d") this.offerDraw();
      if (key === "m") this.rematch();
      if (key === " ") {
        event.preventDefault();
        this.togglePauseClock();
      }
    });
  }

  syncStore() {
    this.stateStore.dispatch({
      type: "GAME/SYNC",
      payload: {
        turn: this.engine.turn,
        status: this.engine.gameState,
        result: this.engine.winner || this.engine.drawReason || null,
        ply: this.engine.moveHistory.length
      }
    });
    this.stateStore.dispatch({
      type: "META/SYNC",
      payload: {
        settings: {
          autoFlip: this.autoFlipEnabled,
          showEval: this.isEvalVisible
        },
        profile: this.progression ? { ...this.progression.profile } : null
      }
    });
  }

  renderBoard() {
    const renderKey = this.getBoardRenderKey();
    if (renderKey === this.lastBoardRenderKey) {
      return;
    }
    this.lastBoardRenderKey = renderKey;
    const boardEl = this.elements.board;
    boardEl.innerHTML = "";
    const checkSquare = this.getCheckKingSquare();
    const rows = this.orientation === COLOR.WHITE ? [...Array(8).keys()] : [...Array(8).keys()].reverse();
    const cols = this.orientation === COLOR.WHITE ? [...Array(8).keys()] : [...Array(8).keys()].reverse();
    this.squareElements.clear();

    for (const row of rows) {
      for (const col of cols) {
        const square = document.createElement("div");
        square.className = `square ${(row + col) % 2 === 0 ? "white" : "black"}`;
        square.dataset.row = String(row);
        square.dataset.col = String(col);
        square.setAttribute("role", "button");
        square.setAttribute("tabindex", "0");
        square.setAttribute("aria-label", `Square ${String.fromCharCode(97 + col)}${8 - row}`);

        if (this.selected && this.selected.row === row && this.selected.col === col) {
          square.classList.add("selected");
        }

        if (this.engine.lastMove) {
          const { from, to, meta } = this.engine.lastMove;
          if ((from.row === row && from.col === col) || (to.row === row && to.col === col)) {
            square.classList.add("last-move");
          }
          if (to.row === row && to.col === col) {
            square.classList.add("just-moved");
            if (meta && meta.isCapture) {
              square.classList.add("capture-hit");
            }
          }
        }

        const candidate = this.legalMoves.find((m) => m.row === row && m.col === col);
        if (candidate) {
          square.classList.add(candidate.isCapture ? "capture" : "move");
        }

        if (checkSquare && checkSquare.row === row && checkSquare.col === col) {
          square.classList.add("in-check");
        }

        const piece = this.engine.getPiece(row, col, this.engine.board);
        if (piece) {
          const pieceNode = document.createElement("span");
          pieceNode.className = `piece ${piece.color === COLOR.WHITE ? "light" : "dark"}`;
          pieceNode.textContent = PIECE_ICONS[piece.color][piece.type];
          square.appendChild(pieceNode);
        }

        const isBottomRank = this.orientation === COLOR.WHITE ? row === 7 : row === 0;
        const isLeftFile = this.orientation === COLOR.WHITE ? col === 0 : col === 7;
        if (isBottomRank) {
          const fileLabel = document.createElement("span");
          fileLabel.className = "coord file";
          const displayFile = this.orientation === COLOR.WHITE ? col : 7 - col;
          fileLabel.textContent = String.fromCharCode(97 + displayFile);
          square.appendChild(fileLabel);
        }
        if (isLeftFile) {
          const rankLabel = document.createElement("span");
          rankLabel.className = "coord rank";
          const displayRank = this.orientation === COLOR.WHITE ? 8 - row : row + 1;
          rankLabel.textContent = String(displayRank);
          square.appendChild(rankLabel);
        }

        square.addEventListener("click", () => this.handleSquareClick(row, col));
        square.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            this.handleSquareClick(row, col);
          }
        });
        boardEl.appendChild(square);
        this.squareElements.set(`${row},${col}`, square);
      }
    }
  }

  getBoardRenderKey() {
    const selected = this.selected ? `${this.selected.row},${this.selected.col}` : "-";
    const legal = this.legalMoves.map((m) => `${m.row},${m.col}`).join("|");
    const last = this.engine.lastMove
      ? `${this.engine.lastMove.from.row},${this.engine.lastMove.from.col}:${this.engine.lastMove.to.row},${this.engine.lastMove.to.col}`
      : "-";
    return [
      this.engine.serializeBoard(),
      this.orientation,
      selected,
      legal,
      last,
      this.engine.gameState
    ].join(";");
  }

  playSound(kind) {
    if (!this.sound) {
      return;
    }
    if (typeof this.sound[kind] === "function") {
      this.sound[kind]();
    }
  }

  playMoveSound(moveMeta, assessment = null) {
    if (assessment?.label === "Blunder") {
      this.playSound("fail");
      return;
    }
    if (assessment?.label === "Great Move" || assessment?.label === "Winning Advantage") {
      this.playSound("triumphant");
      return;
    }
    if (assessment?.shouldMock) {
      this.playSound("mock");
      return;
    }
    if (!moveMeta) {
      this.playSound("move");
      return;
    }
    if (moveMeta.isCastle) {
      this.playSound("castle");
      return;
    }
    if (moveMeta.isCapture || moveMeta.isEnPassant) {
      this.playSound("capture");
      return;
    }
    this.playSound("move");
  }

  playStateSound() {
    if (
      this.engine.gameState === STATE.CHECKMATE
      || this.engine.gameState === STATE.STALEMATE
      || this.engine.gameState === STATE.DRAW
      || this.engine.gameState === STATE.TIMEOUT
    ) {
      this.playSound("breakdown");
      this.playSound("gameOver");
      return;
    }
    if (this.engine.gameState === STATE.CHECK) {
      this.playSound("check");
    }
  }

  assessMoveQuality(scoreBefore, scoreAfter, materialBefore, materialAfter, movingSide, moveMeta, capturedPiece) {
    const perspectiveBefore = movingSide === COLOR.WHITE ? scoreBefore : -scoreBefore;
    const perspectiveAfter = movingSide === COLOR.WHITE ? scoreAfter : -scoreAfter;
    const delta = perspectiveAfter - perspectiveBefore;
    const absolute = movingSide === COLOR.WHITE ? scoreAfter : -scoreAfter;
    const materialDeltaRaw = materialAfter - materialBefore;
    const materialDelta = movingSide === COLOR.WHITE ? materialDeltaRaw : -materialDeltaRaw;

    let label = "Neutral";
    if (delta <= -1.8) {
      label = "Blunder";
    } else if (delta >= 1.2) {
      label = "Great Move";
    } else if (absolute >= 6) {
      label = "Winning Advantage";
    } else if (delta >= 0.45) {
      label = "Good Move";
    } else if (delta <= -0.8) {
      label = "Mistake";
    }

    return {
      label,
      delta,
      absolute,
      materialDelta,
      isCapture: Boolean(moveMeta?.isCapture),
      isHighValueCapture: Boolean(capturedPiece && (capturedPiece.type === "queen" || capturedPiece.type === "rook")),
      shouldMock: Boolean(moveMeta?.isCapture) && (delta <= -0.9 || materialDelta <= -2)
    };
  }

  applyMoveQualityEffects(assessment) {
    if (!assessment) {
      return;
    }
    if (assessment.label === "Blunder") {
      this.elements.boardFrame.classList.remove("blunder-hit", "glitch-hit");
      void this.elements.boardFrame.offsetWidth;
      this.elements.boardFrame.classList.add("blunder-hit", "glitch-hit");
      window.setTimeout(() => {
        this.elements.boardFrame.classList.remove("blunder-hit", "glitch-hit");
      }, 420);
    }
    if (assessment.isHighValueCapture) {
      this.elements.boardFrame.classList.remove("blunder-hit");
      void this.elements.boardFrame.offsetWidth;
      this.elements.boardFrame.classList.add("blunder-hit");
      window.setTimeout(() => this.elements.boardFrame.classList.remove("blunder-hit"), 240);
    }
    if (assessment.shouldMock) {
      this.elements.boardFrame.classList.remove("glitch-hit");
      void this.elements.boardFrame.offsetWidth;
      this.elements.boardFrame.classList.add("glitch-hit");
      window.setTimeout(() => {
        this.elements.boardFrame.classList.remove("glitch-hit");
      }, 320);
    }
  }

  updateCriticalAtmosphere() {
    const evalScore = this.evaluateScore();
    const highStakes = this.engine.gameState === STATE.CHECK || Math.abs(evalScore) >= 7;

    this.elements.boardFrame.classList.toggle("critical", highStakes);
    if (highStakes) {
      const intensity = Math.max(1, Math.abs(evalScore) / 2.5);
      const rounded = Math.round(intensity * 10) / 10;
      if (rounded !== this.heartbeatLevel) {
        this.heartbeatLevel = rounded;
        this.sound.startHeartbeat(rounded);
        this.sound.startRhythm(rounded);
      }
    } else {
      this.heartbeatLevel = 0;
      this.sound.stopHeartbeat();
      this.sound.stopRhythm();
    }
  }

  awardMoveXp(assessment) {
    if (!this.progression || !assessment) {
      return;
    }
    let xp = 2;
    if (assessment.isCapture) {
      xp += 3;
    }
    if (assessment.label === "Good Move") {
      xp += 1;
    }
    if (assessment.label === "Great Move") {
      xp += 3;
    }
    if (assessment.label === "Winning Advantage") {
      xp += 4;
    }
    if (assessment.label === "Blunder") {
      xp = Math.max(1, xp - 1);
    }
    if (this.engine.gameState === STATE.CHECK) {
      xp += 2;
    }
    this.progression.gainXp(xp);
    this.renderProfile();
  }

  renderProfile() {
    if (!this.progression || !this.elements.profileLevel) {
      return;
    }
    const profile = this.progression.profile;
    const statsSummary = this.progression.getStatsSummary();
    const level = profile.level;
    const required = this.progression.xpRequired(level);
    const matches = profile.matchesPlayed;
    const wins = profile.wins.white + profile.wins.black;
    const winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;

    this.elements.profileLevel.textContent = String(level);
    this.elements.profileXp.textContent = `${profile.xp} / ${required}`;
    this.elements.profileMatches.textContent = String(matches);
    this.elements.profileWinrate.textContent = `${winRate}%`;
    if (this.elements.profileAccuracy) {
      this.elements.profileAccuracy.textContent = `${statsSummary.avgAccuracy}%`;
    }
    if (this.elements.profileBestStreak) {
      this.elements.profileBestStreak.textContent = String(statsSummary.bestPuzzleStreak);
    }
  }

  renderMetaProgress() {
    if (!this.progression || !this.elements.achievementsList || !this.elements.questsList) {
      return;
    }
    const achievements = this.progression.getAchievements();
    const quests = this.progression.getQuests();

    this.elements.achievementsList.innerHTML = "";
    achievements.forEach((achievement) => {
      const li = document.createElement("li");
      li.className = achievement.unlocked ? "unlocked" : "locked";
      li.textContent = `${achievement.title} - ${achievement.description}`;
      this.elements.achievementsList.appendChild(li);
    });

    this.elements.questsList.innerHTML = "";
    quests.forEach((quest) => {
      const li = document.createElement("li");
      li.className = quest.completed ? "completed" : "in-progress";
      li.textContent = `${quest.title} (${quest.progress}/${quest.target})`;
      this.elements.questsList.appendChild(li);
    });
  }

  exportProfile() {
    if (!this.progression) {
      return;
    }
    const blob = new Blob([this.progression.exportProfileJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "royal-chess-profile.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    this.render("Profile exported.");
  }

  async importProfile(event) {
    if (!this.progression) {
      return;
    }
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) {
      return;
    }
    try {
      const content = await file.text();
      this.progression.importProfileJson(content);
      this.render("Profile imported.");
    } catch {
      this.render("Import failed. Please choose a valid profile JSON.");
    } finally {
      input.value = "";
    }
  }

  openPromotionPrompt(color) {
    if (!this.elements.promotionModal || !this.elements.promotionChoices) {
      return;
    }
    const choices = ["queen", "rook", "bishop", "knight"];
    this.elements.promotionChoices.innerHTML = "";
    choices.forEach((type) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "promotion-choice-btn";
      button.textContent = PIECE_ICONS[color][type];
      button.title = type[0].toUpperCase() + type.slice(1);
      button.addEventListener("click", () => this.confirmPromotion(type));
      this.elements.promotionChoices.appendChild(button);
    });
    this.elements.promotionModal.classList.remove("hidden");
    this.stateStore.dispatch({ type: "UI/SET_MODAL", payload: { key: "promotion", value: true } });
  }

  closePromotionPrompt() {
    if (!this.elements.promotionModal || !this.elements.promotionChoices) {
      return;
    }
    this.elements.promotionModal.classList.add("hidden");
    this.elements.promotionChoices.innerHTML = "";
    this.stateStore.dispatch({ type: "UI/SET_MODAL", payload: { key: "promotion", value: false } });
  }

  confirmPromotion(type) {
    if (!this.pendingPromotion) {
      this.closePromotionPrompt();
      return;
    }
    const context = this.pendingPromotion;
    this.pendingPromotion = null;
    this.closePromotionPrompt();
    const result = this.commitMove(context, type);
    this.startClock();
    this.render(result.ok ? `Promoted to ${type}.` : result.reason);
    this.playStateSound();
  }

  oppositeColor(color) {
    return color === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE;
  }

  spawnCaptureParticles(row, col, capturedColor) {
    const squareEl = this.squareElements.get(`${row},${col}`);
    const layer = this.elements.particleLayer;
    const frame = this.elements.boardFrame;
    if (!squareEl || !layer || !frame) {
      return;
    }

    const squareRect = squareEl.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const centerX = squareRect.left - frameRect.left + squareRect.width / 2;
    const centerY = squareRect.top - frameRect.top + squareRect.height / 2;
    const baseColor = capturedColor === COLOR.WHITE ? "#f8fafc" : "#111827";

    for (let i = 0; i < 22; i += 1) {
      const particle = document.createElement("span");
      particle.className = "capture-particle";
      const size = 3 + Math.random() * 5;
      const drift = (Math.random() - 0.5) * 70;
      const rise = -20 - Math.random() * 70;
      const fall = 80 + Math.random() * 120;
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.left = `${centerX}px`;
      particle.style.top = `${centerY}px`;
      particle.style.setProperty("--drift", `${drift}px`);
      particle.style.setProperty("--rise", `${rise}px`);
      particle.style.setProperty("--fall", `${fall}px`);
      particle.style.background = baseColor;
      layer.appendChild(particle);
      window.setTimeout(() => particle.remove(), 900);
    }
  }
}
