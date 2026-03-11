import "dotenv/config";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
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
const imageModel = "gpt-image-1-mini";
const majorBuildingSlugs = new Set(["house", "pub", "inn", "barn", "stable", "blacksmith", "windmill", "chapel", "market", "manor", "townhall"]);
const houseVariantThemes = [
  "small lime-plaster cottage with red terracotta roof, flower boxes, stone stoop, and neat shutters",
  "timber-framed cottage with mossy roof, crooked chimney, warm lantern, and herb planters",
  "whitewashed village home with blue shutters, slate roof, tidy garden pots, and arched doorway",
  "golden plaster house with deep burgundy roof, side awning, stacked firewood, and bright windows",
  "stone cottage with steep roof, copper gutter accents, flower beds, and sturdy oak door",
  "cozy craftsman home with olive roof tiles, porch beams, hanging sign, and side barrels",
  "compact bakery-like house with cream walls, cinnamon roof, striped shade, and bread shelf near the door",
  "riverside cottage with pale stone walls, teal shutters, weathered roof, and stacked nets",
  "merchant house with broad roof overhang, decorative trim, window boxes, and crate stack",
  "garden cottage with lavender roof, pale plaster walls, trellis vines, and clay pots",
  "warm adobe village home with sunbaked tiles, dark beams, and a shaded doorway",
  "northern cottage with dark slate roof, pale timber walls, chimney smoke vent, and wood pile",
  "wealthier townhouse with polished trim, brighter windows, layered roof ridges, and banners",
  "farmhouse with tall roof cap, cream walls, seed sacks, and fence-side tools",
  "mason house with heavy stone base, red roof, carved lintel, and tidy front steps",
  "tailor house with colored canopy, elegant shutters, cloth rolls, and ornamental trim",
  "watcher cottage with tall narrow roof, bell eave, narrow windows, and stacked lantern crates",
  "seaside-style cottage with pale stucco, coral roof, rope basket props, and airy windows",
  "forest village home with green roof tiles, timber braces, mushroom baskets, and fern planters",
  "prosperous village house with layered orange roof, decorative crest, planter boxes, and richer facade"
];
const buildingVariantThemes = {
  pub: [
    "busy tavern with warm lanterns, barrel clusters, carved hanging sign, and rich red roof",
    "larger alehouse with weathered wood beams, side benches, casks, and smoky chimney",
    "festive roadside pub with flower boxes, gold signboard, stacked crates, and welcoming porch"
  ],
  inn: [
    "two-story inn with broad roof, dormer windows, luggage by the door, and lit entry",
    "coach inn with stable-side wing, banner sign, lamp posts, and polished timber facade",
    "traveler lodge with layered roof ridges, balcony rail, warm windows, and packed baggage"
  ],
  barn: [
    "large barn with red plank walls, hay bales, open loft vent, and wagon tools",
    "weathered grain barn with patched roof, feed sacks, side cart, and wide doors",
    "well-kept farm barn with fresh timber, neat hay stacks, barrels, and bright trim"
  ],
  stable: [
    "horse stable with open stall fronts, tack racks, hay piles, and hoof-worn entry",
    "long stable building with side awning, water trough, saddles, and timber posts",
    "busy riding stable with supply crates, groom tools, and broad shingled roof"
  ],
  blacksmith: [
    "blacksmith workshop with forge chimney, glowing vent, iron tools, and dark roof",
    "sturdy smithy with stone base, coal piles, anvil area, and soot-stained chimney",
    "artisan forge with copper details, hammer signs, stacked ingots, and rugged walls"
  ],
  windmill: [
    "tall windmill with strong stone base, crisp sails, grain sacks, and warm roof accents",
    "village mill with timber upper section, detailed sails, nearby flour barrels, and broad entry",
    "prosperous windmill with painted trim, layered roof cap, tidy grain crates, and pronounced sails"
  ],
  chapel: [
    "small chapel with slate roof, stone buttresses, stained windows, and quiet flower beds",
    "village shrine chapel with bell tower, pale stone walls, candles, and narrow garden path",
    "peaceful chapel with blue-gray roof, carved doorway, memorial stones, and tidy hedges"
  ],
  market: [
    "market hall with striped canopies, produce crates, hanging cloth, and busy stall details",
    "merchant pavilion with broad roof, colorful awnings, baskets, and bundled goods",
    "covered village market with fabric shades, stacked wares, barrels, and strong timber frame"
  ],
  manor: [
    "large manor with layered rooflines, rich trim, banners, stone steps, and ornate windows",
    "noble estate house with wide central gable, garden urns, and polished facade",
    "wealthy manor with symmetrical wings, dormer roofs, heraldic crest, and refined entrance"
  ],
  townhall: [
    "town hall with official crest, broad civic roof, notice boards, and front steps",
    "village hall with clock gable, banners, side benches, and formal symmetrical facade",
    "council hall with layered roof cap, bright windows, posted decrees, and ceremonial entry"
  ]
};

function parseArgs(argv) {
  const options = {
    force: false,
    targetTileVariants: 6,
    targetObjectVariants: 1,
    targetBuildingVariants: 1,
    targetPlayerVariants: 1,
    targetHouseVariants: 1,
    replaceObjectSlugs: new Set(),
    onlyObjectSlugs: null
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
    } else if (current === "--building-target" && argv[index + 1]) {
      options.targetBuildingVariants = Math.max(1, Number(argv[index + 1]) || options.targetBuildingVariants);
      index += 1;
    } else if (current === "--player-target" && argv[index + 1]) {
      options.targetPlayerVariants = Math.max(1, Number(argv[index + 1]) || options.targetPlayerVariants);
      index += 1;
    } else if (current === "--house-target" && argv[index + 1]) {
      options.targetHouseVariants = Math.max(1, Number(argv[index + 1]) || options.targetHouseVariants);
      index += 1;
    } else if (current === "--replace-objects" && argv[index + 1]) {
      options.replaceObjectSlugs = new Set(
        argv[index + 1]
          .split(",")
          .map((slug) => slug.trim())
          .filter(Boolean)
      );
      index += 1;
    } else if (current === "--only-objects" && argv[index + 1]) {
      options.onlyObjectSlugs = new Set(
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

async function pixelate(buffer, logicalWidth, logicalHeight, outFile) {
  const downscaled = await sharp(buffer)
    .trim()
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
  const nextIndex =
    existingPaths.reduce((max, item) => {
      const match = item.match(/-v(\d+)\.png$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
  const padded = String(nextIndex).padStart(3, "0");
  return `${kind}/${slug}/${slug}-v${padded}.png`;
}

async function classicVariantPath(slug) {
  if (!majorBuildingSlugs.has(slug) || slug === "house") {
    return null;
  }
  const relative = `objects/${slug}/${slug}-classic.png`;
  try {
    await access(path.join(outRoot, relative));
    return relative;
  } catch {
    return null;
  }
}

function promptForObject(entry, nextOrdinal) {
  const shared = [
    "Create one handcrafted retro RPG building sprite for a browser MMO.",
    "Use a high-angle 3/4 village-building view with visible front facade and roof, similar to classic 2D RPG towns.",
    "Transparent background. Single isolated structure only.",
    "Crisp readable pixel art with strong silhouette, rich roof shingles, wooden trim, believable doors and windows, and grounded prop details.",
    `The final sprite will be reduced to about ${entry.logicalWidth}x${entry.logicalHeight}, so keep the structure large, clear, and not tiny.`,
    "No characters, no terrain tilemap, no UI, no text labels, no border, no frame, no cutaway interior.",
    "Avoid blurry painterly rendering; preserve clustered pixel readability and coherent lighting."
  ];

  if (entry.slug === "house") {
    const theme = houseVariantThemes[(nextOrdinal - 1) % houseVariantThemes.length];
    return [
      ...shared,
      "This asset belongs to a 20-house village set and must feel distinct from the others while staying in the same world.",
      `House theme: ${theme}.`
    ].join(" ");
  }

  if (majorBuildingSlugs.has(entry.slug)) {
    const themes = buildingVariantThemes[entry.slug] ?? [entry.prompt];
    const theme = themes[(nextOrdinal - 1) % themes.length];
    return [
      ...shared,
      `Building type: ${entry.slug}.`,
      `Variant brief: ${theme}.`
    ].join(" ");
  }

  return `${entry.prompt} Archive variant ${nextOrdinal}.`;
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
    if (options.onlyObjectSlugs && !options.onlyObjectSlugs.has(entry.slug)) {
      continue;
    }
    const archive = ensureArrayStore(manifest.objectArchive, entry.slug);
    if (options.replaceObjectSlugs.has(entry.slug)) {
      archive.length = 0;
      delete manifest.objects[entry.slug];
    }
    const classicPath = await classicVariantPath(entry.slug);
    if (classicPath && archive[0] !== classicPath) {
      const withoutClassic = archive.filter((item) => item !== classicPath);
      archive.length = 0;
      archive.push(classicPath, ...withoutClassic);
    }
    const targetVariants = entry.slug === "house"
      ? options.targetHouseVariants
      : majorBuildingSlugs.has(entry.slug)
        ? options.targetBuildingVariants + (classicPath ? 1 : 0)
        : options.targetObjectVariants;
    const remaining = Math.max(0, targetVariants - archive.length);

    if (remaining === 0) {
      console.log(`skipped object ${entry.slug}, archive already has ${archive.length} variants`);
    }

    for (let variant = 0; variant < remaining; variant += 1) {
      const nextOrdinal = archive.length + 1;
      const bytes = await generateImage(promptForObject(entry, nextOrdinal), true);
      const relative = nextVariantPath("objects", entry.slug, archive);
      await mkdir(path.join(outRoot, "objects", entry.slug), { recursive: true });
      await pixelate(bytes, entry.logicalWidth, entry.logicalHeight, path.join(outRoot, relative));
      archive.push(relative);
      manifest.objects[entry.slug] = relative;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
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
      "Generated with OpenAI gpt-image-1-mini via scripts/generate-assets.mjs.",
      "The archive is append-only by default.",
      "Rerunning the script will skip generation once the target counts are already satisfied unless you replace object archives explicitly.",
      "Use --tile-target, --object-target, --building-target, or --player-target to grow the archive deliberately.",
      "Use --replace-objects house,pub,... to rebuild selected building archives from scratch.",
      "Use --force to regenerate up to the requested target counts regardless of existing archive size."
    ].join("\n") + "\n",
    "utf8"
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
