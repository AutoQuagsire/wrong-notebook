# 维护日志 - 2026-06-29

## 当前状态

| 项目 | 状态 |
|------|------|
| 生产页面 `http://8.148.71.66` | ✅ HTTP 200 |
| systemd `wrong-notebook.service` | ✅ active (running) |
| static chunks | ✅ 31 个文件 |
| BUILD_ID | `PwfN41k8nNUuuhC1bP76R` |
| 本机代理 `127.0.0.1:8787` | ✅ 运行中 (PID 34032) |
| 代理 /health | ✅ `envLoaded:true`, allowedOrigins 含 `http://8.148.71.66` |

## 生产服务器维护

- systemd 配置：`/etc/systemd/system/wrong-notebook.service`
- 启动命令：`systemctl start wrong-notebook`
- 查看日志：`journalctl -u wrong-notebook -f`
- 重启：`systemctl restart wrong-notebook`

## 本机代理

- 正确的启动方式：`cd tools/local-llm-proxy && npm start`
- 健康检查：`http://127.0.0.1:8787/health`
- .env 要求 ALLOWED_ORIGINS 同时包含 localhost:3000 和 8.148.71.66

## 最近修复

1. 生产服务器 502 → 创建 systemd 服务守护 Next.js
2. client-side exception → 复制 static/ 到 standalone
3. BigModel API Key 失效 → 待用户更换新 Key
4. 代理启动方式固化 → npm start 强制 + 直接 node 警告
5. 拍照识题前置代理检查 → 在 async 前校验代理状态，提前报错
