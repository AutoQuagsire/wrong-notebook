# 2026-06-28 — Claude — TASK-031B Share Reanswer Parsing

## Agent
- Tool: Claude Code
- Model: Opus 4.8
- Operator: Claude

## Task
Refactor reanswer XML parsing and ReanswerQuestionResult→ParsedQuestion normalization into shared modules. No behaviour change.

## Files Changed
- `src/lib/ai/xml-utils.ts`: new shared XML tag extraction (extractXmlTag, extractXmlTagRaw, extractXmlTagOptional, parseKnowledgePoints, parseBooleanTag)
- `src/lib/ai/reanswer-parser.ts`: new parseReanswerXmlResponse() — equivalent to duplicated inline logic
- `src/lib/reanswer-normalizer.ts`: new normalizeReanswerToParsedQuestion()
- `src/lib/ai/openai-provider.ts`: reanswerQuestion() now uses parseReanswerXmlResponse()
- `src/lib/ai/azure-provider.ts`: reanswerQuestion() now uses parseReanswerXmlResponse()
- `src/lib/ai/gemini-provider.ts`: reanswerQuestion() now uses parseReanswerXmlResponse()
- `src/app/page.tsx`: handleTextSubmit uses normalizeReanswerToParsedQuestion()
- `src/app/notebooks/[id]/add/page.tsx`: handleTextSubmit uses normalizeReanswerToParsedQuestion()

## Verification
- npx tsc --noEmit: passed (0 errors)
- npm run lint: 0 errors, 80 pre-existing warnings (11 new 'unused import' from providers that still import normalizeMistakeStatusForSave — it is still used outside reanswer)
- npm test: 37 files / 634 tests passed
- npx next build --webpack: compiled successfully

## Behaviour Preserved
- /api/reanswer route: unchanged
- LLM request body (prompt, model, messages, max_tokens): unchanged
- ReanswerQuestionResult fields: unchanged
- Frontend ParsedQuestion mapping: identical (default subject "数学" → "其他", requiresImage: false)

## Commit
- hash: 78676c9
- message: refactor: share reanswer parsing and normalization
