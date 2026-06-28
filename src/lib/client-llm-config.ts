"use client";

/**
 * 本机 LLM 配置模块 —— 纯客户端存储，不上传服务器。
 *
 * 存储模型：
 * - session memory: 当前页面会话可用，刷新后丢失
 * - localStorage:   仅当 remember=true 时写入当前浏览器
 *
 * 安全约束：
 * - 禁止在 server component / API route 中导入
 * - 不访问 wrong-notebook 后端 API
 * - 不依赖 Prisma
 * - API Key 不上传 wrong-notebook 后端
 */

const STORAGE_KEY = "client-llm-config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClientLlmProvider = "openai-compatible";

export interface ClientLlmConfig {
    enabled: boolean;
    provider: ClientLlmProvider;
    baseUrl: string;
    model: string;
    apiKey: string;
    remember: boolean;
}

export const DEFAULT_CLIENT_LLM_CONFIG: ClientLlmConfig = {
    enabled: false,
    provider: "openai-compatible",
    baseUrl: "",
    model: "",
    apiKey: "",
    remember: false,
};

// ---------------------------------------------------------------------------
// Session memory (lives only for current page lifetime)
// ---------------------------------------------------------------------------

let sessionConfig: ClientLlmConfig = { ...DEFAULT_CLIENT_LLM_CONFIG };
let sessionLoaded = false;

// ---------------------------------------------------------------------------
// Browser guard
// ---------------------------------------------------------------------------

function isBrowser(): boolean {
    return typeof window !== "undefined";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 加载本机 LLM 配置。
 *
 * 优先级：
 * 1. 如果 session memory 已加载，直接返回 session 配置
 * 2. 否则尝试从 localStorage 读取（说明 remember=true 时保存过）
 * 3. 都没有则返回默认值
 */
export function loadLlmConfig(): ClientLlmConfig {
    if (!isBrowser()) {
        return { ...DEFAULT_CLIENT_LLM_CONFIG };
    }

    if (sessionLoaded) {
        return { ...sessionConfig };
    }

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored) as Partial<ClientLlmConfig>;
            sessionConfig = {
                ...DEFAULT_CLIENT_LLM_CONFIG,
                ...parsed,
                // remember 从 localStorage 加载时一定是 true
                remember: true,
            };
        } else {
            sessionConfig = { ...DEFAULT_CLIENT_LLM_CONFIG };
        }
    } catch {
        sessionConfig = { ...DEFAULT_CLIENT_LLM_CONFIG };
    }

    sessionLoaded = true;
    return { ...sessionConfig };
}

/**
 * 保存本机 LLM 配置。
 *
 * 行为：
 * - 永远更新 session memory
 * - remember=true: 写入 localStorage（持久化）
 * - remember=false: 删除 localStorage 中的旧数据
 */
export function saveLlmConfig(config: ClientLlmConfig): void {
    if (!isBrowser()) return;

    // 规范化为已知 provider
    const normalized: ClientLlmConfig = {
        ...config,
        provider: "openai-compatible",
    };

    // 更新 session memory
    sessionConfig = { ...normalized };
    sessionLoaded = true;

    // 持久化策略
    try {
        if (normalized.remember) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
    } catch {
        // localStorage 可能被禁用或写满，静默失败
    }
}

/**
 * 清除本机 LLM 配置。
 *
 * - 重置 session memory 为默认值
 * - 删除 localStorage 中的持久化数据
 */
export function clearLlmConfig(): void {
    if (!isBrowser()) return;

    sessionConfig = { ...DEFAULT_CLIENT_LLM_CONFIG };
    sessionLoaded = true;

    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // 静默失败
    }
}

/**
 * 判断 Base URL 是否指向本机 localhost 代理。
 * 本机代理一般路径固定为 /v1/chat/completions。
 */
function isLocalhostBaseUrl(baseUrl: string): boolean {
    try {
        const host = new URL(baseUrl).hostname;
        return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
    } catch {
        return false;
    }
}

/**
 * 判断配置是否可用的最小条件：
 * - enabled = true
 * - baseUrl 非空
 * - model 非空
 * - apiKey 非空（除非 baseUrl 是本机 localhost 代理，此时 apiKey 可选）
 */
export function hasCompleteConfig(config: ClientLlmConfig): boolean {
    const hasBaseUrl =
        typeof config.baseUrl === "string" && config.baseUrl.trim().length > 0;
    const hasModel =
        typeof config.model === "string" && config.model.trim().length > 0;
    const hasApiKey =
        typeof config.apiKey === "string" && config.apiKey.trim().length > 0;

    // 本机代理使用自己的 .env API Key，前端可以不填 apiKey
    if (hasBaseUrl && isLocalhostBaseUrl(config.baseUrl)) {
        return config.enabled === true && hasBaseUrl && hasModel;
    }

    return config.enabled === true && hasBaseUrl && hasModel && hasApiKey;
}

/**
 * 对 API Key 做遮罩处理，仅用于 UI 显示。
 *
 * 规则：
 * - 长度 <= 6: 全部替换为 *
 * - 长度 <= 12: 保留首 3 尾 3
 * - 长度 > 12: 保留首 4 尾 4
 */
export function maskApiKey(apiKey: string): string {
    if (!apiKey) return "";

    const len = apiKey.length;
    if (len <= 6) {
        return "*".repeat(len);
    }
    if (len <= 12) {
        return apiKey.slice(0, 3) + "*".repeat(len - 6) + apiKey.slice(-3);
    }
    return apiKey.slice(0, 4) + "*".repeat(len - 8) + apiKey.slice(-4);
}
