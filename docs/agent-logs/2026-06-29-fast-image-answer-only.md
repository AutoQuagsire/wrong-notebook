# TASK-038: 图片识题 answer-only 快速模式

**时间**: 2026-06-29
**分支**: `feature/fast-image-answer-only`
**状态**: 完成

## 为什么做 answer-only 模式

上传图片识题时原行为：AI 同时提取题目并生成详细解答。问题：
1. 等待时间过长
2. 解答质量参差不齐
3. 解答篇幅过长，移动设备/墨水屏显示体验差
4. 复习时真正需要的是"快速识别题目 + 最终答案"

## 图片识题链路审计

| 入口 | 路径 | prompt | parser |
|------|------|--------|--------|
| 首页拍照 | 本机 LLM `clientAnalyzeImage()` | `ANALYZE_IMAGE_SYSTEM_PROMPT` (client-llm-chat.ts) | `parseAnalyzeXmlResponse()` |
| 首页拍照（无本机 LLM） | 服务端 `/api/analyze` | `DEFAULT_ANALYZE_TEMPLATE` (prompts.ts) | 同上 + Zod schema |
| 错题本添加页拍照 | 服务端 `/api/analyze` | `DEFAULT_ANALYZE_TEMPLATE` (prompts.ts) | 同上 |

## 修改的文件

| 文件 | 改动 |
|------|------|
| `src/lib/client-llm-chat.ts` | 本机 LLM 图片识题 prompt 改为 answer-only 快速模式 |
| `src/lib/ai/analyze-parser.ts` | analysis 从必填改为可选（允许空） |
| `src/lib/ai/schema.ts` | `analysis` Zod schema 从 `z.string().min(1)` 改为 `z.string().default("")` |
| `src/components/correction-editor.tsx` | 解析预览区：空时显示"(快速模式，无详细解析)" |
| `src/__tests__/unit/ai/schema.test.ts` | 更新测试：analysis 允许为空 |

## 覆盖情况

- **首页图片识题**：✅ 已覆盖（本机 LLM prompt 改为 answer-only）
- **错题本添加页图片识题**：✅ 已覆盖（共享 parser 和 schema）
- **文字 AI 解题（重新解题）**：❌ 不受影响（独立 prompt 和 parser）
- **历史错题解析**：❌ 不受影响（已存储数据不变）
- **数据库 schema**：❌ 未修改

## 测试结果

- TypeScript：通过
- 相关单元测试（13 个 schema 测试）：全部通过
- 预存集成测试失败（analyze/reanswer 缺少 checkSystemAIPermission mock）：与本次无关

## 后续建议

- 如需进一步优化，也可把服务端 `/api/analyze` 的 `DEFAULT_ANALYZE_TEMPLATE` 改为 answer-only
- 未来可考虑在设置页加"快速模式/详细模式"开关
