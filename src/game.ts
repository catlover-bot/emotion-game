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
import { contains, gameOverButtons } from "./uiRects";
import {
  type Rarity,
  loadOwnedCosmetics,
  saveOwnedCosmetics,
  findCharacterSkin,
  findBackgroundSkin,
  canRollGacha,
  rollGacha,
  cycleCharacterSkin,
  cycleBackgroundSkin,
  GACHA_COST,
  type OwnedCosmetics,
} from "./cosmetics";
import { shareResultImage } from "./share";
import { dailySeed } from "./dailySeed";
import { DAILY_BEST_PREFIX } from "./storage";

export type Scene = "title" | "play" | "customize" | "gacha";
export type GameAction = "jump" | "attack" | "boost";
export type GameSnapshot = {
  scene: Scene;
  gameOver: boolean;
  score: number;
  maxCombo: number;
  dailyBest: number;
  isNewDailyRecord: boolean;
  rank: string;
  coins: number;
  charName: string;
  charRarity: Rarity;
  bgName: string;
  bgRarity: Rarity;
  gachaMessage: string | null;
  gachaCost: number;
  canRollGacha: boolean;
};

export type Game = {
  setExpression(exp: Expression): void;
  tap(x: number, y: number): void;
  getSnapshot(): GameSnapshot;
  subscribe(listener: (snapshot: GameSnapshot) => void): () => void;
  startRun(): void;
  retry(): void;
  goToTitle(): void;
  openCustomize(): void;
  openGacha(): void;
  cycleCharacter(): void;
  cycleBackground(): void;
  rollGachaAction(): void;
  triggerAction(action: GameAction): void;
  share(): Promise<void>;
};

// ====== Daily / RNG ======
function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function dailyBestStorageKey(): string {
  return `${DAILY_BEST_PREFIX}${todayKey()}`;
}
function loadDailyBest(): number {
  try {
    const v = localStorage.getItem(dailyBestStorageKey());
    const n = v ? Number(v) : 0;
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  } catch {
    return 0;
  }
}
function saveDailyBest(v: number) {
  try {
    localStorage.setItem(dailyBestStorageKey(), String(Math.max(0, Math.floor(v))));
  } catch {
    // ignore
  }
}

// Mulberry32 (fast deterministic RNG)
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


export function createGame(canvas: HTMLCanvasElement): Game {
  const ctxRaw = canvas.getContext("2d");
  if (!ctxRaw) {
    throw new Error("2Dコンテキストを取得できませんでした");
  }
  const ctx: CanvasRenderingContext2D = ctxRaw;
  const appName = "表情ランナー";

  let viewportWidth = 0;
  let viewportHeight = 0;
  let dpr = 1;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    viewportWidth = Math.max(1, Math.round(rect.width || window.innerWidth));
    viewportHeight = Math.max(1, Math.round(rect.height || window.innerHeight));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(viewportWidth * dpr);
    canvas.height = Math.round(viewportHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // ===== ゲーム内部状態 =====
  let currentExpression: Expression = "neutral";

  const width = () => viewportWidth;
  const height = () => viewportHeight;

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
  const listeners = new Set<(snapshot: GameSnapshot) => void>();
  let snapshotDirty = true;

  function markSnapshotDirty() {
    snapshotDirty = true;
  }

  function updateCosmetics(next: OwnedCosmetics) {
    cosmetics = next;
    saveOwnedCosmetics(next);
    markSnapshotDirty();
  }

  // ガチャメッセージ / コイン獲得メッセージ
  let lastGachaMessage: string | null = null;
  let lastGachaTick = 0;
  let lastCoinsEarned = 0;
  let lastCoinsEarnedTick = 0;

  // ===== Daily Best（game.ts 内で保存・表示・報酬） =====
  let dailyBest = loadDailyBest();
  let isNewDailyRecord = false;
  const DAILY_RECORD_BONUS_COINS = 50;

  // ===== Daily seed で「今日の乱数」を固定（競争性の核） =====
  // ※表情入力タイミングで分岐はするが、スポーン/乱数の素性は同一になる
  const daySeed = dailySeed();
  let rng = mulberry32(daySeed);

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
  let manualBoostTicks = 0;

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

  // いいねシャワーを発生させる（ここは演出なので Math.random のままでもOK）
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

  // Daily Best 更新（コイン報酬もここで付与）
  function updateDailyBestOnGameOver() {
    const prev = dailyBest;
    if (score > prev) {
      dailyBest = score;
      saveDailyBest(dailyBest);
      isNewDailyRecord = true;

      // Daily record bonus
      updateCosmetics({
        ...cosmetics,
        coins: cosmetics.coins + DAILY_RECORD_BONUS_COINS,
      });

      // 画面メッセージに加算表示（通常 earned に上乗せ）
      lastCoinsEarned += DAILY_RECORD_BONUS_COINS;
      lastCoinsEarnedTick = tick;

      spawnLikeShower(width() / 2, groundY() - 120);
    } else {
      isNewDailyRecord = false;
    }
  }

  function damage() {
    if (scene !== "play") return;
    if (gameOver) return;

    life -= 1;
    breakCombo();
    markSnapshotDirty();

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

      // 通常コイン
      awardCoinsOnGameOver();

      // Daily best / bonus
      updateDailyBestOnGameOver();
      markSnapshotDirty();
    }
  }

  function spawnBomb() {
    const r = 20 + rng() * 18;
    const gY = groundY();
    bombs.push({
      x: width() + r + 10,
      y: gY,
      vx: -(3 + rng() * 2 + (inFever ? 1.2 : 0)),
      radius: r,
      alive: true,
    });
  }

  function spawnStar(x?: number, y?: number) {
    const baseY = groundY() - 110 - rng() * 50;
    stars.push({
      x: x ?? width() + 40,
      y: y ?? baseY,
      vx: -(2.2 + rng() * 1.2),
      vy: 0.2,
      size: 16 + rng() * 7,
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

  function resetMenuHoldCounters() {
    titleHappyTicks = 0;
    titleAngryTicks = 0;
    titleSurprisedTicks = 0;
    customizeHappyTicks = 0;
    customizeAngryTicks = 0;
    customizeSadTicks = 0;
    customizeSurprisedTicks = 0;
    gachaHappyTicks = 0;
    gachaSadTicks = 0;
  }

  function setScene(nextScene: Scene) {
    scene = nextScene;
    resetMenuHoldCounters();
    markSnapshotDirty();
  }

  function getSnapshot(): GameSnapshot {
    const charSkin = findCharacterSkin(cosmetics.equippedCharacterSkinId);
    const bgSkin = findBackgroundSkin(cosmetics.equippedBackgroundSkinId);
    return {
      scene,
      gameOver,
      score,
      maxCombo,
      dailyBest,
      isNewDailyRecord,
      rank: getRank(score),
      coins: cosmetics.coins,
      charName: charSkin.name,
      charRarity: charSkin.rarity,
      bgName: bgSkin.name,
      bgRarity: bgSkin.rarity,
      gachaMessage: lastGachaMessage,
      gachaCost: GACHA_COST,
      canRollGacha: canRollGacha(cosmetics),
    };
  }

  function emitSnapshot() {
    if (!snapshotDirty) return;
    snapshotDirty = false;
    const snapshot = getSnapshot();
    for (const listener of listeners) {
      listener(snapshot);
    }
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
    const target = targets[Math.floor(rng() * targets.length)] ?? "happy";

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
    markSnapshotDirty();
  }

  function updateTrend() {
    if (scene !== "play") return;
    if (gameOver) return;

    // まだトレンドがなくて、時間が来たら開始候補
    if ((!trend || !trend.active) && tick >= nextTrendTick) {
      // 軽いランダム性を持たせる
      if (rng() < 0.015) {
        startTrendChallenge();
      }
    }

    if (!trend || !trend.active) return;

    // 時間切れ
    if (tick >= trend.endTick && !trend.success) {
      trend.active = false;
      markSnapshotDirty();
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
      markSnapshotDirty();
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
    // その日の固定seedで再現性（Daily Challenge）
    rng = mulberry32(daySeed);

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
    manualBoostTicks = 0;

    // トレンドチャレンジもリセット
    trend = null;
    nextTrendTick = tick + 600;

    // Daily record 表示フラグ（新規プレイでは消す）
    isNewDailyRecord = false;
    markSnapshotDirty();
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

  function startRun() {
    resetGame();
    setScene("play");
    spawnLikeShower(width() / 2, groundY() - 80);
  }

  function goToTitle() {
    setScene("title");
  }

  function openCustomize() {
    setScene("customize");
  }

  function openGacha() {
    setScene("gacha");
  }

  function cycleCharacter() {
    if (scene !== "customize") return;
    const next = cycleCharacterSkin(cosmetics);
    if (next !== cosmetics) {
      updateCosmetics(next);
      spawnLikeShower(width() / 2, groundY() - 40);
      markSnapshotDirty();
    }
  }

  function cycleBackground() {
    if (scene !== "customize") return;
    const next = cycleBackgroundSkin(cosmetics);
    if (next !== cosmetics) {
      updateCosmetics(next);
      spawnLikeShower(width() / 2, groundY() - 80);
      markSnapshotDirty();
    }
  }

  function runGacha() {
    if (scene !== "gacha") return;
    if (!canRollGacha(cosmetics)) {
      lastGachaMessage = "コインが足りません… (笑顔をキープしてガチャ)";
      lastGachaTick = tick;
      markSnapshotDirty();
      return;
    }

    try {
      const { state, result } = rollGacha(cosmetics);
      updateCosmetics(state);
      const kind = result.type === "character" ? "キャラ衣装" : "背景スキン";
      const rarityLabel =
        result.rarity === "legendary"
          ? "レジェンダリー"
          : result.rarity === "epic"
            ? "エピック"
            : result.rarity === "rare"
              ? "レア"
              : "ノーマル";
      const newStr = result.isNew ? "新しく追加！" : "すでに所持済み";
      lastGachaMessage = `${kind} を入手 (${rarityLabel}) ${newStr}`;
      lastGachaTick = tick;
      spawnLikeShower(width() / 2, height() / 2);
    } catch {
      lastGachaMessage = "ガチャエラーが発生しました";
      lastGachaTick = tick;
    }

    markSnapshotDirty();
  }

  function performJump() {
    if (scene !== "play" || gameOver) return;
    if (!isOnGround || tick - lastHappyTick <= HAPPY_COOLDOWN) return;

    const gY = groundY();
    playerVy = -15.5;
    isOnGround = false;
    lastHappyTick = tick;
    addCombo();
    addScore(80);
    spawnStar(playerX + 140, gY - 120);
  }

  function performAttack() {
    if (scene !== "play" || gameOver) return;
    if (tick - lastAngryTick <= ANGRY_COOLDOWN) return;

    spawnWave();
    lastAngryTick = tick;
    addCombo();
    addScore(60);
  }

  function triggerBoost() {
    if (scene !== "play" || gameOver) return;
    manualBoostTicks = Math.max(manualBoostTicks, 12);
  }

  // ===== シーン別：表情での操作ロジック =====

  function updateTitleByExpression() {
    if (scene !== "title") return;

    if (currentExpression === "happy") titleHappyTicks += 1;
    else titleHappyTicks = 0;

    if (currentExpression === "angry") titleAngryTicks += 1;
    else titleAngryTicks = 0;

    if (currentExpression === "surprised") titleSurprisedTicks += 1;
    else titleSurprisedTicks = 0;

    // プレイ開始
    if (titleHappyTicks === HOLD_LONG) {
      startRun();
    }

    // 着せ替えへ
    if (titleAngryTicks === HOLD_LONG) {
      openCustomize();
    }

    // ガチャへ
    if (titleSurprisedTicks === HOLD_LONG) {
      openGacha();
    }
  }

  function updateCustomizeByExpression() {
    if (scene !== "customize") return;

    if (currentExpression === "angry") customizeAngryTicks += 1;
    else customizeAngryTicks = 0;

    if (currentExpression === "surprised") customizeSurprisedTicks += 1;
    else customizeSurprisedTicks = 0;

    if (currentExpression === "happy") customizeHappyTicks += 1;
    else customizeHappyTicks = 0;

    if (currentExpression === "sad") customizeSadTicks += 1;
    else customizeSadTicks = 0;

    // キャラ衣装切り替え
    if (customizeAngryTicks === HOLD_SHORT) {
      cycleCharacter();
    }

    // 背景スキン切り替え
    if (customizeSurprisedTicks === HOLD_SHORT) {
      cycleBackground();
    }

    // happy or sad 長押しでタイトルへ戻る
    if (customizeHappyTicks === HOLD_LONG || customizeSadTicks === HOLD_LONG) {
      goToTitle();
    }
  }

  function updateGachaByExpression() {
    if (scene !== "gacha") return;

    if (currentExpression === "happy") gachaHappyTicks += 1;
    else gachaHappyTicks = 0;

    if (currentExpression === "sad") gachaSadTicks += 1;
    else gachaSadTicks = 0;

    // ガチャ実行
    if (gachaHappyTicks === HOLD_LONG) {
      runGacha();
    }

    // sad 長押しでタイトルへ戻る
    if (gachaSadTicks === HOLD_LONG) {
      goToTitle();
    }
  }

  // ===== プレイ中の更新 =====

  function updatePlayer() {
    if (scene !== "play") return;
    const gY = groundY();

    if (currentExpression === "happy") {
      performJump();
    }

    if (currentExpression === "angry") {
      performAttack();
    }

    // surprised は少しだけ前進ブースト。タップ版は短時間だけ強めに押し出す。
    if (!gameOver) {
      const boostingByFace = currentExpression === "surprised";
      const boostingByTouch = manualBoostTicks > 0;
      if (boostingByFace) {
        playerX += 0.65;
      } else if (boostingByTouch) {
        playerX += 1.0;
        manualBoostTicks -= 1;
      } else {
        playerX += 0.1;
      }
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

    // たまにラッキースター（rng 使用）
    if (!inFever && tick % 120 === 0 && rng() < 0.35) {
      spawnStar(width() + 30, groundY() - 150);
    }
  }

  function makeShareText() {
    const rank = getRank(score);
    const dailyLine = isNewDailyRecord ? `今日の新記録！ ${dailyBest}` : `今日のベスト: ${dailyBest}`;
    return `${appName}\nスコア: ${score}\nランク: ${rank}\n最大コンボ: ×${maxCombo}\n${dailyLine}`;
  }

  async function shareResult() {
    await shareResultImage(canvas, makeShareText());
  }

  function handleTap(x: number, y: number) {
    if (scene !== "play") return;
    if (!gameOver) return;

    const { share, retry, title } = gameOverButtons(width(), height());

    if (contains(share, x, y)) {
      void shareResult();
      return;
    }
    if (contains(retry, x, y)) {
      startRun();
      return;
    }
    if (contains(title, x, y)) {
      goToTitle();
      return;
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width(), height());

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
      lastGachaMessage && tick - lastGachaTick < 300 ? lastGachaMessage : null;

    const coinsEarnMsgActive = tick - lastCoinsEarnedTick < 240;

    const w = width();
    const h = height();

    // ===== シーンごとの描画 =====
    if (scene === "play") {
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
        coinsEarnedText: coinsEarnMsgActive ? `+${lastCoinsEarned} コイン！` : null,
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
        dailyBest,
        isNewDailyRecord,
      });
    } else if (scene === "title") {
      drawBackground(drawCtx, {
        inFever: false,
        colors: bgSkin.colors,
      });

      drawPlayer(drawCtx, {
        playerX,
        playerY,
        playerRadius,
        inFever: false,
        currentExpression,
        isOnGround: true,
        skinColors: charSkin.colors,
      });

      drawLikeParticles(drawCtx, likeParticles);
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.96)";
      ctx.font = "700 28px 'Avenir Next', system-ui, sans-serif";
      ctx.fillText(appName, w / 2, 58);
      ctx.font = "15px 'Avenir Next', system-ui, sans-serif";
      ctx.fillStyle = "rgba(226,232,240,0.86)";
      ctx.fillText(`今日のベスト ${dailyBest}  |  コイン ${cosmetics.coins}`, w / 2, 90);
      ctx.textAlign = "left";
    } else if (scene === "customize") {
      drawBackground(drawCtx, {
        inFever: false,
        colors: bgSkin.colors,
      });

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

      drawLikeParticles(drawCtx, likeParticles);
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "700 26px 'Avenir Next', system-ui, sans-serif";
      ctx.fillText("着せ替えルーム", w / 2, 54);
      ctx.font = "15px 'Avenir Next', system-ui, sans-serif";
      ctx.fillStyle = "rgba(226,232,240,0.84)";
      ctx.fillText(`${charSkin.name}  |  ${bgSkin.name}`, w / 2, 86);
      ctx.textAlign = "left";
    } else if (scene === "gacha") {
      drawBackground(drawCtx, {
        inFever: false,
        colors: bgSkin.colors,
      });

      drawLikeParticles(drawCtx, likeParticles);
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "700 26px 'Avenir Next', system-ui, sans-serif";
      ctx.fillText("ガチャルーム", w / 2, 54);
      ctx.font = "15px 'Avenir Next', system-ui, sans-serif";
      ctx.fillStyle = "rgba(250,204,21,0.94)";
      ctx.fillText(`コイン ${cosmetics.coins}`, w / 2, 86);

      // ガチャ結果／コイン獲得メッセージ
      if (activeGachaMessage || coinsEarnMsgActive) {
        const boxW = Math.min(360, w - 40);
        const boxH = 80;
        const x = w / 2 - boxW / 2;
        const y = h / 2 - boxH / 2;

        ctx.fillStyle = "rgba(15,23,42,0.92)";
        ctx.fillRect(x, y, boxW, boxH);

        ctx.strokeStyle = "rgba(148,163,184,0.9)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, boxW, boxH);

        ctx.textAlign = "center";
        ctx.font = "18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillStyle = "#e5e7eb";

        if (activeGachaMessage) {
          ctx.fillText(activeGachaMessage, x + boxW / 2, y + 28);
        }
        if (coinsEarnMsgActive) {
          ctx.fillStyle = "#facc15";
          ctx.fillText(`+${lastCoinsEarned} コイン！`, x + boxW / 2, y + 52);
        }

        ctx.textAlign = "left";
      }
    }

    emitSnapshot();
    requestAnimationFrame(loop);
  }

  loop();

  return {
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(getSnapshot());
      return () => {
        listeners.delete(listener);
      };
    },
    setExpression(exp: Expression) {
      currentExpression = exp;
    },
    tap(x: number, y: number) {
      handleTap(x, y);
    },
    startRun,
    retry() {
      startRun();
    },
    goToTitle,
    openCustomize,
    openGacha,
    cycleCharacter,
    cycleBackground,
    rollGachaAction() {
      runGacha();
    },
    triggerAction(action: GameAction) {
      switch (action) {
        case "jump":
          performJump();
          break;
        case "attack":
          performAttack();
          break;
        case "boost":
          triggerBoost();
          break;
      }
    },
    share() {
      return shareResult();
    },
  };
}
