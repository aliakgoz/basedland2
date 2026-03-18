import { AnimationState, Direction, ObjectType, TILE_SIZE, TileType, WORLD_SEED } from "../shared/protocol";
import type { PlayerAppearance, PlayerEntity } from "./entity";

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

export const CUSTOM_ROAD_WOOD_DECK = 100;
export const CUSTOM_ROAD_WOOD_ARCH = 101;

interface GeneratedManifest {
  tiles: Partial<Record<string, string[]>>;
  objects: Partial<Record<string, string>>;
  objectArchive?: Partial<Record<string, string[]>>;
  players: Partial<Record<string, string>>;
  bridges?: Partial<Record<string, string>>;
  roads?: Partial<Record<string, string>>;
  worldSurface?: string;
}

const TILE_VARIANTS = 6;
const HOUSE_VARIANTS = 20;
const TREE_VARIANTS = 20;
const HILL_STAMP_VARIANTS = 3;
const MOUNTAIN_STAMP_VARIANTS = 3;
const GARDEN_STAMP_VARIANTS = 11;
const TILE_PIXEL_SIZE = 16;
const OBJECT_SIZE = 32;
const PLAYER_FRAME_SIZE = 64;
const PLAYER_SHEET_COLUMNS = 4;
const PLAYER_SHEET_ROWS = 4;
const PLAYER_GRID_SIZE = 32;
const PLAYER_GRID_SCALE = PLAYER_FRAME_SIZE / PLAYER_GRID_SIZE;
const PLAYER_WIDTH = 16;
const PLAYER_HEIGHT = 20;
const OBJECT_WORLD_SCALE = 2;
const USE_GENERATED_GROUND = false;
const GENERATED_GROUND_OVERRIDES = new Set<TileType>();
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
const LARGE_BUILDING_TYPES = new Set<ObjectType>([
  ObjectType.Pub,
  ObjectType.Inn,
  ObjectType.Barn,
  ObjectType.Stable,
  ObjectType.Blacksmith,
  ObjectType.Windmill,
  ObjectType.Chapel,
  ObjectType.Market,
  ObjectType.Manor,
  ObjectType.TownHall
]);
const HORSE_VARIANTS = 3;
const EDITOR_GROUND_TILES: TileType[] = [
  TileType.Grass,
  TileType.Dirt,
  TileType.Stone,
  TileType.Water,
  TileType.Forest,
  TileType.Hill,
  TileType.GrassDug,
  TileType.DirtDug,
  TileType.ForestDug,
  TileType.StoneDug,
  TileType.HillDug,
  TileType.BarleyField,
  TileType.WheatField,
  TileType.Orchard,
  TileType.Vineyard,
  TileType.Garden,
  TileType.PumpkinPatch,
  TileType.CabbagePatch,
  TileType.BerryGarden,
  TileType.HerbGarden,
  TileType.FallowField
];

type Rgb = [number, number, number];
type PlayerPaletteRole = "hair" | "primary" | "secondary" | "accent" | "skin" | "boots";

interface PlayerPalette {
  hair: [string, string, string];
  primary: [string, string, string];
  secondary: [string, string, string];
  accent: [string, string, string];
  skin: [string, string, string];
  boots: [string, string, string];
}

interface HorsePalette {
  coat: [string, string, string];
  mane: [string, string, string];
  tack: [string, string, string];
  muzzle: string;
  hoof: string;
  eye: string;
}

interface PlayerBuild {
  headWidth: number;
  headHeight: number;
  torsoWidth: number;
  torsoHeight: number;
  shoulderWidth: number;
  armLength: number;
  legLength: number;
  armThickness: number;
  legThickness: number;
  legGap: number;
  bootHeight: number;
}

interface PlayerPoint {
  x: number;
  y: number;
}

interface PlayerOutfit {
  collar: 0 | 1 | 2;
  shoulderPads: boolean;
  cape: boolean;
  coatTail: 0 | 1 | 2;
  gloves: boolean;
  bootCuffs: boolean;
  hairStyle: 0 | 1 | 2 | 3;
  beltPouch: boolean;
  trim: 0 | 1 | 2;
}

const TILE_PALETTES: Record<TileType, string[]> = {
  [TileType.Grass]: ["#6fa84f", "#78b154", "#5d913f", "#8fc76d", "#4f7b33"],
  [TileType.Dirt]: ["#8f6b46", "#a17b54", "#6d4e34", "#b48c62", "#503724"],
  [TileType.Stone]: ["#8f9396", "#a8adb0", "#71767a", "#c4c8cb", "#565c61"],
  [TileType.Water]: ["#4a7cab", "#5a92c5", "#34648e", "#83b3dd", "#294f70"],
  [TileType.Forest]: ["#456f37", "#50813f", "#345a29", "#6b9d55", "#27461f"],
  [TileType.Hill]: ["#7b776e", "#908b80", "#635f57", "#aaa59a", "#4f4b45"],
  [TileType.BarleyField]: ["#8f6b46", "#c7b85a", "#9f8b34", "#e1d17a", "#6f5a24"],
  [TileType.WheatField]: ["#8f6b46", "#d8c468", "#b79b3c", "#f0dd8b", "#7d6325"],
  [TileType.Orchard]: ["#7b9b58", "#5b7f36", "#b94d43", "#e2d6b8", "#3d5d23"],
  [TileType.Vineyard]: ["#8a7c5a", "#6d8d3b", "#5c3f7d", "#8fc86b", "#4b2e64"],
  [TileType.Garden]: ["#8f6b46", "#67a84e", "#d85c6f", "#f0cf63", "#4a7eb5"],
  [TileType.PumpkinPatch]: ["#8f6b46", "#5e8a3f", "#d97a2b", "#f0b25f", "#3e5d2b"],
  [TileType.CabbagePatch]: ["#8f6b46", "#6cae58", "#4e8747", "#93cf8a", "#355d31"],
  [TileType.BerryGarden]: ["#8f6b46", "#5d993f", "#8f2d5c", "#d75d92", "#3a6e2d"],
  [TileType.HerbGarden]: ["#8f6b46", "#6fcf8a", "#3e9f6c", "#b6efc5", "#266649"],
  [TileType.FallowField]: ["#92704a", "#a37d54", "#7a593a", "#bc9469", "#5c4029"],
  [TileType.GrassDug]: ["#6fa84f", "#78b154", "#5d913f", "#8fc76d", "#4f7b33"],
  [TileType.DirtDug]: ["#8f6b46", "#a17b54", "#6d4e34", "#b48c62", "#503724"],
  [TileType.ForestDug]: ["#456f37", "#50813f", "#345a29", "#6b9d55", "#27461f"],
  [TileType.StoneDug]: ["#8f9396", "#a8adb0", "#71767a", "#c4c8cb", "#565c61"],
  [TileType.HillDug]: ["#7b776e", "#908b80", "#635f57", "#aaa59a", "#4f4b45"]
};

const PLAYER_WALK_SEQUENCE = [0, 1, 2, 3, 2, 1] as const;
const PLAYER_PLACEHOLDER_COLORS: Record<PlayerPaletteRole, [Rgb, Rgb, Rgb]> = {
  hair: [
    [255, 201, 92],
    [214, 142, 42],
    [125, 76, 24]
  ],
  primary: [
    [39, 215, 255],
    [20, 151, 207],
    [10, 92, 140]
  ],
  secondary: [
    [255, 105, 200],
    [196, 58, 143],
    [127, 30, 89]
  ],
  accent: [
    [164, 255, 101],
    [93, 191, 62],
    [46, 111, 34]
  ],
  skin: [
    [244, 198, 160],
    [214, 154, 114],
    [157, 103, 74]
  ],
  boots: [
    [138, 92, 54],
    [94, 61, 37],
    [44, 28, 20]
  ]
};

const PLAYER_HAIR_RAMPS: [string, string, string][] = [
  ["#f3d36c", "#bc8d34", "#6c4518"],
  ["#d9a45b", "#996634", "#58361a"],
  ["#f6e2b7", "#cdb48c", "#7c6747"],
  ["#f07d60", "#b94a36", "#6b2319"],
  ["#7c5440", "#533728", "#2f1c14"]
];

const PLAYER_PRIMARY_RAMPS: [string, string, string][] = [
  ["#5ec7ff", "#2b8fc2", "#155474"],
  ["#90d15e", "#4a9d43", "#275f2d"],
  ["#e9b65e", "#bf7f33", "#6a4818"],
  ["#d57be6", "#954cb3", "#56296d"],
  ["#e86f8f", "#b04563", "#6a2338"]
];

const PLAYER_SECONDARY_RAMPS: [string, string, string][] = [
  ["#f5efe5", "#cbbfa9", "#7b6d5d"],
  ["#f0d287", "#c79440", "#70511d"],
  ["#7de3d1", "#3ea596", "#1f5d56"],
  ["#dcbdf7", "#9f78cb", "#583f77"],
  ["#f1ae9c", "#c47163", "#744036"]
];

const PLAYER_ACCENT_RAMPS: [string, string, string][] = [
  ["#ffe88a", "#d8b94c", "#7f6524"],
  ["#b6ff92", "#74be49", "#386924"],
  ["#ffa27c", "#d16c45", "#7d341f"],
  ["#8ee8ff", "#4ba5ca", "#21576e"],
  ["#ffd0ee", "#c782aa", "#703c61"]
];

const PLAYER_SKIN_RAMPS: [string, string, string][] = [
  ["#f3d1b3", "#d39d79", "#946247"],
  ["#e9be9c", "#bd8867", "#7d513b"],
  ["#d59c75", "#a26d4d", "#693f2d"],
  ["#8d6247", "#6d4735", "#472c20"]
];

const HORSE_PALETTES: HorsePalette[] = [
  {
    coat: ["#9c6742", "#7b4e2f", "#513219"],
    mane: ["#4a2a18", "#30180f", "#1c0d09"],
    tack: ["#916d3e", "#6a4c26", "#3a2714"],
    muzzle: "#c9a17f",
    hoof: "#2c2017",
    eye: "#130f0d"
  },
  {
    coat: ["#a8aab2", "#7f828b", "#595d66"],
    mane: ["#585a63", "#3d3f48", "#23252d"],
    tack: ["#6f5a46", "#4a3828", "#291d14"],
    muzzle: "#ddd4c8",
    hoof: "#262220",
    eye: "#121212"
  },
  {
    coat: ["#444247", "#2f2d31", "#18171a"],
    mane: ["#1d1c1f", "#101013", "#050506"],
    tack: ["#8f6b3b", "#614824", "#332512"],
    muzzle: "#8d7d74",
    hoof: "#090909",
    eye: "#f1efe9"
  }
];

const TREE_PALETTES: Array<{
  trunk: [string, string];
  leaves: [string, string, string, string];
}> = [
  {
    trunk: ["#5d3b24", "#7f5737"],
    leaves: ["#315d2c", "#48803f", "#69a658", "#9bd37e"]
  },
  {
    trunk: ["#6d472a", "#8e6039"],
    leaves: ["#27554d", "#34756a", "#4da08f", "#88cfbe"]
  },
  {
    trunk: ["#644124", "#845735"],
    leaves: ["#4f5a1f", "#728435", "#96ad52", "#c8d97b"]
  },
  {
    trunk: ["#5e3826", "#7c4f34"],
    leaves: ["#5a2d26", "#8a4537", "#b7684d", "#df9c74"]
  }
];

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

function drawMirroredRectPx(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  size: number,
  color: string
): void {
  drawRectPx(ctx, PLAYER_WIDTH - x - width, y, width, height, size, color);
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

  const dugBaseType = (() => {
    switch (type) {
      case TileType.GrassDug:
        return TileType.Grass;
      case TileType.DirtDug:
        return TileType.Dirt;
      case TileType.ForestDug:
        return TileType.Forest;
      case TileType.StoneDug:
        return TileType.Stone;
      case TileType.HillDug:
        return TileType.Hill;
      default:
        return null;
    }
  })();

  if (dugBaseType !== null) {
    const base = makeTileVariant(dugBaseType, variant);
    ctx.drawImage(base, 0, 0);
    const pixel = TILE_SIZE / TILE_PIXEL_SIZE;
    const spoilA = type === TileType.StoneDug || type === TileType.HillDug ? "#8b745c" : "#9a6f43";
    const spoilB = type === TileType.StoneDug || type === TileType.HillDug ? "#b09779" : "#bf8f58";
    const spoilC = type === TileType.StoneDug || type === TileType.HillDug ? "#5c4a38" : "#6d4e31";
    const pitDark = "#2f241c";
    const pitMid = type === TileType.StoneDug || type === TileType.HillDug ? "#53453a" : "#4a3424";
    const pitEdge = type === TileType.StoneDug || type === TileType.HillDug ? "#706154" : "#7d5a39";

    for (let py = 4; py <= 12; py += 1) {
      for (let px = 3; px <= 12; px += 1) {
        const dx = (px - 7.5) / 4.6;
        const dy = (py - 8) / 3.5;
        const dist = dx * dx + dy * dy;
        if (dist > 1.08) {
          continue;
        }
        let color = pitMid;
        if (dist > 0.78) {
          color = pitEdge;
        }
        if (dist < 0.35) {
          color = pitDark;
        }
        paintPixel(ctx, px, py, pixel, color);
      }
    }

    for (let py = 2; py <= 6; py += 1) {
      for (let px = 9; px <= 14; px += 1) {
        const dx = (px - 11.5) / 3.2;
        const dy = (py - 4) / 2.3;
        if (dx * dx + dy * dy > 1.1) {
          continue;
        }
        const roll = hash2d(WORLD_SEED + 5200 + type * 17 + variant, px, py) % 3;
        const color = roll === 0 ? spoilA : roll === 1 ? spoilB : spoilC;
        paintPixel(ctx, px, py, pixel, color);
      }
    }

    for (let py = 3; py <= 5; py += 1) {
      for (let px = 11; px <= 13; px += 1) {
        if ((px + py + variant) % 2 === 0) {
          paintPixel(ctx, px, py, pixel, spoilB);
        }
      }
    }

    for (let step = 0; step < 6; step += 1) {
      const px = 9 + step;
      const py = 6 + Math.floor(step / 2);
      paintPixel(ctx, px, py, pixel, spoilC);
    }

    return canvas;
  }

  const pixel = TILE_SIZE / TILE_PIXEL_SIZE;
  const palette = TILE_PALETTES[type];
  const bg = palette[0];
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  const paintPlant = (px: number, py: number, color: string): void => {
    paintPixel(ctx, px, py, pixel, color);
    if (py + 1 < TILE_PIXEL_SIZE) {
      paintPixel(ctx, px, py + 1, pixel, color);
    }
  };

  const drawRidges = (): void => {
    for (let py = 0; py < TILE_PIXEL_SIZE; py += 1) {
      for (let px = 0; px < TILE_PIXEL_SIZE; px += 1) {
        const color = ((px + variant) % 4) < 2 ? palette[1] : palette[2];
        paintPixel(ctx, px, py, pixel, color);
      }
    }
  };

  if (type === TileType.Hill) {
    for (let py = 0; py < TILE_PIXEL_SIZE; py += 1) {
      for (let px = 0; px < TILE_PIXEL_SIZE; px += 1) {
        const color = (px + py + variant) % 5 === 0 ? palette[3] : (px - py + variant + 20) % 4 === 0 ? palette[2] : palette[1];
        paintPixel(ctx, px, py, pixel, color);
      }
    }
    for (let band = 0; band < 4; band += 1) {
      const y = 3 + band * 3 + (variant % 2);
      for (let x = 0; x < TILE_PIXEL_SIZE; x += 1) {
        if ((x + band) % 2 === 0) {
          paintPixel(ctx, x, y, pixel, palette[4]);
        }
      }
    }
    return canvas;
  }

  if (type === TileType.BarleyField || type === TileType.WheatField || type === TileType.FallowField) {
    drawRidges();
    for (let px = 1; px < TILE_PIXEL_SIZE; px += 3) {
      for (let py = 1; py < TILE_PIXEL_SIZE; py += 3) {
        const color = type === TileType.FallowField ? palette[3] : ((px + py + variant) % 2 === 0 ? palette[3] : palette[2]);
        paintPlant(px, py, color);
      }
    }
    return canvas;
  }

  if (type === TileType.Vineyard) {
    drawRidges();
    for (let px = 2; px < TILE_PIXEL_SIZE; px += 4) {
      for (let py = 1; py < TILE_PIXEL_SIZE; py += 3) {
        paintPlant(px, py, palette[1]);
        if ((py + variant) % 2 === 0) {
          paintPixel(ctx, px + 1, py, pixel, palette[2]);
        }
      }
    }
    return canvas;
  }

  if (type === TileType.Orchard) {
    for (let py = 0; py < TILE_PIXEL_SIZE; py += 1) {
      for (let px = 0; px < TILE_PIXEL_SIZE; px += 1) {
        paintPixel(ctx, px, py, pixel, (px + py + variant) % 4 === 0 ? palette[3] : palette[0]);
      }
    }
    for (let py = 3; py < TILE_PIXEL_SIZE; py += 5) {
      for (let px = 3; px < TILE_PIXEL_SIZE; px += 5) {
        paintPixel(ctx, px, py, pixel, palette[1]);
        paintPixel(ctx, px, py - 1, pixel, palette[1]);
        paintPixel(ctx, px - 1, py - 1, pixel, palette[4]);
        if ((px + py + variant) % 2 === 0) {
          paintPixel(ctx, px + 1, py, pixel, palette[2]);
        }
      }
    }
    return canvas;
  }

  if (type === TileType.Garden || type === TileType.PumpkinPatch || type === TileType.CabbagePatch || type === TileType.BerryGarden || type === TileType.HerbGarden) {
    drawRidges();
    const plantA = palette[1];
    const plantB = palette[2];
    const plantC = palette[3];
    for (let py = 1; py < TILE_PIXEL_SIZE; py += 3) {
      for (let px = 1; px < TILE_PIXEL_SIZE; px += 3) {
        const selector = (hash2d(WORLD_SEED + 3000 + type * 17 + variant, px, py) % 3);
        const color = selector === 0 ? plantA : selector === 1 ? plantB : plantC;
        paintPlant(px, py, color);
        if (type === TileType.PumpkinPatch || type === TileType.CabbagePatch) {
          paintPixel(ctx, px + 1, py + 1, pixel, color);
        }
      }
    }
    return canvas;
  }

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
        const fine = hash2d(WORLD_SEED + 1400 + variant * 13, px, py) % 100;
        color = coarse < 20 ? palette[3] : coarse < 74 ? palette[1] : palette[2];
        if (fine < 10) {
          color = palette[4];
        } else if (fine > 90) {
          color = palette[3];
        }
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
  const accentCount = type === TileType.Stone ? 6 : 3;
  for (let i = 0; i < accentCount; i += 1) {
    const ax = 2 + (hash2d(WORLD_SEED + 700 + variant, i, type) % 12);
    const ay = 2 + (hash2d(WORLD_SEED + 900 + variant, type, i) % 12);
    paintPixel(ctx, ax, ay, pixel, accent);
  }

  return canvas;
}

function makeTreeSprite(): HTMLCanvasElement {
  return makeTreeVariantSprite(0);
}

function makeTreeVariantSprite(variant: number): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE * 2, OBJECT_SIZE * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const pixel = 2;
  const style = variant % 5;
  const palette = TREE_PALETTES[Math.floor(variant / 5) % TREE_PALETTES.length];
  const trunkHeight = 8 + (variant % 4);
  const trunkWidth = style === 1 ? 3 : style === 4 ? 2 : 4;
  const trunkX = 16 - Math.floor(trunkWidth / 2) + ((variant % 3) - 1);
  const trunkTop = 29 - trunkHeight;

  const paintLeaf = (x: number, y: number, accentChance = 0.12): void => {
    const roll = hash2d(WORLD_SEED + 1400 + variant, x, y) % 100;
    let color = palette.leaves[0];
    if (roll > 76) {
      color = palette.leaves[2];
    } else if (roll > 38) {
      color = palette.leaves[1];
    }
    if (roll > 100 - Math.round(accentChance * 100)) {
      color = palette.leaves[3];
    }
    paintPixel(ctx, x, y, pixel, color);
  };

  const paintBlob = (cx: number, cy: number, rx: number, ry: number, lift = 0): void => {
    for (let y = cy - ry; y <= cy + ry; y += 1) {
      for (let x = cx - rx; x <= cx + rx; x += 1) {
        const nx = (x - cx) / Math.max(1, rx);
        const ny = (y - cy + lift * 0.12 * (x - cx)) / Math.max(1, ry);
        if ((nx * nx) + (ny * ny) > 1) {
          continue;
        }
        if ((hash2d(WORLD_SEED + 1700 + variant, x, y) % 11) === 0) {
          continue;
        }
        paintLeaf(x, y, style === 3 ? 0.2 : 0.12);
      }
    }
  };

  drawRectPx(ctx, trunkX, trunkTop, trunkWidth, trunkHeight, pixel, palette.trunk[0]);
  drawRectPx(ctx, trunkX + 1, trunkTop, Math.max(1, trunkWidth - 2), trunkHeight - 1, pixel, palette.trunk[1]);
  drawRectPx(ctx, trunkX - 1, 29, 2, 1, pixel, palette.trunk[0]);
  drawRectPx(ctx, trunkX + trunkWidth - 1, 29, 2, 1, pixel, palette.trunk[0]);

  if (style === 0) {
    paintBlob(16, 10, 7 + (variant % 2), 6);
    paintBlob(11, 14, 5, 5);
    paintBlob(21, 14, 5, 5);
    paintBlob(16, 17, 6, 4);
  } else if (style === 1) {
    for (let row = 0; row < 6; row += 1) {
      const y = 7 + row * 3;
      const width = 2 + row * 2 + (variant % 2);
      paintBlob(16, y, width, 2);
    }
    paintBlob(16, 6, 2, 2);
  } else if (style === 2) {
    paintBlob(16, 9, 8, 5);
    paintBlob(11, 13, 6, 4);
    paintBlob(21, 13, 6, 4);
    paintBlob(16, 16, 7, 4);
    for (let y = 15; y <= 24; y += 2) {
      paintLeaf(8 + (hash2d(variant + 2000, y, 1) % 2), y, 0.05);
      paintLeaf(24 - (hash2d(variant + 2100, y, 2) % 2), y, 0.05);
    }
  } else if (style === 3) {
    paintBlob(11, 12, 7, 4, -1);
    paintBlob(21, 11, 8, 4, 1);
    paintBlob(16, 16, 10, 3);
    for (let x = 8; x <= 24; x += 2) {
      paintLeaf(x, 19 + (hash2d(WORLD_SEED + 2200 + variant, x, 3) % 2), 0.18);
    }
  } else {
    paintBlob(16, 8, 4, 5);
    paintBlob(16, 13, 5, 6);
    paintBlob(16, 18, 4, 5);
    if ((variant % 2) === 0) {
      paintBlob(13, 14, 2, 3);
      paintBlob(19, 14, 2, 3);
    }
  }

  for (let branch = 0; branch < 3; branch += 1) {
    const branchY = trunkTop + 2 + branch * 2;
    if (style !== 4) {
      paintPixel(ctx, trunkX - 1, branchY, pixel, palette.trunk[1]);
      paintPixel(ctx, trunkX + trunkWidth, branchY + (branch % 2), pixel, palette.trunk[1]);
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

function makeWoodDeckTileSprite(): HTMLCanvasElement {
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

  for (let py = 2; py <= 13; py += 1) {
    for (let px = 2; px <= 13; px += 1) {
      paintPixel(ctx, px, py, pixel, (px + py) % 2 === 0 ? plankA : plankB);
    }
    paintPixel(ctx, 1, py, pixel, rail);
    paintPixel(ctx, 14, py, pixel, rail);
    if (py % 3 === 0) {
      paintPixel(ctx, 4, py, pixel, highlight);
      paintPixel(ctx, 10, py, pixel, shadow);
    }
  }

  return canvas;
}

function makeWoodArchTileSprite(): HTMLCanvasElement {
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

  for (let py = 4; py <= 13; py += 1) {
    const inset = py <= 6 ? 1 : py >= 12 ? 2 : 0;
    for (let px = 2 + inset; px <= 13 - inset; px += 1) {
      paintPixel(ctx, px, py, pixel, (px + py) % 2 === 0 ? plankA : plankB);
    }
    paintPixel(ctx, 1 + inset, py, pixel, rail);
    paintPixel(ctx, 14 - inset, py, pixel, rail);
  }

  for (let px = 4; px <= 11; px += 1) {
    paintPixel(ctx, px, 3, pixel, rail);
  }
  for (let px = 5; px <= 10; px += 1) {
    paintPixel(ctx, px, 2, pixel, highlight);
  }
  for (let py = 6; py <= 11; py += 1) {
    paintPixel(ctx, 4, py, pixel, shadow);
    paintPixel(ctx, 11, py, pixel, shadow);
  }

  return canvas;
}

function makeHillStampSprite(variant: number): HTMLCanvasElement {
  const width = TILE_SIZE * 8;
  const height = TILE_SIZE * 8;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  const pixel = 4;
  const palettes = [
    { base: "#6f9a45", mid: "#89b45b", edge: "#537332", shadow: "#415a28", dirt: "#8d7048", shrub: "#5f8538" },
    { base: "#947347", mid: "#b18855", edge: "#755735", shadow: "#5a432a", dirt: "#c29a60", shrub: "#7a6037" },
    { base: "#7f7b6a", mid: "#9d9887", edge: "#666252", shadow: "#4f4b40", dirt: "#8f7a58", shrub: "#6e6958" }
  ];
  const palette = palettes[variant % palettes.length];
  const rings = [
    { x: 32, y: 34, rx: 25, ry: 20, color: palette.shadow },
    { x: 32, y: 31, rx: 23, ry: 18, color: palette.edge },
    { x: 32, y: 28, rx: 20, ry: 15, color: palette.base },
    { x: 32, y: 25, rx: 16, ry: 12, color: palette.mid }
  ];

  for (const ring of rings) {
    for (let py = ring.y - ring.ry; py <= ring.y + ring.ry; py += 1) {
      for (let px = ring.x - ring.rx; px <= ring.x + ring.rx; px += 1) {
        const nx = (px - ring.x) / Math.max(1, ring.rx);
        const ny = (py - ring.y) / Math.max(1, ring.ry);
        if ((nx * nx) + (ny * ny) > 1.03) {
          continue;
        }
        if ((hash2d(WORLD_SEED + 4100 + variant * 37, px, py) % 23) === 0) {
          continue;
        }
        paintPixel(ctx, px, py, pixel, ring.color);
      }
    }
  }

  for (let row = 0; row < 4; row += 1) {
    const y = 20 + row * 6;
    for (let x = 14 + row; x <= 50 - row; x += 2) {
      if ((x + row + variant) % 3 === 0) {
        paintPixel(ctx, x, y, pixel, palette.dirt);
      }
    }
  }

  for (let shrub = 0; shrub < 26; shrub += 1) {
    const sx = 14 + (hash2d(WORLD_SEED + 4200 + variant, shrub, 1) % 36);
    const sy = 16 + (hash2d(WORLD_SEED + 4300 + variant, shrub, 2) % 22);
    if (((sx - 32) * (sx - 32)) / 380 + ((sy - 28) * (sy - 28)) / 210 > 1) {
      continue;
    }
    paintPixel(ctx, sx, sy, pixel, palette.shrub);
  }

  return canvas;
}

function makeMountainStampSprite(variant: number): HTMLCanvasElement {
  const width = TILE_SIZE * 8;
  const height = TILE_SIZE * 8;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  const pixel = 4;
  const palettes = [
    { base: "#7e858a", mid: "#9aa1a6", edge: "#666c70", shadow: "#4d5357", accent: "#b2b8bd" },
    { base: "#8a6f56", mid: "#a78967", edge: "#6e5743", shadow: "#544233", accent: "#c0a17d" },
    { base: "#6f767f", mid: "#8d96a1", edge: "#575d66", shadow: "#41464e", accent: "#a7afb7" }
  ];
  const palette = palettes[variant % palettes.length];
  const layers = [
    { x: 32, y: 35, rx: 24, ry: 18, color: palette.shadow },
    { x: 32, y: 31, rx: 22, ry: 16, color: palette.edge },
    { x: 32, y: 27, rx: 18, ry: 13, color: palette.base },
    { x: 32, y: 23, rx: 13, ry: 9, color: palette.mid }
  ];

  for (const layer of layers) {
    for (let py = layer.y - layer.ry; py <= layer.y + layer.ry; py += 1) {
      for (let px = layer.x - layer.rx; px <= layer.x + layer.rx; px += 1) {
        const nx = (px - layer.x) / Math.max(1, layer.rx);
        const ny = (py - layer.y) / Math.max(1, layer.ry);
        if ((nx * nx) + (ny * ny) > 1.08) {
          continue;
        }
        if ((hash2d(WORLD_SEED + 4400 + variant * 41, px, py) % 17) === 0) {
          continue;
        }
        paintPixel(ctx, px, py, pixel, layer.color);
      }
    }
  }

  for (let ridge = 0; ridge < 5; ridge += 1) {
    const y = 17 + ridge * 6;
    for (let x = 18 + ridge; x <= 46 - ridge; x += 2) {
      const color = ridge % 2 === 0 ? palette.accent : palette.edge;
      if ((x + ridge + variant) % 4 !== 0) {
        paintPixel(ctx, x, y, pixel, color);
      }
    }
  }

  for (let rock = 0; rock < 40; rock += 1) {
    const rx = 15 + (hash2d(WORLD_SEED + 4500 + variant, rock, 3) % 34);
    const ry = 14 + (hash2d(WORLD_SEED + 4600 + variant, rock, 4) % 25);
    if (((rx - 32) * (rx - 32)) / 360 + ((ry - 28) * (ry - 28)) / 220 > 1) {
      continue;
    }
    paintPixel(ctx, rx, ry, pixel, rock % 3 === 0 ? palette.shadow : palette.accent);
  }

  return canvas;
}

function makeGardenStampSprite(variant: number): HTMLCanvasElement {
  const width = TILE_SIZE * 16;
  const height = TILE_SIZE * 16;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  const pixel = 4;
  const soilA = "#9a6c3e";
  const soilB = "#7b532f";
  const path = "#b98a58";
  const hedge = "#6da03f";
  const hedgeDark = "#4f7b31";
  const layout = variant % GARDEN_STAMP_VARIANTS;

  drawRectPx(ctx, 4, 4, 120, 120, pixel, hedgeDark);
  drawRectPx(ctx, 6, 6, 116, 116, pixel, hedge);
  drawRectPx(ctx, 12, 12, 104, 104, pixel, path);
  drawRectPx(ctx, 16, 16, 96, 96, pixel, soilA);

  for (let py = 16; py < 112; py += 1) {
    for (let px = 16; px < 112; px += 1) {
      if ((hash2d(WORLD_SEED + 4700 + variant * 23, px, py) % 9) === 0) {
        paintPixel(ctx, px, py, pixel, soilB);
      }
    }
  }

  const drawBedFrame = (x: number, y: number, w: number, h: number): void => {
    drawRectPx(ctx, x, y, w, h, pixel, soilA);
    for (let i = 0; i < w; i += 1) {
      if (i % 5 === 0) {
        paintPixel(ctx, x + i, y, pixel, soilB);
        paintPixel(ctx, x + i, y + h - 1, pixel, soilB);
      }
    }
    for (let i = 0; i < h; i += 1) {
      if (i % 5 === 0) {
        paintPixel(ctx, x, y + i, pixel, soilB);
        paintPixel(ctx, x + w - 1, y + i, pixel, soilB);
      }
    }
  };

  const cropRows = (x: number, y: number, w: number, h: number, stalk: string, tip?: string): void => {
    for (let row = y + 3; row < y + h - 3; row += 9) {
      for (let col = x + 4; col < x + w - 4; col += 8) {
        drawRectPx(ctx, col, row + 2, 1, 3, pixel, stalk);
        drawRectPx(ctx, col + 2, row + 2, 1, 3, pixel, stalk);
        if (tip) {
          drawRectPx(ctx, col - 1, row, 2, 2, pixel, tip);
          drawRectPx(ctx, col + 2, row, 2, 2, pixel, tip);
        } else {
          drawRectPx(ctx, col, row, 2, 2, pixel, stalk);
        }
      }
    }
  };

  const orchardRows = (): void => {
    for (let row = 26; row <= 92; row += 18) {
      for (let col = 28; col <= 92; col += 18) {
        drawRectPx(ctx, col - 1, row + 3, 2, 2, pixel, "#6b4a28");
        drawRectPx(ctx, col - 3, row - 2, 6, 5, pixel, "#5f8f38");
        drawRectPx(ctx, col - 1, row - 4, 2, 2, pixel, "#d05e43");
      }
    }
  };

  const vineyardRows = (): void => {
    for (let row = 24; row <= 96; row += 12) {
      drawRectPx(ctx, 24, row, 80, 1, pixel, "#6f4a2a");
      for (let col = 24; col <= 104; col += 10) {
        drawRectPx(ctx, col, row - 2, 1, 5, pixel, "#8b6540");
        drawRectPx(ctx, col + 2, row - 1, 2, 2, pixel, "#5e8b3e");
        drawRectPx(ctx, col + 4, row - 1, 2, 2, pixel, "#6d4f96");
      }
    }
  };

  const mixedBeds = (leafA: string, leafB: string, fruit?: string): void => {
    for (let row = 24; row <= 96; row += 12) {
      for (let col = 24; col <= 96; col += 10) {
        drawRectPx(ctx, col, row, 3, 3, pixel, (col + row) % 20 === 0 ? leafB : leafA);
        if (fruit) {
          drawRectPx(ctx, col + 1, row - 1, 1, 1, pixel, fruit);
        }
      }
    }
  };

  const drawDiamondWheatField = (): void => {
    const cx = 64;
    const cy = 64;
    const outer = 50;
    const inner = 44;
    const soilDark = "#8b5d2f";
    const soilMid = "#a86f39";
    const soilLight = "#c48848";
    const wheatDark = "#c89534";
    const wheatLight = "#f1c85a";
    const stem = "#8a6b24";

    for (let py = cy - outer; py <= cy + outer; py += 1) {
      for (let px = cx - outer; px <= cx + outer; px += 1) {
        const dist = Math.abs(px - cx) + Math.abs(py - cy);
        if (dist > outer) {
          continue;
        }
        let color = soilDark;
        if (dist <= inner) {
          color = ((px + py) % 6 === 0) ? soilLight : soilMid;
        }
        if (dist >= outer - 2) {
          color = soilDark;
        }
        paintPixel(ctx, px, py, pixel, color);
      }
    }

    for (let row = -30; row <= 30; row += 10) {
      for (let offset = -24; offset <= 24; offset += 8) {
        const px = cx + offset + Math.floor(row / 2);
        const py = cy + row;
        const dist = Math.abs(px - cx) + Math.abs(py - cy);
        if (dist > inner - 6) {
          continue;
        }
        drawRectPx(ctx, px, py + 2, 1, 4, pixel, stem);
        drawRectPx(ctx, px + 2, py + 2, 1, 4, pixel, stem);
        drawRectPx(ctx, px - 1, py, 2, 2, pixel, wheatDark);
        drawRectPx(ctx, px + 1, py - 1, 2, 2, pixel, wheatLight);
        drawRectPx(ctx, px + 3, py, 2, 2, pixel, wheatDark);
      }
    }

    for (let row = -34; row <= 34; row += 10) {
      const startX = cx - 34 + Math.floor(row / 2);
      const endX = cx + 34 + Math.floor(row / 2);
      for (let x = startX; x <= endX; x += 2) {
        const py = cy + row + 5;
        const dist = Math.abs(x - cx) + Math.abs(py - cy);
        if (dist <= inner - 4) {
          paintPixel(ctx, x, py, pixel, soilDark);
        }
      }
    }
  };

  drawBedFrame(20, 20, 88, 88);

  switch (layout) {
    case 0:
      cropRows(20, 20, 88, 88, "#4f8a35", "#ddb54d");
      break;
    case 1:
      cropRows(20, 20, 88, 88, "#4f8a35", "#efd77a");
      break;
    case 2:
      orchardRows();
      break;
    case 3:
      vineyardRows();
      break;
    case 4:
      mixedBeds("#5ca14b", "#7bc76a", "#e3c45f");
      break;
    case 5:
      mixedBeds("#53813d", "#699c48", "#d7862f");
      break;
    case 6:
      mixedBeds("#5d994e", "#7fbe70");
      break;
    case 7:
      mixedBeds("#548f42", "#73b45e", "#c64d63");
      break;
    case 8:
      mixedBeds("#63ad67", "#89c98d");
      break;
    case 9:
      for (let row = 24; row <= 100; row += 10) {
        drawRectPx(ctx, 24, row, 80, 2, pixel, soilB);
      }
      break;
    default:
      drawDiamondWheatField();
      break;
  }

  for (let step = 20; step <= 108; step += 12) {
    paintPixel(ctx, step, 14, pixel, hedgeDark);
    paintPixel(ctx, step, 110, pixel, hedgeDark);
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
  return makeHorseVariantSprite(0);
}

function horsePaletteForVariant(variant: number): HorsePalette {
  return HORSE_PALETTES[Math.abs(variant) % HORSE_PALETTES.length];
}

function makeHorseVariantSprite(variant: number): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE * 2, OBJECT_SIZE * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  const s = 2;
  const palette = horsePaletteForVariant(variant);
  drawRectPx(ctx, 8, 15, 12, 6, s, palette.coat[0]);
  drawRectPx(ctx, 8, 19, 12, 2, s, palette.coat[1]);
  drawRectPx(ctx, 19, 13, 4, 5, s, palette.coat[1]);
  drawRectPx(ctx, 21, 12, 2, 3, s, palette.mane[1]);
  drawRectPx(ctx, 11, 12, 6, 3, s, palette.mane[0]);
  drawRectPx(ctx, 20, 15, 2, 2, s, palette.muzzle);
  drawRectPx(ctx, 9, 21, 2, 7, s, palette.coat[2]);
  drawRectPx(ctx, 13, 21, 2, 7, s, palette.coat[2]);
  drawRectPx(ctx, 17, 21, 2, 7, s, palette.coat[2]);
  drawRectPx(ctx, 21, 21, 2, 7, s, palette.coat[2]);
  drawRectPx(ctx, 9, 27, 2, 1, s, palette.hoof);
  drawRectPx(ctx, 13, 27, 2, 1, s, palette.hoof);
  drawRectPx(ctx, 17, 27, 2, 1, s, palette.hoof);
  drawRectPx(ctx, 21, 27, 2, 1, s, palette.hoof);
  drawRectPx(ctx, 6, 16, 2, 6, s, palette.mane[2]);
  drawRectPx(ctx, 8, 17, 1, 2, s, palette.tack[1]);
  drawRectPx(ctx, 13, 16, 1, 5, s, palette.tack[0]);
  paintPixel(ctx, 21, 14, s, palette.eye);
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

function makeGrainEarSprite(kind: "gold" | "yellow" | "green"): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE, OBJECT_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  const s = 2;
  const palettes = {
    gold: { stem: "#7d6a2f", grainA: "#d8b04a", grainB: "#f0cf6d", shadow: "#9b7a2f" },
    yellow: { stem: "#8a7426", grainA: "#e0bc43", grainB: "#f4da73", shadow: "#a07f22" },
    green: { stem: "#5f7d2d", grainA: "#7eb149", grainB: "#a9d46d", shadow: "#4e6827" }
  } as const;
  const palette = palettes[kind];

  drawRectPx(ctx, 7, 10, 1, 6, s, palette.stem);
  drawRectPx(ctx, 8, 9, 1, 7, s, palette.stem);
  drawRectPx(ctx, 6, 11, 1, 3, s, palette.stem);
  drawRectPx(ctx, 9, 12, 1, 3, s, palette.stem);

  for (let index = 0; index < 5; index += 1) {
    const y = 5 + index * 2;
    drawRectPx(ctx, 7 - (index % 2), y, 2, 1, s, index < 2 ? palette.grainB : palette.grainA);
    drawRectPx(ctx, 8, y + 1, 2, 1, s, palette.shadow);
    drawRectPx(ctx, 9, y, 2, 1, s, index < 2 ? palette.grainB : palette.grainA);
  }
  drawRectPx(ctx, 8, 4, 1, 2, s, palette.grainB);
  return canvas;
}

function makeGrapeVineSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE * 2, OBJECT_SIZE * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  const s = 2;
  drawRectPx(ctx, 10, 21, 1, 8, s, "#6c4a2b");
  drawRectPx(ctx, 22, 21, 1, 8, s, "#6c4a2b");
  drawRectPx(ctx, 10, 20, 13, 1, s, "#8b6542");
  drawRectPx(ctx, 8, 18, 17, 2, s, "#5f8f3a");
  drawRectPx(ctx, 9, 16, 15, 2, s, "#76ab46");
  drawRectPx(ctx, 11, 14, 11, 2, s, "#8abe59");
  drawRectPx(ctx, 13, 12, 7, 2, s, "#6f9e41");
  drawRectPx(ctx, 12, 19, 2, 2, s, "#6d4f96");
  drawRectPx(ctx, 16, 18, 2, 3, s, "#7a58a7");
  drawRectPx(ctx, 19, 19, 2, 2, s, "#6d4f96");
  drawRectPx(ctx, 14, 15, 2, 2, s, "#6d4f96");
  drawRectPx(ctx, 18, 14, 2, 2, s, "#7a58a7");
  drawRectPx(ctx, 7, 20, 2, 1, s, "#82bf52");
  drawRectPx(ctx, 24, 19, 2, 1, s, "#82bf52");
  return canvas;
}

function makeAppleTreeSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE * 2, OBJECT_SIZE * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  const s = 2;
  drawRectPx(ctx, 15, 22, 3, 8, s, "#6a4729");
  drawRectPx(ctx, 13, 18, 7, 3, s, "#6d9b44");
  drawRectPx(ctx, 10, 14, 13, 5, s, "#79aa4f");
  drawRectPx(ctx, 12, 10, 9, 4, s, "#8fc15d");
  drawRectPx(ctx, 8, 15, 4, 4, s, "#6a9640");
  drawRectPx(ctx, 21, 15, 4, 4, s, "#6a9640");
  paintPixel(ctx, 13, 14, s, "#d04d43");
  paintPixel(ctx, 18, 13, s, "#d04d43");
  paintPixel(ctx, 16, 17, s, "#d04d43");
  paintPixel(ctx, 20, 16, s, "#d04d43");
  paintPixel(ctx, 11, 17, s, "#d04d43");
  return canvas;
}

function makeOliveTreeSprite(): HTMLCanvasElement {
  const canvas = createCanvas(OBJECT_SIZE * 2, OBJECT_SIZE * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  const s = 2;
  drawRectPx(ctx, 15, 22, 3, 8, s, "#6b5137");
  drawRectPx(ctx, 14, 20, 1, 3, s, "#6b5137");
  drawRectPx(ctx, 18, 19, 1, 4, s, "#6b5137");
  drawRectPx(ctx, 11, 16, 13, 5, s, "#7e8f67");
  drawRectPx(ctx, 13, 12, 9, 4, s, "#98a884");
  drawRectPx(ctx, 9, 17, 4, 3, s, "#70805d");
  drawRectPx(ctx, 22, 17, 4, 3, s, "#70805d");
  paintPixel(ctx, 14, 18, s, "#4f5f3f");
  paintPixel(ctx, 19, 16, s, "#4f5f3f");
  paintPixel(ctx, 17, 13, s, "#4f5f3f");
  paintPixel(ctx, 12, 16, s, "#4f5f3f");
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

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16)
  ];
}

function pickPlayerRamp(
  ramps: [string, string, string][],
  preferredIndex: number | undefined,
  seed: number
): [string, string, string] {
  if (preferredIndex !== undefined && Number.isFinite(preferredIndex)) {
    const index = Math.abs(Math.floor(preferredIndex)) % ramps.length;
    return ramps[index];
  }
  return ramps[hash(seed) % ramps.length];
}

function pickTrait(id: number, preferred: number | undefined, salt: number): number {
  if (preferred !== undefined && Number.isFinite(preferred)) {
    const normalized = Math.abs(preferred % 1000) / 999;
    return normalized;
  }
  return (hash(id ^ salt) % 1000) / 999;
}

function lerpInt(min: number, max: number, t: number): number {
  return clampInt(min + (max - min) * t, min, max);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mixPoint(a: PlayerPoint, b: PlayerPoint, t: number): PlayerPoint {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
}

function fillCirclePx(ctx: CanvasRenderingContext2D, center: PlayerPoint, radius: number, color: string): void {
  ctx.fillStyle = color;
  const minX = Math.floor(center.x - radius);
  const maxX = Math.ceil(center.x + radius);
  const minY = Math.floor(center.y - radius);
  const maxY = Math.ceil(center.y + radius);
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const dx = px + 0.5 - center.x;
      const dy = py + 0.5 - center.y;
      if (dx * dx + dy * dy <= radius * radius) {
        ctx.fillRect(px * PLAYER_GRID_SCALE, py * PLAYER_GRID_SCALE, PLAYER_GRID_SCALE, PLAYER_GRID_SCALE);
      }
    }
  }
}

function drawSegmentPx(
  ctx: CanvasRenderingContext2D,
  from: PlayerPoint,
  to: PlayerPoint,
  thickness: number,
  color: string
): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) * 3));
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    fillCirclePx(ctx, mixPoint(from, to, t), thickness / 2, color);
  }
}

function drawTunicPx(
  ctx: CanvasRenderingContext2D,
  torsoTop: number,
  torsoBottom: number,
  centerX: number,
  shoulderWidth: number,
  waistWidth: number,
  palette: PlayerPalette
): void {
  for (let y = torsoTop; y <= torsoBottom; y += 1) {
    const t = clamp01((y - torsoTop) / Math.max(1, torsoBottom - torsoTop));
    const taper = t < 0.35 ? t * 0.55 : 0.2 + (t - 0.35) * 0.95;
    const width = clampInt(shoulderWidth - (shoulderWidth - waistWidth) * taper, waistWidth, shoulderWidth);
    const inset = y === torsoTop ? 1 : y === torsoTop + 1 ? 0.5 : 0;
    const startX = Math.round(centerX - width / 2 + inset);
    const color = t < 0.2 ? palette.primary[0] : t < 0.82 ? palette.primary[1] : palette.primary[2];
    const rowWidth = Math.max(2, width - Math.round(inset * 2));
    drawRectPx(ctx, startX, y, rowWidth, 1, PLAYER_GRID_SCALE, color);
  }
}

function drawTunicHemPx(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  y: number,
  width: number,
  splitDepth: number,
  palette: PlayerPalette
): void {
  const leftWidth = Math.max(2, Math.floor(width / 2) - 1);
  const rightWidth = Math.max(2, Math.ceil(width / 2) - 1);
  drawRectPx(ctx, Math.round(centerX - width / 2), y, leftWidth, splitDepth, PLAYER_GRID_SCALE, palette.primary[2]);
  drawRectPx(ctx, Math.round(centerX + 1), y, rightWidth, splitDepth, PLAYER_GRID_SCALE, palette.primary[2]);
  drawRectPx(ctx, Math.round(centerX - width / 2), y, leftWidth, 1, PLAYER_GRID_SCALE, palette.secondary[0]);
  drawRectPx(ctx, Math.round(centerX + 1), y, rightWidth, 1, PLAYER_GRID_SCALE, palette.secondary[0]);
}

function drawSleeveCapsPx(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  chestY: number,
  shoulderWidth: number,
  palette: PlayerPalette
): void {
  drawRectPx(ctx, Math.round(centerX - shoulderWidth / 2), Math.round(chestY + 1), 2, 2, PLAYER_GRID_SCALE, palette.secondary[0]);
  drawRectPx(ctx, Math.round(centerX + shoulderWidth / 2) - 2, Math.round(chestY + 1), 2, 2, PLAYER_GRID_SCALE, palette.secondary[0]);
}

function drawSuspendersPx(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  chestY: number,
  pelvisY: number,
  waistWidth: number,
  palette: PlayerPalette
): void {
  const leftX = Math.round(centerX - Math.max(2, waistWidth / 3));
  const rightX = Math.round(centerX + Math.max(1, waistWidth / 3));
  drawRectPx(ctx, leftX, Math.round(chestY), 1, Math.max(2, Math.round((pelvisY - chestY) * 0.55)), PLAYER_GRID_SCALE, palette.secondary[0]);
  drawRectPx(ctx, rightX, Math.round(chestY), 1, Math.max(2, Math.round((pelvisY - chestY) * 0.55)), PLAYER_GRID_SCALE, palette.secondary[0]);
}

function drawBeltPx(ctx: CanvasRenderingContext2D, centerX: number, y: number, width: number, palette: PlayerPalette): void {
  const startX = Math.round(centerX - width / 2);
  drawRectPx(ctx, startX, y, width, 1, PLAYER_GRID_SCALE, palette.accent[1]);
  drawRectPx(ctx, centerX - 1, y, 2, 1, PLAYER_GRID_SCALE, palette.accent[0]);
}

function drawEyesPx(
  ctx: CanvasRenderingContext2D,
  direction: Direction,
  headCenter: PlayerPoint,
  build: PlayerBuild
): void {
  const eyeY = Math.round(headCenter.y + 0.25);
  if (direction === Direction.Down) {
    drawRectPx(ctx, Math.round(headCenter.x - 2), eyeY, 1, 1, PLAYER_GRID_SCALE, "#241c18");
    drawRectPx(ctx, Math.round(headCenter.x + 1), eyeY, 1, 1, PLAYER_GRID_SCALE, "#241c18");
    return;
  }
  if (direction === Direction.Left) {
    drawRectPx(ctx, Math.round(headCenter.x - 2), eyeY, 1, 1, PLAYER_GRID_SCALE, "#241c18");
    return;
  }
  if (direction === Direction.Right) {
    drawRectPx(ctx, Math.round(headCenter.x + 1), eyeY, 1, 1, PLAYER_GRID_SCALE, "#241c18");
  }
}

function appearanceSeedFor(id: number, appearance?: PlayerAppearance): number {
  if (!appearance) {
    return id;
  }
  const values = [
    appearance.hair,
    appearance.primary,
    appearance.secondary,
    appearance.accent,
    appearance.skin,
    appearance.height,
    appearance.build,
    appearance.headSize,
    appearance.armLength,
    appearance.legLength
  ];
  if (values.every((value) => value === undefined)) {
    return id;
  }

  let seed = 0x45d9f3b;
  for (let index = 0; index < values.length; index += 1) {
    const value = Math.floor(values[index] ?? 0);
    seed = hash(seed ^ Math.imul(value + 1, 0x9e3779b1 ^ (index * 0x85ebca6b)));
  }
  return seed;
}

function playerOutfitFor(id: number, appearance?: PlayerAppearance): PlayerOutfit {
  const seed = appearanceSeedFor(id, appearance);
  return {
    collar: (hash(seed ^ 0x25aa33ef) % 3) as 0 | 1 | 2,
    shoulderPads: (hash(seed ^ 0x17ab91c1) % 2) === 0,
    cape: (hash(seed ^ 0x0faca211) % 5) <= 1,
    coatTail: (hash(seed ^ 0x66aa9911) % 3) as 0 | 1 | 2,
    gloves: (hash(seed ^ 0x44bb2277) % 3) !== 0,
    bootCuffs: (hash(seed ^ 0x91ccd431) % 2) === 0,
    hairStyle: (hash(seed ^ 0x7712eeaa) % 4) as 0 | 1 | 2 | 3,
    beltPouch: (hash(seed ^ 0x8801aa77) % 2) === 0,
    trim: (hash(seed ^ 0x14dd390f) % 3) as 0 | 1 | 2
  };
}

function drawHairStylePx(
  ctx: CanvasRenderingContext2D,
  headCenter: PlayerPoint,
  build: PlayerBuild,
  outfit: PlayerOutfit,
  direction: Direction,
  palette: PlayerPalette
): void {
  const headLeft = Math.round(headCenter.x - build.headWidth / 2);
  const headTop = Math.round(headCenter.y - build.headHeight / 2);
  drawRectPx(ctx, headLeft, headTop, build.headWidth, 2, PLAYER_GRID_SCALE, palette.hair[1]);
  drawRectPx(ctx, headLeft + 1, headTop + 1, Math.max(2, build.headWidth - 2), 1, PLAYER_GRID_SCALE, palette.hair[0]);

  if (direction === Direction.Up) {
    drawRectPx(ctx, headLeft, headTop + build.headHeight - 1, build.headWidth, 1, PLAYER_GRID_SCALE, palette.hair[2]);
  }

  if (outfit.hairStyle === 1 && direction !== Direction.Up) {
    drawRectPx(ctx, headLeft, headTop + 2, 1, Math.max(2, build.headHeight - 2), PLAYER_GRID_SCALE, palette.hair[2]);
  }
  if (outfit.hairStyle === 2) {
    drawRectPx(ctx, headLeft + build.headWidth - 1, headTop + 2, 1, Math.max(2, build.headHeight - 2), PLAYER_GRID_SCALE, palette.hair[2]);
  }
  if (outfit.hairStyle === 3 && direction !== Direction.Down) {
    drawRectPx(ctx, Math.round(headCenter.x - 1), headTop + build.headHeight - 1, 2, 2, PLAYER_GRID_SCALE, palette.hair[2]);
  }
}

function drawOutfitBodyPx(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  chestY: number,
  pelvisY: number,
  build: PlayerBuild,
  outfit: PlayerOutfit,
  palette: PlayerPalette
): void {
  const bodyTop = Math.round(chestY);
  const bodyBottom = Math.round(pelvisY - 1);
  const shoulderSpan = Math.max(4, build.shoulderWidth - 1);
  const waistSpan = Math.max(4, build.torsoWidth - 1);
  drawTunicPx(ctx, bodyTop, bodyBottom, centerX, shoulderSpan, waistSpan, palette);
  drawSleeveCapsPx(ctx, centerX, chestY, shoulderSpan, palette);
  drawBeltPx(ctx, centerX, Math.round(chestY + build.torsoHeight * 0.58), waistSpan, palette);

  if (outfit.collar === 1) {
    drawRectPx(ctx, Math.round(centerX - 1), Math.round(chestY), 2, 2, PLAYER_GRID_SCALE, palette.secondary[0]);
  } else if (outfit.collar === 2) {
    drawRectPx(ctx, Math.round(centerX - 2), Math.round(chestY), 4, 2, PLAYER_GRID_SCALE, palette.secondary[0]);
  }

  if (outfit.shoulderPads) {
    fillCirclePx(ctx, { x: centerX - build.shoulderWidth / 2 + 0.8, y: chestY + 1.3 }, 1.1, palette.secondary[0]);
    fillCirclePx(ctx, { x: centerX + build.shoulderWidth / 2 - 0.8, y: chestY + 1.3 }, 1.1, palette.secondary[0]);
  }

  if (outfit.trim === 1) {
    drawRectPx(ctx, Math.round(centerX - waistSpan / 2), bodyBottom, waistSpan, 1, PLAYER_GRID_SCALE, palette.secondary[0]);
  } else if (outfit.trim === 2) {
    drawSuspendersPx(ctx, centerX, chestY + 1, pelvisY, waistSpan, palette);
  }

  if (outfit.coatTail >= 1) {
    drawTunicHemPx(ctx, centerX, Math.round(pelvisY), waistSpan, 1 + outfit.coatTail, palette);
  }

  if (outfit.beltPouch) {
    drawRectPx(ctx, Math.round(centerX + waistSpan / 2 - 1), Math.round(chestY + build.torsoHeight * 0.58), 2, 2, PLAYER_GRID_SCALE, palette.accent[2]);
  }
}

function drawCapePx(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  chestY: number,
  pelvisY: number,
  build: PlayerBuild,
  direction: Direction,
  palette: PlayerPalette
): void {
  const width = direction === Direction.Up ? build.torsoWidth + 3 : build.torsoWidth + 1;
  const height = direction === Direction.Up ? build.torsoHeight + 3 : build.torsoHeight + 1;
  const x = Math.round(centerX - width / 2);
  const y = Math.round(chestY + (direction === Direction.Up ? 0 : 1));
  drawRectPx(ctx, x, y, width, height, PLAYER_GRID_SCALE, palette.secondary[2]);
  drawRectPx(ctx, x + 1, y, Math.max(2, width - 2), 1, PLAYER_GRID_SCALE, palette.secondary[1]);
  if (direction === Direction.Up) {
    drawRectPx(ctx, x + 1, Math.round(pelvisY + 1), Math.max(2, width - 2), 2, PLAYER_GRID_SCALE, palette.secondary[2]);
  }
}

function playerPaletteFor(id: number, appearance?: PlayerAppearance): PlayerPalette {
  return {
    hair: pickPlayerRamp(PLAYER_HAIR_RAMPS, appearance?.hair, id ^ 0x91a2f31),
    primary: pickPlayerRamp(PLAYER_PRIMARY_RAMPS, appearance?.primary, id ^ 0x5f3759df),
    secondary: pickPlayerRamp(PLAYER_SECONDARY_RAMPS, appearance?.secondary, id ^ 0x7f4a7c15),
    accent: pickPlayerRamp(PLAYER_ACCENT_RAMPS, appearance?.accent, id ^ 0x1234abcd),
    skin: pickPlayerRamp(PLAYER_SKIN_RAMPS, appearance?.skin, id ^ 0x31415926),
    boots: ["#8a5c36", "#5e3d25", "#2c1c14"]
  };
}

function playerBuildFor(id: number, appearance?: PlayerAppearance): PlayerBuild {
  const height = pickTrait(id, appearance?.height, 0x1f123bb5);
  const build = pickTrait(id, appearance?.build, 0x3a771c91);
  const head = pickTrait(id, appearance?.headSize, 0x7b992f0d);
  const arms = pickTrait(id, appearance?.armLength, 0x5c4112a3);
  const legs = pickTrait(id, appearance?.legLength, 0x6f02de41);

  const torsoWidth = lerpInt(6, 10, build);
  const legLength = lerpInt(7, 11, (legs * 0.7 + height * 0.3));
  const armLength = lerpInt(5, 9, (arms * 0.7 + height * 0.3));
  const headWidth = lerpInt(6, 9, head);
  const headHeight = lerpInt(5, 7, head * 0.75 + 0.15);
  const torsoHeight = lerpInt(7, 10, height);
  const legThickness = build > 0.6 ? 2 : 1;
  const armThickness = build > 0.72 ? 2 : 1;

  return {
    headWidth,
    headHeight,
    torsoWidth,
    torsoHeight,
    shoulderWidth: Math.max(torsoWidth + 2, headWidth + 1),
    armLength,
    legLength,
    armThickness,
    legThickness,
    legGap: build > 0.55 ? 2 : 1,
    bootHeight: 2
  };
}

function rowForDirection(direction: Direction): number {
  switch (direction) {
    case Direction.Left:
      return 1;
    case Direction.Right:
      return 2;
    case Direction.Up:
      return 3;
    case Direction.Down:
    default:
      return 0;
  }
}

function animationColumn(animation: AnimationState, nowMs: number): number {
  if (animation !== AnimationState.Walk) {
    return 0;
  }
  const index = Math.floor(nowMs / 120) % PLAYER_WALK_SEQUENCE.length;
  return PLAYER_WALK_SEQUENCE[index];
}

function makeMountedHorseFrame(direction: Direction, frame: number, variant: number): HTMLCanvasElement {
  const canvas = createCanvas(PLAYER_FRAME_SIZE, PLAYER_FRAME_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  const palette = horsePaletteForVariant(variant);
  const s = PLAYER_GRID_SCALE;
  const gait = [
    { front: 0, back: 0, bob: 0 },
    { front: -2, back: 1, bob: -0.4 },
    { front: -1, back: -1, bob: -0.2 },
    { front: 1, back: -2, bob: -0.4 }
  ][frame];

  if (direction === Direction.Left || direction === Direction.Right) {
    const facingRight = direction === Direction.Right;
    const frontX = facingRight ? 21 : 9;
    const bodyX = facingRight ? 9 : 11;
    const headX = facingRight ? 21 : 7;
    const tailX = facingRight ? 7 : 23;

    drawRectPx(ctx, bodyX, 15 + gait.bob, 12, 6, s, palette.coat[0]);
    drawRectPx(ctx, bodyX, 19 + gait.bob, 12, 2, s, palette.coat[1]);
    drawRectPx(ctx, headX, 13 + gait.bob, 4, 5, s, palette.coat[1]);
    drawRectPx(ctx, headX + (facingRight ? 2 : 0), 12 + gait.bob, 2, 3, s, palette.mane[1]);
    drawRectPx(ctx, facingRight ? bodyX + 3 : bodyX + 4, 12 + gait.bob, 6, 3, s, palette.mane[0]);
    drawRectPx(ctx, facingRight ? headX + 1 : headX + 1, 15 + gait.bob, 2, 2, s, palette.muzzle);
    drawRectPx(ctx, tailX, 16 + gait.bob, 2, 6, s, palette.mane[2]);
    drawRectPx(ctx, bodyX + 1, 21 + gait.back, 2, 7, s, palette.coat[2]);
    drawRectPx(ctx, bodyX + 5, 21 + gait.front, 2, 7, s, palette.coat[2]);
    drawRectPx(ctx, bodyX + 8, 21 - gait.front, 2, 7, s, palette.coat[2]);
    drawRectPx(ctx, bodyX + 11, 21 - gait.back, 2, 7, s, palette.coat[2]);
    drawRectPx(ctx, bodyX + 1, 27 + gait.back, 2, 1, s, palette.hoof);
    drawRectPx(ctx, bodyX + 5, 27 + gait.front, 2, 1, s, palette.hoof);
    drawRectPx(ctx, bodyX + 8, 27 - gait.front, 2, 1, s, palette.hoof);
    drawRectPx(ctx, bodyX + 11, 27 - gait.back, 2, 1, s, palette.hoof);
    drawRectPx(ctx, bodyX + 5, 15 + gait.bob, 1, 6, s, palette.tack[0]);
    drawRectPx(ctx, bodyX + 9, 16 + gait.bob, 1, 4, s, palette.tack[1]);
    paintPixel(ctx, facingRight ? headX + 2 : headX + 1, 14 + gait.bob, s, palette.eye);
    return canvas;
  }

  const bodyY = 14 + gait.bob;
  drawRectPx(ctx, 11, bodyY, 10, 8, s, palette.coat[0]);
  drawRectPx(ctx, 11, bodyY + 5, 10, 3, s, palette.coat[1]);
  drawRectPx(ctx, 13, bodyY - 3, 6, 4, s, palette.mane[0]);
  if (direction === Direction.Down) {
    drawRectPx(ctx, 13, bodyY + 8, 6, 5, s, palette.coat[1]);
    drawRectPx(ctx, 14, bodyY + 11, 4, 2, s, palette.muzzle);
    paintPixel(ctx, 15, bodyY + 10, s, palette.eye);
    paintPixel(ctx, 17, bodyY + 10, s, palette.eye);
  } else {
    drawRectPx(ctx, 13, bodyY - 5, 6, 5, s, palette.coat[1]);
    drawRectPx(ctx, 14, bodyY - 5, 4, 2, s, palette.muzzle);
  }
  drawRectPx(ctx, 10, bodyY + 1, 1, 6, s, palette.mane[2]);
  drawRectPx(ctx, 12, bodyY + 2, 8, 1, s, palette.tack[0]);
  drawRectPx(ctx, 13, bodyY + 4, 6, 1, s, palette.tack[1]);
  drawRectPx(ctx, 12, 22 + gait.front, 2, 6, s, palette.coat[2]);
  drawRectPx(ctx, 16, 22 + gait.back, 2, 6, s, palette.coat[2]);
  drawRectPx(ctx, 11, 22 - gait.back, 2, 6, s, palette.coat[2]);
  drawRectPx(ctx, 17, 22 - gait.front, 2, 6, s, palette.coat[2]);
  drawRectPx(ctx, 12, 27 + gait.front, 2, 1, s, palette.hoof);
  drawRectPx(ctx, 16, 27 + gait.back, 2, 1, s, palette.hoof);
  drawRectPx(ctx, 11, 27 - gait.back, 2, 1, s, palette.hoof);
  drawRectPx(ctx, 17, 27 - gait.front, 2, 1, s, palette.hoof);
  return canvas;
}

function buildMountedHorseFrames(variant: number): SpriteSource[] {
  const directions = [Direction.Down, Direction.Left, Direction.Right, Direction.Up];
  return directions.flatMap((direction) =>
    Array.from({ length: PLAYER_SHEET_COLUMNS }, (_, frame) => makeMountedHorseFrame(direction, frame, variant))
  );
}

function makeFallbackPlayerFrame(
  direction: Direction,
  frame: number,
  palette: PlayerPalette,
  build: PlayerBuild,
  outfit: PlayerOutfit
): HTMLCanvasElement {
  const canvas = createCanvas(PLAYER_FRAME_SIZE, PLAYER_FRAME_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  const centerX = PLAYER_GRID_SIZE / 2;
  const groundY = 29;
  const gait = [
    { left: -0.3, right: 0.3, liftLeft: 0, liftRight: 0, arm: -0.4, bob: 0 },
    { left: -2.3, right: 1.5, liftLeft: -0.5, liftRight: 0.8, arm: 1.9, bob: -0.25 },
    { left: -0.6, right: 0.6, liftLeft: 0.2, liftRight: 0.2, arm: 0, bob: -0.4 },
    { left: 1.5, right: -2.3, liftLeft: 0.8, liftRight: -0.5, arm: -1.9, bob: -0.25 }
  ][frame];

  const pelvisY = groundY - build.legLength - 1 + gait.bob;
  const chestY = pelvisY - build.torsoHeight;
  const neckY = chestY - 1;
  const headCenter: PlayerPoint = { x: centerX, y: neckY - build.headHeight / 2 - 0.5 };
  const leftHip: PlayerPoint = { x: centerX - build.legGap, y: pelvisY };
  const rightHip: PlayerPoint = { x: centerX + build.legGap, y: pelvisY };
  const leftShoulder: PlayerPoint = { x: centerX - build.shoulderWidth / 2, y: chestY + 1 };
  const rightShoulder: PlayerPoint = { x: centerX + build.shoulderWidth / 2, y: chestY + 1 };

  const shadowWidth = 9 + Math.max(Math.abs(gait.left), Math.abs(gait.right));
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fillRect((centerX - shadowWidth / 2) * PLAYER_GRID_SCALE, (groundY + 1) * PLAYER_GRID_SCALE, shadowWidth * PLAYER_GRID_SCALE, 2 * PLAYER_GRID_SCALE);

  if (direction === Direction.Down || direction === Direction.Up) {
    const leftFoot: PlayerPoint = { x: centerX - build.legGap + gait.left, y: groundY };
    const rightFoot: PlayerPoint = { x: centerX + build.legGap + gait.right, y: groundY };
    const leftKnee: PlayerPoint = mixPoint(leftHip, leftFoot, 0.52);
    leftKnee.x += gait.left * 0.35;
    leftKnee.y -= 1.2 + gait.liftLeft;
    const rightKnee: PlayerPoint = mixPoint(rightHip, rightFoot, 0.52);
    rightKnee.x += gait.right * 0.35;
    rightKnee.y -= 1.2 + gait.liftRight;

    const leftHand: PlayerPoint = { x: leftShoulder.x - 0.6 + gait.arm, y: chestY + build.armLength };
    const rightHand: PlayerPoint = { x: rightShoulder.x + 0.6 - gait.arm, y: chestY + build.armLength };
    const leftElbow: PlayerPoint = mixPoint(leftShoulder, leftHand, 0.45);
    leftElbow.x += gait.arm * 0.25;
    const rightElbow: PlayerPoint = mixPoint(rightShoulder, rightHand, 0.45);
    rightElbow.x -= gait.arm * 0.25;

    drawSegmentPx(ctx, leftHip, leftKnee, build.legThickness + 1.1, palette.secondary[2]);
    drawSegmentPx(ctx, leftKnee, leftFoot, build.legThickness + 1.1, palette.secondary[1]);
    drawSegmentPx(ctx, rightHip, rightKnee, build.legThickness + 1.1, palette.secondary[2]);
    drawSegmentPx(ctx, rightKnee, rightFoot, build.legThickness + 1.1, palette.secondary[1]);
    fillCirclePx(ctx, leftFoot, build.legThickness, palette.boots[0]);
    fillCirclePx(ctx, rightFoot, build.legThickness, palette.boots[0]);
    if (outfit.bootCuffs) {
      fillCirclePx(ctx, { x: leftFoot.x, y: leftFoot.y - 1.25 }, build.legThickness * 0.9, palette.secondary[0]);
      fillCirclePx(ctx, { x: rightFoot.x, y: rightFoot.y - 1.25 }, build.legThickness * 0.9, palette.secondary[0]);
    }

    drawSegmentPx(ctx, leftShoulder, leftElbow, build.armThickness + 0.8, palette.primary[2]);
    drawSegmentPx(ctx, leftElbow, leftHand, build.armThickness + 0.75, palette.skin[1]);
    drawSegmentPx(ctx, rightShoulder, rightElbow, build.armThickness + 0.8, palette.primary[2]);
    drawSegmentPx(ctx, rightElbow, rightHand, build.armThickness + 0.75, palette.skin[1]);
    drawSegmentPx(ctx, leftShoulder, mixPoint(leftShoulder, leftHand, 0.55), build.armThickness + 0.55, palette.secondary[0]);
    drawSegmentPx(ctx, rightShoulder, mixPoint(rightShoulder, rightHand, 0.55), build.armThickness + 0.55, palette.secondary[0]);
    fillCirclePx(ctx, leftHand, build.armThickness * 0.55 + 0.45, outfit.gloves ? palette.secondary[0] : palette.skin[0]);
    fillCirclePx(ctx, rightHand, build.armThickness * 0.55 + 0.45, outfit.gloves ? palette.secondary[0] : palette.skin[0]);

    if (outfit.cape) {
      drawCapePx(ctx, centerX, chestY, pelvisY, build, direction, palette);
    }
    drawOutfitBodyPx(ctx, centerX, chestY, pelvisY, build, outfit, palette);

    fillCirclePx(ctx, headCenter, Math.max(build.headWidth, build.headHeight) * 0.46, palette.skin[0]);
    drawHairStylePx(ctx, headCenter, build, outfit, direction, palette);
    drawEyesPx(ctx, direction, headCenter, build);
    if (direction === Direction.Up) {
      const headLeft = Math.round(headCenter.x - build.headWidth / 2);
      const headTop = Math.round(headCenter.y - build.headHeight / 2);
      drawRectPx(ctx, headLeft, headTop + build.headHeight - 1, build.headWidth, 1, PLAYER_GRID_SCALE, palette.hair[2]);
    }
    return canvas;
  }

  const facingRight = direction === Direction.Right;
  const facing = facingRight ? 1 : -1;
  const frontHip: PlayerPoint = { x: centerX + facing * 0.8, y: pelvisY };
  const backHip: PlayerPoint = { x: centerX - facing * 0.8, y: pelvisY + 0.2 };
  const frontFoot: PlayerPoint = { x: centerX + facing * (1.8 + gait.left * 0.55), y: groundY };
  const backFoot: PlayerPoint = { x: centerX - facing * (0.4 - gait.right * 0.4), y: groundY };
  const frontKnee: PlayerPoint = mixPoint(frontHip, frontFoot, 0.52);
  frontKnee.x += facing * (1.1 + gait.left * 0.22);
  frontKnee.y -= 1.4 + gait.liftLeft;
  const backKnee: PlayerPoint = mixPoint(backHip, backFoot, 0.52);
  backKnee.x -= facing * (0.5 - gait.right * 0.2);
  backKnee.y -= 0.7 + gait.liftRight * 0.5;

  const frontShoulder: PlayerPoint = { x: centerX + facing * (build.shoulderWidth / 2 - 0.2), y: chestY + 1 };
  const backShoulder: PlayerPoint = { x: centerX - facing * (build.shoulderWidth / 2 - 0.2), y: chestY + 1.2 };
  const frontHand: PlayerPoint = { x: frontShoulder.x + facing * (1.2 - gait.arm * 0.45), y: chestY + build.armLength };
  const backHand: PlayerPoint = { x: backShoulder.x - facing * (0.6 + gait.arm * 0.35), y: chestY + build.armLength - 0.4 };
  const frontElbow: PlayerPoint = mixPoint(frontShoulder, frontHand, 0.46);
  frontElbow.x += facing * 0.8;
  const backElbow: PlayerPoint = mixPoint(backShoulder, backHand, 0.46);
  backElbow.x -= facing * 0.4;

  drawSegmentPx(ctx, backHip, backKnee, build.legThickness + 0.8, palette.secondary[2]);
  drawSegmentPx(ctx, backKnee, backFoot, build.legThickness + 0.8, palette.secondary[1]);
  fillCirclePx(ctx, backFoot, build.legThickness * 0.85, palette.boots[1]);
  drawSegmentPx(ctx, backShoulder, backElbow, build.armThickness + 0.6, palette.primary[2]);
  drawSegmentPx(ctx, backElbow, backHand, build.armThickness + 0.5, palette.skin[2]);
  drawSegmentPx(ctx, backShoulder, mixPoint(backShoulder, backHand, 0.58), build.armThickness + 0.4, palette.secondary[0]);
  if (outfit.bootCuffs) {
    fillCirclePx(ctx, { x: backFoot.x, y: backFoot.y - 1.1 }, build.legThickness * 0.75, palette.secondary[0]);
  }

  if (outfit.cape) {
    drawCapePx(ctx, centerX + facing * 0.1, chestY, pelvisY, build, direction, palette);
  }
  drawOutfitBodyPx(ctx, centerX + facing * 0.2, chestY, pelvisY, build, outfit, palette);

  drawSegmentPx(ctx, frontHip, frontKnee, build.legThickness + 1.1, palette.secondary[1]);
  drawSegmentPx(ctx, frontKnee, frontFoot, build.legThickness + 1.1, palette.secondary[0]);
  fillCirclePx(ctx, frontFoot, build.legThickness, palette.boots[0]);
  drawSegmentPx(ctx, frontShoulder, frontElbow, build.armThickness + 0.8, palette.primary[1]);
  drawSegmentPx(ctx, frontElbow, frontHand, build.armThickness + 0.7, palette.skin[1]);
  drawSegmentPx(ctx, frontShoulder, mixPoint(frontShoulder, frontHand, 0.58), build.armThickness + 0.5, palette.secondary[0]);
  fillCirclePx(ctx, frontHand, build.armThickness * 0.5 + 0.45, outfit.gloves ? palette.secondary[0] : palette.skin[0]);
  if (outfit.bootCuffs) {
    fillCirclePx(ctx, { x: frontFoot.x, y: frontFoot.y - 1.1 }, build.legThickness * 0.85, palette.secondary[0]);
  }

  const headProfileCenter: PlayerPoint = { x: centerX + facing * 0.9, y: headCenter.y };
  fillCirclePx(ctx, headProfileCenter, Math.max(build.headWidth, build.headHeight) * 0.45, palette.skin[0]);
  drawHairStylePx(ctx, headProfileCenter, build, outfit, direction, palette);
  drawEyesPx(ctx, direction, headProfileCenter, build);
  return canvas;
}

function makeFallbackPlayerSheet(): HTMLCanvasElement {
  const canvas = createCanvas(PLAYER_FRAME_SIZE * PLAYER_SHEET_COLUMNS, PLAYER_FRAME_SIZE * PLAYER_SHEET_ROWS);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }

  const palette = playerPaletteFor(1);
  const build = playerBuildFor(1);
  const outfit = playerOutfitFor(1);
  const directions = [Direction.Down, Direction.Left, Direction.Right, Direction.Up];
  for (let row = 0; row < directions.length; row += 1) {
    for (let col = 0; col < PLAYER_SHEET_COLUMNS; col += 1) {
      ctx.drawImage(
        makeFallbackPlayerFrame(directions[row], col, palette, build, outfit),
        col * PLAYER_FRAME_SIZE,
        row * PLAYER_FRAME_SIZE
      );
    }
  }
  return canvas;
}

function buildPlayerFrames(player: PlayerEntity): SpriteSource[] {
  const palette = playerPaletteFor(player.id, player.appearance);
  const build = playerBuildFor(player.id, player.appearance);
  const outfit = playerOutfitFor(player.id, player.appearance);
  const directions = [Direction.Down, Direction.Left, Direction.Right, Direction.Up];

  return directions.flatMap((direction) =>
    Array.from({ length: PLAYER_SHEET_COLUMNS }, (_, frame) => makeFallbackPlayerFrame(direction, frame, palette, build, outfit))
  );
}

function slicePlayerFrames(sheet: SpriteSource): SpriteSource[] {
  const sourceWidth = "naturalWidth" in sheet ? sheet.naturalWidth : sheet.width;
  const sourceHeight = "naturalHeight" in sheet ? sheet.naturalHeight : sheet.height;
  const cellWidth = Math.floor(sourceWidth / PLAYER_SHEET_COLUMNS);
  const cellHeight = Math.floor(sourceHeight / PLAYER_SHEET_ROWS);

  if (cellWidth <= 0 || cellHeight <= 0) {
    return [];
  }

  const frames: SpriteSource[] = [];
  for (let row = 0; row < PLAYER_SHEET_ROWS; row += 1) {
    for (let col = 0; col < PLAYER_SHEET_COLUMNS; col += 1) {
      const frame = createCanvas(PLAYER_FRAME_SIZE, PLAYER_FRAME_SIZE);
      const ctx = frame.getContext("2d");
      if (!ctx) {
        frames.push(frame);
        continue;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        sheet,
        col * cellWidth,
        row * cellHeight,
        cellWidth,
        cellHeight,
        0,
        0,
        PLAYER_FRAME_SIZE,
        PLAYER_FRAME_SIZE
      );
      frames.push(frame);
    }
  }
  return frames;
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
    case ObjectType.HillStamp:
      return makeHillStampSprite(0);
    case ObjectType.MountainStamp:
      return makeMountainStampSprite(0);
    case ObjectType.GardenStamp:
      return makeGardenStampSprite(0);
    case ObjectType.GrainEar:
      return makeGrainEarSprite("gold");
    case ObjectType.YellowGrainEar:
      return makeGrainEarSprite("yellow");
    case ObjectType.GreenGrainEar:
      return makeGrainEarSprite("green");
    case ObjectType.GrapeVine:
      return makeGrapeVineSprite();
    case ObjectType.AppleTree:
      return makeAppleTreeSprite();
    case ObjectType.OliveTree:
      return makeOliveTreeSprite();
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
    case ObjectType.HillStamp:
      return "hill-stamp";
    case ObjectType.MountainStamp:
      return "mountain-stamp";
    case ObjectType.GardenStamp:
      return "garden-stamp";
    case ObjectType.GrainEar:
      return "grain-ear";
    case ObjectType.YellowGrainEar:
      return "yellow-grain-ear";
    case ObjectType.GreenGrainEar:
      return "green-grain-ear";
    case ObjectType.GrapeVine:
      return "grape-vine";
    case ObjectType.AppleTree:
      return "apple-tree";
    case ObjectType.OliveTree:
      return "olive-tree";
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
    case TileType.Hill:
      return "hill";
    case TileType.BarleyField:
      return "barley-field";
    case TileType.WheatField:
      return "wheat-field";
    case TileType.Orchard:
      return "orchard";
    case TileType.Vineyard:
      return "vineyard";
    case TileType.Garden:
      return "garden";
    case TileType.PumpkinPatch:
      return "pumpkin-patch";
    case TileType.CabbagePatch:
      return "cabbage-patch";
    case TileType.BerryGarden:
      return "berry-garden";
    case TileType.HerbGarden:
      return "herb-garden";
    case TileType.FallowField:
      return "fallow-field";
    case TileType.GrassDug:
      return "grass-dug";
    case TileType.DirtDug:
      return "dirt-dug";
    case TileType.ForestDug:
      return "forest-dug";
    case TileType.StoneDug:
      return "stone-dug";
    case TileType.HillDug:
      return "hill-dug";
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
      return { width: TILE_SIZE * 3.2 * OBJECT_WORLD_SCALE, height: TILE_SIZE * 3.2 * OBJECT_WORLD_SCALE };
    case ObjectType.Pub:
    case ObjectType.Inn:
    case ObjectType.Barn:
    case ObjectType.Stable:
    case ObjectType.Blacksmith:
    case ObjectType.Chapel:
    case ObjectType.Manor:
    case ObjectType.TownHall:
      return { width: TILE_SIZE * 4.2 * OBJECT_WORLD_SCALE, height: TILE_SIZE * 4.2 * OBJECT_WORLD_SCALE };
    case ObjectType.Windmill:
      return { width: TILE_SIZE * 3.8 * OBJECT_WORLD_SCALE, height: TILE_SIZE * 4.8 * OBJECT_WORLD_SCALE };
    case ObjectType.Market:
      return { width: TILE_SIZE * 3.2 * OBJECT_WORLD_SCALE, height: TILE_SIZE * 2.8 * OBJECT_WORLD_SCALE };
    case ObjectType.Tree:
      return { width: TILE_SIZE * 2.2 * OBJECT_WORLD_SCALE, height: TILE_SIZE * 2.5 * OBJECT_WORLD_SCALE };
    case ObjectType.Horse:
      return { width: TILE_SIZE * 1.6 * OBJECT_WORLD_SCALE, height: TILE_SIZE * 1.4 * OBJECT_WORLD_SCALE };
    case ObjectType.Sheep:
      return { width: TILE_SIZE * 0.95 * OBJECT_WORLD_SCALE, height: TILE_SIZE * 0.85 * OBJECT_WORLD_SCALE };
    case ObjectType.Dog:
      return { width: TILE_SIZE * 0.8 * OBJECT_WORLD_SCALE, height: TILE_SIZE * 0.7 * OBJECT_WORLD_SCALE };
    case ObjectType.Cat:
      return { width: TILE_SIZE * 0.7 * OBJECT_WORLD_SCALE, height: TILE_SIZE * 0.65 * OBJECT_WORLD_SCALE };
    case ObjectType.SparkMouse:
      return { width: TILE_SIZE * 0.9 * OBJECT_WORLD_SCALE, height: TILE_SIZE * 0.85 * OBJECT_WORLD_SCALE };
    case ObjectType.HillStamp:
    case ObjectType.MountainStamp:
      return { width: TILE_SIZE * 8, height: TILE_SIZE * 8 };
    case ObjectType.GardenStamp:
      return { width: TILE_SIZE * 16, height: TILE_SIZE * 16 };
    case ObjectType.GrapeVine:
      return { width: TILE_SIZE * 1.6, height: TILE_SIZE * 1.4 };
    case ObjectType.AppleTree:
    case ObjectType.OliveTree:
      return { width: TILE_SIZE * 2.5, height: TILE_SIZE * 2.7 };
    case ObjectType.GrainEar:
    case ObjectType.YellowGrainEar:
    case ObjectType.GreenGrainEar:
      return { width: TILE_SIZE * 0.8, height: TILE_SIZE * 1.0 };
    case ObjectType.Well:
    case ObjectType.Ruins:
      return { width: TILE_SIZE * 1.75 * OBJECT_WORLD_SCALE, height: TILE_SIZE * 1.75 * OBJECT_WORLD_SCALE };
    case ObjectType.GrassTuft:
      return { width: TILE_SIZE * 0.6 * OBJECT_WORLD_SCALE, height: TILE_SIZE * 0.6 * OBJECT_WORLD_SCALE };
    default:
      return { width: TILE_SIZE * 1.1 * OBJECT_WORLD_SCALE, height: TILE_SIZE * 1.1 * OBJECT_WORLD_SCALE };
  }
}

export class AssetManager {
  private readonly tileSprites = new Map<TileType, SpriteSource[]>();
  private readonly objectSprites = new Map<ObjectType, SpriteSource>();
  private readonly objectArchives = new Map<ObjectType, SpriteSource[]>();
  private readonly houseArchive: SpriteSource[] = Array.from({ length: HOUSE_VARIANTS }, (_, index) => makeHouseVariantSprite(index));
  private readonly horseArchive: SpriteSource[] = Array.from({ length: HORSE_VARIANTS }, (_, index) => makeHorseVariantSprite(index));
  private readonly treeArchive: SpriteSource[] = Array.from({ length: TREE_VARIANTS }, (_, index) => makeTreeVariantSprite(index));
  private readonly hillStampArchive: SpriteSource[] = Array.from({ length: HILL_STAMP_VARIANTS }, (_, index) => makeHillStampSprite(index));
  private readonly mountainStampArchive: SpriteSource[] = Array.from({ length: MOUNTAIN_STAMP_VARIANTS }, (_, index) => makeMountainStampSprite(index));
  private readonly gardenStampArchive: SpriteSource[] = Array.from({ length: GARDEN_STAMP_VARIANTS }, (_, index) => makeGardenStampSprite(index));
  private readonly roadArchive: SpriteSource[] = Array.from({ length: 20 }, (_, index) => makeRoadSprite(index));
  private readonly customRoadSprites = new Map<number, SpriteSource>([
    [CUSTOM_ROAD_WOOD_DECK, makeWoodDeckTileSprite()],
    [CUSTOM_ROAD_WOOD_ARCH, makeWoodArchTileSprite()]
  ]);
  private readonly bridgeSprites = new Map<string, SpriteSource>();
  private localPlayerSheet: SpriteSource = makeFallbackPlayerSheet();
  private remotePlayerSheet: SpriteSource = makeFallbackPlayerSheet();
  private readonly playerFrameCache = new Map<string, SpriteSource[]>();
  private readonly mountedHorseFrameCache = new Map<number, SpriteSource[]>();
  private worldSurface: SpriteSource | null = null;

  constructor() {
    for (const type of EDITOR_GROUND_TILES) {
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
      ObjectType.SparkMouse,
      ObjectType.HillStamp,
      ObjectType.MountainStamp,
      ObjectType.GardenStamp,
      ObjectType.GrainEar,
      ObjectType.YellowGrainEar,
      ObjectType.GreenGrainEar,
      ObjectType.GrapeVine,
      ObjectType.AppleTree,
      ObjectType.OliveTree
    ]) {
      const fallback = makeFallbackObjectSprite(type);
      this.objectSprites.set(type, fallback);
      this.objectArchives.set(type, [fallback]);
    }

    for (const slug of BRIDGE_SLUGS) {
      this.bridgeSprites.set(slug, makeBridgeSprite(slug));
    }

    this.objectSprites.set(ObjectType.Horse, this.horseArchive[0]);
    this.objectArchives.set(ObjectType.Horse, [...this.horseArchive]);
    this.objectSprites.set(ObjectType.HillStamp, this.hillStampArchive[this.hillStampArchive.length - 1]);
    this.objectArchives.set(ObjectType.HillStamp, [...this.hillStampArchive]);
    this.objectSprites.set(ObjectType.MountainStamp, this.mountainStampArchive[this.mountainStampArchive.length - 1]);
    this.objectArchives.set(ObjectType.MountainStamp, [...this.mountainStampArchive]);
    this.objectSprites.set(ObjectType.GardenStamp, this.gardenStampArchive[this.gardenStampArchive.length - 1]);
    this.objectArchives.set(ObjectType.GardenStamp, [...this.gardenStampArchive]);
  }

  async loadGeneratedOverrides(): Promise<void> {
    const manifest = await loadManifest();
    if (!manifest) {
      return;
    }

    const work: Promise<void>[] = [];

    if (USE_GENERATED_GROUND || GENERATED_GROUND_OVERRIDES.size > 0) {
      for (const type of EDITOR_GROUND_TILES) {
        if (!USE_GENERATED_GROUND && !GENERATED_GROUND_OVERRIDES.has(type)) {
          continue;
        }
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
      if (type === ObjectType.HillStamp || type === ObjectType.MountainStamp || type === ObjectType.GardenStamp) {
        continue;
      }
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
      if (
        type === ObjectType.House ||
        type === ObjectType.Horse ||
        type === ObjectType.HillStamp ||
        type === ObjectType.MountainStamp ||
        type === ObjectType.GardenStamp
      ) {
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
              if (!LARGE_BUILDING_TYPES.has(type)) {
                this.objectSprites.set(type, loadedArchive[loadedArchive.length - 1]);
              }
            })
            .catch(() => undefined)
        );
      }
    }

    const woodDeckFile = manifest.roads?.["wood-deck"];
    if (woodDeckFile) {
      work.push(
        loadImage(`./assets/generated/${woodDeckFile}`)
          .then((image) => {
            this.customRoadSprites.set(CUSTOM_ROAD_WOOD_DECK, image);
            return undefined;
          })
          .catch(() => undefined)
      );
    }

    const woodArchFile = manifest.roads?.["wood-arch"];
    if (woodArchFile) {
      work.push(
        loadImage(`./assets/generated/${woodArchFile}`)
          .then((image) => {
            this.customRoadSprites.set(CUSTOM_ROAD_WOOD_ARCH, image);
            return undefined;
          })
          .catch(() => undefined)
      );
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
            this.localPlayerSheet = image;
            this.playerFrameCache.clear();
          })
          .catch(() => undefined)
      );
    }

    const remotePlayerFile = manifest.players["remote-player"];
    if (remotePlayerFile) {
      work.push(
        loadImage(`./assets/generated/${remotePlayerFile}`)
          .then((image) => {
            this.remotePlayerSheet = image;
            this.playerFrameCache.clear();
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
    const custom = this.customRoadSprites.get(variant);
    if (custom) {
      return custom;
    }
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
    if (type === ObjectType.Horse) {
      const index = Math.max(0, Math.min(this.horseArchive.length - 1, variant ?? 0));
      return this.horseArchive[index];
    }
    if (type === ObjectType.Tree && variant !== undefined) {
      const index = Math.max(0, Math.min(this.treeArchive.length - 1, variant));
      return index === 0 ? this.objectSprites.get(type) ?? this.treeArchive[0] : this.treeArchive[index];
    }
    const archive = this.objectArchives.get(type);
    if (archive && archive.length > 0) {
      const defaultIndex = LARGE_BUILDING_TYPES.has(type) ? 0 : archive.length - 1;
      const index = Math.max(0, Math.min(archive.length - 1, variant ?? defaultIndex));
      return archive[index];
    }
    return this.objectSprites.get(type) ?? makeFallbackObjectSprite(type);
  }

  getPlayerFrame(player: PlayerEntity, nowMs: number): SpriteSource {
    const appearanceKey = [
      player.appearance.hair ?? "r",
      player.appearance.primary ?? "r",
      player.appearance.secondary ?? "r",
      player.appearance.accent ?? "r",
      player.appearance.skin ?? "r",
      player.appearance.height ?? "r",
      player.appearance.build ?? "r",
      player.appearance.headSize ?? "r",
      player.appearance.armLength ?? "r",
      player.appearance.legLength ?? "r"
    ].join(":");
    const cacheKey = `rig:${player.id}:${appearanceKey}`;
    let frames = this.playerFrameCache.get(cacheKey);
    if (!frames) {
      frames = buildPlayerFrames(player);
      this.playerFrameCache.set(cacheKey, frames);
    }

    const row = rowForDirection(player.dir);
    const col = animationColumn(player.animation, nowMs);
    return frames[row * PLAYER_SHEET_COLUMNS + col] ?? frames[0];
  }

  getMountedHorseFrame(variant: number, direction: Direction, animation: AnimationState, nowMs: number): SpriteSource {
    let frames = this.mountedHorseFrameCache.get(variant);
    if (!frames) {
      frames = buildMountedHorseFrames(variant);
      this.mountedHorseFrameCache.set(variant, frames);
    }
    const row = rowForDirection(direction);
    const col = animationColumn(animation, nowMs);
    return frames[row * PLAYER_SHEET_COLUMNS + col] ?? frames[0];
  }

  private getObjectArchive(type: ObjectType): SpriteSource[] {
    if (type === ObjectType.House) {
      return this.houseArchive;
    }
    if (type === ObjectType.Horse) {
      return this.horseArchive;
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
      { id: "ground-forest", label: "Forest", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.Forest, 0, 0), tileType: TileType.Forest },
      { id: "ground-hill", label: "Hill", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.Hill, 0, 0), tileType: TileType.Hill },
      { id: "ground-grass-dug", label: "Grass Dug", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.GrassDug, 0, 0), tileType: TileType.GrassDug },
      { id: "ground-dirt-dug", label: "Dirt Dug", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.DirtDug, 0, 0), tileType: TileType.DirtDug },
      { id: "ground-forest-dug", label: "Forest Dug", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.ForestDug, 0, 0), tileType: TileType.ForestDug },
      { id: "ground-stone-dug", label: "Stone Dug", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.StoneDug, 0, 0), tileType: TileType.StoneDug },
      { id: "ground-hill-dug", label: "Hill Dug", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.HillDug, 0, 0), tileType: TileType.HillDug },
      { id: "ground-barley", label: "Barley", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.BarleyField, 0, 0), tileType: TileType.BarleyField },
      { id: "ground-wheat", label: "Wheat", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.WheatField, 0, 0), tileType: TileType.WheatField },
      { id: "ground-orchard", label: "Orchard", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.Orchard, 0, 0), tileType: TileType.Orchard },
      { id: "ground-vineyard", label: "Vineyard", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.Vineyard, 0, 0), tileType: TileType.Vineyard },
      { id: "ground-garden", label: "Garden", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.Garden, 0, 0), tileType: TileType.Garden },
      { id: "ground-pumpkin", label: "Pumpkin", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.PumpkinPatch, 0, 0), tileType: TileType.PumpkinPatch },
      { id: "ground-cabbage", label: "Cabbage", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.CabbagePatch, 0, 0), tileType: TileType.CabbagePatch },
      { id: "ground-berry", label: "Berry", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.BerryGarden, 0, 0), tileType: TileType.BerryGarden },
      { id: "ground-herb", label: "Herb", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.HerbGarden, 0, 0), tileType: TileType.HerbGarden },
      { id: "ground-fallow", label: "Fallow", group: "ground", kind: "ground", preview: this.getTileSprite(TileType.FallowField, 0, 0), tileType: TileType.FallowField }
    ];

    const roads: AssetArchiveEntry[] = [
      ...this.roadArchive.map((sprite, index) => ({
        id: `road-${index}`,
        label: `Road ${index + 1}`,
        group: "roads",
        kind: "road",
        preview: sprite,
        roadVariant: index
      })),
      {
        id: "road-wood-deck",
        label: "Wood Deck",
        group: "roads",
        kind: "road",
        preview: this.getRoadSprite(CUSTOM_ROAD_WOOD_DECK),
        roadVariant: CUSTOM_ROAD_WOOD_DECK
      },
      {
        id: "road-wood-arch",
        label: "Wood Arch",
        group: "roads",
        kind: "road",
        preview: this.getRoadSprite(CUSTOM_ROAD_WOOD_ARCH),
        roadVariant: CUSTOM_ROAD_WOOD_ARCH
      }
    ];

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

    const landmarks: AssetArchiveEntry[] = [
      ...this.buildObjectEntries(ObjectType.HillStamp, "Hill", "landmarks", "landmark-hill"),
      ...this.buildObjectEntries(ObjectType.MountainStamp, "Mountain", "landmarks", "landmark-mountain"),
      ...this.buildObjectEntries(ObjectType.GardenStamp, "Garden", "landmarks", "landmark-garden")
    ];

    const flora: AssetArchiveEntry[] = [
      ...this.buildObjectEntries(ObjectType.GrainEar, "Grain Ear", "flora", "flora-grain"),
      ...this.buildObjectEntries(ObjectType.YellowGrainEar, "Yellow Ear", "flora", "flora-yellow-grain"),
      ...this.buildObjectEntries(ObjectType.GreenGrainEar, "Green Ear", "flora", "flora-green-grain"),
      ...this.buildObjectEntries(ObjectType.GrapeVine, "Grape Vine", "flora", "flora-grape-vine"),
      ...this.buildObjectEntries(ObjectType.AppleTree, "Apple Tree", "flora", "flora-apple-tree"),
      ...this.buildObjectEntries(ObjectType.OliveTree, "Olive Tree", "flora", "flora-olive-tree")
    ];

    return [
      { id: "ground", label: "Ground", entries: grounds },
      { id: "roads", label: "Roads", entries: roads },
      { id: "trees", label: "Trees", entries: trees },
      { id: "buildings", label: "Buildings", entries: buildings },
      { id: "landmarks", label: "Landmarks", entries: landmarks },
      { id: "flora", label: "Flora", entries: flora },
      { id: "props", label: "Props", entries: props },
      { id: "erase", label: "Erase", entries: [{ id: "erase-brush", label: "Erase", group: "erase", kind: "erase", preview: this.getTileSprite(TileType.Dirt, 1, 1) }] }
    ];
  }
}
