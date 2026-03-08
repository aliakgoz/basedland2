import { TILE_SIZE, TileType, chunkKey, type StaticObject } from "../shared/protocol";
import type { EditorMapData, EditorPatch } from "../shared/editor_map";
import { getTileType } from "../shared/worldgen";
import { getGeneratedRoadVariant } from "../shared/world-layout";
import type { StaticProp } from "./entity";

export class WorldState {
  readonly chunkObjects = new Map<string, StaticProp[]>();
  private readonly groundOverrides = new Map<string, TileType>();
  private readonly roadOverrides = new Map<string, number>();
  private readonly editorObjects = new Map<string, StaticProp>();
  private readonly hiddenBaseObjectTiles = new Set<string>();

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
        y: object.y,
        variant: object.variant
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
    return this.roadOverrides.get(this.tileKey(tileX, tileY)) ?? getGeneratedRoadVariant(tileX, tileY);
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
    this.hiddenBaseObjectTiles.add(key);
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
    if (this.editorObjects.delete(key)) {
      return;
    }
    if (this.hasBaseObjectAtTile(tileX, tileY)) {
      this.hiddenBaseObjectTiles.add(key);
    }
  }

  clearEditorLayer(): void {
    this.groundOverrides.clear();
    this.roadOverrides.clear();
    this.editorObjects.clear();
    this.hiddenBaseObjectTiles.clear();
  }

  applyEditorPatch(patch: EditorPatch): void {
    switch (patch.kind) {
      case "clear":
        this.clearEditorLayer();
        break;
      case "erase":
        this.eraseAtTile(patch.x, patch.y);
        break;
      case "ground":
        this.setGroundOverride(patch.x, patch.y, patch.tileType as TileType);
        break;
      case "road":
        this.setRoadVariant(patch.x, patch.y, patch.variant);
        break;
      case "object":
        this.placeEditorObject(patch.x, patch.y, patch.objectType as StaticProp["type"], patch.variant);
        break;
    }
  }

  exportEditorLayer(): EditorMapData {
    const ground: EditorMapData["ground"] = [];
    const roads: EditorMapData["roads"] = [];
    const objects: EditorMapData["objects"] = [];
    const hiddenTiles = [...this.hiddenBaseObjectTiles]
      .map((key) => {
        const [x, y] = key.split(",").map(Number);
        return { x, y };
      })
      .sort((a, b) => (a.y - b.y) || (a.x - b.x));

    for (const [key, type] of this.groundOverrides) {
      const [x, y] = key.split(",").map(Number);
      ground.push({ x, y, type });
    }

    for (const [key, variant] of this.roadOverrides) {
      const [x, y] = key.split(",").map(Number);
      roads.push({ x, y, variant });
    }

    for (const object of this.editorObjects.values()) {
      objects.push({
        x: Math.floor(object.x / TILE_SIZE),
        y: Math.floor(object.y / TILE_SIZE),
        type: object.type,
        variant: object.variant
      });
    }

    ground.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    roads.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    objects.sort((a, b) => (a.y - b.y) || (a.x - b.x));

    return {
      version: 3,
      ground,
      roads,
      objects,
      hiddenTiles
    };
  }

  importEditorLayer(data: EditorMapData): void {
    this.clearEditorLayer();

    for (const item of data.ground ?? []) {
      this.setGroundOverride(item.x, item.y, item.type as TileType);
    }

    for (const item of data.roads ?? []) {
      this.setRoadVariant(item.x, item.y, item.variant);
    }

    for (const item of data.objects ?? []) {
      this.placeEditorObject(item.x, item.y, item.type as StaticProp["type"], item.variant);
    }

    for (const item of data.hiddenTiles ?? []) {
      this.hiddenBaseObjectTiles.add(this.tileKey(item.x, item.y));
    }
  }

  getVisibleObjects(cameraX: number, cameraY: number, viewportWidth: number, viewportHeight: number): StaticProp[] {
    const padding = TILE_SIZE * 2;
    const objects: StaticProp[] = [];
    for (const chunk of this.chunkObjects.values()) {
      for (const object of chunk) {
        if (this.hiddenBaseObjectTiles.has(this.tileKeyFromWorldPosition(object.x, object.y))) {
          continue;
        }
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

  private getBaseObjectsAtTile(tileX: number, tileY: number): StaticProp[] {
    const minX = tileX * TILE_SIZE;
    const minY = tileY * TILE_SIZE;
    const maxX = minX + TILE_SIZE;
    const maxY = minY + TILE_SIZE;
    const matches: StaticProp[] = [];

    for (const chunk of this.chunkObjects.values()) {
      for (const object of chunk) {
        if (this.hiddenBaseObjectTiles.has(this.tileKeyFromWorldPosition(object.x, object.y))) {
          continue;
        }
        if (object.x >= minX && object.x < maxX && object.y >= minY && object.y < maxY) {
          matches.push(object);
        }
      }
    }

    return matches;
  }

  private hasBaseObjectAtTile(tileX: number, tileY: number): boolean {
    return this.getBaseObjectsAtTile(tileX, tileY).length > 0;
  }

  private tileKeyFromWorldPosition(worldX: number, worldY: number): string {
    return this.tileKey(Math.floor(worldX / TILE_SIZE), Math.floor(worldY / TILE_SIZE));
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
