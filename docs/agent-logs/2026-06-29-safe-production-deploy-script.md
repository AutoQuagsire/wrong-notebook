---
title: "安全生产部署脚本固化"
date: 2026-06-29
type: task
summary: 为2C2G低配VPS编写安全部署脚本，避免Turbopack OOM导致服务器卡死
---

## 背景

- TASK-037 复习页备注功能已完成，需要部署到生产服务器
- 生产服务器是 2C2G VPS（实际可用 ~1.6GiB）
- 之前默认 `next build`（Turbopack）导致服务器 OOM 卡死，已通过恢复流程解决

## 本次完成

- 创建 `scripts/deploy.sh` — 安全部署脚本
- 核心安全措施：
  - 使用 `next build --webpack`，禁用 Turbopack
  - Node 堆内存限制 768MB（`--max-old-space-size=768`）
  - 构建前先 `mv .next .next.bak` 备份旧构建产物
  - 构建失败自动恢复：回退 `.next.bak` + git reset 旧 commit + 启动旧版 PM2
  - 不使用 `set -e`，确保恢复逻辑可执行
  - 不执行 `prisma migrate`，不触碰数据库/.env/上传文件
- bash 语法检查通过

## 未做

- 本次未连接生产服务器
- 本次未执行部署
- 脚本尚未复制到 `/opt/wrong-notebook/deploy.sh`

## 下一步

部署时将脚本复制到服务器：
```bash
scp scripts/deploy.sh root@8.148.71.66:/opt/wrong-notebook/deploy.sh
ssh root@8.148.71.66 "chmod +x /opt/wrong-notebook/deploy.sh"
```

然后执行部署：
```bash
ssh root@8.148.71.66
nohup nice -n 10 ionice -c2 -n7 \
  /opt/wrong-notebook/deploy.sh \
  > /var/www/deploy.log 2>&1 &
tail -f /var/www/deploy.log
```
