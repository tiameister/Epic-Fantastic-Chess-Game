import { COLOR } from "./constants.js";

export const PRESETS = {
  standard: {
    id: "standard",
    name: "Standard Start",
    turn: COLOR.WHITE,
    fenPlacement: null
  },
  italian: {
    id: "italian",
    name: "Italian Game",
    turn: COLOR.BLACK,
    fenPlacement: "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R"
  },
  sicilian: {
    id: "sicilian",
    name: "Sicilian Defense",
    turn: COLOR.BLACK,
    fenPlacement: "rnbqkbnr/pp2pppp/3p4/2pp4/4P3/3P4/PPP2PPP/RNBQKBNR"
  },
  endgame: {
    id: "endgame",
    name: "King + Pawns Endgame",
    turn: COLOR.WHITE,
    fenPlacement: "8/3k4/2p5/3p4/3P4/2P5/4K3/8"
  }
};
