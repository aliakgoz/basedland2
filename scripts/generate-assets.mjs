import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required to generate art assets.");
}

const client = new OpenAI({ apiKey });
const outRoot = path.resolve("src/client/assets/generated");
const manifestPath = path.join(outRoot, "manifest.json");

function parseArgs(argv) {
  const options = {
    force: false,
    targetTileVariants: 6,
    targetObjectVariants: 1,
    targetPlayerVariants: 1,
    targetHouseVariants: 1
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--force") {
      options.force = true;
    } else if (current === "--tile-target" && argv[index + 1]) {
      options.targetTileVariants = Math.max(1, Number(argv[index + 1]) || options.targetTileVariants);
      index += 1;
    } else if (current === "--object-target" && argv[index + 1]) {
      options.targetObjectVariants = Math.max(1, Number(argv[index + 1]) || options.targetObjectVariants);
      index += 1;
    } else if (current === "--player-target" && argv[index + 1]) {
      options.targetPlayerVariants = Math.max(1, Number(argv[index + 1]) || options.targetPlayerVariants);
      index += 1;
    } else if (current === "--house-target" && argv[index + 1]) {
      options.targetHouseVariants = Math.max(1, Number(argv[index + 1]) || options.targetHouseVariants);
      index += 1;
    }
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));

/**
 * Manifest is append-only. Current runtime still reads the original keys
 * while archive arrays keep every generated version for future expansion.
 */
function createEmptyManifest() {
  return {
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
}

const tileEntries = [
  {
    slug: "grass",
    prompt:
      "Top-down seamless cozy pixel-art grass ground tile texture for a nostalgic MMO, no objects, no paths, no borders, rich tiny leaf and clover detail, readable at 32x32, square composition."
  },
  {
    slug: "dirt",
    prompt:
      "Top-down seamless cozy pixel-art dirt ground tile texture for a nostalgic MMO, no objects, no grass clumps, no borders, subtle pebbles and warm soil detail, readable at 32x32, square composition."
  },
  {
    slug: "stone",
    prompt:
      "Top-down seamless cozy pixel-art stone ground tile texture for a nostalgic MMO, no props, no borders, cracked rock pieces and small mineral detail, readable at 32x32, square composition."
  },
  {
    slug: "water",
    prompt:
      "Top-down seamless cozy pixel-art shallow water tile texture for a nostalgic MMO, no shores, no objects, no borders, soft ripples and reflected highlights, readable at 32x32, square composition."
  },
  {
    slug: "forest",
    prompt:
      "Top-down seamless cozy pixel-art forest floor tile texture for a nostalgic MMO, no trees, no borders, moss, fallen leaves and dark soil detail, readable at 32x32, square composition."
  }
];

const objectEntries = [
  {
    slug: "house",
    logicalWidth: 96,
    logicalHeight: 96,
    prompt:
      "Top-down cozy pixel-art village house sprite, isolated, transparent background, nostalgic MMO style. The house must read as a large prop with at least a 10x10 logical pixel body."
  },
  {
    slug: "pub",
    logicalWidth: 112,
    logicalHeight: 112,
    prompt: "Top-down cozy pixel-art village pub sprite, isolated, transparent background, nostalgic MMO style. Warm roof, welcoming sign, larger than a normal house."
  },
  {
    slug: "inn",
    logicalWidth: 112,
    logicalHeight: 112,
    prompt: "Top-down cozy pixel-art village inn sprite, isolated, transparent background, nostalgic MMO style. Large lodging building with readable roof and entrance."
  },
  {
    slug: "barn",
    logicalWidth: 112,
    logicalHeight: 112,
    prompt: "Top-down cozy pixel-art rustic barn sprite, isolated, transparent background, nostalgic MMO style. Broad red barn roof, agricultural feeling."
  },
  {
    slug: "stable",
    logicalWidth: 112,
    logicalHeight: 112,
    prompt: "Top-down cozy pixel-art horse stable sprite, isolated, transparent background, nostalgic MMO style. Long low roof and open stall feel."
  },
  {
    slug: "blacksmith",
    logicalWidth: 112,
    logicalHeight: 112,
    prompt: "Top-down cozy pixel-art blacksmith workshop sprite, isolated, transparent background, nostalgic MMO style. Forge chimney and sturdy stone details."
  },
  {
    slug: "windmill",
    logicalWidth: 96,
    logicalHeight: 128,
    prompt: "Top-down cozy pixel-art windmill sprite, isolated, transparent background, nostalgic MMO style. Visible mill body and sails from above."
  },
  {
    slug: "chapel",
    logicalWidth: 112,
    logicalHeight: 112,
    prompt: "Top-down cozy pixel-art small village chapel sprite, isolated, transparent background, nostalgic MMO style. Quiet stone roof and sacred feeling."
  },
  {
    slug: "market",
    logicalWidth: 96,
    logicalHeight: 88,
    prompt: "Top-down cozy pixel-art market stall cluster sprite, isolated, transparent background, nostalgic MMO style. Cloth canopy and goods visible from above."
  },
  {
    slug: "manor",
    logicalWidth: 120,
    logicalHeight: 120,
    prompt: "Top-down cozy pixel-art manor house sprite, isolated, transparent background, nostalgic MMO style. Larger and richer than village houses."
  },
  {
    slug: "townhall",
    logicalWidth: 120,
    logicalHeight: 120,
    prompt: "Top-down cozy pixel-art village town hall sprite, isolated, transparent background, nostalgic MMO style. Official building with symmetrical roof."
  },
  {
    slug: "tree",
    logicalWidth: 72,
    logicalHeight: 80,
    prompt: "Top-down cozy pixel-art oak tree sprite, isolated, transparent background, nostalgic MMO style, clearly larger than a human."
  },
  {
    slug: "stone",
    logicalWidth: 40,
    logicalHeight: 40,
    prompt: "Top-down cozy pixel-art stone boulder sprite, isolated, transparent background, nostalgic MMO style."
  },
  {
    slug: "crate",
    logicalWidth: 32,
    logicalHeight: 32,
    prompt: "Top-down cozy pixel-art wooden crate sprite, isolated, transparent background, nostalgic MMO style."
  },
  {
    slug: "well",
    logicalWidth: 56,
    logicalHeight: 56,
    prompt: "Top-down cozy pixel-art village well sprite, isolated, transparent background, nostalgic MMO style."
  },
  {
    slug: "ruins",
    logicalWidth: 56,
    logicalHeight: 56,
    prompt: "Top-down cozy pixel-art ancient ruins sprite, isolated, transparent background, nostalgic MMO style."
  },
  {
    slug: "sign",
    logicalWidth: 28,
    logicalHeight: 32,
    prompt: "Top-down cozy pixel-art wooden sign sprite, isolated, transparent background, nostalgic MMO style."
  },
  {
    slug: "chest",
    logicalWidth: 32,
    logicalHeight: 32,
    prompt: "Top-down cozy pixel-art treasure chest sprite, isolated, transparent background, nostalgic MMO style."
  },
  {
    slug: "horse",
    logicalWidth: 44,
    logicalHeight: 40,
    prompt: "Top-down cozy pixel-art horse sprite, isolated, transparent background, nostalgic MMO style. Horse should read about twice the mass of a sheep or dog."
  },
  {
    slug: "sheep",
    logicalWidth: 24,
    logicalHeight: 22,
    prompt: "Top-down cozy pixel-art sheep sprite, isolated, transparent background, nostalgic MMO style. Tiny creature scale."
  },
  {
    slug: "dog",
    logicalWidth: 20,
    logicalHeight: 18,
    prompt: "Top-down cozy pixel-art dog sprite, isolated, transparent background, nostalgic MMO style. Very small creature scale."
  },
  {
    slug: "cat",
    logicalWidth: 18,
    logicalHeight: 16,
    prompt: "Top-down cozy pixel-art cat sprite, isolated, transparent background, nostalgic MMO style. Very small creature scale."
  },
  {
    slug: "sparkmouse",
    logicalWidth: 24,
    logicalHeight: 22,
    prompt: "Top-down cozy pixel-art tiny yellow electric mouse creature sprite, isolated, transparent background, nostalgic MMO style. Bright ears, red cheeks, lightning tail, very small animal scale."
  },
  {
    slug: "grass-tuft",
    logicalWidth: 24,
    logicalHeight: 24,
    prompt: "Top-down cozy pixel-art wild grass tuft sprite, isolated, transparent background, nostalgic MMO style."
  }
];

const playerEntries = [
  ["local-player", "Top-down cozy pixel-art adventurer player sprite, isolated, transparent background, blue tunic, warm colors, readable at 16x20."],
  ["remote-player", "Top-down cozy pixel-art adventurer player sprite, isolated, transparent background, cream and violet outfit, readable at 16x20."]
];

const bridgeEntries = [
  ["bridge-v", "Top-down cozy pixel-art wooden bridge tile, isolated on transparent background, straight vertical orientation, detailed planks and side rails, retro MMO style, centered in a 32x32 tile."],
  ["bridge-h", "Top-down cozy pixel-art wooden bridge tile, isolated on transparent background, straight horizontal orientation, detailed planks and side rails, retro MMO style, centered in a 32x32 tile."],
  ["bridge-cross", "Top-down cozy pixel-art wooden bridge intersection tile, isolated on transparent background, cross junction, detailed planks and side rails, retro MMO style, centered in a 32x32 tile."],
  ["bridge-sw", "Top-down cozy pixel-art wooden bridge corner tile, isolated on transparent background, west-to-south turn, detailed planks and side rails, retro MMO style, centered in a 32x32 tile."],
  ["bridge-se", "Top-down cozy pixel-art wooden bridge corner tile, isolated on transparent background, east-to-south turn, detailed planks and side rails, retro MMO style, centered in a 32x32 tile."],
  ["bridge-nw", "Top-down cozy pixel-art wooden bridge corner tile, isolated on transparent background, west-to-north turn, detailed planks and side rails, retro MMO style, centered in a 32x32 tile."],
  ["bridge-ne", "Top-down cozy pixel-art wooden bridge corner tile, isolated on transparent background, east-to-north turn, detailed planks and side rails, retro MMO style, centered in a 32x32 tile."],
  ["bridge-t-east", "Top-down cozy pixel-art wooden bridge T junction tile, isolated on transparent background, vertical bridge connecting to east branch, detailed planks and rails, retro MMO style, centered in a 32x32 tile."],
  ["bridge-t-west", "Top-down cozy pixel-art wooden bridge T junction tile, isolated on transparent background, vertical bridge connecting to west branch, detailed planks and rails, retro MMO style, centered in a 32x32 tile."],
  ["bridge-t-north", "Top-down cozy pixel-art wooden bridge T junction tile, isolated on transparent background, horizontal bridge connecting to north branch, detailed planks and rails, retro MMO style, centered in a 32x32 tile."],
  ["bridge-t-south", "Top-down cozy pixel-art wooden bridge T junction tile, isolated on transparent background, horizontal bridge connecting to south branch, detailed planks and rails, retro MMO style, centered in a 32x32 tile."]
];

async function ensureDirs() {
  await mkdir(path.join(outRoot, "tiles"), { recursive: true });
  await mkdir(path.join(outRoot, "objects"), { recursive: true });
  await mkdir(path.join(outRoot, "players"), { recursive: true });
  await mkdir(path.join(outRoot, "bridges"), { recursive: true });
}

async function generateImage(prompt, transparent) {
  const result = await client.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5",
    prompt,
    size: "1024x1024",
    quality: "high",
    output_format: "png",
    background: transparent ? "transparent" : "opaque"
  });

  const imageBase64 = result.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error(`No image bytes returned for prompt: ${prompt}`);
  }
  return Buffer.from(imageBase64, "base64");
}

async function pixelate(buffer, logicalWidth, logicalHeight, outFile) {
  const downscaled = await sharp(buffer)
    .resize(logicalWidth, logicalHeight, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp(downscaled)
    .resize(logicalWidth * 4, logicalHeight * 4, { kernel: sharp.kernel.nearest })
    .png({ palette: true, compressionLevel: 9 })
    .toFile(outFile);
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
  const nextIndex = existingPaths.length + 1;
  const padded = String(nextIndex).padStart(3, "0");
  return `${kind}/${slug}/${slug}-v${padded}.png`;
}

async function migrateLegacyManifest(manifest) {
  for (const [slug, value] of Object.entries(manifest.objects ?? {})) {
    const archive = ensureArrayStore(manifest.objectArchive, slug);
    if (typeof value === "string" && !archive.includes(value)) {
      archive.push(value);
    }
  }

  for (const [slug, value] of Object.entries(manifest.players ?? {})) {
    const archive = ensureArrayStore(manifest.playerArchive, slug);
    if (typeof value === "string" && !archive.includes(value)) {
      archive.push(value);
    }
  }

  for (const [slug, value] of Object.entries(manifest.bridges ?? {})) {
    const archive = ensureArrayStore(manifest.bridgeArchive, slug);
    if (typeof value === "string" && !archive.includes(value)) {
      archive.push(value);
    }
  }

  for (const [slug, values] of Object.entries(manifest.tiles ?? {})) {
    const archive = ensureArrayStore(manifest.tileArchive, slug);
    if (Array.isArray(values)) {
      for (const value of values) {
        if (!archive.includes(value)) {
          archive.push(value);
        }
      }
    }
  }
}

async function run() {
  await ensureDirs();
  let manifest = createEmptyManifest();
  try {
    const existing = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest = {
      ...createEmptyManifest(),
      ...existing
    };
    await migrateLegacyManifest(manifest);
  } catch {
    manifest = createEmptyManifest();
  }

  for (const tile of tileEntries) {
    const archive = ensureArrayStore(manifest.tileArchive, tile.slug);
    manifest.tiles[tile.slug] = [...archive];
    const remaining = options.force ? options.targetTileVariants : Math.max(0, options.targetTileVariants - archive.length);

    if (remaining === 0) {
      console.log(`skipped tile ${tile.slug}, archive already has ${archive.length} variants`);
    }

    for (let variant = 0; variant < remaining; variant += 1) {
      const nextOrdinal = archive.length + 1;
      const prompt = `${tile.prompt} Variation ${nextOrdinal} of an expanding archive, visually distinct from previous variants while matching the same biome.`;
      const bytes = await generateImage(prompt, false);
      const relative = nextVariantPath("tiles", tile.slug, archive);
      await mkdir(path.join(outRoot, "tiles", tile.slug), { recursive: true });
      await pixelate(bytes, 32, 32, path.join(outRoot, relative));
      archive.push(relative);
      manifest.tiles[tile.slug] = [...archive];
      console.log(`generated tile ${tile.slug} variant ${nextOrdinal}`);
    }
  }

  for (const entry of objectEntries) {
    const archive = ensureArrayStore(manifest.objectArchive, entry.slug);
    const targetVariants = entry.slug === "house" ? options.targetHouseVariants : options.targetObjectVariants;
    const remaining = options.force ? targetVariants : Math.max(0, targetVariants - archive.length);

    if (remaining === 0) {
      console.log(`skipped object ${entry.slug}, archive already has ${archive.length} variants`);
    }

    for (let variant = 0; variant < remaining; variant += 1) {
      const nextOrdinal = archive.length + 1;
      const bytes = await generateImage(`${entry.prompt} Archive variant ${nextOrdinal}.`, true);
      const relative = nextVariantPath("objects", entry.slug, archive);
      await mkdir(path.join(outRoot, "objects", entry.slug), { recursive: true });
      await pixelate(bytes, entry.logicalWidth, entry.logicalHeight, path.join(outRoot, relative));
      archive.push(relative);
      console.log(`generated object ${entry.slug} variant ${nextOrdinal}`);
    }

    if (archive.length > 0) {
      manifest.objects[entry.slug] = archive[archive.length - 1];
    }
  }

  for (const [slug, prompt] of playerEntries) {
    const archive = ensureArrayStore(manifest.playerArchive, slug);
    const remaining = options.force ? options.targetPlayerVariants : Math.max(0, options.targetPlayerVariants - archive.length);

    if (remaining === 0) {
      console.log(`skipped player ${slug}, archive already has ${archive.length} variants`);
    }

    for (let variant = 0; variant < remaining; variant += 1) {
      const nextOrdinal = archive.length + 1;
      const bytes = await generateImage(`${prompt} Archive variant ${nextOrdinal}.`, true);
      const logicalHeight = slug.includes("player") ? 20 : 32;
      const logicalWidth = slug.includes("player") ? 16 : 32;
      const downscaled = await sharp(bytes)
        .resize(logicalWidth, logicalHeight, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

      const relative = nextVariantPath("players", slug, archive);
      await mkdir(path.join(outRoot, "players", slug), { recursive: true });
      await sharp(downscaled)
        .resize(logicalWidth * 4, logicalHeight * 4, { kernel: sharp.kernel.nearest })
        .png({ palette: true, compressionLevel: 9 })
        .toFile(path.join(outRoot, relative));
      archive.push(relative);
      console.log(`generated player ${slug} variant ${nextOrdinal}`);
    }

    if (archive.length > 0) {
      manifest.players[slug] = archive[archive.length - 1];
    }
  }

  for (const [slug, prompt] of bridgeEntries) {
    const archive = ensureArrayStore(manifest.bridgeArchive, slug);
    const remaining = options.force ? 1 : Math.max(0, 1 - archive.length);

    if (remaining === 0) {
      console.log(`skipped bridge ${slug}, archive already has ${archive.length} variants`);
    }

    for (let variant = 0; variant < remaining; variant += 1) {
      const nextOrdinal = archive.length + 1;
      const bytes = await generateImage(`${prompt} Archive variant ${nextOrdinal}.`, true);
      const relative = nextVariantPath("bridges", slug, archive);
      await mkdir(path.join(outRoot, "bridges", slug), { recursive: true });
      await pixelate(bytes, 32, 32, path.join(outRoot, relative));
      archive.push(relative);
      console.log(`generated bridge ${slug} variant ${nextOrdinal}`);
    }

    if (archive.length > 0) {
      manifest.bridges[slug] = archive[archive.length - 1];
    }
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(
    path.join(outRoot, "README.txt"),
    [
      "Generated with OpenAI gpt-image-1.5 via scripts/generate-assets.mjs.",
      "The archive is append-only by default.",
      "Rerunning the script will skip generation once the target counts are already satisfied.",
      "Use --tile-target, --object-target, or --player-target to grow the archive deliberately.",
      "Use --force to regenerate up to the requested target counts regardless of existing archive size."
    ].join("\n") + "\n",
    "utf8"
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
