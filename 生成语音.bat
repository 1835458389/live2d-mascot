@echo off
chcp 65001 >nul
title 生成看板娘语音
cd /d "%~dp0"
node voice\generate.mjs
echo.
pause
