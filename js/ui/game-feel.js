/**
 * GameFeel — orchestrates all "moment" overlays and non-intrusive
 * notifications for both Chess and Backgammon.
 *
 * Responsibilities:
 *   • Match-start splash animation
 *   • Rich victory/defeat modal with match statistics
 *   • Chess "Check" / "Cheat Mode" toast banners
 *
 * No external dependencies — uses the Web Animations API and the
 * CSS classes defined in styles/main.css.
 */

/* ─────────────────────────────────────────────────────────────
   MATCH-START SPLASH
   ───────────────────────────────────────────────────────────── */

/**
 * Shows a full-screen splash for `gameName` that auto-dismisses
 * after the animation completes (~1.8 s).
 */
export function showMatchSplash(gameName, subtitle = "Local Two-Player") {
  const existing = document.getElementById("gameSplash");
  if (existing) existing.remove();

  const splash = document.createElement("div");
  splash.id = "gameSplash";
  splash.className = "game-splash";
  splash.innerHTML = `
    <div class="splash-inner">
      <div class="splash-line"></div>
      <h1 class="splash-title">${gameName}</h1>
      <p  class="splash-sub">${subtitle}</p>
      <div class="splash-line"></div>
    </div>`;

  document.body.appendChild(splash);

  // Auto-dismiss: add leaving class, then remove from DOM
  setTimeout(() => {
    splash.classList.add("leaving");
    splash.addEventListener("animationend", () => splash.remove(), { once: true });
  }, 1400);
}

/* ─────────────────────────────────────────────────────────────
   CHESS TOAST
   ───────────────────────────────────────────────────────────── */

let _toastEl = null;
let _toastTimer = null;

function ensureToastEl() {
  if (!_toastEl) {
    _toastEl = document.createElement("div");
    _toastEl.id = "chessToast";
    _toastEl.className = "chess-toast";
    document.body.appendChild(_toastEl);
  }
  return _toastEl;
}

/**
 * @param {string} message  Text to show
 * @param {"check"|"info"|"warn"} type  Visual variant
 * @param {number} duration  How long to show (ms, default 2400 driven by CSS)
 */
export function showChessToast(message, type = "info") {
  const el = ensureToastEl();

  // Cancel any running animation so the next one triggers cleanly
  if (_toastTimer) clearTimeout(_toastTimer);
  el.classList.remove("visible", "check", "info", "warn");

  // Force a reflow so removing and re-adding "visible" fires a new animation
  void el.offsetWidth;

  el.textContent = message;
  el.classList.add(type, "visible");

  // The CSS animation is 2.4 s; clean up the class afterwards so it can replay
  _toastTimer = setTimeout(() => {
    el.classList.remove("visible", "check", "info", "warn");
  }, 2500);
}

/* ─────────────────────────────────────────────────────────────
   CHESS VICTORY MODAL
   ───────────────────────────────────────────────────────────── */

/**
 * @typedef {Object} VictoryOpts
 * @property {string}   title      — e.g. "Checkmate"
 * @property {string}   subtitle   — e.g. "White wins by checkmate"
 * @property {string}   icon       — emoji representing the result
 * @property {string}   variant    — "checkmate"|"stalemate"|"draw"|"resign"
 * @property {Object[]} stats      — [{ value, label }, ...]  (up to 6 shown)
 * @property {Function} onPlayAgain
 * @property {Function} [onAnalyze]
 */

let _victoryOverlay = null;

/**
 * Show the rich chess victory modal.
 * Replaces the simple hidden `#gameOverPanel` usage.
 */
export function showChessVictory(opts) {
  hideChessVictory(); // remove any stale overlay

  const {
    title      = "Game Over",
    subtitle   = "",
    icon       = "♟",
    variant    = "checkmate",
    stats      = [],
    onPlayAgain,
    onAnalyze,
  } = opts;

  const isWin = variant === "checkmate";

  const overlay = document.createElement("div");
  overlay.className = "victory-overlay";
  overlay.id        = "chessVictoryOverlay";

  const statsHtml = stats
    .slice(0, 6)
    .map((s, i) =>
      `<div class="victory-stat" style="animation-delay:${120 + i * 60}ms">
        <span class="victory-stat-value">${s.value}</span>
        <span class="victory-stat-label">${s.label}</span>
      </div>`
    )
    .join("");

  overlay.innerHTML = `
    <div class="victory-card${isWin ? " win-shimmer" : ""}">
      <div class="victory-header">
        <div class="victory-icon">${icon}</div>
        <h2 class="victory-title ${variant}">${title}</h2>
        ${subtitle ? `<p class="victory-subtitle">${subtitle}</p>` : ""}
      </div>
      ${statsHtml
        ? `<div class="victory-stats">${statsHtml}</div>`
        : ""}
      <div class="victory-actions">
        <button class="victory-btn-primary"  id="victoryPlayAgain">Play Again</button>
        ${onAnalyze ? `<button class="victory-btn-secondary" id="victoryAnalyze">Review Game</button>` : ""}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  _victoryOverlay = overlay;

  overlay.querySelector("#victoryPlayAgain")?.addEventListener("click", () => {
    hideChessVictory();
    onPlayAgain?.();
  });

  overlay.querySelector("#victoryAnalyze")?.addEventListener("click", () => {
    hideChessVictory();
    onAnalyze?.();
  });
}

export function hideChessVictory() {
  if (_victoryOverlay) {
    _victoryOverlay.remove();
    _victoryOverlay = null;
  }
}

/* ─────────────────────────────────────────────────────────────
   BACKGAMMON VICTORY MODAL  (replaces simple promotion-modal)
   ───────────────────────────────────────────────────────────── */

let _bgVictoryOverlay = null;

/**
 * @typedef {Object} BgVictoryOpts
 * @property {string}   title
 * @property {string}   [flavor]
 * @property {Object[]} stats      — [{ value, label }]
 * @property {Function} onNextRound
 */
export function showBackgammonVictory(opts) {
  hideBackgammonVictory();

  const {
    title      = "Round Over",
    flavor     = "",
    stats      = [],
    onNextRound,
  } = opts;

  const overlay = document.createElement("div");
  overlay.className = "promotion-modal";
  overlay.id        = "bgVictoryOverlay";

  const statsHtml = stats
    .slice(0, 4)
    .map(s =>
      `<div class="bg-victory-stat">
        <strong>${s.value}</strong>
        <span>${s.label}</span>
      </div>`
    )
    .join("");

  overlay.innerHTML = `
    <div class="bg-victory-card">
      <div class="bg-victory-header">
        <div class="victory-icon">🎲</div>
        <h3>${title}</h3>
        ${flavor ? `<p class="label">${flavor}</p>` : ""}
      </div>
      ${statsHtml ? `<div class="bg-victory-stats">${statsHtml}</div>` : ""}
      <div class="bg-victory-actions">
        <button class="victory-btn-primary" id="bgVictoryNext">Next Round</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  _bgVictoryOverlay = overlay;

  overlay.querySelector("#bgVictoryNext")?.addEventListener("click", () => {
    hideBackgammonVictory();
    onNextRound?.();
  });
}

export function hideBackgammonVictory() {
  if (_bgVictoryOverlay) {
    _bgVictoryOverlay.remove();
    _bgVictoryOverlay = null;
  }
}

/* ─────────────────────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────────────────────── */

/** Build the standard stat array for a finished chess game. */
export function buildChessStats(engine) {
  const h = engine.history ?? [];
  const totalMoves  = Math.ceil(h.length / 2);
  const captures    = h.filter(e => e?.captured).length;
  const checks      = h.filter(e => e?.isCheck).length;
  const whiteTime   = engine._clock?.whiteDisplay ?? "--";
  const blackTime   = engine._clock?.blackDisplay ?? "--";

  const stats = [
    { value: totalMoves,   label: "Moves"    },
    { value: captures,     label: "Captures" },
    { value: checks,       label: "Checks"   },
  ];

  return stats;
}

/** Resolve the icon + title + variant for a chess game state. */
export function chessResultMeta(gameState, winner) {
  switch (gameState) {
    case "Checkmate":
      return {
        icon: "♚",
        title: "Checkmate",
        variant: "checkmate",
        subtitle: winner ? `${capitalise(winner)} wins by checkmate` : "Checkmate",
      };
    case "Stalemate":
      return { icon: "🤝", title: "Stalemate",  variant: "stalemate", subtitle: "The game is a draw by stalemate" };
    case "Draw":
      return { icon: "🤝", title: "Draw",        variant: "draw",      subtitle: "The game ended in a draw"         };
    case "Resign":
      return { icon: "🏳", title: "Resignation", variant: "resign",    subtitle: winner ? `${capitalise(winner)} wins by resignation` : "Resignation" };
    case "Timeout":
      return { icon: "⏱", title: "Time Out",    variant: "resign",    subtitle: winner ? `${capitalise(winner)} wins on time` : "Time out"            };
    default:
      return { icon: "♟", title: gameState,     variant: "draw",      subtitle: ""                                 };
  }
}

function capitalise(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
