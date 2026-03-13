import { TileType, WORLD_HEIGHT_TILES, WORLD_SEED, WORLD_WIDTH_TILES } from "../shared/protocol";
import type { PersistedTreasureState } from "./treasure_store";

interface DigSession {
  id: string;
  playerId: number;
  tileX: number;
  tileY: number;
  createdAt: number;
  expiresAt: number;
}

export interface TreasureClaimResult {
  found: boolean;
  alreadyClaimed: boolean;
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

export class TreasureManager {
  private readonly treasureTiles = new Set<string>();
  private readonly claimedTiles = new Map<string, PersistedTreasureState["claimed"][number]>();
  private readonly usedTxHashes = new Set<string>();
  private readonly sessions = new Map<string, DigSession>();

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
    for (const txHash of persisted.usedTxHashes) {
      this.usedTxHashes.add(txHash.toLowerCase());
    }
  }

  prepareDig(playerId: number, tileX: number, tileY: number): DigSession {
    const id = `dig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const session: DigSession = {
      id,
      playerId,
      tileX,
      tileY,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000
    };
    this.sessions.set(id, session);
    return session;
  }

  consumeSession(id: string, playerId: number): DigSession | null {
    const session = this.sessions.get(id);
    if (!session) {
      return null;
    }
    if (session.playerId !== playerId || session.expiresAt < Date.now()) {
      this.sessions.delete(id);
      return null;
    }
    this.sessions.delete(id);
    return session;
  }

  isTreasureTile(tileX: number, tileY: number): TreasureClaimResult {
    const key = tileKey(tileX, tileY);
    if (!this.treasureTiles.has(key)) {
      return { found: false, alreadyClaimed: false };
    }
    return { found: !this.claimedTiles.has(key), alreadyClaimed: this.claimedTiles.has(key) };
  }

  isTxUsed(txHash: string): boolean {
    return this.usedTxHashes.has(txHash.toLowerCase());
  }

  claimTreasure(tileX: number, tileY: number, txHash: string, payer: string): TreasureClaimResult {
    const key = tileKey(tileX, tileY);
    const existing = this.claimedTiles.get(key);
    this.usedTxHashes.add(txHash.toLowerCase());

    if (!this.treasureTiles.has(key)) {
      return { found: false, alreadyClaimed: false };
    }
    if (existing) {
      return { found: false, alreadyClaimed: true };
    }

    this.claimedTiles.set(key, {
      x: tileX,
      y: tileY,
      txHash: txHash.toLowerCase(),
      payer: payer.toLowerCase(),
      claimedAt: new Date().toISOString()
    });
    return { found: true, alreadyClaimed: false };
  }

  exportState(): PersistedTreasureState {
    return {
      revision: 0,
      updatedAt: new Date().toISOString(),
      claimed: [...this.claimedTiles.values()].sort((a, b) => (a.y - b.y) || (a.x - b.x)),
      usedTxHashes: [...this.usedTxHashes].sort()
    };
  }
}
