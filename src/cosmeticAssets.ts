import type { Rarity } from "./cosmetics";

export type CosmeticAssetKind = "character" | "background" | "item";

export type CosmeticAssetDefinition = {
  id: string;
  name: string;
  rarity: Rarity;
  image: string;
  kind: CosmeticAssetKind;
};

type CosmeticManifestEntry = {
  id?: unknown;
  name?: unknown;
  rarity?: unknown;
  image?: unknown;
};

type CosmeticManifest = {
  characters?: unknown;
  backgrounds?: unknown;
  items?: unknown;
};

const MANIFEST_URL = "./cosmetics/manifest.json";
const VALID_RARITIES = new Set<Rarity>(["common", "rare", "epic", "legendary"]);
const loadedImageCache = new Map<string, HTMLImageElement>();
const failedImageIds = new Set<string>();

let manifestLoaded = false;
let assetDefinitions: CosmeticAssetDefinition[] = [];

function logCosmeticsInfo(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.info(`EMOTION_RUNNER_COSMETICS ${message}`);
    return;
  }
  console.info(`EMOTION_RUNNER_COSMETICS ${message}`, payload);
}

function logCosmeticsError(message: string, payload?: unknown) {
  if (payload === undefined) {
    console.error(`EMOTION_RUNNER_COSMETICS ${message}`);
    return;
  }
  console.error(`EMOTION_RUNNER_COSMETICS ${message}`, payload);
}

function isValidImagePath(value: string): boolean {
  return (
    value.startsWith("/cosmetics/") ||
    value.startsWith("./cosmetics/") ||
    value.startsWith("cosmetics/")
  ) && value.toLowerCase().endsWith(".png");
}

function resolveImagePath(image: string): string {
  if (image.startsWith("/")) return `.${image}`;
  if (image.startsWith("./")) return image;
  return `./${image}`;
}

function normalizeEntries(
  value: unknown,
  kind: CosmeticAssetKind,
  seenIds: Set<string>,
): CosmeticAssetDefinition[] {
  if (!Array.isArray(value)) return [];

  const entries: CosmeticAssetDefinition[] = [];
  for (const raw of value as CosmeticManifestEntry[]) {
    if (!raw || typeof raw !== "object") continue;

    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const rarity = typeof raw.rarity === "string" && VALID_RARITIES.has(raw.rarity as Rarity)
      ? raw.rarity as Rarity
      : null;
    const image = typeof raw.image === "string" ? raw.image.trim() : "";

    if (!id || !name || !rarity || !isValidImagePath(image) || seenIds.has(id)) {
      logCosmeticsError("manifest-entry-skipped", { kind, id, name, rarity, image });
      continue;
    }

    seenIds.add(id);
    entries.push({
      id,
      name,
      rarity,
      image: resolveImagePath(image),
      kind,
    });
  }

  return entries;
}

function preloadImage(asset: CosmeticAssetDefinition): Promise<void> {
  if (typeof Image === "undefined") return Promise.resolve();
  if (loadedImageCache.has(asset.id)) return Promise.resolve();

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      loadedImageCache.set(asset.id, image);
      loadedImageCache.set(asset.image, image);
      failedImageIds.delete(asset.id);
      logCosmeticsInfo("image-preload-success", {
        id: asset.id,
        kind: asset.kind,
        image: asset.image,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      resolve();
    };
    image.onerror = () => {
      failedImageIds.add(asset.id);
      logCosmeticsError("image-preload-failed", {
        id: asset.id,
        kind: asset.kind,
        name: asset.name,
        image: asset.image,
      });
      resolve();
    };
    image.src = asset.image;
  });
}

export async function loadCosmeticAssets(): Promise<CosmeticAssetDefinition[]> {
  if (manifestLoaded) return assetDefinitions;

  manifestLoaded = true;
  try {
    const response = await fetch(MANIFEST_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`manifest status ${response.status}`);
    }

    const manifest = await response.json() as CosmeticManifest;
    const seenIds = new Set<string>();
    const assets = [
      ...normalizeEntries(manifest.characters, "character", seenIds),
      ...normalizeEntries(manifest.backgrounds, "background", seenIds),
      ...normalizeEntries(manifest.items, "item", seenIds),
    ];
    assetDefinitions = assets;
    await Promise.all(assets.map((asset) => preloadImage(asset)));
    const loadedImages = assets.filter((asset) => loadedImageCache.has(asset.id)).length;
    const failedImages = assets.filter((asset) => failedImageIds.has(asset.id)).length;
    logCosmeticsInfo("manifest-loaded", {
      count: assets.length,
      characters: assets.filter((asset) => asset.kind === "character").length,
      backgrounds: assets.filter((asset) => asset.kind === "background").length,
      items: assets.filter((asset) => asset.kind === "item").length,
      loadedImages,
      failedImages,
    });
  } catch (error) {
    assetDefinitions = [];
    logCosmeticsError("manifest-load-failed-fallback-builtins", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  return assetDefinitions;
}

export function getLoadedCosmeticAssets(): CosmeticAssetDefinition[] {
  return assetDefinitions;
}

export function getCosmeticAssetById(id: string | null | undefined): CosmeticAssetDefinition | null {
  if (!id) return null;
  return assetDefinitions.find((asset) => asset.id === id) ?? null;
}

export function getLoadedCosmeticImage(id: string | null | undefined): HTMLImageElement | null {
  if (!id) return null;
  return loadedImageCache.get(id) ?? null;
}

export function isCosmeticAssetImageAvailable(id: string | null | undefined): boolean {
  if (!id) return false;
  return loadedImageCache.has(id) && !failedImageIds.has(id);
}
