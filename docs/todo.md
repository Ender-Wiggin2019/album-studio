# 完整实施清单

## 0. 调研与方案

- [x] 审计 `原始项目参考/` 的功能、数据结构、启动方式和主要风险。
- [x] 确认 Git 位置、应用目录、A4 横向 PDF、素材复制策略和旧数据范围。
- [x] 完成 `docs/plan.md`、设计方向与 4 份 ADR。
- [x] 使用 `find-skills` 安装并锁定 React、前端设计、shadcn、UI 审查和 Web 应用测试相关 Skill。
- [x] 确认 Node.js `v22.22.0` 满足 >= 22.12.0 的工程要求。

## 1. 工程骨架

- [x] 在当前工作区根初始化 Git，并排除私人旧相册和构建/测试产物。
- [x] 创建 `album-studio/` npm workspace 与 Electron/electron-vite/React/TypeScript 骨架。
- [x] 集成 Tailwind CSS v4 与实际需要的 shadcn/Radix 组件。
- [x] 建立 main/preload/renderer/common 边界、Zod IPC 契约与安全自定义协议。
- [x] 添加 Windows `dev.cmd`、macOS `dev.command` 和共享环境/启动脚本。
- [x] 创建 `.agents/skills/album-studio-dev` 项目专用 Skill。

## 2. 数据与存储

- [x] 实现项目、素材、页面、元素、主题和导出 schema。
- [x] 实现 schema 校验、版本迁移、项目新建/打开、原子保存、`fsync`、自动保存和备份。
- [x] 实现素材复制、SHA-256 去重、UI/print 预览图、稳定协议和缺失原图恢复。
- [x] 实现旧 schema 2/4 JSON 和自包含 HTML 导入，不修改源文件。

## 3. 产品主流程

- [x] 实现项目首页：新建、打开、最近项目、移动项目重定位和旧相册迁移。
- [x] 实现项目 → 素材库 → 选择素材 → 排版/编辑 → 预览/导出层级。
- [x] 实现图片/文件夹导入、缩略图、多选、排序、去重结果、阶段进度和跳过文件明细。
- [x] 实现封面、1–6 图布局、自动分页、安全布局切换、页面/照片移动和空位。

## 4. 编辑与主题

- [x] 实现非破坏性裁剪、缩放、位移、旋转、翻转、滤镜和蒙版。
- [x] 实现照片说明、页文字、封面文字和文字样式编辑。
- [x] 实现有界撤销/重做、重置、保存状态和关闭前保存握手。
- [x] 实现旅途手账、海风明信片、胶片画廊 3 套项目级主题。
- [x] 实现整册预览、页面缩略导航和窄视口可达属性面板。

## 5. PDF 与跨平台交付

- [x] 实现含封面的 A4 横向 PDF、资源就绪握手、阶段进度、临时文件校验和失败清理。
- [x] 配置 Windows x64 NSIS/portable 和 macOS Intel/Apple Silicon universal DMG。
- [x] 添加 Windows/macOS 原生 CI 构建矩阵、macOS 打包启动检查和签名/公证说明。
- [x] 完成用户快速开始、开发指南、迁移、故障排查和发布文档。

## 6. 验证与完成审计

- [x] common 单元测试覆盖 schema、旧数据迁移、布局和主题。
- [x] renderer/store 测试覆盖主题、照片移动、布局安全收缩和分页。
- [x] Electron E2E 覆盖新建 → 导入 → 排版 → 保存 → 重开 → 导出，以及迁移、关闭保存和缺图恢复。
- [x] 视觉检查覆盖 3 套主题、5 种页型和 1440/1100/800 代表视口。
- [x] PDF 检查覆盖页数、A4 尺寸、中文字体、图像清晰度和代表页预览一致性。
- [x] 185 张放置的真实旧相册完成迁移和 48 页 PDF 压力验证。
- [x] 依赖树、Electron 安全熔丝、macOS 签名完整性和已打包应用启动通过。
- [x] 逐项对照 `docs/plan.md` 完成收口审计。

## Review

首版计划已完成。最终本地验收数据：9 个单元/组件测试全部通过，6 个 Electron E2E 全部通过，150 MB 旧 JSON 迁移为 131 个去重素材和 185 个放置项，导出 48 页 A4 横向 PDF（约 69 MB）。macOS universal DMG 已生成，内含 x86_64/arm64，签名完整性与真实启动通过。

Windows x64 解包交叉构建已成功，并确认 PE32+ `.exe`、ASAR 与 Electron 安全熔丝；NSIS/portable 已配置在 Windows 原生 GitHub Actions runner 构建。当前工作机为 macOS，因此没有伪造 Windows 本机启动结果。正式公开发布仍需外部的 Apple Developer ID/Notary 和 Windows Authenticode 证书；这不影响内部未签名包的开发与测试。
