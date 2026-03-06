import { InputFlag } from "../shared/protocol";

const KEY_TO_FLAG: Record<string, number> = {
  KeyW: InputFlag.Up,
  KeyS: InputFlag.Down,
  KeyA: InputFlag.Left,
  KeyD: InputFlag.Right
};

export class InputController {
  private pressed = new Set<string>();
  private interactQueued = false;

  constructor() {
    window.addEventListener("keydown", (event) => {
      if (event.code in KEY_TO_FLAG) {
        this.pressed.add(event.code);
      }
      if (event.code === "KeyE" && !event.repeat) {
        this.interactQueued = true;
      }
    });

    window.addEventListener("keyup", (event) => {
      if (event.code in KEY_TO_FLAG) {
        this.pressed.delete(event.code);
      }
    });

    window.addEventListener("blur", () => {
      this.pressed.clear();
    });
  }

  getMask(): number {
    let mask = 0;
    for (const key of this.pressed) {
      mask |= KEY_TO_FLAG[key] ?? 0;
    }
    return mask;
  }

  consumeInteract(): boolean {
    const queued = this.interactQueued;
    this.interactQueued = false;
    return queued;
  }
}
