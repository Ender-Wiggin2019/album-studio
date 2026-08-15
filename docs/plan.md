# 电子相册工程化重构计划

> 状态：已实施并完成首版验收
>
> 实施目录：`album-studio/`
>
> 更新日期：2026-08-15

## 1. 目标与成功定义

将 `原始项目参考/` 中的单 HTML 相册重构为离线优先的 Windows/macOS 桌面应用，保留旧相册迁移能力，并建立可维护、可测试、可打包的现代工程。

首版成功标准：

- 非技术用户可以通过 Electron 界面完成“项目 → 素材库 → 选择素材 → 排版/编辑 → 预览/导出”。
- 支持图片或文件夹导入，源文件不被修改，原图复制进项目目录。
- 支持封面、1–6 图版式、自动分页、页面/照片排序和非破坏性图片编辑。
- 支持 3 套项目级主题，预览与 PDF 共用同一页面模型。
- 可导出含封面的 A4 横向 PDF。
- 可迁移旧 schema 2/4 JSON 和自包含 HTML，不改写源文件。
- macOS 可生成 universal DMG；Windows 可生成 x64 NSIS 和 portable 产物，并有双平台原生 CI 构建矩阵。
- macOS/Windows 均有双击式开发启动和打包脚本，并提供项目专用 Skill。

## 2. 已确认范围与默认值

- Git 根目录：当前工作区。
- 新应用目录：`album-studio/`。
- 项目文件夹扩展名：`.album-project`。
- PDF：A4 横向，封面为第 1 页。
- 素材策略：导入时复制原图，按内容 SHA-256 去重，编辑参数与原图分离。
- 旧数据：首版支持 JSON 和自包含 HTML，不试图原样保留旧 HTML 的运行时脚本。

首版不包含：云同步、多人协作、移动端、任意画布/图层系统、视频、内建自动更新、商店签名和公证。

## 3. 原项目审计结论

`原始项目参考/` 的主要产物是单页 HTML 和内嵌 Base64 图片的 JSON/HTML，通过 Windows 批处理启动本地服务。它已包含照片导入、分页、基础排版和导出思路，但有以下工程风险：

- UI、数据、文件 I/O 和打印逻辑耦合在单文件中。
- Base64 数据导致文件巨大、内存峰值高且无法复用缩略图。
- 缺少 schema 校验、原子保存、备份、自动化测试和跨平台发布链路。
- 文件系统权限边界不适合直接搬进 Electron renderer。

重构因此采用独立项目模型、内容寻址素材、窄 IPC 契约和单一页面渲染源。

## 4. 产品流程

### 4.1 项目首页

- 新建项目：选择保存位置、名称和初始主题。
- 打开项目：选择 `.album-project` 目录。
- 最近项目：打开已知项目；目录移动后可重新定位。
- 迁移旧相册：选择 JSON 或 HTML，预检后新建项目并复制素材。

### 4.2 工作区

- 顶部：项目名、保存状态、预览和导出。
- 素材库：图片/文件夹导入、多选、选中素材加入当前页或新页。
- 排版：封面与页面缩略导航、1–6 图模板、自动分页、页面与照片的明确移动按钮。
- 属性面板：主题、版式、照片、说明和页文字。窄视口下以可关闭面板展示。
- 照片编辑器：裁剪、缩放、位移、旋转、翻转、明亮/对比/饱和度和 6 种蒙版，操作均为非破坏性。

## 5. 技术架构

```text
album-studio/
├── apps/desktop/
│   ├── src/main/       Electron 主进程、存储、素材、迁移、PDF
│   ├── src/preload/    经校验的窄 IPC API
│   └── src/renderer/   React、shadcn/ui、Tailwind、Zustand
├── packages/common/        schema、IPC 契约、布局与迁移纯函数
└── scripts/                环境检查与跨平台开发入口
```

核心技术：

- Electron 43 + electron-vite 5
- React 19 + TypeScript 5.9 + Vite 7
- Tailwind CSS v4 + shadcn/ui/Radix UI
- Zustand + Zod
- `react-easy-crop` 用于裁剪交互
- Vitest + Testing Library + Playwright Electron
- electron-builder 用于 Windows/macOS 打包

### 5.1 进程边界

- 主进程是唯一可访问文件系统、系统对话框和 `printToPDF` 的进程。
- renderer 不启用 Node integration，且使用 context isolation。
- preload 不暴露 `ipcRenderer` 或任意路径读写，请求和响应通过 Zod 契约校验。
- 素材通过限定在已打开项目根内的 `album-asset:` 协议访问，拒绝路径穿越和符号链接逃逸。

## 6. 项目数据与持久化

```text
我的旅行.album-project/
├── manifest.json              # 版本化结构数据，不含 Base64
├── assets/
│   ├── original/                # 按内容 hash 存放的原图
│   ├── previews/                # 编辑界面缩略图
│   └── print/                   # PDF 高清预览图
└── backups/                   # 有界限的 manifest 备份
```

- `manifest.json` 存储 Project、Asset、Page、PhotoElement、TextStyle、Theme 和非破坏性参数。
- 写入采用同目录临时文件、文件 `fsync`、原子替换和目录同步；备份按修改时间轮转。
- renderer 自动保存并提供有界撤销/重做；窗口关闭前会先提交当前聚焦的表单值并等待保存确认。
- 图片导入时先校验实际解码结果，再写入原图、UI 预览图和打印预览图。
- 原图缺失时可重新选择文件；仅当 SHA-256 与记录一致时才恢复，避免错图。

## 7. 渲染、主题和 PDF

编辑画布、页面缩略图、整册预览和打印树均消费同一份 Page/Element 数据与布局函数；编辑模式只额外叠加选中框和空槽。

主题为项目级：

1. 旅途手账：温暖纸张、网格和衬线封面。
2. 海风明信片：清透青蓝、手写感封面和邮戳/地址线。
3. 胶片画廊：深色画布、高对比照片和胶片孔边框。

PDF 流程：

1. 保存当前项目并创建导出快照。
2. 仅在导出对话框存在时按需挂载隔离的打印树，加载 `assets/print/` 高清图。
3. 等待字体和图片就绪，再由主进程调用 `webContents.printToPDF`。
4. 先写临时 PDF，校验 `%PDF-` 头和非空大小后原子替换目标；失败不会将残缺文件伪装成成功产物。

Chromium 进入 `printToPDF` 后不支持安全中断，因此首版显示阶段进度但不提供“已开始打印后强制取消”。用户可在保存对话框阶段取消。

## 8. 开发与分发体验

### 8.1 最低门槛启动

- macOS：双击根目录 `dev.command`。
- Windows：双击根目录 `dev.cmd`。
- 终端：`node album-studio/scripts/dev.mjs`。

启动器会检查 Node.js >= 22.12.0，首次缺少依赖时自动执行 `npm install`，然后启动 Vite HMR 和 Electron。

### 8.2 项目 Skill

`.agents/skills/album-studio-dev/SKILL.md` 记录了启动、边界、必跑检查、大样本验收与跨平台打包方式，供后续对话式修改自动触发。

通过 `find-skills` 为项目安装并在 `skills-lock.json` 锁定了：

- `frontend-design`：建立明确的视觉方向，避免模板化界面。
- `shadcn`：管理 shadcn/ui 组件、用法和组合。
- `vercel-react-best-practices`：约束 React 状态、渲染和 bundle 性能。
- `web-design-guidelines`：检查可用性、响应式和无障碍界面。
- `webapp-testing`：使用 Playwright 验证本地界面、截图和日志。

### 8.3 打包

- Windows：`package-windows.cmd` / `npm run package:win`，x64 NSIS + portable。
- macOS：`package-macos.command` / `npm run package:mac`，Intel + Apple Silicon universal DMG。
- GitHub Actions：`.github/workflows/package.yml` 在 `windows-latest` 和 `macos-latest` 原生 runner 上运行检查和打包。

当前为内部测试用未公证产物。正式对外发布需用户提供 Apple Developer ID/Notary 凭据与 Windows Authenticode 证书，这些凭据不进仓库。

## 9. 验证结果

| 验证项 | 结果 |
| --- | --- |
| lint + TypeScript + production build | 通过 |
| common 单元测试 | 4/4 通过 |
| renderer/store 组件测试 | 5/5 通过 |
| Electron E2E | 6/6 通过；大样本用例默认跳过 |
| 视觉验收 | 1440×900、1100×720、800×640，3 主题 × 封面/1/2/4/6 图页已检查 |
| 真实旧相册 | 150 MB JSON、131 个去重素材、185 个放置项迁移通过 |
| PDF 压力验收 | 48 页、A4 横向、约 69 MB，首/中/末代表页渲染正常 |
| 源文件保护 | 迁移前后内容 hash 一致 |
| macOS 包 | universal DMG 生成、签名完整性通过、打包应用真实启动通过 |
| Windows 包 | x64 解包交叉构建成功，PE32+ `.exe`、ASAR 和安全熔丝已检查；NSIS/portable 原生产物由 Windows CI 生成，本次 macOS 主机不冒充 Windows 运行验收 |

## 10. 主要风险与后续边界

| 风险 | 当前控制 |
| --- | --- |
| 大图/长相册导致 UI 和 PDF 卡顿 | UI/print/original 三级资源，打印树按需挂载，150 MB 真实样本压测 |
| 保存时崩溃损坏项目 | schema 校验、原子写、`fsync`、轮转备份、关闭握手 |
| 原图丢失或项目移动 | 项目重定位；原图按内容 hash 校验后恢复 |
| Electron 文件读取扩权 | sandbox/context isolation、窄 IPC、协议根路径限制、安全熔丝 |
| 未签名安装包被系统拦截 | 内测文档明示说明；公开发布前配置 Apple/Windows 证书 |
| Chromium 打印无法中途安全取消 | 导出快照、阶段状态、临时文件验证和失败清理 |

## 11. 实施记录

完整勾选项和最终 Review 见 `docs/todo.md`；使用见 `docs/user-guide.md`；开发与发布见 `docs/development.md` 和 `docs/release.md`。关键架构决策保存在 `docs/adr/`。
