"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";
import { PracticeRecordData } from "@/types/api";

export default function ReviewHistoryPage() {
    const params = useParams();
    const errorItemId = typeof params.errorItemId === "string" ? params.errorItemId : "";

    const [records, setRecords] = useState<PracticeRecordData[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!errorItemId) {
            queueMicrotask(() => setLoading(false));
            return;
        }

        let cancelled = false;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true);
        setLoadError(null);

        apiClient.get<PracticeRecordData[]>("/api/practice/record", {
            params: { errorItemId, practiceType: "ORIGINAL_REVIEW" },
        })
            .then(data => { if (!cancelled) setRecords(data); })
            .catch(() => { if (!cancelled) setLoadError("加载历史作答失败"); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [errorItemId]);

    const ratingLabels: Record<number, { label: string; sublabel: string }> = {
        1: { label: "不会", sublabel: "Again" },
        2: { label: "困难", sublabel: "Hard" },
        3: { label: "正常掌握", sublabel: "Good" },
        4: { label: "非常熟练", sublabel: "Easy" },
    };

    function formatRating(record: PracticeRecordData): string {
        if (record.rating == null) return "未评分";
        const r = ratingLabels[record.rating];
        return r ? `${r.label} · ${r.sublabel}` : "未评分";
    }

    function formatDateTime(iso: string): string {
        return new Date(iso).toLocaleString("zh-CN");
    }

    function formatDuration(seconds: number): string {
        const s = Math.max(0, seconds);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const rs = s % 60;
        if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(rs).padStart(2, "0")}`;
        return `${String(m).padStart(2, "0")}:${String(rs).padStart(2, "0")}`;
    }

    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto space-y-6 p-4 pb-8">
                <div className="flex items-center gap-3">
                    <Link href={`/review/${errorItemId}`}>
                        <Button variant="ghost">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            返回
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <History className="h-6 w-6" />
                            历史作答
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            查看该题过往复习记录和手写作答照片
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : loadError ? (
                    <Card>
                        <CardContent className="py-8 text-center">
                            <p className="text-sm text-red-600">{loadError}</p>
                        </CardContent>
                    </Card>
                ) : records.length === 0 ? (
                    <Card>
                        <CardContent className="py-8 text-center">
                            <p className="text-muted-foreground">暂无历史作答记录。</p>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <p className="text-sm text-muted-foreground">
                            共 {records.length} 次复习记录
                        </p>
                        <div className="space-y-3">
                            {records.map(record => (
                                <Link key={record.id} href={`/review/${errorItemId}/history/${record.id}`}>
                                    <Card className="cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all">
                                        <CardHeader className="pb-2">
                                            <div className="flex items-center justify-between">
                                                <CardTitle className="text-base font-medium">
                                                    {formatRating(record)}
                                                </CardTitle>
                                                <span className="text-xs text-muted-foreground">
                                                    {formatDateTime(record.createdAt)}
                                                </span>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                <span>耗时：{formatDuration(record.durationSeconds || 0)}</span>
                                                {record.answerText && <span>有文字记录</span>}
                                                {record.answerImageUrl && <span>有手写照片</span>}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}
