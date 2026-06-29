# fix: 客户端 LLM 重新解题 content 为空处理

**时间**: 2026-06-29
**分支**: `fix/client-llm-empty-content-reanswer`
**状态**: 完成

## 问题现象

在"校对与保存"页面点击"根据内容重新解题"时报错：

```
[Reanswer] Client LLM failed: AI_RESPONSE_ERROR: 本机 LLM 返回内容为空
```

## 根因

`src/lib/client-llm-chat.ts` 只读取 `data.choices?.[0]?.message?.content`，遇 Thinking/Reasoning 模型返回时 `content` 为空、推理内容在 `reasoning_content` 里，即报错。正常对话模型的 content 也可能因安全过滤、输出截断等原因为空。

## 修改文件

| 文件 | 改动 |
|------|------|
| `src/lib/client-llm-chat.ts` | 新增 `extractAssistantContent()` — 安全提取 assistant content；`buildContentEmptyError()` — 根据诊断结果构建可读错误；`clientReanswerQuestion()` — 支持自动重试；`clientAnalyzeImage()` — 同样使用新提取函数 |
| `src/components/correction-editor.tsx` | `getClientLlmErrorMessage()` 优先使用 `error.message` 中的诊断信息 |
| `src/__tests__/unit/client-llm-content-extract.test.ts` | 新增 16 个单元测试覆盖所有场景 |

## 为什么不直接使用 reasoning_content 作为答案

reasoning_content 是模型的推理/思考过程，通常包含冗长的分析、自我纠错、假设探索等，不适合直接作为错题的答案或解析内容。应该由模型在 content 中输出结构化的最终答案。

## 自动重试

实现了：首次响应 content 为空但有 reasoning_content 时，追加一条 user 消息要求模型"不要输出推理过程，只输出最终答案内容"，重新请求一次。重试 prompt 不包含原始 reasoning_content。

## 支持的 content 格式

1. 普通字符串 → 直接返回
2. 数组 text parts → 提取拼接（vision-capable 模型格式）
3. null/空 → 记录诊断
4. refusal 存在 → 标记"模型拒答"

## 错误信息改进

从 `本机 LLM 返回内容为空` 改为：

- 有 reasoning_content → "当前模型可能是 Thinking/Reasoning 模型…请换用普通对话模型或关闭推理模式"
- choices 为空 → "choices 数组为空"
- refusal 存在 → "模型拒绝回答…"
- finish_reason=length → "输出被截断…"
- 自动重试失败 → 同上明确提示

## 测试结果

- 新增测试：16/16 通过
- 相关单元测试：110/110 通过（9 文件）
- TypeScript 类型检查：通过
- 预存集成测试失败（analyze/reanswer 的 38 个测试因缺少 `checkSystemAIPermission` mock 返回 403）——与本次改动无关

## 后续建议

- 在设置页或模型选择处提示用户避免使用 Thinking/Reasoning 模型
- 修复集成测试中缺少 `checkSystemAIPermission` mock 的问题
