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

console.log(`[电子相册工作室] 环境检查通过：Node.js ${process.versions.node}`);
