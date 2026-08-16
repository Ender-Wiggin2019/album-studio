#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"

pause_on_error() {
  printf '\n按回车键关闭此窗口…'
  read -r _
}

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' '[电子相册工作室] 未找到 Node.js。请先安装 Node.js 22 LTS：https://nodejs.org/'
  pause_on_error
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  printf '%s\n' '[电子相册工作室] 未找到 npm。请重新安装 Node.js 22 LTS：https://nodejs.org/'
  pause_on_error
  exit 1
fi

if ! node "$script_dir/album-studio/scripts/dev.mjs"; then
  printf '\n%s\n' '[电子相册工作室] 启动失败，请复制上面的错误信息并发给开发人员。'
  pause_on_error
  exit 1
fi
