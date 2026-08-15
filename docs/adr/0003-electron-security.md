# ADR 0003：Electron 安全边界

- 状态：已接受
- 日期：2026-08-15

## 决策

renderer 始终启用 sandbox、context isolation、web security，并禁用 Node integration。preload 只暴露按项目、素材、迁移和导出分组的窄 API；IPC 请求由 Zod 校验并确认来自主窗口 main frame。

应用禁止新窗口、导航和权限请求。renderer 不接触路径、Buffer 或 Base64；素材通过 `album-asset://` 的 project/asset id 读取，main 在 realpath 后验证文件仍位于已注册项目目录。

## 原因与后果

这把本地文件权限限制在少数可测试的深模块内。新增文件能力时必须先扩展 common 契约和 main 校验，不能直接把 Electron 或 Node API 暴露给 React。
