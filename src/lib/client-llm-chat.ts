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
// Safe assistant content extraction
// ---------------------------------------------------------------------------

/**
 * OpenAI-compatible Chat Completions 响应中 assistant message 的结构。
 *
 * 不同模型/配置可能返回：
 * - content: string
 * - content: Array<{ type: "text"; text: string }>  (vision-capable 模型)
 * - reasoning_content: string  (Thinking/Reasoning 模型)
 * - refusal: string | null   (安全过滤拒答)
 * - finish_reason: "stop" | "length" | "content_filter" | ...
 */
interface OpenAiChoiceMessage {
    role?: string;
    content?: string | Array<{ type: string; text?: string }> | null;
    reasoning_content?: string | null;
    refusal?: string | null;
}

interface OpenAiChoice {
    finish_reason?: string | null;
    message?: OpenAiChoiceMessage | null;
}

interface OpenAiChatCompletionResponse {
    choices?: OpenAiChoice[] | null;
}

/** 内容提取结果 */
export interface ExtractedAssistantContent {
    /** 提取到的文本内容，空字符串表示没有有效内容 */
    content: string;
    /** 是否存在 reasoning_content */
    hasReasoningContent: boolean;
    /** 模型是否拒答 */
    refused: boolean;
    /** finish_reason 值 */
    finishReason: string | null;
    /** 诊断摘要（不含敏感信息） */
    diagnosticSummary: string;
}

/**
 * 从 OpenAI-compatible Chat Completions 响应中安全提取 assistant content。
 *
 * 支持三种 content 形态：
 * 1. 纯字符串 → 直接返回
 * 2. 数组 text parts → 提取拼接所有 type==="text" 的 text
 * 3. null/空 → 返回空字符串，并记录诊断信息
 *
 * 不做 XML 解析。不打印 Authorization / API Key / 完整 body。
 */
export function extractAssistantContent(
    data: OpenAiChatCompletionResponse,
): ExtractedAssistantContent {
    const choices = data.choices;

    // 无 choices
    if (!choices || choices.length === 0) {
        return {
            content: "",
            hasReasoningContent: false,
            refused: false,
            finishReason: null,
            diagnosticSummary: "choices 数组为空",
        };
    }

    const choice = choices[0];
    const message = choice?.message;
    const finishReason = choice?.finish_reason ?? null;

    // 模型拒答（安全过滤）
    if (message?.refusal) {
        const snippet = message.refusal.length > 200
            ? message.refusal.substring(0, 200) + "…"
            : message.refusal;
        return {
            content: "",
            hasReasoningContent: typeof message.reasoning_content === "string" && message.reasoning_content.length > 0,
            refused: true,
            finishReason,
            diagnosticSummary: `模型拒答：${snippet}`,
        };
    }

    // 提取 reasoning_content 是否存在
    const hasReasoningContent =
        typeof message?.reasoning_content === "string" &&
        message.reasoning_content.length > 0;

    // 提取 content
    const rawContent = message?.content;

    // content 为 null / undefined
    if (rawContent == null) {
        const parts: string[] = [];
        if (hasReasoningContent) {
            parts.push("message.reasoning_content 存在但 message.content 为 null");
        } else {
            parts.push("message.content 为 null");
        }
        if (finishReason === "length") {
            parts.push("finish_reason=length（输出可能被截断）");
        }
        return {
            content: "",
            hasReasoningContent,
            refused: false,
            finishReason,
            diagnosticSummary: parts.join("；"),
        };
    }

    // content 为字符串
    if (typeof rawContent === "string") {
        const trimmed = rawContent.trim();
        const parts: string[] = [];
        if (trimmed.length === 0) {
            if (hasReasoningContent) {
                parts.push("message.content 为空字符串但 reasoning_content 存在");
            } else {
                parts.push("message.content 为空字符串");
            }
            if (finishReason === "length") {
                parts.push("finish_reason=length（输出可能被截断）");
            }
        }
        return {
            content: trimmed,
            hasReasoningContent,
            refused: false,
            finishReason,
            diagnosticSummary: parts.join("；"),
        };
    }

    // content 为数组（vision-capable 模型返回格式）
    if (Array.isArray(rawContent)) {
        const texts = rawContent
            .filter((part): part is { type: string; text: string } =>
                part.type === "text" && typeof part.text === "string")
            .map(part => part.text);
        const merged = texts.join("").trim();
        const otherTypes = rawContent
            .filter(part => part.type !== "text")
            .map(part => part.type);
        const parts: string[] = [];
        if (otherTypes.length > 0) {
            parts.push(`content 数组含非 text 类型: [${otherTypes.join(", ")}]`);
        }
        if (merged.length === 0) {
            if (hasReasoningContent) {
                parts.push("text content 为空但 reasoning_content 存在");
            }
            if (finishReason === "length") {
                parts.push("finish_reason=length（输出可能被截断）");
            }
            if (parts.length === 0) {
                parts.push("content 数组中无 text 内容");
            }
        }
        return {
            content: merged,
            hasReasoningContent,
            refused: false,
            finishReason,
            diagnosticSummary: parts.join("；"),
        };
    }

    // 未知 content 类型
    return {
        content: "",
        hasReasoningContent,
        refused: false,
        finishReason,
        diagnosticSummary: `message.content 类型异常: ${typeof rawContent}`,
    };
}

/**
 * 根据 extractAssistantContent 的诊断结果构建用户可读的错误消息。
 */
function buildContentEmptyError(
    extracted: ExtractedAssistantContent,
    modelName?: string,
): ClientLlmError {
    const modelHint = modelName ? `（当前模型: ${modelName}）` : "";

    if (extracted.refused) {
        return new ClientLlmError(
            `模型拒绝回答${modelHint}。${extracted.diagnosticSummary}。请检查题目内容或更换模型后重试。`,
            "AI_RESPONSE_ERROR",
        );
    }

    if (extracted.hasReasoningContent) {
        return new ClientLlmError(
            `本机 LLM 没有返回最终答案内容。${modelHint}当前模型可能是 Thinking/Reasoning 模型，只返回了 reasoning_content（推理过程），没有返回最终 answer content。\n\n请换用普通对话模型（非 Thinking 版本），或在本机 LLM 设置中关闭推理模式后重试。`,
            "AI_RESPONSE_ERROR",
        );
    }

    if (extracted.finishReason === "length") {
        return new ClientLlmError(
            `本机 LLM 输出被截断${modelHint}。请降低题目长度或在本机 LLM 设置中增大 max_tokens 后重试。`,
            "AI_RESPONSE_ERROR",
        );
    }

    return new ClientLlmError(
        `本机 LLM 未返回有效内容${modelHint}。${extracted.diagnosticSummary || "请检查 Model 是否正确，或换用其他模型后重试。"}`,
        "AI_RESPONSE_ERROR",
    );
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

    let data: OpenAiChatCompletionResponse;
    try {
        data = await response.json();
    } catch {
        throw new ClientLlmError(
            "AI_RESPONSE_ERROR: 本机 LLM 返回非 JSON 格式",
            "AI_RESPONSE_ERROR",
        );
    }

    // 使用安全提取函数
    const extracted = extractAssistantContent(data);

    if (extracted.refused) {
        throw buildContentEmptyError(extracted, config.model);
    }

    // 第一次尝试：content 为空但有 reasoning_content → 自动重试
    if (extracted.content.length === 0 && extracted.hasReasoningContent) {
        // 构建重试 messages：追加一条 user 消息要求模型输出最终答案
        const retryMessages = [
            ...messages,
            {
                role: "user" as const,
                content: "请直接输出最终答案和解析内容（放在 message.content 中），不要输出推理过程（reasoning_content）。严格按照 XML 标签格式输出。",
            },
        ];

        let retryResponse: Response;
        try {
            retryResponse = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model: config.model,
                    messages: retryMessages,
                    max_tokens: 8192,
                }),
                credentials: "omit",
            });
        } catch {
            // 重试网络错误：直接给用户明确提示
            throw buildContentEmptyError(extracted, config.model);
        }

        if (retryResponse.ok) {
            let retryData: OpenAiChatCompletionResponse;
            try {
                retryData = await retryResponse.json();
            } catch {
                throw buildContentEmptyError(extracted, config.model);
            }

            const retryExtracted = extractAssistantContent(retryData);

            if (retryExtracted.refused) {
                throw buildContentEmptyError(retryExtracted, config.model);
            }

            if (retryExtracted.content.length > 0) {
                // 重试成功，使用新 content
                return parseReanswerXmlResponse(retryExtracted.content);
            }

            // 重试仍然无 content → 抛出原始诊断错误
            throw buildContentEmptyError(
                retryExtracted.hasReasoningContent ? retryExtracted : extracted,
                config.model,
            );
        }

        // 重试 HTTP 错误 → 抛出原始诊断
        throw buildContentEmptyError(extracted, config.model);
    }

    if (extracted.content.length === 0) {
        throw buildContentEmptyError(extracted, config.model);
    }

    // Parse the XML response using the shared parser from TASK-031B
    return parseReanswerXmlResponse(extracted.content);
}

// ---------------------------------------------------------------------------
// Image analyze (client-side, browser-only)
// ---------------------------------------------------------------------------

export interface ClientAnalyzeInput {
    imageBase64: string;
    /** Optional MIME type, e.g. "image/png". Only used when imageBase64 is raw. */
    mimeType?: string;
}

const ANALYZE_IMAGE_SYSTEM_PROMPT = `你是一位专业的考试题目识别专家。用户为你提供一张题目图片，请你快速识别题目并给出最终答案。

请使用简体中文作答。

你的响应输出必须严格遵循以下自定义 XML 标签格式。严禁使用 JSON 或 Markdown 代码块。

<question_text>
在此处填写题目的完整文本。使用 Markdown 格式。数学公式使用 LaTeX（行内 $...$，块级 $$...$$）。
如果图片中有表格，用 Markdown 表格语法转录。
</question_text>

<question_type>
判断题型并填写以下值之一：CHOICE（选择题）、FILL_BLANK（填空题）、CALCULATION（计算题）、PROOF（证明题）、OTHER（其他）。
只输出枚举值，不要输出中文。
</question_type>

<answer_text>
在此处填写正确答案。
- 选择题：只给选项字母（如 "B"），必要时加一句话解释
- 填空题：只给填空内容
- 计算题：只给最终结果，必要时带单位
- 判断题：只给"正确"或"错误"
- 简答题：1-3 条极简答案要点
- 证明题：给结论和关键依据，不写完整证明
使用 Markdown 和 LaTeX 符号。
</answer_text>

<analysis>
留空。不要输出任何解析、推导、步骤、说明。字段必须存在，但内容为空。
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
1. 必须严格包含上述 11 个 XML 标签，不要输出其他内容。
2. 纯文本内容，不要转义反斜杠。
3. 只输出题目识别和最终答案，不要写任何解析、推导、步骤、解释。
4. <analysis> 标签必须存在但内容为空字符串。
5. <question_type> 必须精确给出枚举值。
6. 这是快速模式，优先速度而非详细程度。`;

function buildClientAnalyzeMessages(input: {
    imageDataUrl: string;
}): Array<{ role: "system" | "user"; content: unknown }> {
    return [
        { role: "system", content: ANALYZE_IMAGE_SYSTEM_PROMPT },
        {
            role: "user",
            content: [
                { type: "text", text: "请快速识别图片中的题目，只写题目文本和最终答案，不要写解析步骤。" },
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

    let data: OpenAiChatCompletionResponse;
    try {
        data = await response.json();
    } catch {
        throw new ClientLlmError(
            "AI_RESPONSE_ERROR: 本机 LLM 返回非 JSON 格式",
            "AI_RESPONSE_ERROR",
        );
    }

    const extracted = extractAssistantContent(data);

    if (extracted.refused) {
        throw buildContentEmptyError(extracted, config.model);
    }

    if (extracted.content.length === 0) {
        throw buildContentEmptyError(extracted, config.model);
    }

    // Parse the XML response
    try {
        return parseAnalyzeXmlResponse(extracted.content);
    } catch (parseError: unknown) {
        const message =
            parseError instanceof Error ? parseError.message : String(parseError);

        // ---- diagnostic log (safe, no API key / image data) ----
        const isDev = typeof window !== "undefined" &&
            window.location.hostname === "localhost";
        if (isDev) {
            const xmlTags = {
                hasQuestionText: extracted.content.includes("<question_text>"),
                hasAnswerText: extracted.content.includes("<answer_text>"),
                hasAnalysis: extracted.content.includes("<analysis>"),
                hasKnowledgePoints: extracted.content.includes("<knowledge_points>"),
                hasSubject: extracted.content.includes("<subject>"),
                hasRequiresImage: extracted.content.includes("<requires_image>"),
                hasWrongAnswerText: extracted.content.includes("<wrong_answer_text>"),
                hasMistakeStatus: extracted.content.includes("<mistake_status>"),
                hasMistakeAnalysis: extracted.content.includes("<mistake_analysis>"),
            };
            console.warn("[diagnostic] parseAnalyzeXmlResponse failed", {
                contentLength: extracted.content.length,
                contentStart: extracted.content.substring(0, 300),
                xmlTags,
                model: config.model,
                parseError: message,
            });
        }

        if (message.includes("AI_RESPONSE_ERROR")) {
            throw new ClientLlmError(message, "AI_RESPONSE_ERROR");
        }
        throw new ClientLlmError(
            `AI_RESPONSE_ERROR: 本机 LLM 返回格式异常`,
            "AI_RESPONSE_ERROR",
        );
    }
}
