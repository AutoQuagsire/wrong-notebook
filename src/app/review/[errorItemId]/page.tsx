"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, ChevronDown, Eye, History, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { apiClient, ApiError } from "@/lib/api-client";
import { processImageFile } from "@/lib/image-utils";
import { PracticeRecordData } from "@/types/api";

interface ReviewItem {
    id: string;
    questionText?: string | null;
    ocrText?: string | null;
    answerText?: string | null;
    analysis?: string | null;
    wrongAnswerText?: string | null;
    mistakeAnalysis?: string | null;
    originalImageUrl?: string | null;
    userNotes?: string | null;
    subject?: {
        id: string;
        name: string;
    } | null;
}

const ratingOptions = [
    { value: 1, label: "不会", sublabel: "Again", variant: "destructive" as const },
    { value: 2, label: "困难", sublabel: "Hard", variant: "outline" as const },
    { value: 3, label: "正常掌握", sublabel: "Good", variant: "secondary" as const },
    { value: 4, label: "非常熟练", sublabel: "Easy", variant: "default" as const },
];

function formatDuration(seconds: number): string {
    const safeSeconds = Math.max(0, seconds);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const remainingSeconds = safeSeconds % 60;

    if (hours > 0) {
        return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
    }

    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof ApiError) {
        const data = error.data as { message?: string } | undefined;
        return data?.message || fallback;
    }

    if (error instanceof Error && error.message) {
        return error.message;
    }

    return fallback;
}

function getRatingLabel(rating?: number | null): string {
    const option = ratingOptions.find(option => option.value === rating);
    if (!option) return "未评分";
    return `${option.label} · ${option.sublabel}`;
}

function formatReviewDate(value?: string | null): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export default function ReviewPage() {
    const params = useParams();
    const router = useRouter();
    const errorItemId = typeof params.errorItemId === "string" ? params.errorItemId : "";
    const startTimeRef = useRef(Date.now());

    const [showOriginalImage, setShowOriginalImage] = useState(false);

    const [item, setItem] = useState<ReviewItem | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [answerText, setAnswerText] = useState("");
    const [answerImageUrl, setAnswerImageUrl] = useState<string | null>(null);
    const [imageProcessing, setImageProcessing] = useState(false);
    const [imageError, setImageError] = useState<string | null>(null);

    const [userNotes, setUserNotes] = useState("");
    const [notesSaving, setNotesSaving] = useState(false);
    const [notesSaved, setNotesSaved] = useState(false);

    const [answerVisible, setAnswerVisible] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [lockedDurationSeconds, setLockedDurationSeconds] = useState<number | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [savedRecord, setSavedRecord] = useState<PracticeRecordData | null>(null);

    const displayQuestion = useMemo(() => {
        if (!item) {
            return "";
        }

        return item.questionText || item.ocrText || "暂无题目内容";
    }, [item]);

    useEffect(() => {
        startTimeRef.current = Date.now();
        setElapsedSeconds(0);
        setLockedDurationSeconds(null);
        setAnswerVisible(false);
        setSavedRecord(null);
        setSubmitError(null);

        if (!errorItemId) {
            setLoadError("缺少错题 ID");
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setLoadError(null);

        apiClient.get<ReviewItem>(`/api/error-items/${errorItemId}`)
            .then(data => {
                if (!cancelled) {
                    setItem(data);
                    setUserNotes(data.userNotes || "");
                }
            })
            .catch(error => {
                if (!cancelled) {
                    setLoadError(getErrorMessage(error, "加载复习内容失败"));
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [errorItemId]);

    useEffect(() => {
        if (!item || answerVisible) {
            return;
        }

        const timer = window.setInterval(() => {
            setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000)));
        }, 1000);

        return () => {
            window.clearInterval(timer);
        };
    }, [answerVisible, item]);

    // 四级自评提交成功后自动返回上一页面
    useEffect(() => {
        if (!savedRecord) return;
        const timer = setTimeout(() => {
            router.back();
        }, 1500);
        return () => clearTimeout(timer);
    }, [savedRecord, router]);

    const handleSaveNotes = async () => {
        if (notesSaving || !errorItemId) return;
        setNotesSaving(true);
        setNotesSaved(false);
        try {
            await apiClient.post(`/api/error-items/${errorItemId}/notes`, { userNotes });
            setNotesSaved(true);
            setTimeout(() => setNotesSaved(false), 2000);
        } catch (error) {
            console.warn("Notes save failed on review page:", error);
        } finally {
            setNotesSaving(false);
        }
    };

    const handleRevealAnswer = () => {
        if (answerVisible) {
            return;
        }

        const duration = Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000));
        setElapsedSeconds(duration);
        setLockedDurationSeconds(duration);
        setAnswerVisible(true);
        setSubmitError(null);
    };

    const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        setImageProcessing(true);
        setImageError(null);

        try {
            const processedImage = await processImageFile(file);
            setAnswerImageUrl(processedImage);
        } catch (error) {
            setAnswerImageUrl(null);
            setImageError(getErrorMessage(error, "作答照片处理失败，请换一张图片再试。"));
        } finally {
            setImageProcessing(false);
            event.target.value = "";
        }
    };

    const removeAnswerImage = () => {
        setAnswerImageUrl(null);
        setImageError(null);
    };

    const handleSubmitRating = async (rating: number) => {
        if (!answerVisible || isSubmitting || savedRecord || !errorItemId) {
            return;
        }

        setIsSubmitting(true);
        setSubmitError(null);

        try {
            const record = await apiClient.post<PracticeRecordData>("/api/practice/record", {
                errorItemId,
                practiceType: "ORIGINAL_REVIEW",
                rating,
                answerText,
                answerImageUrl,
                durationSeconds: lockedDurationSeconds ?? elapsedSeconds,
                revealedAnswer: true,
            });

            setSavedRecord(record);
        } catch (error) {
            setSubmitError(getErrorMessage(error, "保存复习记录失败"));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <main className="min-h-screen bg-background">
                <div className="container mx-auto flex min-h-screen items-center justify-center p-4">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </main>
        );
    }

    if (loadError || !item) {
        return (
            <main className="min-h-screen bg-background">
                <div className="container mx-auto space-y-6 p-4">
                    <Button variant="ghost" onClick={() => router.back()}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        返回
                    </Button>
                    <Card>
                        <CardHeader>
                            <CardTitle>无法进入原题复习</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-muted-foreground">{loadError || "未找到对应错题"}</p>
                            <Link href="/notebooks">
                                <Button>返回错题本</Button>
                            </Link>
                        </CardContent>
                    </Card>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto space-y-6 p-4 pb-8">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" onClick={() => router.back()}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            返回
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold">复习原题</h1>
                            <p className="text-sm text-muted-foreground">
                                仅记录本次复习过程，不自动判题，不更新掌握状态。
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm">
                        <Clock3 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">独立作答计时</span>
                        <span className="font-semibold">{formatDuration(lockedDurationSeconds ?? elapsedSeconds)}</span>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>原题内容</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {item.originalImageUrl ? (
                            <div className="border border-dashed rounded-lg p-3 bg-muted/20">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full justify-between text-sm font-medium text-muted-foreground hover:text-foreground"
                                    onClick={() => setShowOriginalImage(v => !v)}
                                >
                                    <span className="flex items-center gap-1.5">
                                        <ChevronDown className={`h-4 w-4 transition-transform ${showOriginalImage ? "rotate-180" : ""}`} />
                                        原错题图片{showOriginalImage ? " - 收起原图" : " - 展开原图"}
                                    </span>
                                </Button>
                                {showOriginalImage && (
                                    <img
                                        src={item.originalImageUrl}
                                        alt="原错题图片"
                                        className="mt-2 max-h-[420px] w-full rounded-lg border object-contain"
                                    />
                                )}
                            </div>
                        ) : null}
                        <div className="review-question-content">
                        <MarkdownRenderer content={displayQuestion} />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <span>📝</span>
                            <span>本题笔记</span>
                            <span className="text-xs font-normal text-muted-foreground">（持久保存，下次复习也能看到）</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Textarea
                            value={userNotes}
                            onChange={(event) => setUserNotes(event.target.value)}
                            placeholder="记录本题的关键思路、易错点、技巧总结、关联知识点等..."
                            rows={4}
                        />
                        <div className="flex items-center gap-3">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleSaveNotes}
                                disabled={notesSaving}
                            >
                                {notesSaving ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : notesSaved ? (
                                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                ) : null}
                                {notesSaving ? "保存中..." : notesSaved ? "已保存" : "保存笔记"}
                            </Button>
                            {notesSaved && (
                                <span className="text-xs text-green-600">笔记已保存</span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>本次作答记录（可选）</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Textarea
                            value={answerText}
                            onChange={(event) => setAnswerText(event.target.value)}
                            placeholder="可选：记录你的最终答案、关键步骤或错误想法。如果你是在纸上完成，可以留空。"
                            rows={6}
                        />

                        <div className="space-y-3 rounded-lg border border-dashed p-4">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <ImagePlus className="h-4 w-4" />
                                <span>可选：上传本次手写作答照片，便于后续回看或辅助分析。</span>
                            </div>
                            <Input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                onChange={handleImageUpload}
                                disabled={imageProcessing}
                            />
                            {imageProcessing ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>正在处理作答照片...</span>
                                </div>
                            ) : null}
                            {imageError ? (
                                <p className="text-sm text-red-600">{imageError}</p>
                            ) : null}
                            {answerImageUrl ? (
                                <div className="space-y-3">
                                    <img
                                        src={answerImageUrl}
                                        alt="本次作答照片预览"
                                        className="max-h-80 w-full rounded-lg border object-contain"
                                    />
                                    <Button variant="outline" size="sm" onClick={removeAnswerImage}>
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        移除照片
                                    </Button>
                                </div>
                            ) : null}
                        </div>
                    </CardContent>
                </Card>

                {!answerVisible ? (
                    <Card>
                        <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:justify-between">
                            <div className="space-y-1">
                                <p className="font-medium">作答完成后再查看答案</p>
                                <p className="text-sm text-muted-foreground">
                                    点击后会停止独立作答计时，并显示标准答案、解析和错因。
                                </p>
                            </div>
                            <Button size="lg" onClick={handleRevealAnswer}>
                                <Eye className="mr-2 h-4 w-4" />
                                查看答案
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <Card className="border-primary/20">
                            <CardHeader>
                                <CardTitle>标准答案</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <MarkdownRenderer content={item.answerText || "暂无标准答案"} className="font-semibold" />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>解析</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <MarkdownRenderer content={item.analysis || "暂无解析"} />
                            </CardContent>
                        </Card>

                        {(item.wrongAnswerText || item.mistakeAnalysis) ? (
                            <Card>
                                <CardHeader>
                                    <CardTitle>错因</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {item.wrongAnswerText ? (
                                        <div className="space-y-2">
                                            <p className="text-sm font-medium text-muted-foreground">历史错误作答</p>
                                            <MarkdownRenderer content={item.wrongAnswerText} />
                                        </div>
                                    ) : null}
                                    {item.mistakeAnalysis ? (
                                        <div className="space-y-2">
                                            <p className="text-sm font-medium text-muted-foreground">历史错因分析</p>
                                            <MarkdownRenderer content={item.mistakeAnalysis} />
                                        </div>
                                    ) : null}
                                </CardContent>
                            </Card>
                        ) : null}

                        <Card>
                            <CardHeader>
                                <CardTitle>四级自评</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="text-sm text-muted-foreground">
                                    请根据你查看答案后的真实掌握情况自评。系统不会根据文字或照片自动判题。
                                </p>
                                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                                    {ratingOptions.map(option => (
                                        <Button
                                            key={option.value}
                                            variant={option.variant}
                                            className="h-auto min-h-[44px] whitespace-normal py-2.5 sm:py-3 text-left text-sm sm:text-base"
                                            disabled={isSubmitting || !!savedRecord}
                                            onClick={() => handleSubmitRating(option.value)}
                                        >
                                            <span className="flex flex-col">
                                                <span className="font-medium">{option.label}</span>
                                                <span className="text-xs opacity-70">{option.sublabel}</span>
                                            </span>
                                        </Button>
                                    ))}
                                </div>
                                {submitError ? (
                                    <p className="text-sm text-red-600">{submitError}</p>
                                ) : null}
                                {savedRecord ? (
                                    <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                                        <div className="flex items-center gap-2 font-medium">
                                            <CheckCircle2 className="h-4 w-4" />
                                            <span>本次原题复习记录已保存</span>
                                        </div>
                                        <p className="mt-2">
                                            已记录评分：{getRatingLabel(savedRecord.rating)}；独立作答耗时：{formatDuration(savedRecord.durationSeconds || 0)}。
                                        </p>
                                        {savedRecord.reviewResult?.nextReviewAt && (
                                            <p className="mt-2 font-medium">
                                                本题下次复习：{formatReviewDate(savedRecord.reviewResult.nextReviewAt)}
                                            </p>
                                        )}
                                    </div>
                                ) : null}
                            </CardContent>
                        </Card>

                        <Card className="border-dashed border-muted-foreground/25">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base font-medium">
                                    <History className="h-5 w-5 text-muted-foreground" />
                                    历史作答
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <p className="text-sm text-muted-foreground">
                                    查看该题过往复习记录和手写作答照片。
                                </p>
                                <Link href={`/review/${errorItemId}/history`}>
                                    <Button variant="outline" size="sm">
                                        查看历史作答
                                    </Button>
                                </Link>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </main>
    );
}
