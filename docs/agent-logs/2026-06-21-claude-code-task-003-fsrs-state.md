# 2026-06-21 — Claude Code — TASK-003 FSRS State Table and Adapter

## Agent
- Tool: Claude Code
- Model: claude-sonnet-4-6
- Operator: user

## Task
为错题复习系统增加 FSRS 状态层：新增 `FsrsCard` 数据模型、FSRS adapter（纯函数）和 FSRS service（数据库访问层）。不接入页面，不修改原题复习提交流程，不生成每日计划。

## Files Changed
- `prisma/schema.prisma`: 新增 `FsrsCard` model + `User.fsrsCards` + `ErrorItem.fsrsCard` 关系
- `prisma/migrations/20260621121842_add_fsrs_card/migration.sql`: CREATE TABLE FsrsCard
- `src/lib/fsrs/adapter.ts`: 纯函数 createNewCard, validateFsrsRating, computeNextCard
- `src/lib/fsrs/service.ts`: getOrCreateFsrsCard, saveFsrsCard, getFsrsCardId
- `src/lib/fsrs/index.ts`: barrel export
- `src/__tests__/unit/fsrs-adapter.test.ts`: 22 adapter 单元测试
- `src/__tests__/integration/fsrs-service.test.ts`: 5 service 集成测试
- `package.json` / `package-lock.json`: 新增 `ts-fsrs@5.4.1`

## Database Changes
- 新增 `FsrsCard` 表（CREATE TABLE，无 ALTER/DROP）
- `errorItemId` UNIQUE 约束 + `userId+due` 联合索引
- User/ErrorItem 级联删除

## Tests Run
- `npx prisma validate` → valid
- `npx eslint src/lib/fsrs src/__tests__/unit/fsrs-adapter.test.ts src/__tests__/integration/fsrs-service.test.ts prisma/schema.prisma` → 0 errors
- `npx vitest run` → 572 passed (35 files), zero regressions

## Result
- FsrsCard model mapped to ts-fsrs Card structure (due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review)
- Adapter layer: createNewCard wraps createEmptyCard, validateFsrsRating maps 1=Again/2=Hard/3=Good/4=Easy with strict type checking, computeNextCard calls fsrs.next() without mutating input
- Service layer: getOrCreateFsrsCard (find or create), saveFsrsCard (persist), getFsrsCardId (lookup)
- No page/API changes, no integration with practice record submission

## Known Issues
- ts-fsrs createEmptyCard returns `last_review: undefined` (normalized to null in adapter)

## Follow-ups
- TASK-004: Wire FsrsCard update into the ORIGINAL_REVIEW scoring transaction
