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

export type GameCenterAutoConnectSource = "boot" | "resume" | "ranking" | "manual";

export type GameCenterStatus = {
  available: boolean;
  authenticated: boolean;
  success?: boolean;
  usingNative: boolean;
  connectionState: GameCenterConnectionState;
  playerName: string;
  playerGamePlayerID: string;
  message: string;
  lastErrorCode: string;
  lastErrorMessage: string;
  supportsGameCenterBridge: boolean;
  entitlementDetected: boolean | "unknown";
  nativePluginAvailable?: boolean;
  platform?: string;
  appBuild?: string;
  appVersion?: string;
  bundleId?: string;
  leaderboardId?: string;
  achievementIds?: string[];
  pendingEventCount?: number;
  autoAuthAttemptCount?: number;
  lastAutoAuthSource?: string;
  lastAuthAttemptAt?: string;
  lastAuthSuccessAt?: string;
  lastAuthFailureAt?: string;
  requiresUserAction?: boolean;
  appStoreConnectReminder?: string;
};

type NativeGameCenterPlugin = {
  isAvailable(): Promise<NativeGameCenterResult>;
  authenticate(): Promise<NativeGameCenterResult>;
  autoAuthenticate(options: {
    source: GameCenterAutoConnectSource;
  }): Promise<NativeGameCenterResult>;
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
  getDiagnostics(): Promise<NativeGameCenterResult>;
};

type NativeGameCenterResult = {
  available?: boolean;
  authenticated?: boolean;
  success?: boolean;
  usingNative?: boolean;
  playerName?: string;
  playerGamePlayerID?: string;
  message?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  supportsGameCenterBridge?: boolean;
  entitlementDetected?: boolean | "unknown";
  attempted?: boolean;
  requiresUserAction?: boolean;
  source?: string;
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
const AUTO_AUTH_FAILURE_KEY = "emotion-game.game-center.last-auto-auth-failure";
const AUTO_AUTH_COOLDOWN_MS = 60_000;
const MAX_PENDING_EVENTS = 80;
const APP_VERSION = "1.0";
const IOS_BUNDLE_ID = "com.catloverbot.emotiongame";

let autoAuthInFlight = false;
let autoAuthAttemptCount = 0;
let lastAutoAuthSource = "";
let lastAuthAttemptAt = "";
let lastAuthSuccessAt = "";
let lastAuthFailureAt = loadLastAutoAuthFailure()?.at ?? "";
let cachedStatus: GameCenterStatus = getLocalFallbackStatus(
  "Game Center未接続です。ローカル記録だけでも遊べます。",
);

type StoredAutoAuthFailure = {
  at: string;
  source: string;
  code: string;
  message: string;
};

function isIosNative(): boolean {
  return Capacitor.getPlatform() === "ios";
}

function getAppBuild(): string {
  if (typeof window === "undefined") return "23";
  return window.__EMOTION_RUNNER_BUILD__ ?? "23";
}

function loadLastAutoAuthFailure(): StoredAutoAuthFailure | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTO_AUTH_FAILURE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAutoAuthFailure>;
    if (!parsed.at || !parsed.message) return null;
    return {
      at: String(parsed.at),
      source: String(parsed.source ?? ""),
      code: String(parsed.code ?? ""),
      message: String(parsed.message),
    };
  } catch {
    return null;
  }
}

function saveLastAutoAuthFailure(failure: StoredAutoAuthFailure): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTO_AUTH_FAILURE_KEY, JSON.stringify(failure));
  } catch {
    // Game Center diagnostics are best-effort.
  }
}

function clearLastAutoAuthFailure(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTO_AUTH_FAILURE_KEY);
  } catch {
    // Ignore diagnostics storage failures.
  }
}

function getLastFailureAgeMs(now: number): number | null {
  const stored = loadLastAutoAuthFailure();
  if (!stored) return null;
  const at = Date.parse(stored.at);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, now - at);
}

function withRuntimeDiagnostics(status: GameCenterStatus): GameCenterStatus {
  const pendingEventCount = loadPendingEvents().length;
  const nativePluginAvailable = status.usingNative && status.supportsGameCenterBridge;
  return {
    ...status,
    nativePluginAvailable,
    platform: Capacitor.getPlatform(),
    appBuild: getAppBuild(),
    appVersion: APP_VERSION,
    bundleId: IOS_BUNDLE_ID,
    leaderboardId: GAME_CENTER_LEADERBOARD_IDS.bestScore,
    achievementIds: Object.values(GAME_CENTER_ACHIEVEMENT_IDS),
    pendingEventCount,
    autoAuthAttemptCount,
    lastAutoAuthSource,
    lastAuthAttemptAt,
    lastAuthSuccessAt,
    lastAuthFailureAt,
    appStoreConnectReminder:
      "App Store ConnectでGame Center、leaderboard.best_score、achievement.* のIDが1.0に紐づいているか確認してください。",
  };
}

function getLocalFallbackStatus(message: string): GameCenterStatus {
  return withRuntimeDiagnostics({
    available: false,
    authenticated: false,
    usingNative: false,
    connectionState: "local",
    playerName: "",
    playerGamePlayerID: "",
    message,
    lastErrorCode: "",
    lastErrorMessage: "",
    supportsGameCenterBridge: false,
    entitlementDetected: "unknown",
  });
}

function normalizeNativeStatus(result: NativeGameCenterResult, fallbackMessage: string): GameCenterStatus {
  const available = result.available ?? isIosNative();
  const authenticated = result.authenticated ?? false;
  return withRuntimeDiagnostics({
    available,
    authenticated,
    success: result.success,
    usingNative: result.usingNative ?? isIosNative(),
    connectionState: authenticated ? "connected" : available ? "local" : "unavailable",
    playerName: result.playerName ?? "",
    playerGamePlayerID: result.playerGamePlayerID ?? "",
    message: result.message ?? fallbackMessage,
    lastErrorCode: result.lastErrorCode ?? "",
    lastErrorMessage: result.lastErrorMessage ?? "",
    supportsGameCenterBridge: result.supportsGameCenterBridge ?? true,
    entitlementDetected: result.entitlementDetected ?? "unknown",
    requiresUserAction: result.requiresUserAction ?? false,
  });
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
    const name = error instanceof Error ? error.name : "Error";
    const message = error instanceof Error ? error.message : String(error);
    cachedStatus = {
      ...cachedStatus,
      connectionState: "error",
      lastErrorCode: name,
      lastErrorMessage: message,
      message,
    };
    logGameCenter(`${label}-native-failed`, {
      name,
      message,
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
      logGameCenter("pending-event-flush-failed", event);
      remaining.push(event);
    }
  }
  savePendingEvents(remaining);
}

export function isAvailable(): boolean {
  return isIosNative();
}

export function getStatus(): GameCenterStatus {
  cachedStatus = withRuntimeDiagnostics(cachedStatus);
  return cachedStatus;
}

export async function refreshStatus(): Promise<GameCenterStatus> {
  const result = await callNative("diagnostics", () => nativeGameCenter.getDiagnostics());
  cachedStatus = result
    ? normalizeNativeStatus(result, "Game Centerの状態を確認しました。")
    : getLocalFallbackStatus("この環境ではGame Centerを利用できません。ローカル記録を表示します。");
  return cachedStatus;
}

export async function getDiagnostics(): Promise<GameCenterStatus> {
  return refreshStatus();
}

export async function autoConnect(
  source: GameCenterAutoConnectSource,
  options: { bypassCooldown?: boolean } = {},
): Promise<GameCenterStatus> {
  logGameCenter("autoConnect requested", {
    source,
    platform: Capacitor.getPlatform(),
    nativePluginAvailable: cachedStatus.usingNative && cachedStatus.supportsGameCenterBridge,
  });

  if (!isIosNative()) {
    cachedStatus = getLocalFallbackStatus("Game CenterはiOS実機で利用できます。ローカル記録を表示します。");
    logGameCenter("autoConnect fallback used", { reason: "local-platform", source });
    return cachedStatus;
  }

  if (cachedStatus.authenticated) {
    logGameCenter("autoConnect skipped", { reason: "alreadyAuthenticated", source });
    cachedStatus = withRuntimeDiagnostics({
      ...cachedStatus,
      connectionState: "connected",
      message: "Game Centerに接続済みです。",
    });
    return cachedStatus;
  }

  if (autoAuthInFlight) {
    logGameCenter("autoConnect skipped", { reason: "inFlight", source });
    return withRuntimeDiagnostics({
      ...cachedStatus,
      connectionState: "connecting",
      message: "Game Centerに接続しています…",
    });
  }

  const now = Date.now();
  const failureAgeMs = getLastFailureAgeMs(now);
  if (!options.bypassCooldown && failureAgeMs !== null && failureAgeMs < AUTO_AUTH_COOLDOWN_MS) {
    const stored = loadLastAutoAuthFailure();
    logGameCenter("autoConnect skipped", {
      reason: "cooldown",
      source,
      failureAgeMs,
      lastError: stored?.message,
    });
    cachedStatus = withRuntimeDiagnostics({
      ...cachedStatus,
      available: true,
      usingNative: true,
      connectionState: "local",
      message: "Game Centerは少し時間をおいて再接続します。いまはローカル記録で遊べます。",
      lastErrorCode: stored?.code ?? cachedStatus.lastErrorCode,
      lastErrorMessage: stored?.message ?? cachedStatus.lastErrorMessage,
    });
    return cachedStatus;
  }

  autoAuthInFlight = true;
  autoAuthAttemptCount += 1;
  lastAutoAuthSource = source;
  lastAuthAttemptAt = new Date(now).toISOString();

  cachedStatus = withRuntimeDiagnostics({
    ...cachedStatus,
    available: true,
    usingNative: true,
    connectionState: "connecting",
    message: "Game Centerに接続しています…",
    lastErrorCode: "",
    lastErrorMessage: "",
  });

  try {
    const result = await callNative("auto-authenticate", () =>
      nativeGameCenter.autoAuthenticate({ source }),
    );
    cachedStatus = result
      ? normalizeNativeStatus(result, "Game Centerの接続を確認しました。")
      : withRuntimeDiagnostics({
          ...getLocalFallbackStatus("Game Centerに接続できませんでした。ローカル記録を表示します。"),
          connectionState: "error",
        });

    if (cachedStatus.authenticated) {
      lastAuthSuccessAt = new Date().toISOString();
      lastAuthFailureAt = "";
      clearLastAutoAuthFailure();
      logGameCenter("authenticate success", {
        source,
        playerName: cachedStatus.playerName,
      });
      await flushPendingEvents();
    } else {
      lastAuthFailureAt = new Date().toISOString();
      saveLastAutoAuthFailure({
        at: lastAuthFailureAt,
        source,
        code: cachedStatus.lastErrorCode,
        message: cachedStatus.lastErrorMessage || cachedStatus.message,
      });
      logGameCenter("authenticate failure", {
        source,
        code: cachedStatus.lastErrorCode,
        message: cachedStatus.lastErrorMessage || cachedStatus.message,
        requiresUserAction: cachedStatus.requiresUserAction,
      });
    }
  } finally {
    autoAuthInFlight = false;
    cachedStatus = withRuntimeDiagnostics(cachedStatus);
  }

  return cachedStatus;
}

export async function authenticate(): Promise<GameCenterStatus> {
  return autoConnect("manual", { bypassCooldown: true });
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
