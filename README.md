# BasedLand

Phase 1 multiplayer browser prototype focused on low-bandwidth, server-authoritative movement and chunked interest management.

## Run

```bash
npm install
npm run build
npm start
```

Open `http://localhost:3000`.

## Art Pipeline

- Runtime uses pixel-art sprite and tile assets from `src/client/assets/generated/` when present.
- If generated assets are missing, the client falls back to built-in procedural pixel art so the game still renders cleanly.
- Generate OpenAI art with:

```bash
npm run assets:generate
```

- Required env: `OPENAI_API_KEY`
- Optional env: `OPENAI_IMAGE_MODEL=gpt-image-1.5`
- The generator creates multiple tile variants per ground type and writes `manifest.json` so the browser only loads available assets.

## World Pipeline

- The world is now `1000x1000` tiles.
- Macro biome layout is generated once with OpenAI image generation and then converted into a `100x100` biome grid that drives rivers, villages, plains, forests, and mountain ranges.
- Generate a fresh world layout with:

```bash
npm run world:generate
```

- The resulting biome mask is written to `src/shared/generated/world-layout.json`.
- A debug preview is written to `src/client/assets/generated/world-layout-preview.png`.

## Architecture

- Server-authoritative movement at `20 Hz`.
- Binary input packets from client at `10 Hz`.
- Binary delta snapshots from server at `10 Hz`.
- Grid-based chunk interest management with `32x32` tile chunks and a `3 chunk` view radius.
- Static world objects generated deterministically per chunk and streamed once when chunks enter view.
- Client-side prediction for local movement plus reconciliation from authoritative snapshots.
- Remote player interpolation to keep rendering smooth at `60 FPS`.

## Network design

- Input packet: `op + seq + buttons`, 4 bytes total.
- Interaction packet: `op`, 1 byte total.
- Snapshot packets only include nearby changed players.
- Remote player deltas use `dx/dy` `int8` values when possible; the server falls back to absolute `uint16` coordinates only when needed.
- Static object packets are chunk-scoped and only sent for chunks entering the visibility ring.
- Tile data is derived from a shared seed instead of streaming a full `2000x2000` array. This is a deliberate optimization for Phase 1.

## Scaling path to 50k

- Split world simulation by region and route clients through a gateway tier.
- Move chunk ownership into sharded world workers with handoff at chunk boundaries.
- Replace `ws` with `uWebSockets.js` or a custom UDP/WebTransport edge for lower overhead.
- Store per-connection interest caches in compact shared-memory structures.
- Add AOI diff batching across groups of clients that share the same visible chunk set.
- Offload static chunk manifests to CDN and keep only dynamic entity deltas on the realtime path.
