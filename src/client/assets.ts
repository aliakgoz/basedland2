import { ObjectType, TILE_SIZE, TileType, WORLD_SEED } from "../shared/protocol";

type SpriteSource = HTMLCanvasElement | HTMLImageElement;
interface GeneratedManifest {
  tiles: Partial<Record<string, string[]>>;
  objects: Partial<Record<string, string>>;
  players: Partial<Record<string, string>>;
}

const TILE_VARIANTS = 6;
const TILE_PIXEL_SIZE = 16;
const OBJECT_SIZE = 32;
const PLAYER_WIDTH = 16;
const PLAYER_HEIGHT = 20;

const TILE_PALETTES: Record<TileType, string[]> = {
  [TileType.Grass]: ["#6fa84f", "#78b154", "#5d913f", "#8fc76d", "#4f7b33"],
  [TileType.Dirt]: ["#8f6b46", "#a17b54", "#6d4e34", "#b48c62", "#503724"],
  [TileType.Stone]: ["#8f9396", "#a8adb0", "#71767a", "#c4c8cb", "#565c61"],
  [TileType.Water]: ["#4a7cab", "#5a92c5", "#34648e", "#83b3dd", "#294f70"],
  [TileType.Forest]: ["#456f37", "#50813f", "#345a29", "#6b9d55", "#27461f"]
};

function hash(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function hash2d(seed: number, x: number, y: number): number {
  return hash(seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263));
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function paintPixel(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x * size, y * size, size, size);
}

function drawRectPx(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  size: number,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x * size, y * size, width * size, height * size);
}

function circleMask(dx: number, dy: number, radius: number): boolean {
  return dx * dx + dy * dy <= radius * radius;
}

function makeTileVariant(type: TileType, variant: number): HTMLCanvasElement {
  const canvas = createCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  const pixel = TILE_SIZE / TILE_PIXEL_SIZE;
  const palette = TILE_PALETTES[type];
  const bg = palette[0];
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  for (let py = 0; py < TILE_PIXEL_SIZE; py += 1) {
    for (let px = 0; px < TILE_PIXEL_SIZE; px += 1) {
      const roll = hash2d(WORLD_SEED + variant * 97 + type * 131, px, py) % 100;
      let color = palette[1];

      if (type === TileType.Water) {
        color = roll < 18 ? palette[3] : roll < 64 ? palette[1] : palette[2];
        if ((py + variant) % 5 === 0 && px % 3 !== 0) {
          color = palette[3];
        }
      } else if (type === TileType.Stone) {
        color = roll < 12 ? palette[3] : roll < 54 ? palette[1] : palette[2];
      } else if (type === TileType.Dirt) {
        color = roll < 10 ? palette[3] : roll < 60 ? palette[1] : palette[2];
      } else if (type === TileType.Forest) {
        color = roll < 9 ? palette[3] : roll < 65 ? palette[1] : palette[2];
      } else {
        color = roll < 11 ? palette[3] : roll < 66 ? palette[1] : palette[2];
      }

      paintPixel(ctx, px, py, pixel, color);
    }
  }

  const accent = palette[4];
  for (let i = 0; i < 5; i += 1) {
    const ax = 1 + (hash2d(WORLD_SEED + 700 + variant, i, type) % 14);
    const ay = 1 + (hash2d(WORLD_SEED + 900 + variant, type, i) % 14);
    paintPixel(ctx, ax, ay, pixel, accent);
    if (type !== TileType.Water && ay + 1 < TILE_PIXEL_SIZE) {
      paintPixel(ctx, ax, ay + 1, pixel, accent);
    }
  }

  return canvas;
}

function makeTreeSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE, OBJECT_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const s = 2;
  drawRectPx(ctx, 7, 10, 2, 5, s, "#6c4826");
  for (let y = 2; y <= 10; y += 1) {
    for (let x = 3; x <= 12; x += 1) {
      if (!circleMask(x - 8, y - 6, 5)) {
        continue;
      }
      const shade = (x + y) % 3 === 0 ? "#5f9a44" : (x + y) % 4 === 0 ? "#8ec66c" : "#3f6e2f";
      paintPixel(ctx, x, y, s, shade);
    }
  }
  return canvas;
}

function makeHouseSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE, OBJECT_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const s = 2;
  drawRectPx(ctx, 3, 8, 10, 6, s, "#d2ab79");
  drawRectPx(ctx, 6, 10, 2, 4, s, "#7d5236");
  drawRectPx(ctx, 4, 10, 2, 2, s, "#90c4d8");
  drawRectPx(ctx, 9, 10, 2, 2, s, "#90c4d8");
  for (let row = 0; row < 4; row += 1) {
    drawRectPx(ctx, 2 + row, 7 - row, 12 - row * 2, 1, s, row % 2 === 0 ? "#9c5f3f" : "#7d452c");
  }
  return canvas;
}

function makeStoneSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE, OBJECT_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const s = 2;
  for (let y = 7; y <= 12; y += 1) {
    for (let x = 4; x <= 11; x += 1) {
      if ((x + y) % 5 === 0) {
        continue;
      }
      const color = x < 8 ? "#c5c9cc" : "#8f9598";
      paintPixel(ctx, x, y, s, color);
    }
  }
  drawRectPx(ctx, 5, 8, 6, 4, s, "rgba(0,0,0,0.12)");
  return canvas;
}

function makeCrateSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE, OBJECT_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const s = 2;
  drawRectPx(ctx, 4, 8, 8, 6, s, "#9a6a3f");
  drawRectPx(ctx, 4, 10, 8, 1, s, "#734a2d");
  drawRectPx(ctx, 7, 8, 1, 6, s, "#c08c58");
  return canvas;
}

function makeWellSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE, OBJECT_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const s = 2;
  drawRectPx(ctx, 5, 7, 6, 6, s, "#8b939e");
  drawRectPx(ctx, 6, 8, 4, 3, s, "#4a7cab");
  drawRectPx(ctx, 4, 6, 1, 5, s, "#6d4c2e");
  drawRectPx(ctx, 11, 6, 1, 5, s, "#6d4c2e");
  drawRectPx(ctx, 4, 5, 8, 1, s, "#b77743");
  return canvas;
}

function makeRuinsSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE, OBJECT_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const s = 2;
  drawRectPx(ctx, 3, 9, 3, 4, s, "#a8a188");
  drawRectPx(ctx, 7, 7, 2, 6, s, "#c3baa1");
  drawRectPx(ctx, 10, 10, 2, 3, s, "#8e866f");
  return canvas;
}

function makeSignSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE, OBJECT_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const s = 2;
  drawRectPx(ctx, 7, 8, 2, 6, s, "#6c4826");
  drawRectPx(ctx, 4, 6, 8, 3, s, "#d2bc74");
  drawRectPx(ctx, 5, 7, 6, 1, s, "#8f6b46");
  return canvas;
}

function makeChestSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE, OBJECT_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const s = 2;
  drawRectPx(ctx, 4, 9, 8, 4, s, "#b17834");
  drawRectPx(ctx, 4, 8, 8, 2, s, "#d2a052");
  drawRectPx(ctx, 7, 9, 1, 4, s, "#6b4b22");
  return canvas;
}

function makeHorseSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE, OBJECT_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const s = 2;
  drawRectPx(ctx, 4, 8, 7, 4, s, "#9c6742");
  drawRectPx(ctx, 10, 7, 2, 3, s, "#7b4e2f");
  drawRectPx(ctx, 5, 12, 1, 3, s, "#513219");
  drawRectPx(ctx, 9, 12, 1, 3, s, "#513219");
  drawRectPx(ctx, 3, 9, 1, 4, s, "#513219");
  return canvas;
}

function makeSheepSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE, OBJECT_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const s = 2;
  drawRectPx(ctx, 4, 8, 7, 5, s, "#f0ede2");
  drawRectPx(ctx, 9, 7, 2, 2, s, "#d8d0c2");
  drawRectPx(ctx, 5, 12, 1, 3, s, "#7d6a56");
  drawRectPx(ctx, 9, 12, 1, 3, s, "#7d6a56");
  paintPixel(ctx, 10, 8, s, "#2c241d");
  return canvas;
}

function makeGrassTuftSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE, OBJECT_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const s = 2;
  drawRectPx(ctx, 7, 11, 1, 4, s, "#39652a");
  drawRectPx(ctx, 6, 10, 1, 4, s, "#4b8438");
  drawRectPx(ctx, 8, 10, 1, 4, s, "#6cad4c");
  drawRectPx(ctx, 5, 12, 1, 2, s, "#80c25d");
  drawRectPx(ctx, 9, 12, 1, 2, s, "#80c25d");
  return canvas;
}

function makePlayerSprite(primary: string, secondary: string, skin: string): HTMLCanvasElement {
  const canvas = createCanvas(PLAYER_WIDTH, PLAYER_HEIGHT);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const s = 2;
  drawRectPx(ctx, 3, 0, 2, 1, s, primary);
  drawRectPx(ctx, 2, 1, 4, 2, s, skin);
  drawRectPx(ctx, 2, 3, 4, 4, s, secondary);
  drawRectPx(ctx, 2, 7, 1, 3, s, "#3d2d21");
  drawRectPx(ctx, 5, 7, 1, 3, s, "#3d2d21");
  paintPixel(ctx, 3, 2, s, "#2b241e");
  paintPixel(ctx, 4, 2, s, "#2b241e");
  return canvas;
}

function makeFallbackObjectSprite(type: ObjectType): HTMLCanvasElement {
  switch (type) {
    case ObjectType.House:
      return makeHouseSprite();
    case ObjectType.Tree:
      return makeTreeSprite();
    case ObjectType.Stone:
      return makeStoneSprite();
    case ObjectType.Crate:
      return makeCrateSprite();
    case ObjectType.Well:
      return makeWellSprite();
    case ObjectType.Ruins:
      return makeRuinsSprite();
    case ObjectType.Sign:
      return makeSignSprite();
    case ObjectType.Chest:
      return makeChestSprite();
    case ObjectType.Horse:
      return makeHorseSprite();
    case ObjectType.Sheep:
      return makeSheepSprite();
    case ObjectType.GrassTuft:
      return makeGrassTuftSprite();
    default:
      return makeStoneSprite();
  }
}

function objectSlug(type: ObjectType): string {
  switch (type) {
    case ObjectType.House:
      return "house";
    case ObjectType.Tree:
      return "tree";
    case ObjectType.Stone:
      return "stone";
    case ObjectType.Crate:
      return "crate";
    case ObjectType.Well:
      return "well";
    case ObjectType.Ruins:
      return "ruins";
    case ObjectType.Sign:
      return "sign";
    case ObjectType.Chest:
      return "chest";
    case ObjectType.Horse:
      return "horse";
    case ObjectType.Sheep:
      return "sheep";
    case ObjectType.GrassTuft:
      return "grass-tuft";
    default:
      return "stone";
  }
}

function tileSlug(type: TileType): string {
  switch (type) {
    case TileType.Grass:
      return "grass";
    case TileType.Dirt:
      return "dirt";
    case TileType.Stone:
      return "stone";
    case TileType.Water:
      return "water";
    case TileType.Forest:
      return "forest";
    default:
      return "grass";
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${url}`));
    image.src = url;
  });
}

async function loadManifest(): Promise<GeneratedManifest | null> {
  try {
    const response = await fetch("./assets/generated/manifest.json", { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as GeneratedManifest;
  } catch {
    return null;
  }
}

export function sizeForObject(type: ObjectType): { width: number; height: number } {
  switch (type) {
    case ObjectType.House:
      return { width: TILE_SIZE * 1.8, height: TILE_SIZE * 1.8 };
    case ObjectType.Tree:
      return { width: TILE_SIZE * 1.4, height: TILE_SIZE * 1.6 };
    case ObjectType.Horse:
      return { width: TILE_SIZE * 1.2, height: TILE_SIZE * 1.1 };
    case ObjectType.Sheep:
      return { width: TILE_SIZE, height: TILE_SIZE * 0.95 };
    case ObjectType.Well:
    case ObjectType.Ruins:
      return { width: TILE_SIZE * 1.15, height: TILE_SIZE * 1.15 };
    case ObjectType.GrassTuft:
      return { width: TILE_SIZE * 0.75, height: TILE_SIZE * 0.75 };
    default:
      return { width: TILE_SIZE * 0.9, height: TILE_SIZE * 0.9 };
  }
}

export class AssetManager {
  private readonly tileSprites = new Map<TileType, SpriteSource[]>();
  private readonly objectSprites = new Map<ObjectType, SpriteSource>();
  private localPlayerSprite: SpriteSource = makePlayerSprite("#d49442", "#355d78", "#f1d4b3");
  private remotePlayerSprite: SpriteSource = makePlayerSprite("#8771c1", "#5b4c8e", "#ead5bf");

  constructor() {
    for (const type of [TileType.Grass, TileType.Dirt, TileType.Stone, TileType.Water, TileType.Forest]) {
      this.tileSprites.set(
        type,
        Array.from({ length: TILE_VARIANTS }, (_, variant) => makeTileVariant(type, variant))
      );
    }

    for (const type of [
      ObjectType.House,
      ObjectType.Tree,
      ObjectType.Stone,
      ObjectType.Crate,
      ObjectType.Well,
      ObjectType.Ruins,
      ObjectType.Sign,
      ObjectType.Chest,
      ObjectType.Horse,
      ObjectType.Sheep,
      ObjectType.GrassTuft
    ]) {
      this.objectSprites.set(type, makeFallbackObjectSprite(type));
    }
  }

  async loadGeneratedOverrides(): Promise<void> {
    const manifest = await loadManifest();
    if (!manifest) {
      return;
    }

    const work: Promise<void>[] = [];

    for (const type of [TileType.Grass, TileType.Dirt, TileType.Stone, TileType.Water, TileType.Forest]) {
      const tileFiles = manifest.tiles[tileSlug(type)] ?? [];
      for (let variant = 0; variant < TILE_VARIANTS; variant += 1) {
        const file = tileFiles[variant];
        if (!file) {
          continue;
        }
        const url = `./assets/generated/${file}`;
        work.push(
          loadImage(url)
            .then((image) => {
              const list = this.tileSprites.get(type);
              if (list) {
                list[variant] = image;
              }
              return undefined;
            })
            .catch(() => undefined)
        );
      }
    }

    for (const type of this.objectSprites.keys()) {
      const file = manifest.objects[objectSlug(type)];
      if (!file) {
        continue;
      }
      const url = `./assets/generated/${file}`;
      work.push(
        loadImage(url)
          .then((image) => {
            this.objectSprites.set(type, image);
            return undefined;
          })
          .catch(() => undefined)
      );
    }

    const localPlayerFile = manifest.players["local-player"];
    if (localPlayerFile) {
      work.push(
        loadImage(`./assets/generated/${localPlayerFile}`)
          .then((image) => {
            this.localPlayerSprite = image;
          })
          .catch(() => undefined)
      );
    }

    const remotePlayerFile = manifest.players["remote-player"];
    if (remotePlayerFile) {
      work.push(
        loadImage(`./assets/generated/${remotePlayerFile}`)
          .then((image) => {
            this.remotePlayerSprite = image;
          })
          .catch(() => undefined)
      );
    }

    await Promise.all(work);
  }

  getTileSprite(type: TileType, tileX: number, tileY: number): SpriteSource {
    const variants = this.tileSprites.get(type);
    if (!variants || variants.length === 0) {
      return makeTileVariant(type, 0);
    }
    const index = hash2d(WORLD_SEED + type * 17, tileX, tileY) % variants.length;
    return variants[index];
  }

  getObjectSprite(type: ObjectType): SpriteSource {
    return this.objectSprites.get(type) ?? makeFallbackObjectSprite(type);
  }

  getPlayerSprite(isLocal: boolean): SpriteSource {
    return isLocal ? this.localPlayerSprite : this.remotePlayerSprite;
  }
}
