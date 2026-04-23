const STORAGE_KEY = "royal-chess-profile-v1";

const ACHIEVEMENTS = [
  { id: "first_blood", title: "First Blood", description: "Capture your first piece.", rarity: "common" },
  { id: "grinder", title: "Grinder", description: "Play 10 matches.", rarity: "common" },
  { id: "check_artist", title: "Check Artist", description: "Deliver 25 checks.", rarity: "rare" },
  { id: "flawless", title: "Flawless Victory", description: "Win a match with no blunders.", rarity: "epic" }
];

const QUESTS = [
  { id: "play_3", title: "Play 3 Matches", target: 3, key: "matchesPlayed", rewardXp: 60, season: "core" },
  { id: "capture_15", title: "Capture 15 Pieces", target: 15, key: "captures", rewardXp: 80, season: "core" },
  { id: "check_10", title: "Give 10 Checks", target: 10, key: "checks", rewardXp: 70, season: "core" },
  { id: "spring_combo", title: "Spring Combo: 5 Great Moves", target: 5, key: "greatMoves", rewardXp: 90, season: "spring" }
];

export class ProgressionSystem {
  constructor() {
    this.profile = this.load();
    this.ensureProfileShape();
  }

  load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return this.defaultProfile();
      }
      return { ...this.defaultProfile(), ...JSON.parse(raw) };
    } catch {
      return this.defaultProfile();
    }
  }

  defaultProfile() {
    return {
      level: 1,
      xp: 0,
      matchesPlayed: 0,
      wins: { white: 0, black: 0 },
      achievements: [],
      stats: {
        captures: 0,
        checks: 0,
        blunders: 0,
        greatMoves: 0,
        mistakes: 0,
        bestPuzzleStreak: 0,
        currentPuzzleStreak: 0,
        mistakeCategories: { tactical: 0, positional: 0, time: 0 },
        accuracyHistory: []
      },
      quests: {}
    };
  }

  ensureProfileShape() {
    const defaults = this.defaultProfile();
    this.profile = {
      ...defaults,
      ...this.profile,
      wins: { ...defaults.wins, ...(this.profile.wins || {}) },
      stats: {
        ...defaults.stats,
        ...(this.profile.stats || {}),
        mistakeCategories: {
          ...defaults.stats.mistakeCategories,
          ...((this.profile.stats && this.profile.stats.mistakeCategories) || {})
        }
      },
      quests: { ...defaults.quests, ...(this.profile.quests || {}) }
    };
    QUESTS.forEach((quest) => {
      if (!this.profile.quests[quest.id]) {
        this.profile.quests[quest.id] = { progress: 0, completed: false, claimed: false };
      }
    });
  }

  gainXp(amount) {
    this.profile.xp += Math.max(0, amount);
    while (this.profile.xp >= this.xpRequired(this.profile.level)) {
      this.profile.xp -= this.xpRequired(this.profile.level);
      this.profile.level += 1;
    }
    this.save();
  }

  recordCapture(count = 1) {
    this.ensureProfileShape();
    this.profile.stats.captures += Math.max(0, count);
    this.unlockAchievement("first_blood", this.profile.stats.captures >= 1);
    this.progressQuest("capture_15", this.profile.stats.captures);
    this.save();
  }

  recordCheck(count = 1) {
    this.ensureProfileShape();
    this.profile.stats.checks += Math.max(0, count);
    this.unlockAchievement("check_artist", this.profile.stats.checks >= 25);
    this.progressQuest("check_10", this.profile.stats.checks);
    this.save();
  }

  recordMoveQuality(data) {
    this.ensureProfileShape();
    const label = typeof data === "string" ? data : (data?.label || "Neutral");
    const delta = typeof data === "string" ? 0 : Number(data?.delta || 0);
    if (label === "Blunder") {
      this.profile.stats.blunders += 1;
      this.profile.stats.mistakes += 1;
      this.profile.stats.mistakeCategories.tactical += 1;
    }
    if (label === "Mistake") {
      this.profile.stats.mistakes += 1;
      this.profile.stats.mistakeCategories.positional += 1;
    }
    if (label === "Great Move" || label === "Winning Advantage") {
      this.profile.stats.greatMoves += 1;
    }
    const score = this.moveLabelToAccuracy(label, delta);
    this.profile.stats.accuracyHistory.push(score);
    if (this.profile.stats.accuracyHistory.length > 80) {
      this.profile.stats.accuracyHistory = this.profile.stats.accuracyHistory.slice(-80);
    }
    this.progressQuest("spring_combo", this.profile.stats.greatMoves);
    this.save();
  }

  completeMatch(winnerColor = null, summary = {}) {
    this.ensureProfileShape();
    this.profile.matchesPlayed += 1;
    if (winnerColor === "white" || winnerColor === "black") {
      this.profile.wins[winnerColor] += 1;
    }
    this.progressQuest("play_3", this.profile.matchesPlayed);
    this.unlockAchievement("grinder", this.profile.matchesPlayed >= 10);
    if (summary.noBlunderWin && (winnerColor === "white" || winnerColor === "black")) {
      this.unlockAchievement("flawless", true);
    }
    this.gainXp(40);
    this.save();
  }

  unlockAchievement(achievementId, condition) {
    if (!condition) {
      return;
    }
    if (!this.profile.achievements.includes(achievementId)) {
      this.profile.achievements.push(achievementId);
      this.gainXp(25);
    }
  }

  progressQuest(questId, absoluteValue) {
    const quest = QUESTS.find((q) => q.id === questId);
    if (!quest) {
      return;
    }
    const state = this.profile.quests[questId] || { progress: 0, completed: false, claimed: false };
    state.progress = Math.max(state.progress, absoluteValue);
    if (!state.completed && state.progress >= quest.target) {
      state.completed = true;
      if (!state.claimed) {
        state.claimed = true;
        this.gainXp(quest.rewardXp);
      }
    }
    this.profile.quests[questId] = state;
  }

  getAchievements() {
    this.ensureProfileShape();
    return ACHIEVEMENTS.map((a) => ({
      ...a,
      unlocked: this.profile.achievements.includes(a.id)
    }));
  }

  getQuests() {
    this.ensureProfileShape();
    return QUESTS.map((q) => {
      const state = this.profile.quests[q.id] || { progress: 0, completed: false };
      return {
        ...q,
        progress: Math.min(state.progress, q.target),
        completed: Boolean(state.completed),
        season: q.season || "core"
      };
    });
  }

  getStatsSummary() {
    this.ensureProfileShape();
    const history = this.profile.stats.accuracyHistory || [];
    const avg = history.length > 0
      ? Math.round(history.reduce((sum, n) => sum + n, 0) / history.length)
      : 0;
    return {
      avgAccuracy: avg,
      bestPuzzleStreak: this.profile.stats.bestPuzzleStreak || 0,
      mistakes: this.profile.stats.mistakes || 0,
      mistakeCategories: this.profile.stats.mistakeCategories || { tactical: 0, positional: 0, time: 0 }
    };
  }

  recordPuzzleResult(solved) {
    this.ensureProfileShape();
    if (solved) {
      this.profile.stats.currentPuzzleStreak += 1;
      this.profile.stats.bestPuzzleStreak = Math.max(
        this.profile.stats.bestPuzzleStreak,
        this.profile.stats.currentPuzzleStreak
      );
    } else {
      this.profile.stats.currentPuzzleStreak = 0;
    }
    this.save();
  }

  exportProfileJson() {
    this.ensureProfileShape();
    return JSON.stringify(this.profile, null, 2);
  }

  importProfileJson(rawJson) {
    const parsed = JSON.parse(rawJson);
    this.profile = { ...this.defaultProfile(), ...parsed };
    this.ensureProfileShape();
    this.save();
  }

  moveLabelToAccuracy(label, delta) {
    if (label === "Great Move" || label === "Winning Advantage") return 98;
    if (label === "Good Move") return 88;
    if (label === "Neutral") return 78;
    if (label === "Mistake") return 55;
    if (label === "Blunder") return 30;
    if (delta >= 0.8) return 90;
    if (delta <= -1.2) return 45;
    return 75;
  }

  xpRequired(level) {
    return 100 + (level - 1) * 40;
  }

  save() {
    this.ensureProfileShape();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch {
      // Best effort only
    }
  }
}
