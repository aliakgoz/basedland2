import layoutJson from "./generated/world-layout.json";
import { WORLD_HEIGHT_TILES, WORLD_WIDTH_TILES } from "./protocol";

export const WORLD_LAYOUT_CELL_SIZE = 10;

export const enum MacroBiome {
  Plains = 0,
  Forest = 1,
  Mountain = 2,
  Water = 3,
  Village = 4
}

interface LayoutJson {
  width: number;
  height: number;
  data: number[];
}

const layout = layoutJson as LayoutJson;
const layoutData = Array.isArray(layout.data) ? Uint8Array.from(layout.data) : new Uint8Array();

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

function fallbackMacroBiome(tileX: number, tileY: number): MacroBiome {
  const terrain = hash2d(99173, Math.floor(tileX / 24), Math.floor(tileY / 24)) / 0xffffffff;
  const moisture = hash2d(99191, Math.floor(tileX / 18), Math.floor(tileY / 18)) / 0xffffffff;
  if (terrain < 0.1) {
    return MacroBiome.Water;
  }
  if (terrain > 0.84) {
    return MacroBiome.Mountain;
  }
  if (moisture > 0.72) {
    return MacroBiome.Forest;
  }
  if (terrain > 0.52 && terrain < 0.56 && moisture < 0.35) {
    return MacroBiome.Village;
  }
  return MacroBiome.Plains;
}

export function hasGeneratedWorldLayout(): boolean {
  return layoutData.length === layout.width * layout.height && layout.width > 0 && layout.height > 0;
}

export function getMacroBiome(tileX: number, tileY: number): MacroBiome {
  if (tileX < 0 || tileY < 0 || tileX >= WORLD_WIDTH_TILES || tileY >= WORLD_HEIGHT_TILES) {
    return MacroBiome.Water;
  }

  if (!hasGeneratedWorldLayout()) {
    return fallbackMacroBiome(tileX, tileY);
  }

  const cellX = Math.min(layout.width - 1, Math.max(0, Math.floor(tileX / WORLD_LAYOUT_CELL_SIZE)));
  const cellY = Math.min(layout.height - 1, Math.max(0, Math.floor(tileY / WORLD_LAYOUT_CELL_SIZE)));
  return layoutData[cellY * layout.width + cellX] as MacroBiome;
}
