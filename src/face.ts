// src/face.ts
// face-api.js を使った表情認識まわり（さらに「ゆるふわ」判定）

import * as faceapi from "face-api.js";
import type { Expression } from "./types";

// いま実際に動いていた CDN モデルをそのまま使う
const MODEL_URL =
  "https://justadudewhohacks.github.io/face-api.js/models";

let modelsLoaded = false;

/**
 * face-api のモデルをロード
 */
export async function setupFaceModels(): Promise<void> {
  if (modelsLoaded) return;

  console.log("face-api model base URL:", MODEL_URL);

  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);

  modelsLoaded = true;
  console.log("face-api models loaded");
}

/**
 * 「超ゆるめ」＆「スムージング入り」の表情ループ
 */
export function startExpressionLoop(
  video: HTMLVideoElement,
  onExpression: (exp: Expression) => void,
): void {
  if (!modelsLoaded) {
    console.warn("startExpressionLoop called before models loaded");
  }

  // スムージング用スコア
  const smoothed: Record<Expression, number> = {
    neutral: 0.7,
    happy: 0.1,
    angry: 0.05,
    surprised: 0.05,
    sad: 0.1,
  };

  let lastExp: Expression = "neutral";

  // α を少し小さくして「ブレにくく・でも反応はそれなりに」
  const ALPHA = 0.25;

  // ★ 判定をかなりゆるくした値
  const HAPPY_MIN = 0.12;   // ちょっと口角上がっただけでも入りやすく
  const HAPPY_MARGIN = 0.02;
  const ANGRY_MIN = 0.16;
  const SURPRISED_MIN = 0.20;
  const SAD_MIN = 0.18;

  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 224,
    scoreThreshold: 0.35, // 検出自体も少し甘め
  });

  async function loop() {
    try {
      const result = await faceapi
        .detectSingleFace(video, options)
        .withFaceExpressions();

      if (result && result.expressions) {
        const exps = result.expressions;

        // 1) 生のスコアをスムージング
        (Object.keys(smoothed) as Expression[]).forEach((k) => {
          const raw = exps[k] ?? 0;
          smoothed[k] = (1 - ALPHA) * smoothed[k] + ALPHA * raw;
        });

        // 2) まず最大のものを取る
        let best: Expression = lastExp;
        let bestVal = -1;

        (Object.keys(smoothed) as Expression[]).forEach((k) => {
          const v = smoothed[k];
          if (v > bestVal) {
            bestVal = v;
            best = k;
          }
        });

        const s = smoothed;

        // 3) 「甘やかし」ルール
        //   - happy / angry / surprised / sad を優先的に取りやすく
        if (s.happy > HAPPY_MIN && s.happy + HAPPY_MARGIN >= s.neutral) {
          best = "happy";
        } else if (s.angry > ANGRY_MIN && s.angry + 0.03 >= s.neutral) {
          best = "angry";
        } else if (s.surprised > SURPRISED_MIN && s.surprised >= s.neutral) {
          best = "surprised";
        } else if (s.sad > SAD_MIN && s.sad >= s.neutral) {
          best = "sad";
        } else if (s.neutral > 0.7) {
          best = "neutral";
        }

        // 4) 直前と違うときだけ通知（ピカピカ変わらないように）
        if (best !== lastExp) {
          lastExp = best;
          console.log("expression =>", best, "(smoothed:", { ...smoothed }, ")");
          onExpression(best);
        }
      } else {
        // 顔が映ってないときはゆっくり neutral に寄せる
        smoothed.neutral = (1 - ALPHA) * smoothed.neutral + ALPHA * 1.0;

        const fallback: Expression = "neutral";
        if (fallback !== lastExp) {
          lastExp = fallback;
          console.log("no face detected, fallback => neutral");
          onExpression(fallback);
        }
      }
    } catch (e) {
      console.error("表情検出中にエラー:", e);
    }

    // だいたい 6〜8fps 程度
    setTimeout(loop, 130);
  }

  loop();
}
