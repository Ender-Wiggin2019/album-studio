# ADR 0001：工作区与跨平台桌面壳

- 状态：已接受
- 日期：2026-08-15

## 决策

Git 边界放在当前仓库根目录，新代码位于 `album-studio/` npm workspace。桌面应用使用 Electron + electron-vite，React renderer 与 main/preload 分离；Node 统一为 22。

Windows 与 macOS 分别在原生 runner 打包。开发者和非技术协作者通过根目录 `dev.cmd` / `dev.command` 启动，脚本负责版本检查和首次安装。

## 原因与后果

npm 随 Node 提供，降低额外包管理器门槛；Electron 能复用同一套 React 界面与本地文件能力。代价是安装包体积较大，并且正式发布必须分别处理两个平台的签名。
