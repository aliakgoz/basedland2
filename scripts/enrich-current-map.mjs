import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const WORLD_SEED = 133742;
const WORLD_WIDTH_TILES = 1000;
const WORLD_HEIGHT_TILES = 1000;
const HOUSE_VARIANT_COUNT = 20;
const LARGE_BUILDING_VARIANT_COUNT = 4;

const MacroBiome = {
  Plains: 0,
  Forest: 1,
  Mountain: 2,
  Water: 3,
  Village: 4
};

const TileType = {
  Grass: 0,
  Dirt: 1,
  Stone: 2,
  Water: 3,
  Forest: 4,
  Hill: 5,
  BarleyField: 6,
  WheatField: 7,
  Orchard: 8,
  Vineyard: 9,
  Garden: 10,
  PumpkinPatch: 11,
  CabbagePatch: 12,
  BerryGarden: 13,
  HerbGarden: 14,
  FallowField: 15,
  GrassDug: 16,
  DirtDug: 17,
  ForestDug: 18,
  StoneDug: 19,
  HillDug: 20
};

const ObjectType = {
  House: 0,
  Tree: 1,
  Stone: 2,
  Crate: 3,
  Well: 4,
  Ruins: 5,
  Sign: 6,
  Chest: 7,
  Horse: 8,
  Sheep: 9,
  GrassTuft: 10,
  Dog: 11,
  Cat: 12,
  Pub: 13,
  Inn: 14,
  Barn: 15,
  Stable: 16,
  Blacksmith: 17,
  Windmill: 18,
  Chapel: 19,
  Market: 20,
  Manor: 21,
  TownHall: 22,
  SparkMouse: 23,
  HillStamp: 24,
  MountainStamp: 25,
  GardenStamp: 26,
  GrainEar: 27,
  YellowGrainEar: 28,
  GreenGrainEar: 29,
  GrapeVine: 30,
  AppleTree: 31,
  OliveTree: 32
};

const LARGE_BUILDINGS = new Set([
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

const REQUIRED_BUILDINGS = [
  ObjectType.Well,
  ObjectType.Stable,
  ObjectType.Blacksmith,
  ObjectType.Inn,
  ObjectType.Pub,
  ObjectType.TownHall,
  ObjectType.Barn,
  ObjectType.Windmill,
  ObjectType.Market,
  ObjectType.Chapel,
  ObjectType.Manor
];

const SPECIAL_BUILDINGS = [
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

const HOUSE_PATH_TYPES = new Set([ObjectType.House, ...REQUIRED_BUILDINGS]);
const FLORA_TYPES = [
  ObjectType.Tree,
  ObjectType.GrainEar,
  ObjectType.YellowGrainEar,
  ObjectType.GreenGrainEar,
  ObjectType.GrapeVine,
  ObjectType.AppleTree,
  ObjectType.OliveTree
];

const FIELD_TILE_ROTATION = [
  TileType.WheatField,
  TileType.BarleyField,
  TileType.Orchard,
  TileType.Vineyard,
  TileType.Garden,
  TileType.BerryGarden,
  TileType.HerbGarden,
  TileType.CabbagePatch,
  TileType.PumpkinPatch,
  TileType.FallowField
];

function hash(value) {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function hash2d(seed, x, y) {
  return hash(seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263));
}

function noise01(seed, x, y, scale) {
  const sx = Math.floor(x / scale);
  const sy = Math.floor(y / scale);
  return hash2d(seed, sx, sy) / 0xffffffff;
}

function coarseBand(seed, x, y, scale) {
  return hash2d(seed, Math.floor(x / scale), Math.floor(y / scale)) % 4;
}

function sqrDistance(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function decodeRle(source, expectedSize) {
  const output = new Uint8Array(expectedSize);
  let writeIndex = 0;
  for (let index = 0; index < source.length; index += 2) {
    const count = source[index] ?? 0;
    const value = source[index + 1] ?? 0;
    output.fill(value, writeIndex, writeIndex + count);
    writeIndex += count;
  }
  if (writeIndex !== expectedSize) {
    throw new Error(`Invalid generated world layout: expected ${expectedSize}, got ${writeIndex}.`);
  }
  return output;
}

function inWorld(tileX, tileY) {
  return tileX >= 0 && tileY >= 0 && tileX < WORLD_WIDTH_TILES && tileY < WORLD_HEIGHT_TILES;
}

function worldIndex(tileX, tileY) {
  return tileY * WORLD_WIDTH_TILES + tileX;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function timestampLabel(date) {
  const parts = [
    date.getFullYear().toString().padStart(4, "0"),
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getDate().toString().padStart(2, "0"),
    "-",
    date.getHours().toString().padStart(2, "0"),
    date.getMinutes().toString().padStart(2, "0"),
    date.getSeconds().toString().padStart(2, "0")
  ];
  return parts.join("");
}

const root = process.cwd();
const mapPath = resolve(root, "data", "editor-map.json");
const layoutPath = resolve(root, "src", "shared", "generated", "world-layout.json");
const backupDir = resolve(root, "data", "backups");

const persisted = JSON.parse(readFileSync(mapPath, "utf8"));
const layout = JSON.parse(readFileSync(layoutPath, "utf8"));
const expectedSize = WORLD_WIDTH_TILES * WORLD_HEIGHT_TILES;
const terrain = decodeRle(layout.terrainRle, expectedSize);
const villageMask = decodeRle(layout.villageRle, expectedSize);
const plazaMask = decodeRle(layout.plazaRle, expectedSize);
const housingMask = decodeRle(layout.housingRle, expectedSize);
const fieldMask = decodeRle(layout.fieldRle, expectedSize);
const roadMask = decodeRle(layout.roadRle, expectedSize);
const bridgeMask = decodeRle(layout.bridgeRle, expectedSize);

mkdirSync(backupDir, { recursive: true });
const backupPath = resolve(backupDir, `editor-map-${timestampLabel(new Date())}.json`);
copyFileSync(mapPath, backupPath);

function getMacroBiome(tileX, tileY) {
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

function isVillageTile(tileX, tileY) {
  return inWorld(tileX, tileY) && villageMask[worldIndex(tileX, tileY)] === 1;
}

function isPlazaTile(tileX, tileY) {
  return inWorld(tileX, tileY) && plazaMask[worldIndex(tileX, tileY)] === 1;
}

function isHousingTile(tileX, tileY) {
  return inWorld(tileX, tileY) && housingMask[worldIndex(tileX, tileY)] === 1;
}

function isFieldTile(tileX, tileY) {
  return inWorld(tileX, tileY) && fieldMask[worldIndex(tileX, tileY)] === 1;
}

function hasGeneratedRoad(tileX, tileY) {
  return inWorld(tileX, tileY) && roadMask[worldIndex(tileX, tileY)] === 1;
}

function hasBridgeTile(tileX, tileY) {
  return inWorld(tileX, tileY) && bridgeMask[worldIndex(tileX, tileY)] === 1;
}

function isNearRoad(tileX, tileY, radius) {
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      if (hasGeneratedRoad(tileX + offsetX, tileY + offsetY)) {
        return true;
      }
    }
  }
  return false;
}

function isNearWater(tileX, tileY, radius) {
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

function getTileType(tileX, tileY) {
  if (!inWorld(tileX, tileY)) {
    return TileType.Water;
  }
  if (hasBridgeTile(tileX, tileY)) {
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
  const shoreline = isNearWater(tileX, tileY, 2);

  if (plaza) {
    return TileType.Stone;
  }
  if (road) {
    return biome === MacroBiome.Forest ? TileType.Forest : TileType.Grass;
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

function isWalkableTile(tileType) {
  return tileType !== TileType.Water;
}

function requiresRoadAccess(type) {
  return !FLORA_TYPES.includes(type) &&
    type !== ObjectType.Stone &&
    type !== ObjectType.GrassTuft &&
    type !== ObjectType.Sheep &&
    type !== ObjectType.Horse &&
    type !== ObjectType.Dog &&
    type !== ObjectType.Cat &&
    type !== ObjectType.SparkMouse &&
    type !== ObjectType.HillStamp &&
    type !== ObjectType.MountainStamp &&
    type !== ObjectType.GardenStamp;
}

function structureVariantCount(type) {
  if (LARGE_BUILDINGS.has(type)) {
    return LARGE_BUILDING_VARIANT_COUNT;
  }
  return type === ObjectType.House ? HOUSE_VARIANT_COUNT : 1;
}

function structureRadius(type) {
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

class EditorLayer {
  constructor(data) {
    this.ground = new Map();
    this.roads = new Map();
    this.objects = new Map();
    this.hiddenTiles = new Set();

    for (const item of data.ground ?? []) {
      this.ground.set(this.key(item.x, item.y), { ...item });
    }
    for (const item of data.roads ?? []) {
      this.roads.set(this.key(item.x, item.y), { ...item });
    }
    for (const item of data.objects ?? []) {
      this.objects.set(this.key(item.x, item.y), { ...item });
    }
    for (const item of data.hiddenTiles ?? []) {
      this.hiddenTiles.add(this.key(item.x, item.y));
    }
  }

  key(x, y) {
    return `${x},${y}`;
  }

  setGround(x, y, type) {
    const key = this.key(x, y);
    this.ground.set(key, { x, y, type });
    this.hiddenTiles.add(key);
  }

  placeObject(x, y, type, variant) {
    const key = this.key(x, y);
    this.objects.set(key, variant === undefined ? { x, y, type } : { x, y, type, variant });
    this.hiddenTiles.add(key);
  }

  getObjects() {
    return [...this.objects.values()];
  }

  finalize() {
    for (const key of this.ground.keys()) {
      this.hiddenTiles.add(key);
    }
    for (const key of this.roads.keys()) {
      this.hiddenTiles.add(key);
    }
    for (const key of this.objects.keys()) {
      this.hiddenTiles.add(key);
    }
    return {
      version: 3,
      ground: [...this.ground.values()].sort((a, b) => (a.y - b.y) || (a.x - b.x)),
      roads: [],
      objects: [...this.objects.values()].sort((a, b) => (a.y - b.y) || (a.x - b.x)),
      hiddenTiles: [...this.hiddenTiles]
        .map((key) => {
          const [x, y] = key.split(",").map(Number);
          return { x, y };
        })
        .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    };
  }
}

function isBuildableVillageTile(tileX, tileY) {
  if (!isWalkableTile(getTileType(tileX, tileY))) {
    return false;
  }
  if (hasGeneratedRoad(tileX, tileY) || hasBridgeTile(tileX, tileY) || isPlazaTile(tileX, tileY)) {
    return false;
  }
  const biome = getMacroBiome(tileX, tileY);
  return biome !== MacroBiome.Water && biome !== MacroBiome.Mountain;
}

function canPlaceStructure(tileX, tileY, type, existing) {
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

function findLotPosition(centerX, centerY, preferredX, preferredY, type, existing) {
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

function buildVillageStructurePlans() {
  const plans = [];

  for (const center of layout.villageCenters) {
    const local = [];
    const seed = hash2d(WORLD_SEED + 4001, center.tileX, center.tileY);
    const core = [
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
      const resolved = findLotPosition(
        center.tileX,
        center.tileY,
        center.tileX + offsetX,
        center.tileY + offsetY,
        ObjectType.House,
        local
      );
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

function objectRadius(type) {
  switch (type) {
    case ObjectType.House:
      return 5;
    case ObjectType.Windmill:
      return 6;
    case ObjectType.Pub:
    case ObjectType.Inn:
    case ObjectType.Barn:
    case ObjectType.Stable:
    case ObjectType.Blacksmith:
    case ObjectType.Chapel:
    case ObjectType.Market:
    case ObjectType.Manor:
    case ObjectType.TownHall:
      return 6;
    case ObjectType.Well:
      return 2;
    case ObjectType.Tree:
    case ObjectType.AppleTree:
    case ObjectType.OliveTree:
      return 3;
    case ObjectType.Horse:
    case ObjectType.Sheep:
      return 2;
    case ObjectType.Sign:
    case ObjectType.Crate:
    case ObjectType.Stone:
      return 1;
    default:
      return 1;
  }
}

function objectEntrance(tileX, tileY, type) {
  switch (type) {
    case ObjectType.House:
      return { x: tileX - 1, y: tileY + 4 };
    case ObjectType.Market:
    case ObjectType.Well:
      return { x: tileX - 1, y: tileY + 2 };
    case ObjectType.Windmill:
      return { x: tileX - 1, y: tileY + 5 };
    case ObjectType.Pub:
    case ObjectType.Inn:
    case ObjectType.Barn:
    case ObjectType.Stable:
    case ObjectType.Blacksmith:
    case ObjectType.Chapel:
    case ObjectType.Manor:
    case ObjectType.TownHall:
      return { x: tileX - 1, y: tileY + 5 };
    default:
      return { x: tileX, y: tileY + 1 };
  }
}

function spiralOffsets(maxRadius) {
  const offsets = [];
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (radius !== 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
          continue;
        }
        offsets.push([dx, dy]);
      }
    }
  }
  return offsets;
}

const searchOffsets = spiralOffsets(14);
const propSearchOffsets = spiralOffsets(6);
const layer = new EditorLayer(persisted.data);
const basePlans = buildVillageStructurePlans();
const combinedAnchors = [];
const anchorKeys = new Set();

for (const plan of basePlans) {
  combinedAnchors.push({
    x: plan.tileX,
    y: plan.tileY,
    type: plan.type,
    variant: plan.variant,
    source: "base"
  });
  anchorKeys.add(`${plan.tileX},${plan.tileY}`);
}

for (const object of layer.getObjects()) {
  combinedAnchors.push({
    x: object.x,
    y: object.y,
    type: object.type,
    variant: object.variant,
    source: "editor"
  });
  anchorKeys.add(`${object.x},${object.y}`);
}

function isOccupiedByAnchor(tileX, tileY) {
  return anchorKeys.has(`${tileX},${tileY}`);
}

function canPlaceVillageObject(center, tileX, tileY, type) {
  if (!inWorld(tileX, tileY) || hasBridgeTile(tileX, tileY)) {
    return false;
  }
  const baseTile = getTileType(tileX, tileY);
  const biome = getMacroBiome(tileX, tileY);
  if (!isWalkableTile(baseTile) || biome === MacroBiome.Water) {
    return false;
  }
  if ((LARGE_BUILDINGS.has(type) || type === ObjectType.House || type === ObjectType.Well) && biome === MacroBiome.Mountain) {
    return false;
  }
  const maxDistanceSq = (center.radius + 44) * (center.radius + 44);
  if (sqrDistance(tileX, tileY, center.tileX, center.tileY) > maxDistanceSq) {
    return false;
  }
  const radius = objectRadius(type);
  for (const anchor of combinedAnchors) {
    const minDistance = objectRadius(anchor.type) + radius;
    if (sqrDistance(tileX, tileY, anchor.x, anchor.y) <= minDistance * minDistance) {
      return false;
    }
  }
  return true;
}

function findPlacementNear(center, preferredX, preferredY, type) {
  for (const [offsetX, offsetY] of searchOffsets) {
    const tileX = preferredX + offsetX;
    const tileY = preferredY + offsetY;
    if (canPlaceVillageObject(center, tileX, tileY, type)) {
      return { x: tileX, y: tileY };
    }
  }
  return null;
}

function addObject(tileX, tileY, type, variant) {
  layer.placeObject(tileX, tileY, type, variant);
  combinedAnchors.push({ x: tileX, y: tileY, type, variant, source: "editor" });
  anchorKeys.add(`${tileX},${tileY}`);
}

function paintGroundTile(tileX, tileY, type) {
  if (!inWorld(tileX, tileY) || hasBridgeTile(tileX, tileY) || isOccupiedByAnchor(tileX, tileY)) {
    return;
  }
  if (!isWalkableTile(getTileType(tileX, tileY))) {
    return;
  }
  layer.setGround(tileX, tileY, type);
}

function paintStoneBrush(tileX, tileY) {
  for (let offsetY = 0; offsetY < 2; offsetY += 1) {
    for (let offsetX = 0; offsetX < 2; offsetX += 1) {
      paintGroundTile(tileX + offsetX, tileY + offsetY, TileType.Stone);
    }
  }
}

function paintStoneDisk(centerX, centerY, radius) {
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      if (offsetX * offsetX + offsetY * offsetY > radius * radius) {
        continue;
      }
      paintStoneBrush(centerX + offsetX, centerY + offsetY);
    }
  }
}

function paintTwoTilePath(startX, startY, endX, endY, seed) {
  let x = startX;
  let y = startY;
  const horizontalFirst = (hash2d(seed, startX, startY) & 1) === 0;

  const stepHorizontal = () => {
    while (x !== endX) {
      paintStoneBrush(x, y);
      x += x < endX ? 1 : -1;
    }
  };

  const stepVertical = () => {
    while (y !== endY) {
      paintStoneBrush(x, y);
      y += y < endY ? 1 : -1;
    }
  };

  if (horizontalFirst) {
    stepHorizontal();
    stepVertical();
  } else {
    stepVertical();
    stepHorizontal();
  }
  paintStoneBrush(endX, endY);
}

function paintFieldPatch(startX, startY, width, height, tileType) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tileX = startX + x;
      const tileY = startY + y;
      if (!inWorld(tileX, tileY) || isOccupiedByAnchor(tileX, tileY)) {
        continue;
      }
      if (!isWalkableTile(getTileType(tileX, tileY)) || hasBridgeTile(tileX, tileY)) {
        continue;
      }
      layer.setGround(tileX, tileY, tileType);
    }
  }
}

function tryPlaceProp(center, aroundX, aroundY, type, variant) {
  for (const [offsetX, offsetY] of propSearchOffsets) {
    const tileX = aroundX + offsetX;
    const tileY = aroundY + offsetY;
    if (!canPlaceVillageObject(center, tileX, tileY, type)) {
      continue;
    }
    addObject(tileX, tileY, type, variant);
    return true;
  }
  return false;
}

function decorateField(center, startX, startY, width, height, tileType, seed) {
  const strideX = tileType === TileType.Orchard || tileType === TileType.Vineyard ? 3 : 2;
  const strideY = tileType === TileType.Orchard || tileType === TileType.Vineyard ? 3 : 2;

  for (let y = startY + 1; y < startY + height - 1; y += strideY) {
    for (let x = startX + 1; x < startX + width - 1; x += strideX) {
      if (isOccupiedByAnchor(x, y)) {
        continue;
      }

      let objectType = null;
      if (tileType === TileType.WheatField) {
        objectType = ObjectType.YellowGrainEar;
      } else if (tileType === TileType.BarleyField) {
        objectType = ObjectType.GrainEar;
      } else if (tileType === TileType.Orchard) {
        objectType = (hash2d(seed + 71, x, y) & 1) === 0 ? ObjectType.AppleTree : ObjectType.OliveTree;
      } else if (tileType === TileType.Vineyard) {
        objectType = ObjectType.GrapeVine;
      } else if (
        tileType === TileType.Garden ||
        tileType === TileType.CabbagePatch ||
        tileType === TileType.HerbGarden
      ) {
        objectType = ObjectType.GreenGrainEar;
      } else if (tileType === TileType.BerryGarden || tileType === TileType.PumpkinPatch) {
        objectType = ObjectType.GrainEar;
      } else if (tileType === TileType.FallowField) {
        objectType = (hash2d(seed + 173, x, y) % 5) === 0 ? ObjectType.GreenGrainEar : null;
      }

      if (objectType !== null && canPlaceVillageObject(center, x, y, objectType)) {
        addObject(x, y, objectType, undefined);
      }
    }
  }
}

function paintForestBlob(center, blobX, blobY, radiusX, radiusY, seed) {
  for (let offsetY = -radiusY; offsetY <= radiusY; offsetY += 1) {
    for (let offsetX = -radiusX; offsetX <= radiusX; offsetX += 1) {
      const normX = offsetX / radiusX;
      const normY = offsetY / radiusY;
      if (normX * normX + normY * normY > 1.08) {
        continue;
      }
      const tileX = blobX + offsetX;
      const tileY = blobY + offsetY;
      if (!inWorld(tileX, tileY) || isOccupiedByAnchor(tileX, tileY)) {
        continue;
      }
      if (!isWalkableTile(getTileType(tileX, tileY))) {
        continue;
      }
      const maxInnerDistance = (center.radius + 10) * (center.radius + 10);
      if (sqrDistance(tileX, tileY, center.tileX, center.tileY) <= maxInnerDistance) {
        continue;
      }
      if ((hash2d(seed + 991, tileX, tileY) & 3) !== 0) {
        layer.setGround(tileX, tileY, TileType.Forest);
      }
      if ((hash2d(seed + 1811, tileX, tileY) % 5) === 0 && canPlaceVillageObject(center, tileX, tileY, ObjectType.Tree)) {
        addObject(tileX, tileY, ObjectType.Tree, hash2d(seed + 2227, tileX, tileY) % HOUSE_VARIANT_COUNT);
      }
    }
  }

  const accentOffsets = [
    [-radiusX + 1, 0],
    [radiusX - 1, -1],
    [0, radiusY - 1],
    [1, -radiusY + 1]
  ];

  for (const [offsetX, offsetY] of accentOffsets) {
    const tileX = blobX + offsetX;
    const tileY = blobY + offsetY;
    const type = (hash2d(seed + 3331, tileX, tileY) & 1) === 0 ? ObjectType.AppleTree : ObjectType.OliveTree;
    if (canPlaceVillageObject(center, tileX, tileY, type)) {
      addObject(tileX, tileY, type, undefined);
    }
  }
}

function makeHouseOffsets(center) {
  const outer = Math.max(28, center.radius + 6);
  const inner = Math.max(20, center.radius - 2);
  const offsets = [];
  for (let x = -outer; x <= outer; x += 8) {
    offsets.push([x, -inner]);
    offsets.push([x, inner]);
  }
  for (let y = -inner + 8; y <= inner - 8; y += 8) {
    offsets.push([-outer, y]);
    offsets.push([outer, y]);
  }
  for (let x = -inner; x <= inner; x += 8) {
    offsets.push([x, -outer]);
    offsets.push([x, outer]);
  }
  return offsets;
}

function villageObjects(center) {
  const maxDistanceSq = (center.radius + 48) * (center.radius + 48);
  return combinedAnchors.filter((item) => sqrDistance(item.x, item.y, center.tileX, center.tileY) <= maxDistanceSq);
}

function villageCounts(center) {
  const counts = new Map();
  const houseVariants = new Set();
  for (const object of villageObjects(center)) {
    counts.set(object.type, (counts.get(object.type) ?? 0) + 1);
    if (object.type === ObjectType.House && object.variant !== undefined) {
      houseVariants.add(object.variant);
    }
  }
  return { counts, houseVariants };
}

function enrichVillage(center) {
  const seed = hash2d(WORLD_SEED + 6001, center.tileX, center.tileY);
  const hubX = center.tileX - 1;
  const hubY = center.tileY + 2;

  paintStoneDisk(hubX, hubY, Math.max(4, Math.floor(center.radius / 6) + 3));

  const specialOffsets = [
    [-24, -12], [-10, -20], [8, -20], [24, -12], [-28, 8], [28, 8], [-10, 22], [8, 22], [-34, 0], [34, 0]
  ];

  const { counts, houseVariants } = villageCounts(center);
  for (let index = 0; index < REQUIRED_BUILDINGS.length; index += 1) {
    const type = REQUIRED_BUILDINGS[index];
    if ((counts.get(type) ?? 0) > 0) {
      continue;
    }
    const [offsetX, offsetY] = specialOffsets[index % specialOffsets.length];
    const placement = findPlacementNear(center, center.tileX + offsetX, center.tileY + offsetY, type);
    if (!placement) {
      continue;
    }
    const variant = LARGE_BUILDINGS.has(type)
      ? hash2d(seed + 100 + index, placement.x, placement.y) % LARGE_BUILDING_VARIANT_COUNT
      : undefined;
    addObject(placement.x, placement.y, type, variant);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const houseOffsets = makeHouseOffsets(center);
  for (let variant = 0; variant < HOUSE_VARIANT_COUNT; variant += 1) {
    if (houseVariants.has(variant)) {
      continue;
    }
    const [offsetX, offsetY] = houseOffsets[variant % houseOffsets.length];
    const placement = findPlacementNear(center, center.tileX + offsetX, center.tileY + offsetY, ObjectType.House);
    if (!placement) {
      continue;
    }
    addObject(placement.x, placement.y, ObjectType.House, variant);
    houseVariants.add(variant);
  }

  const fieldPlans = [
    { dx: -40, dy: -34, width: 12, height: 9, tile: FIELD_TILE_ROTATION[(center.id * 3) % FIELD_TILE_ROTATION.length] },
    { dx: 16, dy: -34, width: 11, height: 8, tile: FIELD_TILE_ROTATION[(center.id * 3 + 1) % FIELD_TILE_ROTATION.length] },
    { dx: -44, dy: 18, width: 10, height: 9, tile: FIELD_TILE_ROTATION[(center.id * 3 + 2) % FIELD_TILE_ROTATION.length] },
    { dx: 18, dy: 20, width: 10, height: 8, tile: FIELD_TILE_ROTATION[(center.id * 3 + 3) % FIELD_TILE_ROTATION.length] }
  ];

  for (let index = 0; index < fieldPlans.length; index += 1) {
    const plan = fieldPlans[index];
    const startX = clamp(center.tileX + plan.dx, 2, WORLD_WIDTH_TILES - plan.width - 3);
    const startY = clamp(center.tileY + plan.dy, 2, WORLD_HEIGHT_TILES - plan.height - 3);
    paintFieldPatch(startX, startY, plan.width, plan.height, plan.tile);
    decorateField(center, startX, startY, plan.width, plan.height, plan.tile, seed + index * 97);
  }

  const grovePlans = [
    [-56, -46, 8, 7],
    [52, -44, 8, 7],
    [-62, 16, 9, 8],
    [56, 24, 8, 7],
    [0, -60, 7, 6]
  ];
  for (let index = 0; index < grovePlans.length; index += 1) {
    const [dx, dy, rx, ry] = grovePlans[index];
    paintForestBlob(center, center.tileX + dx, center.tileY + dy, rx, ry, seed + index * 53);
  }

  const routeObjects = villageObjects(center).filter((item) => HOUSE_PATH_TYPES.has(item.type));
  for (const object of routeObjects) {
    const entrance = objectEntrance(object.x, object.y, object.type);
    paintTwoTilePath(entrance.x, entrance.y, hubX, hubY, seed + object.x * 11 + object.y * 17);
  }

  for (const object of routeObjects) {
    if (object.type === ObjectType.Stable) {
      tryPlaceProp(center, object.x + 4, object.y + 4, ObjectType.Horse, hash2d(seed + 17, object.x, object.y) % 3);
      tryPlaceProp(center, object.x - 4, object.y + 4, ObjectType.Sheep, undefined);
      tryPlaceProp(center, object.x + 2, object.y + 1, ObjectType.Crate, undefined);
    } else if (object.type === ObjectType.Barn) {
      tryPlaceProp(center, object.x + 4, object.y + 4, ObjectType.Sheep, undefined);
      tryPlaceProp(center, object.x - 3, object.y + 4, ObjectType.Sheep, undefined);
      tryPlaceProp(center, object.x + 1, object.y + 2, ObjectType.Crate, undefined);
    } else if (object.type === ObjectType.Blacksmith) {
      tryPlaceProp(center, object.x + 3, object.y + 2, ObjectType.Stone, undefined);
      tryPlaceProp(center, object.x - 2, object.y + 3, ObjectType.Crate, undefined);
    } else if (object.type === ObjectType.Pub || object.type === ObjectType.Inn || object.type === ObjectType.Market) {
      tryPlaceProp(center, object.x + 3, object.y + 3, ObjectType.Crate, undefined);
      tryPlaceProp(center, object.x - 2, object.y + 4, ObjectType.Sign, undefined);
    } else if (object.type === ObjectType.House && (hash2d(seed + 211, object.x, object.y) % 5) === 0) {
      tryPlaceProp(center, object.x + 2, object.y + 3, ObjectType.Crate, undefined);
    }
  }

  if ((counts.get(ObjectType.Dog) ?? 0) === 0) {
    tryPlaceProp(center, hubX + 5, hubY + 4, ObjectType.Dog, undefined);
  }
  if ((counts.get(ObjectType.Cat) ?? 0) === 0) {
    tryPlaceProp(center, hubX - 5, hubY + 4, ObjectType.Cat, undefined);
  }
}

function cellCounts(minX, minY, size) {
  const maxX = minX + size;
  const maxY = minY + size;
  let ground = 0;
  let objects = 0;
  for (const item of layer.ground.values()) {
    if (item.x >= minX && item.x < maxX && item.y >= minY && item.y < maxY) {
      ground += 1;
    }
  }
  for (const item of layer.objects.values()) {
    if (item.x >= minX && item.x < maxX && item.y >= minY && item.y < maxY) {
      objects += 1;
    }
  }
  return { ground, objects, score: ground + objects * 28 };
}

function dominantBiomeForCell(minX, minY, size) {
  const counts = new Map();
  for (let y = minY + 6; y < minY + size; y += 12) {
    for (let x = minX + 6; x < minX + size; x += 12) {
      const biome = getMacroBiome(x, y);
      counts.set(biome, (counts.get(biome) ?? 0) + 1);
    }
  }
  let winner = MacroBiome.Plains;
  let winnerCount = -1;
  for (const [biome, count] of counts) {
    if (biome === MacroBiome.Water) {
      continue;
    }
    if (count > winnerCount) {
      winner = biome;
      winnerCount = count;
    }
  }
  return winner;
}

function nearExistingVillage(tileX, tileY, extraRadius = 0) {
  return layout.villageCenters.some((center) => {
    const radius = center.radius + 72 + extraRadius;
    return sqrDistance(tileX, tileY, center.tileX, center.tileY) <= radius * radius;
  });
}

function findCellAnchor(minX, minY, size, context) {
  const centerX = minX + Math.floor(size / 2);
  const centerY = minY + Math.floor(size / 2);
  for (const [offsetX, offsetY] of searchOffsets) {
    const tileX = centerX + offsetX;
    const tileY = centerY + offsetY;
    if (tileX < minX + 4 || tileX >= minX + size - 4 || tileY < minY + 4 || tileY >= minY + size - 4) {
      continue;
    }
    if (canPlaceVillageObject(context, tileX, tileY, ObjectType.House)) {
      return { x: tileX, y: tileY };
    }
  }
  return null;
}

function placeHamlet(context, minX, minY, size, seed) {
  const anchor = findCellAnchor(minX, minY, size, context);
  if (!anchor) {
    return false;
  }
  paintStoneDisk(anchor.x, anchor.y, 3);

  const specialChoices = [
    ObjectType.Stable,
    ObjectType.Barn,
    ObjectType.Inn,
    ObjectType.Pub,
    ObjectType.Blacksmith,
    ObjectType.Chapel,
    ObjectType.Windmill
  ];
  const specialType = specialChoices[hash2d(seed + 13, minX, minY) % specialChoices.length];
  const houseOffsets = [
    [-10, -8],
    [8, -8],
    [-10, 8],
    [8, 8],
    [0, -16]
  ];

  for (let index = 0; index < houseOffsets.length; index += 1) {
    const [offsetX, offsetY] = houseOffsets[index];
    const placement = findPlacementNear(context, anchor.x + offsetX, anchor.y + offsetY, ObjectType.House);
    if (!placement) {
      continue;
    }
    addObject(placement.x, placement.y, ObjectType.House, hash2d(seed + 100 + index, placement.x, placement.y) % HOUSE_VARIANT_COUNT);
    const entrance = objectEntrance(placement.x, placement.y, ObjectType.House);
    paintTwoTilePath(entrance.x, entrance.y, anchor.x, anchor.y, seed + 300 + index);
  }

  const specialPlacement = findPlacementNear(context, anchor.x + 16, anchor.y, specialType);
  if (specialPlacement) {
    addObject(specialPlacement.x, specialPlacement.y, specialType, hash2d(seed + 201, specialPlacement.x, specialPlacement.y) % LARGE_BUILDING_VARIANT_COUNT);
    const entrance = objectEntrance(specialPlacement.x, specialPlacement.y, specialType);
    paintTwoTilePath(entrance.x, entrance.y, anchor.x, anchor.y, seed + 401);
  }

  const wellPlacement = findPlacementNear(context, anchor.x - 12, anchor.y + 2, ObjectType.Well);
  if (wellPlacement) {
    addObject(wellPlacement.x, wellPlacement.y, ObjectType.Well, undefined);
    const entrance = objectEntrance(wellPlacement.x, wellPlacement.y, ObjectType.Well);
    paintTwoTilePath(entrance.x, entrance.y, anchor.x, anchor.y, seed + 501);
  }

  const fieldA = { x: clamp(anchor.x - 28, minX + 2, minX + size - 18), y: clamp(anchor.y - 22, minY + 2, minY + size - 14), width: 12, height: 8 };
  const fieldB = { x: clamp(anchor.x + 10, minX + 2, minX + size - 14), y: clamp(anchor.y + 10, minY + 2, minY + size - 12), width: 10, height: 7 };
  const tileA = FIELD_TILE_ROTATION[hash2d(seed + 601, fieldA.x, fieldA.y) % FIELD_TILE_ROTATION.length];
  const tileB = FIELD_TILE_ROTATION[hash2d(seed + 701, fieldB.x, fieldB.y) % FIELD_TILE_ROTATION.length];
  paintFieldPatch(fieldA.x, fieldA.y, fieldA.width, fieldA.height, tileA);
  paintFieldPatch(fieldB.x, fieldB.y, fieldB.width, fieldB.height, tileB);
  decorateField(context, fieldA.x, fieldA.y, fieldA.width, fieldA.height, tileA, seed + 611);
  decorateField(context, fieldB.x, fieldB.y, fieldB.width, fieldB.height, tileB, seed + 711);

  tryPlaceProp(context, anchor.x + 2, anchor.y + 2, ObjectType.Crate, undefined);
  tryPlaceProp(context, anchor.x - 3, anchor.y + 2, ObjectType.Sign, undefined);
  tryPlaceProp(context, anchor.x + 4, anchor.y + 6, ObjectType.Horse, hash2d(seed + 801, anchor.x, anchor.y) % 3);
  tryPlaceProp(context, anchor.x - 5, anchor.y + 6, ObjectType.Sheep, undefined);
  tryPlaceProp(context, anchor.x + 6, anchor.y - 6, ObjectType.Dog, undefined);
  tryPlaceProp(context, anchor.x - 7, anchor.y - 5, ObjectType.Cat, undefined);

  paintForestBlob(context, minX + 14, minY + 16, 6, 5, seed + 901);
  paintForestBlob(context, minX + size - 16, minY + size - 18, 6, 5, seed + 1001);
  return true;
}

function placeWoodlandCluster(context, minX, minY, size, seed) {
  const anchor = findCellAnchor(minX, minY, size, context);
  if (!anchor) {
    return false;
  }
  paintForestBlob(context, anchor.x, anchor.y, 12, 10, seed + 13);
  paintForestBlob(context, anchor.x - 18, anchor.y + 16, 10, 8, seed + 27);
  paintForestBlob(context, anchor.x + 20, anchor.y - 18, 9, 7, seed + 39);

  const housePlacement = findPlacementNear(context, anchor.x - 6, anchor.y - 2, ObjectType.House);
  if (housePlacement) {
    addObject(housePlacement.x, housePlacement.y, ObjectType.House, hash2d(seed + 101, housePlacement.x, housePlacement.y) % HOUSE_VARIANT_COUNT);
    const entrance = objectEntrance(housePlacement.x, housePlacement.y, ObjectType.House);
    paintStoneDisk(anchor.x - 2, anchor.y + 2, 2);
    paintTwoTilePath(entrance.x, entrance.y, anchor.x - 2, anchor.y + 2, seed + 141);
  }

  const innPlacement = findPlacementNear(context, anchor.x + 10, anchor.y + 8, ObjectType.Inn);
  if (innPlacement && (hash2d(seed + 211, innPlacement.x, innPlacement.y) % 3) !== 0) {
    addObject(innPlacement.x, innPlacement.y, ObjectType.Inn, hash2d(seed + 231, innPlacement.x, innPlacement.y) % LARGE_BUILDING_VARIANT_COUNT);
    const entrance = objectEntrance(innPlacement.x, innPlacement.y, ObjectType.Inn);
    paintTwoTilePath(entrance.x, entrance.y, anchor.x - 2, anchor.y + 2, seed + 241);
  }

  tryPlaceProp(context, anchor.x + 4, anchor.y + 1, ObjectType.Ruins, undefined);
  tryPlaceProp(context, anchor.x + 8, anchor.y - 5, ObjectType.Chest, undefined);
  tryPlaceProp(context, anchor.x - 4, anchor.y + 6, ObjectType.Sign, undefined);
  tryPlaceProp(context, anchor.x - 10, anchor.y + 4, ObjectType.Stone, undefined);
  return true;
}

function placeOutpost(context, minX, minY, size, seed) {
  const anchor = findCellAnchor(minX, minY, size, context);
  if (!anchor) {
    return false;
  }
  paintStoneDisk(anchor.x, anchor.y, 4);
  const majorChoices = [ObjectType.Blacksmith, ObjectType.Chapel, ObjectType.Manor, ObjectType.Barn];
  const majorType = majorChoices[hash2d(seed + 17, minX, minY) % majorChoices.length];
  const majorPlacement = findPlacementNear(context, anchor.x + 10, anchor.y - 2, majorType);
  if (majorPlacement) {
    addObject(majorPlacement.x, majorPlacement.y, majorType, hash2d(seed + 91, majorPlacement.x, majorPlacement.y) % LARGE_BUILDING_VARIANT_COUNT);
    const entrance = objectEntrance(majorPlacement.x, majorPlacement.y, majorType);
    paintTwoTilePath(entrance.x, entrance.y, anchor.x, anchor.y, seed + 151);
  }
  for (const [offsetX, offsetY] of [[-10, -8], [-10, 8], [10, 10]]) {
    const placement = findPlacementNear(context, anchor.x + offsetX, anchor.y + offsetY, ObjectType.House);
    if (!placement) {
      continue;
    }
    addObject(placement.x, placement.y, ObjectType.House, hash2d(seed + 201 + offsetX, placement.x, placement.y) % HOUSE_VARIANT_COUNT);
    const entrance = objectEntrance(placement.x, placement.y, ObjectType.House);
    paintTwoTilePath(entrance.x, entrance.y, anchor.x, anchor.y, seed + 251 + offsetX);
  }
  tryPlaceProp(context, anchor.x + 2, anchor.y + 2, ObjectType.Stone, undefined);
  tryPlaceProp(context, anchor.x - 3, anchor.y + 3, ObjectType.Ruins, undefined);
  tryPlaceProp(context, anchor.x + 4, anchor.y - 2, ObjectType.Crate, undefined);
  paintForestBlob(context, anchor.x - 18, anchor.y - 16, 7, 6, seed + 301);
  return true;
}

function fillSparseCells() {
  const size = 100;
  for (let gy = 0; gy < 10; gy += 1) {
    for (let gx = 0; gx < 10; gx += 1) {
      const minX = gx * size;
      const minY = gy * size;
      const centerX = minX + 50;
      const centerY = minY + 50;
      if (nearExistingVillage(centerX, centerY, 10)) {
        continue;
      }
      const counts = cellCounts(minX, minY, size);
      if (counts.score >= 900) {
        continue;
      }
      const biome = dominantBiomeForCell(minX, minY, size);
      if (biome === MacroBiome.Water) {
        continue;
      }

      const context = { tileX: centerX, tileY: centerY, radius: 42 };
      const seed = hash2d(WORLD_SEED + 9001, gx, gy);
      if (biome === MacroBiome.Forest) {
        placeWoodlandCluster(context, minX, minY, size, seed);
      } else if (biome === MacroBiome.Mountain) {
        placeOutpost(context, minX, minY, size, seed);
      } else {
        placeHamlet(context, minX, minY, size, seed);
      }
    }
  }
}

function paintResidualNature(context, minX, minY, size, seed) {
  const centerX = minX + Math.floor(size / 2);
  const centerY = minY + Math.floor(size / 2);
  paintForestBlob(context, centerX - 18, centerY - 12, 8, 6, seed + 11);
  paintForestBlob(context, centerX + 14, centerY + 10, 7, 5, seed + 21);
  const fieldX = clamp(centerX - 10, minX + 2, minX + size - 14);
  const fieldY = clamp(centerY + 8, minY + 2, minY + size - 12);
  const tile = FIELD_TILE_ROTATION[hash2d(seed + 37, fieldX, fieldY) % FIELD_TILE_ROTATION.length];
  paintFieldPatch(fieldX, fieldY, 10, 7, tile);
  decorateField(context, fieldX, fieldY, 10, 7, tile, seed + 41);
}

function fillResidualCells() {
  const size = 100;
  for (let gy = 0; gy < 10; gy += 1) {
    for (let gx = 0; gx < 10; gx += 1) {
      const minX = gx * size;
      const minY = gy * size;
      const centerX = minX + 50;
      const centerY = minY + 50;
      const counts = cellCounts(minX, minY, size);
      if (counts.score >= 650) {
        continue;
      }

      const biome = dominantBiomeForCell(minX, minY, size);
      const landHeavy = biome !== MacroBiome.Water;
      if (!landHeavy) {
        continue;
      }

      const context = { tileX: centerX, tileY: centerY, radius: 46 };
      const seed = hash2d(WORLD_SEED + 12001, gx, gy);

      if (nearExistingVillage(centerX, centerY, -10)) {
        paintResidualNature(context, minX, minY, size, seed);
        continue;
      }

      if (biome === MacroBiome.Forest) {
        placeWoodlandCluster(context, minX, minY, size, seed);
      } else if (biome === MacroBiome.Mountain) {
        placeOutpost(context, minX, minY, size, seed);
      } else {
        placeHamlet(context, minX, minY, size, seed);
      }
    }
  }
}

for (const center of layout.villageCenters) {
  enrichVillage(center);
}

fillSparseCells();
fillResidualCells();

const nextData = layer.finalize();
const nextPersisted = {
  revision: (persisted.revision ?? 0) + 1,
  updatedAt: new Date().toISOString(),
  data: nextData
};

writeFileSync(mapPath, `${JSON.stringify(nextPersisted, null, 2)}\n`, "utf8");

const totalStone = nextData.ground.filter((item) => item.type === TileType.Stone).length;
const totalForest = nextData.ground.filter((item) => item.type === TileType.Forest).length;
const buildingCount = nextData.objects.filter((item) => HOUSE_PATH_TYPES.has(item.type)).length;
const floraCount = nextData.objects.filter((item) => FLORA_TYPES.includes(item.type)).length;

console.log(`Backup: ${backupPath}`);
console.log(`Ground tiles: ${nextData.ground.length} total, ${totalStone} stone, ${totalForest} forest.`);
console.log(`Objects: ${nextData.objects.length} total, ${buildingCount} village buildings/houses, ${floraCount} flora.`);
