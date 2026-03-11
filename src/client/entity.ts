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

export function createPlayerEntity(id: number, x: number, y: number, isLocal: boolean): PlayerEntity {
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
    appearance: {},
    overheadMessages: []
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
  player.overheadMessages.push({
    text,
    expiresAt: now + ttlMs
  });
  if (player.overheadMessages.length > 6) {
    player.overheadMessages.splice(0, player.overheadMessages.length - 6);
  }
}
