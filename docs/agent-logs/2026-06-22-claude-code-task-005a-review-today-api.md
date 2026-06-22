# 2026-06-22 — Claude Code — TASK-005A Review Today API

## Agent
- Tool: Claude Code
- Model: claude-sonnet-4-6
- Operator: user

## Task
实现"今日复习计划"后端 API：根据 `FsrsCard.due` 查询当天到期的错题，返回待复习列表。

## Files Changed
- `src/lib/review/today-service.ts`: service 层，查询 due FsrsCards + optional new ErrorItems，组装 ReviewTodayItem
- `src/app/api/review/today/route.ts`: GET 端点，解析 limit/includeNew 参数，调用 service
- `src/types/api.ts`: 新增 `ReviewTodayItem` 和 `ReviewTodayResponse` 类型
- `src/__tests__/integration/review-today.test.ts`: 21 个集成测试

## API
- `GET /api/review/today?limit=20&includeNew=false`
- 返回 `{ dueItems, newItems, stats: { dueCount, overdueCount, newCount, limit, generatedAt } }`
- dueItems 按 `due ASC` 排序，默认 20 条，最大 100
- 不返回 answerText、analysis 等答案信息

## Database Changes
- None

## Tests Run
- `npx prisma validate` → valid
- `npx eslint` on 4 changed files → 0 errors
- `npx vitest run` → **606 passed** (36 files), zero regressions

## Result
- 21 new tests covering: auth, due filter, ordering, limit, overdueDays, questionPreview, includeNew, newCount, stats, user isolation

## Known Issues
- None

## Follow-ups
- TASK-005B: 今日复习页面 UI
