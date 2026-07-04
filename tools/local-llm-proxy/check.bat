@echo off
chcp 65001 >nul
echo.
echo 检查本地代理健康状态...
echo.
curl -s http://127.0.0.1:8787/health 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [失败] 无法连接到本地代理。请确认 start.bat 正在运行。
    echo 如果 curl 不可用，请在浏览器打开：http://127.0.0.1:8787/health
)
echo.
pause
