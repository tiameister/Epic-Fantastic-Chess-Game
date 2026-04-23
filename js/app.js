import { ChessEngine } from "./chess-engine.js";
import { ChessUI } from "./ui.js";
import { GameSound } from "./sound.js";
import { ProgressionSystem } from "./systems/progression-system.js";
import { EvaluationAdapter } from "./engine/evaluator.js";
import { TrainingSystem } from "./training/training-system.js";
import { GameStorage } from "./persistence/game-storage.js";

const elements = {
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
ui.init();
