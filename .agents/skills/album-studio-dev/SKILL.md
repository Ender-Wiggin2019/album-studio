---
name: album-studio-dev
description: 开发、启动、检查、测试或打包本仓库的“电子相册工作室”Electron 应用时使用。触发词包括电子相册、album-studio、启动开发环境、运行应用、打包 Windows/macOS、排查启动失败。
---

# 电子相册工作室开发

项目代码位于 `album-studio/`。运行前先读根目录 `AGENTS.md` 和 `docs/todo.md`；Node 必须为 22.12.0 或更高版本。

## 启动

- macOS 非技术用户：双击根目录 `dev.command`。
- Windows 非技术用户：双击根目录 `dev.cmd`。
- 终端：在仓库根目录运行 `node album-studio/scripts/dev.mjs`。

脚本会检查 Node；首次运行缺少 `node_modules` 时会自动执行 `npm install`，随后启动 Electron 与 Vite 热更新。

## 修改与验证

1. 业务 schema、迁移、布局纯函数放在 `album-studio/packages/common/`。
2. 文件系统、对话框、项目保存、素材和 PDF 放在 `album-studio/apps/desktop/src/main/`。
3. preload 只增加经过 Zod 校验的窄 API，禁止暴露 `ipcRenderer`、`fs` 或任意路径读取。
4. React 页面和 shadcn 组件放在 `album-studio/apps/desktop/src/renderer/`；相册主题不得覆盖应用外壳 token。
5. 修改后在 `album-studio/` 运行 `npm run check`。可见 UI 改动还要启动应用，在 1440×900、1100×720、800×640 检查截图与交互。

常用命令：

```bash
cd album-studio
npm run typecheck
npm test
npm run lint
npm run build
npm run test:e2e
```

用真实旧相册做压力验收时，显式指定本地 fixture：

```bash
ALBUM_STUDIO_LARGE_LEGACY="/绝对路径/旧相册.json" npm run test:e2e:large
```

## 打包

- Windows 原生环境：双击 `package-windows.cmd`，或运行 `npm run package:win`。
- macOS 原生环境：双击 `package-macos.command`，或运行 `npm run package:mac`。

macOS 打包后运行 `npm run verify:package:mac --workspace album-studio-desktop`，确认已打包应用可真实启动。Windows 产物应在 Windows 或仓库的 GitHub Actions Windows runner 上生成。

未签名安装包只用于内部测试。正式发布前必须配置 Apple notarization 和 Windows Authenticode；不要在仓库中提交证书或密码。
