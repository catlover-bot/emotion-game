import "./style.css";

import type { StartupReporter } from "./app";

const APP_NAME = "表情ランナー";

type BootMode = "loading" | "error";

let startupStage = "boot";
let startupDetail = "起動準備をしています…";
let diagnosticsOpen = false;
let appReady = false;

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getBootMount(): HTMLDivElement {
  const uiRoot = document.getElementById("uiRoot");
  if (uiRoot instanceof HTMLDivElement) {
    return uiRoot;
  }

  const existing = document.getElementById("bootMount");
  if (existing instanceof HTMLDivElement) {
    return existing;
  }

  const mount = document.createElement("div");
  mount.id = "bootMount";
  mount.className = "boot-mount-fallback";
  document.body.appendChild(mount);
  return mount;
}

function formatErrorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "不明なエラーが発生しました。";
  }
}

function renderBootScreen(mode: BootMode, message: string, errorText?: string) {
  const mount = getBootMount();
  const diagnosticHtml = diagnosticsOpen
    ? `
        <div class="boot-diagnostics">
          <strong>診断情報</strong>
          <span>現在の段階: ${escapeHtml(startupStage)}</span>
          <span>詳細: ${escapeHtml(startupDetail)}</span>
          ${errorText ? `<span>エラー: ${escapeHtml(errorText)}</span>` : ""}
        </div>
      `
    : "";
  const actionHtml =
    mode === "error"
      ? `
          <div class="boot-actions">
            <button type="button" data-boot-action="reload" class="primary-button">再読み込み</button>
            <button type="button" data-boot-action="toggle-diagnostics" class="ghost-button">診断</button>
          </div>
        `
      : `
          <div class="boot-actions">
            <button type="button" data-boot-action="toggle-diagnostics" class="ghost-button">診断</button>
          </div>
        `;
  const subtitle =
    mode === "error"
      ? "ベータ版の起動で問題が発生しました。もう一度読み込んでも改善しない場合は、この画面を添えて共有してください。"
      : "初回起動やアップデート直後は、数秒ほど準備に時間がかかることがあります。";
  const title = mode === "error" ? "アプリの起動に失敗しました" : `${APP_NAME}を起動中…`;
  const statusLabel = mode === "error" ? "起動エラー" : "起動ステージ";

  mount.innerHTML = `
    <section class="boot-screen" data-boot-mode="${mode}">
      <div class="boot-card">
        <span class="eyebrow">testflight beta</span>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(subtitle)}</p>
        <div class="boot-meta">
          <strong>${escapeHtml(statusLabel)}</strong>
          <span>${escapeHtml(message)}</span>
        </div>
        ${errorText ? `<div class="boot-error">${escapeHtml(errorText)}</div>` : ""}
        ${actionHtml}
        ${diagnosticHtml}
      </div>
    </section>
  `;

  mount.querySelector<HTMLElement>('[data-boot-action="reload"]')?.addEventListener("click", () => {
    window.location.reload();
  });
  mount
    .querySelector<HTMLElement>('[data-boot-action="toggle-diagnostics"]')
    ?.addEventListener("click", () => {
      diagnosticsOpen = !diagnosticsOpen;
      renderBootScreen(mode, message, errorText);
    });
}

function updateBootStage(stage: string, detail: string) {
  startupStage = stage;
  startupDetail = detail;
  if (!appReady) {
    renderBootScreen("loading", detail);
  }
}

function showStartupFailure(error: unknown, context: string) {
  const errorText = formatErrorText(error);
  startupStage = context;
  startupDetail = "起動処理が途中で停止しました。";
  renderBootScreen("error", "起動処理が完了できませんでした。", errorText);
}

function installGlobalErrorHandlers() {
  window.addEventListener("error", (event) => {
    console.error("window error:", event.error ?? event.message);
    showStartupFailure(event.error ?? event.message, "window-error");
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("unhandled rejection:", event.reason);
    showStartupFailure(event.reason, "unhandled-rejection");
  });
}

async function bootstrap() {
  updateBootStage("bootstrap", "表情ランナーを起動しています…");

  try {
    const { startApp } = await import("./app");

    const startupReporter: StartupReporter = {
      setStage(stage, detail = startupDetail) {
        updateBootStage(stage, detail);
      },
      markReady() {
        appReady = true;
      },
    };

    await startApp(startupReporter);
  } catch (error) {
    console.error("起動時に致命的なエラー:", error);
    showStartupFailure(error, "bootstrap");
  }
}

installGlobalErrorHandlers();
renderBootScreen("loading", startupDetail);

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      updateBootStage("dom-content-loaded", "初期画面を準備しています…");
      void bootstrap();
    },
    { once: true },
  );
} else {
  updateBootStage("dom-ready", "初期画面を準備しています…");
  void bootstrap();
}
