/**
 * 用户本机 LLM 代理 (CORS / NAT helper)
 *
 * 用途：浏览器的 wrong-notebook 页面直连第三方 LLM 时如果被 CORS 阻止，
 *       在用户本机启动此代理，浏览器请求本机代理，代理转发到外部 LLM。
 *
 * 监听: http://127.0.0.1:PORT/v1/chat/completions
 * 转发: ${PROVIDER_BASE_URL}/chat/completions
 *
 * API Key 只在本机 .env 文件中，不会上传 wrong-notebook 服务器。
 *
 * 使用: cp .env.example .env → 编辑 .env → npm start
 */

import { createServer } from "node:http";

// ---------------------------------------------------------------------------
// 从环境变量加载配置
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || "8787", 10);
const PROVIDER_BASE_URL = (process.env.PROVIDER_BASE_URL || "").replace(/\/+$/, "");
const PROVIDER_API_KEY = process.env.PROVIDER_API_KEY || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:3000";

if (!PROVIDER_BASE_URL) {
    console.error("[proxy] PROVIDER_BASE_URL 未设置，请在 .env 中配置");
    process.exit(1);
}

if (!PROVIDER_API_KEY) {
    console.error("[proxy] PROVIDER_API_KEY 未设置，请在 .env 中配置");
    process.exit(1);
}

// ---------------------------------------------------------------------------
// 安全常量
// ---------------------------------------------------------------------------

const MAX_BODY_SIZE = 15 * 1024 * 1024; // 15 MB
const VALID_PATH = "/v1/chat/completions";
const PROVIDER_URL = `${PROVIDER_BASE_URL}/chat/completions`;

// ---------------------------------------------------------------------------
// 日志（不打印 API Key）
// ---------------------------------------------------------------------------

function log(method: string, status: number, detail?: string) {
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
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "86400",
        });
        res.end();
        return;
    }

    // --- 只接受 /v1/chat/completions ---
    if (req.method !== "POST" || req.url !== VALID_PATH) {
        log(req.method || "?", 404, req.url || "");
        res.writeHead(404, {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        });
        res.end(JSON.stringify({ error: "Not found. 仅支持 POST /v1/chat/completions" }));
        return;
    }

    // --- 读取请求体 ---
    let body = "";
    let bodySize = 0;

    try {
        for await (const chunk of req) {
            bodySize += chunk.length;
            if (bodySize > MAX_BODY_SIZE) {
                log("POST", 413, `body too large (${(bodySize / 1024 / 1024).toFixed(1)}MB)`);
                res.writeHead(413, {
                    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
                });
                res.end(JSON.stringify({ error: "请求体过大，最大支持 15MB" }));
                return;
            }
            body += chunk.toString();
        }
    } catch {
        log("POST", 400, "body read error");
        res.writeHead(400, {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        });
        res.end(JSON.stringify({ error: "无法读取请求体" }));
        return;
    }

    // --- 转发到 provider ---
    const startMs = Date.now();
    try {
        const providerResponse = await fetch(PROVIDER_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${PROVIDER_API_KEY}`,
                "Content-Type": "application/json",
            },
            body,
        });

        const responseText = await providerResponse.text();
        const duration = Date.now() - startMs;

        log(
            "POST",
            providerResponse.status,
            `→ ${PROVIDER_BASE_URL}  body=${(bodySize / 1024).toFixed(0)}KB  resp=${(responseText.length / 1024).toFixed(0)}KB  ${duration}ms`
        );

        res.writeHead(providerResponse.status, {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Content-Type": "application/json",
        });
        res.end(responseText);
    } catch (err) {
        const duration = Date.now() - startMs;
        const message = err instanceof Error ? err.message : String(err);
        log("POST", 502, `provider unreachable  ${duration}ms`);

        res.writeHead(502, {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Content-Type": "application/json",
        });
        res.end(
            JSON.stringify({
                error: `无法连接目标 LLM 服务 (${PROVIDER_BASE_URL})。请检查 .env 配置和网络连接。`,
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
    console.log(`[proxy] 转发: ${PROVIDER_URL}`);
    console.log(`[proxy] 允许 CORS: ${ALLOWED_ORIGIN}`);
    console.log(`[proxy] API Key 存在: ${PROVIDER_API_KEY ? "是" : "否"}`);
    console.log(`[proxy] 按 Ctrl+C 停止`);
});
