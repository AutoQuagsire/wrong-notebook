/**
 * 用户本机 LLM 代理 (CORS helper) —— 无状态版本
 *
 * 用途：浏览器的 wrong-notebook 页面直连第三方 LLM 时如果被 CORS 阻止，
 *       在用户本机启动此代理，浏览器请求本机代理，代理转发到外部 LLM。
 *
 * 监听: http://127.0.0.1:PORT/v1/chat/completions
 *
 * 请求头约定：
 *   X-Provider-Base-URL: <外部 LLM Base URL>     （必填）
 *   Authorization: Bearer <用户 API Key>          （可选，原样转发）
 *
 * 本代理不保存任何 API Key。只做 CORS 转发。
 *
 * 使用: cp .env.example .env → 编辑 .env → npm start
 */

import { createServer } from "node:http";

// ---------------------------------------------------------------------------
// 从环境变量加载配置
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || "8787", 10);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:3000";
const MAX_BODY_BYTES = parseInt(process.env.MAX_BODY_BYTES || "15728640", 10); // 15 MB

// ---------------------------------------------------------------------------
// 安全常量
// ---------------------------------------------------------------------------

const VALID_PATH = "/v1/chat/completions";

// ---------------------------------------------------------------------------
// 日志（不打印 API Key、Authorization、图片 base64）
// ---------------------------------------------------------------------------

function log(method, status, detail) {
    const ts = new Date().toISOString().slice(11, 19);
    const parts = [ts, method, String(status)];
    if (detail) parts.push(detail);
    console.log(parts.join("  "));
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
    // --- CORS 预检请求 ---
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Provider-Base-URL",
            "Access-Control-Max-Age": "86400",
        });
        res.end();
        return;
    }

    // --- 只接受 POST /v1/chat/completions ---
    if (req.method !== "POST" || req.url !== VALID_PATH) {
        log(req.method || "?", 404, req.url || "");
        res.writeHead(404, { "Access-Control-Allow-Origin": ALLOWED_ORIGIN });
        res.end(JSON.stringify({ error: "Not found. 仅支持 POST /v1/chat/completions" }));
        return;
    }

    // --- 读取 provider target ---
    const providerBaseUrlRaw = req.headers["x-provider-base-url"];
    if (!providerBaseUrlRaw) {
        res.writeHead(400, { "Access-Control-Allow-Origin": ALLOWED_ORIGIN });
        res.end(JSON.stringify({ error: "缺少 X-Provider-Base-URL 请求头" }));
        return;
    }
    const providerBaseUrl = String(providerBaseUrlRaw).trim().replace(/\/+$/, "");
    if (!providerBaseUrl.startsWith("http://") && !providerBaseUrl.startsWith("https://")) {
        res.writeHead(400, { "Access-Control-Allow-Origin": ALLOWED_ORIGIN });
        res.end(JSON.stringify({ error: "X-Provider-Base-URL 必须以 http:// 或 https:// 开头" }));
        return;
    }
    const providerUrl = `${providerBaseUrl}/chat/completions`;

    // --- 读取请求体 ---
    let body = "";
    let bodySize = 0;

    try {
        for await (const chunk of req) {
            bodySize += chunk.length;
            if (bodySize > MAX_BODY_BYTES) {
                log("POST", 413, `${providerBaseUrl}  too large`);
                res.writeHead(413, { "Access-Control-Allow-Origin": ALLOWED_ORIGIN });
                res.end(JSON.stringify({ error: "请求体过大，最大支持 15MB" }));
                return;
            }
            body += chunk.toString();
        }
    } catch {
        log("POST", 400, `${providerBaseUrl}  read error`);
        res.writeHead(400, { "Access-Control-Allow-Origin": ALLOWED_ORIGIN });
        res.end(JSON.stringify({ error: "无法读取请求体" }));
        return;
    }

    // --- 转发到 provider ---
    const startMs = Date.now();
    const forwardHeaders = { "Content-Type": "application/json" };

    // 原样转发 Authorization
    const authHeader = req.headers["authorization"];
    if (authHeader) {
        forwardHeaders["Authorization"] = String(authHeader);
    }

    try {
        const providerResponse = await fetch(providerUrl, {
            method: "POST",
            headers: forwardHeaders,
            body,
        });

        const responseText = await providerResponse.text();
        const duration = Date.now() - startMs;

        log(
            "POST",
            providerResponse.status,
            `${providerBaseUrl}  body=${(bodySize / 1024).toFixed(0)}KB  resp=${(responseText.length / 1024).toFixed(0)}KB  ${duration}ms`
        );

        res.writeHead(providerResponse.status, {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Content-Type": "application/json",
        });
        res.end(responseText);
    } catch (err) {
        const duration = Date.now() - startMs;
        const message = err instanceof Error ? err.message : String(err);
        log("POST", 502, `${providerBaseUrl}  unreachable  ${duration}ms`);

        res.writeHead(502, {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Content-Type": "application/json",
        });
        res.end(
            JSON.stringify({
                error: `无法连接目标 LLM 服务 (${providerBaseUrl})。请检查网络连接。`,
                detail: message,
            })
        );
    }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

server.listen(PORT, "127.0.0.1", () => {
    console.log(`[proxy] 本机 LLM 代理已启动`);
    console.log(`[proxy] 监听: http://127.0.0.1:${PORT}${VALID_PATH}`);
    console.log(`[proxy] 允许 CORS: ${ALLOWED_ORIGIN}`);
    console.log(`[proxy] 最大请求体: ${(MAX_BODY_BYTES / 1024 / 1024).toFixed(0)} MB`);
    console.log(`[proxy] 按 Ctrl+C 停止`);
});
