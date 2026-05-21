// src/cosmetics.ts
import {
  getLoadedCosmeticAssets,
  isCosmeticAssetImageAvailable,
} from "./cosmeticAssets";

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
  image?: string;
};

export type BackgroundSkinDef = {
  id: string;
  name: string;
  rarity: Rarity;
  colors: BackgroundSkinColors;
  image?: string;
};

export type ItemCosmeticDef = {
  id: string;
  name: string;
  rarity: Rarity;
  image?: string;
};

export type OwnedCosmetics = {
  coins: number;
  ownedCharacterSkinIds: string[];
  ownedBackgroundSkinIds: string[];
  ownedItemIds: string[];
  equippedCharacterSkinId: string;
  equippedBackgroundSkinId: string;
  equippedItemId: string;
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

const BUILT_IN_ITEMS: ItemCosmeticDef[] = [
  {
    id: "item_none",
    name: "アクセなし",
    rarity: "common",
  },
];

// ==== デフォルト状態 ====

const DEFAULT_OWNED: OwnedCosmetics = {
  coins: 0,
  ownedCharacterSkinIds: ["char_default"],
  ownedBackgroundSkinIds: ["bg_default"],
  ownedItemIds: ["item_none"],
  equippedCharacterSkinId: "char_default",
  equippedBackgroundSkinId: "bg_default",
  equippedItemId: "item_none",
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
    const charIds = new Set(getAllCharacterSkins().map((s) => s.id));
    const bgIds = new Set(getAllBackgroundSkins().map((s) => s.id));
    const itemIds = new Set(getAllItemCosmetics().map((s) => s.id));

    const ownedChar = parsed.ownedCharacterSkinIds.filter((id) =>
      charIds.has(id),
    );
    const ownedBg = parsed.ownedBackgroundSkinIds.filter((id) =>
      bgIds.has(id),
    );
    const ownedItems = (parsed.ownedItemIds ?? []).filter((id) =>
      itemIds.has(id),
    );

    const equippedChar = charIds.has(parsed.equippedCharacterSkinId)
      ? parsed.equippedCharacterSkinId
      : "char_default";
    const equippedBg = bgIds.has(parsed.equippedBackgroundSkinId)
      ? parsed.equippedBackgroundSkinId
      : "bg_default";
    const equippedItem = itemIds.has(parsed.equippedItemId)
      ? parsed.equippedItemId
      : "item_none";

    return {
      coins: parsed.coins ?? 0,
      ownedCharacterSkinIds: ownedChar.length ? ownedChar : ["char_default"],
      ownedBackgroundSkinIds: ownedBg.length ? ownedBg : ["bg_default"],
      ownedItemIds: ownedItems.length ? ownedItems : ["item_none"],
      equippedCharacterSkinId: equippedChar,
      equippedBackgroundSkinId: equippedBg,
      equippedItemId: equippedItem,
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

function getManifestCharacterSkins(): CharacterSkinDef[] {
  return getLoadedCosmeticAssets()
    .filter((asset) => asset.kind === "character")
    .map((asset) => ({
      id: asset.id,
      name: asset.name,
      rarity: asset.rarity,
      image: isCosmeticAssetImageAvailable(asset.id) ? asset.image : undefined,
      colors: CHARACTER_SKINS[0].colors,
    }));
}

function getManifestBackgroundSkins(): BackgroundSkinDef[] {
  return getLoadedCosmeticAssets()
    .filter((asset) => asset.kind === "background")
    .map((asset) => ({
      id: asset.id,
      name: asset.name,
      rarity: asset.rarity,
      image: isCosmeticAssetImageAvailable(asset.id) ? asset.image : undefined,
      colors: BACKGROUND_SKINS[0].colors,
    }));
}

function getManifestItems(): ItemCosmeticDef[] {
  return getLoadedCosmeticAssets()
    .filter((asset) => asset.kind === "item")
    .map((asset) => ({
      id: asset.id,
      name: asset.name,
      rarity: asset.rarity,
      image: isCosmeticAssetImageAvailable(asset.id) ? asset.image : undefined,
    }));
}

export function getAllCharacterSkins(): CharacterSkinDef[] {
  return [...CHARACTER_SKINS, ...getManifestCharacterSkins()];
}

export function getAllBackgroundSkins(): BackgroundSkinDef[] {
  return [...BACKGROUND_SKINS, ...getManifestBackgroundSkins()];
}

export function getAllItemCosmetics(): ItemCosmeticDef[] {
  return [...BUILT_IN_ITEMS, ...getManifestItems()];
}

export function findCharacterSkin(id: string | null | undefined): CharacterSkinDef {
  const fallback = CHARACTER_SKINS[0];
  if (!id) return fallback;
  return getAllCharacterSkins().find((s) => s.id === id) ?? fallback;
}

export function findBackgroundSkin(id: string | null | undefined): BackgroundSkinDef {
  const fallback = BACKGROUND_SKINS[0];
  if (!id) return fallback;
  return getAllBackgroundSkins().find((s) => s.id === id) ?? fallback;
}

export function findItemCosmetic(id: string | null | undefined): ItemCosmeticDef {
  const fallback = BUILT_IN_ITEMS[0];
  if (!id) return fallback;
  return getAllItemCosmetics().find((s) => s.id === id) ?? fallback;
}

export function getCosmeticCollectionSummary(state: OwnedCosmetics): {
  ownedCharacterCount: number;
  totalCharacterCount: number;
  ownedBackgroundCount: number;
  totalBackgroundCount: number;
  ownedItemCount: number;
  totalItemCount: number;
} {
  return {
    ownedCharacterCount: state.ownedCharacterSkinIds.length,
    totalCharacterCount: getAllCharacterSkins().length,
    ownedBackgroundCount: state.ownedBackgroundSkinIds.length,
    totalBackgroundCount: getAllBackgroundSkins().length,
    ownedItemCount: state.ownedItemIds.length,
    totalItemCount: getAllItemCosmetics().length,
  };
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
  type: "character" | "background" | "item";
  id: string;
  name: string;
  rarity: Rarity;
  image?: string;
  isNew: boolean;
};

export function rollGacha(
  state: OwnedCosmetics,
): { state: OwnedCosmetics; result: GachaResult } {
  if (!canRollGacha(state)) {
    throw new Error("not enough coins");
  }

  let kind = chooseByWeight<"character" | "background" | "item">([
    { value: "character", weight: 44 },
    { value: "background", weight: 36 },
    { value: "item", weight: 20 },
  ]);
  const rarity = rollRarity();

  if (kind === "item" && getAllItemCosmetics().filter((item) => item.id !== "item_none").length === 0) {
    kind = Math.random() < 0.55 ? "character" : "background";
  }

  const pool =
    kind === "character"
      ? getAllCharacterSkins()
      : kind === "background"
        ? getAllBackgroundSkins()
        : getAllItemCosmetics().filter((item) => item.id !== "item_none");

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
    if (kind === "background") {
      const already = new Set(state.ownedBackgroundSkinIds);
      if (!already.has(skin.id)) {
        isNew = true;
        already.add(skin.id);
      }
      next.ownedBackgroundSkinIds = Array.from(already);
    } else {
      const already = new Set(state.ownedItemIds);
      if (!already.has(skin.id)) {
        isNew = true;
        already.add(skin.id);
      }
      next.ownedItemIds = Array.from(already);
    }
  }

  return {
    state: next,
    result: {
      type: kind,
      id: skin.id,
      name: skin.name,
      rarity: skin.rarity,
      image: skin.image,
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

export function cycleItemCosmetic(state: OwnedCosmetics): OwnedCosmetics {
  const owned = state.ownedItemIds;
  if (!owned.length) return state;

  const idx = owned.indexOf(state.equippedItemId);
  const currentIndex = idx === -1 ? 0 : idx;
  const nextId = owned[(currentIndex + 1) % owned.length];

  if (nextId === state.equippedItemId) return state;
  return {
    ...state,
    equippedItemId: nextId,
  };
}
