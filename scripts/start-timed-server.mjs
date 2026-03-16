import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = resolve(root, "dist", "server", "server.js");
const autoStopMs = Number.parseInt(process.env.TIMED_SERVER_MS ?? "30000", 10);
const stopAfterMs = Number.isFinite(autoStopMs) && autoStopMs > 0 ? autoStopMs : 30000;

const child = spawn(process.execPath, [serverEntry], {
  cwd: root,
  stdio: "inherit"
});

let shuttingDown = false;

function stopChild(signal = "SIGTERM") {
  if (shuttingDown || child.exitCode !== null) {
    return;
  }
  shuttingDown = true;
  child.kill(signal);
  setTimeout(() => {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }
  }, 2000).unref();
}

const timer = setTimeout(() => {
  console.log(`[timed-server] Auto-stopping after ${stopAfterMs} ms.`);
  stopChild();
}, stopAfterMs);
timer.unref();

child.on("exit", (code, signal) => {
  clearTimeout(timer);
  if (signal) {
    process.exitCode = 0;
    return;
  }
  process.exitCode = code ?? 0;
});

child.on("error", (error) => {
  clearTimeout(timer);
  console.error("[timed-server] Failed to start server:", error);
  process.exitCode = 1;
});

process.on("SIGINT", () => stopChild());
process.on("SIGTERM", () => stopChild());
