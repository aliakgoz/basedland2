import { AnimationState, Direction, ObjectType } from "../shared/protocol";

export interface PlayerAppearance {
  hair?: number;
  primary?: number;
  secondary?: number;
  accent?: number;
  skin?: number;
  height?: number;
  build?: number;
  headSize?: number;
  armLength?: number;
  legLength?: number;
}

export interface PlayerEntity {
  id: number;
  x: number;
  y: number;
  renderX: number;
  renderY: number;
  targetX: number;
  targetY: number;
  dir: Direction;
  animation: AnimationState;
  isLocal: boolean;
  appearance: PlayerAppearance;
  overheadMessages: OverheadMessage[];
  mountedHorseVariant: number | null;
}

export interface OverheadMessage {
  text: string;
  expiresAt: number;
}

export interface StaticProp {
  id: number;
  type: ObjectType;
  x: number;
  y: number;
  variant?: number;
  editorPlaced?: boolean;
}

export function createPlayerEntity(id: number, x: number, y: number, isLocal: boolean, appearance: PlayerAppearance = {}): PlayerEntity {
  return {
    id,
    x,
    y,
    renderX: x,
    renderY: y,
    targetX: x,
    targetY: y,
    dir: Direction.Down,
    animation: AnimationState.Idle,
    isLocal,
    appearance: { ...appearance },
    overheadMessages: [],
    mountedHorseVariant: null
  };
}

export function pruneExpiredOverheadMessages(player: PlayerEntity, now: number): void {
  if (player.overheadMessages.length === 0) {
    return;
  }
  player.overheadMessages = player.overheadMessages.filter((message) => message.expiresAt > now);
}

export function pushOverheadMessage(player: PlayerEntity, text: string, ttlMs: number, now: number): void {
  pruneExpiredOverheadMessages(player, now);
  const nextExpiresAt = now + ttlMs;
  const latest = player.overheadMessages[player.overheadMessages.length - 1];
  if (latest && latest.text === text && Math.abs(latest.expiresAt - nextExpiresAt) <= 1000) {
    latest.expiresAt = Math.max(latest.expiresAt, nextExpiresAt);
    return;
  }
  player.overheadMessages.push({
    text,
    expiresAt: nextExpiresAt
  });
  if (player.overheadMessages.length > 6) {
    player.overheadMessages.splice(0, player.overheadMessages.length - 6);
  }
}
