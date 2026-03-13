import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface PersistedTreasureState {
  revision: number;
  updatedAt: string;
  claimed: Array<{
    x: number;
    y: number;
    txHash: string;
    payer: string;
    claimedAt: string;
  }>;
  usedTxHashes: string[];
}

const storePath = resolve(process.cwd(), "data", "treasure-state.json");

function emptyStore(): PersistedTreasureState {
  return {
    revision: 0,
    updatedAt: new Date(0).toISOString(),
    claimed: [],
    usedTxHashes: []
  };
}

export async function loadTreasureState(): Promise<PersistedTreasureState> {
  try {
    const raw = JSON.parse(await readFile(storePath, "utf8")) as Partial<PersistedTreasureState>;
    return {
      revision: raw.revision ?? 0,
      updatedAt: raw.updatedAt ?? new Date(0).toISOString(),
      claimed: raw.claimed ?? [],
      usedTxHashes: raw.usedTxHashes ?? []
    };
  } catch {
    return emptyStore();
  }
}

export async function saveTreasureState(state: PersistedTreasureState): Promise<PersistedTreasureState> {
  const next: PersistedTreasureState = {
    revision: state.revision + 1,
    updatedAt: new Date().toISOString(),
    claimed: state.claimed,
    usedTxHashes: state.usedTxHashes
  };

  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
