import type { EditorMapData, EditorPatch } from "../shared/editor_map";
import { TileType } from "../shared/protocol";
import { getTileType as getGeneratedTileType } from "../shared/worldgen";

export class ServerWorldState {
  private readonly groundOverrides = new Map<string, TileType>();

  getTileType(tileX: number, tileY: number): TileType {
    return this.groundOverrides.get(this.tileKey(tileX, tileY)) ?? getGeneratedTileType(tileX, tileY);
  }

  importEditorLayer(data: EditorMapData): void {
    this.groundOverrides.clear();
    for (const item of data.ground ?? []) {
      this.groundOverrides.set(this.tileKey(item.x, item.y), item.type as TileType);
    }
  }

  applyEditorPatch(patch: EditorPatch): void {
    switch (patch.kind) {
      case "clear":
        this.groundOverrides.clear();
        break;
      case "erase":
        this.groundOverrides.set(this.tileKey(patch.x, patch.y), TileType.Grass);
        break;
      case "ground":
        this.groundOverrides.set(this.tileKey(patch.x, patch.y), patch.tileType as TileType);
        break;
      case "road":
      case "object":
        break;
    }
  }

  private tileKey(tileX: number, tileY: number): string {
    return `${tileX},${tileY}`;
  }
}
