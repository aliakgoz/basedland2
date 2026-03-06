import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { WebSocketServer } from "ws";
import {
  CHUNK_RADIUS,
  CHUNK_SIZE_TILES,
  INTERACTION_RANGE,
  NETWORK_RATE,
  SIMULATION_RATE,
  TILE_SIZE,
  WORLD_HEIGHT_TILES,
  WORLD_SEED,
  WORLD_WIDTH_TILES,
  type ChunkKey
} from "../shared/protocol";
import { ChunkManager } from "./chunk_manager";
import { EntitySystem } from "./entity_system";
import {
  encodeChunkData,
  encodeInteraction,
  encodePlayerEnter,
  encodePlayerLeave,
  encodeSnapshot,
  encodeStats,
  encodeWelcome,
  isInteractPacket,
  parseInputPacket
} from "./network";
import { PlayerManager, type ServerPlayer } from "./player_manager";

const clientRoot = resolve(__dirname, "../client");
const serverPort = Number(process.env.PORT ?? 3000);
const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

const httpServer = createServer((req, res) => {
  const pathname = req.url === "/" ? "/index.html" : req.url ?? "/index.html";
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
const playerManager = new PlayerManager(chunkManager);

let serverTick = 0;

function sendVisibleChunks(player: ServerPlayer, keys: ChunkKey[]): void {
  if (keys.length === 0) {
    return;
  }

  player.socket.send(encodeChunkData(entitySystem.collectChunkPayload(keys)));
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

  socket.on("message", (raw) => {
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
    }
  });

  socket.on("close", () => {
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
