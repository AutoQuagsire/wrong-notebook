# CLAUDE.md

Claude Code 协助本项目的约束文件。

## 核心约束

- 遵守仓库根目录 `AGENTS.md` 中的所有规则。
- 每次只处理一个任务目标，不要跨越任务边界。
- 不要修改任务范围外的文件。
- 不要修复全仓历史 lint，除非任务明确要求修复 lint。
- 不要运行破坏性数据库命令（reset、force-push、drop table 等）。
- 不要执行 `git push --force`、`git reset --hard`、`git clean -fd`。
- 不要读取或记录 `.env` 内容、API Key、数据库内容、用户私密数据。
- 所有文档和源码文件保持 UTF-8 编码。

## 完成任务后

在 `docs/agent-logs/` 下写一份简短任务日志，命名格式为：

```
YYYY-MM-DD-agent-task-name.md
```

日志完成后追加到 `CLAUDE.md` 底部的最新提交记录区。

## 最新提交

- `CHORE` chore: add safe production deploy script (TASK-037 deploy prep)
- `9abedcb` feat: add persistent notes section to review page per error item
- `03cc457` fix: prevent \n-to-newline replacement from corrupting LaTeX \neq in math blocks
- `TASK-040` feat: show and filter question types in UI — error detail badge, list card badge, list type filter, detail page type editing, unit tests

日志只写摘要，不粘贴完整终端输出。格式遵循 `docs/agent-logs/README.md` 模板。

## 修改代码前

- 运行 `git status` 确认当前状态。
- 不覆盖用户未提交的修改。
- 确认修改范围是否与任务描述一致。

## 禁止事项

- 不自动创建 commit。
- 不自动 push。
- 不提交 `.env`、`prisma/dev.db`、API Key、数据库备份、用户图片。
- 不修改 `AGENTS.md` 之外的项目文档（除非任务要求）。
- 不直接操作生产服务器 `/var/www/wrong-notebook`，除非任务明确要求。
- 不在生产环境执行 `npx prisma migrate reset`。
- 不用本地 `prisma/dev.db` 覆盖生产 `production.db`。

## Production Deployment Constraints

### 生产环境概要

| 项目 | 值 |
|------|-----|
| 服务器 | 8.148.71.66 (2C2G VPS) |
| 项目路径 | `/var/www/wrong-notebook` |
| 服务管理 | **systemd**（`wrong-notebook.service`） |
| 反向代理 | nginx（**不是 PM2**） |
| 数据库 | `/var/www/wrong-notebook/prisma/production.db` |
| DATABASE_URL | `file:/var/www/wrong-notebook/prisma/production.db` |
| 运行时 | `node .next/standalone/server.js` |
| 标准部署 | GitHub Actions 构建 standalone → 上传 artifact → systemctl restart |

### 1. 生产机禁止构建

**原因**：2C2G 生产机多次在 `npx next build --webpack` 期间 SSH/HTTP 不可达，导致部署失败和服务中断。

**禁止在生产机执行**：
- `next build` / `npx next build`
- `npm ci` / `npm install`
- `npx prisma generate`
- `npx prisma migrate deploy`
- 启动第二个 build 进程
- 把生产机当 CI 构建环境

**生产机只负责**：
- 接收 GitHub Actions 构建产物
- 复制 `.env` 到 `.next/standalone/.env`
- 运行 systemd `wrong-notebook` 服务

### 2. 标准部署路径：GitHub Actions

wrong-notebook 生产部署 **必须优先使用 GitHub Actions**，禁止在生产机本地构建。

**CI build job**（在 `ubuntu-latest` runner 上执行，不在生产机）：
- `npm ci`
- `npx prisma generate`
- `npx prisma migrate deploy`（使用临时 SQLite：`DATABASE_URL=file:./ci-build.db`）
- `NODE_OPTIONS="--max-old-space-size=4096" npx next build --webpack`
- 打包 `standalone-artifact.tar.gz`（含 `.next/standalone`、`.next/static`、`public`）
- 上传 artifact

**deploy job**（上传产物到生产机）：
- `scp` artifact 到生产机 `/tmp/`
- `systemctl stop wrong-notebook`
- 备份 `production.db` 到 `/var/backups/wrong-notebook/`
- 备份旧 `.next`
- 解压 artifact
- 复制 `.next/static` → `.next/standalone/.next/static`
- 复制 `public` → `.next/standalone/public`
- 复制 `.env` → `.next/standalone/.env`
- 验证 `server.js`、`static`、`public`、`.env` 存在
- `systemctl restart wrong-notebook`
- curl 健康检查（内网 3000 端口 + nginx 80 代理）

**deploy job 禁止**：
- `next build`、`npm ci`、`npm install`
- `prisma migrate`、`prisma generate`
- 调用 `deploy.sh`
- 使用 PM2
- restart nginx
- 删除 `production.db`

**workflow 触发规则**：
- Workflow 类型必须是 `workflow_dispatch`（手动触发）
- 不得改成 push 自动部署，除非用户明确要求

### 3. deploy.sh 禁用

当前 `scripts/deploy.sh` **不适配当前生产环境**，原因：
- 使用 PM2（生产已迁移到 systemd）
- 执行 `git reset --hard`（禁止）
- 执行 `npm ci`（禁止在生产机运行）
- 因 HEAD 无变化跳过 build（与 GitHub Actions 产物流冲突）

**禁止**在当前生产环境调用 `deploy.sh`。

### 4. systemd / PM2 约束

生产服务 **只允许使用 systemd**：
- `systemctl status wrong-notebook`
- `systemctl stop wrong-notebook`
- `systemctl restart wrong-notebook`
- `systemctl reset-failed wrong-notebook`
- `journalctl -u wrong-notebook`

**禁止使用 PM2**：
- `pm2 start/stop/restart`
- `pm2 logs`
- `pm2 env`

**nginx 不得随意重启**。禁止 `systemctl restart nginx`，除非用户明确授权且问题确认为 nginx 配置层。

### 5. 数据库保护

- 真实数据库路径：`/var/www/wrong-notebook/prisma/production.db`
- 部署前如需操作 `.next` 或服务，必须先备份 `production.db` 和当前 git HEAD
- 备份目录：`/var/backups/wrong-notebook/`

**禁止**：
- `rm production.db`
- `prisma migrate reset` / `prisma migrate dev`
- 删除 `prisma/` 目录
- 用本地 `prisma/dev.db` 覆盖 `production.db`

### 6. SSH / 服务器不可达停止条件

如果出现以下情况：
- `Connection timed out during banner exchange`
- SSH 短暂可达后再次不可达
- HTTP timeout（0 bytes received）
- `Connection reset by peer`

**Agent 必须停止，不得循环重试。**

**禁止**：
- 反复 SSH 重试
- 反复 curl
- 再次启动 build
- 重启服务碰运气
- 自行部署修复

**正确处理**：
- 报告 SSH/HTTP 不可达
- 建议用户从阿里云控制台检查实例状态
- 等待用户确认下一步

### 7. GitHub Actions 失败处理

如果 GitHub Actions workflow 失败，Agent **只允许**：
- 查看失败 job 日志（`gh run view --log-failed`）
- 总结失败原因
- 等待用户确认下一步

**禁止**：
- `gh run rerun`
- 触发第二次 workflow
- SSH 生产机手动修补
- 手写部署命令
- 改代码后直接 push

### 8. Workflow 触发前置条件

触发部署 workflow 前，**必须全部确认**：

- [ ] PR 已 merge 到 main
- [ ] Workflow 已存在于 main（`gh workflow list` 确认）
- [ ] `PROD_HOST` secret 存在
- [ ] `PROD_USER` secret 存在
- [ ] `PROD_PATH` secret 存在
- [ ] `PROD_SSH_KEY` secret 存在
- [ ] 生产机无残留 node / next build / webpack 进程
- [ ] `wrong-notebook` 已 `stop` 或 `inactive`

触发规则：
- **只允许触发一次**
- 不得 rerun
- 不得触发第二次
- 不得一边 Actions 部署一边 SSH 手动部署

### 9. Git / PR 约束

- **禁止直接 push 到 `origin/main`**
- 所有改动必须：新建分支 → commit → push 分支 → 创建 PR → 等待用户确认 merge
- 如果当前本地分支是 `main`，禁止执行 `git push -u origin HEAD`
- 必须先 `git switch -c <feature-branch>`，再 `git push -u origin <feature-branch>`

### 10. Secret 保护

GitHub Actions 使用的 secrets：
- `PROD_HOST`
- `PROD_USER`
- `PROD_PATH`
- `PROD_SSH_KEY`

**Agent 禁止**：
- 输出 secret 值
- 打印 `PROD_SSH_KEY`、私钥内容、`BEGIN OPENSSH PRIVATE KEY`
- 用 `cat` / `type` / `echo` 输出私钥内容

**设置私钥 secret 时**：只能通过管道写入（`cat file | gh secret set` 或 `Get-Content -Raw file | gh secret set`），不得输出私钥内容到终端。

### 11. 生产恢复验收标准

部署成功后，必须 **只读验收**（不重启、不部署、不改代码）：

- [ ] GitHub Actions run conclusion = `success`
- [ ] `wrong-notebook` = `active`
- [ ] `nginx` = `active`
- [ ] 3000 端口监听（next-server）
- [ ] 80 端口监听（nginx）
- [ ] `.next/standalone/server.js` 存在
- [ ] `.next/standalone/.next/static` 存在
- [ ] `.next/standalone/public` 存在
- [ ] `.next/standalone/.env` 存在
- [ ] 公网 `GET /login` → 200
- [ ] 公网 `GET /knowledge` → 200 或 307
- [ ] 公网 `GET /knowledge/review` → 200 或 307
- [ ] 公网 `GET /knowledge/review/session` → 200 或 307
- [ ] `journalctl -u wrong-notebook` 无 CHDIR 错误
- [ ] `journalctl -u wrong-notebook` 无 DATABASE_URL 错误

验收阶段 **禁止**：restart、deploy、rerun、build、改代码、push、merge。

## 生产 Standalone 模式规则

### 禁止 next start

`next.config.ts` 配置了 `output: 'standalone'`。**禁止** `next start` / `npm run start`。

**必须**使用：`node .next/standalone/server.js`

### 必须复制静态资源到 standalone 目录

Build 后 `.next/static` 和 `public` 不会自动复制到 `.next/standalone/`，缺少会导致 ChunkLoadError 和 KaTeX 404。

```bash
mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static
cp -r .next/static .next/standalone/.next/static
rm -rf .next/standalone/public
if [ -d public ]; then cp -r public .next/standalone/public; fi
cp .env .next/standalone/.env
```

### DATABASE_URL 必须使用绝对路径

Standalone server 会 chdir 到 `.next/standalone/`，相对路径将解析错误。

**生产 DATABASE_URL**：`file:/var/www/wrong-notebook/prisma/production.db`

**禁止**在 root `.env` 和 `.next/standalone/.env` 中使用相对路径。

### 登录/注册排查顺序

1. `grep '^DATABASE_URL=' .env` — 确认 root .env 是绝对路径
2. `grep '^DATABASE_URL=' .next/standalone/.env` — 确认 standalone .env 是绝对路径
3. `systemctl status wrong-notebook` — 确认服务已启动
4. `journalctl -u wrong-notebook -n 50` — 检查 Error code 14 / no such table
5. `ls -la /var/www/wrong-notebook/prisma/production.db` — 确认数据库文件存在
6. `sqlite3 /var/www/wrong-notebook/prisma/production.db ".tables"` — 确认有 User 表

### 误生成空库处理

如果 `/var/www/wrong-notebook/production.db` 存在且为空（0 字节或无 User 表），是以前相对 DATABASE_URL 解析产生的。
- 先确认服务已稳定使用真实库 → 备份 → 删除空文件。不得直接删除。

## 事故记录

### 2026-07-08：生产机 `.next/standalone` 缺失恢复

**事故原因**：生产机重启后 `.next/standalone` 目录丢失，systemd `WorkingDirectory` 指向不存在路径，`wrong-notebook` crash loop，nginx 返回 502。

**错误路线**（导致多次 SSH 不可达）：
1. 在 2C2G 生产机上执行 `npx next build --webpack`
2. Build 期间内存耗尽，SSH/HTTP 无响应
3. 反复手动修复、重试 build

**正确路线**（最终恢复成功）：
1. GitHub Actions `ubuntu-latest` runner 构建 Next.js standalone
2. 上传 `.next/standalone`、`.next/static`、`public` 为 artifact
3. `scp` 到生产机，`systemctl restart wrong-notebook`
4. 公网 `/login` 200，`/knowledge` 307，全部页面恢复

**后续改进**：
- PR #15：新增 GitHub Actions `deploy-standalone.yml` workflow
- 生产机禁止本机 build
- 删除了旧 PM2 版 `deploy.sh` 关联
- 固化所有约束到本文档
