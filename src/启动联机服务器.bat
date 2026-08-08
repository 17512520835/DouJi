@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 斗鸡 Online 启动中...
node online-server.js
pause
