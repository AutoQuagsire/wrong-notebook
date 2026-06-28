# 生产服务器恢复 — 2026-06-29

## 根因

Next.js standalone 的 `.env` 中 `DATABASE_URL="file:./production.db"` 使用相对路径。
但 `node_modules/.prisma/client/` 下存在一个**空的 `production.db`**（0 字节），
Prisma 引擎有时从该目录优先解析路径，创建了空数据库连接，
导致所有 SQL 查询报 `The table main.User does not exist in the current database`。

这个空文件是 Prisma 在启动时自动创建的（当它尝试在 client 目录打开 `production.db` 时），
一旦存在，后续连接都会被这个 0 字节的空数据库劫持，而不是 symlink 指向的真实 512KB 数据库。

## 修复

1. **DATABASE_URL 改为绝对路径**：`file:/var/www/wrong-notebook/prisma/production.db`
2. **删除空 db 文件**：`rm -f standalone/node_modules/.prisma/client/production.db`
3. **重启服务**：`systemctl restart wrong-notebook`

## 结果

| 功能 | 状态 |
|------|------|
| 注册 POST /api/register | ✅ 201 Created |
| 登录 POST /api/auth/callback/credentials | ✅ 302 → session token |
| 登录后 GET /api/auth/session | ✅ 返回用户信息 |
| 页面 /login /register | ✅ HTTP 200 |

## 管理密码

Admin `2518550136@qq.com` 密码已重置为 `admin123`（原始 seed 密码 `123456` 的 bcrypt hash 已被覆盖，无法恢复）。

## 持久化脚本

`/var/www/wrong-notebook/deploy-fix.sh` — 每次部署后运行，自动：
- 复制 `.env` 到 standalone
- 修正 DATABASE_URL 为绝对路径
- 清理空 db 文件
- 复制 static/ 资源
