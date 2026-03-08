export interface EditorMapData {
  version: 3;
  ground: Array<{ x: number; y: number; type: number }>;
  roads: Array<{ x: number; y: number; variant: number }>;
  objects: Array<{ x: number; y: number; type: number; variant?: number }>;
  hiddenTiles: Array<{ x: number; y: number }>;
  hiddenObjects?: number[];
}

export interface PersistedEditorMap {
  revision: number;
  updatedAt: string;
  data: EditorMapData;
}

export type EditorPatch =
  | { kind: "clear" }
  | { kind: "erase"; x: number; y: number }
  | { kind: "ground"; x: number; y: number; tileType: number }
  | { kind: "road"; x: number; y: number; variant: number }
  | { kind: "object"; x: number; y: number; objectType: number; variant?: number };

export const EMPTY_EDITOR_MAP: EditorMapData = {
  version: 3,
  ground: [],
  roads: [],
  objects: [],
  hiddenTiles: []
};
