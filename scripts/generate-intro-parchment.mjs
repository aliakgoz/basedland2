import "dotenv/config";
import OpenAI from "openai";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = "gpt-image-1-mini";
const outDir = path.resolve("src/client/assets/generated/ui");
const outFile = path.join(outDir, "intro-parchment-v001.png");

const prompt = [
  "A richly detailed old paper parchment background for a fantasy treasure-hunt game introduction screen.",
  "Portrait layout, warm aged vellum, worn edges, subtle folds, faint stains, elegant handmade paper texture.",
  "Leave a broad calm central area suitable for readable text, but decorate the left and right margins and empty spaces with sepia-brown ink and charcoal style sketches.",
  "The sketches should depict treasure hunting themes: a mounted adventurer, old maps, shovels, hidden chests, field notes, coins, horse tack, compass roses, and mysterious trail marks.",
  "These illustrations must feel artistic, hand-drawn, and softly embedded into the parchment, not comic-book panels.",
  "No modern elements, no color splashes except warm brown ink tones, no readable text."
].join(" ");

async function main() {
  await mkdir(outDir, { recursive: true });
  const result = await client.images.generate({
    model,
    prompt,
    size: "1024x1536",
    background: "opaque"
  });

  const imageBase64 = result.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error("No image bytes returned.");
  }

  const source = Buffer.from(imageBase64, "base64");
  await sharp(source)
    .resize(1280, 1664, { fit: "cover", position: "centre" })
    .png()
    .toFile(outFile);

  console.log(`Generated ${outFile}`);
}

await main();
