@echo off
chcp 65001 >nul
title 换装姿势图 · 收图验收
cd /d "%~dp0"
node 工具\收图验收.mjs
echo.
pause
