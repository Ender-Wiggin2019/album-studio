# ADR 0003：Electron 安全与启动边界

- 状态：已接受
- 决策日期：2026-08-15
- 更新日期：2026-08-16

## 背景

桌面应用需要文件系统、系统对话框、图片管线和 PDF 写入能力，但共享 React 界面不应获得这些权限。开发服务器与打包后的 `file:` 页面也需要不同且可验证的加载策略；错误配置 Electron fuse 会直接导致生产包白屏。

## 决策

- renderer 始终启用 sandbox、context isolation 和 web security，并禁用 Node integration。
- preload 只暴露按 `StudioPlatform` 能力组织的窄 API，不暴露 `ipcRenderer`、路径、Buffer 或任意文件读写。
- IPC 请求/响应使用 `packages/common` 中的 Zod 契约校验，并确认调用来自主窗口 main frame。
- 禁止新窗口、外部导航和权限请求；渲染进程崩溃、preload 错误与页面加载失败都有可见错误信息。
- 开发环境加载 Vite URL；生产环境等待 `loadFile()` 完成后展示窗口。
- `album-asset:` 只接受经过校验的项目/素材标识、缓存版本和质量参数，主进程在 realpath 后确认文件仍位于已打开项目根内。
- CSP 由主进程生成：开发模式仅放行 HMR 所需的 `ws/http/https` 与内联脚本，生产模式仅允许自身资源和 `album-asset:`，其余指令保持收紧。

生产 fuses 设置为：

| Fuse | 值 |
| --- | --- |
| RunAsNode | 关闭 |
| Cookie encryption | 开启 |
| Node options environment variable | 关闭 |
| CLI inspect arguments | 关闭 |
| Embedded ASAR integrity validation | 开启 |
| Only load app from ASAR | 开启 |
| File protocol extra privileges | 开启 |

file protocol extra privileges 必须开启，因为打包后的页面通过 `loadFile()` 读取 ASAR 内的 HTML、JavaScript 和 CSS。关闭它会造成生产包 `ERR_FILE_NOT_FOUND`/白屏；这项加载要求不改变 renderer 的 Node、IPC 或任意文件访问权限。

## 结果

- 本地文件与系统能力集中在少数可测试的 main/preload 深模块中。
- 新增平台能力必须先扩展 common 契约与 main 校验，再由桌面适配器暴露；React 组件不能直接依赖 Electron。
- 开发和生产 CSP 不相同，因此 dev smoke 与 package smoke 都必须执行。
- fuse 不能按“开启越少越安全”机械修改，必须和实际启动路径一起验证。
