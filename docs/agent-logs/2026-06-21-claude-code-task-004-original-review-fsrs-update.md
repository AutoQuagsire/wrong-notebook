# 2026-06-21 — Claude Code — TASK-004 Original Review FSRS Update

## Agent
- Tool: Claude Code
- Model: claude-sonnet-4-6
- Operator: user

## Task
在 `ORIGINAL_REVIEW` 评分流程中接入 FSRS 状态更新：用户自评后，系统同步更新对应 `FsrsCard`，计算下次复习时间。

## Files Changed
- `src/lib/fsrs/service.ts`: 新增 `processFsrsReview()` 函数，端到端 FSRS 更新（getOrCreate → computeNext → save）；`getOrCreateFsrsCard` 和 `saveFsrsCard` 增加可选 `tx` 参数支持事务；返回值和类型签名微调增加 `id`
- `src/app/api/practice/record/route.ts`: 导入 `processFsrsReview`；`ORIGINAL_REVIEW` 分支内将 `practiceRecord.create` 与 FSRS 更新包装在 `prisma.$transaction` 中
- `src/__tests__/integration/practice.test.ts`: 模拟 FSRS service；新增 1 个去重保护测试 + 8 个 FSRS 集成测试

## Database Changes
- None

## Tests Run
- `npx prisma validate` → valid
- `npx eslint` on changed files → 0 errors
- `npx vitest run` → **581 passed** (35 files), zero regressions

## Result
- 事务原子性：`PracticeRecord` 创建与 `FsrsCard` 更新同在一个 `prisma.$transaction`
- 去重保护：10 秒内重复提交直接返回已有记录，不触发 FSRS 更新
- 仅 `ORIGINAL_REVIEW` 更新 FSRS；`SIMILAR_QUESTION` 不受影响
- 前端响应格式未变，保持向后兼容

## Known Issues
- 测试层 `processFsrsReview` 被 mock 为 no-op（实践测试聚焦路由行为）；FSRS service 的完整集成由 `fsrs-service.test.ts` 覆盖

## Follow-ups
- TASK-005: 今日复习计划（按 FsrsCard.due 筛选到期卡片）
