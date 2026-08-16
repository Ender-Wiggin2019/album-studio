# 项目开发参考

## 先选正确层级

| 需求类型 | 主要位置 | 规则 |
| --- | --- | --- |
| 相册数据、编辑命令、几何、模板、裁剪/滤镜参数 | `album-studio/packages/common/` | 保持纯 TypeScript，不依赖 React、Electron 或浏览器存储。通过 `executeAlbumCommand` 改文档，不直接改深层状态。 |
| 桌面和网页共用的 React 界面与交互 | `album-studio/packages/studio/src/` | 只实现一份，只通过 `StudioPlatform` 使用平台能力。 |
| 文件系统、系统对话框、Sharp、PDF、安全 IPC | `album-studio/apps/desktop/src/main/` | 真实路径和系统权限留在 main。不向共享界面暴露 `fs`、`ipcRenderer` 或任意路径读取。 |
| Electron 安全桥接 | `album-studio/apps/desktop/src/preload/` | 只添加经 `packages/common/src/ipc/` 中 Zod 契约校验的窄 API。 |
| 桌面 React 入口和 adapter | `album-studio/apps/desktop/src/renderer/` | 只组装共享 Studio 并转换 preload API，不放页面或业务规则。 |
| OPFS、File API、Blob URL、Pica、浏览器打印 | `album-studio/apps/web/src/` | 只实现浏览器 adapter 与入口，不复制共享 Studio。 |

## 再选 React 内部层级

- 将 provider、全局 store、保存会话和应用入口放在 `packages/studio/src/app/`。
- 将整页组合放在 `packages/studio/src/pages/`；页面只组装功能，不承担可复用的复杂规则。
- 将一项用户能力放在 `packages/studio/src/features/`，例如素材、画布、图片编辑、属性、页面和预览。让功能组件、hook 和局部状态保持靠近。
- 将无相册业务规则的稳定 shadcn 原语放在 `packages/studio/src/components/ui/`。不将整个业务功能伪装成通用组件。
- 只将确实被多个 feature 共用的小工具放在 `packages/studio/src/shared/`；不要提前抽象一次性代码。

## 添加平台能力

1. 先判断两端是否都能提供该结果。
2. 在 `packages/studio/src/app/platform/studio-platform.ts` 增加最小接口；不在接口中暴露路径、IPC 通道、OPFS handle 或 Blob URL 所有权。
3. 分别更新 desktop adapter 和 browser adapter。某端无法提供真实结果时，用 `capabilities` 隐藏或明确降级，不伪造成功。
4. Electron 能力同步更新 common IPC 契约、main handler、preload 和 desktop adapter，并保持 sandbox、context isolation 和路径校验。
5. 在 desktop 和 web 上验证共享界面、错误状态和功能可用性。

## 选择组件与第三方库

1. 先搜索现有组件、现有导入和各 workspace 的 `package.json`。
2. 通用交互先用 `packages/studio/src/components/ui/` 的 shadcn 组件；需要新原语时，使用 `packages/studio/components.json` 的现有配置添加，并保持现有 Nova 风格和 CSS token。
3. 所有常见界面图标先在 `lucide-react` 查找，保持统一线条和尺寸；不用 emoji、手写 SVG 或文字方块代替。
4. 拖拽、裁剪、图像处理、文档解析等复杂能力先评估成熟库。只在候选库不兼容、维护不可靠、体积/权限代价过大，或需求本身很小时自行实现。
5. 将新依赖安装到真正拥有它的 workspace，同步提交 `album-studio/package-lock.json`。对桌面原生依赖额外验证 Electron 打包，对共享依赖检查 Web bundle。

## 可维护性门禁

- 修改 `AlbumDocument` 或命令时，在 `packages/common/tests/` 保护严格解析、不变量、revision 和 undo/redo patches。
- 修改共享渲染时，继续复用 `AlbumPageView` / `ImageElementView`；不为编辑、预览、Web 打印或 PDF 建立第二套布局模型。
- 修改图片资源时，通过 `AssetImage/useAssetSource` 取图并保持资源释放；不在 React 中拼接物理路径或 `album-asset:` URL。
- 将每个新功能作为一个完整小闭环：数据/接口、用户界面、错误状态、测试和双端行为同步完成。
- 先跑定向测试，最后在 `album-studio/` 运行 `npm run check`。可见 UI 检查 1440×900、1100×720、800×640，并包括长中文、空状态和失败状态。

需要更多细节时，按改动范围阅读 `docs/development.md` 和相关 `docs/adr/`；不必为一个小组件一次加载所有架构文档。
