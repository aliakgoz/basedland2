import {
  CHUNK_SIZE_TILES,
  MOUNT_RANGE,
  ObjectType,
  WORLD_HEIGHT_TILES,
  WORLD_WIDTH_TILES,
  chunkCoordFromPixel,
  chunkKey,
  sqrDistance,
  type ChunkKey,
  type StaticObject
} from "../shared/protocol";
import { generateChunkObjects } from "../shared/worldgen";

export interface ServerHorse extends StaticObject {
  chunk: ChunkKey;
}

export class HorseManager {
  private readonly horses = new Map<number, ServerHorse>();
  private readonly horsesByChunk = new Map<ChunkKey, Set<number>>();
  private nextDynamicHorseId = -1;

  constructor() {
    this.seedFromWorld();
  }

  getChunkObjects(key: ChunkKey): StaticObject[] {
    const ids = this.horsesByChunk.get(key);
    if (!ids) {
      return [];
    }
    return [...ids]
      .map((id) => this.horses.get(id))
      .filter((horse): horse is ServerHorse => Boolean(horse))
      .map(({ chunk: _chunk, ...horse }) => horse);
  }

  takeNearestHorse(x: number, y: number, keys: Iterable<ChunkKey>, maxDistanceSq = MOUNT_RANGE * MOUNT_RANGE): ServerHorse | null {
    let winner: ServerHorse | null = null;
    let bestDistance = maxDistanceSq;

    for (const key of keys) {
      const ids = this.horsesByChunk.get(key);
      if (!ids) {
        continue;
      }
      for (const id of ids) {
        const horse = this.horses.get(id);
        if (!horse) {
          continue;
        }
        const distance = sqrDistance(x, y, horse.x, horse.y);
        if (distance < bestDistance) {
          winner = horse;
          bestDistance = distance;
        }
      }
    }

    if (!winner) {
      return null;
    }

    this.removeHorse(winner.id);
    return winner;
  }

  placeHorse(id: number, x: number, y: number, variant: number): ChunkKey[] {
    const key = chunkKey(chunkCoordFromPixel(x), chunkCoordFromPixel(y));
    const next: ServerHorse = {
      id,
      type: ObjectType.Horse,
      x: Math.round(x),
      y: Math.round(y),
      variant,
      chunk: key
    };
    const previous = this.horses.get(id);
    this.horses.set(id, next);
    this.horsesByChunk.get(previous?.chunk ?? key)?.delete(id);
    if (!this.horsesByChunk.has(key)) {
      this.horsesByChunk.set(key, new Set<number>());
    }
    this.horsesByChunk.get(key)?.add(id);
    if (previous && previous.chunk !== key) {
      return [previous.chunk, key];
    }
    return [key];
  }

  allocateDynamicHorseId(): number {
    const id = this.nextDynamicHorseId;
    this.nextDynamicHorseId -= 1;
    return id;
  }

  private removeHorse(id: number): void {
    const horse = this.horses.get(id);
    if (!horse) {
      return;
    }
    this.horses.delete(id);
    const set = this.horsesByChunk.get(horse.chunk);
    set?.delete(id);
    if (set?.size === 0) {
      this.horsesByChunk.delete(horse.chunk);
    }
  }

  private seedFromWorld(): void {
    const chunksX = Math.ceil(WORLD_WIDTH_TILES / CHUNK_SIZE_TILES);
    const chunksY = Math.ceil(WORLD_HEIGHT_TILES / CHUNK_SIZE_TILES);
    for (let cy = 0; cy < chunksY; cy += 1) {
      for (let cx = 0; cx < chunksX; cx += 1) {
        const key = chunkKey(cx, cy);
        const horses = generateChunkObjects(cx, cy).filter((object) => object.type === ObjectType.Horse);
        if (horses.length === 0) {
          continue;
        }
        const ids = new Set<number>();
        for (const horse of horses) {
          this.horses.set(horse.id, { ...horse, chunk: key });
          ids.add(horse.id);
        }
        this.horsesByChunk.set(key, ids);
      }
    }
  }
}
