import { AnimationState, Direction, ObjectType } from "../shared/protocol";

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
    isLocal
  };
}
