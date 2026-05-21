export type CameraErrorKind = "denied" | "unsupported" | "unavailable" | "unknown";

export type CameraAttemptDiagnostics = {
  attemptNumber: number;
  label: string;
  constraintsText: string;
  success: boolean;
  errorName: string;
  errorMessage: string;
  streamTrackCount: number;
  trackSummaryText: string;
  playResult: string;
  readyEvent: string;
  videoReadyState: number;
  videoWidth: number;
  videoHeight: number;
};

export type ModelAssetCheck = {
  assetName: string;
  url: string;
  responseType: "text" | "arraybuffer";
  fetchSuccess: boolean;
  fetchStatus: string;
  fetchByteLength: number;
  fetchErrorName: string;
  fetchErrorMessage: string;
  xhrSuccess: boolean;
  xhrStatus: string;
  xhrByteLength: number;
  xhrErrorName: string;
  xhrErrorMessage: string;
};

export type ModelCandidateDiagnostics = {
  candidate: string;
  resolvedBaseUrl: string;
  allAssetsReadable: boolean;
  usedXhrFallback: boolean;
  faceApiAttempted: boolean;
  faceApiSucceeded: boolean;
  faceApiErrorName: string;
  faceApiErrorMessage: string;
  assetChecks: ModelAssetCheck[];
};

export type ExpressionRuntimeDiagnostic = {
  stage: string;
  success: boolean;
  engine?: string;
  faceApiLoaded: boolean;
  mediaPipeLoaded?: boolean;
  modelsLoaded: boolean;
  videoReadyState: number;
  videoWidth: number;
  videoHeight: number;
  errorName: string;
  errorMessage: string;
  errorStack: string;
  mediaPipeModelUrl?: string;
  mediaPipeWasmUrl?: string;
  fallbackUsed?: boolean;
  initTimeMs?: number;
  detectTimeMs?: number;
  detectionFps?: number;
  detectionIntervalMs?: number;
  sensitivity?: string;
  selectedExpression?: string;
  faceDetected?: boolean;
  elapsedSinceLastDetectMs?: number;
};

export type CameraDiagnostics = {
  phase: "camera" | "models" | "expression";
  errorName: string;
  errorMessage: string;
  mediaDevicesExists: boolean;
  getUserMediaExists: boolean;
  isSecureContext: boolean;
  href: string;
  origin: string;
  attempts: CameraAttemptDiagnostics[];
  videoReadyState: number;
  videoWidth: number;
  videoHeight: number;
  notes: string[];
  modelUrl: string;
  selectedModelCandidate: string;
  expressionEngine?: string;
  expressionEngineFallbackUsed?: boolean;
  mediaPipeModelUrl?: string;
  mediaPipeWasmUrl?: string;
  mediaPipeAssetChecks?: ModelAssetCheck[];
  modelAssetChecks: ModelAssetCheck[];
  modelCandidates: ModelCandidateDiagnostics[];
  expressionDiagnostics: ExpressionRuntimeDiagnostic[];
};

export class CameraSetupError extends Error {
  readonly kind: CameraErrorKind;
  readonly reasonName: string;
  readonly diagnostics: CameraDiagnostics;

  constructor(
    kind: CameraErrorKind,
    message: string,
    reasonName: string,
    diagnostics: CameraDiagnostics,
  ) {
    super(message);
    this.kind = kind;
    this.reasonName = reasonName;
    this.diagnostics = diagnostics;
    this.name = reasonName || "CameraSetupError";
  }
}

const CAMERA_ATTEMPT_TIMEOUT_MS = 5000;

let activeStream: MediaStream | null = null;

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getLocationHref(): string {
  try {
    return window.location.href || "<empty>";
  } catch {
    return "<unavailable>";
  }
}

function getLocationOrigin(): string {
  try {
    return window.location.origin || "<empty>";
  } catch {
    return "<unavailable>";
  }
}

function createDiagnostics(): CameraDiagnostics {
  return {
    phase: "camera",
    errorName: "",
    errorMessage: "",
    mediaDevicesExists: typeof navigator !== "undefined" && "mediaDevices" in navigator,
    getUserMediaExists:
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function",
    isSecureContext: window.isSecureContext,
    href: getLocationHref(),
    origin: getLocationOrigin(),
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

function snapshotVideo(video: HTMLVideoElement, diagnostics: CameraDiagnostics) {
  diagnostics.videoReadyState = video.readyState;
  diagnostics.videoWidth = video.videoWidth;
  diagnostics.videoHeight = video.videoHeight;
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

function describeTracks(stream: MediaStream): string {
  const tracks = stream.getTracks();
  if (tracks.length === 0) return "0 tracks";

  return tracks
    .map((track) => {
      const label = track.label?.trim() || "label unavailable";
      return `${track.kind}: ${label}`;
    })
    .join(" / ");
}

function updateAttemptVideo(attempt: CameraAttemptDiagnostics, video: HTMLVideoElement) {
  attempt.videoReadyState = video.readyState;
  attempt.videoWidth = video.videoWidth;
  attempt.videoHeight = video.videoHeight;
}

function logCameraInfo(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.info(`EMOTION_RUNNER_CAMERA ${message}`);
    return;
  }
  console.info(`EMOTION_RUNNER_CAMERA ${message}`, payload);
}

function logCameraError(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.error(`EMOTION_RUNNER_CAMERA ${message}`);
    return;
  }
  console.error(`EMOTION_RUNNER_CAMERA ${message}`, payload);
}

function isVideoUsable(video: HTMLVideoElement): boolean {
  return (
    video.videoWidth > 0 ||
    video.videoHeight > 0 ||
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  );
}

function createVideoReadyWaiter(video: HTMLVideoElement, timeoutMs: number): {
  promise: Promise<string>;
  cancel(): void;
} {
  if (isVideoUsable(video)) {
    return {
      promise: Promise.resolve("already-ready"),
      cancel() {
        // Nothing to clean up when the video is already ready.
      },
    };
  }

  const events = ["loadedmetadata", "loadeddata", "canplay", "canplaythrough", "resize"] as const;
  let timeoutId = 0;
  let cleanedUp = false;

  const onReady = (event: Event) => {
    if (!isVideoUsable(video)) return;
    cleanup();
    resolveReady?.(event.type);
  };

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    window.clearTimeout(timeoutId);
    events.forEach((eventName) => {
      video.removeEventListener(eventName, onReady);
    });
  };

  let resolveReady: ((eventType: string) => void) | null = null;

  const promise = new Promise<string>((resolve, reject) => {
    resolveReady = resolve;

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new DOMException("Timed out while waiting for camera video metadata.", "AbortError"));
    }, timeoutMs);

    events.forEach((eventName) => {
      video.addEventListener(eventName, onReady, { once: false });
    });
  });

  return {
    promise,
    cancel() {
      window.clearTimeout(timeoutId);
      events.forEach((eventName) => {
        video.removeEventListener(eventName, onReady);
      });
    },
  };
}

function configureVideoElement(video: HTMLVideoElement) {
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
}

function normalizeCameraError(error: unknown, diagnostics: CameraDiagnostics): CameraSetupError {
  if (error instanceof CameraSetupError) return error;

  const reasonName = getErrorName(error);
  const reasonMessage = getErrorMessage(error);

  diagnostics.phase = "camera";
  diagnostics.errorName = reasonName;
  diagnostics.errorMessage = reasonMessage;

  if (reasonName === "NotAllowedError" || reasonName === "SecurityError") {
    return new CameraSetupError(
      "denied",
      "カメラの使用が許可されていません。iPhoneの「設定」→「表情ランナー」→「カメラ」をオンにしてください。",
      reasonName,
      diagnostics,
    );
  }

  if (reasonName === "NotReadableError" || reasonName === "AbortError") {
    return new CameraSetupError(
      "unavailable",
      "カメラを他のアプリが使用している可能性があります。他のカメラアプリを閉じてから、もう一度お試しください。",
      reasonName,
      diagnostics,
    );
  }

  if (reasonName === "NotFoundError") {
    return new CameraSetupError(
      "unavailable",
      "使用できるカメラが見つかりませんでした。",
      reasonName,
      diagnostics,
    );
  }

  if (reasonName === "OverconstrainedError") {
    return new CameraSetupError(
      "unavailable",
      "カメラ条件が合わなかったため、標準設定で再試行しましたが起動できませんでした。",
      reasonName,
      diagnostics,
    );
  }

  if (reasonName === "TypeError") {
    return new CameraSetupError(
      "unknown",
      "カメラ設定の確認に失敗しました。標準設定でも起動できませんでした。",
      reasonName,
      diagnostics,
    );
  }

  return new CameraSetupError(
    "unknown",
    "カメラを起動できませんでした。もう一度お試しください。",
    reasonName,
    diagnostics,
  );
}

async function runCameraAttempt(
  video: HTMLVideoElement,
  constraints: MediaStreamConstraints,
  attemptNumber: number,
  label: string,
  diagnostics: CameraDiagnostics,
): Promise<MediaStream> {
  const attempt: CameraAttemptDiagnostics = {
    attemptNumber,
    label,
    constraintsText: safeJson(constraints),
    success: false,
    errorName: "",
    errorMessage: "",
    streamTrackCount: 0,
    trackSummaryText: "",
    playResult: "未実行",
    readyEvent: "",
    videoReadyState: video.readyState,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
  };
  diagnostics.attempts.push(attempt);

  logCameraInfo("attempt-start", {
    attempt: attemptNumber,
    label,
    constraints,
    secureContext: diagnostics.isSecureContext,
  });

  let stream: MediaStream | null = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    attempt.streamTrackCount = stream.getTracks().length;
    attempt.trackSummaryText = describeTracks(stream);
    logCameraInfo("attempt-stream-created", {
      attempt: attemptNumber,
      trackCount: attempt.streamTrackCount,
      tracks: attempt.trackSummaryText,
    });

    configureVideoElement(video);
    video.srcObject = stream;

    const readyWaiter = createVideoReadyWaiter(video, CAMERA_ATTEMPT_TIMEOUT_MS);

    try {
      await video.play();
      attempt.playResult = "成功";
    } catch (error) {
      readyWaiter.cancel();
      attempt.playResult = `失敗 (${getErrorName(error)}: ${getErrorMessage(error)})`;
      throw error;
    }

    attempt.readyEvent = await readyWaiter.promise;
    updateAttemptVideo(attempt, video);
    snapshotVideo(video, diagnostics);

    if (!isVideoUsable(video)) {
      throw new DOMException("Camera video did not become ready.", "AbortError");
    }

    attempt.success = true;
    logCameraInfo("attempt-success", {
      attempt: attemptNumber,
      readyEvent: attempt.readyEvent,
      videoReadyState: attempt.videoReadyState,
      videoWidth: attempt.videoWidth,
      videoHeight: attempt.videoHeight,
      tracks: attempt.trackSummaryText,
    });

    return stream;
  } catch (error) {
    updateAttemptVideo(attempt, video);
    snapshotVideo(video, diagnostics);
    attempt.errorName = getErrorName(error);
    attempt.errorMessage = getErrorMessage(error);

    logCameraError("attempt-failed", {
      attempt: attemptNumber,
      label,
      constraints,
      errorName: attempt.errorName,
      errorMessage: attempt.errorMessage,
      videoReadyState: attempt.videoReadyState,
      videoWidth: attempt.videoWidth,
      videoHeight: attempt.videoHeight,
      playResult: attempt.playResult,
      tracks: attempt.trackSummaryText,
    });

    stopTracks(stream);
    if (video.srcObject === stream) {
      video.srcObject = null;
    }
    throw error;
  }
}

export async function setupCamera(video: HTMLVideoElement): Promise<CameraDiagnostics> {
  const diagnostics = createDiagnostics();

  if (!navigator.mediaDevices?.getUserMedia) {
    diagnostics.errorName = "UnsupportedError";
    diagnostics.errorMessage = "navigator.mediaDevices.getUserMedia is unavailable";
    throw new CameraSetupError(
      "unsupported",
      "この端末やブラウザではカメラ機能を利用できません。",
      "UnsupportedError",
      diagnostics,
    );
  }

  configureVideoElement(video);
  stopTracks(activeStream);
  activeStream = null;
  video.srcObject = null;

  const preferredConstraints: MediaStreamConstraints = {
    audio: false,
    video: {
      facingMode: { ideal: "user" },
      width: { ideal: 640 },
      height: { ideal: 480 },
    },
  };
  const fallbackConstraints: MediaStreamConstraints = {
    audio: false,
    video: true,
  };

  try {
    activeStream = await runCameraAttempt(
      video,
      preferredConstraints,
      1,
      "前面カメラ優先",
      diagnostics,
    );
  } catch (firstError) {
    diagnostics.notes.push(
      "前面カメラ優先の条件で起動できなかったため、標準設定で再試行しました。",
    );
    try {
      activeStream = await runCameraAttempt(
        video,
        fallbackConstraints,
        2,
        "標準設定",
        diagnostics,
      );
    } catch (secondError) {
      stopTracks(activeStream);
      activeStream = null;
      video.srcObject = null;
      const finalError = secondError ?? firstError;
      throw normalizeCameraError(finalError, diagnostics);
    }
  }

  snapshotVideo(video, diagnostics);
  diagnostics.errorName = "";
  diagnostics.errorMessage = "";
  return diagnostics;
}

export function stopCamera(video: HTMLVideoElement): void {
  stopTracks(activeStream);
  activeStream = null;
  video.srcObject = null;
}
