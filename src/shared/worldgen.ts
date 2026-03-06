import {
  CHUNK_SIZE_TILES,
  ObjectType,
  TILE_SIZE,
  TileType,
  WORLD_HEIGHT_TILES,
  WORLD_SEED,
  WORLD_WIDTH_TILES,
  type StaticObject
} from "./protocol";
import { MacroBiome, getMacroBiome } from "./world-layout";

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

function noise01(seed: number, x: number, y: number, scale: number): number {
  const sx = Math.floor(x / scale);
  const sy = Math.floor(y / scale);
  return hash2d(seed, sx, sy) / 0xffffffff;
}

export function getTileType(tileX: number, tileY: number): TileType {
  if (tileX < 0 || tileY < 0 || tileX >= WORLD_WIDTH_TILES || tileY >= WORLD_HEIGHT_TILES) {
    return TileType.Water;
  }

  const detail = noise01(WORLD_SEED + 61, tileX, tileY, 6);
  const terrain = noise01(WORLD_SEED + 17, tileX, tileY, 20);
  const biome = getMacroBiome(tileX, tileY);

  switch (biome) {
    case MacroBiome.Water:
      return TileType.Water;
    case MacroBiome.Mountain:
      return detail > 0.14 ? TileType.Stone : TileType.Dirt;
    case MacroBiome.Forest:
      return detail > 0.9 ? TileType.Grass : TileType.Forest;
    case MacroBiome.Village:
      if (detail > 0.82 || (terrain > 0.48 && terrain < 0.55)) {
        return TileType.Dirt;
      }
      return detail < 0.08 ? TileType.Stone : TileType.Grass;
    case MacroBiome.Plains:
    default:
      return detail > 0.9 ? TileType.Dirt : TileType.Grass;
  }
}

export function isWalkableTile(tile: TileType): boolean {
  return tile !== TileType.Water;
}

export function clampToWalkableTile(tileX: number, tileY: number): [number, number] {
  let radius = 0;

  while (radius < 64) {
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        const candidateX = tileX + x;
        const candidateY = tileY + y;
        if (isWalkableTile(getTileType(candidateX, candidateY))) {
          return [candidateX, candidateY];
        }
      }
    }
    radius += 1;
  }

  return [tileX, tileY];
}

function objectIdFor(cx: number, cy: number, localIndex: number): number {
  return ((cy & 0x7f) << 24) | ((cx & 0x7f) << 16) | (localIndex & 0xffff);
}

function pushObject(
  objects: StaticObject[],
  cx: number,
  cy: number,
  localIndex: number,
  type: ObjectType,
  tileX: number,
  tileY: number
): void {
  objects.push({
    id: objectIdFor(cx, cy, localIndex),
    type,
    x: tileX * TILE_SIZE + TILE_SIZE / 2,
    y: tileY * TILE_SIZE + TILE_SIZE / 2
  });
}

export function generateChunkObjects(cx: number, cy: number): StaticObject[] {
  const objects: StaticObject[] = [];
  let localIndex = 0;
  const baseTileX = cx * CHUNK_SIZE_TILES;
  const baseTileY = cy * CHUNK_SIZE_TILES;

  for (let cellY = 0; cellY < CHUNK_SIZE_TILES; cellY += 4) {
    for (let cellX = 0; cellX < CHUNK_SIZE_TILES; cellX += 4) {
      const tileX = baseTileX + cellX + 1;
      const tileY = baseTileY + cellY + 1;
      const tile = getTileType(tileX, tileY);
      const biome = getMacroBiome(tileX, tileY);
      if (!isWalkableTile(tile)) {
        continue;
      }

      const roll = hash2d(WORLD_SEED + 91, tileX, tileY) / 0xffffffff;
      let type: ObjectType | null = null;

      if (biome === MacroBiome.Forest && roll < 0.45) {
        type = ObjectType.Tree;
      } else if (biome === MacroBiome.Mountain && roll < 0.24) {
        type = ObjectType.Stone;
      } else if (biome === MacroBiome.Village && roll < 0.1) {
        type = ObjectType.House;
      } else if (biome === MacroBiome.Village && roll < 0.125) {
        type = ObjectType.Sign;
      } else if (biome === MacroBiome.Plains && roll < 0.06) {
        type = ObjectType.GrassTuft;
      } else if (biome === MacroBiome.Village && roll < 0.155) {
        type = ObjectType.Crate;
      } else if ((biome === MacroBiome.Plains || biome === MacroBiome.Village) && roll > 0.92 && roll < 0.94) {
        type = ObjectType.Sheep;
      } else if ((biome === MacroBiome.Plains || biome === MacroBiome.Village) && roll > 0.94 && roll < 0.953) {
        type = ObjectType.Horse;
      } else if (biome === MacroBiome.Village && roll > 0.965) {
        type = ObjectType.Well;
      } else if (biome === MacroBiome.Mountain && roll > 0.965) {
        type = ObjectType.Ruins;
      } else if (biome === MacroBiome.Village && roll > 0.955 && roll < 0.965) {
        type = ObjectType.Chest;
      }

      if (type !== null) {
        pushObject(objects, cx, cy, localIndex, type, tileX, tileY);
        localIndex += 1;
      }
    }
  }

  return objects;
}

export function findSpawnTile(id: number): [number, number] {
  const centerX = Math.floor(WORLD_WIDTH_TILES / 2);
  const centerY = Math.floor(WORLD_HEIGHT_TILES / 2);
  const offsetX = ((id * 17) % 41) - 20;
  const offsetY = ((id * 29) % 41) - 20;
  const candidateX = centerX + offsetX;
  const candidateY = centerY + offsetY;

  for (let radius = 0; radius < 100; radius += 1) {
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        const tileX = candidateX + x;
        const tileY = candidateY + y;
        const biome = getMacroBiome(tileX, tileY);
        if ((biome === MacroBiome.Village || biome === MacroBiome.Plains) && isWalkableTile(getTileType(tileX, tileY))) {
          return [tileX, tileY];
        }
      }
    }
  }

  return clampToWalkableTile(candidateX, candidateY);
}

export function describeInteraction(type: ObjectType): { action: number; text: string } {
  switch (type) {
    case ObjectType.Tree:
      return { action: 0, text: "The tree creaks softly." };
    case ObjectType.Stone:
      return { action: 1, text: "You pocket a smooth pebble." };
    case ObjectType.House:
      return { action: 2, text: "You knock on the house door." };
    case ObjectType.Crate:
      return { action: 3, text: "The crate is full of dusty tools." };
    case ObjectType.Well:
      return { action: 4, text: "Cold water echoes below." };
    case ObjectType.Ruins:
      return { action: 5, text: "Ancient stones hum with history." };
    case ObjectType.Sign:
      return { action: 6, text: "The sign reads: Welcome to BasedLand." };
    case ObjectType.Chest:
      return { action: 7, text: "The chest is locked for now." };
    case ObjectType.Horse:
      return { action: 8, text: "The horse snorts and paws the dirt." };
    case ObjectType.Sheep:
      return { action: 9, text: "The sheep lets out a soft baa." };
    case ObjectType.GrassTuft:
      return { action: 10, text: "Wild grass sways in the breeze." };
    default:
      return { action: 0, text: "Nothing interesting happens." };
  }
}
