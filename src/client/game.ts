import { AnimationState, CHAT_MESSAGE_TTL_MS, CHUNK_SIZE_TILES, Direction, InputFlag, MOUNT_RANGE, MOUNT_SPEED_MULTIPLIER, ObjectType, PLAYER_SPEED, TILE_SIZE } from "../shared/protocol";
import { EMPTY_EDITOR_MAP, type PersistedEditorMap } from "../shared/editor_map";
import { isWalkableTile } from "../shared/worldgen";
import { AssetManager } from "./assets";
import { backendUrl } from "./backend";
import { pruneExpiredOverheadMessages, pushOverheadMessage } from "./entity";
import { InputController } from "./input";
import { MapEditor } from "./map_editor";
import { BackgroundMusicPlayer } from "./music";
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
const chatSend = document.querySelector<HTMLButtonElement>("#chat-send");
const buryPanel = document.querySelector<HTMLElement>("#bury-panel");
const buryForm = document.querySelector<HTMLFormElement>("#bury-form");
const buryAmount = document.querySelector<HTMLInputElement>("#bury-amount");
const stablePanel = document.querySelector<HTMLElement>("#stable-panel");
const stableOptions = document.querySelectorAll<HTMLButtonElement>("[data-horse-variant]");
const walletMobilePanel = document.querySelector<HTMLElement>("#wallet-mobile-panel");
const mobileChatPanel = document.querySelector<HTMLElement>("#mobile-chat-panel");
const walletConnect = document.querySelector<HTMLButtonElement>("#wallet-connect");
const walletStatus = document.querySelector<HTMLElement>("#wallet-status");
const walletDisconnect = document.querySelector<HTMLButtonElement>("#wallet-disconnect");
const treasureSummaryAmount = document.querySelector<HTMLElement>("#treasure-summary-amount");
const treasureSummaryCount = document.querySelector<HTMLElement>("#treasure-summary-count");
const editorDock = document.querySelector<HTMLElement>("#editor-dock");
const chatClose = document.querySelector<HTMLButtonElement>("#chat-close");
const buryClose = document.querySelector<HTMLButtonElement>("#bury-close");
const stableClose = document.querySelector<HTMLButtonElement>("#stable-close");
const walletMobileClose = document.querySelector<HTMLButtonElement>("#wallet-mobile-close");
const walletOpenCoinbase = document.querySelector<HTMLButtonElement>("#wallet-open-coinbase");
const walletOpenMetamask = document.querySelector<HTMLButtonElement>("#wallet-open-metamask");
const mobileChatClose = document.querySelector<HTMLButtonElement>("#mobile-chat-close");
const mobileChatCancel = document.querySelector<HTMLButtonElement>("#mobile-chat-cancel");
const mobileChatSend = document.querySelector<HTMLButtonElement>("#mobile-chat-send");
const mobileChatInput = document.querySelector<HTMLTextAreaElement>("#mobile-chat-input");
const mobileControls = document.querySelector<HTMLElement>("#mobile-controls");
const mobileUp = document.querySelector<HTMLButtonElement>("#mobile-up");
const mobileDown = document.querySelector<HTMLButtonElement>("#mobile-down");
const mobileLeft = document.querySelector<HTMLButtonElement>("#mobile-left");
const mobileRight = document.querySelector<HTMLButtonElement>("#mobile-right");
const mobileChat = document.querySelector<HTMLButtonElement>("#mobile-chat");
const mobileInteract = document.querySelector<HTMLButtonElement>("#mobile-interact");
const mobileMount = document.querySelector<HTMLButtonElement>("#mobile-mount");
const mobileBury = document.querySelector<HTMLButtonElement>("#mobile-bury");
const mobileDig = document.querySelector<HTMLButtonElement>("#mobile-dig");

if (!canvas || !introOverlay || !online || !message || !chatPanel || !chatForm || !chatInput || !chatSend || !buryPanel || !buryForm || !buryAmount || !stablePanel || !walletMobilePanel || !mobileChatPanel || stableOptions.length === 0 || !walletConnect || !walletStatus || !walletDisconnect || !treasureSummaryAmount || !treasureSummaryCount || !chatClose || !buryClose || !stableClose || !walletMobileClose || !walletOpenCoinbase || !walletOpenMetamask || !mobileChatClose || !mobileChatCancel || !mobileChatSend || !mobileChatInput || !mobileControls || !mobileUp || !mobileDown || !mobileLeft || !mobileRight || !mobileChat || !mobileInteract || !mobileMount || !mobileBury || !mobileDig) {
  throw new Error("HUD elements missing");
}

const assets = new AssetManager();
const renderer = new Renderer(canvas, { online, message }, assets);
const input = new InputController();
const world = new WorldState();
const network = new NetworkClient();
const music = new BackgroundMusicPlayer();
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
  if (!network.isConnected()) {
    renderer.setMessage("Assets ready. Connecting...");
  }
});

network.onMessage = (text) => renderer.setMessage(text);
network.onOnline = (count) => renderer.setOnline(count);
network.onInteraction = (objectType, _action, text) => {
  if (objectType === ObjectType.Stable) {
    setStableOpen(true);
    renderer.setMessage("Stable ledger open. Choose your horse.");
    return;
  }
  renderer.setMessage(text);
};
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
let stableOpen = false;
let walletMobileOpen = false;
let mobileChatOpen = false;
let introVisible = true;
let lastManualCameraPrefetchKey = "";
let lastChatSubmitAt = 0;
let localChatPreview: { text: string; expiresAt: number } | null = null;
let chatDraft = "";

interface TreasureSummaryResponse {
  pointCount: number;
  totalAmountUnits: string;
  totalAmountDisplay: string;
}

interface StableNearbyResponse {
  nearby: boolean;
  stable?: { tileX: number; tileY: number };
}

interface EditorAccessResponse {
  enabled: boolean;
}

const CLIENT_STABLE_FALLBACK_RANGE = 480;
const EDITOR_ACCESS_REFRESH_MS = 3000;
let editorInitializationStarted = false;

function isLikelyMobile(): boolean {
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function mobileDappUrl(): string {
  return window.location.href;
}

function openCoinbaseWallet(): void {
  window.location.href = `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(mobileDappUrl())}`;
}

function openMetaMaskWallet(): void {
  const url = new URL(mobileDappUrl());
  const dappTarget = `${url.host}${url.pathname}${url.search}${url.hash}`;
  window.location.href = `https://metamask.app.link/dapp/${dappTarget}`;
}

function syncMobileControlsVisibility(): void {
  mobileControls.classList.toggle("panel-open", chatOpen || buryOpen || stableOpen || walletMobileOpen || mobileChatOpen);
}

async function loadInitialWorldLayer(): Promise<void> {
  try {
    const response = await fetch(backendUrl("/api/editor-map"), { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const persisted = (await response.json()) as PersistedEditorMap;
    world.importEditorLayer(persisted.data ?? EMPTY_EDITOR_MAP);
  } catch {
    // Ignore transient bootstrap failures; the base world still renders.
  }
}

function dismissIntro(): void {
  if (!introVisible) {
    return;
  }
  introVisible = false;
  introOverlay.classList.remove("active");
  input.setUiBlocked(false);
  music.activate();
}

async function refreshTreasureSummary(): Promise<void> {
  try {
    const response = await fetch(backendUrl("/api/treasure/stats"), { cache: "no-store" });
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

async function refreshEditorAccess(): Promise<void> {
  if (!editor) {
    return;
  }
  try {
    const response = await fetch(backendUrl("/api/editor-access"), { cache: "no-store" });
    if (!response.ok) {
      editor.setAdminAccess(false);
      return;
    }
    const payload = (await response.json()) as EditorAccessResponse;
    if (!payload.enabled) {
      editor.setAdminAccess(false);
      return;
    }
    if (!editorInitializationStarted) {
      editorInitializationStarted = true;
      await editor.initialize();
      editor.refreshPalette();
    }
    editor.setAdminAccess(true);
  } catch {
    editor.setAdminAccess(false);
  }
}

async function handleInteract(): Promise<void> {
  const player = network.localPlayer;
  if (!player) {
    return;
  }

  for (const object of world.getVisibleObjects(player.x, player.y, CLIENT_STABLE_FALLBACK_RANGE * 2, CLIENT_STABLE_FALLBACK_RANGE * 2)) {
    if (object.type !== ObjectType.Stable) {
      continue;
    }
    const dx = object.x - player.x;
    const dy = object.y - player.y;
    if (dx * dx + dy * dy <= CLIENT_STABLE_FALLBACK_RANGE * CLIENT_STABLE_FALLBACK_RANGE) {
      setStableOpen(true);
      renderer.setMessage("Stable ledger open. Choose your horse.");
      return;
    }
  }

  try {
    const response = await fetch(backendUrl("/api/stable/nearby"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: player.id })
    });
    if (response.ok) {
      const payload = (await response.json()) as StableNearbyResponse;
      if (payload.nearby) {
        setStableOpen(true);
        renderer.setMessage("Stable ledger open. Choose your horse.");
        return;
      }
    }
  } catch {
    // Fall through to default interaction packet if proximity check fails.
  }

  network.sendInteract();
}

function hasNearbyHorseForMount(): boolean {
  const player = network.localPlayer;
  if (!player) {
    return false;
  }
  const maxDistanceSq = MOUNT_RANGE * MOUNT_RANGE;
  for (const chunk of world.chunkObjects.values()) {
    for (const object of chunk) {
      if (object.type !== ObjectType.Horse) {
        continue;
      }
      const dx = object.x - player.x;
      const dy = object.y - player.y;
      if (dx * dx + dy * dy <= maxDistanceSq) {
        return true;
      }
    }
  }
  return false;
}

function syncTextEntryState(): void {
  input.setTextEntryActive(chatOpen || buryOpen || stableOpen || walletMobileOpen || mobileChatOpen);
}

function setChatOpen(next: boolean): void {
  chatOpen = next;
  if (next) {
    buryOpen = false;
    buryPanel.classList.remove("active");
    buryAmount.blur();
    stableOpen = false;
    stablePanel.classList.remove("active");
    walletMobileOpen = false;
    walletMobilePanel.classList.remove("active");
    mobileChatOpen = false;
    mobileChatPanel.classList.remove("active");
    mobileChatInput.blur();
  }
  chatPanel.classList.toggle("active", next);
  syncTextEntryState();
  syncMobileControlsVisibility();
  if (next) {
    chatInput.value = chatDraft;
    chatInput.focus();
    chatInput.select();
  } else {
    chatInput.blur();
    chatInput.value = "";
    chatDraft = "";
  }
}

function syncChatDraftFromInput(): void {
  chatDraft = chatInput.value;
}

function setBuryOpen(next: boolean): void {
  buryOpen = next;
  if (next) {
    chatOpen = false;
    chatPanel.classList.remove("active");
    chatInput.blur();
    chatInput.value = "";
    stableOpen = false;
    stablePanel.classList.remove("active");
    walletMobileOpen = false;
    walletMobilePanel.classList.remove("active");
    mobileChatOpen = false;
    mobileChatPanel.classList.remove("active");
    mobileChatInput.blur();
  }
  buryPanel.classList.toggle("active", next);
  syncTextEntryState();
  syncMobileControlsVisibility();
  if (next) {
    buryAmount.focus();
    buryAmount.select();
  } else {
    buryAmount.blur();
    buryAmount.value = "";
  }
}

function setStableOpen(next: boolean): void {
  stableOpen = next;
  if (next) {
    chatOpen = false;
    buryOpen = false;
    chatPanel.classList.remove("active");
    buryPanel.classList.remove("active");
    chatInput.blur();
    chatInput.value = "";
    buryAmount.blur();
    buryAmount.value = "";
    walletMobileOpen = false;
    walletMobilePanel.classList.remove("active");
    mobileChatOpen = false;
    mobileChatPanel.classList.remove("active");
    mobileChatInput.blur();
  }
  stablePanel.classList.toggle("active", next);
  syncTextEntryState();
  syncMobileControlsVisibility();
}

function setWalletMobileOpen(next: boolean): void {
  walletMobileOpen = next;
  if (next) {
    chatOpen = false;
    buryOpen = false;
    stableOpen = false;
    chatPanel.classList.remove("active");
    buryPanel.classList.remove("active");
    stablePanel.classList.remove("active");
    chatInput.blur();
    chatInput.value = "";
    buryAmount.blur();
    buryAmount.value = "";
    mobileChatOpen = false;
    mobileChatPanel.classList.remove("active");
    mobileChatInput.blur();
  }
  walletMobilePanel.classList.toggle("active", next);
  syncTextEntryState();
  syncMobileControlsVisibility();
}

function setMobileChatOpen(next: boolean): void {
  mobileChatOpen = next;
  if (next) {
    chatOpen = false;
    buryOpen = false;
    stableOpen = false;
    walletMobileOpen = false;
    chatPanel.classList.remove("active");
    buryPanel.classList.remove("active");
    stablePanel.classList.remove("active");
    walletMobilePanel.classList.remove("active");
    chatInput.blur();
    buryAmount.blur();
    chatInput.value = "";
    buryAmount.value = "";
  }
  mobileChatPanel.classList.toggle("active", next);
  syncTextEntryState();
  syncMobileControlsVisibility();
  if (next) {
    mobileChatInput.value = chatDraft;
    window.setTimeout(() => {
      mobileChatInput.focus();
      mobileChatInput.select();
    }, 20);
  } else {
    mobileChatInput.blur();
  }
}

function dispatchChat(text: string): void {
  const now = performance.now();
  if (now - lastChatSubmitAt < 250) {
    return;
  }
  const normalized = text.trim().slice(0, 80);
  console.debug("[chat] submit", {
    textLength: normalized.length,
    hasLocalPlayer: Boolean(network.localPlayer),
    connected: network.isConnected()
  });
  if (normalized.length === 0) {
    renderer.setMessage("Type a message first.");
    return;
  }
  const sent = network.sendChat(normalized);
  if (!sent) {
    renderer.setMessage("Chat is unavailable until the server connection returns.");
    return;
  }
  lastChatSubmitAt = now;
  chatDraft = "";
  if (network.localPlayer) {
    pushOverheadMessage(network.localPlayer, sent, CHAT_MESSAGE_TTL_MS, now);
  }
  localChatPreview = { text: sent, expiresAt: now + CHAT_MESSAGE_TTL_MS };
  setChatOpen(false);
  setMobileChatOpen(false);
}

function dismissStablePanelOnActivity(mask: number): void {
  if (!stableOpen) {
    return;
  }
  if (mask !== 0 || input.consumeInteract() || input.consumeMountToggle() || input.consumeDig() || input.consumeBuryToggle() || input.consumeChatToggle()) {
    setStableOpen(false);
  }
}

function submitChat(): void {
  syncChatDraftFromInput();
  dispatchChat(chatInput.value.trim() || chatDraft.trim());
}

function syncMobileChatDraftFromInput(): void {
  chatDraft = mobileChatInput.value;
}

function submitMobileChat(): void {
  syncMobileChatDraftFromInput();
  dispatchChat(mobileChatInput.value.trim() || chatDraft.trim());
}

function requestMobileChatSubmit(event?: Event): void {
  event?.preventDefault();
  event?.stopPropagation();
  syncMobileChatDraftFromInput();
  if (document.activeElement === mobileChatInput) {
    mobileChatInput.blur();
    window.setTimeout(() => {
      syncMobileChatDraftFromInput();
      submitMobileChat();
    }, 40);
    return;
  }
  window.setTimeout(() => {
    syncMobileChatDraftFromInput();
    submitMobileChat();
  }, 0);
}

function requestChatSubmit(event?: Event): void {
  event?.preventDefault();
  event?.stopPropagation();
  syncChatDraftFromInput();
  if (document.activeElement === chatInput) {
    chatInput.blur();
    window.setTimeout(() => {
      syncChatDraftFromInput();
      submitChat();
    }, 40);
    return;
  }
  window.setTimeout(() => {
    syncChatDraftFromInput();
    submitChat();
  }, 0);
}

chatForm.addEventListener("submit", (event) => {
  requestChatSubmit(event);
});

chatPanel.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});

chatPanel.addEventListener("click", (event) => {
  event.stopPropagation();
});

mobileChatPanel.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});

mobileChatPanel.addEventListener("click", (event) => {
  event.stopPropagation();
});

chatSend.addEventListener("click", (event) => {
  requestChatSubmit(event);
});

chatSend.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
});

chatInput.addEventListener("input", () => {
  syncChatDraftFromInput();
});

chatInput.addEventListener("change", () => {
  syncChatDraftFromInput();
});

chatInput.addEventListener("keyup", () => {
  syncChatDraftFromInput();
});

chatInput.addEventListener("blur", () => {
  syncChatDraftFromInput();
});

chatInput.addEventListener("compositionend", () => {
  syncChatDraftFromInput();
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

for (const button of stableOptions) {
  button.addEventListener("click", () => {
    const variant = Number(button.dataset.horseVariant ?? "-1");
    if (variant < 0) {
      return;
    }
    setStableOpen(false);
    void treasure.buyStableHorse(variant);
  });
}

window.addEventListener("keydown", (event) => {
  if (introVisible) {
    if (!event.repeat) {
      dismissIntro();
    }
    event.preventDefault();
    return;
  }
  if (event.code === "Escape" && (chatOpen || buryOpen || stableOpen || walletMobileOpen || mobileChatOpen)) {
    event.preventDefault();
    setChatOpen(false);
    setBuryOpen(false);
    setStableOpen(false);
    setWalletMobileOpen(false);
    setMobileChatOpen(false);
    return;
  }
  if (stableOpen) {
    const target = event.target;
    const editingText =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable);
    if (!editingText) {
      setStableOpen(false);
    }
  }
});

window.addEventListener("pointerdown", (event) => {
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }
  if (chatOpen && !chatPanel.contains(target)) {
    setChatOpen(false);
    return;
  }
  if (buryOpen && !buryPanel.contains(target)) {
    setBuryOpen(false);
    return;
  }
  if (stableOpen && !stablePanel.contains(target)) {
    setStableOpen(false);
    return;
  }
  if (walletMobileOpen && !walletMobilePanel.contains(target)) {
    setWalletMobileOpen(false);
    return;
  }
});

walletOpenCoinbase.addEventListener("click", () => {
  openCoinbaseWallet();
});

walletOpenMetamask.addEventListener("click", () => {
  openMetaMaskWallet();
});

chatClose.addEventListener("click", () => {
  setChatOpen(false);
});

buryClose.addEventListener("click", () => {
  setBuryOpen(false);
});

stableClose.addEventListener("click", () => {
  setStableOpen(false);
});

walletMobileClose.addEventListener("click", () => {
  setWalletMobileOpen(false);
});

mobileChatClose.addEventListener("click", () => {
  setMobileChatOpen(false);
});

mobileChatCancel.addEventListener("click", () => {
  setMobileChatOpen(false);
});

mobileChatSend.addEventListener("click", (event) => {
  requestMobileChatSubmit(event);
});

mobileChatInput.addEventListener("input", () => {
  syncMobileChatDraftFromInput();
});

mobileChatInput.addEventListener("change", () => {
  syncMobileChatDraftFromInput();
});

mobileChatInput.addEventListener("keyup", () => {
  syncMobileChatDraftFromInput();
});

mobileChatInput.addEventListener("compositionend", () => {
  syncMobileChatDraftFromInput();
});

mobileChatInput.addEventListener("keydown", (event) => {
  if (event.code === "Escape") {
    event.preventDefault();
    setMobileChatOpen(false);
    return;
  }
  if (event.code === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submitMobileChat();
  }
});

function bindDirectionButton(button: HTMLButtonElement, code: "KeyW" | "KeyA" | "KeyS" | "KeyD"): void {
  const release = () => {
    input.setVirtualDirection(code, false);
    button.classList.remove("active");
  };

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    input.setVirtualDirection(code, true);
    button.classList.add("active");
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  button.addEventListener("contextmenu", (event) => event.preventDefault());
}

function bindActionButton(button: HTMLButtonElement, action: () => void): void {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    action();
    button.classList.add("active");
  });
  const clearActive = () => button.classList.remove("active");
  button.addEventListener("pointerup", clearActive);
  button.addEventListener("pointercancel", clearActive);
  button.addEventListener("contextmenu", (event) => event.preventDefault());
}

bindDirectionButton(mobileUp, "KeyW");
bindDirectionButton(mobileDown, "KeyS");
bindDirectionButton(mobileLeft, "KeyA");
bindDirectionButton(mobileRight, "KeyD");
bindActionButton(mobileInteract, () => {
  input.queueVirtualInteract();
});
bindActionButton(mobileMount, () => {
  input.queueVirtualMountToggle();
});
if (isLikelyMobile()) {
  bindActionButton(mobileChat, () => {
    setMobileChatOpen(true);
  });
} else {
  bindActionButton(mobileChat, () => {
    input.queueVirtualChatToggle();
  });
}
bindActionButton(mobileBury, () => {
  input.queueVirtualBuryToggle();
});
bindActionButton(mobileDig, () => {
  input.queueVirtualDig();
});

walletConnect.addEventListener("click", () => {
  if (isLikelyMobile() && !window.ethereum) {
    setWalletMobileOpen(true);
    renderer.setMessage("Choose a wallet app to reopen BasedLand.");
    return;
  }
  void treasure.connectWallet();
});

walletDisconnect.addEventListener("click", () => {
  treasure.disconnectWallet();
});

introOverlay.addEventListener("pointerdown", () => {
  dismissIntro();
});

if (!__BASEDLAND_MAP_EDITOR_ENABLED__) {
  editorDock?.remove();
}

input.setUiBlocked(true);
music.preload();
void loadInitialWorldLayer();
void refreshTreasureSummary();
void refreshEditorAccess();
window.setInterval(() => {
  void refreshTreasureSummary();
}, TREASURE_SUMMARY_REFRESH_MS);
window.setInterval(() => {
  void refreshEditorAccess();
}, EDITOR_ACCESS_REFRESH_MS);

function applyLocalMovement(dt: number): void {
  if (introVisible) {
    return;
  }
  const player = network.localPlayer;
  if (input.consumeChatToggle()) {
    if (isLikelyMobile()) {
      setMobileChatOpen(!mobileChatOpen);
    } else {
      setChatOpen(!chatOpen);
    }
  }
  if (input.consumeBuryToggle()) {
    setBuryOpen(!buryOpen);
  }
  if (!player) {
    return;
  }

  if (input.consumeMountToggle()) {
    if (player.mountedHorseVariant === null && !editor?.isEnabled() && !hasNearbyHorseForMount()) {
      renderer.setMessage("No horse close enough to mount.");
    } else {
      network.sendToggleMount();
    }
  }

  const mask = input.getMask();
  dismissStablePanelOnActivity(mask);
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

  if (input.consumeMovementFocusReset()) {
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
    void handleInteract();
  }

  if (input.consumeDig()) {
    void treasure.digAtPlayerTile();
  }
}

function prefetchManualCameraChunks(): void {
  const manualCamera = renderer.getManualCamera();
  if (!manualCamera) {
    lastManualCameraPrefetchKey = "";
    return;
  }
  const tileX = Math.floor(manualCamera.x / TILE_SIZE);
  const tileY = Math.floor(manualCamera.y / TILE_SIZE);
  const key = `${Math.floor(tileX / CHUNK_SIZE_TILES)},${Math.floor(tileY / CHUNK_SIZE_TILES)}`;
  if (key === lastManualCameraPrefetchKey) {
    return;
  }
  lastManualCameraPrefetchKey = key;
  void network.prefetchChunksAt(manualCamera.x, manualCamera.y, 2);
}

function updateRemotePlayers(): void {
  const now = performance.now();
  if (network.localPlayer) {
    if (localChatPreview && localChatPreview.expiresAt > now) {
      const hasPreview = network.localPlayer.overheadMessages.some(
        (message) => message.text === localChatPreview?.text && message.expiresAt > now
      );
      if (!hasPreview) {
        pushOverheadMessage(
          network.localPlayer,
          localChatPreview.text,
          Math.max(1, localChatPreview.expiresAt - now),
          now
        );
      }
    } else {
      localChatPreview = null;
    }
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
  prefetchManualCameraChunks();

  renderer.render(
    world,
    network.localPlayer,
    [...network.remotePlayers.values()].sort((a, b) => a.y - b.y)
  );
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
