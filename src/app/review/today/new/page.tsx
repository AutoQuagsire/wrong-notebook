"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, BookOpen, Loader2, PlayCircle, RefreshCw, Sparkles } from "lucide-react";
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

function NewItemCard({ item }: { item: ReviewTodayItem }) {
    return (
        <Card className="border-dashed border-muted-foreground/30 transition-all hover:border-primary/40 hover:shadow-md">
            <CardContent className="flex flex-col gap-4 overflow-hidden p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2 overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2">
                        {item.subject ? <Badge variant="outline" className="shrink-0">{item.subject.name}</Badge> : null}
                        <Badge variant="secondary" className="bg-blue-50 text-blue-700">新错题</Badge>
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
                </div>
                <div className="shrink-0 pt-1">
                    <Link href={`/review/${item.errorItemId}?from=today`}>
                        <Button size="sm" variant="outline" className="w-full sm:w-auto">
                            <PlayCircle className="mr-1.5 h-4 w-4" />
                            开始复习
                        </Button>
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}

export default function ReviewTodayNewPage() {
    const [data, setData] = useState<ReviewTodayResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await apiClient.get<ReviewTodayResponse>("/api/review/today", {
                params: { limit: "20", includeNew: "true" },
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

    const newItems = data?.newItems ?? [];

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
                                新错题候选
                            </h1>
                            <p className="mt-1 break-words text-sm text-muted-foreground">
                                这里展示可优先纳入复习节奏的新错题候选。
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
                ) : newItems.length === 0 ? (
                    <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                            <Sparkles className="h-10 w-10 text-muted-foreground" />
                            <div className="space-y-1">
                                <p className="text-lg font-medium">当前没有新错题候选</p>
                                <p className="text-sm text-muted-foreground">可以返回总览页查看今日计划或已逾期题。</p>
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
                            <h2 className="flex items-center gap-2 text-lg font-semibold text-muted-foreground">
                                <Sparkles className="h-4 w-4 text-blue-500" />
                                新错题候选
                            </h2>
                            <span className="text-sm text-muted-foreground">{newItems.length} 条</span>
                        </div>
                        <div className="space-y-3">
                            {newItems.map((item) => (
                                <NewItemCard key={item.errorItemId} item={item} />
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </main>
    );
}
