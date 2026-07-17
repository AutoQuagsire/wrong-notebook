"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { apiClient } from "@/lib/api-client";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Brain, Plus, Search, Upload } from "lucide-react";
import {
    buildKnowledgeItemDetailHref,
    buildKnowledgeListUrlSearchParams,
    parseKnowledgeListUrlState,
} from "@/lib/knowledge-list-url-state";

interface KnowledgeItemSummary {
    id: string;
    prompt: string;
    deck: string | null;
    order: number;
    source: string | null;
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

export function KnowledgeListPageClient() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const initialUrlState = parseKnowledgeListUrlState(searchParams);
    const [items, setItems] = useState<KnowledgeItemSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(initialUrlState.page);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState(initialUrlState.query);
    const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(initialUrlState.subjectId);
    const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
    const [subjectsLoaded, setSubjectsLoaded] = useState(false);
    const [subjectsError, setSubjectsError] = useState<string | null>(null);
    const isApplyingUrlStateRef = useRef(true);

    const pageSize = 20;

    const currentUrlState = useMemo(() => ({
        query,
        subjectId: selectedSubjectId,
        page,
    }), [page, query, selectedSubjectId]);

    const effectiveSubjectId = useMemo(() => {
        if (!selectedSubjectId) return null;
        if (!subjectsLoaded) return selectedSubjectId;
        if (subjectsError) return null;
        return subjects.some((subject) => subject.id === selectedSubjectId) ? selectedSubjectId : null;
    }, [selectedSubjectId, subjectsLoaded, subjectsError, subjects]);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        try {
            const trimmedQuery = query.trim();
            const params = new URLSearchParams();
            params.set("page", String(page));
            params.set("pageSize", String(pageSize));
            if (trimmedQuery) params.set("query", trimmedQuery);
            if (effectiveSubjectId) params.set("subjectId", effectiveSubjectId);

            const data = await apiClient.get<PaginatedResponse<KnowledgeItemSummary>>(
                `/api/knowledge-items?${params.toString()}`,
            );
            setItems(data.items);
            setTotal(data.total);
        } catch (error) {
            console.error("Failed to load knowledge items:", error);
        } finally {
            setLoading(false);
        }
    }, [effectiveSubjectId, page, query]);

    useEffect(() => {
        apiClient.get<Array<{ id: string; name: string }>>("/api/subjects")
            .then((data) => {
                setSubjects(Array.isArray(data) ? data : []);
                setSubjectsError(null);
            })
            .catch((error) => {
                console.error("Failed to load subjects:", error);
                setSubjects([]);
                setSubjectsError("科目加载失败，当前已按全部科目显示");
            })
            .finally(() => {
                setSubjectsLoaded(true);
            });
    }, []);

    useEffect(() => {
        const nextState = parseKnowledgeListUrlState(searchParams);
        isApplyingUrlStateRef.current = true;
        setQuery(nextState.query);
        setSelectedSubjectId(nextState.subjectId);
        setPage(nextState.page);
    }, [searchParams]);

    useEffect(() => {
        if (!subjectsLoaded || subjectsError || !selectedSubjectId) return;
        if (subjects.some((subject) => subject.id === selectedSubjectId)) return;

        isApplyingUrlStateRef.current = true;
        setSelectedSubjectId(null);
    }, [selectedSubjectId, subjects, subjectsError, subjectsLoaded]);

    useEffect(() => {
        const nextQueryString = buildKnowledgeListUrlSearchParams(currentUrlState).toString();
        const currentQueryString = searchParams.toString();

        if (nextQueryString !== currentQueryString) {
            router.replace(nextQueryString ? `${pathname}?${nextQueryString}` : pathname, { scroll: false });
        }

        isApplyingUrlStateRef.current = false;
        fetchItems();
    }, [currentUrlState, fetchItems, pathname, router, searchParams]);

    const selectedSubjectValue = subjectsLoaded && !subjectsError && selectedSubjectId && !subjects.some((subject) => subject.id === selectedSubjectId)
        ? "__all__"
        : (selectedSubjectId ?? "__all__");

    return (
        <main className="min-h-screen p-4 md:p-8 bg-background">
            <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">
                <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeft className="h-4 w-4" />返回首页
                </Link>

                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-xl md:text-2xl font-bold tracking-tight whitespace-nowrap">知识点抽背</h1>
                        <p className="text-muted-foreground text-sm">共 {total} 个知识点</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap md:shrink-0">
                        <Link href="/knowledge/review">
                            <Button variant="outline" size="sm" className="w-full sm:w-auto">
                                <Brain className="mr-1.5 h-4 w-4" />今日复习
                            </Button>
                        </Link>
                        <Link href="/knowledge/import">
                            <Button variant="outline" size="sm" className="w-full sm:w-auto">
                                <Upload className="mr-1.5 h-4 w-4" />批量导入
                            </Button>
                        </Link>
                        <Link href="/knowledge/new" className="col-span-2 sm:col-span-1">
                            <Button size="sm" className="w-full sm:w-auto">
                                <Plus className="mr-1.5 h-4 w-4" />新建知识点
                            </Button>
                        </Link>
                    </div>
                </div>

                <div className="flex flex-col gap-3 md:flex-row">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="搜索知识点..."
                            className="pl-9"
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setPage(1);
                            }}
                        />
                    </div>
                    <div className="w-full md:w-64">
                        <Select
                            value={selectedSubjectValue}
                            onValueChange={(value) => {
                                setSelectedSubjectId(value === "__all__" ? null : value);
                                setPage(1);
                            }}
                            disabled={!subjectsLoaded}
                        >
                            <SelectTrigger aria-label="科目筛选">
                                <SelectValue placeholder={subjectsLoaded ? "全部科目" : "加载科目中..."} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">全部科目</SelectItem>
                                {subjects.map((subject) => (
                                    <SelectItem key={subject.id} value={subject.id}>
                                        {subject.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {subjectsError && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {subjectsError}
                    </div>
                )}

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
                            <Link
                                key={item.id}
                                href={buildKnowledgeItemDetailHref(item.id, pathname, {
                                    ...currentUrlState,
                                    subjectId: effectiveSubjectId ?? (subjectsError ? null : currentUrlState.subjectId),
                                })}
                            >
                                <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
                                    <CardContent className="pt-4">
                                        <div className="font-medium line-clamp-2 mb-2 [&_p]:m-0 [&_.katex]:text-sm">
                                            <MarkdownRenderer content={item.prompt} />
                                        </div>
                                        <div className="flex flex-wrap gap-1 mb-2">
                                            {item.source && (
                                                <Badge variant="outline" className="font-mono text-xs">#{item.source}</Badge>
                                            )}
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
