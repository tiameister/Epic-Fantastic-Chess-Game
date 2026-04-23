import { ChessEngine } from "./chess-engine.js";
import { ChessUI } from "./ui.js";
import { GameSound } from "./sound.js";
import { ProgressionSystem } from "./systems/progression-system.js";
import { EvaluationAdapter } from "./engine/evaluator.js";

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
  achievementsList: document.getElementById("achievementsList"),
  questsList: document.getElementById("questsList"),
  historyList: document.getElementById("historyList"),
  historyStartBtn: document.getElementById("historyStartBtn"),
  historyPrevBtn: document.getElementById("historyPrevBtn"),
  historyNextBtn: document.getElementById("historyNextBtn"),
  historyEndBtn: document.getElementById("historyEndBtn"),
  presetSelect: document.getElementById("presetSelect"),
  timeControl: document.getElementById("timeControl"),
  themeSelect: document.getElementById("themeSelect"),
  autoFlipToggle: document.getElementById("autoFlipToggle"),
  flipBtn: document.getElementById("flipBtn"),
  toggleEvalBtn: document.getElementById("toggleEvalBtn"),
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
  reviewList: document.getElementById("reviewList")
};

const engine = new ChessEngine();
const sound = new GameSound();
const progression = new ProgressionSystem();
const evaluator = new EvaluationAdapter();
const ui = new ChessUI(engine, elements, sound, progression, evaluator);
ui.init();
