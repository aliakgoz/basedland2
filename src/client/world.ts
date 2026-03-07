import { TILE_SIZE, TileType, chunkKey, type StaticObject } from "../shared/protocol";
import { getTileType } from "../shared/worldgen";
import type { StaticProp } from "./entity";

export class WorldState {
  readonly chunkObjects = new Map<string, StaticProp[]>();
  private readonly groundOverrides = new Map<string, TileType>();
  private readonly roadOverrides = new Map<string, number>();
  private readonly editorObjects = new Map<string, StaticProp>();

  private tileKey(tileX: number, tileY: number): string {
    return `${tileX},${tileY}`;
  }

  getTileType(tileX: number, tileY: number): TileType {
    return this.groundOverrides.get(this.tileKey(tileX, tileY)) ?? getTileType(tileX, tileY);
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

  setGroundOverride(tileX: number, tileY: number, type: TileType | null): void {
    const key = this.tileKey(tileX, tileY);
    if (type === null) {
      this.groundOverrides.delete(key);
      return;
    }
    this.groundOverrides.set(key, type);
  }

  getRoadVariant(tileX: number, tileY: number): number | null {
    return this.roadOverrides.get(this.tileKey(tileX, tileY)) ?? null;
  }

  setRoadVariant(tileX: number, tileY: number, variant: number | null): void {
    const key = this.tileKey(tileX, tileY);
    if (variant === null) {
      this.roadOverrides.delete(key);
      return;
    }
    this.roadOverrides.set(key, variant);
  }

  placeEditorObject(tileX: number, tileY: number, type: StaticProp["type"], variant?: number): void {
    const key = this.tileKey(tileX, tileY);
    this.editorObjects.set(key, {
      id: -Math.abs(hashCode(key)),
      type,
      x: tileX * TILE_SIZE + TILE_SIZE / 2,
      y: tileY * TILE_SIZE + TILE_SIZE / 2,
      variant,
      editorPlaced: true
    });
  }

  eraseAtTile(tileX: number, tileY: number): void {
    const key = this.tileKey(tileX, tileY);
    this.groundOverrides.delete(key);
    this.roadOverrides.delete(key);
    this.editorObjects.delete(key);
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

    for (const object of this.editorObjects.values()) {
      if (
        object.x >= cameraX - viewportWidth / 2 - padding &&
        object.x <= cameraX + viewportWidth / 2 + padding &&
        object.y >= cameraY - viewportHeight / 2 - padding &&
        object.y <= cameraY + viewportHeight / 2 + padding
      ) {
        objects.push(object);
      }
    }

    return objects;
  }
}

function hashCode(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
