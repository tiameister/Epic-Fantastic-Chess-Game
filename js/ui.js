import { COLOR, EVAL_THRESHOLDS, PIECE_ICONS, STATE } from "./constants.js";
import { PRESETS } from "./presets.js";
import { evaluatePosition, materialScore, scoreToBarPercent } from "./evaluation.js";
import { getTacticalSignal } from "./tactical-eval.js";
import { createStateStore } from "./state/store.js";
import { ChessBoardRenderer } from "./ui/board-renderer.js";
import { ChessClock } from "./ui/chess-clock.js";
import { ChessHistoryManager } from "./ui/chess-history.js";
import { PieceAnimator } from "./ui/piece-animator.js";
import {
  showChessVictory,
  hideChessVictory,
  showChessToast,
  chessResultMeta,
} from "./ui/game-feel.js";

export class ChessUI {
  constructor(engine, elements, sound, progression = null, evaluator = null, training = null, storage = null) {
    this.engine = engine;
    this.elements = elements;
    this.sound = sound;
    this.progression = progression;
    this.evaluator = evaluator;
    this.training = training;
    this.storage = storage;

    // ── Sub-modules ───────────────────────────────────────────────────────
    this.boardRenderer = new ChessBoardRenderer({
      board: elements.board,
      particleLayer: elements.particleLayer,
      boardFrame: elements.boardFrame
    });

    this.clock = new ChessClock(
      {
        whiteTimeLabel: elements.whiteTimeLabel,
        blackTimeLabel: elements.blackTimeLabel,
        pauseClockBtn:  elements.pauseClockBtn,
        timeControl:    elements.timeControl
      },
      engine,
      (loserColor) => {
        this.engine.endByTimeout(loserColor);
        this.render("Time expired.");
      }
    );

    this.history = new ChessHistoryManager(
      {
        historyList:      elements.historyList,
        analysisScrubber: elements.analysisScrubber,
        evalGraph:        elements.evalGraph,
        reviewList:       elements.reviewList
      },
      engine,
      (ply) => {
        // Called by ChessHistoryManager.goTo() after restoring the snapshot.
        this.selected      = null;
        this.legalMoves    = [];
        this.stateStore.dispatch({ type: "UI/CLEAR_SELECTION" });
        this.render(this.history.isViewing ? `Viewing move ${ply}.` : "Back to latest position.");
      }
    );

    this.history.setBadgeFn((label) => this.getQualityBadge(label));

    // ── Animation ─────────────────────────────────────────────────────────
    this.pieceAnimator = new PieceAnimator();

    // ── UI state ──────────────────────────────────────────────────────────
    this.selected       = null;
    this.legalMoves     = [];
    this.orientation    = COLOR.WHITE;
    this.autoFlipEnabled = false;
    this.isEvalVisible  = false;   // Eval hidden by default; Analysis Mode shows it
    this.analysisMode   = false;   // Zen Switch state
    this.lastEvaluationScore = this.evaluateScore();
    this.currentMoveQuality  = "Neutral";
    this.heartbeatLevel = 0;
    this.matchRecorded  = false;
    this.matchStats     = this.createEmptyMatchStats();
    this.lastEvalSnapshot = { score: 0, label: "" };
    this.pendingPromotion = null;
    this.activeTab      = "game";
    this.layoutPreset   = "default";
    this.gamePersisted  = false;
    this._victoryShown  = false;

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
      this.clock.reset();
      this.clock.hasStarted = this.engine.moveHistory.some((move) => move.turn === COLOR.WHITE);
      this.clock.start();
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
      this.elements.toggleEvalBtn.textContent = this.isEvalVisible ? "Hide Eval" : "Eval";
      this.render(this.isEvalVisible ? "Evaluation bar shown." : "Evaluation bar hidden.");
    });

    // Zen Switch — Analysis Mode master toggle
    const analysisModeToggle = document.getElementById("analysisModeToggle");
    if (analysisModeToggle) {
      analysisModeToggle.addEventListener("change", () => {
        this.analysisMode = analysisModeToggle.checked;
        this.elements.chessCard.classList.toggle("analysis-on", this.analysisMode);
        // Keep isEvalVisible in sync so the existing toggle-eval button stays consistent
        this.isEvalVisible = this.analysisMode;
        this.elements.evalPanel.classList.toggle("hidden", !this.isEvalVisible);
        this.render(this.analysisMode ? "Analysis mode on." : "Analysis mode off.");
      });
    }

    // Apply initial eval visibility (hidden by default)
    this.elements.evalPanel.classList.toggle("hidden", !this.isEvalVisible);
    this.elements.pauseClockBtn.addEventListener("click", () => {
      const result = this.clock.toggle();
      if (result) this.render(result === "paused" ? "Clock paused." : "Clock resumed.");
    });
    this.elements.offerDrawBtn.addEventListener("click", () => this.offerDraw());
    this.elements.resignBtn.addEventListener("click", () => this.resignGame());
    this.elements.rematchBtn.addEventListener("click", () => this.rematch());

    this.elements.undoBtn.addEventListener("click", () => {
      if (this.history.isViewing) {
        this.history.goTo(this.history.length - 1);
      }
      const didUndo = this.engine.undo();
      if (!didUndo) {
        this.render("No moves available to undo.");
        return;
      }
      this.history.pop();
      this.clock.popSnapshot();
      this.clock.hasStarted = this.engine.moveHistory.some((m) => m.turn === COLOR.WHITE);
      if (this.autoFlipEnabled) this.orientation = this.engine.turn;
      this.clock.start();
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

    this.elements.historyStartBtn.addEventListener("click", () => this.history.goTo(0));
    this.elements.historyPrevBtn.addEventListener("click", () => this.history.goTo(Math.max(0, this.history.currentPly - 1)));
    this.elements.historyNextBtn.addEventListener("click", () => this.history.goTo(Math.min(this.history.length - 1, this.history.currentPly + 1)));
    this.elements.historyEndBtn.addEventListener("click", () => this.history.goTo(this.history.length - 1));
    this.elements.exportPgnBtn.addEventListener("click", () => this.exportPgn());
    this.elements.importPgnBtn.addEventListener("click", () => this.elements.importPgnInput.click());
    this.elements.importPgnInput.addEventListener("change", (event) => this.importPgn(event));
    this.elements.continueLastBtn.addEventListener("click", () => this.continueLastGame());
    this.elements.savedGamesSearch.addEventListener("input", () => this.renderSavedGames());
    this.elements.analysisScrubber.addEventListener("input", () => {
      this.history.goTo(Number(this.elements.analysisScrubber.value));
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
    this.history.rebuild();
    this.clock.reset();
    this.clock.start();
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
    this.orientation = COLOR.WHITE;
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
    this._victoryShown = false;
    hideChessVictory();
    // Reset captured-piece trays
    if (this.elements.whiteCaptured) this.elements.whiteCaptured.innerHTML = "";
    if (this.elements.blackCaptured) this.elements.blackCaptured.innerHTML = "";
    if (this.elements.whiteAdvantage) this.elements.whiteAdvantage.textContent = "";
    if (this.elements.blackAdvantage) this.elements.blackAdvantage.textContent = "";
    this.closePromotionPrompt();
    this.history.rebuild();
    this.toggleGameOverPanel(false);
    this.renderTrainingStatus();
    this.clock.reset();
    this.clock.start();
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
      case STATE.RESIGN:
        return `${this.colorName(this.engine.winner)} wins by resignation`;
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
    if (this.clock.isPaused) {
      this.setMessage("Clock paused. Resume before making a move.");
      return;
    }
    if (this.pendingPromotion) {
      this.setMessage("Finish pawn promotion first.");
      return;
    }
    if (this.engine.isGameOver()) {
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
      const clockSnapshot = this.clock.snapshot();
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

      // Snapshot source square for Lerp animation (must happen before render rebuilds DOM)
      this.pieceAnimator.prepare(this.elements.board, from.row, from.col);
      if (targetBeforeMove) {
        // Burst-shrink the captured piece before the board rebuilds
        this.pieceAnimator.animateCapture(
          this.elements.board, this.elements.boardFrame, to.row, to.col
        );
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
      this.clock.start();
      this.render(result.ok ? "Move completed." : result.reason);
      this.playStateSound();
      // Play Lerp ghost from old→new square (non-blocking)
      if (result.ok) {
        this.pieceAnimator.play(this.elements.board, this.elements.boardFrame, to.row, to.col);
      }
      return;
    }

    if (clickedPiece && clickedPiece.color === this.engine.turn) {
      this.select(row, col);
      return;
    }

    this.render("Invalid destination. Choose a highlighted move.");
  }

  commitMove(context, promotionType = null) {
    this.history.exitViewIfNeeded();
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
      this.clock.hasStarted = true;
    }
    this.clock.addIncrement(movingSide);
    this.clock.pushSnapshot(clockSnapshot);
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
    this.boardRenderer.applyMoveQualityEffects(moveAssessment);
    if (moveAssessment.isCapture) {
      this.matchStats.captures[movingSide] += 1;
      this.boardRenderer.spawnCaptureParticles(to.row, to.col, targetBeforeMove?.color ?? this.oppositeColor(movingSide));
      if (this.progression) {
        this.progression.recordCapture(1);
      }
    }
    if (this.engine.gameState === STATE.CHECK) {
      this.matchStats.checksGiven[movingSide] += 1;
      showChessToast(`${this.colorName(this.engine.turn)} is in Check!`, "check");
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
    this.history.push(this.engine.getSnapshot());
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
    this.playSound("piecePickup");
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

    // Legacy compat elements (off-screen, kept for JS that still writes to them)
    this.elements.turnLabel.textContent = this.colorName(this.engine.turn);
    this.elements.activeSideBadge.textContent = `${this.colorName(this.engine.turn)} to move`;
    this.elements.activeSideBadge.classList.remove("white", "black");
    this.elements.activeSideBadge.classList.add(this.engine.turn === COLOR.WHITE ? "white" : "black");
    this.elements.stateLabel.textContent = this.statusText();
    this.elements.moveQualityLabel.textContent = this.currentMoveQuality;
    this.elements.moveQualityLabel.className = "quality-label";
    this.elements.moveQualityLabel.classList.add(this.currentMoveQuality.toLowerCase().replace(/\s+/g, "-"));
    this.lastEvalSnapshot = this.getEvaluationSnapshot();

    // New focused UI: narrative bar, player cards, captured pieces
    this._updateNarrative(optionalMessage);
    this._updatePlayerCards();
    this.renderCapturedPieces();
    this.renderProfile();
    this.renderMetaProgress();
    this.history.renderHistory((ply) => this.history.goTo(ply));
    this.history.renderAnalysis();
    this.renderSavedGames();
    this.renderTrainingStatus();
    this.clock.render();
    this.renderEvaluation(this.lastEvalSnapshot);
    this.boardRenderer.render({
      engine:      this.engine,
      selected:    this.selected,
      legalMoves:  this.legalMoves,
      orientation: this.orientation
    });
    // Re-attach click handlers after each board rebuild.
    this._attachBoardClickHandlers();
    this.updateGameOverPanel();
    this.updateCriticalAtmosphere();
    this.sound.updateMood(this.lastEvalSnapshot.score, this.engine.turn);
    this.syncStore();
  }

  _attachBoardClickHandlers() {
    for (const [key, square] of this.boardRenderer.squareElements) {
      const [row, col] = key.split(",").map(Number);
      // Clone with replaceWith to avoid stacking duplicate listeners on reuse.
      // Since renderBoard() rebuilds from scratch each time, squares are always new.
      square.addEventListener("click", () => this.handleSquareClick(row, col));
      square.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.handleSquareClick(row, col);
        }
      });
    }
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
    this.history.rebuild();
    this.toggleGameOverPanel(false);
    this.clock.reset();
    this.clock.start();
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
    this.history.rebuild();
    this.clock.hasStarted = false;
    this.clock.reset();
    this.renderTrainingStatus();
  }

  loadDrillPosition(drill) {
    this.engine.loadFenPlacement(drill.fen, drill.turn, false);
    this.selected = null;
    this.legalMoves = [];
    this.history.rebuild();
    this.clock.hasStarted = false;
    this.clock.reset();
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

  resignGame() {
    if (this.engine.isGameOver()) {
      return;
    }
    const resigningSide = this.engine.turn;
    this.engine.resign(resigningSide);
    this.clock.stop();
    this.playSound("gameOver");
    this.render(`${this.colorName(resigningSide)} resigned.`);
  }

  offerDraw() {
    if (this.engine.isGameOver()) {
      return;
    }
    this.engine.gameState = STATE.DRAW;
    this.engine.winner = null;
    this.engine.drawReason = "Draw agreed (local)";
    this.clock.stop();
    this.playSound("gameOver");
    this.render("Draw agreed.");
  }

  rematch() {
    this.resetGame();
    this.render("Rematch started.");
  }

  updateGameOverPanel() {
    const isGameOver = this.engine.isGameOver();
    // Keep the legacy panel hidden — the rich overlay replaces it
    this.elements.gameOverPanel.classList.add("hidden");
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

    // Populate legacy labels (used by screen-readers / fallback)
    const legacyTexts = {
      [STATE.CHECKMATE]: [`Checkmate`, `${this.colorName(this.engine.winner)} wins the game.`],
      [STATE.RESIGN]:    [`Resignation`, `${this.colorName(this.engine.winner)} wins by resignation.`],
      [STATE.STALEMATE]: [`Stalemate`, `No legal moves remain. It's a draw.`],
      [STATE.DRAW]:      [`Draw`, this.engine.drawReason || "Draw by rule."],
      [STATE.TIMEOUT]:   [`Timeout`, `${this.colorName(this.engine.winner)} wins on time.`],
    };
    const [legacyTitle, legacyText] = legacyTexts[this.engine.gameState] ?? ["Game Over", ""];
    this.elements.gameOverTitle.textContent = legacyTitle;
    this.elements.gameOverText.textContent  = legacyText;

    // Show the rich overlay only once per game-over event
    if (this._victoryShown) return;
    this._victoryShown = true;

    const meta  = chessResultMeta(this.engine.gameState, this.engine.winner);
    const moves = Math.ceil(this.engine.moveHistory.length / 2);
    const caps  = this.matchStats.captures.white + this.matchStats.captures.black;
    const checks = this.matchStats.checksGiven.white + this.matchStats.checksGiven.black;

    showChessVictory({
      ...meta,
      stats: [
        { value: moves,  label: "Moves"    },
        { value: caps,   label: "Captures" },
        { value: checks, label: "Checks"   },
      ],
      onPlayAgain: () => this.resetGame(),
      onAnalyze:   () => {
        const tabBtn = document.querySelector('[data-tab-target="analysis"]');
        tabBtn?.click();
      },
    });
  }

  toggleGameOverPanel(show) {
    this.elements.gameOverPanel.classList.toggle("hidden", !show);
    this.stateStore.dispatch({ type: "UI/SET_MODAL", payload: { key: "gameOver", value: show } });
  }

  renderEvaluation(snapshot = null) {
    const evaluation = snapshot || this.getEvaluationSnapshot();
    const score = evaluation.score;
    const label = score > 0.25 ? "White better" : score < -0.25 ? "Black better" : "Equal";
    const prefix = score > 0 ? "+" : "";
    const shortText = evaluation.label || `${prefix}${score.toFixed(2)} (${label})`;

    // Always update the sidebar score text (used in analysis mode)
    if (this.elements.evalSidebarScore) {
      this.elements.evalSidebarScore.textContent = evaluation.label || `${prefix}${score.toFixed(2)} — ${label}`;
    }

    if (!this.isEvalVisible) return;

    const percent = scoreToBarPercent(score);
    if (window.innerWidth <= 760) {
      this.elements.evalFill.style.width = `${percent}%`;
      this.elements.evalFill.style.height = "100%";
    } else {
      this.elements.evalFill.style.height = `${percent}%`;
      this.elements.evalFill.style.width = "100%";
    }
    this.elements.evalText.textContent = `Eval: ${shortText}`;
  }

  // ─── Narrative bar ──────────────────────────────────────────────────────

  _updateNarrative(contextMessage) {
    const el = this.elements.chessNarrative;
    if (!el) return;
    const turn = this.colorName(this.engine.turn);
    let text, variant = "";

    switch (this.engine.gameState) {
      case STATE.CHECKMATE:
        text = `♚ Checkmate — ${this.colorName(this.engine.winner)} wins`;
        variant = "narrative-done";
        break;
      case STATE.STALEMATE:
        text = "½ Stalemate — Draw";
        variant = "narrative-done";
        break;
      case STATE.DRAW:
        text = `½ Draw — ${this.engine.drawReason || "Rule draw"}`;
        variant = "narrative-done";
        break;
      case STATE.RESIGN:
        text = `${this.colorName(this.engine.winner)} wins by resignation`;
        variant = "narrative-done";
        break;
      case STATE.TIMEOUT:
        text = `⏱ Timeout — ${this.colorName(this.engine.winner)} wins`;
        variant = "narrative-done";
        break;
      case STATE.CHECK:
        text = `⚡ ${turn} is in Check!`;
        variant = "narrative-danger";
        break;
      default: {
        const action = this.selected ? "Choose a highlighted square" : "Select a piece";
        const quality = (this.currentMoveQuality && this.currentMoveQuality !== "Neutral")
          ? ` · ${this.currentMoveQuality}` : "";
        text = `${turn} to move · ${action}${quality}`;
      }
    }

    el.textContent = text;
    el.className = `chess-narrative${variant ? ` ${variant}` : ""}`;
  }

  // ─── Player card active-turn glow ────────────────────────────────────────

  _updatePlayerCards() {
    const white = this.elements.whitePlayerCard;
    const black = this.elements.blackPlayerCard;
    if (!white || !black) return;
    const gameOver = this.engine.isGameOver();
    const isWhite  = this.engine.turn === COLOR.WHITE;
    white.classList.toggle("active-turn", isWhite  && !gameOver);
    black.classList.toggle("active-turn", !isWhite && !gameOver);
  }

  // ─── Captured pieces + material advantage ───────────────────────────────

  getCapturedPieces() {
    const INITIAL = { p: 8, r: 2, n: 2, b: 2, q: 1 };
    const current  = { white: {}, black: {} };
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.engine.getPiece(r, c, this.engine.board);
        if (!piece || piece.type === "k") continue;
        const col = piece.color;
        current[col][piece.type] = (current[col][piece.type] || 0) + 1;
      }
    }
    // captured[capturer] = pieces removed from the opponent's starting set
    // white captured black pieces → captured.white = missing black pieces
    // black captured white pieces → captured.black = missing white pieces
    const captured = { white: {}, black: {} };
    for (const [type, startCount] of Object.entries(INITIAL)) {
      const whiteMissing = startCount - (current.white[type] || 0);
      const blackMissing = startCount - (current.black[type] || 0);
      if (whiteMissing > 0) captured.black[type] = (captured.black[type] || 0) + whiteMissing;
      if (blackMissing > 0) captured.white[type] = (captured.white[type] || 0) + blackMissing;
    }
    return captured;
  }

  renderCapturedPieces() {
    const whiteTray = this.elements.whiteCaptured;
    const blackTray = this.elements.blackCaptured;
    const whiteAdv  = this.elements.whiteAdvantage;
    const blackAdv  = this.elements.blackAdvantage;
    if (!whiteTray || !blackTray) return;

    const VALS = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    // Icons: pieces captured by white = black pieces (shown with black piece icons)
    // Icons: pieces captured by black = white pieces (shown with white piece icons)
    const ICONS = {
      white: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕" },
      black: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛" }
    };
    const ORDER = ["q", "r", "b", "n", "p"];

    const captured = this.getCapturedPieces();

    const buildTray = (trayEl, capturer, iconColor) => {
      trayEl.innerHTML = "";
      let totalValue = 0;
      for (const type of ORDER) {
        const count = captured[capturer][type] || 0;
        if (!count) continue;
        totalValue += (VALS[type] || 0) * count;
        for (let i = 0; i < count; i++) {
          const span = document.createElement("span");
          span.className = "chess-captured-piece";
          span.textContent = ICONS[iconColor][type];
          trayEl.appendChild(span);
        }
      }
      return totalValue;
    };

    const whiteValue = buildTray(whiteTray, "white", "black"); // black pieces white captured
    const blackValue = buildTray(blackTray, "black", "white"); // white pieces black captured
    const diff = whiteValue - blackValue;

    if (whiteAdv) whiteAdv.textContent = diff > 0  ? `+${diff}`  : "";
    if (blackAdv) blackAdv.textContent = diff < 0  ? `+${-diff}` : "";
  }

  getEvaluationSnapshot() {
    if (this.engine.gameState === STATE.CHECKMATE || this.engine.gameState === STATE.RESIGN) {
      if (this.engine.winner === COLOR.WHITE) {
        return { score: 10, label: this.engine.gameState === STATE.RESIGN ? "Resignation - White wins" : "Mate - White wins" };
      }
      return { score: -10, label: this.engine.gameState === STATE.RESIGN ? "Resignation - Black wins" : "Mate - Black wins" };
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
            this.history.push(this.engine.getSnapshot());
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
      this.history.push(this.engine.getSnapshot());
    }
    this.render("Continued last saved game.");
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
        this.elements.pauseClockBtn.click();
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
    if (this.engine.isGameOver()) {
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
    if (delta <= EVAL_THRESHOLDS.BLUNDER) {
      label = "Blunder";
    } else if (delta >= EVAL_THRESHOLDS.GREAT) {
      label = "Great Move";
    } else if (absolute >= EVAL_THRESHOLDS.WINNING) {
      label = "Winning Advantage";
    } else if (delta >= EVAL_THRESHOLDS.GOOD) {
      label = "Good Move";
    } else if (delta <= EVAL_THRESHOLDS.MISTAKE) {
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
    this.clock.start();
    this.render(result.ok ? `Promoted to ${type}.` : result.reason);
    this.playStateSound();
  }

  oppositeColor(color) {
    return color === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE;
  }
}
