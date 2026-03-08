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
import {
  MacroBiome,
  getMacroBiome,
  getVillageCenters,
  hasBridgeTile,
  hasGeneratedRoad,
  isFieldTile,
  isHousingTile,
  isPlazaTile,
  isVillageTile
} from "./world-layout";

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

function coarseBand(seed: number, x: number, y: number, scale: number): number {
  return hash2d(seed, Math.floor(x / scale), Math.floor(y / scale)) % 4;
}

function isNearRoad(tileX: number, tileY: number, radius: number): boolean {
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      if (hasGeneratedRoad(tileX + offsetX, tileY + offsetY)) {
        return true;
      }
    }
  }
  return false;
}

function isNearWater(tileX: number, tileY: number, radius: number): boolean {
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) {
        continue;
      }
      if (getMacroBiome(tileX + offsetX, tileY + offsetY) === MacroBiome.Water) {
        return true;
      }
    }
  }
  return false;
}

function isHouseLot(tileX: number, tileY: number): boolean {
  const coarseX = Math.floor(tileX / 4);
  const coarseY = Math.floor(tileY / 4);
  const localX = ((tileX % 4) + 4) % 4;
  const localY = ((tileY % 4) + 4) % 4;
  const lotSeed = hash2d(WORLD_SEED + 1901, coarseX, coarseY) / 0xffffffff;
  return localX === 1 && localY === 1 && lotSeed > 0.45 && lotSeed < 0.8;
}

function isVillageAnimalLot(tileX: number, tileY: number): boolean {
  return (Math.floor(tileX / 4) + Math.floor(tileY / 4)) % 3 === 0;
}

export function getTileType(tileX: number, tileY: number): TileType {
  if (tileX < 0 || tileY < 0 || tileX >= WORLD_WIDTH_TILES || tileY >= WORLD_HEIGHT_TILES) {
    return TileType.Water;
  }

  if (hasBridgeTile(tileX, tileY)) {
    return (tileX + tileY) % 2 === 0 ? TileType.Stone : TileType.Dirt;
  }

  const biome = getMacroBiome(tileX, tileY);
  if (biome === MacroBiome.Water) {
    return TileType.Water;
  }

  const patch = noise01(WORLD_SEED + 61, tileX, tileY, 32);
  const band = coarseBand(WORLD_SEED + 811, tileX, tileY, 64);
  const field = isFieldTile(tileX, tileY);
  const village = isVillageTile(tileX, tileY);
  const plaza = isPlazaTile(tileX, tileY);
  const housing = isHousingTile(tileX, tileY);
  const road = hasGeneratedRoad(tileX, tileY);
  const shoreline = isNearWater(tileX, tileY, 2);

  if (plaza) {
    return (Math.floor(tileX / 2) + Math.floor(tileY / 2)) % 2 === 0 ? TileType.Stone : TileType.Dirt;
  }

  if (road) {
    return (tileX + tileY) % 7 === 0 ? TileType.Stone : TileType.Dirt;
  }

  if (housing) {
    return patch > 0.88 ? TileType.Dirt : TileType.Grass;
  }

  if (field) {
    return Math.floor(tileY / 3) % 2 === 0 ? TileType.Dirt : TileType.Grass;
  }

  switch (biome) {
    case MacroBiome.Mountain:
      return band === 0 ? TileType.Dirt : TileType.Stone;

    case MacroBiome.Forest:
      if (shoreline && band === 0) {
        return TileType.Grass;
      }
      return band === 3 && patch > 0.8 ? TileType.Grass : TileType.Forest;

    case MacroBiome.Village:
      if (village) {
        return patch > 0.92 ? TileType.Dirt : TileType.Grass;
      }
      return TileType.Grass;

    case MacroBiome.Plains:
    default:
      if (shoreline && band !== 3) {
        return TileType.Grass;
      }
      return patch > 0.965 ? TileType.Dirt : TileType.Grass;
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

  for (let cellY = 0; cellY < CHUNK_SIZE_TILES; cellY += 2) {
    for (let cellX = 0; cellX < CHUNK_SIZE_TILES; cellX += 2) {
      const tileX = baseTileX + cellX + 1;
      const tileY = baseTileY + cellY + 1;
      const tile = getTileType(tileX, tileY);
      const biome = getMacroBiome(tileX, tileY);
      const village = isVillageTile(tileX, tileY);
      const plaza = isPlazaTile(tileX, tileY);
      const housing = isHousingTile(tileX, tileY);
      const field = isFieldTile(tileX, tileY);
      const onRoad = hasGeneratedRoad(tileX, tileY);
      const onBridge = hasBridgeTile(tileX, tileY);
      const nearRoad = isNearRoad(tileX, tileY, 3);

      if (!isWalkableTile(tile) || onRoad || onBridge) {
        continue;
      }

      if (isNearWater(tileX, tileY, 1) && village === false) {
        continue;
      }

      const roll = hash2d(WORLD_SEED + 91, tileX, tileY) / 0xffffffff;
      const cluster = noise01(WORLD_SEED + 701, tileX, tileY, 14);
      let type: ObjectType | null = null;

      if (biome === MacroBiome.Forest && !village) {
        if (!nearRoad && cluster > 0.32 && roll < 0.48) {
          type = ObjectType.Tree;
        } else if (roll > 0.988) {
          type = ObjectType.GrassTuft;
        }
      } else if (biome === MacroBiome.Mountain && !village) {
        if (cluster > 0.38 && roll < 0.26) {
          type = ObjectType.Stone;
        } else if (roll > 0.994) {
          type = ObjectType.Ruins;
        }
      } else if (field) {
        if (isVillageAnimalLot(tileX, tileY) && roll > 0.944 && roll < 0.97) {
          type = ObjectType.Sheep;
        } else if (isVillageAnimalLot(tileX, tileY) && roll > 0.97 && roll < 0.982) {
          type = ObjectType.Horse;
        } else if (!nearRoad && roll > 0.996) {
          type = ObjectType.GrassTuft;
        }
      } else if (plaza) {
        if ((tileX + tileY) % 11 === 0 && roll > 0.992) {
          type = ObjectType.Well;
        } else if ((tileX * 3 + tileY) % 19 === 0 && roll > 0.987 && roll < 0.991) {
          type = ObjectType.Sign;
        }
      } else if (housing) {
        if (isHouseLot(tileX, tileY)) {
          type = ObjectType.House;
        } else if (nearRoad && roll > 0.986 && roll < 0.992) {
          type = ObjectType.Crate;
        } else if (nearRoad && roll > 0.992 && roll < 0.996) {
          type = ObjectType.Sign;
        } else if (roll > 0.996 && roll < 0.9985) {
          type = ObjectType.Dog;
        } else if (roll > 0.9985) {
          type = ObjectType.Cat;
        }
      } else if (village) {
        if (!nearRoad && cluster > 0.7 && roll < 0.05) {
          type = ObjectType.Tree;
        } else if (roll > 0.995 && roll < 0.9975) {
          type = ObjectType.Chest;
        }
      } else if (biome === MacroBiome.Plains) {
        if (!nearRoad && cluster > 0.58 && roll < 0.04) {
          type = ObjectType.GrassTuft;
        } else if (nearRoad && roll > 0.996) {
          type = ObjectType.Sign;
        }
      }

      if (type !== null) {
        pushObject(objects, cx, cy, localIndex, type, tileX, tileY);
        localIndex += 1;
      }
    }
  }

  const chunkMinX = baseTileX;
  const chunkMinY = baseTileY;
  const chunkMaxX = baseTileX + CHUNK_SIZE_TILES - 1;
  const chunkMaxY = baseTileY + CHUNK_SIZE_TILES - 1;

  for (const center of getVillageCenters()) {
    if (center.tileX < chunkMinX || center.tileX > chunkMaxX || center.tileY < chunkMinY || center.tileY > chunkMaxY) {
      continue;
    }

    pushObject(objects, cx, cy, localIndex, ObjectType.Well, center.tileX, center.tileY);
    localIndex += 1;

    const signTileX = Math.min(chunkMaxX, center.tileX + 3);
    const signTileY = center.tileY + 1 <= chunkMaxY ? center.tileY + 1 : center.tileY;
    pushObject(objects, cx, cy, localIndex, ObjectType.Sign, signTileX, signTileY);
    localIndex += 1;
  }

  return objects;
}

export function findSpawnTile(id: number): [number, number] {
  const villages = getVillageCenters();
  if (villages.length > 0) {
    const center = villages[id % villages.length];
    for (let radius = 0; radius < 56; radius += 1) {
      for (let y = -radius; y <= radius; y += 1) {
        for (let x = -radius; x <= radius; x += 1) {
          const tileX = center.tileX + x;
          const tileY = center.tileY + y;
          if (
            isWalkableTile(getTileType(tileX, tileY)) &&
            !hasGeneratedRoad(tileX, tileY) &&
            !isFieldTile(tileX, tileY) &&
            !isPlazaTile(tileX, tileY)
          ) {
            return [tileX, tileY];
          }
        }
      }
    }
  }

  const centerX = Math.floor(WORLD_WIDTH_TILES / 2);
  const centerY = Math.floor(WORLD_HEIGHT_TILES / 2);
  const offsetX = ((id * 17) % 41) - 20;
  const offsetY = ((id * 29) % 41) - 20;
  const candidateX = centerX + offsetX;
  const candidateY = centerY + offsetY;

  for (let radius = 0; radius < 120; radius += 1) {
    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        const tileX = candidateX + x;
        const tileY = candidateY + y;
        const biome = getMacroBiome(tileX, tileY);
        if (
          (biome === MacroBiome.Village || biome === MacroBiome.Plains) &&
          isWalkableTile(getTileType(tileX, tileY)) &&
          !hasGeneratedRoad(tileX, tileY)
        ) {
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
    case ObjectType.Dog:
      return { action: 11, text: "The dog circles your boots happily." };
    case ObjectType.Cat:
      return { action: 12, text: "The cat watches you with royal judgment." };
    default:
      return { action: 0, text: "Nothing interesting happens." };
  }
}
