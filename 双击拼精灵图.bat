@echo off
chcp 65001 >nul
title Pin Jing Ling Tu - sprite sheet packer
cd /d "%~dp0"
set PORT=8163
start "" "http://localhost:8163/%E5%B7%A5%E5%85%B7/%E6%8B%BC%E7%B2%BE%E7%81%B5%E5%9B%BE.html"
node serve.mjs
pause
