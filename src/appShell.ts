import type { CameraDiagnostics } from "./camera";
import type { ExpressionStatus } from "./expressionEngine";
import type { ControlMode, Expression, ExpressionSensitivity } from "./types";
import type { GameAction, GameSnapshot } from "./game";
import type { Rarity } from "./cosmetics";

export type CameraUiState =
  | "idle"
  | "requesting"
  | "ready"
  | "expressionUnavailable"
  | "denied"
  | "unsupported"
  | "error";

type OverlayScreen =
  | "none"
  | "onboarding"
  | "camera"
  | "cameraDenied"
  | "cameraError"
  | "howToPlay"
  | "practice"
  | "privacy"
  | "settings"
  | "ranking"
  | "recovery";

type PracticeMode = "learn" | "start";
type TutorialExpression = Exclude<Expression, "neutral">;

type AppShellOptions = {
  root: HTMLElement;
  onStartGame(): void;
  onOpenCustomize(): void;
  onOpenGacha(): void;
  onOpenRanking(): void;
  onBackToTitle(): void;
  onCycleCharacter(): void;
  onCycleBackground(): void;
  onCycleItem(): void;
  onRollGacha(): void;
  onEquipLastGachaResult(): void;
  onShare(): void;
  onRetryGame(): void;
  onEnableCamera(): void;
  onContinueWithoutCamera(): void;
  onCloseOverlay(): void;
  onFinishTutorial(): void;
  onTouchAction(action: GameAction): void;
  onSetControlMode(mode: ControlMode): void;
  onSetExpressionSensitivity(sensitivity: ExpressionSensitivity): void;
  onOverlayChanged(): void;
  onResetTutorial(): void;
  onResetData(): void;
};

type AppShellState = {
  overlay: OverlayScreen;
  game: GameSnapshot | null;
  cameraState: CameraUiState;
  cameraTitle: string;
  cameraMessage: string;
  cameraDiagnostics: CameraDiagnostics | null;
  cameraDiagnosticsExpanded: boolean;
  expression: Expression;
  expressionStatus: ExpressionStatus | null;
  controlMode: ControlMode;
  expressionSensitivity: ExpressionSensitivity;
  tutorialSeen: Record<TutorialExpression, boolean>;
  practiceMode: PracticeMode;
  practiceStep: number;
  practiceHoldProgress: number;
  confirmResetData: boolean;
  settingsNotice: string;
  settingsDiagnosticsExpanded: boolean;
  expressionNavFocusIndex: number;
  expressionNavExpression: Expression | null;
  expressionNavHoldStartedAt: number;
  expressionNavHoldProgress: number;
  expressionNavNotice: string;
  expressionNavLastTriggeredAt: number;
};

const APP_NAME = "表情ランナー";

const TUTORIAL_ORDER: TutorialExpression[] = [
  "happy",
  "angry",
  "surprised",
];
const EXPRESSION_STATUS_RENDER_INTERVAL_MS = 180;
const NAV_CONFIRM_HOLD_MS = 700;
const NAV_NEXT_HOLD_MS = 500;
const NAV_BACK_HOLD_MS = 500;
const NAV_TRIGGER_COOLDOWN_MS = 420;

const EXPRESSION_COPY: Record<
  TutorialExpression,
  { label: string; action: string; summary: string; emoji: string }
> = {
  happy: {
    label: "笑顔",
    action: "ジャンプ",
    summary: "笑顔でジャンプします。",
    emoji: "😄",
  },
  angry: {
    label: "怒った顔",
    action: "攻撃",
    summary: "怒った顔で攻撃します。",
    emoji: "🔥",
  },
  surprised: {
    label: "驚いた顔",
    action: "ブースト",
    summary: "驚いた顔で前にブーストします。",
    emoji: "😲",
  },
  sad: {
    label: "悲しい顔",
    action: "戻る / 調整",
    summary: "悲しい顔で戻る操作やゲージ調整ができます。",
    emoji: "😢",
  },
};

function createEmptyTutorialSeen(): Record<TutorialExpression, boolean> {
  return {
    happy: false,
    angry: false,
    surprised: false,
    sad: false,
  };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getExpressionName(expression: Expression): string {
  switch (expression) {
    case "happy":
      return "笑顔";
    case "angry":
      return "怒った顔";
    case "surprised":
      return "驚いた顔";
    case "sad":
      return "悲しい顔";
    default:
      return "通常";
  }
}

function getSensitivityName(sensitivity: ExpressionSensitivity): string {
  switch (sensitivity) {
    case "normal":
      return "ふつう";
    case "high":
      return "高感度";
    default:
      return "やさしい";
  }
}

function getExpressionEngineName(engine: string | undefined): string {
  switch (engine) {
    case "mediapipe":
      return "MediaPipe";
    case "faceapi":
      return "補助エンジン";
    case "tap":
      return "タップ操作";
    default:
      return "未選択";
  }
}

function getRarityLabel(rarity: Rarity): string {
  switch (rarity) {
    case "legendary":
      return "レジェンダリー";
    case "epic":
      return "エピック";
    case "rare":
      return "レア";
    default:
      return "ノーマル";
  }
}

function getRarityClass(rarity: Rarity): string {
  return `rarity-${rarity}`;
}

function getCosmeticCategoryLabel(type: "character" | "background" | "item"): string {
  switch (type) {
    case "background":
      return "背景";
    case "item":
      return "アクセサリー";
    default:
      return "キャラ";
  }
}

function getCosmeticPreviewHtml(params: {
  image: string | null;
  name: string;
  rarity: Rarity;
  variant: "character" | "background" | "item";
}) {
  const fallback = params.variant === "background" ? "景" : params.variant === "item" ? "★" : "顔";
  const imageHtml = params.image
    ? `<img src="${escapeHtml(params.image)}" alt="${escapeHtml(params.name)}" loading="lazy" onerror="this.hidden=true" /><span class="preview-fallback">${fallback}</span>`
    : `<span class="preview-fallback">${fallback}</span>`;

  return `
    <div class="cosmetic-preview ${params.variant} ${getRarityClass(params.rarity)}">
      ${imageHtml}
    </div>
  `;
}

function getBooleanLabel(value: boolean): string {
  return value ? "true" : "false";
}

function getDiagnosticStatusLabel(value: boolean): string {
  return value ? "成功" : "失敗";
}

function getControlModeCopy(cameraState: CameraUiState, controlMode: ControlMode): {
  label: string;
  detail: string;
  className: string;
} {
  if (controlMode === "tap") {
    return {
      label: "タップ操作",
      detail: "ジャンプ・攻撃・ブーストをボタンで操作します。",
      className: "is-warning",
    };
  }

  if (cameraState === "ready") {
    return {
      label: "表情操作",
      detail: "認識中です。タップ操作もいつでも使えます。",
      className: "is-good",
    };
  }

  if (cameraState === "requesting") {
    return {
      label: "準備中",
      detail: "カメラを確認しています。待っている間もタップ操作で遊べます。",
      className: "is-info",
    };
  }

  if (cameraState === "expressionUnavailable") {
    return {
      label: "タップ操作",
      detail: "カメラは起動しています。表情操作はあとで再確認できます。",
      className: "is-warning",
    };
  }

  return {
    label: "表情操作準備中",
    detail: "カメラを許可すると表情操作を確認できます。",
    className: "is-warning",
  };
}

export type AppShell = ReturnType<typeof createAppShell>;

export function createAppShell(options: AppShellOptions) {
  const { root } = options;
  let lastExpressionStatusRenderAt = 0;

  const state: AppShellState = {
    overlay: "none",
    game: null,
    cameraState: "idle",
    cameraTitle: "",
    cameraMessage: "",
    cameraDiagnostics: null,
    cameraDiagnosticsExpanded: false,
    expression: "neutral",
    expressionStatus: null,
    controlMode: "tap",
    expressionSensitivity: "gentle",
    tutorialSeen: createEmptyTutorialSeen(),
    practiceMode: "learn",
    practiceStep: 0,
    practiceHoldProgress: 0,
    confirmResetData: false,
    settingsNotice: "",
    settingsDiagnosticsExpanded: false,
    expressionNavFocusIndex: 0,
    expressionNavExpression: null,
    expressionNavHoldStartedAt: 0,
    expressionNavHoldProgress: 0,
    expressionNavNotice: "笑顔で決定 / 驚いた顔で次へ / 怒った顔で戻る",
    expressionNavLastTriggeredAt: 0,
  };

  function renderAndNotify() {
    render();
    options.onOverlayChanged();
  }

  function isExpressionNavigationActive() {
    const game = state.game;
    if (state.cameraState !== "ready" || state.controlMode !== "expression") return false;
    if (!game) return state.overlay !== "none";
    if (game.scene === "play" && !game.gameOver && state.overlay === "none") return false;
    return true;
  }

  function getFocusableElements(): HTMLButtonElement[] {
    return Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-action]"))
      .filter((button) => {
        if (button.disabled) return false;
        if (button.closest(".touch-controls")) return false;
        if (button.offsetParent === null) return false;
        return true;
      });
  }

  function applyExpressionFocus() {
    const elements = getFocusableElements();
    root.querySelectorAll(".is-face-focused").forEach((element) => {
      element.classList.remove("is-face-focused");
      (element as HTMLElement).style.removeProperty("--face-progress");
    });

    if (!isExpressionNavigationActive() || elements.length === 0) {
      return;
    }

    state.expressionNavFocusIndex = Math.max(
      0,
      Math.min(state.expressionNavFocusIndex, elements.length - 1),
    );
    const focused = elements[state.expressionNavFocusIndex];
    if (!focused) return;

    focused.classList.add("is-face-focused");
    focused.style.setProperty("--face-progress", String(state.expressionNavHoldProgress));
  }

  function clickFocusedElement() {
    const elements = getFocusableElements();
    const focused = elements[state.expressionNavFocusIndex];
    focused?.click();
  }

  function clickBackElement() {
    const elements = getFocusableElements();
    const preferredActions = [
      "back-to-title",
      "close-overlay",
      "cancel-reset-data",
      "continue-without-camera",
    ];

    const target = elements.find((element) =>
      preferredActions.includes(element.dataset.action ?? ""),
    );

    if (target) {
      target.click();
      return;
    }

    clickFocusedElement();
  }

  function moveExpressionFocus(delta: number) {
    const elements = getFocusableElements();
    if (elements.length === 0) return;
    state.expressionNavFocusIndex =
      (state.expressionNavFocusIndex + delta + elements.length) % elements.length;
    state.expressionNavNotice = "選択中のボタンを移動しました";
    state.expressionNavHoldProgress = 0;
    applyExpressionFocus();
  }

  function resetExpressionNavigationHold(expression: Expression | null = null) {
    state.expressionNavExpression = expression;
    state.expressionNavHoldStartedAt = expression ? performance.now() : 0;
    state.expressionNavHoldProgress = 0;
  }

  function updateExpressionNavigation(status: ExpressionStatus) {
    if (!isExpressionNavigationActive()) {
      resetExpressionNavigationHold(null);
      return;
    }

    const now = performance.now();
    const expression = status.expression;
    const actionable = expression === "happy" || expression === "surprised" || expression === "angry";
    if (!actionable || !status.faceDetected) {
      resetExpressionNavigationHold(null);
      state.expressionNavNotice = "笑顔で決定 / 驚いた顔で次へ / 怒った顔で戻る";
      return;
    }

    if (state.expressionNavExpression !== expression) {
      resetExpressionNavigationHold(expression);
    }

    const holdMs =
      expression === "happy"
        ? NAV_CONFIRM_HOLD_MS
        : expression === "surprised"
          ? NAV_NEXT_HOLD_MS
          : NAV_BACK_HOLD_MS;
    state.expressionNavHoldProgress = Math.max(
      0,
      Math.min(1, (now - state.expressionNavHoldStartedAt) / holdMs),
    );

    if (now - state.expressionNavLastTriggeredAt < NAV_TRIGGER_COOLDOWN_MS) {
      return;
    }

    if (state.expressionNavHoldProgress < 1) return;

    state.expressionNavLastTriggeredAt = now;
    state.expressionNavHoldProgress = 0;
    if (expression === "happy") {
      state.expressionNavNotice = "笑顔で決定しました";
      clickFocusedElement();
    } else if (expression === "surprised") {
      moveExpressionFocus(1);
    } else {
      state.expressionNavNotice = "戻ります";
      clickBackElement();
    }
    resetExpressionNavigationHold(expression);
  }

  function setOverlay(overlay: OverlayScreen) {
    state.overlay = overlay;
    renderAndNotify();
  }

  function resetPracticeState(mode: PracticeMode) {
    state.practiceMode = mode;
    state.practiceStep = 0;
    state.tutorialSeen = createEmptyTutorialSeen();
    state.practiceHoldProgress = 0;
  }

  function getCurrentPracticeExpression(): TutorialExpression {
    return TUTORIAL_ORDER[Math.min(state.practiceStep, TUTORIAL_ORDER.length - 1)] ?? "happy";
  }

  function advancePractice() {
    const isLast = state.practiceStep >= TUTORIAL_ORDER.length - 1;
    if (isLast) {
      options.onFinishTutorial();
      return;
    }

    state.practiceStep += 1;
    state.practiceHoldProgress = 0;
    render();
  }

  function shouldRenderExpressionStatusUpdate(previousExpression: Expression, force = false) {
    const statusVisible =
      state.overlay === "practice" ||
      (state.overlay === "settings" && state.settingsDiagnosticsExpanded) ||
      state.cameraDiagnosticsExpanded ||
      isExpressionNavigationActive() ||
      (
        state.game?.scene === "play" &&
        !state.game.gameOver &&
        state.cameraState === "ready" &&
        state.controlMode === "expression"
      );

    if (!statusVisible) return false;

    const now = performance.now();
    const expressionChanged = previousExpression !== state.expressionStatus?.expression;
    if (
      force ||
      expressionChanged ||
      now - lastExpressionStatusRenderAt >= EXPRESSION_STATUS_RENDER_INTERVAL_MS
    ) {
      lastExpressionStatusRenderAt = now;
      return true;
    }

    return false;
  }

  function getCameraBannerHtml() {
    if (state.cameraState === "ready") {
      return `
        <div class="floating-banner is-good">
          <strong>表情認識の準備ができました</strong>
          <span>笑顔・怒った顔・驚いた顔で、手ぶら操作を楽しめます。</span>
        </div>
      `;
    }

    if (state.cameraState === "requesting") {
      return `
        <div class="floating-banner is-info">
          <strong>カメラを準備しています</strong>
          <span>許可すると、表情でキャラクターを動かせます。</span>
        </div>
      `;
    }

    if (state.cameraState === "expressionUnavailable") {
      return `
        <div class="floating-banner is-warning">
          <strong>まずはタップ操作で遊べます</strong>
          <span>表情操作はあとで有効にできます。カメラを使うと笑顔・怒った顔・驚いた顔で操作できます。</span>
          <div class="button-row compact-row">
            <button type="button" data-action="enable-camera" class="ghost-button">もう一度確認</button>
          </div>
          ${getCameraDiagnosticsHtml()}
        </div>
      `;
    }

    return `
      <div class="floating-banner is-warning">
        <strong>タップだけですぐ遊べます</strong>
        <span>表情操作はあとでオンにできます。</span>
        <button type="button" data-action="open-camera-overlay" class="ghost-button">カメラを許可する</button>
      </div>
    `;
  }

  function getCameraDiagnosticsHtml() {
    const diagnostics = state.cameraDiagnostics;
    if (!diagnostics) return "";

    const toggleLabel = state.cameraDiagnosticsExpanded
      ? "診断情報を隠す"
      : "診断情報を表示";

    const noteHtml =
      diagnostics.notes.length > 0
        ? `
            <div class="diagnostic-card">
              <strong>補足メモ</strong>
              ${diagnostics.notes
                .map((note) => `<span>${escapeHtml(note)}</span>`)
                .join("")}
            </div>
          `
        : "";

    const attemptCards = diagnostics.attempts
      .map((attempt) => {
        const lines = [
          `制約: ${attempt.constraintsText}`,
          `結果: ${attempt.success ? "成功" : "失敗"}`,
          `error.name: ${attempt.errorName || "-"}`,
          `error.message: ${attempt.errorMessage || "-"}`,
          `stream track count: ${attempt.streamTrackCount || 0}`,
          `tracks: ${attempt.trackSummaryText || "-"}`,
          `video.play(): ${attempt.playResult || "-"}`,
          `ready event: ${attempt.readyEvent || "-"}`,
          `video.readyState: ${attempt.videoReadyState}`,
          `video size: ${attempt.videoWidth} x ${attempt.videoHeight}`,
        ]
          .map((line) => `<span>${escapeHtml(line)}</span>`)
          .join("");

        return `
          <div class="diagnostic-card">
            <strong>試行 ${attempt.attemptNumber}: ${escapeHtml(attempt.label)}</strong>
            ${lines}
          </div>
        `;
      })
      .join("");

    const modelAssetCards = diagnostics.modelAssetChecks
      .map((assetCheck) => {
        const lines = [
          `URL: ${assetCheck.url}`,
          `fetch: ${getDiagnosticStatusLabel(assetCheck.fetchSuccess)}`,
          `fetch status: ${assetCheck.fetchStatus || "-"}`,
          `fetch bytes: ${assetCheck.fetchByteLength || 0}`,
          `fetch error.name: ${assetCheck.fetchErrorName || "-"}`,
          `fetch error.message: ${assetCheck.fetchErrorMessage || "-"}`,
          `XHR: ${getDiagnosticStatusLabel(assetCheck.xhrSuccess)}`,
          `XHR status: ${assetCheck.xhrStatus || "-"}`,
          `XHR bytes: ${assetCheck.xhrByteLength || 0}`,
          `XHR error.name: ${assetCheck.xhrErrorName || "-"}`,
          `XHR error.message: ${assetCheck.xhrErrorMessage || "-"}`,
        ]
          .map((line) => `<span>${escapeHtml(line)}</span>`)
          .join("");

        return `
          <div class="diagnostic-card">
            <strong>${escapeHtml(assetCheck.assetName)}</strong>
            ${lines}
          </div>
        `;
      })
      .join("");

    const mediaPipeAssetCards = (diagnostics.mediaPipeAssetChecks ?? [])
      .map((assetCheck) => {
        const lines = [
          `URL: ${assetCheck.url}`,
          `fetch: ${getDiagnosticStatusLabel(assetCheck.fetchSuccess)}`,
          `fetch status: ${assetCheck.fetchStatus || "-"}`,
          `fetch bytes: ${assetCheck.fetchByteLength || 0}`,
          `fetch error.name: ${assetCheck.fetchErrorName || "-"}`,
          `fetch error.message: ${assetCheck.fetchErrorMessage || "-"}`,
          `XHR: ${getDiagnosticStatusLabel(assetCheck.xhrSuccess)}`,
          `XHR status: ${assetCheck.xhrStatus || "-"}`,
          `XHR bytes: ${assetCheck.xhrByteLength || 0}`,
          `XHR error.name: ${assetCheck.xhrErrorName || "-"}`,
          `XHR error.message: ${assetCheck.xhrErrorMessage || "-"}`,
        ]
          .map((line) => `<span>${escapeHtml(line)}</span>`)
          .join("");

        return `
          <div class="diagnostic-card">
            <strong>MediaPipe: ${escapeHtml(assetCheck.assetName)}</strong>
            ${lines}
          </div>
        `;
      })
      .join("");

    const modelCandidateCards = diagnostics.modelCandidates
      .map((candidate, index) => {
        const lines = [
          `candidate: ${candidate.candidate}`,
          `resolved: ${candidate.resolvedBaseUrl}`,
          `asset readable: ${getDiagnosticStatusLabel(candidate.allAssetsReadable)}`,
          `XHR fallback needed: ${getBooleanLabel(candidate.usedXhrFallback)}`,
          `face-api load: ${
            candidate.faceApiAttempted
              ? getDiagnosticStatusLabel(candidate.faceApiSucceeded)
              : "未実行"
          }`,
          `face-api error.name: ${candidate.faceApiErrorName || "-"}`,
          `face-api error.message: ${candidate.faceApiErrorMessage || "-"}`,
        ]
          .map((line) => `<span>${escapeHtml(line)}</span>`)
          .join("");

        const assetLines = candidate.assetChecks
          .map((assetCheck) => {
            const fetchText = `${getDiagnosticStatusLabel(assetCheck.fetchSuccess)} (${assetCheck.fetchStatus || "-"})`;
            const xhrText = `${getDiagnosticStatusLabel(assetCheck.xhrSuccess)} (${assetCheck.xhrStatus || "-"})`;
            return `
              <span>
                ${escapeHtml(
                  `${assetCheck.assetName}: fetch ${fetchText}, xhr ${xhrText}, bytes ${assetCheck.fetchByteLength || assetCheck.xhrByteLength || 0}`,
                )}
              </span>
            `;
          })
          .join("");

        return `
          <div class="diagnostic-card">
            <strong>model 候補 ${index + 1}</strong>
            ${lines}
            ${assetLines}
          </div>
        `;
      })
      .join("");

    const expressionCards = diagnostics.expressionDiagnostics
      .map((entry, index) => {
        const lines = [
          `stage: ${entry.stage}`,
          `結果: ${entry.success ? "成功" : "失敗"}`,
          `engine: ${entry.engine || "-"}`,
          `MediaPipe loaded: ${getBooleanLabel(Boolean(entry.mediaPipeLoaded))}`,
          `face-api loaded: ${getBooleanLabel(entry.faceApiLoaded)}`,
          `models loaded: ${getBooleanLabel(entry.modelsLoaded)}`,
          `MediaPipe model: ${entry.mediaPipeModelUrl || "-"}`,
          `MediaPipe wasm: ${entry.mediaPipeWasmUrl || "-"}`,
          `sensitivity: ${entry.sensitivity || "-"}`,
          `detect time: ${entry.detectTimeMs ?? "-"}ms`,
          `detection interval: ${entry.detectionIntervalMs ?? "-"}ms`,
          `face detected: ${entry.faceDetected === undefined ? "-" : getBooleanLabel(entry.faceDetected)}`,
          `selected expression: ${entry.selectedExpression || "-"}`,
          `video.readyState: ${entry.videoReadyState}`,
          `video size: ${entry.videoWidth} x ${entry.videoHeight}`,
          `error.name: ${entry.errorName || "-"}`,
          `error.message: ${entry.errorMessage || "-"}`,
          `error.stack: ${entry.errorStack || "-"}`,
        ]
          .map((line) => `<span>${escapeHtml(line)}</span>`)
          .join("");

        return `
          <div class="diagnostic-card">
            <strong>expression ${index + 1}</strong>
            ${lines}
          </div>
        `;
      })
      .join("");

    const expressionStatusCard = state.expressionStatus
      ? `
          <div class="diagnostic-card">
            <strong>現在の表情状態</strong>
            <span>mode: ${escapeHtml(state.controlMode)}</span>
            <span>engine: ${escapeHtml(getExpressionEngineName(state.expressionStatus.engine))}</span>
            <span>last expression: ${escapeHtml(getExpressionName(state.expressionStatus.expression))}</span>
            <span>last confidence: ${getConfidencePercent(state.expressionStatus)}%</span>
            <span>face detected: ${getBooleanLabel(state.expressionStatus.faceDetected)}</span>
            <span>sensitivity: ${escapeHtml(state.expressionStatus.sensitivityLabel)}</span>
            <span>detection interval: ${state.expressionStatus.detectionIntervalMs}ms</span>
            <span>last error.name: ${escapeHtml(state.expressionStatus.lastErrorName || "-")}</span>
            <span>last error.message: ${escapeHtml(state.expressionStatus.lastErrorMessage || "-")}</span>
          </div>
        `
      : "";

    const detailsHtml = state.cameraDiagnosticsExpanded
      ? `
          <div class="diagnostic-panel">
            <div class="diagnostic-card">
              <strong>error.name / error.message</strong>
              <span>${escapeHtml(diagnostics.errorName || "-")}</span>
              <span>${escapeHtml(diagnostics.errorMessage || "-")}</span>
            </div>
            <div class="diagnostic-card">
              <strong>環境</strong>
              <span>navigator.mediaDevices: ${getBooleanLabel(diagnostics.mediaDevicesExists)}</span>
              <span>getUserMedia: ${getBooleanLabel(diagnostics.getUserMediaExists)}</span>
              <span>window.isSecureContext: ${getBooleanLabel(diagnostics.isSecureContext)}</span>
              <span>origin: ${escapeHtml(diagnostics.origin || "-")}</span>
              <span>href: ${escapeHtml(diagnostics.href || "-")}</span>
              <span>video.readyState: ${diagnostics.videoReadyState}</span>
              <span>video size: ${diagnostics.videoWidth} x ${diagnostics.videoHeight}</span>
              <span>phase: ${escapeHtml(diagnostics.phase)}</span>
              <span>selected model candidate: ${escapeHtml(diagnostics.selectedModelCandidate || "-")}</span>
              <span>model URL: ${escapeHtml(diagnostics.modelUrl || "-")}</span>
              <span>engine selected: ${escapeHtml(getExpressionEngineName(diagnostics.expressionEngine))}</span>
              <span>fallback used: ${getBooleanLabel(Boolean(diagnostics.expressionEngineFallbackUsed))}</span>
              <span>MediaPipe model: ${escapeHtml(diagnostics.mediaPipeModelUrl || "-")}</span>
              <span>MediaPipe wasm: ${escapeHtml(diagnostics.mediaPipeWasmUrl || "-")}</span>
            </div>
            ${expressionStatusCard}
            ${noteHtml}
            ${attemptCards}
            ${mediaPipeAssetCards}
            ${modelAssetCards}
            ${modelCandidateCards}
            ${expressionCards}
          </div>
        `
      : "";

    return `
      <div class="diagnostic-toggle-wrap">
        <button type="button" data-action="toggle-camera-diagnostics" class="ghost-button diagnostic-toggle">
          ${toggleLabel}
        </button>
        ${detailsHtml}
      </div>
    `;
  }

  function getExpressionFaceMessage(): string {
    if (state.cameraState !== "ready") {
      return "カメラを許可すると、ここに認識状態が表示されます";
    }

    return state.expressionStatus?.faceMessage ?? "認識中です。顔を画面の中央に入れてください";
  }

  function getConfidencePercent(status: ExpressionStatus | null): number {
    if (!status) return 0;
    return Math.max(0, Math.min(100, Math.round(status.confidence * 100)));
  }

  function getExpressionScoreBarsHtml(status: ExpressionStatus | null) {
    const scores = status?.smoothedScores ?? {
      neutral: 1,
      happy: 0,
      angry: 0,
      surprised: 0,
      sad: 0,
    };
    const rows: Array<{ expression: Expression; label: string }> = [
      { expression: "happy", label: "笑顔" },
      { expression: "angry", label: "怒った顔" },
      { expression: "surprised", label: "驚いた顔" },
      { expression: "neutral", label: "通常" },
    ];

    return rows
      .map(({ expression, label }) => {
        const value = Math.max(0, Math.min(100, Math.round((scores[expression] ?? 0) * 100)));
        return `
          <div class="expression-meter-row">
            <span>${label}</span>
            <div class="expression-meter-track"><i style="width: ${value}%"></i></div>
            <em>${value}%</em>
          </div>
        `;
      })
      .join("");
  }

  function getExpressionStatusPanelHtml(variant: "compact" | "practice" = "compact") {
    const status = state.expressionStatus;
    const expressionName = getExpressionName(status?.expression ?? state.expression);
    const confidence = getConfidencePercent(status);
    const isReady = state.cameraState === "ready";
    const classes = [
      "expression-live-panel",
      variant === "compact" ? "is-compact" : "",
      isReady && state.controlMode === "expression" ? "is-live" : "is-muted",
    ]
      .filter(Boolean)
      .join(" ");

    if (variant === "compact") {
      return `
        <div class="${classes}">
          <div class="expression-chip-main">
            <span>${isReady && state.controlMode === "expression" ? "認識中" : "表情"}</span>
            <strong>${expressionName}</strong>
            <em>${escapeHtml(status?.actionLabel ?? "待機")}</em>
          </div>
          <div class="expression-chip-meter" aria-label="認識の強さ">
            <i style="width: ${confidence}%"></i>
          </div>
        </div>
      `;
    }

    return `
      <div class="${classes}">
        <div class="expression-live-header">
          <strong>${isReady && state.controlMode === "expression" ? "認識中" : "表情操作チェック"}</strong>
          <span>${getExpressionEngineName(status?.engine)} / ${getSensitivityName(state.expressionSensitivity)}</span>
        </div>
        <div class="expression-live-main">
          <span>いまの表情: <b>${expressionName}</b></span>
          <span>操作: <b>${escapeHtml(status?.actionLabel ?? "待機")}</b></span>
          <span>${escapeHtml(getExpressionFaceMessage())}</span>
        </div>
        <div class="expression-confidence">
          <span>認識の強さ</span>
          <div class="expression-meter-track"><i style="width: ${confidence}%"></i></div>
          <em>${confidence}%</em>
        </div>
        ${variant === "practice" ? `<div class="expression-score-bars">${getExpressionScoreBarsHtml(status)}</div>` : ""}
      </div>
    `;
  }

  function getControlModeSelectorHtml() {
    const expressionActive = state.controlMode === "expression";
    const tapActive = state.controlMode === "tap";
    return `
      <div class="control-mode-selector" role="group" aria-label="操作モード">
        <button
          type="button"
          data-action="set-control-expression"
          class="mode-button ${expressionActive ? "is-active" : ""}"
        >表情操作</button>
        <button
          type="button"
          data-action="set-control-tap"
          class="mode-button ${tapActive ? "is-active" : ""}"
        >タップ操作</button>
      </div>
    `;
  }

  function getExpressionNavHintHtml() {
    if (!isExpressionNavigationActive()) return "";
    const progress = Math.round(state.expressionNavHoldProgress * 100);
    const game = state.game;
    const classes = [
      "expression-nav-chip",
      "expression-nav-docked",
      state.overlay !== "none" ? "is-over-modal" : "",
      game?.scene === "customize" ? "is-customize-scene" : "",
      game?.scene === "gacha" ? "is-gacha-scene" : "",
      "expression-nav-hidden-on-small",
    ]
      .filter(Boolean)
      .join(" ");
    return `
      <div class="${classes}">
        <strong>表情ナビ</strong>
        <span>笑顔:決定 / 驚き:次へ / 怒り:戻る</span>
        <em>${escapeHtml(state.expressionNavNotice)}</em>
        <div class="expression-nav-meter"><i style="width: ${progress}%"></i></div>
      </div>
    `;
  }

  function getSensitivitySelectorHtml() {
    const values: Array<{ value: ExpressionSensitivity; label: string }> = [
      { value: "gentle", label: "やさしい" },
      { value: "normal", label: "ふつう" },
      { value: "high", label: "高感度" },
    ];
    return `
      <div class="sensitivity-selector" role="group" aria-label="表情感度">
        ${values
          .map(
            ({ value, label }) => `
              <button
                type="button"
                data-action="set-sensitivity"
                data-sensitivity="${value}"
                class="mode-button ${state.expressionSensitivity === value ? "is-active" : ""}"
              >${label}</button>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function getTitleMenuHtml(game: GameSnapshot) {
    const controlMode = getControlModeCopy(state.cameraState, state.controlMode);
    return `
      <section class="menu-panel title-panel">
        <div class="title-main">
          <div class="hero-copy">
            <span class="eyebrow">顔で走るアクション</span>
            <h1>${APP_NAME}</h1>
            <p>笑顔でジャンプ、怒った顔で攻撃、驚いた顔でブースト。タップだけでも快適に遊べます。</p>
          </div>

          <div class="title-primary-area">
            <button type="button" data-action="start-game" class="primary-button title-start-button">ゲーム開始</button>
            ${getControlModeSelectorHtml()}
          </div>
        </div>

        <div class="menu-grid title-menu-grid">
          <button type="button" data-action="open-practice" class="secondary-button">表情操作チェック</button>
          <button type="button" data-action="open-gacha" class="secondary-button">ガチャ</button>
          <button type="button" data-action="open-customize" class="secondary-button">着せ替え</button>
          <button type="button" data-action="open-ranking" class="secondary-button">ランキング</button>
          <button type="button" data-action="open-settings" class="ghost-button">設定</button>
        </div>

        <div class="title-bottom">
          <div class="title-stat-strip">
            <span>今日 ${game.dailyBest}</span>
            <span>最高 ${game.allTimeBest}</span>
            <span>コイン ${game.coins}</span>
            <span>${controlMode.label}</span>
          </div>
          <div class="title-mission-strip">
            <strong>${escapeHtml(game.missionText.replace("今日のミッション: ", ""))}</strong>
            <span>${escapeHtml(game.missionProgressText)}</span>
          </div>
        </div>
      </section>
    `;
  }

  function getCustomizeHtml(game: GameSnapshot) {
    return `
      <section class="menu-panel compact customize-panel">
        <div class="panel-header">
          <div>
            <span class="eyebrow">きせかえ</span>
            <h2>着せ替え</h2>
          </div>
          <button type="button" data-action="back-to-title" class="ghost-button">タイトルへ</button>
        </div>

        <div class="detail-grid customize-grid">
          <article class="detail-card preview-card">
            ${getCosmeticPreviewHtml({
              image: game.charImage,
              name: game.charName,
              rarity: game.charRarity,
              variant: "character",
            })}
            <span class="category-label">キャラ</span>
            <strong>${escapeHtml(game.charName)}</strong>
            <small>レア度: ${escapeHtml(getRarityLabel(game.charRarity))}</small>
            <small>所持: ${game.ownedCharacterCount} / ${game.totalCharacterCount}</small>
            <button type="button" data-action="cycle-character" class="secondary-button">切り替える</button>
          </article>
          <article class="detail-card preview-card">
            ${getCosmeticPreviewHtml({
              image: game.bgImage,
              name: game.bgName,
              rarity: game.bgRarity,
              variant: "background",
            })}
            <span class="category-label">背景</span>
            <strong>${escapeHtml(game.bgName)}</strong>
            <small>レア度: ${escapeHtml(getRarityLabel(game.bgRarity))}</small>
            <small>所持: ${game.ownedBackgroundCount} / ${game.totalBackgroundCount}</small>
            <button type="button" data-action="cycle-background" class="secondary-button">切り替える</button>
          </article>
          <article class="detail-card preview-card">
            ${getCosmeticPreviewHtml({
              image: game.itemImage,
              name: game.itemName,
              rarity: game.itemRarity,
              variant: "item",
            })}
            <span class="category-label">アクセサリー</span>
            <strong>${escapeHtml(game.itemName)}</strong>
            <small>レア度: ${escapeHtml(getRarityLabel(game.itemRarity))}</small>
            <small>所持: ${game.ownedItemCount} / ${game.totalItemCount}</small>
            <button type="button" data-action="cycle-item" class="secondary-button">切り替える</button>
          </article>
        </div>

        <div class="helper-copy">
          表情ショートカット: 怒った顔でキャラ切り替え / 驚いた顔で背景切り替え / 笑顔か悲しい顔で戻る
        </div>
      </section>
    `;
  }

  function getGachaHtml(game: GameSnapshot) {
    const disabled = game.canRollGacha ? "" : "disabled";
    const message = game.gachaMessage
      ? `<p class="status-text">${escapeHtml(game.gachaMessage)}</p>`
      : `<p class="status-text">笑顔キープでもガチャを引けます。</p>`;
    const result = game.gachaResult;
    const revealPhase = result
      ? result.ageTicks < 35
        ? "is-spinning"
        : result.ageTicks < 85
          ? "is-revealing"
          : "is-revealed"
      : "is-idle";
    const resultHtml = result
      ? `
          <article class="gacha-result-card ${revealPhase} ${getRarityClass(result.rarity)}">
            <div class="gacha-capsule">
              ${getCosmeticPreviewHtml({
                image: result.image,
                name: result.name,
                rarity: result.rarity,
                variant: result.type,
              })}
            </div>
            <div class="gacha-result-copy">
              <span>${escapeHtml(getCosmeticCategoryLabel(result.type))} / ${escapeHtml(getRarityLabel(result.rarity))}</span>
              <strong>${escapeHtml(result.name)}</strong>
              <small>${result.isNew ? "NEW! 新しく手に入りました" : "ダブりです。コレクション確認に使えます"}</small>
              <em>${result.isEquipped ? "装備中" : "装備できます"}</em>
            </div>
          </article>
        `
      : `
          <article class="gacha-result-card is-idle">
            <div class="gacha-capsule idle-capsule">?</div>
            <div class="gacha-result-copy">
              <span>ごほうび</span>
              <strong>何が出るかな？</strong>
              <small>レアなキャラ・背景・アクセサリーを集めよう</small>
            </div>
          </article>
        `;

    return `
      <section class="menu-panel compact">
        <div class="panel-header">
          <div>
            <span class="eyebrow">ごほうびガチャ</span>
            <h2>ガチャ</h2>
          </div>
          <button type="button" data-action="back-to-title" class="ghost-button">タイトルへ</button>
        </div>

        <div class="hero-stats">
          <div class="stat-pill">
            <span>1回</span>
            <strong>${game.gachaCost} コイン</strong>
          </div>
          <div class="stat-pill">
            <span>所持コイン</span>
            <strong>${game.coins}</strong>
          </div>
        </div>

        ${message}
        ${resultHtml}

        <div class="menu-grid gacha-actions">
          <button type="button" data-action="roll-gacha" class="primary-button" ${disabled}>ガチャを引く</button>
          <button type="button" data-action="equip-gacha-result" class="secondary-button" ${result && !result.isEquipped ? "" : "disabled"}>装備する</button>
          <button type="button" data-action="roll-gacha" class="ghost-button" ${disabled}>もう一度回す</button>
        </div>

        <div class="helper-copy">表情ショートカット: 笑顔で引く / 悲しい顔で戻る</div>
      </section>
    `;
  }

  function getTouchControlsHtml(game: GameSnapshot) {
    if (game.scene !== "play" || game.gameOver) return "";

    return `
      <div class="touch-controls ${game.controlMode === "tap" ? "is-tap-mode" : "is-expression-mode"}">
        <button type="button" data-action="touch-jump" class="touch-button">ジャンプ</button>
        <button type="button" data-action="touch-attack" class="touch-button">攻撃</button>
        <button type="button" data-action="touch-boost" class="touch-button">ブースト</button>
      </div>
    `;
  }

  function getGameplayNoticeHtml(game: GameSnapshot) {
    if (game.scene !== "play" || game.gameOver || state.cameraState === "ready") {
      return "";
    }

    const message =
      state.cameraState === "requesting"
        ? "カメラを準備中です。いまはタップ操作で遊べます。"
        : "表情認識が使えないため、タップ操作で遊べます。";

    return `<div class="gameplay-banner">${escapeHtml(message)}</div>`;
  }

  function getGameplayExpressionStatusHtml(game: GameSnapshot) {
    if (
      game.scene !== "play" ||
      game.gameOver ||
      state.cameraState !== "ready" ||
      state.controlMode !== "expression"
    ) {
      return "";
    }

    return `<div class="gameplay-expression-status">${getExpressionStatusPanelHtml("compact")}</div>`;
  }

  function getGameOverActionsHtml(game: GameSnapshot) {
    if (game.scene !== "play" || !game.gameOver) return "";

    const missionLabel = game.missionCompleted
      ? game.missionRewardEarned
        ? `達成！ +${game.missionRewardCoins} コイン`
        : game.missionRewardClaimed
          ? "達成済み"
          : "達成！"
      : game.missionProgressText;
    const achievementLabel = game.achievementsUnlockedThisRun.length > 0
      ? game.achievementsUnlockedThisRun.join(" / ")
      : `${game.achievementsUnlockedCount} / ${game.achievementsTotalCount} 解除`;

    return `
        <div class="result-actions">
        <button type="button" data-action="retry-game" class="primary-button">もう一度</button>
        <button type="button" data-action="share-result" class="secondary-button">共有</button>
        <button type="button" data-action="back-to-title" class="ghost-button">タイトルへ</button>
      </div>
      <div class="result-summary result-grid">
        <div>
          <span>スコア</span>
          <strong>${game.score}</strong>
        </div>
        <div>
          <span>ランク</span>
          <strong>${escapeHtml(game.rank)}</strong>
        </div>
        <div>
          <span>最大コンボ</span>
          <strong>×${game.maxCombo}</strong>
        </div>
        <div>
          <span>${game.isNewDailyRecord ? "今日の新記録！" : "今日のベスト"}</span>
          <strong>${game.dailyBest}</strong>
        </div>
        <div>
          <span>${game.isNewAllTimeBest ? "最高スコア更新！" : "最高スコア"}</span>
          <strong>${game.allTimeBest}</strong>
        </div>
        <div>
          <span>獲得コイン</span>
          <strong>+${game.coinsEarned}</strong>
        </div>
        <div>
          <span>今日のミッション</span>
          <strong>${escapeHtml(missionLabel)}</strong>
        </div>
        <div>
          <span>実績</span>
          <strong>${escapeHtml(achievementLabel)}</strong>
        </div>
      </div>
    `;
  }

  function getOnboardingHtml() {
    return `
      <section class="modal-screen">
        <div class="modal-card onboarding-card">
          <span class="eyebrow">ようこそ</span>
          <h2>${APP_NAME}</h2>
          <p>顔で走る、タップでも遊べるアクションゲームです。</p>

          <div class="intro-grid">
            <article class="detail-card">
              <strong>笑顔でジャンプ</strong>
              <small>怒った顔で攻撃、驚いた顔でブーストします。</small>
            </article>
            <article class="detail-card">
              <strong>プライバシー安心</strong>
              <small>カメラ映像は保存・送信されません。</small>
            </article>
          </div>

          <div class="button-row">
            <button type="button" data-action="close-overlay" class="primary-button">はじめる</button>
            <button type="button" data-action="continue-without-camera" class="ghost-button">タップだけで遊ぶ</button>
          </div>
        </div>
      </section>
    `;
  }

  function getCameraOverlayHtml() {
    const message =
      state.cameraMessage || "カメラを許可すると、表情でジャンプ・攻撃・ブーストができます。";

    return `
      <section class="modal-screen">
        <div class="modal-card">
          <span class="eyebrow">カメラ</span>
          <h2>表情操作をオンにしますか？</h2>
          <p>
            前面カメラで表情だけを読み取り、キャラクターを操作します。
            カメラ映像は端末内で処理され、保存や送信は行いません。
          </p>
          <div class="camera-status ${state.cameraState === "requesting" ? "is-busy" : ""}">
            ${escapeHtml(message)}
          </div>
          <div class="button-row">
            <button type="button" data-action="enable-camera" class="primary-button">
              ${state.cameraState === "requesting" ? "カメラを確認中..." : "カメラを許可する"}
            </button>
            <button type="button" data-action="continue-without-camera" class="ghost-button">タップ操作で遊ぶ</button>
          </div>
        </div>
      </section>
    `;
  }

  function getCameraDeniedHtml() {
    const message =
      state.cameraMessage ||
      "カメラの使用が許可されていません。iPhoneの「設定」→「表情ランナー」→「カメラ」をオンにしてください。";

    return `
      <section class="modal-screen">
        <div class="modal-card">
          <span class="eyebrow">カメラの許可が必要です</span>
          <h2>カメラの許可がオフになっています</h2>
          <p>
            いまはタップ操作で遊べます。表情操作を使いたいときは、iPhoneの設定やブラウザ設定で
            カメラを許可してから、もう一度確認してください。
          </p>
          <div class="camera-status">${escapeHtml(message)}</div>
          <ul class="tip-list">
            <li>Safari の場合: アドレスバーの設定からカメラを許可してください。</li>
            <li>iPhone アプリの場合: 「設定」→「表情ランナー」→「カメラ」をオンにしてください。</li>
            <li>設定後、この画面に戻ってもう一度カメラを確認します。</li>
          </ul>
          <div class="button-row">
            <button type="button" data-action="enable-camera" class="primary-button">もう一度カメラを確認</button>
            <button type="button" data-action="continue-without-camera" class="ghost-button">タップ操作で遊ぶ</button>
          </div>
          ${getCameraDiagnosticsHtml()}
        </div>
      </section>
    `;
  }

  function getCameraErrorHtml() {
    const message = state.cameraMessage || "表情操作はあとで有効にできます。まずはタップ操作で遊べます。";
    const title = state.cameraTitle || "表情操作はあとで有効にできます";
    const retryLabel = state.cameraDiagnostics?.phase === "models"
      ? "もう一度モデルを確認"
      : "もう一度カメラを確認";

    return `
      <section class="modal-screen">
        <div class="modal-card">
          <span class="eyebrow">カメラ / 表情認識</span>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(message)}</p>
          <p>ゲームは止まりません。まずはタップ操作で走って、必要なときだけ後からカメラを再確認できます。</p>
          <div class="button-row">
            <button type="button" data-action="enable-camera" class="primary-button">${retryLabel}</button>
            <button type="button" data-action="continue-without-camera" class="ghost-button">タップ操作で遊ぶ</button>
          </div>
          ${getCameraDiagnosticsHtml()}
        </div>
      </section>
    `;
  }

  function getHowToPlayHtml() {
    return `
      <section class="modal-screen">
        <div class="modal-card tutorial-card">
          <div class="panel-header">
            <div>
              <span class="eyebrow">あそび方</span>
              <h2>あそび方</h2>
            </div>
            <button type="button" data-action="close-overlay" class="ghost-button">閉じる</button>
          </div>

          <div class="intro-grid">
            <article class="detail-card">
              <strong>笑顔</strong>
              <small>ジャンプ / スタート / コンティニュー</small>
            </article>
            <article class="detail-card">
              <strong>怒った顔</strong>
              <small>攻撃</small>
            </article>
            <article class="detail-card">
              <strong>驚いた顔</strong>
              <small>ブースト / ガチャ操作</small>
            </article>
            <article class="detail-card">
              <strong>タップ操作</strong>
              <small>ジャンプ / 攻撃 / ブーストを同じように操作できます</small>
            </article>
            <article class="detail-card">
              <strong>悲しい顔</strong>
              <small>戻る / ゲージ調整</small>
            </article>
          </div>

          <div class="expression-status">
            <strong>表情でもタップでも遊べます</strong>
            <span>カメラ映像は端末内だけで処理され、画像や表情データは保存・送信されません。</span>
          </div>

          <div class="button-row">
            <button type="button" data-action="open-practice" class="primary-button">練習する</button>
            <button type="button" data-action="open-camera-overlay" class="ghost-button">カメラ設定</button>
          </div>
        </div>
      </section>
    `;
  }

  function getPracticeHtml() {
    const target = getCurrentPracticeExpression();
    const copy = EXPRESSION_COPY[target];
    const matched = state.tutorialSeen[target] || state.practiceHoldProgress >= 1;
    const atLastStep = state.practiceStep >= TUTORIAL_ORDER.length - 1;
    const primaryLabel = atLastStep
      ? state.practiceMode === "start"
        ? "ゲーム開始"
        : "完了"
      : "次へ";
    const skipLabel = state.practiceMode === "start" ? "スキップして遊ぶ" : "スキップして閉じる";
    const feedback =
      state.cameraState !== "ready"
        ? "カメラを許可すると表情練習ができます。いまは内容だけ確認できます。"
        : matched
          ? "認識できました！"
          : state.expression === "neutral"
            ? "もう少し顔をカメラに向けてください"
            : `いまは「${getExpressionName(state.expression)}」が見えています`;
    const stepDots = TUTORIAL_ORDER.map((expression, index) => {
      const classes = [
        "step-dot",
        index === state.practiceStep ? "is-current" : "",
        state.tutorialSeen[expression] ? "is-complete" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<span class="${classes}"></span>`;
    }).join("");

    return `
      <section class="modal-screen">
        <div class="modal-card tutorial-card">
          <div class="panel-header">
            <div>
              <span class="eyebrow">表情操作チェック</span>
              <h2>表情操作チェック</h2>
            </div>
            <button type="button" data-action="close-overlay" class="ghost-button">閉じる</button>
          </div>

          <div class="practice-progress">
            <strong>${state.practiceStep + 1} / ${TUTORIAL_ORDER.length}</strong>
            <div class="step-dots">${stepDots}</div>
          </div>

          <article class="practice-focus-card ${matched ? "is-complete" : ""}">
            <span class="practice-emoji">${copy.emoji}</span>
            <strong>${copy.label}</strong>
            <small>${copy.summary}</small>
            <em>${escapeHtml(feedback)}</em>
            <div class="practice-hold-meter">
              <span style="width: ${Math.round(Math.min(1, state.practiceHoldProgress) * 100)}%"></span>
            </div>
          </article>

          ${getExpressionStatusPanelHtml("practice")}

          <div class="expression-status">
            <strong>ねらう表情: ${copy.label}</strong>
            <span>この表情で「${copy.action}」します。うまくいかないときは、タップ操作でそのまま遊べます。</span>
          </div>

          <div class="button-row">
            <button type="button" data-action="finish-practice" class="ghost-button">${skipLabel}</button>
            <button type="button" data-action="advance-practice" class="primary-button">${primaryLabel}</button>
          </div>
        </div>
      </section>
    `;
  }

  function getPrivacyHtml() {
    return `
      <section class="modal-screen">
        <div class="modal-card">
          <div class="panel-header">
            <div>
              <span class="eyebrow">プライバシー</span>
              <h2>プライバシー</h2>
            </div>
            <button type="button" data-action="close-overlay" class="ghost-button">閉じる</button>
          </div>
          <ul class="tip-list">
            <li>アカウント登録はありません。</li>
            <li>広告、解析、トラッキングは使用していません。</li>
            <li>カメラは表情を検出するためだけに使用します。</li>
            <li>カメラ映像は端末内で処理され、保存・送信・共有されません。</li>
            <li>スコア、コイン、スキン、設定などのゲームデータは端末内に保存されます。</li>
          </ul>
        </div>
      </section>
    `;
  }

  function getSettingsHtml() {
    const confirmHtml = state.confirmResetData
      ? `
          <div class="confirm-panel">
            <strong>データをリセットしますか？</strong>
            <span>スコア、コイン、スキン、初回案内の記録をこの端末から削除します。</span>
            <div class="button-row">
              <button type="button" data-action="cancel-reset-data" class="ghost-button">キャンセル</button>
              <button type="button" data-action="confirm-reset-data" class="primary-button">リセットする</button>
            </div>
          </div>
        `
      : "";
    const noticeHtml = state.settingsNotice
      ? `<p class="status-text">${escapeHtml(state.settingsNotice)}</p>`
      : "";
    const diagnosticsHtml = state.settingsDiagnosticsExpanded
      ? state.cameraDiagnostics
        ? getCameraDiagnosticsHtml()
        : state.expressionStatus
          ? getExpressionStatusPanelHtml("practice")
          : `
            <div class="diagnostic-panel settings-diagnostics">
              <div class="diagnostic-card">
                <strong>診断情報</strong>
                <span>まだカメラや表情認識の診断情報はありません。</span>
                <span>カメラを再確認すると、必要な場合だけ詳細が表示されます。</span>
              </div>
            </div>
          `
      : "";

    return `
      <section class="modal-screen">
        <div class="modal-card">
          <div class="panel-header">
            <div>
              <span class="eyebrow">設定とデータ</span>
              <h2>設定とデータ</h2>
            </div>
            <button type="button" data-action="close-overlay" class="ghost-button">閉じる</button>
          </div>

          <div class="settings-section">
            <strong>操作モード</strong>
            ${getControlModeSelectorHtml()}
            <small>表情操作が不安定なときも、タップ操作で快適に遊べます。</small>
          </div>

          <div class="settings-section">
            <strong>表情感度</strong>
            ${getSensitivitySelectorHtml()}
            <small>迷ったら「やさしい」がおすすめです。反応が遅いと感じたら「高感度」を試してください。</small>
          </div>

          <div class="menu-grid single utility-grid">
            <button type="button" data-action="open-camera-overlay" class="secondary-button">カメラを再確認</button>
            <button type="button" data-action="open-how-to" class="secondary-button">あそび方をもう一度見る</button>
            <button type="button" data-action="reset-tutorial" class="secondary-button">チュートリアルをリセット</button>
            <button type="button" data-action="open-privacy" class="ghost-button">プライバシーを見る</button>
            <button type="button" data-action="toggle-settings-diagnostics" class="ghost-button">診断情報</button>
            <button type="button" data-action="request-reset-data" class="ghost-button danger-button">データをリセット</button>
          </div>

          ${noticeHtml}
          ${diagnosticsHtml}
          ${confirmHtml}
        </div>
      </section>
    `;
  }

  function getRankingHtml() {
    const game = state.game;
    if (!game) return "";

    return `
      <section class="modal-screen">
        <div class="modal-card ranking-card">
          <div class="panel-header">
            <div>
              <span class="eyebrow">ランキング</span>
              <h2>ローカルランキング</h2>
            </div>
            <button type="button" data-action="close-overlay" class="ghost-button">閉じる</button>
          </div>

          <div class="hero-stats ranking-stats">
            <div class="stat-pill">
              <span>最高スコア</span>
              <strong>${game.allTimeBest}</strong>
            </div>
            <div class="stat-pill">
              <span>今日のベスト</span>
              <strong>${game.dailyBest}</strong>
            </div>
            <div class="stat-pill">
              <span>実績</span>
              <strong>${game.achievementsUnlockedCount} / ${game.achievementsTotalCount}</strong>
            </div>
            <div class="stat-pill">
              <span>コイン</span>
              <strong>${game.coins}</strong>
            </div>
          </div>

          <div class="expression-status">
            <strong>Game Centerランキングは次のアップデートで対応予定です。</strong>
            <span>Build 15ではローカル記録と実績イベントを保存し、Game Center連携を安全に接続できる形にしています。</span>
          </div>

          <div class="button-row">
            <button type="button" data-action="start-game" class="primary-button">ゲーム開始</button>
            <button type="button" data-action="close-overlay" class="ghost-button">閉じる</button>
          </div>
        </div>
      </section>
    `;
  }

  function getRecoveryHtml() {
    return `
      <section class="modal-screen">
        <div class="modal-card recovery-card">
          <span class="eyebrow">表示を復旧しました</span>
          <h2>${APP_NAME}</h2>
          <p>起動画面の表示を復旧しました。ここからそのまま遊べます。</p>
          <div class="menu-grid single">
            <button type="button" data-action="start-game" class="primary-button">ゲーム開始</button>
            <button type="button" data-action="open-how-to" class="secondary-button">あそび方</button>
            <button type="button" data-action="open-camera-overlay" class="ghost-button">カメラを許可する</button>
          </div>
        </div>
      </section>
    `;
  }

  function getOverlayHtml() {
    switch (state.overlay) {
      case "onboarding":
        return getOnboardingHtml();
      case "camera":
        return getCameraOverlayHtml();
      case "cameraDenied":
        return getCameraDeniedHtml();
      case "cameraError":
        return getCameraErrorHtml();
      case "howToPlay":
        return getHowToPlayHtml();
      case "practice":
        return getPracticeHtml();
      case "privacy":
        return getPrivacyHtml();
      case "settings":
        return getSettingsHtml();
      case "ranking":
        return getRankingHtml();
      case "recovery":
        return getRecoveryHtml();
      default:
        return "";
    }
  }

  function bindEvents() {
    root.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
      element.addEventListener("click", () => {
        const action = element.dataset.action;
        switch (action) {
          case "start-game":
            options.onStartGame();
            break;
          case "open-how-to":
            state.confirmResetData = false;
            state.settingsNotice = "";
            setOverlay("howToPlay");
            break;
          case "open-practice":
            resetPracticeState("learn");
            setOverlay("practice");
            break;
          case "open-customize":
            options.onOpenCustomize();
            break;
          case "open-gacha":
            options.onOpenGacha();
            break;
          case "open-ranking":
            options.onOpenRanking();
            setOverlay("ranking");
            break;
          case "open-privacy":
            state.confirmResetData = false;
            setOverlay("privacy");
            break;
          case "open-settings":
            state.confirmResetData = false;
            state.settingsNotice = "";
            state.settingsDiagnosticsExpanded = false;
            setOverlay("settings");
            break;
          case "back-to-title":
            options.onBackToTitle();
            break;
          case "cycle-character":
            options.onCycleCharacter();
            break;
          case "cycle-background":
            options.onCycleBackground();
            break;
          case "cycle-item":
            options.onCycleItem();
            break;
          case "roll-gacha":
            options.onRollGacha();
            break;
          case "equip-gacha-result":
            options.onEquipLastGachaResult();
            break;
          case "share-result":
            options.onShare();
            break;
          case "retry-game":
            options.onRetryGame();
            break;
          case "enable-camera":
            options.onEnableCamera();
            break;
          case "continue-without-camera":
            options.onContinueWithoutCamera();
            break;
          case "set-control-expression":
            options.onSetControlMode("expression");
            break;
          case "set-control-tap":
            options.onSetControlMode("tap");
            break;
          case "set-sensitivity": {
            const sensitivity = element.dataset.sensitivity;
            if (sensitivity === "gentle" || sensitivity === "normal" || sensitivity === "high") {
              options.onSetExpressionSensitivity(sensitivity);
            }
            break;
          }
          case "open-camera-overlay":
            state.confirmResetData = false;
            state.settingsNotice = "";
            setOverlay("camera");
            break;
          case "close-overlay":
            state.confirmResetData = false;
            options.onCloseOverlay();
            break;
          case "finish-practice":
            options.onFinishTutorial();
            break;
          case "advance-practice":
            advancePractice();
            break;
          case "reset-tutorial":
            options.onResetTutorial();
            state.settingsNotice = "次回のゲーム開始時に、もう一度練習を表示します。";
            state.confirmResetData = false;
            render();
            break;
          case "request-reset-data":
            state.confirmResetData = true;
            state.settingsNotice = "";
            render();
            break;
          case "cancel-reset-data":
            state.confirmResetData = false;
            render();
            break;
          case "confirm-reset-data":
            options.onResetData();
            break;
          case "toggle-camera-diagnostics":
            state.cameraDiagnosticsExpanded = !state.cameraDiagnosticsExpanded;
            render();
            break;
          case "toggle-settings-diagnostics":
            state.settingsDiagnosticsExpanded = !state.settingsDiagnosticsExpanded;
            state.cameraDiagnosticsExpanded = state.settingsDiagnosticsExpanded;
            render();
            break;
          case "touch-jump":
            options.onTouchAction("jump");
            break;
          case "touch-attack":
            options.onTouchAction("attack");
            break;
          case "touch-boost":
            options.onTouchAction("boost");
            break;
        }
      });
    });
  }

  function render() {
    const game = state.game;
    const sceneHtml = !game
      ? ""
      : game.scene === "title"
        ? getTitleMenuHtml(game)
        : game.scene === "customize"
          ? getCustomizeHtml(game)
          : game.scene === "gacha"
            ? getGachaHtml(game)
            : "";

    const floatingBanner =
      game && game.scene === "title" && state.overlay === "none"
        ? getCameraBannerHtml()
        : "";

    const gameplayNotice = game ? getGameplayNoticeHtml(game) : "";
    const gameplayExpressionStatus = game ? getGameplayExpressionStatusHtml(game) : "";
    const touchControls = game ? getTouchControlsHtml(game) : "";
    const resultActions = game ? getGameOverActionsHtml(game) : "";

    root.dataset.overlay = state.overlay;
    root.dataset.scene = game?.scene ?? "none";

    root.innerHTML = `
      <div class="ui-layer">
        <div class="top-overlay">
          ${floatingBanner}
        </div>
        <div class="scene-overlay ${game?.scene === "play" ? "is-play" : ""}">
          ${sceneHtml}
        </div>
        ${gameplayNotice}
        ${gameplayExpressionStatus}
        ${touchControls}
        ${resultActions}
        ${getOverlayHtml()}
        ${getExpressionNavHintHtml()}
      </div>
    `;

    bindEvents();
    applyExpressionFocus();
  }

  return {
    setGameSnapshot(snapshot: GameSnapshot) {
      state.game = snapshot;
      render();
    },
    setCameraState(
      cameraState: CameraUiState,
      cameraMessage = "",
      options?: {
        title?: string;
        diagnostics?: CameraDiagnostics | null;
      },
    ) {
      state.cameraState = cameraState;
      state.cameraTitle = options?.title ?? "";
      state.cameraMessage = cameraMessage;
      state.cameraDiagnostics = options?.diagnostics ?? null;
      state.cameraDiagnosticsExpanded = false;

      if (cameraState === "denied") {
        setOverlay("cameraDenied");
      } else if (cameraState === "unsupported" || cameraState === "error") {
        setOverlay("cameraError");
      } else if (cameraState === "expressionUnavailable") {
        setOverlay("none");
      } else if (cameraState === "ready" && state.overlay !== "practice") {
        setOverlay("none");
      } else {
        render();
      }
    },
    setExpression(expression: Expression) {
      state.expression = expression;

      if (state.overlay === "practice") {
        const target = getCurrentPracticeExpression();
        if (expression === target) {
          state.tutorialSeen[target] = true;
          state.practiceHoldProgress = 1;
        }
        render();
      }
    },
    setExpressionStatus(status: ExpressionStatus) {
      const previousExpression = state.expressionStatus?.expression ?? state.expression;
      state.expressionStatus = status;
      state.expression = status.expression;
      let practiceCompleted = false;
      updateExpressionNavigation(status);

      if (state.overlay === "practice") {
        const target = getCurrentPracticeExpression();
        const isTarget =
          status.faceDetected &&
          status.expression === target &&
          status.confidence >= 0.12;
        state.practiceHoldProgress = isTarget
          ? Math.min(1, state.practiceHoldProgress + 0.34)
          : Math.max(0, state.practiceHoldProgress - 0.18);

        if (state.practiceHoldProgress >= 1) {
          state.tutorialSeen[target] = true;
          practiceCompleted = true;
        }
      }

      if (shouldRenderExpressionStatusUpdate(previousExpression, practiceCompleted)) {
        render();
      }
    },
    setControlMode(mode: ControlMode) {
      state.controlMode = mode;
      render();
    },
    setExpressionSensitivity(sensitivity: ExpressionSensitivity) {
      state.expressionSensitivity = sensitivity;
      render();
    },
    showOnboarding() {
      setOverlay("onboarding");
    },
    showCameraOverlay() {
      setOverlay("camera");
    },
    showHowToPlay() {
      setOverlay("howToPlay");
    },
    showPractice(mode: PracticeMode) {
      resetPracticeState(mode);
      setOverlay("practice");
    },
    showPrivacy() {
      setOverlay("privacy");
    },
    showSettings() {
      state.confirmResetData = false;
      state.settingsNotice = "";
      setOverlay("settings");
    },
    showRecoveryMenu() {
      state.confirmResetData = false;
      state.settingsNotice = "";
      setOverlay("recovery");
    },
    closeOverlay() {
      setOverlay("none");
    },
    getOverlay(): OverlayScreen {
      return state.overlay;
    },
    isBlockingGameInput(): boolean {
      return state.overlay !== "none";
    },
  };
}
