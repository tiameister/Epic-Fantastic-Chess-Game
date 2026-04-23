import { COLOR } from "../constants.js";

const OPENING_LINES = [
  {
    id: "italian-mainline",
    name: "Italian Mainline",
    moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5"]
  },
  {
    id: "queens-gambit",
    name: "Queen's Gambit",
    moves: ["d2d4", "d7d5", "c2c4", "e7e6"]
  }
];

const PUZZLES = [
  {
    id: "mate-in-one-queen",
    name: "Mate in 1",
    fen: "6k1/5ppp/8/8/8/8/5PPP/6KQ",
    turn: COLOR.WHITE,
    goalUci: "h1h7",
    goalText: "White to move: deliver mate in 1."
  },
  {
    id: "win-rook",
    name: "Win Material",
    fen: "6k1/8/8/8/8/8/4r3/4K2R",
    turn: COLOR.WHITE,
    goalUci: "h1e1",
    goalText: "White to move: win the rook."
  }
];

const ENDGAME_DRILLS = [
  {
    id: "kpk-opposition",
    name: "K+P Opposition",
    fen: "8/8/8/4k3/4P3/4K3/8/8",
    turn: COLOR.WHITE,
    objective: "Convert with opposition and promote."
  },
  {
    id: "ladder-mate",
    name: "Rook Ladder Mate",
    fen: "6k1/8/8/8/8/8/6RR/6K1",
    turn: COLOR.WHITE,
    objective: "Coordinate rooks to force mate."
  }
];

export class TrainingSystem {
  constructor() {
    this.mode = "off";
    this.openingIndex = 0;
    this.activeOpening = OPENING_LINES[0];
    this.puzzleIndex = 0;
    this.streak = 0;
    this.drillIndex = 0;
  }

  getCurrentPuzzle() {
    return PUZZLES[this.puzzleIndex % PUZZLES.length];
  }

  getCurrentDrill() {
    return ENDGAME_DRILLS[this.drillIndex % ENDGAME_DRILLS.length];
  }

  nextPuzzle() {
    this.puzzleIndex = (this.puzzleIndex + 1) % PUZZLES.length;
    return this.getCurrentPuzzle();
  }

  nextDrill() {
    this.drillIndex = (this.drillIndex + 1) % ENDGAME_DRILLS.length;
    return this.getCurrentDrill();
  }
}
