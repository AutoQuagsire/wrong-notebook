import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const PROMPT_PREVIEW_MAX = 200;

function buildPromptPreview(prompt: string): string {
    return prompt.length > PROMPT_PREVIEW_MAX
        ? prompt.slice(0, PROMPT_PREVIEW_MAX) + "..."
        : prompt;
}

function formatLocalDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function computeOverdueDays(due: Date, todayStart: Date): number {
    const diffMs = todayStart.getTime() - due.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export interface KnowledgeReviewTodayItem {
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

export interface KnowledgeTodayResult {
    dueItems: KnowledgeReviewTodayItem[];
    newItems: KnowledgeReviewTodayItem[];
    stats: {
        dueCount: number;
        overdueCount: number;
        newCount: number;
        limit: number;
        generatedAt: string;
        upcoming: { date: string; count: number }[];
    };
}

export async function getKnowledgeTodayReviewList(
    userId: string,
    limit?: number | null,
    includeNew?: boolean,
    subjectId?: string | null,
    deck?: string | null,
): Promise<KnowledgeTodayResult> {
    const effectiveLimit = Math.min(Math.max(1, limit ?? DEFAULT_LIMIT), MAX_LIMIT);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const knowledgeItemWhere: Record<string, unknown> = { userId };
    if (subjectId) knowledgeItemWhere.subjectId = subjectId;
    if (deck) knowledgeItemWhere.deck = deck;

    // Due items: KnowledgeReviewState where due <= now
    const dueStates = await prisma.knowledgeReviewState.findMany({
        where: {
            userId,
            due: { lte: now },
            knowledgeItem: knowledgeItemWhere,
        },
        orderBy: { due: "asc" },
        take: effectiveLimit,
        include: {
            knowledgeItem: {
                select: {
                    prompt: true,
                    answer: true,
                    detail: true,
                    subject: { select: { id: true, name: true } },
                    tag: { select: { id: true, name: true } },
                },
            },
        },
    });

    const dueItems: KnowledgeReviewTodayItem[] = dueStates.map((s) => ({
        knowledgeItemId: s.knowledgeItemId,
        reviewStateId: s.id,
        promptPreview: buildPromptPreview(s.knowledgeItem.prompt),
        answer: s.knowledgeItem.answer,
        detail: s.knowledgeItem.detail,
        subject: s.knowledgeItem.subject,
        tag: s.knowledgeItem.tag,
        due: s.due.toISOString(),
        lastReview: s.last_review?.toISOString() ?? null,
        reps: s.reps,
        lapses: s.lapses,
        state: s.state,
        scheduledDays: s.scheduled_days,
        overdueDays: s.due < todayStart ? computeOverdueDays(s.due, todayStart) : 0,
    }));

    // Stats
    const [totalDueCount, overdueCount] = await Promise.all([
        prisma.knowledgeReviewState.count({
            where: { userId, due: { lte: now }, knowledgeItem: knowledgeItemWhere },
        }),
        prisma.knowledgeReviewState.count({
            where: { userId, due: { lt: todayStart }, knowledgeItem: knowledgeItemWhere },
        }),
    ]);

    // Upcoming
    const dayPlus7Start = new Date(todayStart);
    dayPlus7Start.setDate(dayPlus7Start.getDate() + 7);

    const upcomingStates = await prisma.knowledgeReviewState.findMany({
        where: {
            userId,
            due: { gte: todayStart, lt: dayPlus7Start },
            knowledgeItem: knowledgeItemWhere,
        },
        select: { due: true },
    });

    const countByDate = new Map<string, number>();
    for (const s of upcomingStates) {
        const key = formatLocalDate(s.due);
        countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
    }

    const upcoming: { date: string; count: number }[] = [];
    const cursor = new Date(todayStart);
    for (let i = 0; i < 7; i++) {
        const key = formatLocalDate(cursor);
        upcoming.push({ date: key, count: countByDate.get(key) ?? 0 });
        cursor.setDate(cursor.getDate() + 1);
    }

    // New items: knowledge items without review state
    let newItems: KnowledgeReviewTodayItem[] = [];
    let newCount = 0;

    if (includeNew) {
        const reviewedIds = (
            await prisma.knowledgeReviewState.findMany({
                where: { userId },
                select: { knowledgeItemId: true },
            })
        ).map((r) => r.knowledgeItemId);

        const finalWhere = { ...knowledgeItemWhere };
        if (reviewedIds.length > 0) {
            finalWhere.id = { notIn: reviewedIds } as unknown as string[] & { notIn: string[] };
        }

        const freshItems = await prisma.knowledgeItem.findMany({
            where: finalWhere,
            orderBy: [{ deck: "asc" }, { order: "asc" }, { createdAt: "desc" }],
            take: effectiveLimit,
            select: {
                id: true,
                prompt: true,
                answer: true,
                detail: true,
                subject: { select: { id: true, name: true } },
                tag: { select: { id: true, name: true } },
            },
        });

        newItems = freshItems.map((item) => ({
            knowledgeItemId: item.id,
            promptPreview: buildPromptPreview(item.prompt),
            answer: item.answer,
            detail: item.detail,
            subject: item.subject,
            tag: item.tag,
        }));

        const countWhere = { ...knowledgeItemWhere };
        if (reviewedIds.length > 0) {
            countWhere.id = { notIn: reviewedIds } as unknown as string[] & { notIn: string[] };
        }
        newCount = await prisma.knowledgeItem.count({ where: countWhere });
    } else {
        const reviewedIds = (
            await prisma.knowledgeReviewState.findMany({
                where: { userId },
                select: { knowledgeItemId: true },
            })
        ).map((r) => r.knowledgeItemId);

        const countWhere = { ...knowledgeItemWhere };
        if (reviewedIds.length > 0) {
            countWhere.id = { notIn: reviewedIds } as unknown as string[] & { notIn: string[] };
        }
        newCount = await prisma.knowledgeItem.count({ where: countWhere });
    }

    return {
        dueItems,
        newItems,
        stats: {
            dueCount: totalDueCount,
            overdueCount,
            newCount,
            limit: effectiveLimit,
            generatedAt: new Date().toISOString(),
            upcoming,
        },
    };
}
