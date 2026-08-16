# 电子相册工作室

一个离线优先的自由画布电子相册编辑器。同一套 React 工作室同时运行在 Windows/macOS Electron 桌面端和轻量浏览器端。图片、富文本、Icon 与贴纸都作为 Block 统一排版，并支持页面布局、自由拖动/缩放/旋转、图片美化、图层与 PDF/打印。

项目代码位于 `album-studio/`，需要 Node.js 22.12.0 或更高版本。

## 最简单的启动方式

| 模式         | macOS                  | Windows            |
| ------------ | ---------------------- | ------------------ |
| 桌面开发版   | 双击 `dev.command`     | 双击 `dev.cmd`     |
| 浏览器调试版 | 双击 `dev-web.command` | 双击 `dev-web.cmd` |

启动器会检查 Node/npm，在首次运行或依赖不完整时自动安装，之后启动热更新。浏览器版会自动打开本地页面。

终端用户可在 `album-studio/` 中运行：

```bash
npm install
npm run dev       # Electron
npm run dev:web   # 浏览器
```

## 两种运行形态

- **桌面版**：完整交付形态。项目是可整体复制、备份和重新打开的 `.album-project/` 文件夹；支持系统文件夹、缺图重新定位和 Electron 原生 PDF 导出。
- **浏览器版**：轻量离线编辑和调试入口。项目和图片保存在当前 origin 的 OPFS，清除站点数据会删除它们；导出使用浏览器打印面板，不等同于桌面项目归档。

两端只读写当前唯一的 `AlbumDocument` v2，并在入口执行严格 schema 校验。项目创建时可选择 A4 横向、12 寸方形或 16:9，页面尺寸会贯穿画布、预览与最终输出。

## 项目结构

```text
album-studio/
├── apps/
│   ├── desktop/   Electron main/preload、桌面 adapter、打包与验收
│   └── web/       Vite 入口、OPFS/browser adapter、浏览器 E2E
├── packages/
│   ├── common/    AlbumDocument schema、Block 命令、布局、PageSpec、裁剪/effects
│   └── studio/    共享 React 页面、功能、UI 原语与状态
└── scripts/           环境检查与简单启动器
```

## 检查与打包

```bash
cd album-studio
npm run check         # lint、typecheck、测试、双端构建、dev smoke、Web E2E
npm run test:e2e      # Electron 业务流程
npm run package:mac   # macOS universal DMG
npm run package:win   # Windows x64 NSIS + portable（需 Windows）
```

也可在 macOS 双击 `package-macos.command`，或在 Windows 双击 `package-windows.cmd`。安装包必须在目标操作系统或对应的原生 CI runner 上验证；macOS 不作为 Windows 真实启动证据。

## 文档

- `docs/user-guide.md`：桌面版与浏览器版的使用、编辑、导出与备份。
- `docs/development.md`：当前分层、存储、安全边界和验证命令。
- `docs/design-direction.md`：界面、自由画布和响应式交互方向。
- `docs/plan.md`：已落地的新格式架构与验收基线。
- `docs/release.md`：macOS/Windows 原生打包、smoke、签名与 CI。
- `docs/adr/`：关键架构决策。
