import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required to generate the world layout.");
}

const client = new OpenAI({ apiKey });
const outputDir = path.resolve("src/client/assets/generated");
const layoutJsonPath = path.resolve("src/shared/generated/world-layout.json");
const previewPath = path.join(outputDir, "world-layout-preview.png");
const worldSurfacePath = path.join(outputDir, "world-surface.png");
const manifestPath = path.join(outputDir, "manifest.json");

const palette = [
  { id: 0, name: "plains", rgb: [120, 181, 87] },
  { id: 1, name: "forest", rgb: [63, 107, 54] },
  { id: 2, name: "mountain", rgb: [143, 148, 152] },
  { id: 3, name: "water", rgb: [66, 121, 181] },
  { id: 4, name: "village", rgb: [182, 132, 77] }
];

function nearestBiome(r, g, b) {
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const biome of palette) {
    const dr = r - biome.rgb[0];
    const dg = g - biome.rgb[1];
    const db = b - biome.rgb[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = biome;
    }
  }
  return best.id;
}

function smoothGrid(grid, width, height) {
  const next = grid.slice();
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const counts = new Map();
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const value = grid[(y + oy) * width + (x + ox)];
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      }
      let winner = grid[y * width + x];
      let winnerCount = 0;
      for (const [value, count] of counts) {
        if (count > winnerCount) {
          winner = value;
          winnerCount = count;
        }
      }
      next[y * width + x] = winner;
    }
  }
  return next;
}

async function generateSourceImage() {
  const prompt = [
    "Create a top-down macro overworld layout map for a retro pixel MMO.",
    "The map must contain winding rivers, broad plains, dense forests, mountain ranges, and several village zones.",
    "Use only flat solid color regions with no shading, no labels, no icons, no outlines, and no texture.",
    "Use this exact color palette only:",
    "plains #78B557, forest #3F6B36, mountain #8F9498, water #4279B5, village #B6844D.",
    "Make the result readable as a biome mask, not an illustrated poster."
  ].join(" ");

  const result = await client.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5",
    prompt,
    size: "1024x1024",
    quality: "high",
    output_format: "png",
    background: "opaque"
  });

  const encoded = result.data?.[0]?.b64_json;
  if (!encoded) {
    throw new Error("World layout generation returned no image data.");
  }
  return Buffer.from(encoded, "base64");
}

async function generateWorldSurfaceImage() {
  const prompt = [
    "Create a complete top-down pixel-art MMO world map, not a biome mask.",
    "The whole image must represent a coherent 1000x1000-pixel world surface with villages, towns, roads, lakes, rivers, fields, forests, plains, and mountain ranges.",
    "Houses must read as large 10x10 or bigger pixel masses, horses as tiny 2-pixel marks, humans sheep dogs and cats as 1-pixel marks.",
    "Use a cohesive retro RPG palette, keep features connected and readable, avoid isolated random pixels, and avoid perspective.",
    "No labels, no UI, no decorative border."
  ].join(" ");

  const result = await client.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5",
    prompt,
    size: "1024x1024",
    quality: "high",
    output_format: "png",
    background: "opaque"
  });

  const encoded = result.data?.[0]?.b64_json;
  if (!encoded) {
    throw new Error("World surface generation returned no image data.");
  }
  return Buffer.from(encoded, "base64");
}

async function run() {
  await mkdir(outputDir, { recursive: true });

  const imageBytes = await generateSourceImage();
  const surfaceBytes = await generateWorldSurfaceImage();
  const { data, info } = await sharp(imageBytes)
    .resize(100, 100, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let grid = new Uint8Array(info.width * info.height);
  for (let i = 0; i < grid.length; i += 1) {
    const offset = i * info.channels;
    grid[i] = nearestBiome(data[offset], data[offset + 1], data[offset + 2]);
  }

  grid = smoothGrid(grid, info.width, info.height);
  grid = smoothGrid(grid, info.width, info.height);

  const preview = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < grid.length; i += 1) {
    const biome = palette[grid[i]];
    preview[i * 3] = biome.rgb[0];
    preview[i * 3 + 1] = biome.rgb[1];
    preview[i * 3 + 2] = biome.rgb[2];
  }

  await sharp(preview, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 3
    }
  })
    .resize(1000, 1000, { kernel: sharp.kernel.nearest })
    .png({ palette: true, compressionLevel: 9 })
    .toFile(previewPath);

  const surfacePixelated = await sharp(surfaceBytes)
    .resize(250, 250, { fit: "fill" })
    .png({ palette: true, colors: 64, compressionLevel: 9 })
    .toBuffer();

  await sharp(surfacePixelated)
    .resize(1000, 1000, { kernel: sharp.kernel.nearest, fit: "fill" })
    .png({ palette: true, compressionLevel: 9 })
    .toFile(worldSurfacePath);

  await writeFile(
    layoutJsonPath,
    `${JSON.stringify({ width: info.width, height: info.height, data: Array.from(grid) }, null, 2)}\n`,
    "utf8"
  );

  let manifest = { tiles: {}, objects: {}, players: {} };
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    manifest = { tiles: {}, objects: {}, players: {} };
  }
  manifest.worldSurface = "world-surface.png";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`generated world layout ${info.width}x${info.height}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
