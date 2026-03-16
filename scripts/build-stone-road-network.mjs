import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const WORLD_SEED = 133742;
const WORLD_WIDTH_TILES = 1000;
const WORLD_HEIGHT_TILES = 1000;

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

const ROUTE_BUILDING_TYPES = new Set([
  ObjectType.House,
  ObjectType.Well,
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

function inWorld(tileX, tileY) {
  return tileX >= 0 && tileY >= 0 && tileX < WORLD_WIDTH_TILES && tileY < WORLD_HEIGHT_TILES;
}

function worldIndex(tileX, tileY) {
  return tileY * WORLD_WIDTH_TILES + tileX;
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

const groundMap = new Map((persisted.data.ground ?? []).map((item) => [`${item.x},${item.y}`, { ...item }]));
const objectMap = new Map((persisted.data.objects ?? []).map((item) => [`${item.x},${item.y}`, { ...item }]));
const hiddenTiles = new Set((persisted.data.hiddenTiles ?? []).map((item) => `${item.x},${item.y}`));

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

function isFieldTile(tileX, tileY) {
  return inWorld(tileX, tileY) && fieldMask[worldIndex(tileX, tileY)] === 1;
}

function hasGeneratedRoad(tileX, tileY) {
  return inWorld(tileX, tileY) && roadMask[worldIndex(tileX, tileY)] === 1;
}

function hasBridgeTile(tileX, tileY) {
  return inWorld(tileX, tileY) && bridgeMask[worldIndex(tileX, tileY)] === 1;
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

function baseTileType(tileX, tileY) {
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
  const plaza = inWorld(tileX, tileY) && plazaMask[worldIndex(tileX, tileY)] === 1;
  const housing = inWorld(tileX, tileY) && housingMask[worldIndex(tileX, tileY)] === 1;
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
      return patch > 0.92 ? TileType.Dirt : TileType.Grass;
    case MacroBiome.Plains:
    default:
      if (shoreline && band !== 3) {
        return TileType.Grass;
      }
      return patch > 0.965 ? TileType.Dirt : TileType.Grass;
  }
}

function getTileType(tileX, tileY) {
  return groundMap.get(`${tileX},${tileY}`)?.type ?? baseTileType(tileX, tileY);
}

function isWalkableTile(tileType) {
  return tileType !== TileType.Water;
}

function setGround(tileX, tileY, type) {
  if (!inWorld(tileX, tileY)) {
    return;
  }
  const key = `${tileX},${tileY}`;
  groundMap.set(key, { x: tileX, y: tileY, type });
  hiddenTiles.add(key);
}

function objectEntrance(object) {
  switch (object.type) {
    case ObjectType.House:
      return { x: object.x - 1, y: object.y + 4 };
    case ObjectType.Market:
    case ObjectType.Well:
      return { x: object.x - 1, y: object.y + 2 };
    case ObjectType.Windmill:
      return { x: object.x - 1, y: object.y + 5 };
    case ObjectType.Pub:
    case ObjectType.Inn:
    case ObjectType.Barn:
    case ObjectType.Stable:
    case ObjectType.Blacksmith:
    case ObjectType.Chapel:
    case ObjectType.Manor:
    case ObjectType.TownHall:
      return { x: object.x - 1, y: object.y + 5 };
    default:
      return { x: object.x, y: object.y + 1 };
  }
}

function nodeKey(x, y) {
  return `${x},${y}`;
}

const objectAnchors = new Set(objectMap.keys());
const buildingObjects = [...objectMap.values()].filter((object) => ROUTE_BUILDING_TYPES.has(object.type));

function paintStoneBrush(tileX, tileY) {
  for (let offsetY = 0; offsetY < 2; offsetY += 1) {
    for (let offsetX = 0; offsetX < 2; offsetX += 1) {
      const px = tileX + offsetX;
      const py = tileY + offsetY;
      if (!inWorld(px, py)) {
        continue;
      }
      const key = nodeKey(px, py);
      const occupant = objectMap.get(key);
      if (occupant) {
        if (ROUTE_BUILDING_TYPES.has(occupant.type)) {
          continue;
        }
        objectMap.delete(key);
        objectAnchors.delete(key);
      }
      setGround(px, py, TileType.Stone);
    }
  }
}

function hasStoneNear(tileX, tileY, radius = 1) {
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      if (getTileType(tileX + offsetX, tileY + offsetY) === TileType.Stone) {
        return true;
      }
    }
  }
  return false;
}

function routeNodes() {
  const villageNodes = layout.villageCenters.map((center) => ({
    kind: "village",
    x: center.tileX - 1,
    y: center.tileY + 2,
    name: center.name
  }));

  const villageRadius = (tileX, tileY) =>
    layout.villageCenters.some((center) => sqrDistance(tileX, tileY, center.tileX, center.tileY) <= (center.radius + 72) ** 2);

  const outliers = buildingObjects
    .map((object) => ({ object, entrance: objectEntrance(object) }))
    .filter(({ entrance }) => !villageRadius(entrance.x, entrance.y));

  const clusters = [];
  for (const item of outliers) {
    let bestCluster = null;
    let bestDistance = Infinity;
    for (const cluster of clusters) {
      const distance = Math.hypot(item.entrance.x - cluster.cx, item.entrance.y - cluster.cy);
      if (distance < 90 && distance < bestDistance) {
        bestCluster = cluster;
        bestDistance = distance;
      }
    }
    if (!bestCluster) {
      clusters.push({
        members: [item],
        cx: item.entrance.x,
        cy: item.entrance.y
      });
      continue;
    }
    bestCluster.members.push(item);
    bestCluster.cx = Math.round(bestCluster.members.reduce((sum, member) => sum + member.entrance.x, 0) / bestCluster.members.length);
    bestCluster.cy = Math.round(bestCluster.members.reduce((sum, member) => sum + member.entrance.y, 0) / bestCluster.members.length);
  }

  const hamletNodes = clusters
    .filter((cluster) => cluster.members.length >= 3)
    .map((cluster, index) => {
      let best = cluster.members[0];
      let bestDistance = Infinity;
      for (const member of cluster.members) {
        const distance = Math.hypot(member.entrance.x - cluster.cx, member.entrance.y - cluster.cy);
        if (distance < bestDistance) {
          best = member;
          bestDistance = distance;
        }
      }
      return {
        kind: "hamlet",
        x: best.entrance.x,
        y: best.entrance.y,
        name: `Hamlet ${index + 1}`
      };
    });

  return [...villageNodes, ...hamletNodes];
}

function buildNetworkEdges(nodes) {
  if (nodes.length <= 1) {
    return [];
  }

  const edges = [];
  const linked = new Set([0]);
  while (linked.size < nodes.length) {
    let best = null;
    for (const source of linked) {
      for (let target = 0; target < nodes.length; target += 1) {
        if (linked.has(target)) {
          continue;
        }
        const distance = Math.hypot(nodes[source].x - nodes[target].x, nodes[source].y - nodes[target].y);
        if (!best || distance < best.distance) {
          best = { source, target, distance };
        }
      }
    }
    if (!best) {
      break;
    }
    linked.add(best.target);
    edges.push(best);
  }

  const edgeSet = new Set(edges.map((edge) => `${Math.min(edge.source, edge.target)}:${Math.max(edge.source, edge.target)}`));
  for (let index = 0; index < nodes.length; index += 1) {
    let candidate = null;
    for (let target = 0; target < nodes.length; target += 1) {
      if (index === target) {
        continue;
      }
      const key = `${Math.min(index, target)}:${Math.max(index, target)}`;
      if (edgeSet.has(key)) {
        continue;
      }
      const distance = Math.hypot(nodes[index].x - nodes[target].x, nodes[index].y - nodes[target].y);
      if (distance > 260) {
        continue;
      }
      if (!candidate || distance < candidate.distance) {
        candidate = { source: index, target, distance, key };
      }
    }
    if (candidate) {
      edgeSet.add(candidate.key);
      edges.push(candidate);
    }
  }
  return edges;
}

class MinHeap {
  constructor() {
    this.items = [];
  }

  push(value) {
    this.items.push(value);
    this.bubbleUp(this.items.length - 1);
  }

  pop() {
    if (this.items.length === 0) {
      return null;
    }
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  get size() {
    return this.items.length;
  }

  bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].priority <= this.items[index].priority) {
        break;
      }
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  bubbleDown(index) {
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.items.length && this.items[left].priority < this.items[smallest].priority) {
        smallest = left;
      }
      if (right < this.items.length && this.items[right].priority < this.items[smallest].priority) {
        smallest = right;
      }
      if (smallest === index) {
        break;
      }
      [this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
      index = smallest;
    }
  }
}

function tileMoveCost(tileX, tileY) {
  const tile = getTileType(tileX, tileY);
  switch (tile) {
    case TileType.Stone:
      return 0.25;
    case TileType.Forest:
    case TileType.ForestDug:
      return 1.6;
    case TileType.Hill:
    case TileType.HillDug:
      return 1.45;
    case TileType.Dirt:
    case TileType.DirtDug:
      return 1.05;
    default:
      return 1;
  }
}

function aStar(start, goal) {
  const margin = Math.max(120, Math.floor(Math.hypot(start.x - goal.x, start.y - goal.y) * 0.35));
  const minX = Math.max(0, Math.min(start.x, goal.x) - margin);
  const maxX = Math.min(WORLD_WIDTH_TILES - 1, Math.max(start.x, goal.x) + margin);
  const minY = Math.max(0, Math.min(start.y, goal.y) - margin);
  const maxY = Math.min(WORLD_HEIGHT_TILES - 1, Math.max(start.y, goal.y) + margin);
  const heuristic = (x, y) => Math.abs(x - goal.x) + Math.abs(y - goal.y);
  const open = new MinHeap();
  const cameFrom = new Map();
  const bestCost = new Map();
  const startKey = nodeKey(start.x, start.y);
  bestCost.set(startKey, 0);
  open.push({ x: start.x, y: start.y, priority: heuristic(start.x, start.y) });

  while (open.size > 0) {
    const current = open.pop();
    if (!current) {
      break;
    }
    const currentKey = nodeKey(current.x, current.y);
    if (current.x === goal.x && current.y === goal.y) {
      const path = [{ x: goal.x, y: goal.y }];
      let key = currentKey;
      while (cameFrom.has(key)) {
        const previous = cameFrom.get(key);
        path.push(previous);
        key = nodeKey(previous.x, previous.y);
      }
      path.reverse();
      return path;
    }

    const currentCost = bestCost.get(currentKey) ?? Infinity;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nextX = current.x + dx;
      const nextY = current.y + dy;
      if (nextX < minX || nextX > maxX || nextY < minY || nextY > maxY) {
        continue;
      }
      if (!inWorld(nextX, nextY) || !isWalkableTile(baseTileType(nextX, nextY))) {
        continue;
      }
      const nextKey = nodeKey(nextX, nextY);
      if (objectAnchors.has(nextKey) && nextKey !== startKey && nextKey !== nodeKey(goal.x, goal.y)) {
        continue;
      }
      const cost = currentCost + tileMoveCost(nextX, nextY);
      if (cost >= (bestCost.get(nextKey) ?? Infinity)) {
        continue;
      }
      bestCost.set(nextKey, cost);
      cameFrom.set(nextKey, { x: current.x, y: current.y });
      open.push({ x: nextX, y: nextY, priority: cost + heuristic(nextX, nextY) });
    }
  }
  return null;
}

function paintPath(path) {
  if (!path) {
    return 0;
  }
  let painted = 0;
  for (const tile of path) {
    const before = groundMap.size;
    paintStoneBrush(tile.x, tile.y);
    if (groundMap.size > before) {
      painted += groundMap.size - before;
    }
  }
  return painted;
}

function findNearestRoadTarget(start) {
  let best = null;
  for (let radius = 2; radius <= 120; radius += 2) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== radius) {
          continue;
        }
        const tileX = start.x + offsetX;
        const tileY = start.y + offsetY;
        if (!inWorld(tileX, tileY) || !hasStoneNear(tileX, tileY, 0)) {
          continue;
        }
        const distance = Math.abs(offsetX) + Math.abs(offsetY);
        if (!best || distance < best.distance) {
          best = { x: tileX, y: tileY, distance };
        }
      }
    }
    if (best) {
      return best;
    }
  }
  return null;
}

function paintLocalApron(start, target) {
  let x = start.x;
  let y = start.y;
  paintStoneBrush(x, y);
  let guard = 0;
  while ((x !== target.x || y !== target.y) && guard < 64) {
    if (Math.abs(target.x - x) >= Math.abs(target.y - y)) {
      x += Math.sign(target.x - x);
    } else {
      y += Math.sign(target.y - y);
    }
    paintStoneBrush(x, y);
    guard += 1;
  }
}

const nodes = routeNodes();
const edges = buildNetworkEdges(nodes);
let edgeCount = 0;
for (const edge of edges) {
  const path = aStar(nodes[edge.source], nodes[edge.target]);
  if (!path) {
    continue;
  }
  paintPath(path);
  edgeCount += 1;
}

let buildingConnections = 0;
for (const object of buildingObjects) {
  const entrance = objectEntrance(object);
  if (hasStoneNear(entrance.x, entrance.y, 1)) {
    continue;
  }
  const target = findNearestRoadTarget(entrance) ?? nodes
    .map((node) => ({ ...node, distance: Math.hypot(node.x - entrance.x, node.y - entrance.y) }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (!target) {
    continue;
  }
  const path = aStar(entrance, target);
  if (!path) {
    continue;
  }
  paintPath(path);
  buildingConnections += 1;
}

for (const object of buildingObjects) {
  const entrance = objectEntrance(object);
  if (hasStoneNear(entrance.x, entrance.y, 1)) {
    continue;
  }
  const target = findNearestRoadTarget(entrance);
  if (!target) {
    continue;
  }
  paintLocalApron(entrance, target);
}

const nextData = {
  ...persisted.data,
  ground: [...groundMap.values()].sort((a, b) => (a.y - b.y) || (a.x - b.x)),
  roads: [],
  objects: [...objectMap.values()].sort((a, b) => (a.y - b.y) || (a.x - b.x)),
  hiddenTiles: [...hiddenTiles]
    .map((key) => {
      const [x, y] = key.split(",").map(Number);
      return { x, y };
    })
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
};

const nextPersisted = {
  revision: (persisted.revision ?? 0) + 1,
  updatedAt: new Date().toISOString(),
  data: nextData
};

writeFileSync(mapPath, `${JSON.stringify(nextPersisted, null, 2)}\n`, "utf8");

const disconnected = buildingObjects.filter((object) => {
  const entrance = objectEntrance(object);
  return !hasStoneNear(entrance.x, entrance.y, 1);
}).length;

console.log(`Backup: ${backupPath}`);
console.log(`Network nodes: ${nodes.length}, network edges painted: ${edgeCount}.`);
console.log(`Building access connections added: ${buildingConnections}.`);
console.log(`Disconnected route buildings after pass: ${disconnected}.`);
