import { AnimationState, Direction, InputFlag, PLAYER_SPEED, TILE_SIZE } from "../shared/protocol";
import { getTileType, isWalkableTile } from "../shared/worldgen";
import { AssetManager } from "./assets";
import { InputController } from "./input";
import { MapEditor } from "./map_editor";
import { NetworkClient } from "./network";
import { Renderer } from "./renderer";
import { WorldState } from "./world";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const online = document.querySelector<HTMLElement>("#online");
const message = document.querySelector<HTMLElement>("#message");

if (!canvas || !online || !message) {
  throw new Error("HUD elements missing");
}

const assets = new AssetManager();
const renderer = new Renderer(canvas, { online, message }, assets);
const input = new InputController();
const world = new WorldState();
const network = new NetworkClient();
const editor = new MapEditor(assets, world, renderer, canvas, () => network.localPlayer, (patch) => network.sendEditorPatch(patch));

renderer.setMessage("Loading pixel assets...");
assets.loadGeneratedOverrides().then(() => {
  void editor.initialize().then(() => {
    editor.refreshPalette();
    renderer.setMessage("Assets ready. Connecting...");
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

function applyLocalMovement(dt: number): void {
  const player = network.localPlayer;
  if (!player) {
    return;
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

  if (editor.isEnabled()) {
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

  const nextX = player.x + dx * PLAYER_SPEED * dt;
  const nextY = player.y + dy * PLAYER_SPEED * dt;
  const tileX = Math.floor(nextX / TILE_SIZE);
  const tileY = Math.floor(nextY / TILE_SIZE);

  if (isWalkableTile(getTileType(tileX, tileY))) {
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
}

function updateRemotePlayers(): void {
  for (const player of network.remotePlayers.values()) {
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
