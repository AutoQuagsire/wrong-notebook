"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Brain, Search, Upload } from "lucide-react";

interface KnowledgeItemSummary {
    id: string;
    prompt: string;
    answer: string;
    deck: string | null;
    order: number;
    tag: { id: string; name: string; subject: string } | null;
    subject: { id: string; name: string } | null;
    questionType: string | null;
    manualDifficulty: string | null;
    reviewState: { due: string; state: string; reps: number; lapses: number; last_review: string | null } | null;
    createdAt: string;
    updatedAt: string;
}

interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export default function KnowledgeListPage() {
    const router = useRouter();
    const [items, setItems] = useState<KnowledgeItemSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");

    const pageSize = 20;

    const fetchItems = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set("page", String(page));
            params.set("pageSize", String(pageSize));
            if (query) params.set("query", query);

            const data = await apiClient.get<PaginatedResponse<KnowledgeItemSummary>>(
                `/api/knowledge-items?${params.toString()}`
            );
            setItems(data.items);
            setTotal(data.total);
        } catch (error) {
            console.error("Failed to load knowledge items:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchItems(); }, [page, query]);

    return (
        <main className="min-h-screen p-4 md:p-8 bg-background">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">知识点抽背</h1>
                        <p className="text-muted-foreground text-sm">共 {total} 个知识点</p>
                    </div>
                    <div className="flex gap-2">
                        <Link href="/knowledge/review">
                            <Button variant="outline">
                                <Brain className="mr-2 h-4 w-4" />今日复习
                            </Button>
                        </Link>
                        <Link href="/knowledge/import">
                            <Button variant="outline">
                                <Upload className="mr-2 h-4 w-4" />批量导入
                            </Button>
                        </Link>
                        <Link href="/knowledge/new">
                            <Button>
                                <Plus className="mr-2 h-4 w-4" />新建知识点
                            </Button>
                        </Link>
                    </div>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="搜索知识点..."
                        className="pl-9"
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                    />
                </div>

                {loading ? (
                    <p className="text-muted-foreground text-center py-12">加载中...</p>
                ) : items.length === 0 ? (
                    <div className="text-center py-12 space-y-4">
                        <p className="text-muted-foreground">还没有任何知识点</p>
                        <Link href="/knowledge/new">
                            <Button>创建第一个知识点</Button>
                        </Link>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {items.map((item) => (
                            <Link key={item.id} href={`/knowledge/${item.id}`}>
                                <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
                                    <CardContent className="pt-4">
                                        <p className="font-medium line-clamp-2 mb-2">{item.prompt}</p>
                                        <div className="flex flex-wrap gap-1 mb-2">
                                            {item.subject && (
                                                <Badge variant="secondary" className="text-xs">{item.subject.name}</Badge>
                                            )}
                                            {item.deck && (
                                                <Badge variant="outline" className="text-xs">{item.deck}</Badge>
                                            )}
                                            {item.tag && (
                                                <Badge variant="outline" className="text-xs">{item.tag.name}</Badge>
                                            )}
                                        </div>
                                        {item.reviewState && (
                                            <p className="text-xs text-muted-foreground">
                                                下次复习: {new Date(item.reviewState.due).toLocaleDateString("zh-CN")} · {item.reviewState.state} · reps: {item.reviewState.reps}
                                            </p>
                                        )}
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                )}

                {total > pageSize && (
                    <div className="flex justify-center gap-2">
                        <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
                        <span className="px-4 py-2 text-sm text-muted-foreground">第 {page} 页 / 共 {Math.ceil(total / pageSize)} 页</span>
                        <Button variant="outline" disabled={page * pageSize >= total} onClick={() => setPage(page + 1)}>下一页</Button>
                    </div>
                )}
            </div>
        </main>
    );
}
