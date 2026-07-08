import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getKnowledgeTodayReviewList } from "@/lib/review/knowledge-today-service";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { ArrowLeft, Play } from "lucide-react";

export default async function KnowledgeReviewPage() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        redirect("/login?callbackUrl=%2Fknowledge%2Freview");
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });

    if (!user) {
        redirect("/login?callbackUrl=%2Fknowledge%2Freview");
    }

    try {
        const data = await getKnowledgeTodayReviewList(user.id, 50, true);
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
                            <Link href="/knowledge/review/session">
                                <Button>
                                    <Play className="mr-1 h-4 w-4" />开始抽背
                                </Button>
                            </Link>
                            <Link href="/knowledge">
                                <Button variant="outline" size="sm">
                                    <ArrowLeft className="mr-1 h-4 w-4" />
                                    返回列表
                                </Button>
                            </Link>
                        </div>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                        {stats.upcoming.map((day) => (
                            <Badge
                                key={day.date}
                                variant={day.count > 0 ? "default" : "secondary"}
                                className="text-xs"
                            >
                                {day.date.slice(5)}: {day.count}
                            </Badge>
                        ))}
                    </div>

                    {dueItems.length > 0 && (
                        <div>
                            <h2 className="text-lg font-semibold mb-3">待复习 ({dueItems.length})</h2>
                            <div className="grid gap-3 md:grid-cols-2">
                                {dueItems.map((item) => (
                                    <Link
                                        key={item.knowledgeItemId}
                                        href={`/knowledge/review/${item.knowledgeItemId}`}
                                    >
                                        <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                                            <CardContent className="pt-4">
                                                <div className="font-medium line-clamp-2 mb-2 [&_p]:m-0 [&_.katex]:text-sm">
                                                    <MarkdownRenderer content={item.promptPreview} />
                                                </div>
                                                <div className="flex flex-wrap gap-1 mb-2">
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
                                                    {item.overdueDays ? (
                                                        <Badge variant="destructive" className="text-xs">
                                                            逾期 {item.overdueDays} 天
                                                        </Badge>
                                                    ) : null}
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

                    {newItems.length > 0 && (
                        <div>
                            <h2 className="text-lg font-semibold mb-3">新卡片 ({newItems.length})</h2>
                            <div className="grid gap-3 md:grid-cols-2">
                                {newItems.map((item) => (
                                    <Link
                                        key={item.knowledgeItemId}
                                        href={`/knowledge/review/${item.knowledgeItemId}`}
                                    >
                                        <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                                            <CardContent className="pt-4">
                                                <div className="font-medium line-clamp-2 mb-2 [&_p]:m-0 [&_.katex]:text-sm">
                                                    <MarkdownRenderer content={item.promptPreview} />
                                                </div>
                                                <div className="flex flex-wrap gap-1">
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
                                                    <Badge variant="outline" className="text-xs">
                                                        新
                                                    </Badge>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

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
    } catch (error) {
        console.error("Failed to load knowledge review page:", error);

        return (
            <main className="min-h-screen p-4 md:p-8 bg-background">
                <div className="max-w-4xl mx-auto text-center py-12 space-y-4">
                    <p className="text-muted-foreground">加载失败</p>
                    <div className="flex justify-center gap-2">
                        <Link href="/knowledge">
                            <Button>返回知识点列表</Button>
                        </Link>
                        <Link href="/knowledge/review">
                            <Button variant="outline">重试</Button>
                        </Link>
                    </div>
                </div>
            </main>
        );
    }
}
