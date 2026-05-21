import {
  GAME_CENTER_ACHIEVEMENT_IDS,
  type GameCenterAchievementId,
} from "./gameCenter";

export type AchievementId =
  | "first_play"
  | "score_1000"
  | "score_5000"
  | "combo_10"
  | "combo_30"
  | "first_fever"
  | "expression_mode_play"
  | "tap_mode_play"
  | "first_gacha"
  | "first_skin_change";

export type AchievementDefinition = {
  id: AchievementId;
  name: string;
  description: string;
  gameCenterId: GameCenterAchievementId;
};

export type AchievementUnlock = AchievementDefinition & {
  unlockedAt: string;
};

const ACHIEVEMENT_STORAGE_KEY = "emotion-game.achievements.unlocked";
const ALL_TIME_BEST_KEY = "emotion-game.all-time-best";

export const ACHIEVEMENTS: Record<AchievementId, AchievementDefinition> = {
  first_play: {
    id: "first_play",
    name: "はじめてのラン",
    description: "はじめてゲームを開始した",
    gameCenterId: GAME_CENTER_ACHIEVEMENT_IDS.firstPlay,
  },
  score_1000: {
    id: "score_1000",
    name: "1000点ランナー",
    description: "スコア1000点を達成した",
    gameCenterId: GAME_CENTER_ACHIEVEMENT_IDS.score1000,
  },
  score_5000: {
    id: "score_5000",
    name: "バズり候補生",
    description: "スコア5000点を達成した",
    gameCenterId: GAME_CENTER_ACHIEVEMENT_IDS.score5000,
  },
  combo_10: {
    id: "combo_10",
    name: "10コンボ達成",
    description: "最大10コンボを達成した",
    gameCenterId: GAME_CENTER_ACHIEVEMENT_IDS.combo10,
  },
  combo_30: {
    id: "combo_30",
    name: "30コンボマスター",
    description: "最大30コンボを達成した",
    gameCenterId: GAME_CENTER_ACHIEVEMENT_IDS.combo30,
  },
  first_fever: {
    id: "first_fever",
    name: "初フィーバー",
    description: "フィーバーをはじめて発動した",
    gameCenterId: GAME_CENTER_ACHIEVEMENT_IDS.firstFever,
  },
  expression_mode_play: {
    id: "expression_mode_play",
    name: "表情ランナー",
    description: "表情操作モードでプレイした",
    gameCenterId: GAME_CENTER_ACHIEVEMENT_IDS.expressionModePlay,
  },
  tap_mode_play: {
    id: "tap_mode_play",
    name: "タップでも快走",
    description: "タップ操作モードでプレイした",
    gameCenterId: GAME_CENTER_ACHIEVEMENT_IDS.tapModePlay,
  },
  first_gacha: {
    id: "first_gacha",
    name: "はじめてのガチャ",
    description: "ガチャをはじめて引いた",
    gameCenterId: GAME_CENTER_ACHIEVEMENT_IDS.firstGacha,
  },
  first_skin_change: {
    id: "first_skin_change",
    name: "着せ替えデビュー",
    description: "スキンをはじめて切り替えた",
    gameCenterId: GAME_CENTER_ACHIEVEMENT_IDS.firstSkinChange,
  },
};

function parseAchievementId(value: unknown): AchievementId | null {
  if (typeof value !== "string") return null;
  return value in ACHIEVEMENTS ? value as AchievementId : null;
}

function readUnlockedIds(): AchievementId[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ACHIEVEMENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const unique = new Set<AchievementId>();
    for (const value of parsed) {
      const id = parseAchievementId(value);
      if (id) unique.add(id);
    }
    return Array.from(unique);
  } catch {
    return [];
  }
}

function writeUnlockedIds(ids: AchievementId[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACHIEVEMENT_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Achievements are local rewards, so storage failure should not block play.
  }
}

export function unlockAchievement(id: AchievementId): AchievementUnlock | null {
  const current = readUnlockedIds();
  if (current.includes(id)) return null;

  const definition = ACHIEVEMENTS[id];
  const next = [...current, id];
  writeUnlockedIds(next);

  return {
    ...definition,
    unlockedAt: new Date().toISOString(),
  };
}

export function getAchievementSummary(): {
  unlockedCount: number;
  totalCount: number;
  unlocked: AchievementDefinition[];
} {
  const unlockedIds = readUnlockedIds();
  return {
    unlockedCount: unlockedIds.length,
    totalCount: Object.keys(ACHIEVEMENTS).length,
    unlocked: unlockedIds.map((id) => ACHIEVEMENTS[id]),
  };
}

export function loadAllTimeBest(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(ALL_TIME_BEST_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  } catch {
    return 0;
  }
}

export function saveAllTimeBestIfHigher(score: number): {
  best: number;
  isNew: boolean;
} {
  const normalizedScore = Math.max(0, Math.floor(score));
  const previous = loadAllTimeBest();
  if (normalizedScore <= previous) {
    return { best: previous, isNew: false };
  }

  try {
    window.localStorage.setItem(ALL_TIME_BEST_KEY, String(normalizedScore));
  } catch {
    // Continue even if localStorage is unavailable.
  }
  return { best: normalizedScore, isNew: true };
}

export function clearGameProgress(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACHIEVEMENT_STORAGE_KEY);
    window.localStorage.removeItem(ALL_TIME_BEST_KEY);
  } catch {
    // Ignore reset storage failures.
  }
}
