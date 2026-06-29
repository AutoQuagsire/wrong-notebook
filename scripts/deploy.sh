#!/usr/bin/env bash
# ============================================================
# deploy.sh — 安全部署脚本（2C2G VPS 专用）
#
# 功能：
#   1. 拉取 origin/main 最新代码
#   2. 安装依赖
#   3. 保存旧 .next → .next.bak（零拷贝，仅 rename）
#   4. 停止 PM2
#   5. 用 webpack 构建（禁用 Turbopack，限制堆 768MB）
#   6. 构建成功 → 启动 PM2，清理 .next.bak
#   7. 构建失败 → 恢复 .next.bak + git reset 回旧 commit，启动 PM2
#
# 用法（前台，仅调试用）：
#   /opt/wrong-notebook/deploy.sh
#
# 用法（生产推荐——nohup 后台）：
#   nohup nice -n 10 ionice -c2 -n7 \
#     /opt/wrong-notebook/deploy.sh \
#     > /var/www/deploy.log 2>&1 &
#
# 约束：
#   - 仅使用 webpack（--webpack），禁用 Turbopack
#   - Node 堆内存上限 768MB
#   - 不执行 prisma migrate
#   - 不触碰数据库 / .env / 上传文件
#   - 构建失败自动回退到旧版本
#   - 请 Agent 不要手写 build 命令，始终使用本脚本
# ============================================================

set -uo pipefail
# 注意：不使用 set -e。构建可能失败，需要手动处理恢复逻辑。

# ---- 配置 ----
REPO_DIR="/var/www/wrong-notebook"
LOG_FILE="/var/www/deploy.log"
PM2_APP_NAME="wrong-notebook"
HEAP_LIMIT_MB=768

# ---- 环境 ----
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS="--max-old-space-size=${HEAP_LIMIT_MB}"

# ---- 可选：加载 nvm ----
if [ -f /root/.nvm/nvm.sh ]; then
    source /root/.nvm/nvm.sh
fi

# ---- 工具函数 ----
log() {
    echo "[$(date '+%H:%M:%S')] $*"
}

die() {
    log "FATAL: $*"
    exit 1
}

# ---- 开始 ----
echo "========================================"
log "DEPLOY-START"

# 检查仓库目录
if [ ! -d "$REPO_DIR" ]; then
    die "仓库目录不存在: $REPO_DIR"
fi
cd "$REPO_DIR"

# ---- [1/6] 拉取代码 ----
log "[1/6] 拉取最新代码..."
PREV_HEAD=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
log "当前 HEAD: $PREV_HEAD"

git fetch origin main || die "git fetch 失败"
git reset --hard origin/main || die "git reset 失败"
NEW_HEAD=$(git rev-parse --short HEAD)
log "新 HEAD: $NEW_HEAD"

if [ "$PREV_HEAD" = "$NEW_HEAD" ]; then
    log "代码无变化，跳过构建。"
    echo "DEPLOY-SKIP: $(date '+%Y-%m-%d %H:%M:%S')"
    exit 0
fi

# ---- [2/6] 安装依赖 ----
log "[2/6] 安装依赖..."
npm ci 2>&1 | tail -5 || {
    # npm ci 可能因为 NODE_ENV=production 跳过 devDeps
    # 但构建需要 devDeps（tailwind, typescript 等），重试
    log "npm ci 失败，尝试 npm ci --include=dev..."
    npm ci --include=dev 2>&1 | tail -5 || log "WARN: npm ci 仍有警告，继续构建"
}

# ---- [3/6] 保存旧构建 & 停止服务 ----
log "[3/6] 保存旧构建产物并停止服务..."

# 先停 PM2（避免旧版在构建期间响应不一致的请求）
pm2 stop "$PM2_APP_NAME" 2>/dev/null || log "PM2 进程未在运行"

# 原子重命名旧 .next（同文件系统零拷贝）
if [ -d .next ]; then
    rm -rf .next.bak 2>/dev/null || true
    mv .next .next.bak
    log "旧 .next 已保存为 .next.bak"
else
    log "NOTE: 无旧 .next，首次部署？"
    OLD_NEXT_EXISTS=false
fi

# ---- [4/6] 构建 ----
log "[4/6] 开始构建（webpack + heap ${HEAP_LIMIT_MB}MB）..."
BUILD_START=$(date +%s)

npx next build --webpack 2>&1
BUILD_EXIT=$?

BUILD_END=$(date +%s)
BUILD_DURATION=$((BUILD_END - BUILD_START))
log "构建耗时: ${BUILD_DURATION}s"

# ---- [5/6] 处理构建结果 ----
if [ $BUILD_EXIT -ne 0 ]; then
    # ---- 构建失败 → 恢复旧版本 ----
    log "[5/6] 构建失败 (exit=$BUILD_EXIT)，恢复旧版本..."

    # 清理失败的部分构建产物
    rm -rf .next

    # 恢复旧的 .next
    if [ -d .next.bak ]; then
        mv .next.bak .next
        log "已恢复旧 .next"
    else
        log "WARN: 无 .next.bak 可恢复"
    fi

    # 回退源码到旧 commit
    git reset --hard "$PREV_HEAD"
    log "源码已回退到: $PREV_HEAD"

    # 启动旧版本
    log "用旧版本启动 PM2..."
    pm2 start "$PM2_APP_NAME" 2>/dev/null || \
        pm2 start npm --name "$PM2_APP_NAME" -- run start -- -H 127.0.0.1 -p 3000
    pm2 save

    log "BUILD-FAILED: 已回退并恢复旧版本运行。"
    echo "========================================"
    exit 1
fi

# ---- 构建成功 ----
log "[5/6] 构建成功"

# 验证构建产物
if [ -f .next/BUILD_ID ]; then
    log "BUILD-ID: $(cat .next/BUILD_ID)"
else
    log "WARN: 未找到 .next/BUILD_ID，但继续..."
fi

# 清理备份
rm -rf .next.bak

# ---- [6/6] 启动服务 ----
log "[6/6] 启动 PM2..."
pm2 start "$PM2_APP_NAME" 2>/dev/null || \
    pm2 start npm --name "$PM2_APP_NAME" -- run start -- -H 127.0.0.1 -p 3000
pm2 save

# ---- 健康检查 ----
sleep 3
log "---- PM2 状态 ----"
pm2 status
log "---- 本地健康检查 ----"
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3000 2>/dev/null || echo "FAIL")
log "HTTP 状态码: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "304" ]; then
    log "健康检查通过"
else
    log "WARN: 健康检查返回 $HTTP_CODE，请手动确认"
fi

echo "========================================"
log "DEPLOY-DONE"
log "HEAD: $(git rev-parse --short HEAD)"
echo "========================================"
