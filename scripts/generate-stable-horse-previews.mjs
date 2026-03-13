import "dotenv/config";
import OpenAI from "openai";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is missing.");
}

const client = new OpenAI({ apiKey });
const model = "gpt-image-1-mini";
const outDir = path.resolve("src/client/assets/generated/ui/stable-horses");

const variants = [
  {
    slug: "gray",
    label: "gray horse",
    colors: "cool gray coat, charcoal mane, subtle silver highlights"
  },
  {
    slug: "brown",
    label: "brown horse",
    colors: "warm chestnut-brown coat, dark brown mane, soft amber highlights"
  },
  {
    slug: "black",
    label: "black horse",
    colors: "inky black coat, obsidian mane, restrained blue-gray highlights"
  }
];

function promptForVariant(variant) {
  return [
    "Premium game UI card illustration for a medieval fantasy stable shop.",
    `Draw one ${variant.label} in clean side profile, facing right, fully visible from hoof to ear.`,
    `Use ${variant.colors}.`,
    "Look noble, readable, and appealing at small size.",
    "Painterly but crisp, slightly storybook, not pixel art, no rider, no saddle, transparent background.",
    "Do not crop the horse. Leave comfortable empty space around it.",
    "No text, no frame, no extra props, no ground."
  ].join(" ");
}

async function generateVariant(variant) {
  const outFile = path.join(outDir, `stable-horse-${variant.slug}-v001.png`);
  const result = await client.images.generate({
    model,
    prompt: promptForVariant(variant),
    size: "1024x1024",
    background: "transparent"
  });
  const imageBase64 = result.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error(`No image bytes returned for ${variant.slug}.`);
  }

  const source = Buffer.from(imageBase64, "base64");
  await sharp(source)
    .trim()
    .resize(320, 220, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(outFile);

  console.log(`Generated ${outFile}`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  for (const variant of variants) {
    await generateVariant(variant);
  }
}

await main();
