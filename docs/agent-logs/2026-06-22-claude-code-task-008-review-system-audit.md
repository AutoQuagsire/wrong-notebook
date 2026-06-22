# 2026-06-22 — Claude Code — TASK-008 阶段性代码审计与轻量清理

## Agent
- Tool: Claude Code
- Model: claude-sonnet-4-6
- Operator: auto

## Audit Scope
审阅了 feat/kaoyan-review-system 分支的完整改动栈（12 commits，覆盖 FSRS 适配层、今日复习 API、原题复习评分、前端闭环 UI、测试）：

- 后端: `src/lib/fsrs/adapter.ts`, `service.ts`; `src/lib/review/today-service.ts`; `src/app/api/practice/record/route.ts`; `src/app/api/review/today/route.ts`
- 前端: `src/app/review/[errorItemId]/page.tsx`; `src/app/review/today/page.tsx`
- 类型: `src/types/api.ts`
- 测试: `src/__tests__/unit/fsrs-adapter.test.ts`; `src/__tests__/integration/fsrs-service.test.ts`, `practice.test.ts`, `review-today.test.ts`
- 文档: `AGENTS.md`, `README.md`, `docs/agent-logs/`

## Issues Found

1. **AGENTS.md 陈旧** — Section 5 "Current Scope Boundaries" 仍写"禁止接入 FSRS 第三方库（ts-fsrs 等）"和"创建 DailyPlan/每日任务页面"，但 FSRS 已完整接入且 `/review/today` 已上线。已更新为准确描述已完成和待做内容。

2. **12 个 ESLint `no-explicit-any` 错误** — 全部在 pre-existing 文件中（analytics.test.ts, error-items.test.ts, settings.test.ts 等），不在本次改动范围内。

3. **3 个 `<img>` ESLint 警告** — 在 review page 中使用 `<img>` 而非 `<Image />`，属于 pre-existing 模式。

## Fixes Applied
- `AGENTS.md`: Section 4 补充了按天调度、钳制规则；Section 5 更新为"已完成（v1.x）"列表 + 当前禁止项。移除已不成立的"禁止 ts-fsrs"和"禁止 DailyPlan"条目。

## No Issues In
- **类型一致性**: `ReviewResultData`, `UpcomingReviewDay`, `PracticeRecordData` 与后端响应完全一致
- **日期逻辑**: 所有用户可见日期使用本地日期（`getFullYear/getMonth/getDate`），无误用 `toISOString().slice(0,10)`
- **clampDueToNextDay**: 正确钳制到次日 06:00，`scheduled_days >= 1`
- **reviewResult.nextReviewAt**: 来自最终保存的 `FsrsCard.due`（含 clamp 后结果）
- **upcoming**: 基于最终 `FsrsCard.due`，不重新计算 FSRS，不包含 newItems
- **用户隔离**: 所有 API 查询均过滤 `userId`
- **测试覆盖**: newItem → newItems 排除、Again 不当天重现、upcoming 不包含 newItems、SIMILAR_QUESTION 不更新 FSRS、用户隔离
- **Git hygiene**: `.claude/` 已在 `.git/info/exclude`，无敏感文件泄漏

## Files Changed
- `AGENTS.md`: 更新 Review & FSRS Rules 和 Scope Boundaries 以反映 v1.x 现状

## Tests Run
- `npx prisma validate`: passed
- `npx eslint` (audit scope): 0 errors in changed files (12 pre-existing elsewhere)
- `npm test`: 37 files, 634 tests passed

## Remaining Risks
- 测试 mock 序列依赖 `findMany` 调用顺序，如果 today-service 查询顺序变化需同时更新 mock 链
- ESLint 全仓 12 个 `no-explicit-any` 错误为 pre-existing，建议在专门 lint 任务中修复

## Multimodal Required
- No

## Ready to Commit
- Yes (AGENTS.md update only)
