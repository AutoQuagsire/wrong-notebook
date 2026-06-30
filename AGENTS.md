# AGENTS.md

本项目基于 `wttwins/wrong-notebook`（考研错题复习系统）渐进改造。
目标：在保留现有错题录入、AI识题、相似题练习、标签和统计功能的基础上，逐步增加原题复习、FSRS调度和每日任务。

## 1. Core Rules

- 不要重写项目、不要新建第二套独立题库、不要把项目扩展成通用教育平台。
- 每次只完成一个明确任务，不做无关重构、全局格式化、依赖升级或目录大调整。
- 发现额外问题时只写入完成报告的 Follow-ups，不要顺手修。

## 2. Data Entity Facts

- `ErrorItem` 是核心错题实体。不要新建平行的 `StudyItem` 表，除非任务明确要求。
- `PracticeRecord` 是统一作答记录表：
  - `practiceType = "SIMILAR_QUESTION"` 表示 AI 生成相似题练习。
  - `practiceType = "ORIGINAL_REVIEW"` 表示原错题重做。
- `ReviewSchedule` 是未接入业务的旧表，不作为新复习调度核心。
- `masteryLevel` 暂不由一次练习自动更新。
- `knowledgePoints` 是兼容字段，当前标签系统以 `KnowledgeTag` 多对多关系为主。
- 图片当前以 Base64 存储在 `ErrorItem.originalImageUrl`，暂不迁移。

## 3. Rendering

- Markdown/LaTeX 渲染基于 `MarkdownRenderer`（react-markdown + remark-math + rehype-katex）。
- 应复用于编辑预览、详情页、练习页和复习页。
- `normalizeMathDelimiters()` 将 AI 输出的 `\(...\)`/`\[...\]` 归一化为 KaTeX 格式。
- AI 输出格式要求：先结论 → 关键依据 → 必要推导 → 易错点；禁止 `\(`、`\[`、`\mathcal`、`\left`、`\right`。

## 4. Review & FSRS Rules

- 四级评分：1=Again 2=Hard 3=Good 4=Easy。`isCorrect` 只是兼容统计字段。
- FSRS 通过独立适配层 (`src/lib/fsrs/adapter.ts` → `service.ts`) 接入，页面和 API 不得直接散落调用 FSRS 第三方库。
- 只有 `ORIGINAL_REVIEW` 驱动 FSRS 状态更新。`SIMILAR_QUESTION` 可参与统计但不直接改变 FSRS 状态。
- 复习页默认隐藏答案/解析/错因/历史作答，只有点击"查看答案"后才显示。
- 任何 ORIGINAL_REVIEW 保存后，如果 FSRS 算出的 due 仍在当天，则钳制到次日 06:00。错题复习按天调度。
- `ReviewSchedule` 表暂不接入复习流程。
- `masteryLevel` 暂不由一次练习自动更新。

## 5. Current Scope Boundaries

**已完成（v1.x）：**
- `ts-fsrs` 接入与 FSRS 适配层
- 今日复习页面 (`/review/today`) + API (`GET /api/review/today`)
- 原题复习评分 + FSRS 更新 (`POST /api/practice/record` with `practiceType=ORIGINAL_REVIEW`)
- 保存后显示下次复习日期 (`reviewResult.nextReviewAt`)
- 同日 due 钳制到次日 06:00
- 未来 7 天复习预览（按钮 + Dialog 弹窗）

**当前阶段禁止：**
- 接入或扩展 `ReviewSchedule` 作为新复习系统
- 让 AI 直接决定每日选题或自动判定复杂数学推导题正确
- 让 AI 相似题练习直接驱动第一版 FSRS
- 教材知识卡、双模型 Provider 架构、图片存储迁移
- 提醒通知、统计大屏、复杂日历组件

## 6. Data Safety

禁止：`prisma migrate reset`、`prisma db push --force-reset`、`DROP TABLE`、`DROP DATABASE`、`DELETE without precise WHERE`、`git reset --hard`、`git clean -fd`。

修改 Prisma Schema 前必须：确认数据库备份存在、使用向后兼容字段、保留旧数据、运行 Prisma 校验和相关测试。

不提交 `.env`、`prisma/dev.db`、数据库备份、上传图片或 API Key。

## 7. Git & Files

- 修改前先执行 `git status`，不覆盖用户未提交修改，不自动 push。
- 所有文件保持 UTF-8。小改动不要重写整个文件。

## 8. Testing

- 数据模型修改：Prisma validate + migration 相关测试。
- API 修改：相关 integration tests。
- UI 修改：类型检查 + 相关组件测试 + 手动页面验证。
- 调度修改：日期边界、重复提交、事务回滚测试。
- 不得声称运行了未运行的测试、删除失败测试、降低断言强度。

## 9. Completion Report Format

```md
## Result

### Implemented
- ...

### Files Changed
- `path`: reason

### Database Changes
- None / details

### Tests Run
- command: result

### Manual Verification
- ...

### Risks
- ...

### Follow-ups
- ...
```

## 10. Mobile Migration Guardrails

- 当前优先仍是 Next.js Web 应用。不要迁移到 Taro、uni-app、React Native、Flutter、微信小程序、Capacitor 或其他移动端框架，除非任务明确要求。
- 核心复习逻辑必须保持在 `src/lib`、service 层或 API route 中，不得写死在 Web UI 组件里：FSRS 调度、PracticeRecord 创建、FsrsCard 更新、复习队列生成、AI/OCR 流程、上传校验、API 响应构造。
- API route 和 `src/types/api.ts` 是未来的移动端/H5/小程序复用边界。不要让移动端客户端依赖 Web 组件内部实现。
- 不要只靠浏览器 state、`localStorage` 或 Web-only 逻辑存储关键复习状态。PracticeRecord、FsrsCard 状态、下次复习日期、作答图片、AI 结果必须通过 API / 数据库持久化。
- 业务/服务层不要依赖 `window`、`document`、DOM 事件、shadcn/ui 组件、浏览器上传对象等 Web-only API。把它们隔离在 UI 或适配代码中。
- 题目、答案、解析内容以可移植的 Markdown/LaTeX/文本格式存储，不要以 Web-only HTML 作为内容源。
- 任何移动端/H5/App/小程序迁移任务必须显式标记并分小阶段执行。普通 Web 功能开发期间不要创建 mobile 项目、跨平台包或新顶层目录。
- 如果任务需要移动端截图验证、UI 视觉检查、图片识别或手写作答分析，必须显式标注需要多模态模型，并尽量批量处理这类任务。

## 11. 生产环境约束

本项目已有真实生产部署。

### 生产服务器配置

| 资源 | 规格 |
|------|------|
| vCPU | 2 |
| RAM | 2 GiB |
| Swap | 2 GiB |
| 公网入口 | `http://8.148.71.66` |
| 项目路径 | `/var/www/wrong-notebook` |
| PM2 应用名 | `wrong-notebook` |
| 生产数据库 | `/var/www/wrong-notebook/prisma/production.db` |
| 部署脚本 | `/opt/wrong-notebook/deploy.sh` |
| 备份脚本 | `/opt/wrong-notebook/backup.sh` |
| 恢复指南 | `/opt/wrong-notebook/RESTORE.md` |

### 🔴 低内存 VPS 构建硬性规则（Agent 必须遵守）

Next.js 16 默认使用 Turbopack 构建，在 2GB VPS 上内存占用极高，可导致服务器卡死。因此：

**绝对禁止 Agent 在服务器上执行以下命令：**

- `npm run build`
- `next build`
- `npx next build`
- 任何未显式带 `--webpack` 的构建命令
- 任何前台直接执行超过 60 秒的长构建命令

**生产构建唯一允许的命令：**

```bash
export NODE_OPTIONS="--max-old-space-size=768"
npx next build --webpack
```

**构建必须通过以下方式之一后台执行：**

1. 推荐：`tmux` 会话内执行 `/opt/wrong-notebook/deploy.sh`
2. 可接受：`nohup /opt/wrong-notebook/deploy.sh > /var/www/deploy.log 2>&1 &`
3. 禁止：SSH 前台裸跑 build，Agent 不得自动这样做

**Agent 调用优先级：**

- 始终优先调用固定部署脚本 `/opt/wrong-notebook/deploy.sh`
- Agent 不得绕过该脚本手写构建命令，除非用户明确要求
- 构建日志写入 `/var/www/deploy.log`

### 🛠 服务器卡死恢复流程

如果构建期间服务器卡死或无法 SSH：

1. 通过 VPS 控制台重启服务器
2. SSH 后清理残留进程：`pkill -f "next build" || true`
3. 停止 PM2：`pm2 stop wrong-notebook`
4. 删除失败残留：`rm -rf /var/www/wrong-notebook/.next`
5. 释放内存后重新构建：
   ```bash
   cd /var/www/wrong-notebook
   export NODE_OPTIONS="--max-old-space-size=768"
   tmux new -s build
   npx next build --webpack
   # Ctrl+B D 分离
   ```
6. 构建成功后再重启 PM2：
   ```bash
   pm2 restart wrong-notebook
   pm2 status
   curl -I http://127.0.0.1:3000
   ```

### 核心规则

- 本地机器用于开发和测试，生产服务器用于运行真实服务。
- 本地 `dev.db` 绝对不能覆盖生产 `production.db`。
- 生产 `production.db` 包含真实用户数据，必须保护。

### 未经明确人工批准禁止

- 不要在服务器上直接修改业务代码。
- 不要覆盖 `/var/www/wrong-notebook/prisma/production.db`。
- 不要在线上执行 `npx prisma migrate reset`。
- 不要删除生产备份。
- 不要暴露或打印 `.env` 值。
- 不要提交 `.env`、数据库文件、备份文件或密钥。
- 不要用本地 `dev.db` 替代生产数据。
- 不要在正常使用时间随意重启或重新部署生产环境。

### 代码部署前检查

1. 确认本地测试/构建通过。
2. 提交代码到 Git 并推送到远程仓库。
3. SSH 到服务器，先备份：

```bash
/opt/wrong-notebook/backup.sh
```

4. 确认备份完整性后再部署。

### 标准生产部署流程

**唯一入口**：`/opt/wrong-notebook/deploy.sh`（见 `scripts/deploy.sh`）。该脚本自动完成 git pull → npm ci → 备份旧 .next → pm2 stop → webpack 构建（768MB 堆限制）→ pm2 start → 健康检查 → 失败自动回退。

Agent 始终优先使用此脚本，不要手写 build 命令。

前台（调试）：`/opt/wrong-notebook/deploy.sh`
生产：`nohup nice -n 10 ionice -c2 -n7 /opt/wrong-notebook/deploy.sh > /var/www/deploy.log 2>&1 &`
查看进度：`tail -f /var/www/deploy.log`

重要：
- 在 2GB VPS 上必须使用 `npx next build --webpack`。
- 不要在服务器上执行默认 Turbopack build，除非明确批准。
- 如果 `package-lock.json` 有变动，脚本自动 `npm ci`。

### Prisma Schema 变更时的部署

本地：`npx prisma migrate dev --name <name>`

生产：

```bash
/opt/wrong-notebook/backup.sh
cd /var/www/wrong-notebook
git pull --ff-only origin main
npm ci
npx prisma generate
npx prisma migrate deploy
export NODE_OPTIONS="--max-old-space-size=768"
npx next build --webpack
pm2 restart wrong-notebook
```

绝对不要：`npx prisma migrate reset`

### 仅 UI / 前端变更时

```bash
git pull --ff-only origin main
export NODE_OPTIONS="--max-old-space-size=768"
npx next build --webpack
pm2 restart wrong-notebook
```

### 环境变量变更

- 只更新 `.env.example` 中的变量名，不写密钥值。
- 服务器上手动编辑 `.env`。
- 绝对不要在日志或聊天中打印 `.env` 值。
- 改 `.env` 后重启 PM2。

### 部署后冒烟测试

每次部署后确认：登录页、错题列表、详情页、今日复习、新增测试题均正常，日志无持续报错。

```bash
pm2 logs wrong-notebook --lines 120
tail -n 80 /var/log/nginx/error.log
```

### 生产数据原则

```
Git 管理代码。
production.db 存储真实数据。
backup.sh 保护数据。
服务器运行生产环境。
本地机器开发测试。
```
