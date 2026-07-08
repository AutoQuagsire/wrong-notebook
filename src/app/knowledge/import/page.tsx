"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, FileJson, CheckCircle, AlertCircle, Eye } from "lucide-react";

interface ImportItem {
    prompt: string;
    answer?: string;
    detail?: string;
    code?: string;
    tagId?: string;
    questionType?: string;
    source?: string;
    manualDifficulty?: string;
    order?: number;
    deck?: string;
}

interface ImportResult {
    created: number;
    skipped: number;
    errors: Array<{ row: number; message: string }>;
    items: Array<{ id: string; prompt: string }>;
}

export default function KnowledgeImportPage() {
    const router = useRouter();
    const [notebooks, setNotebooks] = useState<Array<{ id: string; name: string }>>([]);
    const [subjectId, setSubjectId] = useState("");
    const [deck, setDeck] = useState("");
    const [allowPlaceholder, setAllowPlaceholder] = useState(true);
    const [jsonText, setJsonText] = useState("");
    const [parsedItems, setParsedItems] = useState<ImportItem[] | null>(null);
    const [parseError, setParseError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        apiClient.get<Array<{ id: string; name: string }>>("/api/notebooks")
            .then(setNotebooks)
            .catch(() => setNotebooks([]));
    }, []);

    const handleParse = () => {
        setParseError(null);
        setParsedItems(null);
        setResult(null);
        setError(null);

        if (!jsonText.trim()) {
            setParseError("请粘贴 JSON 内容");
            return;
        }

        try {
            const parsed = JSON.parse(jsonText);
            if (!Array.isArray(parsed)) {
                setParseError("JSON 根元素必须是数组");
                return;
            }
            if (parsed.length === 0) {
                setParseError("数组不能为空");
                return;
            }
            for (let i = 0; i < parsed.length; i++) {
                if (!parsed[i] || typeof parsed[i] !== "object") {
                    setParseError(`第 ${i + 1} 行不是有效对象`);
                    return;
                }
            }
            setParsedItems(parsed as ImportItem[]);
        } catch (e: unknown) {
            setParseError(`JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const handleImport = async () => {
        if (!subjectId) return;
        if (!parsedItems || parsedItems.length === 0) return;

        setSubmitting(true);
        setError(null);
        setResult(null);

        try {
            const data = await apiClient.post<ImportResult>("/api/knowledge-items/import", {
                subjectId,
                deck: deck || undefined,
                allowPlaceholderAnswer: allowPlaceholder,
                items: parsedItems,
            });
            setResult(data);
            if (data.created > 0) {
                setParsedItems(null);
                setJsonText("");
            }
        } catch (err: unknown) {
            const msg = (err as { message?: string })?.message || "导入失败";
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="min-h-screen p-4 md:p-8 bg-background">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/knowledge" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="h-4 w-4" />返回列表
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">批量导入</h1>
                            <p className="text-muted-foreground text-sm">粘贴 JSON 数组，批量创建知识点</p>
                        </div>
                    </div>
                </div>

                {/* Config */}
                <Card>
                    <CardHeader><CardTitle className="text-base">导入设置</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm font-medium mb-1 block">目标错题本</label>
                            <select
                                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                                value={subjectId}
                                onChange={(e) => setSubjectId(e.target.value)}
                            >
                                <option value="">-- 选择错题本 --</option>
                                {notebooks.map((nb) => (
                                    <option key={nb.id} value={nb.id}>{nb.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">默认分组 (deck)</label>
                            <Input
                                value={deck}
                                onChange={(e) => setDeck(e.target.value)}
                                placeholder="如：线性代数·第一章"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* JSON Input */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <FileJson className="h-4 w-4" />JSON 数据
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Textarea
                            value={jsonText}
                            onChange={(e) => { setJsonText(e.target.value); setParsedItems(null); setResult(null); }}
                            placeholder={`粘贴 JSON 数组，例如：\n[\n  {\n    "code": "MFD-01",\n    "prompt": "默写：全微分定义"\n  }\n]`}
                            rows={12}
                            className="font-mono text-sm"
                        />
                        <div className="flex gap-2">
                            <Button onClick={handleParse} variant="outline" disabled={!jsonText.trim()}>
                                <Eye className="mr-1 h-4 w-4" />解析预览
                            </Button>
                        </div>

                        {parseError && (
                            <div className="flex items-center gap-2 text-destructive text-sm">
                                <AlertCircle className="h-4 w-4" />{parseError}
                            </div>
                        )}

                        {parsedItems && (
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">
                                    已解析 <Badge variant="secondary">{parsedItems.length}</Badge> 条记录
                                </p>
                                <div className="max-h-48 overflow-y-auto border rounded-lg">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/50 sticky top-0">
                                            <tr>
                                                <th className="text-left p-2">#</th>
                                                <th className="text-left p-2">code</th>
                                                <th className="text-left p-2">prompt</th>
                                                <th className="text-left p-2">questionType</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {parsedItems.map((item, i) => (
                                                <tr key={i} className="border-t">
                                                    <td className="p-2 text-muted-foreground">{i + 1}</td>
                                                    <td className="p-2">{item.code || "-"}</td>
                                                    <td className="p-2 max-w-[300px] truncate">{item.prompt}</td>
                                                    <td className="p-2">{item.questionType || "DICTATION"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <Button
                                    onClick={handleImport}
                                    disabled={!subjectId || submitting || parsedItems.length === 0}
                                >
                                    <Upload className="mr-1 h-4 w-4" />
                                    {submitting ? "导入中..." : `导入 ${parsedItems.length} 条`}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Results */}
                {error && (
                    <Card className="border-destructive">
                        <CardContent className="pt-4">
                            <p className="text-destructive flex items-center gap-2">
                                <AlertCircle className="h-4 w-4" />{error}
                            </p>
                        </CardContent>
                    </Card>
                )}

                {result && (
                    <Card>
                        <CardHeader><CardTitle className="text-base">导入结果</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex gap-4">
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="h-5 w-5 text-green-500" />
                                    <span className="text-sm">创建: <strong>{result.created}</strong></span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                                    <span className="text-sm">跳过: <strong>{result.skipped}</strong></span>
                                </div>
                            </div>
                            {result.errors.length > 0 && (
                                <div>
                                    <p className="text-sm font-medium mb-2 text-destructive">错误详情</p>
                                    <div className="max-h-48 overflow-y-auto border rounded-lg">
                                        <table className="w-full text-sm">
                                            <thead className="bg-muted/50">
                                                <tr>
                                                    <th className="text-left p-2">行</th>
                                                    <th className="text-left p-2">错误</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {result.errors.map((e, i) => (
                                                    <tr key={i} className="border-t">
                                                        <td className="p-2 text-muted-foreground">{e.row}</td>
                                                        <td className="p-2 text-destructive">{e.message}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </main>
    );
}
