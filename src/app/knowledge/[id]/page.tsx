"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { ArrowLeft, Edit, Save, Trash2, Brain } from "lucide-react";
import Link from "next/link";
import { getSafeKnowledgeReturnTo } from "@/lib/knowledge-list-url-state";

interface KnowledgeItemDetail {
    id: string;
    userId: string;
    subjectId: string;
    prompt: string;
    answer: string;
    detail: string | null;
    deck: string | null;
    order: number;
    tagId: string | null;
    tag: { id: string; name: string; subject: string } | null;
    subject: { id: string; name: string } | null;
    questionType: string | null;
    source: string | null;
    manualDifficulty: string | null;
    reviewState: {
        id: string; due: string; stability: number | null; difficulty: number | null;
        elapsed_days: number; scheduled_days: number; reps: number; lapses: number;
        state: string; last_review: string | null;
    } | null;
    createdAt: string;
    updatedAt: string;
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message;
    return fallback;
}

export default function KnowledgeDetailPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const id = params.id as string;
    const [item, setItem] = useState<KnowledgeItemDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [editPrompt, setEditPrompt] = useState("");
    const [editDeck, setEditDeck] = useState("");
    const [editError, setEditError] = useState<string | null>(null);
    const [markUnknownLoading, setMarkUnknownLoading] = useState(false);
    const [markUnknownError, setMarkUnknownError] = useState<string | null>(null);
    const [markUnknownSuccess, setMarkUnknownSuccess] = useState<string | null>(null);
    const [editSource, setEditSource] = useState("");
    const [editOrder, setEditOrder] = useState("");

    const fetchItem = useCallback(async () => {
        try {
            const data = await apiClient.get<KnowledgeItemDetail>(`/api/knowledge-items/${id}`);
            setItem(data);
        } catch {
            setItem(null);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchItem(); }, [fetchItem]);

    const startEdit = () => {
        if (!item) return;
        setEditPrompt(item.prompt);
        setEditDeck(item.deck || "");
        setEditSource(item.source || "");
        setEditOrder(item.order != null ? String(item.order) : "");
        setEditError(null);
        setEditing(true);
    };

    const handleSave = async () => {
        if (!item || !editPrompt.trim()) {
            setEditError("知识点内容不能为空");
            return;
        }
        try {
            const updated = await apiClient.put<KnowledgeItemDetail>(`/api/knowledge-items/${id}`, {
                prompt: editPrompt.trim(),
                deck: editDeck || null,
                source: editSource.trim() || null,
                order: editOrder.trim() ? parseInt(editOrder, 10) : undefined,
            });
            setItem(updated);
            setEditing(false);
            setEditError(null);
        } catch (error) {
            setEditError(getErrorMessage(error, "保存失败"));
        }
    };

    const handleDelete = async () => {
        if (!item || !confirm("确定删除这个知识点？")) return;
        try {
            await apiClient.post(`/api/knowledge-items/${id}`, {});
            router.push("/knowledge");
        } catch (error) {
            alert(getErrorMessage(error, "删除失败"));
        }
    };

    const handleMarkUnknown = async () => {
        if (!item || markUnknownLoading) return;
        const confirmed = window.confirm("确定将该知识点设为不会，并加入待复习队列吗？");
        if (!confirmed) return;

        setMarkUnknownLoading(true);
        setMarkUnknownError(null);
        setMarkUnknownSuccess(null);

        try {
            await apiClient.post<{
                knowledgeItemId: string;
                due: string;
                state: string;
                status: string;
                message: string;
            }, Record<string, never>>(`/api/knowledge-items/${id}/mark-unknown`, {});
            setMarkUnknownSuccess("已设为不会，已加入待复习队列");
            await fetchItem();
        } catch (err) {
            const message = err instanceof Error ? err.message : "设置失败";
            setMarkUnknownError(message);
        } finally {
            setMarkUnknownLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-muted-foreground">加载中...</div>;
    if (!item) return <div className="p-8 text-center text-muted-foreground">知识点不存在</div>;

    const backHref = getSafeKnowledgeReturnTo(searchParams.get("returnTo"));

    return (
        <main className="min-h-screen p-4 md:p-8 bg-background">
            <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <Link href={backHref} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="h-4 w-4" />返回列表
                    </Link>
                    <div className="flex gap-2">
                        <Link href={`/knowledge/review/${item.id}`}>
                            <Button variant="outline" size="sm"><Brain className="mr-1 h-4 w-4" />复习</Button>
                        </Link>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleMarkUnknown}
                            disabled={markUnknownLoading}
                            className="border-amber-500 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                        >
                            <Brain className="mr-1 h-4 w-4" />
                            {markUnknownLoading ? "正在设置..." : "设为不会"}
                        </Button>
                        {!editing && (
                            <Button variant="outline" size="sm" onClick={startEdit}><Edit className="mr-1 h-4 w-4" />编辑</Button>
                        )}
                        <Button variant="outline" size="sm" onClick={handleDelete}><Trash2 className="mr-1 h-4 w-4 text-destructive" />删除</Button>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">{editing ? "编辑知识点" : "知识点详情"}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {editing ? (
                            <>
                                {editError && <p className="text-destructive text-sm">{editError}</p>}
                                <div>
                                    <label className="text-sm font-medium">知识点内容</label>
                                    <Input value={editPrompt} onChange={e => setEditPrompt(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">分组</label>
                                    <Input value={editDeck} onChange={e => setEditDeck(e.target.value)} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-medium">编号</label>
                                        <Input value={editSource} onChange={e => setEditSource(e.target.value)} placeholder="例如 MFD-15" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium">排序</label>
                                        <Input type="number" value={editOrder} onChange={e => setEditOrder(e.target.value)} placeholder="0" />
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={handleSave}><Save className="mr-1 h-4 w-4" />保存</Button>
                                    <Button variant="outline" onClick={() => setEditing(false)}>取消</Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div>
                                    <p className="text-sm text-muted-foreground mb-1">知识点内容</p>
                                    <MarkdownRenderer content={item.prompt} />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {item.source && <Badge variant="outline" className="font-mono">#{item.source}</Badge>}
                                    {item.subject && <Badge variant="secondary">{item.subject.name}</Badge>}
                                    {item.deck && <Badge variant="outline">{item.deck}</Badge>}
                                    {item.tag && <Badge variant="outline">{item.tag.name}</Badge>}
                                    {item.questionType && <Badge variant="outline">{item.questionType}</Badge>}
                                </div>
                                {(markUnknownError || markUnknownSuccess) && (
                                    <div className="rounded-md border p-3 text-sm">
                                        {markUnknownError && (
                                            <p className="text-destructive">{markUnknownError}</p>
                                        )}
                                        {markUnknownSuccess && (
                                            <div className="flex flex-wrap items-center gap-3">
                                                <p className="text-green-700">{markUnknownSuccess}</p>
                                                <Link href="/knowledge/review" className="text-primary hover:underline">
                                                    去今日复习
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>

                {item.reviewState && (
                    <Card>
                        <CardHeader><CardTitle className="text-base">复习进度</CardTitle></CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div><span className="text-muted-foreground">状态</span><p className="font-medium">{item.reviewState.state}</p></div>
                                <div><span className="text-muted-foreground">下次复习</span><p className="font-medium">{new Date(item.reviewState.due).toLocaleDateString("zh-CN")}</p></div>
                                <div><span className="text-muted-foreground">复习次数</span><p className="font-medium">{item.reviewState.reps}</p></div>
                                <div><span className="text-muted-foreground">遗忘次数</span><p className="font-medium">{item.reviewState.lapses}</p></div>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </main>
    );
}
