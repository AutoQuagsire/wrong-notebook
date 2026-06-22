# 2026-06-22 — Claude Code — TASK-006A 钳制同天 FSRS due 到明天

## Agent
- Tool: Claude Code
- Model: claude-sonnet-4-6
- Operator: auto

## Task
增加业务规则：任何 ORIGINAL_REVIEW 保存后，FSRS 下一次复习日期最早不能早于明天本地时间。解决"不会/Again"评分后几分钟再次出现在今日复习队列的问题。

## Files Changed
- `src/lib/fsrs/adapter.ts`: 新增 `clampDueToNextDay` 纯函数——如果 due 在同一日历天，钳制到明天 00:00 本地时间，且 scheduledDays >= 1
- `src/lib/fsrs/service.ts`: 在 `processFsrsReview` 中 `computeNextCard` 之后调用 `clampDueToNextDay`
- `src/__tests__/unit/fsrs-adapter.test.ts`: 新增 6 个 `clampDueToNextDay` 单元测试
- `src/__tests__/integration/fsrs-service.test.ts`: 新增 2 个集成测试（Again 不在同天，Good 至少明天）
- `src/__tests__/integration/practice.test.ts`: 新增 1 个 API 测试（Rating 1 的 reviewResult.nextReviewAt >= 明天）

## Database Changes
- None

## Tests Run
- `npx prisma validate`: passed
- `npx eslint`: 0 errors, 0 warnings
- `npm test`: 37 files, 626 tests passed (+9 new)

## Result
- FSRS 原始 due 在今天 → 钳制到明天 00:00 本地时间
- FSRS 原始 due 已在明天或更晚 → 不做修改
- 钳制后 scheduledDays >= 1
- `reviewResult.nextReviewAt` 返回钳制后的日期
- `/api/review/today` 不再在几分钟后重新显示刚刚评分为"不会"的题
- 数据库里的 `FsrsCard.due` 也是钳制后的值

## Risks
- 钳制使用本地时间（`new Date()` setDate/setHours），如果服务器在不同时区运行，due 的绝对 UTC 值可能不同，但业务语义（"明天 00:00 本地"）一致。前端只显示日期，不影响用户感知。

## Follow-ups
- 可考虑将 `clampDueToNextDay` 的明天 00:00 改为可配置（如明天 06:00），目前简单稳定方案满足需求
