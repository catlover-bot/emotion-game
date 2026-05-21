import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "public", "cosmetics", "manifest.json");
const downloadsRoot = path.join(os.homedir(), "Downloads", "emotion_game_cosmetics");
const sections = ["characters", "backgrounds", "items"];

function readManifest() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error("public/cosmetics/manifest.json does not exist");
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function normalizeImagePath(image) {
  return String(image).replace(/^\.?\//, "");
}

function fileNameFromImage(image) {
  return path.basename(normalizeImagePath(image));
}

const manifest = readManifest();
let copiedCount = 0;
let missingCount = 0;

for (const section of sections) {
  const entries = Array.isArray(manifest[section]) ? manifest[section] : [];
  const sourceDir = path.join(downloadsRoot, section);
  const destinationDir = path.join(root, "public", "cosmetics", section);
  fs.mkdirSync(destinationDir, { recursive: true });

  console.log(`\n${section}`);
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || typeof entry.image !== "string") continue;
    const fileName = fileNameFromImage(entry.image);
    const sourcePath = path.join(sourceDir, fileName);
    const destinationPath = path.join(destinationDir, fileName);

    if (!fs.existsSync(sourcePath)) {
      missingCount += 1;
      console.log(`  missing source: ${sourcePath}`);
      continue;
    }

    fs.copyFileSync(sourcePath, destinationPath);
    copiedCount += 1;
    console.log(`  copied: ${sourcePath} -> ${destinationPath}`);
  }
}

console.log(`\nCosmetic import finished. copied=${copiedCount}, missing=${missingCount}`);
