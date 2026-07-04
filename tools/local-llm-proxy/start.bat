@echo off
chcp 65001 >nul
title 错题库本地代理 - Local LLM Proxy

echo.
echo =============================================
echo   错题库 AI 本地代理 (Local LLM Proxy)
echo =============================================
echo.

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未检测到 Node.js。
    echo.
    echo 请先安装 Node.js LTS 版本：
    echo https://nodejs.org/
    echo.
    echo 安装完成后重新运行 start.bat。
    echo.
    pause
    exit /b 1
)

:: Print Node version
for /f "tokens=*" %%i in ('node -v') do echo Node.js 版本: %%i
echo.

:: Check if .env exists; if not, create from example
if not exist ".env" (
    echo [提示] 未找到 .env 配置文件。
    echo 正在从 .env.example 复制...
    copy .env.example .env >nul
    echo.
    echo 请先编辑 .env 填写你的配置：
    echo.
    echo   - 不要改 PORT 和 ALLOWED_ORIGINS，默认已配置好的
    echo   - 这是 web 端的请求转发代理，API Key 在网页设置里填
    echo.
    echo 按回车打开 .env 进行编辑...
    pause >nul
    start notepad .env
    echo.
    echo 编辑完成并保存后，关闭此窗口，重新双击 start.bat 启动。
    echo.
    pause
    exit /b 0
)

:: Install dependencies if needed
if not exist "node_modules\" (
    echo [安装] 正在安装依赖，请稍候...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [错误] npm install 失败，请检查网络连接或 Node.js 安装。
        pause
        exit /b 1
    )
    echo.
)

echo [启动] 本地代理启动中...
echo.
echo 启动后请勿关闭此窗口。按 Ctrl+C 即可停止代理。
echo.
echo 健康检查页面：http://127.0.0.1:8787/health
echo.
echo =============================================
echo.

call npm start

echo.
echo 代理已停止。
pause
