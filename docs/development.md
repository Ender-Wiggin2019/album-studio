# 开发指南

## 1. 环境

- Windows 10/11 或受支持的 macOS。
- Node.js >= 22.12.0；仓库 `.nvmrc` 固定 Node 22。
- npm（随 Node 安装）。

在仓库根目录运行：

```bash
node album-studio/scripts/check-env.mjs
```

如果本机有 nvm 且版本不符，先运行 `nvm use`。

## 2. 最快启动

- macOS：双击 `dev.command`。
- Windows：双击 `dev.cmd`。
- 终端：`node album-studio/scripts/dev.mjs`。

启动脚本在首次运行时自动安装依赖，之后启动 Electron + Vite 热更新。

## 3. 常用命令

以下命令均在 `album-studio/` 中执行：

```bash
npm install
npm run dev
npm run check
npm run test:e2e
npm run package:mac
npm run package:win
```

`npm run check` 是提交前必跑门禁，依次执行 ESLint、Node/renderer TypeScript、common/desktop 测试和 production build。`npm run test:e2e` 会先重新构建，再启动 Electron 执行端到端流程。

## 4. 代码边界

```text
album-studio/
├── apps/desktop/
│   ├── src/main/       文件、对话框、存储、素材、迁移、PDF
│   ├── src/preload/    窄 IPC 桥接
│   ├── src/renderer/   React UI、store、相册渲染
│   └── e2e/            Playwright Electron 验收
└── packages/common/        schema、契约、迁移和布局纯函数
```

规则：

- client 和 main 共用的数据结构、枚举、校验和纯逻辑放在 `packages/common`。
- renderer 不直接使用 `fs`、Node API 或 `ipcRenderer`。新增特权操作时，同步更新 common 契约、main handler、preload 与 renderer 类型。
- 页面视觉改动应共用现有 Page/PhotoSlot 渲染链，不为 PDF 复制第二套布局。
- 素材编辑保持非破坏性；不修改 `assets/original/` 中的原图。
- 改动页面容量、页面顺序或照片移动时，先增加 store/common 回归测试。

## 5. 测试

### 快速门禁

```bash
npm run check
```

### Electron E2E

```bash
npm run test:e2e
```

默认 E2E 覆盖新建/导入/分页/保存重开/PDF、JSON/HTML 迁移、关闭前保存、缺图重连、三主题与多视口快照。截图和 PDF 位于被 Git 忽略的 `apps/desktop/test-results/`。

### 大样本迁移/PDF

大样本不进仓库，只有显式给出本地旧 JSON 时才运行：

```bash
ALBUM_STUDIO_LARGE_LEGACY="/绝对路径/旧相册.json" npm run test:e2e:large
```

它验证迁移数量、内容去重、源 hash 不变、无 Base64 写入新 manifest、原图协议尺寸、PDF 头与内存指标。

### UI 修改的视觉门禁

至少检查：

- 1440×900 默认窗口。
- 1100×720 紧凑桌面窗口。
- 800×640 窄窗口与属性面板。
- 3 套主题的封面和 1/2/4/6 图页。
- 导出 PDF 的首页、中间照片页和末页。

## 6. 项目存储调试

`.album-project/manifest.json` 是受 Zod schema 管理的版本化文件。不要手动引入绝对路径或 Base64。原图按 SHA-256 存入 `assets/original/`，`assets/previews/` 和 `assets/print/` 都可重建。

测试中需要创建临时项目时，使用系统临时目录并在 `finally` 中清理；不要将私人旧相册或测试副本提交进 Git。

## 7. 对话式维护

仓库级 Skill 位于 `.agents/skills/album-studio-dev/SKILL.md`。请后续代理在修改前读取它和 `AGENTS.md`，保持进程边界、数据一致性和验收门禁。

具体打包与签名见 `docs/release.md`。
