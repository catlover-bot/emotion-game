// src/cosmetics.ts

// スキンのレアリティ
export type Rarity = "common" | "rare" | "epic" | "legendary";

export type CharacterSkinColors = {
  body: string;
  outline: string;
  eye: string;
  mouth: string;
};

export type BackgroundSkinColors = {
  top: string;
  bottom: string;
  ground: string;
  line: string;
};

export type CharacterSkinDef = {
  id: string;
  name: string;
  rarity: Rarity;
  colors: CharacterSkinColors;
};

export type BackgroundSkinDef = {
  id: string;
  name: string;
  rarity: Rarity;
  colors: BackgroundSkinColors;
};

export type OwnedCosmetics = {
  coins: number;
  ownedCharacterSkinIds: string[];
  ownedBackgroundSkinIds: string[];
  equippedCharacterSkinId: string;
  equippedBackgroundSkinId: string;
};

// ==== スキン定義 ====

// キャラ衣装
const CHARACTER_SKINS: CharacterSkinDef[] = [
  {
    id: "char_default",
    name: "デフォルトフェイス",
    rarity: "common",
    colors: {
      body: "#22c55e",
      outline: "rgba(0,0,0,0.3)",
      eye: "#000000",
      mouth: "#000000",
    },
  },
  {
    id: "char_cool_night",
    name: "クールナイト",
    rarity: "rare",
    colors: {
      body: "#38bdf8",
      outline: "rgba(15,23,42,0.9)",
      eye: "#0f172a",
      mouth: "#0f172a",
    },
  },
  {
    id: "char_pink_idol",
    name: "ピンクアイドル",
    rarity: "epic",
    colors: {
      body: "#fb7185",
      outline: "rgba(136,19,55,0.9)",
      eye: "#4a044e",
      mouth: "#4a044e",
    },
  },
  {
    id: "char_cosmic",
    name: "コズミックフェイス",
    rarity: "legendary",
    colors: {
      body: "#a855f7",
      outline: "rgba(76,29,149,0.9)",
      eye: "#f9fafb",
      mouth: "#f9fafb",
    },
  },
];

// 背景スキン
const BACKGROUND_SKINS: BackgroundSkinDef[] = [
  {
    id: "bg_default",
    name: "夜の路地裏",
    rarity: "common",
    colors: {
      top: "#141625",
      bottom: "#1e293b",
      ground: "#262626",
      line: "rgba(255,255,255,0.05)",
    },
  },
  {
    id: "bg_city_neon",
    name: "ネオンシティ",
    rarity: "rare",
    colors: {
      top: "#0f172a",
      bottom: "#1d4ed8",
      ground: "#020617",
      line: "rgba(129,140,248,0.6)",
    },
  },
  {
    id: "bg_sunset",
    name: "サンセットビーチ",
    rarity: "epic",
    colors: {
      top: "#f97316",
      bottom: "#0f172a",
      ground: "#1e293b",
      line: "rgba(251,113,133,0.7)",
    },
  },
  {
    id: "bg_cosmos",
    name: "コズミックギャラクシー",
    rarity: "legendary",
    colors: {
      top: "#020617",
      bottom: "#4f46e5",
      ground: "#020617",
      line: "rgba(96,165,250,0.8)",
    },
  },
];

// ==== デフォルト状態 ====

const DEFAULT_OWNED: OwnedCosmetics = {
  coins: 0,
  ownedCharacterSkinIds: ["char_default"],
  ownedBackgroundSkinIds: ["bg_default"],
  equippedCharacterSkinId: "char_default",
  equippedBackgroundSkinId: "bg_default",
};

const STORAGE_KEY = "emotionGameCosmetics";

// ==== 永続化 ====

function safeParse(json: string | null): OwnedCosmetics | null {
  if (!json) return null;
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== "object") return null;
    return {
      ...DEFAULT_OWNED,
      ...data,
    } as OwnedCosmetics;
  } catch {
    return null;
  }
}

export function loadOwnedCosmetics(): OwnedCosmetics {
  if (typeof window === "undefined") {
    return { ...DEFAULT_OWNED };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = safeParse(raw);
    if (!parsed) return { ...DEFAULT_OWNED };

    // 所持スキンに存在しないIDがあればきれいにする
    const charIds = new Set(CHARACTER_SKINS.map((s) => s.id));
    const bgIds = new Set(BACKGROUND_SKINS.map((s) => s.id));

    const ownedChar = parsed.ownedCharacterSkinIds.filter((id) =>
      charIds.has(id),
    );
    const ownedBg = parsed.ownedBackgroundSkinIds.filter((id) =>
      bgIds.has(id),
    );

    const equippedChar = charIds.has(parsed.equippedCharacterSkinId)
      ? parsed.equippedCharacterSkinId
      : "char_default";
    const equippedBg = bgIds.has(parsed.equippedBackgroundSkinId)
      ? parsed.equippedBackgroundSkinId
      : "bg_default";

    return {
      coins: parsed.coins ?? 0,
      ownedCharacterSkinIds: ownedChar.length ? ownedChar : ["char_default"],
      ownedBackgroundSkinIds: ownedBg.length ? ownedBg : ["bg_default"],
      equippedCharacterSkinId: equippedChar,
      equippedBackgroundSkinId: equippedBg,
    };
  } catch {
    return { ...DEFAULT_OWNED };
  }
}

export function saveOwnedCosmetics(state: OwnedCosmetics): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 失敗してもゲームは続行できるようにする
  }
}

export function clearOwnedCosmetics(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures so the app can continue.
  }
}

// ==== 検索ユーティリティ ====

export function findCharacterSkin(id: string | null | undefined): CharacterSkinDef {
  const fallback = CHARACTER_SKINS[0];
  if (!id) return fallback;
  return CHARACTER_SKINS.find((s) => s.id === id) ?? fallback;
}

export function findBackgroundSkin(id: string | null | undefined): BackgroundSkinDef {
  const fallback = BACKGROUND_SKINS[0];
  if (!id) return fallback;
  return BACKGROUND_SKINS.find((s) => s.id === id) ?? fallback;
}

// ==== ガチャ ====

// 1回のガチャに必要なコイン
export const GACHA_COST = 10;

export function canRollGacha(state: OwnedCosmetics): boolean {
  return state.coins >= GACHA_COST;
}

function chooseByWeight<T>(items: { value: T; weight: number }[]): T {
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  let r = Math.random() * total;
  for (const it of items) {
    if (r < it.weight) return it.value;
    r -= it.weight;
  }
  return items[items.length - 1].value;
}

function rollRarity(): Rarity {
  return chooseByWeight<Rarity>([
    { value: "common", weight: 60 },
    { value: "rare", weight: 25 },
    { value: "epic", weight: 12 },
    { value: "legendary", weight: 3 },
  ]);
}

export type GachaResult = {
  type: "character" | "background";
  id: string;
  name: string;
  rarity: Rarity;
  isNew: boolean;
};

export function rollGacha(
  state: OwnedCosmetics,
): { state: OwnedCosmetics; result: GachaResult } {
  if (!canRollGacha(state)) {
    throw new Error("not enough coins");
  }

  const kind: "character" | "background" =
    Math.random() < 0.5 ? "character" : "background";
  const rarity = rollRarity();

  const pool =
    kind === "character" ? CHARACTER_SKINS : BACKGROUND_SKINS;

  let candidates = pool.filter((s) => s.rarity === rarity);
  if (candidates.length === 0) {
    candidates = pool;
  }

  const skin =
    candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0];

  let isNew = false;

  let next: OwnedCosmetics = {
    ...state,
    coins: state.coins - GACHA_COST,
  };

  if (kind === "character") {
    const already = new Set(state.ownedCharacterSkinIds);
    if (!already.has(skin.id)) {
      isNew = true;
      already.add(skin.id);
    }
    next.ownedCharacterSkinIds = Array.from(already);
  } else {
    const already = new Set(state.ownedBackgroundSkinIds);
    if (!already.has(skin.id)) {
      isNew = true;
      already.add(skin.id);
    }
    next.ownedBackgroundSkinIds = Array.from(already);
  }

  return {
    state: next,
    result: {
      type: kind,
      id: skin.id,
      name: skin.name,
      rarity: skin.rarity,
      isNew,
    },
  };
}

// ==== 着せ替え（所持しているスキンを順番に切り替え） ====

export function cycleCharacterSkin(state: OwnedCosmetics): OwnedCosmetics {
  const owned = state.ownedCharacterSkinIds;
  if (!owned.length) return state;

  const idx = owned.indexOf(state.equippedCharacterSkinId);
  const currentIndex = idx === -1 ? 0 : idx;
  const nextId = owned[(currentIndex + 1) % owned.length];

  if (nextId === state.equippedCharacterSkinId) return state;
  return {
    ...state,
    equippedCharacterSkinId: nextId,
  };
}

export function cycleBackgroundSkin(state: OwnedCosmetics): OwnedCosmetics {
  const owned = state.ownedBackgroundSkinIds;
  if (!owned.length) return state;

  const idx = owned.indexOf(state.equippedBackgroundSkinId);
  const currentIndex = idx === -1 ? 0 : idx;
  const nextId = owned[(currentIndex + 1) % owned.length];

  if (nextId === state.equippedBackgroundSkinId) return state;
  return {
    ...state,
    equippedBackgroundSkinId: nextId,
  };
}
