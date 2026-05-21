import type {
  CameraDiagnostics,
  ExpressionRuntimeDiagnostic,
  ModelAssetCheck,
} from "./camera";
import {
  ExpressionLoopSetupError as FaceApiExpressionLoopSetupError,
  FaceModelSetupError,
  getFaceModelBaseUrl,
  setupFaceModels,
  startExpressionLoop as startFaceApiExpressionLoop,
} from "./face";
import type { Expression, ExpressionSensitivity } from "./types";

type VisionTasksModule = typeof import("@mediapipe/tasks-vision");
type FaceLandmarkerInstance = import("@mediapipe/tasks-vision").FaceLandmarker;
type FaceLandmarkerResult = import("@mediapipe/tasks-vision").FaceLandmarkerResult;

export type ExpressionEngineName = "mediapipe" | "faceapi" | "tap";
export type ExpressionScoreMap = Record<Expression, number>;

export type ExpressionStatus = {
  engine: ExpressionEngineName;
  expression: Expression;
  confidence: number;
  faceDetected: boolean;
  faceMessage: string;
  actionLabel: string;
  rawScores: ExpressionScoreMap;
  smoothedScores: ExpressionScoreMap;
  consecutiveDetections: number;
  detectionIntervalMs: number;
  inputSize: number;
  scoreThreshold: number;
  sensitivity: ExpressionSensitivity;
  sensitivityLabel: string;
  lastErrorName: string;
  lastErrorMessage: string;
};

export type StartExpressionLoopOptions = {
  sensitivity: ExpressionSensitivity;
  onStatus?: (status: ExpressionStatus) => void;
};

export type ExpressionEngineController = {
  readonly engine: ExpressionEngineName;
  stop(): void;
  getStatus(): ExpressionStatus | null;
  getDiagnostics(): ExpressionRuntimeDiagnostic[];
};

type MediaPipeAssetDefinition = {
  fileName: string;
  responseType: "text" | "arraybuffer";
  minimumByteLength: number;
};

type MediaPipeSettings = {
  label: string;
  alpha: number;
  intervalMs: number;
  scoreThreshold: number;
  happyMin: number;
  angryMin: number;
  surprisedMin: number;
  activationStableDetections: number;
  neutralStableDetections: number;
};

class MediaPipeSetupError extends Error {
  readonly diagnostics: CameraDiagnostics;

  constructor(message: string, diagnostics: CameraDiagnostics, cause?: unknown) {
    super(message);
    this.name = cause instanceof Error && cause.name ? cause.name : "MediaPipeSetupError";
    this.diagnostics = diagnostics;
  }
}

export class ExpressionModelSetupError extends Error {
  readonly diagnostics: CameraDiagnostics;

  constructor(message: string, diagnostics: CameraDiagnostics, cause?: unknown) {
    super(message);
    this.name = cause instanceof Error && cause.name ? cause.name : "ExpressionModelSetupError";
    this.diagnostics = diagnostics;
  }
}

export class ExpressionLoopSetupError extends Error {
  readonly diagnostics: ExpressionRuntimeDiagnostic[];

  constructor(message: string, diagnostics: ExpressionRuntimeDiagnostic[], cause?: unknown) {
    super(message);
    this.name = cause instanceof Error && cause.name ? cause.name : "ExpressionLoopSetupError";
    this.diagnostics = diagnostics;
  }
}

const MEDIAPIPE_ASSETS: MediaPipeAssetDefinition[] = [
  {
    fileName: "face_landmarker.task",
    responseType: "arraybuffer",
    minimumByteLength: 3_000_000,
  },
  {
    fileName: "vision_wasm_internal.js",
    responseType: "text",
    minimumByteLength: 100_000,
  },
  {
    fileName: "vision_wasm_internal.wasm",
    responseType: "arraybuffer",
    minimumByteLength: 5_000_000,
  },
  {
    fileName: "vision_wasm_nosimd_internal.js",
    responseType: "text",
    minimumByteLength: 100_000,
  },
  {
    fileName: "vision_wasm_nosimd_internal.wasm",
    responseType: "arraybuffer",
    minimumByteLength: 5_000_000,
  },
];

const MEDIAPIPE_BASE_CANDIDATES = [
  "./mediapipe",
  "mediapipe",
  "./mediapipe/",
  "mediapipe/",
  new URL("./mediapipe/", document.baseURI).toString(),
  new URL("./mediapipe/", window.location.href).toString(),
];

const MEDIAPIPE_SETTINGS: Record<ExpressionSensitivity, MediaPipeSettings> = {
  gentle: {
    label: "やさしい",
    alpha: 0.58,
    intervalMs: 82,
    scoreThreshold: 0.24,
    happyMin: 0.16,
    angryMin: 0.12,
    surprisedMin: 0.16,
    activationStableDetections: 1,
    neutralStableDetections: 2,
  },
  normal: {
    label: "ふつう",
    alpha: 0.48,
    intervalMs: 92,
    scoreThreshold: 0.3,
    happyMin: 0.22,
    angryMin: 0.17,
    surprisedMin: 0.22,
    activationStableDetections: 2,
    neutralStableDetections: 3,
  },
  high: {
    label: "高感度",
    alpha: 0.68,
    intervalMs: 68,
    scoreThreshold: 0.18,
    happyMin: 0.11,
    angryMin: 0.08,
    surprisedMin: 0.11,
    activationStableDetections: 1,
    neutralStableDetections: 1,
  },
};

let mediaPipeModulePromise: Promise<VisionTasksModule> | null = null;
let mediaPipeLandmarker: FaceLandmarkerInstance | null = null;
let selectedEngine: ExpressionEngineName = "tap";
let selectedMediaPipeBaseUrl = resolveBaseUrl("./mediapipe/");
let selectedMediaPipeModelUrl = new URL("face_landmarker.task", selectedMediaPipeBaseUrl).toString();
let mediaPipeLoaded = false;
let mediaPipeInitDiagnostics: ExpressionRuntimeDiagnostic[] = [];

function createEmptyDiagnostics(): CameraDiagnostics {
  return {
    phase: "models",
    errorName: "",
    errorMessage: "",
    mediaDevicesExists: typeof navigator !== "undefined" && "mediaDevices" in navigator,
    getUserMediaExists:
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function",
    isSecureContext: window.isSecureContext,
    href: window.location.href,
    origin: window.location.origin,
    attempts: [],
    videoReadyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    notes: [],
    modelUrl: "",
    selectedModelCandidate: "",
    modelAssetChecks: [],
    modelCandidates: [],
    expressionDiagnostics: [],
  };
}

function cloneDiagnostics(base: CameraDiagnostics | null): CameraDiagnostics {
  const diagnostics = base
    ? {
        ...base,
        phase: "models" as const,
        errorName: "",
        errorMessage: "",
        attempts: base.attempts.map((attempt) => ({ ...attempt })),
        notes: [...base.notes],
        modelAssetChecks: [],
        modelCandidates: [],
        expressionDiagnostics: base.expressionDiagnostics.map((entry) => ({ ...entry })),
      }
    : createEmptyDiagnostics();

  diagnostics.expressionEngine = "";
  diagnostics.expressionEngineFallbackUsed = false;
  diagnostics.mediaPipeModelUrl = "";
  diagnostics.mediaPipeWasmUrl = "";
  diagnostics.mediaPipeAssetChecks = [];
  return diagnostics;
}

function getErrorName(error: unknown): string {
  if (error instanceof Error && error.name) return error.name;
  if (typeof error === "object" && error && "name" in error) {
    return String((error as { name: unknown }).name);
  }
  return "UnknownError";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "不明なエラー";
}

function logMediaPipeInfo(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.info(`EMOTION_RUNNER_MEDIAPIPE ${message}`);
    return;
  }
  console.info(`EMOTION_RUNNER_MEDIAPIPE ${message}`, payload);
}

function logMediaPipeError(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.error(`EMOTION_RUNNER_MEDIAPIPE ${message}`);
    return;
  }
  console.error(`EMOTION_RUNNER_MEDIAPIPE ${message}`, payload);
}

function logExpressionInfo(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.info(`EMOTION_RUNNER_EXPR ${message}`);
    return;
  }
  console.info(`EMOTION_RUNNER_EXPR ${message}`, payload);
}

function logExpressionError(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.error(`EMOTION_RUNNER_EXPR ${message}`);
    return;
  }
  console.error(`EMOTION_RUNNER_EXPR ${message}`, payload);
}

function normalizeBase(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

function resolveBaseUrl(base: string): string {
  try {
    return new URL(normalizeBase(base), document.baseURI).toString();
  } catch {
    return normalizeBase(base);
  }
}

function getMediaPipeBaseCandidates(): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const candidate of MEDIAPIPE_BASE_CANDIDATES) {
    const resolved = resolveBaseUrl(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    candidates.push(resolved);
  }
  return candidates;
}

function getTextByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

async function readAssetWithFetch(
  url: string,
  responseType: MediaPipeAssetDefinition["responseType"],
): Promise<{ status: string; byteLength: number; body: string | ArrayBuffer }> {
  const response = await fetch(url, { cache: "no-store" });
  const body = responseType === "text" ? await response.text() : await response.arrayBuffer();
  const byteLength = typeof body === "string" ? getTextByteLength(body) : body.byteLength;
  if (!(response.ok || response.status === 0) || byteLength === 0) {
    throw new Error(`fetch returned status ${response.status} for ${url}`);
  }
  return {
    status: `${response.status} ${response.statusText}`.trim(),
    byteLength,
    body,
  };
}

async function readAssetWithXhr(
  url: string,
  responseType: MediaPipeAssetDefinition["responseType"],
): Promise<{ status: string; byteLength: number; body: string | ArrayBuffer }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = responseType;
    xhr.timeout = 10000;

    xhr.onload = () => {
      const body = responseType === "text"
        ? xhr.responseText
        : xhr.response instanceof ArrayBuffer
          ? xhr.response
          : new ArrayBuffer(0);
      const byteLength = typeof body === "string" ? getTextByteLength(body) : body.byteLength;
      const ok = (xhr.status >= 200 && xhr.status < 400) || (xhr.status === 0 && byteLength > 0);
      if (!ok) {
        reject(new Error(`XHR returned status ${xhr.status || 0} for ${url}`));
        return;
      }
      resolve({ status: String(xhr.status || 0), byteLength, body });
    };

    xhr.onerror = () => reject(new Error(`XHR failed for ${url}`));
    xhr.ontimeout = () => reject(new Error(`XHR timed out for ${url}`));
    xhr.send();
  });
}

function isReadableAsset(asset: MediaPipeAssetDefinition, byteLength: number): boolean {
  return byteLength >= asset.minimumByteLength;
}

async function checkMediaPipeAsset(
  baseUrl: string,
  asset: MediaPipeAssetDefinition,
): Promise<ModelAssetCheck> {
  const url = new URL(asset.fileName, baseUrl).toString();
  let fetchSuccess = false;
  let fetchStatus = "";
  let fetchByteLength = 0;
  let fetchErrorName = "";
  let fetchErrorMessage = "";
  let xhrSuccess = false;
  let xhrStatus = "";
  let xhrByteLength = 0;
  let xhrErrorName = "";
  let xhrErrorMessage = "";

  try {
    const result = await readAssetWithFetch(url, asset.responseType);
    fetchStatus = result.status;
    fetchByteLength = result.byteLength;
    fetchSuccess = isReadableAsset(asset, result.byteLength);
    if (!fetchSuccess) {
      fetchErrorName = "UnexpectedAssetSize";
      fetchErrorMessage = `${asset.fileName} is ${result.byteLength} bytes`;
    }
  } catch (error) {
    fetchErrorName = getErrorName(error);
    fetchErrorMessage = getErrorMessage(error);
  }

  try {
    const result = await readAssetWithXhr(url, asset.responseType);
    xhrStatus = result.status;
    xhrByteLength = result.byteLength;
    xhrSuccess = isReadableAsset(asset, result.byteLength);
    if (!xhrSuccess) {
      xhrErrorName = "UnexpectedAssetSize";
      xhrErrorMessage = `${asset.fileName} is ${result.byteLength} bytes`;
    }
  } catch (error) {
    xhrErrorName = getErrorName(error);
    xhrErrorMessage = getErrorMessage(error);
  }

  const check: ModelAssetCheck = {
    assetName: asset.fileName,
    url,
    responseType: asset.responseType,
    fetchSuccess,
    fetchStatus,
    fetchByteLength,
    fetchErrorName,
    fetchErrorMessage,
    xhrSuccess,
    xhrStatus,
    xhrByteLength,
    xhrErrorName,
    xhrErrorMessage,
  };
  logMediaPipeInfo("asset-check", check);
  return check;
}

async function loadMediaPipeModelBuffer(modelUrl: string): Promise<Uint8Array> {
  const asset = MEDIAPIPE_ASSETS[0];
  if (!asset) {
    throw new Error("MediaPipe model asset definition is missing.");
  }

  try {
    const result = await readAssetWithFetch(modelUrl, "arraybuffer");
    if (isReadableAsset(asset, result.byteLength) && result.body instanceof ArrayBuffer) {
      return new Uint8Array(result.body);
    }
  } catch (error) {
    logMediaPipeInfo("model-fetch-failed-trying-xhr", {
      modelUrl,
      errorName: getErrorName(error),
      errorMessage: getErrorMessage(error),
    });
  }

  const xhrResult = await readAssetWithXhr(modelUrl, "arraybuffer");
  if (!isReadableAsset(asset, xhrResult.byteLength) || !(xhrResult.body instanceof ArrayBuffer)) {
    throw new Error(`${asset.fileName} is too small or unreadable.`);
  }
  return new Uint8Array(xhrResult.body);
}

async function loadVisionTasks(): Promise<VisionTasksModule> {
  if (!mediaPipeModulePromise) {
    mediaPipeModulePromise = import("@mediapipe/tasks-vision");
  }
  return mediaPipeModulePromise;
}

function createExpressionDiagnostic(
  stage: string,
  success: boolean,
  video?: HTMLVideoElement,
  error?: unknown,
  extra?: Partial<ExpressionRuntimeDiagnostic>,
): ExpressionRuntimeDiagnostic {
  return {
    stage,
    success,
    faceApiLoaded: selectedEngine === "faceapi",
    modelsLoaded: mediaPipeLoaded || selectedEngine === "faceapi",
    videoReadyState: video?.readyState ?? 0,
    videoWidth: video?.videoWidth ?? 0,
    videoHeight: video?.videoHeight ?? 0,
    errorName: error ? getErrorName(error) : "",
    errorMessage: error ? getErrorMessage(error) : "",
    errorStack: error instanceof Error ? error.stack ?? "" : "",
    ...extra,
  };
}

async function setupMediaPipeModels(baseDiagnostics: CameraDiagnostics): Promise<CameraDiagnostics> {
  const diagnostics = cloneDiagnostics(baseDiagnostics);
  diagnostics.expressionEngine = "mediapipe";

  if (mediaPipeLoaded && mediaPipeLandmarker) {
    diagnostics.modelUrl = selectedMediaPipeModelUrl;
    diagnostics.mediaPipeModelUrl = selectedMediaPipeModelUrl;
    diagnostics.mediaPipeWasmUrl = selectedMediaPipeBaseUrl;
    diagnostics.selectedModelCandidate = "mediapipe";
    diagnostics.notes.push("MediaPipe Face Landmarker の読み込み済みインスタンスを再利用しました。");
    return diagnostics;
  }

  let lastError: unknown = null;
  const candidates = getMediaPipeBaseCandidates();
  logMediaPipeInfo("init-start", { candidates });

  for (const baseUrl of candidates) {
    const modelUrl = new URL("face_landmarker.task", baseUrl).toString();
    const assetChecks = await Promise.all(
      MEDIAPIPE_ASSETS.map((asset) => checkMediaPipeAsset(baseUrl, asset)),
    );
    diagnostics.mediaPipeAssetChecks = assetChecks;
    diagnostics.modelAssetChecks = assetChecks;
    diagnostics.modelUrl = modelUrl;
    diagnostics.mediaPipeModelUrl = modelUrl;
    diagnostics.mediaPipeWasmUrl = baseUrl;
    diagnostics.selectedModelCandidate = `mediapipe:${baseUrl}`;

    if (!assetChecks.every((check) => check.fetchSuccess || check.xhrSuccess)) {
      lastError = new Error(`MediaPipe assets are not readable at ${baseUrl}`);
      logMediaPipeError("asset-check-failed", { baseUrl, assetChecks });
      continue;
    }

    try {
      const startedAt = performance.now();
      const [{ FaceLandmarker, FilesetResolver }, modelBuffer] = await Promise.all([
        loadVisionTasks(),
        loadMediaPipeModelBuffer(modelUrl),
      ]);
      const wasmFileset = await FilesetResolver.forVisionTasks(baseUrl);
      const landmarker = await FaceLandmarker.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetBuffer: modelBuffer,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
        minFaceDetectionConfidence: 0.35,
        minFacePresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
      });

      mediaPipeLandmarker = landmarker;
      mediaPipeLoaded = true;
      selectedEngine = "mediapipe";
      selectedMediaPipeBaseUrl = baseUrl;
      selectedMediaPipeModelUrl = modelUrl;
      mediaPipeInitDiagnostics = [
        createExpressionDiagnostic("mediapipe-init-success", true, undefined, undefined, {
          engine: "mediapipe",
          mediaPipeLoaded: true,
          mediaPipeWasmUrl: baseUrl,
          mediaPipeModelUrl: modelUrl,
          initTimeMs: Math.round(performance.now() - startedAt),
        }),
      ];
      diagnostics.expressionDiagnostics.push(...mediaPipeInitDiagnostics);
      diagnostics.notes.push("MediaPipe Face Landmarker を表情操作エンジンとして読み込みました。");
      logMediaPipeInfo("init-success", {
        wasmUrl: baseUrl,
        modelUrl,
        initTimeMs: Math.round(performance.now() - startedAt),
      });
      return diagnostics;
    } catch (error) {
      lastError = error;
      diagnostics.errorName = getErrorName(error);
      diagnostics.errorMessage = getErrorMessage(error);
      diagnostics.expressionDiagnostics.push(
        createExpressionDiagnostic("mediapipe-init-failed", false, undefined, error, {
          engine: "mediapipe",
          mediaPipeLoaded: false,
          mediaPipeWasmUrl: baseUrl,
          mediaPipeModelUrl: modelUrl,
        }),
      );
      logMediaPipeError("init-failed", {
        wasmUrl: baseUrl,
        modelUrl,
        errorName: getErrorName(error),
        errorMessage: getErrorMessage(error),
        errorStack: error instanceof Error ? error.stack ?? "" : "",
      });
    }
  }

  diagnostics.errorName = diagnostics.errorName || getErrorName(lastError);
  diagnostics.errorMessage =
    diagnostics.errorMessage || getErrorMessage(lastError) || "MediaPipe Face Landmarker を読み込めませんでした。";
  throw new MediaPipeSetupError(diagnostics.errorMessage, diagnostics, lastError);
}

export async function setupExpressionModels(
  baseDiagnostics: CameraDiagnostics | null = null,
): Promise<CameraDiagnostics> {
  const diagnostics = cloneDiagnostics(baseDiagnostics);

  try {
    return await setupMediaPipeModels(diagnostics);
  } catch (mediaPipeError) {
    const mediaPipeDiagnostics = mediaPipeError instanceof MediaPipeSetupError
      ? mediaPipeError.diagnostics
      : diagnostics;

    mediaPipeDiagnostics.expressionEngineFallbackUsed = true;
    mediaPipeDiagnostics.notes.push(
      "MediaPipe の準備に失敗したため、補助エンジンで表情操作を試します。",
    );

    try {
      const fallbackDiagnostics = await setupFaceModels(mediaPipeDiagnostics);
      fallbackDiagnostics.expressionEngine = "faceapi";
      fallbackDiagnostics.expressionEngineFallbackUsed = true;
      fallbackDiagnostics.mediaPipeModelUrl = mediaPipeDiagnostics.mediaPipeModelUrl;
      fallbackDiagnostics.mediaPipeWasmUrl = mediaPipeDiagnostics.mediaPipeWasmUrl;
      fallbackDiagnostics.mediaPipeAssetChecks = mediaPipeDiagnostics.mediaPipeAssetChecks;
      fallbackDiagnostics.expressionDiagnostics = [
        ...mediaPipeDiagnostics.expressionDiagnostics,
        ...fallbackDiagnostics.expressionDiagnostics,
      ];
      fallbackDiagnostics.notes.push(
        "MediaPipe が使えないため、face-api.js を補助エンジンとして使用します。",
      );
      selectedEngine = "faceapi";
      return fallbackDiagnostics;
    } catch (fallbackError) {
      const fallbackDiagnostics = fallbackError instanceof FaceModelSetupError
        ? fallbackError.diagnostics
        : mediaPipeDiagnostics;
      fallbackDiagnostics.expressionEngine = "tap";
      fallbackDiagnostics.expressionEngineFallbackUsed = true;
      fallbackDiagnostics.errorName = getErrorName(fallbackError);
      fallbackDiagnostics.errorMessage = getErrorMessage(fallbackError);
      fallbackDiagnostics.notes.push(
        "MediaPipe と補助エンジンの両方を準備できませんでした。タップ操作で遊べます。",
      );
      throw new ExpressionModelSetupError(
        fallbackDiagnostics.errorMessage || "表情操作を準備できませんでした。",
        fallbackDiagnostics,
        fallbackError,
      );
    }
  }
}

export function getExpressionModelBaseUrl(): string {
  if (selectedEngine === "mediapipe") return selectedMediaPipeModelUrl;
  if (selectedEngine === "faceapi") return getFaceModelBaseUrl();
  return selectedMediaPipeModelUrl;
}

function cloneScores(scores: ExpressionScoreMap): ExpressionScoreMap {
  return {
    neutral: scores.neutral,
    happy: scores.happy,
    angry: scores.angry,
    surprised: scores.surprised,
    sad: scores.sad,
  };
}

function emptyScores(): ExpressionScoreMap {
  return {
    neutral: 1,
    happy: 0,
    angry: 0,
    surprised: 0,
    sad: 0,
  };
}

function getActionLabel(expression: Expression): string {
  switch (expression) {
    case "happy":
      return "ジャンプ";
    case "angry":
      return "攻撃";
    case "surprised":
      return "ブースト";
    default:
      return "待機";
  }
}

function getStatusMessage(faceDetected: boolean, expression: Expression, confidence: number): string {
  if (!faceDetected) {
    return "顔を中央に入れてください";
  }
  if (expression !== "neutral" && confidence >= 0.22) {
    return "認識できました！";
  }
  if (confidence < 0.14) {
    return "少し明るい場所で試してください";
  }
  return "もう少し大きく表情を作ってください";
}

function getBlendshapeScore(scores: Map<string, number>, name: string): number {
  return scores.get(name) ?? scores.get(name.toLowerCase()) ?? 0;
}

function average(...values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function extractBlendshapeScores(result: FaceLandmarkerResult): Map<string, number> {
  const categories = result.faceBlendshapes[0]?.categories ?? [];
  const scores = new Map<string, number>();
  for (const category of categories) {
    scores.set(category.categoryName, category.score);
    scores.set(category.categoryName.toLowerCase(), category.score);
  }
  return scores;
}

function mapBlendshapesToExpressionScores(scores: Map<string, number>): ExpressionScoreMap {
  const smile = average(
    getBlendshapeScore(scores, "mouthSmileLeft"),
    getBlendshapeScore(scores, "mouthSmileRight"),
  );
  const cheekSquint = average(
    getBlendshapeScore(scores, "cheekSquintLeft"),
    getBlendshapeScore(scores, "cheekSquintRight"),
  );
  const browDown = average(
    getBlendshapeScore(scores, "browDownLeft"),
    getBlendshapeScore(scores, "browDownRight"),
  );
  const mouthPress = average(
    getBlendshapeScore(scores, "mouthPressLeft"),
    getBlendshapeScore(scores, "mouthPressRight"),
  );
  const eyeWide = average(
    getBlendshapeScore(scores, "eyeWideLeft"),
    getBlendshapeScore(scores, "eyeWideRight"),
  );
  const jawOpen = getBlendshapeScore(scores, "jawOpen");
  const browInnerUp = getBlendshapeScore(scores, "browInnerUp");

  const happy = Math.min(1, smile * 0.82 + cheekSquint * 0.18);
  const angry = Math.min(1, browDown * 0.72 + mouthPress * 0.28);
  const surprised = Math.min(1, jawOpen * 0.48 + eyeWide * 0.32 + browInnerUp * 0.2);
  const activeMax = Math.max(happy, angry, surprised);

  return {
    neutral: Math.max(0, Math.min(1, 1 - activeMax * 1.18)),
    happy,
    angry,
    surprised,
    sad: 0,
  };
}

function pickExpression(
  scores: ExpressionScoreMap,
  settings: MediaPipeSettings,
): { expression: Expression; confidence: number } {
  const candidates: Array<{ expression: Expression; value: number; threshold: number }> = [
    { expression: "happy", value: scores.happy, threshold: settings.happyMin },
    { expression: "angry", value: scores.angry, threshold: settings.angryMin },
    { expression: "surprised", value: scores.surprised, threshold: settings.surprisedMin },
  ];
  const best = candidates.reduce((current, candidate) =>
    candidate.value > current.value ? candidate : current,
  );

  if (best.value >= best.threshold) {
    return { expression: best.expression, confidence: best.value };
  }

  return { expression: "neutral", confidence: scores.neutral };
}

function wrapFaceApiStatus(status: import("./face").ExpressionStatus): ExpressionStatus {
  return {
    ...status,
    engine: "faceapi",
  };
}

function startFaceApiFallbackLoop(
  video: HTMLVideoElement,
  onExpression: (exp: Expression) => void,
  onRuntimeError?: (error: unknown, diagnostics: ExpressionRuntimeDiagnostic[]) => void,
  options?: StartExpressionLoopOptions,
): ExpressionEngineController {
  let lastStatus: ExpressionStatus | null = null;

  try {
    const controller = startFaceApiExpressionLoop(
      video,
      onExpression,
      onRuntimeError,
      {
        sensitivity: options?.sensitivity ?? "gentle",
        onStatus(status) {
          lastStatus = wrapFaceApiStatus(status);
          options?.onStatus?.(lastStatus);
        },
      },
    );
    return {
      engine: "faceapi",
      stop: controller.stop,
      getDiagnostics: controller.getDiagnostics,
      getStatus() {
        return lastStatus;
      },
    };
  } catch (error) {
    if (error instanceof FaceApiExpressionLoopSetupError) {
      throw new ExpressionLoopSetupError(error.message, error.diagnostics, error);
    }
    throw error;
  }
}

export function startExpressionLoop(
  video: HTMLVideoElement,
  onExpression: (exp: Expression) => void,
  onRuntimeError?: (error: unknown, diagnostics: ExpressionRuntimeDiagnostic[]) => void,
  options?: StartExpressionLoopOptions,
): ExpressionEngineController {
  if (selectedEngine === "faceapi") {
    return startFaceApiFallbackLoop(video, onExpression, onRuntimeError, options);
  }

  const landmarker = mediaPipeLandmarker;
  if (!landmarker || !mediaPipeLoaded) {
    const diagnostic = createExpressionDiagnostic(
      "mediapipe-not-loaded",
      false,
      video,
      new Error("MediaPipe Face Landmarker is not loaded."),
      { engine: "mediapipe", mediaPipeLoaded: false },
    );
    throw new ExpressionLoopSetupError(diagnostic.errorMessage, [diagnostic]);
  }

  const sensitivity = options?.sensitivity ?? "gentle";
  const settings = MEDIAPIPE_SETTINGS[sensitivity] ?? MEDIAPIPE_SETTINGS.gentle;
  const diagnostics: ExpressionRuntimeDiagnostic[] = [
    createExpressionDiagnostic("mediapipe-loop-start", true, video, undefined, {
      engine: "mediapipe",
      mediaPipeLoaded: true,
      mediaPipeModelUrl: selectedMediaPipeModelUrl,
      mediaPipeWasmUrl: selectedMediaPipeBaseUrl,
      sensitivity,
      detectionIntervalMs: settings.intervalMs,
    }),
  ];

  let stopped = false;
  let timerId = 0;
  let detectCount = 0;
  let lastExpression: Expression = "neutral";
  let pendingExpression: Expression = "neutral";
  let pendingCount = 0;
  let lastStatus: ExpressionStatus | null = null;
  let lastDetectStartedAt = performance.now();
  const smoothed = emptyScores();

  const emitStatus = (status: ExpressionStatus) => {
    lastStatus = status;
    try {
      options?.onStatus?.(status);
    } catch (error) {
      logExpressionError("status-callback-failed", {
        errorName: getErrorName(error),
        errorMessage: getErrorMessage(error),
      });
    }
  };

  const detect = () => {
    if (stopped) return;

    try {
      const startedAt = performance.now();
      lastDetectStartedAt = startedAt;
      const result = landmarker.detectForVideo(video, startedAt);
      const detectTimeMs = Math.round(performance.now() - startedAt);
      detectCount += 1;
      const faceDetected = result.faceBlendshapes.length > 0;
      const rawScores = faceDetected
        ? mapBlendshapesToExpressionScores(extractBlendshapeScores(result))
        : emptyScores();

      (Object.keys(smoothed) as Expression[]).forEach((expression) => {
        smoothed[expression] =
          (1 - settings.alpha) * smoothed[expression] +
          settings.alpha * rawScores[expression];
      });

      const picked = faceDetected
        ? pickExpression(smoothed, settings)
        : { expression: "neutral" as Expression, confidence: smoothed.neutral };

      if (picked.expression === pendingExpression) {
        pendingCount += 1;
      } else {
        pendingExpression = picked.expression;
        pendingCount = 1;
      }

      const stableNeeded = picked.expression === "neutral"
        ? settings.neutralStableDetections
        : settings.activationStableDetections;
      const nextExpression = pendingCount >= stableNeeded ? picked.expression : lastExpression;
      const confidence = nextExpression === picked.expression
        ? picked.confidence
        : smoothed[nextExpression];
      const expressionChanged = nextExpression !== lastExpression;
      const status: ExpressionStatus = {
        engine: "mediapipe",
        expression: nextExpression,
        confidence: Math.max(0, Math.min(1, confidence)),
        faceDetected,
        faceMessage: getStatusMessage(faceDetected, nextExpression, confidence),
        actionLabel: getActionLabel(nextExpression),
        rawScores: cloneScores(rawScores),
        smoothedScores: cloneScores(smoothed),
        consecutiveDetections: detectCount,
        detectionIntervalMs: settings.intervalMs,
        inputSize: 0,
        scoreThreshold: settings.scoreThreshold,
        sensitivity,
        sensitivityLabel: settings.label,
        lastErrorName: "",
        lastErrorMessage: "",
      };
      emitStatus(status);

      if (expressionChanged) {
        lastExpression = nextExpression;
        onExpression(nextExpression);
      }

      if (detectCount === 1 || expressionChanged || detectCount % 12 === 0) {
        logExpressionInfo("mediapipe-detect", {
          engine: "mediapipe",
          faceDetected,
          rawScores,
          smoothedScores: cloneScores(smoothed),
          selectedExpression: nextExpression,
          confidence: status.confidence,
          sensitivity,
          detectionIntervalMs: settings.intervalMs,
          detectTimeMs,
          detectionFps: Math.round(1000 / Math.max(1, settings.intervalMs)),
          actionTriggered: expressionChanged && nextExpression !== "neutral",
        });
      }
    } catch (error) {
      const diagnostic = createExpressionDiagnostic(
        detectCount === 0 ? "mediapipe-first-detect-failed" : "mediapipe-detect-failed",
        false,
        video,
        error,
        {
          engine: "mediapipe",
          mediaPipeLoaded,
          mediaPipeModelUrl: selectedMediaPipeModelUrl,
          mediaPipeWasmUrl: selectedMediaPipeBaseUrl,
          sensitivity,
          detectionIntervalMs: settings.intervalMs,
        },
      );
      diagnostics.push(diagnostic);
      logExpressionError(diagnostic.stage, {
        errorName: diagnostic.errorName,
        errorMessage: diagnostic.errorMessage,
        errorStack: diagnostic.errorStack,
        engine: "mediapipe",
        sensitivity,
        videoReadyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
      stopped = true;
      emitStatus({
        engine: "mediapipe",
        expression: "neutral",
        confidence: 0,
        faceDetected: false,
        faceMessage: "表情認識を停止しました",
        actionLabel: "待機",
        rawScores: emptyScores(),
        smoothedScores: cloneScores(smoothed),
        consecutiveDetections: detectCount,
        detectionIntervalMs: settings.intervalMs,
        inputSize: 0,
        scoreThreshold: settings.scoreThreshold,
        sensitivity,
        sensitivityLabel: settings.label,
        lastErrorName: diagnostic.errorName,
        lastErrorMessage: diagnostic.errorMessage,
      });
      onRuntimeError?.(error, diagnostics.map((entry) => ({ ...entry })));
      return;
    }

    timerId = window.setTimeout(detect, settings.intervalMs);
  };

  logMediaPipeInfo("loop-start", {
    engine: "mediapipe",
    modelUrl: selectedMediaPipeModelUrl,
    wasmUrl: selectedMediaPipeBaseUrl,
    sensitivity,
    detectionIntervalMs: settings.intervalMs,
    videoReadyState: video.readyState,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
  });
  timerId = window.setTimeout(detect, 0);

  return {
    engine: "mediapipe",
    stop() {
      stopped = true;
      window.clearTimeout(timerId);
      diagnostics.push(
        createExpressionDiagnostic("mediapipe-loop-stopped", true, video, undefined, {
          engine: "mediapipe",
          mediaPipeLoaded,
          elapsedSinceLastDetectMs: Math.round(performance.now() - lastDetectStartedAt),
        }),
      );
      logMediaPipeInfo("loop-stopped");
    },
    getDiagnostics() {
      return diagnostics.map((entry) => ({ ...entry }));
    },
    getStatus() {
      return lastStatus;
    },
  };
}

export function getSelectedExpressionEngine(): ExpressionEngineName {
  return selectedEngine;
}
