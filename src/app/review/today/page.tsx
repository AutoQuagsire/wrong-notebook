"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    BookOpen,
    CheckCircle2,
    Loader2,
    PlayCircle,
    RefreshCw,
    Sparkles,
    AlertTriangle,
    House,
    CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackButton } from "@/components/ui/back-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiClient, ApiError } from "@/lib/api-client";
import type { ReviewTodayResponse } from "@/types/api";

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

export default function ReviewTodayPage() {
    const [data, setData] = useState<ReviewTodayResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await apiClient.get<ReviewTodayResponse>("/api/review/today", {
                params: {
                    limit: "20",
                    includeNew: "false",
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
        fetchData();
    }, []);

    const handleRefresh = () => fetchData();

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
    const overdueItems = dueItems.filter((item) => (item.overdueDays ?? 0) > 0);
    const todayPlanItems = dueItems.filter((item) => (item.overdueDays ?? 0) <= 0);
    const hasDue = dueItems.length > 0;
    const firstReviewItem = todayPlanItems[0] ?? overdueItems[0];

    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto space-y-6 px-4 py-8 pb-20">
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap sm:items-center">
                    <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
                        <BackButton fallbackUrl="/" />
                        <div className="min-w-0">
                            <h1 className="flex min-w-0 items-center gap-2 text-2xl font-bold">
                                <BookOpen className="h-6 w-6 shrink-0" />
                                今日复习
                            </h1>
                            <p className="mt-1 break-words text-sm text-muted-foreground">
                                根据 FSRS 到期时间安排今天需要复习的错题
                            </p>
                        </div>
                    </div>
                    <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:flex-none">
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
                    <div className="grid grid-cols-3 gap-2 sm:gap-4">
                        <Link
                            href="/review/today/plan"
                            className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            <Card className="cursor-pointer transition hover:border-primary/40 hover:bg-primary/5">
                                <CardHeader className="flex flex-row items-start justify-between space-y-0 px-3 pb-1 pt-3 sm:px-6 sm:pb-2 sm:pt-6">
                                    <CardTitle className="min-w-0 text-xs font-medium leading-4 text-muted-foreground sm:text-sm">
                                        今日计划
                                    </CardTitle>
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600 sm:h-4 sm:w-4" />
                                </CardHeader>
                                <CardContent className="px-3 pb-3 pt-0 sm:px-6 sm:pb-6">
                                    <div className="text-2xl font-bold leading-none sm:text-3xl">{todayPlanItems.length}</div>
                                </CardContent>
                            </Card>
                        </Link>
                        <Link
                            href="/review/today/overdue"
                            className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            <Card className="cursor-pointer transition hover:border-red-300 hover:bg-red-50/40">
                                <CardHeader className="flex flex-row items-start justify-between space-y-0 px-3 pb-1 pt-3 sm:px-6 sm:pb-2 sm:pt-6">
                                    <CardTitle className="min-w-0 text-xs font-medium leading-4 text-muted-foreground sm:text-sm">
                                        已逾期
                                    </CardTitle>
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500 sm:h-4 sm:w-4" />
                                </CardHeader>
                                <CardContent className="px-3 pb-3 pt-0 sm:px-6 sm:pb-6">
                                    <div className={`text-2xl font-bold leading-none sm:text-3xl ${overdueItems.length > 0 ? "text-red-600" : ""}`}>
                                        {overdueItems.length}
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                        <Link
                            href="/review/today/new"
                            className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            <Card className="cursor-pointer transition hover:border-primary/40 hover:bg-primary/5">
                                <CardHeader className="flex flex-row items-start justify-between space-y-0 px-3 pb-1 pt-3 sm:px-6 sm:pb-2 sm:pt-6">
                                    <CardTitle className="min-w-0 text-xs font-medium leading-4 text-muted-foreground sm:text-sm">
                                        新错题候选
                                    </CardTitle>
                                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-blue-500 sm:h-4 sm:w-4" />
                                </CardHeader>
                                <CardContent className="px-3 pb-3 pt-0 sm:px-6 sm:pb-6">
                                    <div className="text-2xl font-bold leading-none sm:text-3xl">{stats.newCount}</div>
                                </CardContent>
                            </Card>
                        </Link>
                    </div>
                )}

                {/* Upcoming 7-day preview */}
                {stats?.upcoming && stats.upcoming.length > 0 && (
                    <div className="flex justify-end">
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <CalendarDays className="mr-1.5 h-4 w-4" />
                                    未来复习安排
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-sm">
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                        <CalendarDays className="h-5 w-5 text-muted-foreground" />
                                        未来 7 天复习安排
                                    </DialogTitle>
                                </DialogHeader>
                                <div className="space-y-1 pt-2">
                                    {stats.upcoming.map((day) => (
                                        <div
                                            key={day.date}
                                            className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted/50"
                                        >
                                            <span className="text-muted-foreground">{day.date}</span>
                                            <span className="font-semibold tabular-nums">{day.count} 题</span>
                                        </div>
                                    ))}
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                )}

                {/* Primary action */}
                {hasDue && firstReviewItem && (
                    <Card className="border-primary/40 bg-primary/5">
                        <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
                            <div className="min-w-0 space-y-1">
                                <p className="font-medium">开始今日复习</p>
                                    <p className="text-sm text-muted-foreground">点击开始进入今日复习流程</p>
                            </div>
                            <Link href={`/review/${firstReviewItem.errorItemId}?from=today`} className="w-full">
                                <Button size="lg" className="h-14 w-full text-base font-semibold">
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
                            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                                {stats && stats.newCount > 0 && (
                                    <Link href="/review/today/new">
                                        <Button size="lg" className="w-full sm:w-auto">
                                        <Sparkles className="mr-2 h-4 w-4" />
                                        查看新错题候选
                                        </Button>
                                    </Link>
                                )}
                                <Link href="/notebooks">
                                    <Button variant="outline" className="w-full sm:w-auto">
                                        <BookOpen className="mr-2 h-4 w-4" />
                                        查看错题本
                                    </Button>
                                </Link>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </main>
    );
}
