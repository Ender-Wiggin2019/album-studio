# 当前目标：可运行、可维护的跨平台自由画布相册工作室

> 状态：实现完成；macOS 与 Web 已本机验收，Windows 等待原生 CI/主机运行证据
>
> 建立日期：2026-08-15

## 已确认事实

- [x] Node.js `v22.22.0` 满足工程要求，开始审计时 Git 工作树干净。
- [x] 真实复现 macOS 开发态白屏：Electron 注入的开发 CSP 阻止 Vite React Refresh preamble，renderer 报 `@vitejs/plugin-react can't detect preamble`，`#root` 为空。
- [x] 证明 preload、renderer URL、Vite WebSocket、业务 React 初始化和 GPU 均不是白屏根因。
- [x] 基线 `npm run check` 通过：它只覆盖 production build，不能防止当前 dev/HMR 回归。
- [x] 确认 Windows `spawn("npm.cmd")` + `shell:false` 存在 Node 22 启动风险；当前 macOS 环境不能冒充 Windows 原生运行结果。
- [x] 确认现有 macOS package smoke 只检查进程存活，而且退出等待会挂死；它不能识别白屏。
- [x] 确认现有裁剪持久化把 Cropper 像素位移和 CSS 百分比位移混为一谈，无法保证重开后的视觉等价。
- [x] 确认现有 `PhotoSlot`、1–6 固定布局和全量项目快照 history 不适合自由拖拽画布。
- [x] 确认内容寻址原图、项目目录、原子 manifest、备份和协议路径校验方向正确，应深化而不是推倒重来。
- [x] 用户确认可以全新定义项目格式，不保留旧 JSON/HTML importer，也不迁移首版 V1 manifest。

## 实施假设与取舍（请在确认计划时一并确认）

- 桌面版仍是完整交付形态；浏览器版是同一编辑器的轻量离线模式和调试入口，不加入云同步或多人协作。
- 浏览器版使用 OPFS 保存项目和图片；浏览器清站点数据会删除这些数据，因此桌面 `.album-project` 仍是最适合长期归档的格式。
- 删除“原始项目参考”JSON/HTML importer、首版 V1 manifest、旧模板和所有兼容分支；新实现只维护一个权威格式。
- 继续使用 DOM 作为编辑、预览和 PDF 的唯一渲染源。使用 `react-moveable` 完成元素拖拽/缩放/旋转/吸附，保留 `react-easy-crop` 完成框内裁剪；不引入 Fabric/Konva 形成第二套画布渲染。
- 桌面图片管线使用 `sharp` 处理方向、元数据和有界缩略图，浏览器图片管线使用 `pica`；两者都在目标平台 CI 中验证，不能只验证 TypeScript。
- macOS 在本机做真实 dev、production、打包与启动验收；Windows 通过原生 Windows CI 完成 dev/package/portable smoke，本机只做可证明的静态与交叉产物检查。

## 目标结构

```text
album-studio/
├── apps/
│   ├── desktop/               Electron main、preload、desktop adapter、桌面验收
│   └── web/                   Vite 入口、browser adapter、浏览器验收
├── packages/
│   ├── common/                AlbumDocument schema、命令、几何、模板、effects
│   └── studio/                app、pages、features、components/ui、shared、编辑状态
└── scripts/                   统一环境检查、desktop/web 启动与 smoke
```

`packages/studio` 按业务所有权组织；`components/ui` 只保留稳定的 shadcn 原语，页面负责组合，跨模块纯逻辑进入 `common`，平台文件能力只存在于 desktop/web adapter。

## 1. 修复启动与开发体验

- [x] 仅在开发态允许 Vite React Refresh 必需的 inline preamble，production CSP 继续保持 `script-src 'self'`。
- [x] `await loadURL/loadFile`，记录 `did-fail-load`、`preload-error`、`render-process-gone`，并在启动失败时显示可复制的中文错误而不是白屏。
- [x] 增加单实例锁；重复启动已打包应用时聚焦已有窗口，避免多个进程同时保存同一项目。
- [x] Windows 启动器通过 `ComSpec/cmd.exe` 正确执行 npm；macOS/Windows 都检查 Node、npm 和依赖完整性，并在失败时保留可读提示。
- [x] 增加 `dev:web` 与根目录 `dev-web.command` / `dev-web.cmd`；desktop 与 web 支持 HMR，浏览器入口自动打开默认浏览器。
- [x] 建立真实 dev smoke：断言 React 已挂载、preload 可用、无 CSP/preamble 错误，并验证 renderer HMR 不重启窗口。
- [x] 验证 macOS desktop dev、浏览器 dev 与子进程清理路径。
- [ ] 在 `windows-latest` 或真实 Windows 主机执行本次 workflow，取得 Windows dev/package/runtime 证据；macOS 不替代该证据。

## 2. 建立清晰分层与真实平台 seam

- [x] 将共享 React 应用迁入 `packages/studio`，按 `app / pages / features / components / shared` 分层；desktop/web 只保留 composition root 和 adapter。
- [x] 定义小而稳定的 `StudioPlatform` interface；desktop adapter 封装 preload，browser adapter 封装 OPFS/File API/打印能力。
- [x] 删除 React 内所有直接 `window.albumStudio`、路径和 `album-asset:` 拼接；统一由 platform 和 `AssetImage/useAssetSource` 获取资源并释放 Blob URL。
- [x] 将通用 `mutateProject(recipe)` 替换为 AlbumDocument 命令 interface，使 schema 不变量、revision、dirty 和 undo 有单一实现来源。
- [x] 合并 `lib/utils.ts` / `lib/cn.ts` 这类浅转发模块，删除迁移后失效的文件、导入和样式。
- [x] 验证 desktop 与 web 使用同一页面、编辑器和 effects；跨模块引用经公开入口，lint/typecheck/build 通过。

## 3. 全新文档模型与 legacy 删除

- [x] 定义唯一的 `AlbumDocument` v1：内容页使用有序 `ImageElement[]`，数组顺序即图层顺序。
- [x] 每个图片元素只保留一份 `transform { x, y, width, height, rotationDeg }`，使用归一化页面坐标。
- [x] 裁剪只保存原图百分比区域 `crop.area`；缩放/位移由裁剪区域推导，不再并存两套含义。
- [x] effects 保存 brightness、contrast、saturation、hue、sepia、grayscale、blur、vignette 等非破坏性参数；滤镜预设只是写入参数的纯命令。
- [x] 模板只负责一次性写入元素几何；手动变换后清空 `templateId`，渲染始终读取元素数据。
- [x] 封面 hero 使用同一个图片元素渲染/effects 模块。
- [x] 删除旧 schema、`PhotoSlot`、crop/scale 双状态、旧模板、JSON/HTML importer 及对应 IPC/UI/测试。
- [x] 新项目只写入当前 schema；parse、store、renderer 与 main 均无旧格式 fallback。
- [x] 验证严格拒绝旧字段；保存重开后 transform、crop、effects 和层级保持一致。

## 4. 图片文件系统与性能管线

- [x] 保持 `manifest.json + assets/original + 可重建 cache + backups`；manifest 不保存绝对路径、Base64 或派生图物理路径。
- [x] 原图按 SHA-256 流式复制到临时文件，`fsync` 后原子 rename；同内容只存一份，放置项不合并。
- [x] `sharp` 自动处理 EXIF 方向、像素上限和颜色信息；以并发 2 生成带版本的 preview/print WebP cache，失败可清理并重建。
- [x] print 派生图按页面物理尺寸与目标 DPI 计算，不再用固定 1600px 代表所有页面。
- [x] `album-asset:` 使用流式响应和 `immutable` 缓存，不再为每次请求 `readFile` 整张图片。
- [x] renderer 使用用途明确的 thumbnail/preview/print/original，并使用 lazy decode、稳定尺寸和 `content-visibility`。
- [x] 浏览器 adapter 在 OPFS 保存同构 manifest/original/cache，使用 `pica` 有界生成缩略图，通过 object URL cache 获取并及时 revoke。
- [x] 验证 hash 去重、EXIF、超大像素拒绝、并发同图、原子失败清理、cache 重建、路径穿越/symlink、流式读取与浏览器 reload 持久化。

## 5. Slides 式自由画布和模板

- [x] 画布支持选中、自由拖动、八向缩放、元素旋转、页面/中心/其他元素吸附和可见参考线。
- [x] 拖动期间只更新局部 DOM/ref；`dragEnd/resizeEnd/rotateEnd` 各提交一个命令和一个 undo 项，避免每帧克隆项目。
- [x] 支持键盘微移、前移/后移、复制、删除和撤销/重做；所有动作真实写入自动保存文档。
- [x] 提供可识别的模板缩略图；应用模板后仍可自由修改，且可一次撤销。
- [x] 自由画布、页面缩略图、整册预览和 PDF 共用同一 `ImageElementView`。
- [x] 在 1440×900、1100×720、800×640 保持画布为主任务；窄视口属性面板可达且根页面不横向滚动。
- [x] 命令/E2E 验证拖动、层级、模板、reload 持久化与一次动作一次 undo。
- [ ] 后续性能基线：在代表性真实图片上记录 50/185 个放置项的长时间编辑与导出内存峰值。

## 6. 裁剪、旋转、滤镜与美化

- [x] 按 `react-easy-crop` 的 `croppedAreaPercentages` 保存与 `initialCroppedAreaPercentages` 恢复裁剪。
- [x] 框内支持裁剪、平移、缩放、旋转和翻转；元素旋转与框内图片旋转语义分离。
- [x] 提供原图、鲜亮、暖阳、清透、胶片、黑白、柔和、高对比等预设，并允许独立调节 effects 参数与蒙版。
- [x] 编辑使用草稿；取消不修改文档，“应用到照片”只产生一个命令；重置恢复可预期默认值。
- [x] 编辑/预览/PDF 使用同一 crop/effects 计算；不生成第二份已编辑原图，不破坏 `assets/original`。
- [x] 纯计算与 E2E 验证裁剪恢复、任意角旋转、翻转、滤镜组合和单次应用提交边界。

## 7. 构建、体积和跨平台交付

- [x] 懒加载 Studio/编辑器/照片编辑依赖；应用外壳使用系统字体并记录 renderer 初始 bundle。
- [x] electron-builder 使用严格白名单，仅包含 `out/`、必要 resources 和未被 bundle 的生产运行时依赖；正确 externalize/asarUnpack `sharp` 与 `@img`。
- [x] 用跨平台 renderer-ready smoke 替换“存活 3 秒”；总超时、正常退出和强制清理都有上限。
- [x] macOS 生成 universal DMG，并验证 arm64/x64 可执行结构、签名、DOM/preload/UI；业务 E2E 验证创建/导入/保存/PDF。
- [ ] 在 Windows runner 原生生成 NSIS + portable，并取得安装/快捷方式/启动/卸载、中文路径、导入/保存/PDF 与关闭前保存的当次运行证据。
- [x] package workflow 纳入可重复验证，不把 macOS 交叉生成 PE 文件描述成 Windows 已运行。
- [x] 记录本次 macOS universal app 527 MiB、DMG 234,406,263 bytes、ASAR 1.36 MiB；desktop 初始 renderer 456.49 kB（重构前约 1.15 MB）；Web 图片管线按需加载后初始 chunk 从 534.44 kB 降至 461.31 kB。

## 8. 完成门禁

- [x] `npm run lint`、全 workspace typecheck、unit/component/integration tests 和 production build 全部通过。
- [x] Electron production E2E 覆盖新建→导入→模板→自由变换→裁剪/滤镜→自动保存→重开→PDF。
- [x] Web E2E 覆盖新建→导入→编辑→刷新恢复→打印，以及 capability 对不支持动作的真实隐藏。
- [x] dev smoke 覆盖实际 Vite/Electron CSP 和 HMR；package smoke 覆盖实际 renderer-ready，不再以进程存活代替 UI。
- [x] 视觉检查覆盖 1440×900、1100×720、800×640，E2E 覆盖空/processing/长中文与 PDF 文件输出。
- [x] `npm run check` 成为包含关键回归的单一门禁；原生 package workflow 让 macOS/Windows 承担各自可证明的检查。

## 9. 实现后架构复盘与继续优化

- [x] 创建/更新 `CONTEXT.md` 的相册领域词汇，并先读取相关 ADR。
- [x] 按 `improve-codebase-architecture` 使用 Explore 子代理扫描 deepening opportunities，执行 deletion test，检查 interface、seam、adapter、depth、leverage 和 locality。
- [x] 将带每个候选 before/after 图、强度 badge 和 Top recommendation 的 Tailwind + Mermaid 单文件 HTML 写到系统临时目录并打开。
- [x] 根据用户本次“自己选择并优化”的授权，选择 Top recommendation；用 `codebase-design` 设计小 interface 后实施。
- [x] 为项目保存会话补 4 个故障注入回归测试，并重跑完整门禁、双端 E2E 与 package smoke。

## Review

本轮按“全新格式、不保留旧格式兼容”完成重建：桌面与浏览器共用 `packages/studio`，`packages/common` 只维护严格 `AlbumDocument` v1 与 Album Command；固定照片位、旧 importer、旧 schema 和兼容分支已删除。桌面图片管线使用内容寻址、原子写入、`sharp` 与可重建缓存；浏览器使用 OPFS、流式 SHA-256、`pica` 与 Blob URL 生命周期管理。

编辑器已支持模板起稿、自由拖动/缩放/旋转/吸附、图层与键盘操作，以及非破坏性裁剪、框内变换、8 套滤镜预设、精细 effects 和 7 种蒙版。desktop/web 使用同一 DOM 渲染链完成编辑、预览和 PDF/打印。

`improve-codebase-architecture` 报告位于 `/tmp/architecture-review-20260816-004428.html`，已打开。Top recommendation“项目编辑会话”已实施：自动保存、返回、导出和关闭统一经过有序 `flush()`；保存中继续编辑、旧失败、debounce 和重试由 4 个故障注入测试保护。详见 ADR 0007。

最终本机证据：`npm run check` 通过；common 19、Studio 9、desktop 27、Windows 启动逻辑 4 个测试全部通过；Electron E2E 3/3、Web E2E 1/1 通过；真实 dev CSP/HMR smoke 和 packaged renderer-ready smoke 通过。macOS universal 主程序/helper 均为 x86_64 + arm64，双架构 Sharp/libvips 与严格 codesign 校验通过。产物为 527 MiB `.app`、234,406,263 bytes DMG、1.36 MiB ASAR；desktop 初始 renderer 从约 1.15 MB 降至 456.49 kB，Web 图片管线延迟加载后初始 chunk 从 534.44 kB 降至 461.31 kB（gzip 169.91 → 145.85 kB）。

唯一未在本机声称完成的是 Windows 原生运行、安装和卸载。workflow 已在 `windows-latest` 配置完整 check、Electron E2E、NSIS/portable 打包与 package smoke，需以当次原生 CI 或真实 Windows 主机结果作为最终证据。公开分发还需要外部 Developer ID/Notary 与 Authenticode 证书。50/185 放置项的长时间真实图片内存基线列为后续性能观测，不恢复任何旧格式逻辑。

---

# 当前任务：完善项目开发 Skill

> 状态：完成
>
> 默认约定：增强已有 `.agents/skills/album-studio-dev`，避免创建重复 Skill；“为我启动”默认指 Electron 桌面版，明确提到 Web/网页版时才启动浏览器版。

## 计划

- [x] 更新 Skill 触发词、启动流程和简单中文对话规则。验证：“为我启动”无需补充技术信息即可执行。
- [x] 增加项目分层与开发决策参考，覆盖 `common / studio / desktop / web`、第三方库检查、Lucide React、shadcn 和双端兼容。验证：典型新功能能明确落到正确模块。
- [x] 生成与 Skill 一致的 `agents/openai.yaml`。验证：UI 名称、简介和默认提示词符合 Skill Creator 约束。
- [x] 运行 `quick_validate.py` 并用简单启动/功能需求做独立前向测试。验证：结构校验通过，回答用词简单且分层判断正确。

## Review

已在原有 `album-studio-dev` 上完成增强，没有创建重复 Skill。`SKILL.md` 现在可直接处理“为我启动”，默认启动桌面版，并要求使用简单中文汇报。`references/project-development.md` 记录了项目分层、第三方库选择、Lucide React、shadcn、`StudioPlatform` 双端接入和验证门禁；`agents/openai.yaml` 提供了 Skill 列表信息。

`quick_validate.py` 和内容完整性检查通过；启动器 4 个单元测试通过。独立场景测试能把新功能正确放到共享界面和双端 adapter；首次启动回答曾未明确默认端，收紧规则后复测已明确为“桌面版”且不向普通用户暴露 Electron 术语。

## 当前任务：修复画布变换控制点立即失焦

> 状态：已完成
>
> 建立日期：2026-08-16

### 已确认事实

- [x] Node.js `v22.22.0` 满足工程要求。
- [x] Chromium 真实复现：图片选中后有 9 个 Moveable 控制点；东南缩放控制点 `pointerdown` 的同一瞬间，控制框消失且图片选中状态被清空。
- [x] 根因是 Moveable 控制点位于 `.canvas-sheet` 内，事件冒泡触发页面的 `selectPage()`；该 store action 会无条件清空 `selectedElementId`。
- [x] 运行时仅阻断来自 `.moveable-control-box` 的冒泡后，控制点按下与松开期间选中状态保持，排除 CSS 穿透、target selector 失效和变换提交时机问题。

### 计划

- [x] 在 Web Playwright E2E 增加失败回归：缩放、旋转控制点操作期间保持选中，并将尺寸/角度真实写入 manifest；点击普通页面空白仍取消选择。
- [x] 在共享 Studio 画布组件中收紧页面选择事件边界，仅排除 Moveable 控制框，保留图片选择、图片拖动和空白取消选择的原行为。
- [x] 运行定向 Web E2E、Studio 测试和 `npm run check`；复查桌面与 Web 的共享使用位置及无新增运行时错误。

### Review

根因是 `.canvas-sheet` 的 `pointerdown` 无条件调用 `selectPage()`，而 Moveable 缩放/旋转控制框正渲染在该节点内；控制点事件冒泡后清空 `selectedElementId`，所以操作在按下鼠标的同一瞬间失焦。修复只让画布页面选择处理忽略来自 `.moveable-control-box` 的事件，图片主体、页面空白和外层空白的原有选择语义不变。

Web Playwright 回归先在东南缩放柄 `mouse.down()` 后稳定红灯，再于修复后连续通过 3 次；它验证缩放柄和旋转柄在按下、拖动、松开期间保持选中，width/height/rotationDeg 与 revision 分别写入 OPFS manifest，并验证页面空白仍取消选择。最终 `npm run check` 全部通过：lint、全 workspace typecheck、common 19、Studio 9、desktop 27、Windows 启动逻辑 4 项测试、desktop/web production build、真实 dev smoke 和 Web E2E 均通过；Electron E2E 另行 3/3 通过。

## 当前任务：修复图片缩放坍缩与比例漂移

> 状态：已完成
>
> 建立日期：2026-08-16

### 已确认事实

- [x] 宽窗口稳态拖动不会坍缩；在 800×640 窄窗口将画布滚到底部后，东南角只移动 1px 即复现图片宽度约 590px → 394px 的首帧坍缩。
- [x] `react-moveable` 当前未启用 `keepRatio`，角点拖动会独立改变宽高，已复现图片像素宽高比漂移。
- [x] 画布宽度有 160ms 过渡，但 Moveable 默认不监听目标尺寸；改变画布缩放后，控制框仍停在旧坐标，已复现首次拖动方向与尺寸变化失配。
- [x] 坍缩根因是 `.canvas-sheet` 未建立定位上下文，Moveable 将外层滚动区当作 offset/bounds 容器，把 `scrollTop` 再次从可用高度中扣除；内层裁剪重算不是根因。
- [x] 现有 E2E 只断言宽高“发生变化”，即使尺寸跌到最小值或比例错误也会通过。

### 计划

- [x] 先补 Web Playwright 红灯回归：角点缩放保持像素宽高比、拖动幅度与页面像素增量一致、首次移动不坍缩；画布缩放完成后控制框与图片边界重新对齐。
- [x] 在共享 Studio 画布中启用等比例角点缩放，让 Moveable 跟随目标尺寸变化，并让相册纸张成为自身的定位与边界容器；不改裁剪和图片资源管线。
- [x] 运行定向 Web E2E（含重复执行）、Studio 测试、`npm run check` 与 Electron E2E，并记录实际几何误差和双端结果。

### Review

修复包含三个最小改动：Moveable 启用 `keepRatio` 保持角点缩放比例，启用 `useResizeObserver` 在画布倍率或布局宽度变化后重新测量控制框，并为 `.canvas-sheet` 增加 `position: relative`，让边界计算始终基于整张相册页面而不是可滚动视口。裁剪、资源加载、文档结构和提交边界均未修改。

回归测试分别在修复前证明：像素宽高比从 1.4472 漂移到 1.3649；画布放大后控制点错位 32.95px；800×640 滚动画布后仅移动 1px，图片宽度便从约 590px 坍缩到 394px。修复后定向 Web E2E 连续 3/3 通过；1100×720 探针首帧保留 100.04%，完整拖动缩小 20.75px，比例误差约 0.07%。

最终 `npm run check` 通过：lint、全 workspace typecheck、common 19、Studio 9、desktop 27、启动逻辑 4 项测试、desktop/web production build、真实 dev smoke 与 Web E2E 均通过；Electron E2E 另行 3/3 通过。临时诊断日志已全部移除，`git diff --check` 与 Prettier 检查通过。

---

## 当前任务：定义 Everything is a Block 排版方案

> 状态：方案文档完成，尚未开始功能实现
>
> 建立日期：2026-08-16

### 已确认决策

- [x] 图片、富文本、Icon/贴纸、封面标题/副标题/日期和页面文字全部纳入 Block；界面与代码统一使用 Block，不再使用 Cell。
- [x] 页面尺寸为项目创建时的一次性选择；默认 A4 横向，可选 12 × 12 英寸正方形与 16:9（13.333 × 7.5 英寸）。
- [x] 页面布局同时安排图片与文字 Block，贴纸/Icon 作为不受布局影响的额外装饰；整页模板留到后续。
- [x] 富文本首版只支持字体、字号、颜色、粗体、斜体、下划线、对齐、行距和列表。
- [x] Icon 与贴纸统一为 DecorationBlock；替换已选装饰时保留其几何与图层，未选中时在画布中央创建。
- [x] 文件夹导入后在项目素材库中平铺；不建立虚拟文件夹树。
- [x] 项目仍处早期开发阶段，直接重建 schema，不迁移或兼容现有 image-only 项目。

### 计划

- [x] 将 “Everything is a Block” 设计哲学写入 `AGENTS.md`。验证：明确三类 Block、统一交互/图层/渲染链和页面级例外。
- [x] 在 `docs/plan/block-layout-v2.md` 写出数据模型、页面尺寸、布局模板、右栏信息架构、拖拽/富文本选型、跨端改动和非目标。验证：所有已确认产品决定均有唯一落点。
- [x] 为后续实施拆出可验证阶段与完成门禁。验证：每阶段都有数据、界面、双端和测试闭环，且不包含旧项目迁移。
- [x] 复查文档与当前代码边界、现有 ADR 和工作树改动不冲突。验证：只修改本任务文档，不触碰功能代码。

### Review

已将 Block 设计哲学写入根 `AGENTS.md`，明确所有独立画布内容使用统一 Block、单一有序图层和同一渲染链；同时记录页面尺寸与 Block 的边界，以及图片说明仍属于 ImageBlock 内部内容。

完整方案位于 `docs/plan/block-layout-v2.md`。文档固定了默认 A4 和两个可选尺寸、三类 Block、新 schema 无迁移策略、图片+文字布局、项目素材平铺、右侧三常驻 Tab 与条件编辑 Tab、Lexical 简单富文本、`@dnd-kit/react` 来源拖入和现有 Moveable 画布变换。方案按七个可验证阶段拆分，并包含跨端改动面、回归测试、风险和完成定义。本轮没有修改 `album-studio/` 功能代码或安装依赖；Node.js `v22.22.0` 满足项目要求，文档 `git diff --check` 通过。

---

## 当前任务：实现 Everything is a Block 排版 v2

> 状态：已完成
>
> 建立日期：2026-08-16
>
> 产品方案：`docs/plan/block-layout-v2.md`

### 已确认事实

- [x] Node.js `v22.22.0` 满足工程要求；仓库没有 `.codegraph/` 索引。
- [x] 当前工作树包含上一轮已暂存的跨平台重建成果，以及刚完成的 Moveable 缩放修复；本任务必须在这些成果上精准叠加，不能 reset、回退或按旧 HEAD 重建。
- [x] 实施前基线 `npm run check` 通过：common 19、Studio 9、desktop 27、Windows 启动逻辑 4 项测试、双端 production build、真实 dev smoke 和 Web E2E 均通过。
- [x] 实施前唯一文档格式仍是 image-only schema v1；封面 `title/subtitle/dateLabel/hero`、内容页 `elements/note`、图片专用命令和固定 A4 常量都需要由 v2 一次性替换，不保留 alias、迁移或 fallback。
- [x] 当前页面缩略图、预览和打印已复用 `AlbumPageView`，图片管线、保存会话和 desktop/web platform seam 可以保留并深化。
- [x] 原方案的技术顺序需要微调：阶段 2 必须先具备轻量 RichText/Decoration 只读渲染；组件库不能先出现空 Tab，因此组件创建与右栏闭环要一起交付。产品范围和验收标准不变。

### 实施约定（请在确认计划时一并确认）

- schema 直接升为 v2；旧项目统一提示“项目格式已更新，请新建项目”，损坏项目使用不同错误，不尝试迁移。
- 新封面创建普通的标题、副标题和日期 RichTextBlock；沿用现有封面视觉关系，日期由项目创建时间生成，之后三者都按普通 Block 编辑。
- 初始组件目录采用一组稳定 ID 的相册主题 Lucide Icon，以及纸胶带、拍立得、邮票、花枝、星芒、旅行标签等内置矢量贴纸；资源注册表只允许显式映射，不持久化组件名或路径。
- 现有 7 个纯图片排版转为 typed layout，并至少增加“图文主视觉（1 图 1 文）”“双图叙事（2 图 1 文）”“三图手记（3 图 1 文）”三种混合排版。
- 现有 `keepRatio / useResizeObserver / canvas-sheet` 定位边界和对应窄窗口、zoom、首帧缩放回归必须迁移到通用 Block Moveable，不能因重构丢失。
- `place-assets` 保留为原子批量图片 Block 命令，避免一次批量操作产生多个 revision；单个拖入、点击放置和键盘路径共用 `add-block`。

### 计划

- [x] 阶段 1：以失败测试保护 schema v2、三种 PageSpec、严格 RichTextDocument、Decoration 资源 ID、跨类型 Block ID 和旧格式拒绝；实现统一 `blocks[]`、默认封面 Block、通用/类型专用命令、原子批量放置、typed layouts 与 common IPC 创建契约。验证：common schema/command/undo-redo 测试与 typecheck 通过，旧字段和旧命令不再导出。
- [x] 阶段 2：建立 `BlockView`、Image/RichText/Decoration 三类只读 View 和共享资源注册表；将选择、快捷键、Moveable、图层、复制、删除和页面空白语义改为通用 Block，并保留已完成的几何回归。验证：编辑、缩略图、预览和打印复用同一 `AlbumPageView`，三类 Block 几何一致，一次手势一个 revision/undo。
- [x] 阶段 3：在新建项目中用 ToggleGroup 选择三种尺寸，默认 A4；同步 common IPC、StudioPlatform、desktop/web adapter、项目存储、动态画布比例、300 DPI 衍生图、浏览器 print CSS 与桌面 PDF 自定义尺寸。验证：三种 manifest、画布比例、打印像素和 PDF MediaBox 均匹配唯一 `document.pageSpec`。
- [x] 阶段 4：删除顶栏“素材库/排版”工作区 mode，建立共享 `RightPanel` 的三常驻 Tab 与条件 Block 编辑 Tab；将项目素材重组为紧凑面板，接入 dnd-kit 来源拖入、zoom 坐标换算、点击中央放置，并同时交付文字/Icon/贴纸的创建与装饰替换闭环。验证：画布不因切 Tab 卸载，宽屏和 Sheet 复用同一实现，drop/click 都只提交一次真实命令。
- [x] 阶段 5：接入严格受限且按需加载的 Lexical 编辑器、工具条、draft 合并和 flush-before-save；完成 Image/RichText/Decoration 的条件编辑内容、Icon 颜色与贴纸替换。验证：全部已确认格式保存重开一致，连续输入合理合并 history，立即预览/导出/关闭不丢最后输入。
- [x] 阶段 6：完成 typed layout 的右栏缩略图、数量匹配、应用和失效规则；图片与文字按同类型稳定图层顺序映射，Decoration 逐字段保持不变。验证：不匹配布局不可应用，混合布局一次 revision/undo，装饰不产生 patch。
- [x] 阶段 7：删除所有 `hero/elements/PageNote/ImageElement/template/workspaceMode/selectedElementId` 遗留分支、A4 硬编码和失效 CSS/测试夹具；同步用户与架构文档。验证：定向测试、`npm run check`、`npm run test:e2e:all`、`git diff --check` 全部通过，并检查 1440×900、1100×720、800×640、长中文、空态、失败态、保存重开与三尺寸输出。

### Review

已完成严格 `AlbumDocument` v2：封面和内容页统一保存有序 `blocks[]`，Image/RichText/Decoration 共享几何、图层和通用命令；旧 image-only 文档与旧命令只保留负向拒绝测试，不存在兼容或 fallback 分支。PageSpec 成为新建项目、画布比例、300 DPI 图片请求、浏览器 `@page` 与 Electron PDF 的唯一尺寸来源，三种实际 PDF MediaBox 均已验证。

工作区已改为常驻页面栏、画布和共享装帧托盘；布局、素材、组件为常驻 Tab，选中 Block 时出现条件编辑 Tab，中窄窗口复用同一个 RightPanel Sheet。项目素材和文字/Icon/贴纸支持点击或 dnd-kit 拖入，Moveable 继续专注画布内变换。十种 typed layout 中含三种图文混排，Decoration 应用布局前后逐字段保持不变。

富文本使用 common 严格 schema 与 Studio Lexical 适配层，支持已确认的字体、字号、颜色、行内样式、对齐、行距和列表；输入先进入 transient draft，保存会话在失焦、切页、预览、导出、返回和关闭前提交。照片说明也补上了面板卸载提交，避免切换右栏标签丢失最后输入。Lexical 和组件目录均按需加载；最终 desktop 构建的对应独立 chunk 为 267.17 kB 与 4.85 kB，editor workspace chunk 从拆分前 284.24 kB 降为 280.23 kB。

最终本机证据：common 37、Studio 62、desktop 32、Windows 启动逻辑 4 项测试通过；`npm run check` 覆盖 lint、全 workspace typecheck/test、双端 production build、真实 Electron dev/CSP/HMR smoke 和 Web E2E，并已通过；`npm run test:e2e:all` 中 Electron 3/3、Web 1/1 通过。视觉检查覆盖 1440×900、1100×720、800×640、长中文、空素材、中文导入失败和缺失资源；`git diff --check` 通过。Windows 原生打包与运行证据仍只由 Windows 主机或原生 CI 提供。
