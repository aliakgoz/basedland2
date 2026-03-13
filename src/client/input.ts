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
  private chatToggleQueued = false;
  private mountToggleQueued = false;
  private digQueued = false;
  private textEntryActive = false;
  private digEnabled = true;

  constructor() {
    window.addEventListener("keydown", (event) => {
      const target = event.target;
      const editingText =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (event.code === "KeyY" && !event.repeat && !editingText) {
        this.chatToggleQueued = true;
        event.preventDefault();
        return;
      }

      if (this.textEntryActive || editingText) {
        return;
      }

      if (event.code in KEY_TO_FLAG) {
        this.pressed.add(event.code);
      }
      if (event.code === "KeyE" && !event.repeat) {
        this.interactQueued = true;
      }
      if (event.code === "KeyH" && !event.repeat) {
        this.mountToggleQueued = true;
      }
      if (this.digEnabled && event.code === "Space" && !event.repeat) {
        this.digQueued = true;
        event.preventDefault();
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
    if (this.textEntryActive) {
      return 0;
    }
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

  consumeChatToggle(): boolean {
    const queued = this.chatToggleQueued;
    this.chatToggleQueued = false;
    return queued;
  }

  consumeMountToggle(): boolean {
    const queued = this.mountToggleQueued;
    this.mountToggleQueued = false;
    return queued;
  }

  consumeDig(): boolean {
    const queued = this.digQueued;
    this.digQueued = false;
    return queued;
  }

  setTextEntryActive(active: boolean): void {
    this.textEntryActive = active;
    if (active) {
      this.pressed.clear();
      this.digQueued = false;
    }
  }

  setDigEnabled(enabled: boolean): void {
    this.digEnabled = enabled;
    if (!enabled) {
      this.digQueued = false;
    }
  }
}
