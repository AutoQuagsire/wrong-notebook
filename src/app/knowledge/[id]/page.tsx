"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { ArrowLeft, Edit, Save, Trash2, Brain } from "lucide-react";
import Link from "next/link";

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

export default function KnowledgeDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const [item, setItem] = useState<KnowledgeItemDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [editPrompt, setEditPrompt] = useState("");
    const [editAnswer, setEditAnswer] = useState("");
    const [editDetail, setEditDetail] = useState("");
    const [editDeck, setEditDeck] = useState("");
    const [editError, setEditError] = useState<string | null>(null);

    const fetchItem = async () => {
        try {
            const data = await apiClient.get<KnowledgeItemDetail>(`/api/knowledge-items/${id}`);
            setItem(data);
        } catch (err: any) {
            setItem(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchItem(); }, [id]);

    const startEdit = () => {
        if (!item) return;
        setEditPrompt(item.prompt);
        setEditAnswer(item.answer);
        setEditDetail(item.detail || "");
        setEditDeck(item.deck || "");
        setEditError(null);
        setEditing(true);
    };

    const handleSave = async () => {
        if (!item || !editPrompt.trim() || !editAnswer.trim()) {
            setEditError("题目和答案不能为空");
            return;
        }
        try {
            const updated = await apiClient.put<KnowledgeItemDetail>(`/api/knowledge-items/${id}`, {
                prompt: editPrompt.trim(),
                answer: editAnswer.trim(),
                detail: editDetail || null,
                deck: editDeck || null,
            });
            setItem(updated);
            setEditing(false);
            setEditError(null);
        } catch (err: any) {
            setEditError(err?.message || "保存失败");
        }
    };

    const handleDelete = async () => {
        if (!item || !confirm("确定删除这个知识点？")) return;
        try {
            await apiClient.delete(`/api/knowledge-items/${id}`);
            router.push("/knowledge");
        } catch (err: any) {
            alert(err?.message || "删除失败");
        }
    };

    if (loading) return <div className="p-8 text-center text-muted-foreground">加载中...</div>;
    if (!item) return <div className="p-8 text-center text-muted-foreground">知识点不存在</div>;

    return (
        <main className="min-h-screen p-4 md:p-8 bg-background">
            <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <Link href="/knowledge" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="h-4 w-4" />返回列表
                    </Link>
                    <div className="flex gap-2">
                        <Link href={`/knowledge/review/${item.id}`}>
                            <Button variant="outline" size="sm"><Brain className="mr-1 h-4 w-4" />复习</Button>
                        </Link>
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
                                    <label className="text-sm font-medium">题目</label>
                                    <Input value={editPrompt} onChange={e => setEditPrompt(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">答案</label>
                                    <Textarea value={editAnswer} onChange={e => setEditAnswer(e.target.value)} rows={4} />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">解析</label>
                                    <Textarea value={editDetail} onChange={e => setEditDetail(e.target.value)} rows={3} />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">分组</label>
                                    <Input value={editDeck} onChange={e => setEditDeck(e.target.value)} />
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={handleSave}><Save className="mr-1 h-4 w-4" />保存</Button>
                                    <Button variant="outline" onClick={() => setEditing(false)}>取消</Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div>
                                    <p className="text-sm text-muted-foreground mb-1">题目 / 提示</p>
                                    <MarkdownRenderer content={item.prompt} />
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground mb-1">标准答案</p>
                                    <MarkdownRenderer content={item.answer} />
                                </div>
                                {item.detail && (
                                    <div>
                                        <p className="text-sm text-muted-foreground mb-1">解析</p>
                                        <MarkdownRenderer content={item.detail} />
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    {item.subject && <Badge variant="secondary">{item.subject.name}</Badge>}
                                    {item.deck && <Badge variant="outline">{item.deck}</Badge>}
                                    {item.tag && <Badge variant="outline">{item.tag.name}</Badge>}
                                    {item.questionType && <Badge variant="outline">{item.questionType}</Badge>}
                                </div>
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
