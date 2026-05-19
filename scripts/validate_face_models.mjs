import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const modelsDir = path.join(repoRoot, "public", "models");

const REQUIRED_MODELS = [
  {
    modelName: "tiny_face_detector_model",
    manifestFile: "tiny_face_detector_model-weights_manifest.json",
    shardFile: "tiny_face_detector_model-shard1",
    minimumShardBytes: 100_000,
  },
  {
    modelName: "face_expression_model",
    manifestFile: "face_expression_model-weights_manifest.json",
    shardFile: "face_expression_model-shard1",
    minimumShardBytes: 200_000,
  },
];

const FORBIDDEN_PREFIXES = [
  "<!DOCTYPE",
  "<html",
  "version https://git-lfs.github.com/spec/v1",
];

const DTYPE_SIZES = {
  bool: 1,
  float32: 4,
  int32: 4,
  uint8: 1,
};

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
  const sample = buffer.subarray(0, Math.min(buffer.length, 256));
  let printable = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) {
      printable += 1;
    }
  }
  return sample.length > 0 && printable / sample.length > 0.9;
}

function getWeightByteLength(manifest) {
  let total = 0;
  for (const group of manifest) {
    for (const weight of group.weights ?? []) {
      const dtype = weight.quantization?.dtype ?? weight.dtype;
      const valueSize = DTYPE_SIZES[dtype];
      if (!valueSize) {
        throw new Error(`Unsupported dtype in manifest: ${dtype}`);
      }

      const count = (weight.shape ?? []).reduce((acc, dim) => acc * dim, 1);
      total += count * valueSize;
    }
  }
  return total;
}

async function readRequiredFile(fileName) {
  const filePath = path.join(modelsDir, fileName);
  await access(filePath);
  const [stats, buffer] = await Promise.all([stat(filePath), readFile(filePath)]);

  return {
    fileName,
    filePath,
    stats,
    buffer,
  };
}

function printFileReport(label, file) {
  console.log(`${label}: ${file.fileName}`);
  console.log(`  size: ${file.stats.size}`);
  console.log(`  sha256: ${sha256(file.buffer)}`);
  console.log(`  first16: ${first16Hex(file.buffer)}`);
}

async function validateModel(model) {
  const manifest = await readRequiredFile(model.manifestFile);
  const shard = await readRequiredFile(model.shardFile);

  printFileReport("manifest", manifest);
  printFileReport("shard", shard);

  if (hasForbiddenPrefix(manifest.buffer)) {
    throw new Error(`${manifest.fileName} looks like HTML or a Git LFS pointer`);
  }
  if (hasForbiddenPrefix(shard.buffer)) {
    throw new Error(`${shard.fileName} looks like HTML or a Git LFS pointer`);
  }

  let parsedManifest;
  try {
    parsedManifest = JSON.parse(manifest.buffer.toString("utf8"));
  } catch (error) {
    throw new Error(`${manifest.fileName} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Array.isArray(parsedManifest) || parsedManifest.length === 0) {
    throw new Error(`${manifest.fileName} must be a non-empty manifest array`);
  }

  const manifestPaths = parsedManifest.flatMap((group) => group.paths ?? []);
  if (!manifestPaths.includes(model.shardFile)) {
    throw new Error(`${manifest.fileName} does not reference expected shard ${model.shardFile}`);
  }

  const expectedShardBytes = getWeightByteLength(parsedManifest);
  console.log(`  expected shard bytes from manifest: ${expectedShardBytes}`);

  if (shard.stats.size !== expectedShardBytes) {
    throw new Error(
      `${shard.fileName} has ${shard.stats.size} bytes, but manifest expects ${expectedShardBytes}`,
    );
  }

  if (shard.stats.size < model.minimumShardBytes) {
    throw new Error(
      `${shard.fileName} is suspiciously small (${shard.stats.size} bytes)`,
    );
  }

  if (looksTextLike(shard.buffer)) {
    throw new Error(`${shard.fileName} looks text-like instead of binary`);
  }
}

async function main() {
  console.log(`Validating face-api.js model files in ${modelsDir}`);
  for (const model of REQUIRED_MODELS) {
    console.log(`\n[${model.modelName}]`);
    await validateModel(model);
  }
  console.log("\nModel validation passed.");
}

main().catch((error) => {
  console.error("\nModel validation failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
