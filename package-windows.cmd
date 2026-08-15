@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0album-studio"

node scripts\check-env.mjs
if errorlevel 1 goto error
npm run package:win
if errorlevel 1 goto error
exit /b 0

:error
echo.
echo [电子相册工作室] 打包失败，请查看上面的错误信息。
pause
exit /b 1
