# 2026-06-22 — Claude Code — TASK-005C 今日复习闭环验收与小修

## Agent
- Tool: Claude Code
- Model: claude-sonnet-4-6
- Operator: auto

## Task
验证并小修"今日复习"完整闭环：确认 today page → review page → 评分 → FsrsCard 更新 → 返回 today 的核心流程可闭环，不做视觉重设计。

## Files Changed
- `src/app/review/today/page.tsx`: DueItemCard、NewItemCard、primary action 的 Link 均加上 `?from=today` 参数
- `src/app/review/[errorItemId]/page.tsx`: 使用 `window.location.search` 判断 `from=today` 避免 `useSearchParams` 的 Suspense 风险；当 `from=today` 时，评分保存成功后显示"返回今日复习"按钮链接到 `/review/today`
- `src/__tests__/integration/review-today.test.ts`: 新增测试：完成首次 ORIGINAL_REVIEW 后该题不应再作为 newItem

## Database Changes
- None

## Tests Run
- `npx prisma validate`: passed
- `npx eslint` on changed files: 0 errors (3 pre-existing warnings about `<img>`)
- `npm test`: 37 files, 613 tests all passed

## Result
- All 8 flow checks passed
- Today page → review page: 3 links now carry `?from=today`
- Review submit → FsrsCard update: confirmed in transaction (pre-existing)
- Return to today: new "返回今日复习" button shown when `from=today`
- New item first review: creates FsrsCard, excluded from subsequent newItems (verified via test)
- API queries fresh `FsrsCard.due` every time (no caching)
- Direct access to `/review/[errorItemId]` unaffected by `from=today` param

## Known Issues
- 3 pre-existing ESLint warnings about `<img>` vs `<Image />` in review page (out of scope)
- `baseline-browser-mapping` data stale warning (unrelated)

## Follow-ups
- Visual screenshot review of the "返回今日复习" button in a later multimodal batch
- Consider wrapping the review page in `Suspense` boundary for `useSearchParams` (Next.js best practice, not blocking)
