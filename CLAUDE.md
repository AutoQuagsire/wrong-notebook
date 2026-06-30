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

## 生产构建约束

- 生产服务器为 2C2G VPS，Next.js 16 默认 Turbopack 构建会占满内存导致卡死。
- 任何生产构建必须使用 `npx next build --webpack` + `NODE_OPTIONS="--max-old-space-size=768"`。
- 构建必须后台执行（tmux 或 nohup），禁止前台裸跑。
- Agent 始终优先调用 `/opt/wrong-notebook/deploy.sh`，禁止绕过脚本手写 build 命令。

## 生产 Standalone 模式硬性规则

### 禁止 next start

本项目 `next.config.ts` 配置了 `output: 'standalone'`。Next.js standalone 模式下 `next start` 无法正常工作。

- **禁止**：`next start`、`npm run start`、`pm2 start npm -- run start`
- **必须**：`node .next/standalone/server.js`
- PM2 启动必须显式设置 `--cwd /var/www/wrong-notebook`

### 必须复制静态资源到 standalone 目录

`output: 'standalone'` 构建后，Next.js 不会自动复制 `.next/static` 和 `public` 到 `.next/standalone/`。缺少它们会导致：

- `Uncaught ChunkLoadError: Loading chunk XXXX failed` — 页面 JS chunk 404
- `_next/static/chunks/...` 404
- `_next/static/media/...` 404（KaTeX 字体等）
- 特定页面（如 `/review/[errorItemId]`）出现 "Application error: a client-side exception has occurred"

**每次部署后必须执行：**

```bash
mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static
cp -a .next/static .next/standalone/.next/static

rm -rf .next/standalone/public
if [ -d public ]; then
  cp -a public .next/standalone/public
fi
```

deploy.sh 已内置此步骤。

### SQLite DATABASE_URL 必须使用绝对路径

`output: 'standalone'` 构建后，Next.js standalone server 会 chdir 到 `.next/standalone/` 目录下运行。相对路径 `file:./production.db` 或 `file:./prisma/production.db` 将解析到错误位置，导致：

- `Error code 14: Unable to open the database file`
- `The table 'main.User' does not exist in the current database`

**生产 DATABASE_URL 必须是绝对路径：**

```
DATABASE_URL="file:/var/www/wrong-notebook/prisma/production.db"
```

**禁止在以下位置使用相对路径：**

- root `.env` 的 `DATABASE_URL`
- `.next/standalone/.env` 的 `DATABASE_URL`（构建后自动生成，每次部署后必须强制修正）
- PM2 进程环境变量的 `DATABASE_URL`

### 真实数据库路径

```
/var/www/wrong-notebook/prisma/production.db
```

### 误生成空库处理

如果 `/var/www/wrong-notebook/production.db` 存在且为空（0 字节或无 User 表），这是以前相对 DATABASE_URL 误解析产生的。

- **不要直接删除**。先确认服务已稳定使用真实库。
- 确认后备份：`cp production.db production.db.empty-$(date +%Y%m%d).bak`
- 再删除：`rm production.db`

### 登录/注册同时失败的排查顺序

1. `pm2 env <id> | grep DATABASE_URL` — 确认是绝对路径
2. `grep '^DATABASE_URL=' .env` — 确认 root .env 是绝对路径
3. `grep '^DATABASE_URL=' .next/standalone/.env` — 确认 standalone .env 是绝对路径
4. `pm2 describe wrong-notebook | grep 'exec cwd'` — 确认 cwd 是 `/var/www/wrong-notebook`
5. `pm2 logs wrong-notebook --lines 50` — 检查是否有 `Error code 14` 或 `no such table: User`
6. `ls -la /var/www/wrong-notebook/prisma/production.db` — 确认数据库文件存在
7. `sqlite3 /var/www/wrong-notebook/prisma/production.db ".tables"` — 确认有 User 表
