import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const mediaPipeDir = path.join(repoRoot, "public", "mediapipe");

const REQUIRED_ASSETS = [
  {
    fileName: "face_landmarker.task",
    minimumBytes: 3_000_000,
    shouldBeText: false,
  },
  {
    fileName: "vision_wasm_internal.js",
    minimumBytes: 100_000,
    shouldBeText: true,
  },
  {
    fileName: "vision_wasm_internal.wasm",
    minimumBytes: 5_000_000,
    shouldBeText: false,
  },
  {
    fileName: "vision_wasm_module_internal.js",
    minimumBytes: 100_000,
    shouldBeText: true,
  },
  {
    fileName: "vision_wasm_module_internal.wasm",
    minimumBytes: 5_000_000,
    shouldBeText: false,
  },
  {
    fileName: "vision_wasm_nosimd_internal.js",
    minimumBytes: 100_000,
    shouldBeText: true,
  },
  {
    fileName: "vision_wasm_nosimd_internal.wasm",
    minimumBytes: 5_000_000,
    shouldBeText: false,
  },
];

const FORBIDDEN_PREFIXES = [
  "<!DOCTYPE",
  "<html",
  "version https://git-lfs.github.com/spec/v1",
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function first16Hex(buffer) {
  return buffer.subarray(0, 16).toString("hex");
}

function prefixText(buffer) {
  return buffer.subarray(0, 128).toString("utf8").trimStart();
}

function hasForbiddenPrefix(buffer) {
  const prefix = prefixText(buffer);
  return FORBIDDEN_PREFIXES.some((value) => prefix.startsWith(value));
}

function looksTextLike(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 512));
  let printable = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) {
      printable += 1;
    }
  }
  return sample.length > 0 && printable / sample.length > 0.9;
}

async function readAsset(asset) {
  const filePath = path.join(mediaPipeDir, asset.fileName);
  await access(filePath);
  const [stats, buffer] = await Promise.all([stat(filePath), readFile(filePath)]);
  return { ...asset, filePath, stats, buffer };
}

function printReport(asset) {
  console.log(`${asset.fileName}`);
  console.log(`  size: ${asset.stats.size}`);
  console.log(`  sha256: ${sha256(asset.buffer)}`);
  console.log(`  first16: ${first16Hex(asset.buffer)}`);
}

async function validateAsset(definition) {
  const asset = await readAsset(definition);
  printReport(asset);

  if (asset.stats.size < asset.minimumBytes) {
    throw new Error(`${asset.fileName} is suspiciously small (${asset.stats.size} bytes)`);
  }

  if (hasForbiddenPrefix(asset.buffer)) {
    throw new Error(`${asset.fileName} looks like HTML or a Git LFS pointer`);
  }

  const textLike = looksTextLike(asset.buffer);
  if (asset.shouldBeText && !textLike) {
    throw new Error(`${asset.fileName} should be text-like JavaScript`);
  }
  if (!asset.shouldBeText && textLike) {
    throw new Error(`${asset.fileName} looks text-like instead of binary/model data`);
  }
}

async function main() {
  console.log(`Validating MediaPipe assets in ${mediaPipeDir}`);
  for (const asset of REQUIRED_ASSETS) {
    console.log("");
    await validateAsset(asset);
  }
  console.log("\nMediaPipe asset validation passed.");
}

main().catch((error) => {
  console.error("\nMediaPipe asset validation failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
