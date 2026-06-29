---
task: review-page-notes
date: 2026-06-29
type: feature
---

## 内容

在每个错题的复习页 (`/review/[errorItemId]`) 新增「本题笔记」持久填写框，位于原题内容下方、本次作答记录上方。

## 细节

- 利用已有 Prisma 字段 `ErrorItem.userNotes` 和 API `PATCH /api/error-items/[id]/notes`
- 页面加载时自动回填已有笔记
- 手动点击「保存笔记」按钮保存，保存成功后显示绿色反馈 2 秒
- 持久笔记 vs 本次作答记录分离：前者跨复习持久，后者每次独立

## 文件

- `src/app/review/[errorItemId]/page.tsx` — 新增笔记 Card + 状态逻辑
