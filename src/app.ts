import { getRequiredCanvas, getRequiredHtmlElement, getRequiredVideo } from "./dom";
import type { CameraDiagnostics, ExpressionRuntimeDiagnostic } from "./camera";
import { CameraSetupError, setupCamera, stopCamera } from "./camera";
import { clearOwnedCosmetics } from "./cosmetics";
import { loadCosmeticAssets } from "./cosmeticAssets";
import { createGame, type Game } from "./game";
import {
  ExpressionLoopSetupError,
  type ExpressionStatus,
  ExpressionModelSetupError,
  getExpressionModelBaseUrl,
  setupExpressionModels,
  startExpressionLoop,
} from "./expressionEngine";
import { createAppShell, type CameraUiState } from "./appShell";
import {
  clearAppStorage,
  loadControlMode,
  loadExpressionSensitivity,
  loadOnboardingComplete,
  loadTutorialComplete,
  resetTutorialComplete,
  saveControlMode,
  saveExpressionSensitivity,
  saveOnboardingComplete,
  saveTutorialComplete,
} from "./storage";
import type { ControlMode, Expression, ExpressionSensitivity } from "./types";
import {
  createAudioManager,
  loadAudioSettings,
  type AudioSettings,
  type BgmTrack,
} from "./audio";
import {
  authenticate as authenticateGameCenter,
  getStatus as getGameCenterStatus,
  refreshStatus as refreshGameCenterStatus,
  showAchievements as showGameCenterAchievements,
  showLeaderboard as showGameCenterLeaderboard,
  type GameCenterStatus,
} from "./gameCenter";

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
    expressionDiagnostics: [],
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
  diagnostics.modelUrl = getExpressionModelBaseUrl();
  diagnostics.selectedModelCandidate = "";
  diagnostics.expressionDiagnostics = [...diagnostics.expressionDiagnostics];
  diagnostics.notes.push(
    "カメラ映像は取得できましたが、表情認識モデルの読み込みに失敗しました。",
  );
  return diagnostics;
}

function createExpressionFailureDiagnostics(
  base: CameraDiagnostics | null,
  video: HTMLVideoElement,
  error: unknown,
  expressionDiagnostics: ExpressionRuntimeDiagnostic[],
): CameraDiagnostics {
  const diagnostics = base
    ? {
        ...base,
        attempts: base.attempts.map((attempt) => ({ ...attempt })),
        notes: [...base.notes],
        modelAssetChecks: base.modelAssetChecks.map((check) => ({ ...check })),
        modelCandidates: base.modelCandidates.map((candidate) => ({
          ...candidate,
          assetChecks: candidate.assetChecks.map((check) => ({ ...check })),
        })),
        expressionDiagnostics: expressionDiagnostics.map((entry) => ({ ...entry })),
      }
    : createRuntimeDiagnostics(video);

  diagnostics.phase = "expression";
  diagnostics.errorName = getErrorName(error);
  diagnostics.errorMessage = getErrorMessage(error);
  diagnostics.videoReadyState = video.readyState;
  diagnostics.videoWidth = video.videoWidth;
  diagnostics.videoHeight = video.videoHeight;
  diagnostics.modelUrl = getExpressionModelBaseUrl();
  diagnostics.notes.push(
    "カメラとモデルの準備後に、表情認識の実行でエラーが発生しました。",
    "表情認識だけを停止し、タップ操作で遊べる状態にしています。",
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
  let controlMode: ControlMode = loadControlMode();
  let expressionSensitivity: ExpressionSensitivity = loadExpressionSensitivity();
  let audioSettings: AudioSettings = loadAudioSettings();
  let gameCenterStatus: GameCenterStatus = getGameCenterStatus();
  let cameraState: CameraUiState = "idle";
  let lastCameraDiagnostics: CameraDiagnostics | null = null;
  let faceLoopStarted = false;
  let stopFaceLoop: (() => void) | null = null;
  let pendingStartAfterTutorial = false;
  let game: Game | null = null;
  let shellVisibleNotified = false;
  let recoveryScheduled = false;
  const audio = createAudioManager(audioSettings);
  let lastBgmTrack: BgmTrack | null = null;
  let lastSnapshotScene = "";
  let lastSnapshotActionText: string | null = null;
  let lastSnapshotAchievementText: string | null = null;
  let lastSnapshotMissionRewardEarned = false;
  let lastSnapshotGachaResultKey = "";

  function getBgmTrackForSnapshot(snapshot: ReturnType<Game["getSnapshot"]>): BgmTrack {
    if (snapshot.scene === "play") return snapshot.gameOver ? "result" : "gameplay";
    if (snapshot.scene === "gacha") return "gacha";
    if (snapshot.scene === "customize") return "customize";
    return "title";
  }

  function routeAudio(snapshot: ReturnType<Game["getSnapshot"]>) {
    const track = getBgmTrackForSnapshot(snapshot);
    if (track !== lastBgmTrack) {
      lastBgmTrack = track;
      audio.requestBgm(track);
    }

    const sceneKey = `${snapshot.scene}:${snapshot.gameOver ? "result" : "active"}`;
    if (sceneKey !== lastSnapshotScene) {
      lastSnapshotScene = sceneKey;
      if (snapshot.gameOver) {
        audio.playSfx("resultFanfare", 1000);
      }
    }

    if (snapshot.lastActionText && snapshot.lastActionText !== lastSnapshotActionText) {
      if (snapshot.lastActionText.includes("フィーバー")) audio.playSfx("feverStart", 900);
      else if (snapshot.lastActionText.includes("ジャンプ")) audio.playSfx("jump", 130);
      else if (snapshot.lastActionText.includes("アタック") || snapshot.lastActionText.includes("攻撃")) audio.playSfx("attack", 130);
      else if (snapshot.lastActionText.includes("ブースト")) audio.playSfx("boost", 160);
    }
    lastSnapshotActionText = snapshot.lastActionText;

    const achievementText = snapshot.achievementToast ?? "";
    if (achievementText && achievementText !== lastSnapshotAchievementText) {
      audio.playSfx("achievement", 700);
    }
    lastSnapshotAchievementText = achievementText;

    if (snapshot.missionRewardEarned && !lastSnapshotMissionRewardEarned) {
      audio.playSfx("missionClear", 700);
    }
    lastSnapshotMissionRewardEarned = snapshot.missionRewardEarned;

    const gachaResultKey = snapshot.gachaResult
      ? `${snapshot.gachaResult.name}:${snapshot.gachaResult.ageTicks > 20 ? "revealed" : "new"}`
      : "";
    if (gachaResultKey && gachaResultKey !== lastSnapshotGachaResultKey && snapshot.gachaResult?.ageTicks === 0) {
      audio.playSfx("gachaReveal", 500);
    }
    lastSnapshotGachaResultKey = gachaResultKey;
  }

  function setGameCenterStatus(status: GameCenterStatus) {
    gameCenterStatus = status;
    appShell?.setGameCenterStatus(gameCenterStatus);
  }

  startup.setStage("shell-rendered", "初回画面を表示しています…");

  const appShell = createAppShell({
    root: uiRoot,
    onStartGame() {
      audio.unlock();
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
      audio.unlock();
      audio.playSfx("confirm");
      if (!game) return;
      appShell.closeOverlay();
      game.openCustomize();
      routeExpression();
    },
    onOpenGacha() {
      audio.unlock();
      audio.playSfx("confirm");
      if (!game) return;
      appShell.closeOverlay();
      game.openGacha();
      routeExpression();
    },
    onOpenRanking() {
      audio.unlock();
      audio.playSfx("confirm");
      game?.openRanking();
      void refreshGameCenterStatus().then(setGameCenterStatus);
    },
    onBackToTitle() {
      audio.unlock();
      audio.playSfx("back");
      if (!game) return;
      pendingStartAfterTutorial = false;
      appShell.closeOverlay();
      game.goToTitle();
      routeExpression();
    },
    onCycleCharacter() {
      audio.playSfx("confirm", 150);
      game?.cycleCharacter();
    },
    onCycleBackground() {
      audio.playSfx("confirm", 150);
      game?.cycleBackground();
    },
    onCycleItem() {
      audio.playSfx("confirm", 150);
      game?.cycleItem();
    },
    onRollGacha() {
      audio.playSfx("confirm", 250);
      game?.rollGachaAction();
    },
    onEquipLastGachaResult() {
      audio.playSfx("confirm");
      game?.equipLastGachaResult();
    },
    onShare() {
      audio.playSfx("confirm");
      void game?.share();
    },
    onRetryGame() {
      audio.unlock();
      audio.playSfx("confirm");
      if (!game) return;
      appShell.closeOverlay();
      game.retry();
      routeExpression();
    },
    onEnableCamera() {
      audio.unlock();
      audio.playSfx("confirm");
      void enableCamera();
    },
    onContinueWithoutCamera() {
      audio.unlock();
      audio.playSfx("confirm");
      finishOnboarding();
      pendingStartAfterTutorial = false;
      controlMode = "tap";
      saveControlMode("tap");
      game?.setControlMode("tap");
      appShell.setControlMode("tap");
      appShell.closeOverlay();
      routeExpression();
    },
    onCloseOverlay() {
      audio.unlock();
      audio.playSfx("back");
      if (appShell.getOverlay() === "onboarding") {
        finishOnboarding();
      }
      pendingStartAfterTutorial = false;
      appShell.closeOverlay();
      routeExpression();
    },
    onFinishTutorial() {
      audio.unlock();
      audio.playSfx("confirm");
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
      audio.unlock();
      game?.triggerAction(action);
    },
    onSetControlMode(mode) {
      setControlMode(mode);
    },
    onSetExpressionSensitivity(sensitivity) {
      setExpressionSensitivity(sensitivity);
    },
    onSetAudioSettings(settings) {
      audioSettings = settings;
      audio.setSettings(settings);
      appShell.setAudioSettings(audioSettings);
    },
    onSetExpressionNavHintsVisible(visible) {
      audio.playSfx("confirm");
      appShell.setExpressionNavHintsVisible(visible);
    },
    onConnectGameCenter() {
      audio.unlock();
      audio.playSfx("confirm");
      setGameCenterStatus({
        ...gameCenterStatus,
        available: true,
        usingNative: true,
        connectionState: "connecting",
        message: "Game Centerに接続しています…",
      });
      void authenticateGameCenter().then(setGameCenterStatus);
    },
    onShowGameCenterLeaderboard() {
      audio.unlock();
      audio.playSfx("confirm");
      void showGameCenterLeaderboard().then(setGameCenterStatus);
    },
    onShowGameCenterAchievements() {
      audio.unlock();
      audio.playSfx("confirm");
      void showGameCenterAchievements().then(setGameCenterStatus);
    },
    onUserGesture() {
      audio.unlock();
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
  appShell.setControlMode(controlMode);
  appShell.setExpressionSensitivity(expressionSensitivity);
  appShell.setAudioSettings(audioSettings);
  appShell.setGameCenterStatus(gameCenterStatus);
  void refreshGameCenterStatus().then(setGameCenterStatus);

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
    const snapshot = game?.getSnapshot();
    const shouldRouteToGameplay =
      snapshot?.scene === "play" &&
      !snapshot.gameOver;
    const expressionForGame =
      controlMode === "expression" &&
      cameraState === "ready" &&
      !appShell.isBlockingGameInput() &&
      shouldRouteToGameplay
        ? currentExpression
        : "neutral";
    game?.setExpression(expressionForGame);
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

  function setControlMode(mode: ControlMode) {
    controlMode = mode;
    saveControlMode(mode);
    appShell.setControlMode(mode);
    game?.setControlMode(mode);

    if (mode === "expression" && cameraState !== "ready") {
      appShell.showCameraOverlay();
    }

    routeExpression();
  }

  function setExpressionSensitivity(sensitivity: ExpressionSensitivity) {
    expressionSensitivity = sensitivity;
    saveExpressionSensitivity(sensitivity);
    appShell.setExpressionSensitivity(sensitivity);

    if (cameraState === "ready") {
      stopFaceLoop?.();
      stopFaceLoop = null;
      faceLoopStarted = false;
      startFaceLoopSafely();
    }
  }

  function handleExpressionStatus(status: ExpressionStatus) {
    appShell.setExpressionStatus(status);
  }

  function markExpressionUnavailable(
    error: unknown,
    expressionDiagnostics: ExpressionRuntimeDiagnostic[],
  ) {
    currentExpression = "neutral";
    appShell.setExpression("neutral");

    stopFaceLoop?.();
    stopFaceLoop = null;
    faceLoopStarted = false;
    controlMode = "tap";
    saveControlMode("tap");
    game?.setControlMode("tap");
    appShell.setControlMode("tap");

    const diagnostics = createExpressionFailureDiagnostics(
      lastCameraDiagnostics,
      video,
      error,
      expressionDiagnostics,
    );
    lastCameraDiagnostics = diagnostics;

    console.error("EMOTION_RUNNER_EXPR unavailable", {
      errorName: diagnostics.errorName,
      errorMessage: diagnostics.errorMessage,
      expressionDiagnostics: diagnostics.expressionDiagnostics,
      videoReadyState: diagnostics.videoReadyState,
      videoWidth: diagnostics.videoWidth,
      videoHeight: diagnostics.videoHeight,
    });

    startup.setStage("expression-unavailable", "表情認識は停止しました。タップ操作で遊べます。");
    setCameraUi(
      "expressionUnavailable",
      "カメラとタップ操作は使えます。いまはタップ操作で遊べます。",
      {
        title: "表情認識の実行に失敗しました",
        diagnostics,
      },
    );
  }

  function startFaceLoopSafely(): boolean {
    if (faceLoopStarted) {
      return true;
    }

    try {
      const controller = startExpressionLoop(
        video,
        (expression) => {
          currentExpression = expression;
          appShell.setExpression(expression);
          routeExpression();
        },
        (error, diagnostics) => {
          markExpressionUnavailable(error, diagnostics);
        },
        {
          sensitivity: expressionSensitivity,
          onStatus: handleExpressionStatus,
        },
      );
      stopFaceLoop = controller.stop;
      faceLoopStarted = true;
      return true;
    } catch (error) {
      const expressionDiagnostics = error instanceof ExpressionLoopSetupError
        ? error.diagnostics
        : [];
      markExpressionUnavailable(error, expressionDiagnostics);
      return false;
    }
  }

  async function enableCamera() {
    if (cameraState === "requesting" || cameraState === "ready") return;

    finishOnboarding();
    stopFaceLoop?.();
    stopFaceLoop = null;
    faceLoopStarted = false;
    startup.setStage("camera-waiting", "カメラの許可を確認しています…");
    setCameraUi("requesting", "カメラの許可を確認しています...");

    try {
      lastCameraDiagnostics = await setupCamera(video);
      startup.setStage("models-loading", "表情認識モデルを読み込んでいます…");
      setCameraUi("requesting", "表情認識の準備をしています...");
      try {
        lastCameraDiagnostics = await setupExpressionModels(lastCameraDiagnostics);
      } catch (error) {
        const diagnostics = error instanceof ExpressionModelSetupError
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
        controlMode = "tap";
        saveControlMode("tap");
        game?.setControlMode("tap");
        appShell.setControlMode("tap");
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

      startup.setStage("expression-loop-starting", "表情認識を開始しています…");
      if (!startFaceLoopSafely()) {
        return;
      }

      startup.setStage("camera-ready", "表情認識の準備ができました。");
      console.info("EMOTION_RUNNER_CAMERA ready", {
        videoReadyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
      controlMode = "expression";
      saveControlMode("expression");
      game?.setControlMode("expression");
      appShell.setControlMode("expression");
      setCameraUi("ready", "表情認識の準備ができました。");
    } catch (error) {
      currentExpression = "neutral";
      appShell.setExpression("neutral");
      controlMode = "tap";
      saveControlMode("tap");
      game?.setControlMode("tap");
      appShell.setControlMode("tap");
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

  startup.setStage("cosmetics-loading", "着せ替え素材を確認しています…");
  await loadCosmeticAssets();

  startup.setStage("game-creating", "ゲーム本体を準備しています…");
  game = createGame(canvas);
  game.setControlMode(controlMode);
  bindTapToGame(canvas, game);

  game.subscribe((snapshot) => {
    appShell.setGameSnapshot(snapshot);
    routeAudio(snapshot);
    if (!onboardingComplete) return;
    notifyShellVisible("タイトル画面を表示しました。");
  });

  window.setTimeout(() => {
    recoverAppShellIfEmpty();
  }, 1000);

  window.addEventListener("pagehide", () => {
    stopFaceLoop?.();
    stopFaceLoop = null;
    faceLoopStarted = false;
    stopCamera(video);
  });

  routeExpression();
  startup.setStage("game-ready", "ゲームの準備ができました。");
  startup.setStage("camera-waiting", "カメラはボタンを押すまで開始しません。");
}
