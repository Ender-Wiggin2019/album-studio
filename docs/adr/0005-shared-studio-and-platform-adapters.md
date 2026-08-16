# ADR 0005：共享工作室与平台 adapter

- 状态：已接受
- 日期：2026-08-15

## 决策

React 工作室作为 `packages/studio` 的共享应用模块存在。`apps/desktop` 与 `apps/web` 只负责各自的 composition root 和平台 adapter；工作室不直接读取 `window.albumStudio`、Node 路径或浏览器存储。

工作室通过一个窄 `StudioPlatform` interface 使用项目、素材和导出能力：

- Electron adapter 连接安全 preload，由 main 持有真实文件路径和系统权限。
- Browser adapter 使用 OPFS、File API 和 Blob URL；它明确声明浏览器打印等 capability，不伪造 Electron 功能。

桌面 `.album-project/` 仍是适合用户复制与长期归档的完整形态。浏览器项目属于当前 origin，清除站点数据会删除它。

## 原因与后果

这扩展 ADR 0001，而不替换 Electron 主交付形态。两个真实 adapter 使平台 seam 成立，同一工作室和相册文档可以同时获得桌面完整能力与浏览器轻量调试体验。

代价是所有平台差异必须显式经过 interface；浏览器不能承诺原生文件夹、系统保存对话框或 Electron `printToPDF` 的完全等价行为。
