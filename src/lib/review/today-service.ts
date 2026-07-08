import { prisma } from "@/lib/prisma";
import type { ReviewTodayItem, ReviewTodayResponse, UpcomingReviewDay } from "@/types/api";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const QUESTION_PREVIEW_MAX = 600;

/**
 * Math-aware truncation: avoid slicing through LaTeX math blocks.
 * If the raw cut point falls inside a $...$, $$...$$, \\(...\\),
 * \\[...\\], or \\begin{...}...\\end{...} block, extend the preview
 * to include the complete block so KaTeX can render it.
 */
function mathAwareTruncate(raw: string, maxLen: number): string {
    if (raw.length <= maxLen) return raw;

    // Find the nearest math block boundary at or after maxLen.
    // We look for closing delimiters: $, $$, \\), \\], \\end{...}
    const closePattern = /\$|\$\$|\\\\\)|\\\\\]|\\end\{[^}]+\}/g;
    let match: RegExpExecArray | null;
    let bestCut = maxLen;

    closePattern.lastIndex = maxLen;
    while ((match = closePattern.exec(raw)) !== null) {
        // Check if we are inside a math block before this close.
        // Open delimiters before this close, after bestCut.
        const before = raw.slice(bestCut, match.index);
        const openCount = (before.match(/\$[^$]|\$\$|\$\$|\\\\\(|\\\\\[|\\begin\{[^}]+\}/g) || []).length;
        // Simple heuristic: if there were more opens than closes between
        // bestCut and the closing delimiter, use this close as the cut.
        // We just extend past any closing that follows an unmatched open.
        const seg = raw.slice(0, match.index + match[0].length);
        const dollarOpens = (seg.match(/(?<!\\)\$(?!\$)/g) || []).length;
        const dollarCloses = (seg.match(/(?<!\\)\$(?!\$)/g) || []).length;

        // For each potential close, check if the segment up to it is balanced.
        // If not, extend; if yes, we can cut here.
        if (isMathBalanced(seg)) {
            bestCut = match.index + match[0].length;
            break;
        }
        // Otherwise keep looking for the next close.
    }

    // If we couldn't find a balanced cut, just use maxLen (worst case:
    // raw LaTeX appears; but this only happens for truly malformed input).
    return raw.slice(0, bestCut) + (bestCut >= raw.length ? "" : "…");
}

function isMathBalanced(s: string): boolean {
    // Count single $ (not $$)
    const singles = s.match(/(?<!\$)\$(?!\$)/g) || [];
    if (singles.length % 2 !== 0) return false;

    // Count $$ pairs
    const doubles = s.match(/\$\$/g) || [];
    if (doubles.length % 2 !== 0) return false;

    // Count \( / \) pairs
    const openParen = (s.match(/\\\(/g) || []).length;
    const closeParen = (s.match(/\\\)/g) || []).length;
    if (openParen !== closeParen) return false;

    // Count \[ / \] pairs
    const openBracket = (s.match(/\\\[/g) || []).length;
    const closeBracket = (s.match(/\\\]/g) || []).length;
    if (openBracket !== closeBracket) return false;

    // Count \begin{...} / \end{...} pairs
    const begins = (s.match(/\\begin\{[^}]+\}/g) || []).length;
    const ends = (s.match(/\\end\{[^}]+\}/g) || []).length;
    if (begins !== ends) return false;

    return true;
}

function buildQuestionPreview(
    questionText?: string | null,
    ocrText?: string | null,
): string {
    const raw = questionText || ocrText || "暂无题目内容";
    return raw.length > QUESTION_PREVIEW_MAX
        ? mathAwareTruncate(raw, QUESTION_PREVIEW_MAX)
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
