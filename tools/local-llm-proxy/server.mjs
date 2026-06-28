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
const MAX_BODY_BYTES = parseInt(process.env.MAX_BODY_BYTES || "15728640", 10); // 15 MB

// 支持多个 Origin：优先读 ALLOWED_ORIGINS（逗号分隔），回退到 ALLOWED_ORIGIN
const originsRaw = process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || "";
const ALLOWED_ORIGINS = originsRaw
    .split(",")
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });

// 检测 .env 是否被加载：如果没有环境变量传入，说明用户可能直接运行了 node server.mjs
const envLoaded = !!(process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN);

// ---------------------------------------------------------------------------
// 安全常量
// ---------------------------------------------------------------------------

const VALID_PATH = "/v1/chat/completions";

// ---------------------------------------------------------------------------
// 日志（不打印 API Key、Authorization、图片 base64）
// ---------------------------------------------------------------------------

function log(method, status, detail) {
    var ts = new Date().toISOString().slice(11, 19);
    var parts = [ts, method, String(status)];
    if (detail) parts.push(detail);
    console.log(parts.join("  "));
}

/**
 * 检查请求 Origin 是否在允许列表中，返回匹配的 Origin 或 null。
 */
function getAllowedOrigin(requestOrigin) {
    if (!requestOrigin) return null;
    for (var i = 0; i < ALLOWED_ORIGINS.length; i++) {
        if (requestOrigin === ALLOWED_ORIGINS[i]) return requestOrigin;
    }
    return null;
}

/**
 * 构建 CORS 响应头（动态匹配 Origin + Private Network Access）。
 */
function buildCorsHeaders(requestOrigin) {
    var h = {
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Provider-Base-URL",
        "Access-Control-Max-Age": "86400",
        "Access-Control-Allow-Private-Network": "true",
        "Vary": "Origin",
    };
    var matched = getAllowedOrigin(requestOrigin);
    if (matched) {
        h["Access-Control-Allow-Origin"] = matched;
    } else {
        // 仍返回第一个允许的 Origin，浏览器会拒收不匹配的（安全）
        h["Access-Control-Allow-Origin"] = ALLOWED_ORIGINS[0];
    }
    return h;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

var server = createServer(async function (req, res) {
    var requestOrigin = req.headers["origin"] || "";

    // --- CORS 预检请求 ---
    if (req.method === "OPTIONS") {
        var corsHeaders = buildCorsHeaders(requestOrigin);
        var isPna = req.headers["access-control-request-private-network"] === "true";
        if (isPna) {
            corsHeaders["Access-Control-Allow-Private-Network"] = "true";
            log("OPTS", 204, "PNA preflight  origin=" + requestOrigin);
        }
        res.writeHead(204, corsHeaders);
        res.end();
        return;
    }

    // --- 健康检查 GET /health ---
    if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, Object.assign({}, buildCorsHeaders(requestOrigin), {
            "Content-Type": "application/json",
        }));
        res.end(JSON.stringify({
            ok: true,
            service: "local-llm-proxy",
            allowedOrigins: ALLOWED_ORIGINS.slice(),
            maxBodyBytes: MAX_BODY_BYTES,
            pna: true,
            envLoaded: envLoaded,
        }));
        return;
    }

    // --- 只接受 POST /v1/chat/completions ---
    if (req.method !== "POST" || req.url !== VALID_PATH) {
        log(req.method || "?", 404, req.url || "");
        res.writeHead(404, buildCorsHeaders(requestOrigin));
        res.end(JSON.stringify({ error: "Not found. 仅支持 POST /v1/chat/completions" }));
        return;
    }

    // --- 读取 provider target ---
    var providerBaseUrlRaw = req.headers["x-provider-base-url"];
    if (!providerBaseUrlRaw) {
        res.writeHead(400, buildCorsHeaders(requestOrigin));
        res.end(JSON.stringify({ error: "缺少 X-Provider-Base-URL 请求头" }));
        return;
    }
    var providerBaseUrl = String(providerBaseUrlRaw).trim().replace(/\/+$/, "");
    if (!providerBaseUrl.startsWith("http://") && !providerBaseUrl.startsWith("https://")) {
        res.writeHead(400, buildCorsHeaders(requestOrigin));
        res.end(JSON.stringify({ error: "X-Provider-Base-URL 必须以 http:// 或 https:// 开头" }));
        return;
    }
    var providerUrl = providerBaseUrl + "/chat/completions";

    // --- 读取请求体 ---
    var body = "";
    var bodySize = 0;

    try {
        for await (var chunk of req) {
            bodySize += chunk.length;
            if (bodySize > MAX_BODY_BYTES) {
                log("POST", 413, providerBaseUrl + "  too large");
                res.writeHead(413, buildCorsHeaders(requestOrigin));
                res.end(JSON.stringify({ error: "请求体过大，最大支持 15MB" }));
                return;
            }
            body += chunk.toString();
        }
    } catch {
        log("POST", 400, providerBaseUrl + "  read error");
        res.writeHead(400, buildCorsHeaders(requestOrigin));
        res.end(JSON.stringify({ error: "无法读取请求体" }));
        return;
    }

    // --- 转发到 provider ---
    var startMs = Date.now();
    var forwardHeaders = { "Content-Type": "application/json" };

    // 原样转发 Authorization
    var authHeader = req.headers["authorization"];
    if (authHeader) {
        forwardHeaders["Authorization"] = String(authHeader);
    }

    try {
        var providerResponse = await fetch(providerUrl, {
            method: "POST",
            headers: forwardHeaders,
            body: body,
        });

        var responseText = await providerResponse.text();
        var duration = Date.now() - startMs;

        log(
            "POST",
            providerResponse.status,
            providerBaseUrl + "  body=" + (bodySize / 1024).toFixed(0) + "KB  resp=" + (responseText.length / 1024).toFixed(0) + "KB  " + duration + "ms"
        );

        res.writeHead(providerResponse.status, Object.assign({}, buildCorsHeaders(requestOrigin), {
            "Content-Type": "application/json",
        }));
        res.end(responseText);
    } catch (err) {
        var duration2 = Date.now() - startMs;
        var message = err instanceof Error ? err.message : String(err);
        log("POST", 502, providerBaseUrl + "  unreachable  " + duration2 + "ms");

        res.writeHead(502, buildCorsHeaders(requestOrigin));
        res.end(
            JSON.stringify({
                error: "无法连接目标 LLM 服务 (" + providerBaseUrl + ")。请检查网络连接。",
                detail: message,
            })
        );
    }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

server.listen(PORT, "127.0.0.1", function () {
    console.log("[proxy] 本机 LLM 代理已启动");
    console.log("[proxy] 监听: http://127.0.0.1:" + PORT + VALID_PATH);
    console.log("[proxy] 健康检查: http://127.0.0.1:" + PORT + "/health");

    if (!envLoaded) {
        console.log("[proxy] ╔══════════════════════════════════════════════════════╗");
        console.log("[proxy] ║  WARNING: 未检测到 ALLOWED_ORIGINS / ALLOWED_ORIGIN  ║");
        console.log("[proxy] ║  请使用 npm start 启动代理，确保 .env 被加载。       ║");
        console.log("[proxy] ║  不要直接运行 node server.mjs，                     ║");
        console.log("[proxy] ║  除非你手动设置了环境变量。                        ║");
        console.log("[proxy] ╚══════════════════════════════════════════════════════╝");
        console.log("[proxy] 允许 CORS Origins: (无) — 请求可能全部被拒绝");
    } else {
        console.log("[proxy] 允许 CORS Origins: " + ALLOWED_ORIGINS.join(", "));
    }

    console.log("[proxy] Private Network Access: enabled");
    console.log("[proxy] 最大请求体: " + (MAX_BODY_BYTES / 1024 / 1024).toFixed(0) + " MB");
    console.log("[proxy] 按 Ctrl+C 停止");
});
