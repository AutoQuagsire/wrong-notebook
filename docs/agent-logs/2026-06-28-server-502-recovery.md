# 生产服务器 502 恢复

**时间**: 2026-06-28 之后  
**状态**: 已恢复

## 根因

| 问题 | 详情 |
|------|------|
| Next.js 进程 | ❌ 不存在（SSH 会话断开后被 kill） |
| nginx | ✅ 运行中，代理到 `127.0.0.1:3000` |
| 3000 端口 | ❌ 无监听 → nginx 返回 502 |

## 解决

```bash
cd /var/www/wrong-notebook/.next/standalone
cp /var/www/wrong-notebook/.env .env
export PATH=$HOME/.nvm/versions/node/v24.18.0/bin:$PATH
nohup node server.js > /var/log/wrong-notebook.log 2>&1 &
```

## 结果

| 检查 | 结果 |
|------|------|
| 3000 端口 | ✅ `next-server` PID 8914 监听 |
| `http://8.148.71.66` | ✅ HTTP 307 → /login |
| `http://8.148.71.66/login` | ✅ HTTP 200, 10KB |

## 注意事项

- Node.js 通过 nvm 安装，SSH 非交互 session 不加载 nvm PATH
- 需要 service / systemd / pm2 固化启动，当前 nohup 方式 SSH 断开后有存活但不够可靠
