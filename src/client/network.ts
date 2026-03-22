import {
  AnimationState,
  CHAT_MESSAGE_MAX_LENGTH,
  CHUNK_SIZE_TILES,
  ClientOpcode,
  Direction,
  InputFlag,
  MOUNT_SPEED_MULTIPLIER,
  ObjectType,
  PLAYER_SPEED,
  ServerOpcode,
  SnapshotFlag,
  TileType,
  TILE_SIZE
} from "../shared/protocol";
import type { EditorPatch } from "../shared/editor_map";
import { isWalkableTile } from "../shared/worldgen";
import { backendUrl } from "./backend";
import type { PlayerAppearance, PlayerEntity } from "./entity";
import { createPlayerEntity, pushOverheadMessage } from "./entity";
import type { WorldState } from "./world";

declare const __BASEDLAND_WS_URL__: string;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

interface PendingInput {
  seq: number;
  mask: number;
  at: number;
}

interface ChunkPeekResponse {
  chunks: Array<{
    cx: number;
    cy: number;
    objects: Array<{
      id: number;
      type: ObjectType;
      x: number;
      y: number;
      variant?: number;
    }>;
  }>;
}

function interactionText(objectType: ObjectType, action: number): string {
  const map: Record<number, string> = {
    0: "The tree creaks softly.",
    1: "You pocket a smooth pebble.",
    2: "You knock on the house door.",
    3: "The crate is full of dusty tools.",
    4: "Cold water echoes below.",
    5: "Ancient stones hum with history.",
    6: "The sign reads: Welcome to BasedLand.",
    7: "The chest is locked for now.",
    8: "The horse snorts and paws the dirt.",
    9: "The sheep lets out a soft baa.",
    10: "Wild grass sways in the breeze.",
    11: "The dog circles your boots happily.",
    12: "The cat watches you with royal judgment.",
    13: "The pub smells like hearth smoke and cider.",
    14: "The innkeeper has rooms, but not yet for players.",
    15: "Hay and old tools fill the barn.",
    16: "The stable is warm and full of saddle leather.",
    17: "A hammer rings somewhere inside the smithy.",
    18: "The windmill creaks over the fields.",
    19: "The chapel is quiet and cool.",
    20: "Stalls are stacked with bread, apples, and cloth.",
    21: "The manor keeps its curtains drawn.",
    22: "Village notices are pinned to the hall door.",
    23: "The little spark beast crackles and darts away.",
    24: "The hillside rises in layered terraces.",
    25: "The mountain face towers over the valley.",
    26: "Trellises and crop rows run across the garden.",
    27: "A ripe grain stalk bends in the wind.",
    28: "The yellow ear is dry and ready for harvest.",
    29: "The green ear is still filling with grain.",
    30: "A vine hangs heavy with clustered grapes.",
    31: "The apple tree smells sharp and sweet.",
    32: "Silvery olive leaves shimmer in the light."
  };
  return map[action] ?? `You inspect object ${objectType}.`;
}

function stepLocalMask(
  x: number,
  y: number,
  mask: number,
  dt: number,
  getTileTypeAt: (tileX: number, tileY: number) => TileType,
  mounted: boolean
): { x: number; y: number; dir: Direction } {
  let dx = 0;
  let dy = 0;
  let dir = Direction.Down;

  if ((mask & InputFlag.Up) !== 0) {
    dy -= 1;
    dir = Direction.Up;
  }
  if ((mask & InputFlag.Down) !== 0) {
    dy += 1;
    dir = Direction.Down;
  }
  if ((mask & InputFlag.Left) !== 0) {
    dx -= 1;
    dir = Direction.Left;
  }
  if ((mask & InputFlag.Right) !== 0) {
    dx += 1;
    dir = Direction.Right;
  }

  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }

  const speed = PLAYER_SPEED * (mounted ? MOUNT_SPEED_MULTIPLIER : 1);
  const nextX = x + dx * speed * dt;
  const nextY = y + dy * speed * dt;
  const tileX = Math.floor(nextX / TILE_SIZE);
  const tileY = Math.floor(nextY / TILE_SIZE);

  if (!isWalkableTile(getTileTypeAt(tileX, tileY))) {
    return { x, y, dir };
  }

  return { x: nextX, y: nextY, dir };
}

function encodeEditorPatch(patch: EditorPatch): ArrayBuffer {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint8(0, ClientOpcode.EditorPatch);
  switch (patch.kind) {
    case "erase":
      view.setUint8(1, 0);
      view.setUint16(2, patch.x, true);
      view.setUint16(4, patch.y, true);
      break;
    case "ground":
      view.setUint8(1, 1);
      view.setUint16(2, patch.x, true);
      view.setUint16(4, patch.y, true);
      view.setUint8(6, patch.tileType);
      break;
    case "road":
      view.setUint8(1, 2);
      view.setUint16(2, patch.x, true);
      view.setUint16(4, patch.y, true);
      view.setUint8(6, patch.variant);
      break;
    case "object":
      view.setUint8(1, 3);
      view.setUint16(2, patch.x, true);
      view.setUint16(4, patch.y, true);
      view.setUint8(6, patch.objectType);
      view.setUint8(7, patch.variant ?? 255);
      break;
    case "clear":
      view.setUint8(1, 4);
      break;
  }
  return buffer;
}

function parseEditorPatch(view: DataView, opcode: number): EditorPatch | null {
  if (opcode !== ServerOpcode.EditorPatch || view.byteLength < 8) {
    return null;
  }

  const kind = view.getUint8(1);
  const x = view.getUint16(2, true);
  const y = view.getUint16(4, true);
  const a = view.getUint8(6);
  const b = view.getUint8(7);

  switch (kind) {
    case 0:
      return { kind: "erase", x, y };
    case 1:
      return { kind: "ground", x, y, tileType: a };
    case 2:
      return { kind: "road", x, y, variant: a };
    case 3:
      return { kind: "object", x, y, objectType: a, variant: b === 255 ? undefined : b };
    case 4:
      return { kind: "clear" };
    default:
      return null;
  }
}

function readAppearance(view: DataView, offset: number): { appearance: PlayerAppearance; offset: number } {
  const appearance: PlayerAppearance = {
    hair: view.getUint8(offset),
    primary: view.getUint8(offset + 1),
    secondary: view.getUint8(offset + 2),
    accent: view.getUint8(offset + 3),
    skin: view.getUint8(offset + 4),
    height: view.getUint16(offset + 5, true),
    build: view.getUint16(offset + 7, true),
    headSize: view.getUint16(offset + 9, true),
    armLength: view.getUint16(offset + 11, true),
    legLength: view.getUint16(offset + 13, true)
  };
  return { appearance, offset: offset + 15 };
}

export class NetworkClient {
  socket: WebSocket | null = null;
  playerId = 0;
  onlineCount = 0;
  localPlayer: PlayerEntity | null = null;
  readonly remotePlayers = new Map<number, PlayerEntity>();
  readonly pendingInputs: PendingInput[] = [];
  onMessage: (text: string) => void = () => {};
  onOnline: (count: number) => void = () => {};
  onInteraction: ((objectType: ObjectType, action: number, text: string) => void) | null = null;
  private reconnectTimer: number | null = null;
  private world: WorldState | null = null;
  private readonly inFlightChunkPeeks = new Set<string>();

  connect(world: WorldState): void {
    this.world = world;
    const url =
      __BASEDLAND_WS_URL__ || `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
    this.socket = new WebSocket(url);
    this.socket.binaryType = "arraybuffer";

    this.socket.addEventListener("open", () => {
      if (this.reconnectTimer !== null) {
        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.onMessage("Connected. Streaming nearby chunks.");
    });

    this.socket.addEventListener("message", (event) => {
      if (!(event.data instanceof ArrayBuffer)) {
        return;
      }
      this.handlePacket(event.data, world);
    });

    this.socket.addEventListener("close", () => {
      this.resetRuntimeState();
      this.onMessage("Disconnected from server. Retrying...");
      this.scheduleReconnect();
    });

    this.socket.addEventListener("error", () => {
      this.onMessage("Connection error. Retrying...");
    });
  }

  sendInput(seq: number, mask: number): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint8(0, 1);
    view.setUint16(1, seq, true);
    view.setUint8(3, mask);
    this.pendingInputs.push({ seq, mask, at: performance.now() });
    this.socket.send(buffer);
  }

  sendInteract(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const buffer = new ArrayBuffer(1);
    new DataView(buffer).setUint8(0, 2);
    this.socket.send(buffer);
  }

  sendEditorPatch(patch: EditorPatch): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(encodeEditorPatch(patch));
  }

  sendToggleMount(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const buffer = new ArrayBuffer(1);
    new DataView(buffer).setUint8(0, ClientOpcode.ToggleMount);
    this.socket.send(buffer);
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async prefetchChunksAt(worldX: number, worldY: number, radius = 2): Promise<void> {
    if (!this.world || !this.isConnected()) {
      return;
    }
    const tileX = Math.max(0, Math.floor(worldX / TILE_SIZE));
    const tileY = Math.max(0, Math.floor(worldY / TILE_SIZE));
    const key = `${Math.floor(tileX / CHUNK_SIZE_TILES)},${Math.floor(tileY / CHUNK_SIZE_TILES)},${radius}`;
    if (this.inFlightChunkPeeks.has(key)) {
      return;
    }

    this.inFlightChunkPeeks.add(key);
    try {
      const response = await fetch(backendUrl(`/api/chunk-peek?tileX=${tileX}&tileY=${tileY}&radius=${radius}`), {
        cache: "no-store"
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as ChunkPeekResponse;
      for (const chunk of payload.chunks ?? []) {
        this.world.ingestChunk(chunk.cx, chunk.cy, chunk.objects);
      }
    } catch {
      // Ignore transient chunk peek failures while panning.
    } finally {
      this.inFlightChunkPeeks.delete(key);
    }
  }

  sendChat(text: string): string | null {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return null;
    }

    const normalized = text.trim().slice(0, CHAT_MESSAGE_MAX_LENGTH);
    if (normalized.length === 0) {
      return null;
    }

    const encoded = textEncoder.encode(normalized);
    const buffer = new ArrayBuffer(3 + encoded.length);
    const view = new DataView(buffer);
    view.setUint8(0, ClientOpcode.Chat);
    view.setUint16(1, encoded.length, true);
    new Uint8Array(buffer, 3).set(encoded);
    this.socket.send(buffer);
    return normalized;
  }

  private handlePacket(data: ArrayBuffer, world: WorldState): void {
    const view = new DataView(data);
    const opcode = view.getUint8(0);

    switch (opcode) {
      case ServerOpcode.Welcome:
        this.handleWelcome(view);
        break;
      case ServerOpcode.ChunkData:
        this.handleChunkData(view, world);
        break;
      case ServerOpcode.PlayerEnter:
        this.handlePlayerEnter(view);
        break;
      case ServerOpcode.PlayerLeave:
        this.handlePlayerLeave(view);
        break;
      case ServerOpcode.Snapshot:
        this.handleSnapshot(view);
        break;
      case ServerOpcode.Interaction:
        this.handleInteraction(view);
        break;
      case ServerOpcode.Stats:
        this.onlineCount = view.getUint16(1, true);
        this.onOnline(this.onlineCount);
        break;
      case ServerOpcode.EditorPatch: {
        const patch = parseEditorPatch(view, opcode);
        if (patch) {
          world.applyEditorPatch(patch);
        }
        break;
      }
      case ServerOpcode.Chat:
        this.handleChat(view);
        break;
      default:
        break;
    }
  }

  private handleWelcome(view: DataView): void {
    let offset = 1;
    this.playerId = view.getUint16(offset, true);
    offset += 2;
    offset += 2; // worldWidth
    offset += 2; // worldHeight
    offset += 1; // tileSize
    offset += 1; // chunkSize
    offset += 1; // chunkRadius
    offset += 1; // networkRate
    offset += 4; // seed
    const spawnX = view.getUint16(offset, true);
    offset += 2;
    const spawnY = view.getUint16(offset, true);
    offset += 2;
    this.onlineCount = view.getUint16(offset, true);
    offset += 2;
    const parsed = readAppearance(view, offset);
    this.localPlayer = createPlayerEntity(this.playerId, spawnX, spawnY, true, parsed.appearance);
    this.onOnline(this.onlineCount);
    this.onMessage("Connected. Prediction enabled.");
  }

  private handleChunkData(view: DataView, world: WorldState): void {
    let offset = 1;
    const chunkCount = view.getUint8(offset);
    offset += 1;

    for (let i = 0; i < chunkCount; i += 1) {
      const cx = view.getUint16(offset, true);
      offset += 2;
      const cy = view.getUint16(offset, true);
      offset += 2;
      const objectCount = view.getUint16(offset, true);
      offset += 2;
      const objects = [];

      for (let j = 0; j < objectCount; j += 1) {
        const id = view.getUint32(offset, true);
        offset += 4;
        const type = view.getUint8(offset) as ObjectType;
        offset += 1;
        const x = view.getUint16(offset, true);
        offset += 2;
        const y = view.getUint16(offset, true);
        offset += 2;
        const variant = view.getUint8(offset);
        offset += 1;
        objects.push({ id, type, x, y, variant });
      }

      world.ingestChunk(cx, cy, objects);
    }
  }

  private handlePlayerEnter(view: DataView): void {
    let offset = 1;
    const count = view.getUint16(offset, true);
    offset += 2;

    for (let i = 0; i < count; i += 1) {
      const id = view.getUint16(offset, true);
      offset += 2;
      const x = view.getUint16(offset, true);
      offset += 2;
      const y = view.getUint16(offset, true);
      offset += 2;
      const dir = view.getUint8(offset) as Direction;
      offset += 1;
      const animation = view.getUint8(offset) as AnimationState;
      offset += 1;
      const mountedHorseVariant = view.getUint8(offset);
      offset += 1;
      const parsed = readAppearance(view, offset);
      offset = parsed.offset;

      if (id === this.playerId) {
        continue;
      }

      const entity = this.remotePlayers.get(id) ?? createPlayerEntity(id, x, y, false, parsed.appearance);
      entity.x = x;
      entity.y = y;
      entity.targetX = x;
      entity.targetY = y;
      entity.renderX = x;
      entity.renderY = y;
      entity.dir = dir;
      entity.animation = animation;
      entity.appearance = { ...parsed.appearance };
      entity.mountedHorseVariant = mountedHorseVariant === 255 ? null : mountedHorseVariant;
      this.remotePlayers.set(id, entity);
    }
  }

  private handlePlayerLeave(view: DataView): void {
    let offset = 1;
    const count = view.getUint16(offset, true);
    offset += 2;
    for (let i = 0; i < count; i += 1) {
      const id = view.getUint16(offset, true);
      offset += 2;
      this.remotePlayers.delete(id);
    }
  }

  private handleSnapshot(view: DataView): void {
    if (!this.localPlayer) {
      return;
    }

    let offset = 1;
    offset += 2;
    const lastProcessedInput = view.getUint16(offset, true);
    offset += 2;
    const authX = view.getUint16(offset, true);
    offset += 2;
    const authY = view.getUint16(offset, true);
    offset += 2;
    const authDir = view.getUint8(offset) as Direction;
    offset += 1;
    const authAnimation = view.getUint8(offset) as AnimationState;
    offset += 1;
    const authMountedHorseVariant = view.getUint8(offset);
    offset += 1;
    const updateCount = view.getUint16(offset, true);
    offset += 2;

    while (this.pendingInputs.length > 0 && this.pendingInputs[0].seq <= lastProcessedInput) {
      this.pendingInputs.shift();
    }

    this.localPlayer.dir = authDir;
    this.localPlayer.animation = authAnimation;
    this.localPlayer.mountedHorseVariant = authMountedHorseVariant === 255 ? null : authMountedHorseVariant;
    this.reconcileLocalPlayer(authX, authY);

    for (let i = 0; i < updateCount; i += 1) {
      const id = view.getUint16(offset, true);
      offset += 2;
      const flags = view.getUint8(offset);
      offset += 1;
      const entity = this.remotePlayers.get(id) ?? createPlayerEntity(id, 0, 0, false);

      let nextX = entity.targetX;
      let nextY = entity.targetY;
      if ((flags & SnapshotFlag.Absolute) !== 0) {
        nextX = view.getUint16(offset, true);
        offset += 2;
        nextY = view.getUint16(offset, true);
        offset += 2;
      } else {
        nextX += view.getInt8(offset);
        offset += 1;
        nextY += view.getInt8(offset);
        offset += 1;
      }

      entity.x = nextX;
      entity.y = nextY;
      entity.targetX = nextX;
      entity.targetY = nextY;
      entity.dir = view.getUint8(offset) as Direction;
      offset += 1;
      entity.animation = view.getUint8(offset) as AnimationState;
      offset += 1;
      const mountedHorseVariant = view.getUint8(offset);
      offset += 1;
      entity.mountedHorseVariant = mountedHorseVariant === 255 ? null : mountedHorseVariant;
      if (id !== this.playerId) {
        this.remotePlayers.set(id, entity);
      }
    }
  }

  private reconcileLocalPlayer(authX: number, authY: number): void {
    if (!this.localPlayer) {
      return;
    }

    // Re-simulate only unacknowledged inputs so local movement stays responsive without abandoning authority.
    let predictedX = authX;
    let predictedY = authY;
    let predictedDir = this.localPlayer.dir;
    const now = performance.now();

    for (let i = 0; i < this.pendingInputs.length; i += 1) {
      const current = this.pendingInputs[i];
      const next = this.pendingInputs[i + 1];
      const dt = Math.max(0, ((next?.at ?? now) - current.at) / 1000);
      const state = stepLocalMask(
        predictedX,
        predictedY,
        current.mask,
        dt,
        (tileX, tileY) => this.world?.getTileType(tileX, tileY) ?? TileType.Grass,
        this.localPlayer.mountedHorseVariant !== null
      );
      predictedX = state.x;
      predictedY = state.y;
      predictedDir = state.dir;
    }

    this.localPlayer.x = predictedX;
    this.localPlayer.y = predictedY;
    this.localPlayer.targetX = predictedX;
    this.localPlayer.targetY = predictedY;
    this.localPlayer.dir = predictedDir;
    this.localPlayer.renderX += (predictedX - this.localPlayer.renderX) * 0.35;
    this.localPlayer.renderY += (predictedY - this.localPlayer.renderY) * 0.35;
  }

  private handleInteraction(view: DataView): void {
    const objectType = view.getUint8(5) as ObjectType;
    const action = view.getUint8(6);
    const text = interactionText(objectType, action);
    if (this.onInteraction) {
      this.onInteraction(objectType, action, text);
      return;
    }
    this.onMessage(text);
  }

  private handleChat(view: DataView): void {
    if (view.byteLength < 7) {
      return;
    }

    const senderId = view.getUint16(1, true);
    const ttlMs = view.getUint16(3, true);
    const textLength = view.getUint16(5, true);
    if (view.byteLength < 7 + textLength) {
      return;
    }

    const entity =
      senderId === this.playerId ? this.localPlayer : this.remotePlayers.get(senderId);
    if (!entity) {
      return;
    }

    const text = textDecoder.decode(new Uint8Array(view.buffer, view.byteOffset + 7, textLength));
    pushOverheadMessage(entity, text, ttlMs, performance.now());
  }

  private resetRuntimeState(): void {
    this.playerId = 0;
    this.onlineCount = 0;
    this.localPlayer = null;
    this.remotePlayers.clear();
    this.pendingInputs.length = 0;
    this.inFlightChunkPeeks.clear();
    this.onOnline(0);
    this.world?.chunkObjects.clear();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || !this.world) {
      return;
    }

    // Keep reconnect backoff short for local development and server restarts.
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(this.world as WorldState);
    }, 1000);
  }
}
