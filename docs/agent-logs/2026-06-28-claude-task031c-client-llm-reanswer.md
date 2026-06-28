# 2026-06-28 — Claude — TASK-031C Client LLM CorrectionEditor

## Agent
- Tool: Claude Code
- Model: Opus 4.8
- Operator: Claude

## Task
Wire only the CorrectionEditor "reanswer" button to the user's local LLM when enabled.
All other AI entry points remain unchanged.

## Files Changed
- `src/lib/ai/client-reanswer-prompt.ts`: new client-safe reanswer system prompt
- `src/lib/client-llm-chat.ts`: new clientReanswerQuestion() — browser fetch to user Base URL, error classification
- `src/components/correction-editor.tsx`: handleReanswer branches on loadLlmConfig().enabled

## Files NOT Changed (verified)
- src/app/page.tsx
- src/app/notebooks/[id]/add/page.tsx
- src/app/api/reanswer/route.ts
- src/app/api/analyze/route.ts
- src/lib/ai/openai-provider.ts
- src/lib/ai/azure-provider.ts
- config/app-config.json
- prisma/schema.prisma

## Behaviour Matrix

| Scenario | Behaviour |
|----------|-----------|
| Local LLM disabled | Calls /api/reanswer (unchanged) |
| Local LLM enabled + config complete | Browser fetch to user Base URL, no /api/reanswer |
| Local LLM enabled + config incomplete | Shows alert to complete config, no /api/reanswer |
| Local LLM call fails (auth/CORS/network) | Shows error, no fallback to /api/reanswer |

## Verification
- npx tsc --noEmit: 0 errors
- npm run lint: 0 errors, 69 pre-existing warnings
- npm test: 37 files / 634 tests passed
- npx next build --webpack: compiled successfully

## Privacy
- API Key never sent to wrong-notebook backend
- credentials: "omit"
- API Key not logged (only error.message which is classification text)

## Commit
- hash: 04631c0
- message: feat: use local LLM for correction editor reanswer
