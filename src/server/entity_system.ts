import { ObjectType, sqrDistance, type ChunkKey, type StaticObject } from "../shared/protocol";
import { describeInteraction, generateChunkObjects } from "../shared/worldgen";

function interactionFootprint(type: ObjectType): { halfWidth: number; halfHeight: number } {
  switch (type) {
    case ObjectType.Pub:
    case ObjectType.Inn:
    case ObjectType.Barn:
    case ObjectType.Stable:
    case ObjectType.Blacksmith:
    case ObjectType.Chapel:
    case ObjectType.Manor:
    case ObjectType.TownHall:
      return { halfWidth: 134, halfHeight: 134 };
    case ObjectType.Windmill:
      return { halfWidth: 122, halfHeight: 154 };
    case ObjectType.Market:
      return { halfWidth: 102, halfHeight: 90 };
    default:
      return { halfWidth: 0, halfHeight: 0 };
  }
}

function sqrDistanceToFootprint(x: number, y: number, object: StaticObject): number {
  const footprint = interactionFootprint(object.type);
  if (footprint.halfWidth === 0 && footprint.halfHeight === 0) {
    return sqrDistance(x, y, object.x, object.y);
  }
  const dx = Math.max(0, Math.abs(x - object.x) - footprint.halfWidth);
  const dy = Math.max(0, Math.abs(y - object.y) - footprint.halfHeight);
  return dx * dx + dy * dy;
}

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
        const distance = sqrDistanceToFootprint(x, y, object);
        if (distance < winnerDistance) {
          winner = object;
          winnerDistance = distance;
        }
      }
    }

    return winner;
  }

  findNearestObjectOfType(type: ObjectType, x: number, y: number, keys: Iterable<ChunkKey>, maxDistanceSq: number): StaticObject | null {
    let winner: StaticObject | null = null;
    let winnerDistance = maxDistanceSq;

    for (const key of keys) {
      for (const object of this.getChunkObjects(key)) {
        if (object.type !== type) {
          continue;
        }
        const distance = sqrDistanceToFootprint(x, y, object);
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
