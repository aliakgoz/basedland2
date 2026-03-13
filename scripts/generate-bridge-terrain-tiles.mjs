import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required to generate terrain assets.");
}

const client = new OpenAI({ apiKey });
const outRoot = path.resolve("src/client/assets/generated");
const manifestPath = path.join(outRoot, "manifest.json");
const imageModel = "gpt-image-1-mini";

function parseArgs(argv) {
  const options = {
    onlyTiles: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--only-tiles" && argv[index + 1]) {
      options.onlyTiles = new Set(
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

const bridgeEntries = [
  ["bridge-v", "Top-down retro pixel-art arched wooden bridge tile, transparent background, straight vertical segment, raised side rails, readable at 8x8, single centered tile."],
  ["bridge-h", "Top-down retro pixel-art arched wooden bridge tile, transparent background, straight horizontal segment, raised side rails, readable at 8x8, single centered tile."],
  ["bridge-cross", "Top-down retro pixel-art arched wooden bridge tile, transparent background, four-way crossing, raised side rails, readable at 8x8, single centered tile."],
  ["bridge-sw", "Top-down retro pixel-art arched wooden bridge tile, transparent background, west-to-south corner, raised side rails, readable at 8x8, single centered tile."],
  ["bridge-se", "Top-down retro pixel-art arched wooden bridge tile, transparent background, east-to-south corner, raised side rails, readable at 8x8, single centered tile."],
  ["bridge-nw", "Top-down retro pixel-art arched wooden bridge tile, transparent background, west-to-north corner, raised side rails, readable at 8x8, single centered tile."],
  ["bridge-ne", "Top-down retro pixel-art arched wooden bridge tile, transparent background, east-to-north corner, raised side rails, readable at 8x8, single centered tile."],
  ["bridge-t-east", "Top-down retro pixel-art arched wooden bridge tile, transparent background, T junction opening east, raised side rails, readable at 8x8, single centered tile."],
  ["bridge-t-west", "Top-down retro pixel-art arched wooden bridge tile, transparent background, T junction opening west, raised side rails, readable at 8x8, single centered tile."],
  ["bridge-t-north", "Top-down retro pixel-art arched wooden bridge tile, transparent background, T junction opening north, raised side rails, readable at 8x8, single centered tile."],
  ["bridge-t-south", "Top-down retro pixel-art arched wooden bridge tile, transparent background, T junction opening south, raised side rails, readable at 8x8, single centered tile."]
];

const roadEntries = [
  ["wood-deck", "Top-down retro pixel-art wooden bridge deck tile, transparent background, centered 8x8 sprite, planks and neat side edging, readable at tiny scale."],
  ["wood-arch", "Top-down retro pixel-art arched wooden bridge deck tile, transparent background, centered 8x8 sprite, visible curved rail silhouette and planks, readable at tiny scale."]
];

const terrainEntries = [
  {
    slug: "hill",
    prompt:
      "Top-down seamless retro pixel-art grassy hill terrain texture for a browser RPG, no props, no borders, readable at tiny scale, soft elevated ridges, mossy earth, natural looping pattern.",
    sourceSize: 8,
    runtimeSize: 16
  },
  {
    slug: "stone",
    prompt:
      "Top-down seamless retro pixel-art mountain and rocky highland terrain texture for a browser RPG, no props, no borders, readable at tiny scale, broken rock clusters and shaded height changes, natural looping pattern.",
    sourceSize: 8,
    runtimeSize: 16
  },
  {
    slug: "barley-field",
    prompt:
      "Seamless retro pixel-art farm tile for a browser RPG, isometric-inspired tiny barley stalk rows, visible neat row rhythm, warm straw-green crop heads, no borders, no props outside the tile, readable at 4x4 source scale.",
    sourceSize: 4,
    runtimeSize: 16
  },
  {
    slug: "wheat-field",
    prompt:
      "Seamless retro pixel-art farm tile for a browser RPG, isometric-inspired tiny wheat stalk rows, visible golden seed heads and narrow furrows, no borders, no props outside the tile, readable at 4x4 source scale.",
    sourceSize: 4,
    runtimeSize: 16
  },
  {
    slug: "orchard",
    prompt:
      "Seamless retro pixel-art orchard ground tile for a browser RPG, isometric-inspired tiny fruit saplings with little planting squares and soil breaks, readable at 4x4 source scale, no borders.",
    sourceSize: 4,
    runtimeSize: 16
  },
  {
    slug: "vineyard",
    prompt:
      "Seamless retro pixel-art vineyard tile for a browser RPG, isometric-inspired grape rows with tiny wooden trellis posts and clustered vines, readable at 4x4 source scale, no borders.",
    sourceSize: 4,
    runtimeSize: 16
  },
  {
    slug: "garden",
    prompt:
      "Seamless retro pixel-art vegetable garden tile for a browser RPG, isometric-inspired planted beds with tiny stems, leaf clusters and narrow plank dividers, readable at 4x4 source scale, no borders.",
    sourceSize: 4,
    runtimeSize: 16
  },
  {
    slug: "pumpkin-patch",
    prompt:
      "Seamless retro pixel-art pumpkin patch tile for a browser RPG, isometric-inspired round pumpkin mounds with curling vines and bed rows, readable at 4x4 source scale, no borders.",
    sourceSize: 4,
    runtimeSize: 16
  },
  {
    slug: "cabbage-patch",
    prompt:
      "Seamless retro pixel-art cabbage patch tile for a browser RPG, isometric-inspired chunky leaf heads in tidy rows, readable at 4x4 source scale, no borders.",
    sourceSize: 4,
    runtimeSize: 16
  },
  {
    slug: "berry-garden",
    prompt:
      "Seamless retro pixel-art berry garden tile for a browser RPG, isometric-inspired berry shrubs with tiny fruit dots, planting rows and light supports, readable at 4x4 source scale, no borders.",
    sourceSize: 4,
    runtimeSize: 16
  },
  {
    slug: "herb-garden",
    prompt:
      "Seamless retro pixel-art herb garden tile for a browser RPG, isometric-inspired fragrant herb beds with tiny stems, leaf tufts and path slits, readable at 4x4 source scale, no borders.",
    sourceSize: 4,
    runtimeSize: 16
  },
  {
    slug: "fallow-field",
    prompt:
      "Seamless retro pixel-art fallow field tile for a browser RPG, isometric-inspired furrows, broken stubble and resting earth rows, readable at 4x4 source scale, no borders.",
    sourceSize: 4,
    runtimeSize: 16
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

function nextVariantPath(kind, slug, existingPaths, suffix = "") {
  const nextIndex =
    existingPaths.reduce((max, item) => {
      const match = item.match(/-v(\d+)\.png$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
  const padded = String(nextIndex).padStart(3, "0");
  return `${kind}/${slug}/${slug}${suffix}-v${padded}.png`;
}

async function ensureDirs() {
  await mkdir(path.join(outRoot, "bridges"), { recursive: true });
  await mkdir(path.join(outRoot, "roads"), { recursive: true });
  await mkdir(path.join(outRoot, "tiles"), { recursive: true });
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

async function generateImage(prompt, transparent) {
  const result = await client.images.generate({
    model: imageModel,
    prompt,
    size: "1024x1024",
    background: transparent ? "transparent" : "opaque"
  });

  const imageBase64 = result.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error(`No image bytes returned for prompt: ${prompt}`);
  }
  return Buffer.from(imageBase64, "base64");
}

async function saveTransparentSprite(buffer, logicalSize, outFile) {
  await mkdir(path.dirname(outFile), { recursive: true });
  await sharp(buffer)
    .trim()
    .resize(logicalSize, logicalSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({ palette: true, compressionLevel: 9 })
    .toFile(outFile);
}

function makeSeamless(raw, size) {
  const pixel = (x, y) => (y * size + x) * 4;
  for (let x = 0; x < size; x += 1) {
    const top = pixel(x, 0);
    const bottom = pixel(x, size - 1);
    for (let channel = 0; channel < 4; channel += 1) {
      const blended = Math.round((raw[top + channel] + raw[bottom + channel]) / 2);
      raw[top + channel] = blended;
      raw[bottom + channel] = blended;
    }
  }

  for (let y = 0; y < size; y += 1) {
    const left = pixel(0, y);
    const right = pixel(size - 1, y);
    for (let channel = 0; channel < 4; channel += 1) {
      const blended = Math.round((raw[left + channel] + raw[right + channel]) / 2);
      raw[left + channel] = blended;
      raw[right + channel] = blended;
    }
  }
}

async function saveSeamlessTile(buffer, logicalSize, outFile) {
  await mkdir(path.dirname(outFile), { recursive: true });
  const { data, info } = await sharp(buffer)
    .resize(logicalSize, logicalSize, { fit: "cover", position: "centre" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const raw = Buffer.from(data);
  makeSeamless(raw, logicalSize);

  await sharp(raw, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels
    }
  })
    .png({ palette: true, compressionLevel: 9 })
    .toFile(outFile);
}

async function run() {
  await ensureDirs();
  const manifest = await loadManifest();

  for (const [slug, prompt] of roadEntries) {
    const archive = ensureArrayStore(manifest.roadArchive, slug);
    const bytes = await generateImage(`${prompt} Use a strict 8x8-inspired pixel cluster layout.`, true);
    const relative = nextVariantPath("roads", slug, archive);
    await saveTransparentSprite(bytes, 8, path.join(outRoot, relative));
    archive.push(relative);
    manifest.roads[slug] = relative;
    await saveManifest(manifest);
    console.log(`generated road ${slug} -> ${relative}`);
  }

  for (const [slug, prompt] of bridgeEntries) {
    const archive = ensureArrayStore(manifest.bridgeArchive, slug);
    const bytes = await generateImage(`${prompt} Use a strict 8x8-inspired pixel cluster layout.`, true);
    const relative = nextVariantPath("bridges", slug, archive);
    await saveTransparentSprite(bytes, 8, path.join(outRoot, relative));
    archive.push(relative);
    manifest.bridges[slug] = relative;
    await saveManifest(manifest);
    console.log(`generated bridge ${slug} -> ${relative}`);
  }

  for (const entry of terrainEntries) {
    if (options.onlyTiles && !options.onlyTiles.has(entry.slug)) {
      continue;
    }
    const { slug, prompt, sourceSize, runtimeSize } = entry;
    const archive = ensureArrayStore(manifest.tileArchive, slug);
    const bytes = await generateImage(`${prompt} Make the texture truly seamless on all four edges.`, false);
    const sourceSuffix = `-${sourceSize}x${sourceSize}`;
    const runtimeSuffix = `-${runtimeSize}x${runtimeSize}`;
    const relativeSource = nextVariantPath("tiles", slug, archive, sourceSuffix);
    const relativeRuntime = nextVariantPath("tiles", slug, archive, runtimeSuffix);
    await saveSeamlessTile(bytes, sourceSize, path.join(outRoot, relativeSource));
    await saveSeamlessTile(bytes, runtimeSize, path.join(outRoot, relativeRuntime));
    archive.push(relativeRuntime);
    manifest.tiles[slug] = [relativeRuntime];
    await saveManifest(manifest);
    console.log(`generated terrain ${slug} -> ${relativeSource}, ${relativeRuntime}`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
