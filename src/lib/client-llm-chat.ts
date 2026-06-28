/**
 * 本机 LLM 调用模块 —— 纯客户端，直连用户填写的 Base URL。
 *
 * 不经过 wrong-notebook 后端。不访问数据库。不读取服务端配置。
 */

import {
    type ClientLlmConfig,
    loadLlmConfig,
    hasCompleteConfig,
} from "@/lib/client-llm-config";
import type { ReanswerQuestionResult } from "@/lib/ai/types";
import { parseReanswerXmlResponse } from "@/lib/ai/reanswer-parser";
import { buildClientReanswerMessages } from "@/lib/ai/client-reanswer-prompt";

// ---------------------------------------------------------------------------
// Proxy health check
// ---------------------------------------------------------------------------

export interface ProxyHealthResult {
    ok: boolean;
    allowedOrigins: string[];
    currentOriginAllowed: boolean;
    pna?: boolean;
    envLoaded?: boolean;
    error?: string;
}

/**
 * 检查本机代理是否可用。
 *
 * 请求代理的 GET /health，不发送 API Key、Authorization、X-Provider-Base-URL。
 *
 * URL 拼接规则：proxyUrl 结尾的 /v1 或 /v1/ 会被替换为 /health。
 * 例如 http://127.0.0.1:8787/v1 → http://127.0.0.1:8787/health
 */
export async function checkLocalProxyHealth(proxyUrl: string): Promise<ProxyHealthResult> {
    // 去掉末尾的 /v1 或 /v1/，确保拼成正确的 /health URL
    const clean = proxyUrl.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
    const healthUrl = clean + "/health";
    const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";

    let response: Response;
    try {
        response = await fetch(healthUrl, {
            method: "GET",
            credentials: "omit",
        });
    } catch {
        return {
            ok: false,
            allowedOrigins: [],
            currentOriginAllowed: false,
            error: "LOCAL_PROXY_UNAVAILABLE",
        };
    }

    if (!response.ok) {
        return {
            ok: false,
            allowedOrigins: [],
            currentOriginAllowed: false,
            error: "LOCAL_PROXY_UNAVAILABLE",
        };
    }

    let data: {
        ok?: boolean;
        allowedOrigins?: string[];
        pna?: boolean;
        envLoaded?: boolean;
    };
    try {
        data = await response.json();
    } catch {
        return {
            ok: false,
            allowedOrigins: [],
            currentOriginAllowed: false,
            error: "LOCAL_PROXY_UNAVAILABLE",
        };
    }

    const origins: string[] = Array.isArray(data.allowedOrigins) ? data.allowedOrigins : [];
    const currentAllowed = currentOrigin
        ? origins.indexOf(currentOrigin) !== -1
        : false;

    return {
        ok: data.ok === true,
        allowedOrigins: origins,
        currentOriginAllowed: currentAllowed,
        pna: data.pna,
        envLoaded: data.envLoaded,
    };
}

// ---------------------------------------------------------------------------
// Error classification (mirrors server-side error codes for consistent UI)
// ---------------------------------------------------------------------------

export class ClientLlmError extends Error {
    constructor(
        message: string,
        public readonly errorCode: string,
    ) {
        super(message);
        this.name = "ClientLlmError";
    }
}

function classifyError(error: unknown): ClientLlmError {
    if (error instanceof ClientLlmError) return error;

    const msg = error instanceof Error ? error.message.toLowerCase() : String(error);

    if (msg.includes("401") || msg.includes("unauthorized")) {
        return new ClientLlmError("AI_AUTH_ERROR: 本机 LLM API Key 无效", "AI_AUTH_ERROR");
    }
    if (msg.includes("403") || msg.includes("forbidden") || msg.includes("permission")) {
        return new ClientLlmError("AI_PERMISSION_DENIED: 本机 LLM 权限不足", "AI_PERMISSION_DENIED");
    }
    if (msg.includes("404") || msg.includes("not found")) {
        return new ClientLlmError("AI_NOT_FOUND: 本机 LLM Base URL 或模型不存在", "AI_NOT_FOUND");
    }
    if (msg.includes("408") || msg.includes("timeout") || msg.includes("abort")) {
        return new ClientLlmError("AI_TIMEOUT_ERROR: 本机 LLM 请求超时", "AI_TIMEOUT_ERROR");
    }
    if (msg.includes("429") || msg.includes("too many") || msg.includes("rate limit")) {
        return new ClientLlmError("AI_QUOTA_EXCEEDED: 本机 LLM 请求频率过高", "AI_QUOTA_EXCEEDED");
    }
    if (msg.includes("5") && (msg.includes("server") || msg.includes("service") || msg.includes("unavailable"))) {
        return new ClientLlmError("AI_SERVICE_UNAVAILABLE: 本机 LLM 服务不可用", "AI_SERVICE_UNAVAILABLE");
    }
    if (msg.includes("fetch") && (msg.includes("failed") || msg.includes("network") || msg.includes("connect"))) {
        return new ClientLlmError(
            "AI_CONNECTION_FAILED: 无法从浏览器连接本机 LLM。请检查 Base URL 是否正确，以及该服务是否允许浏览器 CORS 请求。若服务不支持浏览器跨域，请使用本机代理。",
            "AI_CONNECTION_FAILED",
        );
    }
    if (msg.includes("empty response") || msg.includes("parse") || msg.includes("xml") || msg.includes("tag")) {
        return new ClientLlmError("AI_RESPONSE_ERROR: 本机 LLM 返回格式异常", "AI_RESPONSE_ERROR");
    }

    return new ClientLlmError(`AI_UNKNOWN_ERROR: 本机 LLM 调用失败`, "AI_UNKNOWN_ERROR");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * 安全读取 HTTP 错误响应 body，截断到 maxChars。
 * 不读取 Authorization header。不读取 API Key。
 */
async function safeReadErrorBody(response: Response, maxChars = 500): Promise<string> {
    try {
        const text = await response.text();
        return text.length > maxChars ? text.substring(0, maxChars) + "…" : text;
    } catch {
        return "(无法读取响应内容)";
    }
}

/**
 * 将 imageBase64 规范化成 data URL。
 * 如果已经是 data:image/ 开头则直接返回，否则拼接前缀。
 */
function toImageDataUrl(imageBase64: string, mimeType?: string): string {
    if (imageBase64.startsWith("data:image/")) {
        return imageBase64;
    }
    const mt = mimeType || "image/jpeg";
    return `data:${mt};base64,${imageBase64}`;
}

/** 图片 base64 长度安全上限（约 6MB 压缩后） */
const MAX_IMAGE_BASE64_LENGTH = 8_000_000;

/** 判断 HTTP 400 body 是否暗示模型不支持 vision */
function looksLikeVisionUnsupported(body: string): boolean {
    const lower = body.toLowerCase();
    const keywords = [
        "image", "vision", "modal", "multimodal",
        "unsupported", "invalid_type", "invalid_request",
        "content", "message", "type",
    ];
    return keywords.some(kw => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// Centralized request construction
// ---------------------------------------------------------------------------

interface ChatCompletionsRequest {
    url: string;
    headers: Record<string, string>;
}

/**
 * 根据配置决定请求 URL 和 headers。
 *
 * 直连模式:   POST {baseUrl}/chat/completions
 *              Authorization: Bearer <apiKey>
 *
 * 代理模式:    POST {proxyUrl}/chat/completions
 *              Authorization: Bearer <apiKey>
 *              X-Provider-Base-URL: <baseUrl>
 */
function buildChatCompletionsRequest(config: ClientLlmConfig): ChatCompletionsRequest {
    const apiKey = config.apiKey || "";

    if (config.proxyEnabled && typeof config.proxyUrl === "string" && config.proxyUrl.trim().length > 0) {
        const proxyUrl = config.proxyUrl.trim().replace(/\/+$/, "");
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "X-Provider-Base-URL": config.baseUrl.trim().replace(/\/+$/, ""),
        };
        if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
        }
        return { url: `${proxyUrl}/chat/completions`, headers };
    }

    // Direct mode
    const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
    }
    return { url: `${baseUrl}/chat/completions`, headers };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ClientReanswerInput {
    questionText: string;
}

/**
 * 使用本机 LLM 重新解题。
 *
 * 流程：
 * 1. 从 loadLlmConfig() 读取配置。
 * 2. 校验 enabled + baseUrl + model + apiKey。
 * 3. 浏览器直连用户 Base URL POST /chat/completions。
 * 4. 使用 parseReanswerXmlResponse() 解析响应。
 */
export async function clientReanswerQuestion(
    input: ClientReanswerInput,
): Promise<ReanswerQuestionResult> {
    const config: ClientLlmConfig = loadLlmConfig();

    if (!config.enabled) {
        throw new ClientLlmError(
            "本机 LLM 未启用。请在设置中启用后重试。",
            "AI_NOT_CONFIGURED",
        );
    }

    if (!hasCompleteConfig(config)) {
        throw new ClientLlmError(
            "本机 LLM 配置不完整。请前往设置页补全 Base URL / Model / API Key。",
            "AI_CONFIG_INCOMPLETE",
        );
    }

    const { url, headers } = buildChatCompletionsRequest(config);

    const messages = buildClientReanswerMessages({
        questionText: input.questionText,
    });

    let response: Response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: config.model,
                messages,
                max_tokens: 8192,
            }),
            credentials: "omit",
        });
    } catch (fetchError: unknown) {
        // Network-level error (CORS, DNS, etc.)
        throw classifyError(fetchError);
    }

    if (!response.ok) {
        const bodySnippet = await safeReadErrorBody(response);
        throw new ClientLlmError(
            `AI 服务返回 HTTP ${response.status}：${bodySnippet}`,
            classifyError(new Error(String(response.status))).errorCode,
        );
    }

    let data: { choices?: Array<{ message?: { content?: string } }> };
    try {
        data = await response.json();
    } catch {
        throw new ClientLlmError(
            "AI_RESPONSE_ERROR: 本机 LLM 返回非 JSON 格式",
            "AI_RESPONSE_ERROR",
        );
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content || content.trim().length === 0) {
        throw new ClientLlmError(
            "AI_RESPONSE_ERROR: 本机 LLM 返回内容为空",
            "AI_RESPONSE_ERROR",
        );
    }

    // Parse the XML response using the shared parser from TASK-031B
    return parseReanswerXmlResponse(content);
}

// ---------------------------------------------------------------------------
// Image analyze (client-side, browser-only)
// ---------------------------------------------------------------------------

export interface ClientAnalyzeInput {
    imageBase64: string;
    /** Optional MIME type, e.g. "image/png". Only used when imageBase64 is raw. */
    mimeType?: string;
}

const ANALYZE_IMAGE_SYSTEM_PROMPT = `你是一位专业的考试题目分析专家。用户为你提供一张题目图片，请你分析并给出完整解答。

请使用简体中文作答。

你的响应输出必须严格遵循以下自定义 XML 标签格式。严禁使用 JSON 或 Markdown 代码块。

<question_text>
在此处填写题目的完整文本。使用 Markdown 格式。数学公式使用 LaTeX（行内 $...$，块级 $$...$$）。
如果图片中有表格，用 Markdown 表格语法转录。
</question_text>

<answer_text>
在此处填写正确答案。使用 Markdown 和 LaTeX 符号。
</answer_text>

<analysis>
在此处填写详细步骤解析。使用简体中文。解析要清晰完整。公式使用行内 $...$、块级 $$...$$。
</analysis>

<knowledge_points>
在此处填写知识点，使用逗号分隔，最多 5 个，例如：知识点1, 知识点2
</knowledge_points>

<subject>
填写以下学科之一：数学, 物理, 化学, 生物, 英语, 语文, 历史, 地理, 政治, 其他
</subject>

<requires_image>
如果题目依赖图片（如几何图、函数图），填写 true；否则填写 false。
</requires_image>

<wrong_answer_text>
如果图片中有学生的错误解答，请摘录；没有则留空。
</wrong_answer_text>

<mistake_status>
填写以下值之一：wrong_attempt（有错误解答）、not_attempted（不会做）、unknown（无法判断）。
</mistake_status>

<mistake_analysis>
如果有错误解答，分析错误原因；没有则留空。
</mistake_analysis>

关键规则：
1. 必须严格包含上述 10 个 XML 标签，不要输出其他内容。
2. 纯文本内容，不要转义反斜杠。
3. 不要修改或重复题目，只提供识别、分析、答案。`;

function buildClientAnalyzeMessages(input: {
    imageDataUrl: string;
}): Array<{ role: "system" | "user"; content: unknown }> {
    return [
        { role: "system", content: ANALYZE_IMAGE_SYSTEM_PROMPT },
        {
            role: "user",
            content: [
                { type: "text", text: "请识别并解析图片中的题目。" },
                {
                    type: "image_url",
                    image_url: {
                        url: input.imageDataUrl,
                    },
                },
            ],
        },
    ];
}

/**
 * 使用本机 LLM 拍照识题。
 *
 * 返回 ParsedQuestion，与 /api/analyze 返回结构兼容。
 */
export async function clientAnalyzeImage(
    input: ClientAnalyzeInput,
): Promise<import("@/lib/ai").ParsedQuestion> {
    const { parseAnalyzeXmlResponse } = await import("@/lib/ai/analyze-parser");
    const config = loadLlmConfig();

    if (!config.enabled) {
        throw new ClientLlmError(
            "本机 LLM 未启用。请在设置中启用后重试。",
            "AI_NOT_CONFIGURED",
        );
    }

    if (!hasCompleteConfig(config)) {
        throw new ClientLlmError(
            "本机 LLM 配置不完整。请前往设置页补全 Base URL / Model / API Key。",
            "AI_CONFIG_INCOMPLETE",
        );
    }

    // 图片大小保护
    if (input.imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
        throw new ClientLlmError(
            "图片过大（超过 6MB），本机 LLM 拍照识题可能失败。请压缩图片或重新拍摄。",
            "AI_RESPONSE_ERROR",
        );
    }

    const imageDataUrl = toImageDataUrl(input.imageBase64, input.mimeType);

    const { url, headers } = buildChatCompletionsRequest(config);

    const messages = buildClientAnalyzeMessages({
        imageDataUrl,
    });

    let response: Response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: config.model,
                messages,
                max_tokens: 8192,
            }),
            credentials: "omit",
        });
    } catch (fetchError: unknown) {
        throw classifyError(fetchError);
    }

    if (!response.ok) {
        const bodySnippet = await safeReadErrorBody(response);

        // 检测 400 是否暗示模型不支持 vision
        if (response.status === 400 && looksLikeVisionUnsupported(bodySnippet)) {
            throw new ClientLlmError(
                `AI_RESPONSE_ERROR: 当前模型或网关可能不支持图片输入（image_url）。请换用支持视觉能力的模型，或使用支持 OpenAI-compatible vision 的代理。HTTP 400：${bodySnippet}`,
                "AI_RESPONSE_ERROR",
            );
        }

        throw new ClientLlmError(
            `AI 服务返回 HTTP ${response.status}：${bodySnippet}`,
            classifyError(new Error(String(response.status))).errorCode,
        );
    }

    let data: { choices?: Array<{ message?: { content?: string } }> };
    try {
        data = await response.json();
    } catch {
        throw new ClientLlmError(
            "AI_RESPONSE_ERROR: 本机 LLM 返回非 JSON 格式",
            "AI_RESPONSE_ERROR",
        );
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content || content.trim().length === 0) {
        throw new ClientLlmError(
            "AI_RESPONSE_ERROR: 本机 LLM 返回内容为空",
            "AI_RESPONSE_ERROR",
        );
    }

    // Parse the XML response
    try {
        return parseAnalyzeXmlResponse(content);
    } catch (parseError: unknown) {
        const message =
            parseError instanceof Error ? parseError.message : String(parseError);
        if (message.includes("AI_RESPONSE_ERROR")) {
            throw new ClientLlmError(message, "AI_RESPONSE_ERROR");
        }
        throw new ClientLlmError(
            `AI_RESPONSE_ERROR: 本机 LLM 返回格式异常`,
            "AI_RESPONSE_ERROR",
        );
    }
}
