import { getRequiredCanvas, getRequiredHtmlElement, getRequiredVideo } from "./dom";
import { CameraSetupError, setupCamera, stopCamera } from "./camera";
import { clearOwnedCosmetics } from "./cosmetics";
import { createGame, type Game } from "./game";
import { setupFaceModels, startExpressionLoop } from "./face";
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
  let faceLoopStarted = false;
  let pendingStartAfterTutorial = false;
  let game: Game | null = null;
  let shellVisibleNotified = false;

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

  function routeExpression() {
    game?.setExpression(appShell.isBlockingGameInput() ? "neutral" : currentExpression);
  }

  function notifyShellVisible(detail: string) {
    if (shellVisibleNotified) return;
    shellVisibleNotified = true;
    startup.setStage("shell-rendered", detail);
    startup.markReady();
  }

  function finishOnboarding() {
    if (onboardingComplete) return;
    onboardingComplete = true;
    saveOnboardingComplete(true);
  }

  function setCameraUi(nextState: CameraUiState, message: string) {
    cameraState = nextState;
    appShell.setCameraState(nextState, message);
    routeExpression();
  }

  async function enableCamera() {
    if (cameraState === "requesting" || cameraState === "ready") return;

    finishOnboarding();
    startup.setStage("camera-waiting", "カメラの許可を確認しています…");
    setCameraUi("requesting", "カメラの許可を確認しています...");

    try {
      await setupCamera(video);
      startup.setStage("models-loading", "表情認識モデルを読み込んでいます…");
      setCameraUi("requesting", "表情認識の準備をしています...");
      try {
        await setupFaceModels();
      } catch {
        startup.setStage("models-failed", "表情認識モデルを読み込めませんでした。");
        stopCamera(video);
        setCameraUi("error", "表情認識の準備に失敗しました。いまはタップ操作で遊べます。");
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
      setCameraUi("ready", "表情認識の準備ができました。");
    } catch (error) {
      currentExpression = "neutral";
      appShell.setExpression("neutral");

      if (error instanceof CameraSetupError) {
        if (error.kind === "denied") {
          startup.setStage("camera-denied", "カメラの許可がオフです。");
          setCameraUi("denied", "カメラの許可がオフです。あとから設定でオンにできます。");
          return;
        }

        if (error.kind === "unsupported") {
          startup.setStage("camera-unsupported", "この端末ではカメラ機能を利用できません。");
          setCameraUi("unsupported", "この端末やブラウザではカメラ機能を利用できません。");
          return;
        }

        if (error.kind === "unavailable") {
          startup.setStage("camera-unavailable", "カメラがほかのアプリで使用中か見つかりません。");
          setCameraUi("error", "カメラが見つからないか、ほかのアプリで使用中です。");
          return;
        }

        startup.setStage("camera-error", "カメラを起動できませんでした。");
        setCameraUi("error", "カメラを起動できませんでした。");
        return;
      }

      const message =
        error instanceof Error ? error.message : "カメラで不明なエラーが発生しました。";
      startup.setStage("camera-error", message);
      setCameraUi("error", message);
    }
  }

  appShell.setExpression(currentExpression);

  if (!onboardingComplete) {
    appShell.showOnboarding();
    notifyShellVisible("オンボーディングを表示しました。");
  } else {
    appShell.closeOverlay();
  }

  startup.setStage("game-creating", "ゲーム本体を準備しています…");
  game = createGame(canvas);
  bindTapToGame(canvas, game);

  game.subscribe((snapshot) => {
    appShell.setGameSnapshot(snapshot);
    if (!onboardingComplete) return;
    notifyShellVisible("タイトル画面を表示しました。");
  });

  window.addEventListener("pagehide", () => {
    stopCamera(video);
  });

  routeExpression();
  startup.setStage("game-ready", "ゲームの準備ができました。");
  startup.setStage("camera-waiting", "カメラはボタンを押すまで開始しません。");
}
