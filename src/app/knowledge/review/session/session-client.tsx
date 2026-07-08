"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { ArrowLeft, Play, CheckCircle, RotateCcw } from "lucide-react";

interface SessionItem {
    knowledgeItemId: string;
    promptPreview: string;
    answer: string;
    detail: string | null;
    subject: { id: string; name: string } | null;
    tag: { id: string; name: string } | null;
    due?: string;
    state?: string;
    reps?: number;
    lapses?: number;
    scheduledDays?: number;
}

interface SessionResult {
    knowledgeItemId: string;
    prompt: string;
    rating: number;
    nextReviewAt: string;
    scheduledDays: number;
}

const SESSION_LIMIT = 10;

const ratingOptions = [
    { value: 1, label: "不会 (Again)", variant: "destructive" as const },
    { value: 2, label: "困难 (Hard)", variant: "outline" as const },
    { value: 3, label: "正常 (Good)", variant: "secondary" as const },
    { value: 4, label: "熟练 (Easy)", variant: "default" as const },
];

export default function KnowledgeReviewSessionClient() {
    const [items, setItems] = useState<SessionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answerText, setAnswerText] = useState("");
    const [revealed, setRevealed] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [results, setResults] = useState<SessionResult[]>([]);
    const [sessionFinished, setSessionFinished] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const startTimeRef = useRef(Date.now());

    const loadSessionItems = async () => {
        setError(null);
        setLoading(true);

        try {
            const data = await apiClient.get<{ dueItems: SessionItem[] }>(
                `/api/knowledge/review/today?limit=${SESSION_LIMIT}&includeNew=false`
            );
            setItems(data.dueItems);
        } catch (err: unknown) {
            const apiError = err as { status?: number; message?: string };
            if (apiError?.status === 401) {
                setError("请先登录后再开始抽背");
            } else {
                setError(apiError?.message || "加载失败，请稍后重试");
            }
            setItems([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadSessionItems();
    }, []);

    const resetForNext = () => {
        setAnswerText("");
        setRevealed(false);
        setSubmitted(false);
        setSubmitting(false);
        setError(null);
        startTimeRef.current = Date.now();
    };

    const handleReveal = () => {
        setRevealed(true);
    };

    const handleSubmitRating = async (rating: number) => {
        if (submitting || submitted) return;
        setSubmitting(true);
        setError(null);

        const item = items[currentIndex];
        const durationSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);

        try {
            const result = await apiClient.post<{
                reviewResult: {
                    nextReviewAt: string;
                    scheduledDays: number;
                    state: string;
                    reps: number;
                    lapses: number;
                };
            }>("/api/knowledge/review/submit", {
                knowledgeItemId: item.knowledgeItemId,
                rating,
                answerText: answerText || null,
                durationSeconds,
            });

            setResults((prev) => [
                ...prev,
                {
                    knowledgeItemId: item.knowledgeItemId,
                    prompt: item.promptPreview,
                    rating,
                    nextReviewAt: result.reviewResult.nextReviewAt,
                    scheduledDays: result.reviewResult.scheduledDays,
                },
            ]);
            setSubmitted(true);
        } catch (err: unknown) {
            const msg = (err as { message?: string })?.message || "提交失败";
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleNext = () => {
        if (currentIndex + 1 >= items.length) {
            setSessionFinished(true);
        } else {
            setCurrentIndex((prev) => prev + 1);
            resetForNext();
        }
    };

    const handleRestart = () => {
        setItems([]);
        setCurrentIndex(0);
        setResults([]);
        setSessionFinished(false);
        resetForNext();
        void loadSessionItems();
    };

    if (loading) {
        return (
            <main className="min-h-screen p-4 md:p-8 bg-background">
                <div className="max-w-3xl mx-auto text-center py-12 text-muted-foreground">加载中...</div>
            </main>
        );
    }

    if (error && items.length === 0) {
        return (
            <main className="min-h-screen p-4 md:p-8 bg-background">
                <div className="max-w-3xl mx-auto text-center py-12 space-y-4">
                    <p className="text-muted-foreground">{error}</p>
                    <div className="flex justify-center gap-2">
                        <Link href="/knowledge/review">
                            <Button variant="outline">返回今日复习</Button>
                        </Link>
                        <Link href="/knowledge">
                            <Button variant="outline">返回知识点列表</Button>
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    if (sessionFinished) {
        const again = results.filter((r) => r.rating === 1).length;
        const hard = results.filter((r) => r.rating === 2).length;
        const good = results.filter((r) => r.rating === 3).length;
        const easy = results.filter((r) => r.rating === 4).length;

        return (
            <main className="min-h-screen p-4 md:p-8 bg-background">
                <div className="max-w-3xl mx-auto space-y-6">
                    <div className="flex items-center justify-between">
                        <h1 className="text-2xl font-bold tracking-tight">抽背完成</h1>
                        <Link href="/knowledge/review">
                            <Button variant="outline" size="sm">
                                <ArrowLeft className="mr-1 h-4 w-4" />返回今日复习
                            </Button>
                        </Link>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">本轮结果</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-4 gap-4 mb-4 text-center">
                                <div>
                                    <div className="text-2xl font-bold text-red-500">{again}</div>
                                    <div className="text-xs text-muted-foreground">Again</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-orange-500">{hard}</div>
                                    <div className="text-xs text-muted-foreground">Hard</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-green-500">{good}</div>
                                    <div className="text-xs text-muted-foreground">Good</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-blue-500">{easy}</div>
                                    <div className="text-xs text-muted-foreground">Easy</div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-3">
                        {results.map((r, i) => (
                            <Card key={r.knowledgeItemId}>
                                <CardContent className="pt-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="font-medium text-sm flex-1 line-clamp-2">
                                            {i + 1}. {r.prompt}
                                        </p>
                                        <Badge
                                            variant={
                                                r.rating === 1
                                                    ? "destructive"
                                                    : r.rating === 2
                                                        ? "outline"
                                                        : r.rating === 3
                                                            ? "secondary"
                                                            : "default"
                                            }
                                        >
                                            {r.rating === 1
                                                ? "Again"
                                                : r.rating === 2
                                                    ? "Hard"
                                                    : r.rating === 3
                                                        ? "Good"
                                                        : "Easy"}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        下次复习: {new Date(r.nextReviewAt).toLocaleDateString("zh-CN")} · {r.scheduledDays} 天
                                    </p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    <div className="flex gap-2">
                        <Link href="/knowledge/review">
                            <Button variant="outline">返回今日复习</Button>
                        </Link>
                        <Button onClick={handleRestart} variant="outline">
                            <RotateCcw className="mr-1 h-4 w-4" />再来一组
                        </Button>
                        <Link href="/knowledge">
                            <Button variant="outline">返回知识点列表</Button>
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    if (items.length === 0) {
        return (
            <main className="min-h-screen p-4 md:p-8 bg-background">
                <div className="max-w-3xl mx-auto text-center py-12 space-y-4">
                    <p className="text-muted-foreground">当前没有到期知识点</p>
                    <div className="flex justify-center gap-2">
                        <Link href="/knowledge/review">
                            <Button variant="outline">返回今日复习</Button>
                        </Link>
                        <Link href="/knowledge">
                            <Button variant="outline">返回知识点列表</Button>
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    const currentItem = items[currentIndex];
    const progressPct = ((currentIndex + (submitted ? 1 : 0)) / items.length) * 100;

    return (
        <main className="min-h-screen p-4 md:p-8 bg-background">
            <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">抽背</h1>
                        <p className="text-muted-foreground text-sm">
                            第 {currentIndex + 1} / {items.length} 条
                        </p>
                    </div>
                    <Link href="/knowledge/review">
                        <Button variant="outline" size="sm">
                            <ArrowLeft className="mr-1 h-4 w-4" />退出
                        </Button>
                    </Link>
                </div>

                <div className="w-full bg-muted rounded-full h-2">
                    <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                            {currentItem.subject && (
                                <Badge variant="secondary" className="text-xs">
                                    {currentItem.subject.name}
                                </Badge>
                            )}
                            {currentItem.tag && (
                                <Badge variant="outline" className="text-xs">
                                    {currentItem.tag.name}
                                </Badge>
                            )}
                            {currentItem.due && (
                                <Badge variant="outline" className="text-xs">
                                    到期: {new Date(currentItem.due).toLocaleDateString("zh-CN")}
                                </Badge>
                            )}
                        </div>
                        <CardTitle className="text-base">题目 / 提示</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <MarkdownRenderer content={currentItem.promptPreview} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">你的默写</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Textarea
                            value={answerText}
                            onChange={(e) => setAnswerText(e.target.value)}
                            placeholder="在这里默写答案..."
                            rows={5}
                            disabled={submitted}
                        />
                    </CardContent>
                </Card>

                {!revealed && !submitted && (
                    <div className="text-center">
                        <Button onClick={handleReveal} size="lg">
                            <CheckCircle className="mr-1 h-4 w-4" />默写完成
                        </Button>
                    </div>
                )}

                {(revealed || submitted) && (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">标准答案</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <MarkdownRenderer content={currentItem.answer} />
                                {currentItem.detail && (
                                    <div className="mt-4 pt-4 border-t">
                                        <p className="text-sm text-muted-foreground mb-1">解析</p>
                                        <MarkdownRenderer content={currentItem.detail} />
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {!submitted && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">自我评价</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {error && <p className="text-destructive text-sm mb-2">{error}</p>}
                                    <div className="grid grid-cols-2 gap-3">
                                        {ratingOptions.map((opt) => (
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
                                    {submitting && (
                                        <p className="text-center text-muted-foreground mt-2">提交中...</p>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {submitted && (
                            <div className="text-center">
                                <Button onClick={handleNext} size="lg">
                                    <Play className="mr-1 h-4 w-4" />
                                    {currentIndex + 1 >= items.length ? "查看结果" : "下一条"}
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </main>
    );
}
