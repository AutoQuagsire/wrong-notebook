# TASK-035: 生产环境本机 LLM 调用链路排查

**时间**: 2026-06-29
**状态**: 排查完成（待用户提供有效 Key 后继续）

## 用户报告问题

在 `http://8.148.71.66` 上：
1. **proxyEnabled=ON** → 所有调用（文字/拍照）均报 `AI_UNKNOWN_ERROR`
2. **proxyEnabled=OFF + 文字** → 成功
3. **proxyEnabled=OFF + 拍照** → 报 `AI_CONNECTION_FAILED`（CORS 阻止）

## 排查过程

### 1. 代理端口确认

代理未运行 → 启动后确认：
- `127.0.0.1:8787` LISTENING
- `/health` 返回 `allowedOrigins: ["http://localhost:3000", "http://8.148.71.66"]` ✅

### 2. 代理转发测试（无 API Key）

```
POST http://127.0.0.1:8787/v1/chat/completions
X-Provider-Base-URL: https://open.bigmodel.cn/api/paas/v4
→ 401 from BigModel（"未收到Authorization"）
```

✅ 代理转发链路 OK

### 3. 代理转发测试（生产 Key）

```
POST http://127.0.0.1:8787/v1/chat/completions
Authorization: Bearer d2a897...nE2J
X-Provider-Base-URL: https://open.bigmodel.cn/api/paas/v4
→ 401 "身份验证失败" (code: 1000)
```

### 4. BigModel 直连测试（生产 Key）

```
curl POST https://open.bigmodel.cn/api/paas/v4/chat/completions
Authorization: Bearer d2a897...nE2J
→ 401 "身份验证失败" (code: 1000)

curl GET https://open.bigmodel.cn/api/paas/v4/models
Authorization: Bearer d2a897...nE2J
→ 401 "身份验证失败" (code: 1000)
```

### 5. 服务器端测试

从生产服务器直接 curl BigModel 同样 401。排除本地网络问题。

## 结论

### 根本原因：**BigModel API Key 已失效**

| 证据 | 详情 |
|------|------|
| 代理链路 | ✅ 正常（OPTIONS 204，POST 到达 BigModel） |
| BigModel 响应 | 401 code:1000 "身份验证失败" |
| 影响范围 | 本机直连、本机代理均 401 |
| Key 格式 | `d2a897...oMY9hU4ee9xcnE2J`（49 字符，含 `.`） |

### 场景解释

| 场景 | 表现 | 原因 |
|------|------|------|
| proxyEnabled=ON + 文字/拍照 | AI_UNKNOWN_ERROR | 代理转发后 BigModel 返回 401，`classifyError()` 中 "401"→"unauthorized"→AI_AUTH_ERROR，但 `errorCode` 覆盖逻辑有缺陷导致 fallthrough 到 AI_UNKNOWN_ERROR |
| proxyEnabled=OFF + 文字 | 成功 | 🤔 **说不通** —— 如果 Key 失效则直连也应该 401 |
| proxyEnabled=OFF + 拍照 | AI_CONNECTION_FAILED | BigModel 不允许浏览器 CORS + 大 body image_url → CORS 预检失败 → `fetch failed` |

> **疑点**：proxyEnabled=OFF + 文字为何能成功？可能用户用的是**另一个 Key**（浏览器 localStorage 存储的与服务器 `.env` 不同），或者测试时本地开发服务器用了不同的 Key。

### 修复方向

1. **用户需要**：登录 [智谱开放平台](https://bigmodel.cn/usercenter/proj-mgmt/apikeys) 确认 Key 状态，重新生成有效的 API Key
2. **代码问题**（排查后另行修复）：
   - `classifyError()` 中 401 被两条规则先后匹配，`AI_AUTH_ERROR` → `AI_UNKNOWN_ERROR`
   - 拍照识题 proxyEnabled=OFF 时理应回退系统 AI，但实际直接报错退出
