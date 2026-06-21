import { prisma } from "@/lib/prisma";
import { createNewCard } from "./adapter";
import type { FsrsCardData } from "./adapter";

/**
 * Get or create an FsrsCard for a given error item and user.
 * If no card exists, creates a new one in "New" state.
 */
export async function getOrCreateFsrsCard(
    userId: string,
    errorItemId: string,
): Promise<FsrsCardData> {
    const existing = await prisma.fsrsCard.findUnique({
        where: { errorItemId },
    });

    if (existing) {
        return {
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

    const created = await prisma.fsrsCard.create({
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
 */
export async function saveFsrsCard(cardId: string, card: FsrsCardData): Promise<void> {
    await prisma.fsrsCard.update({
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
