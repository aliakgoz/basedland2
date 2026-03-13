import "dotenv/config";
import OpenAI from "openai";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = "gpt-image-1-mini";
const outDir = path.resolve("src/client/assets/generated/ui");
const outFile = path.join(outDir, "base-seal-v001.png");

const prompt = [
  "Fantasy parchment seal for a browser game intro overlay.",
  "A refined cobalt-blue wax seal stamp with subtle blue candle-wax drips.",
  "At the center, use a clean heraldic emblem shaped like the provided Base logo concept: four rounded blue blocks in a row, the leftmost block rising upward like an L-shaped tower while the other three stay even-height.",
  "Medieval illuminated manuscript mood, premium game UI asset, readable at small size, transparent background.",
  "No text, no border frame, no extra objects."
].join(" ");

async function main() {
  await mkdir(outDir, { recursive: true });
  const result = await client.images.generate({
    model,
    prompt,
    size: "1024x1024",
    background: "transparent"
  });

  const imageBase64 = result.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error("No image bytes returned.");
  }

  const source = Buffer.from(imageBase64, "base64");
  await sharp(source)
    .trim()
    .resize(320, 320, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outFile);

  console.log(`Generated ${outFile}`);
}

await main();
