import {
  CHUNK_RADIUS,
  chunkCoordFromPixel,
  chunkKey,
  type ChunkKey
} from "../shared/protocol";

export class ChunkManager {
  private readonly chunks = new Map<ChunkKey, Set<number>>();
  private readonly playerChunks = new Map<number, ChunkKey>();

  upsertPlayer(playerId: number, x: number, y: number): { changed: boolean; current: ChunkKey } {
    const current = chunkKey(chunkCoordFromPixel(x), chunkCoordFromPixel(y));
    const previous = this.playerChunks.get(playerId);

    if (previous === current) {
      return { changed: false, current };
    }

    if (previous) {
      const prevSet = this.chunks.get(previous);
      prevSet?.delete(playerId);
      if (prevSet?.size === 0) {
        this.chunks.delete(previous);
      }
    }

    let nextSet = this.chunks.get(current);
    if (!nextSet) {
      nextSet = new Set<number>();
      this.chunks.set(current, nextSet);
    }
    nextSet.add(playerId);
    this.playerChunks.set(playerId, current);
    return { changed: true, current };
  }

  removePlayer(playerId: number): void {
    const current = this.playerChunks.get(playerId);
    if (!current) {
      return;
    }

    const set = this.chunks.get(current);
    set?.delete(playerId);
    if (set?.size === 0) {
      this.chunks.delete(current);
    }
    this.playerChunks.delete(playerId);
  }

  getChunkKeyForPlayer(playerId: number): ChunkKey | undefined {
    return this.playerChunks.get(playerId);
  }

  getNearbyChunkKeys(key: ChunkKey, radius: number = CHUNK_RADIUS): ChunkKey[] {
    const [cx, cy] = key.split(",").map(Number);
    const results: ChunkKey[] = [];

    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        if (x < 0 || y < 0) {
          continue;
        }
        results.push(chunkKey(x, y));
      }
    }

    return results;
  }

  getNearbyPlayers(key: ChunkKey, excludeId: number): Set<number> {
    const result = new Set<number>();

    for (const chunk of this.getNearbyChunkKeys(key)) {
      const players = this.chunks.get(chunk);
      if (!players) {
        continue;
      }

      for (const playerId of players) {
        if (playerId !== excludeId) {
          result.add(playerId);
        }
      }
    }

    return result;
  }
}
