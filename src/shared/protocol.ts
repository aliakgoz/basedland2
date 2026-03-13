export const WORLD_SEED = 133742;
export const WORLD_WIDTH_TILES = 1000;
export const WORLD_HEIGHT_TILES = 1000;
export const TILE_SIZE = 32;
export const CHUNK_SIZE_TILES = 32;
export const CHUNK_RADIUS = 3;
export const CHUNK_PIXEL_SIZE = CHUNK_SIZE_TILES * TILE_SIZE;
export const SIMULATION_RATE = 20;
export const NETWORK_RATE = 10;
export const PLAYER_SPEED = 120;
export const MOUNT_SPEED_MULTIPLIER = 4;
export const INTERACTION_RANGE = 56;
export const MOUNT_RANGE = 72;
export const CHAT_MESSAGE_TTL_MS = 5000;
export const CHAT_MESSAGE_MAX_LENGTH = 80;

export const enum ClientOpcode {
  Input = 1,
  Interact = 2,
  EditorPatch = 3,
  Chat = 4,
  ToggleMount = 5
}

export const enum ServerOpcode {
  Welcome = 1,
  ChunkData = 2,
  PlayerEnter = 3,
  PlayerLeave = 4,
  Snapshot = 5,
  Interaction = 6,
  Stats = 7,
  EditorPatch = 8,
  Chat = 9
}

export const enum InputFlag {
  Up = 1 << 0,
  Down = 1 << 1,
  Left = 1 << 2,
  Right = 1 << 3
}

export const enum TileType {
  Grass = 0,
  Dirt = 1,
  Stone = 2,
  Water = 3,
  Forest = 4,
  Hill = 5,
  BarleyField = 6,
  WheatField = 7,
  Orchard = 8,
  Vineyard = 9,
  Garden = 10,
  PumpkinPatch = 11,
  CabbagePatch = 12,
  BerryGarden = 13,
  HerbGarden = 14,
  FallowField = 15,
  GrassDug = 16,
  DirtDug = 17,
  ForestDug = 18,
  StoneDug = 19,
  HillDug = 20
}

export const enum ObjectType {
  House = 0,
  Tree = 1,
  Stone = 2,
  Crate = 3,
  Well = 4,
  Ruins = 5,
  Sign = 6,
  Chest = 7,
  Horse = 8,
  Sheep = 9,
  GrassTuft = 10,
  Dog = 11,
  Cat = 12,
  Pub = 13,
  Inn = 14,
  Barn = 15,
  Stable = 16,
  Blacksmith = 17,
  Windmill = 18,
  Chapel = 19,
  Market = 20,
  Manor = 21,
  TownHall = 22,
  SparkMouse = 23,
  HillStamp = 24,
  MountainStamp = 25,
  GardenStamp = 26,
  GrainEar = 27,
  YellowGrainEar = 28,
  GreenGrainEar = 29,
  GrapeVine = 30,
  AppleTree = 31,
  OliveTree = 32
}

export const enum Direction {
  Down = 0,
  Left = 1,
  Right = 2,
  Up = 3
}

export const enum AnimationState {
  Idle = 0,
  Walk = 1
}

export const enum SnapshotFlag {
  Absolute = 1 << 0
}

export type ChunkKey = `${number},${number}`;

export interface StaticObject {
  id: number;
  type: ObjectType;
  x: number;
  y: number;
  variant?: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function chunkCoordFromPixel(pixel: number): number {
  return Math.floor(pixel / CHUNK_PIXEL_SIZE);
}

export function chunkKey(cx: number, cy: number): ChunkKey {
  return `${cx},${cy}`;
}

export function sqrDistance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
