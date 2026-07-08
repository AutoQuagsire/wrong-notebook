"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { ArrowLeft, RotateCcw } from "lucide-react";

interface SessionItem {
    knowledgeItemId: string;
    promptPreview: string;
    source?: string | null;
    subject: { id: string; name: string } | null;
    tag: { id: string; name: string } | null;
    due?: string;
    state?: string;
    reps?: number;
    lapses?: number;
    scheduledDays?: number;
}

interface SessionData {
    dueItems: SessionItem[];
    newItems: SessionItem[];
}

interface SessionEntry extends SessionItem {
    sessionKind: "due" | "new";
}

interface SessionResult {
    knowledgeItemId: string;
    prompt: string;
    rating: number;
    nextReviewAt: string;
    scheduledDays: number;
}

type Phase = "answering" | "rating" | "done";

const SESSION_LIMIT = 10;

const ratingOptions = [
    { value: 1, label: "不会 (Again)", variant: "destructive" as const, shortLabel: "Again" },
    { value: 2, label: "困难 (Hard)", variant: "outline" as const, shortLabel: "Hard" },
    { value: 3, label: "正常 (Good)", variant: "secondary" as const, shortLabel: "Good" },
    { value: 4, label: "熟练 (Easy)", variant: "default" as const, shortLabel: "Easy" },
];

function allocateSessionItems(data: SessionData): SessionEntry[] {
    const dueEntries = data.dueItems.map((item) => ({ ...item, sessionKind: "due" as const }));
    const remaining = Math.max(0, SESSION_LIMIT - dueEntries.length);
    const newEntries = data.newItems
        .slice(0, remaining)
        .map((item) => ({ ...item, sessionKind: "new" as const }));

    return [...dueEntries, ...newEntries].slice(0, SESSION_LIMIT);
}

export default function KnowledgeReviewSessionClient() {
    const [items, setItems] = useState<SessionEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [phase, setPhase] = useState<Phase>("answering");
    const [ratingIndex, setRatingIndex] = useState(0);
    const [lockedAnswers, setLockedAnswers] = useState<Record<string, string>>({});
    const [results, setResults] = useState<SessionResult[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const answeringStartedAtRef = useRef(Date.now());
    const answeringDurationRef = useRef(0);

    const loadSessionItems = async () => {
        setError(null);
        setLoading(true);

        try {
            const data = await apiClient.get<SessionData>(
                `/api/knowledge/review/today?limit=${SESSION_LIMIT}&includeNew=true`
            );

            const sessionItems = allocateSessionItems(data);
            setItems(sessionItems);
            setPhase("answering");
            setRatingIndex(0);
            setLockedAnswers({});
            setResults([]);
            answeringStartedAtRef.current = Date.now();
            answeringDurationRef.current = 0;
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

    const currentItem = items[ratingIndex] ?? null;
    const currentAnswer = currentItem ? lockedAnswers[currentItem.knowledgeItemId] ?? "" : "";

    const stats = useMemo(() => ({
        again: results.filter((item) => item.rating === 1).length,
        hard: results.filter((item) => item.rating === 2).length,
        good: results.filter((item) => item.rating === 3).length,
        easy: results.filter((item) => item.rating === 4).length,
    }), [results]);

    const handleFinishAnswering = () => {
        answeringDurationRef.current = Math.max(
            0,
            Math.floor((Date.now() - answeringStartedAtRef.current) / 1000)
        );
        setLockedAnswers({});
        setRatingIndex(0);
        setError(null);
        setPhase("rating");
    };

    const handleSubmitRating = async (rating: number) => {
        if (!currentItem || submitting) return;

        setSubmitting(true);
        setError(null);

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
                knowledgeItemId: currentItem.knowledgeItemId,
                rating,
                answerText: currentAnswer || null,
                durationSeconds: answeringDurationRef.current,
            });

            const nextResults = [
                ...results,
                {
                    knowledgeItemId: currentItem.knowledgeItemId,
                    prompt: currentItem.promptPreview,
                    rating,
                    nextReviewAt: result.reviewResult.nextReviewAt,
                    scheduledDays: result.reviewResult.scheduledDays,
                },
            ];

            setResults(nextResults);

            const nextIndex = ratingIndex + 1;

            if (nextIndex >= items.length) {
                setPhase("done");
            } else {
                setRatingIndex(nextIndex);
                setPhase("rating");
            }
        } catch (err: unknown) {
            const msg = (err as { message?: string })?.message || "提交失败";
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRestart = () => {
        void loadSessionItems();
    };

    if (loading) {
        return (
            <main className="min-h-screen p-4 md:p-8 bg-background">
                <div className="max-w-5xl mx-auto text-center py-12 text-muted-foreground">加载中...</div>
            </main>
        );
    }

    if (error && items.length === 0) {
        return (
            <main className="min-h-screen p-4 md:p-8 bg-background">
                <div className="max-w-5xl mx-auto text-center py-12 space-y-4">
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

    if (items.length === 0) {
        return (
            <main className="min-h-screen p-4 md:p-8 bg-background">
                <div className="max-w-5xl mx-auto text-center py-12 space-y-4">
                    <p className="text-muted-foreground">当前没有可抽背的知识点</p>
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

    if (phase === "done") {
        return (
            <main className="min-h-screen p-4 md:p-8 bg-background">
                <div className="max-w-5xl mx-auto space-y-6">
                    <div className="flex items-center justify-between">
                        <h1 className="text-2xl font-bold tracking-tight">本轮抽背完成</h1>
                        <Link href="/knowledge/review">
                            <Button variant="outline" size="sm">
                                <ArrowLeft className="mr-1 h-4 w-4" />返回今日复习
                            </Button>
                        </Link>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">本轮统计</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5 text-center">
                                <div>
                                    <div className="text-2xl font-bold">{results.length}</div>
                                    <div className="text-xs text-muted-foreground">总数量</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-red-500">{stats.again}</div>
                                    <div className="text-xs text-muted-foreground">Again</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-orange-500">{stats.hard}</div>
                                    <div className="text-xs text-muted-foreground">Hard</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-green-500">{stats.good}</div>
                                    <div className="text-xs text-muted-foreground">Good</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-blue-500">{stats.easy}</div>
                                    <div className="text-xs text-muted-foreground">Easy</div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-3">
                        {results.map((result, index) => (
                            <Card key={result.knowledgeItemId}>
                                <CardContent className="pt-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="font-medium text-sm flex-1 [&_p]:m-0 [&_.katex]:text-sm">
                                            <MarkdownRenderer content={`${index + 1}. ${result.prompt}`} />
                                        </div>
                                        <Badge
                                            variant={
                                                result.rating === 1
                                                    ? "destructive"
                                                    : result.rating === 2
                                                        ? "outline"
                                                        : result.rating === 3
                                                            ? "secondary"
                                                            : "default"
                                            }
                                        >
                                            {ratingOptions.find((option) => option.value === result.rating)?.shortLabel}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        下次复习: {new Date(result.nextReviewAt).toLocaleDateString("zh-CN")} · {result.scheduledDays} 天
                                    </p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
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

    if (phase === "rating" && !currentItem) {
        return (
            <main className="min-h-screen p-4 md:p-8 bg-background">
                <div className="max-w-4xl mx-auto text-center py-12 space-y-4">
                    <p className="text-muted-foreground">当前评分题目加载失败，请重新开始本轮抽背。</p>
                    <div className="flex justify-center gap-2">
                        <Button type="button" onClick={handleRestart} variant="outline">
                            <RotateCcw className="mr-1 h-4 w-4" />再来一组
                        </Button>
                        <Link href="/knowledge/review">
                            <Button type="button" variant="outline">返回今日复习</Button>
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    if (phase === "rating" && currentItem) {
        return (
            <main className="min-h-screen p-4 md:p-8 bg-background">
                <div className="max-w-4xl mx-auto space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">逐个评分</h1>
                            <p className="text-muted-foreground text-sm">
                                第 {ratingIndex + 1} / {items.length} 条
                            </p>
                        </div>
                        <Link href="/knowledge/review">
                            <Button type="button" variant="outline" size="sm">
                                <ArrowLeft className="mr-1 h-4 w-4" />返回今日复习
                            </Button>
                        </Link>
                    </div>

                    <Card>
                        <CardHeader>
                            <div className="flex flex-wrap gap-2">
                                {currentItem.source && (
                                    <Badge variant="outline" className="font-mono text-xs">#{currentItem.source}</Badge>
                                )}
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
                                <Badge variant={currentItem.sessionKind === "due" ? "default" : "outline"} className="text-xs">
                                    {currentItem.sessionKind === "due" ? "到期复习" : "新卡片"}
                                </Badge>
                                {currentItem.due && (
                                    <Badge variant="outline" className="text-xs">
                                        到期: {new Date(currentItem.due).toLocaleDateString("zh-CN")}
                                    </Badge>
                                )}
                            </div>
                            <CardTitle className="text-base">知识点内容</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <MarkdownRenderer content={currentItem.promptPreview} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">你的默写内容</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm min-h-24">
                                {currentAnswer || "（本条未填写）"}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">四级评分</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {error && <p className="text-destructive text-sm mb-2">{error}</p>}
                            <div className="grid grid-cols-2 gap-3">
                                {ratingOptions.map((option) => (
                                    <Button
                                        key={option.value}
                                        type="button"
                                        variant={option.variant}
                                        className="h-auto py-3 text-sm"
                                        disabled={submitting}
                                        onClick={() => handleSubmitRating(option.value)}
                                    >
                                        {option.label}
                                    </Button>
                                ))}
                            </div>
                            {submitting && (
                                <p className="text-center text-muted-foreground mt-2">提交中...</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen p-4 md:p-8 bg-background">
            <div className="max-w-5xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">开始抽背</h1>
                        <p className="text-muted-foreground text-sm">
                            本轮共 {items.length} 条，默写完成后再逐个评分
                        </p>
                    </div>
                        <Link href="/knowledge/review">
                            <Button type="button" variant="outline" size="sm">
                                <ArrowLeft className="mr-1 h-4 w-4" />返回今日复习
                            </Button>
                        </Link>
                </div>

                <div className="space-y-4">
                    {items.map((item, index) => (
                        <Card key={item.knowledgeItemId}>
                            <CardHeader>
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <CardTitle className="text-base">第 {index + 1} 条</CardTitle>
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {item.source && (
                                                <Badge variant="outline" className="font-mono text-xs">#{item.source}</Badge>
                                            )}
                                            {item.subject && (
                                                <Badge variant="secondary" className="text-xs">
                                                    {item.subject.name}
                                                </Badge>
                                            )}
                                            {item.tag && (
                                                <Badge variant="outline" className="text-xs">
                                                    {item.tag.name}
                                                </Badge>
                                            )}
                                            <Badge variant={item.sessionKind === "due" ? "default" : "outline"} className="text-xs">
                                                {item.sessionKind === "due" ? "到期复习" : "新卡片"}
                                            </Badge>
                                            {item.due && (
                                                <Badge variant="outline" className="text-xs">
                                                    到期: {new Date(item.due).toLocaleDateString("zh-CN")}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <p className="text-sm text-muted-foreground">知识点内容</p>
                                    <MarkdownRenderer content={item.promptPreview} />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <div className="flex justify-center">
                    <Button type="button" onClick={handleFinishAnswering} size="lg">
                        默写完成，开始评分
                    </Button>
                </div>
            </div>
        </main>
    );
}
