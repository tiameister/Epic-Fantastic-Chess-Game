const FINISHED_KEY = "royal-chess-finished-games-v1";
const ONGOING_KEY = "royal-chess-ongoing-v1";

export class GameStorage {
  getFinishedGames() {
    try {
      const raw = window.localStorage.getItem(FINISHED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveFinishedGame(game) {
    const list = this.getFinishedGames();
    list.unshift(game);
    const capped = list.slice(0, 200);
    window.localStorage.setItem(FINISHED_KEY, JSON.stringify(capped));
  }

  searchGames(query) {
    const q = String(query || "").trim().toLowerCase();
    const list = this.getFinishedGames();
    if (!q) {
      return list.slice(0, 20);
    }
    return list.filter((g) => {
      const hay = `${g.result} ${g.reason} ${g.pgn}`.toLowerCase();
      return hay.includes(q);
    }).slice(0, 20);
  }

  saveOngoing(data) {
    window.localStorage.setItem(ONGOING_KEY, JSON.stringify(data));
  }

  loadOngoing() {
    try {
      const raw = window.localStorage.getItem(ONGOING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  clearOngoing() {
    window.localStorage.removeItem(ONGOING_KEY);
  }
}
