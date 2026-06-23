"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, BookOpen, Clock3, Loader2, PlayCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BackButton } from "@/components/ui/back-button";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { apiClient, ApiError } from "@/lib/api-client";
import type { ReviewTodayItem, ReviewTodayResponse } from "@/types/api";

function getErrorMessage(error: unknown): string {
    if (error instanceof ApiError) {
        const data = error.data as { message?: string } | undefined;
        return data?.message || "请求失败";
    }
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return "加载失败";
}

function formatDate(iso?: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function StateBadge({ state }: { state?: string }) {
    if (!state) return null;
    const map: Record<string, { label: string; className: string }> = {
        New: { label: "新卡", className: "bg-gray-100 text-gray-700" },
        Learning: { label: "学习中", className: "bg-blue-100 text-blue-700" },
        Review: { label: "复习中", className: "bg-green-100 text-green-700" },
        Relearning: { label: "重学中", className: "bg-orange-100 text-orange-700" },
    };
    const info = map[state];
    if (!info) return <Badge variant="secondary">{state}</Badge>;
    return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${info.className}`}>{info.label}</span>;
}

function DueBadge({ due }: { due?: string }) {
    if (due && new Date(due) <= new Date()) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700">
                <Clock3 className="h-3 w-3" />
                今天到期
            </span>
        );
    }
    return null;
}

function DueItemCard({ item }: { item: ReviewTodayItem }) {
    return (
        <Card className="transition-all hover:border-primary/40 hover:shadow-md">
            <CardContent className="flex flex-col gap-4 overflow-hidden p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2 overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2">
                        {item.subject ? <Badge variant="secondary" className="shrink-0">{item.subject.name}</Badge> : null}
                        <StateBadge state={item.state} />
                        <DueBadge due={item.due} />
                    </div>
                    <div className="min-w-0 overflow-hidden break-words text-base font-medium leading-7 text-foreground line-clamp-3 [&_.katex]:text-[1.05em]">
                        <MarkdownRenderer content={item.questionPreview} />
                    </div>
                    {item.originalImageUrl ? (
                        <Image
                            src={item.originalImageUrl}
                            alt="题面缩略图"
                            width={640}
                            height={240}
                            unoptimized
                            className="max-h-40 w-full max-w-full rounded-md border object-contain sm:max-w-sm"
                        />
                    ) : null}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>复习 {item.reps ?? 0} 次</span>
                        <span>遗忘 {item.lapses ?? 0} 次</span>
                        <span>到期：{formatDate(item.due)}</span>
                    </div>
                </div>
                <div className="shrink-0 pt-1">
                    <Link href={`/review/${item.errorItemId}?from=today`}>
                        <Button size="sm" className="w-full sm:w-auto">
                            <PlayCircle className="mr-1.5 h-4 w-4" />
                            复习原题
                        </Button>
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}

export default function ReviewTodayPlanPage() {
    const [data, setData] = useState<ReviewTodayResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await apiClient.get<ReviewTodayResponse>("/api/review/today", {
                params: { limit: "20", includeNew: "false" },
            });
            setData(result);
        } catch (err: unknown) {
            setError(getErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const todayPlanItems = (data?.dueItems ?? []).filter((item) => (item.overdueDays ?? 0) <= 0);

    if (loading && !data) {
        return (
            <main className="min-h-screen bg-background">
                <div className="container mx-auto flex min-h-[60vh] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto space-y-6 px-4 py-8 pb-20">
                <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap sm:items-center">
                    <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
                        <BackButton fallbackUrl="/review/today" />
                        <div className="min-w-0">
                            <h1 className="flex min-w-0 items-center gap-2 text-2xl font-bold">
                                <BookOpen className="h-6 w-6 shrink-0" />
                                今日计划
                            </h1>
                            <p className="mt-1 break-words text-sm text-muted-foreground">
                                这里仅展示今天计划复习的题目，不包含已逾期题。
                            </p>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={fetchData} disabled={loading} title="刷新">
                        <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                </div>

                {error ? (
                    <Card className="border-red-200">
                        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                            <AlertTriangle className="h-10 w-10 text-red-500" />
                            <p className="text-lg font-medium text-red-700">{error}</p>
                            <Button variant="outline" onClick={fetchData}>重试</Button>
                        </CardContent>
                    </Card>
                ) : todayPlanItems.length === 0 ? (
                    <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                            <Clock3 className="h-10 w-10 text-muted-foreground" />
                            <div className="space-y-1">
                                <p className="text-lg font-medium">今天没有计划复习题</p>
                                <p className="text-sm text-muted-foreground">可以返回总览页查看已逾期题或新错题候选。</p>
                            </div>
                            <Link href="/review/today">
                                <Button variant="outline">
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    返回总览
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                ) : (
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">今日计划题目</h2>
                            <span className="text-sm text-muted-foreground">{todayPlanItems.length} 条</span>
                        </div>
                        <div className="space-y-3">
                            {todayPlanItems.map((item) => (
                                <DueItemCard key={item.errorItemId} item={item} />
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </main>
    );
}
