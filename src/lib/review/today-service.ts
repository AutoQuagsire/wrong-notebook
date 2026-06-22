import { prisma } from "@/lib/prisma";
import type { ReviewTodayItem, ReviewTodayResponse, UpcomingReviewDay } from "@/types/api";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const QUESTION_PREVIEW_MAX = 300;

function buildQuestionPreview(
    questionText?: string | null,
    ocrText?: string | null,
): string {
    const raw = questionText || ocrText || "暂无题目内容";
    return raw.length > QUESTION_PREVIEW_MAX
        ? raw.slice(0, QUESTION_PREVIEW_MAX) + "…"
        : raw;
}

function formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function computeOverdueDays(due: Date, todayStart: Date): number {
    const diffMs = todayStart.getTime() - due.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

interface QueryResult {
    dueItems: ReviewTodayItem[];
    newItems: ReviewTodayItem[];
    stats: ReviewTodayResponse["stats"];
}

export async function getTodayReviewList(
    userId: string,
    limit?: number | null,
    includeNew?: boolean,
): Promise<QueryResult> {
    const effectiveLimit = Math.min(
        Math.max(1, limit ?? DEFAULT_LIMIT),
        MAX_LIMIT,
    );
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Query due FsrsCards joined with ErrorItem
    const dueCards = await prisma.fsrsCard.findMany({
        where: {
            userId,
            due: { lte: now },
        },
        orderBy: { due: "asc" },
        take: effectiveLimit,
        include: {
            errorItem: {
                select: {
                    questionText: true,
                    ocrText: true,
                    originalImageUrl: true,
                    subject: {
                        select: { id: true, name: true },
                    },
                },
            },
        },
    });

    const dueItems: ReviewTodayItem[] = dueCards.map((card) => ({
        errorItemId: card.errorItemId,
        fsrsCardId: card.id,
        subject: card.errorItem.subject,
        questionPreview: buildQuestionPreview(
            card.errorItem.questionText,
            card.errorItem.ocrText,
        ),
        originalImageUrl: card.errorItem.originalImageUrl,
        due: card.due.toISOString(),
        lastReview: card.last_review?.toISOString() ?? null,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state,
        scheduledDays: card.scheduled_days,
        overdueDays: card.due < todayStart
            ? computeOverdueDays(card.due, todayStart)
            : 0,
    }));

    // Stats: count all due cards (ignoring limit)
    const [totalDueCount, overdueCount] = await Promise.all([
        prisma.fsrsCard.count({
            where: { userId, due: { lte: now } },
        }),
        prisma.fsrsCard.count({
            where: { userId, due: { lt: todayStart } },
        }),
    ]);

    // Upcoming: FsrsCards due in the next 7 days (today through today+6)
    const dayPlus7Start = new Date(todayStart);
    dayPlus7Start.setDate(dayPlus7Start.getDate() + 7);

    const upcomingCards = await prisma.fsrsCard.findMany({
        where: {
            userId,
            due: { gte: todayStart, lt: dayPlus7Start },
        },
        select: { due: true },
    });

    const countByDate = new Map<string, number>();
    for (const card of upcomingCards) {
        const dateKey = formatLocalDate(card.due);
        countByDate.set(dateKey, (countByDate.get(dateKey) ?? 0) + 1);
    }

    const upcoming: UpcomingReviewDay[] = [];
    const cursor = new Date(todayStart);
    for (let i = 0; i < 7; i++) {
        const key = formatLocalDate(cursor);
        upcoming.push({ date: key, count: countByDate.get(key) ?? 0 });
        cursor.setDate(cursor.getDate() + 1);
    }

    // New items: ErrorItems without FsrsCard for this user
    let newItems: ReviewTodayItem[] = [];
    let newCount = 0;

    if (includeNew) {
        const fsrsErrorItemIds = (
            await prisma.fsrsCard.findMany({
                where: { userId },
                select: { errorItemId: true },
            })
        ).map((c) => c.errorItemId);

        const newErrorItems = await prisma.errorItem.findMany({
            where: {
                userId,
                id: { notIn: fsrsErrorItemIds },
            },
            orderBy: { createdAt: "desc" },
            take: effectiveLimit,
            select: {
                id: true,
                questionText: true,
                ocrText: true,
                originalImageUrl: true,
                subject: {
                    select: { id: true, name: true },
                },
            },
        });

        newItems = newErrorItems.map((item) => ({
            errorItemId: item.id,
            subject: item.subject,
            questionPreview: buildQuestionPreview(
                item.questionText,
                item.ocrText,
            ),
            originalImageUrl: item.originalImageUrl,
        }));

        newCount = await prisma.errorItem.count({
            where: {
                userId,
                id: { notIn: fsrsErrorItemIds },
            },
        });
    } else {
        // Still return newCount for frontend badge
        const fsrsErrorItemIds = (
            await prisma.fsrsCard.findMany({
                where: { userId },
                select: { errorItemId: true },
            })
        ).map((c) => c.errorItemId);

        newCount = await prisma.errorItem.count({
            where: {
                userId,
                id: { notIn: fsrsErrorItemIds },
            },
        });
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
