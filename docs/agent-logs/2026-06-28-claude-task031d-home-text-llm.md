---
date: 2026-06-28
task: TASK-031D
commit: 42f7d90
branch: main
---

## Summary

Modified homepage `handleTextSubmit()` to support local LLM for the initial text AI solve flow (首页 → AI解题 → 文字输入 → AI 解题).

## What Changed

- **src/app/page.tsx**: Added local LLM logic to `handleTextSubmit()`. When local LLM is enabled and config is complete, uses `clientReanswerQuestion()` directly; when disabled, keeps old server path (`/api/reanswer`). On local LLM failure, shows error with "未回退系统 AI" and resets state.

## Key Decisions

- Reused `clientReanswerQuestion()`, `parseReanswerXmlResponse()`, `normalizeReanswerToParsedQuestion()` from 031C — no duplication
- No fallback to `/api/reanswer` on local LLM failure
- `analysisStep` always reset to `idle` in catch/finally — prevents stuck-at-90%
- Did NOT modify `notebooks/[id]/add/page.tsx` (left for TASK-031E)

## Verification

- `npx tsc --noEmit`: passed
- `npm run lint`: 0 errors
- `npm test` (vitest): 37 files, 634 tests passed
- `npx next build --webpack`: compiled successfully, 48 static pages generated

## Scope Compliance

- Only `src/app/page.tsx` changed
- No API routes, providers, config files, or DB touched
