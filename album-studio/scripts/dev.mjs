import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, args, {
      cwd: workspaceRoot,
      env: process.env,
      stdio: "inherit",
      windowsHide: false,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`进程被信号 ${signal} 中止。`));
      else resolve(code ?? 1);
    });
  });
}

const [currentNodeMajor, currentNodeMinor] = process.versions.node
  .split(".")
  .map((part) => Number.parseInt(part, 10));
const supported =
  currentNodeMajor > 22 || (currentNodeMajor === 22 && currentNodeMinor >= 12);
if (!supported) {
  console.error(
    `[电子相册工作室] 需要 Node.js 22.12.0 或更高版本，当前是 ${process.versions.node}。`,
  );
  console.error("如果已经安装 nvm，请先运行：nvm use");
  process.exit(1);
}

if (!existsSync(join(workspaceRoot, "node_modules"))) {
  console.log("[电子相册工作室] 首次运行，正在安装依赖…");
  const installCode = await run(["install"]);
  if (installCode !== 0) process.exit(installCode);
}

console.log("[电子相册工作室] 正在启动开发模式…");
process.exit(await run(["run", "dev"]));
