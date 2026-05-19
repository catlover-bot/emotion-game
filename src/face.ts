// src/face.ts
// face-api.js を使った表情認識まわり（さらに「ゆるふわ」判定）

import type {
  CameraDiagnostics,
  ModelAssetCheck,
  ModelCandidateDiagnostics,
} from "./camera";
import type { Expression } from "./types";

type FaceApiModule = typeof import("face-api.js");
type ModelAssetResponseType = "text" | "arraybuffer";
type ModelAssetDefinition = {
  fileName: string;
  responseType: ModelAssetResponseType;
};
type XhrAssetLoad = {
  status: number;
  byteLength: number;
  contentType: string;
  body: string | ArrayBuffer;
};

const MODEL_ASSETS: ModelAssetDefinition[] = [
  {
    fileName: "tiny_face_detector_model-weights_manifest.json",
    responseType: "text",
  },
  {
    fileName: "tiny_face_detector_model-shard1",
    responseType: "arraybuffer",
  },
  {
    fileName: "face_expression_model-weights_manifest.json",
    responseType: "text",
  },
  {
    fileName: "face_expression_model-shard1",
    responseType: "arraybuffer",
  },
];

const MODEL_BASE_CANDIDATES = [
  "./models",
  "models",
  "./models/",
  "models/",
  new URL("./models/", document.baseURI).toString(),
  new URL("./models/", window.location.href).toString(),
];

let faceApiModule: FaceApiModule | null = null;
let faceApiPromise: Promise<FaceApiModule> | null = null;
let modelsLoaded = false;
let selectedModelBaseCandidate = "./models";
let originalFetch: typeof fetch | null = null;
let wrappedModelFetch: typeof fetch | null = null;

export class FaceModelSetupError extends Error {
  readonly diagnostics: CameraDiagnostics;

  constructor(message: string, diagnostics: CameraDiagnostics, cause?: unknown) {
    super(message);
    this.name = cause instanceof Error && cause.name ? cause.name : "FaceModelSetupError";
    this.diagnostics = diagnostics;
  }
}

export function getFaceModelBaseUrl(): string {
  return resolveCandidateBaseUrl(selectedModelBaseCandidate);
}

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
  };
}

function cloneDiagnostics(base: CameraDiagnostics | null): CameraDiagnostics {
  if (!base) {
    return createEmptyDiagnostics();
  }

  return {
    ...base,
    phase: "models",
    errorName: "",
    errorMessage: "",
    attempts: base.attempts.map((attempt) => ({ ...attempt })),
    notes: [...base.notes],
    modelUrl: "",
    selectedModelCandidate: "",
    modelAssetChecks: [],
    modelCandidates: [],
  };
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

function logModelInfo(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.info(`EMOTION_RUNNER_MODEL ${message}`);
    return;
  }
  console.info(`EMOTION_RUNNER_MODEL ${message}`, payload);
}

function logModelError(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.error(`EMOTION_RUNNER_MODEL ${message}`);
    return;
  }
  console.error(`EMOTION_RUNNER_MODEL ${message}`, payload);
}

function getRawFetch(): typeof fetch {
  if (!originalFetch) {
    originalFetch = window.fetch.bind(window);
  }
  return originalFetch;
}

function normalizeCandidate(candidate: string): string {
  return candidate.endsWith("/") ? candidate : `${candidate}/`;
}

function getModelBaseCandidates(): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const candidate of MODEL_BASE_CANDIDATES) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    candidates.push(candidate);
  }

  return candidates;
}

function resolveAbsoluteUrl(url: string): string {
  try {
    return new URL(url, document.baseURI).toString();
  } catch {
    return url;
  }
}

function resolveCandidateBaseUrl(candidate: string): string {
  return resolveAbsoluteUrl(normalizeCandidate(candidate));
}

function getAssetUrl(baseUrl: string, fileName: string): string {
  return new URL(fileName, baseUrl).toString();
}

function getTextByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.url;
  }
  return String(input);
}

function isModelAssetRequest(url: string): boolean {
  try {
    const resolved = new URL(url, document.baseURI);
    return resolved.pathname.includes("/models/");
  } catch {
    return url.includes("/models/") || url.startsWith("./models") || url.startsWith("models/");
  }
}

function getResponseTypeForUrl(url: string): ModelAssetResponseType {
  return url.endsWith(".json") ? "text" : "arraybuffer";
}

async function loadLocalAssetWithXHR(
  url: string,
  responseType: ModelAssetResponseType,
): Promise<XhrAssetLoad> {
  return new Promise<XhrAssetLoad>((resolve, reject) => {
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
      const byteLength = responseType === "text"
        ? getTextByteLength(xhr.responseText ?? "")
        : body instanceof ArrayBuffer
          ? body.byteLength
          : 0;
      const status = xhr.status;
      const success = (status >= 200 && status < 400) || (status === 0 && byteLength > 0);

      if (!success) {
        reject(
          new DOMException(
            `XHR failed with status ${status || 0} for ${url}`,
            "NetworkError",
          ),
        );
        return;
      }

      resolve({
        status,
        byteLength,
        contentType: xhr.getResponseHeader("Content-Type") ?? "",
        body,
      });
    };

    xhr.onerror = () => {
      reject(new DOMException(`XHR load failed for ${url}`, "NetworkError"));
    };

    xhr.ontimeout = () => {
      reject(new DOMException(`XHR timed out for ${url}`, "TimeoutError"));
    };

    xhr.send();
  });
}

async function runFetchCheck(
  url: string,
  responseType: ModelAssetResponseType,
): Promise<{
  success: boolean;
  status: string;
  byteLength: number;
  errorName: string;
  errorMessage: string;
}> {
  try {
    const response = await getRawFetch()(url, { cache: "no-store" });
    const body = responseType === "text"
      ? await response.text()
      : await response.arrayBuffer();
    const byteLength = responseType === "text"
      ? getTextByteLength(body as string)
      : (body as ArrayBuffer).byteLength;
    const success = response.status < 400 || (response.status === 0 && byteLength > 0);

    return {
      success,
      status: `${response.status} ${response.statusText}`.trim(),
      byteLength,
      errorName: success ? "" : "FetchStatusError",
      errorMessage: success
        ? ""
        : `fetch returned status ${response.status} for ${response.url || url}`,
    };
  } catch (error) {
    return {
      success: false,
      status: "",
      byteLength: 0,
      errorName: getErrorName(error),
      errorMessage: getErrorMessage(error),
    };
  }
}

async function runXhrCheck(
  url: string,
  responseType: ModelAssetResponseType,
): Promise<{
  success: boolean;
  status: string;
  byteLength: number;
  errorName: string;
  errorMessage: string;
}> {
  try {
    const result = await loadLocalAssetWithXHR(url, responseType);
    return {
      success: true,
      status: String(result.status || 0),
      byteLength: result.byteLength,
      errorName: "",
      errorMessage: "",
    };
  } catch (error) {
    return {
      success: false,
      status: "",
      byteLength: 0,
      errorName: getErrorName(error),
      errorMessage: getErrorMessage(error),
    };
  }
}

async function checkModelAsset(
  baseUrl: string,
  asset: ModelAssetDefinition,
): Promise<ModelAssetCheck> {
  const url = getAssetUrl(baseUrl, asset.fileName);
  const [fetchResult, xhrResult] = await Promise.all([
    runFetchCheck(url, asset.responseType),
    runXhrCheck(url, asset.responseType),
  ]);

  const check: ModelAssetCheck = {
    assetName: asset.fileName,
    url,
    responseType: asset.responseType,
    fetchSuccess: fetchResult.success,
    fetchStatus: fetchResult.status,
    fetchByteLength: fetchResult.byteLength,
    fetchErrorName: fetchResult.errorName,
    fetchErrorMessage: fetchResult.errorMessage,
    xhrSuccess: xhrResult.success,
    xhrStatus: xhrResult.status,
    xhrByteLength: xhrResult.byteLength,
    xhrErrorName: xhrResult.errorName,
    xhrErrorMessage: xhrResult.errorMessage,
  };

  logModelInfo("asset-check", check);
  return check;
}

function toResponseFromXhr(
  url: string,
  responseType: ModelAssetResponseType,
  result: XhrAssetLoad,
): Response {
  const contentType = result.contentType ||
    (responseType === "text" ? "application/json" : "application/octet-stream");

  return new Response(result.body, {
    status: 200,
    statusText: "OK",
    headers: {
      "Content-Type": contentType,
      "X-Emotion-Runner-Source": "xhr-fallback",
      "X-Emotion-Runner-Url": url,
    },
  });
}

function ensureModelFetchFallback(faceapi: FaceApiModule) {
  if (!wrappedModelFetch) {
    const baseFetch = getRawFetch();

    // Capacitor iOS では local asset の fetch が custom scheme で落ちることがあるため、
    // /models/ 配下だけ XHR にフォールバックする。
    wrappedModelFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = getRequestUrl(input);
      const absoluteUrl = resolveAbsoluteUrl(requestUrl);

      if (!isModelAssetRequest(requestUrl)) {
        return baseFetch(input, init);
      }

      try {
        const response = await baseFetch(input, init);
        if (response.ok || response.status === 0) {
          return response;
        }

        logModelInfo("fetch-non-ok-using-xhr", {
          url: absoluteUrl,
          status: response.status,
          statusText: response.statusText,
        });
        const xhrResult = await loadLocalAssetWithXHR(
          absoluteUrl,
          getResponseTypeForUrl(absoluteUrl),
        );
        return toResponseFromXhr(absoluteUrl, getResponseTypeForUrl(absoluteUrl), xhrResult);
      } catch (fetchError) {
        logModelInfo("fetch-failed-using-xhr", {
          url: absoluteUrl,
          errorName: getErrorName(fetchError),
          errorMessage: getErrorMessage(fetchError),
        });

        try {
          const xhrResult = await loadLocalAssetWithXHR(
            absoluteUrl,
            getResponseTypeForUrl(absoluteUrl),
          );
          return toResponseFromXhr(absoluteUrl, getResponseTypeForUrl(absoluteUrl), xhrResult);
        } catch (xhrError) {
          logModelError("fetch-and-xhr-failed", {
            url: absoluteUrl,
            fetchErrorName: getErrorName(fetchError),
            fetchErrorMessage: getErrorMessage(fetchError),
            xhrErrorName: getErrorName(xhrError),
            xhrErrorMessage: getErrorMessage(xhrError),
          });
          throw fetchError;
        }
      }
    };

    window.fetch = wrappedModelFetch;
    globalThis.fetch = wrappedModelFetch;
    logModelInfo("fetch-wrapper-installed");
  }

  if (wrappedModelFetch) {
    faceapi.env.monkeyPatch({ fetch: wrappedModelFetch });
  }
}

async function inspectCandidate(candidate: string): Promise<ModelCandidateDiagnostics> {
  const resolvedBaseUrl = resolveCandidateBaseUrl(candidate);
  const assetChecks = await Promise.all(
    MODEL_ASSETS.map((asset) => checkModelAsset(resolvedBaseUrl, asset)),
  );

  return {
    candidate,
    resolvedBaseUrl,
    allAssetsReadable: assetChecks.every((check) => check.fetchSuccess || check.xhrSuccess),
    usedXhrFallback: assetChecks.some((check) => !check.fetchSuccess && check.xhrSuccess),
    faceApiAttempted: false,
    faceApiSucceeded: false,
    faceApiErrorName: "",
    faceApiErrorMessage: "",
    assetChecks,
  };
}

async function loadFaceApi(): Promise<FaceApiModule> {
  if (faceApiModule) return faceApiModule;

  if (!faceApiPromise) {
    faceApiPromise = import("face-api.js")
      .then((module) => {
        faceApiModule = module;
        return module;
      })
      .catch((error: unknown) => {
        faceApiPromise = null;
        throw error;
      });
  }

  return faceApiPromise;
}

/**
 * face-api のモデルをロード
 */
export async function setupFaceModels(
  baseDiagnostics: CameraDiagnostics | null = null,
): Promise<CameraDiagnostics> {
  const diagnostics = cloneDiagnostics(baseDiagnostics);

  if (modelsLoaded) {
    diagnostics.modelUrl = resolveCandidateBaseUrl(selectedModelBaseCandidate);
    diagnostics.selectedModelCandidate = selectedModelBaseCandidate;
    diagnostics.notes.push("前回の読み込み済みモデルを再利用しました。");
    return diagnostics;
  }

  const faceapi = await loadFaceApi();
  ensureModelFetchFallback(faceapi);

  const candidates = getModelBaseCandidates();
  let lastError: unknown = null;

  logModelInfo("models-loading", { candidates });

  for (const candidate of candidates) {
    const candidateDiagnostics = await inspectCandidate(candidate);
    diagnostics.modelCandidates.push(candidateDiagnostics);
    diagnostics.modelAssetChecks = candidateDiagnostics.assetChecks;
    diagnostics.modelUrl = candidateDiagnostics.resolvedBaseUrl;
    diagnostics.selectedModelCandidate = candidate;

    logModelInfo("candidate-check-complete", {
      candidate,
      resolvedBaseUrl: candidateDiagnostics.resolvedBaseUrl,
      allAssetsReadable: candidateDiagnostics.allAssetsReadable,
      usedXhrFallback: candidateDiagnostics.usedXhrFallback,
    });

    if (!candidateDiagnostics.allAssetsReadable) {
      candidateDiagnostics.faceApiErrorName = "AssetCheckFailed";
      candidateDiagnostics.faceApiErrorMessage =
        "manifest または shard を読み取れないため、この候補はスキップしました。";
      continue;
    }

    candidateDiagnostics.faceApiAttempted = true;
    try {
      logModelInfo("candidate-load-start", {
        candidate,
        resolvedBaseUrl: candidateDiagnostics.resolvedBaseUrl,
      });
      await faceapi.nets.tinyFaceDetector.loadFromUri(candidate);
      await faceapi.nets.faceExpressionNet.loadFromUri(candidate);
      candidateDiagnostics.faceApiSucceeded = true;
      modelsLoaded = true;
      selectedModelBaseCandidate = candidate;
      diagnostics.modelUrl = candidateDiagnostics.resolvedBaseUrl;
      diagnostics.selectedModelCandidate = candidate;
      diagnostics.notes.push(
        candidateDiagnostics.usedXhrFallback
          ? "fetch で失敗した model asset は XHR で補完して読み込みました。"
          : "相対パスの model asset をそのまま読み込めました。",
      );
      logModelInfo("candidate-load-success", {
        candidate,
        resolvedBaseUrl: candidateDiagnostics.resolvedBaseUrl,
      });
      logModelInfo("models-ready", {
        selectedModelCandidate: selectedModelBaseCandidate,
        modelUrl: diagnostics.modelUrl,
      });
      return diagnostics;
    } catch (error) {
      lastError = error;
      candidateDiagnostics.faceApiErrorName = getErrorName(error);
      candidateDiagnostics.faceApiErrorMessage = getErrorMessage(error);
      diagnostics.errorName = candidateDiagnostics.faceApiErrorName;
      diagnostics.errorMessage = candidateDiagnostics.faceApiErrorMessage;
      logModelError("candidate-load-failed", {
        candidate,
        resolvedBaseUrl: candidateDiagnostics.resolvedBaseUrl,
        errorName: candidateDiagnostics.faceApiErrorName,
        errorMessage: candidateDiagnostics.faceApiErrorMessage,
      });
    }
  }

  diagnostics.errorName = diagnostics.errorName || getErrorName(lastError);
  diagnostics.errorMessage =
    diagnostics.errorMessage || getErrorMessage(lastError) || "表情認識モデルの読み込みに失敗しました。";
  diagnostics.notes.push(
    "Capacitor iOS では absolute URL と relative URL の扱いが異なるため、複数の model パス候補を順番に確認しました。",
  );

  throw new FaceModelSetupError(
    diagnostics.errorMessage || "表情認識モデルの読み込みに失敗しました。",
    diagnostics,
    lastError,
  );
}

/**
 * 「超ゆるめ」＆「スムージング入り」の表情ループ
 */
export function startExpressionLoop(
  video: HTMLVideoElement,
  onExpression: (exp: Expression) => void,
): void {
  if (!faceApiModule) {
    console.warn("startExpressionLoop called before face-api was loaded");
    return;
  }

  if (!modelsLoaded) {
    console.warn("startExpressionLoop called before models loaded");
  }

  const faceapi = faceApiModule;

  // スムージング用スコア
  const smoothed: Record<Expression, number> = {
    neutral: 0.7,
    happy: 0.1,
    angry: 0.05,
    surprised: 0.05,
    sad: 0.1,
  };

  let lastExp: Expression = "neutral";

  // α を少し小さくして「ブレにくく・でも反応はそれなりに」
  const ALPHA = 0.25;

  // ★ 判定をかなりゆるくした値
  const HAPPY_MIN = 0.12; // ちょっと口角上がっただけでも入りやすく
  const HAPPY_MARGIN = 0.02;
  const ANGRY_MIN = 0.16;
  const SURPRISED_MIN = 0.20;
  const SAD_MIN = 0.18;

  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 224,
    scoreThreshold: 0.35, // 検出自体も少し甘め
  });

  async function loop() {
    try {
      const result = await faceapi
        .detectSingleFace(video, options)
        .withFaceExpressions();

      if (result && result.expressions) {
        const exps = result.expressions;

        // 1) 生のスコアをスムージング
        (Object.keys(smoothed) as Expression[]).forEach((k) => {
          const raw = exps[k] ?? 0;
          smoothed[k] = (1 - ALPHA) * smoothed[k] + ALPHA * raw;
        });

        // 2) まず最大のものを取る
        let best: Expression = lastExp;
        let bestVal = -1;

        (Object.keys(smoothed) as Expression[]).forEach((k) => {
          const v = smoothed[k];
          if (v > bestVal) {
            bestVal = v;
            best = k;
          }
        });

        const s = smoothed;

        // 3) 「甘やかし」ルール
        //   - happy / angry / surprised / sad を優先的に取りやすく
        if (s.happy > HAPPY_MIN && s.happy + HAPPY_MARGIN >= s.neutral) {
          best = "happy";
        } else if (s.angry > ANGRY_MIN && s.angry + 0.03 >= s.neutral) {
          best = "angry";
        } else if (s.surprised > SURPRISED_MIN && s.surprised >= s.neutral) {
          best = "surprised";
        } else if (s.sad > SAD_MIN && s.sad >= s.neutral) {
          best = "sad";
        } else if (s.neutral > 0.7) {
          best = "neutral";
        }

        // 4) 直前と違うときだけ通知（ピカピカ変わらないように）
        if (best !== lastExp) {
          lastExp = best;
          console.log("expression =>", best, "(smoothed:", { ...smoothed }, ")");
          onExpression(best);
        }
      } else {
        // 顔が映ってないときはゆっくり neutral に寄せる
        smoothed.neutral = (1 - ALPHA) * smoothed.neutral + ALPHA * 1.0;

        const fallback: Expression = "neutral";
        if (fallback !== lastExp) {
          lastExp = fallback;
          console.log("no face detected, fallback => neutral");
          onExpression(fallback);
        }
      }
    } catch (error) {
      console.error("表情検出中にエラー:", error);
    }

    // だいたい 6〜8fps 程度
    setTimeout(loop, 130);
  }

  loop();
}
