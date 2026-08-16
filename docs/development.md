# 开发指南

## 1. 环境与启动

- Node.js >= 22.12.0；仓库 `.nvmrc` 使用 Node 22。
- npm（随 Node 安装）。
- 桌面版支持 Windows 10/11 与受支持的 macOS。

环境检查：

```bash
node album-studio/scripts/check-env.mjs
```

如果已安装 nvm 但版本不符，先运行 `nvm use`。

最简单的启动方式：

| 模式     | macOS             | Windows       | 终端（`album-studio/`） |
| -------- | ----------------- | ------------- | ----------------------- |
| Electron | `dev.command`     | `dev.cmd`     | `npm run dev`           |
| Browser  | `dev-web.command` | `dev-web.cmd` | `npm run dev:web`       |

根目录启动器会检查 Node/npm、补齐依赖，然后启动 Vite HMR。Windows 通过 `ComSpec/cmd.exe` 调用 `npm.cmd`，避免 Node 22 直接 spawn 批处理文件的差异。

## 2. 当前分层

```text
album-studio/
├── apps/
│   ├── desktop/
│   │   ├── src/main/       Electron 特权能力、文件系统、sharp、PDF、IPC
│   │   ├── src/preload/    经 Zod 契约约束的窄 API
│   │   └── src/renderer/   desktop composition root 与 StudioPlatform adapter
│   └── web/
│       └── src/platform/   OPFS、File API、Blob URL、pica、window.print
├── packages/
│   ├── common/            schema、Block 命令、布局、PageSpec、crop/effects、IPC 契约
│   └── studio/
│       └── src/
│           ├── app/       provider、store、自动保存、应用入口
│           ├── pages/     页级组合
│           ├── features/  素材、组件、画布、布局、富文本、图片编辑、页面、预览
│           ├── components/ui/
│           └── shared/    跨 feature 的窄共享实现
└── scripts/                   环境检查和统一启动入口
```

主要边界：

- `packages/common` 是唯一文档模型和编辑规则的权威，不依赖 React、Electron 或浏览器存储。
- `packages/studio` 只通过 `StudioPlatform` 创建/保存项目、导入/读取素材和导出；不读取 `window.albumStudio`、物理路径或 OPFS handle。
- `apps/desktop` 和 `apps/web` 是平台 composition root。不要在两端复制页面或编辑逻辑。
- 新的跨平台能力先定义小而稳定的 `StudioPlatform` 契约，再分别实现 adapter。平台不支持的功能必须用 capability 隐藏或降级，不伪造成功。

## 3. `AlbumDocument` v2

应用只接受 `AlbumDocumentSchema` 严格解析的 v2；字段不合法时直接返回校验错误，不猜测、迁移或静默补值。旧 image-only 项目会收到“项目格式已更新，请新建项目”的明确提示。

核心不变量：

- `schemaVersion` 固定为 `2`；项目 `pageSpec` 必须是 A4 横向、12 寸方形或 16:9 之一，整册页面共享该尺寸。
- 第一页是唯一封面；封面和内容页都使用单一有序 `Block[]`，数组顺序就是跨类型图层顺序。
- `Block` 严格区分 `ImageBlock`、`RichTextBlock` 和 `DecorationBlock`；素材 ID、内容 hash、页面 ID 和整册 Block ID 必须唯一。
- Block 几何使用页面归一化 `x/y/width/height/rotationDeg`，不允许越过页面边界。
- 裁剪使用原图百分比 `crop.area`；框内旋转/翻转与元素旋转分离。
- effects 是非破坏性参数；预设只产生一组 effects。
- 富文本只接受 common schema 允许的段落、列表与行内格式；装饰只引用注册表内的稳定资源 ID。
- `layoutId` 只在图片与文字几何严格匹配布局时有效；任一参与布局的 Block 自由变换都会清空它，装饰不受布局影响。

修改文档时调用 `executeAlbumCommand`，不直接对 store 中的深层对象做临时 mutation。命令统一增加 revision，并返回 Immer patches 用于有界 undo/redo。

## 4. 存储与图片管线

### 桌面 adapter

```text
<title>.album-project/
├── manifest.json
├── assets/
│   ├── original/<sha256>.<ext>
│   └── cache/<pipeline-version>/<sha256>/<variant>-<size>.webp
└── backups/manifest-r<revision>-<timestamp>.json
```

- main 流式复制原图、计算 SHA-256、`fsync` 临时文件并原子 rename。相同内容只保存一份原图。
- `sharp` 检查真实编码、EXIF 方向和 8000 万像素上限，并以并发 2 生成可重建 WebP。thumbnail/preview 有界缩小，print 根据 ImageBlock 占当前 PageSpec 300 DPI 页面的比例计算。
- `album-asset:` 只接受安全 project/asset ID、管线版本和有效 quality，用 `net.fetch(file:)` 流式返回且设置 immutable cache。
- manifest 按项目串行保存，拒绝过期 revision，原子替换并最多保留 5 份备份。
- 真实路径只留在 main 和 desktop adapter 的内存映射中，不进入共享工作室或 manifest。

### Browser adapter

- 项目、原图和版本化 cache 位于 `navigator.storage` 提供的 OPFS。
- 图片以流式 SHA-256 去重，`createImageBitmap` 处理方向和尺寸，`pica` 以并发 2 生成 WebP。
- 图片源使用引用计数的 Blob URL cache，最后一个消费者释放后 `URL.revokeObjectURL`。
- 持久存储请求可以被浏览器拒绝；清除 origin 数据会删除项目。不要将 OPFS 宣传为桌面文件夹的完全等价归档。

## 5. 渲染与编辑边界

- 画布、页面缩略图、预览和打印共用 `AlbumPageView` / `BlockView` 及三类 Block View。不为 PDF 或浏览器创建第二套布局模型。
- dnd-kit 只负责从素材/组件来源投放新 Block；`react-moveable` 只负责已放置 Block，手势期间预览 DOM，结束时提交一个 `set-block-transform` 命令。
- 右侧宽屏面板和中窄窗口 Sheet 复用同一个 `RightPanel`；布局、素材、组件是常驻 Tab，选中 Block 时出现条件编辑 Tab。
- Lexical 只为选中的 RichTextBlock 按需加载。输入先进入临时 draft，失焦、切页、预览、导出、返回或关闭前由保存会话提交。
- `react-easy-crop` 以 `croppedAreaPercentages` 保存，并用 `initialCroppedAreaPercentages` 恢复。取消不提交，应用只提交一个编辑命令。
- 共享工作室通过 `AssetImage/useAssetSource` 请求 thumbnail/preview/print/original，并由 adapter 管理资源生命周期。
- 图片编辑器和工作区重依赖使用 React lazy import，首页不应提前加载。

## 6. Electron 安全与启动

- renderer 启用 sandbox、context isolation 和 web security，禁用 Node integration。
- preload 只暴露项目、素材、PDF 和关闭握手所需的窄 API；不暴露 `ipcRenderer`、`fs` 或任意路径读取。
- 禁止新窗口、页面导航和权限请求；应用使用单实例锁。
- 启动会 `await loadURL/loadFile`，并报告 `did-fail-load`、`preload-error` 和 `render-process-gone`，用户可复制中文错误后退出。
- 开发 CSP 仅为 Vite React Refresh 放开 inline script 和 HMR 连接；production 保持 `script-src 'self'` 和本地 `connect-src`。
- production 使用 `loadFile(file:)`，因此 `grantFileProtocolExtraPrivileges` fuse 必须开启；这不改变 sandbox/Node integration/CSP 边界。完整 fuse 设置见 `apps/desktop/electron-builder.yml`。

## 7. 命令与验证

以下命令在 `album-studio/` 执行：

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build:all
npm run test:dev-smoke
npm run test:e2e
npm run test:e2e:web
npm run check
```

各门禁的证明范围：

- `npm run test:dev-smoke`：启动真实 `electron-vite dev`，断言 React 挂载、preload、dev CSP，并修改探针 CSS 验证 HMR 未整页重载。
- `npm run test:e2e`：v2 桌面项目、三类 Block、自由变换、裁剪美化、自动保存、重开、关闭前保存和三种 PageSpec PDF MediaBox。
- `npm run test:e2e:web`：OPFS 导入、自由编辑、刷新恢复、Blob URL 资源和浏览器打印。
- `npm run verify:package`：从已打包可执行文件启动，检查 `app.asar` 不超过 64 MiB、`sharp/@img` 原生包、React DOM、preload 和严格 production CSP，总超时后清理进程树。

可见 UI 改动还要检查 1440 × 900、1100 × 720 和 800 × 640，以及长中文、空状态、导入失败、缺图和保存失败。

## 8. 改动检查清单

- 修改 schema/命令时：在 `packages/common/tests` 保护严格解析、不变量、revision 和 patches。
- 修改共享 UI 时：只在 `packages/studio` 改一份，并在 desktop/web 两个 adapter 上检查 capability。
- 修改 Electron 契约时：同步 common IPC schema、main handler、preload 和 desktop adapter，不得将特权 API 扩散到 Studio。
- 修改图片管线时：测试内容去重、像素上限、EXIF、并发、原子失败清理、路径穿越/符号链接和 cache 重建。
- 修改打包时：在目标平台运行 package smoke。Windows 证据必须来自 Windows 原生主机或 CI runner。

关键决策见 `docs/adr/`，发布流程见 `docs/release.md`。
