import { Capacitor, registerPlugin } from "@capacitor/core";
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

export type GameCenterConnectionState =
  | "unavailable"
  | "local"
  | "connecting"
  | "connected"
  | "error";

export type GameCenterStatus = {
  available: boolean;
  authenticated: boolean;
  success?: boolean;
  usingNative: boolean;
  connectionState: GameCenterConnectionState;
  playerName: string;
  message: string;
};

type NativeGameCenterPlugin = {
  isAvailable(): Promise<NativeGameCenterResult>;
  authenticate(): Promise<NativeGameCenterResult>;
  submitScore(options: {
    leaderboardId: string;
    score: number;
  }): Promise<NativeGameCenterResult>;
  reportAchievement(options: {
    achievementId: GameCenterAchievementId;
    percent: number;
  }): Promise<NativeGameCenterResult>;
  showLeaderboard(options: { leaderboardId: string }): Promise<NativeGameCenterResult>;
  showAchievements(): Promise<NativeGameCenterResult>;
};

type NativeGameCenterResult = {
  available?: boolean;
  authenticated?: boolean;
  success?: boolean;
  usingNative?: boolean;
  playerName?: string;
  message?: string;
};

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

const nativeGameCenter = registerPlugin<NativeGameCenterPlugin>("GameCenter");
const PENDING_EVENTS_KEY = "emotion-game.game-services.pending-events";
const MAX_PENDING_EVENTS = 80;

let cachedStatus: GameCenterStatus = getLocalFallbackStatus(
  "Game Center未接続です。ローカル記録だけでも遊べます。",
);

function isIosNative(): boolean {
  return Capacitor.getPlatform() === "ios";
}

function getLocalFallbackStatus(message: string): GameCenterStatus {
  return {
    available: false,
    authenticated: false,
    usingNative: false,
    connectionState: "local",
    playerName: "",
    message,
  };
}

function normalizeNativeStatus(result: NativeGameCenterResult, fallbackMessage: string): GameCenterStatus {
  const available = result.available ?? isIosNative();
  const authenticated = result.authenticated ?? false;
  return {
    available,
    authenticated,
    success: result.success,
    usingNative: result.usingNative ?? isIosNative(),
    connectionState: authenticated ? "connected" : available ? "local" : "unavailable",
    playerName: result.playerName ?? "",
    message: result.message ?? fallbackMessage,
  };
}

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
    // Game Center events are best-effort. Local gameplay should never fail on storage.
  }
}

function enqueuePendingEvent(event: PendingGameServiceEvent): void {
  const events = loadPendingEvents();
  events.push(event);
  savePendingEvents(events);
}

function logGameCenter(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.info(`EMOTION_RUNNER_GAMECENTER ${message}`);
    return;
  }
  console.info(`EMOTION_RUNNER_GAMECENTER ${message}`, payload);
}

async function callNative<T>(
  label: string,
  action: () => Promise<T>,
): Promise<T | null> {
  if (!isIosNative()) {
    logGameCenter(`${label}-local-platform`);
    return null;
  }

  try {
    const result = await action();
    logGameCenter(`${label}-native-success`, result);
    return result;
  } catch (error) {
    logGameCenter(`${label}-native-failed`, {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function flushPendingEvents(): Promise<void> {
  if (!cachedStatus.authenticated || !cachedStatus.usingNative) return;

  const pending = loadPendingEvents();
  if (pending.length === 0) return;

  const remaining: PendingGameServiceEvent[] = [];
  for (const event of pending) {
    try {
      if (event.type === "score") {
        await nativeGameCenter.submitScore({
          leaderboardId: event.leaderboardId,
          score: event.score,
        });
      } else {
        await nativeGameCenter.reportAchievement({
          achievementId: event.achievementId,
          percent: event.percent,
        });
      }
      logGameCenter("pending-event-flushed", event);
    } catch {
      remaining.push(event);
    }
  }
  savePendingEvents(remaining);
}

export function isAvailable(): boolean {
  return isIosNative();
}

export function getStatus(): GameCenterStatus {
  return cachedStatus;
}

export async function refreshStatus(): Promise<GameCenterStatus> {
  const result = await callNative("status", () => nativeGameCenter.isAvailable());
  cachedStatus = result
    ? normalizeNativeStatus(result, "Game Centerの状態を確認しました。")
    : getLocalFallbackStatus("この環境ではGame Centerを利用できません。ローカル記録を表示します。");
  return cachedStatus;
}

export async function authenticate(): Promise<GameCenterStatus> {
  if (!isIosNative()) {
    cachedStatus = getLocalFallbackStatus("Game CenterはiOS実機で利用できます。ローカル記録を表示します。");
    logGameCenter("authenticate-local-fallback", cachedStatus);
    return cachedStatus;
  }

  cachedStatus = {
    ...cachedStatus,
    available: true,
    usingNative: true,
    connectionState: "connecting",
    message: "Game Centerに接続しています…",
  };
  const result = await callNative("authenticate", () => nativeGameCenter.authenticate());
  cachedStatus = result
    ? normalizeNativeStatus(result, "Game Centerの接続を確認しました。")
    : {
        ...getLocalFallbackStatus("Game Centerに接続できませんでした。ローカル記録を表示します。"),
        connectionState: "error",
      };

  void flushPendingEvents();
  return cachedStatus;
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

  if (cachedStatus.authenticated && cachedStatus.usingNative) {
    const result = await callNative("submit-score", () =>
      nativeGameCenter.submitScore({
        leaderboardId: event.leaderboardId,
        score: event.score,
      }),
    );
    if (result?.success !== false) return;
  }

  enqueuePendingEvent(event);
  logGameCenter("submit-score-local-pending", event);
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

  if (cachedStatus.authenticated && cachedStatus.usingNative) {
    const result = await callNative("report-achievement", () =>
      nativeGameCenter.reportAchievement({
        achievementId,
        percent: event.percent,
      }),
    );
    if (result?.success !== false) return;
  }

  enqueuePendingEvent(event);
  logGameCenter("report-achievement-local-pending", event);
}

export async function showLeaderboard(): Promise<GameCenterStatus> {
  if (!cachedStatus.authenticated) {
    cachedStatus = {
      ...cachedStatus,
      message: "Game Centerに接続するとランキングを表示できます。いまはローカル記録を表示しています。",
    };
    return cachedStatus;
  }

  const result = await callNative("show-leaderboard", () =>
    nativeGameCenter.showLeaderboard({
      leaderboardId: GAME_CENTER_LEADERBOARD_IDS.bestScore,
    }),
  );
  cachedStatus = result
    ? normalizeNativeStatus(result, "Game Centerランキングを表示しました。")
    : {
        ...cachedStatus,
        connectionState: "error",
        message: "Game Centerランキングを表示できませんでした。ローカル記録は確認できます。",
      };
  return cachedStatus;
}

export async function showAchievements(): Promise<GameCenterStatus> {
  if (!cachedStatus.authenticated) {
    cachedStatus = {
      ...cachedStatus,
      message: "Game Centerに接続すると実績を表示できます。ローカル実績はこの画面で確認できます。",
    };
    return cachedStatus;
  }

  const result = await callNative("show-achievements", () => nativeGameCenter.showAchievements());
  cachedStatus = result
    ? normalizeNativeStatus(result, "Game Center実績を表示しました。")
    : {
        ...cachedStatus,
        connectionState: "error",
        message: "Game Center実績を表示できませんでした。ローカル実績は確認できます。",
      };
  return cachedStatus;
}

export function clearPendingGameServiceEvents(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_EVENTS_KEY);
  } catch {
    // Ignore storage failures so reset never blocks the app.
  }
}
