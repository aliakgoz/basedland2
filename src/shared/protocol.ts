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
export const INTERACTION_RANGE = 56;

export const enum ClientOpcode {
  Input = 1,
  Interact = 2
}

export const enum ServerOpcode {
  Welcome = 1,
  ChunkData = 2,
  PlayerEnter = 3,
  PlayerLeave = 4,
  Snapshot = 5,
  Interaction = 6,
  Stats = 7
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
  Forest = 4
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
  Cat = 12
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
