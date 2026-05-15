import "./style.css";

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

async function main() {
  const video = getRequiredVideo("video");
  const canvas = getRequiredCanvas("gameCanvas");
  const uiRoot = getRequiredHtmlElement("uiRoot", HTMLDivElement);

  video.setAttribute("playsinline", "true");
  video.playsInline = true;

  const game = createGame(canvas);
  bindTapToGame(canvas, game);

  let onboardingComplete = loadOnboardingComplete();
  let tutorialComplete = loadTutorialComplete();
  let currentExpression: Expression = "neutral";
  let cameraState: CameraUiState = "idle";
  let faceLoopStarted = false;
  let pendingStartAfterTutorial = false;

  const appShell = createAppShell({
    root: uiRoot,
    onStartGame() {
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
      appShell.closeOverlay();
      game.openCustomize();
      routeExpression();
    },
    onOpenGacha() {
      appShell.closeOverlay();
      game.openGacha();
      routeExpression();
    },
    onBackToTitle() {
      pendingStartAfterTutorial = false;
      appShell.closeOverlay();
      game.goToTitle();
      routeExpression();
    },
    onCycleCharacter() {
      game.cycleCharacter();
    },
    onCycleBackground() {
      game.cycleBackground();
    },
    onRollGacha() {
      game.rollGachaAction();
    },
    onShare() {
      void game.share();
    },
    onRetryGame() {
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
      if (pendingStartAfterTutorial) {
        pendingStartAfterTutorial = false;
        game.startRun();
      }
      routeExpression();
    },
    onTouchAction(action) {
      game.triggerAction(action);
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

  game.subscribe((snapshot) => {
    appShell.setGameSnapshot(snapshot);
  });

  function routeExpression() {
    game.setExpression(appShell.isBlockingGameInput() ? "neutral" : currentExpression);
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
    setCameraUi("requesting", "カメラの許可を確認しています...");

    try {
      await setupCamera(video);
      setCameraUi("requesting", "表情認識の準備をしています...");
      try {
        await setupFaceModels();
      } catch {
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

      setCameraUi("ready", "表情認識の準備ができました。");
    } catch (error) {
      currentExpression = "neutral";
      appShell.setExpression("neutral");

      if (error instanceof CameraSetupError) {
        if (error.kind === "denied") {
          setCameraUi("denied", "カメラの許可がオフです。あとから設定でオンにできます。");
          return;
        }

        if (error.kind === "unsupported") {
          setCameraUi("unsupported", "この端末やブラウザではカメラ機能を利用できません。");
          return;
        }

        if (error.kind === "unavailable") {
          setCameraUi("error", "カメラが見つからないか、ほかのアプリで使用中です。");
          return;
        }

        setCameraUi("error", "カメラを起動できませんでした。");
        return;
      }

      const message =
        error instanceof Error ? error.message : "カメラで不明なエラーが発生しました。";
      setCameraUi("error", message);
    }
  }

  window.addEventListener("pagehide", () => {
    stopCamera(video);
  });

  appShell.setExpression(currentExpression);

  if (!onboardingComplete) {
    appShell.showOnboarding();
  } else {
    appShell.closeOverlay();
  }

  routeExpression();
}

window.addEventListener("load", () => {
  main().catch((error) => {
    console.error("起動時に致命的なエラー:", error);
  });
});
