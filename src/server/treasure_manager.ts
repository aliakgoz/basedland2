import { TileType, WORLD_HEIGHT_TILES, WORLD_SEED, WORLD_WIDTH_TILES } from "../shared/protocol";
import type { PersistedTreasureState } from "./treasure_store";

interface DigSession {
  id: string;
  kind: "dig";
  playerId: number;
  tileX: number;
  tileY: number;
  createdAt: number;
  expiresAt: number;
}

interface BurySession {
  id: string;
  kind: "bury";
  playerId: number;
  tileX: number;
  tileY: number;
  amountUnits: bigint;
  createdAt: number;
  expiresAt: number;
}

export interface TreasureClaimResult {
  found: boolean;
  alreadyClaimed: boolean;
  seededFound: boolean;
  buriedCount: number;
  buriedAmountUnits: bigint;
}

export interface BuriedTreasureResult {
  amountUnits: bigint;
}

export interface ActiveBuriedSummary {
  pointCount: number;
  totalAmountUnits: bigint;
}

function hash(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function hash2d(seed: number, x: number, y: number): number {
  return hash(seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263));
}

function hashString(value: string): number {
  let acc = 0;
  for (let index = 0; index < value.length; index += 1) {
    acc = hash(acc ^ value.charCodeAt(index) ^ (index * 2654435761));
  }
  return acc;
}

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function sessionId(prefix: "dig" | "bury"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class TreasureManager {
  private readonly treasureTiles = new Set<string>();
  private readonly claimedTiles = new Map<string, PersistedTreasureState["claimed"][number]>();
  private readonly buriedTreasures = new Map<string, PersistedTreasureState["buried"][number][]>();
  private readonly usedTxHashes = new Set<string>();
  private readonly digSessions = new Map<string, DigSession>();
  private readonly burySessions = new Map<string, BurySession>();

  constructor(
    private readonly getTileType: (tileX: number, tileY: number) => TileType,
    secretSalt: string,
    treasureCount: number,
    persisted: PersistedTreasureState
  ) {
    const secretSeed = hash(WORLD_SEED ^ hashString(secretSalt));
    let ordinal = 0;
    let attempts = 0;

    while (this.treasureTiles.size < treasureCount && attempts < treasureCount * 20) {
      const x = 8 + (hash2d(secretSeed, ordinal, 17) % (WORLD_WIDTH_TILES - 16));
      const y = 8 + (hash2d(secretSeed, ordinal, 43) % (WORLD_HEIGHT_TILES - 16));
      attempts += 1;
      ordinal += 1;

      const type = this.getTileType(x, y);
      if (type === TileType.Water) {
        continue;
      }
      this.treasureTiles.add(tileKey(x, y));
    }

    for (const entry of persisted.claimed) {
      this.claimedTiles.set(tileKey(entry.x, entry.y), entry);
    }
    for (const entry of persisted.buried) {
      const key = tileKey(entry.x, entry.y);
      const list = this.buriedTreasures.get(key);
      if (list) {
        list.push(entry);
      } else {
        this.buriedTreasures.set(key, [entry]);
      }
    }
    for (const txHash of persisted.usedTxHashes) {
      this.usedTxHashes.add(txHash.toLowerCase());
    }
  }

  prepareDig(playerId: number, tileX: number, tileY: number): DigSession {
    const session: DigSession = {
      id: sessionId("dig"),
      kind: "dig",
      playerId,
      tileX,
      tileY,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000
    };
    this.digSessions.set(session.id, session);
    return session;
  }

  prepareBury(playerId: number, tileX: number, tileY: number, amountUnits: bigint): BurySession {
    const session: BurySession = {
      id: sessionId("bury"),
      kind: "bury",
      playerId,
      tileX,
      tileY,
      amountUnits,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000
    };
    this.burySessions.set(session.id, session);
    return session;
  }

  consumeDigSession(id: string, playerId: number): DigSession | null {
    const session = this.digSessions.get(id);
    if (!session) {
      return null;
    }
    if (session.playerId !== playerId || session.expiresAt < Date.now()) {
      this.digSessions.delete(id);
      return null;
    }
    this.digSessions.delete(id);
    return session;
  }

  consumeBurySession(id: string, playerId: number): BurySession | null {
    const session = this.burySessions.get(id);
    if (!session) {
      return null;
    }
    if (session.playerId !== playerId || session.expiresAt < Date.now()) {
      this.burySessions.delete(id);
      return null;
    }
    this.burySessions.delete(id);
    return session;
  }

  isTxUsed(txHash: string): boolean {
    return this.usedTxHashes.has(txHash.toLowerCase());
  }

  claimTreasure(tileX: number, tileY: number, txHash: string, payer: string): TreasureClaimResult {
    const key = tileKey(tileX, tileY);
    const seededClaim = this.claimedTiles.get(key);
    const buried = this.buriedTreasures.get(key) ?? [];
    const newlyClaimedBuried = buried.filter((entry) => !entry.claimedAt);
    const hadClaimedBuried = buried.some((entry) => Boolean(entry.claimedAt));
    let buriedAmountUnits = 0n;

    for (const entry of newlyClaimedBuried) {
      buriedAmountUnits += BigInt(entry.amountUnits);
      entry.claimedAt = new Date().toISOString();
      entry.claimedBy = payer.toLowerCase();
      entry.claimTxHash = txHash.toLowerCase();
    }

    const seededFound = this.treasureTiles.has(key) && !seededClaim;
    this.usedTxHashes.add(txHash.toLowerCase());

    if (seededFound) {
      this.claimedTiles.set(key, {
        x: tileX,
        y: tileY,
        txHash: txHash.toLowerCase(),
        payer: payer.toLowerCase(),
        claimedAt: new Date().toISOString()
      });
    }

    const found = seededFound || newlyClaimedBuried.length > 0;
    if (!found) {
      return {
        found: false,
        alreadyClaimed: (this.treasureTiles.has(key) && Boolean(seededClaim)) || hadClaimedBuried,
        seededFound: false,
        buriedCount: 0,
        buriedAmountUnits: 0n
      };
    }

    return {
      found: true,
      alreadyClaimed: false,
      seededFound,
      buriedCount: newlyClaimedBuried.length,
      buriedAmountUnits
    };
  }

  recordClaimPayout(tileX: number, tileY: number, digTxHash: string, payoutTxHash: string, payoutTo: string): void {
    const key = tileKey(tileX, tileY);
    const claimed = this.claimedTiles.get(key);
    const now = new Date().toISOString();
    if (claimed && claimed.txHash === digTxHash.toLowerCase()) {
      claimed.payoutTxHash = payoutTxHash.toLowerCase();
      claimed.payoutTo = payoutTo.toLowerCase();
      claimed.payoutError = undefined;
      claimed.payoutUpdatedAt = now;
    }

    const buried = this.buriedTreasures.get(key) ?? [];
    for (const entry of buried) {
      if (entry.claimTxHash === digTxHash.toLowerCase()) {
        entry.payoutTxHash = payoutTxHash.toLowerCase();
        entry.payoutTo = payoutTo.toLowerCase();
        entry.payoutError = undefined;
        entry.payoutUpdatedAt = now;
      }
    }
  }

  recordClaimPayoutFailure(tileX: number, tileY: number, digTxHash: string, payoutTo: string, error: string): void {
    const key = tileKey(tileX, tileY);
    const claimed = this.claimedTiles.get(key);
    const now = new Date().toISOString();
    if (claimed && claimed.txHash === digTxHash.toLowerCase()) {
      claimed.payoutTo = payoutTo.toLowerCase();
      claimed.payoutError = error;
      claimed.payoutUpdatedAt = now;
    }

    const buried = this.buriedTreasures.get(key) ?? [];
    for (const entry of buried) {
      if (entry.claimTxHash === digTxHash.toLowerCase()) {
        entry.payoutTo = payoutTo.toLowerCase();
        entry.payoutError = error;
        entry.payoutUpdatedAt = now;
      }
    }
  }

  buryTreasure(tileX: number, tileY: number, amountUnits: bigint, txHash: string, payer: string): BuriedTreasureResult {
    const key = tileKey(tileX, tileY);
    const entry: PersistedTreasureState["buried"][number] = {
      id: `cache_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      x: tileX,
      y: tileY,
      amountUnits: amountUnits.toString(),
      buryTxHash: txHash.toLowerCase(),
      buriedBy: payer.toLowerCase(),
      buriedAt: new Date().toISOString()
    };
    const list = this.buriedTreasures.get(key);
    if (list) {
      list.push(entry);
    } else {
      this.buriedTreasures.set(key, [entry]);
    }
    this.usedTxHashes.add(txHash.toLowerCase());
    return { amountUnits };
  }

  getActiveBuriedSummary(): ActiveBuriedSummary {
    const activeTileKeys = new Set<string>();
    let totalAmountUnits = 0n;

    for (const [key, entries] of this.buriedTreasures) {
      const activeEntries = entries.filter((entry) => !entry.claimedAt);
      if (activeEntries.length === 0) {
        continue;
      }
      activeTileKeys.add(key);
      for (const entry of activeEntries) {
        totalAmountUnits += BigInt(entry.amountUnits);
      }
    }

    return {
      pointCount: activeTileKeys.size,
      totalAmountUnits
    };
  }

  exportState(): PersistedTreasureState {
    return {
      revision: 0,
      updatedAt: new Date().toISOString(),
      claimed: [...this.claimedTiles.values()].sort((a, b) => (a.y - b.y) || (a.x - b.x)),
      buried: [...this.buriedTreasures.values()]
        .flat()
        .sort((a, b) => (a.y - b.y) || (a.x - b.x) || a.buriedAt.localeCompare(b.buriedAt)),
      usedTxHashes: [...this.usedTxHashes].sort()
    };
  }
}
