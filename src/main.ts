import "./style.css";

import type { StartupReporter } from "./app";

declare global {
  interface Window {
    __EMOTION_RUNNER_STATIC_HTML_LOADED__?: boolean;
    __EMOTION_RUNNER_BUILD__?: string;
    __EMOTION_RUNNER_STAGE__?: string;
    __EMOTION_RUNNER_APP_READY__?: boolean;
  }
}

const APP_NAME = "表情ランナー";
const DIAGNOSTIC_BUILD = window.__EMOTION_RUNNER_BUILD__ ?? "11";

const STAMP_BASE_STYLE = `
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  padding:
    calc(24px + env(safe-area-inset-top))
    calc(24px + env(safe-area-inset-right))
    calc(24px + env(safe-area-inset-bottom))
    calc(24px + env(safe-area-inset-left));
  background:
    radial-gradient(circle at top, rgba(251, 146, 60, 0.36), transparent 36%),
    linear-gradient(180deg, #3f1d0b, #7c2d12);
  color: #ffffff;
  pointer-events: auto;
  box-sizing: border-box;
`;

const STAMP_WRAPPER_STYLE = `
  max-width: 760px;
  width: 100%;
  display: grid;
  gap: 16px;
  text-align: center;
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Hiragino Sans", sans-serif;
`;

const STAMP_TEXT_STYLE = `
  white-space: pre-line;
  font-size: clamp(24px, 4vw, 42px);
  line-height: 1.5;
  font-weight: 700;
  letter-spacing: 0.02em;
`;

const STAMP_PANEL_STYLE = `
  display: grid;
  gap: 8px;
  padding: 16px 18px;
  border-radius: 22px;
  background: rgba(8, 21, 39, 0.78);
  border: 1px solid rgba(191, 219, 254, 0.22);
  color: rgba(226, 232, 240, 0.92);
  font-size: 16px;
  line-height: 1.5;
`;

const STAMP_BUTTON_STYLE = `
  align-self: center;
  min-width: 180px;
  min-height: 54px;
  border: 0;
  border-radius: 18px;
  padding: 14px 20px;
  background: linear-gradient(135deg, #f97316, #fb7185);
  color: #ffffff;
  font-size: 18px;
  font-weight: 700;
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Hiragino Sans", sans-serif;
`;

let startupStage = "boot";
let startupDetail = "起動準備をしています…";
let appReady = false;

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getOrCreateHardBootStamp(): HTMLDivElement {
  const existing = document.getElementById("hardBootStamp");
  if (existing instanceof HTMLDivElement) {
    existing.style.cssText = STAMP_BASE_STYLE;
    return existing;
  }

  const stamp = document.createElement("div");
  stamp.id = "hardBootStamp";
  stamp.style.cssText = STAMP_BASE_STYLE;
  document.body.appendChild(stamp);
  return stamp;
}

function renderHardBootStamp(detail: string, note?: string) {
  const stamp = getOrCreateHardBootStamp();
  stamp.style.display = "flex";
  stamp.innerHTML = `
    <div style="${STAMP_WRAPPER_STYLE}">
      <div id="hardBootStampText" style="${STAMP_TEXT_STYLE}">${escapeHtml(
        `${APP_NAME}\nTestFlight診断ビルド\nBuild ${DIAGNOSTIC_BUILD} / ${detail}`,
      ).replaceAll("\n", "<br>")}</div>
      ${
        note
          ? `<div style="${STAMP_PANEL_STYLE}">${escapeHtml(note).replaceAll("\n", "<br>")}</div>`
          : ""
      }
    </div>
  `;
}

function getErrorInfo(error: unknown): { name: string; message: string; stack: string } {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || "エラーメッセージが取得できませんでした。",
      stack: error.stack ?? "",
    };
  }

  if (typeof error === "string") {
    return { name: "Error", message: error, stack: "" };
  }

  try {
    return {
      name: "UnknownError",
      message: JSON.stringify(error) || "不明なエラーが発生しました。",
      stack: "",
    };
  } catch {
    return {
      name: "UnknownError",
      message: "不明なエラーが発生しました。",
      stack: "",
    };
  }
}

function showStartupFailure(error: unknown) {
  const previousStage = startupStage;
  const { name, message, stack } = getErrorInfo(error);

  startupStage = "app-error";
  startupDetail = message;
  window.__EMOTION_RUNNER_STAGE__ = "app-error";
  window.__EMOTION_RUNNER_APP_READY__ = false;
  appReady = false;

  const stamp = getOrCreateHardBootStamp();
  const diagnosticText = [
    `${APP_NAME} TestFlight診断ビルド Build ${DIAGNOSTIC_BUILD}`,
    `current stage: app-error`,
    `previous stage: ${previousStage}`,
    `startup detail: ${startupDetail}`,
    `error.name: ${name}`,
    `error.message: ${message}`,
    `error.stack: ${stack || "-"}`,
    `location.href: ${window.location.href}`,
    `userAgent: ${navigator.userAgent}`,
  ].join("\n");

  stamp.style.display = "flex";
  stamp.innerHTML = `
    <div style="${STAMP_WRAPPER_STYLE}">
      <div style="${STAMP_TEXT_STYLE}">${escapeHtml(
        `${APP_NAME}\nTestFlight診断ビルド\nBuild ${DIAGNOSTIC_BUILD}\nアプリの起動に失敗しました`,
      ).replaceAll("\n", "<br>")}</div>
      <div style="${STAMP_PANEL_STYLE}">
        <strong>現在の段階</strong>
        <span>${escapeHtml(`app-error (直前: ${previousStage})`)}</span>
      </div>
      <div style="${STAMP_PANEL_STYLE}">
        <strong>エラー名</strong>
        <span>${escapeHtml(name)}</span>
      </div>
      <div style="${STAMP_PANEL_STYLE}">
        <strong>エラーメッセージ</strong>
        <span>${escapeHtml(message)}</span>
      </div>
      <div style="${STAMP_PANEL_STYLE}">
        <strong>スタック</strong>
        <span>${escapeHtml(stack || "スタック情報は取得できませんでした。").replaceAll("\n", "<br>")}</span>
      </div>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;">
        <button id="hardBootCopyButton" type="button" style="${STAMP_BUTTON_STYLE}">診断情報をコピー</button>
        <button id="hardBootReloadButton" type="button" style="${STAMP_BUTTON_STYLE}">再読み込み</button>
      </div>
    </div>
  `;

  stamp.querySelector<HTMLButtonElement>("#hardBootCopyButton")?.addEventListener("click", async () => {
    const button = stamp.querySelector<HTMLButtonElement>("#hardBootCopyButton");
    try {
      await navigator.clipboard?.writeText(diagnosticText);
      if (button) button.textContent = "コピーしました";
    } catch {
      if (button) button.textContent = "コピーできませんでした";
      console.info("EMOTION_RUNNER_STARTUP_DIAG", diagnosticText);
    }
  });

  stamp.querySelector<HTMLButtonElement>("#hardBootReloadButton")?.addEventListener("click", () => {
    window.location.reload();
  });
}

function setStage(stage: string, detail: string) {
  startupStage = stage;
  startupDetail = detail;
  window.__EMOTION_RUNNER_STAGE__ = stage;

  if (!appReady) {
    renderHardBootStamp(detail, `起動段階: ${stage}`);
  }
}

function handleGlobalStartupError(error: unknown) {
  const info = getErrorInfo(error);

  if (appReady || window.__EMOTION_RUNNER_APP_READY__ === true) {
    console.error("EMOTION_RUNNER_RUNTIME_ERROR_AFTER_READY", {
      stage: startupStage,
      name: info.name,
      message: info.message,
      stack: info.stack,
    });
    return;
  }

  showStartupFailure(error);
}

function markAppShellVisible() {
  if (appReady) return;

  startupStage = "app-shell-visible";
  startupDetail = "アプリ画面を表示しました。";
  appReady = true;
  window.__EMOTION_RUNNER_STAGE__ = "app-shell-visible";
  window.__EMOTION_RUNNER_APP_READY__ = true;

  const stamp = getOrCreateHardBootStamp();
  renderHardBootStamp("アプリ画面を表示しました。", "起動段階: app-shell-visible");
  window.setTimeout(() => {
    stamp.remove();
  }, 900);
}

function installGlobalErrorHandlers() {
  window.addEventListener("error", (event) => {
    console.error("window error:", event.error ?? event.message);
    handleGlobalStartupError(event.error ?? event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("unhandled rejection:", event.reason);
    handleGlobalStartupError(event.reason);
  });
}

async function bootstrap() {
  try {
    setStage("app-import-start", "app.ts を読み込み中…");
    const { startApp } = await import("./app");
    setStage("app-import-done", "app.ts の読み込みが完了しました");

    const startupReporter: StartupReporter = {
      setStage(stage, detail = startupDetail) {
        setStage(stage, detail);
      },
      markReady() {
        markAppShellVisible();
      },
    };

    setStage("app-start-start", "アプリ本体を起動しています…");
    await startApp(startupReporter);
  } catch (error) {
    console.error("起動時に致命的なエラー:", error);
    showStartupFailure(error);
  }
}

window.__EMOTION_RUNNER_APP_READY__ = false;
window.__EMOTION_RUNNER_BUILD__ = DIAGNOSTIC_BUILD;
installGlobalErrorHandlers();
setStage("main-loaded", "main.ts 読み込み完了");

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      setStage("dom-content-loaded", "初期画面を準備しています…");
      void bootstrap();
    },
    { once: true },
  );
} else {
  setStage("dom-ready", "初期画面を準備しています…");
  void bootstrap();
}
