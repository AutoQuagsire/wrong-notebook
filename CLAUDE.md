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

- `20f3158` fix: add local proxy health checks for image analysis
- `74f52db` docs: TASK-034E agent log

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
