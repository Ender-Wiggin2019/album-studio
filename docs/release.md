# 构建与发布指南

> 更新日期：2026-08-16

## 1. 发布原则

桌面安装包必须在目标操作系统的原生环境构建并运行验证：macOS 包使用 macOS，Windows 包使用 Windows。macOS 上的 Windows 交叉组装结果不能作为 Windows 启动、安装、图片处理或 PDF 导出的验收证据。

浏览器版是独立的轻量入口，共用产品界面和文档模型，但不代替桌面安装包。

## 2. 发布前检查

要求 Node.js 22.12.0 或更高版本。在 `album-studio/` 执行：

```bash
npm ci
npx playwright install chromium
npm run check
npm run test:e2e
```

`npm run check` 包含环境检查、lint、TypeScript、单元/组件测试、桌面与浏览器构建、开发 smoke 和浏览器 E2E。桌面 Electron E2E 由 `npm run test:e2e` 单独执行，覆盖新建项目、拖动、照片编辑、自动保存、重开、关闭前保存和 PDF 导出。

需要一次执行两端 E2E 时可运行：

```bash
npm run test:e2e:all
```

## 3. 浏览器构建

```bash
cd album-studio
npm run build:web
```

开发调试使用 `npm run dev:web`，或双击仓库根目录的 `dev-web.command` / `dev-web.cmd`。Vite 会自动打开浏览器并提供 HMR。

浏览器项目保存在当前站点来源的 OPFS。发布到不同域名、端口或协议会形成不同的存储空间；清除站点数据会删除项目。上线前必须明确提醒用户导出或保留重要素材，不能把 OPFS 描述为等同于桌面项目目录的永久备份。

浏览器图片哈希与 `pica` 管线按需加载，不进入首页同步 chunk。本次基线中初始 JavaScript 从 534.44 kB 降至 461.31 kB（gzip 169.91 → 145.85 kB），图片管线形成独立的 73.25 kB chunk。

## 4. macOS

双击仓库根目录 `package-macos.command`，或执行：

```bash
cd album-studio
npm run package:mac
npm run verify:package
```

产物位于 `album-studio/apps/desktop/dist/`，当前配置生成 Intel + Apple Silicon 的 universal DMG。`sharp` 的 arm64/x64 原生包会被放入 ASAR 外部，`x64ArchFiles` 用于合并 universal 应用。

当前内测配置使用 ad-hoc 签名，`hardenedRuntime` 和 notarization 尚未启用。公开发布前必须：

1. 配置 Developer ID Application 签名。
2. 开启 hardened runtime 并复核 entitlements。
3. 在 CI 密钥库提供公证凭据并启用 notarization。
4. 执行 `codesign --verify --deep --strict`、`spctl --assess` 和项目 package smoke。

不要向仓库提交证书、密码或 Apple API key。

## 5. Windows

在 Windows 上双击仓库根目录 `package-windows.cmd`，或执行：

```text
cd album-studio
npm run package:win
npm run verify:package
```

当前配置生成 x64 NSIS 安装程序和 portable 可执行文件。至少在干净的 Windows 10/11 环境验证：

- NSIS 安装、快捷方式、启动与卸载。
- portable 启动。
- 中文路径下新建/打开项目与自动保存。
- 文件夹导入、`sharp` 衍生图、自由画布与照片编辑。
- 窗口关闭前的最后输入已保存。
- A4 横向、12 寸方形和 16:9 项目的 PDF 均可写入并重新打开，MediaBox 与项目 PageSpec 一致。

公开发布时应在 CI 密钥库配置 Authenticode，对 NSIS 和 portable 签名并验证时间戳。不要提交 `.pfx` 或密码。

## 6. 原生 CI

`.github/workflows/package.yml` 提供手动触发的 `macos-latest` / `windows-latest` 矩阵。每个 runner 会：

1. 按 `.nvmrc` 安装 Node.js 并执行 `npm ci`。
2. 安装 Playwright Chromium；macOS 额外准备 `sharp` 的双架构原生依赖。
3. 执行 `npm run check` 和桌面 `npm run test:e2e`。
4. 在当前原生平台打包。
5. 执行 `npm run verify:package`，真实启动已打包应用。
6. 上传 `apps/desktop/dist/`。

工作流配置只能说明验证路径存在；是否通过应以当次 Actions 运行记录和产物为准。Windows 启动正确性的最终证据必须来自 `windows-latest` 或真实 Windows 主机。

## 7. Package smoke 门禁

`npm run verify:package` 不是只检查文件存在。它会在 30 秒总时限内启动打包后的 Electron 可执行文件，通过 CDP 验证：

- 页面标题、React 根节点和 preload API 已就绪。
- 生产 CSP 严格生效。
- `app.asar` 不超过 64 MiB。
- `sharp` 及当前平台原生依赖位于包内；macOS universal 包同时含 arm64/x64 依赖。
- 验证结束后应用进程树被完整清理。

当前 macOS 本地基线已验证 universal 主程序与 helper 同时包含 x86_64/arm64、`codesign --verify --deep --strict` 通过、两套 `sharp` 原生依赖存在，且打包应用能通过真实启动 smoke。本次产物的 `app.asar` 为 1.36 MiB、universal `.app` 为 527 MiB、DMG 为 234,406,263 bytes（约 224 MiB）；体积会随版本和构建环境变化，不应作为固定发布承诺。

## 8. Electron 安全发布配置

| 配置                                       | 当前值 | 原因                                                                   |
| ------------------------------------------ | ------ | ---------------------------------------------------------------------- |
| sandbox / context isolation / web security | 开启   | 隔离 renderer 与系统权限                                               |
| Node integration                           | 关闭   | renderer 不直接访问 Node.js                                            |
| RunAsNode / Node options / CLI inspect     | 关闭   | 缩小生产攻击面                                                         |
| cookie encryption                          | 开启   | 加密 Electron cookie 存储                                              |
| embedded ASAR integrity                    | 开启   | 校验已打包代码完整性                                                   |
| only load app from ASAR                    | 开启   | 禁止从 ASAR 外加载应用代码                                             |
| file protocol extra privileges             | 开启   | 生产窗口使用 `loadFile()`；关闭会导致打包应用白屏/`ERR_FILE_NOT_FOUND` |

最后一项不能单独关闭来追求表面上的“更严格”。当前文件边界由 sandbox、严格 CSP、导航/权限拒绝、窄 preload/IPC、路径 realpath 校验和 `album-asset:` 协议共同保证。

## 9. PDF 发布检查

桌面端只在导出对话框存在时挂载共享 `PrintBook`，等待字体和所有打印图片完成解码，再调用 `printToPDF`。输出先写到同目录 `.partial`，成功后原子改名；Electron E2E 会检查生成文件具有 `%PDF-` 头。

浏览器端调用 `window.print()`，结果由浏览器/系统打印对话框决定，不提供桌面端的原生写文件 API。

## 10. 发布清单

- [ ] `npm run check` 通过。
- [ ] 桌面 Electron E2E 通过。
- [ ] 目标平台原生打包通过。
- [ ] `npm run verify:package` 在目标平台通过。
- [ ] Windows 安装/卸载或 macOS 挂载/启动完成手工抽查。
- [ ] 新建、导入、编辑、保存、重开和 PDF/打印完成冒烟验证。
- [ ] 公共发布所需签名、公证、版本号与发布说明已配置。
- [ ] 发布产物不包含测试项目、用户素材或签名密钥。
