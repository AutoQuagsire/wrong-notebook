"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Brain, Play } from "lucide-react";

interface TodayItem {
    knowledgeItemId: string;
    reviewStateId?: string;
    promptPreview: string;
    answer: string;
    detail: string | null;
    subject: { id: string; name: string } | null;
    tag: { id: string; name: string } | null;
    due?: string;
    lastReview?: string | null;
    reps?: number;
    lapses?: number;
    state?: string;
    scheduledDays?: number;
    overdueDays?: number;
}

interface TodayResult {
    dueItems: TodayItem[];
    newItems: TodayItem[];
    stats: {
        dueCount: number;
        overdueCount: number;
        newCount: number;
        limit: number;
        generatedAt: string;
        upcoming: { date: string; count: number }[];
    };
}

export default function KnowledgeReviewPage() {
    const [data, setData] = useState<TodayResult | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchToday = async () => {
        setLoading(true);
        try {
            const result = await apiClient.get<TodayResult>(
                "/api/knowledge/review/today?includeNew=true&limit=50"
            );
            setData(result);
        } catch (error) {
            console.error("Failed to load today review:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchToday(); }, []);

    if (loading) return <div className="p-8 text-center text-muted-foreground">加载中...</div>;
    if (!data) return <div className="p-8 text-center text-muted-foreground">加载失败</div>;

    const { dueItems, newItems, stats } = data;

    return (
        <main className="min-h-screen p-4 md:p-8 bg-background">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">今日复习</h1>
                        <p className="text-muted-foreground text-sm">
                            到期 {stats.dueCount} · 逾期 {stats.overdueCount} · 新卡片 {stats.newCount}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {stats.dueCount > 0 && (
                            <Link href="/knowledge/review/session">
                                <Button>
                                    <Play className="mr-1 h-4 w-4" />开始抽背
                                </Button>
                            </Link>
                        )}
                        <Link href="/knowledge">
                            <Button variant="outline" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />返回列表</Button>
                        </Link>
                    </div>
                </div>

                {/* Upcoming 7-day preview */}
                <div className="flex gap-2 flex-wrap">
                    {stats.upcoming.map((day) => (
                        <Badge key={day.date} variant={day.count > 0 ? "default" : "secondary"} className="text-xs">
                            {day.date.slice(5)}: {day.count}
                        </Badge>
                    ))}
                </div>

                {/* Due items */}
                {dueItems.length > 0 && (
                    <div>
                        <h2 className="text-lg font-semibold mb-3">待复习 ({dueItems.length})</h2>
                        <div className="grid gap-3 md:grid-cols-2">
                            {dueItems.map((item) => (
                                <Link key={item.knowledgeItemId} href={`/knowledge/review/${item.knowledgeItemId}`}>
                                    <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                                        <CardContent className="pt-4">
                                            <p className="font-medium line-clamp-2 mb-2">{item.promptPreview}</p>
                                            <div className="flex flex-wrap gap-1 mb-2">
                                                {item.subject && <Badge variant="secondary" className="text-xs">{item.subject.name}</Badge>}
                                                {item.tag && <Badge variant="outline" className="text-xs">{item.tag.name}</Badge>}
                                                {item.overdueDays ? <Badge variant="destructive" className="text-xs">逾期 {item.overdueDays} 天</Badge> : null}
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                state: {item.state} · reps: {item.reps} · lapses: {item.lapses}
                                            </p>
                                        </CardContent>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* New items */}
                {newItems.length > 0 && (
                    <div>
                        <h2 className="text-lg font-semibold mb-3">新卡片 ({newItems.length})</h2>
                        <div className="grid gap-3 md:grid-cols-2">
                            {newItems.map((item) => (
                                <Link key={item.knowledgeItemId} href={`/knowledge/review/${item.knowledgeItemId}`}>
                                    <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                                        <CardContent className="pt-4">
                                            <p className="font-medium line-clamp-2 mb-2">{item.promptPreview}</p>
                                            <div className="flex flex-wrap gap-1">
                                                {item.subject && <Badge variant="secondary" className="text-xs">{item.subject.name}</Badge>}
                                                {item.tag && <Badge variant="outline" className="text-xs">{item.tag.name}</Badge>}
                                                <Badge variant="outline" className="text-xs">新</Badge>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty state */}
                {dueItems.length === 0 && newItems.length === 0 && (
                    <div className="text-center py-12 space-y-4">
                        <p className="text-muted-foreground">没有待复习的知识点</p>
                        <Link href="/knowledge">
                            <Button>返回知识点列表</Button>
                        </Link>
                    </div>
                )}
            </div>
        </main>
    );
}
