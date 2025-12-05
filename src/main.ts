// src/main.ts
import { getRequiredVideo, getRequiredCanvas } from "./dom";
import { setupCamera } from "./camera";
import { createGame } from "./game";
import { setupFaceModels, startExpressionLoop } from "./face";
import type { Expression } from "./types";

async function main() {
  console.log("main start");

  const video = getRequiredVideo("video");
  const canvas = getRequiredCanvas("gameCanvas");

  // 1. カメラ起動
  try {
    await setupCamera(video);
  } catch (e) {
    alert("カメラへのアクセスが拒否されました。設定からカメラを許可してください。");
    console.error(e);
    return;
  }

  // 2. face-api モデル読み込み（face.ts 側）
  try {
    await setupFaceModels();
  } catch (e) {
    console.error("face-api モデル読み込みに失敗しました:", e);
    alert("表情認識用のモデル読み込みに失敗しました。ネットワーク環境などを確認してください。");
    // モデルなしでもゲーム自体は動かしたいなら return しない
  }

  // 3. ゲーム本体初期化
  const game = createGame(canvas);

  let currentExpression: Expression = "neutral";

  // 4. 表情ループ開始：表情が変わるたびに game.setExpression へ反映
  startExpressionLoop(video, (exp) => {
    currentExpression = exp;
    game.setExpression(exp);
  });
}

window.addEventListener("load", () => {
  main().catch((e) => {
    console.error("起動時に致命的なエラー:", e);
  });
});
