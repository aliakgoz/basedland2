import {
  AnimationState,
  ClientOpcode,
  Direction,
  InputFlag,
  ObjectType,
  PLAYER_SPEED,
  ServerOpcode,
  SnapshotFlag,
  TILE_SIZE
} from "../shared/protocol";
import type { EditorPatch } from "../shared/editor_map";
import { getTileType, isWalkableTile } from "../shared/worldgen";
import type { PlayerEntity } from "./entity";
import { createPlayerEntity } from "./entity";
import type { WorldState } from "./world";

declare const __BASEDLAND_WS_URL__: string;

interface PendingInput {
  seq: number;
  mask: number;
  at: number;
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
    23: "The little spark beast crackles and darts away."
  };
  return map[action] ?? `You inspect object ${objectType}.`;
}

function stepLocalMask(x: number, y: number, mask: number, dt: number): { x: number; y: number; dir: Direction } {
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

  const nextX = x + dx * PLAYER_SPEED * dt;
  const nextY = y + dy * PLAYER_SPEED * dt;
  const tileX = Math.floor(nextX / TILE_SIZE);
  const tileY = Math.floor(nextY / TILE_SIZE);

  if (!isWalkableTile(getTileType(tileX, tileY))) {
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

export class NetworkClient {
  socket: WebSocket | null = null;
  playerId = 0;
  onlineCount = 0;
  localPlayer: PlayerEntity | null = null;
  readonly remotePlayers = new Map<number, PlayerEntity>();
  readonly pendingInputs: PendingInput[] = [];
  onMessage: (text: string) => void = () => {};
  onOnline: (count: number) => void = () => {};
  private reconnectTimer: number | null = null;
  private world: WorldState | null = null;

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
      default:
        break;
    }
  }

  private handleWelcome(view: DataView): void {
    this.playerId = view.getUint16(1, true);
    const spawnX = view.getUint16(14, true);
    const spawnY = view.getUint16(16, true);
    this.onlineCount = view.getUint16(18, true);
    this.localPlayer = createPlayerEntity(this.playerId, spawnX, spawnY, true);
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

      if (id === this.playerId) {
        continue;
      }

      const entity = this.remotePlayers.get(id) ?? createPlayerEntity(id, x, y, false);
      entity.x = x;
      entity.y = y;
      entity.targetX = x;
      entity.targetY = y;
      entity.renderX = x;
      entity.renderY = y;
      entity.dir = dir;
      entity.animation = animation;
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
    const updateCount = view.getUint16(offset, true);
    offset += 2;

    while (this.pendingInputs.length > 0 && this.pendingInputs[0].seq <= lastProcessedInput) {
      this.pendingInputs.shift();
    }

    this.localPlayer.dir = authDir;
    this.localPlayer.animation = authAnimation;
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
      const state = stepLocalMask(predictedX, predictedY, current.mask, dt);
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
    this.onMessage(interactionText(objectType, action));
  }

  private resetRuntimeState(): void {
    this.playerId = 0;
    this.onlineCount = 0;
    this.localPlayer = null;
    this.remotePlayers.clear();
    this.pendingInputs.length = 0;
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
