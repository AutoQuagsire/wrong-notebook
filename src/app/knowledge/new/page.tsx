"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save } from "lucide-react";

export default function NewKnowledgePage() {
    const router = useRouter();
    const [subjectId, setSubjectId] = useState("");
    const [prompt, setPrompt] = useState("");
    const [answer, setAnswer] = useState("");
    const [detail, setDetail] = useState("");
    const [deck, setDeck] = useState("");
    const [tagId, setTagId] = useState("");
    const [source, setSource] = useState("");
    const [order, setOrder] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Minimal: get subjects via notebooks API
    const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
    const [subjectsLoaded, setSubjectsLoaded] = useState(false);
    if (!subjectsLoaded) {
        apiClient.get<{ id: string; name: string }[]>("/api/notebooks")
            .then(data => setSubjects(Array.isArray(data) ? data : []))
            .catch(() => setSubjects([]))
            .finally(() => setSubjectsLoaded(true));
    }

    const handleSave = async () => {
        setError(null);
        if (!subjectId || !prompt.trim() || !answer.trim()) {
            setError("请填写学科和题目、答案");
            return;
        }
        setSaving(true);
        try {
            const item: Record<string, unknown> = { subjectId, prompt: prompt.trim(), answer: answer.trim(), questionType: "DICTATION" };
            if (detail) item.detail = detail;
            if (deck) item.deck = deck;
            if (tagId) item.tagId = tagId;
            if (source.trim()) item.source = source.trim();
            if (order.trim()) item.order = parseInt(order, 10);
            const created = await apiClient.post<{ id: string }>("/api/knowledge-items", item);
            router.push(`/knowledge/${created.id}`);
        } catch (err: any) {
            setError(err?.message || "保存失败");
        } finally {
            setSaving(false);
        }
    };

    return (
        <main className="min-h-screen p-4 md:p-8 bg-background">
            <div className="max-w-2xl mx-auto space-y-6">
                <h1 className="text-2xl font-bold">新建知识点</h1>
                {error && <p className="text-destructive text-sm">{error}</p>}

                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium">学科 *</label>
                        <Select value={subjectId} onValueChange={setSubjectId}>
                            <SelectTrigger><SelectValue placeholder="选择学科" /></SelectTrigger>
                            <SelectContent>
                                {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium">分组 / 章节</label>
                            <Input value={deck} onChange={e => setDeck(e.target.value)} placeholder="例如：八上-勾股定理" />
                        </div>
                        <div>
                            <label className="text-sm font-medium">编号</label>
                            <Input value={source} onChange={e => setSource(e.target.value)} placeholder="留空自动生成" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium">排序</label>
                            <Input type="number" value={order} onChange={e => setOrder(e.target.value)} placeholder="留空排末尾" />
                        </div>
                        <div>
                            <label className="text-sm font-medium">知识点标签 ID</label>
                            <Input value={tagId} onChange={e => setTagId(e.target.value)} placeholder="KnowledgeTag ID" />
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium">题目 / 提示 *</label>
                        <Input value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="例如：默写勾股定理" />
                    </div>
                    <div>
                        <label className="text-sm font-medium">答案 *</label>
                        <Textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="标准答案" rows={4} />
                    </div>
                    <div>
                        <label className="text-sm font-medium">解析</label>
                        <Textarea value={detail} onChange={e => setDetail(e.target.value)} placeholder="可选，支持 Markdown / LaTeX" rows={3} />
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleSave} disabled={saving}>
                            <Save className="mr-2 h-4 w-4" />{saving ? "保存中..." : "保存"}
                        </Button>
                        <Button variant="outline" onClick={() => router.back()}>取消</Button>
                    </div>
                </div>
            </div>
        </main>
    );
}
