import { COLOR, PIECE_ICONS, STATE } from "./constants.js";
import { PRESETS } from "./presets.js";
import { evaluatePosition, materialScore, scoreToBarPercent } from "./evaluation.js";
import { getTacticalSignal } from "./tactical-eval.js";

export class ChessUI {
  constructor(engine, elements, sound, progression = null) {
    this.engine = engine;
    this.elements = elements;
    this.sound = sound;
    this.progression = progression;
    this.selected = null;
    this.legalMoves = [];
    this.orientation = COLOR.WHITE;
    this.autoFlipEnabled = false;
    this.timerId = null;
    this.hasClockStarted = false;
    this.isUntimed = false;
    this.incrementSeconds = 0;
    this.timeRemaining = {
      white: 600,
      black: 600
    };
    this.clockSnapshotHistory = [];
    this.isEvalVisible = true;
    this.lastEvaluationScore = evaluatePosition(this.engine);
    this.currentMoveQuality = "Neutral";
    this.heartbeatLevel = 0;
    this.squareElements = new Map();
    this.matchRecorded = false;
    this.matchStats = this.createEmptyMatchStats();
    this.lastEvalSnapshot = { score: 0, label: "" };
  }

  init() {
    this.elements.themeSelect.addEventListener("change", () => {
      this.applyTheme(this.elements.themeSelect.value);
      this.render("Theme updated.");
    });

    this.elements.presetSelect.addEventListener("change", () => {
      this.applyPreset(this.elements.presetSelect.value);
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
      this.render(this.autoFlipEnabled ? "Auto flip enabled." : "Auto flip disabled.");
    });

    this.elements.flipBtn.addEventListener("click", () => {
      this.orientation = this.orientation === COLOR.WHITE ? COLOR.BLACK : COLOR.WHITE;
      this.render("Board orientation changed.");
    });

    this.elements.toggleEvalBtn.addEventListener("click", () => {
      this.isEvalVisible = !this.isEvalVisible;
      this.elements.evalPanel.classList.toggle("hidden", !this.isEvalVisible);
      this.elements.toggleEvalBtn.textContent = this.isEvalVisible ? "Hide Eval" : "Show Eval";
      this.render(this.isEvalVisible ? "Evaluation bar shown." : "Evaluation bar hidden.");
    });

    this.elements.undoBtn.addEventListener("click", () => {
      const didUndo = this.engine.undo();
      if (!didUndo) {
        this.render("No moves available to undo.");
        return;
      }
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
      this.playSound("move");
      this.render("Last move undone.");
    });

    this.elements.resetBtn.addEventListener("click", () => {
      this.resetGame();
    });

    this.elements.playAgainBtn.addEventListener("click", () => {
      this.resetGame();
    });

    this.applyTheme(this.elements.themeSelect.value);
    this.resetClocks();
    this.startClock();
    this.renderProfile();
    this.renderMetaProgress();
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
    this.currentMoveQuality = "Neutral";
    this.lastEvaluationScore = evaluatePosition(this.engine);
    this.sound.stopHeartbeat();
    this.sound.stopRhythm();
    this.heartbeatLevel = 0;
    this.elements.boardFrame.classList.remove("critical", "blunder-hit", "glitch-hit");
    this.matchRecorded = false;
    this.matchStats = this.createEmptyMatchStats();
    this.toggleGameOverPanel(false);
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

  statusText() {
    switch (this.engine.gameState) {
      case STATE.CHECK:
        return `${this.colorName(this.engine.turn)} in Check`;
      case STATE.CHECKMATE:
        return `Checkmate - ${this.colorName(this.engine.winner)} wins`;
      case STATE.STALEMATE:
        return "Stalemate - Draw";
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
    if (
      this.engine.gameState === STATE.CHECKMATE
      || this.engine.gameState === STATE.STALEMATE
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
      const scoreBefore = evaluatePosition(this.engine);
      const materialBefore = materialScore(this.engine.board);
      const chosen = this.legalMoves.find((m) => m.row === row && m.col === col);
      const targetBeforeMove = this.engine.getPiece(row, col, this.engine.board);
      const result = this.engine.move(this.selected, { row, col });
      this.selected = null;
      this.legalMoves = [];
      if (result.ok) {
        if (movingSide === COLOR.WHITE) {
          this.hasClockStarted = true;
        }
        if (!this.isUntimed && this.incrementSeconds > 0) {
          this.timeRemaining[movingSide] += this.incrementSeconds;
        }
        this.clockSnapshotHistory.push(clockSnapshot);
        const scoreAfter = evaluatePosition(this.engine);
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
        if (moveAssessment.label === "Blunder") {
          this.matchStats.blunders[movingSide] += 1;
        }
        this.playMoveSound(chosen, moveAssessment);
        this.applyMoveQualityEffects(moveAssessment);
        if (moveAssessment.isCapture) {
          this.matchStats.captures[movingSide] += 1;
          this.spawnCaptureParticles(row, col, targetBeforeMove?.color ?? this.oppositeColor(movingSide));
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
          this.progression.recordMoveQuality(moveAssessment.label);
        }
        if (this.autoFlipEnabled) {
          this.orientation = this.engine.turn;
        }
        this.lastEvaluationScore = scoreAfter;
        this.awardMoveXp(moveAssessment);
      }
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

  select(row, col) {
    this.selected = { row, col };
    this.legalMoves = this.engine.getLegalMoves(row, col);
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
    this.renderTimers();
    this.renderEvaluation(this.lastEvalSnapshot);
    this.renderBoard();
    this.updateGameOverPanel();
    this.updateCriticalAtmosphere();
    this.sound.updateMood(this.lastEvalSnapshot.score, this.engine.turn);
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
    this.clockSnapshotHistory = [];
    this.hasClockStarted = false;
    this.orientation = this.autoFlipEnabled ? this.engine.turn : COLOR.WHITE;
    this.currentMoveQuality = "Neutral";
    this.lastEvaluationScore = evaluatePosition(this.engine);
    this.sound.stopHeartbeat();
    this.sound.stopRhythm();
    this.heartbeatLevel = 0;
    this.elements.boardFrame.classList.remove("critical", "blunder-hit", "glitch-hit");
    this.matchStats = this.createEmptyMatchStats();
    this.toggleGameOverPanel(false);
    this.resetClocks();
    this.startClock();
    this.playSound("move");
    this.render(`${preset.name} loaded.`);
  }

  applyTheme(themeName) {
    document.body.dataset.theme = themeName || "default";
  }

  resetClocks() {
    const [baseValue, incrementValue] = String(this.elements.timeControl.value || "600|0").split("|");
    const baseSeconds = Number(baseValue);
    this.incrementSeconds = Number(incrementValue || 0);
    this.isUntimed = baseSeconds <= 0;
    this.timeRemaining.white = baseSeconds;
    this.timeRemaining.black = baseSeconds;
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
      || this.engine.gameState === STATE.TIMEOUT
    ) {
      return;
    }

    this.timerId = window.setInterval(() => {
      const side = this.engine.turn;
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

  updateGameOverPanel() {
    const isGameOver = (
      this.engine.gameState === STATE.CHECKMATE
      || this.engine.gameState === STATE.STALEMATE
      || this.engine.gameState === STATE.TIMEOUT
    );
    this.toggleGameOverPanel(isGameOver);
    if (!isGameOver) {
      return;
    }
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
    this.elements.gameOverTitle.textContent = "Timeout";
    this.elements.gameOverText.textContent = `${this.colorName(this.engine.winner)} wins on time.`;
  }

  toggleGameOverPanel(show) {
    this.elements.gameOverPanel.classList.toggle("hidden", !show);
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
    if (this.engine.gameState === STATE.TIMEOUT) {
      if (this.engine.winner === COLOR.WHITE) {
        return { score: 10, label: "Timeout - White wins" };
      }
      return { score: -10, label: "Timeout - Black wins" };
    }

    let score = evaluatePosition(this.engine);
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
      li.textContent = `${prefix} ${move.notation}`;
      this.elements.historyList.appendChild(li);
    });
    this.elements.historyList.scrollTop = this.elements.historyList.scrollHeight;
  }

  renderBoard() {
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
        boardEl.appendChild(square);
        this.squareElements.set(`${row},${col}`, square);
      }
    }
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
    const evalScore = evaluatePosition(this.engine);
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
    const level = profile.level;
    const required = this.progression.xpRequired(level);
    const matches = profile.matchesPlayed;
    const wins = profile.wins.white + profile.wins.black;
    const winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;

    this.elements.profileLevel.textContent = String(level);
    this.elements.profileXp.textContent = `${profile.xp} / ${required}`;
    this.elements.profileMatches.textContent = String(matches);
    this.elements.profileWinrate.textContent = `${winRate}%`;
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
