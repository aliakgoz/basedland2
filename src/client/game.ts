import { AnimationState, Direction, InputFlag, MOUNT_SPEED_MULTIPLIER, PLAYER_SPEED, TILE_SIZE } from "../shared/protocol";
import { isWalkableTile } from "../shared/worldgen";
import { AssetManager } from "./assets";
import { pruneExpiredOverheadMessages } from "./entity";
import { InputController } from "./input";
import { MapEditor } from "./map_editor";
import { NetworkClient } from "./network";
import { Renderer } from "./renderer";
import { TreasureClient } from "./treasure";
import { WorldState } from "./world";

declare const __BASEDLAND_MAP_EDITOR_ENABLED__: boolean;

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const introOverlay = document.querySelector<HTMLElement>("#intro-overlay");
const online = document.querySelector<HTMLElement>("#online");
const message = document.querySelector<HTMLElement>("#message");
const chatPanel = document.querySelector<HTMLElement>("#chat-panel");
const chatForm = document.querySelector<HTMLFormElement>("#chat-form");
const chatInput = document.querySelector<HTMLInputElement>("#chat-input");
const buryPanel = document.querySelector<HTMLElement>("#bury-panel");
const buryForm = document.querySelector<HTMLFormElement>("#bury-form");
const buryAmount = document.querySelector<HTMLInputElement>("#bury-amount");
const walletConnect = document.querySelector<HTMLButtonElement>("#wallet-connect");
const walletStatus = document.querySelector<HTMLElement>("#wallet-status");
const walletDisconnect = document.querySelector<HTMLButtonElement>("#wallet-disconnect");
const treasureSummaryAmount = document.querySelector<HTMLElement>("#treasure-summary-amount");
const treasureSummaryCount = document.querySelector<HTMLElement>("#treasure-summary-count");
const editorToggle = document.querySelector<HTMLElement>("#editor-toggle");
const editorDock = document.querySelector<HTMLElement>("#editor-dock");

if (!canvas || !introOverlay || !online || !message || !chatPanel || !chatForm || !chatInput || !buryPanel || !buryForm || !buryAmount || !walletConnect || !walletStatus || !walletDisconnect || !treasureSummaryAmount || !treasureSummaryCount) {
  throw new Error("HUD elements missing");
}

const assets = new AssetManager();
const renderer = new Renderer(canvas, { online, message }, assets);
const input = new InputController();
const world = new WorldState();
const network = new NetworkClient();
const editor = __BASEDLAND_MAP_EDITOR_ENABLED__
  ? new MapEditor(assets, world, renderer, canvas, () => network.localPlayer, (patch) => network.sendEditorPatch(patch))
  : null;
const treasure = new TreasureClient(
  () => network.localPlayer,
  (text) => renderer.setMessage(text),
  (label, connected, busy) => {
    walletStatus.textContent = busy ? `${label}...` : label;
    walletConnect.textContent = connected ? "Wallet Ready" : "Connect Wallet";
    walletConnect.disabled = busy;
    walletDisconnect.disabled = busy;
    walletDisconnect.classList.toggle("visible", connected);
  }
);

renderer.setMessage("Loading pixel assets...");
assets.loadGeneratedOverrides().then(() => {
  if (!editor) {
    if (!network.isConnected()) {
      renderer.setMessage("Assets ready. Connecting...");
    }
    return;
  }
  void editor.initialize().then(() => {
    editor.refreshPalette();
    if (!network.isConnected()) {
      renderer.setMessage("Assets ready. Connecting...");
    }
  });
});

network.onMessage = (text) => renderer.setMessage(text);
network.onOnline = (count) => renderer.setOnline(count);
network.connect(world);

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.12 : -0.12;
    renderer.setZoom(renderer.getZoom() + delta);
  },
  { passive: false }
);

let inputSeq = 0;
let lastInputSend = 0;
let lastInputMask = -1;
let previousFrame = performance.now();
const EDITOR_CAMERA_MULTIPLIER = 20;
const TREASURE_SUMMARY_REFRESH_MS = 10000;
let chatOpen = false;
let buryOpen = false;
let introVisible = true;

interface TreasureSummaryResponse {
  pointCount: number;
  totalAmountUnits: string;
  totalAmountDisplay: string;
}

function dismissIntro(): void {
  if (!introVisible) {
    return;
  }
  introVisible = false;
  introOverlay.classList.remove("active");
  input.setUiBlocked(false);
}

async function refreshTreasureSummary(): Promise<void> {
  try {
    const response = await fetch("/api/treasure/stats", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as TreasureSummaryResponse;
    treasureSummaryAmount.textContent = payload.totalAmountDisplay;
    treasureSummaryCount.textContent = `${payload.pointCount} hidden ${payload.pointCount === 1 ? "point" : "points"}`;
  } catch {
    // Ignore transient fetch failures.
  }
}

function syncTextEntryState(): void {
  input.setTextEntryActive(chatOpen || buryOpen);
}

function setChatOpen(next: boolean): void {
  chatOpen = next;
  if (next) {
    buryOpen = false;
    buryPanel.classList.remove("active");
    buryAmount.blur();
  }
  chatPanel.classList.toggle("active", next);
  syncTextEntryState();
  if (next) {
    chatInput.focus();
    chatInput.select();
  } else {
    chatInput.blur();
    chatInput.value = "";
  }
}

function setBuryOpen(next: boolean): void {
  buryOpen = next;
  if (next) {
    chatOpen = false;
    chatPanel.classList.remove("active");
    chatInput.blur();
    chatInput.value = "";
  }
  buryPanel.classList.toggle("active", next);
  syncTextEntryState();
  if (next) {
    buryAmount.focus();
    buryAmount.select();
  } else {
    buryAmount.blur();
    buryAmount.value = "";
  }
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (text.length === 0) {
    setChatOpen(false);
    return;
  }
  network.sendChat(text);
  setChatOpen(false);
});

chatInput.addEventListener("keydown", (event) => {
  if (event.code === "Escape") {
    event.preventDefault();
    setChatOpen(false);
  }
});

buryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = buryAmount.value.trim();
  if (amount.length === 0) {
    setBuryOpen(false);
    return;
  }
  setBuryOpen(false);
  void treasure.buryAtPlayerTile(amount);
});

buryAmount.addEventListener("keydown", (event) => {
  if (event.code === "Escape") {
    event.preventDefault();
    setBuryOpen(false);
  }
});

window.addEventListener("keydown", (event) => {
  if (introVisible) {
    if (!event.repeat) {
      dismissIntro();
    }
    event.preventDefault();
    return;
  }
  if (event.code === "Escape" && (chatOpen || buryOpen)) {
    event.preventDefault();
    setChatOpen(false);
    setBuryOpen(false);
  }
});

walletConnect.addEventListener("click", () => {
  void treasure.connectWallet();
});

walletDisconnect.addEventListener("click", () => {
  treasure.disconnectWallet();
});

introOverlay.addEventListener("pointerdown", () => {
  dismissIntro();
});

if (!__BASEDLAND_MAP_EDITOR_ENABLED__) {
  editorToggle?.remove();
  editorDock?.remove();
}

input.setUiBlocked(true);
void refreshTreasureSummary();
window.setInterval(() => {
  void refreshTreasureSummary();
}, TREASURE_SUMMARY_REFRESH_MS);

function applyLocalMovement(dt: number): void {
  if (introVisible) {
    return;
  }
  const player = network.localPlayer;
  if (input.consumeChatToggle()) {
    setChatOpen(!chatOpen);
  }
  if (input.consumeBuryToggle()) {
    setBuryOpen(!buryOpen);
  }
  if (!player) {
    return;
  }

  if (input.consumeMountToggle()) {
    network.sendToggleMount();
  }

  const mask = input.getMask();
  let dx = 0;
  let dy = 0;

  if ((mask & InputFlag.Up) !== 0) {
    dy -= 1;
    player.dir = Direction.Up;
  }
  if ((mask & InputFlag.Down) !== 0) {
    dy += 1;
    player.dir = Direction.Down;
  }
  if ((mask & InputFlag.Left) !== 0) {
    dx -= 1;
    player.dir = Direction.Left;
  }
  if ((mask & InputFlag.Right) !== 0) {
    dx += 1;
    player.dir = Direction.Right;
  }

  if (editor?.isEnabled()) {
    if (dx !== 0 || dy !== 0) {
      if (dx !== 0 && dy !== 0) {
        dx *= Math.SQRT1_2;
        dy *= Math.SQRT1_2;
      }
      renderer.nudgeManualCamera(dx * PLAYER_SPEED * EDITOR_CAMERA_MULTIPLIER * dt, dy * PLAYER_SPEED * EDITOR_CAMERA_MULTIPLIER * dt);
    }
    player.animation = AnimationState.Idle;
    if (input.consumeInteract()) {
      return;
    }
    input.consumeDig();
    return;
  }

  player.animation = dx === 0 && dy === 0 ? AnimationState.Idle : AnimationState.Walk;

  if (dx !== 0 || dy !== 0) {
    renderer.clearManualCamera();
  }

  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }

  const speed = PLAYER_SPEED * (player.mountedHorseVariant === null ? 1 : MOUNT_SPEED_MULTIPLIER);
  const nextX = player.x + dx * speed * dt;
  const nextY = player.y + dy * speed * dt;
  const tileX = Math.floor(nextX / TILE_SIZE);
  const tileY = Math.floor(nextY / TILE_SIZE);

  if (isWalkableTile(world.getTileType(tileX, tileY))) {
    player.x = nextX;
    player.y = nextY;
    player.targetX = nextX;
    player.targetY = nextY;
  }

  player.renderX += (player.x - player.renderX) * 0.42;
  player.renderY += (player.y - player.renderY) * 0.42;

  const now = performance.now();
  if (now - lastInputSend >= 100 || mask !== lastInputMask) {
    inputSeq = (inputSeq + 1) & 0xffff;
    network.sendInput(inputSeq, mask);
    lastInputSend = now;
    lastInputMask = mask;
  }

  if (input.consumeInteract()) {
    network.sendInteract();
  }

  if (input.consumeDig()) {
    void treasure.digAtPlayerTile();
  }
}

function updateRemotePlayers(): void {
  const now = performance.now();
  if (network.localPlayer) {
    pruneExpiredOverheadMessages(network.localPlayer, now);
  }
  for (const player of network.remotePlayers.values()) {
    pruneExpiredOverheadMessages(player, now);
    player.renderX += (player.targetX - player.renderX) * 0.22;
    player.renderY += (player.targetY - player.renderY) * 0.22;
  }
}

function frame(now: number): void {
  const dt = Math.min(0.05, (now - previousFrame) / 1000);
  previousFrame = now;

  applyLocalMovement(dt);
  updateRemotePlayers();

  renderer.render(
    world,
    network.localPlayer,
    [...network.remotePlayers.values()].sort((a, b) => a.y - b.y)
  );
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
