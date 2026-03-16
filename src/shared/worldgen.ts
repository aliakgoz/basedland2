import {
  CHUNK_SIZE_TILES,
  ObjectType,
  TILE_SIZE,
  TileType,
  WORLD_HEIGHT_TILES,
  WORLD_SEED,
  WORLD_WIDTH_TILES,
  sqrDistance,
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

function requiresRoadAccess(type: ObjectType): boolean {
  switch (type) {
    case ObjectType.Tree:
    case ObjectType.Stone:
    case ObjectType.GrassTuft:
    case ObjectType.Sheep:
    case ObjectType.Horse:
    case ObjectType.Dog:
    case ObjectType.Cat:
    case ObjectType.SparkMouse:
    case ObjectType.HillStamp:
    case ObjectType.MountainStamp:
    case ObjectType.GardenStamp:
    case ObjectType.GrainEar:
    case ObjectType.YellowGrainEar:
    case ObjectType.GreenGrainEar:
    case ObjectType.GrapeVine:
    case ObjectType.AppleTree:
    case ObjectType.OliveTree:
      return false;
    default:
      return true;
  }
}

export function getTileType(tileX: number, tileY: number): TileType {
  if (tileX < 0 || tileY < 0 || tileX >= WORLD_WIDTH_TILES || tileY >= WORLD_HEIGHT_TILES) {
    return TileType.Water;
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
  const bridge = hasBridgeTile(tileX, tileY);
  const shoreline = isNearWater(tileX, tileY, 2);

  if (plaza || bridge) {
    return TileType.Stone;
  }

  if (road) {
    return TileType.Stone;
  }

  if (housing) {
    return patch > 0.94 ? TileType.Dirt : TileType.Grass;
  }

  if (field) {
    return TileType.Dirt;
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
  tileY: number,
  variant?: number
): void {
  objects.push({
    id: objectIdFor(cx, cy, localIndex),
    type,
    x: tileX * TILE_SIZE + TILE_SIZE / 2,
    y: tileY * TILE_SIZE + TILE_SIZE / 2,
    variant
  });
}

interface VillageStructurePlan {
  type: ObjectType;
  tileX: number;
  tileY: number;
  variant?: number;
}

const HOUSE_VARIANT_COUNT = 20;
const TREE_VARIANT_COUNT = 20;
const LARGE_BUILDING_VARIANT_COUNT = 4;
const SPECIAL_BUILDINGS: ObjectType[] = [
  ObjectType.Pub,
  ObjectType.Inn,
  ObjectType.Blacksmith,
  ObjectType.Chapel,
  ObjectType.Barn,
  ObjectType.Stable,
  ObjectType.Windmill,
  ObjectType.Market,
  ObjectType.Manor,
  ObjectType.TownHall
];

function structureVariantCount(type: ObjectType): number {
  switch (type) {
    case ObjectType.Pub:
    case ObjectType.Inn:
    case ObjectType.Blacksmith:
    case ObjectType.Chapel:
    case ObjectType.Barn:
    case ObjectType.Stable:
    case ObjectType.Windmill:
    case ObjectType.Market:
    case ObjectType.Manor:
    case ObjectType.TownHall:
      return LARGE_BUILDING_VARIANT_COUNT;
    case ObjectType.House:
      return HOUSE_VARIANT_COUNT;
    default:
      return 1;
  }
}

function structureRadius(type: ObjectType): number {
  switch (type) {
    case ObjectType.Windmill:
      return 4;
    case ObjectType.House:
      return 3;
    case ObjectType.Well:
    case ObjectType.Sign:
    case ObjectType.Crate:
    case ObjectType.Chest:
      return 1;
    default:
      return 4;
  }
}

function isBuildableVillageTile(tileX: number, tileY: number): boolean {
  if (!isWalkableTile(getTileType(tileX, tileY))) {
    return false;
  }
  if (hasGeneratedRoad(tileX, tileY) || hasBridgeTile(tileX, tileY) || isPlazaTile(tileX, tileY)) {
    return false;
  }
  const biome = getMacroBiome(tileX, tileY);
  return biome !== MacroBiome.Water && biome !== MacroBiome.Mountain;
}

function canPlaceStructure(tileX: number, tileY: number, type: ObjectType, existing: VillageStructurePlan[]): boolean {
  if (!isBuildableVillageTile(tileX, tileY)) {
    return false;
  }

  const radius = structureRadius(type);
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const px = tileX + offsetX;
      const py = tileY + offsetY;
      if (!isWalkableTile(getTileType(px, py)) || hasGeneratedRoad(px, py) || hasBridgeTile(px, py)) {
        return false;
      }
    }
  }

  return existing.every((item) => {
    const minDistance = structureRadius(item.type) + radius + 1;
    return sqrDistance(item.tileX, item.tileY, tileX, tileY) > minDistance * minDistance;
  });
}

function findLotPosition(
  centerX: number,
  centerY: number,
  preferredX: number,
  preferredY: number,
  type: ObjectType,
  existing: VillageStructurePlan[]
): [number, number] | null {
  for (let radius = 0; radius <= 6; radius += 1) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        const tileX = preferredX + offsetX;
        const tileY = preferredY + offsetY;
        if (sqrDistance(tileX, tileY, centerX, centerY) > 42 * 42) {
          continue;
        }
        if (!isVillageTile(tileX, tileY) && !isHousingTile(tileX, tileY) && !isFieldTile(tileX, tileY)) {
          continue;
        }
        if (requiresRoadAccess(type) && !isNearRoad(tileX, tileY, type === ObjectType.House ? 5 : 7)) {
          continue;
        }
        if (canPlaceStructure(tileX, tileY, type, existing)) {
          return [tileX, tileY];
        }
      }
    }
  }

  return null;
}

function buildVillageStructurePlans(): VillageStructurePlan[] {
  const plans: VillageStructurePlan[] = [];

  for (const center of getVillageCenters()) {
    const local: VillageStructurePlan[] = [];
    const seed = hash2d(WORLD_SEED + 4001, center.tileX, center.tileY);

    const core: Array<{ type: ObjectType; x: number; y: number; variant?: number }> = [
      { type: ObjectType.Well, x: center.tileX, y: center.tileY },
      {
        type: ObjectType.Market,
        x: center.tileX + 8,
        y: center.tileY - 4,
        variant: hash2d(seed + 121, center.tileX + 8, center.tileY - 4) % structureVariantCount(ObjectType.Market)
      },
      { type: ObjectType.Sign, x: center.tileX + center.radius - 4, y: center.tileY + 1 }
    ];

    const specialOffsets = [
      [-14, -12],
      [14, -12],
      [-14, 12],
      [14, 12],
      [0, -16],
      [0, 16]
    ];

    const specialCount = center.radius >= 30 ? 5 : 4;
    for (let index = 0; index < specialCount; index += 1) {
      const type = SPECIAL_BUILDINGS[(index + (seed % SPECIAL_BUILDINGS.length)) % SPECIAL_BUILDINGS.length];
      const [offsetX, offsetY] = specialOffsets[index % specialOffsets.length];
      core.push({
        type,
        x: center.tileX + offsetX,
        y: center.tileY + offsetY,
        variant: hash2d(seed + 500 + index, center.tileX + offsetX, center.tileY + offsetY) % structureVariantCount(type)
      });
    }

    for (const item of core) {
      const resolved = findLotPosition(center.tileX, center.tileY, item.x, item.y, item.type, local);
      if (resolved) {
        local.push({ type: item.type, tileX: resolved[0], tileY: resolved[1], variant: item.variant });
      }
    }

    const houseOffsets = [
      [-18, -14], [-10, -14], [-2, -14], [6, -14], [14, -14],
      [-18, -4], [14, -4],
      [-18, 4], [14, 4],
      [-18, 14], [-10, 14], [-2, 14], [6, 14], [14, 14],
      [-8, -20], [0, -20], [8, -20], [-8, 20], [0, 20], [8, 20]
    ];

    for (let index = 0; index < houseOffsets.length; index += 1) {
      const [offsetX, offsetY] = houseOffsets[index];
      const resolved = findLotPosition(center.tileX, center.tileY, center.tileX + offsetX, center.tileY + offsetY, ObjectType.House, local);
      if (!resolved) {
        continue;
      }
      const variant = hash2d(seed + 900 + index, resolved[0], resolved[1]) % HOUSE_VARIANT_COUNT;
      local.push({ type: ObjectType.House, tileX: resolved[0], tileY: resolved[1], variant });
    }

    plans.push(...local);
  }

  plans.sort((a, b) => (a.tileY - b.tileY) || (a.tileX - b.tileX) || (a.type - b.type));
  return plans;
}

const plannedVillageStructures = buildVillageStructurePlans();

function isNearPlannedStructure(tileX: number, tileY: number, radius: number): boolean {
  return plannedVillageStructures.some((item) => sqrDistance(item.tileX, item.tileY, tileX, tileY) <= radius * radius);
}

export function generateChunkObjects(cx: number, cy: number): StaticObject[] {
  const objects: StaticObject[] = [];
  let localIndex = 0;
  const baseTileX = cx * CHUNK_SIZE_TILES;
  const baseTileY = cy * CHUNK_SIZE_TILES;
  const chunkMinX = baseTileX;
  const chunkMinY = baseTileY;
  const chunkMaxX = baseTileX + CHUNK_SIZE_TILES - 1;
  const chunkMaxY = baseTileY + CHUNK_SIZE_TILES - 1;

  for (const structure of plannedVillageStructures) {
    if (
      structure.tileX < chunkMinX ||
      structure.tileX > chunkMaxX ||
      structure.tileY < chunkMinY ||
      structure.tileY > chunkMaxY
    ) {
      continue;
    }
    pushObject(objects, cx, cy, localIndex, structure.type, structure.tileX, structure.tileY, structure.variant);
    localIndex += 1;
  }

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
      const horseVariant = hash2d(WORLD_SEED + 551, tileX, tileY) % 3;
      const treeVariant = hash2d(WORLD_SEED + 552, tileX, tileY) % TREE_VARIANT_COUNT;
      const nearRoad = isNearRoad(tileX, tileY, 3);

      if (!isWalkableTile(tile) || onRoad || onBridge) {
        continue;
      }

      if (isNearPlannedStructure(tileX, tileY, 5)) {
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
        if (nearRoad && roll > 0.986 && roll < 0.992) {
          type = ObjectType.Crate;
        } else if (!nearRoad && roll > 0.9952 && roll < 0.9964) {
          type = ObjectType.SparkMouse;
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
        } else if (roll > 0.9975 && roll < 0.9983) {
          type = ObjectType.SparkMouse;
        }
      } else if (biome === MacroBiome.Plains) {
        if (!nearRoad && cluster > 0.58 && roll < 0.04) {
          type = ObjectType.GrassTuft;
        } else if (nearRoad && roll > 0.996) {
          type = ObjectType.Sign;
        } else if (!nearRoad && cluster > 0.5 && roll > 0.9988) {
          type = ObjectType.SparkMouse;
        }
      }

      if (type !== null) {
        const variant =
          type === ObjectType.Horse ? horseVariant :
          type === ObjectType.Tree ? treeVariant :
          undefined;
        pushObject(objects, cx, cy, localIndex, type, tileX, tileY, variant);
        localIndex += 1;
      }
    }
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
    case ObjectType.Pub:
      return { action: 13, text: "The pub smells like hearth smoke and cider." };
    case ObjectType.Inn:
      return { action: 14, text: "The innkeeper has rooms, but not yet for players." };
    case ObjectType.Barn:
      return { action: 15, text: "Hay and old tools fill the barn." };
    case ObjectType.Stable:
      return { action: 16, text: "The stable is warm and full of saddle leather." };
    case ObjectType.Blacksmith:
      return { action: 17, text: "A hammer rings somewhere inside the smithy." };
    case ObjectType.Windmill:
      return { action: 18, text: "The windmill creaks over the fields." };
    case ObjectType.Chapel:
      return { action: 19, text: "The chapel is quiet and cool." };
    case ObjectType.Market:
      return { action: 20, text: "Stalls are stacked with bread, apples, and cloth." };
    case ObjectType.Manor:
      return { action: 21, text: "The manor keeps its curtains drawn." };
    case ObjectType.TownHall:
      return { action: 22, text: "Village notices are pinned to the hall door." };
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
    case ObjectType.SparkMouse:
      return { action: 23, text: "The little spark beast crackles and darts away." };
    case ObjectType.HillStamp:
      return { action: 24, text: "The hillside rises in layered terraces." };
    case ObjectType.MountainStamp:
      return { action: 25, text: "The mountain face towers over the valley." };
    case ObjectType.GardenStamp:
      return { action: 26, text: "Trellises and crop rows run across the garden." };
    case ObjectType.GrainEar:
      return { action: 27, text: "A ripe grain stalk bends in the wind." };
    case ObjectType.YellowGrainEar:
      return { action: 28, text: "The yellow ear is dry and ready for harvest." };
    case ObjectType.GreenGrainEar:
      return { action: 29, text: "The green ear is still filling with grain." };
    case ObjectType.GrapeVine:
      return { action: 30, text: "A vine hangs heavy with clustered grapes." };
    case ObjectType.AppleTree:
      return { action: 31, text: "The apple tree smells sharp and sweet." };
    case ObjectType.OliveTree:
      return { action: 32, text: "Silvery olive leaves shimmer in the light." };
    default:
      return { action: 0, text: "Nothing interesting happens." };
  }
}
