import { cp, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const generatedRoot = path.resolve("src/client/assets/generated");
const manifestPath = path.join(generatedRoot, "manifest.json");
const dropRoot = path.resolve("asset-drop");
const processedRoot = path.join(dropRoot, "_imported");
const similarRoot = path.join(dropRoot, "_similar");
const imagePattern = /\.(png|jpg|jpeg|webp)$/i;
const similarityThreshold = 6;

const manifestTemplate = {
  schemaVersion: 2,
  tiles: {},
  objects: {},
  players: {},
  bridges: {},
  tileArchive: {},
  objectArchive: {},
  playerArchive: {},
  bridgeArchive: {}
};

const specs = {
  tiles: {
    grass: { width: 32, height: 32 },
    dirt: { width: 32, height: 32 },
    stone: { width: 32, height: 32 },
    water: { width: 32, height: 32 },
    forest: { width: 32, height: 32 }
  },
  objects: {
    house: { width: 96, height: 96 },
    pub: { width: 112, height: 112 },
    inn: { width: 112, height: 112 },
    barn: { width: 112, height: 112 },
    stable: { width: 112, height: 112 },
    blacksmith: { width: 112, height: 112 },
    windmill: { width: 96, height: 128 },
    chapel: { width: 112, height: 112 },
    market: { width: 96, height: 88 },
    manor: { width: 120, height: 120 },
    townhall: { width: 120, height: 120 },
    tree: { width: 72, height: 80 },
    stone: { width: 40, height: 40 },
    crate: { width: 32, height: 32 },
    well: { width: 56, height: 56 },
    ruins: { width: 56, height: 56 },
    sign: { width: 28, height: 32 },
    chest: { width: 32, height: 32 },
    horse: { width: 44, height: 40 },
    sheep: { width: 24, height: 22 },
    dog: { width: 20, height: 18 },
    cat: { width: 18, height: 16 },
    sparkmouse: { width: 24, height: 22 },
    "grass-tuft": { width: 24, height: 24 }
  },
  players: {
    "local-player": { width: 16, height: 20 },
    "remote-player": { width: 16, height: 20 }
  },
  bridges: {
    "bridge-v": { width: 32, height: 32 },
    "bridge-h": { width: 32, height: 32 },
    "bridge-cross": { width: 32, height: 32 },
    "bridge-sw": { width: 32, height: 32 },
    "bridge-se": { width: 32, height: 32 },
    "bridge-nw": { width: 32, height: 32 },
    "bridge-ne": { width: 32, height: 32 },
    "bridge-t-east": { width: 32, height: 32 },
    "bridge-t-west": { width: 32, height: 32 },
    "bridge-t-north": { width: 32, height: 32 },
    "bridge-t-south": { width: 32, height: 32 }
  }
};

function archiveKeyFor(kind) {
  switch (kind) {
    case "tiles":
      return "tileArchive";
    case "objects":
      return "objectArchive";
    case "players":
      return "playerArchive";
    case "bridges":
      return "bridgeArchive";
    default:
      throw new Error(`Unsupported kind ${kind}`);
  }
}

function runtimeKeyFor(kind) {
  switch (kind) {
    case "tiles":
      return "tiles";
    case "objects":
      return "objects";
    case "players":
      return "players";
    case "bridges":
      return "bridges";
    default:
      throw new Error(`Unsupported kind ${kind}`);
  }
}

function ensureArray(record, key) {
  if (!Array.isArray(record[key])) {
    record[key] = [];
  }
  return record[key];
}

function nextVariantPath(kind, slug, existingPaths) {
  const nextIndex = existingPaths.length + 1;
  const padded = String(nextIndex).padStart(3, "0");
  return `${kind}/${slug}/${slug}-v${padded}.png`;
}

async function readManifest() {
  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
    return {
      ...manifestTemplate,
      ...parsed
    };
  } catch {
    return structuredClone(manifestTemplate);
  }
}

async function ensureBaseDirs() {
  await mkdir(generatedRoot, { recursive: true });
  await mkdir(dropRoot, { recursive: true });
  for (const kind of Object.keys(specs)) {
    await mkdir(path.join(dropRoot, kind), { recursive: true });
  }
}

async function listFiles(dir) {
  try {
    const entries = await (await import("node:fs/promises")).readdir(dir, { withFileTypes: true });
    return entries;
  } catch {
    return [];
  }
}

async function computeDHash(file) {
  const { data } = await sharp(file)
    .resize(9, 8, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = "";
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      bits += left > right ? "1" : "0";
    }
  }

  return bits;
}

function hammingDistance(a, b) {
  let distance = 0;
  const size = Math.min(a.length, b.length);
  for (let index = 0; index < size; index += 1) {
    if (a[index] !== b[index]) {
      distance += 1;
    }
  }
  return distance + Math.abs(a.length - b.length);
}

async function pixelateInto(sourceFile, width, height, outFile) {
  const downscaled = await sharp(sourceFile)
    .resize(width, height, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();

  await sharp(downscaled)
    .resize(width * 4, height * 4, { kernel: sharp.kernel.nearest })
    .png({ palette: true, compressionLevel: 9 })
    .toFile(outFile);
}

async function moveIntoBucket(sourceFile, bucketRoot, kind, slug) {
  const targetDir = path.join(bucketRoot, kind, slug);
  await mkdir(targetDir, { recursive: true });
  const targetFile = path.join(targetDir, path.basename(sourceFile));
  try {
    await rename(sourceFile, targetFile);
  } catch {
    await cp(sourceFile, targetFile);
  }
}

async function importForKind(manifest, kind) {
  const archiveKey = archiveKeyFor(kind);
  const runtimeKey = runtimeKeyFor(kind);
  const kindSpecs = specs[kind];
  const slugs = Object.keys(kindSpecs);
  const summary = [];

  for (const slug of slugs) {
    const sourceDir = path.join(dropRoot, kind, slug);
    const entries = await listFiles(sourceDir);
    const files = entries
      .filter((entry) => entry.isFile() && imagePattern.test(entry.name))
      .map((entry) => path.join(sourceDir, entry.name));

    if (files.length === 0) {
      continue;
    }

    const archive = ensureArray(manifest[archiveKey], slug);
    const existingHashes = [];
    for (const relative of archive) {
      const full = path.join(generatedRoot, relative);
      try {
        existingHashes.push(await computeDHash(full));
      } catch {
        // Ignore broken historical entries.
      }
    }

    let importedCount = 0;
    let similarCount = 0;
    for (const file of files) {
      const incomingHash = await computeDHash(file);
      const tooSimilar = existingHashes.some((existingHash) => hammingDistance(incomingHash, existingHash) <= similarityThreshold);
      if (tooSimilar) {
        await moveIntoBucket(file, similarRoot, kind, slug);
        similarCount += 1;
        continue;
      }

      const relative = nextVariantPath(kind, slug, archive);
      const outFile = path.join(generatedRoot, relative);
      await mkdir(path.dirname(outFile), { recursive: true });
      const spec = kindSpecs[slug];
      await pixelateInto(file, spec.width, spec.height, outFile);
      archive.push(relative);
      manifest[runtimeKey][slug] = kind === "tiles" ? [...archive] : archive[archive.length - 1];
      existingHashes.push(await computeDHash(outFile));
      await moveIntoBucket(file, processedRoot, kind, slug);
      importedCount += 1;
    }

    if (importedCount > 0 || similarCount > 0) {
      summary.push({ slug, importedCount, similarCount });
    }
  }

  return summary;
}

async function main() {
  await ensureBaseDirs();
  const manifest = await readManifest();
  const summaries = [];

  for (const kind of Object.keys(specs)) {
    summaries.push(...(await importForKind(manifest, kind)).map((entry) => ({ kind, ...entry })));
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  if (summaries.length === 0) {
    console.log("No local assets found in asset-drop.");
    return;
  }

  for (const entry of summaries) {
    console.log(
      `local import ${entry.kind}/${entry.slug}: imported=${entry.importedCount} similar_skipped=${entry.similarCount}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
