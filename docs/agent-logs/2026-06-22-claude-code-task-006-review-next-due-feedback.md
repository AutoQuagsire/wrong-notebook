# 2026-06-22 — Claude Code — TASK-006 复习保存后显示下次复习日期

## Agent
- Tool: Claude Code
- Model: claude-sonnet-4-6
- Operator: auto

## Task
在原题复习保存成功后显示本题的下次复习日期（精确到天）。API 响应追加 `reviewResult`，前端在成功提示区域显示 "本题下次复习：YYYY-MM-DD"。

## Files Changed
- `src/types/api.ts`: 新增 `ReviewResultData` 类型，`PracticeRecordData` 增加可选 `reviewResult` 字段
- `src/app/api/practice/record/route.ts`: `ORIGINAL_REVIEW` 路径捕获 `processFsrsReview` 返回值，构建 `reviewResult` 并入响应
- `src/app/review/[errorItemId]/page.tsx`: 新增 `formatReviewDate` 辅助函数；保存成功区域显示下次复习日期
- `src/__tests__/integration/practice.test.ts`: 默认 mock 返回 FsrsCardData；新增 4 个测试覆盖 reviewResult

## Database Changes
- None

## Tests Run
- `npx prisma validate`: passed
- `npx eslint` (changed files): 0 errors, 3 pre-existing `<img>` warnings
- `npm test`: 37 files, 617 tests passed (+4 new)

## Result
- ORIGINAL_REVIEW 保存响应新增 `reviewResult` 字段（含 nextReviewAt/scheduledDays/state/reps/lapses）
- SIMILAR_QUESTION 不返回 reviewResult
- 前端显示 "本题下次复习：YYYY-MM-DD"（仅日期，无时分秒）
- "返回今日复习"按钮不受影响
- 直接访问 /review/[errorItemId] 也能正常显示下次复习日期
- 无 reviewResult 时前端不崩溃

## Known Issues
- `npm run build` 因 pre-existing Google Fonts 网络问题失败，与本次改动无关

## Follow-ups
- 后续可考虑在今日复习列表中预览下次复习日期
