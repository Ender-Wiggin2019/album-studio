# 电子相册工作室

一个离线优先的 Windows/macOS Electron 电子相册应用，使用 React、TypeScript、Vite、Tailwind CSS 和 shadcn/ui 构建。应用代码位于 `album-studio/`。

## 一键开发启动

- macOS：双击 `dev.command`。
- Windows：双击 `dev.cmd`。

首次运行会自动安装 npm 依赖。需要 Node.js >= 22.12.0。

## 打包

- macOS：双击 `package-macos.command`。
- Windows：双击 `package-windows.cmd`。

默认产物未做商店签名/公证，适合内部测试。公开发布前需要 Apple 和 Windows 开发者证书。

## 文档

- `docs/user-guide.md`：使用、旧相册迁移和恢复。
- `docs/development.md`：启动、架构、测试与维护。
- `docs/release.md`：跨平台打包、CI、签名与公证。
- `docs/plan.md`：已实施范围、架构与验收结果。
- `docs/todo.md`：完整实施清单和最终 Review。

更多 npm 命令和目录说明见 `album-studio/README.md`。
