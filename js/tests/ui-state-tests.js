import { createStateStore } from "../state/store.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run() {
  const store = createStateStore({
    gameState: { turn: "white", status: "in_progress", result: null, ply: 0 },
    uiState: {
      selectedSquare: null,
      legalHighlights: [],
      orientation: "white",
      modals: { promotion: false, gameOver: false }
    },
    metaState: { settings: { autoFlip: false, showEval: true }, profile: null }
  });

  store.dispatch({
    type: "UI/SELECT_SQUARE",
    payload: { selectedSquare: { row: 6, col: 4 }, legalHighlights: [{ row: 4, col: 4 }] }
  });
  assert(store.getState().uiState.selectedSquare?.row === 6, "Square selection should update uiState");

  store.dispatch({ type: "UI/SET_MODAL", payload: { key: "promotion", value: true } });
  assert(store.getState().uiState.modals.promotion === true, "Promotion modal state should toggle");

  store.dispatch({ type: "UI/CLEAR_SELECTION" });
  assert(store.getState().uiState.selectedSquare === null, "Selection clear should reset selectedSquare");
  assert(store.getState().uiState.legalHighlights.length === 0, "Selection clear should reset legalHighlights");

  console.log("UI state tests passed.");
}

run();
