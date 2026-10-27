@echo off
title Live2D mascot
cd /d "%~dp0"
node serve.mjs --open || pause
