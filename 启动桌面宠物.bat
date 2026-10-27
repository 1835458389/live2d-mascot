@echo off
chcp 65001 >nul
title 桌面看板娘
cd /d "%~dp0desktop"
if not exist "node_modules\electron\dist\electron.exe" (
  echo 第一次使用，正在准备运行环境，大约需要几分钟，请不要关闭这个窗口……
  call npm install
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo 运行环境没有装好。请确认这台电脑已安装 Node.js 并且能上网，然后再双击一次。
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" .
