import { prisma } from "@/lib/prisma";
import { createNewCard, validateFsrsRating } from "./adapter";
import type { FsrsCardData } from "./adapter";
import type { PrismaClient } from "@prisma/client";

type PrismaTx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/**
 * Get or create an FsrsCard for a given error item and user.
 * If no card exists, creates a new one in "New" state.
 * Accepts an optional transaction client for use within Prisma.$transaction.
 */
export async function getOrCreateFsrsCard(
    userId: string,
    errorItemId: string,
    tx?: PrismaTx,
): Promise<FsrsCardData & { id: string }> {
    const client = tx ?? prisma;

    const existing = await client.fsrsCard.findUnique({
        where: { errorItemId },
    });

    if (existing) {
        return {
            id: existing.id,
            due: existing.due,
            stability: existing.stability,
            difficulty: existing.difficulty,
            elapsed_days: existing.elapsed_days,
            scheduled_days: existing.scheduled_days,
            reps: existing.reps,
            lapses: existing.lapses,
            state: existing.state,
            last_review: existing.last_review,
        };
    }

    const newCard = createNewCard();

    const created = await client.fsrsCard.create({
        data: {
            userId,
            errorItemId,
            due: newCard.due,
            stability: newCard.stability,
            difficulty: newCard.difficulty,
            elapsed_days: newCard.elapsed_days,
            scheduled_days: newCard.scheduled_days,
            reps: newCard.reps,
            lapses: newCard.lapses,
            state: newCard.state,
            last_review: newCard.last_review,
        },
    });

    return {
        id: created.id,
        due: created.due,
        stability: created.stability,
        difficulty: created.difficulty,
        elapsed_days: created.elapsed_days,
        scheduled_days: created.scheduled_days,
        reps: created.reps,
        lapses: created.lapses,
        state: created.state,
        last_review: created.last_review,
    };
}

/**
 * Save an FsrsCardData back to the database.
 * Used after computing the next card state.
 * Accepts an optional transaction client.
 */
export async function saveFsrsCard(cardId: string, card: FsrsCardData, tx?: PrismaTx): Promise<void> {
    const client = tx ?? prisma;
    await client.fsrsCard.update({
        where: { id: cardId },
        data: {
            due: card.due,
            stability: card.stability,
            difficulty: card.difficulty,
            elapsed_days: card.elapsed_days,
            scheduled_days: card.scheduled_days,
            reps: card.reps,
            lapses: card.lapses,
            state: card.state,
            last_review: card.last_review,
        },
    });
}

/**
 * Get the ID of an FsrsCard for a given error item.
 * Returns null if no card exists.
 */
export async function getFsrsCardId(errorItemId: string): Promise<string | null> {
    const card = await prisma.fsrsCard.findUnique({
        where: { errorItemId },
        select: { id: true },
    });

    return card?.id ?? null;
}

/**
 * Fixed-interval scheduling for original review (ORIGINAL_REVIEW).
 *
 * Intervals (due date = now + N days, clamped to 06:00 local time):
 *   rating=1 (Again) → 1 day
 *   rating=2 (Hard)  → 2 days
 *   rating=3 (Good)  → 5 days
 *   rating=4 (Easy)  → first: 7 days, second consecutive: 3 days
 *
 * IMPORTANT: This function does NOT call computeNextCard from adapter.ts.
 * The knowledge review module (knowledge-service.ts) continues to use
 * ts-fsrs adaptive scheduling via computeNextCard / clampDueToNextDay.
 *
 * @param easyStreakCount — Number of consecutive Easy (rating=4)
 *   ORIGINAL_REVIEW records for this errorItem, INCLUDING this one.
 *   1 = first Easy → 7 days
 *   2 = second consecutive Easy → 3 days
 *   >= 3 = auto-mastered (caller sets masteryLevel=2; no card deletion)
 *
 * @throws if rating is invalid (not 1-4)
 */
export async function processFsrsReview(
    userId: string,
    errorItemId: string,
    rating: number,
    tx?: PrismaTx,
    easyStreakCount: number = 0,
): Promise<FsrsCardData> {
    validateFsrsRating(rating);

    const now = new Date();

    // Get or create the card (within tx if provided)
    const card = await getOrCreateFsrsCard(userId, errorItemId, tx);

    // Determine scheduled_days from rating + Easy streak
    let scheduledDays: number;
    let nextState: string;

    if (rating === 1) {
        // Again → 1 day, Relearning state, lapses +1
        scheduledDays = 1;
        nextState = "Relearning";
    } else if (rating === 2) {
        // Hard → 2 days, Review state
        scheduledDays = 2;
        nextState = "Review";
    } else if (rating === 3) {
        // Good → 5 days, Review state
        scheduledDays = 5;
        nextState = "Review";
    } else {
        // rating === 4 (Easy)
        if (easyStreakCount >= 3) {
            // Auto-mastered — caller sets masteryLevel=2.
            // scheduledDays 设为 3 保持数据合理，但该题会被
            // today-service 通过 masteryLevel=2 过滤，不再进入调度。
            scheduledDays = 3;
            nextState = "Review";
        } else if (easyStreakCount === 2) {
            // Second consecutive Easy → 3 days
            scheduledDays = 3;
            nextState = "Review";
        } else {
            // First Easy (or non-consecutive) → 7 days
            scheduledDays = 7;
            nextState = "Review";
        }
    }

    // Compute due date: now + scheduledDays, set to 06:00 local time
    const due = new Date(now);
    due.setDate(due.getDate() + scheduledDays);
    due.setHours(6, 0, 0, 0);

    const nextCard: FsrsCardData = {
        due,
        stability: card.stability,     // preserve historical value
        difficulty: card.difficulty,   // preserve historical value
        elapsed_days: 0,
        scheduled_days: scheduledDays,
        reps: card.reps + 1,
        lapses: rating === 1 ? card.lapses + 1 : card.lapses,
        state: nextState,
        last_review: now,
    };

    // Persist the update
    await saveFsrsCard(card.id, nextCard, tx);

    return nextCard;
}
