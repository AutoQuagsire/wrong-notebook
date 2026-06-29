---
task: fix-latex-neq-corruption
date: 2026-06-29
type: bugfix
---

## 问题

识图后 `≠` 号显示为 `/neq`，而 `=` 号正常。

## 根因

`src/components/markdown-renderer.tsx:24` 的 `replace(/\\n/g, '\n')` 正则无条件匹配所有「反斜杠+n」并替换为换行符，导致 LaTeX 命令 `\neq`、`\ne` 中的 `\n` 被破坏，KaTeX 无法渲染，退化为纯文本。

## 修复

将 `replace(/\\n/g, '\n')` 前增加数学区域保护：先用占位符替换 `$...$` / `$$...$$`，执行替换后再还原。

## 文件

- `src/components/markdown-renderer.tsx` — 三步保护：占位 → 替换 → 还原
