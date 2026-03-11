import "dotenv/config";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required to generate player sprites.");
}

const client = new OpenAI({ apiKey });
const outRoot = path.resolve("src/client/assets/generated");
const manifestPath = path.join(outRoot, "manifest.json");
const sheetSlug = "player-base";
const imageModel = "gpt-image-1-mini";
const frameSize = 64;
const cols = 4;
const rows = 4;
const sheetSize = frameSize * cols;

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    255
  ];
}

function setPixel(data, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width) {
    return;
  }
  const height = data.length / 4 / width;
  if (y >= height) {
    return;
  }
  const index = (y * width + x) * 4;
  data[index] = color[0];
  data[index + 1] = color[1];
  data[index + 2] = color[2];
  data[index + 3] = color[3];
}

function fillRect(data, width, x, y, rectWidth, rectHeight, color) {
  for (let py = y; py < y + rectHeight; py += 1) {
    for (let px = x; px < x + rectWidth; px += 1) {
      setPixel(data, width, px, py, color);
    }
  }
}

function mirroredX(x, rectWidth) {
  return 16 - x - rectWidth;
}

function drawFrame(data, width, frameX, frameY, direction, frame) {
  const stride = frame === 1 ? -1 : frame === 3 ? 1 : 0;
  const bodyBob = frame === 0 ? 0 : 1;
  const hair = [hexToRgb("#ffc95c"), hexToRgb("#d68e2a"), hexToRgb("#7d4c18")];
  const primary = [hexToRgb("#27d7ff"), hexToRgb("#1497cf"), hexToRgb("#0a5c8c")];
  const secondary = [hexToRgb("#ff69c8"), hexToRgb("#c43a8f"), hexToRgb("#7f1e59")];
  const accent = [hexToRgb("#a4ff65"), hexToRgb("#5dbf3e"), hexToRgb("#2e6f22")];
  const skin = [hexToRgb("#f4c6a0"), hexToRgb("#d69a72"), hexToRgb("#9d674a")];
  const boots = [hexToRgb("#8a5c36"), hexToRgb("#5e3d25"), hexToRgb("#2c1c14")];
  const scale = 4;
  const baseX = frameX + 5 * scale;
  const baseY = frameY + (2 + bodyBob) * scale;

  const drawRect = (x, y, rectWidth, rectHeight, color) => {
    fillRect(data, width, baseX + x * scale, baseY + y * scale, rectWidth * scale, rectHeight * scale, color);
  };
  const drawMirrorRect = (x, y, rectWidth, rectHeight, color) => {
    drawRect(mirroredX(x, rectWidth), y, rectWidth, rectHeight, color);
  };
  const drawPixel = (x, y, color) => {
    drawRect(x, y, 1, 1, color);
  };
  const drawMirrorPixel = (x, y, color) => {
    drawPixel(16 - x - 1, y, color);
  };

  if (direction === "down") {
    drawRect(2, 0, 2, 1, hair[1]);
    drawRect(1, 1, 4, 2, skin[0]);
    drawPixel(2, 2, hair[2]);
    drawPixel(3, 2, hair[2]);
    drawRect(1, 3, 4, 4, primary[0]);
    drawRect(1, 5, 4, 2, primary[1]);
    drawRect(2, 4, 2, 1, secondary[0]);
    drawRect(0, 4, 1, 2, secondary[1]);
    drawRect(5, 4, 1, 2, secondary[1]);
    drawRect(0, 3, 1, 3, skin[1]);
    drawRect(5, 3, 1, 3, skin[1]);
    drawRect(2, 7, 2, 1, accent[0]);
    drawRect(1, 8, 1, 3, secondary[2]);
    drawRect(4, 8, 1, 3, secondary[2]);
    drawRect(1, 11 + Math.max(0, stride), 1, 3, boots[0]);
    drawRect(4, 11 + Math.max(0, -stride), 1, 3, boots[0]);
    drawRect(1, 14 + Math.max(0, stride), 1, 1, boots[2]);
    drawRect(4, 14 + Math.max(0, -stride), 1, 1, boots[2]);
    return;
  }

  if (direction === "up") {
    drawRect(1, 0, 4, 2, hair[1]);
    drawRect(2, 2, 2, 1, hair[2]);
    drawRect(1, 3, 4, 4, primary[0]);
    drawRect(1, 5, 4, 2, primary[1]);
    drawRect(2, 4, 2, 2, accent[0]);
    drawRect(0, 3, 1, 3, secondary[1]);
    drawRect(5, 3, 1, 3, secondary[1]);
    drawRect(2, 7, 2, 1, secondary[0]);
    drawRect(1, 8, 1, 3, secondary[2]);
    drawRect(4, 8, 1, 3, secondary[2]);
    drawRect(1, 11 + Math.max(0, stride), 1, 3, boots[0]);
    drawRect(4, 11 + Math.max(0, -stride), 1, 3, boots[0]);
    drawRect(1, 14 + Math.max(0, stride), 1, 1, boots[2]);
    drawRect(4, 14 + Math.max(0, -stride), 1, 1, boots[2]);
    return;
  }

  const drawSideRect = direction === "right" ? drawRect : drawMirrorRect;
  const drawSidePixel = direction === "right" ? drawPixel : drawMirrorPixel;
  drawSideRect(1, 0, 3, 1, hair[1]);
  drawSideRect(1, 1, 3, 2, skin[0]);
  drawSidePixel(3, 2, hair[2]);
  drawSideRect(1, 3, 3, 4, primary[0]);
  drawSideRect(1, 5, 3, 2, primary[1]);
  drawSideRect(0, 4, 1, 5, secondary[1]);
  drawSideRect(4, 4, 1, 2, skin[1]);
  drawSideRect(2, 4, 1, 1, accent[0]);
  drawSideRect(2, 8, 1, 3, secondary[2]);
  drawSideRect(1, 11 + Math.max(0, stride), 1, 3, boots[0]);
  drawSideRect(3, 11 + Math.max(0, -stride), 1, 3, boots[0]);
  drawSideRect(1, 14 + Math.max(0, stride), 1, 1, boots[2]);
  drawSideRect(3, 14 + Math.max(0, -stride), 1, 1, boots[2]);
}

async function createFallbackSheet() {
  const width = sheetSize;
  const height = sheetSize;
  const data = new Uint8ClampedArray(width * height * 4);
  const directions = ["down", "left", "right", "up"];

  for (let row = 0; row < directions.length; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      drawFrame(data, width, col * frameSize, row * frameSize, directions[row], col);
    }
  }

  return sharp(Buffer.from(data), {
    raw: { width, height, channels: 4 }
  })
    .png({ palette: true, compressionLevel: 9 })
    .toBuffer();
}

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

function ensureArrayStore(record, key) {
  const existing = record[key];
  if (Array.isArray(existing)) {
    return existing;
  }
  record[key] = [];
  return record[key];
}

function nextVariantPath(existingPaths) {
  const nextIndex = existingPaths.length + 1;
  const padded = String(nextIndex).padStart(3, "0");
  return `players/${sheetSlug}/${sheetSlug}-v${padded}.png`;
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

async function generateSheetBytes() {
  const prompt = [
    "Create a single 4x4 animated sprite sheet for a cozy browser MMO adventurer.",
    "Top-down pixel art. Transparent background.",
    "The sheet must be arranged on an exact even grid.",
    "Rows in order: facing down, facing left, facing right, facing up.",
    "Columns in order: idle, walk-step-a, passing-step, walk-step-b.",
    "Keep the exact same character scale in every cell.",
    "Keep both feet aligned to the same bottom baseline in every frame.",
    "Walking frames must look physically correct with legs alternating and arms counter-swinging.",
    "Keep one consistent character design across all 16 cells.",
    "Character should feel slightly heroic, readable, and not too simple.",
    "Readable hair, face, tunic, belt, gloves, boots, shoulder accents, and layered cloth.",
    "No weapons, mounts, scenery, text, UI, borders, drop shadows, or extra props.",
    "Crisp sprite readability, not painterly, not blurry, not concept art."
  ].join(" ");

  const result = await client.images.generate({
    model: imageModel,
    prompt,
    size: "1024x1024",
    background: "transparent"
  });

  const imageBase64 = result.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error("No player sprite bytes returned from OpenAI.");
  }

  return Buffer.from(imageBase64, "base64");
}

async function normalizeSheet(buffer, outFile) {
  const normalized = await sharp(buffer)
    .resize(sheetSize, sheetSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({ palette: true, compressionLevel: 9 })
    .toBuffer();

  await sharp(normalized).toFile(outFile);
}

async function run() {
  const manifest = await loadManifest();
  const archive = ensureArrayStore(manifest.playerArchive, sheetSlug);
  const relative = nextVariantPath(archive);
  const outFile = path.join(outRoot, relative);

  await mkdir(path.dirname(outFile), { recursive: true });

  let bytes;
  try {
    bytes = await generateSheetBytes();
  } catch (error) {
    console.warn(`OpenAI player generation failed, using local fallback sheet: ${error.message}`);
    bytes = await createFallbackSheet();
  }
  await normalizeSheet(bytes, outFile);

  archive.push(relative);
  manifest.players["local-player"] = relative;
  manifest.players["remote-player"] = relative;
  ensureArrayStore(manifest.playerArchive, "local-player").push(relative);
  ensureArrayStore(manifest.playerArchive, "remote-player").push(relative);

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const latestLocal = path.join(outRoot, "players", "local-player.png");
  const latestRemote = path.join(outRoot, "players", "remote-player.png");
  await cp(outFile, latestLocal, { force: true });
  await cp(outFile, latestRemote, { force: true });

  console.log(`generated animated player sheet ${relative}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
