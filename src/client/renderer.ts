import { TILE_SIZE, WORLD_HEIGHT_TILES, WORLD_WIDTH_TILES } from "../shared/protocol";
import { getMacroBiome, getVillageCenters, hasBridgeTile, hasGeneratedRoad, isFieldTile } from "../shared/world-layout";
import { AssetManager, sizeForObject } from "./assets";
import type { PlayerEntity, StaticProp } from "./entity";
import { WorldState } from "./world";

interface Hud {
  online: HTMLElement;
  message: HTMLElement;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly minimapCanvas: HTMLCanvasElement | null;
  private readonly minimapCtx: CanvasRenderingContext2D | null;
  private readonly worldMapCanvas: HTMLCanvasElement | null;
  private readonly worldMapCtx: CanvasRenderingContext2D | null;
  private readonly worldMapPanel: HTMLElement | null;
  private readonly worldMapClose: HTMLButtonElement | null;
  private readonly minimapBuffer: HTMLCanvasElement | null;
  private width = window.innerWidth;
  private height = window.innerHeight;
  private zoom = 1;
  private worldMapOpen = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly hud: Hud,
    private readonly assets: AssetManager
  ) {
    this.canvas = canvas;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D context not available");
    }
    this.ctx = context;
    this.ctx.imageSmoothingEnabled = false;
    this.minimapCanvas = document.querySelector<HTMLCanvasElement>("#minimap-canvas");
    this.minimapCtx = this.minimapCanvas?.getContext("2d") ?? null;
    this.worldMapCanvas = document.querySelector<HTMLCanvasElement>("#worldmap-canvas");
    this.worldMapCtx = this.worldMapCanvas?.getContext("2d") ?? null;
    this.worldMapPanel = document.querySelector<HTMLElement>("#worldmap");
    this.worldMapClose = document.querySelector<HTMLButtonElement>("#worldmap-close");
    this.minimapBuffer = this.minimapCanvas ? document.createElement("canvas") : null;
    if (this.minimapBuffer) {
      this.minimapBuffer.width = this.minimapCanvas?.width ?? 200;
      this.minimapBuffer.height = this.minimapCanvas?.height ?? 200;
      this.paintMinimapBase();
    }
    this.minimapCanvas?.addEventListener("click", () => this.setWorldMapOpen(true));
    this.worldMapClose?.addEventListener("click", () => this.setWorldMapOpen(false));
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  setOnline(count: number): void {
    this.hud.online.textContent = `Players online: ${count}`;
  }

  setMessage(text: string): void {
    this.hud.message.textContent = text;
  }

  getZoom(): number {
    return this.zoom;
  }

  setZoom(nextZoom: number): void {
    this.zoom = Math.max(0.5, Math.min(2.5, nextZoom));
  }

  setWorldMapOpen(next: boolean): void {
    this.worldMapOpen = next;
    this.worldMapPanel?.classList.toggle("active", next);
  }

  render(world: WorldState, localPlayer: PlayerEntity | null, remotePlayers: PlayerEntity[]): void {
    this.ctx.clearRect(0, 0, this.width, this.height);

    if (!localPlayer) {
      return;
    }

    const cameraX = localPlayer.renderX;
    const cameraY = localPlayer.renderY;
    this.drawTiles(world, cameraX, cameraY);
    this.drawScene(
      world.getVisibleObjects(cameraX, cameraY, this.width / this.zoom, this.height / this.zoom),
      [localPlayer, ...remotePlayers],
      cameraX,
      cameraY
    );
    this.drawVillageLabels(cameraX, cameraY);
    this.drawMinimap(localPlayer);
    this.drawWorldMap(localPlayer);
  }

  private drawTiles(world: WorldState, cameraX: number, cameraY: number): void {
    const halfWorldWidth = this.width / (2 * this.zoom);
    const halfWorldHeight = this.height / (2 * this.zoom);
    const startTileX = Math.floor((cameraX - halfWorldWidth) / TILE_SIZE) - 1;
    const endTileX = Math.floor((cameraX + halfWorldWidth) / TILE_SIZE) + 1;
    const startTileY = Math.floor((cameraY - halfWorldHeight) / TILE_SIZE) - 1;
    const endTileY = Math.floor((cameraY + halfWorldHeight) / TILE_SIZE) + 1;
    const scaledTileSize = TILE_SIZE * this.zoom;

    for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
      for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
        const screenX = Math.floor((tileX * TILE_SIZE - cameraX) * this.zoom + this.width / 2);
        const screenY = Math.floor((tileY * TILE_SIZE - cameraY) * this.zoom + this.height / 2);
        const sprite = this.assets.getTileSprite(world.getTileType(tileX, tileY), tileX, tileY);
        this.ctx.drawImage(sprite, screenX, screenY, scaledTileSize + 1, scaledTileSize + 1);

        const roadVariant = world.getRoadVariant(tileX, tileY);
        if (roadVariant !== null) {
          this.ctx.drawImage(this.assets.getRoadSprite(roadVariant), screenX, screenY, scaledTileSize + 1, scaledTileSize + 1);
        }

        if (hasBridgeTile(tileX, tileY)) {
          this.ctx.drawImage(this.assets.getBridgeSprite(), screenX, screenY, scaledTileSize + 1, scaledTileSize + 1);
        }

        this.drawFieldFence(tileX, tileY, screenX, screenY, scaledTileSize);
      }
    }
  }

  private drawFieldFence(tileX: number, tileY: number, screenX: number, screenY: number, scaledTileSize: number): void {
    if (!isFieldTile(tileX, tileY)) {
      return;
    }

    const top = !isFieldTile(tileX, tileY - 1);
    const bottom = !isFieldTile(tileX, tileY + 1);
    const left = !isFieldTile(tileX - 1, tileY);
    const right = !isFieldTile(tileX + 1, tileY);
    if (!top && !bottom && !left && !right) {
      return;
    }

    this.ctx.strokeStyle = "rgba(90, 63, 37, 0.9)";
    this.ctx.lineWidth = Math.max(1, this.zoom);
    this.ctx.beginPath();
    if (top) {
      this.ctx.moveTo(screenX, screenY + 2 * this.zoom);
      this.ctx.lineTo(screenX + scaledTileSize, screenY + 2 * this.zoom);
    }
    if (bottom) {
      this.ctx.moveTo(screenX, screenY + scaledTileSize - 2 * this.zoom);
      this.ctx.lineTo(screenX + scaledTileSize, screenY + scaledTileSize - 2 * this.zoom);
    }
    if (left) {
      this.ctx.moveTo(screenX + 2 * this.zoom, screenY);
      this.ctx.lineTo(screenX + 2 * this.zoom, screenY + scaledTileSize);
    }
    if (right) {
      this.ctx.moveTo(screenX + scaledTileSize - 2 * this.zoom, screenY);
      this.ctx.lineTo(screenX + scaledTileSize - 2 * this.zoom, screenY + scaledTileSize);
    }
    this.ctx.stroke();
  }

  private drawScene(objects: StaticProp[], players: PlayerEntity[], cameraX: number, cameraY: number): void {
    const scene: Array<
      | { kind: "object"; y: number; object: StaticProp }
      | { kind: "player"; y: number; player: PlayerEntity }
    > = [];

    for (const object of objects) {
      scene.push({ kind: "object", y: object.y, object });
    }

    for (const player of players) {
      scene.push({ kind: "player", y: player.renderY, player });
    }

    scene.sort((a, b) => a.y - b.y);

    for (const item of scene) {
      if (item.kind === "object") {
        const { width, height } = sizeForObject(item.object.type);
        const scaledWidth = width * this.zoom;
        const scaledHeight = height * this.zoom;
        const screenX = Math.floor((item.object.x - width / 2 - cameraX) * this.zoom + this.width / 2);
        const screenY = Math.floor((item.object.y - height / 2 - cameraY) * this.zoom + this.height / 2);
        const sprite = this.assets.getObjectSprite(item.object.type, item.object.variant);
        this.ctx.drawImage(sprite, screenX, screenY, scaledWidth, scaledHeight);
        this.ctx.fillStyle = "rgba(0,0,0,0.18)";
        this.ctx.fillRect(
          screenX + 4 * this.zoom,
          screenY + scaledHeight - 4 * this.zoom,
          Math.max(8 * this.zoom, scaledWidth - 8 * this.zoom),
          Math.max(2, 3 * this.zoom)
        );
      } else {
        this.drawPlayer(item.player, cameraX, cameraY);
      }
    }
  }

  private drawPlayer(player: PlayerEntity, cameraX: number, cameraY: number): void {
    const scaledWidth = 16 * this.zoom;
    const scaledHeight = 20 * this.zoom;
    const screenX = Math.floor((player.renderX - cameraX) * this.zoom + this.width / 2 - scaledWidth / 2);
    const bob = player.animation === 1 ? Math.sin(performance.now() / 90) * 1.5 : 0;
    const screenY = Math.floor((player.renderY - cameraY) * this.zoom + this.height / 2 - scaledHeight / 2 + bob * this.zoom);
    const sprite = this.assets.getPlayerSprite(player.isLocal);
    this.ctx.drawImage(sprite, screenX, screenY, scaledWidth, scaledHeight);
    this.ctx.fillStyle = "rgba(0,0,0,0.25)";
    this.ctx.fillRect(screenX + 2 * this.zoom, screenY + scaledHeight, 12 * this.zoom, Math.max(2, 3 * this.zoom));
  }

  private drawVillageLabels(cameraX: number, cameraY: number): void {
    this.ctx.font = `${Math.max(10, Math.floor(12 * this.zoom))}px Verdana`;
    this.ctx.textAlign = "center";

    for (const center of getVillageCenters()) {
      const screenX = Math.floor((center.tileX * TILE_SIZE - cameraX) * this.zoom + this.width / 2);
      const screenY = Math.floor((center.tileY * TILE_SIZE - cameraY) * this.zoom + this.height / 2 - center.radius * this.zoom - 18);
      if (screenX < -120 || screenX > this.width + 120 || screenY < -40 || screenY > this.height + 40) {
        continue;
      }

      const text = center.name;
      const metrics = this.ctx.measureText(text);
      const boxWidth = metrics.width + 12;
      this.ctx.fillStyle = "rgba(12, 16, 14, 0.75)";
      this.ctx.fillRect(screenX - boxWidth / 2, screenY - 12, boxWidth, 18);
      this.ctx.fillStyle = "#f0e5b5";
      this.ctx.fillText(text, screenX, screenY + 1);
    }
  }

  private paintMinimapBase(): void {
    if (!this.minimapBuffer) {
      return;
    }

    const ctx = this.minimapBuffer.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.imageSmoothingEnabled = false;
    const width = this.minimapBuffer.width;
    const height = this.minimapBuffer.height;
    const image = ctx.createImageData(width, height);

    for (let py = 0; py < height; py += 1) {
      for (let px = 0; px < width; px += 1) {
        const tileX = Math.min(WORLD_WIDTH_TILES - 1, Math.floor((px / width) * WORLD_WIDTH_TILES));
        const tileY = Math.min(WORLD_HEIGHT_TILES - 1, Math.floor((py / height) * WORLD_HEIGHT_TILES));
        const index = (py * width + px) * 4;
        let color: [number, number, number] = [111, 168, 79];
        const biome = getMacroBiome(tileX, tileY);

        if (biome === 3) {
          color = [70, 124, 173];
        } else if (biome === 2) {
          color = [134, 138, 142];
        } else if (biome === 1) {
          color = [59, 98, 47];
        } else if (biome === 4) {
          color = [144, 118, 78];
        }

        if (isFieldTile(tileX, tileY)) {
          color = [150, 141, 74];
        }
        if (hasGeneratedRoad(tileX, tileY)) {
          color = [214, 192, 146];
        }
        if (hasBridgeTile(tileX, tileY)) {
          color = [208, 164, 96];
        }

        image.data[index] = color[0];
        image.data[index + 1] = color[1];
        image.data[index + 2] = color[2];
        image.data[index + 3] = 255;
      }
    }

    ctx.putImageData(image, 0, 0);
    ctx.fillStyle = "rgba(247, 218, 141, 0.95)";
    for (const center of getVillageCenters()) {
      const x = Math.floor((center.tileX / WORLD_WIDTH_TILES) * width);
      const y = Math.floor((center.tileY / WORLD_HEIGHT_TILES) * height);
      ctx.fillRect(x - 1, y - 1, 3, 3);
    }
  }

  private drawMinimap(localPlayer: PlayerEntity): void {
    if (!this.minimapCtx || !this.minimapCanvas || !this.minimapBuffer) {
      return;
    }

    this.minimapCtx.clearRect(0, 0, this.minimapCanvas.width, this.minimapCanvas.height);
    this.minimapCtx.drawImage(this.minimapBuffer, 0, 0);

    const px = Math.floor((localPlayer.renderX / TILE_SIZE / WORLD_WIDTH_TILES) * this.minimapCanvas.width);
    const py = Math.floor((localPlayer.renderY / TILE_SIZE / WORLD_HEIGHT_TILES) * this.minimapCanvas.height);
    this.minimapCtx.fillStyle = "#f35f5f";
    this.minimapCtx.fillRect(px - 2, py - 2, 5, 5);
    this.minimapCtx.strokeStyle = "rgba(255,255,255,0.8)";
    this.minimapCtx.strokeRect(Math.max(0, px - 3), Math.max(0, py - 3), 7, 7);
  }

  private drawWorldMap(localPlayer: PlayerEntity): void {
    if (!this.worldMapOpen || !this.worldMapCtx || !this.worldMapCanvas || !this.minimapBuffer) {
      return;
    }

    this.worldMapCtx.imageSmoothingEnabled = false;
    this.worldMapCtx.clearRect(0, 0, this.worldMapCanvas.width, this.worldMapCanvas.height);
    this.worldMapCtx.drawImage(this.minimapBuffer, 0, 0, this.worldMapCanvas.width, this.worldMapCanvas.height);

    this.worldMapCtx.font = "16px Verdana";
    this.worldMapCtx.textAlign = "center";
    for (const center of getVillageCenters()) {
      const x = Math.floor((center.tileX / WORLD_WIDTH_TILES) * this.worldMapCanvas.width);
      const y = Math.floor((center.tileY / WORLD_HEIGHT_TILES) * this.worldMapCanvas.height);
      this.worldMapCtx.fillStyle = "rgba(0,0,0,0.6)";
      const width = this.worldMapCtx.measureText(center.name).width + 12;
      this.worldMapCtx.fillRect(x - width / 2, y - 24, width, 18);
      this.worldMapCtx.fillStyle = "#f3e0a2";
      this.worldMapCtx.fillText(center.name, x, y - 10);
    }

    const px = Math.floor((localPlayer.renderX / TILE_SIZE / WORLD_WIDTH_TILES) * this.worldMapCanvas.width);
    const py = Math.floor((localPlayer.renderY / TILE_SIZE / WORLD_HEIGHT_TILES) * this.worldMapCanvas.height);
    this.worldMapCtx.fillStyle = "#ff6767";
    this.worldMapCtx.fillRect(px - 4, py - 4, 8, 8);
    this.worldMapCtx.strokeStyle = "#ffffff";
    this.worldMapCtx.strokeRect(px - 5, py - 5, 10, 10);
  }
}
