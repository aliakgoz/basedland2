import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";

const port = Number(process.env.PORT ?? 3000);
const serverEntry = resolve(process.cwd(), "dist", "server", "server.js");

function collectLanUrls() {
  const urls = [];
  const seen = new Set();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) {
        continue;
      }
      const url = `http://${entry.address}:${port}`;
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }
  }
  return urls.sort();
}

if (!existsSync(serverEntry)) {
  console.error("dist/server/server.js is missing. Run `npm run build` first.");
  process.exit(1);
}

const lanUrls = collectLanUrls();

console.log("");
console.log("BasedLand home host");
console.log(`Local: http://localhost:${port}`);
if (lanUrls.length > 0) {
  console.log("LAN:");
  for (const url of lanUrls) {
    console.log(`  ${url}`);
  }
} else {
  console.log("LAN: no non-internal IPv4 address detected.");
}
console.log("");
console.log("Second laptop on the same network:");
console.log("  open one of the LAN URLs above in the browser.");
console.log("");
console.log("If internet players will join:");
console.log(`  forward TCP ${port} on the router to this laptop`);
console.log("  allow Node.js through Windows Firewall");
console.log("  disable sleep / lid-close sleep on the host laptop");
console.log("  if your ISP uses CGNAT, direct hosting will not work without a tunnel or VPS");
console.log("");

const child = spawn(process.execPath, [serverEntry], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
