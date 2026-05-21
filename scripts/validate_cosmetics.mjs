import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "public", "cosmetics", "manifest.json");
const validRarities = new Set(["common", "rare", "epic", "legendary"]);
const sections = ["characters", "backgrounds", "items"];
const metadataOnly = process.argv.includes("--metadata-only");
const strict = process.argv.includes("--strict") || !metadataOnly;

let errorCount = 0;
let todoCount = 0;

function reportError(message) {
  errorCount += 1;
  console.error(`Cosmetic validation failed: ${message}`);
}

function failNow(message) {
  reportError(message);
  process.exit(1);
}

function todo(message) {
  todoCount += 1;
  console.log(`TODO: ${message}`);
}

function normalizeImagePath(image) {
  return image.replace(/^\.?\//, "");
}

function resolvePublicFile(image) {
  const normalized = normalizeImagePath(image);
  return path.join(root, "public", normalized);
}

function checkPngSignature(filePath, id, image) {
  const firstBytes = fs.readFileSync(filePath).subarray(0, 8);
  const pngSignature = "89504e470d0a1a0a";
  if (firstBytes.toString("hex") !== pngSignature) {
    reportError(`${id} is not a valid PNG signature: ${image}`);
  }
}

function checkEntry(entry, section, ids) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    reportError(`${section} contains a non-object entry`);
    return;
  }

  const { id, name, rarity, image } = entry;
  if (typeof id !== "string" || !id.trim()) {
    reportError(`${section} entry is missing id`);
    return;
  }
  if (typeof name !== "string" || !name.trim()) reportError(`${id} is missing name`);
  if (ids.has(id)) reportError(`duplicate cosmetic id: ${id}`);
  ids.add(id);

  if (typeof rarity !== "string" || !validRarities.has(rarity)) {
    reportError(`${id} has invalid rarity: ${rarity}`);
  }

  if (typeof image !== "string" || !image.endsWith(".png")) {
    reportError(`${id} image must be a .png path`);
    return;
  }

  if (!image.startsWith("/cosmetics/") && !image.startsWith("./cosmetics/") && !image.startsWith("cosmetics/")) {
    reportError(`${id} image must stay under /cosmetics/: ${image}`);
    return;
  }

  const filePath = resolvePublicFile(image);
  const cosmeticRoot = path.join(root, "public", "cosmetics");
  const relativeToCosmetics = path.relative(cosmeticRoot, filePath);
  if (relativeToCosmetics.startsWith("..") || path.isAbsolute(relativeToCosmetics)) {
    reportError(`${id} resolves outside public/cosmetics`);
    return;
  }

  if (!fs.existsSync(filePath)) {
    if (strict) {
      reportError(`${id} references missing file: ${image}`);
    } else {
      todo(`${section}: ${id} needs ${image}`);
    }
    return;
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    reportError(`${id} image is not a file: ${image}`);
    return;
  }
  if (stat.size <= 0) {
    reportError(`${id} image is empty: ${image}`);
    return;
  }

  checkPngSignature(filePath, id, image);
  console.log(`${section}: ${id} (${rarity}) ${stat.size} bytes`);
}

if (!fs.existsSync(manifestPath)) {
  failNow("public/cosmetics/manifest.json does not exist");
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  failNow(`manifest JSON parse error: ${error instanceof Error ? error.message : String(error)}`);
}

if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
  failNow("manifest root must be an object");
}

const ids = new Set();
for (const section of sections) {
  const value = manifest[section] ?? [];
  if (!Array.isArray(value)) {
    reportError(`${section} must be an array`);
    continue;
  }
  for (const entry of value) {
    checkEntry(entry, section, ids);
  }
}

if (errorCount > 0) {
  console.error(`Cosmetic validation failed with ${errorCount} error(s).`);
  process.exit(1);
}

const modeLabel = strict ? "strict" : "metadata-only";
console.log(`Cosmetic validation passed (${modeLabel}). ${ids.size} entries checked, ${todoCount} missing PNG TODO(s).`);
