# BasedLand

BasedLand is Phase 1 of a browser MMO prototype focused on a lightweight shared world, low bandwidth usage, and a clean path toward large-scale multiplayer. The project currently includes:

- a browser client with Canvas rendering
- a Node.js WebSocket server
- binary movement/input packets
- chunk-based interest management
- OpenAI-assisted asset generation
- OpenAI-assisted world layout generation
- a server-admin map maker/editor

This file is the operational guide for the whole project.

## 1. What Exists Today

The current prototype supports:

- top-down pixel movement with `W A S D`
- interaction with `E`
- camera zoom with mouse wheel
- nearby player visibility
- static world props such as houses, pubs, inns, barns, stables, blacksmiths, windmills, chapels, markets, manors, town halls, trees, stones, animals, and signs
- generated art assets loaded from disk when available
- a `1000 x 1000` world driven by generated biome/layout data
- a server-admin map editor mode for painting ground, roads, and object layers

The current focus is the multiplayer core, world pipeline, and editing workflow. Blockchain, wallet, and Base integration are intentionally not included yet.

## 2. Project Layout

Main folders:

- `src/client/`
  Browser game, renderer, networking, asset loading, and admin-only map editor UI.
- `src/server/`
  WebSocket server, simulation loop, player state, chunk visibility, and network encoding.
- `src/shared/`
  Shared protocol constants, world generation, and generated layout data.
- `src/client/assets/generated/`
  Generated sprites, generated tile variants, generated world preview/output, and the runtime asset manifest.
- `scripts/`
  Asset and world generation scripts.

Important files:

- [scripts/generate-assets.mjs](c:/Genel/99_Python/basedland/scripts/generate-assets.mjs)
- [scripts/generate-world-layout.mjs](c:/Genel/99_Python/basedland/scripts/generate-world-layout.mjs)
- [src/client/map_editor.ts](c:/Genel/99_Python/basedland/src/client/map_editor.ts)
- [src/client/assets.ts](c:/Genel/99_Python/basedland/src/client/assets.ts)
- [src/client/renderer.ts](c:/Genel/99_Python/basedland/src/client/renderer.ts)
- [src/shared/worldgen.ts](c:/Genel/99_Python/basedland/src/shared/worldgen.ts)
- [src/shared/generated/world-layout.json](c:/Genel/99_Python/basedland/src/shared/generated/world-layout.json)

## 3. First-Time Setup

Requirements:

- Node.js 22+
- npm
- `.env` file with `OPENAI_API_KEY` if you want to generate assets or generate a new world

Install:

```bash
npm install
```

## 4. Normal Run Flow

If the project is already built and you only want to open the game:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

If you changed TypeScript or client/server code:

```bash
npm run build
npm start
```

Recommended normal workflow:

1. Change code
2. Run `npm run build`
3. Run `npm start`
4. Refresh the browser with `Ctrl+F5`

## 5. Controls

Gameplay:

- `W A S D`: move
- `E`: interact
- mouse wheel: zoom in/out

## 6. Build Scripts

Available npm scripts:

```bash
npm run build
npm run assets:generate
npm run assets:import-local
npm run world:generate
npm start
```

Meaning:

- `npm run build`
  Bundles the client and server into `dist/`.
- `npm run assets:generate`
  Generates or grows the sprite/tile archive using OpenAI image generation.
- `npm run assets:import-local`
  Imports local image files from `asset-drop/`, checks for visually similar existing assets, and appends only new variants.
- `npm run world:generate`
  Generates a new macro world layout and supporting preview files.
- `npm start`
  Starts the built Node.js server from `dist/server/server.js`.

### 6.2 Map Save Model

When the admin map maker is open, changes save in three ways:

- automatic local browser backup
- automatic online save to the Node server
- manual JSON backup/restore for the full editor layer

Server-side persistent file:

- `data/editor-map.json`

How it works:

1. when you paint in the editor, the full editor layer is saved to browser local storage on the server machine browser
2. the same layer is also autosaved to the Node backend after a short debounce
3. when the game starts, it tries to load the online map first
4. if no online map exists, it falls back to the local browser backup

Editor panel buttons:

- `Save Online`
- `Load Online`
- `Backup JSON`
- `Restore JSON`
- `Save Local`
- `Load Local`

Meaning:

- `Save Online`: push the current full editor layer to the server immediately
- `Load Online`: pull the latest server copy
- `Backup JSON`: download the full editor layer as a file
- `Restore JSON`: restore a backup file
- `Save Local`: save the current editor layer into browser local storage
- `Load Local`: load the browser-local backup

### 6.1 Vercel Deploy

This repo is not a pure static site. It has:

- a static browser client
- a stateful Node.js WebSocket server

That matters because Vercel can host the built client, but this MMO backend should not be deployed there as the primary game server.

Current Vercel setup:

- [vercel.json](c:/Genel/99_Python/basedland/vercel.json)
- build command: `npm run build`
- output directory: `dist/client`

Important:

- Vercel should host only the frontend bundle from `dist/client`
- the WebSocket backend should run somewhere else such as Railway, Fly.io, Render, or your own VM

Client connection override:

- the client now supports a build-time WebSocket override through `BASEDLAND_WS_URL`
- this is injected during the client build in [esbuild.mjs](c:/Genel/99_Python/basedland/esbuild.mjs)
- runtime usage is in [src/client/network.ts](c:/Genel/99_Python/basedland/src/client/network.ts)

Example Vercel environment variable:

```bash
BASEDLAND_WS_URL=wss://your-backend.example.com
```

If `BASEDLAND_WS_URL` is not set, the client falls back to `ws://` or `wss://` on the current page host.

## 7. Asset System

The runtime tries to load generated assets from:

- [src/client/assets/generated](c:/Genel/99_Python/basedland/src/client/assets/generated)

If a generated asset is missing, the client falls back to built-in procedural pixel art so the game still works.

### 7.1 Asset Manifest

The generated asset manifest lives here:

- [src/client/assets/generated/manifest.json](c:/Genel/99_Python/basedland/src/client/assets/generated/manifest.json)

The manifest contains:

- `tiles`
- `objects`
- `players`
- `tileArchive`
- `objectArchive`
- `playerArchive`
- optional generated extras like `worldSurface`

Runtime compatibility:

- `tiles`, `objects`, and `players` are the runtime-facing keys the client reads immediately.
- the `*Archive` keys preserve the full history of generated variants.

### 7.2 Append-Only Rule

The asset generator is intentionally append-only by default. This means:

- rerunning asset generation does not regenerate what already exists
- no unnecessary OpenAI API usage happens once target counts are satisfied
- the archive grows only when you explicitly ask it to grow

This is important because the user specifically wanted to avoid wasting assets and to keep the library growing over time instead of replacing older work.

### 7.3 Generate Assets

Use:

```bash
npm run assets:generate
```

### 7.4 Import Local Images Into The Library

If you want to add your own image files manually, do not copy them directly into `src/client/assets/generated/`.

Instead, drop them into:

- [asset-drop/README.txt](c:/Genel/99_Python/basedland/asset-drop/README.txt)

Workflow:

1. put image files into the matching folder under `asset-drop/`
2. run `npm run build` or `npm run assets:import-local`
3. the importer pixelates/resizes them into the runtime archive
4. very similar images are skipped using a local perceptual hash check
5. imported source files move into `asset-drop/_imported/...`
6. similar skipped files move into `asset-drop/_similar/...`

Important:

- this importer works for supported known slugs only
- imported object variants are now also visible in the map editor palette, not just stored on disk

Required env:

```text
OPENAI_API_KEY=...
```

Optional env:

```text
OPENAI_IMAGE_MODEL=gpt-image-1.5
```

Default targets:

- tiles: `6` variants per ground type
- objects: `1` variant per object type
- players: `1` variant per player sprite
- houses: `1` generated variant by default, with procedural fallback archive support for `20` runtime house styles

If those targets are already met, the script prints `skipped ...` messages and makes no new image requests.

### 7.4 Grow the Archive Deliberately

Use these only when you want more variants:

```bash
npm run assets:generate -- --tile-target 12
npm run assets:generate -- --object-target 3
npm run assets:generate -- --player-target 2
npm run assets:generate -- --house-target 8
```

Examples:

- more ground variation:
  `npm run assets:generate -- --tile-target 20`
- more object variants:
  `npm run assets:generate -- --object-target 5`
- more generated house styles without expanding every other object:
  `npm run assets:generate -- --house-target 12`

### 7.5 Force Regeneration

Only use `--force` when you intentionally want to regenerate up to the requested target count:

```bash
npm run assets:generate -- --tile-target 12 --force
```

Do not use `--force` as part of the normal workflow.

## 8. World Generation System

The world is currently designed around a `1000 x 1000` tile space.

The world pipeline is now hybrid but much stricter:

1. OpenAI generates a semantic pixel-world masterplan using an exact palette
2. the script classifies that image into terrain and district layers
3. the script detects village blobs, enforces readable settlement structure, and connects them with a controlled road graph
4. the result is exported as a full `1000 x 1000` layered world JSON using RLE compression
5. the shared world generator and renderer use that generated layout as the actual runtime source

This is deliberate. The game should not show a blurry painted image as the final map. The AI image is only part of the generation pipeline, not the final rendering surface.

### 8.1 Generate a New Main World

Use:

```bash
npm run world:generate
```

This script:

- generates an AI semantic masterplan image
- converts it into `terrain + village + plaza + housing + field + road + bridge` layers
- extracts village centers from AI blobs
- forces a readable road network between settlements
- writes preview files to generated assets
- writes the actual logic-driving world data to shared JSON

Outputs:

- [src/shared/generated/world-layout.json](c:/Genel/99_Python/basedland/src/shared/generated/world-layout.json)
- [src/client/assets/generated/world-layout-preview.png](c:/Genel/99_Python/basedland/src/client/assets/generated/world-layout-preview.png)
- [src/client/assets/generated/world-masterplan.png](c:/Genel/99_Python/basedland/src/client/assets/generated/world-masterplan.png)

What each file means:

- `world-layout.json`
  This is the important one. It drives the logical world and contains the RLE-compressed layer data.
- `world-layout-preview.png`
  Clean debug preview of the structured runtime layers.
- `world-masterplan.png`
  Raw AI semantic planning image before the cleanup and structure pass.

### 8.2 When to Regenerate the World

Run `npm run world:generate` only when you want a new main world.

Do not run it every startup.

Normal use after a world already exists:

```bash
npm run build
npm start
```

## 9. Recommended Command Flows

### 9.1 I only want to open the game

```bash
npm start
```

### 9.2 I changed code and want to test it

```bash
npm run build
npm start
```

### 9.3 I want more art variants, but only if needed

```bash
npm run assets:generate -- --tile-target 12
npm run build
npm start
```

### 9.4 I want to create a brand new world

```bash
npm run world:generate
npm run build
npm start
```

### 9.5 I want to create both art and a new world

```bash
npm run assets:generate
npm run world:generate
npm run build
npm start
```

## 10. Admin Map Maker

The map maker is no longer an in-game player feature.

It can only be opened from the server terminal, and only a browser running on the same machine as the server can use it.

Server terminal commands:

```text
map-maker on
map-maker off
clear-dug
```

How it works:

- start the server on the host machine
- open the game from that same machine using `http://localhost:3000`
- type `map-maker on` in the server terminal
- the editor dock appears for that local browser only
- type `map-maker off` to close access again

What it does:

- paint ground overrides
- paint road overlays
- place and erase objects
- choose brushes from grouped archive sections
- pan the camera quickly with `W A S D` while the editor is open

Current scope:

- there is no map maker button in the game UI
- there is no `M` hotkey
- remote players cannot open or use it
- editor API and editor patches are accepted only while `map-maker on` is active and the client is local to the server machine

## 11. Multiplayer and Network Design

This prototype is not a simple JSON WebSocket demo. The current architecture is shaped around MMO-style constraints.

### 11.1 Current Principles

- server authority
- local client prediction
- reconciliation
- chunk-based interest management
- binary packet design
- delta-style nearby updates
- minimal static object sync

### 11.2 Runtime Model

- server simulation: `20 Hz`
- client input send rate: `10 Hz`
- server snapshot send rate: `10 Hz`
- client rendering: `60 FPS`

### 11.3 Interest Management

The world is divided into chunks.

Players only receive:

- nearby players
- nearby chunk objects
- chunk entry/exit relevant data

This keeps bandwidth and CPU low.

### 11.4 Packet Strategy

Examples:

- input packet:
  `op + seq + buttons`
- interaction packet:
  `op`
- snapshots:
  nearby changed players only

Compression behavior:

- remote movement tries `dx/dy` delta form first
- absolute coordinates are only used when deltas are not enough
- static world data is not streamed every frame

## 12. Rendering Approach

Rendering is optimized for clarity and lightweight performance:

- top-down pixel art
- sharp tile rendering
- sprite/object layering
- camera centered on player
- zoom support

Important design rule:

- AI-generated images may help produce layouts and assets
- final runtime world should still read as a proper sharp game map, not a blurry poster

## 13. Troubleshooting

### `process is not defined`

Cause:

- server-only config leaked into the browser bundle

Status:

- already fixed by moving server port lookup into server-side code

### `Disconnected from server`

Check:

1. is `npm start` running
2. did you run `npm run build` after code changes
3. did you hard refresh the browser with `Ctrl+F5`

The client now includes reconnect behavior, but if the server crashes you still need to inspect the terminal.

### Port `3000` already in use

Find running Node processes:

```powershell
Get-Process node
```

Stop the old one:

```powershell
Stop-Process -Id <PID>
```

### Asset generation should not waste API calls

This is already handled by the append-only asset generator.

If the archive is full enough, the script prints `skipped ...` and does not generate replacements.

### The map looks blurry

The final runtime map should be tile-rendered, not displayed as a raw full image.

If blur returns, inspect:

- [src/client/renderer.ts](c:/Genel/99_Python/basedland/src/client/renderer.ts)
- [scripts/generate-world-layout.mjs](c:/Genel/99_Python/basedland/scripts/generate-world-layout.mjs)

## 14. Git Hygiene

The repo is configured to ignore local-only files such as:

- `node_modules`
- `.env`
- build output

Before committing:

```bash
git status
```

If you want to commit:

```bash
git add .
git commit -m "Your message"
```

If you want to push, make sure a remote exists first:

```bash
git remote -v
git push -u origin main
```

## 15. Scaling Path

The current prototype is Phase 1. It is intentionally simple enough to stay productive, but the design already points toward larger scale.

Future scaling path:

- shard simulation by region
- separate gateway and world workers
- move from `ws` to `uWebSockets.js` or another lower-overhead transport layer
- batch AOI diffs across clients with matching visible chunk sets
- CDN-host static chunk manifests and asset packs
- persist dynamic world and editing layers in chunk-oriented storage

## 16. Practical Summary

If you forget everything else, remember these command patterns:

Open the game:

```bash
npm start
```

Rebuild after code changes:

```bash
npm run build
npm start
```

Grow art archive without wasting existing assets:

```bash
npm run assets:generate -- --tile-target 12
```

Generate a new main world:

```bash
npm run world:generate
npm run build
npm start
```

Admin commands:

```text
map-maker on
map-maker off
clear-dug   # restores dug tiles and resets active treasure-state.json; backups stay in data/backups
```
