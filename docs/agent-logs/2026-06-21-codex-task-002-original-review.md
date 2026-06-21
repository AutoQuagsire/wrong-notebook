# 2026-06-21 — Codex — TASK-002 Original Review Flow

## Agent
- Tool: Codex
- Model: Codex
- Operator: user

## Task
实现原错题重做流程，支持可选文字作答记录、可选手写作答照片、查看答案后四级自评，并写入 `PracticeRecord`。

## Files Changed
- `prisma/schema.prisma`: 新增 `PracticeRecord.answerImageUrl`
- `prisma/migrations/20260621193000_add_practice_record_answer_image/migration.sql`: 新增迁移
- `src/app/review/[errorItemId]/page.tsx`: 新增原题复习页面
- `src/app/api/practice/record/route.ts`: 支持 `ORIGINAL_REVIEW` 记录与历史过滤
- `src/app/error-items/[id]/page.tsx`: 增加"复习原题"入口
- `src/app/api/import/route.ts`: 导入兼容 `answerImageUrl`
- `src/types/api.ts`: 类型增加 `answerImageUrl`
- `src/__tests__/integration/practice.test.ts`: 增加原题复习记录相关测试
- `src/__tests__/integration/import-export.test.ts`: 增加导入导出兼容测试

## Tests Run
- `npx prisma generate`
- `npx prisma validate`
- `npm test`

## Result
- 原题复习流程已实现。
- 支持可选文字记录和一张作答照片。
- 不接入 FSRS、ReviewSchedule、DailyPlan、LLM 或 OCR。

## Known Issues
- Codex 未完成手动 UI 验证。
- 后续由 Claude Code/DS4Pro 审查并补充了历史作答只显示 `ORIGINAL_REVIEW` 的过滤。

## Follow-ups
- TASK-003: FSRS 状态表与适配层。
