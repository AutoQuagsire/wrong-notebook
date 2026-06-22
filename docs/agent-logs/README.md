# Agent Logs

每次 Coding Agent 完成任务后在此目录写入一份简短日志。

## 文件命名规则

```
YYYY-MM-DD-agent-task-name.md
```

示例：

```
2026-06-21-claude-lint-current-changes.md
2026-06-21-codex-practice-record-link.md
2026-06-22-claude-original-review-flow.md
```

## 日志模板

```md
# YYYY-MM-DD — Agent — Task Name

## Agent
- Tool: [Claude Code / Codex / ...]
- Model:
- Operator:

## Task
- [任务简述]

## Files Changed
- `path`: 变更原因

## Database Changes
- None / [简述]

## Tests Run
- command: result

## Result
- [完成状态]

## Known Issues
- [已知问题]

## Follow-ups
- [后续任务建议]
```

## 禁止写入的内容

- `.env` 内容或环境变量值
- API Key / Secret / Token
- 数据库内容（表数据、用户记录、错题内容）
- 完整终端输出（只写摘要）
- 大段 diff（只列文件路径和原因）
- 截图路径或图片内容
- 用户私密信息
