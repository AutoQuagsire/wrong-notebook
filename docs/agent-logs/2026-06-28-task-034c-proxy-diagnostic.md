# TASK-034C Result

## 1. Git State

| Item | Value |
|------|-------|
| HEAD | `a1198ae` — "fix: support production origin for local LLM proxy" |
| 5d832fa present | Yes (tagged checkpoint-review-system-main-v1.5.13) |
| Working tree | Clean (only untracked `docs/agent-logs/2026-06-28-claude-reinstall.md`) |
| Code changed | No — diagnostic only |

## 2. Proxy .env

```
PORT=8787
ALLOWED_ORIGINS=http://localhost:3000,http://8.148.71.66
MAX_BODY_BYTES=15728640
```

- ✅ No API Key in .env (stateless proxy)
- ✅ `ALLOWED_ORIGINS` correctly includes both `http://localhost:3000` and `http://8.148.71.66`
- ✅ `MAX_BODY_BYTES` = 15MB

## 3. Proxy Process

| Check | Result |
|-------|--------|
| Port 8787 listener | Yes — `127.0.0.1:8787` LISTENING |
| Process | `node.exe` PID 40744 |
| Started via | `npm start` (= `node --env-file=.env server.mjs`) |
| Allowed Origins (log) | `http://localhost:3000, http://8.148.71.66` |
| PNA support (log) | `Private Network Access: enabled` |

**Critical finding**: The prior proxy instance was started with `node server.mjs` directly (without `--env-file=.env`), which means it was loading the hardcoded default `http://localhost:3000` as the only allowed origin. This explains why production origin `http://8.148.71.66` would have been blocked by CORS before the current restart.

## 4. PowerShell OPTIONS Preflight

```
Origin: http://8.148.71.66
Access-Control-Request-Method: POST
Access-Control-Request-Headers: Content-Type, Authorization, X-Provider-Base-URL
Access-Control-Request-Private-Network: true

→ Status: 204 No Content
```

Response headers:
| Header | Value |
|--------|-------|
| Access-Control-Allow-Origin | `http://8.148.71.66` |
| Access-Control-Allow-Methods | `POST, OPTIONS` |
| Access-Control-Allow-Headers | `Content-Type, Authorization, X-Provider-Base-URL` |
| Access-Control-Allow-Private-Network | `true` |
| Vary | `Origin` |

- ✅ **ALL OPTIONS checks pass** — origin matching, PNA, headers, all correct

## 5. PowerShell POST Test (no API key)

```
Method: POST
Headers: Origin=http://8.148.71.66, X-Provider-Base-URL=https://open.bigmodel.cn/api/paas/v4
(no Authorization header)

→ Status: 401
→ Body: {"error":{"code":"1001","message":"Header中未收到Authorization，无法进行身份验证。"}}
```

- ✅ **POST reaches proxy** (not a connection error, not CORS)
- ✅ **Proxy forwards to BigModel** (BigModel responds, not a proxy 502)
- ✅ **BigModel rejects with 401** (expected — no API Key provided)
- ✅ **Round-trip proxy → BigModel → proxy → client works**

## 6. Browser DevTools

**Status**: ⚠️ NOT YET GATHERED (requires browser interaction on production page)

Cannot simulate actual browser DevTools from here. Relies on user to:
1. Open `http://8.148.71.66` in browser
2. Verify settings: proxy enabled, Proxy URL `http://127.0.0.1:8787/v1`
3. Perform home image analyze
4. Check Network tab for OPTIONS/POST to `127.0.0.1:8787`

## 7. Root Cause Analysis

Based on current evidence, the most likely root cause is:

**Prior proxy instance was running WITHOUT `--env-file=.env`**, so it loaded:
```js
const originsRaw = process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || "http://localhost:3000";
→ "http://localhost:3000"
```

With only `http://localhost:3000` allowed, the production origin `http://8.148.71.66` would fail CORS:
- The proxy would return `Access-Control-Allow-Origin: http://localhost:3000`
- The browser at `http://8.148.71.66` would reject it as a mismatch
- Result: "Failed to fetch" / CORS error

**After restarting with `npm start` (→ `node --env-file=.env server.mjs`)**, both origins are correctly loaded and all preflight tests pass.

## 8. Code Status — No Changes Needed

The proxy code (`server.mjs` at commit `a1198ae`) is correctly implemented:
- Multi-origin support via `ALLOWED_ORIGINS` ✅
- Dynamic `Access-Control-Allow-Origin` matching request origin ✅
- `Access-Control-Allow-Private-Network: true` ✅
- `Vary: Origin` ✅
- `X-Provider-Base-URL` in `Access-Control-Allow-Headers` ✅
- Correct forwarding to BigModel ✅

The client-side code (`client-llm-chat.ts`, `local-llm-settings.tsx`) correctly:
- Sets `X-Provider-Base-URL` header when proxy is enabled ✅
- Constructs correct proxy URL ✅
- Shows origin hint in settings UI ✅

## 9. Remaining User Actions Required

1. Ensure proxy is started via `npm start` (NOT `node server.mjs`)
2. Verify `ALLOWED_ORIGINS` in `.env` matches the production page origin
3. Open browser DevTools Network tab while performing home image analyze
4. Enter a valid API Key for BigModel
5. Confirm the model selected supports vision (image_url)

## Next Step

Ask user to perform browser DevTools test at `http://8.148.71.66` with the proxy running correctly (via `npm start`), and report Network tab findings. If the issue persists after confirming proxy is started correctly, collect the browser Console error text and OPTIONS/POST network entries.
