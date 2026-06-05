import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";

export type CloudRankingEntry = {
  rank: number;
  deviceId: string;
  nickname: string;
  bestScore: number;
  bestCombo: number;
  totalRuns: number;
  totalCoins: number;
  lastScore: number;
  lastCombo: number;
  equippedCharacter: string;
  equippedBackground: string;
  equippedItem: string;
  createdAt: string;
  updatedAt: string;
  isMine: boolean;
};

export type CloudRankingStatus = "local" | "ready" | "loading" | "submitting" | "error";

export type CloudRankingState = {
  configured: boolean;
  status: CloudRankingStatus;
  message: string;
  lastErrorMessage: string;
  uploadFailed: boolean;
  deviceId: string;
  nickname: string;
  myRecord: CloudRankingEntry;
  topEntries: CloudRankingEntry[];
  motivation: string;
  lastUpdatedAt: string;
};

export type CloudRankingRunResult = {
  score: number;
  combo: number;
  coinsEarned: number;
  equippedCharacter: string;
  equippedBackground: string;
  equippedItem: string;
};

const COLLECTION_NAME = "emotion_runner_scores";
const DEVICE_ID_KEY = "emotion-game.cloud-ranking.device-id";
const NICKNAME_KEY = "emotion-game.cloud-ranking.nickname";
const LOCAL_RECORD_KEY = "emotion-game.cloud-ranking.local-record";
const DEFAULT_NICKNAME = "表情ランナー";

let firebaseApp: FirebaseApp | null = null;
let firestoreDb: Firestore | null = null;
let firebaseChecked = false;
let state: CloudRankingState = createInitialState();
const listeners = new Set<(nextState: CloudRankingState) => void>();

function logRanking(message: string, payload?: unknown): void {
  if (payload === undefined) {
    console.info(`EMOTION_RUNNER_RANKING ${message}`);
    return;
  }
  console.info(`EMOTION_RUNNER_RANKING ${message}`, payload);
}

function safeNumber(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.floor(numberValue)) : 0;
}

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function sanitizeNickname(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return DEFAULT_NICKNAME;
  return trimmed.slice(0, 16);
}

function createDeviceId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `device_${crypto.randomUUID()}`;
    }
  } catch {
    // Fall through to timestamp/random fallback.
  }
  return `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function loadDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const next = createDeviceId();
    window.localStorage.setItem(DEVICE_ID_KEY, next);
    return next;
  } catch {
    return createDeviceId();
  }
}

function loadNickname(): string {
  try {
    return sanitizeNickname(window.localStorage.getItem(NICKNAME_KEY) ?? DEFAULT_NICKNAME);
  } catch {
    return DEFAULT_NICKNAME;
  }
}

function saveNickname(value: string): string {
  const nickname = sanitizeNickname(value);
  try {
    window.localStorage.setItem(NICKNAME_KEY, nickname);
  } catch {
    // Ignore storage failures so ranking never blocks gameplay.
  }
  return nickname;
}

function getTimestampString(value: unknown): string {
  if (typeof value === "object" && value && "toDate" in value) {
    const maybeDate = (value as { toDate?: () => Date }).toDate?.();
    if (maybeDate instanceof Date && Number.isFinite(maybeDate.getTime())) {
      return maybeDate.toISOString();
    }
  }
  if (typeof value === "string") return value;
  return "";
}

function createEmptyRecord(deviceId = loadDeviceId(), nickname = loadNickname()): CloudRankingEntry {
  return {
    rank: 0,
    deviceId,
    nickname,
    bestScore: 0,
    bestCombo: 0,
    totalRuns: 0,
    totalCoins: 0,
    lastScore: 0,
    lastCombo: 0,
    equippedCharacter: "",
    equippedBackground: "",
    equippedItem: "",
    createdAt: "",
    updatedAt: "",
    isMine: true,
  };
}

function loadLocalRecord(): CloudRankingEntry {
  const deviceId = loadDeviceId();
  const nickname = loadNickname();
  try {
    const raw = window.localStorage.getItem(LOCAL_RECORD_KEY);
    if (!raw) return createEmptyRecord(deviceId, nickname);
    const parsed = JSON.parse(raw) as Partial<CloudRankingEntry>;
    return {
      ...createEmptyRecord(deviceId, nickname),
      ...parsed,
      rank: 0,
      deviceId,
      nickname,
      bestScore: safeNumber(parsed.bestScore),
      bestCombo: safeNumber(parsed.bestCombo),
      totalRuns: safeNumber(parsed.totalRuns),
      totalCoins: safeNumber(parsed.totalCoins),
      lastScore: safeNumber(parsed.lastScore),
      lastCombo: safeNumber(parsed.lastCombo),
      isMine: true,
    };
  } catch {
    return createEmptyRecord(deviceId, nickname);
  }
}

function saveLocalRecord(record: CloudRankingEntry): void {
  try {
    window.localStorage.setItem(LOCAL_RECORD_KEY, JSON.stringify(record));
  } catch {
    // Local ranking should not block the game.
  }
}

function createInitialState(): CloudRankingState {
  const deviceId = loadDeviceId();
  const nickname = loadNickname();
  const myRecord = loadLocalRecord();
  return {
    configured: hasFirebaseConfig(),
    status: hasFirebaseConfig() ? "ready" : "local",
    message: hasFirebaseConfig()
      ? "オンラインランキングを利用できます。"
      : "ローカル記録のみ。Firebase設定が未設定です。",
    lastErrorMessage: "",
    uploadFailed: false,
    deviceId,
    nickname,
    myRecord,
    topEntries: [],
    motivation: getMotivation(myRecord, [], false),
    lastUpdatedAt: "",
  };
}

function hasFirebaseConfig(): boolean {
  return Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID &&
      import.meta.env.VITE_FIREBASE_APP_ID,
  );
}

function getFirebaseDb(): Firestore | null {
  if (!hasFirebaseConfig()) {
    logRanking("firebase configured false");
    return null;
  }

  if (firestoreDb) return firestoreDb;

  if (!firebaseChecked) {
    logRanking("firebase configured true", {
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    });
    firebaseChecked = true;
  }

  firebaseApp ??= initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
  firestoreDb = getFirestore(firebaseApp);
  return firestoreDb;
}

function emit(): void {
  const snapshot = getCloudRankingState();
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function updateState(patch: Partial<CloudRankingState>): void {
  state = {
    ...state,
    ...patch,
    configured: hasFirebaseConfig(),
  };
  emit();
}

function mapFirestoreEntry(
  id: string,
  data: Record<string, unknown>,
  rank: number,
  myDeviceId: string,
): CloudRankingEntry {
  return {
    rank,
    deviceId: id,
    nickname: safeString(data.nickname, DEFAULT_NICKNAME),
    bestScore: safeNumber(data.best_score),
    bestCombo: safeNumber(data.best_combo),
    totalRuns: safeNumber(data.total_runs),
    totalCoins: safeNumber(data.total_coins),
    lastScore: safeNumber(data.last_score),
    lastCombo: safeNumber(data.last_combo),
    equippedCharacter: safeString(data.equipped_character),
    equippedBackground: safeString(data.equipped_background),
    equippedItem: safeString(data.equipped_item),
    createdAt: getTimestampString(data.created_at),
    updatedAt: getTimestampString(data.updated_at),
    isMine: id === myDeviceId || safeString(data.device_id) === myDeviceId,
  };
}

function getMotivation(
  myRecord: CloudRankingEntry,
  entries: CloudRankingEntry[],
  isNewBest: boolean,
): string {
  if (isNewBest && myRecord.bestScore > 0) return "自己ベスト更新！";
  const betterScores = entries
    .map((entry) => entry.bestScore)
    .filter((score) => score > myRecord.bestScore)
    .sort((a, b) => a - b);
  const nextScore = betterScores[0];
  if (nextScore !== undefined) {
    return `あと${Math.max(1, nextScore - myRecord.bestScore)}点で次の順位！`;
  }
  const target = Math.max(1000, myRecord.bestScore + 500);
  return `今日の目標: ${target}点`;
}

function updateLocalRunResult(result: CloudRankingRunResult): {
  record: CloudRankingEntry;
  isNewBest: boolean;
} {
  const previous = loadLocalRecord();
  const now = new Date().toISOString();
  const isNewBest = result.score > previous.bestScore;
  const record: CloudRankingEntry = {
    ...previous,
    nickname: loadNickname(),
    bestScore: Math.max(previous.bestScore, result.score),
    bestCombo: Math.max(previous.bestCombo, result.combo),
    totalRuns: previous.totalRuns + 1,
    totalCoins: previous.totalCoins + Math.max(0, result.coinsEarned),
    lastScore: Math.max(0, Math.floor(result.score)),
    lastCombo: Math.max(0, Math.floor(result.combo)),
    equippedCharacter: result.equippedCharacter,
    equippedBackground: result.equippedBackground,
    equippedItem: result.equippedItem,
    createdAt: previous.createdAt || now,
    updatedAt: now,
    isMine: true,
  };
  saveLocalRecord(record);
  return { record, isNewBest };
}

export function getCloudRankingState(): CloudRankingState {
  return {
    ...state,
    myRecord: { ...state.myRecord },
    topEntries: state.topEntries.map((entry) => ({ ...entry })),
  };
}

export function subscribeCloudRanking(listener: (nextState: CloudRankingState) => void): () => void {
  listeners.add(listener);
  listener(getCloudRankingState());
  return () => {
    listeners.delete(listener);
  };
}

export function updateRankingNickname(nicknameValue: string): CloudRankingState {
  const nickname = saveNickname(nicknameValue);
  const myRecord = {
    ...loadLocalRecord(),
    nickname,
  };
  saveLocalRecord(myRecord);
  logRanking("nickname updated", { nickname });
  updateState({
    nickname,
    myRecord,
    message: "ニックネームを保存しました。",
  });
  return getCloudRankingState();
}

export async function submitCloudRankingRun(result: CloudRankingRunResult): Promise<CloudRankingState> {
  const { record, isNewBest } = updateLocalRunResult(result);
  updateState({
    status: hasFirebaseConfig() ? "submitting" : "local",
    message: hasFirebaseConfig()
      ? "オンラインランキングへ送信しています…"
      : "ローカル記録のみ。オンラインランキングは未設定です。",
    lastErrorMessage: "",
    uploadFailed: false,
    myRecord: record,
    motivation: getMotivation(record, state.topEntries, isNewBest),
  });

  const db = getFirebaseDb();
  if (!db) {
    logRanking("local fallback used", { reason: "firebase-env-missing" });
    updateState({
      status: "local",
      message: "ローカル記録のみ",
      myRecord: record,
      motivation: getMotivation(record, state.topEntries, isNewBest),
    });
    return getCloudRankingState();
  }

  logRanking("submit requested", {
    score: result.score,
    combo: result.combo,
    deviceId: state.deviceId,
  });

  try {
    const scoreRef = doc(db, COLLECTION_NAME, state.deviceId);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(scoreRef);
      const data = snapshot.exists() ? snapshot.data() : {};
      const previousBestScore = safeNumber(data.best_score);
      const previousBestCombo = safeNumber(data.best_combo);
      const previousTotalRuns = safeNumber(data.total_runs);
      const previousTotalCoins = safeNumber(data.total_coins);
      transaction.set(
        scoreRef,
        {
          device_id: state.deviceId,
          nickname: state.nickname,
          best_score: Math.max(previousBestScore, result.score),
          best_combo: Math.max(previousBestCombo, result.combo),
          total_runs: previousTotalRuns + 1,
          total_coins: previousTotalCoins + Math.max(0, result.coinsEarned),
          last_score: Math.max(0, Math.floor(result.score)),
          last_combo: Math.max(0, Math.floor(result.combo)),
          equipped_character: result.equippedCharacter,
          equipped_background: result.equippedBackground,
          equipped_item: result.equippedItem,
          created_at: snapshot.exists() ? data.created_at : serverTimestamp(),
          updated_at: serverTimestamp(),
        },
        { merge: true },
      );
    });

    logRanking("submit success", {
      score: result.score,
      combo: result.combo,
    });
    updateState({
      status: "ready",
      message: isNewBest ? "自己ベスト更新！オンラインランキングへ送信しました。" : "オンラインランキングへ送信しました。",
      uploadFailed: false,
      myRecord: record,
      motivation: getMotivation(record, state.topEntries, isNewBest),
      lastUpdatedAt: new Date().toISOString(),
    });
    void refreshCloudRanking();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logRanking("submit failure", { message });
    updateState({
      status: "error",
      message: "オンラインランキング送信失敗。ローカル記録は保存済みです。",
      lastErrorMessage: message,
      uploadFailed: true,
      myRecord: record,
      motivation: getMotivation(record, state.topEntries, isNewBest),
    });
  }

  return getCloudRankingState();
}

export async function refreshCloudRanking(): Promise<CloudRankingState> {
  const db = getFirebaseDb();
  if (!db) {
    logRanking("fetch ranking requested", { configured: false });
    logRanking("local fallback used", { reason: "firebase-env-missing" });
    updateState({
      status: "local",
      message: "ローカル記録のみ",
      topEntries: [],
      motivation: getMotivation(state.myRecord, [], false),
      lastErrorMessage: "",
    });
    return getCloudRankingState();
  }

  logRanking("fetch ranking requested", { collection: COLLECTION_NAME });
  updateState({
    status: "loading",
    message: "ランキングを更新しています…",
    lastErrorMessage: "",
  });

  try {
    const rankingQuery = query(
      collection(db, COLLECTION_NAME),
      orderBy("best_score", "desc"),
      limit(50),
    );
    const snapshot = await getDocs(rankingQuery);
    const entries = snapshot.docs.map((documentSnapshot, index) =>
      mapFirestoreEntry(
        documentSnapshot.id,
        documentSnapshot.data(),
        index + 1,
        state.deviceId,
      ),
    );
    const myOnlineRecord = entries.find((entry) => entry.isMine);
    const myRecord = myOnlineRecord
      ? {
          ...state.myRecord,
          ...myOnlineRecord,
          rank: myOnlineRecord.rank,
          isMine: true,
        }
      : state.myRecord;
    logRanking("fetch ranking success", { count: entries.length });
    updateState({
      status: "ready",
      message: entries.length > 0 ? "オンラインランキングを更新しました。" : "まだランキングがありません。",
      topEntries: entries,
      myRecord,
      motivation: getMotivation(myRecord, entries, false),
      lastUpdatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logRanking("fetch ranking failure", { message });
    updateState({
      status: "error",
      message: "オンラインランキングを取得できませんでした。ローカル記録は表示できます。",
      lastErrorMessage: message,
      motivation: getMotivation(state.myRecord, state.topEntries, false),
    });
  }

  return getCloudRankingState();
}

export function getCloudRankingDiagnostics(): string {
  return JSON.stringify(
    {
      build: typeof window === "undefined" ? "23" : window.__EMOTION_RUNNER_BUILD__ ?? "23",
      configured: hasFirebaseConfig(),
      collection: COLLECTION_NAME,
      deviceId: state.deviceId,
      nickname: state.nickname,
      status: state.status,
      message: state.message,
      lastErrorMessage: state.lastErrorMessage,
      myRecord: state.myRecord,
      topCount: state.topEntries.length,
      uploadedData:
        "device_id, nickname, score/combo/run/coin totals, equipped cosmetic ids, timestamps",
      neverUploaded:
        "camera images, face landmarks, expression frames, MediaPipe blendshapes",
      href: typeof window === "undefined" ? "" : window.location.href,
      userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    },
    null,
    2,
  );
}

export function clearCloudRankingLocalData(): void {
  try {
    window.localStorage.removeItem(DEVICE_ID_KEY);
    window.localStorage.removeItem(NICKNAME_KEY);
    window.localStorage.removeItem(LOCAL_RECORD_KEY);
  } catch {
    // Ignore storage failures during reset.
  }
}
