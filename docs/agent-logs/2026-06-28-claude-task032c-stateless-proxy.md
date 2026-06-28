---
date: 2026-06-28
task: TASK-032C
commit: a9733f0
branch: main
parent: 0ae977a
---

## Summary

Refactored the local LLM proxy from "stateful .env provider" mode to "stateless CORS forwarder" mode. All LLM API configuration (Base URL, Model, API Key) is now managed entirely from the wrong-notebook settings page. The proxy only does CORS forwarding and never stores API keys.

## Files Changed

| File | Change |
|---|---|
| `src/lib/client-llm-config.ts` | Added `proxyEnabled: boolean` and `proxyUrl: string` fields to ClientLlmConfig |
| `src/lib/client-llm-chat.ts` | Added centralized `buildChatCompletionsRequest()` that routes via proxy when enabled, refactored both `clientReanswerQuestion()` and `clientAnalyzeImage()` to use it |
| `src/components/settings/local-llm-settings.tsx` | Added "使用本机代理解决 CORS" toggle + Proxy URL field + updated privacy/CORS explanations |
| `tools/local-llm-proxy/server.mjs` | Rewritten to read `X-Provider-Base-URL` header + forward `Authorization` — no .env API key needed |
| `tools/local-llm-proxy/.env.example` | Stripped to PORT/ALLOWED_ORIGIN/MAX_BODY_BYTES only |
| `tools/local-llm-proxy/package.json` | Changed start script to `node --env-file=.env server.mjs` |
| `tools/local-llm-proxy/README.md` | Rewritten for stateless usage |

## Design

### Direct mode (proxyEnabled=false)
Browser → POST {baseUrl}/chat/completions with Authorization: Bearer <apiKey>

### Proxy mode (proxyEnabled=true)
Browser → POST {proxyUrl}/chat/completions with Authorization: Bearer <apiKey> + X-Provider-Base-URL: <baseUrl>
Proxy   → POST {X-Provider-Base-URL}/chat/completions with Authorization (forwarded)

## Verification
- `npx tsc --noEmit`: passed
- `npm run lint`: 0 errors
- `npm test` (vitest): 37 files, 634 tests passed
- `npx next build --webpack`: compiled successfully
- `node -c tools/local-llm-proxy/server.mjs`: Syntax OK
- CORS OPTIONS preflight includes `X-Provider-Base-URL` header
- Proxy rejects requests missing `X-Provider-Base-URL` header with HTTP 400
