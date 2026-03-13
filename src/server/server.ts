import { createServer, type IncomingMessage } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { WebSocketServer } from "ws";
import { EMPTY_EDITOR_MAP, type EditorMapData, type EditorPatch, type PersistedEditorMap } from "../shared/editor_map";
import {
  CHUNK_RADIUS,
  CHUNK_SIZE_TILES,
  INTERACTION_RANGE,
  MOUNT_RANGE,
  NETWORK_RATE,
  SIMULATION_RATE,
  TILE_SIZE,
  TileType,
  WORLD_HEIGHT_TILES,
  WORLD_SEED,
  WORLD_WIDTH_TILES,
  type ChunkKey
} from "../shared/protocol";
import { ChunkManager } from "./chunk_manager";
import { EntitySystem } from "./entity_system";
import { HorseManager } from "./horse_manager";
import {
  encodeChat,
  encodeChunkData,
  encodeEditorPatch,
  encodeInteraction,
  encodePlayerEnter,
  encodePlayerLeave,
  encodeSnapshot,
  encodeStats,
  encodeWelcome,
  isInteractPacket,
  isToggleMountPacket,
  parseChatPacket,
  parseEditorPatchPacket,
  parseInputPacket
} from "./network";
import { loadEditorMap, saveEditorMap } from "./map_store";
import { PlayerManager, type ServerPlayer } from "./player_manager";
import { ServerWorldState } from "./world_state";

const clientRoot = resolve(__dirname, "../client");
const serverPort = Number(process.env.PORT ?? 3000);
const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        const body = chunks.length === 0 ? "{}" : Buffer.concat(chunks).toString("utf8");
        resolveBody(JSON.parse(body) as T);
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

const httpServer = createServer(async (req, res) => {
  const pathname = req.url === "/" ? "/index.html" : req.url ?? "/index.html";

  if (pathname.startsWith("/api/editor-map")) {
    await editorMapReady;
    if (req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(`${JSON.stringify(liveEditorMap)}\n`);
      return;
    }

    if (req.method === "PUT" || req.method === "POST") {
      try {
        const payload = await readJsonBody<{ data?: EditorMapData }>(req);
        const nextData: EditorMapData = {
          ...EMPTY_EDITOR_MAP,
          ...(payload.data ?? EMPTY_EDITOR_MAP),
          hiddenTiles: payload.data?.hiddenTiles ?? []
        };
        const next = await saveEditorMap(nextData);
        liveEditorMap = next;
        worldState.importEditorLayer(next.data);
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        });
        res.end(`${JSON.stringify(next)}\n`);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Invalid editor map payload." }));
      }
      return;
    }

    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Method not allowed." }));
    return;
  }

  const filePath = join(clientRoot, pathname.replace(/\?.*$/, ""));

  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }

    const body = readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

const wss = new WebSocketServer({ server: httpServer });
const chunkManager = new ChunkManager();
const entitySystem = new EntitySystem();
const horseManager = new HorseManager();
const worldState = new ServerWorldState();
const playerManager = new PlayerManager(chunkManager, (tileX, tileY) => worldState.getTileType(tileX, tileY));
let liveEditorMap: PersistedEditorMap = {
  revision: 0,
  updatedAt: new Date(0).toISOString(),
  data: EMPTY_EDITOR_MAP
};
const editorMapReady = loadEditorMap().then((persisted) => {
  liveEditorMap = persisted;
  worldState.importEditorLayer(persisted.data);
});
let editorMapSaveTimer: NodeJS.Timeout | null = null;

let serverTick = 0;

function upsertByTile<T extends { x: number; y: number }>(items: T[], next: T): void {
  const index = items.findIndex((item) => item.x === next.x && item.y === next.y);
  if (index >= 0) {
    items[index] = next;
  } else {
    items.push(next);
  }
}

function removeByTile<T extends { x: number; y: number }>(items: T[], x: number, y: number): boolean {
  const index = items.findIndex((item) => item.x === x && item.y === y);
  if (index >= 0) {
    items.splice(index, 1);
    return true;
  }
  return false;
}

function sortEditorData(data: EditorMapData): void {
  data.ground.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  data.roads.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  data.objects.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  data.hiddenTiles.sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

function applyPatchToEditorData(data: EditorMapData, patch: EditorPatch): EditorMapData {
  switch (patch.kind) {
    case "clear":
      data.ground = [];
      data.roads = [];
      data.objects = [];
      data.hiddenTiles = [];
      break;
    case "erase":
      upsertByTile(data.ground, { x: patch.x, y: patch.y, type: TileType.Grass });
      removeByTile(data.roads, patch.x, patch.y);
      removeByTile(data.objects, patch.x, patch.y);
      upsertByTile(data.hiddenTiles, { x: patch.x, y: patch.y });
      break;
    case "ground":
      upsertByTile(data.hiddenTiles, { x: patch.x, y: patch.y });
      upsertByTile(data.ground, { x: patch.x, y: patch.y, type: patch.tileType });
      break;
    case "road":
      upsertByTile(data.hiddenTiles, { x: patch.x, y: patch.y });
      upsertByTile(data.roads, { x: patch.x, y: patch.y, variant: patch.variant });
      break;
    case "object":
      upsertByTile(data.hiddenTiles, { x: patch.x, y: patch.y });
      upsertByTile(data.objects, { x: patch.x, y: patch.y, type: patch.objectType, variant: patch.variant });
      break;
  }

  sortEditorData(data);
  return data;
}

function touchLiveEditorMap(patch: EditorPatch): void {
  liveEditorMap = {
    revision: liveEditorMap.revision + 1,
    updatedAt: new Date().toISOString(),
    data: applyPatchToEditorData(liveEditorMap.data, patch)
  };
  worldState.applyEditorPatch(patch);
}

function queueEditorMapSave(): void {
  if (editorMapSaveTimer) {
    clearTimeout(editorMapSaveTimer);
  }
  editorMapSaveTimer = setTimeout(async () => {
    editorMapSaveTimer = null;
    liveEditorMap = await saveEditorMap(liveEditorMap.data);
  }, 400);
}

function baseTileForDug(type: TileType): TileType | null {
  switch (type) {
    case TileType.GrassDug:
      return TileType.Grass;
    case TileType.DirtDug:
      return TileType.Dirt;
    case TileType.ForestDug:
      return TileType.Forest;
    case TileType.StoneDug:
      return TileType.Stone;
    case TileType.HillDug:
      return TileType.Hill;
    default:
      return null;
  }
}

async function clearDugTiles(): Promise<number> {
  await editorMapReady;
  const patches: EditorPatch[] = [];

  liveEditorMap.data.ground = liveEditorMap.data.ground.map((item) => {
    const baseType = baseTileForDug(item.type as TileType);
    if (baseType === null) {
      return item;
    }
    patches.push({ kind: "ground", x: item.x, y: item.y, tileType: baseType });
    return { ...item, type: baseType };
  });

  if (patches.length === 0) {
    return 0;
  }

  sortEditorData(liveEditorMap.data);
  liveEditorMap = {
    revision: liveEditorMap.revision + patches.length,
    updatedAt: new Date().toISOString(),
    data: liveEditorMap.data
  };
  worldState.importEditorLayer(liveEditorMap.data);
  queueEditorMapSave();

  for (const patch of patches) {
    const packet = encodeEditorPatch(patch);
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(packet);
      }
    }
  }

  return patches.length;
}

function sendVisibleChunks(player: ServerPlayer, keys: ChunkKey[]): void {
  if (keys.length === 0) {
    return;
  }
  const payload = keys.map((key) => {
    const staticChunk = entitySystem.getChunkObjects(key);
    const horses = horseManager.getChunkObjects(key);
    return { key, objects: [...staticChunk, ...horses].sort((a, b) => a.id - b.id) };
  });
  player.socket.send(encodeChunkData(payload));
}

function broadcastChunkUpdates(keys: ChunkKey[]): void {
  const uniqueKeys = [...new Set(keys)];
  for (const player of playerManager.players.values()) {
    const relevant = uniqueKeys.filter((key) => player.visibleChunks.has(key));
    if (relevant.length > 0) {
      sendVisibleChunks(player, relevant);
    }
  }
}

function sendImmediateSnapshot(player: ServerPlayer): void {
  const visiblePlayers = refreshVisibility(player);
  player.socket.send(encodeSnapshot(player, visiblePlayers, serverTick));
}

function sendActiveChatMessages(viewer: ServerPlayer, targets: ServerPlayer[], now = Date.now()): void {
  for (const target of targets) {
    const messages = playerManager.getActiveChatMessages(target.id, now);
    for (const message of messages) {
      viewer.socket.send(encodeChat(target.id, message.expiresAt - now, message.text));
    }
  }
}

function refreshVisibility(player: ServerPlayer): ServerPlayer[] {
  const currentChunk = chunkManager.getChunkKeyForPlayer(player.id);
  if (!currentChunk) {
    return [];
  }

  // Interest management is chunk-based so each client only tracks a small local slice of the world.
  const nextVisiblePlayers = chunkManager.getNearbyPlayers(currentChunk, player.id);
  const enteringPlayers: number[] = [];
  const leavingPlayers: number[] = [];

  for (const id of nextVisiblePlayers) {
    if (!player.visiblePlayers.has(id)) {
      enteringPlayers.push(id);
    }
  }

  for (const id of player.visiblePlayers) {
    if (!nextVisiblePlayers.has(id)) {
      leavingPlayers.push(id);
      player.lastSentStates.delete(id);
    }
  }

  player.visiblePlayers = nextVisiblePlayers;

  if (enteringPlayers.length > 0) {
    const entities = enteringPlayers
      .map((id) => playerManager.players.get(id))
      .filter((candidate): candidate is ServerPlayer => Boolean(candidate));
    player.socket.send(encodePlayerEnter(entities));
    sendActiveChatMessages(player, entities);
  }

  if (leavingPlayers.length > 0) {
    player.socket.send(encodePlayerLeave(leavingPlayers));
  }

  const nextVisibleChunks = new Set(chunkManager.getNearbyChunkKeys(currentChunk, CHUNK_RADIUS));
  const enteringChunks: ChunkKey[] = [];
  for (const key of nextVisibleChunks) {
    if (!player.visibleChunks.has(key)) {
      enteringChunks.push(key);
    }
  }
  player.visibleChunks = nextVisibleChunks;
  sendVisibleChunks(player, enteringChunks);

  return [...nextVisiblePlayers]
    .map((id) => playerManager.players.get(id))
    .filter((candidate): candidate is ServerPlayer => Boolean(candidate));
}

wss.on("connection", (socket) => {
  socket.binaryType = "arraybuffer";
  const player = playerManager.createPlayer(socket);

  socket.send(
    encodeWelcome({
      playerId: player.id,
      worldWidth: WORLD_WIDTH_TILES,
      worldHeight: WORLD_HEIGHT_TILES,
      tileSize: TILE_SIZE,
      chunkSize: CHUNK_SIZE_TILES,
      chunkRadius: CHUNK_RADIUS,
      networkRate: NETWORK_RATE,
      seed: WORLD_SEED,
      spawnX: player.x,
      spawnY: player.y,
      onlineCount: playerManager.players.size
    })
  );

  refreshVisibility(player);

  socket.on("message", async (raw) => {
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
    const input = parseInputPacket(buffer);
    if (input) {
      playerManager.setInput(player.id, input.seq, input.mask);
      return;
    }

    if (isInteractPacket(buffer)) {
      const currentChunk = chunkManager.getChunkKeyForPlayer(player.id);
      if (!currentChunk) {
        return;
      }

      const object = entitySystem.findNearestInteractable(
        player.x,
        player.y,
        chunkManager.getNearbyChunkKeys(currentChunk, 1),
        INTERACTION_RANGE * INTERACTION_RANGE
      );
      if (!object) {
        return;
      }

      const interaction = entitySystem.describeObjectInteraction(object.type);
      socket.send(encodeInteraction(object.id, object.type, interaction.action));
      return;
    }

    if (isToggleMountPacket(buffer)) {
      const currentChunk = chunkManager.getChunkKeyForPlayer(player.id);
      if (!currentChunk) {
        return;
      }

      if (player.mountedHorseId !== null) {
        const updatedChunks = horseManager.placeHorse(
          player.mountedHorseId,
          player.x,
          player.y,
          player.mountedHorseVariant ?? 0
        );
        player.mountedHorseId = null;
        player.mountedHorseVariant = null;
        broadcastChunkUpdates(updatedChunks);
        sendImmediateSnapshot(player);
        return;
      }

      const horse = horseManager.takeNearestHorse(
        player.x,
        player.y,
        chunkManager.getNearbyChunkKeys(currentChunk, 1),
        MOUNT_RANGE * MOUNT_RANGE
      );
      if (!horse) {
        player.mountedHorseId = horseManager.allocateDynamicHorseId();
        player.mountedHorseVariant = player.id % 3;
        sendImmediateSnapshot(player);
        return;
      }
      player.mountedHorseId = horse.id;
      player.mountedHorseVariant = horse.variant ?? 0;
      broadcastChunkUpdates([horse.chunk]);
      sendImmediateSnapshot(player);
      return;
    }

    const patch = parseEditorPatchPacket(buffer);
    if (patch) {
      await editorMapReady;
      touchLiveEditorMap(patch);
      queueEditorMapSave();
      const packet = encodeEditorPatch(patch);
      for (const client of wss.clients) {
        if (client.readyState === 1) {
          client.send(packet);
        }
      }
      return;
    }

    const chat = parseChatPacket(buffer);
    if (chat) {
      const message = playerManager.pushChatMessage(player.id, chat.text);
      if (!message) {
        return;
      }

      const packet = encodeChat(player.id, message.expiresAt - Date.now(), message.text);
      const recipients = new Set<number>([player.id, ...player.visiblePlayers]);
      for (const id of recipients) {
        const recipient = playerManager.players.get(id);
        if (recipient?.socket.readyState === 1) {
          recipient.socket.send(packet);
        }
      }
    }
  });

  socket.on("close", () => {
    if (player.mountedHorseId !== null) {
      const updatedChunks = horseManager.placeHorse(
        player.mountedHorseId,
        player.x,
        player.y,
        player.mountedHorseVariant ?? 0
      );
      broadcastChunkUpdates(updatedChunks);
    }
    playerManager.removePlayer(player.id);
    for (const other of playerManager.players.values()) {
      if (other.visiblePlayers.delete(player.id)) {
        other.lastSentStates.delete(player.id);
        other.socket.send(encodePlayerLeave([player.id]));
      }
    }
  });
});

setInterval(() => {
  playerManager.step(1 / SIMULATION_RATE);
}, 1000 / SIMULATION_RATE);

setInterval(() => {
  serverTick = (serverTick + 1) & 0xffff;
  for (const player of playerManager.players.values()) {
    const visiblePlayers = refreshVisibility(player);
    player.socket.send(encodeSnapshot(player, visiblePlayers, serverTick));
  }
}, 1000 / NETWORK_RATE);

setInterval(() => {
  const packet = encodeStats(playerManager.players.size);
  for (const player of playerManager.players.values()) {
    player.socket.send(packet);
  }
}, 1000);

httpServer.listen(serverPort, () => {
  console.log(`BasedLand listening on http://localhost:${serverPort}`);
});

if (process.stdin.isTTY) {
  const adminConsole = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  adminConsole.on("line", async (line) => {
    const command = line.trim().toLowerCase();
    if (command === "clear-dug") {
      const cleared = await clearDugTiles();
      console.log(`Cleared ${cleared} dug tiles.`);
      return;
    }
    if (command.length > 0) {
      console.log(`Unknown server command: ${command}`);
    }
  });
}
