import type { Expression } from "./types";
import type { GameAction, GameSnapshot } from "./game";
import type { Rarity } from "./cosmetics";

export type CameraUiState =
  | "idle"
  | "requesting"
  | "ready"
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
  | "settings";

type PracticeMode = "learn" | "start";
type TutorialExpression = Exclude<Expression, "neutral">;

type AppShellOptions = {
  root: HTMLElement;
  onStartGame(): void;
  onOpenCustomize(): void;
  onOpenGacha(): void;
  onBackToTitle(): void;
  onCycleCharacter(): void;
  onCycleBackground(): void;
  onRollGacha(): void;
  onShare(): void;
  onRetryGame(): void;
  onEnableCamera(): void;
  onContinueWithoutCamera(): void;
  onCloseOverlay(): void;
  onFinishTutorial(): void;
  onTouchAction(action: GameAction): void;
  onOverlayChanged(): void;
  onResetTutorial(): void;
  onResetData(): void;
};

type AppShellState = {
  overlay: OverlayScreen;
  game: GameSnapshot | null;
  cameraState: CameraUiState;
  cameraMessage: string;
  expression: Expression;
  tutorialSeen: Record<TutorialExpression, boolean>;
  practiceMode: PracticeMode;
  practiceStep: number;
  confirmResetData: boolean;
  settingsNotice: string;
};

const APP_NAME = "表情ランナー";

const TUTORIAL_ORDER: TutorialExpression[] = [
  "happy",
  "angry",
  "surprised",
  "sad",
];

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
      return "まだ認識できていません";
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

export type AppShell = ReturnType<typeof createAppShell>;

export function createAppShell(options: AppShellOptions) {
  const { root } = options;

  const state: AppShellState = {
    overlay: "none",
    game: null,
    cameraState: "idle",
    cameraMessage: "",
    expression: "neutral",
    tutorialSeen: createEmptyTutorialSeen(),
    practiceMode: "learn",
    practiceStep: 0,
    confirmResetData: false,
    settingsNotice: "",
  };

  function renderAndNotify() {
    render();
    options.onOverlayChanged();
  }

  function setOverlay(overlay: OverlayScreen) {
    state.overlay = overlay;
    renderAndNotify();
  }

  function resetPracticeState(mode: PracticeMode) {
    state.practiceMode = mode;
    state.practiceStep = 0;
    state.tutorialSeen = createEmptyTutorialSeen();
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
    render();
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

    return `
      <div class="floating-banner is-warning">
        <strong>いまはタップ操作で遊べます</strong>
        <span>カメラを許可すると、表情操作も使えるようになります。</span>
        <button type="button" data-action="open-camera-overlay" class="ghost-button">カメラを許可する</button>
      </div>
    `;
  }

  function getTitleMenuHtml(game: GameSnapshot) {
    return `
      <section class="menu-panel title-panel">
        <div class="hero-copy">
          <span class="eyebrow">かおであそぶアクション</span>
          <h1>${APP_NAME}</h1>
          <p>表情でもタップでも遊べる、顔で走るカジュアルアクションです。</p>
        </div>

        <div class="hero-stats">
          <div class="stat-pill">
            <span>今日のベスト</span>
            <strong>${game.dailyBest}</strong>
          </div>
          <div class="stat-pill">
            <span>コイン</span>
            <strong>${game.coins}</strong>
          </div>
        </div>

        <div class="menu-grid title-menu-grid">
          <button type="button" data-action="start-game" class="primary-button">ゲーム開始</button>
          <button type="button" data-action="open-how-to" class="secondary-button">あそび方</button>
          <button type="button" data-action="open-customize" class="secondary-button">着せ替え</button>
          <button type="button" data-action="open-gacha" class="secondary-button">ガチャ</button>
          <button type="button" data-action="open-privacy" class="ghost-button">プライバシー</button>
        </div>

        <div class="face-hints">
          <span>笑顔で開始</span>
          <span>怒った顔で着せ替え</span>
          <span>驚いた顔でガチャ</span>
          <span>タップだけでも遊べます</span>
        </div>

        <div class="title-footer-actions">
          <button type="button" data-action="open-settings" class="text-button">設定とデータ</button>
        </div>
      </section>
    `;
  }

  function getCustomizeHtml(game: GameSnapshot) {
    return `
      <section class="menu-panel compact">
        <div class="panel-header">
          <div>
            <span class="eyebrow">きせかえ</span>
            <h2>着せ替え</h2>
          </div>
          <button type="button" data-action="back-to-title" class="ghost-button">タイトルへ</button>
        </div>

        <div class="detail-grid">
          <article class="detail-card">
            <span>キャラ</span>
            <strong>${escapeHtml(game.charName)}</strong>
            <small>レア度: ${escapeHtml(getRarityLabel(game.charRarity))}</small>
            <button type="button" data-action="cycle-character" class="secondary-button">キャラを切り替える</button>
          </article>
          <article class="detail-card">
            <span>背景</span>
            <strong>${escapeHtml(game.bgName)}</strong>
            <small>レア度: ${escapeHtml(getRarityLabel(game.bgRarity))}</small>
            <button type="button" data-action="cycle-background" class="secondary-button">背景を切り替える</button>
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

        <div class="menu-grid single">
          <button type="button" data-action="roll-gacha" class="primary-button" ${disabled}>ガチャを引く</button>
        </div>

        <div class="helper-copy">表情ショートカット: 笑顔で引く / 悲しい顔で戻る</div>
      </section>
    `;
  }

  function getTouchControlsHtml(game: GameSnapshot) {
    if (game.scene !== "play" || game.gameOver) return "";

    return `
      <div class="touch-controls">
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

  function getGameOverActionsHtml(game: GameSnapshot) {
    if (game.scene !== "play" || !game.gameOver) return "";

    return `
        <div class="result-actions">
        <button type="button" data-action="share-result" class="secondary-button">共有</button>
        <button type="button" data-action="retry-game" class="primary-button">もう一度</button>
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
      </div>
    `;
  }

  function getOnboardingHtml() {
    return `
      <section class="modal-screen">
        <div class="modal-card onboarding-card">
          <span class="eyebrow">はじめてのあそび方</span>
          <h2>${APP_NAME}</h2>
          <p>表情でキャラクターを動かす、かんたんアクションゲームです。</p>

          <div class="intro-grid">
            <article class="detail-card">
              <strong>😄 笑顔でジャンプ</strong>
              <small>🔥 怒った顔で攻撃 / 😲 驚いた顔でブースト</small>
            </article>
            <article class="detail-card">
              <strong>端末内だけで処理</strong>
              <small>カメラ映像は保存・送信されません。</small>
            </article>
          </div>

          <div class="button-row">
            <button type="button" data-action="open-camera-overlay" class="primary-button">つぎへ</button>
            <button type="button" data-action="close-overlay" class="ghost-button">あとで見る</button>
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
          <h2>カメラを許可すると、表情で遊べます</h2>
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
    return `
      <section class="modal-screen">
        <div class="modal-card">
          <span class="eyebrow">カメラの許可が必要です</span>
          <h2>カメラの許可がオフになっています</h2>
          <p>
            いまはタップ操作で遊べます。表情操作を使いたいときは、iPhoneの設定やブラウザ設定で
            カメラを許可してから、もう一度確認してください。
          </p>
          <ul class="tip-list">
            <li>Safari の場合: アドレスバーの設定からカメラを許可してください。</li>
            <li>iPhone アプリの場合: 「設定」→「表情ランナー」→「カメラ」をオンにしてください。</li>
            <li>設定後、この画面に戻ってもう一度カメラを確認します。</li>
          </ul>
          <div class="button-row">
            <button type="button" data-action="enable-camera" class="primary-button">もう一度カメラを確認</button>
            <button type="button" data-action="continue-without-camera" class="ghost-button">タップ操作で遊ぶ</button>
          </div>
        </div>
      </section>
    `;
  }

  function getCameraErrorHtml() {
    const message = state.cameraMessage || "カメラの起動に失敗しました。";

    return `
      <section class="modal-screen">
        <div class="modal-card">
          <span class="eyebrow">カメラエラー</span>
          <h2>カメラを起動できませんでした</h2>
          <p>${escapeHtml(message)}</p>
          <p>タップ操作でそのまま遊べます。必要なときだけ後からカメラを再確認してください。</p>
          <div class="button-row">
            <button type="button" data-action="enable-camera" class="primary-button">もう一度カメラを確認</button>
            <button type="button" data-action="continue-without-camera" class="ghost-button">タップ操作で遊ぶ</button>
          </div>
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
              <strong>😄 笑顔</strong>
              <small>ジャンプ / スタート / コンティニュー</small>
            </article>
            <article class="detail-card">
              <strong>🔥 怒った顔</strong>
              <small>攻撃</small>
            </article>
            <article class="detail-card">
              <strong>😲 驚いた顔</strong>
              <small>ブースト / ガチャ操作</small>
            </article>
            <article class="detail-card">
              <strong>😢 悲しい顔</strong>
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
    const matched = state.tutorialSeen[target];
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
              <span class="eyebrow">表情の練習</span>
              <h2>表情の練習</h2>
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
          </article>

          <div class="expression-status">
            <strong>ねらう表情: ${copy.label}</strong>
            <span>この表情で「${copy.action}」します。無理なときはスキップして先へ進めます。</span>
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
            <li>カメラは表情を検出するためだけに使用します。</li>
            <li>カメラ映像は端末内で処理されます。</li>
            <li>カメラ画像や表情データは保存・送信・共有されません。</li>
            <li>スコア、コイン、スキンなどのゲーム進行データは端末内に保存されます。</li>
            <li>アカウント登録は不要です。</li>
            <li>広告、解析、トラッキングは使用していません。</li>
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

          <div class="menu-grid single utility-grid">
            <button type="button" data-action="open-how-to" class="secondary-button">あそび方をもう一度見る</button>
            <button type="button" data-action="reset-tutorial" class="secondary-button">チュートリアルをリセット</button>
            <button type="button" data-action="request-reset-data" class="ghost-button">データをリセット</button>
            <button type="button" data-action="open-privacy" class="ghost-button">プライバシーを見る</button>
          </div>

          ${noticeHtml}
          ${confirmHtml}
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
          case "open-privacy":
            state.confirmResetData = false;
            setOverlay("privacy");
            break;
          case "open-settings":
            state.confirmResetData = false;
            state.settingsNotice = "";
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
          case "roll-gacha":
            options.onRollGacha();
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
    const touchControls = game ? getTouchControlsHtml(game) : "";
    const resultActions = game ? getGameOverActionsHtml(game) : "";

    root.innerHTML = `
      <div class="ui-layer">
        <div class="top-overlay">
          ${floatingBanner}
        </div>
        <div class="scene-overlay ${game?.scene === "play" ? "is-play" : ""}">
          ${sceneHtml}
        </div>
        ${gameplayNotice}
        ${touchControls}
        ${resultActions}
        ${getOverlayHtml()}
      </div>
    `;

    bindEvents();
  }

  return {
    setGameSnapshot(snapshot: GameSnapshot) {
      state.game = snapshot;
      render();
    },
    setCameraState(cameraState: CameraUiState, cameraMessage = "") {
      state.cameraState = cameraState;
      state.cameraMessage = cameraMessage;

      if (cameraState === "denied") {
        setOverlay("cameraDenied");
      } else if (cameraState === "unsupported" || cameraState === "error") {
        setOverlay("cameraError");
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
        }
        render();
      }
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
