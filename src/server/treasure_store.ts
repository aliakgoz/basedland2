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
    payoutTxHash?: string;
    payoutTo?: string;
    payoutError?: string;
    payoutUpdatedAt?: string;
  }>;
  buried: Array<{
    id: string;
    x: number;
    y: number;
    amountUnits: string;
    buryTxHash: string;
    buriedBy: string;
    buriedAt: string;
    claimedAt?: string;
    claimedBy?: string;
    claimTxHash?: string;
    payoutTxHash?: string;
    payoutTo?: string;
    payoutError?: string;
    payoutUpdatedAt?: string;
  }>;
  usedTxHashes: string[];
}

const storePath = resolve(process.cwd(), "data", "treasure-state.json");
const backupRoot = resolve(process.cwd(), "data", "backups");

export function createEmptyTreasureState(): PersistedTreasureState {
  return {
    revision: 0,
    updatedAt: new Date(0).toISOString(),
    claimed: [],
    buried: [],
    usedTxHashes: []
  };
}

function backupFileNameFor(state: PersistedTreasureState): string {
  const stamp = state.updatedAt
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "")
    .replace("T", "-");
  return `treasure-state-${stamp}-r${state.revision.toString().padStart(6, "0")}.json`;
}

function parseBackupState(raw: string): PersistedTreasureState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedTreasureState>;
    return {
      revision: parsed.revision ?? 0,
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
      claimed: parsed.claimed ?? [],
      buried: parsed.buried ?? [],
      usedTxHashes: parsed.usedTxHashes ?? []
    };
  } catch {
    return null;
  }
}

export async function loadTreasureState(): Promise<PersistedTreasureState> {
  try {
    const raw = JSON.parse(await readFile(storePath, "utf8")) as Partial<PersistedTreasureState>;
    return {
      revision: raw.revision ?? 0,
      updatedAt: raw.updatedAt ?? new Date(0).toISOString(),
      claimed: raw.claimed ?? [],
      buried: raw.buried ?? [],
      usedTxHashes: raw.usedTxHashes ?? []
    };
  } catch {
    return createEmptyTreasureState();
  }
}

export async function saveTreasureState(state: PersistedTreasureState): Promise<PersistedTreasureState> {
  const next: PersistedTreasureState = {
    revision: state.revision + 1,
    updatedAt: new Date().toISOString(),
    claimed: state.claimed,
    buried: state.buried,
    usedTxHashes: state.usedTxHashes
  };
  const serialized = `${JSON.stringify(next, null, 2)}\n`;

  const existingRaw = await readFile(storePath, "utf8").catch(() => null);
  await mkdir(dirname(storePath), { recursive: true });
  await mkdir(backupRoot, { recursive: true });
  if (existingRaw !== null) {
    const previous = parseBackupState(existingRaw);
    const previousFile = previous
      ? backupFileNameFor(previous)
      : `treasure-state-prewrite-${Date.now()}.json`;
    await writeFile(resolve(backupRoot, previousFile), existingRaw.endsWith("\n") ? existingRaw : `${existingRaw}\n`, "utf8");
  }
  await writeFile(storePath, serialized, "utf8");
  await writeFile(resolve(backupRoot, backupFileNameFor(next)), serialized, "utf8");
  return next;
}
