---
title: "Claude Code 卸载并重新安装"
date: 2026-06-28
type: task
---

## 操作内容

卸载并通过 npm 重新安装 Claude Code。

## 执行步骤

1. 卸载旧版：`npm uninstall -g @anthropic-ai/claude-code`（原版本 2.0.50）
2. 重新安装：`npm install -g @anthropic-ai/claude-code --include=optional`
3. 验证：`claude --version` → 2.1.195

## 结果

- 旧版本 2.0.50 → 新版本 2.1.195
- 安装成功，`claude` 命令正常运行

## 未完成事项

- `C:\Users\Lenovo\AppData\Local\claude\` 和 `C:\Users\Lenovo\.claude\` 两个残留目录未清理（权限被拒）
- 如需彻底清理，用户需手动执行删除
