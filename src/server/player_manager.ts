import type { WebSocket } from "ws";
import {
  AnimationState,
  Direction,
  InputFlag,
  PLAYER_SPEED,
  TILE_SIZE,
  WORLD_HEIGHT_TILES,
  WORLD_WIDTH_TILES
} from "../shared/protocol";
import { findSpawnTile, getTileType, isWalkableTile } from "../shared/worldgen";
import { ChunkManager } from "./chunk_manager";

export interface ServerPlayer {
  id: number;
  socket: WebSocket;
  x: number;
  y: number;
  dir: Direction;
  animation: AnimationState;
  inputMask: number;
  lastProcessedInput: number;
  visiblePlayers: Set<number>;
  visibleChunks: Set<string>;
  lastSentStates: Map<number, { x: number; y: number; dir: number; animation: number }>;
}

export class PlayerManager {
  private nextId = 1;
  readonly players = new Map<number, ServerPlayer>();

  constructor(private readonly chunkManager: ChunkManager) {}

  createPlayer(socket: WebSocket): ServerPlayer {
    const id = this.nextId++;
    const [tileX, tileY] = findSpawnTile(id);
    const player: ServerPlayer = {
      id,
      socket,
      x: tileX * TILE_SIZE + TILE_SIZE / 2,
      y: tileY * TILE_SIZE + TILE_SIZE / 2,
      dir: Direction.Down,
      animation: AnimationState.Idle,
      inputMask: 0,
      lastProcessedInput: 0,
      visiblePlayers: new Set<number>(),
      visibleChunks: new Set<string>(),
      lastSentStates: new Map()
    };

    this.players.set(id, player);
    this.chunkManager.upsertPlayer(id, player.x, player.y);
    return player;
  }

  removePlayer(id: number): ServerPlayer | undefined {
    this.chunkManager.removePlayer(id);
    const player = this.players.get(id);
    this.players.delete(id);
    return player;
  }

  setInput(id: number, seq: number, mask: number): void {
    const player = this.players.get(id);
    if (!player) {
      return;
    }
    player.inputMask = mask;
    player.lastProcessedInput = seq;
  }

  step(dtSeconds: number): void {
    const maxX = WORLD_WIDTH_TILES * TILE_SIZE - TILE_SIZE / 2;
    const maxY = WORLD_HEIGHT_TILES * TILE_SIZE - TILE_SIZE / 2;

    for (const player of this.players.values()) {
      let dx = 0;
      let dy = 0;

      if ((player.inputMask & InputFlag.Up) !== 0) {
        dy -= 1;
        player.dir = Direction.Up;
      }
      if ((player.inputMask & InputFlag.Down) !== 0) {
        dy += 1;
        player.dir = Direction.Down;
      }
      if ((player.inputMask & InputFlag.Left) !== 0) {
        dx -= 1;
        player.dir = Direction.Left;
      }
      if ((player.inputMask & InputFlag.Right) !== 0) {
        dx += 1;
        player.dir = Direction.Right;
      }

      player.animation = dx === 0 && dy === 0 ? AnimationState.Idle : AnimationState.Walk;

      if (dx !== 0 && dy !== 0) {
        dx *= Math.SQRT1_2;
        dy *= Math.SQRT1_2;
      }

      const nextX = Math.max(TILE_SIZE / 2, Math.min(maxX, player.x + dx * PLAYER_SPEED * dtSeconds));
      const nextY = Math.max(TILE_SIZE / 2, Math.min(maxY, player.y + dy * PLAYER_SPEED * dtSeconds));
      const tileX = Math.floor(nextX / TILE_SIZE);
      const tileY = Math.floor(nextY / TILE_SIZE);

      if (isWalkableTile(getTileType(tileX, tileY))) {
        player.x = nextX;
        player.y = nextY;
      }

      this.chunkManager.upsertPlayer(player.id, player.x, player.y);
    }
  }
}
