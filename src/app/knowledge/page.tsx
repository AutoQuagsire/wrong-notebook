import { Suspense } from "react";

import { KnowledgeListPageClient } from "@/app/knowledge/knowledge-list-client";

export default function KnowledgeListPage() {
    return (
        <Suspense fallback={<div className="min-h-screen p-8 text-center text-muted-foreground">加载中...</div>}>
            <KnowledgeListPageClient />
        </Suspense>
    );
}
