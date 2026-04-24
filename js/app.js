import { ChessEngine } from "./chess-engine.js";
import { ChessUI } from "./ui.js";
import { GameSound } from "./sound.js";
import { BackgammonEngine } from "./backgammon-engine.js";
import { BackgammonUI } from "./backgammon-ui.js";
import { BlackjackEngine } from "./blackjack-engine.js";
import { BlackjackUI } from "./blackjack-ui.js";
import { ProgressionSystem } from "./systems/progression-system.js";
import { EvaluationAdapter } from "./engine/evaluator.js";
import { TrainingSystem } from "./training/training-system.js";
import { GameStorage } from "./persistence/game-storage.js";
import { showMatchSplash } from "./ui/game-feel.js";

const elements = {
  gameChooser: document.getElementById("gameChooser"),
  chooseChessBtn: document.getElementById("chooseChessBtn"),
  chooseBackgammonBtn: document.getElementById("chooseBackgammonBtn"),
  chooseBlackjackBtn: document.getElementById("chooseBlackjackBtn"),
  chessBackToChooserBtn: document.getElementById("chessBackToChooserBtn"),
  chessCard: document.getElementById("chessCard"),
  backgammonCard: document.getElementById("backgammonCard"),
  blackjackCard: document.getElementById("blackjackCard"),
  backToChooserBtn: document.getElementById("backToChooserBtn"),
  // ── Blackjack elements ────────────────────────────────────────────────────
  bjLobby: document.getElementById("bjLobby"),
  bjGameArea: document.getElementById("bjGameArea"),
  bjShoe: document.getElementById("bjShoe"),
  bjShoeIndicator: document.getElementById("bjShoeIndicator"),
  bjDealerHand: document.getElementById("bjDealerHand"),
  bjDealerValue: document.getElementById("bjDealerValue"),
  bjPlayerSeats: document.getElementById("bjPlayerSeats"),
  bjChipsDisplay: document.getElementById("bjChipsDisplay"),
  bjBetAmount: document.getElementById("bjBetAmount"),
  bjBetPlayerLabel: document.getElementById("bjBetPlayerLabel"),
  bjBalance: document.getElementById("bjBalance"),
  bjChipSelector: document.getElementById("bjChipSelector"),
  bjBettingControls: document.getElementById("bjBettingControls"),
  bjActionControls: document.getElementById("bjActionControls"),
  bjClearBetBtn: document.getElementById("bjClearBetBtn"),
  bjNextPlayerBtn: document.getElementById("bjNextPlayerBtn"),
  bjHitBtn: document.getElementById("bjHitBtn"),
  bjStandBtn: document.getElementById("bjStandBtn"),
  bjDoubleBtn: document.getElementById("bjDoubleBtn"),
  bjSplitBtn: document.getElementById("bjSplitBtn"),
  bjStatus: document.getElementById("bjStatus"),
  bjOutcomeOverlay: document.getElementById("bjOutcomeOverlay"),
  bjOutcomeTitle: document.getElementById("bjOutcomeTitle"),
  bjOutcomeDetail: document.getElementById("bjOutcomeDetail"),
  bjOutcomePlayerResults: document.getElementById("bjOutcomePlayerResults"),
  bjNextRoundBtn: document.getElementById("bjNextRoundBtn"),
  bjBackToChooserBtn: document.getElementById("bjBackToChooserBtn"),
  bjNewShoeBtn: document.getElementById("bjNewShoeBtn"),
  bjConfettiCanvas: document.getElementById("bjConfettiCanvas"),
  bjChallengesPanel: document.getElementById("bjChallengesPanel"),
  bjOutcomeStreak: document.getElementById("bjOutcomeStreak"),
  bjOutcomeBonus: document.getElementById("bjOutcomeBonus"),
  backgammonRollBtn: document.getElementById("backgammonRollBtn"),
  backgammonUndoBtn: document.getElementById("backgammonUndoBtn"),
  backgammonLangToggle: document.getElementById("backgammonLangToggle"),
  backgammonDoublingToggle: document.getElementById("backgammonDoublingToggle"),
  backgammonCheatWhiteToggle: document.getElementById("backgammonCheatWhiteToggle"),
  backgammonDoubleBtn: document.getElementById("backgammonDoubleBtn"),
  backgammonAcceptDoubleBtn: document.getElementById("backgammonAcceptDoubleBtn"),
  backgammonRejectDoubleBtn: document.getElementById("backgammonRejectDoubleBtn"),
  backgammonResetBtn: document.getElementById("backgammonResetBtn"),
  backgammonStatus: document.getElementById("backgammonStatus"),
  backgammonCallout: document.getElementById("backgammonCallout"),
  backgammonToast: document.getElementById("backgammonToast"),
  backgammonAdCard: document.getElementById("backgammonAdCard"),
  backgammonAdCloseBtn: document.getElementById("backgammonAdCloseBtn"),
  backgammonAdContinueBtn: document.getElementById("backgammonAdContinueBtn"),
  backgammonScore: document.getElementById("backgammonScore"),
  backgammonCube: document.getElementById("backgammonCube"),
  backgammonDice: document.getElementById("backgammonDice"),
  backgammonBoard: document.getElementById("backgammonBoard"),
  backgammonBar: document.getElementById("backgammonBar"),
  backgammonOff: document.getElementById("backgammonOff"),
  backgammonHints: document.getElementById("backgammonHints"),
  backgammonGameOverModal: document.getElementById("backgammonGameOverModal"),
  backgammonGameOverTitle: document.getElementById("backgammonGameOverTitle"),
  backgammonGameOverText: document.getElementById("backgammonGameOverText"),
  backgammonGameOverFlavor: document.getElementById("backgammonGameOverFlavor"),
  backgammonNewRoundBtn: document.getElementById("backgammonNewRoundBtn"),
  board: document.getElementById("board"),
  turnLabel: document.getElementById("turnLabel"),
  activeSideBadge: document.getElementById("activeSideBadge"),
  stateLabel: document.getElementById("stateLabel"),
  moveQualityLabel: document.getElementById("moveQualityLabel"),
  messageLabel: document.getElementById("messageLabel"),
  whiteTimeLabel: document.getElementById("whiteTimeLabel"),
  blackTimeLabel: document.getElementById("blackTimeLabel"),
  profileLevel: document.getElementById("profileLevel"),
  profileXp: document.getElementById("profileXp"),
  profileMatches: document.getElementById("profileMatches"),
  profileWinrate: document.getElementById("profileWinrate"),
  profileAccuracy: document.getElementById("profileAccuracy"),
  profileBestStreak: document.getElementById("profileBestStreak"),
  exportProfileBtn: document.getElementById("exportProfileBtn"),
  importProfileBtn: document.getElementById("importProfileBtn"),
  importProfileInput: document.getElementById("importProfileInput"),
  achievementsList: document.getElementById("achievementsList"),
  questsList: document.getElementById("questsList"),
  historyList: document.getElementById("historyList"),
  exportPgnBtn: document.getElementById("exportPgnBtn"),
  importPgnBtn: document.getElementById("importPgnBtn"),
  continueLastBtn: document.getElementById("continueLastBtn"),
  importPgnInput: document.getElementById("importPgnInput"),
  historyStartBtn: document.getElementById("historyStartBtn"),
  historyPrevBtn: document.getElementById("historyPrevBtn"),
  historyNextBtn: document.getElementById("historyNextBtn"),
  historyEndBtn: document.getElementById("historyEndBtn"),
  presetSelect: document.getElementById("presetSelect"),
  layoutPreset: document.getElementById("layoutPreset"),
  timeControl: document.getElementById("timeControl"),
  themeSelect: document.getElementById("themeSelect"),
  autoFlipToggle: document.getElementById("autoFlipToggle"),
  flipBtn: document.getElementById("flipBtn"),
  toggleEvalBtn: document.getElementById("toggleEvalBtn"),
  pauseClockBtn: document.getElementById("pauseClockBtn"),
  offerDrawBtn: document.getElementById("offerDrawBtn"),
  resignBtn: document.getElementById("resignBtn"),
  rematchBtn: document.getElementById("rematchBtn"),
  undoBtn: document.getElementById("undoBtn"),
  resetBtn: document.getElementById("resetBtn"),
  evalPanel: document.getElementById("evalPanel"),
  evalFill: document.getElementById("evalFill"),
  evalText: document.getElementById("evalText"),
  boardFrame: document.getElementById("boardFrame"),
  particleLayer: document.getElementById("particleLayer"),
  gameOverPanel: document.getElementById("gameOverPanel"),
  gameOverTitle: document.getElementById("gameOverTitle"),
  gameOverText: document.getElementById("gameOverText"),
  playAgainBtn: document.getElementById("playAgainBtn"),
  promotionModal: document.getElementById("promotionModal"),
  promotionChoices: document.getElementById("promotionChoices"),
  drawOfferModal: document.getElementById("drawOfferModal"),
  drawOfferText: document.getElementById("drawOfferText"),
  drawOfferAcceptBtn: document.getElementById("drawOfferAcceptBtn"),
  drawOfferDeclineBtn: document.getElementById("drawOfferDeclineBtn"),
  analysisScrubber: document.getElementById("analysisScrubber"),
  evalGraph: document.getElementById("evalGraph"),
  reviewList: document.getElementById("reviewList"),
  savedGamesSearch: document.getElementById("savedGamesSearch"),
  savedGamesList: document.getElementById("savedGamesList"),
  trainingOffBtn: document.getElementById("trainingOffBtn"),
  openingTrainerBtn: document.getElementById("openingTrainerBtn"),
  puzzleModeBtn: document.getElementById("puzzleModeBtn"),
  endgameDrillBtn: document.getElementById("endgameDrillBtn"),
  nextTrainingBtn: document.getElementById("nextTrainingBtn"),
  trainingStatusText: document.getElementById("trainingStatusText"),
  trainingStreakText: document.getElementById("trainingStreakText"),
  tabGameBtn: document.getElementById("tabGameBtn"),
  tabAnalysisBtn: document.getElementById("tabAnalysisBtn"),
  tabProfileBtn: document.getElementById("tabProfileBtn"),
  tabQuestsBtn: document.getElementById("tabQuestsBtn"),
  chessCard: document.getElementById("chessCard"),
  whiteCaptured: document.getElementById("whiteCaptured"),
  blackCaptured: document.getElementById("blackCaptured"),
  whiteAdvantage: document.getElementById("whiteAdvantage"),
  blackAdvantage: document.getElementById("blackAdvantage"),
  whitePlayerCard: document.getElementById("whitePlayerCard"),
  blackPlayerCard: document.getElementById("blackPlayerCard"),
  chessNarrative: document.getElementById("chessNarrative"),
  evalSidebarScore: document.getElementById("evalSidebarScore")
};

const engine = new ChessEngine();
const sound = new GameSound();
const progression = new ProgressionSystem();
const evaluator = new EvaluationAdapter();
const training = new TrainingSystem();
const storage = new GameStorage();
const ui = new ChessUI(engine, elements, sound, progression, evaluator, training, storage);
const backgammonEngine = new BackgammonEngine();
const backgammonUI = new BackgammonUI(backgammonEngine, elements);
const blackjackEnabled = Boolean(elements.blackjackCard && elements.chooseBlackjackBtn);
const blackjackEngine = blackjackEnabled ? new BlackjackEngine() : null;
const blackjackUI = blackjackEnabled ? new BlackjackUI(blackjackEngine, elements, sound) : null;
ui.init();
backgammonUI.init();
if (blackjackUI) blackjackUI.init();

function showChooser() {
  elements.gameChooser.classList.remove("hidden");
  elements.chessCard.classList.add("hidden");
  elements.backgammonCard.classList.add("hidden");
  if (elements.blackjackCard) elements.blackjackCard.classList.add("hidden");
  backgammonUI.setActive(false);
  if (blackjackUI) blackjackUI.setActive(false);
}

function showChess() {
  elements.gameChooser.classList.add("hidden");
  elements.backgammonCard.classList.add("hidden");
  if (elements.blackjackCard) elements.blackjackCard.classList.add("hidden");
  elements.chessCard.classList.remove("hidden");
  backgammonUI.setActive(false);
  if (blackjackUI) blackjackUI.setActive(false);
  showMatchSplash("Royal Chess", "Local Two-Player");
}

function showBackgammon() {
  elements.gameChooser.classList.add("hidden");
  elements.chessCard.classList.add("hidden");
  if (elements.blackjackCard) elements.blackjackCard.classList.add("hidden");
  elements.backgammonCard.classList.remove("hidden");
  backgammonUI.setActive(true);
  if (blackjackUI) blackjackUI.setActive(false);
  backgammonUI.render();
  showMatchSplash("KOF KIRAATHANE", "Mahalle Tavla Masasi");
}

function showBlackjack() {
  if (!blackjackUI || !elements.blackjackCard) {
    return;
  }
  elements.gameChooser.classList.add("hidden");
  elements.chessCard.classList.add("hidden");
  elements.backgammonCard.classList.add("hidden");
  elements.blackjackCard.classList.remove("hidden");
  backgammonUI.setActive(false);
  blackjackUI.setActive(true);
  showMatchSplash("Royal 21", "Six-Deck Blackjack");
}

elements.chooseChessBtn.addEventListener("click", showChess);
elements.chooseBackgammonBtn.addEventListener("click", showBackgammon);
if (elements.chooseBlackjackBtn) elements.chooseBlackjackBtn.addEventListener("click", showBlackjack);
if (elements.chessBackToChooserBtn) elements.chessBackToChooserBtn.addEventListener("click", showChooser);
if (elements.backToChooserBtn) elements.backToChooserBtn.addEventListener("click", showChooser);
if (elements.bjBackToChooserBtn) elements.bjBackToChooserBtn.addEventListener("click", showChooser);

showChooser();

// ── Startup Splash ───────────────────────────────────────────────────────────
(function initStartupSplash() {
  const splash  = document.getElementById("startupSplash");
  const chooser = elements.gameChooser;
  if (!splash) {
    // No splash element — reveal the chooser immediately.
    chooser.classList.remove("hidden");
    return;
  }

  function dismiss() {
    if (splash.classList.contains("leaving")) return; // guard double-fire
    splash.classList.add("leaving");
    // Reveal game chooser as soon as the splash starts its exit animation.
    chooser.classList.remove("hidden");
    splash.addEventListener("animationend", () => splash.remove(), { once: true });
    // Fallback: remove splash even if animationend never fires (e.g. prefers-reduced-motion).
    setTimeout(() => splash.remove(), 1000);
  }

  // Click / tap anywhere to skip the intro; auto-dismiss after 2.8 s.
  splash.addEventListener("click", dismiss, { once: true });
  setTimeout(dismiss, 2800);
}());
