---
date: 2026-06-28
task: TASK-033A
commit: 5d832fa
branch: main
---

## Summary

Added server-side AI permission guard to prevent ordinary users from consuming the global system API key.

## Files Changed

| File | Change |
|---|---|
| `src/lib/ai/server-ai-permission.ts` | New guard — checks session.user.role === "admin" |
| `src/app/api/analyze/route.ts` | Added guard before getAIService() |
| `src/app/api/reanswer/route.ts` | Added guard before getAIService() |
| `src/app/api/practice/generate/route.ts` | Added guard before getAIService() |
| `src/app/api/geogebra-analyze/route.ts` | Added guard before getAIService() |
| `src/app/api/error-items/[id]/geogebra/route.ts` | Added guard before getAIService() |

## Behavior

- **Admin (role="admin")**: All system AI routes continue to work unchanged
- **Ordinary user (role="user")**: Returns HTTP 403 `{"error":"SYSTEM_AI_DISABLED_FOR_USER","message":"系统级 AI 不对普通用户开放。请在设置页配置本机 LLM。"}`
- **Unauthenticated**: Returns HTTP 403 (guard catches this)

## Verification
- `npx tsc --noEmit`: passed
- `npm run lint`: 0 errors
- `npm test` (vitest): 37 files, 634 tests passed
- `npx next build --webpack`: compiled successfully
- No env files tracked by git
- `config/app-config.json` already in `.gitignore`
