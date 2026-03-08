import generatedLayout from "./generated/world-layout.json";
import { WORLD_HEIGHT_TILES, WORLD_WIDTH_TILES } from "./protocol";

export const WORLD_LAYOUT_CELL_SIZE = 10;

export const enum MacroBiome {
  Plains = 0,
  Forest = 1,
  Mountain = 2,
  Water = 3,
  Village = 4
}

export interface VillageCenter {
  id: number;
  macroX: number;
  macroY: number;
  tileX: number;
  tileY: number;
  radius: number;
  name: string;
}

interface GeneratedWorldLayout {
  version: number;
  width: number;
  height: number;
  terrainRle: number[];
  villageRle: number[];
  plazaRle: number[];
  housingRle: number[];
  fieldRle: number[];
  roadRle: number[];
  bridgeRle: number[];
  villageCenters: Array<{
    id: number;
    tileX: number;
    tileY: number;
    radius: number;
    name: string;
    macroX?: number;
    macroY?: number;
  }>;
}

function decodeRle(source: number[], expectedSize: number): Uint8Array {
  const output = new Uint8Array(expectedSize);
  let writeIndex = 0;

  for (let index = 0; index < source.length; index += 2) {
    const count = source[index] ?? 0;
    const value = source[index + 1] ?? 0;
    output.fill(value, writeIndex, writeIndex + count);
    writeIndex += count;
  }

  if (writeIndex !== expectedSize) {
    throw new Error(`Invalid generated world layout: expected ${expectedSize} cells, decoded ${writeIndex}`);
  }

  return output;
}

function worldIndex(tileX: number, tileY: number): number {
  return tileY * WORLD_WIDTH_TILES + tileX;
}

function inWorld(tileX: number, tileY: number): boolean {
  return tileX >= 0 && tileY >= 0 && tileX < WORLD_WIDTH_TILES && tileY < WORLD_HEIGHT_TILES;
}

const layout = generatedLayout as GeneratedWorldLayout;
const expectedSize = WORLD_WIDTH_TILES * WORLD_HEIGHT_TILES;

if (layout.width !== WORLD_WIDTH_TILES || layout.height !== WORLD_HEIGHT_TILES) {
  throw new Error(
    `Generated world layout dimensions ${layout.width}x${layout.height} do not match runtime ${WORLD_WIDTH_TILES}x${WORLD_HEIGHT_TILES}`
  );
}

const terrain = decodeRle(layout.terrainRle, expectedSize);
const villageMask = decodeRle(layout.villageRle, expectedSize);
const plazaMask = decodeRle(layout.plazaRle, expectedSize);
const housingMask = decodeRle(layout.housingRle, expectedSize);
const fieldMask = decodeRle(layout.fieldRle, expectedSize);
const roadMask = decodeRle(layout.roadRle, expectedSize);
const bridgeMask = decodeRle(layout.bridgeRle, expectedSize);
const villageCenters: VillageCenter[] = layout.villageCenters.map((center, id) => ({
  id: center.id ?? id,
  tileX: center.tileX,
  tileY: center.tileY,
  radius: center.radius,
  name: center.name,
  macroX: center.macroX ?? Math.floor(center.tileX / WORLD_LAYOUT_CELL_SIZE),
  macroY: center.macroY ?? Math.floor(center.tileY / WORLD_LAYOUT_CELL_SIZE)
}));

export function hasGeneratedWorldLayout(): boolean {
  return layout.version >= 2;
}

export function getMacroBiome(tileX: number, tileY: number): MacroBiome {
  if (!inWorld(tileX, tileY)) {
    return MacroBiome.Water;
  }

  const index = worldIndex(tileX, tileY);
  if (terrain[index] === MacroBiome.Water) {
    return MacroBiome.Water;
  }
  if (villageMask[index] || housingMask[index] || plazaMask[index]) {
    return MacroBiome.Village;
  }
  if (terrain[index] === MacroBiome.Mountain) {
    return MacroBiome.Mountain;
  }
  if (terrain[index] === MacroBiome.Forest) {
    return MacroBiome.Forest;
  }
  return MacroBiome.Plains;
}

export function isVillageTile(tileX: number, tileY: number): boolean {
  return inWorld(tileX, tileY) && villageMask[worldIndex(tileX, tileY)] === 1;
}

export function isPlazaTile(tileX: number, tileY: number): boolean {
  return inWorld(tileX, tileY) && plazaMask[worldIndex(tileX, tileY)] === 1;
}

export function isHousingTile(tileX: number, tileY: number): boolean {
  return inWorld(tileX, tileY) && housingMask[worldIndex(tileX, tileY)] === 1;
}

export function isFieldTile(tileX: number, tileY: number): boolean {
  return inWorld(tileX, tileY) && fieldMask[worldIndex(tileX, tileY)] === 1;
}

export function hasGeneratedRoad(tileX: number, tileY: number): boolean {
  return inWorld(tileX, tileY) && roadMask[worldIndex(tileX, tileY)] === 1;
}

export function hasBridgeTile(tileX: number, tileY: number): boolean {
  return inWorld(tileX, tileY) && bridgeMask[worldIndex(tileX, tileY)] === 1;
}

export function getGeneratedRoadVariant(tileX: number, tileY: number): number | null {
  if (!hasGeneratedRoad(tileX, tileY)) {
    return null;
  }

  const north = hasGeneratedRoad(tileX, tileY - 1);
  const south = hasGeneratedRoad(tileX, tileY + 1);
  const west = hasGeneratedRoad(tileX - 1, tileY);
  const east = hasGeneratedRoad(tileX + 1, tileY);

  if ((north || south) && !(west || east)) {
    return 0;
  }
  if ((west || east) && !(north || south)) {
    return 1;
  }
  if (north && south && east && west) {
    return 2;
  }
  if ((north && south && east) || (north && south && west) || (east && west && north) || (east && west && south)) {
    return 2;
  }
  if (west && south) {
    return 3;
  }
  if (east && south) {
    return 5;
  }
  if (west && north) {
    return 6;
  }
  if (east && north) {
    return 7;
  }
  return 1;
}

export function getVillageCenters(): readonly VillageCenter[] {
  return villageCenters;
}
