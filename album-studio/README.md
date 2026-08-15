# 电子相册工作室

一个离线优先的 Windows/macOS 桌面相册应用。使用 Electron、React、TypeScript、Vite、Tailwind CSS v4 和 shadcn/ui 构建。

## 最简单的开发启动

- macOS：双击仓库根目录的 `dev.command`。
- Windows：双击仓库根目录的 `dev.cmd`。

脚本会检查 Node.js；首次运行时自动安装依赖。Node.js 最低版本为 22.12，建议使用仓库 `.nvmrc` 指定的 Node 22。

也可以在终端运行：

```bash
node scripts/dev.mjs
```

## 常用命令

```bash
npm run check       # 类型、lint、单元测试和构建
npm run test:e2e    # Electron 端到端测试
npm run test:e2e:large # 显式指定旧 JSON 时的大样本验收
npm run package:win # Windows x64 NSIS + portable
npm run package:mac # macOS universal DMG
```

Windows 和 macOS 安装包应分别在对应的原生系统或 GitHub Actions runner 上构建。默认产物未签名，只适合内部测试；正式发布前需配置 Apple notarization 与 Windows Authenticode。

## 项目结构

```text
apps/desktop/     Electron main、preload 和 React renderer
packages/common/  项目 schema、旧数据迁移、页面布局和 IPC 契约
scripts/          环境检查与跨平台开发入口
```

相册项目以 `.album-project` 文件夹保存：`manifest.json` 只记录结构化数据，原图按内容 hash 存入 `assets/original/`，UI/PDF 预览位于 `assets/previews/` 和 `assets/print/`。应用不修改导入前的源照片。

文档：

- `docs/user-guide.md`：新建、导入、排版、编辑、导出、迁移和恢复。
- `docs/development.md`：架构边界、命令、测试和对话式维护。
- `docs/release.md`：Windows/macOS 打包、CI、签名和公证。
- `docs/plan.md` 与 `docs/todo.md`：已实施范围与最终验收记录。
