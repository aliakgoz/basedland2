import "dotenv/config";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import sharp from "sharp";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required to generate outfit boards.");
}

const client = new OpenAI({ apiKey });
const outRoot = path.resolve("src/client/assets/generated/outfit-boards");
const imageModel = "gpt-image-1-mini";

function parseArgs(argv) {
  const options = {
    boards: 16
  };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--boards" && argv[index + 1]) {
      options.boards = Math.max(1, Number(argv[index + 1]) || options.boards);
      index += 1;
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));

async function nextIndex() {
  await mkdir(outRoot, { recursive: true });
  const files = await readdir(outRoot).catch(() => []);
  const indexes = files
    .map((file) => /outfit-board-v(\d+)\.png$/i.exec(file)?.[1])
    .filter(Boolean)
    .map((value) => Number(value));
  const max = indexes.length > 0 ? Math.max(...indexes) : 0;
  return max + 1;
}

async function generateBoard(ordinal) {
  const seasonal = [
    "traveler and ranger",
    "noble and courtly",
    "desert and nomad",
    "winter and fur-lined",
    "mage and alchemist",
    "pirate and dockside",
    "smith, laborer, and guild",
    "festival and ceremonial"
  ][(ordinal - 1) % 8];

  const prompt = [
    "Create a 4x4 outfit lookbook board with exactly 16 distinct top-down pixel-art MMO adventurer outfits.",
    "Each outfit must occupy its own clean cell in an even grid.",
    "The focus is clothing only: tunics, coats, cloaks, pauldrons, gloves, belts, scarves, robes, pants, boots, hats, hoods, and accessories.",
    "Keep the style cozy, readable, layered, and suitable for a browser MMO player character.",
    `Theme emphasis: ${seasonal}.`,
    "No text labels, no UI, no scenery, no weapons, no animals, no mounts.",
    "Keep silhouettes varied and visually rich, not simplistic.",
    "Crisp sprite readability, not blurry, not painterly."
  ].join(" ");

  const result = await client.images.generate({
    model: imageModel,
    prompt,
    size: "1024x1024"
  });

  const imageBase64 = result.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error(`No outfit board bytes returned for board ${ordinal}.`);
  }

  const padded = String(ordinal).padStart(3, "0");
  const outFile = path.join(outRoot, `outfit-board-v${padded}.png`);
  await sharp(Buffer.from(imageBase64, "base64"))
    .png({ palette: true, compressionLevel: 9 })
    .toFile(outFile);
  console.log(`generated outfit board ${padded}`);
}

async function run() {
  let ordinal = await nextIndex();
  for (let index = 0; index < options.boards; index += 1) {
    await generateBoard(ordinal);
    ordinal += 1;
  }

  await writeFile(
    path.join(outRoot, "README.txt"),
    [
      "Generated outfit reference boards for player clothing exploration.",
      "Model: gpt-image-1-mini.",
      "Each board is intended as a clothing library page, not a runtime sprite sheet."
    ].join("\n") + "\n",
    "utf8"
  );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
