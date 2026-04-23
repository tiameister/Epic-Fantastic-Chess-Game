export function createStateStore(initialState) {
  let state = structuredClone(initialState);
  const listeners = new Set();

  const notify = () => {
    listeners.forEach((listener) => listener(state));
  };

  return {
    getState() {
      return state;
    },
    dispatch(action) {
      state = rootReducer(state, action);
      notify();
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

function rootReducer(state, action) {
  return {
    gameState: gameReducer(state.gameState, action),
    uiState: uiReducer(state.uiState, action),
    metaState: metaReducer(state.metaState, action)
  };
}

function gameReducer(state, action) {
  if (action.type === "GAME/SYNC") {
    return {
      ...state,
      ...action.payload
    };
  }
  return state;
}

function uiReducer(state, action) {
  switch (action.type) {
    case "UI/SELECT_SQUARE":
      return {
        ...state,
        selectedSquare: action.payload.selectedSquare,
        legalHighlights: action.payload.legalHighlights
      };
    case "UI/CLEAR_SELECTION":
      return {
        ...state,
        selectedSquare: null,
        legalHighlights: []
      };
    case "UI/SET_ORIENTATION":
      return {
        ...state,
        orientation: action.payload
      };
    case "UI/SET_MODAL":
      return {
        ...state,
        modals: {
          ...state.modals,
          [action.payload.key]: action.payload.value
        }
      };
    default:
      return state;
  }
}

function metaReducer(state, action) {
  if (action.type === "META/SYNC") {
    return {
      ...state,
      ...action.payload
    };
  }
  return state;
}
