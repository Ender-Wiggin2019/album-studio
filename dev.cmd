@echo off
chcp 65001 >nul
setlocal

where node >nul 2>nul
if errorlevel 1 (
  echo [咔宝] 未找到 Node.js。请先安装 Node.js 22 LTS。
  echo https://nodejs.org/
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [咔宝] 未找到 npm。请重新安装 Node.js 22 LTS。
  echo https://nodejs.org/
  pause
  exit /b 1
)

node "%~dp0album-studio\scripts\dev.mjs"
if errorlevel 1 (
  echo.
  echo [咔宝] 启动失败，请把上面的错误信息发给开发人员。
  pause
  exit /b 1
)
