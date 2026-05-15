// src/draw.ts
import type { Bomb, Star, Wave, LikeParticle } from "./gameTypes";
import { gameOverButtons } from "./uiRects";
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

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawGlassPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 22,
) {
  ctx.save();
  roundedRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = "rgba(7,18,34,0.66)";
  ctx.fill();
  ctx.strokeStyle = "rgba(191,219,254,0.16)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function expressionLabel(expression: Expression): string {
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
      return "待機中";
  }
}

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

  const orbA = ctx.createRadialGradient(w * 0.15, h * 0.18, 20, w * 0.15, h * 0.18, w * 0.32);
  orbA.addColorStop(0, "rgba(56,189,248,0.18)");
  orbA.addColorStop(1, "rgba(56,189,248,0)");
  ctx.fillStyle = orbA;
  ctx.fillRect(0, 0, w, h);

  const orbB = ctx.createRadialGradient(w * 0.86, h * 0.22, 12, w * 0.86, h * 0.22, w * 0.22);
  orbB.addColorStop(0, inFever ? "rgba(250,204,21,0.22)" : "rgba(249,115,22,0.16)");
  orbB.addColorStop(1, "rgba(249,115,22,0)");
  ctx.fillStyle = orbB;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const y = h * 0.12 + i * (h * 0.08);
    ctx.beginPath();
    ctx.moveTo(24, y);
    ctx.lineTo(w - 24, y);
    ctx.stroke();
  }

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
  const h = height();
  const topPad = 16;
  const sidePad = 16;

  ctx.textBaseline = "top";

  drawGlassPanel(ctx, sidePad, topPad, 156, 74, 24);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(226,232,240,0.86)";
  ctx.font = "600 12px 'Avenir Next', system-ui, sans-serif";
  ctx.fillText("スコア", sidePad + 16, topPad + 14);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 26px 'Avenir Next', system-ui, sans-serif";
  ctx.fillText(`${score}`, sidePad + 16, topPad + 28);

  if (combo > 0) {
    drawGlassPanel(ctx, sidePad, topPad + 82, 156, 48, 20);
    ctx.fillStyle = inFever ? "#facc15" : "#c4b5fd";
    ctx.font = "700 18px 'Avenir Next', system-ui, sans-serif";
    ctx.fillText(`コンボ x${combo}`, sidePad + 16, topPad + 96);
  }

  const infoPanelW = 128;
  drawGlassPanel(ctx, w - sidePad - infoPanelW, topPad, infoPanelW, 74, 24);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(226,232,240,0.84)";
  ctx.font = "600 12px 'Avenir Next', system-ui, sans-serif";
  ctx.fillText("コイン", w - sidePad - 16, topPad + 14);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 24px 'Avenir Next', system-ui, sans-serif";
  ctx.fillText(`${coins}`, w - sidePad - 16, topPad + 28);

  const lifePanelY = topPad + 82;
  drawGlassPanel(ctx, w - sidePad - infoPanelW, lifePanelY, infoPanelW, 48, 20);
  ctx.textAlign = "left";
  for (let i = 0; i < 3; i++) {
    const x = w - sidePad - infoPanelW + 22 + i * 32;
    const heartY = lifePanelY + 12;
    ctx.beginPath();
    ctx.fillStyle = i < life ? "#fb7185" : "rgba(148,163,184,0.45)";
    ctx.moveTo(x, heartY + 8);
    ctx.bezierCurveTo(x - 8, heartY, x - 16, heartY + 10, x, heartY + 22);
    ctx.bezierCurveTo(x + 16, heartY + 10, x + 8, heartY, x, heartY + 8);
    ctx.fill();
  }

  drawGlassPanel(ctx, sidePad, h - 136, w - sidePad * 2, 88, 24);
  ctx.fillStyle = inFever ? "#facc15" : "#e5e7eb";
  ctx.font = "700 14px 'Avenir Next', system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(inFever ? "フィーバータイム" : "フィーバーゲージ", sidePad + 16, h - 122);

  const barX = sidePad + 16;
  const barY = h - 98;
  const barW = w - sidePad * 2 - 32;
  const barH = 18;

  roundedRectPath(ctx, barX, barY, barW, barH, 10);
  ctx.fillStyle = "rgba(15,23,42,0.92)";
  ctx.fill();

  const gaugeRatio = Math.max(0, Math.min(1, feverGauge / 100));
  const filled = barW * gaugeRatio;
  const gradient = ctx.createLinearGradient(barX, barY, barX + Math.max(filled, 1), barY);
  gradient.addColorStop(0, "#22c55e");
  gradient.addColorStop(0.75, "#38bdf8");
  gradient.addColorStop(1, "#facc15");
  if (filled > 0.5) {
    roundedRectPath(ctx, barX, barY, filled, barH, 10);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  roundedRectPath(ctx, barX, barY, barW, barH, 10);
  ctx.strokeStyle = "rgba(191,219,254,0.28)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "rgba(226,232,240,0.84)";
  ctx.font = "600 12px 'Avenir Next', system-ui, sans-serif";
  ctx.fillText(missionText, sidePad + 16, h - 70);

  drawGlassPanel(ctx, sidePad, topPad + 138, 156, 42, 18);
  ctx.fillStyle = "rgba(226,232,240,0.9)";
  ctx.font = "600 13px 'Avenir Next', system-ui, sans-serif";
  ctx.fillText(`いまの表情 ${expressionLabel(currentExpression)}`, sidePad + 16, topPad + 151);

  // トレンドチャレンジ表示
  if (trendActive && trendLabel) {
    const boxW = Math.min(320, w - 48);
    const boxH = 62;
    const x = w / 2 - boxW / 2;
    const y = 18;

    drawGlassPanel(ctx, x, y, boxW, boxH, 20);
    ctx.strokeStyle = "rgba(249,115,22,0.38)";
    roundedRectPath(ctx, x, y, boxW, boxH, 20);
    ctx.stroke();

    ctx.font = "700 12px 'Avenir Next', system-ui, sans-serif";
    ctx.fillStyle = "#fed7aa";
    ctx.fillText("いまのトレンド", x + 12, y + 8);

    ctx.font = "600 14px 'Avenir Next', system-ui, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(trendLabel, x + 12, y + 26);

    // 進捗バー
    const prog = Math.max(0, Math.min(1, trendProgress ?? 0));
    const barInnerX = x + boxW - 120;
    const barInnerY = y + 34;
    const barInnerW = 96;
    const barInnerH = 10;

    roundedRectPath(ctx, barInnerX, barInnerY, barInnerW, barInnerH, 8);
    ctx.fillStyle = "rgba(15,23,42,0.9)";
    ctx.fill();

    ctx.fillStyle = "#fb923c";
    if (prog > 0.01) {
      roundedRectPath(ctx, barInnerX, barInnerY, barInnerW * prog, barInnerH, 8);
      ctx.fill();
    }
  }

  // ガチャメッセージ／コイン獲得メッセージ（画面下中央あたり）
  if (gachaMessage || coinsEarnedText) {
    const boxW = Math.min(420, w - 40);
    const boxH = 60;
    const x = w / 2 - boxW / 2;
    const y = h - 220;

    drawGlassPanel(ctx, x, y, boxW, boxH, 20);

    ctx.textAlign = "center";
    ctx.font = "600 15px 'Avenir Next', system-ui, sans-serif";
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
  ctx.fillText("表情ランナー", w / 2, h / 2 - 140);

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
  ctx.fillText(`コイン: ${coins}`, w / 2, h / 2 - 10);

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
  ctx.fillText(`レア度: ${charRarity}`, x + panelW / 2, y + 106);

  // 背景
  ctx.fillStyle = "#bbf7d0";
  ctx.fillText("背景スキン", x + panelW / 2, y + 138);
  ctx.fillStyle = "#f9fafb";
  ctx.fillText(bgName, x + panelW / 2, y + 162);
  ctx.fillStyle = "#facc15";
  ctx.fillText(`レア度: ${bgRarity}`, x + panelW / 2, y + 184);

  ctx.font = "14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#e5e7eb";
  ctx.fillText(`コイン: ${coins}`, x + panelW / 2, y + panelH + 20);

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
  ctx.fillText(`1回: ${cost} コイン`, x + panelW / 2, y + 60);

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

    // 追加
    dailyBest: number;
    isNewDailyRecord: boolean;
  },
) {
  const { ctx, width, height } = dc;
  const {
    gameOver,
    score,
    maxCombo,
    rank,
    showContinueHint,
    dailyBest,
    isNewDailyRecord,
  } = params;

  if (!gameOver) return;

  const w = width();
  const h = height();
  const cardW = Math.min(360, w - 40);
  const cardH = 238;
  const cardX = w / 2 - cardW / 2;
  const cardY = h / 2 - 150;
  const statY = cardY + 132;
  const statW = (cardW - 16) / 3;
  const badge = isNewDailyRecord ? "今日の新記録！" : "今日のベスト";

  ctx.fillStyle = "rgba(2,6,23,0.68)";
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w / 2, cardY + 30, 10, w / 2, cardY + 30, 180);
  glow.addColorStop(0, "rgba(249,115,22,0.16)");
  glow.addColorStop(1, "rgba(249,115,22,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  drawGlassPanel(ctx, cardX, cardY, cardW, cardH, 28);

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(226,232,240,0.86)";
  ctx.font = "700 12px 'Avenir Next', system-ui, sans-serif";
  ctx.fillText("けっか", w / 2, cardY + 18);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 42px 'Avenir Next', system-ui, sans-serif";
  ctx.fillText(`${score}`, w / 2, cardY + 42);

  ctx.fillStyle = "#facc15";
  ctx.font = "700 20px 'Avenir Next', system-ui, sans-serif";
  ctx.fillText(rank, w / 2, cardY + 88);

  const statLabels = [
    { label: "スコア", value: `${score}` },
    { label: "最大コンボ", value: `×${maxCombo}` },
    { label: badge, value: `${dailyBest}` },
  ];

  statLabels.forEach((stat, index) => {
    const x = cardX + index * statW + index * 8;
    drawGlassPanel(ctx, x, statY, statW, 64, 18);
    ctx.fillStyle = "rgba(226,232,240,0.78)";
    ctx.font = "600 11px 'Avenir Next', system-ui, sans-serif";
    ctx.fillText(stat.label, x + statW / 2, statY + 10);
    ctx.fillStyle = index === 2 && isNewDailyRecord ? "#34d399" : "#ffffff";
    ctx.font = "700 16px 'Avenir Next', system-ui, sans-serif";
    ctx.fillText(stat.value, x + statW / 2, statY + 32);
  });

  ctx.fillStyle = "rgba(226,232,240,0.82)";
  ctx.font = "600 14px 'Avenir Next', system-ui, sans-serif";
  ctx.fillText(
    showContinueHint
      ? "笑顔を続けるとコンティニューできます。下のボタン操作も使えます。"
      : "少し待つと笑顔コンティニューとボタン操作が使えます。",
    w / 2,
    statY + 86,
  );

  const { share, retry, title } = gameOverButtons(w, h);

  const drawBtn = (
    rect: { x: number; y: number; w: number; h: number },
    label: string,
    accent: string,
  ) => {
    roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 18);
    ctx.fillStyle = "rgba(7,18,34,0.84)";
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 18px 'Avenir Next', system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.textBaseline = "top";
  };

  drawBtn(share, "共有", "rgba(56,189,248,0.45)");
  drawBtn(retry, "もう一度", "rgba(249,115,22,0.46)");
  drawBtn(title, "タイトルへ", "rgba(226,232,240,0.26)");

  ctx.textAlign = "left";
}
