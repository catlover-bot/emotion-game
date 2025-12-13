// src/main.ts
import { getRequiredVideo, getRequiredCanvas } from "./dom";
import { setupCamera } from "./camera";
import { createGame } from "./game";
import { setupFaceModels, startExpressionLoop } from "./face";
import type { Expression } from "./types";

function isMobileLike(): boolean {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod|Android/i.test(ua);
}

function showFatalOverlay(canvas: HTMLCanvasElement, title: string, message: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.save();
  ctx.fillStyle = "rgba(15,23,42,0.92)";
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "28px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(title, w / 2, h / 2 - 40);

  ctx.fillStyle = "#e5e7eb";
  ctx.font = "16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  const lines = message.split("\n");
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i] ?? "", w / 2, h / 2 + i * 22);
  }

  ctx.restore();
}

function bindTapToGame(canvas: HTMLCanvasElement, game: { tap?: (x: number, y: number) => void }) {
  if (!game.tap) return;

  const handler = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    // Canvas座標（canvas.width/heightは論理px）
    const x = (clientX - r.left) * (canvas.width / r.width);
    const y = (clientY - r.top) * (canvas.height / r.height);
    game.tap!(x, y);
  };

  // pointerdown が最も汎用（iOS SafariもOK）
  canvas.addEventListener("pointerdown", (e) => {
    handler(e.clientX, e.clientY);
  });

  // iOSで pointer が怪しい環境の保険（ごく稀）
  canvas.addEventListener("touchstart", (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    handler(t.clientX, t.clientY);
  }, { passive: true });
}

async function main() {
  console.log("main start");

  const video = getRequiredVideo("video");
  const canvas = getRequiredCanvas("gameCanvas");

  // iOS Safari 安全策：明示（camera.ts 側でもやっているが二重にしてよい）
  video.setAttribute("playsinline", "true");
  // @ts-expect-error iOS向け
  (video as any).playsInline = true;

  // 1) カメラ起動（失敗したらゲーム画面に案内を出して終了）
  try {
    await setupCamera(video);
  } catch (e) {
    console.error(e);
    // canvas が既に存在するので、アラートだけでなく画面にも出す
    showFatalOverlay(
      canvas,
      "Camera Permission Required",
      "カメラが許可されていません。\nブラウザ設定でカメラを許可して再読み込みしてください。",
    );
    alert("カメラへのアクセスが拒否されました。設定からカメラを許可してください。");
    return;
  }

  // 2) ゲーム本体初期化（face-api が失敗してもゲームは動く）
  const game = createGame(canvas);

  // 3) Share/Retry 用：タップを game.tap に流す
  bindTapToGame(canvas, game);

  // 4) face-api モデル読み込み
  let faceReady = false;
  try {
    await setupFaceModels();
    faceReady = true;
  } catch (e) {
    console.error("face-api モデル読み込みに失敗しました:", e);
    // モデルなしでもゲームが動くようにする（表情入力は neutral 固定）
    faceReady = false;

    // モバイルは通信で落ちやすいので、案内は軽めに
    if (!isMobileLike()) {
      alert(
        "表情認識用モデルの読み込みに失敗しました。\nネットワーク環境を確認してください。（ゲーム自体は動作します）",
      );
    }
  }

  let currentExpression: Expression = "neutral";

  // 5) 表情ループ開始：取れたら反映、取れないなら neutral 維持
  if (faceReady) {
    try {
      startExpressionLoop(video, (exp) => {
        currentExpression = exp;
        game.setExpression(exp);
      });
    } catch (e) {
      console.error("表情ループ開始に失敗:", e);
      // フォールバック
      currentExpression = "neutral";
      game.setExpression("neutral");
    }
  } else {
    // face-api 無し：ニュートラル固定で動かす
    currentExpression = "neutral";
    game.setExpression("neutral");
  }
}

window.addEventListener("load", () => {
  main().catch((e) => {
    console.error("起動時に致命的なエラー:", e);
    // ここで alert を出すと iOS でブロックされることがあるので console のみにする
  });
});
