// src/game.ts
import type { Expression } from "./types";
import type {
  Bomb,
  Star,
  Wave,
  Mission,
  PublicState,
  LikeParticle,
} from "./gameTypes";
import {
  drawBackground,
  drawPlayer,
  drawBombs,
  drawStars,
  drawWaves,
  drawUI,
  drawGameOverOverlay,
  drawLikeParticles,
} from "./draw";
import type { DrawContext } from "./draw";
import {
  loadOwnedCosmetics,
  saveOwnedCosmetics,
  findCharacterSkin,
  findBackgroundSkin,
  canRollGacha,
  rollGacha,
  cycleCharacterSkin,
  cycleBackgroundSkin,
  type OwnedCosmetics,
} from "./cosmetics";

export type Game = {
  setExpression(exp: Expression): void;
};

type Scene = "title" | "play" | "customize" | "gacha";

export function createGame(canvas: HTMLCanvasElement): Game {
  const ctxRaw = canvas.getContext("2d");
  if (!ctxRaw) {
    throw new Error("2Dコンテキストを取得できませんでした");
  }
  const ctx: CanvasRenderingContext2D = ctxRaw;

  // レイアウト
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // ===== ゲーム内部状態 =====
  let currentExpression: Expression = "neutral";

  const width = () => canvas.width;
  const height = () => canvas.height;

  // 現在のシーン
  let scene: Scene = "title";

  // プレイヤー
  const playerRadius = 32;
  let playerX = 180;
  const groundY = () => Math.min(height() - 80, 320);
  let playerY = groundY();
  let playerVy = 0;
  const gravity = 0.7;
  let isOnGround = true;

  // スコア関連（1プレイ中のみ有効）
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let feverGauge = 0; // 0〜100
  let inFever = false;
  let feverCount = 0;
  let life = 3;
  let gameOver = false;
  let tick = 0;

  // 攻撃・ギミック
  let bombs: Bomb[] = [];
  let stars: Star[] = [];
  let waves: Wave[] = [];

  let lastHappyTick = -999;
  let lastAngryTick = -999;
  const HAPPY_COOLDOWN = 18;
  const ANGRY_COOLDOWN = 15;

  // ゲームオーバー演出 + 表情コンテニュー
  let gameOverTick: number | null = null;
  let continueSmileTicks = 0;

  // 一度だけ発動できる「神回避コンテニュー」
  let hasUsedClutchSave = false;

  // いいねシャワー
  let likeParticles: LikeParticle[] = [];

  // コイン＆スキン管理（ドメイン：cosmetics）
  let cosmetics: OwnedCosmetics = loadOwnedCosmetics();
  function updateCosmetics(next: OwnedCosmetics) {
    cosmetics = next;
    saveOwnedCosmetics(next);
  }

  // ガチャメッセージ / コイン獲得メッセージ
  let lastGachaMessage: string | null = null;
  let lastGachaTick = 0;
  let lastCoinsEarned = 0;
  let lastCoinsEarnedTick = 0;

  // トレンドチャレンジ
  type TrendTarget = Extract<
    Expression,
    "happy" | "angry" | "surprised" | "sad"
  >;

  type TrendChallenge = {
    active: boolean;
    target: TrendTarget;
    startTick: number;
    endTick: number;
    progress: number; // 0〜1
    success: boolean;
  };

  let trend: TrendChallenge | null = null;
  let nextTrendTick = 600; // 最初のトレンド開始候補（約10秒後）

  // ミッション
  const missions: Mission[] = [
    {
      text: "ミッション①：笑顔で 10 コンボ達成！",
      condition: (s) => s.maxCombo >= 10,
    },
    {
      text: "ミッション②：FEVER を 2 回発動！",
      condition: (s) => s.feverCount >= 2,
    },
    {
      text: "ミッション③：スコア 5,000 突破！",
      condition: (s) => s.score >= 5000,
    },
  ];

  // 表情ホールドのしきい値（フレーム数）
  const HOLD_SHORT = 25; // 約0.4秒
  const HOLD_LONG = 45; // 約0.75秒

  // シーン別の表情ホールドカウンタ
  let titleHappyTicks = 0;
  let titleAngryTicks = 0;
  let titleSurprisedTicks = 0;

  let customizeHappyTicks = 0;
  let customizeAngryTicks = 0;
  let customizeSadTicks = 0;
  let customizeSurprisedTicks = 0;

  let gachaHappyTicks = 0;
  let gachaSadTicks = 0;

  // ===== ユーティリティ =====

  function addScore(base: number) {
    const bonus = 1 + combo * 0.05;
    const feverBoost = inFever ? 1.5 : 1.0;
    const delta = Math.round(base * bonus * feverBoost);
    score += delta;
  }

  function addCombo() {
    combo += 1;
    if (combo > maxCombo) maxCombo = combo;
    feverGauge += inFever ? 1.8 : 3.2;
    if (feverGauge >= 100 && !inFever) {
      inFever = true;
      feverGauge = 100;
      feverCount += 1;
    }
  }

  function breakCombo() {
    combo = 0;
    feverGauge *= 0.4;
    if (feverGauge < 5) feverGauge = 0;
    if (inFever && feverGauge <= 0) {
      inFever = false;
    }
  }

  // いいねシャワーを発生させる
  function spawnLikeShower(centerX: number, centerY: number) {
    for (let i = 0; i < 28; i++) {
      const angle = Math.random() * Math.PI - Math.PI / 2; // 上方向中心
      const dist = 40 + Math.random() * 80;
      const x = centerX + Math.cos(angle) * dist;
      const y = centerY + Math.sin(angle) * dist;

      likeParticles.push({
        x,
        y,
        vy: -(0.6 + Math.random() * 0.8),
        alpha: 0.9,
        scale: 0.7 + Math.random() * 0.9,
        alive: true,
      });
    }
  }

  function updateLikeParticles() {
    for (const p of likeParticles) {
      if (!p.alive) continue;
      p.y += p.vy;
      p.alpha -= 0.015;
      if (p.alpha <= 0) {
        p.alive = false;
      }
    }
    likeParticles = likeParticles.filter((p) => p.alive);
  }

  // ゲームオーバー時にコイン付与
  function awardCoinsOnGameOver() {
    const earned = Math.floor(score / 100); // 例: スコア100で1コイン
    if (earned <= 0) return;
    lastCoinsEarned = earned;
    lastCoinsEarnedTick = tick;
    updateCosmetics({
      ...cosmetics,
      coins: cosmetics.coins + earned,
    });
  }

  function damage() {
    if (scene !== "play") return;
    if (gameOver) return;

    life -= 1;
    breakCombo();

    // 残りライフが 0 以下になるとき、一度だけ神回避のチャンス
    if (
      life <= 0 &&
      !hasUsedClutchSave &&
      (currentExpression === "happy" || currentExpression === "surprised")
    ) {
      // 神回避コンテニュー
      hasUsedClutchSave = true;
      life = 1;

      // 少しだけフィーバーゲージ回復 & スコアボーナス
      feverGauge = Math.min(100, feverGauge + 25);
      addScore(400);

      // いいねシャワー演出
      spawnLikeShower(width() / 2, groundY() - 80);

      return;
    }

    if (life <= 0) {
      life = 0;
      gameOver = true;
      gameOverTick = tick;
      continueSmileTicks = 0;
      awardCoinsOnGameOver();
    }
  }

  function spawnBomb() {
    const r = 20 + Math.random() * 18;
    const gY = groundY();
    bombs.push({
      x: width() + r + 10,
      y: gY,
      vx: -(3 + Math.random() * 2 + (inFever ? 1.2 : 0)),
      radius: r,
      alive: true,
    });
  }

  function spawnStar(x?: number, y?: number) {
    const baseY = groundY() - 110 - Math.random() * 50;
    stars.push({
      x: x ?? width() + 40,
      y: y ?? baseY,
      vx: -(2.2 + Math.random() * 1.2),
      vy: 0.2,
      size: 16 + Math.random() * 7,
      alive: true,
    });
  }

  function spawnWave() {
    waves.push({
      x: playerX + playerRadius + 4,
      y: playerY,
      vx: 8.0,
      radius: 26,
      alive: true,
    });
  }

  function circleHit(
    ax: number,
    ay: number,
    ar: number,
    bx: number,
    by: number,
    br: number,
  ): boolean {
    const dx = ax - bx;
    const dy = ay - by;
    const r = ar + br;
    return dx * dx + dy * dy <= r * r;
  }

  function getRank(scoreVal: number): string {
    if (scoreVal >= 20000) return "宇宙級バズフェイス";
    if (scoreVal >= 10000) return "伝説のバズ顔";
    if (scoreVal >= 5000) return "バズり候補生";
    if (scoreVal >= 2000) return "いいね職人";
    return "表情修行中";
  }

  function getCurrentMissionText(): string {
    const publicState: PublicState = {
      score,
      maxCombo,
      feverCount,
    };
    const firstIncomplete = missions.find((m) => !m.condition(publicState));
    if (!firstIncomplete) {
      return "全ミッション達成！あなたの顔面、完全にコンテンツ。";
    }
    return firstIncomplete.text;
  }

  // トレンドチャレンジ
  function startTrendChallenge() {
    const targets: TrendTarget[] = ["happy", "angry", "surprised", "sad"];
    const target =
      targets[Math.floor(Math.random() * targets.length)] ?? "happy";

    const duration = 540; // 約9秒 (60fps換算)
    trend = {
      active: true,
      target,
      startTick: tick,
      endTick: tick + duration,
      progress: 0,
      success: false,
    };

    // 次のトレンド登場は少しあと
    nextTrendTick = tick + 1200; // だいたい20秒後ぐらい
  }

  function updateTrend() {
    if (scene !== "play") return;
    if (gameOver) return;

    // まだトレンドがなくて、時間が来たら開始候補
    if ((!trend || !trend.active) && tick >= nextTrendTick) {
      // 軽いランダム性を持たせる
      if (Math.random() < 0.015) {
        startTrendChallenge();
      }
    }

    if (!trend || !trend.active) return;

    // 時間切れ
    if (tick >= trend.endTick && !trend.success) {
      trend.active = false;
      return;
    }

    // 目標表情をキープすると進捗がたまる
    if (currentExpression === trend.target) {
      trend.progress = Math.min(1, trend.progress + 0.02); // 約 50 フレームで達成
    } else {
      trend.progress = Math.max(0, trend.progress - 0.015); // 少しずつ減衰
    }

    // 達成
    if (!trend.success && trend.progress >= 1) {
      trend.success = true;
      trend.active = false;

      // バズボーナス
      addScore(1500);
      feverGauge = Math.min(100, feverGauge + 35);
      spawnLikeShower(playerX, playerY - 40);
    }
  }

  function getTrendLabelAndProgress():
    | { active: true; label: string; progress: number }
    | { active: false; label: ""; progress: 0 } {
    if (!trend || !trend.active || scene !== "play") {
      return { active: false, label: "", progress: 0 };
    }

    let emoji = "";
    let jp = "";
    switch (trend.target) {
      case "happy":
        emoji = "😄";
        jp = "笑顔でジャンプ連打！";
        break;
      case "angry":
        emoji = "🔥";
        jp = "怒りビームで爆弾破壊！";
        break;
      case "surprised":
        emoji = "😲";
        jp = "驚きフェイスで前進ブースト！";
        break;
      case "sad":
        emoji = "😢";
        jp = "しっとり顔でゲージ調整…？";
        break;
    }

    const label = `${emoji} 今のバズ表情: ${jp}`;
    return { active: true, label, progress: trend.progress };
  }

  // ゲーム全体をリセット（プレイ開始用）
  function resetGame() {
    // スコア・状態リセット
    score = 0;
    combo = 0;
    maxCombo = 0;
    feverGauge = 0;
    inFever = false;
    feverCount = 0;
    life = 3;
    gameOver = false;

    // プレイヤー位置リセット
    playerX = 180;
    playerY = groundY();
    playerVy = 0;
    isOnGround = true;

    // 弾・アイテム等リセット
    bombs = [];
    stars = [];
    waves = [];
    likeParticles = [];

    // クールダウンやコンテニュー状態リセット
    lastHappyTick = tick;
    lastAngryTick = tick;
    gameOverTick = null;
    continueSmileTicks = 0;
    hasUsedClutchSave = false;

    // トレンドチャレンジもリセット
    trend = null;
    nextTrendTick = tick + 600;
  }

  // ゲームオーバー中に表情でコンテニュー判定
  function checkContinueByExpression() {
    if (scene !== "play") return;
    if (!gameOver || gameOverTick === null) return;

    // ゲームオーバー直後は少し待つ（30フレームくらい）
    if (tick - gameOverTick < 30) {
      continueSmileTicks = 0;
      return;
    }

    // happy が続いたらコンテニュー
    if (currentExpression === "happy") {
      continueSmileTicks += 1;
    } else {
      continueSmileTicks = 0;
    }

    // 45フレーム（約0.75秒）ぐらい笑い続けたらコンテニュー
    if (continueSmileTicks >= HOLD_LONG) {
      resetGame();
    }
  }

  // ===== シーン別：表情での操作ロジック =====

  // タイトル画面：
  //  - happyキープ → プレイ開始
  //  - angryキープ → 着せ替え画面へ
  //  - surprisedキープ → ガチャ画面へ
  function updateTitleByExpression() {
    if (scene !== "title") return;

    if (currentExpression === "happy") {
      titleHappyTicks += 1;
    } else {
      titleHappyTicks = 0;
    }

    if (currentExpression === "angry") {
      titleAngryTicks += 1;
    } else {
      titleAngryTicks = 0;
    }

    if (currentExpression === "surprised") {
      titleSurprisedTicks += 1;
    } else {
      titleSurprisedTicks = 0;
    }

    // プレイ開始
    if (titleHappyTicks === HOLD_LONG) {
      resetGame();
      scene = "play";
      spawnLikeShower(width() / 2, groundY() - 80);
      titleHappyTicks = titleAngryTicks = titleSurprisedTicks = 0;
    }

    // 着せ替えへ
    if (titleAngryTicks === HOLD_LONG) {
      scene = "customize";
      titleHappyTicks = titleAngryTicks = titleSurprisedTicks = 0;
    }

    // ガチャへ
    if (titleSurprisedTicks === HOLD_LONG) {
      scene = "gacha";
      titleHappyTicks = titleAngryTicks = titleSurprisedTicks = 0;
    }
  }

  // 着せ替え画面：
  //  - angryキープ → キャラ衣装切り替え
  //  - surprisedキープ → 背景スキン切り替え
  //  - happy or sad キープ → タイトルへ戻る
  function updateCustomizeByExpression() {
    if (scene !== "customize") return;

    // カウンタ更新
    if (currentExpression === "angry") {
      customizeAngryTicks += 1;
    } else {
      customizeAngryTicks = 0;
    }

    if (currentExpression === "surprised") {
      customizeSurprisedTicks += 1;
    } else {
      customizeSurprisedTicks = 0;
    }

    if (currentExpression === "happy") {
      customizeHappyTicks += 1;
    } else {
      customizeHappyTicks = 0;
    }

    if (currentExpression === "sad") {
      customizeSadTicks += 1;
    } else {
      customizeSadTicks = 0;
    }

    // キャラ衣装切り替え
    if (customizeAngryTicks === HOLD_SHORT) {
      const next = cycleCharacterSkin(cosmetics);
      if (next !== cosmetics) {
        updateCosmetics(next);
        spawnLikeShower(width() / 2, groundY() - 40);
      }
    }

    // 背景スキン切り替え
    if (customizeSurprisedTicks === HOLD_SHORT) {
      const next = cycleBackgroundSkin(cosmetics);
      if (next !== cosmetics) {
        updateCosmetics(next);
        spawnLikeShower(width() / 2, groundY() - 80);
      }
    }

    // happy or sad 長押しでタイトルへ戻る
    if (
      customizeHappyTicks === HOLD_LONG ||
      customizeSadTicks === HOLD_LONG
    ) {
      scene = "title";
      customizeHappyTicks =
        customizeAngryTicks =
        customizeSadTicks =
        customizeSurprisedTicks =
          0;
    }
  }

  // ガチャ画面：
  //  - happyキープ → ガチャを1回引く
  //  - sadキープ → タイトルに戻る
  function updateGachaByExpression() {
    if (scene !== "gacha") return;

    if (currentExpression === "happy") {
      gachaHappyTicks += 1;
    } else {
      gachaHappyTicks = 0;
    }

    if (currentExpression === "sad") {
      gachaSadTicks += 1;
    } else {
      gachaSadTicks = 0;
    }

    // ガチャ実行
    if (gachaHappyTicks === HOLD_LONG) {
      if (!canRollGacha(cosmetics)) {
        lastGachaMessage = "コインが足りません… (笑顔をキープしてガチャ)";
        lastGachaTick = tick;
      } else {
        try {
          const { state, result } = rollGacha(cosmetics);
          updateCosmetics(state);
          const kind =
            result.type === "character" ? "キャラ衣装" : "背景スキン";
          const rarityLabel =
            result.rarity === "legendary"
              ? "LEGENDARY"
              : result.rarity === "epic"
                ? "EPIC"
                : result.rarity === "rare"
                  ? "RARE"
                  : "COMMON";
          const newStr = result.isNew ? "NEW!!" : "既に所持";
          lastGachaMessage = `${kind} を入手 (${rarityLabel}) ${newStr}`;
          lastGachaTick = tick;
          spawnLikeShower(width() / 2, height() / 2);
        } catch {
          lastGachaMessage = "ガチャエラーが発生しました";
          lastGachaTick = tick;
        }
      }
    }

    // sad 長押しでタイトルへ戻る
    if (gachaSadTicks === HOLD_LONG) {
      scene = "title";
      gachaHappyTicks = gachaSadTicks = 0;
    }
  }

  // ===== プレイ中の更新 =====

  function updatePlayer() {
    if (scene !== "play") return;
    const gY = groundY();
    // ジャンプ（happy）
    if (
      currentExpression === "happy" &&
      isOnGround &&
      tick - lastHappyTick > HAPPY_COOLDOWN &&
      !gameOver
    ) {
      playerVy = -15.5;
      isOnGround = false;
      lastHappyTick = tick;
      addCombo();
      addScore(80);
      spawnStar(playerX + 140, gY - 120);
    }

    // 攻撃（angry）
    if (
      currentExpression === "angry" &&
      tick - lastAngryTick > ANGRY_COOLDOWN &&
      !gameOver
    ) {
      spawnWave();
      lastAngryTick = tick;
      addCombo();
      addScore(60);
    }

    // surprised は少しだけ前進ブースト
    if (currentExpression === "surprised" && !gameOver) {
      playerX += 0.6;
    } else {
      playerX += 0.1;
    }

    // sad はゲージを少しだけ減らす
    if (currentExpression === "sad" && !gameOver) {
      feverGauge -= 0.3;
      if (feverGauge < 0) feverGauge = 0;
      if (feverGauge === 0 && inFever) inFever = false;
    }

    // 重力
    playerVy += gravity;
    playerY += playerVy;

    if (playerY >= gY) {
      playerY = gY;
      playerVy = 0;
      isOnGround = true;
    }

    // 画面外に行きすぎない
    if (playerX < 120) playerX = 120;
    if (playerX > width() - 150) playerX = width() - 150;
  }

  function updateBombs() {
    if (scene !== "play") return;
    for (const b of bombs) {
      if (!b.alive) continue;
      b.x += b.vx;

      // プレイヤーと衝突
      if (circleHit(b.x, b.y, b.radius, playerX, playerY, playerRadius)) {
        b.alive = false;
        damage();
      }
    }
    bombs = bombs.filter((b) => b.alive && b.x + b.radius > -50);
  }

  function updateStars() {
    if (scene !== "play") return;
    for (const s of stars) {
      if (!s.alive) continue;
      s.x += s.vx;
      s.y += s.vy;

      if (circleHit(s.x, s.y, s.size, playerX, playerY, playerRadius + 10)) {
        s.alive = false;
        addScore(120);
        addCombo();
      }
    }
    stars = stars.filter((s) => s.alive && s.x + s.size > -40);
  }

  function updateWaves() {
    if (scene !== "play") return;
    for (const w of waves) {
      if (!w.alive) continue;
      w.x += w.vx;

      for (const b of bombs) {
        if (!b.alive) continue;
        if (circleHit(w.x, w.y, w.radius, b.x, b.y, b.radius)) {
          b.alive = false;
          w.alive = false;
          addScore(150);
          addCombo();
        }
      }
    }
    waves = waves.filter((w) => w.alive && w.x - w.radius < width() + 60);
  }

  function updateFever() {
    if (scene !== "play") return;
    if (!inFever) return;
    feverGauge -= 0.35;
    if (feverGauge <= 0) {
      feverGauge = 0;
      inFever = false;
    }
  }

  function updateSpawns() {
    if (scene !== "play") return;
    if (gameOver) return;

    // 爆弾スポーン
    const baseInterval = inFever ? 40 : 70;
    const interval = Math.max(28, baseInterval - Math.floor(score / 1500));
    if (tick % interval === 0) {
      spawnBomb();
    }

    // フィーバー中はスター多め
    if (inFever && tick % 35 === 0) {
      spawnStar();
    }

    // たまにラッキースター
    if (!inFever && tick % 120 === 0 && Math.random() < 0.35) {
      spawnStar(width() + 30, groundY() - 150);
    }
  }

  // ===== 描画用コンテキスト =====

  const drawCtx: DrawContext = {
    ctx,
    width,
    height,
    groundY,
  };

  // ===== メインループ =====

  function loop() {
    tick += 1;

    // 状態アップデート（シーンごと）
    switch (scene) {
      case "play": {
        if (!gameOver) {
          updatePlayer();
          updateBombs();
          updateStars();
          updateWaves();
          updateFever();
          updateSpawns();
          updateTrend();
        } else {
          // ゲームオーバー中も表情を見てコンテニュー判定
          checkContinueByExpression();
        }
        break;
      }
      case "title": {
        updateTitleByExpression();
        break;
      }
      case "customize": {
        updateCustomizeByExpression();
        break;
      }
      case "gacha": {
        updateGachaByExpression();
        break;
      }
    }

    // いいねパーティクルは常に更新
    updateLikeParticles();

    // スキン情報（毎フレーム、ID→色情報に変換）
    const charSkin = findCharacterSkin(cosmetics.equippedCharacterSkinId);
    const bgSkin = findBackgroundSkin(cosmetics.equippedBackgroundSkinId);

    // ガチャメッセージの寿命（約5秒）
    const activeGachaMessage =
      lastGachaMessage && tick - lastGachaTick < 300
        ? lastGachaMessage
        : null;

    const coinsEarnMsgActive = tick - lastCoinsEarnedTick < 240;

    // ===== シーンごとの描画 =====

    if (scene === "play") {
      // プレイ画面
      drawBackground(drawCtx, {
        inFever,
        colors: bgSkin.colors,
      });
      drawStars(drawCtx, stars, tick, inFever);
      drawBombs(drawCtx, bombs);
      drawWaves(drawCtx, waves, inFever);
      drawPlayer(drawCtx, {
        playerX,
        playerY,
        playerRadius,
        inFever,
        currentExpression,
        isOnGround,
        skinColors: charSkin.colors,
      });

      const trendInfo = getTrendLabelAndProgress();

      drawUI(drawCtx, {
        score,
        combo,
        life,
        feverGauge,
        inFever,
        currentExpression,
        missionText: getCurrentMissionText(),
        trendActive: trendInfo.active,
        trendLabel: trendInfo.label,
        trendProgress: trendInfo.progress,
        coins: cosmetics.coins,
        gachaMessage: activeGachaMessage,
        coinsEarnedText: coinsEarnMsgActive
          ? `+${lastCoinsEarned} coins!`
          : null,
      });

      drawLikeParticles(drawCtx, likeParticles);

      const showContinueHint =
        gameOver && gameOverTick !== null && tick - gameOverTick >= 30;

      drawGameOverOverlay(drawCtx, {
        gameOver,
        score,
        maxCombo,
        rank: getRank(score),
        showContinueHint,
      });
    } else if (scene === "title") {
      // タイトル画面
      drawBackground(drawCtx, {
        inFever: false,
        colors: bgSkin.colors,
      });

      // プレイヤーを少しだけ浮かせて飾りとして表示
      drawPlayer(drawCtx, {
        playerX,
        playerY,
        playerRadius,
        inFever: false,
        currentExpression,
        isOnGround: true,
        skinColors: charSkin.colors,
      });

      const w = width();
      const h = height();

      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.font = "40px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("Emotion Runner", w / 2, h / 2 - 80);

      ctx.font = "20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#e5e7eb";
      ctx.fillText("😄 笑顔キープ → ゲームスタート", w / 2, h / 2 - 10);
      ctx.fillText("🔥 怒り顔キープ → 着せ替え", w / 2, h / 2 + 20);
      ctx.fillText("😲 驚き顔キープ → ガチャ", w / 2, h / 2 + 50);

      ctx.font = "16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#cbd5f5";
      ctx.fillText(`所持コイン: ${cosmetics.coins}`, w / 2, h / 2 + 90);

      ctx.textAlign = "left";
    } else if (scene === "customize") {
      // 着せ替え画面
      drawBackground(drawCtx, {
        inFever: false,
        colors: bgSkin.colors,
      });

      // プレイヤーを中央に大きく
      const centerX = width() / 2;
      const centerY = groundY() - 40;
      drawPlayer(drawCtx, {
        playerX: centerX,
        playerY: centerY,
        playerRadius: playerRadius + 8,
        inFever: false,
        currentExpression,
        isOnGround: true,
        skinColors: charSkin.colors,
      });

      const w = width();
      const h = height();

      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.font = "32px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("着せ替えルーム", w / 2, 40);

      ctx.font = "18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#e5e7eb";
      ctx.fillText("🔥 怒り顔キープ → キャラ衣装切り替え", w / 2, h - 170);
      ctx.fillText("😲 驚き顔キープ → 背景スキン切り替え", w / 2, h - 140);
      ctx.fillText("😄 or 😢 長押し → タイトルに戻る", w / 2, h - 110);

      ctx.font = "16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#cbd5f5";
      ctx.fillText(`所持コイン: ${cosmetics.coins}`, w / 2, h - 70);

      ctx.textAlign = "left";

      // いいねエフェクト
      drawLikeParticles(drawCtx, likeParticles);
    } else if (scene === "gacha") {
      // ガチャ画面
      drawBackground(drawCtx, {
        inFever: false,
        colors: bgSkin.colors,
      });

      const w = width();
      const h = height();

      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.font = "32px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("ガチャルーム", w / 2, 40);

      ctx.font = "18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#e5e7eb";
      ctx.fillText("😄 笑顔キープ → ガチャを1回引く", w / 2, h - 160);
      ctx.fillText("😢 悲しい顔キープ → タイトルに戻る", w / 2, h - 130);

      ctx.font = "20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#facc15";
      ctx.fillText(`Coins: ${cosmetics.coins}`, w / 2, h - 200);

      // ガチャ結果／コイン獲得メッセージ
      if (activeGachaMessage || coinsEarnMsgActive) {
        const boxW = 480;
        const boxH = 80;
        const x = w / 2 - boxW / 2;
        const y = h / 2 - boxH / 2;

        ctx.fillStyle = "rgba(15,23,42,0.92)";
        ctx.fillRect(x, y, boxW, boxH);

        ctx.strokeStyle = "rgba(148,163,184,0.9)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, boxW, boxH);

        ctx.textAlign = "center";
        ctx.font =
          "18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillStyle = "#e5e7eb";

        if (activeGachaMessage) {
          ctx.fillText(activeGachaMessage, x + boxW / 2, y + 28);
        }
        if (coinsEarnMsgActive) {
          ctx.fillStyle = "#facc15";
          ctx.fillText(`+${lastCoinsEarned} coins!`, x + boxW / 2, y + 52);
        }

        ctx.textAlign = "left";
      }

      drawLikeParticles(drawCtx, likeParticles);
    }

    requestAnimationFrame(loop);
  }

  loop();

  return {
    setExpression(exp: Expression) {
      currentExpression = exp;
    },
  };
}
