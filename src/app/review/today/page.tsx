"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
    BookOpen,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock3,
    Loader2,
    PlayCircle,
    RefreshCw,
    Sparkles,
    AlertTriangle,
    House,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/back-button";
import { apiClient, ApiError } from "@/lib/api-client";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import type { ReviewTodayResponse, ReviewTodayItem } from "@/types/api";

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
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${info.className}`}>
            {info.label}
        </span>
    );
}

function OverdueBadge({ overdueDays, due }: { overdueDays?: number; due?: string }) {
    if (overdueDays && overdueDays > 0) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                <AlertTriangle className="h-3 w-3" />
                逾期 {overdueDays} 天
            </span>
        );
    }
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
        <Card className={`transition-all hover:border-primary/40 hover:shadow-md ${item.overdueDays && item.overdueDays > 0 ? "border-red-200 bg-red-50/30" : ""}`}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                {/* Left: content */}
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        {item.subject ? (
                            <Badge variant="secondary" className="shrink-0">{item.subject.name}</Badge>
                        ) : null}
                        <StateBadge state={item.state} />
                        <OverdueBadge overdueDays={item.overdueDays} due={item.due} />
                    </div>
                    <div className="text-base font-medium leading-7 text-foreground line-clamp-3 overflow-hidden [&_.katex]:text-[1.05em]">
                        <MarkdownRenderer content={item.questionPreview} />
                    </div>
                    {item.originalImageUrl ? (
                        <Image
                            src={item.originalImageUrl}
                            alt="题面缩略图"
                            width={640}
                            height={240}
                            unoptimized
                            className="max-h-40 w-full max-w-md rounded-md border object-contain sm:max-w-sm"
                        />
                    ) : null}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>复习 {item.reps ?? 0} 次</span>
                        <span>遗忘 {item.lapses ?? 0} 次</span>
                        <span>到期：{formatDate(item.due)}</span>
                    </div>
                </div>
                {/* Right: button */}
                <div className="shrink-0 pt-1">
                    <Link href={`/review/${item.errorItemId}`}>
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

function NewItemCard({ item }: { item: ReviewTodayItem }) {
    return (
        <Card className="border-dashed border-muted-foreground/30 hover:border-primary/40 transition-all">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                        {item.subject ? (
                            <Badge variant="outline" className="shrink-0">{item.subject.name}</Badge>
                        ) : null}
                        <Badge variant="secondary" className="bg-blue-50 text-blue-700">新错题</Badge>
                    </div>
                    <div className="text-base font-medium leading-7 text-foreground line-clamp-3 overflow-hidden [&_.katex]:text-[1.05em]">
                        <MarkdownRenderer content={item.questionPreview} />
                    </div>
                </div>
                <div className="shrink-0 pt-1">
                    <Link href={`/review/${item.errorItemId}`}>
                        <Button size="sm" variant="outline">
                            <PlayCircle className="mr-1.5 h-4 w-4" />
                            开始复习
                        </Button>
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}

export default function ReviewTodayPage() {
    const [data, setData] = useState<ReviewTodayResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [includeNew, setIncludeNew] = useState(false);

    const fetchData = async (withNew: boolean) => {
        setLoading(true);
        setError(null);
        try {
            const result = await apiClient.get<ReviewTodayResponse>("/api/review/today", {
                params: {
                    limit: "20",
                    includeNew: withNew ? "true" : "false",
                },
            });
            setData(result);
        } catch (err: unknown) {
            setError(getErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData(includeNew);
    }, [includeNew]);

    // Auto-enable includeNew when first load shows no due items but newCount > 0
    const [autoExpanded, setAutoExpanded] = useState(false);
    useEffect(() => {
        if (!loading && data && !autoExpanded && includeNew === false) {
            const hasNoDue = (data.dueItems ?? []).length === 0;
            const hasNew = data.stats.newCount > 0;
            if (hasNoDue && hasNew) {
                setAutoExpanded(true);
                setIncludeNew(true);
            }
        }
    }, [loading, data, autoExpanded, includeNew]);

    const handleRefresh = () => fetchData(includeNew);

    const handleToggleIncludeNew = () => {
        setIncludeNew((prev) => !prev);
    };

    if (loading && !data) {
        return (
            <main className="min-h-screen bg-background">
                <div className="container mx-auto flex min-h-[60vh] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </main>
        );
    }

    if (error) {
        return (
            <main className="min-h-screen bg-background">
                <div className="container mx-auto space-y-6 px-4 py-8">
                    <div className="flex items-center gap-4">
                        <BackButton fallbackUrl="/" />
                        <h1 className="text-2xl font-bold">今日复习</h1>
                    </div>
                    <Card className="border-red-200">
                        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                            <AlertTriangle className="h-10 w-10 text-red-500" />
                            <p className="text-lg font-medium text-red-700">{error}</p>
                            <Button variant="outline" onClick={handleRefresh}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                重试
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </main>
        );
    }

    const stats = data?.stats;
    const dueItems = data?.dueItems ?? [];
    const newItems = data?.newItems ?? [];
    const hasDue = dueItems.length > 0;
    const firstDueItem = dueItems[0];

    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto space-y-6 px-4 py-8 pb-20">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <BackButton fallbackUrl="/" />
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2">
                                <BookOpen className="h-6 w-6" />
                                今日复习
                            </h1>
                            <p className="text-sm text-muted-foreground mt-1">
                                根据 FSRS 到期时间安排今天需要复习的错题
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={loading} title="刷新">
                            <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
                        </Button>
                        <Link href="/">
                            <Button variant="ghost" size="icon">
                                <House className="h-5 w-5" />
                            </Button>
                        </Link>
                    </div>
                </div>

                {/* Stats Cards */}
                {stats && (
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">今日待复习</CardTitle>
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold">{stats.dueCount}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">已逾期</CardTitle>
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                            </CardHeader>
                            <CardContent>
                                <div className={`text-3xl font-bold ${stats.overdueCount > 0 ? "text-red-600" : ""}`}>
                                    {stats.overdueCount}
                                </div>
                            </CardContent>
                        </Card>
                        <Card className={includeNew ? "border-primary/40 bg-primary/5" : ""}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">新错题候选</CardTitle>
                                <Sparkles className="h-4 w-4 text-blue-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold">{stats.newCount}</div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Primary action */}
                {hasDue && firstDueItem && (
                    <Card className="border-primary/40 bg-primary/5">
                        <CardContent className="flex items-center justify-between py-5">
                            <div className="space-y-1">
                                <p className="font-medium">开始今日复习</p>
                                <p className="text-sm text-muted-foreground">
                                    第一题：{firstDueItem.subject?.name || "未知"} &mdash; {firstDueItem.questionPreview.slice(0, 40)}&hellip;
                                </p>
                            </div>
                            <Link href={`/review/${firstDueItem.errorItemId}`}>
                                <Button size="lg">
                                    <PlayCircle className="mr-2 h-5 w-5" />
                                    开始复习
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                )}

                {/* Empty state */}
                {!hasDue && !loading && (
                    <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                            <CheckCircle2 className="h-10 w-10 text-green-500" />
                            <div className="space-y-1">
                                <p className="text-lg font-medium">今天暂时没有到期错题</p>
                                {stats && stats.newCount > 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                        你还有 <span className="font-semibold text-foreground">{stats.newCount}</span> 道新错题候选，可以先开始一题，建立复习节奏。
                                    </p>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        所有错题都在掌握中，明天再来看看。你也可以查看错题本。
                                    </p>
                                )}
                            </div>
                            <div className="flex gap-3 pt-2">
                                {stats && stats.newCount > 0 && !includeNew && (
                                    <Button size="lg" onClick={handleToggleIncludeNew}>
                                        <Sparkles className="mr-2 h-4 w-4" />
                                        查看新错题候选
                                    </Button>
                                )}
                                <Link href="/notebooks">
                                    <Button variant="outline">
                                        <BookOpen className="mr-2 h-4 w-4" />
                                        查看错题本
                                    </Button>
                                </Link>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Due items list */}
                {hasDue && (
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">到期错题</h2>
                            <span className="text-sm text-muted-foreground">{dueItems.length} 条</span>
                        </div>
                        <div className="space-y-3">
                            {dueItems.map((item) => (
                                <DueItemCard key={item.errorItemId} item={item} />
                            ))}
                        </div>
                    </section>
                )}

                {/* Include new toggle */}
                <div className="flex justify-center">
                    <Button
                        variant="ghost"
                        onClick={handleToggleIncludeNew}
                        className="text-sm text-muted-foreground hover:text-foreground"
                    >
                        {includeNew ? (
                            <>
                                <ChevronUp className="mr-1.5 h-4 w-4" />
                                隐藏新错题候选
                            </>
                        ) : (
                            <>
                                <ChevronDown className="mr-1.5 h-4 w-4" />
                                显示新错题候选
                            </>
                        )}
                    </Button>
                </div>

                {/* New items */}
                {includeNew && (
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-muted-foreground flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-blue-500" />
                                新错题候选
                            </h2>
                            <span className="text-sm text-muted-foreground">{newItems.length} 条</span>
                        </div>
                        {newItems.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">没有新错题</p>
                        ) : (
                            <div className="space-y-3">
                                {newItems.map((item) => (
                                    <NewItemCard key={item.errorItemId} item={item} />
                                ))}
                            </div>
                        )}
                    </section>
                )}
            </div>
        </main>
    );
}
