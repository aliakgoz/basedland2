import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readdirSync, readFileSync, statSync } from "node:fs";
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
  ObjectType,
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
import { TreasureManager } from "./treasure_manager";
import { TreasurePayoutService } from "./treasure_payout";
import { createEmptyTreasureState, loadTreasureState, saveTreasureState, type PersistedTreasureState } from "./treasure_store";
import { ServerWorldState } from "./world_state";

const clientRoot = resolve(__dirname, "../client");
const musicRoot = resolve(__dirname, "../../data/music");
const serverPort = Number(process.env.PORT ?? 3000);
const baseRpcUrl = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
const treasureRecipient = (process.env.TREASURE_RECIPIENT_ADDRESS ?? "").trim();
const treasureUsdcAddress = (process.env.TREASURE_USDC_ADDRESS ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913").trim();
const treasureDigAmountDisplay = (process.env.TREASURE_DIG_USDC_AMOUNT ?? "0.01").trim();
const stableHorsePriceDisplay = (process.env.STABLE_HORSE_PRICE_USDC_AMOUNT ?? "0.5").trim();
const treasurePayoutPercentRaw = (process.env.TREASURE_PAYOUT_PERCENT ?? "99").trim();
const mapMakerEnabled = !["0", "false", "off", "no"].includes((process.env.MAP_MAKER_ENABLED ?? "1").trim().toLowerCase());
const treasureSecretSalt = process.env.TREASURE_SECRET_SALT ?? "basedland-secret";
const treasureCount = Math.max(1, Number(process.env.TREASURE_COUNT ?? 128) || 128);
const treasurePayoutPrivateKey = (process.env.TREASURE_PAYOUT_PRIVATE_KEY ?? "").trim();
const BASE_CHAIN_ID = 8453;
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";
const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const STABLE_INTERACTION_RANGE = 480;
const STABLE_FOOTPRINT_HALF_WIDTH = 134;
const STABLE_FOOTPRINT_HALF_HEIGHT = 134;
const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};
let mapMakerConsoleOpen = false;
const ALREADY_DUG_MESSAGES = [
  "You dig with confidence and discover the shocking truth: this hole is already a hole.",
  "The ground would like a break. It has already been enthusiastically excavated.",
  "You cannot unearth what is already thoroughly earthed-out.",
  "This patch has been dug so hard it now has trust issues.",
  "Your shovel finds only yesterday's ambition.",
  "Fresh news from the soil: still dug.",
  "You poke the hole. The hole pokes back emotionally.",
  "There is no deeper state here. Only an existing pit.",
  "That tile has already donated all the dirt it can spare.",
  "You arrive late to the archaeology party.",
  "The excavation department reports: duplicate hole request denied.",
  "This ground has already been introduced to the concept of absence.",
  "You swing the shovel and the hole files a repeat complaint.",
  "The dirt has already moved out.",
  "You cannot double-dig a single dig. Even this world has standards.",
  "This spot is already open for business and closed for more digging.",
  "The shovel pauses. The hole nods. Everyone understands.",
  "No treasure, no dirt, no sequel. This one is already dug.",
  "That hole is not getting any holier.",
  "You try to dig again. The ground replies, 'been there.'",
  "Further excavation would mainly impress the worms.",
  "This tile has already experienced character development.",
  "The pit is complete. Please enjoy it from a respectful distance.",
  "You found the legendary treasure of doing the same thing twice."
] as const;

function isLoopbackAddress(address: string | undefined): boolean {
  const normalized = (address ?? "").trim();
  return normalized === "::1" || normalized === "127.0.0.1" || normalized === "::ffff:127.0.0.1";
}

function randomAlreadyDugMessage(): string {
  return ALREADY_DUG_MESSAGES[Math.floor(Math.random() * ALREADY_DUG_MESSAGES.length)] ?? "This tile is already excavated.";
}

function sqrDistanceToStableFootprint(x: number, y: number, stableX: number, stableY: number): number {
  const dx = Math.max(0, Math.abs(x - stableX) - STABLE_FOOTPRINT_HALF_WIDTH);
  const dy = Math.max(0, Math.abs(y - stableY) - STABLE_FOOTPRINT_HALF_HEIGHT);
  return dx * dx + dy * dy;
}

function listMusicTracks(): string[] {
  try {
    return readdirSync(musicRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".mp3")
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  } catch {
    return [];
  }
}

function serveFile(res: ServerResponse, filePath: string): void {
  const stats = statSync(filePath);
  if (!stats.isFile()) {
    res.writeHead(404).end("Not found");
    return;
  }

  const body = readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function isCorsPath(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname.startsWith("/music/");
}

function applyCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

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

interface StablePurchaseSession {
  id: string;
  playerId: number;
  variant: number;
  createdAt: number;
  expiresAt: number;
}

const httpServer = createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? "/index.html", "http://localhost");
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;

  if (isCorsPath(pathname)) {
    applyCors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
  }

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

    if (!mapMakerEnabled || !mapMakerConsoleOpen || !isLoopbackAddress(req.socket.remoteAddress)) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Map maker is disabled." }));
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

  if (pathname.startsWith("/api/editor-access")) {
    json(res, 200, {
      enabled: mapMakerEnabled && mapMakerConsoleOpen && isLoopbackAddress(req.socket.remoteAddress)
    });
    return;
  }

  if (pathname.startsWith("/api/chunk-peek")) {
    const tileX = Math.max(0, Math.min(WORLD_WIDTH_TILES - 1, Number.parseInt(requestUrl.searchParams.get("tileX") ?? "0", 10) || 0));
    const tileY = Math.max(0, Math.min(WORLD_HEIGHT_TILES - 1, Number.parseInt(requestUrl.searchParams.get("tileY") ?? "0", 10) || 0));
    const radius = Math.max(1, Math.min(3, Number.parseInt(requestUrl.searchParams.get("radius") ?? "2", 10) || 2));
    const centerKey = `${Math.floor(tileX / CHUNK_SIZE_TILES)},${Math.floor(tileY / CHUNK_SIZE_TILES)}` as ChunkKey;
    const keys = chunkManager.getNearbyChunkKeys(centerKey, radius);
    const chunks = keys.map((key) => {
      const [cx, cy] = key.split(",").map(Number);
      const staticChunk = entitySystem.getChunkObjects(key);
      const horses = horseManager.getChunkObjects(key);
      return {
        cx,
        cy,
        objects: [...staticChunk, ...horses].sort((a, b) => a.id - b.id)
      };
    });
    json(res, 200, { chunks });
    return;
  }

  if (pathname === "/api/music") {
    json(res, 200, {
      tracks: listMusicTracks().map((fileName) => `/music/${encodeURIComponent(fileName)}`)
    });
    return;
  }

  if (pathname.startsWith("/api/treasure/config")) {
    json(res, 200, {
      enabled: isTreasureEnabled(),
      reason: isTreasureEnabled() ? undefined : "TREASURE_RECIPIENT_ADDRESS missing on server.",
      chainId: BASE_CHAIN_ID,
      usdcToken: treasureUsdcAddress,
      recipient: treasureRecipient,
      amountUnits: treasureDigAmountUnits.toString(),
      amountDisplay: `${treasureDigAmountDisplay} USDC`
    });
    return;
  }

  if (pathname.startsWith("/api/stable/config")) {
    json(res, 200, {
      enabled: isTreasureEnabled(),
      reason: isTreasureEnabled() ? undefined : "TREASURE_RECIPIENT_ADDRESS missing on server.",
      chainId: BASE_CHAIN_ID,
      usdcToken: treasureUsdcAddress,
      recipient: treasureRecipient,
      amountUnits: stableHorsePriceUnits.toString(),
      amountDisplay: `${stableHorsePriceDisplay} USDC`
    });
    return;
  }

  if (pathname.startsWith("/api/chat") && req.method === "POST") {
    try {
      const payload = await readJsonBody<{ playerId?: number; text?: string }>(req);
      const playerId = Number(payload.playerId ?? 0);
      const text = String(payload.text ?? "").trim().slice(0, CHAT_MESSAGE_MAX_LENGTH);
      console.log("[chat] api request", { playerId, text });
      if (!Number.isFinite(playerId) || playerId <= 0 || text.length === 0) {
        json(res, 400, { error: "Invalid chat payload." });
        return;
      }
      const player = playerManager.players.get(playerId);
      if (!player) {
        json(res, 404, { error: "Player not found on server." });
        return;
      }
      if (!broadcastPlayerChat(playerId, text)) {
        json(res, 400, { error: "Chat could not be delivered." });
        return;
      }
      json(res, 200, { success: true });
    } catch {
      json(res, 400, { error: "Invalid chat payload." });
    }
    return;
  }

  if (pathname.startsWith("/api/stable/nearby") && req.method === "POST") {
    try {
      const payload = await readJsonBody<{ playerId?: number }>(req);
      const playerId = Number(payload.playerId ?? 0);
      if (!Number.isFinite(playerId) || playerId <= 0) {
        json(res, 400, { error: "Invalid player id." });
        return;
      }
      const stable = getNearbyStable(playerId);
      json(res, 200, {
        nearby: Boolean(stable),
        stable
      });
    } catch {
      json(res, 400, { error: "Invalid stable proximity payload." });
    }
    return;
  }

  if (pathname.startsWith("/api/stable/prepare") && req.method === "POST") {
    if (!isTreasureEnabled()) {
      json(res, 503, { error: "Stable purchases are disabled on this server." });
      return;
    }

    try {
      await treasureStateReady;
      const payload = await readJsonBody<{ playerId?: number; variant?: number }>(req);
      const playerId = Number(payload.playerId ?? 0);
      const variant = Number(payload.variant ?? -1);
      if (!Number.isFinite(playerId) || !Number.isFinite(variant) || variant < 0 || variant > 2) {
        json(res, 400, { error: "Invalid stable purchase request." });
        return;
      }
      const playerTile = getPlayerTile(playerId);
      if (!playerTile) {
        json(res, 404, { error: "Player not found on server." });
        return;
      }
      const stable = getNearbyStable(playerId) ?? { tileX: playerTile.tileX, tileY: playerTile.tileY };
      const id = `stable_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      stablePurchaseSessions.set(id, {
        id,
        playerId,
        variant,
        createdAt: Date.now(),
        expiresAt: Date.now() + 5 * 60 * 1000
      });
      json(res, 200, {
        purchaseId: id,
        stable,
        payment: {
          enabled: true,
          chainId: BASE_CHAIN_ID,
          usdcToken: treasureUsdcAddress,
          recipient: treasureRecipient,
          amountUnits: stableHorsePriceUnits.toString(),
          amountDisplay: `${stableHorsePriceDisplay} USDC`
        }
      });
    } catch {
      json(res, 400, { error: "Invalid stable purchase payload." });
    }
    return;
  }

  if (pathname.startsWith("/api/stable/confirm") && req.method === "POST") {
    if (!isTreasureEnabled()) {
      json(res, 503, { error: "Stable purchases are disabled on this server." });
      return;
    }

    try {
      await treasureStateReady;
      const payload = await readJsonBody<{ playerId?: number; purchaseId?: string; txHash?: string; payer?: string }>(req);
      const playerId = Number(payload.playerId ?? 0);
      const purchaseId = String(payload.purchaseId ?? "");
      const txHash = String(payload.txHash ?? "").toLowerCase();
      const payer = String(payload.payer ?? "");
      const session = stablePurchaseSessions.get(purchaseId) ?? null;
      if (!session || session.playerId !== playerId || session.expiresAt < Date.now()) {
        stablePurchaseSessions.delete(purchaseId);
        json(res, 400, { error: "Stable purchase session expired or missing." });
        return;
      }
      stablePurchaseSessions.delete(purchaseId);
      if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        json(res, 400, { error: "Invalid transaction hash." });
        return;
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(payer)) {
        json(res, 400, { error: "Invalid payer wallet address." });
        return;
      }
      if (treasureManager?.isTxUsed(txHash)) {
        json(res, 409, { error: "This transaction hash was already used." });
        return;
      }

      await verifyTreasurePayment(txHash, payer, stableHorsePriceUnits);
      treasureManager?.markTxUsed(txHash);
      await persistTreasureStateNow();
      const player = playerManager.players.get(playerId);
      if (!player) {
        json(res, 404, { error: "Player not found on server." });
        return;
      }
      if (player.mountedHorseId === null) {
        player.mountedHorseId = horseManager.allocateDynamicHorseId();
      }
      player.mountedHorseVariant = session.variant;
      sendImmediateSnapshot(player);

      json(res, 200, {
        success: true,
        mountedHorseVariant: session.variant,
        message: "Horse purchased. You ride out immediately."
      });
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : "Stable purchase failed." });
    }
    return;
  }

  if (pathname.startsWith("/api/treasure/stats")) {
    await treasureStateReady;
    const summary = treasureManager?.getActiveBuriedSummary() ?? { pointCount: 0, totalAmountUnits: 0n };
    json(res, 200, {
      pointCount: summary.pointCount,
      totalAmountUnits: summary.totalAmountUnits.toString(),
      totalAmountDisplay: `${formatUsdcAmount(summary.totalAmountUnits)} USDC`
    });
    return;
  }

  if (pathname.startsWith("/api/treasure/prepare") && req.method === "POST") {
    if (!isTreasureEnabled()) {
      json(res, 503, { error: "Treasure digging is disabled on this server." });
      return;
    }

    try {
      await treasureStateReady;
      const payload = await readJsonBody<{ playerId?: number }>(req);
      const playerId = Number(payload.playerId ?? 0);
      if (!Number.isFinite(playerId)) {
        json(res, 400, { error: "Invalid dig request." });
        return;
      }
      const playerTile = getPlayerTile(playerId);
      if (!playerTile) {
        json(res, 404, { error: "Player not found on server." });
        return;
      }
      const { tileX, tileY, currentType } = playerTile;
      const dugType = dugTileFor(currentType);
      if (!treasureManager || !Number.isFinite(playerId) || playerId <= 0 || dugType === null) {
        json(res, 400, { error: "This tile cannot be dug." });
        return;
      }
      if (currentType === dugType) {
        json(res, 409, { error: randomAlreadyDugMessage() });
        return;
      }

      const dig = treasureManager.prepareDig(playerId, tileX, tileY);
      json(res, 200, {
        digId: dig.id,
        tileX,
        tileY,
        payment: {
          enabled: true,
          chainId: BASE_CHAIN_ID,
          usdcToken: treasureUsdcAddress,
          recipient: treasureRecipient,
          amountUnits: treasureDigAmountUnits.toString(),
          amountDisplay: `${treasureDigAmountDisplay} USDC`
        }
      });
    } catch {
      json(res, 400, { error: "Invalid treasure prepare payload." });
    }
    return;
  }

  if (pathname.startsWith("/api/treasure/confirm") && req.method === "POST") {
    if (!isTreasureEnabled()) {
      json(res, 503, { error: "Treasure digging is disabled on this server." });
      return;
    }

    try {
      await treasureStateReady;
      const payload = await readJsonBody<{ playerId?: number; digId?: string; txHash?: string; payer?: string }>(req);
      const playerId = Number(payload.playerId ?? 0);
      const digId = String(payload.digId ?? "");
      const txHash = String(payload.txHash ?? "").toLowerCase();
      const payer = String(payload.payer ?? "");
      const session = treasureManager?.consumeDigSession(digId, playerId) ?? null;

      if (!session) {
        json(res, 400, { error: "Dig session expired or missing." });
        return;
      }
      if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        json(res, 400, { error: "Invalid transaction hash." });
        return;
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(payer)) {
        json(res, 400, { error: "Invalid payer wallet address." });
        return;
      }
      if (treasureManager?.isTxUsed(txHash)) {
        json(res, 409, { error: "This transaction hash was already used." });
        return;
      }

      await verifyTreasurePayment(txHash, payer, treasureDigAmountUnits);

      const currentType = worldState.getTileType(session.tileX, session.tileY);
      const dugType = dugTileFor(currentType);
      if (dugType !== null) {
        const patch: EditorPatch = { kind: "ground", x: session.tileX, y: session.tileY, tileType: dugType };
        touchLiveEditorMap(patch);
        queueEditorMapSave();
        const packet = encodeEditorPatch(patch);
        for (const client of wss.clients) {
          if (client.readyState === 1) {
            client.send(packet);
          }
        }
      }

      const result = treasureManager?.claimTreasure(session.tileX, session.tileY, txHash, payer) ?? {
        found: false,
        alreadyClaimed: false,
        seededFound: false,
        buriedCount: 0,
        buriedAmountUnits: 0n
      };
      const payoutAmountUnits = payoutAmountAfterFee(result.buriedAmountUnits);
      const feeAmountUnits = result.buriedAmountUnits - payoutAmountUnits;
      let message = result.found
        ? describeTreasureFound(result)
        : result.alreadyClaimed
          ? "This treasure was already claimed earlier."
          : "No treasure here. The dig completed and the ground was opened.";

      if (result.found && payoutAmountUnits > 0n) {
        try {
          const payout = await payoutService.payoutUsdc(payer, payoutAmountUnits);
          treasureManager?.recordClaimPayout(session.tileX, session.tileY, txHash, payout.txHash, payer);
          message = `${message} Automatic payout sent: ${formatUsdcAmount(payoutAmountUnits)} USDC after ${formatUsdcAmount(feeAmountUnits)} USDC fee.`;
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Automatic payout failed.";
          treasureManager?.recordClaimPayoutFailure(session.tileX, session.tileY, txHash, payer, reason);
          message = `${message} Automatic payout failed: ${reason}`;
        }
      }
      await persistTreasureStateNow();

      json(res, 200, {
        success: true,
        found: result.found,
        message
      });
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : "Treasure confirmation failed." });
    }
    return;
  }

  if (pathname.startsWith("/api/treasure/bury/prepare") && req.method === "POST") {
    if (!isTreasureEnabled()) {
      json(res, 503, { error: "Treasure burying is disabled on this server." });
      return;
    }

    try {
      await treasureStateReady;
      const payload = await readJsonBody<{ playerId?: number; amountDisplay?: string }>(req);
      const playerId = Number(payload.playerId ?? 0);
      const amountUnits = parseClientUsdcAmount(String(payload.amountDisplay ?? "").trim());
      if (!Number.isFinite(playerId)) {
        json(res, 400, { error: "Invalid bury request." });
        return;
      }
      const playerTile = getPlayerTile(playerId);
      if (!playerTile) {
        json(res, 404, { error: "Player not found on server." });
        return;
      }
      const { tileX, tileY, currentType } = playerTile;
      const dugType = dugTileFor(currentType);
      if (!treasureManager || playerId <= 0 || dugType === null || currentType === dugType) {
        json(res, 400, { error: "You can only hide treasure away from water and existing dig sites." });
        return;
      }

      const bury = treasureManager.prepareBury(playerId, tileX, tileY, amountUnits);
      json(res, 200, {
        buryId: bury.id,
        tileX,
        tileY,
        payment: {
          enabled: true,
          chainId: BASE_CHAIN_ID,
          usdcToken: treasureUsdcAddress,
          recipient: treasureRecipient,
          amountUnits: amountUnits.toString(),
          amountDisplay: `${formatUsdcAmount(amountUnits)} USDC`
        }
      });
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : "Invalid treasure bury payload." });
    }
    return;
  }

  if (pathname.startsWith("/api/treasure/bury/confirm") && req.method === "POST") {
    if (!isTreasureEnabled()) {
      json(res, 503, { error: "Treasure burying is disabled on this server." });
      return;
    }

    try {
      await treasureStateReady;
      const payload = await readJsonBody<{ playerId?: number; buryId?: string; txHash?: string; payer?: string }>(req);
      const playerId = Number(payload.playerId ?? 0);
      const buryId = String(payload.buryId ?? "");
      const txHash = String(payload.txHash ?? "").toLowerCase();
      const payer = String(payload.payer ?? "");
      const session = treasureManager?.consumeBurySession(buryId, playerId) ?? null;

      if (!session) {
        json(res, 400, { error: "Bury session expired or missing." });
        return;
      }
      if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        json(res, 400, { error: "Invalid transaction hash." });
        return;
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(payer)) {
        json(res, 400, { error: "Invalid payer wallet address." });
        return;
      }
      if (treasureManager?.isTxUsed(txHash)) {
        json(res, 409, { error: "This transaction hash was already used." });
        return;
      }

      await verifyTreasurePayment(txHash, payer, session.amountUnits);
      treasureManager?.buryTreasure(session.tileX, session.tileY, session.amountUnits, txHash, payer);
      await persistTreasureStateNow();

      json(res, 200, {
        success: true,
        message: `Treasure hidden at this tile. Cache amount: ${formatUsdcAmount(session.amountUnits)} USDC.`
      });
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : "Treasure bury confirmation failed." });
    }
    return;
  }

  if (pathname.startsWith("/music/")) {
    const requestedName = decodeURIComponent(pathname.slice("/music/".length));
    const filePath = resolve(musicRoot, requestedName);
    if (!filePath.startsWith(musicRoot)) {
      res.writeHead(404).end("Not found");
      return;
    }
    try {
      serveFile(res, filePath);
    } catch {
      res.writeHead(404).end("Not found");
    }
    return;
  }

  const filePath = join(clientRoot, pathname.replace(/\?.*$/, ""));

  try {
    serveFile(res, filePath);
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
const payoutService = new TreasurePayoutService(baseRpcUrl, treasureUsdcAddress, treasurePayoutPrivateKey);
let treasureManager: TreasureManager | null = null;
let persistedTreasureState: PersistedTreasureState = {
  revision: 0,
  updatedAt: new Date(0).toISOString(),
  claimed: [],
  buried: [],
  usedTxHashes: []
};
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
let treasureStateSaveTimer: NodeJS.Timeout | null = null;
const stablePurchaseSessions = new Map<string, StablePurchaseSession>();
const treasureStateReady = Promise.all([editorMapReady, loadTreasureState()]).then(([, persisted]) => {
  persistedTreasureState = persisted;
  treasureManager = new TreasureManager(
    (tileX, tileY) => worldState.getTileType(tileX, tileY),
    treasureSecretSalt,
    treasureCount,
    persisted
  );
});

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

function queueTreasureStateSave(): void {
  if (treasureStateSaveTimer) {
    clearTimeout(treasureStateSaveTimer);
  }
  treasureStateSaveTimer = setTimeout(async () => {
    treasureStateSaveTimer = null;
    if (!treasureManager) {
      return;
    }
    persistedTreasureState = await saveTreasureState({
      ...treasureManager.exportState(),
      revision: persistedTreasureState.revision
    });
  }, 400);
}

async function persistTreasureStateNow(): Promise<void> {
  if (treasureStateSaveTimer) {
    clearTimeout(treasureStateSaveTimer);
    treasureStateSaveTimer = null;
  }
  if (!treasureManager) {
    return;
  }
  persistedTreasureState = await saveTreasureState({
    ...treasureManager.exportState(),
    revision: persistedTreasureState.revision
  });
}

async function resetTreasureStateNow(): Promise<void> {
  if (treasureStateSaveTimer) {
    clearTimeout(treasureStateSaveTimer);
    treasureStateSaveTimer = null;
  }
  if (!treasureManager) {
    return;
  }
  treasureManager.resetState();
  persistedTreasureState = await saveTreasureState({
    ...createEmptyTreasureState(),
    revision: persistedTreasureState.revision
  });
}

function isTreasureEnabled(): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(treasureRecipient);
}

function parseUsdcAmountUnits(value: string): bigint {
  const [wholePart, fractionPart = ""] = value.split(".");
  const normalizedWhole = wholePart.length === 0 ? "0" : wholePart;
  const normalizedFraction = `${fractionPart}000000`.slice(0, 6);
  return BigInt(normalizedWhole) * 1_000_000n + BigInt(normalizedFraction);
}

function parseClientUsdcAmount(value: string): bigint {
  const normalized = value.replace(",", ".").trim();
  if (!/^\d+(\.\d{1,6})?$/.test(normalized)) {
    throw new Error("Enter a valid USDC amount with up to 6 decimals.");
  }
  const amountUnits = parseUsdcAmountUnits(normalized);
  if (amountUnits <= 0n) {
    throw new Error("USDC amount must be greater than zero.");
  }
  return amountUnits;
}

function formatUsdcAmount(amountUnits: bigint): string {
  const whole = amountUnits / 1_000_000n;
  const fraction = (amountUnits % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
}

const treasureDigAmountUnits = parseUsdcAmountUnits(treasureDigAmountDisplay);
const stableHorsePriceUnits = parseUsdcAmountUnits(stableHorsePriceDisplay);
const treasurePayoutPercent = Math.max(0, Math.min(100, Number.parseInt(treasurePayoutPercentRaw, 10) || 99));

function payoutAmountAfterFee(amountUnits: bigint): bigint {
  if (amountUnits <= 0n) {
    return 0n;
  }
  return (amountUnits * BigInt(treasurePayoutPercent)) / 100n;
}

function getNearbyStable(playerId: number): { tileX: number; tileY: number } | null {
  const player = playerManager.players.get(playerId);
  if (!player) {
    return null;
  }
  const currentChunk = chunkManager.getChunkKeyForPlayer(player.id);
  if (!currentChunk) {
    return null;
  }
  const searchKeys = chunkManager.getNearbyChunkKeys(currentChunk, 4);
  const maxDistanceSq = STABLE_INTERACTION_RANGE * STABLE_INTERACTION_RANGE;
  let winner:
    | {
        worldX: number;
        worldY: number;
        distanceSq: number;
      }
    | null = null;

  const generatedStable = entitySystem.findNearestObjectOfType(
    ObjectType.Stable,
    player.x,
    player.y,
    searchKeys,
    maxDistanceSq
  );
  if (generatedStable) {
    winner = {
      worldX: generatedStable.x,
      worldY: generatedStable.y,
      distanceSq: sqrDistanceToStableFootprint(player.x, player.y, generatedStable.x, generatedStable.y)
    };
  }

  for (const object of liveEditorMap.data.objects ?? []) {
    if (object.type !== ObjectType.Stable) {
      continue;
    }
    const worldX = object.x * TILE_SIZE + TILE_SIZE / 2;
    const worldY = object.y * TILE_SIZE + TILE_SIZE / 2;
    const distanceSq = sqrDistanceToStableFootprint(player.x, player.y, worldX, worldY);
    if (distanceSq > maxDistanceSq) {
      continue;
    }
    if (!winner || distanceSq < winner.distanceSq) {
      winner = { worldX, worldY, distanceSq };
    }
  }

  if (!winner) {
    return null;
  }

  return {
    tileX: Math.floor(winner.worldX / TILE_SIZE),
    tileY: Math.floor(winner.worldY / TILE_SIZE)
  };
}

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function strip0x(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function dugTileFor(type: TileType): TileType | null {
  switch (type) {
    case TileType.Water:
      return null;
    case TileType.Grass:
      return TileType.GrassDug;
    case TileType.Dirt:
      return TileType.DirtDug;
    case TileType.Forest:
      return TileType.ForestDug;
    case TileType.Stone:
      return TileType.StoneDug;
    case TileType.Hill:
      return TileType.HillDug;
    case TileType.GrassDug:
    case TileType.DirtDug:
    case TileType.ForestDug:
    case TileType.StoneDug:
    case TileType.HillDug:
      return type;
    default:
      return TileType.GrassDug;
  }
}

async function baseRpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(baseRpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params
    })
  });
  const payload = (await response.json()) as { result?: T; error?: { message?: string } };
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? `RPC ${method} failed.`);
  }
  return payload.result as T;
}

function getPlayerTile(playerId: number): { tileX: number; tileY: number; currentType: TileType } | null {
  const player = playerManager.players.get(playerId);
  if (!player) {
    return null;
  }
  const tileX = Math.max(0, Math.min(WORLD_WIDTH_TILES - 1, Math.floor(player.x / TILE_SIZE)));
  const tileY = Math.max(0, Math.min(WORLD_HEIGHT_TILES - 1, Math.floor(player.y / TILE_SIZE)));
  return {
    tileX,
    tileY,
    currentType: worldState.getTileType(tileX, tileY)
  };
}

function decodeTransferInput(input: string): { recipient: string; amount: bigint } | null {
  if (!input.startsWith(ERC20_TRANSFER_SELECTOR)) {
    return null;
  }
  const hex = strip0x(input);
  if (hex.length < 8 + 64 + 64) {
    return null;
  }
  const recipientWord = hex.slice(8, 8 + 64);
  const amountWord = hex.slice(8 + 64, 8 + 64 + 64);
  return {
    recipient: normalizeAddress(`0x${recipientWord.slice(24)}`),
    amount: BigInt(`0x${amountWord}`)
  };
}

function decodeAddressTopic(topic: string | undefined): string | null {
  const normalized = strip0x(topic ?? "");
  if (!/^[a-fA-F0-9]{64}$/.test(normalized)) {
    return null;
  }
  return normalizeAddress(`0x${normalized.slice(24)}`);
}

function hasMatchingUsdcTransferLog(
  logs: Array<{ address?: string; topics?: string[]; data?: string }> | undefined,
  payer: string,
  recipient: string,
  expectedAmountUnits: bigint
): boolean {
  const normalizedPayer = normalizeAddress(payer);
  const normalizedRecipient = normalizeAddress(recipient);

  for (const log of logs ?? []) {
    if (normalizeAddress(log.address ?? "") !== normalizeAddress(treasureUsdcAddress)) {
      continue;
    }
    const topics = log.topics ?? [];
    if (normalizeAddress(topics[0] ?? "") !== ERC20_TRANSFER_TOPIC) {
      continue;
    }
    const from = decodeAddressTopic(topics[1]);
    const to = decodeAddressTopic(topics[2]);
    if (!from || !to) {
      continue;
    }
    let amount = 0n;
    try {
      amount = BigInt(log.data ?? "0x0");
    } catch {
      continue;
    }
    if (from === normalizedPayer && to === normalizedRecipient && amount === expectedAmountUnits) {
      return true;
    }
  }

  return false;
}

async function verifyTreasurePayment(txHash: string, payer: string, expectedAmountUnits: bigint): Promise<void> {
  const tx = await baseRpc<{ to?: string; from?: string; input?: string } | null>("eth_getTransactionByHash", [txHash]);
  const receipt = await baseRpc<{ status?: string; logs?: Array<{ address?: string; topics?: string[]; data?: string }> } | null>("eth_getTransactionReceipt", [txHash]);
  const chainIdHex = await baseRpc<string>("eth_chainId", []);

  if (!tx || !receipt || receipt.status !== "0x1") {
    throw new Error("Base transaction is not confirmed.");
  }
  if (Number.parseInt(chainIdHex, 16) !== BASE_CHAIN_ID) {
    throw new Error("RPC endpoint is not Base mainnet.");
  }
  const normalizedPayer = normalizeAddress(payer);
  const normalizedRecipient = normalizeAddress(treasureRecipient);
  const decoded = decodeTransferInput(tx.input ?? "");
  const directTransferMatches =
    normalizeAddress(tx.to ?? "") === normalizeAddress(treasureUsdcAddress) &&
    normalizeAddress(tx.from ?? "") === normalizedPayer &&
    decoded !== null &&
    decoded.recipient === normalizedRecipient &&
    decoded.amount === expectedAmountUnits;

  if (directTransferMatches) {
    return;
  }

  if (hasMatchingUsdcTransferLog(receipt.logs, normalizedPayer, normalizedRecipient, expectedAmountUnits)) {
    return;
  }

  throw new Error("No matching Base USDC transfer to the treasure wallet was found in this transaction.");
}

function describeTreasureFound(result: {
  seededFound: boolean;
  buriedCount: number;
  buriedAmountUnits: bigint;
}): string {
  if (result.seededFound && result.buriedCount > 0) {
    return `Treasure found. You uncovered the hidden cache plus ${result.buriedCount} buried player stash worth ${formatUsdcAmount(result.buriedAmountUnits)} USDC.`;
  }
  if (result.buriedCount > 0) {
    return `Treasure found. You uncovered ${result.buriedCount} buried player stash worth ${formatUsdcAmount(result.buriedAmountUnits)} USDC.`;
  }
  return "Treasure found. The buried cache was real.";
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(`${JSON.stringify(payload)}\n`);
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
  await Promise.all([editorMapReady, treasureStateReady]);
  const patches: EditorPatch[] = [];

  liveEditorMap.data.ground = liveEditorMap.data.ground.map((item) => {
    const baseType = baseTileForDug(item.type as TileType);
    if (baseType === null) {
      return item;
    }
    patches.push({ kind: "ground", x: item.x, y: item.y, tileType: baseType });
    return { ...item, type: baseType };
  });

  if (patches.length > 0) {
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
  }

  await resetTreasureStateNow();

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

function broadcastPlayerChat(playerId: number, text: string): boolean {
  const message = playerManager.pushChatMessage(playerId, text);
  if (!message) {
    return false;
  }

  const player = playerManager.players.get(playerId);
  if (!player) {
    return false;
  }

  const packet = encodeChat(playerId, message.expiresAt - Date.now(), message.text);
  const recipients = new Set<number>([playerId, ...player.visiblePlayers]);
  console.log("[chat] broadcast", { playerId, recipients: [...recipients], text });
  for (const id of recipients) {
    const recipient = playerManager.players.get(id);
    if (recipient?.socket.readyState === 1) {
      recipient.socket.send(packet);
    }
  }
  return true;
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
  const socketAddress = (socket as unknown as { _socket?: { remoteAddress?: string } })._socket?.remoteAddress;
  const player = playerManager.createPlayer(socket, isLoopbackAddress(socketAddress));

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
      onlineCount: playerManager.players.size,
      appearance: player.appearance
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

      if (getNearbyStable(player.id)) {
        socket.send(encodeInteraction(0, ObjectType.Stable, 16));
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
        if (!mapMakerEnabled) {
          return;
        }
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
      if (!mapMakerEnabled || !mapMakerConsoleOpen || !player.isLocalAdminClient) {
        return;
      }
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
      console.log("[chat] ws packet", { playerId: player.id, text: chat.text });
      broadcastPlayerChat(player.id, chat.text);
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
      console.log(`Cleared ${cleared} dug tiles and reset treasure state.`);
      return;
    }
    if (command === "map-maker on") {
      mapMakerConsoleOpen = true;
      console.log("Map maker opened for localhost admin clients.");
      return;
    }
    if (command === "map-maker off") {
      mapMakerConsoleOpen = false;
      console.log("Map maker closed.");
      return;
    }
    if (command.length > 0) {
      console.log(`Unknown server command: ${command}`);
    }
  });
}
