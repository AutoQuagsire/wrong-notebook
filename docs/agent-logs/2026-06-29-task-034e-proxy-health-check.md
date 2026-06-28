# TASK-034E: 增强本机代理可用性检测

**时间**: 2026-06-29
**状态**: 完成

## 摘要

照片识题失败常见原因是代理未启动、Origin 不匹配、或 BigModel 直连被 CORS 阻拦。之前用户会看到 92% 进度然后失败，错误信息不明确。

## 修改

| 文件 | 改动 |
|------|------|
| `tools/local-llm-proxy/server.mjs` | /health 增加 `envLoaded` 字段 |
| `src/lib/client-llm-chat.ts` | 新增 `checkLocalProxyHealth()` 函数 + `ProxyHealthResult` 类型 |
| `src/components/settings/local-llm-settings.tsx` | 新增「检测本机代理」按钮 + `DetectProxyButton` 组件 |
| `src/app/page.tsx` | 拍照识题新增前置代理检查：BigModel 强制代理、代理未启动提示、Origin 不匹配提示 |
| `tools/local-llm-proxy/README.md` | 新增 BigModel 拍照识题配置说明 |

## 行为变化

| 场景 | 之前 | 之后 |
|------|------|------|
| BigModel 拍照 + 未开代理 | 92% 后 AI_CONNECTION_FAILED | 立即提示"需要启用本机代理" |
| 代理启用但未启动 | 92% 后 AI_CONNECTION_FAILED | 立即提示"代理未启动，请运行 npm start" |
| 代理启动但 Origin 未匹配 | CORS 错误 | 立即提示"Origin 未被允许，请修改 ALLOWED_ORIGINS" |
| 代理正常 | 正常工作 | 前置检查通过后正常工作 |
| 设置页 | 无可视化代理检测 | 点击「检测本机代理」查看完整状态 |

## 验证

| 检查 | 结果 |
|------|------|
| tsc | ✅ |
| lint (本次文件) | ✅ 0 error |
| build | ✅ |
| proxy syntax | ✅ |
| test | ⚠️ 3 既有集成测试失败（数据库），34 passed |

## Commit
- `20f3158` fix: add local proxy health checks for image analysis
