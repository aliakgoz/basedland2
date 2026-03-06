import { TILE_SIZE, TileType, chunkKey, type StaticObject } from "../shared/protocol";
import { getTileType } from "../shared/worldgen";
import type { StaticProp } from "./entity";

export class WorldState {
  readonly chunkObjects = new Map<string, StaticProp[]>();

  getTileType(tileX: number, tileY: number): TileType {
    return getTileType(tileX, tileY);
  }

  ingestChunk(cx: number, cy: number, objects: StaticObject[]): void {
    this.chunkObjects.set(
      chunkKey(cx, cy),
      objects.map((object) => ({
        id: object.id,
        type: object.type,
        x: object.x,
        y: object.y
      }))
    );
  }

  getVisibleObjects(cameraX: number, cameraY: number, viewportWidth: number, viewportHeight: number): StaticProp[] {
    const padding = TILE_SIZE * 2;
    const objects: StaticProp[] = [];
    for (const chunk of this.chunkObjects.values()) {
      for (const object of chunk) {
        if (
          object.x >= cameraX - viewportWidth / 2 - padding &&
          object.x <= cameraX + viewportWidth / 2 + padding &&
          object.y >= cameraY - viewportHeight / 2 - padding &&
          object.y <= cameraY + viewportHeight / 2 + padding
        ) {
          objects.push(object);
        }
      }
    }
    return objects;
  }
}
