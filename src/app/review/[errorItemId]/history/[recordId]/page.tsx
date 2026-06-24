"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { apiClient } from "@/lib/api-client";
import { PracticeRecordData } from "@/types/api";

export default function ReviewHistoryDetailPage() {
    const params = useParams();
    const errorItemId = typeof params.errorItemId === "string" ? params.errorItemId : "";
    const recordId = typeof params.recordId === "string" ? params.recordId : "";

    const [record, setRecord] = useState<PracticeRecordData | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!errorItemId || !recordId) {
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
            .then(data => {
                if (cancelled) return;
                const found = data.find(r => r.id === recordId);
                if (found) {
                    setRecord(found);
                } else {
                    setLoadError("未找到该次作答记录");
                }
            })
            .catch(() => { if (!cancelled) setLoadError("加载作答记录失败"); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [errorItemId, recordId]);

    const ratingLabels: Record<number, { label: string; sublabel: string }> = {
        1: { label: "不会", sublabel: "Again" },
        2: { label: "困难", sublabel: "Hard" },
        3: { label: "正常掌握", sublabel: "Good" },
        4: { label: "非常熟练", sublabel: "Easy" },
    };

    function formatRating(rating?: number | null): string {
        if (rating == null) return "未评分";
        const r = ratingLabels[rating];
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
                    <Link href={`/review/${errorItemId}/history`}>
                        <Button variant="ghost">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            返回历史作答
                        </Button>
                    </Link>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : loadError || !record ? (
                    <Card>
                        <CardContent className="py-8 text-center">
                            <p className="text-sm text-red-600">{loadError || "未找到该次作答记录"}</p>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <Card>
                            <CardHeader>
                                <CardTitle>历史作答详情</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                                    <span className="font-semibold text-lg">{formatRating(record.rating)}</span>
                                    <span className="text-muted-foreground">{formatDateTime(record.createdAt)}</span>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    独立作答耗时：{formatDuration(record.durationSeconds || 0)}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>本次文字记录</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {record.answerText ? (
                                    <div className="max-h-80 overflow-auto">
                                        <MarkdownRenderer content={record.answerText} />
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">本次未记录文字</p>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>本次手写作答照片</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {record.answerImageUrl ? (
                                    <img
                                        src={record.answerImageUrl}
                                        alt="历史作答照片"
                                        className="max-h-64 sm:max-h-96 md:max-h-[70vh] w-full rounded-lg border object-contain"
                                    />
                                ) : (
                                    <p className="text-sm text-muted-foreground">本次未上传照片</p>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </main>
    );
}
