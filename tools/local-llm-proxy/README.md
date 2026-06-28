# 本机 LLM 代理 (local-llm-proxy)

## 用途

在某些第三方 LLM 服务不支持浏览器跨域请求（CORS）时，wrong-notebook 页面的本机 LLM 功能无法直连外部 API。

此代理在用户本机运行，充当中间层：

```
浏览器 (wrong-notebook)  →  http://127.0.0.1:8787/v1/chat/completions
                                   ↓
本机代理                           ↓  (转发，携带 API Key)
                                   ↓
                             外部 LLM API
```

**关键安全保证：**

- 代理运行在**用户自己电脑**上，not wrong-notebook 服务器
- API Key 只存在于本机 `.env` 文件
- wrong-notebook 服务器**拿不到**用户的 API Key 和图片数据
- 浏览器只请求 `127.0.0.1`，不会泄露到外部

## 启动步骤

### 1. 复制并编辑配置文件

```bash
cd tools/local-llm-proxy
cp .env.example .env
```

编辑 `.env`：

```env
PORT=8787
PROVIDER_BASE_URL=https://api.openai.com/v1
PROVIDER_API_KEY=sk-your-actual-key-here
ALLOWED_ORIGIN=http://localhost:3000
```

| 变量 | 说明 |
|------|------|
| `PORT` | 代理监听端口 |
| `PROVIDER_BASE_URL` | 目标 LLM 服务的 Base URL（OpenAI-compatible） |
| `PROVIDER_API_KEY` | 目标 LLM 服务的 API Key |
| `ALLOWED_ORIGIN` | wrong-notebook 页面的访问地址 |

> **如果 wrong-notebook 页面部署在其他地址**（如 `http://192.168.1.x:3000` 或 `http://8.148.71.66`），请将 `ALLOWED_ORIGIN` 改为对应地址。

### 2. 启动代理

```bash
npm start
```

看到以下输出表示启动成功：

```
[proxy] 本机 LLM 代理已启动
[proxy] 监听: http://127.0.0.1:8787/v1/chat/completions
[proxy] 转发: https://api.openai.com/v1/chat/completions
[proxy] 允许 CORS: http://localhost:3000
```

按 `Ctrl+C` 停止。

### 3. 配置 wrong-notebook

在 wrong-notebook 的「设置 → 本机 LLM」中：

| 字段 | 填写内容 |
|------|---------|
| 启用本机 LLM | 开启 |
| Base URL | `http://127.0.0.1:8787/v1` |
| Model | 外部服务支持的模型名（如 `gpt-4o`） |
| API Key | 可填写任意占位值（如 `local-proxy`），代理实际使用 `.env` 中的 Key |

### 4. 验证

在 wrong-notebook 设置页点击「测试连接」，应显示连接成功。

然后可以正常使用：
- 首页文字 AI 解题
- 首页拍照识题（需模型支持 vision）
- 错题本添加页文字 AI 解题
- 重新解题

## 模型要求

### 文字 AI 解题
任何支持的文本模型均可。

### 拍照识题
模型必须支持 `image_url` 视觉输入，例如：
- gpt-4o / gpt-4-turbo
- 其他支持 OpenAI-compatible vision 格式的模型

如果不支持 vision，拍照识题会提示「模型或网关可能不支持图片输入」并拒绝请求，不会回退到 wrong-notebook 系统 API。
