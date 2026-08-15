# 打包与发布指南

## 1. 原则

Electron 安装包在目标操作系统的原生环境构建：Windows 包在 Windows runner，macOS 包在 macOS runner。仓库的 `.github/workflows/package.yml` 提供手动触发的双平台矩阵。

发布前先在 `album-studio/` 运行：

```bash
npm ci
npm run check
npm run test:e2e
```

## 2. macOS

双击根目录 `package-macos.command`，或：

```bash
cd album-studio
npm run package:mac
npm run verify:package:mac --workspace album-studio-desktop
```

产物位于 `album-studio/apps/desktop/dist/`，默认为 Intel + Apple Silicon universal DMG。验证脚本会从已打包 `.app` 启动真实进程，确认它不会立即崩溃。

内部测试配置使用 ad-hoc 签名，关闭 hardened runtime 和 notarization。公开发布时必须：

1. 将 `electron-builder.yml` 的 `mac.identity` 改为 Developer ID Application 签名身份或让 electron-builder 自动发现。
2. 开启 `hardenedRuntime` 并复核 entitlements。
3. 通过 CI 密钥库提供 Apple 凭据，开启 notarization。
4. 运行 `codesign --verify --deep --strict` 和 `spctl --assess`，再执行打包启动验证。

不要将 `.p12`、密码或 Apple API key 提交到仓库。

## 3. Windows

双击根目录 `package-windows.cmd`，或在 Windows PowerShell/cmd 中：

```text
cd album-studio
npm run package:win
```

配置产生 x64 NSIS 安装程序和 portable 可执行文件，产物位于 `album-studio/apps/desktop/dist/`。打包后至少在干净的 Windows 10/11 机器上验证：

- NSIS 安装、开始菜单/桌面快捷方式和卸载。
- portable 启动。
- 中文路径下新建/打开项目、文件夹导入和 PDF 导出。
- 窗口关闭前最后输入已保存。

公开发布时通过 CI 密钥库提供 Authenticode 证书，对 NSIS 和 portable 都签名并验证时间戳。不要提交 `.pfx` 或密码。

## 4. GitHub Actions

在 GitHub 的 Actions 页面手动运行“Package desktop apps”。每个 runner 会：

1. 按 `.nvmrc` 安装 Node。
2. 执行 `npm ci`。
3. 执行 `npm run check`。
4. 在原生平台打包。
5. macOS 额外启动验证已打包应用。
6. 上传 `apps/desktop/dist/` 作为工作流产物。

首次接入公开发布时，先在保护分支上测试签名 secrets，并将验证命令作为 CI 强制步骤，不要仅依赖构建返回码。

## 5. 当前本地验收基线

- macOS universal DMG 成功生成。
- 主可执行文件同时含 x86_64 和 arm64。
- ad-hoc 签名通过 `codesign --verify --deep --strict`。
- Electron 安全熔丝关闭 RunAsNode/NodeOptions/CLI inspect/file protocol extra privileges，开启 cookie encryption、ASAR integrity 和 only-load-ASAR。
- 已打包应用通过真实启动 smoke test。

Windows 需由 Windows runner 完成最终原生产物验收，不用 macOS 交叉打包结果替代。

当前已在 macOS 上完成 Windows x64 解包交叉构建，并确认主程序为 PE32+ x86-64、`resources/app.asar` 存在且安全熔丝与 macOS 配置一致。这仅证明组装链可用，不等于 Windows 真实启动、安装或 PDF 验收。
