import { TILE_SIZE } from "../shared/protocol";
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
  private width = window.innerWidth;
  private height = window.innerHeight;
  private zoom = 1;

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
      }
    }
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
}
