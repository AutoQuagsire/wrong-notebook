"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Zap, CheckCircle2, XCircle, Eye, EyeOff, Trash2, AlertTriangle, Info } from "lucide-react";
import {
    ClientLlmConfig,
    DEFAULT_CLIENT_LLM_CONFIG,
    loadLlmConfig,
    saveLlmConfig,
    clearLlmConfig,
    hasCompleteConfig,
    maskApiKey,
} from "@/lib/client-llm-config";

interface TestResult {
    success: boolean;
    message: string;
}

export function LocalLLMSettings() {
    const [config, setConfig] = useState<ClientLlmConfig>(DEFAULT_CLIENT_LLM_CONFIG);
    const [showApiKey, setShowApiKey] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);

    // Load config on mount
    useEffect(() => {
        setConfig(loadLlmConfig());
    }, []);

    const handleSave = () => {
        setSaving(true);
        try {
            saveLlmConfig(config);
            // brief visual feedback — the user can close the dialog
            setTimeout(() => setSaving(false), 400);
        } catch {
            setSaving(false);
        }
    };

    const handleClear = () => {
        clearLlmConfig();
        setConfig(DEFAULT_CLIENT_LLM_CONFIG);
        setTestResult(null);
        setShowApiKey(false);
    };

    const handleTestConnection = async () => {
        if (!hasCompleteConfig(config)) {
            setTestResult({
                success: false,
                message: "请先填写完整的 Provider Base URL、Model 和 API Key。",
            });
            return;
        }

        setTesting(true);
        setTestResult(null);

        const apiKey = config.apiKey || "";
        let url: string;
        const headers: Record<string, string> = { "Content-Type": "application/json" };

        if (config.proxyEnabled && config.proxyUrl?.trim()) {
            url = `${config.proxyUrl.trim().replace(/\/+$/, "")}/chat/completions`;
            headers["X-Provider-Base-URL"] = config.baseUrl.trim().replace(/\/+$/, "");
        } else {
            url = `${config.baseUrl.trim().replace(/\/+$/, "")}/chat/completions`;
        }
        if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
        }

        try {
            const response = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model: config.model,
                    messages: [{ role: "user", content: "请只回复 OK" }],
                    max_tokens: 16,
                }),
                // Don't send cookies along to the user's LLM endpoint
                credentials: "omit",
            });

            if (response.ok) {
                setTestResult({
                    success: true,
                    message: "测试成功。本机 LLM 配置可用。",
                });
            } else {
                const statusText = response.statusText || `HTTP ${response.status}`;
                setTestResult({
                    success: false,
                    message: `测试失败。请检查 Provider Base URL、Model、API Key，或确认该服务是否允许浏览器 CORS 请求。(${statusText})`,
                });
            }
        } catch (error: unknown) {
            const msg = error instanceof TypeError && error.message === "Failed to fetch"
                ? "测试失败。请检查 Proxy URL 或 Provider Base URL 是否正确，或确认该服务是否允许浏览器 CORS 跨域请求。"
                : `测试失败。${error instanceof Error ? error.message : "网络错误"}`;
            setTestResult({ success: false, message: msg });
        } finally {
            setTesting(false);
        }
    };

    const updateField = <K extends keyof ClientLlmConfig>(key: K, value: ClientLlmConfig[K]) => {
        setConfig(prev => ({ ...prev, [key]: value }));
        setTestResult(null);
    };

    const isComplete = hasCompleteConfig(config);

    return (
        <div className="space-y-4">
            {/* Privacy Notice */}
            <div className="p-3 border border-blue-200 rounded-md bg-blue-50 text-xs text-blue-800 space-y-1">
                <p className="font-medium flex items-center gap-1">
                    <Info className="h-3.5 w-3.5" />
                    隐私说明
                </p>
                <p>API Key 仅保存在当前浏览器，不会上传到 wrong-notebook 后端。</p>
                <p>已接入：首页文字 AI 解题、错题本添加页文字 AI 解题、首页拍照识题、编辑器重新解题。</p>
            </div>

            {/* CORS / Proxy Notice */}
            <div className="p-3 border border-amber-200 rounded-md bg-amber-50 text-xs text-amber-800 space-y-1">
                <p className="font-medium flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    CORS / 网络错误说明
                </p>
                <p>如果填写第三方 LLM 官方 Base URL 后测试连接或发送请求时出现 CORS / Failed to fetch，说明该服务不允许浏览器直接跨域调用。</p>
                <p className="font-medium mt-1">解决方式：</p>
                <ol className="list-decimal pl-4 space-y-0.5">
                    <li>使用支持浏览器 CORS 的 OpenAI-compatible endpoint；</li>
                    <li>或启动<b>用户本机代理</b>，并勾选下方&ldquo;使用本机代理解决 CORS&ldquo;。</li>
                </ol>
                <p className="text-amber-700 mt-1">
                    本机代理运行在用户自己的电脑上，仅做无状态 CORS 转发。API Key 仍由下方填写，代理不会保存 API Key。API Key 不会上传 wrong-notebook 服务器。
                </p>
                <p>
                    代理工具位于项目 <code className="bg-amber-100 px-1 rounded">tools/local-llm-proxy/</code> 目录，详见 README。
                </p>
            </div>

            {/* Vision Model Notice */}
            <div className="p-3 border border-blue-200 rounded-md bg-blue-50 text-xs text-blue-800 space-y-1">
                <p className="font-medium flex items-center gap-1">
                    <Info className="h-3.5 w-3.5" />
                    拍照识题说明
                </p>
                <p>测试连接只验证文本请求可用。拍照识题还要求模型支持图片输入 image_url（vision 能力）。</p>
                <p>如果拍照识题失败并提示模型不支持图片，请确认所选模型支持视觉能力（如 gpt-4o、gpt-4-turbo 等）。</p>
            </div>

            {/* Enabled Switch */}
            <div className="flex items-center justify-between">
                <Label htmlFor="llm-enabled" className="font-medium">
                    启用本机 LLM
                </Label>
                <Switch
                    id="llm-enabled"
                    checked={config.enabled}
                    onCheckedChange={(v) => updateField("enabled", v)}
                />
            </div>

            {/* Provider (read-only for now) */}
            <div className="space-y-2">
                <Label>提供商</Label>
                <Input value="OpenAI / 兼容接口" disabled />
                <p className="text-xs text-muted-foreground">
                    当前仅支持 OpenAI 兼容 API 接口。
                </p>
            </div>

            {/* Base URL */}
            <div className="space-y-2">
                <Label htmlFor="llm-baseurl">
                    Provider Base URL <span className="text-destructive">*</span>
                </Label>
                <Input
                    id="llm-baseurl"
                    value={config.baseUrl}
                    onChange={(e) => updateField("baseUrl", e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    disabled={!config.enabled}
                />
                <p className="text-xs text-muted-foreground">
                    外部 LLM 服务的地址。例如：https://open.bigmodel.cn/api/paas/v4 或 https://api.openai.com/v1。
                </p>
            </div>

            {/* Model */}
            <div className="space-y-2">
                <Label htmlFor="llm-model">
                    Model <span className="text-destructive">*</span>
                </Label>
                <Input
                    id="llm-model"
                    value={config.model}
                    onChange={(e) => updateField("model", e.target.value)}
                    placeholder="gpt-4o"
                    disabled={!config.enabled}
                />
            </div>

            {/* API Key */}
            <div className="space-y-2">
                <Label htmlFor="llm-apikey">
                    API Key <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                    <Input
                        id="llm-apikey"
                        type={showApiKey ? "text" : "password"}
                        value={config.apiKey}
                        onChange={(e) => updateField("apiKey", e.target.value)}
                        placeholder="sk-..."
                        className="pr-10"
                        disabled={!config.enabled}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowApiKey(!showApiKey)}
                        tabIndex={-1}
                        disabled={!config.enabled}
                    >
                        {showApiKey ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                    </Button>
                </div>
                {config.apiKey && (
                    <p className="text-xs text-muted-foreground">
                        已输入: {maskApiKey(config.apiKey)}
                    </p>
                )}
            </div>

            {/* Proxy Toggle */}
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label htmlFor="llm-proxy-enabled" className="font-medium">
                        使用本机代理解决 CORS
                    </Label>
                    <p className="text-xs text-muted-foreground">
                        如果你的 LLM 服务不允许浏览器跨域请求，请启用此选项。
                    </p>
                </div>
                <Switch
                    id="llm-proxy-enabled"
                    checked={config.proxyEnabled}
                    onCheckedChange={(v) => updateField("proxyEnabled", v)}
                    disabled={!config.enabled}
                />
            </div>

            {/* Proxy URL */}
            {config.proxyEnabled && (
                <div className="space-y-2">
                    <Label htmlFor="llm-proxy-url">
                        Proxy URL
                    </Label>
                    <Input
                        id="llm-proxy-url"
                        value={config.proxyUrl}
                        onChange={(e) => updateField("proxyUrl", e.target.value)}
                        placeholder="http://127.0.0.1:8787/v1"
                        disabled={!config.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                        本机代理监听地址。Proxy 负责转发本机请求到 Provider Base URL 并解决 CORS，不会保存你的 API Key。
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        当前页面 Origin：<code className="bg-muted px-1 rounded">{typeof window !== "undefined" ? window.location.origin : ""}</code>
                    </p>
                    <p className="text-xs text-amber-600">
                        请确保本机代理 .env 的 ALLOWED_ORIGINS 包含上面的 Origin 地址。如果缺少，请在代理 .env 中添加并重启代理。
                    </p>
                </div>
            )}

            {/* Remember checkbox with risk warning */}
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <input
                        id="llm-remember"
                        type="checkbox"
                        checked={config.remember}
                        onChange={(e) => updateField("remember", e.target.checked)}
                        disabled={!config.enabled}
                        className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="llm-remember" className="cursor-pointer">
                        记住在本设备
                    </Label>
                </div>

                {config.remember ? (
                    <div className="flex items-start gap-2 p-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>API Key 将保存到当前浏览器。请勿在公共电脑保存此配置。</span>
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground pl-6">
                        API Key 仅保存在当前页面会话，刷新后需要重新输入。
                    </p>
                )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-3 border-t">
                {/* Test Connection */}
                <div className="flex gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleTestConnection}
                        disabled={testing || saving || !isComplete}
                        className="flex-1"
                    >
                        {testing ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Zap className="mr-2 h-4 w-4" />
                        )}
                        {testing ? "测试中..." : "测试连接"}
                    </Button>
                    <Button onClick={handleSave} disabled={saving || testing} className="flex-1">
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {saving ? "已保存" : "保存"}
                    </Button>
                </div>

                {/* Clear */}
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    className="w-full text-muted-foreground hover:text-destructive"
                >
                    <Trash2 className="mr-2 h-4 w-4" />
                    清除本机配置
                </Button>

                {/* Test Result */}
                {testResult && (
                    <div
                        className={`p-3 rounded-md text-sm ${
                            testResult.success
                                ? "bg-green-50 border border-green-200"
                                : "bg-red-50 border border-red-200"
                        }`}
                    >
                        <div className="flex items-center gap-2 font-medium">
                            {testResult.success ? (
                                <>
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                    <span className="text-green-700">连接成功</span>
                                </>
                            ) : (
                                <>
                                    <XCircle className="h-4 w-4 text-red-600" />
                                    <span className="text-red-700">连接失败</span>
                                </>
                            )}
                        </div>
                        <p className="text-xs mt-1 text-muted-foreground">{testResult.message}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
