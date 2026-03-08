import type { AssetArchiveEntry, AssetArchiveGroup, AssetManager } from "./assets";
import { EMPTY_EDITOR_MAP, type EditorMapData, type EditorPatch, type PersistedEditorMap } from "../shared/editor_map";
import type { PlayerEntity } from "./entity";
import { Renderer } from "./renderer";
import { WorldState } from "./world";

const LOCAL_STORAGE_KEY = "basedland.map-editor.v1";
const SAVE_DEBOUNCE_MS = 500;

function makeThumb(source: CanvasImageSource): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 40;
  canvas.height = 40;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const width = "width" in source ? Number(source.width) || 32 : 32;
  const height = "height" in source ? Number(source.height) || 32 : 32;
  const scale = Math.min(36 / width, 36 / height);
  const drawWidth = Math.max(1, Math.floor(width * scale));
  const drawHeight = Math.max(1, Math.floor(height * scale));
  const x = Math.floor((canvas.width - drawWidth) / 2);
  const y = Math.floor((canvas.height - drawHeight) / 2);
  ctx.drawImage(source, x, y, drawWidth, drawHeight);
  return canvas;
}

export class MapEditor {
  private static readonly BRUSH_SIZES = [1, 2, 4, 8] as const;
  private enabled = false;
  private activeGroupId = "ground";
  private selectedBrush: AssetArchiveEntry | null = null;
  private brushSize = 1;
  private painting = false;
  private eraseMode = false;
  private lastPaintedTile = "";
  private readonly toggleButton: HTMLButtonElement;
  private readonly dock: HTMLElement;
  private readonly groups: HTMLElement;
  private readonly exportButton: HTMLButtonElement;
  private readonly saveOnlineButton: HTMLButtonElement;
  private readonly loadOnlineButton: HTMLButtonElement;
  private readonly importButton: HTMLButtonElement;
  private readonly importInput: HTMLInputElement;
  private readonly saveLocalButton: HTMLButtonElement;
  private readonly loadLocalButton: HTMLButtonElement;
  private readonly clearButton: HTMLButtonElement;
  private readonly brushButtons = new Map<number, HTMLButtonElement>();
  private remoteRevision = 0;
  private saveTimer: number | null = null;
  private saveInFlight = false;

  constructor(
    private readonly assets: AssetManager,
    private readonly world: WorldState,
    private readonly renderer: Renderer,
    private readonly canvas: HTMLCanvasElement,
    private readonly getLocalPlayer: () => PlayerEntity | null,
    private readonly sendPatch: (patch: EditorPatch) => void
  ) {
    const toggleButton = document.querySelector<HTMLButtonElement>("#editor-toggle");
    const dock = document.querySelector<HTMLElement>("#editor-dock");
    const groups = document.querySelector<HTMLElement>("#editor-groups");
    const exportButton = document.querySelector<HTMLButtonElement>("#editor-export");
    const saveOnlineButton = document.querySelector<HTMLButtonElement>("#editor-save-online");
    const loadOnlineButton = document.querySelector<HTMLButtonElement>("#editor-load-online");
    const importButton = document.querySelector<HTMLButtonElement>("#editor-import-button");
    const importInput = document.querySelector<HTMLInputElement>("#editor-import-input");
    const saveLocalButton = document.querySelector<HTMLButtonElement>("#editor-save-local");
    const loadLocalButton = document.querySelector<HTMLButtonElement>("#editor-load-local");
    const clearButton = document.querySelector<HTMLButtonElement>("#editor-clear");
    for (const size of MapEditor.BRUSH_SIZES) {
      const button = document.querySelector<HTMLButtonElement>(`#editor-brush-${size}`);
      if (!button) {
        throw new Error(`Map editor brush ${size}x${size} missing`);
      }
      this.brushButtons.set(size, button);
    }
    if (!toggleButton || !dock || !groups || !exportButton || !saveOnlineButton || !loadOnlineButton || !importButton || !importInput || !saveLocalButton || !loadLocalButton || !clearButton) {
      throw new Error("Map editor UI missing");
    }
    this.toggleButton = toggleButton;
    this.dock = dock;
    this.groups = groups;
    this.exportButton = exportButton;
    this.saveOnlineButton = saveOnlineButton;
    this.loadOnlineButton = loadOnlineButton;
    this.importButton = importButton;
    this.importInput = importInput;
    this.saveLocalButton = saveLocalButton;
    this.loadLocalButton = loadLocalButton;
    this.clearButton = clearButton;

    this.selectedBrush = this.assets.getArchiveGroups()[0]?.entries[0] ?? null;
    this.bindUI();
  }

  async initialize(): Promise<void> {
    const loadedRemote = await this.loadOnline(false);
    if (!loadedRemote) {
      this.loadLocal();
    } else {
      this.saveLocal();
    }
    this.renderPalette();
  }

  refreshPalette(): void {
    this.renderPalette();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private bindUI(): void {
    this.toggleButton.addEventListener("click", () => this.setEnabled(!this.enabled));
    for (const [size, button] of this.brushButtons) {
      button.addEventListener("click", () => {
        this.brushSize = size;
        this.syncBrushButtons();
      });
    }
    this.exportButton.addEventListener("click", () => this.exportJson());
    this.saveOnlineButton.addEventListener("click", () => void this.flushRemoteSave(true));
    this.loadOnlineButton.addEventListener("click", () => void this.loadOnline(true));
    this.importButton.addEventListener("click", () => this.importInput.click());
    this.importInput.addEventListener("change", () => this.importJsonFile());
    this.saveLocalButton.addEventListener("click", () => this.saveLocal());
    this.loadLocalButton.addEventListener("click", () => this.loadLocal());
    this.clearButton.addEventListener("click", () => this.clearAll());
    window.addEventListener("keydown", (event) => {
      if (event.code === "KeyM" && !event.repeat) {
        this.setEnabled(!this.enabled);
      }
    });

    this.canvas.addEventListener("contextmenu", (event) => {
      if (this.enabled) {
        event.preventDefault();
      }
    });

    this.canvas.addEventListener("mousedown", (event) => {
      if (!this.enabled) {
        return;
      }
      event.preventDefault();
      this.painting = true;
      this.eraseMode = event.button === 2 || this.selectedBrush?.kind === "erase";
      this.applyAtPointer(event.clientX, event.clientY);
    });

    this.canvas.addEventListener("mousemove", (event) => {
      if (!this.enabled || !this.painting) {
        return;
      }
      this.applyAtPointer(event.clientX, event.clientY);
    });

    window.addEventListener("mouseup", () => {
      this.painting = false;
      this.lastPaintedTile = "";
    });

    this.syncBrushButtons();
  }

  private setEnabled(next: boolean): void {
    this.enabled = next;
    this.toggleButton.textContent = `Map Maker: ${next ? "On" : "Off"}`;
    this.dock.classList.toggle("active", next);
    if (!next) {
      this.renderer.clearManualCamera();
    } else {
      const localPlayer = this.getLocalPlayer();
      if (localPlayer) {
        this.renderer.setManualCamera(localPlayer.renderX, localPlayer.renderY);
      }
    }
  }

  private renderPalette(): void {
    const groups = this.assets.getArchiveGroups();
    this.groups.innerHTML = "";
    if (!groups.some((group) => group.id === this.activeGroupId)) {
      this.activeGroupId = groups[0]?.id ?? "ground";
    }

    const tabs = document.createElement("div");
    tabs.className = "editor-tabs";
    for (const group of groups) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "editor-tab";
      if (group.id === this.activeGroupId) {
        tab.classList.add("active");
      }
      tab.textContent = group.label;
      tab.addEventListener("click", () => {
        this.activeGroupId = group.id;
        this.renderPalette();
      });
      tabs.appendChild(tab);
    }
    this.groups.appendChild(tabs);

    const activeGroup = groups.find((group) => group.id === this.activeGroupId);
    if (activeGroup) {
      this.groups.appendChild(this.renderGroup(activeGroup));
    }
  }

  private renderGroup(group: AssetArchiveGroup): HTMLElement {
    const wrapper = document.createElement("section");
    wrapper.className = "editor-group";
    const title = document.createElement("h3");
    title.textContent = group.label;
    wrapper.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "editor-grid";

    for (const entry of group.entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "editor-item";
      if (this.selectedBrush?.id === entry.id) {
        button.classList.add("active");
      }
      button.title = entry.label;
      const label = document.createElement("span");
      label.className = "editor-item-label";
      label.textContent = entry.label;
      button.appendChild(makeThumb(entry.preview));
      button.appendChild(label);
      button.addEventListener("click", () => {
        this.selectedBrush = entry;
        this.renderPalette();
      });
      grid.appendChild(button);
    }

    wrapper.appendChild(grid);
    return wrapper;
  }

  private applyAtPointer(clientX: number, clientY: number): void {
    if (!this.getLocalPlayer()) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const zoom = this.renderer.getZoom();
    const viewCenter = this.renderer.getViewCenter();
    const worldX = viewCenter.x + (screenX - this.canvas.width / 2) / zoom;
    const worldY = viewCenter.y + (screenY - this.canvas.height / 2) / zoom;
    const tileX = Math.floor(worldX / 32);
    const tileY = Math.floor(worldY / 32);
    const tileKey = `${tileX},${tileY},${this.brushSize},${this.eraseMode ? "erase" : this.selectedBrush?.id ?? "none"}`;

    if (tileKey === this.lastPaintedTile) {
      return;
    }
    this.lastPaintedTile = tileKey;

    const patches: EditorPatch[] = [];
    const startX = tileX;
    const startY = tileY;

    for (let offsetY = 0; offsetY < this.brushSize; offsetY += 1) {
      for (let offsetX = 0; offsetX < this.brushSize; offsetX += 1) {
        const currentX = startX + offsetX;
        const currentY = startY + offsetY;
        const patch = this.buildPatchForTile(currentX, currentY);
        if (patch) {
          patches.push(patch);
        }
      }
    }

    if (patches.length === 0) {
      return;
    }

    for (const patch of patches) {
      this.world.applyEditorPatch(patch);
      this.sendPatch(patch);
    }
    this.persistEditorState();
  }

  private buildPatchForTile(tileX: number, tileY: number): EditorPatch | null {
    if (this.eraseMode || this.selectedBrush?.kind === "erase") {
      return { kind: "erase", x: tileX, y: tileY };
    }

    if (!this.selectedBrush) {
      return null;
    }

    if (this.selectedBrush.kind === "ground" && this.selectedBrush.tileType !== undefined) {
      return { kind: "ground", x: tileX, y: tileY, tileType: this.selectedBrush.tileType };
    }

    if (this.selectedBrush.kind === "road" && this.selectedBrush.roadVariant !== undefined) {
      return { kind: "road", x: tileX, y: tileY, variant: this.selectedBrush.roadVariant };
    }

    if (this.selectedBrush.kind === "object" && this.selectedBrush.objectType !== undefined) {
      return {
        kind: "object",
        x: tileX,
        y: tileY,
        objectType: this.selectedBrush.objectType,
        variant: this.selectedBrush.objectVariant
      };
    }

    return null;
  }

  private syncBrushButtons(): void {
    for (const [size, button] of this.brushButtons) {
      button.classList.toggle("active", size === this.brushSize);
    }
  }

  private exportJson(): void {
    const data = this.world.exportEditorLayer();
    const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `basedland-map-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private async importJsonFile(): Promise<void> {
    const file = this.importInput.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text) as EditorMapData;
      this.world.importEditorLayer(data);
      this.broadcastCurrentState();
      this.persistEditorState();
      void this.flushRemoteSave(true);
      this.renderer.setMessage("Backup JSON restored.");
    } catch (error) {
      console.error("Failed to import map json", error);
    } finally {
      this.importInput.value = "";
    }
  }

  private saveLocal(): void {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.world.exportEditorLayer()));
    } catch (error) {
      console.error("Failed to save local map", error);
    }
  }

  private loadLocal(): void {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) {
        return;
      }
      this.world.importEditorLayer(JSON.parse(raw) as EditorMapData);
      this.renderer.setMessage("Loaded local map backup.");
    } catch (error) {
      console.error("Failed to load local map", error);
    }
  }

  private clearAll(): void {
    const patch = { kind: "clear" } as const;
    this.world.applyEditorPatch(patch);
    this.sendPatch(patch);
    this.persistEditorState();
    void this.flushRemoteSave(true);
  }

  private broadcastCurrentState(): void {
    const data = this.world.exportEditorLayer();
    this.sendPatch({ kind: "clear" });

    for (const item of data.ground) {
      this.sendPatch({ kind: "ground", x: item.x, y: item.y, tileType: item.type });
    }

    for (const item of data.roads) {
      this.sendPatch({ kind: "road", x: item.x, y: item.y, variant: item.variant });
    }

    for (const item of data.hiddenTiles) {
      this.sendPatch({ kind: "erase", x: item.x, y: item.y });
    }

    for (const item of data.objects) {
      this.sendPatch({
        kind: "object",
        x: item.x,
        y: item.y,
        objectType: item.type,
        variant: item.variant
      });
    }
  }

  private persistEditorState(): void {
    this.saveLocal();
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
    }
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.flushRemoteSave(false);
    }, SAVE_DEBOUNCE_MS);
  }

  private async flushRemoteSave(announce: boolean): Promise<void> {
    if (this.saveInFlight) {
      return;
    }

    this.saveInFlight = true;
    try {
      const response = await fetch("/api/editor-map", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          data: this.world.exportEditorLayer()
        })
      });
      if (!response.ok) {
        throw new Error(`Save failed with ${response.status}`);
      }
      const persisted = (await response.json()) as PersistedEditorMap;
      this.remoteRevision = persisted.revision;
      if (announce) {
        this.renderer.setMessage(`Online map saved. Revision ${persisted.revision}.`);
      }
    } catch (error) {
      console.error("Failed to save remote map", error);
      if (announce) {
        this.renderer.setMessage("Online map save failed. Local backup still exists.");
      }
    } finally {
      this.saveInFlight = false;
    }
  }

  private async loadOnline(announce: boolean): Promise<boolean> {
    try {
      const response = await fetch("/api/editor-map", { cache: "no-store" });
      if (!response.ok) {
        return false;
      }
      const persisted = (await response.json()) as PersistedEditorMap;
      this.remoteRevision = persisted.revision;
      const hasRemoteData =
        persisted.data.ground.length > 0 || persisted.data.roads.length > 0 || persisted.data.objects.length > 0;
      if (!hasRemoteData) {
        if (announce) {
          this.renderer.setMessage("Online map is empty.");
        }
        return false;
      }
      this.world.importEditorLayer(persisted.data ?? EMPTY_EDITOR_MAP);
      if (announce) {
        this.renderer.setMessage(`Loaded online map. Revision ${persisted.revision}.`);
      }
      return true;
    } catch (error) {
      console.error("Failed to load remote map", error);
      if (announce) {
        this.renderer.setMessage("Online map load failed.");
      }
      return false;
    }
  }
}
