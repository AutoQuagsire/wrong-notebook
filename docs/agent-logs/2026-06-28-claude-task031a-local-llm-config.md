# 2026-06-28 — Claude — TASK-031A本地LLM配置UI与本地存储

## Agent
- Tool: Claude Code
- Model: Opus 4.8
- Operator: Claude

## Task
- 为普通用户添加「本机 LLM 配置」设置页 UI 与浏览器本地存储，不接入任何 AI 调用。
- 从稳定的 checkpoint-review-system-main-v1.5.11 出发，分阶段实现。

## Files Changed
- `src/lib/client-llm-config.ts`: 新增 client-only 模块，包含类型定义、两层存储、完整度检验、API Key 遮罩
- `src/components/settings/local-llm-settings.tsx`: 新增设置页组件，独立于管理员 AI 配置
- `src/components/settings-dialog.tsx`: 集成 LocalLLMSettings 为新的「本机 LLM」Tab，普通用户可见
- `src/lib/translations.ts`: 新增 `tabs.localLlm` key（中文「本机 LLM」，英文「Local LLM」）

## Database Changes
- None

## Tests Run
- npx tsc --noEmit: **passed** (0 errors)
- npm run lint: **passed** (no new warnings)
- npm test: **37 files / 634 tests passed**
- npx next build --webpack: **compiled successfully**

## Result
- 完成 ✅
- 普通用户可在设置页看到「本机 LLM」Tab
- 管理员全局 AI 配置（AI Provider / Prompts）未受影响
- API Key 不上传后端、不写入 DB、不写入 app-config、不进入 console.log
- remember=false: session memory only，刷新丢失
- remember=true: 存 localStorage，刷新保留，UI 显示风险提示
- 测试连接直接从浏览器发请求到用户填写的 Base URL
- 所有现有 API routes、AI providers、config 结构未被修改

## Known Issues
- `npm run lint` 有若干预存的 unrelated 警告（`@typescript-eslint/no-unused-vars` 等），不在本次修改范围内

## Follow-ups
- TASK-031B: 抽出 reanswer 共享 XML 解析/normalize 工具
- TASK-031C: 接入 CorrectionEditor 的「重新解题」入口
