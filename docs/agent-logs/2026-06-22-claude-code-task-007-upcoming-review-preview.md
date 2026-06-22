# 2026-06-22 — Claude Code — TASK-007 未来 7 天复习预览

## Agent
- Tool: Claude Code
- Model: claude-sonnet-4-6
- Operator: auto

## Task
在今日复习页增加"未来 7 天复习预览"能力。API 按本地日期统计已有 FsrsCard 的错题，前端通过按钮 + Dialog 弹窗展示，不常驻占用页面空间。

## Files Changed
- `src/types/api.ts`: 新增 `UpcomingReviewDay` 类型；`ReviewTodayResponse.stats` 增加可选 `upcoming` 字段
- `src/lib/review/today-service.ts`: 新增 `formatLocalDate` helper；查询 7 天窗口内的 FsrsCard 按日期统计；返回值加入 `upcoming`
- `src/app/review/today/page.tsx`: 导入 `CalendarDays`、`Dialog` 组件；移除常驻大卡片，改为统计卡片右下角的"未来复习安排"按钮 + Dialog 弹窗展示
- `src/__tests__/integration/review-today.test.ts`: 新增 8 个 upcoming 测试；修复 3 个 pre-existing 测试的 mock 序列（新增 upcoming findMany 调用）

## UI Scheme
- **Before**: 统计卡片下方常驻大块"未来 7 天复习预览"卡片，占据纵向空间
- **After**: 统计卡片右侧一个轻量"未来复习安排"按钮 → 点击弹出 Dialog，内含 7 天日期+题数列表

## Database Changes
- None

## Tests Run
- `npx prisma validate`: passed
- `npx eslint`: 0 errors, 0 warnings
- `npm test`: 37 files, 634 tests passed (+8 new, 3 mock fixes)

## Result
- `GET /api/review/today` 的 `stats.upcoming` 返回 7 天数组，每天包含 `{ date: "YYYY-MM-DD", count: N }`
- 统计基于最终保存的 `FsrsCard.due`（含 same-day clamp 后结果），不重新计算 FSRS
- 不包含无 FsrsCard 的 newItems
- 不包含 7 天之外的未来项
- 前端显示轻量网格预览，日期+题数
- dueItems/newItems/stats 现有语义不变

## Risks
- None

## Follow-ups
- 未来可考虑在 Dialog 中点击某天跳转到对应日期的筛选视图
