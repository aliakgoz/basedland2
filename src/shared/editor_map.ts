export interface EditorMapData {
  version: 2;
  ground: Array<{ x: number; y: number; type: number }>;
  roads: Array<{ x: number; y: number; variant: number }>;
  objects: Array<{ x: number; y: number; type: number; variant?: number }>;
  hiddenObjects: number[];
}

export interface PersistedEditorMap {
  revision: number;
  updatedAt: string;
  data: EditorMapData;
}

export const EMPTY_EDITOR_MAP: EditorMapData = {
  version: 2,
  ground: [],
  roads: [],
  objects: [],
  hiddenObjects: []
};
