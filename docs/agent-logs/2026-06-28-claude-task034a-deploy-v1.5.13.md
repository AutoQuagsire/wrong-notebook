---
date: 2026-06-28
task: TASK-034A
commit: 5d832fa
tag: checkpoint-review-system-main-v1.5.13
branch: main
---

## Summary

Deployed v1.5.13 to production server 8.148.71.66. All steps completed. No rollback needed.

## Steps Completed

| Step | Result |
|---|---|
| Pre-deployment check | ✅ clean tree, no tracked secrets |
| Tag v1.5.13 | ✅ pushed to GitHub |
| Server backup | ✅ `/var/backups/wrong-notebook/20260628-225053` |
| Git pull (fast-forward) | ✅ `e27fb26..5d832fa`, 34 files |
| Prisma generate | ✅ ok |
| PM2 stop | ✅ |
| Build (low-memory) | ✅ BUILD-EXIT-CODE: 0 |
| PM2 restart | ✅ online, pid 3769 |
| Smoke test localhost | ✅ 307 → /login |
| Smoke test public | ✅ 307 → /login |

## AI Key Audit

| File | Keys Found | Action |
|---|---|---|
| `/var/www/wrong-notebook/.env` | GEMINI_API_KEY, OPENAI_API_KEY | 保留，依赖 guard 限制为 admin 仅用 |

## Permissions

- Ordinary user → SYSTEM_AI_DISABLED_FOR_USER (HTTP 403)
- Admin user → can still use system AI (role check)
- Ordinary user with local LLM → works via proxy

## Known Limitations

- 错题本添加页拍照识题暂未接入本机 LLM，普通用户会被 guard 拦截
