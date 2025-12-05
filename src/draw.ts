// src/draw.ts
import type { Bomb, Star, Wave, LikeParticle } from "./gameTypes";
import type { Expression } from "./types";
import type {
  CharacterSkinColors,
  BackgroundSkinColors,
} from "./cosmetics";

export type DrawContext = {
  ctx: CanvasRenderingContext2D;
  width: () => number;
  height: () => number;
  groundY: () => number;
};

// 背景
export function drawBackground(
  dc: DrawContext,
  params: { inFever: boolean; colors: BackgroundSkinColors },
) {
  const { ctx, width, height, groundY } = dc;
  const { inFever, colors } = params;

  const w = width();
  const h = height();

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  if (inFever) {
    // フィーバー中は少しピンク寄りにブレンド
    grad.addColorStop(0, colors.top);
    grad.addColorStop(0.6, "#ec4899");
    grad.addColorStop(1, colors.bottom);
  } else {
    grad.addColorStop(0, colors.top);
    grad.addColorStop(1, colors.bottom);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const gY = groundY();
  ctx.fillStyle = colors.ground;
  ctx.fillRect(0, gY + 40, w, h - (gY + 40));

  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, gY);
  ctx.lineTo(w, gY);
  ctx.stroke();
}

// プレイヤー
export function drawPlayer(
  dc: DrawContext,
  params: {
    playerX: number;
    playerY: number;
    playerRadius: number;
    inFever: boolean;
    currentExpression: Expression;
    isOnGround: boolean;
    skinColors: CharacterSkinColors;
  },
) {
  const { ctx } = dc;
  const {
    playerX,
    playerY,
    playerRadius,
    currentExpression,
    isOnGround,
    skinColors,
  } = params;

  const isAngry = currentExpression === "angry";
  const isHappy = currentExpression === "happy";

  ctx.save();
  ctx.translate(playerX, playerY);

  const squash = isHappy && !isOnGround ? 0.9 : 1.0;

  ctx.scale(1.0, squash);
  ctx.fillStyle = skinColors.body;
  ctx.beginPath();
  ctx.arc(0, 0, playerRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 3;
  ctx.strokeStyle = skinColors.outline;
  ctx.stroke();

  // eyes
  ctx.fillStyle = skinColors.eye;
  ctx.beginPath();
  ctx.arc(-10, -10, 4, 0, Math.PI * 2);
  ctx.arc(10, -10, 4, 0, Math.PI * 2);
  ctx.fill();

  // mouth
  ctx.strokeStyle = skinColors.mouth;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (isHappy) {
    ctx.arc(0, 2, 10, 0, Math.PI);
  } else if (currentExpression === "sad") {
    ctx.arc(0, 10, 10, Math.PI, Math.PI * 2);
  } else if (isAngry) {
    ctx.moveTo(-8, 12);
    ctx.lineTo(8, 8);
  } else {
    ctx.moveTo(-8, 8);
    ctx.lineTo(8, 8);
  }
  ctx.stroke();

  ctx.restore();
}

// 爆弾
export function drawBombs(dc: DrawContext, bombs: Bomb[]) {
  const { ctx } = dc;
  for (const b of bombs) {
    if (!b.alive) continue;
    ctx.save();
    ctx.translate(b.x, b.y);

    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -b.radius);
    ctx.lineTo(0, -b.radius - 18);
    ctx.stroke();

    ctx.restore();
  }
}

// スター
export function drawStars(
  dc: DrawContext,
  stars: Star[],
  tick: number,
  inFever: boolean,
) {
  const { ctx } = dc;
  for (const s of stars) {
    if (!s.alive) continue;

    ctx.save();
    ctx.translate(s.x, s.y);
    const t = tick * 0.08;
    ctx.rotate(t);

    ctx.fillStyle = inFever ? "#fde047" : "#38bdf8";

    ctx.beginPath();
    const spikes = 5;
    const outerRadius = s.size;
    const innerRadius = s.size * 0.5;
    for (let i = 0; i < spikes * 2; i++) {
      const angle = (Math.PI * i) / spikes;
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

// 波動（攻撃）
export function drawWaves(
  dc: DrawContext,
  waves: Wave[],
  inFever: boolean,
) {
  const { ctx } = dc;
  for (const w of waves) {
    if (!w.alive) continue;
    ctx.save();
    ctx.translate(w.x, w.y);

    const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, w.radius);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(
      1,
      inFever ? "rgba(251, 191, 36, 0.2)" : "rgba(56,189,248,0.1)",
    );
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.arc(0, 0, w.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// UI（プレイ中）
export function drawUI(
  dc: DrawContext,
  params: {
    score: number;
    combo: number;
    life: number;
    feverGauge: number;
    inFever: boolean;
    currentExpression: Expression;
    missionText: string;
    trendActive?: boolean;
    trendLabel?: string;
    trendProgress?: number; // 0〜1
    coins: number;
    gachaMessage?: string | null;
    coinsEarnedText?: string | null;
  },
) {
  const { ctx, width, height } = dc;
  const {
    score,
    combo,
    life,
    feverGauge,
    inFever,
    currentExpression,
    missionText,
    trendActive,
    trendLabel,
    trendProgress,
    coins,
    gachaMessage,
    coinsEarnedText,
  } = params;

  const w = width();

  ctx.textBaseline = "top";

  // スコア
  ctx.font = "24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.fillText(`SCORE ${score}`, 20, 18);

  // コンボ
  if (combo > 0) {
    ctx.fillStyle = inFever ? "#facc15" : "#a5b4fc";
    ctx.fillText(`COMBO ×${combo}`, 20, 50);
  }

  // コイン表示（右上）
  ctx.font = "16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = "#e5e7eb";
  ctx.fillText(`Coins: ${coins}`, w - 20, 18);

  // ライフ
  ctx.textAlign = "left";
  const heartY = 36;
  for (let i = 0; i < 3; i++) {
    const x = w - 160 + i * 36;
    ctx.beginPath();
    if (i < life) {
      ctx.fillStyle = "#f97373";
    } else {
      ctx.fillStyle = "rgba(148,163,184,0.5)";
    }
    ctx.moveTo(x, heartY + 10);
    ctx.bezierCurveTo(
      x - 8,
      heartY,
      x - 18,
      heartY + 12,
      x,
      heartY + 24,
    );
    ctx.bezierCurveTo(
      x + 18,
      heartY + 12,
      x + 8,
      heartY,
      x,
      heartY + 10,
    );
    ctx.fill();
  }

  // FEVERゲージ
  const barX = 20;
  const barY = height() - 60;
  const barW = w - 40;
  const barH = 18;

  ctx.fillStyle = "rgba(15,23,42,0.8)";
  ctx.fillRect(barX, barY, barW, barH);

  const gaugeRatio = Math.max(0, Math.min(1, feverGauge / 100));
  const filled = barW * gaugeRatio;

  const g = ctx.createLinearGradient(barX, barY, barX + filled, barY);
  g.addColorStop(0, "#22c55e");
  g.addColorStop(1, "#facc15");
  ctx.fillStyle = g;
  ctx.fillRect(barX, barY, filled, barH);

  ctx.strokeStyle = "rgba(148,163,184,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY, barW, barH);

  ctx.fillStyle = inFever ? "#facc15" : "#e5e7eb";
  ctx.font = "16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  const feverText = inFever ? "FEVER TIME!!!" : "FEVER ゲージ";
  ctx.fillText(feverText, barX + 10, barY - 22);

  // ミッション
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(missionText, 20, height() - 90);

  // 現在の表情
  ctx.fillStyle = "rgba(248,250,252,0.9)";
  ctx.font = "16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(`EXP: ${currentExpression}`, 20, 80);

  // トレンドチャレンジ表示
  if (trendActive && trendLabel) {
    const boxW = 320;
    const boxH = 52;
    const x = w / 2 - boxW / 2;
    const y = 18;

    // 背景ボックス
    ctx.fillStyle = "rgba(15,23,42,0.85)";
    ctx.fillRect(x, y, boxW, boxH);

    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, boxW, boxH);

    ctx.font = "14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "#fed7aa";
    ctx.fillText("TREND CHALLENGE", x + 12, y + 8);

    ctx.font = "16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(trendLabel, x + 12, y + 26);

    // 進捗バー
    const prog = Math.max(0, Math.min(1, trendProgress ?? 0));
    const barInnerX = x + boxW - 120;
    const barInnerY = y + 22;
    const barInnerW = 96;
    const barInnerH = 14;

    ctx.fillStyle = "rgba(15,23,42,0.9)";
    ctx.fillRect(barInnerX, barInnerY, barInnerW, barInnerH);

    ctx.fillStyle = "#fb923c";
    ctx.fillRect(barInnerX, barInnerY, barInnerW * prog, barInnerH);

    ctx.strokeStyle = "rgba(248,250,252,0.8)";
    ctx.lineWidth = 1;
    ctx.strokeRect(barInnerX, barInnerY, barInnerW, barInnerH);
  }

  // ガチャメッセージ／コイン獲得メッセージ（画面下中央あたり）
  if (gachaMessage || coinsEarnedText) {
    const boxW = 460;
    const boxH = 60;
    const x = w / 2 - boxW / 2;
    const y = height() - 140;

    ctx.fillStyle = "rgba(15,23,42,0.92)";
    ctx.fillRect(x, y, boxW, boxH);

    ctx.strokeStyle = "rgba(148,163,184,0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, boxW, boxH);

    ctx.textAlign = "center";
    ctx.font = "16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "#e5e7eb";

    if (gachaMessage) {
      ctx.fillText(gachaMessage, x + boxW / 2, y + 16);
    }
    if (coinsEarnedText) {
      ctx.fillStyle = "#facc15";
      ctx.fillText(coinsEarnedText, x + boxW / 2, y + 36);
    }

    ctx.textAlign = "left";
  }
}

// ==== タイトル画面 ====
export function drawTitleScreen(
  dc: DrawContext,
  params: {
    coins: number;
    equippedCharName: string;
    equippedBgName: string;
  },
) {
  const { ctx, width, height } = dc;
  const { coins, equippedCharName, equippedBgName } = params;

  const w = width();
  const h = height();

  ctx.textAlign = "center";

  // タイトル
  ctx.fillStyle = "#f9fafb";
  ctx.font = "48px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText("EMOTION GAME", w / 2, h / 2 - 140);

  ctx.font = "22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#e5e7eb";
  ctx.fillText(
    "表情でジャンプ＆ビームして、バズりスコアを叩き出せ！",
    w / 2,
    h / 2 - 90,
  );

  // 現在の装備
  ctx.font = "18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#cbd5f5";
  ctx.fillText(
    `キャラ: ${equippedCharName} / 背景: ${equippedBgName}`,
    w / 2,
    h / 2 - 40,
  );

  ctx.fillStyle = "#e5e7eb";
  ctx.fillText(`Coins: ${coins}`, w / 2, h / 2 - 10);

  // 操作説明
  ctx.font = "18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#bfdbfe";
  ctx.fillText("[Space / Enter] ゲームスタート", w / 2, h / 2 + 40);
  ctx.fillText("[C] 着せ替え", w / 2, h / 2 + 70);
  ctx.fillText("[G] ガチャ", w / 2, h / 2 + 100);

  ctx.font = "14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#9ca3af";
  ctx.fillText(
    "ゲーム中: happyでジャンプ / angryで攻撃 / surprisedで前進 / sadでゲージ調整",
    w / 2,
    h / 2 + 140,
  );

  ctx.textAlign = "left";
}

// ==== 着せ替え画面 ====
export function drawCustomizeScreen(
  dc: DrawContext,
  params: {
    coins: number;
    charName: string;
    charRarity: string;
    bgName: string;
    bgRarity: string;
  },
) {
  const { ctx, width, height } = dc;
  const { coins, charName, charRarity, bgName, bgRarity } = params;

  const w = width();
  const h = height();

  const panelW = 480;
  const panelH = 220;
  const x = w / 2 - panelW / 2;
  const y = h / 2 - panelH / 2;

  ctx.fillStyle = "rgba(15,23,42,0.9)";
  ctx.fillRect(x, y, panelW, panelH);

  ctx.strokeStyle = "rgba(148,163,184,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, panelW, panelH);

  ctx.textAlign = "center";
  ctx.font = "22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#e5e7eb";
  ctx.fillText("着せ替え", x + panelW / 2, y + 20);

  ctx.font = "16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

  // キャラ
  ctx.fillStyle = "#bfdbfe";
  ctx.fillText("キャラ衣装", x + panelW / 2, y + 60);
  ctx.fillStyle = "#f9fafb";
  ctx.fillText(charName, x + panelW / 2, y + 84);
  ctx.fillStyle = "#facc15";
  ctx.fillText(`Rarity: ${charRarity}`, x + panelW / 2, y + 106);

  // 背景
  ctx.fillStyle = "#bbf7d0";
  ctx.fillText("背景スキン", x + panelW / 2, y + 138);
  ctx.fillStyle = "#f9fafb";
  ctx.fillText(bgName, x + panelW / 2, y + 162);
  ctx.fillStyle = "#facc15";
  ctx.fillText(`Rarity: ${bgRarity}`, x + panelW / 2, y + 184);

  ctx.font = "14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#e5e7eb";
  ctx.fillText(`Coins: ${coins}`, x + panelW / 2, y + panelH + 20);

  ctx.fillStyle = "#9ca3af";
  ctx.fillText(
    "[← / C] キャラ変更   [→ / B] 背景変更",
    x + panelW / 2,
    y + panelH + 44,
  );
  ctx.fillText(
    "[Space / Enter] この装備でスタート   [G] ガチャ   [Esc / T] タイトルへ",
    x + panelW / 2,
    y + panelH + 66,
  );

  ctx.textAlign = "left";
}

// ==== ガチャ画面 ====
export function drawGachaScreen(
  dc: DrawContext,
  params: {
    coins: number;
    cost: number;
    lastMessage: string | null;
  },
) {
  const { ctx, width, height } = dc;
  const { coins, cost, lastMessage } = params;

  const w = width();
  const h = height();

  const panelW = 480;
  const panelH = 200;
  const x = w / 2 - panelW / 2;
  const y = h / 2 - panelH / 2;

  ctx.fillStyle = "rgba(15,23,42,0.95)";
  ctx.fillRect(x, y, panelW, panelH);

  ctx.strokeStyle = "rgba(129,140,248,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, panelW, panelH);

  ctx.textAlign = "center";
  ctx.font = "24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#e5e7eb";
  ctx.fillText("ガチャ", x + panelW / 2, y + 26);

  ctx.font = "16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#facc15";
  ctx.fillText(`1回: ${cost} coins`, x + panelW / 2, y + 60);

  ctx.fillStyle = "#e5e7eb";
  ctx.fillText(`所持コイン: ${coins}`, x + panelW / 2, y + 86);

  if (lastMessage) {
    ctx.fillStyle = "#bfdbfe";
    ctx.fillText(lastMessage, x + panelW / 2, y + 118);
  }

  ctx.font = "14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#9ca3af";
  ctx.fillText(
    "[Space / Enter / G] ガチャを回す",
    x + panelW / 2,
    y + panelH - 40,
  );
  ctx.fillText(
    "[C] 着せ替え   [Esc / T] タイトルへ",
    x + panelW / 2,
    y + panelH - 20,
  );

  ctx.textAlign = "left";
}

// いいねシャワー描画
export function drawLikeParticles(dc: DrawContext, likes: LikeParticle[]) {
  const { ctx } = dc;

  for (const p of likes) {
    if (!p.alive || p.alpha <= 0) continue;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.scale, p.scale);
    ctx.globalAlpha = p.alpha;

    ctx.fillStyle = "#f97373";

    // ハート形（ライフと同じ形を小さくした感じ）
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.bezierCurveTo(-6, -4, -14, 2, 0, 16);
    ctx.bezierCurveTo(14, 2, 6, -4, 0, 4);
    ctx.fill();

    ctx.restore();
  }

  // アルファ値を戻す
  ctx.globalAlpha = 1;
}

// GAME OVER オーバーレイ
export function drawGameOverOverlay(
  dc: DrawContext,
  params: {
    gameOver: boolean;
    score: number;
    maxCombo: number;
    rank: string;
    showContinueHint: boolean;
  },
) {
  const { ctx, width, height } = dc;
  const { gameOver, score, maxCombo, rank, showContinueHint } = params;

  if (!gameOver) return;

  const w = width();
  const h = height();

  ctx.fillStyle = "rgba(15,23,42,0.86)";
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = "center";

  ctx.fillStyle = "#ffffff";
  ctx.font = "40px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText("GAME OVER", w / 2, h / 2 - 80);

  ctx.font = "26px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(`SCORE: ${score}`, w / 2, h / 2 - 30);
  ctx.fillText(`MAX COMBO: ×${maxCombo}`, w / 2, h / 2 + 10);

  ctx.fillStyle = "#facc15";
  ctx.font = "24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(rank, w / 2, h / 2 + 50);

  ctx.fillStyle = "#e5e7eb";
  ctx.font = "16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

  if (showContinueHint) {
    ctx.fillText(
      "ニコッと笑顔（happy）をしばらく続けるとコンテニューします",
      w / 2,
      h / 2 + 100,
    );
  } else {
    ctx.fillText(
      "少し待ってから笑顔になるとコンテニューできます",
      w / 2,
      h / 2 + 100,
    );
  }

  ctx.textAlign = "left";
}
