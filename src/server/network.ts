import { type EditorPatch } from "../shared/editor_map";
import { AnimationState, ClientOpcode, Direction, ServerOpcode, SnapshotFlag, type ChunkKey, type StaticObject } from "../shared/protocol";
import type { ServerPlayer } from "./player_manager";

function writeUint16(view: DataView, offset: number, value: number): number {
  view.setUint16(offset, value, true);
  return offset + 2;
}

function writeUint32(view: DataView, offset: number, value: number): number {
  view.setUint32(offset, value, true);
  return offset + 4;
}

export function parseInputPacket(buffer: Buffer): { seq: number; mask: number } | null {
  if (buffer.length < 4 || buffer.readUInt8(0) !== 1) {
    return null;
  }

  return {
    seq: buffer.readUInt16LE(1),
    mask: buffer.readUInt8(3)
  };
}

export function isInteractPacket(buffer: Buffer): boolean {
  return buffer.length >= 1 && buffer.readUInt8(0) === 2;
}

export function parseEditorPatchPacket(buffer: Buffer): EditorPatch | null {
  if (buffer.length < 8 || buffer.readUInt8(0) !== ClientOpcode.EditorPatch) {
    return null;
  }

  const kind = buffer.readUInt8(1);
  const x = buffer.readUInt16LE(2);
  const y = buffer.readUInt16LE(4);
  const a = buffer.readUInt8(6);
  const b = buffer.readUInt8(7);

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

export function encodeEditorPatch(patch: EditorPatch): ArrayBuffer {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint8(0, ServerOpcode.EditorPatch);

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

export function encodeWelcome(options: {
  playerId: number;
  worldWidth: number;
  worldHeight: number;
  tileSize: number;
  chunkSize: number;
  chunkRadius: number;
  networkRate: number;
  seed: number;
  spawnX: number;
  spawnY: number;
  onlineCount: number;
}): ArrayBuffer {
  // Join packets are sent once, so a few spare bytes are preferable to a hard crash from tight sizing.
  const buffer = new ArrayBuffer(32);
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint8(offset, ServerOpcode.Welcome);
  offset += 1;
  offset = writeUint16(view, offset, options.playerId);
  offset = writeUint16(view, offset, options.worldWidth);
  offset = writeUint16(view, offset, options.worldHeight);
  view.setUint8(offset, options.tileSize);
  offset += 1;
  view.setUint8(offset, options.chunkSize);
  offset += 1;
  view.setUint8(offset, options.chunkRadius);
  offset += 1;
  view.setUint8(offset, options.networkRate);
  offset += 1;
  offset = writeUint32(view, offset, options.seed);
  offset = writeUint16(view, offset, Math.round(options.spawnX));
  offset = writeUint16(view, offset, Math.round(options.spawnY));
  writeUint16(view, offset, options.onlineCount);
  return buffer;
}

export function encodeChunkData(chunks: Array<{ key: ChunkKey; objects: StaticObject[] }>): ArrayBuffer {
  let size = 2;
  for (const chunk of chunks) {
    size += 6 + chunk.objects.length * 10;
  }

  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint8(offset, ServerOpcode.ChunkData);
  offset += 1;
  view.setUint8(offset, chunks.length);
  offset += 1;

  for (const chunk of chunks) {
    const [cx, cy] = chunk.key.split(",").map(Number);
    offset = writeUint16(view, offset, cx);
    offset = writeUint16(view, offset, cy);
    offset = writeUint16(view, offset, chunk.objects.length);

    for (const object of chunk.objects) {
      offset = writeUint32(view, offset, object.id);
      view.setUint8(offset, object.type);
      offset += 1;
      offset = writeUint16(view, offset, object.x);
      offset = writeUint16(view, offset, object.y);
      view.setUint8(offset, object.variant ?? 0);
      offset += 1;
    }
  }

  return buffer;
}

export function encodePlayerEnter(players: ServerPlayer[]): ArrayBuffer {
  const size = 3 + players.length * 8;
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint8(offset, ServerOpcode.PlayerEnter);
  offset += 1;
  offset = writeUint16(view, offset, players.length);

  for (const player of players) {
    offset = writeUint16(view, offset, player.id);
    offset = writeUint16(view, offset, Math.round(player.x));
    offset = writeUint16(view, offset, Math.round(player.y));
    view.setUint8(offset, player.dir ?? Direction.Down);
    offset += 1;
    view.setUint8(offset, player.animation ?? AnimationState.Idle);
    offset += 1;
  }

  return buffer;
}

export function encodePlayerLeave(ids: number[]): ArrayBuffer {
  const size = 3 + ids.length * 2;
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint8(offset, ServerOpcode.PlayerLeave);
  offset += 1;
  offset = writeUint16(view, offset, ids.length);
  for (const id of ids) {
    offset = writeUint16(view, offset, id);
  }
  return buffer;
}

export function encodeSnapshot(player: ServerPlayer, visiblePlayers: ServerPlayer[], tick: number): ArrayBuffer {
  const entries: Array<{
    id: number;
    absolute: boolean;
    x: number;
    y: number;
    dx: number;
    dy: number;
    dir: number;
    animation: number;
  }> = [];

  for (const remote of visiblePlayers) {
    const previous = player.lastSentStates.get(remote.id);
    const nextX = Math.round(remote.x);
    const nextY = Math.round(remote.y);
    const dir = remote.dir;
    const animation = remote.animation;

    if (
      previous &&
      previous.x === nextX &&
      previous.y === nextY &&
      previous.dir === dir &&
      previous.animation === animation
    ) {
      continue;
    }

    let absolute = true;
    let dx = 0;
    let dy = 0;

    if (previous) {
      // Most movement fits inside signed 8-bit deltas at 10 Hz, which keeps snapshots compact.
      dx = nextX - previous.x;
      dy = nextY - previous.y;
      absolute = dx < -127 || dx > 127 || dy < -127 || dy > 127;
    }

    entries.push({
      id: remote.id,
      absolute,
      x: nextX,
      y: nextY,
      dx,
      dy,
      dir,
      animation
    });
    player.lastSentStates.set(remote.id, { x: nextX, y: nextY, dir, animation });
  }

  const baseSize = 13;
  const entrySize = entries.reduce((total, entry) => total + (entry.absolute ? 9 : 7), 0);
  const buffer = new ArrayBuffer(baseSize + entrySize);
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint8(offset, ServerOpcode.Snapshot);
  offset += 1;
  offset = writeUint16(view, offset, tick);
  offset = writeUint16(view, offset, player.lastProcessedInput);
  offset = writeUint16(view, offset, Math.round(player.x));
  offset = writeUint16(view, offset, Math.round(player.y));
  view.setUint8(offset, player.dir);
  offset += 1;
  view.setUint8(offset, player.animation);
  offset += 1;
  offset = writeUint16(view, offset, entries.length);

  for (const entry of entries) {
    offset = writeUint16(view, offset, entry.id);
    view.setUint8(offset, entry.absolute ? SnapshotFlag.Absolute : 0);
    offset += 1;
    if (entry.absolute) {
      offset = writeUint16(view, offset, entry.x);
      offset = writeUint16(view, offset, entry.y);
    } else {
      view.setInt8(offset, entry.dx);
      offset += 1;
      view.setInt8(offset, entry.dy);
      offset += 1;
    }
    view.setUint8(offset, entry.dir);
    offset += 1;
    view.setUint8(offset, entry.animation);
    offset += 1;
  }

  return buffer;
}

export function encodeInteraction(objectId: number, objectType: number, action: number): ArrayBuffer {
  const buffer = new ArrayBuffer(7);
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint8(offset, ServerOpcode.Interaction);
  offset += 1;
  offset = writeUint32(view, offset, objectId);
  view.setUint8(offset, objectType);
  offset += 1;
  view.setUint8(offset, action);
  return buffer;
}

export function encodeStats(playersOnline: number): ArrayBuffer {
  const buffer = new ArrayBuffer(3);
  const view = new DataView(buffer);
  view.setUint8(0, ServerOpcode.Stats);
  view.setUint16(1, playersOnline, true);
  return buffer;
}
