#Requires -Version 5.1
<#
.SYNOPSIS
  wrong-notebook 本地首次初始化脚本（Windows PowerShell 5.1+）

.DESCRIPTION
  安全完成：
  1. 检查 Node.js / npm / 项目目录
  2. 安装依赖（仅在 node_modules 不存在时）
  3. 创建并补全 .env
  4. 生成 Prisma Client
  5. 应用已有迁移；若仓库没有迁移且数据库尚不存在，则执行 db push
  6. 可选执行 seed

  不会执行：
  - prisma migrate reset
  - npm audit fix --force
  - 删除或覆盖已有数据库
  - 升级依赖

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\setup-local.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\setup-local.ps1 -Seed
#>

[CmdletBinding()]
param(
    [switch]$Seed
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Set-EnvValue {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Key,
        [Parameter(Mandatory)][string]$Value
    )

    $lines = if (Test-Path $Path) {
        Get-Content -LiteralPath $Path -Encoding UTF8
    } else {
        @()
    }

    $pattern = "^\s*{0}\s*=" -f [regex]::Escape($Key)
    $replacement = '{0}="{1}"' -f $Key, ($Value -replace '"', '\"')
    $replaced = $false

    $updated = foreach ($line in $lines) {
        if ($line -match $pattern) {
            if (-not $replaced) {
                $replacement
                $replaced = $true
            }
        } else {
            $line
        }
    }

    if (-not $replaced) {
        $updated += $replacement
    }

    Set-Content -LiteralPath $Path -Value $updated -Encoding UTF8
}

function New-RandomSecret {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
        return [Convert]::ToBase64String($bytes)
    }
    finally {
        $rng.Dispose()
    }
}

Write-Step "检查当前目录"

$requiredFiles = @(
    "package.json",
    "prisma\schema.prisma"
)

foreach ($file in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "当前目录不是 wrong-notebook 项目根目录，缺少：$file"
    }
}

Write-Host "项目目录：$(Get-Location)"

Write-Step "检查开发环境"

foreach ($command in @("node", "npm", "npx")) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "未找到命令：$command。请先安装 Node.js 20+。"
    }
}

$nodeVersion = node --version
$npmVersion = npm --version
Write-Host "Node.js: $nodeVersion"
Write-Host "npm:     $npmVersion"

$nodeMajor = [int](($nodeVersion -replace '^v', '').Split('.')[0])
if ($nodeMajor -lt 20) {
    throw "当前 Node.js 为 $nodeVersion，建议使用 Node.js 20 或更高版本。"
}

Write-Step "检查 Git 工作区"

if (Get-Command git -ErrorAction SilentlyContinue) {
    $gitStatus = git status --porcelain
    if ($LASTEXITCODE -eq 0 -and $gitStatus) {
        Write-Warning "工作区存在未提交修改。脚本不会覆盖这些修改，但请在继续开发前检查 git status。"
    }
}

Write-Step "安装依赖"

if (Test-Path -LiteralPath "node_modules") {
    Write-Host "node_modules 已存在，跳过依赖安装。"
} elseif (Test-Path -LiteralPath "package-lock.json") {
    npm ci
} else {
    npm install
}

Write-Step "创建并补全 .env"

$envPath = Join-Path (Get-Location) ".env"

if (-not (Test-Path -LiteralPath $envPath)) {
    if (Test-Path -LiteralPath ".env.example") {
        Copy-Item -LiteralPath ".env.example" -Destination $envPath
        Write-Host "已从 .env.example 创建 .env"
    } else {
        New-Item -ItemType File -Path $envPath | Out-Null
        Write-Host "已创建空白 .env"
    }
} else {
    Write-Host ".env 已存在，将只补全/更新本地必需项。"
}

Set-EnvValue -Path $envPath -Key "DATABASE_URL" -Value "file:./dev.db"
Set-EnvValue -Path $envPath -Key "NEXTAUTH_URL" -Value "http://localhost:3000"
Set-EnvValue -Path $envPath -Key "AUTH_TRUST_HOST" -Value "true"

$currentEnv = Get-Content -LiteralPath $envPath -Encoding UTF8
$hasValidSecret = $false

foreach ($line in $currentEnv) {
    if ($line -match '^\s*NEXTAUTH_SECRET\s*=\s*"?(.+?)"?\s*$') {
        $secretValue = $Matches[1].Trim('"')
        if ($secretValue -and $secretValue -notmatch 'change|replace|your|example|random') {
            $hasValidSecret = $true
            break
        }
    }
}

if (-not $hasValidSecret) {
    Set-EnvValue -Path $envPath -Key "NEXTAUTH_SECRET" -Value (New-RandomSecret)
    Write-Host "已生成新的 NEXTAUTH_SECRET"
} else {
    Write-Host "检测到已有 NEXTAUTH_SECRET，保持不变。"
}

Write-Step "生成 Prisma Client"
npx prisma generate

Write-Step "初始化数据库"

$migrationsPath = Join-Path (Get-Location) "prisma\migrations"
$databasePath = Join-Path (Get-Location) "prisma\dev.db"

$hasMigrations = Test-Path -LiteralPath $migrationsPath -PathType Container
if ($hasMigrations) {
    $migrationDirs = Get-ChildItem -LiteralPath $migrationsPath -Directory -ErrorAction SilentlyContinue
    $hasMigrations = $migrationDirs.Count -gt 0
}

if ($hasMigrations) {
    Write-Host "检测到已有 Prisma migrations，执行 migrate deploy。"
    npx prisma migrate deploy
} else {
    if (Test-Path -LiteralPath $databasePath) {
        throw @"
仓库中没有 Prisma migrations，但检测到数据库已存在：
$databasePath

为避免覆盖已有数据，脚本已停止。
请先备份数据库，再人工确认是否执行：
  npx prisma db push
"@
    }

    Write-Warning "仓库中没有 Prisma migrations，且当前为新数据库；执行 prisma db push 创建表。"
    npx prisma db push
}

if ($Seed) {
    Write-Step "执行数据库 Seed"
    npx prisma db seed
}

Write-Step "执行 Prisma 校验"
npx prisma validate

Write-Step "初始化完成"

Write-Host @"

下一步运行：

  npm run dev

然后访问：

  http://localhost:3000

注意：
- npm run dev 会持续占用当前终端，这是正常现象。
- 不要执行 npm audit fix --force。
- 不要执行 prisma migrate reset。
- .env、prisma/dev.db、上传图片和教材文件不得提交到 Git。
"@ -ForegroundColor Green
