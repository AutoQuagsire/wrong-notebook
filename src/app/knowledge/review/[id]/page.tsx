"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface ReviewItem {
    id: string;
    prompt: string;
    answer: string;
    detail: string | null;
    subject: { id: string; name: string } | null;
    reviewState: { state: string; reps: number; lapses: number; due: string } | null;
}

const ratingOptions = [
    { value: 1, label: "不会 (Again)", variant: "destructive" as const },
    { value: 2, label: "困难 (Hard)", variant: "outline" as const },
    { value: 3, label: "正常 (Good)", variant: "secondary" as const },
    { value: 4, label: "熟练 (Easy)", variant: "default" as const },
];

export default function KnowledgeReviewItemPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [item, setItem] = useState<ReviewItem | null>(null);
    const [loading, setLoading] = useState(true);
    const [revealed, setRevealed] = useState(false);
    const [answerText, setAnswerText] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [reviewResult, setReviewResult] = useState<{
        nextReviewAt: string; scheduledDays: number; state: string; reps: number; lapses: number;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const startTimeRef = useRef(Date.now());

    useEffect(() => {
        apiClient.get<ReviewItem>(`/api/knowledge-items/${id}`)
            .then(setItem)
            .catch(() => setItem(null))
            .finally(() => setLoading(false));
    }, [id]);

    const handleReveal = () => {
        setRevealed(true);
    };

    const handleSubmitRating = async (rating: number) => {
        if (submitting || submitted) return;
        setSubmitting(true);
        setError(null);
        const durationSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
        try {
            const result = await apiClient.post<{
                reviewResult: { nextReviewAt: string; scheduledDays: number; state: string; reps: number; lapses: number };
            }>("/api/knowledge/review/submit", {
                knowledgeItemId: id,
                rating,
                answerText: answerText || null,
                durationSeconds,
            });
            setReviewResult(result.reviewResult);
            setSubmitted(true);
        } catch (err: any) {
            setError(err?.message || "提交失败");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-muted-foreground">加载中...</div>;
    if (!item) return <div className="p-8 text-center text-muted-foreground">知识点不存在</div>;

    return (
        <main className="min-h-screen p-4 md:p-8 bg-background">
            <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <Link href="/knowledge/review" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="h-4 w-4" />返回复习列表
                    </Link>
                    {item.subject && <span className="text-sm text-muted-foreground">{item.subject.name}</span>}
                </div>

                {/* Prompt */}
                <Card>
                    <CardHeader><CardTitle className="text-base">题目 / 提示</CardTitle></CardHeader>
                    <CardContent>
                        <MarkdownRenderer content={item.prompt} />
                    </CardContent>
                </Card>

                {/* Answer input */}
                <Card>
                    <CardHeader><CardTitle className="text-base">你的默写</CardTitle></CardHeader>
                    <CardContent>
                        <Textarea
                            value={answerText}
                            onChange={e => setAnswerText(e.target.value)}
                            placeholder="在这里默写答案..."
                            rows={5}
                            disabled={submitted}
                        />
                    </CardContent>
                </Card>

                {/* Reveal answer */}
                {!revealed && !submitted && (
                    <div className="text-center">
                        <Button onClick={handleReveal}>揭示答案</Button>
                    </div>
                )}

                {(revealed || submitted) && (
                    <>
                        <Card>
                            <CardHeader><CardTitle className="text-base">标准答案</CardTitle></CardHeader>
                            <CardContent>
                                <MarkdownRenderer content={item.answer} />
                                {item.detail && (
                                    <div className="mt-4 pt-4 border-t">
                                        <p className="text-sm text-muted-foreground mb-1">解析</p>
                                        <MarkdownRenderer content={item.detail} />
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Rating buttons */}
                        {!submitted && (
                            <Card>
                                <CardHeader><CardTitle className="text-base">自我评价</CardTitle></CardHeader>
                                <CardContent>
                                    {error && <p className="text-destructive text-sm mb-2">{error}</p>}
                                    <div className="grid grid-cols-2 gap-3">
                                        {ratingOptions.map(opt => (
                                            <Button
                                                key={opt.value}
                                                variant={opt.variant}
                                                className="h-auto py-3 text-sm"
                                                disabled={submitting}
                                                onClick={() => handleSubmitRating(opt.value)}
                                            >
                                                {opt.label}
                                            </Button>
                                        ))}
                                    </div>
                                    {submitting && <p className="text-center text-muted-foreground mt-2">提交中...</p>}
                                </CardContent>
                            </Card>
                        )}

                        {/* Result */}
                        {submitted && reviewResult && (
                            <Card>
                                <CardHeader><CardTitle className="text-base">复习结果</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div><span className="text-muted-foreground">下次复习</span><p className="font-medium">{new Date(reviewResult.nextReviewAt).toLocaleDateString("zh-CN")}</p></div>
                                        <div><span className="text-muted-foreground">安排天数</span><p className="font-medium">{reviewResult.scheduledDays} 天</p></div>
                                        <div><span className="text-muted-foreground">状态</span><p className="font-medium">{reviewResult.state}</p></div>
                                        <div><span className="text-muted-foreground">复习次数</span><p className="font-medium">{reviewResult.reps}</p></div>
                                        <div><span className="text-muted-foreground">遗忘次数</span><p className="font-medium">{reviewResult.lapses}</p></div>
                                    </div>
                                    <div className="flex gap-2 mt-4">
                                        <Link href="/knowledge/review">
                                            <Button variant="outline" size="sm">返回复习列表</Button>
                                        </Link>
                                        <Link href={`/knowledge/${id}`}>
                                            <Button variant="outline" size="sm">查看详情</Button>
                                        </Link>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </>
                )}
            </div>
        </main>
    );
}
