---
name: album-studio-dev
description: 启动、开发、修改、检查、测试或打包本仓库的“咔宝”电子相册软件时使用。适用于用户只说“为我启动”“启动项目”“启动网页版”，或直接提出新功能、界面调整、bug 修复、React 组件、shadcn 样式、Web/Electron 双端兼容、测试与发布需求。
---

# 咔宝项目助手

将仓库根目录作为工作目录。项目代码位于 `album-studio/`。先遵守根目录 `AGENTS.md`，并阅读 `docs/todo.md` 和 `docs/lessons.md`。不要让用户提供可以从代码中查到的技术信息。

## 使用简单中文

- 先说结果，再补充必要说明。使用短句，避免堆叠技术名词。
- 将“共享界面”“桌面功能”“网页功能”“数据规则”这类易懂说法告诉用户；技术词只在定位问题时补充。
- 根据简单需求自行查代码、选模块和验证。不要反问用户“要改哪个包”或“用什么库”。
- 只在产品结果存在明显不同的解释时询问，并用 2–3 个简单选项说明差别。
- 交付时只需说清“完成了什么、用户现在能做什么、检查结果”。用户未询问时，不展开内部实现。

## 直接启动

当用户说“为我启动”、“启动项目”或相近表达时，直接执行，不要只回复一段教程。

1. 默认启动桌面版。只有用户明确说“Web”、“网页版”或“浏览器版”时才启动 Web 版。无论是直接执行还是只说明启动计划，未指定 Web 时都要明确说“桌面版”，不向普通用户改用 `Electron` 这个技术名。
2. 先检查 Node.js。要求 22.12.0 或更高版本；版本不符且已安装 nvm 时，先运行 `nvm use`。
3. 在可继续读取输出的终端会话中运行：
   - 桌面版：`node album-studio/scripts/dev.mjs`
   - Web 版：`node album-studio/scripts/dev.mjs web`
4. 启动脚本会自动检查 npm 和依赖，缺少时会自动安装。等待出现可用窗口或地址后，再简单告诉用户“已启动”。
5. 启动失败时，直接查看错误并尝试解决。只在需要用户安装软件或做决定时请求帮助。

如果用户更喜欢双击，macOS 使用根目录 `dev.command` / `dev-web.command`，Windows 使用 `dev.cmd` / `dev-web.cmd`。

## 实现开发需求

任何功能、界面或 bug 任务都先完整阅读 [references/project-development.md](references/project-development.md)，再按以下顺序执行：

1. 将用户的简单描述转换成可见结果和可验证标准。优先查现有实现，不重复造功能。
2. 先确定改动属于数据规则、共享界面、桌面功能还是网页功能，只改必要层级。
3. 新功能需要复杂通用能力时，先检查已有依赖，再查候选库的官方文档、维护状态、类型、许可证、体积与 React 19/Vite/Electron/浏览器兼容性。不凭记忆填版本号。简单逻辑不为了“用库”而新增依赖。
4. 图标优先使用已安装的 `lucide-react`。组件先复用 `packages/studio/src/components/ui/` 内的 shadcn 原语；缺失时再通过项目的 `components.json` 添加 shadcn 组件，不手写已有成熟原语。
5. 让共享功能在 `packages/studio` 中只实现一次。需要系统或存储能力时，经过小而清晰的 `StudioPlatform` 能力接入，分别实现 desktop 和 web；不要复制两套界面。
6. 先运行与改动直接相关的测试，完成后在 `album-studio/` 运行 `npm run check`。可见界面改动还要在 desktop 和 web 上检查关键交互与窄窗口。

## 打包

- Windows 原生环境：运行 `npm run package:win`。
- macOS 原生环境：运行 `npm run package:mac`，然后运行 `npm run verify:package`。

从 `album-studio/` 运行上述命令。只将目标系统的原生验证结果说成已验收；不用 macOS 结果代替 Windows 运行证据。未签名安装包只用于内部测试，不提交证书或密码。
