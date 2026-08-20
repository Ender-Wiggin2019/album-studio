# 咔宝工程

**咔宝——翻阅时光记忆。**

`album-studio` 是 npm workspaces monorepo：Electron 桌面端和 Vite 浏览器端共用一套 React 工作室、相册文档和编辑命令。核心技术包括 Electron 43、React 19、TypeScript 5.9、Vite 7、Tailwind CSS v4、Zustand、Zod、Lexical、dnd-kit、`react-moveable`、`react-image-crop`、`sharp` 和 `pica`。

## 快速启动

需要 Node.js >= 22.12.0，建议使用 `.nvmrc` 指定的 Node 22。

从仓库根目录双击：

| 目标                  | macOS             | Windows       |
| --------------------- | ----------------- | ------------- |
| Electron + Vite HMR   | `dev.command`     | `dev.cmd`     |
| 本地浏览器 + Vite HMR | `dev-web.command` | `dev-web.cmd` |

启动器会检查 Node/npm，并在缺少依赖时自动执行 `npm install`。终端等价命令：

```bash
npm install
npm run dev
npm run dev:web
```

## 工作区结构

```text
apps/
├── desktop/
│   ├── src/main/              项目文件系统、图片管线、协议、PDF、IPC
│   ├── src/preload/           经校验的窄 Electron API
│   ├── src/renderer/          桌面 composition root 和 adapter
│   ├── scripts/               dev/package smoke
│   └── e2e/                   Electron 业务流程验收
└── web/
    ├── src/platform/          OPFS、File API、Blob URL、pica adapter
    └── e2e/                   导入、编辑、刷新恢复与打印

packages/
├── common/                       AlbumDocument v2、Block 命令、布局、PageSpec、crop/effects、IPC 契约
└── studio/
    └── src/
        ├── app/              应用入口、store、项目保存会话、StudioPlatform
        ├── pages/            项目首页与工作区页
        ├── features/         素材、组件、画布、布局、富文本、图片编辑、预览、装帧托盘
        ├── components/ui/    稳定的 UI 原语
        └── shared/           跨功能的窄共享实现
```

`apps/desktop` 和 `apps/web` 只组装平台能力；产品 UI 不在两端各维护一份。`packages/common` 不依赖 UI 或文件系统。

## 唯一项目格式

当前只有严格的 `AlbumDocument` v2：

- 项目创建时选择 A4 横向、12 寸方形或 16:9；整册页面共享唯一 `PageSpec`，创建后不可更改。
- 封面和内容页都保存单一有序 `Block[]`，图片、富文本、Icon 与贴纸按数组顺序共享图层。
- `ImageBlock` 保存归一化页面几何、原图百分比裁剪、框内旋转/翻转、effects、蒙版和内部说明。
- `RichTextBlock` 保存受严格约束的富文本文档；`DecorationBlock` 只引用内置 Icon/贴纸的稳定资源 ID。
- 页面布局按类型重排已有图片和文字 Block；自由变换后清空 `layoutId`，装饰 Block 不参与布局。
- 所有修改经过 `AlbumCommand`，一次命令生成一次 revision 和一组 undo/redo patch。

schema 入口严格校验，不猜测字段、不静默补值，也不维护并行的数据模型。

### 桌面项目文件夹

```text
我的旅行.album-project/
├── manifest.json
├── assets/
│   ├── original/             # SHA-256 命名的不可变原图
│   └── cache/<version>/...   # thumbnail/preview/print WebP，可重建
└── backups/                      # 最近 5 份 manifest 备份
```

manifest 不保存绝对路径、Base64 或派生图物理路径。原图流式复制并按 SHA-256 去重；`sharp` 负责解码安全检查、EXIF 方向和有界 WebP 派生图。

浏览器端使用同一文档语义，但物理存储位于当前 origin 的 OPFS，并由 `pica` 生成派生图。清除站点数据会删除浏览器项目。

## 常用命令

```bash
npm run check:env       # Node 版本
npm run dev             # Electron + Vite HMR
npm run dev:web         # 浏览器 + Vite HMR
npm run lint
npm run typecheck
npm test
npm run build:all       # desktop + web production build
npm run test:dev-smoke  # 真实 Electron dev/CSP/HMR
npm run test:e2e        # Electron 业务流程
npm run test:e2e:web    # 浏览器 OPFS/编辑/打印
npm run test:e2e:all    # Electron + 浏览器完整 E2E
npm run check           # 提交前综合门禁
```

`npm run check` 当前包含环境检查、lint、全 workspace typecheck/测试、双端 production build、真实 Electron dev smoke 和 Web E2E。Electron 完整业务 E2E 使用 `npm run test:e2e` 单独运行。

## 打包

```bash
npm run package:mac     # 必须在 macOS；Intel + Apple Silicon universal DMG
npm run package:win     # 必须在 Windows；x64 NSIS + portable
npm run verify:package  # 从已打包应用启动 renderer-ready smoke
```

Windows 的真实启动、安装和原生图片模块只在 Windows 主机/原生 CI runner 上验证。详细签名、CSP、Electron fuse 和发布门禁见 `../docs/release.md`。
