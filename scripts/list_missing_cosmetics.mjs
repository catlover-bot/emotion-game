import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "public", "cosmetics", "manifest.json");
const sections = ["characters", "backgrounds", "items"];

function readManifest() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error("public/cosmetics/manifest.json does not exist");
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function resolvePublicFile(image) {
  const normalized = String(image).replace(/^\.?\//, "");
  return path.join(root, "public", normalized);
}

const manifest = readManifest();
let totalMissing = 0;

for (const section of sections) {
  const entries = Array.isArray(manifest[section]) ? manifest[section] : [];
  const missing = entries
    .filter((entry) => entry && typeof entry === "object" && typeof entry.image === "string")
    .filter((entry) => !fs.existsSync(resolvePublicFile(entry.image)));

  console.log(`\n${section}`);
  if (missing.length === 0) {
    console.log("  missing: none");
    continue;
  }

  totalMissing += missing.length;
  for (const entry of missing) {
    console.log(`  - public${entry.image.startsWith("/") ? entry.image : `/${entry.image.replace(/^\.?\//, "")}`}`);
  }
}

console.log(`\nMissing cosmetic PNG files: ${totalMissing}`);
