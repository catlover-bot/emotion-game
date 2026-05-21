import type { ControlMode } from "./types";

export const GAME_CENTER_LEADERBOARD_IDS = {
  bestScore: "leaderboard.best_score",
} as const;

export const GAME_CENTER_ACHIEVEMENT_IDS = {
  firstPlay: "achievement.first_play",
  score1000: "achievement.score_1000",
  score5000: "achievement.score_5000",
  combo10: "achievement.combo_10",
  combo30: "achievement.combo_30",
  firstFever: "achievement.first_fever",
  expressionModePlay: "achievement.expression_mode_play",
  tapModePlay: "achievement.tap_mode_play",
  firstGacha: "achievement.first_gacha",
  firstSkinChange: "achievement.first_skin_change",
} as const;

export type GameCenterAchievementId =
  (typeof GAME_CENTER_ACHIEVEMENT_IDS)[keyof typeof GAME_CENTER_ACHIEVEMENT_IDS];

type PendingGameServiceEvent =
  | {
      type: "score";
      leaderboardId: string;
      score: number;
      mode?: ControlMode;
      maxCombo?: number;
      occurredAt: string;
    }
  | {
      type: "achievement";
      achievementId: GameCenterAchievementId;
      percent: number;
      occurredAt: string;
    };

const PENDING_EVENTS_KEY = "emotion-game.game-services.pending-events";
const MAX_PENDING_EVENTS = 80;

function loadPendingEvents(): PendingGameServiceEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PENDING_EVENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-MAX_PENDING_EVENTS) as PendingGameServiceEvent[] : [];
  } catch {
    return [];
  }
}

function savePendingEvents(events: PendingGameServiceEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PENDING_EVENTS_KEY,
      JSON.stringify(events.slice(-MAX_PENDING_EVENTS)),
    );
  } catch {
    // Pending Game Center events are best-effort only in this local adapter.
  }
}

function enqueuePendingEvent(event: PendingGameServiceEvent): void {
  const events = loadPendingEvents();
  events.push(event);
  savePendingEvents(events);
}

function logGameServiceEvent(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.info(`EMOTION_RUNNER_GAME_SERVICES ${message}`);
    return;
  }
  console.info(`EMOTION_RUNNER_GAME_SERVICES ${message}`, payload);
}

export function isAvailable(): boolean {
  return false;
}

export async function authenticate(): Promise<{
  available: boolean;
  authenticated: boolean;
  message: string;
}> {
  const result = {
    available: false,
    authenticated: false,
    message: "Game Center連携は次のアップデートで対応予定です。",
  };
  logGameServiceEvent("authenticate-local-adapter", result);
  return result;
}

export async function submitScore(
  score: number,
  metadata: { mode?: ControlMode; maxCombo?: number } = {},
): Promise<void> {
  const event: PendingGameServiceEvent = {
    type: "score",
    leaderboardId: GAME_CENTER_LEADERBOARD_IDS.bestScore,
    score: Math.max(0, Math.floor(score)),
    mode: metadata.mode,
    maxCombo: metadata.maxCombo,
    occurredAt: new Date().toISOString(),
  };
  enqueuePendingEvent(event);
  logGameServiceEvent("submit-score-local", event);
}

export async function reportAchievement(
  achievementId: GameCenterAchievementId,
  percent: number,
): Promise<void> {
  const event: PendingGameServiceEvent = {
    type: "achievement",
    achievementId,
    percent: Math.max(0, Math.min(100, percent)),
    occurredAt: new Date().toISOString(),
  };
  enqueuePendingEvent(event);
  logGameServiceEvent("report-achievement-local", event);
}

export async function showLeaderboard(): Promise<{
  available: boolean;
  message: string;
}> {
  const result = {
    available: false,
    message: "Game Centerランキングは次のアップデートで対応予定です。",
  };
  logGameServiceEvent("show-leaderboard-local", result);
  return result;
}

export async function showAchievements(): Promise<{
  available: boolean;
  message: string;
}> {
  const result = {
    available: false,
    message: "Game Center実績は次のアップデートで対応予定です。",
  };
  logGameServiceEvent("show-achievements-local", result);
  return result;
}

export function clearPendingGameServiceEvents(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_EVENTS_KEY);
  } catch {
    // Ignore storage failures so reset never blocks the app.
  }
}
