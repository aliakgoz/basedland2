import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const mapMakerEnabled = !["0", "false", "off", "no"].includes(String(process.env.MAP_MAKER_ENABLED ?? "1").trim().toLowerCase());

const localImport = spawnSync(process.execPath, ["scripts/import-local-assets.mjs"], {
  stdio: "inherit"
});
if (localImport.status !== 0) {
  process.exit(localImport.status ?? 1);
}

rmSync("dist", { force: true, recursive: true });
mkdirSync("dist/client", { recursive: true });
mkdirSync("dist/server", { recursive: true });

await build({
  entryPoints: ["src/client/game.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  define: {
    __BASEDLAND_WS_URL__: JSON.stringify(process.env.BASEDLAND_WS_URL ?? ""),
    __BASEDLAND_MAP_EDITOR_ENABLED__: JSON.stringify(mapMakerEnabled)
  },
  outfile: "dist/client/app.js",
  sourcemap: false,
  minify: false
});

await build({
  entryPoints: ["src/server/server.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  outfile: "dist/server/server.js",
  sourcemap: false,
  minify: false,
  external: ["ws"]
});

cpSync("src/client/index.html", "dist/client/index.html");

if (existsSync("src/client/assets")) {
  cpSync("src/client/assets", "dist/client/assets", { recursive: true });
}
