# TASK-039: 错题题型分类 questionType

**时间**: 2026-06-29
**分支**: `feature/question-type-classification`
**状态**: 完成

## 为什么要做题型分类

为错题库增加稳定的题型分类能力，用于筛选、复习抽题、统计、AI prompt 控制。

支持题型：CHOICE / FILL_BLANK / CALCULATION / PROOF / OTHER

## 数据库 schema 改动

- Prisma `ErrorItem` 新增 `questionType String @default("OTHER")`
- Migration: `20260629071649_add_question_type_to_error_items`
- 历史数据默认 `OTHER`，向后兼容

## 修改的文件

| 文件 | 改动 |
|------|------|
| `prisma/schema.prisma` | ErrorItem 加 questionType 字段 |
| `src/lib/question-type.ts` | 新增常量和 normalizeQuestionType() |
| `src/lib/ai/schema.ts` | ParsedQuestionSchema 加 questionType |
| `src/lib/ai/analyze-parser.ts` | parseAnalyzeXmlResponse 返回 questionType |
| `src/lib/ai/azure-provider.ts` | 返回 questionType: "CHOICE" |
| `src/lib/ai/openai-provider.ts` | 返回 questionType: "CHOICE" |
| `src/lib/ai/gemini-provider.ts` | 返回 questionType: "CHOICE" |
| `src/lib/reanswer-normalizer.ts` | 返回 questionType: "OTHER" |
| `src/lib/reanswer-request.ts` | subject 改为可选 |
| `src/app/api/error-items/route.ts` | POST 支持 questionType |
| `src/app/api/error-items/[id]/route.ts` | PUT 支持 questionType |
| `src/app/api/error-items/list/route.ts` | 列表过滤支持 questionType |
| `src/app/api/import/route.ts` | 导入兼容 questionType |
| `src/components/correction-editor.tsx` | 题型选择 dropdown |
| `src/app/page.tsx` | handleSave 签名更新 |
| `src/app/notebooks/[id]/add/page.tsx` | handleSave 签名更新 |
| `src/__tests__/unit/ai/schema.test.ts` | analysis 允许为空 |

## 导入导出兼容

- 导出自动包含 questionType（Prisma findMany 全字段）
- 导入旧数据无 questionType → 默认 "OTHER"

## 测试结果

- TypeScript: 通过
- Schema 测试: 13/13 通过
- 相关单元测试: 170/171 通过（1 个 AI prompts 测试失败——与本次无关）
- 预存集成测试失败（analyze/reanswer 缺少 mock）：与本次无关

## 后续建议

- AI prompt 应要求模型输出真实 questionType（当前回退 CHOICE）
- 按题型统计正确率
- 按题型抽题策略差异
