import { ObjectType, TILE_SIZE, TileType, WORLD_SEED } from "../shared/protocol";

type SpriteSource = HTMLCanvasElement | HTMLImageElement;
export interface AssetArchiveEntry {
  id: string;
  label: string;
  group: string;
  kind: "ground" | "road" | "object" | "erase";
  preview: SpriteSource;
  tileType?: TileType;
  roadVariant?: number;
  objectType?: ObjectType;
  objectVariant?: number;
}

export interface AssetArchiveGroup {
  id: string;
  label: string;
  entries: AssetArchiveEntry[];
}

interface GeneratedManifest {
  tiles: Partial<Record<string, string[]>>;
  objects: Partial<Record<string, string>>;
  objectArchive?: Partial<Record<string, string[]>>;
  players: Partial<Record<string, string>>;
  bridges?: Partial<Record<string, string>>;
  worldSurface?: string;
}

const TILE_VARIANTS = 6;
const HOUSE_VARIANTS = 20;
const TILE_PIXEL_SIZE = 16;
const OBJECT_SIZE = 32;
const PLAYER_WIDTH = 16;
const PLAYER_HEIGHT = 20;
const USE_GENERATED_GROUND = false;
const BRIDGE_SLUGS = [
  "bridge-v",
  "bridge-h",
  "bridge-cross",
  "bridge-sw",
  "bridge-se",
  "bridge-nw",
  "bridge-ne",
  "bridge-t-east",
  "bridge-t-west",
  "bridge-t-north",
  "bridge-t-south"
] as const;

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
      const coarse = hash2d(WORLD_SEED + variant * 97 + type * 131, Math.floor(px / 3), Math.floor(py / 3)) % 100;
      let color = palette[1];

      if (type === TileType.Water) {
        color = coarse < 28 ? palette[3] : coarse < 76 ? palette[1] : palette[2];
        if ((py + variant) % 4 === 0) {
          color = palette[3];
        }
      } else if (type === TileType.Stone) {
        color = coarse < 22 ? palette[3] : coarse < 68 ? palette[1] : palette[2];
      } else if (type === TileType.Dirt) {
        color = coarse < 18 ? palette[3] : coarse < 70 ? palette[1] : palette[2];
      } else if (type === TileType.Forest) {
        color = coarse < 18 ? palette[3] : coarse < 74 ? palette[1] : palette[2];
      } else {
        color = coarse < 16 ? palette[3] : coarse < 72 ? palette[1] : palette[2];
      }

      paintPixel(ctx, px, py, pixel, color);
    }
  }

  const accent = palette[4];
  for (let i = 0; i < 3; i += 1) {
    const ax = 2 + (hash2d(WORLD_SEED + 700 + variant, i, type) % 12);
    const ay = 2 + (hash2d(WORLD_SEED + 900 + variant, type, i) % 12);
    paintPixel(ctx, ax, ay, pixel, accent);
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

function makeTreeVariantSprite(variant: number): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE * 2, OBJECT_SIZE * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  const trunkX = 14 + (variant % 4);
  const trunkHeight = 9 + (variant % 3);
  drawRectPx(ctx, trunkX, 19 - trunkHeight, 4, trunkHeight, 2, variant % 2 === 0 ? "#6d4828" : "#7d5330");
  const canopyRadius = 8 + (variant % 5);
  const palette = [
    ["#3f6e2f", "#5f9a44", "#8ec66c"],
    ["#2f5f2f", "#4e8747", "#78b563"],
    ["#446b29", "#679945", "#97c96f"],
    ["#355e27", "#56843f", "#7eb55e"]
  ][variant % 4];

  for (let y = 4; y <= 18; y += 1) {
    for (let x = 5; x <= 25; x += 1) {
      const offsetX = x - 16 + ((variant % 3) - 1);
      const offsetY = y - 10;
      const ellipse = (offsetX * offsetX) / ((canopyRadius + 1) * (canopyRadius + 1)) + (offsetY * offsetY) / (canopyRadius * canopyRadius);
      if (ellipse > 1) {
        continue;
      }
      const shadeIndex = (hash2d(WORLD_SEED + 400 + variant, x, y) % palette.length);
      paintPixel(ctx, x, y, 2, palette[shadeIndex]);
    }
  }

  return canvas;
}

function makeRoadSprite(variant: number): HTMLCanvasElement {
  const canvas = createCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const pixel = 2;
  const palette = ["#725339", "#936947", "#caa078", "#523723"];
  ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);

  const shape = variant % 8;
  for (let py = 0; py < 16; py += 1) {
    for (let px = 0; px < 16; px += 1) {
      const dx = px - 8;
      const dy = py - 8;
      let onRoad = false;
      let innerRoad = false;
      if (shape === 0) {
        onRoad = Math.abs(dx) <= 2;
        innerRoad = Math.abs(dx) <= 1;
      } else if (shape === 1 || shape === 4) {
        onRoad = Math.abs(dy) <= 2;
        innerRoad = Math.abs(dy) <= 1;
      } else if (shape === 2) {
        onRoad = Math.abs(dx) <= 2 || Math.abs(dy) <= 2;
        innerRoad = Math.abs(dx) <= 1 || Math.abs(dy) <= 1;
      } else if (shape === 3) {
        onRoad = (dx <= 0 && Math.abs(dy) <= 2) || (dy >= 0 && Math.abs(dx) <= 2);
        innerRoad = (dx <= 0 && Math.abs(dy) <= 1) || (dy >= 0 && Math.abs(dx) <= 1);
      } else if (shape === 5) {
        onRoad = (dx >= 0 && Math.abs(dy) <= 2) || (dy >= 0 && Math.abs(dx) <= 2);
        innerRoad = (dx >= 0 && Math.abs(dy) <= 1) || (dy >= 0 && Math.abs(dx) <= 1);
      } else if (shape === 6) {
        onRoad = (dx <= 0 && Math.abs(dy) <= 2) || (dy <= 0 && Math.abs(dx) <= 2);
        innerRoad = (dx <= 0 && Math.abs(dy) <= 1) || (dy <= 0 && Math.abs(dx) <= 1);
      } else {
        onRoad = (dx >= 0 && Math.abs(dy) <= 2) || (dy <= 0 && Math.abs(dx) <= 2);
        innerRoad = (dx >= 0 && Math.abs(dy) <= 1) || (dy <= 0 && Math.abs(dx) <= 1);
      }

      if (!onRoad) {
        continue;
      }

      let shade = palette[0];
      if (innerRoad) {
        shade = palette[2];
      } else if (Math.abs(dx) === 2 || Math.abs(dy) === 2) {
        shade = palette[3];
      } else {
        shade = palette[1 + (hash2d(WORLD_SEED + 800 + variant, px, py) % 2)];
      }
      paintPixel(ctx, px, py, pixel, shade);

      if (innerRoad && (px + py) % 7 === 0) {
        paintPixel(ctx, px, py, pixel, palette[1]);
      }
    }
  }

  return canvas;
}

function bridgeSlugForVariant(variant: number): string {
  switch (variant) {
    case 0:
      return "bridge-v";
    case 1:
      return "bridge-h";
    case 2:
      return "bridge-cross";
    case 3:
      return "bridge-sw";
    case 5:
      return "bridge-se";
    case 6:
      return "bridge-nw";
    case 7:
      return "bridge-ne";
    case 8:
      return "bridge-t-east";
    case 9:
      return "bridge-t-west";
    case 10:
      return "bridge-t-north";
    case 11:
      return "bridge-t-south";
    default:
      return "bridge-h";
  }
}

function makeBridgeSprite(slug: string): HTMLCanvasElement {
  const canvas = createCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  const pixel = 2;
  const rail = "#4a2e1d";
  const plankA = "#bf915d";
  const plankB = "#98683f";
  const highlight = "#e8c18c";
  const shadow = "#6f472b";

  const drawVertical = (fromY: number, toY: number): void => {
    for (let py = 0; py < 16; py += 1) {
      if (py < fromY || py > toY) {
        continue;
      }
      for (let px = 6; px <= 9; px += 1) {
        paintPixel(ctx, px, py, pixel, (py + px) % 2 === 0 ? plankA : plankB);
      }
      paintPixel(ctx, 5, py, pixel, rail);
      paintPixel(ctx, 10, py, pixel, rail);
      if (py % 3 === 0) {
        paintPixel(ctx, 7, py, pixel, highlight);
        paintPixel(ctx, 8, py, pixel, shadow);
      }
    }
  };

  const drawHorizontal = (fromX: number, toX: number): void => {
    for (let px = 0; px < 16; px += 1) {
      if (px < fromX || px > toX) {
        continue;
      }
      for (let py = 6; py <= 9; py += 1) {
        paintPixel(ctx, px, py, pixel, (px + py) % 2 === 0 ? plankA : plankB);
      }
      paintPixel(ctx, px, 5, pixel, rail);
      paintPixel(ctx, px, 10, pixel, rail);
      if (px % 3 === 0) {
        paintPixel(ctx, px, 7, pixel, highlight);
        paintPixel(ctx, px, 8, pixel, shadow);
      }
    }
  };

  if (slug === "bridge-v" || slug === "bridge-cross" || slug === "bridge-t-east" || slug === "bridge-t-west") {
    drawVertical(0, 15);
  }
  if (slug === "bridge-h" || slug === "bridge-cross" || slug === "bridge-t-north" || slug === "bridge-t-south") {
    drawHorizontal(0, 15);
  }
  if (slug === "bridge-sw" || slug === "bridge-nw") {
    drawHorizontal(0, 8);
    drawVertical(slug === "bridge-sw" ? 6 : 0, slug === "bridge-sw" ? 15 : 9);
  }
  if (slug === "bridge-se" || slug === "bridge-ne") {
    drawHorizontal(7, 15);
    drawVertical(slug === "bridge-se" ? 6 : 0, slug === "bridge-se" ? 15 : 9);
  }
  if (slug === "bridge-t-east") {
    drawHorizontal(8, 15);
  }
  if (slug === "bridge-t-west") {
    drawHorizontal(0, 8);
  }
  if (slug === "bridge-t-north") {
    drawVertical(0, 8);
  }
  if (slug === "bridge-t-south") {
    drawVertical(8, 15);
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

function makeHouseVariantSprite(variant: number): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE * 2, OBJECT_SIZE * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  const roofSets = [
    ["#a24630", "#c96343", "#6e2f20"],
    ["#8d4b2d", "#bf6d48", "#5f301e"],
    ["#7b3f52", "#aa6477", "#512838"],
    ["#6d5631", "#a1824d", "#49391d"],
    ["#8f5d25", "#c4873c", "#603c14"]
  ];
  const wallSets = [
    ["#d4b384", "#b68d5f", "#8f6a45"],
    ["#cbb29c", "#a48a75", "#7d6554"],
    ["#d8c59a", "#bca26e", "#8a6d42"],
    ["#ceb792", "#aa8d60", "#7b613f"]
  ];

  const roof = roofSets[variant % roofSets.length];
  const wall = wallSets[Math.floor(variant / roofSets.length) % wallSets.length];
  const bodyWidth = 14 + (variant % 3);
  const bodyHeight = 8 + ((variant >> 1) % 3);
  const bodyX = 9 - Math.floor(bodyWidth / 2);
  const bodyY = 12 + (variant % 2);
  const roofDepth = 5 + (variant % 2);
  const doorX = bodyX + 2 + (variant % Math.max(3, bodyWidth - 4));

  drawRectPx(ctx, bodyX, bodyY, bodyWidth, bodyHeight, 2, wall[0]);
  drawRectPx(ctx, bodyX, bodyY + bodyHeight - 1, bodyWidth, 1, 2, wall[1]);
  drawRectPx(ctx, doorX, bodyY + bodyHeight - 3, 2, 3, 2, "#6e4c30");
  drawRectPx(ctx, bodyX + 2, bodyY + 2, 2, 2, 2, "#93bdd5");
  drawRectPx(ctx, bodyX + bodyWidth - 4, bodyY + 2, 2, 2, 2, "#93bdd5");

  for (let row = 0; row < roofDepth; row += 1) {
    const inset = row;
    drawRectPx(ctx, bodyX - 1 + inset, bodyY - 1 - row, bodyWidth + 2 - inset * 2, 1, 2, row % 2 === 0 ? roof[0] : roof[1]);
  }

  if (variant % 4 === 0) {
    drawRectPx(ctx, bodyX + bodyWidth - 2, bodyY - roofDepth, 1, 3, 2, "#766155");
  }
  if (variant % 5 === 2) {
    drawRectPx(ctx, bodyX - 1, bodyY + 3, 1, 2, 2, wall[2]);
  }

  return canvas;
}

function makeLargeBuildingSprite(
  roofColors: [string, string, string],
  wallColors: [string, string, string],
  details?: (ctx: CanvasRenderingContext2D) => void
): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE * 2, OBJECT_SIZE * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  drawRectPx(ctx, 6, 16, 20, 10, 2, wallColors[0]);
  drawRectPx(ctx, 6, 24, 20, 2, 2, wallColors[1]);
  drawRectPx(ctx, 14, 20, 4, 6, 2, "#6b4c31");
  drawRectPx(ctx, 8, 18, 3, 3, 2, "#8fb9d0");
  drawRectPx(ctx, 21, 18, 3, 3, 2, "#8fb9d0");

  for (let row = 0; row < 8; row += 1) {
    drawRectPx(ctx, 4 + row, 15 - row, 24 - row * 2, 1, 2, row % 2 === 0 ? roofColors[0] : roofColors[1]);
  }

  drawRectPx(ctx, 23, 6, 2, 5, 2, roofColors[2]);
  details?.(ctx);
  return canvas;
}

function makePubSprite(): HTMLCanvasElement {
  return makeLargeBuildingSprite(["#8a4f24", "#bf7a3c", "#5d3317"], ["#d1b287", "#b28f64", "#886947"], (ctx) => {
    drawRectPx(ctx, 10, 12, 12, 2, 2, "#5e3723");
    drawRectPx(ctx, 11, 12, 10, 1, 2, "#d8c58e");
  });
}

function makeInnSprite(): HTMLCanvasElement {
  return makeLargeBuildingSprite(["#7f4052", "#aa6276", "#532738"], ["#d6c2a5", "#b09b7b", "#7f6a4e"], (ctx) => {
    drawRectPx(ctx, 10, 13, 12, 2, 2, "#c7a96c");
    drawRectPx(ctx, 24, 12, 3, 4, 2, "#d6c2a5");
  });
}

function makeBarnSprite(): HTMLCanvasElement {
  return makeLargeBuildingSprite(["#923d2b", "#b85840", "#63271c"], ["#c98455", "#a96d44", "#7e4e30"], (ctx) => {
    drawRectPx(ctx, 13, 18, 6, 8, 2, "#744227");
    drawRectPx(ctx, 15, 18, 2, 8, 2, "#a6714d");
  });
}

function makeStableSprite(): HTMLCanvasElement {
  return makeLargeBuildingSprite(["#73522d", "#9c7744", "#50381e"], ["#bc9c71", "#9c7b52", "#705634"], (ctx) => {
    drawRectPx(ctx, 8, 22, 16, 4, 2, "#7c5a36");
    drawRectPx(ctx, 8, 20, 2, 6, 2, "#5f4325");
    drawRectPx(ctx, 22, 20, 2, 6, 2, "#5f4325");
  });
}

function makeBlacksmithSprite(): HTMLCanvasElement {
  return makeLargeBuildingSprite(["#4b4f58", "#757a86", "#2b2d32"], ["#8c8f96", "#70737a", "#4f5259"], (ctx) => {
    drawRectPx(ctx, 24, 10, 2, 8, 2, "#45484d");
    drawRectPx(ctx, 26, 8, 1, 3, 2, "#c96937");
  });
}

function makeWindmillSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE * 2, OBJECT_SIZE * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  drawRectPx(ctx, 14, 14, 6, 14, 2, "#d3c4a3");
  drawRectPx(ctx, 15, 18, 4, 10, 2, "#af9b76");
  drawRectPx(ctx, 12, 10, 10, 4, 2, "#8a5237");
  drawRectPx(ctx, 7, 4, 2, 10, 2, "#c8b188");
  drawRectPx(ctx, 23, 4, 2, 10, 2, "#c8b188");
  drawRectPx(ctx, 8, 7, 16, 2, 2, "#efe7cb");
  drawRectPx(ctx, 14, 1, 2, 16, 2, "#efe7cb");
  return canvas;
}

function makeChapelSprite(): HTMLCanvasElement {
  return makeLargeBuildingSprite(["#5f5a66", "#878292", "#3d3742"], ["#d7d0c2", "#b9b1a0", "#8d8577"], (ctx) => {
    drawRectPx(ctx, 15, 8, 2, 8, 2, "#a89d8c");
    drawRectPx(ctx, 13, 10, 6, 2, 2, "#e9dfc4");
  });
}

function makeMarketSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE * 2, OBJECT_SIZE * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  drawRectPx(ctx, 7, 17, 18, 4, 2, "#d4b277");
  drawRectPx(ctx, 8, 13, 16, 4, 2, "#b74f4d");
  drawRectPx(ctx, 9, 13, 4, 4, 2, "#e5d7a0");
  drawRectPx(ctx, 15, 13, 4, 4, 2, "#e5d7a0");
  drawRectPx(ctx, 21, 13, 3, 4, 2, "#e5d7a0");
  drawRectPx(ctx, 8, 21, 2, 5, 2, "#6e4a2e");
  drawRectPx(ctx, 22, 21, 2, 5, 2, "#6e4a2e");
  return canvas;
}

function makeManorSprite(): HTMLCanvasElement {
  return makeLargeBuildingSprite(["#7f4b3a", "#b3664d", "#572f22"], ["#d7c7b2", "#b89d83", "#876f5b"], (ctx) => {
    drawRectPx(ctx, 10, 13, 12, 4, 2, "#d7c7b2");
    drawRectPx(ctx, 13, 20, 6, 6, 2, "#71462d");
  });
}

function makeTownHallSprite(): HTMLCanvasElement {
  return makeLargeBuildingSprite(["#784824", "#a36a35", "#512f17"], ["#d1bc98", "#ab916d", "#7f694e"], (ctx) => {
    drawRectPx(ctx, 11, 12, 10, 3, 2, "#d6c274");
    drawRectPx(ctx, 15, 8, 2, 5, 2, "#8a6d39");
  });
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

function makeDogSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE, OBJECT_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const s = 2;
  drawRectPx(ctx, 5, 9, 5, 3, s, "#8d6a4b");
  drawRectPx(ctx, 9, 8, 2, 2, s, "#6b4b32");
  drawRectPx(ctx, 5, 12, 1, 2, s, "#4b331f");
  drawRectPx(ctx, 8, 12, 1, 2, s, "#4b331f");
  paintPixel(ctx, 10, 9, s, "#1f1a15");
  return canvas;
}

function makeCatSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE, OBJECT_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const s = 2;
  drawRectPx(ctx, 6, 9, 4, 3, s, "#d2b784");
  drawRectPx(ctx, 8, 8, 2, 2, s, "#b99667");
  drawRectPx(ctx, 5, 10, 1, 3, s, "#8a6e47");
  paintPixel(ctx, 9, 9, s, "#1f1a15");
  return canvas;
}

function makeSparkMouseSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE, OBJECT_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const s = 2;
  drawRectPx(ctx, 6, 8, 5, 4, s, "#f0d445");
  drawRectPx(ctx, 7, 7, 4, 1, s, "#f6e275");
  drawRectPx(ctx, 6, 6, 1, 2, s, "#202020");
  drawRectPx(ctx, 10, 6, 1, 2, s, "#202020");
  drawRectPx(ctx, 7, 8, 1, 1, s, "#1b1b1b");
  drawRectPx(ctx, 9, 8, 1, 1, s, "#1b1b1b");
  paintPixel(ctx, 7, 9, s, "#d64537");
  paintPixel(ctx, 9, 9, s, "#d64537");
  drawRectPx(ctx, 5, 9, 1, 3, s, "#f0d445");
  drawRectPx(ctx, 11, 9, 1, 2, s, "#f0d445");
  drawRectPx(ctx, 11, 11, 2, 1, s, "#7f4a25");
  drawRectPx(ctx, 13, 11, 1, 1, s, "#f0d445");
  drawRectPx(ctx, 14, 10, 1, 1, s, "#7f4a25");
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
    case ObjectType.Pub:
      return makePubSprite();
    case ObjectType.Inn:
      return makeInnSprite();
    case ObjectType.Barn:
      return makeBarnSprite();
    case ObjectType.Stable:
      return makeStableSprite();
    case ObjectType.Blacksmith:
      return makeBlacksmithSprite();
    case ObjectType.Windmill:
      return makeWindmillSprite();
    case ObjectType.Chapel:
      return makeChapelSprite();
    case ObjectType.Market:
      return makeMarketSprite();
    case ObjectType.Manor:
      return makeManorSprite();
    case ObjectType.TownHall:
      return makeTownHallSprite();
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
    case ObjectType.Dog:
      return makeDogSprite();
    case ObjectType.Cat:
      return makeCatSprite();
    case ObjectType.SparkMouse:
      return makeSparkMouseSprite();
    default:
      return makeStoneSprite();
  }
}

function objectSlug(type: ObjectType): string {
  switch (type) {
    case ObjectType.House:
      return "house";
    case ObjectType.Pub:
      return "pub";
    case ObjectType.Inn:
      return "inn";
    case ObjectType.Barn:
      return "barn";
    case ObjectType.Stable:
      return "stable";
    case ObjectType.Blacksmith:
      return "blacksmith";
    case ObjectType.Windmill:
      return "windmill";
    case ObjectType.Chapel:
      return "chapel";
    case ObjectType.Market:
      return "market";
    case ObjectType.Manor:
      return "manor";
    case ObjectType.TownHall:
      return "townhall";
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
    case ObjectType.Dog:
      return "dog";
    case ObjectType.Cat:
      return "cat";
    case ObjectType.SparkMouse:
      return "sparkmouse";
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
      return { width: TILE_SIZE * 3.2, height: TILE_SIZE * 3.2 };
    case ObjectType.Pub:
    case ObjectType.Inn:
    case ObjectType.Barn:
    case ObjectType.Stable:
    case ObjectType.Blacksmith:
    case ObjectType.Chapel:
    case ObjectType.Manor:
    case ObjectType.TownHall:
      return { width: TILE_SIZE * 4.2, height: TILE_SIZE * 4.2 };
    case ObjectType.Windmill:
      return { width: TILE_SIZE * 3.8, height: TILE_SIZE * 4.8 };
    case ObjectType.Market:
      return { width: TILE_SIZE * 3.2, height: TILE_SIZE * 2.8 };
    case ObjectType.Tree:
      return { width: TILE_SIZE * 2.2, height: TILE_SIZE * 2.5 };
    case ObjectType.Horse:
      return { width: TILE_SIZE * 1.6, height: TILE_SIZE * 1.4 };
    case ObjectType.Sheep:
      return { width: TILE_SIZE * 0.95, height: TILE_SIZE * 0.85 };
    case ObjectType.Dog:
      return { width: TILE_SIZE * 0.8, height: TILE_SIZE * 0.7 };
    case ObjectType.Cat:
      return { width: TILE_SIZE * 0.7, height: TILE_SIZE * 0.65 };
    case ObjectType.SparkMouse:
      return { width: TILE_SIZE * 0.9, height: TILE_SIZE * 0.85 };
    case ObjectType.Well:
    case ObjectType.Ruins:
      return { width: TILE_SIZE * 1.75, height: TILE_SIZE * 1.75 };
    case ObjectType.GrassTuft:
      return { width: TILE_SIZE * 0.6, height: TILE_SIZE * 0.6 };
    default:
      return { width: TILE_SIZE * 1.1, height: TILE_SIZE * 1.1 };
  }
}

export class AssetManager {
  private readonly tileSprites = new Map<TileType, SpriteSource[]>();
  private readonly objectSprites = new Map<ObjectType, SpriteSource>();
  private readonly objectArchives = new Map<ObjectType, SpriteSource[]>();
  private readonly houseArchive: SpriteSource[] = Array.from({ length: HOUSE_VARIANTS }, (_, index) => makeHouseVariantSprite(index));
  private readonly treeArchive: SpriteSource[] = Array.from({ length: 20 }, (_, index) => makeTreeVariantSprite(index));
  private readonly roadArchive: SpriteSource[] = Array.from({ length: 20 }, (_, index) => makeRoadSprite(index));
  private readonly bridgeSprites = new Map<string, SpriteSource>();
  private localPlayerSprite: SpriteSource = makePlayerSprite("#d49442", "#355d78", "#f1d4b3");
  private remotePlayerSprite: SpriteSource = makePlayerSprite("#8771c1", "#5b4c8e", "#ead5bf");
  private worldSurface: SpriteSource | null = null;

  constructor() {
    for (const type of [TileType.Grass, TileType.Dirt, TileType.Stone, TileType.Water, TileType.Forest]) {
      this.tileSprites.set(
        type,
        Array.from({ length: TILE_VARIANTS }, (_, variant) => makeTileVariant(type, variant))
      );
    }

    for (const type of [
      ObjectType.House,
      ObjectType.Pub,
      ObjectType.Inn,
      ObjectType.Barn,
      ObjectType.Stable,
      ObjectType.Blacksmith,
      ObjectType.Windmill,
      ObjectType.Chapel,
      ObjectType.Market,
      ObjectType.Manor,
      ObjectType.TownHall,
      ObjectType.Tree,
      ObjectType.Stone,
      ObjectType.Crate,
      ObjectType.Well,
      ObjectType.Ruins,
      ObjectType.Sign,
      ObjectType.Chest,
      ObjectType.Horse,
      ObjectType.Sheep,
      ObjectType.GrassTuft,
      ObjectType.Dog,
      ObjectType.Cat,
      ObjectType.SparkMouse
    ]) {
      const fallback = makeFallbackObjectSprite(type);
      this.objectSprites.set(type, fallback);
      this.objectArchives.set(type, [fallback]);
    }

    for (const slug of BRIDGE_SLUGS) {
      this.bridgeSprites.set(slug, makeBridgeSprite(slug));
    }
  }

  async loadGeneratedOverrides(): Promise<void> {
    const manifest = await loadManifest();
    if (!manifest) {
      return;
    }

    const work: Promise<void>[] = [];

    if (USE_GENERATED_GROUND) {
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

    for (const type of this.objectSprites.keys()) {
      if (type === ObjectType.House) {
        continue;
      }
      const archiveFiles = manifest.objectArchive?.[objectSlug(type)] ?? [];
      if (archiveFiles.length === 0) {
        continue;
      }

      if (type === ObjectType.Tree) {
        for (let index = 0; index < archiveFiles.length; index += 1) {
          const file = archiveFiles[index];
          work.push(
            loadImage(`./assets/generated/${file}`)
              .then((image) => {
                if (index < this.treeArchive.length) {
                  this.treeArchive[index] = image;
                } else {
                  this.treeArchive.push(image);
                }
                this.objectSprites.set(type, this.treeArchive[0]);
                this.objectArchives.set(type, [...this.treeArchive]);
              })
              .catch(() => undefined)
          );
        }
        continue;
      }

      const loadedArchive: SpriteSource[] = [];
      for (const file of archiveFiles) {
        work.push(
          loadImage(`./assets/generated/${file}`)
            .then((image) => {
              loadedArchive.push(image);
              this.objectArchives.set(type, [...loadedArchive]);
              this.objectSprites.set(type, loadedArchive[loadedArchive.length - 1]);
            })
            .catch(() => undefined)
        );
      }
    }

    const generatedHouseVariants = manifest.objectArchive?.house ?? [];
    for (let index = 0; index < Math.min(generatedHouseVariants.length, this.houseArchive.length); index += 1) {
      const file = generatedHouseVariants[index];
      if (!file) {
        continue;
      }
      work.push(
        loadImage(`./assets/generated/${file}`)
          .then((image) => {
            this.houseArchive[index] = image;
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

    for (const slug of BRIDGE_SLUGS) {
      const file = manifest.bridges?.[slug];
      if (!file) {
        continue;
      }
      work.push(
        loadImage(`./assets/generated/${file}`)
          .then((image) => {
            this.bridgeSprites.set(slug, image);
          })
          .catch(() => undefined)
      );
    }

    if (manifest.worldSurface) {
      work.push(
        loadImage(`./assets/generated/${manifest.worldSurface}`)
          .then((image) => {
            this.worldSurface = image;
          })
          .catch(() => undefined)
      );
    }

    await Promise.all(work);
  }

  getWorldSurface(): SpriteSource | null {
    return this.worldSurface;
  }

  getRoadSprite(variant: number): SpriteSource {
    return this.roadArchive[Math.abs(variant) % this.roadArchive.length];
  }

  getBridgeSprite(variant: number): SpriteSource {
    const slug = bridgeSlugForVariant(variant);
    return this.bridgeSprites.get(slug) ?? makeBridgeSprite(slug);
  }

  getTileSprite(type: TileType, tileX: number, tileY: number): SpriteSource {
    const variants = this.tileSprites.get(type);
    if (!variants || variants.length === 0) {
      return makeTileVariant(type, 0);
    }
    const index = hash2d(WORLD_SEED + type * 17, tileX, tileY) % variants.length;
    return variants[index];
  }

  getObjectSprite(type: ObjectType, variant?: number): SpriteSource {
    if (type === ObjectType.House) {
      const index = Math.max(0, Math.min(this.houseArchive.length - 1, variant ?? 0));
      return this.houseArchive[index];
    }
    if (type === ObjectType.Tree && variant !== undefined) {
      const index = Math.max(0, Math.min(this.treeArchive.length - 1, variant));
      return index === 0 ? this.objectSprites.get(type) ?? this.treeArchive[0] : this.treeArchive[index];
    }
    const archive = this.objectArchives.get(type);
    if (archive && archive.length > 0) {
      const index = Math.max(0, Math.min(archive.length - 1, variant ?? archive.length - 1));
      return archive[index];
    }
    return this.objectSprites.get(type) ?? makeFallbackObjectSprite(type);
  }

  getPlayerSprite(isLocal: boolean): SpriteSource {
    return isLocal ? this.localPlayerSprite : this.remotePlayerSprite;
  }

  private getObjectArchive(type: ObjectType): SpriteSource[] {
    if (type === ObjectType.House) {
      return this.houseArchive;
    }
    if (type === ObjectType.Tree) {
      return this.treeArchive;
    }
    return this.objectArchives.get(type) ?? [this.getObjectSprite(type)];
  }

  private buildObjectEntries(
    type: ObjectType,
    label: string,
    group: string,
    idPrefix: string
  ): AssetArchiveEntry[] {
    const archive = this.getObjectArchive(type);
    if (archive.length <= 1) {
      return [
        {
          id: idPrefix,
          label,
          group,
          kind: "object",
          preview: archive[0] ?? this.getObjectSprite(type),
          objectType: type,
          objectVariant: 0
        }
      ];
    }

    return archive.map((preview, index) => ({
      id: `${idPrefix}-${index}`,
      label: `${label} ${index + 1}`,
      group,
      kind: "object",
      preview,
      objectType: type,
      objectVariant: index
    }));
  }

  getArchiveGroups(): AssetArchiveGroup[] {
    const grounds: AssetArchiveEntry[] = [
      { id: "ground-grass", label: "Grass", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.Grass, 0, 0), tileType: TileType.Grass },
      { id: "ground-dirt", label: "Dirt", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.Dirt, 0, 0), tileType: TileType.Dirt },
      { id: "ground-stone", label: "Stone", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.Stone, 0, 0), tileType: TileType.Stone },
      { id: "ground-water", label: "Water", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.Water, 0, 0), tileType: TileType.Water },
      { id: "ground-forest", label: "Forest", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.Forest, 0, 0), tileType: TileType.Forest }
    ];

    const roads: AssetArchiveEntry[] = this.roadArchive.map((sprite, index) => ({
      id: `road-${index}`,
      label: `Road ${index + 1}`,
      group: "roads",
      kind: "road",
      preview: sprite,
      roadVariant: index
    }));

    const trees: AssetArchiveEntry[] = this.treeArchive.map((sprite, index) => ({
      id: `tree-${index}`,
      label: `Tree ${index + 1}`,
      group: "trees",
      kind: "object",
      preview: index === 0 ? this.getObjectSprite(ObjectType.Tree) : sprite,
      objectType: ObjectType.Tree,
      objectVariant: index
    }));

    const buildings: AssetArchiveEntry[] = [
      ...this.houseArchive.map((sprite, index) => ({
        id: `building-house-${index}`,
        label: `House ${index + 1}`,
        group: "buildings",
        kind: "object" as const,
        preview: sprite,
        objectType: ObjectType.House,
        objectVariant: index
      })),
      ...this.buildObjectEntries(ObjectType.Pub, "Pub", "buildings", "building-pub"),
      ...this.buildObjectEntries(ObjectType.Inn, "Inn", "buildings", "building-inn"),
      ...this.buildObjectEntries(ObjectType.Barn, "Barn", "buildings", "building-barn"),
      ...this.buildObjectEntries(ObjectType.Stable, "Stable", "buildings", "building-stable"),
      ...this.buildObjectEntries(ObjectType.Blacksmith, "Smith", "buildings", "building-blacksmith"),
      ...this.buildObjectEntries(ObjectType.Windmill, "Mill", "buildings", "building-windmill"),
      ...this.buildObjectEntries(ObjectType.Chapel, "Chapel", "buildings", "building-chapel"),
      ...this.buildObjectEntries(ObjectType.Market, "Market", "buildings", "building-market"),
      ...this.buildObjectEntries(ObjectType.Manor, "Manor", "buildings", "building-manor"),
      ...this.buildObjectEntries(ObjectType.TownHall, "Hall", "buildings", "building-townhall"),
      ...this.buildObjectEntries(ObjectType.Well, "Well", "buildings", "building-well"),
      ...this.buildObjectEntries(ObjectType.Sign, "Sign", "buildings", "building-sign")
    ];

    const props: AssetArchiveEntry[] = [
      ...this.buildObjectEntries(ObjectType.Horse, "Horse", "props", "prop-horse"),
      ...this.buildObjectEntries(ObjectType.Sheep, "Sheep", "props", "prop-sheep"),
      ...this.buildObjectEntries(ObjectType.Dog, "Dog", "props", "prop-dog"),
      ...this.buildObjectEntries(ObjectType.Cat, "Cat", "props", "prop-cat"),
      ...this.buildObjectEntries(ObjectType.SparkMouse, "Spark", "props", "prop-sparkmouse"),
      ...this.buildObjectEntries(ObjectType.Stone, "Stone", "props", "prop-stone"),
      ...this.buildObjectEntries(ObjectType.Crate, "Crate", "props", "prop-crate")
    ];

    return [
      { id: "ground", label: "Ground", entries: grounds },
      { id: "roads", label: "Roads", entries: roads },
      { id: "trees", label: "Trees", entries: trees },
      { id: "buildings", label: "Buildings", entries: buildings },
      { id: "props", label: "Props", entries: props },
      { id: "erase", label: "Erase", entries: [{ id: "erase-brush", label: "Erase", group: "erase", kind: "erase", preview: this.getTileSprite(TileType.Dirt, 1, 1) }] }
    ];
  }
}
