const [currentNodeMajor, currentNodeMinor] = process.versions.node
  .split('.')
  .map((part) => Number.parseInt(part, 10))
const supported = currentNodeMajor > 22 || (currentNodeMajor === 22 && currentNodeMinor >= 12)

if (!supported) {
  console.error(`[咔宝] 需要 Node.js 22.12.0 或更高版本，当前是 ${process.versions.node}。`)
  console.error('如果已经安装 nvm，请先运行：nvm use')
  process.exit(1)
}

console.log(`[咔宝] 环境检查通过：Node.js ${process.versions.node}`)
