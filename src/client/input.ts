import { InputFlag } from "../shared/protocol";

const KEY_TO_FLAG: Record<string, number> = {
  KeyW: InputFlag.Up,
  KeyS: InputFlag.Down,
  KeyA: InputFlag.Left,
  KeyD: InputFlag.Right
};

export class InputController {
  private pressed = new Set<string>();
  private movementFocusResetQueued = false;
  private interactQueued = false;
  private chatToggleQueued = false;
  private buryToggleQueued = false;
  private mountToggleQueued = false;
  private digQueued = false;
  private textEntryActive = false;
  private digEnabled = true;
  private uiBlocked = false;

  constructor() {
    window.addEventListener("keydown", (event) => {
      const target = event.target;
      const editingText =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (this.uiBlocked) {
        event.preventDefault();
        return;
      }

      if (event.code === "KeyY" && !event.repeat && !editingText) {
        this.chatToggleQueued = true;
        event.preventDefault();
        return;
      }
      if (event.code === "KeyF" && !event.repeat && !editingText) {
        this.buryToggleQueued = true;
        event.preventDefault();
        return;
      }

      if (this.textEntryActive || editingText) {
        return;
      }

      if (event.code in KEY_TO_FLAG) {
        if (!event.repeat && !this.pressed.has(event.code)) {
          this.movementFocusResetQueued = true;
        }
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
    if (this.textEntryActive || this.uiBlocked) {
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

  consumeMovementFocusReset(): boolean {
    const queued = this.movementFocusResetQueued;
    this.movementFocusResetQueued = false;
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

  consumeBuryToggle(): boolean {
    const queued = this.buryToggleQueued;
    this.buryToggleQueued = false;
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
      this.movementFocusResetQueued = false;
      this.buryToggleQueued = false;
      this.digQueued = false;
    }
  }

  setDigEnabled(enabled: boolean): void {
    this.digEnabled = enabled;
    if (!enabled) {
      this.digQueued = false;
    }
  }

  setUiBlocked(active: boolean): void {
    this.uiBlocked = active;
    if (active) {
      this.pressed.clear();
      this.movementFocusResetQueued = false;
      this.interactQueued = false;
      this.chatToggleQueued = false;
      this.buryToggleQueued = false;
      this.mountToggleQueued = false;
      this.digQueued = false;
    }
  }

  setVirtualDirection(code: keyof typeof KEY_TO_FLAG, active: boolean): void {
    if (!(code in KEY_TO_FLAG)) {
      return;
    }
    if (active) {
      if (!this.pressed.has(code)) {
        this.movementFocusResetQueued = true;
      }
      this.pressed.add(code);
      return;
    }
    this.pressed.delete(code);
  }

  queueVirtualInteract(): void {
    if (this.uiBlocked || this.textEntryActive) {
      return;
    }
    this.interactQueued = true;
  }

  queueVirtualMountToggle(): void {
    if (this.uiBlocked || this.textEntryActive) {
      return;
    }
    this.mountToggleQueued = true;
  }

  queueVirtualBuryToggle(): void {
    if (this.uiBlocked) {
      return;
    }
    this.buryToggleQueued = true;
  }

  queueVirtualChatToggle(): void {
    if (this.uiBlocked) {
      return;
    }
    this.chatToggleQueued = true;
  }

  queueVirtualDig(): void {
    if (this.uiBlocked || this.textEntryActive || !this.digEnabled) {
      return;
    }
    this.digQueued = true;
  }
}
