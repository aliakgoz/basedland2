import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required to generate art assets.");
}

const client = new OpenAI({ apiKey });
const outRoot = path.resolve("src/client/assets/generated");

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
  ["house", "Top-down cozy pixel-art village house sprite, isolated, transparent background, nostalgic MMO style, readable at 32x32."],
  ["tree", "Top-down cozy pixel-art oak tree sprite, isolated, transparent background, nostalgic MMO style, readable at 32x32."],
  ["stone", "Top-down cozy pixel-art stone boulder sprite, isolated, transparent background, nostalgic MMO style, readable at 32x32."],
  ["crate", "Top-down cozy pixel-art wooden crate sprite, isolated, transparent background, nostalgic MMO style, readable at 32x32."],
  ["well", "Top-down cozy pixel-art village well sprite, isolated, transparent background, nostalgic MMO style, readable at 32x32."],
  ["ruins", "Top-down cozy pixel-art ancient ruins sprite, isolated, transparent background, nostalgic MMO style, readable at 32x32."],
  ["sign", "Top-down cozy pixel-art wooden sign sprite, isolated, transparent background, nostalgic MMO style, readable at 32x32."],
  ["chest", "Top-down cozy pixel-art treasure chest sprite, isolated, transparent background, nostalgic MMO style, readable at 32x32."],
  ["horse", "Top-down cozy pixel-art horse sprite, isolated, transparent background, nostalgic MMO style, readable at 32x32."],
  ["sheep", "Top-down cozy pixel-art sheep sprite, isolated, transparent background, nostalgic MMO style, readable at 32x32."],
  ["grass-tuft", "Top-down cozy pixel-art wild grass tuft sprite, isolated, transparent background, nostalgic MMO style, readable at 32x32."]
];

const playerEntries = [
  ["local-player", "Top-down cozy pixel-art adventurer player sprite, isolated, transparent background, blue tunic, warm colors, readable at 16x20."],
  ["remote-player", "Top-down cozy pixel-art adventurer player sprite, isolated, transparent background, cream and violet outfit, readable at 16x20."]
];

async function ensureDirs() {
  await mkdir(path.join(outRoot, "tiles"), { recursive: true });
  await mkdir(path.join(outRoot, "objects"), { recursive: true });
  await mkdir(path.join(outRoot, "players"), { recursive: true });
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

async function pixelate(buffer, logicalSize, outFile) {
  const downscaled = await sharp(buffer)
    .resize(logicalSize, logicalSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp(downscaled)
    .resize(logicalSize * 4, logicalSize * 4, { kernel: sharp.kernel.nearest })
    .png({ palette: true, compressionLevel: 9 })
    .toFile(outFile);
}

async function run() {
  await ensureDirs();
  const manifest = {
    tiles: {},
    objects: {},
    players: {}
  };

  for (const tile of tileEntries) {
    manifest.tiles[tile.slug] = [];
    for (let variant = 0; variant < 6; variant += 1) {
      const prompt = `${tile.prompt} Variation ${variant + 1} of 6, visually distinct from the others, but still matching the same biome.`;
      const bytes = await generateImage(prompt, false);
      const relative = `tiles/${tile.slug}-${variant}.png`;
      await pixelate(bytes, 32, path.join(outRoot, relative));
      manifest.tiles[tile.slug].push(relative);
      console.log(`generated tile ${tile.slug}-${variant}`);
    }
  }

  for (const [slug, prompt] of objectEntries) {
    const bytes = await generateImage(prompt, true);
    const relative = `objects/${slug}.png`;
    await pixelate(bytes, 32, path.join(outRoot, relative));
    manifest.objects[slug] = relative;
    console.log(`generated object ${slug}`);
  }

  for (const [slug, prompt] of playerEntries) {
    const bytes = await generateImage(prompt, true);
    const logicalHeight = slug.includes("player") ? 20 : 32;
    const logicalWidth = slug.includes("player") ? 16 : 32;
    const downscaled = await sharp(bytes)
      .resize(logicalWidth, logicalHeight, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    await sharp(downscaled)
      .resize(logicalWidth * 4, logicalHeight * 4, { kernel: sharp.kernel.nearest })
      .png({ palette: true, compressionLevel: 9 })
      .toFile(path.join(outRoot, "players", `${slug}.png`));
    manifest.players[slug] = `players/${slug}.png`;
    console.log(`generated player ${slug}`);
  }

  await writeFile(path.join(outRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(
    path.join(outRoot, "README.txt"),
    "Generated with OpenAI gpt-image-1.5 via scripts/generate-assets.mjs.\n",
    "utf8"
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
