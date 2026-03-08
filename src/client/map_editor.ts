import type { AssetArchiveEntry, AssetArchiveGroup, AssetManager } from "./assets";
import type { PlayerEntity } from "./entity";
import { Renderer } from "./renderer";
import { type EditorMapData, WorldState } from "./world";

const LOCAL_STORAGE_KEY = "basedland.map-editor.v1";

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
  private enabled = false;
  private selectedBrush: AssetArchiveEntry | null = null;
  private painting = false;
  private eraseMode = false;
  private lastPaintedTile = "";
  private readonly toggleButton: HTMLButtonElement;
  private readonly dock: HTMLElement;
  private readonly groups: HTMLElement;
  private readonly exportButton: HTMLButtonElement;
  private readonly importButton: HTMLButtonElement;
  private readonly importInput: HTMLInputElement;
  private readonly saveLocalButton: HTMLButtonElement;
  private readonly loadLocalButton: HTMLButtonElement;
  private readonly clearButton: HTMLButtonElement;

  constructor(
    private readonly assets: AssetManager,
    private readonly world: WorldState,
    private readonly renderer: Renderer,
    private readonly canvas: HTMLCanvasElement,
    private readonly getLocalPlayer: () => PlayerEntity | null
  ) {
    const toggleButton = document.querySelector<HTMLButtonElement>("#editor-toggle");
    const dock = document.querySelector<HTMLElement>("#editor-dock");
    const groups = document.querySelector<HTMLElement>("#editor-groups");
    const exportButton = document.querySelector<HTMLButtonElement>("#editor-export");
    const importButton = document.querySelector<HTMLButtonElement>("#editor-import-button");
    const importInput = document.querySelector<HTMLInputElement>("#editor-import-input");
    const saveLocalButton = document.querySelector<HTMLButtonElement>("#editor-save-local");
    const loadLocalButton = document.querySelector<HTMLButtonElement>("#editor-load-local");
    const clearButton = document.querySelector<HTMLButtonElement>("#editor-clear");
    if (!toggleButton || !dock || !groups || !exportButton || !importButton || !importInput || !saveLocalButton || !loadLocalButton || !clearButton) {
      throw new Error("Map editor UI missing");
    }
    this.toggleButton = toggleButton;
    this.dock = dock;
    this.groups = groups;
    this.exportButton = exportButton;
    this.importButton = importButton;
    this.importInput = importInput;
    this.saveLocalButton = saveLocalButton;
    this.loadLocalButton = loadLocalButton;
    this.clearButton = clearButton;

    this.selectedBrush = this.assets.getArchiveGroups()[0]?.entries[0] ?? null;
    this.renderPalette();
    this.bindUI();
  }

  refreshPalette(): void {
    this.renderPalette();
  }

  private bindUI(): void {
    this.toggleButton.addEventListener("click", () => this.setEnabled(!this.enabled));
    this.exportButton.addEventListener("click", () => this.exportJson());
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
  }

  private setEnabled(next: boolean): void {
    this.enabled = next;
    this.toggleButton.textContent = `Map Maker: ${next ? "On" : "Off"}`;
    this.dock.classList.toggle("active", next);
  }

  private renderPalette(): void {
    const groups = this.assets.getArchiveGroups();
    this.groups.innerHTML = "";

    for (const group of groups) {
      this.groups.appendChild(this.renderGroup(group));
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
      button.appendChild(makeThumb(entry.preview));
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
    const localPlayer = this.getLocalPlayer();
    if (!localPlayer) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const zoom = this.renderer.getZoom();
    const worldX = localPlayer.renderX + (screenX - this.canvas.width / 2) / zoom;
    const worldY = localPlayer.renderY + (screenY - this.canvas.height / 2) / zoom;
    const tileX = Math.floor(worldX / 32);
    const tileY = Math.floor(worldY / 32);
    const tileKey = `${tileX},${tileY}`;

    if (tileKey === this.lastPaintedTile) {
      return;
    }
    this.lastPaintedTile = tileKey;

    if (this.eraseMode || this.selectedBrush?.kind === "erase") {
      this.world.eraseAtTile(tileX, tileY);
      return;
    }

    if (!this.selectedBrush) {
      return;
    }

    if (this.selectedBrush.kind === "ground" && this.selectedBrush.tileType !== undefined) {
      this.world.setGroundOverride(tileX, tileY, this.selectedBrush.tileType);
      return;
    }

    if (this.selectedBrush.kind === "road" && this.selectedBrush.roadVariant !== undefined) {
      this.world.setRoadVariant(tileX, tileY, this.selectedBrush.roadVariant);
      return;
    }

    if (this.selectedBrush.kind === "object" && this.selectedBrush.objectType !== undefined) {
      this.world.placeEditorObject(tileX, tileY, this.selectedBrush.objectType, this.selectedBrush.objectVariant);
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
    } catch (error) {
      console.error("Failed to load local map", error);
    }
  }

  private clearAll(): void {
    this.world.clearEditorLayer();
  }
}
