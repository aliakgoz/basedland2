import { ObjectType, sqrDistance, type ChunkKey, type StaticObject } from "../shared/protocol";
import { describeInteraction, generateChunkObjects } from "../shared/worldgen";

export class EntitySystem {
  private readonly chunkCache = new Map<ChunkKey, StaticObject[]>();

  getChunkObjects(key: ChunkKey): StaticObject[] {
    const cached = this.chunkCache.get(key);
    if (cached) {
      return cached;
    }

    const [cx, cy] = key.split(",").map(Number);
    const objects = generateChunkObjects(cx, cy).filter((object) => object.type !== ObjectType.Horse);
    this.chunkCache.set(key, objects);
    return objects;
  }

  collectChunkPayload(keys: Iterable<ChunkKey>): Array<{ key: ChunkKey; objects: StaticObject[] }> {
    const chunks: Array<{ key: ChunkKey; objects: StaticObject[] }> = [];
    for (const key of keys) {
      chunks.push({ key, objects: this.getChunkObjects(key) });
    }
    return chunks;
  }

  findNearestInteractable(x: number, y: number, keys: Iterable<ChunkKey>, maxDistanceSq: number): StaticObject | null {
    let winner: StaticObject | null = null;
    let winnerDistance = maxDistanceSq;

    for (const key of keys) {
      for (const object of this.getChunkObjects(key)) {
        const distance = sqrDistance(x, y, object.x, object.y);
        if (distance < winnerDistance) {
          winner = object;
          winnerDistance = distance;
        }
      }
    }

    return winner;
  }

  describeObjectInteraction(type: ObjectType): { action: number; text: string } {
    return describeInteraction(type);
  }
}
