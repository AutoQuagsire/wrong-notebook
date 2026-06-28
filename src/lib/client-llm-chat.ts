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
        return new ClientLlmError("AI_CONNECTION_FAILED: 无法连接本机 LLM，请检查 Base URL 或 CORS 设置", "AI_CONNECTION_FAILED");
    }
    if (msg.includes("empty response") || msg.includes("parse") || msg.includes("xml") || msg.includes("tag")) {
        return new ClientLlmError("AI_RESPONSE_ERROR: 本机 LLM 返回格式异常", "AI_RESPONSE_ERROR");
    }

    return new ClientLlmError(`AI_UNKNOWN_ERROR: 本机 LLM 调用失败`, "AI_UNKNOWN_ERROR");
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

    const baseUrl = config.baseUrl.replace(/\/+$/, "");
    const url = `${baseUrl}/chat/completions`;

    const messages = buildClientReanswerMessages({
        questionText: input.questionText,
    });

    let response: Response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                "Content-Type": "application/json",
            },
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
        throw new ClientLlmError(
            `AI 服务返回 HTTP ${response.status}`,
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
