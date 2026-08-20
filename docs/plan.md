# 咔宝实施基线

> 状态：当前架构已落地，本文用于定义继续迭代时不可破坏的边界
>
> 实施目录：`album-studio/`
> 更新日期：2026-08-16

## 1. 产品目标

咔宝是一套离线优先的相册排版工具，面向不熟悉命令行的用户，同时提供完整桌面端和轻量浏览器端：

- macOS、Windows 用户可以双击启动器进入桌面应用。
- 开发者可以在浏览器中快速调试共享界面与业务逻辑。
- 图片、富文本、Icon 和贴纸都作为 Block，像幻灯片元素一样自由拖动、缩放、旋转和调整跨类型图层。
- 图片编辑支持裁剪、翻转、旋转、滤镜、美化与蒙版，且始终保留原图。
- 项目可自动保存、撤销/重做，并按创建时选择的 A4 横向、12 寸方形或 16:9 尺寸输出。
- 数据、页面、组件、平台能力与文件系统清晰分层，便于继续维护和扩展。

`原始项目参考/` 只提供产品需求参考，不属于当前运行时、数据格式或接口的一部分。

## 2. 成功标准

| 领域     | 验收标准                                                                        |
| -------- | ------------------------------------------------------------------------------- |
| 启动     | macOS 与 Windows 桌面启动器无需用户输入命令；浏览器启动器自动打开页面           |
| 开发体验 | React/CSS 修改自动热更新，CSS HMR 不触发整页重载                                |
| 数据     | 只接受唯一的 `AlbumDocument` schema v2，不进行隐式修补、迁移或格式猜测          |
| 编辑     | 自由画布支持拖动、缩放、旋转、吸附、层级、复制、删除和键盘微调                  |
| 图片     | 原图内容寻址去重；预览/打印衍生图可重建；裁剪与效果为非破坏性参数               |
| 桌面     | 项目目录可整体备份与移动；自动保存可靠；原生 PDF 导出成功                       |
| 浏览器   | OPFS 项目可创建、导入、编辑、刷新恢复，并可调用系统打印                         |
| 打包     | macOS universal DMG 与 Windows x64 NSIS/portable 均由各自原生环境构建并运行验证 |
| 安全     | renderer 无 Node 权限；IPC、CSP、协议、路径和 Electron fuses 均有明确边界       |

## 3. 范围与非目标

当前范围包括：

- 封面与内容页、3 套主题、3 种成品尺寸、7 种纯图片布局和 3 种图文混合布局。
- 项目素材与文字/Icon/贴纸组件来源、右侧常驻装帧托盘和受限富文本编辑。
- 图片/文件夹导入、自由排版、裁剪、8 类图像参数、预设滤镜和 7 种蒙版。
- 桌面项目目录、浏览器 OPFS、最近项目、自动保存和有界撤销/重做。
- 桌面 PDF、浏览器打印、响应式工作区和无障碍基础交互。
- macOS/Windows 原生打包、开发 smoke、浏览器/桌面 E2E 和打包 smoke。

当前不包含云同步、多人协作、移动端原生应用、视频、账号体系、自动更新、正式代码签名与公证。浏览器端也不承诺跨浏览器持久保存或读取桌面 `.album-project` 目录。

## 4. 分层架构

```text
album-studio/
├── apps/
│   ├── desktop/       Electron main/preload 与桌面 StudioPlatform 适配器
│   └── web/           Vite 浏览器入口与 OPFS StudioPlatform 适配器
├── packages/
│   ├── common/        AlbumDocument、命令、模板、裁剪/效果、IPC 契约
│   └── studio/        共享 React 产品界面与状态编排
└── scripts/           环境检查与开发入口
```

`packages/studio` 继续按以下职责组织：

- `app/`：应用装配、路由级状态和平台注入。
- `pages/`：首页、工作区等页面组合。
- `features/`：画布、照片编辑、素材、预览、导出等业务能力。
- `components/ui/`：无业务语义的基础组件。
- `shared/`：跨功能的 hooks、样式和小型工具。

桌面端和浏览器端只负责组合根与平台能力，不复制相册业务逻辑。所有跨端数据结构和命令放在 `packages/common`，所有共享产品 UI 放在 `packages/studio`。

## 5. 唯一文档格式

当前持久化格式是严格的 `AlbumDocument` schema v2：

- 项目保存唯一 `PageSpec`，只能是 A4 横向、12 寸方形或 16:9；封面固定为第一且唯一的封面页。
- 封面和内容页都持有单一有序 `Block[]`；ImageBlock、RichTextBlock 与 DecorationBlock 按数组顺序共享图层。
- ImageBlock 保存归一化几何、裁剪、翻转、效果、蒙版与内部说明；RichTextBlock 保存受限富文本文档；DecorationBlock 引用内置稳定资源 ID。
- 主题仅为 `journal`、`postcard`、`film`。
- 页面布局以 typed slots 重排数量匹配的图片和文字；用户自由变换参与布局的 Block 后清除 `layoutId`，装饰保持不变。
- 所有编辑通过 `AlbumCommand` 完成，并产生 Immer patches；撤销/重做历史最多保留 100 步。
- 每次成功命令都会递增 revision；保存端拒绝过期 revision 覆盖新数据。

不在 schema 入口添加容错字段、格式猜测或隐藏转换。格式升级必须单独设计新版本并由明确产品决策批准。

## 6. 核心产品流程

### 6.1 桌面端

1. 选择成品尺寸和主题，新建或打开 `.album-project` 项目目录。
2. 导入 JPEG、PNG、WebP 或 AVIF 图片/文件夹。
3. 从常驻素材/组件面板点击或拖入 Block，选择页面布局快速起稿，再在自由画布上精调。
4. 打开照片编辑器完成裁剪、旋转、翻转、滤镜和蒙版。
5. 自动保存写入项目目录；错误时显示原因与重试入口。
6. 预览整册并按项目 PageSpec 导出 PDF。

### 6.2 浏览器端

1. 在当前站点来源的 OPFS 中创建项目。
2. 导入图片或文件夹，使用与桌面端相同的页面、画布和照片编辑能力。
3. 自动保存到 OPFS，刷新后从最近项目恢复。
4. 通过浏览器打印对话框输出 PDF 或纸张。

浏览器会请求持久存储，但浏览器仍可能回收空间；清除站点数据会删除项目。因此浏览器端适合调试和轻量使用，不替代桌面项目目录的可见备份能力。

## 7. 自由画布与图片处理

- `react-moveable` 负责拖动、8 个缩放手柄、旋转与吸附。
- 手势进行时只更新 DOM 预览；结束时提交一个 `set-block-transform` 命令，避免高频写入状态和历史。
- 吸附来源包括页面参考线、其他 Block 边缘/中心、间距与常用旋转角度。
- `react-easy-crop` 负责裁剪视口；编辑草稿只有在“应用”时才提交一次命令。
- 效果包含亮度、对比度、饱和度、色相、棕褐、灰度、模糊和暗角，并提供 8 个组合预设。
- 裁剪、旋转、翻转、效果和蒙版都保存在 ImageBlock 参数中，不覆盖原图。
- 编辑画布、页面缩略图、整册预览和打印统一复用 `AlbumPageView` / `BlockView`，避免三类 Block 的表现漂移。

## 8. 文件系统与性能

桌面项目目录：

```text
项目名.album-project/
├── manifest.json
├── assets/
│   ├── original/<sha256>.<ext>
│   └── cache/<pipeline-version>/<sha256>/<variant>-<size>.webp
└── backups/manifest-r<revision>-<timestamp>.json
```

- 原图通过流式复制、SHA-256 去重、临时文件 `fsync` 和原子改名写入，绝不原地修改。
- `sharp` 解码 JPEG/PNG/WebP/AVIF，自动处理 EXIF 方向，并拒绝超过 8000 万像素的图片。
- 缩略图为 480×360，预览图为 1600×1200；打印图按页面占比生成并受尺寸上限保护。
- 衍生图并发限制为 2；缓存版本变化时可以安全重建。
- 最近 5 份 manifest 自动备份；项目与素材路径都经过 realpath、符号链接和根目录边界检查。
- `album-asset:` 只接受安全的资源标识、版本和质量参数，并通过 Electron 网络层流式读取。

浏览器端使用 OPFS 保存相同语义的数据，使用 `createImageBitmap`、`pica` 和 `hash-wasm` 完成解码、缩放与哈希，并对 Blob URL 做引用计数和及时回收。

## 9. 启动、构建与安全

| 场景               | 简单入口                | 命令入口              |
| ------------------ | ----------------------- | --------------------- |
| macOS 桌面开发     | `dev.command`           | `npm run dev`         |
| Windows 桌面开发   | `dev.cmd`               | `npm run dev`         |
| macOS 浏览器开发   | `dev-web.command`       | `npm run dev:web`     |
| Windows 浏览器开发 | `dev-web.cmd`           | `npm run dev:web`     |
| macOS 打包         | `package-macos.command` | `npm run package:mac` |
| Windows 打包       | `package-windows.cmd`   | `npm run package:win` |

开发入口要求 Node.js 22.12.0 或更高版本。桌面 renderer 启用 sandbox、context isolation 与 web security，禁用 Node integration；preload 只暴露经过 Zod 校验的窄 API。应用拒绝新窗口、外部导航和权限请求。

生产包启用严格 CSP、cookie encryption、ASAR integrity 与 only-load-from-ASAR，并关闭 RunAsNode、Node options 和 CLI inspect。`grantFileProtocolExtraPrivileges` 必须保持开启，因为生产窗口通过 `loadFile()` 加载已打包页面；文件访问边界由 sandbox、CSP、导航限制、窄 IPC 和 `album-asset:` 协议共同负责。

## 10. 验证与发布门禁

```bash
cd album-studio
npm ci
npx playwright install chromium
npm run check
npm run test:e2e
```

`npm run check` 依次覆盖环境、lint、类型、单元/组件测试、桌面和浏览器生产构建、开发服务器 smoke 与浏览器 E2E；桌面 Electron E2E 由后续 `npm run test:e2e` 单独执行。

打包 smoke 还会检查：

- 已打包进程能在 30 秒总时限内启动并通过 CDP 返回界面。
- React 根节点、标题、preload API 与生产 CSP 均已就绪。
- `app.asar` 不超过 64 MiB。
- `sharp` 及当前平台原生依赖存在，macOS universal 包同时包含 arm64/x64 依赖。
- 测试结束后进程树被清理。

GitHub Actions 在 `macos-latest` 和 `windows-latest` 上分别执行完整检查、桌面 E2E、原生打包和 package smoke。Windows 是否可启动只以 Windows runner 或真实 Windows 机器的结果为依据，macOS 交叉构建不能替代运行验证。

## 11. 已知边界

- 浏览器 OPFS 的持久性取决于浏览器配额与用户是否清除站点数据。
- 浏览器端使用系统打印，不提供 Electron 原生 PDF 写文件能力。
- 当前内测包使用 macOS ad-hoc 签名；公开发布仍需 Apple Developer ID、公证和 Windows Authenticode。
- 长相册导出会同时挂载打印树；需要继续以真实大图和长页数样本监控内存峰值。
- schema、命令和平台能力是架构边界；新增功能应先确认归属，避免在页面组件中直接访问文件系统或复制跨端逻辑。

## 12. 相关文档

- 使用说明：`docs/user-guide.md`
- 开发说明：`docs/development.md`
- 发布说明：`docs/release.md`
- 设计方向：`docs/design-direction.md`
- 架构决策：`docs/adr/`
