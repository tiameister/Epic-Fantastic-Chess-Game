import { ChessEngine } from "./chess-engine.js";
import { ChessUI } from "./ui.js";
import { GameSound } from "./sound.js";
import { BackgammonEngine } from "./backgammon-engine.js";
import { BackgammonUI } from "./backgammon-ui.js";
import { ProgressionSystem } from "./systems/progression-system.js";
import { EvaluationAdapter } from "./engine/evaluator.js";
import { TrainingSystem } from "./training/training-system.js";
import { GameStorage } from "./persistence/game-storage.js";

const elements = {
  gameChooser: document.getElementById("gameChooser"),
  chooseChessBtn: document.getElementById("chooseChessBtn"),
  chooseBackgammonBtn: document.getElementById("chooseBackgammonBtn"),
  chessCard: document.getElementById("chessCard"),
  backgammonCard: document.getElementById("backgammonCard"),
  backToChooserBtn: document.getElementById("backToChooserBtn"),
  backgammonRollBtn: document.getElementById("backgammonRollBtn"),
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
  backgammonScore: document.getElementById("backgammonScore"),
  backgammonCube: document.getElementById("backgammonCube"),
  backgammonDice: document.getElementById("backgammonDice"),
  backgammonBoard: document.getElementById("backgammonBoard"),
  backgammonBar: document.getElementById("backgammonBar"),
  backgammonOff: document.getElementById("backgammonOff"),
  backgammonHints: document.getElementById("backgammonHints"),
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
  tabQuestsBtn: document.getElementById("tabQuestsBtn")
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
ui.init();
backgammonUI.init();

function showChooser() {
  elements.gameChooser.classList.remove("hidden");
  elements.chessCard.classList.add("hidden");
  elements.backgammonCard.classList.add("hidden");
  backgammonUI.setActive(false);
}

function showChess() {
  elements.gameChooser.classList.add("hidden");
  elements.backgammonCard.classList.add("hidden");
  elements.chessCard.classList.remove("hidden");
  backgammonUI.setActive(false);
}

function showBackgammon() {
  elements.gameChooser.classList.add("hidden");
  elements.chessCard.classList.add("hidden");
  elements.backgammonCard.classList.remove("hidden");
  backgammonUI.setActive(true);
  backgammonUI.render();
}

elements.chooseChessBtn.addEventListener("click", showChess);
elements.chooseBackgammonBtn.addEventListener("click", showBackgammon);
elements.backToChooserBtn.addEventListener("click", showChooser);

showChooser();
