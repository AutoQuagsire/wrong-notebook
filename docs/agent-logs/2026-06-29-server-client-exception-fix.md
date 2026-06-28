# 生产服务器 client-side exception 修复

**时间**: 2026-06-29
**状态**: 已修复

## 根因

Next.js standalone 构建的 `.next/standalone/.next/` 目录**缺少 `static/` 文件夹**。

```
/var/www/wrong-notebook/.next/static/          ← 存在（4.4MB，31 chunks）
/var/www/wrong-notebook/.next/standalone/.next/static/  ← 不存在！
```

Next.js standalone 构建时 `outputFileTracing` 只跟踪服务端依赖，不会自动复制 `static/` 客户端资源。但 Next.js 16 standalone 模式运行时，静态资源查找路径是 standalone 的 `.next/` 目录。缺少 `static/` → 所有 JS/CSS 返回 404 → 浏览器报 client-side exception。

| 页面 | 修复前 JS 资源 | 修复后 |
|------|----------------|--------|
| /login | HTTP 404（chunks） | HTTP 200 |
| /register | HTTP 404（chunks） | HTTP 200 |
| / | HTTP 307（正常重定向） | HTTP 307 |

## 解决

```bash
cp -r /var/www/wrong-notebook/.next/static /var/www/wrong-notebook/.next/standalone/.next/
systemctl restart wrong-notebook
```

## 系统状态

| 组件 | 结果 |
|------|------|
| systemd `wrong-notebook.service` | ✅ enabled, active |
| 3000 端口 | ✅ next-server 监听 |
| 全部 static chunks | ✅ HTTP 200 |
| /login | ✅ HTTP 200 |
| /register | ✅ HTTP 200 |

## 重要

Next.js `output: 'standalone'` 构建后，`static/` 目录需要手动复制或通过部署脚本同步到
`.next/standalone/.next/static/`。后续部署时需要注意这个步骤。
