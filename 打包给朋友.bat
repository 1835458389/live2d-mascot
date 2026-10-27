@echo off
chcp 65001 >nul
title 打包给朋友
cd /d "%~dp0"
node desktop\build-portable.mjs
echo.
pause
