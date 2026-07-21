import { prisma } from "@/lib/prisma";
import { createNewCard, computeNextCard, validateFsrsRating, normalizeDueToNextStudyDay } from "./adapter";
import type { FsrsCardData } from "./adapter";
import type { PrismaClient } from "@prisma/client";

type PrismaTx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export class KnowledgeItemNotFoundError extends Error {
    constructor(knowledgeItemId: string) {
        super(`Knowledge item not found: ${knowledgeItemId}`);
        this.name = "KnowledgeItemNotFoundError";
    }
}

export interface KnowledgeReviewResult {
    nextReviewAt: Date;
    scheduledDays: number;
    state: string;
    reps: number;
    lapses: number;
}

function toFsrsCardDataFromRow(row: {
    due: Date;
    stability: number | null;
    difficulty: number | null;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    state: string;
    last_review: Date | null;
}): FsrsCardData {
    return {
        due: row.due,
        stability: row.stability,
        difficulty: row.difficulty,
        elapsed_days: row.elapsed_days,
        scheduled_days: row.scheduled_days,
        reps: row.reps,
        lapses: row.lapses,
        state: row.state,
        last_review: row.last_review,
    };
}

/**
 * Verify a knowledge item exists and belongs to the given user.
 * Throws KnowledgeItemNotFoundError if not.
 */
async function verifyOwnership(
    userId: string,
    knowledgeItemId: string,
    client: PrismaTx,
): Promise<void> {
    const item = await client.knowledgeItem.findFirst({
        where: { id: knowledgeItemId, userId },
        select: { id: true },
    });

    if (!item) {
        throw new KnowledgeItemNotFoundError(knowledgeItemId);
    }
}

/**
 * Get or create a KnowledgeReviewState for a given knowledge item and user.
 * Ownership is verified internally via the knowledge item.
 */
async function getOrCreateKnowledgeReviewState(
    userId: string,
    knowledgeItemId: string,
    tx?: PrismaTx,
): Promise<FsrsCardData & { id: string }> {
    const client = tx ?? prisma;

    await verifyOwnership(userId, knowledgeItemId, client);

    const existing = await client.knowledgeReviewState.findUnique({
        where: { knowledgeItemId },
    });

    if (existing) {
        return {
            id: existing.id,
            ...toFsrsCardDataFromRow(existing),
        };
    }

    const newCard = createNewCard();

    const created = await client.knowledgeReviewState.create({
        data: {
            userId,
            knowledgeItemId,
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
        ...toFsrsCardDataFromRow(created),
    };
}

async function saveKnowledgeReviewState(
    stateId: string,
    card: FsrsCardData,
    tx?: PrismaTx,
): Promise<void> {
    const client = tx ?? prisma;
    await client.knowledgeReviewState.update({
        where: { id: stateId },
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
 * Process a knowledge review: get or create the KnowledgeReviewState,
 * compute the next FSRS state based on the rating, and persist.
 *
 * @throws if rating is invalid (not 1-4)
 */
export async function processKnowledgeReview(
    userId: string,
    knowledgeItemId: string,
    rating: number,
    tx?: PrismaTx,
): Promise<KnowledgeReviewResult> {
    validateFsrsRating(rating);

    const now = new Date();

    const card = await getOrCreateKnowledgeReviewState(userId, knowledgeItemId, tx);

    const computedCard = computeNextCard(card, rating, now);

    const nextCard = normalizeDueToNextStudyDay(computedCard, now);

    await saveKnowledgeReviewState(card.id, nextCard, tx);

    return {
        nextReviewAt: nextCard.due,
        scheduledDays: nextCard.scheduled_days,
        state: nextCard.state,
        reps: nextCard.reps,
        lapses: nextCard.lapses,
    };
}
