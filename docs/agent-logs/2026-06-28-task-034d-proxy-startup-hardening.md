# TASK-034D: 固化本机代理启动方式

**时间**: 2026-06-28
**状态**: 完成

## 摘要

TASK-034C 诊断发现生产页面本机代理失效的根因是：用户直接运行 `node server.mjs` 启动代理，导致 `.env` 未被加载，`ALLOWED_ORIGINS` 退化为空字符串，生产 Origin `http://8.148.71.66` 被 CORS 拒绝。

TASK-034D 通过以下方式固化启动方式，防止未来误操作：

1. **server.mjs**: 启动时检测 `.env` 是否被加载；未加载则打印醒目的 boxed warning；新增 `GET /health` 健康检查接口。
2. **package.json**: 已正确配置 `"start": "node --env-file=.env server.mjs"`。
3. **README.md**: 全面重写，增加生产 Origin 配置说明、健康检查步骤、故障排查章节。
4. **local-llm-settings.tsx**: 设置页提示启动代理必须用 `npm start`，并指引用户访问 `/health` 确认。

## 修改文件

- `tools/local-llm-proxy/server.mjs` — 启动警告 + `/health` 接口
- `tools/local-llm-proxy/package.json` — 无需修改（已正确）
- `tools/local-llm-proxy/README.md` — 完整重写
- `src/components/settings/local-llm-settings.tsx` — 增加启动提示 + /health 指引

## 验证结果

| 检查项 | 结果 |
|--------|------|
| npm start → Origins 加载 | ✅ `http://localhost:3000, http://8.148.71.66` |
| npm start → PNA enabled | ✅ |
| GET /health → allowedOrigins | ✅ 包含两个 Origin |
| node server.mjs 直接启动 | ✅ 打印 boxed warning |
| tsc --noEmit | ✅ 通过 |
| lint | ✅ 0 error |
| test (unit) | ✅ 596 passed |
| next build | ✅ 通过 |
| proxy node -c | ✅ 通过 |
