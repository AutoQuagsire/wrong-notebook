# 本机 LLM 代理 (local-llm-proxy)

## 用途

在某些第三方 LLM 服务不支持浏览器跨域请求（CORS）时，wrong-notebook 页面的本机 LLM 功能无法直连外部 API。

此代理在用户本机运行，充当**无状态 CORS 转发层**：

```
浏览器 (wrong-notebook)  →  http://127.0.0.1:8787/v1/chat/completions
           Header: X-Provider-Base-URL: https://api.openai.com/v1
           Header: Authorization: Bearer sk-xxx
                                   ↓
本机代理                           ↓  (转发，原样携带 Authorization)
                                   ↓
                             外部 LLM API
```

**关键安全保证：**

- 代理运行在**用户自己电脑**上，不是 wrong-notebook 服务器
- API Key 由 wrong-notebook 网页设置页填写，只经过本机代理，**不经过** wrong-notebook 后端
- 代理**不保存** API Key
- 本机 .env 中只需 PORT 和 ALLOWED_ORIGINS
- 图片只发送到本机代理与外部 LLM，不经过 wrong-notebook 后端

## 启动步骤

### 1. 复制并编辑配置文件

```bash
cd tools/local-llm-proxy
cp .env.example .env
```

编辑 `.env`：

```env
PORT=8787
ALLOWED_ORIGINS=http://localhost:3000,http://8.148.71.66
MAX_BODY_BYTES=15728640
```

| 变量 | 说明 |
|------|------|
| `PORT` | 代理监听端口 |
| `ALLOWED_ORIGINS` | wrong-notebook 页面的访问地址，多个用逗号分隔 |
| `MAX_BODY_BYTES` | 请求体最大字节数（默认 15MB） |

**Origin 配置说明：**

| 访问方式 | 页面 Origin |
|---------|------------|
| 本地开发 | `http://localhost:3000` |
| 生产页面 | `http://8.148.71.66` |

> **如果你同时使用本地开发和生产页面**，请将两个 Origin 都填入 `ALLOWED_ORIGINS`，用逗号分隔：
> ```
> ALLOWED_ORIGINS=http://localhost:3000,http://8.148.71.66
> ```
> 修改 .env 后必须重启代理。

### 2. 启动代理

```bash
npm start
```

> ⚠️ **必须使用 `npm start` 启动！不要直接运行 `node server.mjs`。**
>
> `npm start` 会执行 `node --env-file=.env server.mjs`，从而加载 `.env` 中的配置。
>
> 直接运行 `node server.mjs` **不会**自动读取 `.env`，会导致 `ALLOWED_ORIGINS` 不生效，
> 进而生产页面 CORS 请求被拒绝（浏览器报 "Failed to fetch" 或 "blocked by CORS policy"）。

Node.js 20.6+ 支持 `--env-file`。

看到以下输出表示启动成功：

```
[proxy] 本机 LLM 代理已启动
[proxy] 监听: http://127.0.0.1:8787/v1/chat/completions
[proxy] 允许 CORS Origins: http://localhost:3000, http://8.148.71.66
[proxy] Private Network Access: enabled
[proxy] 最大请求体: 15 MB
[proxy] 按 Ctrl+C 停止
```

按 `Ctrl+C` 停止。

### 3. 验证代理配置（健康检查）

浏览器打开：

```
http://127.0.0.1:8787/health
```

返回示例：

```json
{
  "ok": true,
  "service": "local-llm-proxy",
  "allowedOrigins": ["http://localhost:3000", "http://8.148.71.66"],
  "maxBodyBytes": 15728640,
  "pna": true,
  "envLoaded": true
}
```

**检查 `allowedOrigins` 是否包含当前网页的 Origin：**
- 本地开发对应 `http://localhost:3000`
- 生产页面对应 `http://8.148.71.66`

如果 `allowedOrigins` 为空数组 `[]`，说明 `.env` 未被加载，你可能是直接运行了 `node server.mjs`。请改用 `npm start`。

### 4. 配置 wrong-notebook

在 wrong-notebook 的「设置 → 本机 LLM」中：

| 字段 | 填写内容 |
|------|---------|
| 启用本机 LLM | 开启 |
| Provider Base URL | 外部 LLM 地址，如 `https://open.bigmodel.cn/api/paas/v4` |
| Model | 外部服务支持的模型名（如 `glm-4v-plus`） |

| 字段 | 填写内容 |
|------|---------|
| API Key | 用户在外部 LLM 的 API Key（如 BigModel API Key） |

| 字段 | 填写内容 |
|------|---------|
| 使用本机代理 | 开启 |
| Proxy URL | `http://127.0.0.1:8787/v1` |

### 5. 验证

在 wrong-notebook 设置页：
1. 点击「检测本机代理」，确认代理可用且当前页面 Origin 已允许。
2. 点击「测试连接」，验证 LLM 配置正确。

然后可以正常使用：
- 首页文字 AI 解题
- 首页拍照识题（需模型支持 vision）
- 错题本添加页文字 AI 解题
- 重新解题

### BigModel（智谱）拍照识题特别说明

BigModel 的图片请求**必须**通过本机代理，浏览器直连会触发 CORS 预检失败。

如果未启用代理或代理未启动，拍照识题会在提交图片时立即提示，不会等待超时。

正确配置步骤：
1. 在设置页开启「使用本机代理解决 CORS」
2. 在 `tools/local-llm-proxy` 目录运行 `npm start`
3. 确保 `.env` 的 `ALLOWED_ORIGINS` 包含当前页面 Origin
4. 在设置页点击「检测本机代理」确认通过
5. 再执行拍照识题

## 模型要求

### 文字 AI 解题
任何支持的文本模型均可。

### 拍照识题
模型必须支持 `image_url` 视觉输入，例如：
- gpt-4o / gpt-4-turbo
- glm-4v-plus / glm-4v (智谱 BigModel)
- 其他支持 OpenAI-compatible vision 格式的模型

如果不支持 vision，拍照识题会提示「模型或网关可能不支持图片输入」并拒绝请求，不会回退到 wrong-notebook 系统 API。

## 隐私边界

- API Key 不会上传 wrong-notebook 后端
- API Key 不保存在本机代理
- 本机代理只在请求转发时读取 Authorization header
- 图片不经过 wrong-notebook 后端
- 图片只发送到本机代理与用户配置的外部模型服务

## 故障排查

### 浏览器报 "Failed to fetch" 或 CORS 错误

1. 确认代理正在运行：访问 `http://127.0.0.1:8787/health`
2. 确认 `allowedOrigins` 包含当前页面 Origin
3. 确认你是用 `npm start` 启动的，不是 `node server.mjs`
4. 确认 wrong-notebook 设置页的 Proxy URL 是 `http://127.0.0.1:8787/v1`

### 生产页面（http://8.148.71.66）失败但本地（localhost:3000）正常

几乎可以确定是 `.env` 的 `ALLOWED_ORIGINS` 缺少 `http://8.148.71.66`。

解决方法：
1. 编辑 `tools/local-llm-proxy/.env`
2. 在 `ALLOWED_ORIGINS` 中添加 `http://8.148.71.66`
3. 重启代理（Ctrl+C 后重新 `npm start`）
4. 访问 `/health` 确认 `allowedOrigins` 已包含生产 Origin
