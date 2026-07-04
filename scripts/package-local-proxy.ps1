# package-local-proxy.ps1
# 管理员打包脚本：生成本地代理的用户分发包 (local-llm-proxy.zip)
#
# 用法（PowerShell）:
#   cd E:\Projects\wrong-notebook
#   .\scripts\package-local-proxy.ps1
#
# 输出文件:
#   local-llm-proxy.zip (项目根目录)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSCommandPath | Split-Path -Parent
$sourceDir = Join-Path $repoRoot "tools\local-llm-proxy"
$outputFile = Join-Path $repoRoot "local-llm-proxy.zip"

# 确认源目录存在
if (-not (Test-Path $sourceDir)) {
    Write-Host "[ERROR] 源目录不存在: $sourceDir" -ForegroundColor Red
    exit 1
}

# 删除旧 zip
if (Test-Path $outputFile) {
    Remove-Item $outputFile -Force
    Write-Host "[INFO] 已删除旧 zip: $outputFile"
}

# 打包（排除 .env / node_modules / .log 文件）
Write-Host "[INFO] 正在打包..."
Compress-Archive -Path @(
    (Join-Path $sourceDir "package.json"),
    (Join-Path $sourceDir "package-lock.json"),
    (Join-Path $sourceDir "server.mjs"),
    (Join-Path $sourceDir "start.bat"),
    (Join-Path $sourceDir "check.bat"),
    (Join-Path $sourceDir ".env.example"),
    (Join-Path $sourceDir "README.md")
) -DestinationPath $outputFile -Force

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $outputFile)) {
    Write-Host "[ERROR] 打包失败" -ForegroundColor Red
    exit 1
}

$size = (Get-Item $outputFile).Length
Write-Host "[DONE] 打包完成: $outputFile ($([math]::Round($size/1024)) KB)"
Write-Host ""
Write-Host "===== 给用户的分发清单 ====="
Write-Host "1. 将 local-llm-proxy.zip 发给用户"
Write-Host "2. 用户解压后双击 start.bat"
Write-Host "3. 用户浏览器打开 http://127.0.0.1:8787/health 验证"
Write-Host "4. 用户参考 docs/LOCAL_PROXY_MVP.md 配置网页"
Write-Host ""
Write-Host "===== 排除的文件（不会打包）====="
Write-Host "  .env         — 用户的密钥文件，不应分发"
Write-Host "  node_modules — 用户本地 npm install 生成"
Write-Host "  *.log        — 运行时日志"
