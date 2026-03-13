import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required to generate landmark stamps.");
}

const client = new OpenAI({ apiKey });
const outRoot = path.resolve("src/client/assets/generated");
const manifestPath = path.join(outRoot, "manifest.json");
const imageModel = "gpt-image-1-mini";

function parseArgs(argv) {
  const options = {
    replace: false,
    only: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--replace") {
      options.replace = true;
    } else if (current === "--only" && argv[index + 1]) {
      options.only = new Set(
        argv[index + 1]
          .split(",")
          .map((slug) => slug.trim())
          .filter(Boolean)
      );
      index += 1;
    }
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));

const stampEntries = [
  {
    slug: "hill-stamp",
    width: 32 * 8,
    height: 32 * 8,
    variants: [
      "mostly top-down grassy hill in green and olive tones with shallow terraces",
      "mostly top-down brown hill with dry earth bands and sparse scrub",
      "mostly top-down gray-brown hill with rocky cap and muted shrubs"
    ],
    prompt:
      "Create one transparent-background retro RPG terrain stamp from a high top-down camera, not strongly isometric. This is a hill mass spanning about 8 by 8 world tiles, with broad readable terraces, subtle elevation, and lots of transparent space around the edges."
  },
  {
    slug: "mountain-stamp",
    width: 32 * 8,
    height: 32 * 8,
    variants: [
      "mostly top-down gray mountain with broad stone shelves and muted cliff edges",
      "mostly top-down brown mountain with dusty rock bands and weathered ridges",
      "mostly top-down slate mountain with cool gray ridges and scattered rubble"
    ],
    prompt:
      "Create one transparent-background retro RPG terrain stamp from a high top-down camera, not strongly isometric. This is a mountain mass spanning about 8 by 8 world tiles, with broad rocky tiers, subdued vertical faces, and lots of transparent space around the edges."
  },
  {
    slug: "garden-stamp",
    width: 32 * 16,
    height: 32 * 16,
    variants: [
      "barley field with small top-down crop rows and fine straw heads",
      "wheat field with compact top-down grain rows and narrow dirt paths",
      "orchard plot with small top-down tree dots and tidy spacing",
      "vineyard with top-down trellis lines, grape clusters, and modest row spacing",
      "vegetable garden with top-down beds, short stems, and thin plank borders",
      "pumpkin garden with small round pumpkins and restrained vine spread",
      "cabbage plot with compact leaf heads in organized rows",
      "berry garden with small shrub rows, berry dots, and light support frames",
      "herb garden with tiny herb beds and subtle bed separators",
      "fallow field with low ridges, short stubble, and soft soil breaks"
    ],
    prompt:
      "Create one transparent-background retro RPG mega garden stamp from a high top-down camera, not strongly isometric. It spans about 16 by 16 world tiles and must show organized agricultural structure with small proportional crops, readable bed layout, and transparent empty space around the overall silhouette."
  }
];

function createEmptyManifest() {
  return {
    schemaVersion: 2,
    tiles: {},
    objects: {},
    players: {},
    bridges: {},
    roads: {},
    tileArchive: {},
    objectArchive: {},
    playerArchive: {},
    bridgeArchive: {},
    roadArchive: {}
  };
}

function ensureArrayStore(record, key) {
  const existing = record[key];
  if (Array.isArray(existing)) {
    return existing;
  }
  record[key] = [];
  return record[key];
}

function nextVariantPath(kind, slug, existingPaths) {
  const nextIndex =
    existingPaths.reduce((max, item) => {
      const match = item.match(/-v(\d+)\.png$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
  const padded = String(nextIndex).padStart(3, "0");
  return `${kind}/${slug}/${slug}-v${padded}.png`;
}

async function loadManifest() {
  try {
    const existing = JSON.parse(await readFile(manifestPath, "utf8"));
    return {
      ...createEmptyManifest(),
      ...existing
    };
  } catch {
    return createEmptyManifest();
  }
}

async function saveManifest(manifest) {
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function generateImage(prompt) {
  const result = await client.images.generate({
    model: imageModel,
    prompt,
    size: "1024x1024",
    background: "transparent"
  });

  const imageBase64 = result.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error(`No image bytes returned for prompt: ${prompt}`);
  }
  return Buffer.from(imageBase64, "base64");
}

async function saveStamp(buffer, width, height, outFile) {
  await mkdir(path.dirname(outFile), { recursive: true });
  await sharp(buffer)
    .ensureAlpha()
    .resize(width, height, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({ palette: true, compressionLevel: 9 })
    .toFile(outFile);
}

async function run() {
  const manifest = await loadManifest();

  for (const entry of stampEntries) {
    if (options.only && !options.only.has(entry.slug)) {
      continue;
    }
    if (options.replace) {
      manifest.objectArchive[entry.slug] = [];
      delete manifest.objects[entry.slug];
    }
    const variants = entry.variants ?? [null];
    for (const variantText of variants) {
      const archive = ensureArrayStore(manifest.objectArchive, entry.slug);
      const detail = variantText ? ` Variant theme: ${variantText}.` : "";
      const prompt = `${entry.prompt}${detail} Keep the silhouette centered and leave transparent space around the stamp.`;
      const bytes = await generateImage(prompt);
      const relative = nextVariantPath("objects", entry.slug, archive);
      await saveStamp(bytes, entry.width, entry.height, path.join(outRoot, relative));
      archive.push(relative);
      manifest.objects[entry.slug] = relative;
      await saveManifest(manifest);
      console.log(`generated ${entry.slug} -> ${relative}`);
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
