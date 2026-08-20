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

> 状态：修正中
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

---

## 当前任务：Review 并修复最新图像编辑提交

> 状态：已完成（2026-08-19）
>
> 建立日期：2026-08-19
>
> 审查对象：`5104252 feat: 图像编辑能力增强（消除人物/美颜/自动增强/清晰度/裁剪重构）`

### 范围与实施假设

- [x] 保持既定的默认 A4 横向；用户反馈的“竖排 A4 显示不全”按画布初始适配错误处理，不擅自改变新建项目默认规格。四种 `PageSpec` 都必须同时受可用宽度和高度约束。
- [x] “完整组件库”解释为：补齐当前产品真实使用到的共享 shadcn 原语和业务组合，并把本次新增界面迁入同一套视觉/交互契约；不执行 `shadcn add --all`，也不在本轮凭空扩充右栏贴纸/Icon 素材数量。
- [x] shadcn 当前有效配置仍为 Nova + Radix + Lucide + Tailwind v4；`minimal` 作为视觉方向实现为语义 token、统一密度、克制圆角/阴影和共享工作区壳层，不切换到不存在的 preset。
- [x] 保持 Everything is a Block、统一 `AlbumPageView` 渲染链和现有 v2 schema；不借机重构无关功能。

### 已确认基线与根因

- [x] Node.js `v22.22.0` 满足要求，仓库没有 `.codegraph/`；审查前工作树干净。最新提交涉及 102 个文件、约 8,086 行新增。
- [x] `npm run typecheck` 通过；`npm test` 有 7 个新增 Studio 测试失败。测试把 undici `Response` 与 jsdom `Blob` 混用，异常又被宽泛 fallback 吞掉，因此并未真实执行图像成功路径。两个 Hook 的 `failed` 字段目前始终为 `false`。
- [x] 尺寸模型和 `AlbumPageView` 比例正确，错误在承载层：画布用固定 `zoom=0.75` 且只按宽度算纸张；“适合窗口”把相对因子误写成绝对倍率；预览只限制宽度；裁剪视口把 `absolute inset-[9%]` 与声明 `position:relative;width/height:100%` 的共享类放在同一元素上。
- [x] 运行时三个目标视口均复现：A4 竖排不能完整显示；预览页高度为可用高度的约 2.46–2.89 倍；裁剪底部固定溢出面板约 45–65px。800×640 还会被同为 `z-50` 的装帧 Sheet 覆盖。
- [x] “消除后变淡”的确定主因不是 INT8 模型：整图尺度羽化让 1% 笔刷中心 alpha 仅约 0.32–0.35，即 65%–68% 原人物被混回；mask 缩放使用 Lanczos 后又以 `>0.5` 判断 0..255 数据，小遮罩面积实测可扩大约 5 倍；全局 RGB 均值 offset 还会主动把多色/渐变背景拉向平均色。
- [x] 消除管线另有确定缺陷：RGBA 输入按 3 通道读取、整张 4K 图压到 512、单击涂点不落盘、`ImageBitmap` 和迟到请求泄漏、重复 Apply 始终重新推理；算法修复若不提升独立 erase 缓存版本，已有发白文件会继续被一年 immutable 缓存复用。
- [x] 图像效果链存在输出不一致：自动美化在旋转/翻转后分析错误区域；编辑器先烘焙几何再做邻域效果，而画布/预览/打印先做效果再 CSS 几何；打印只猜测等待 120ms，可能在美颜/清晰度完成前导出原图；同一效果在多个 `AssetImage` 中重复主线程计算。
- [x] 新增模态/工作区绕过共享契约：缺少 Dialog title、原始十六进制颜色和重复 `DARK_OUTLINE_BUTTON`、导入 busy 时仍可通过 Esc/X/遮罩关闭、预览快捷键会穿透并移动/删除/复制背后的 Block。
- [x] 页面栏把 Enter 改成“插入新页”，与按钮选择语义及键盘拖拽冲突；现有 `@dnd-kit/react@0.5.0` 已含 sortable，拖拽排序无需新增依赖。
- [x] 平台审查还确认三项提交级阻断：导入候选使用可复用全局 ID，交错 picker 可能“看到 A、导入 B”；模型下载使用可变 `main`、直接写最终文件且无摘要校验；clean checkout 打包不下载模型却强制校验模型，macOS universal 也未验证 ONNX Runtime 的双架构 binding。

### 实施计划（用户确认后开始）

- [x] 阶段 1：先把确定缺陷写成红灯。修正无效 `Response/Blob` 测试夹具，并为四规格 contain、连续 fit 幂等、裁剪边界、打印就绪、旋转/翻转自动分析、消除 mask/合成、缓存升级、异步取消、候选会话和页面排序补回归。验证：每项测试在对应修复前能准确失败，成功路径确实执行像素操作。
- [x] 阶段 2：统一页面与裁剪几何。建立共享 `fitAspectRatioWithin`；编辑画布以 contain 尺寸为基准、zoom 只表达用户倍率并由 `ResizeObserver` 更新；预览复用同一 contain 规则；裁剪使用外层拥有 inset、内层使用共享 viewport；进入独占工作区时关闭窄屏 Sheet。验证：1440×900、1100×720、800×640 × 四种 PageSpec 首帧完整，连续 fit 误差 ≤1px，竖/横/方图裁剪手柄均在面板内。
- [x] 阶段 3：修正并收敛图片效果管线。用可区分的 ready/fallback/failed 结果替代静默吞错，统一 Blob 生命周期；自动分析接收完整 crop 几何并丢弃陈旧结果；像素效果始终先于几何，编辑与 `ImageBlockView` 使用同一顺序；为打印树建立显式 pending/ready 协议；对相同资源+效果+质量复用有引用计数的派生结果，并以测量决定是否需要 Worker。验证：编辑/画布/缩略图/预览/打印视觉一致，延迟 500ms 的增强不会提前导出，失败可见且不泄漏 URL。
- [x] 阶段 4：修复人物消除质量与可复现性。输入显式转 sRGB 三通道；mask 用 nearest + `>=128` 二值化；回归 LaMa 的硬内区合成，只在必要时保留 1–2px 内边缘过渡，删除无证据的全局色偏修正；修复单点笔刷与 Bitmap/迟到请求释放；以真实模型 A/B 决定是否再加入 mask ROI 以改善 4K 小目标。新增独立 `ERASE_PIPELINE_VERSION`，命中缓存直接返回并合并并发推理。验证：遮罩外像素不变、小遮罩中心完整使用修复结果、完美模型夹具 MAE 不恶化、相同参数只推理一次、旧缓存不会复用。
- [x] 阶段 5：建立 minimal 组件系统并迁移本次新增界面。按 shadcn 官方组件契约补齐实际使用的 `Alert`、`Empty`、`Spinner`、`InputGroup` 和 Dialog 变体；建立语义化深色媒体工作区 token 与共享 `MediaWorkspace`；照片编辑/消除共用全屏壳，大图预览和素材全屏复用有焦点/标题/关闭契约的模态；导入 busy 时禁止所有 dismissal。验证：无重复 raw 色值/按钮常量，hover/focus/disabled/error/processing 状态与键盘边界一致。
- [x] 阶段 6：实现左侧页面拖拽排序与快捷键隔离。页面项使用 `useSortable` 和显式 Grip handle，封面不可拖放，drop end 只 dispatch 一次 `reorder-page`；删除上/下按钮及错误 Enter 插页行为；全局画布快捷键首先排除 Dialog、表单控件和 DnD handle。验证：宽屏纵栏、800px 横栏的指针/键盘排序、自动滚动、取消、undo/redo、保存重开全部正确，选中状态按 page ID 保持。
- [x] 阶段 7：修复提交内的平台竞态与发布门禁。候选使用 sessionId + 不复用 token + document 绑定，局部扫描后原子发布并统一释放；最近项目依次回退且 StrictMode 去重；模型固定 revision/SHA-256/大小，临时下载校验后原子发布；package workflow 显式准备/验证模型并延迟加载 ONNX Runtime，补齐 universal 双架构检查。验证：交错 picker 不串图、无模型 clean checkout 的预期失败/准备流程明确、错误/半文件不进入产物、arm64/x64 binding 静态与启动检查可证明。
- [x] 阶段 8：整体质量复核。运行定向单测、`npm run check`、`npm run test:e2e:all`、真实模型质量测试、桌面 package/verify；在 Web 与 Electron 对 1440×900、1100×720、800×640 逐一截图比对，覆盖四页面规格、竖/横/方裁剪、长中文、空态、失败态、拖拽各状态、导入/消除 processing。最后检查最新提交剩余 diff、删除冗余与只由本次改动造成的孤儿代码，并在本节补 Review。

### Review

完成了对 `5104252` 的逻辑、视觉、平台与发布链审查。页面承载层现在共用 contain 几何：编辑器把页面在可用宽高内完整适配，zoom 只表达用户缩放，“适合窗口”幂等；预览和裁剪的外层/内层责任分开，去掉了会在 resize 后短暂裁掉纸张的 width transition。默认 A4 横向规格未被擅改，A4 竖向和其他规格作为几何回归覆盖。

消除后“变淡”的主因确认在应用合成而非 LaMa 模型：大尺度羽化把约 65%–68% 原人物混回，Lanczos 遮罩和错误阈值扩大了区域，全局均色偏移又改写了局部正确色彩。现在输入统一解码为 sRGB，mask 使用 nearest 二值化，模型输入只增加 1 个模型像素安全边界，最终以用户原 mask 硬合成；RGBA 的 alpha 全域逐字节保留。Apply、预览和确认共用同一遮罩快照，处理期锁定入口，单点笔刷、迟到请求、Bitmap/Blob URL 与缓存版本均已收敛。

图片管线改为可观测的 pending/ready/fallback/failed 协议，编辑、画布、预览和打印统一“像素效果→几何”顺序。派生图有进程去重、引用计数与精确 URL 回收；全分辨率增强进入全局 FIFO 单并发队列，不阻塞交互预览。Web/Desktop 打印使用 common 的 cover/crop/rotation 派生几何，不放大小图且不超过整页像素；导出会等待最终图像解码，超时直接中止而不导出旧图。自动增强改为 alpha 加权，透明角不再当黑色背景。

界面补齐了当前产品真实使用的 shadcn-style `Alert`、`Spinner`、`Empty`、`InputGroup`、Dialog 变体与共享 `MediaWorkspace`，照片编辑/消除人物迁入同一套 minimal 语义 token、密度、圆角、焦点和处理态契约。素材全屏是真实焦点陷阱模态，导入期间不能用 Esc/X/遮罩中断；导入事务完成注册后才允许关闭窗口/项目。未为没有实际调用点的 `Separator`/`DropdownMenu` 制造空壳。

页面栏使用 dnd-kit `useSortable` 与独立 Grip，封面完全不注册为 sortable。针对 dnd-kit 乐观 DOM 排序与 React 受控 index 的 dragend 竞态，提交以已呈现的顺序为准；指针拖拽场景连续 8 次稳定通过。取消、undo/redo、保存重开与 800px 横栏键盘边界也有 E2E 覆盖；错误 Enter 插页行为已删除，全局快捷键不再穿透 Dialog/表单/DnD/独占工作区。

平台层同时修复候选会话串项目、最近项目回退、长导入关闭、打印裁剪参数丢失和模型发布门禁。两个 ONNX 模型固定 revision/尺寸/SHA-256，校验通过后原子发布；ORT 延迟加载，macOS universal 和 Windows x64 原生 binding 有静态完整性门禁。

最终证据：Common 90/90、Studio 196/196、Desktop Vitest 80/80（另 3 项环境跳过）和 Node 脚本 13/13；四 workspace typecheck、lint（0 error）、双端 production build、Electron dev smoke、Electron E2E 4/4、Web E2E 2/2全部通过。真实 LaMa/质量测试 2/2 通过，外部真人照片用例因未提供照片跳过。macOS arm64 解包产物、package verify 与打包应用 E2E 2/2 通过；app.asar 2.38 MiB。运行时视觉检查覆盖 1440×900、1100×720、800×640、A4 竖页、150% 缩放、90° 裁剪、预览、大图模态、消除和拖拽。仅保留不阻断的 Prettier 历史 warning、依赖的 Rollup PURE annotation warning 和 Web 主 chunk 504.91 kB warning；Windows 真机与 macOS universal 实际打包仍需对应主机/CI 提供运行证据。

---

## 当前任务：优化页面预览拖拽与插页交互

> 状态：已完成（已按用户纠正）
>
> 建立日期：2026-08-19

### 已确认事实与交互约定

- [x] Node.js `v22.22.0` 满足工程要求；仓库没有 `.codegraph/`；工作树在本任务开始前干净。
- [x] 页面栏位于共享 Studio 的 `features/pages/page-rail.tsx`，桌面纵栏和窄屏横栏复用同一实现；无需修改 common、desktop 或 web adapter。
- [x] 现有内容页通过独立 Grip Button 触发 `useSortable`，缩略图只负责选择；排序本身已有 dnd-kit 的乐观位移动画、单命令提交、撤销/重做和刷新持久化回归。
- [x] 用户已纠正“提示线”的含义：它表示松手后页面实际插入的间隙，而不是当前经过目标页的固定前侧；纵栏和横栏都必须让提示位置与最终排序结果一致。
- [x] 每张预览悬浮或键盘聚焦时，在预览底部显示 shadcn `Button` + Lucide `PlusIcon`，点击后在该页后插入并选中新页；列表末尾的常驻“添加页面”继续保留，供触屏和直接追加使用。
- [x] 只为本次分页反馈增加克制的淡入、位移和状态过渡，并尊重 `prefers-reduced-motion`；不改变项目配色、字号或页面数据规则。

### 计划

- [x] 阶段 1：先更新 PageRail 单测与 Web E2E，让内容页缩略图成为唯一拖拽面，验证封面无拖拽属性、悬浮插页按钮按指定页插入、落点指示器出现在目标页之前。验证：旧 Grip 选择器失效，新交互在实现前准确失败。
- [x] 阶段 2：精准修改共享 `PageRail`：把 `handleRef` 和 `data-dnd-handle` 移到内容页缩略图，删除 Grip Button/图标；复用现有 `addBlankPage(page.id)` 语义增加预览底部 Plus Button，不新增依赖或重复命令。
- [x] 阶段 3：修改分页业务样式：纵栏顶部/横栏左侧插入线、拖动中的缩略图反馈、Plus Button 的 hover/focus 显隐，以及 reduced-motion 降级；不覆盖 shadcn Button 的颜色、字号和尺寸变体，也不与 dnd-kit 的根元素 transform 冲突。
- [x] 阶段 4：运行 PageRail/排序定向单测和 Web 页面排序 E2E；在 1440×900、1100×720、800×640 检查整图拖拽、插入线、悬浮/键盘插页、横纵栏与滚动边界，最后运行 `npm run check` 并在本节补 Review。

### 第一版 Review（已被用户纠正）

内容页现已直接从整张缩略图进行鼠标、触控和键盘排序，封面仍不可排序；旧 Grip Button 已移除。拖拽目标在纵栏上方或窄屏横栏左侧显示唯一插入线，悬浮或聚焦任意预览会显示 shadcn `Button` + Lucide `PlusIcon`，点击后在该页后插入并自动选中新页。窄屏按钮放在预览右下方，避免遮挡预览中心的拖拽命中区；所有新增反馈均有平滑过渡，并对 `prefers-reduced-motion` 关闭动画。

验证结果：PageRail/排序定向测试 10/10、变更文件 ESLint/Prettier 检查、Web 页面排序 E2E 1/1 均通过；完整 `npm run check` 通过 Common 90/90、Studio 197/197、Desktop Vitest 80/80（另 3 项环境跳过）、Node 脚本 13/13、双端 production build、Electron dev smoke 与 Web E2E 2/2。补充 Electron E2E 4/4 通过。运行时视觉检查覆盖 1440×900、1100×720、800×640，确认按钮不越界或覆盖页码、纵向插入线唯一可见、reduced-motion 生效且无浏览器 console error；全仓仅保留既有格式与构建 warning。

### 修正计划

- [x] 阶段 1：复现“经过目标页”与“最终插入间隙”不同的拖拽，并把提示线位置与松手后的页面顺序写成同一条 Web E2E 断言。
- [x] 阶段 2：让提示线由 dnd-kit 的实际排序占位位置驱动，删除错误的目标页标记状态；保持整张预览拖拽、撤销/重做和键盘排序不变。
- [x] 阶段 3：仅缩小纵向 PageSpec 的页面栏缩略图，保持原始宽高比、页码和插页按钮不重叠；横向与方形页面尺寸不变。
- [x] 阶段 4：运行 PageRail 定向测试、Web 拖拽 E2E、1440×900 / 1100×720 / 800×640 视觉检查及可执行的完整门禁，完成后补最终 Review。

### 最终 Review

第一版错误地从 `useDragOperation().target` 标记提示页；dnd-kit 乐观排序后会把 target 切回拖拽源，所以线条实际跟着正在拖动的页面，而不是最终插入间隙。现在删除了这份重复状态，直接让提示线显示在 dnd-kit 已移动到真实排序位置的 placeholder 上；Web E2E 同时断言提示线前一页、拖拽页和松手后的文档顺序，并确认拖拽期间只有这一个间隙显示线条。

A4 竖排页面栏通过 PageSpec 方向使用紧凑缩略图，1440×900、1100×720、800×640 实测约为 156×219、113×158、53×73；保持 210:297 比例，页码与插页按钮不重叠，窄屏按钮也不遮住中心拖拽区。横向和方形页面尺寸未改。

验证结果：修复前 PageRail 方向测试和两个 Web 场景均准确红灯；修复后 PageRail/排序定向测试 11/11、页面栏 Web E2E 2/2、变更文件 ESLint/Prettier 与 `git diff --check` 通过。完整 `npm run check` 在同一工作树上通过 Common 90/90、Studio 205/205、Desktop Vitest 80/80（另 3 项环境跳过）、Node 13/13、双端 build、Electron dev smoke 与 Web E2E 5/5。随后另一个正在进行的富文本任务加入未完成测试，导致补跑 Electron E2E 在构建前被其类型错误阻断；该阻断与 PageRail 改动无关，本任务未改动或回退那些并行文件。

---

## 当前任务：重做书本式整册预览

> 状态：已完成
>
> 建立日期：2026-08-19

### 已确认事实与实施取舍

- [x] Node.js `v22.22.0` 满足要求；仓库没有 `.codegraph/`。当前工作树包含刚完成的“优化页面预览拖拽与插页交互”改动，本任务保留并在最终门禁中一并验证。
- [x] 整册预览位于共享 Studio 的 `features/preview/preview-workspace.tsx`；当前只显示单页，缩略图固定占用底部 96px。竖向页面主要受可用高度限制，因此底栏会明显压缩正文。
- [x] 编辑、缩略图、预览与打印已经复用 `AlbumPageView`；本任务只重做预览编排、几何和动效，不复制 Block 渲染链，也不修改文档 schema 或双端 adapter。
- [x] 默认进入双页书本模式；封面单独闭合展示，内容页按 `1–2、3–4…` 组成跨页，末尾奇数页保留空白页位。切换单页时保留当前页，模式仅属于当次预览，不写入相册文档。
- [x] 竖向 PageSpec 使用左侧纵向页面轨道，横向与方形 PageSpec 使用底部横向轨道；轨道参与布局而非覆盖舞台。页面和跨页始终同时受可用宽、高约束。
- [x] 参考 `react-pageflip` 的封面、跨页、方向、纸张正反面和阴影模型；不直接引入依赖。其 npm wrapper `2.0.3` / 底层 `2.0.7` 已多年未发布，且公开存在动态尺寸需重建、触摸滚动和单双页控制限制；当前 React 19 + ResizeObserver 工作区使用小而可控的原生 CSS 3D 翻页层风险更低。

### 计划

- [x] 阶段 1：先补预览编排与组件红灯测试，覆盖封面、单双页、奇偶末页、模式切换保留当前页、前后翻页和 reduced-motion 立即切换。验证：现有单页实现无法满足新断言。
- [x] 阶段 2：重构共享 `PreviewWorkspace`：增加 shadcn `ToggleGroup` 单页/双页切换、书本单元编排、缩略图跳转、方向明确的单张纸翻页、上一页/下一页与键盘/Esc；继续只渲染 `AlbumPageView`。
- [x] 阶段 3：建立预览业务样式：闭合封面到展开跨页、中央书脊、纸张正反面与克制阴影；竖页左轨/横页底轨、contain 几何、窄视口和 `prefers-reduced-motion` 降级均由父布局负责。
- [x] 阶段 4：运行 Preview/PageRail 定向单测和 Web E2E；在 1440×900、1100×720、800×640 检查 A4 竖向/横向、单页/双页、首尾页、奇偶页、翻页中间态、无裁切/遮挡和控制台错误。
- [x] 阶段 5：运行 `npm run check` 与 Electron E2E，检查 production bundle、`git diff --check` 和全部既有未提交页面栏改动；完成后在本节补 Review。

### Review

整册预览现在是独占全屏的书本舞台：默认双页，封面以单张闭合居中，内页按 `1–2、3–4…` 展开，奇数末页用不写入文档的空白页补齐。单/双页切换保留当前页；点击、方向键和左右滑动均能翻页，Esc 退出。CSS 3D 翻页层只在动画期间渲染纸张正反面，其余状态继续复用 `AlbumPageView`；减少动态效果时直接切页。竖向 PageSpec 的缩略轨固定在左侧，横向/方形保留底轨；导航按钮有独立栏位，页面与跨页同时受可用宽高约束。长相册翻页后当前缩略图会按 reduced-motion 偏好平滑或立即滚入可见区。

没有引入 `react-pageflip`；只参考了它的封面、纸张正反面和跨页模型，避免将长期未发布、无明确 React 19 支持且单双页动态切换受限的 wrapper 带入 Web/Electron 共享层。

最终验证：Preview 定向测试 7/7；完整 `npm run check` 通过 Common 90/90、Studio 205/205、Desktop Vitest 80/80（另 3 项环境跳过）、Node 脚本 13/13、四 workspace typecheck、lint（0 error）、双端 production build、Electron dev smoke 与 Web E2E 5/5；补充 Electron E2E 4/4 通过。浏览器几何和视觉检查覆盖 1440×900、1100×720、800×640 的竖向/横向、单页/双页、闭合封面、奇数末页与翻页中间帧，均无裁切、按钮遮挡、水平溢出或 console error。独立复查另用 16 页相册确认竖/横轨道自动跟随和按钮聚焦后的键盘分流正常。

---

## 当前任务：完善富文本字号、颜色与中文字体

> 状态：已完成
>
> 建立日期：2026-08-19

### 已确认事实与实施假设

- [x] Node.js `v22.22.0` 满足要求；仓库没有 `.codegraph/`。当前工作树还有整册预览任务的未完成测试，本任务保留这些改动，并避开其预览与 PageRail 逻辑。
- [x] 浏览器真实复现颜色 Bug：选中文字 Block 后，若未先聚焦富文本编辑框，直接修改颜色会无效果并回到旧值；先建立文字选区后，同一颜色可即时预览并保存。
- [x] 根因位于共享富文本工具条：没有当前或历史 RangeSelection 时，`withSelection` 直接空操作。颜色控件事件、严格颜色校验和自动保存均不是根因。
- [x] 用户已确认工具条无选区时统一“修改当前文字 Block 的全部内容”；已有局部选区或光标时继续只作用于该选区/后续输入。实现以内容区真实指针/键盘交互区分整块模式，避免工具条制造的折叠选区冒充用户选区。
- [x] 字号解释为排版常用的 `pt`，按项目页面物理宽度换算为画布字号；现有文字同比放大约 4/3，且 A4、方形和 16:9 页面保持相同物理字号。继续保留 8–120 的数据范围。
- [x] 保留宋体、黑体、楷体、等宽四个原字体 ID 兼容当前项目，新增并离线打包得意黑、霞鹜文楷、霞鹜漫黑、小赖字体四套开源中文字体；版本、SHA-256、上游链接与各自 OFL 1.1 许可证均随资源保留，菜单按“特色字体 / 系统兼容”分组并用对应字形预览。
- [x] 项目文档新增最多 8 个、规范化去重的 `recentColors`。同一次富文本草稿会累计期间选过的全部颜色，并与文字修改作为一个命令、一条撤销记录保存；工具条同时显示当前会话与已保存项目颜色供快速切换，旧 v2 项目缺少字段时自动补空数组。

### 计划

- [x] 阶段 1：先补失败回归，覆盖未聚焦编辑器时修改整段颜色/字号、连续快捷色切换、项目颜色单次提交与撤销、特色字体严格解析，以及不同 PageSpec 下 `pt` 到页面比例的换算。验证：测试在修复前准确暴露无选区空操作、色板缺失和当前字号偏小。
- [x] 阶段 2：修复共享工具条的选区回退，抽出中文字体目录供 Lexical 适配器、工具条、富文本和图片说明只读渲染共同使用；扩展 common 严格字体枚举与项目色板字段，不改变 Block 联合类型或 schemaVersion。
- [x] 阶段 3：让共享 Block 渲染链根据 `pageSpec.widthMm` 把字号按物理 `pt` 渲染；字体选择器展示 4 套特色中文字体和 4 套兼容字体，项目颜色以可访问的快捷色组显示。验证：common 91/91、Studio 209/209，common 与 Studio typecheck 通过。
- [x] 阶段 4：运行 common/Studio 定向测试、共享使用位置检查和 `npm run check`；用真实 Web 操作复测未聚焦改色、局部格式、字号视觉比例与保存重开，并检查 1440×900、1100×720、800×640。完成后在本节补 Review。

### Review

富文本字号现在按排版单位 `pt` 保存并依据页面物理宽度换算，现有相同数值相较旧 `px` 视觉放大约 4/3，且不同 PageSpec 保持同一实际字号。未进入编辑器时，字号、颜色和字体会作用于当前文字 Block 全文；进入编辑器并建立光标或选区后仍只修改局部内容。工具条重新打开时会从文档内容恢复实际字体、字号与颜色，不再显示与保存内容不一致的旧状态。

字体菜单新增得意黑、霞鹜文楷、霞鹜漫黑和小赖字体，并保留宋体、黑体、楷体、等宽四个兼容项。四套特色字体均以 WOFF2 离线打包，许可证、固定版本、来源与 SHA-256 随资源记录；编辑画布、缩略图、整册预览、打印以及图片说明共用同一字体映射。

每个项目现在保存最近 8 个规范化且去重的文字颜色；工具条提供“项目颜色”快捷色组，重新选择旧颜色会把它移到最前。连续快速选色会随同富文本草稿原子保存，刷新或重开项目仍可恢复，一次撤销同时回退文字样式和项目色板；旧 v2 项目缺少字段时自动补为空数组。

最终 `npm run check` 全部通过：lint 0 error（保留 36 个既有 Prettier warning）、四 workspace typecheck、Common 91/91、Studio 209/209、Desktop Vitest 80/80（另 3 项环境跳过）、Node 脚本 13/13、双端 production build、Electron dev smoke 与 Web E2E 6/6。真实 Chromium 回归覆盖未聚焦整块格式、局部单字改色、四套字体实际加载、72pt 的 A4 物理比例、项目色板保存/排序/刷新恢复，以及 1440×900、1100×720、800×640 工具条边界。构建仅保留依赖的 Rollup PURE annotation 与 Web 主 chunk 507.10 kB 警告。

---

## 当前任务：生成电子相册小相册 IP Logo

> 状态：已完成候选生成，等待用户选择精修方向
>
> 建立日期：2026-08-19

### 已确认方向

- [x] A 小相册头像：圆角封面、侧边书脊和极简笑脸。
- [x] B 翻页小相册：微微展开的双页形成拥抱般的圆润轮廓。
- [x] C 照片窗小相册：圆角册身搭配一块醒目的照片窗口。
- [x] 每个方向生成两个独立候选，共 A1、A2、B1、B2、C1、C2 六张；每张使用两种 IP 基础色与一种纯色背景，不含文字。

### 计划

- [x] 为六张候选固定构图、配色映射和共同约束，并保存为独立方形资产。
- [x] 使用内置 ImageGen 分批并行生成六张候选，不使用接触表或候选互相引用。
- [x] 检查尺寸、背景模式、颜色结构、轮廓、成对特征和 32×32 可读性；必要时对单张做一次定向重试。
- [x] 汇总每张候选的方向、理由、路径、提示词/配色、尺寸、背景与剩余偏差，并补充 Review。

### Review

六张正式候选与所有重试稿均已保存到 `assets/branding/logo-concepts/2026-08-19/`。生成使用 Codex 内置 ImageGen；运行时没有公开具体 provider/model，约束通过单一主提示词传递。六张均无参考图、互不引用，服务原生输出 1254 × 1254 PNG，未重采样。A1、A2、B1、B2、C2 为不透明 RGB；C1 为允许保留的透明 RGBA 变体。

六张都完成原尺寸目视检查与 32 × 32 缩略检查。B1/B2 的翻页轮廓与小尺寸辨识度最均衡，适合作为下一轮优先精修方向；A1/A2 更像传统应用图标，但照片相册身份较弱；C2 有设备/屏幕歧义；C1 因四肢、强立体感和复杂度超限明确标为非推荐。除 C1 外，其他正式稿也都有轻微背景明暗漂移或相册身份偏差，因此本轮不直接替换应用现有图标。

逐张方向、配色、尺寸、背景模式、SHA-256、32 × 32 结果与剩余偏差记录在 `generation-report.md`；最终提示词和约束传递方式记录在 `generation-prompts.txt`。PNG 文件属性检查、`git diff --check -- docs/todo.md` 均通过。

---

## 当前任务：将 A2 设为电子相册核心 Logo

> 状态：已完成
>
> 建立日期：2026-08-19

### 已确认范围与假设

- [x] 用户最终选择 A2：水绿封面、深李紫书脊与表情、奶油黄背景（此前 B2 选择已由用户纠正）。
- [x] 以 A2 为基础生成正式品牌母版；只收紧纯色背景、平面感、相册识别度和小尺寸边界，不改变主体身份与配色关系。
- [x] 桌面应用同时更新构建图标、运行窗口图标与 macOS 开发态 Dock 图标；Web 与桌面共用同一页面品牌组件。
- [x] 页面默认落点为项目首页品牌位和 Studio 顶栏；不把 Logo 写入用户相册内容或导出页面。
- [x] 保留工作树中现有未提交功能改动，只修改本任务直接相关文件。

### 计划

- [x] 使用选中的 A2 作为编辑参考，生成并检查正式高分辨率品牌母版与 32 × 32 缩略效果。
- [x] 从母版生成 Electron 的 PNG、ICNS、ICO，显式配置打包图标，并让 Windows/Linux 窗口及 macOS 开发态 Dock 使用同一来源。
- [x] 在共享 Studio 建立单一品牌 Logo 组件，替换项目首页的通用图片图标，并在编辑工作区顶栏显示紧凑品牌标记。
- [x] 补充共享页面和桌面图标配置回归，运行定向测试、完整 `npm run check`、桌面/Web 视觉检查与可执行的打包验证。
- [x] 记录最终文件、生成提示词、验证结果与未验证平台，并补充 Review。

### Review

用户最终选定的 A2 已精修为 1254 × 1254 不透明 RGB 母版 `assets/branding/album-studio-logo-master.png`，并从同一母版派生 1024px 构建 PNG、512px 运行时 PNG、macOS ICNS、包含 7 档尺寸的 Windows ICO，以及共享页面使用的 256px PNG。32 × 32 检查中笑脸、水绿封面和右侧李紫书脊仍清楚。ImageGen 仍留下轻微黄色背景明暗变化与内部色调变化，没有用代码静默修图；完整提示词、配色、SHA-256、背景模式与偏差已记录到 `assets/branding/album-studio-logo-production.md`。此前误选 B2 时由本任务产生的临时成品已移到废纸篓，可恢复。

Electron 构建配置现在显式指定 `build/icon.ico` 和 `build/icon.icns`；Windows/Linux 的 BrowserWindow 与 macOS 开发态 Dock 都使用 `resources/icon.png`。共享 `BrandMark` 在项目首页以 40px 装饰图呈现，在 Studio 顶栏以 32px 可访问品牌图呈现；桌面与 Web 入口继续复用同一个 Studio 实现。顶栏删除了与项目身份竞争的居中口号，并收敛为“项目身份 + 操作”两列。

最终 `npm run check` 单次完整通过：环境与 lint 0 error、四个 workspace typecheck、Common 91/91、Studio 211/211、Desktop Vitest 80/80（另 3 项环境跳过）、Node 脚本 14/14、双端 production build、Electron dev smoke 与 Web E2E 6/6。额外 Playwright 视觉检查覆盖 1440 × 900、1100 × 720、800 × 640：首页/Studio Logo 分别准确渲染为 40px/32px，页面无错位、console error 或 page error。`npm run package:unpack` 成功生成 macOS arm64 `.app`；`Info.plist` 指向 `icon.icns`，包内图标与源 ICNS 的 SHA-256 完全一致。Windows ICO 文件头、7 档图像和构建配置已自动验证，但 Windows/Linux 真机外观仍需相应平台运行证据。保留仓库既有的 36 个 Prettier warning、Rollup PURE annotation 和 Web 主 chunk 体积 warning，均非本次改动引入的阻断项。

---

## 当前任务：将软件品牌更新为「咔宝」

> 状态：已完成
>
> 建立日期：2026-08-20

### 已确认范围与假设

- [x] 用户最终确定软件名为「咔宝」。
- [x] Slogan 严格使用「咔宝——翻阅时光记忆。」；首页只出现一次完整 Slogan，避免重复品牌文案。
- [x] 更新桌面版、浏览器版、共享页面、启动提示、错误提示、打包产物、测试和当前用户文档中的可见品牌名。
- [x] 保留 `com.albumstudio.desktop`、npm workspace/package 名、`ALBUM_STUDIO_*` 环境变量和项目格式等内部标识，避免无必要地破坏安装身份、脚本接口与项目兼容性。
- [x] Windows 可执行文件和安装包使用 ASCII 文件名 `kabo`；macOS 应用显示为 `咔宝.app`。
- [x] 保留工作树中现有未提交功能与 Logo 改动，只修改品牌更名直接相关文件。

### 计划

- [x] 在共享品牌模块建立唯一的页面品牌名与 Slogan，更新项目首页、Studio 顶栏和可访问名称，并补组件回归。
- [x] 更新桌面/Web HTML 标题、桌面窗口与开发态应用名、启动/错误日志、electron-builder 产品名和跨平台产物路径。
- [x] 同步 package 描述、README、用户指南、设计/实施文档和项目开发 Skill；历史架构 ID 与技术目录不改名。
- [x] 运行定向测试、`npm run check`、运行中桌面版与 Web 三视口视觉检查，并生成 macOS unpacked 应用验证 `咔宝.app` 和包内标题。
- [x] 搜索旧品牌字符串，区分应删除的当前名称与允许保留的历史/通用描述，完成后补 Review。

### Review

共享品牌模块现在统一提供「咔宝」与「咔宝——翻阅时光记忆。」；首页只展示一次完整 Slogan，并在首页 40px、Studio 32px 两个场景复用 A2 核心 Logo。桌面窗口、浏览器标题、启动/错误提示、README 与当前用户文档均已同步。`com.albumstudio.desktop`、npm 包名、环境变量与项目格式继续保留；Windows 产物使用 `kabo`，macOS 使用 `咔宝.app`。

`npm run check` 完整通过：Common 96/96、Studio 217/217、Desktop 80/80（另 3 项环境跳过）、Node 脚本 14/14、双端 production build、Electron dev smoke 和 Web E2E 8/8 均通过。lint 为 0 error，仍报告工作区既有的 Prettier warning；Rollup 仍有既有的大 chunk warning。真实 Chromium 在 1440×900、1100×720、800×640 三档确认无横向溢出，Logo 原图均为 256×256，控制台与页面错误均为 0。

macOS unpacked 产物和实际启动冒烟通过：`咔宝.app/Contents/MacOS/咔宝` 为 arm64 Mach-O，Info.plist 的 Name、DisplayName 与 Executable 均为「咔宝」，Bundle ID 仍为 `com.albumstudio.desktop`，包内使用新的 `icon.icns`。Windows 真实安装包未在 macOS 上生成，但对应文件名、图标与 electron-builder 配置均有静态回归。开发态咔宝已启动并保持运行。

---

## 当前任务：修复页面短按选择并支持图片跨页拖动

> 状态：已完成
>
> 建立日期：2026-08-19

### 已确认事实与实施假设

- [x] Node.js `v22.22.0` 满足要求；仓库没有 `.codegraph/`。当前工作树包含页面栏、富文本、预览和品牌等已完成但未提交的改动，本任务保留它们，只在重叠文件中做可追溯的增量修改。
- [x] 真实 Chromium 已稳定复现：第二页已选中时短点第一页，`aria-current` 不变；鼠标只按下 20ms 且没有移动，第一页已经进入 dnd-kit 拖拽态，控制台无错误。
- [x] 根因是内容页缩略图按钮同时注册为 dnd-kit 显式 handle，而裸 `PointerSensor` 对鼠标 handle 立即激活并捕获指针，导致按钮的 `click → selectPage` 不再发生；不是 store 主动清空页面选择，也不是选中样式延迟。
- [x] 页面排序继续由 dnd-kit 管理；画布中已经放置的 Block 继续只由 Moveable 管理。图片跨页不把同一个画布 Block 再注册为 dnd-kit draggable，避免两套手势同时争用 pointerdown。
- [x] 页面缩略图在桌面鼠标/笔按住约 200ms、触控按住约 250ms 后才进入排序；阈值前松手始终选择页面，阈值前明显移动则取消本次排序，不把快速滑动误判为拖拽。Enter 仍选择，Space 仍启动键盘排序。
- [x] 跨页只从 `ImageBlock` 入口触发，语义为移动而非复制。保留 Block ID、归一化 transform、裁剪、滤镜、蒙版、说明和消除数据；追加到目标页最上层，并清空源页与目标页的布局标识。
- [x] 松手命中另一张页面预览时提交一次 `move-image-block-to-page` 命令，切到目标页并继续选中原图片；撤销/重做按全局唯一 Block ID 让选择跟随图片。命中当前页或页面栏空白处时取消跨页移动；未进入页面栏时仍按原逻辑提交普通画布移动。

### 计划

- [x] 阶段 1：先补失败回归。Web Playwright 覆盖短按选择不进入拖拽、长按后才排序；common 覆盖图片跨页移动的完整数据保持、目标图层、页面上限、同页拒绝和一次撤销；Studio store 覆盖移动与 undo/redo 后选择跟随。验证：现有实现准确暴露短按无选择，且缺少跨页命令。
- [x] 阶段 2：为页面缩略图配置有明确延迟和容差的 PointerSensor，保留整张预览排序、键盘排序、插入位置反馈和 reduced-motion；默认光标表达点击，真正进入拖拽后才显示抓取状态。验证：短按、长按、取消、横纵页面栏和触控约束互不冲突。
- [x] 阶段 3：在 common 增加严格 `move-image-block-to-page` 命令；在 Moveable 拖动期间用最终指针命中页面栏目标并提供唯一高亮，跨页松手只提交移动命令、不再同时提交 transform。Store 根据 Block ID 原子跟随目标页，undo/redo 后仍保持有效选择。
- [x] 阶段 4：运行 common/Studio/PageRail 定向测试和 Web 跨页拖动 E2E；在 1440×900、1100×720、800×640 检查纵栏、横栏、目标反馈、当前页/空白取消和控制台错误。最后运行 `npm run check`、Electron E2E 与 `git diff --check`，并在本节补 Review。

### Review

页面缩略图现在继续以整张预览作为排序面，但 PointerSensor 只在鼠标/笔按住 200ms、触控按住 250ms 后激活；短按 80ms 会正常触发页面选择，真正进入排序后才显示抓取态。键盘 Space 排序、横纵页面栏插入反馈和 reduced-motion 行为保持不变。

新增严格的 `move-image-block-to-page` 命令，只接受 ImageBlock 和不同目标页，目标满 100 个 Block 时拒绝。移动保留原 Block 的 ID 与全部图片内容，追加为目标页最上层并清空两页布局；Store 按全局唯一 Block ID 让当前页在移动、撤销和重做时跟随图片。Moveable 拖动经过目标预览时只高亮一个有效页面；松手到当前页或页面栏空白会恢复原几何且不产生 revision，松手到另一页只提交一次跨页命令。1100px 左侧栏断点还收紧了重复选择：已选图片再次 pointerdown 不会重新打开模态装帧托盘，因此拖拽不会被遮断。

最终 `npm run check` 通过：环境检查、lint 0 error、四个 workspace typecheck、Common 94/94、Studio 213/213、Desktop Vitest 80/80（另 3 项环境跳过）、Node 脚本 14/14、双端 production build、Electron dev smoke 与 Web E2E 7/7。新增的跨页 E2E 又在 1100×720 独立通过，覆盖当前页取消、页面栏空白取消、有效目标高亮、跨页移动、撤销、重做和刷新持久化；页面排序用例覆盖 1440×900 与 800×640。Electron E2E 4/4 通过，本任务涉及文件的独立 ESLint 为 0 warning，`git diff --check` 通过。仓库全量 lint 仍报告 36 个既有 Prettier warning，均不是本任务引入。

---

## 当前任务：支持富文本横排与竖排

> 状态：已完成
>
> 建立日期：2026-08-20

### 已确认事实与实施假设

- [x] Node.js `v22.22.0` 满足要求；仓库没有 `.codegraph/`。当前工作树包含前述已完成但未提交的页面栏、富文本、预览、品牌和跨页拖动改动；本任务保留它们，只做可追溯的增量修改。
- [x] `RichTextBlock` 当前只保存几何与富文本文档，没有排列方向；富文本编辑、自动保存与撤销链路已存在。
- [x] 画布、页面缩略图、整册预览和打印/PDF 已共用 `AlbumPageView → BlockView → RichTextBlockView`，方向必须接入这条唯一渲染链，不建第二套输出逻辑。
- [x] 用户已确认：方向属于整个文字 Block，默认横排；竖排从上到下书写、各列从右向左排列，汉字、英文和数字均保持直立。
- [x] 旧 v2 项目缺少方向字段时自动规范化为横排，不提升 `schemaVersion`；新保存会明确写入方向。
- [x] 右侧文字 Block 编辑面板使用已有 shadcn `ToggleGroup` 提供“横排 / 竖排”；不新增依赖，不用旋转 Block 伪装竖排。

### 计划

- [x] 阶段 1：先补失败回归，覆盖方向枚举、旧 v2 缺字段默认横排、无效值拒绝、方向命令的 revision/undo，以及竖排只读渲染和编辑器显示。验证：现有实现在对应断言上准确红灯。
- [x] 阶段 2：在 common 中为 `RichTextBlock` 增加严格的 Block 级方向字段和单一命令，新建文字默认横排，复制、解析、保存、撤销/重做保留方向。
- [x] 阶段 3：在共享文字编辑面板增加方向切换；切换前提交未失焦的文字草稿，然后立即保存方向。竖排时编辑区同步竖排，对齐语义显示为顶部/居中/底部。
- [x] 阶段 4：让共享 `RichTextBlockView` 按 Block 方向渲染，竖排使用从右向左的真实排版；检查画布、缩略图、整册预览与打印/PDF 没有分支或样式漂移。
- [x] 阶段 5：运行 common/Studio 定向测试、Web 真实操作回归、`npm run check` 和 Electron E2E；在 1440×900、1100×720、800×640 检查横竖切换、长中文、中英数混排、保存重开、撤销/重做与打印输出，完成后补 Review。

### Review

富文本现在以 Block 级 `writingMode` 保存横排或竖排，新建文字默认横排；旧 v2 项目缺少该字段时自动补为横排，非法值仍会被严格拒绝。方向切换使用独立命令，因此 revision、撤销、重做、复制、自动保存和刷新恢复保持一致；切换方向前会先提交仍未失焦的文字草稿，不会丢字。

右侧文字编辑面板新增“横排 / 竖排”。竖排使用真实的 `vertical-rl` 与 `upright` 排版，文字从上到下、列从右到左，中英文和数字均保持直立；对齐按钮同步显示顶部、居中和底部语义。编辑区、画布、页面缩略图、整册预览和打印/PDF 都复用同一套方向映射与 `AlbumPageView → BlockView → RichTextBlockView` 渲染链。竖排编辑区固定在面板宽度内，长内容在编辑区自身横向滚动，不会撑宽页面。

最终 `npm run check` 完整通过：lint 0 error（保留 36 个既有 Prettier warning）、四个 workspace typecheck、Common 96/96、Studio 217/217、Desktop Vitest 80/80（另 3 项环境跳过）、Node 脚本 14/14、双端 production build、桌面开发 smoke 与 Web E2E 8/8。Electron E2E 4/4 另行通过。真实 Chromium 检查覆盖 1440×900、1100×720、800×640 的长中文和中英数混排；三个视口都没有页面横向溢出或控制台错误，竖排编辑区宽度分别收敛到 325px/344px/344px，画布与整册预览均为 `vertical-rl` / `upright`。
