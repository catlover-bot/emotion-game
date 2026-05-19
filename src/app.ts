import { getRequiredCanvas, getRequiredHtmlElement, getRequiredVideo } from "./dom";
import type { CameraDiagnostics } from "./camera";
import { CameraSetupError, setupCamera, stopCamera } from "./camera";
import { clearOwnedCosmetics } from "./cosmetics";
import { createGame, type Game } from "./game";
import {
  FaceModelSetupError,
  getFaceModelBaseUrl,
  setupFaceModels,
  startExpressionLoop,
} from "./face";
import { createAppShell, type CameraUiState } from "./appShell";
import {
  clearAppStorage,
  loadOnboardingComplete,
  loadTutorialComplete,
  resetTutorialComplete,
  saveOnboardingComplete,
  saveTutorialComplete,
} from "./storage";
import type { Expression } from "./types";

export type StartupReporter = {
  setStage(stage: string, detail?: string): void;
  markReady(): void;
};

function createRuntimeDiagnostics(video: HTMLVideoElement): CameraDiagnostics {
  return {
    phase: "camera",
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
    videoReadyState: video.readyState,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    notes: [],
    modelUrl: "",
    selectedModelCandidate: "",
    modelAssetChecks: [],
    modelCandidates: [],
  };
}

function createModelFailureDiagnostics(
  base: CameraDiagnostics | null,
  video: HTMLVideoElement,
  error: unknown,
): CameraDiagnostics {
  const diagnostics = base ? { ...base, attempts: [...base.attempts], notes: [...base.notes] } : createRuntimeDiagnostics(video);
  diagnostics.phase = "models";
  diagnostics.errorName = error instanceof Error ? error.name || "ModelLoadError" : "ModelLoadError";
  diagnostics.errorMessage =
    error instanceof Error ? error.message || "表情認識モデルを読み込めませんでした。" : String(error);
  diagnostics.videoReadyState = video.readyState;
  diagnostics.videoWidth = video.videoWidth;
  diagnostics.videoHeight = video.videoHeight;
  diagnostics.modelUrl = getFaceModelBaseUrl();
  diagnostics.selectedModelCandidate = "";
  diagnostics.notes.push(
    "カメラ映像は取得できましたが、表情認識モデルの読み込みに失敗しました。",
  );
  return diagnostics;
}

function bindTapToGame(canvas: HTMLCanvasElement, game: Pick<Game, "tap">) {
  const handler = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    game.tap(x, y);
  };

  canvas.addEventListener("pointerdown", (event) => {
    handler(event.clientX, event.clientY);
  });

  canvas.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      handler(touch.clientX, touch.clientY);
    },
    { passive: true },
  );
}

export async function startApp(startup: StartupReporter) {
  startup.setStage("dom-ready", "画面の要素を確認しています…");

  const video = getRequiredVideo("video");
  const canvas = getRequiredCanvas("gameCanvas");
  const uiRoot = getRequiredHtmlElement("uiRoot", HTMLDivElement);

  video.setAttribute("playsinline", "true");
  video.playsInline = true;

  let onboardingComplete = loadOnboardingComplete();
  let tutorialComplete = loadTutorialComplete();
  let currentExpression: Expression = "neutral";
  let cameraState: CameraUiState = "idle";
  let lastCameraDiagnostics: CameraDiagnostics | null = null;
  let faceLoopStarted = false;
  let pendingStartAfterTutorial = false;
  let game: Game | null = null;
  let shellVisibleNotified = false;
  let recoveryScheduled = false;

  startup.setStage("shell-rendered", "初回画面を表示しています…");

  const appShell = createAppShell({
    root: uiRoot,
    onStartGame() {
      if (!game) return;

      if (!tutorialComplete) {
        pendingStartAfterTutorial = true;
        appShell.showPractice("start");
        routeExpression();
        return;
      }

      pendingStartAfterTutorial = false;
      appShell.closeOverlay();
      game.startRun();
      routeExpression();
    },
    onOpenCustomize() {
      if (!game) return;
      appShell.closeOverlay();
      game.openCustomize();
      routeExpression();
    },
    onOpenGacha() {
      if (!game) return;
      appShell.closeOverlay();
      game.openGacha();
      routeExpression();
    },
    onBackToTitle() {
      if (!game) return;
      pendingStartAfterTutorial = false;
      appShell.closeOverlay();
      game.goToTitle();
      routeExpression();
    },
    onCycleCharacter() {
      game?.cycleCharacter();
    },
    onCycleBackground() {
      game?.cycleBackground();
    },
    onRollGacha() {
      game?.rollGachaAction();
    },
    onShare() {
      void game?.share();
    },
    onRetryGame() {
      if (!game) return;
      appShell.closeOverlay();
      game.retry();
      routeExpression();
    },
    onEnableCamera() {
      void enableCamera();
    },
    onContinueWithoutCamera() {
      finishOnboarding();
      pendingStartAfterTutorial = false;
      appShell.closeOverlay();
      routeExpression();
    },
    onCloseOverlay() {
      if (appShell.getOverlay() === "onboarding") {
        finishOnboarding();
      }
      pendingStartAfterTutorial = false;
      appShell.closeOverlay();
      routeExpression();
    },
    onFinishTutorial() {
      tutorialComplete = true;
      saveTutorialComplete(true);
      appShell.closeOverlay();
      if (pendingStartAfterTutorial && game) {
        pendingStartAfterTutorial = false;
        game.startRun();
      }
      routeExpression();
    },
    onTouchAction(action) {
      game?.triggerAction(action);
    },
    onOverlayChanged() {
      routeExpression();
    },
    onResetTutorial() {
      tutorialComplete = false;
      resetTutorialComplete();
    },
    onResetData() {
      clearOwnedCosmetics();
      clearAppStorage();
      window.location.reload();
    },
  });

  function hasMeaningfulUiContent() {
    const rect = uiRoot.getBoundingClientRect();
    if (rect.width < 140 || rect.height < 140) {
      return false;
    }

    const selectors = [
      ".menu-panel",
      ".modal-card",
      ".floating-banner",
      ".touch-controls",
      ".result-actions",
      ".boot-card",
      "[data-action]",
    ];
    return selectors.some((selector) => uiRoot.querySelector(selector) !== null);
  }

  function routeExpression() {
    game?.setExpression(appShell.isBlockingGameInput() ? "neutral" : currentExpression);
  }

  function notifyShellVisible(detail: string) {
    if (shellVisibleNotified) return;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (shellVisibleNotified || !hasMeaningfulUiContent()) return;
        shellVisibleNotified = true;
        startup.setStage("shell-rendered", detail);
        startup.markReady();
      });
    });
  }

  function recoverAppShellIfEmpty() {
    if (recoveryScheduled || hasMeaningfulUiContent()) {
      return;
    }

    recoveryScheduled = true;
    startup.setStage("ui-recovery", "起動画面を復旧しています…");
    appShell.showRecoveryMenu();
    routeExpression();

    window.requestAnimationFrame(() => {
      notifyShellVisible("復旧したタイトル画面を表示しました。");
    });
  }

  function finishOnboarding() {
    if (onboardingComplete) return;
    onboardingComplete = true;
    saveOnboardingComplete(true);
  }

  function setCameraUi(
    nextState: CameraUiState,
    message: string,
    options?: {
      title?: string;
      diagnostics?: CameraDiagnostics | null;
    },
  ) {
    cameraState = nextState;
    appShell.setCameraState(nextState, message, options);
    routeExpression();
  }

  async function enableCamera() {
    if (cameraState === "requesting" || cameraState === "ready") return;

    finishOnboarding();
    startup.setStage("camera-waiting", "カメラの許可を確認しています…");
    setCameraUi("requesting", "カメラの許可を確認しています...");

    try {
      lastCameraDiagnostics = await setupCamera(video);
      startup.setStage("models-loading", "表情認識モデルを読み込んでいます…");
      setCameraUi("requesting", "表情認識の準備をしています...");
      try {
        lastCameraDiagnostics = await setupFaceModels(lastCameraDiagnostics);
      } catch (error) {
        const diagnostics = error instanceof FaceModelSetupError
          ? error.diagnostics
          : createModelFailureDiagnostics(lastCameraDiagnostics, video, error);
        console.error("EMOTION_RUNNER_MODEL setup-failed", {
          errorName: diagnostics.errorName,
          errorMessage: diagnostics.errorMessage,
          modelUrl: diagnostics.modelUrl,
          selectedModelCandidate: diagnostics.selectedModelCandidate,
          videoReadyState: diagnostics.videoReadyState,
          videoWidth: diagnostics.videoWidth,
          videoHeight: diagnostics.videoHeight,
        });
        startup.setStage("models-failed", "表情認識モデルを読み込めませんでした。");
        stopCamera(video);
        setCameraUi(
          "error",
          "カメラは起動しましたが、表情認識モデルの読み込みに失敗しました。いまはタップ操作で遊べます。",
          {
            title: "表情認識モデルを読み込めませんでした",
            diagnostics,
          },
        );
        return;
      }

      if (!faceLoopStarted) {
        startExpressionLoop(video, (expression) => {
          currentExpression = expression;
          appShell.setExpression(expression);
          routeExpression();
        });
        faceLoopStarted = true;
      }

      startup.setStage("camera-ready", "表情認識の準備ができました。");
      console.info("EMOTION_RUNNER_CAMERA ready", {
        videoReadyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
      setCameraUi("ready", "表情認識の準備ができました。");
    } catch (error) {
      currentExpression = "neutral";
      appShell.setExpression("neutral");
      lastCameraDiagnostics = error instanceof CameraSetupError
        ? error.diagnostics
        : createRuntimeDiagnostics(video);

      if (error instanceof CameraSetupError) {
        if (error.kind === "denied") {
          startup.setStage("camera-denied", "カメラの許可がオフです。");
          setCameraUi("denied", error.message, {
            title: "カメラの使用が許可されていません",
            diagnostics: error.diagnostics,
          });
          return;
        }

        if (error.kind === "unsupported") {
          startup.setStage("camera-unsupported", "この端末ではカメラ機能を利用できません。");
          setCameraUi("unsupported", error.message, {
            title: "この端末ではカメラを利用できません",
            diagnostics: error.diagnostics,
          });
          return;
        }

        if (error.kind === "unavailable") {
          startup.setStage("camera-unavailable", "カメラがほかのアプリで使用中か見つかりません。");
          setCameraUi("error", error.message, {
            title: "カメラを起動できませんでした",
            diagnostics: error.diagnostics,
          });
          return;
        }

        startup.setStage("camera-error", "カメラを起動できませんでした。");
        setCameraUi("error", error.message, {
          title: "カメラを起動できませんでした",
          diagnostics: error.diagnostics,
        });
        return;
      }

      const message =
        error instanceof Error ? error.message : "カメラで不明なエラーが発生しました。";
      console.error("EMOTION_RUNNER_CAMERA unexpected-camera-error", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: message,
        videoReadyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
      startup.setStage("camera-error", message);
      setCameraUi("error", message, {
        title: "カメラを起動できませんでした",
        diagnostics: lastCameraDiagnostics,
      });
    }
  }

  appShell.setExpression(currentExpression);

  if (!onboardingComplete) {
    appShell.showOnboarding();
    notifyShellVisible("オンボーディングを表示しました。");
  }

  startup.setStage("game-creating", "ゲーム本体を準備しています…");
  game = createGame(canvas);
  bindTapToGame(canvas, game);

  game.subscribe((snapshot) => {
    appShell.setGameSnapshot(snapshot);
    if (!onboardingComplete) return;
    notifyShellVisible("タイトル画面を表示しました。");
  });

  window.setTimeout(() => {
    recoverAppShellIfEmpty();
  }, 1000);

  window.addEventListener("pagehide", () => {
    stopCamera(video);
  });

  routeExpression();
  startup.setStage("game-ready", "ゲームの準備ができました。");
  startup.setStage("camera-waiting", "カメラはボタンを押すまで開始しません。");
}
