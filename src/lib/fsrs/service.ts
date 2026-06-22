import { prisma } from "@/lib/prisma";
import { createNewCard, computeNextCard, validateFsrsRating, clampDueToNextDay } from "./adapter";
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
 * Process an original review for FSRS: get or create the FsrsCard,
 * compute the next state based on the rating, and persist the update.
 *
 * Must be called within an ORIGINAL_REVIEW scoring flow.
 * Accepts an optional transaction client — when provided, all DB
 * operations use that client so the caller can wrap this together
 * with PracticeRecord creation in a single Prisma.$transaction.
 *
 * @throws if rating is invalid (not 1-4)
 */
export async function processFsrsReview(
    userId: string,
    errorItemId: string,
    rating: number,
    tx?: PrismaTx,
): Promise<FsrsCardData> {
    // Validate rating before doing any DB work
    validateFsrsRating(rating);

    const now = new Date();

    // Get or create the card (within tx if provided)
    const card = await getOrCreateFsrsCard(userId, errorItemId, tx);

    // Compute next state (pure function, no DB)
    const computedCard = computeNextCard(card, rating, now);

    // Clamp: never schedule the next review on the same calendar day
    const nextCard = clampDueToNextDay(computedCard, now);

    // Persist the update
    await saveFsrsCard(card.id, nextCard, tx);

    return nextCard;
}
