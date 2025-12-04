// src/main.ts
// 表情認識 + Canvas ゲーム本体

import * as faceapi from "face-api.js";

type Expression = "neutral" | "happy" | "angry" | "surprised" | "sad";

function getRequiredVideo(id: string): HTMLVideoElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLVideoElement)) {
    throw new Error(`video 要素 #${id} が見つかりません`);
  }
  return el;
}

function getRequiredCanvas(id: string): HTMLCanvasElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLCanvasElement)) {
    throw new Error(`canvas 要素 #${id} が見つかりません`);
  }
  return el;
}

async function setupCamera(video: HTMLVideoElement): Promise<void> {
  video.setAttribute("playsinline", "true");

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false,
  });

  video.srcObject = stream;

  return new Promise<void>((resolve) => {
    video.onloadedmetadata = () => {
      video.play();
      resolve();
    };
  });
}

async function loadModels(): Promise<boolean> {
  const MODEL_URL = "/models";
  try {
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
    console.log("face-api models loaded");
    return true;
  } catch (e) {
    console.error("モデル読み込みに失敗しました。public/models 配下を確認してください。", e);
    return false;
  }
}

function startGame(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2Dコンテキストを取得できませんでした");
  }

  let currentExpression: Expression = "neutral";

  let playerX = 150;
  let playerY = 0;
  let playerVy = 0;
  const groundY = 300;
  const gravity = 0.7;

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // 表情検出ループ
  async function expressionLoop() {
    const options = new faceapi.TinyFaceDetectorOptions();
    try {
      const result = await faceapi
        .detectSingleFace(video, options)
        .withFaceExpressions();

      if (result && result.expressions) {
        const exps = result.expressions;
        const keys: Expression[] = [
          "neutral",
          "happy",
          "angry",
          "surprised",
          "sad",
        ];

        let best: Expression = "neutral";
        let bestVal = 0;

        for (const key of keys) {
          const v = exps[key] ?? 0;
          if (v > bestVal) {
            bestVal = v;
            best = key;
          }
        }

        currentExpression = best;
      } else {
        currentExpression = "neutral";
      }
    } catch (e) {
      console.error("表情検出中にエラー:", e);
      currentExpression = "neutral";
    }

    setTimeout(expressionLoop, 100);
  }

  // 描画
  function drawScene() {
    const width = canvas.width;
    const height = canvas.height;

    // 背景
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, width, height);

    // 地面
    ctx.fillStyle = "#444";
    ctx.fillRect(0, groundY + 30, width, height - (groundY + 30));

    // キャラ
    const isAttack = currentExpression === "angry";
    ctx.fillStyle = isAttack ? "#ff5555" : "#55ff55";
    ctx.beginPath();
    ctx.arc(playerX, playerY, 30, 0, Math.PI * 2);
    ctx.fill();

    // 目
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(playerX - 10, playerY - 10, 4, 0, Math.PI * 2);
    ctx.arc(playerX + 10, playerY - 10, 4, 0, Math.PI * 2);
    ctx.fill();

    // テキスト
    ctx.fillStyle = "#fff";
    ctx.font = "20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(`Expression: ${currentExpression}`, 20, 40);
    ctx.fillText("😊: ジャンプ / 😡: 赤くなって攻撃モード", 20, 70);
  }

  // ゲームループ
  function gameLoop() {
    if (currentExpression === "happy") {
      if (playerY >= groundY) {
        playerVy = -14;
      }
    }

    playerVy += gravity;
    playerY += playerVy;

    if (playerY > groundY) {
      playerY = groundY;
      playerVy = 0;
    }

    drawScene();
    requestAnimationFrame(gameLoop);
  }

  gameLoop();
  expressionLoop();
}

async function main() {
  console.log("main start");

  const video = getRequiredVideo("video");
  const canvas = getRequiredCanvas("gameCanvas");

  try {
    await setupCamera(video);
  } catch (e) {
    alert("カメラへのアクセスが拒否されました。設定からカメラを許可してください。");
    console.error(e);
    return;
  }

  const modelsLoaded = await loadModels();
  if (!modelsLoaded) {
    // モデルがなくてもゲームは動かす（表情は neutral のまま）
    console.warn("モデルがないため、表情認識なしでゲームだけ開始します。");
  }

  startGame(video, canvas);
}

window.addEventListener("load", () => {
  main().catch((e) => {
    console.error("起動時に致命的なエラー:", e);
  });
});
