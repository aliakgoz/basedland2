import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { EMPTY_EDITOR_MAP, type EditorMapData, type PersistedEditorMap } from "../shared/editor_map";

const storePath = resolve(process.cwd(), "data", "editor-map.json");

const emptyStore = (): PersistedEditorMap => ({
  revision: 0,
  updatedAt: new Date(0).toISOString(),
  data: EMPTY_EDITOR_MAP
});

export async function loadEditorMap(): Promise<PersistedEditorMap> {
  try {
    const raw = JSON.parse(await readFile(storePath, "utf8")) as Partial<PersistedEditorMap>;
    return {
      revision: raw.revision ?? 0,
      updatedAt: raw.updatedAt ?? new Date(0).toISOString(),
      data: raw.data ?? EMPTY_EDITOR_MAP
    };
  } catch {
    return emptyStore();
  }
}

export async function saveEditorMap(data: EditorMapData): Promise<PersistedEditorMap> {
  const current = await loadEditorMap();
  const next: PersistedEditorMap = {
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    data
  };

  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
