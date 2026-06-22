# 2026-06-22 — Claude Code — TASK-005B Review Today Page

## Agent
- Tool: Claude Code
- Model: claude-sonnet-4-6
- Operator: user

## Task
实现"今日复习"页面，展示 FSRS 到期错题列表，支持新错题候选切换，一键进入原题复习。

## Files Changed
- `src/app/review/today/page.tsx`: 今日复习页面
- `src/app/page.tsx`: 首页新增"今日复习"入口按钮（BookMarked icon）

## API Used
- `GET /api/review/today?limit=20&includeNew=false|true`

## Page Structure
- 标题区 + 刷新按钮 + 返回首页
- 统计卡片区：今日待复习 / 已逾期 / 新错题候选
- 主操作区：有到期错题时显示"开始今日复习"跳第一条；无到期错题时显示空状态
- 到期错题列表：卡片式，含学科、题目预览、逾期状态、复习次数、遗忘次数、FSRS 状态、到期时间
- 新错题候选区：默认收起，切换展开
- 逾期卡片区有红色边框强调
- loading / error / empty / 401 全覆盖

## Security
- 不返回 answerText、analysis、错因分析
- 只含题目预览（≤120字符）+ FSRS 状态元数据

## Tests Run
- `npx eslint src/app/review/today/page.tsx` → 0 errors
- full vitest → 606 passed, zero regressions

## Result
- 今日复习页面已实现，使用 next/image 优化图片

## Manual Verification Required
请启动 dev server，打开 `/review/today`，截图给多模态模型做 UI 验收。

## Follow-ups
- 截图验收后再决定是否小修和提交
