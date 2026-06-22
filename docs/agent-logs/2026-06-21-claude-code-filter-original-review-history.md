# 2026-06-21 — Claude Code — Filter review history to ORIGINAL_REVIEW only

## Agent
- Tool: Claude Code
- Model: claude-sonnet-4-6
- Operator: user

## Task
修复原错题重做页面中的"历史作答"列表，使其只显示 `practiceType = "ORIGINAL_REVIEW"` 的记录，不显示 `SIMILAR_QUESTION`。

## Files Changed
- `src/app/api/practice/record/route.ts`: GET 增加 `practiceType` 查询参数支持，含验证（仅允许 ORIGINAL_REVIEW/SIMILAR_QUESTION），非法值返回 400
- `src/app/review/[errorItemId]/page.tsx`: `loadHistory()` 传 `practiceType: "ORIGINAL_REVIEW"`
- `src/__tests__/integration/practice.test.ts`: 新增 5 个测试覆盖 practiceType 过滤逻辑

## Database Changes
- None

## Tests Run
- `npx eslint` on 4 changed files → 0 errors, 3 pre-existing `<img>` warnings
- full test suite (33 files, 545 tests) → all passed

## Result
- ORIGINAL_REVIEW 过滤正确：传入该参数时只返回原题重做记录
- 向后兼容：不传 practiceType 时行为不变
- 非法值拒绝：返回 400
- 权限校验不受影响：其他用户的 errorItemId 仍然被拒绝

## Known Issues
- 完整 `npm run lint` 未运行，其他旧文件可能仍有 pre-existing 问题

## Follow-ups
- None
