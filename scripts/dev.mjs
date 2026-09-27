import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
mkdirSync(".cache/go-build", { recursive: true });
const apiBinary = resolve(process.platform === "win32" ? ".cache/schooldesk-dev.exe" : ".cache/schooldesk-dev");
const build = spawnSync("go", ["build", "-o", apiBinary, "./apps/api"], {
  stdio: "inherit",
  windowsHide: true,
  env: { ...process.env, GOCACHE: resolve(".cache/go-build") },
});
if (build.error || build.status !== 0) {
  console.error(build.error?.message || "Go build failed");
  process.exit(1);
}
const children = [
  spawn(apiBinary, [], {
    stdio: "inherit",
    windowsHide: true,
  }),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--config", "apps/web/vite.config.js"],
    { stdio: "inherit", windowsHide: true },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
children.forEach((child) => {
  child.on("error", (err) => {
    console.error(err.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code || 0));
});
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
