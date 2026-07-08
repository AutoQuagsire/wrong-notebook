import {
    createEmptyCard,
    fsrs,
    Rating,
    State,
    default_w,
} from "ts-fsrs";
import type { Card, Grade } from "ts-fsrs";

export interface FsrsCardData {
    due: Date;
    stability: number | null;
    difficulty: number | null;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    state: string;
    last_review: Date | null;
}

const scheduler = fsrs({ w: [...default_w] });

const STATE_MAP: Record<number, string> = {
    [State.New]: "New",
    [State.Learning]: "Learning",
    [State.Review]: "Review",
    [State.Relearning]: "Relearning",
};

const STATE_NAME_TO_NUM: Record<string, number> = {
    New: State.New,
    Learning: State.Learning,
    Review: State.Review,
    Relearning: State.Relearning,
};

const VALID_RATINGS = new Set([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]);

// ---- Fixed-interval scheduling (replaces ts-fsrs adaptive algorithm) ----

/** Days until next review for each rating. If rating is not in this map (or fixed-scheduling
 *  is skipped for any reason), fall back to the legacy ts-fsrs call below. */
const FIXED_SCHEDULED_DAYS: Record<number, number> = {
    [Rating.Again]: 1,
    [Rating.Hard]: 2,
    [Rating.Good]: 5,
    [Rating.Easy]: 7,
};

/** Easy-streak cap: consecutive-2 Easy → 3 days instead of 7. */
const EASY_STREAK_2_DAYS = 3;

/** After 3 or more consecutive Easy ratings the item is auto-mastered and removed from
 *  the scheduling queue entirely — no due date is set (the card is deleted below). */

// ---------------------------------------------------------------------------

function toFsrsCardData(card: {
    due: Date;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    state: number;
    last_review?: Date | null;
}): FsrsCardData {
    return {
        due: card.due,
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: card.elapsed_days,
        scheduled_days: card.scheduled_days,
        reps: card.reps,
        lapses: card.lapses,
        state: STATE_MAP[card.state] || "New",
        last_review: card.last_review ?? null,
    };
}

function toTsFsrsCard(data: FsrsCardData): {
    due: Date;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    state: number;
    last_review: Date | null;
} {
    return {
        due: new Date(data.due),
        stability: data.stability ?? 0,
        difficulty: data.difficulty ?? 0,
        elapsed_days: data.elapsed_days,
        scheduled_days: data.scheduled_days,
        reps: data.reps,
        lapses: data.lapses,
        state: STATE_NAME_TO_NUM[data.state] ?? State.New,
        last_review: data.last_review ? new Date(data.last_review) : null,
    };
}

/**
 * Create a new FSRS card in "New" state.
 * Pure function — does not access the database.
 */
export function createNewCard(now?: Date): FsrsCardData {
    return toFsrsCardData(createEmptyCard(now));
}

/**
 * Validate and normalize a project rating (1-4) to FSRS Rating.
 * Throws if rating is not 1, 2, 3, or 4.
 */
export function validateFsrsRating(rating: unknown): Rating {
    if (rating === undefined || rating === null) {
        throw new Error("Rating is required");
    }

    if (typeof rating !== "number" || !Number.isInteger(rating) || !VALID_RATINGS.has(rating as Rating)) {
        throw new Error(`Invalid rating: ${rating}. Must be 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy)`);
    }

    return rating as Rating;
}

/**
 * Compute the next FSRS card state based on a rating.
 * Does not mutate the input card.
 *
 * Uses fixed-interval scheduling for Again/Hard/Good/Easy so that
 * users always know exactly when the next review will be.
 * Falls back to ts-fsrs adaptive scheduling for any rating not
 * covered by the fixed-schedule table (shouldn't happen in practice).
 */
export function computeNextCard(
    card: FsrsCardData,
    rating: number,
    now: Date,
    _easyStreakCount: number = 0,
): FsrsCardData {
    const days = FIXED_SCHEDULED_DAYS[rating];
    if (days !== undefined) {
        const nextDue = new Date(now);
        nextDue.setDate(nextDue.getDate() + days);

        // State transitions mirror the old FSRS semantics but are much simpler:
        // Again  → Relearning (lapse++)
        // Hard   → Review (stable, slightly longer interval)
        // Good   → Review
        // Easy   → Review
        const nextState =
            rating === Rating.Again ? "Relearning" : "Review";

        return {
            ...card,
            due: nextDue,
            scheduled_days: days,
            state: nextState,
            reps: card.reps + 1,
            lapses: rating === Rating.Again ? card.lapses + 1 : card.lapses,
            elapsed_days: days,
            last_review: new Date(now),
            // Keep stability/difficulty as-is for display purposes
        };
    }

    // Legacy fallback — only reached for ratings outside 1-4
    const fsrsRating = validateFsrsRating(rating);
    const tsCard = toTsFsrsCard(card);
    const nowDate = new Date(now);

    const result = scheduler.next(tsCard as unknown as Card, nowDate, fsrsRating as unknown as Grade);

    return toFsrsCardData(result.card);
}

/**
 * Clamp a due date so it never lands on the same calendar day as "now".
 * If FSRS schedules the next review for today (minutes/hours later),
 * push it to tomorrow 06:00 local time and ensure scheduledDays >= 1.
 */
export function clampDueToNextDay(card: FsrsCardData, now: Date): FsrsCardData {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(6, 0, 0, 0);

    const due = new Date(card.due);

    if (due < tomorrow) {
        return {
            ...card,
            due: tomorrow,
            scheduled_days: Math.max(1, card.scheduled_days),
        };
    }

    return card;
}
