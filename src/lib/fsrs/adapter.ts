import {
    createEmptyCard,
    fsrs,
    Rating,
    State,
    default_w,
} from "ts-fsrs";

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

const scheduler = fsrs(default_w);

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

function toFsrsCardData(card: {
    due: Date;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    state: number;
    last_review: Date | null | undefined;
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
 */
export function computeNextCard(card: FsrsCardData, rating: number, now: Date): FsrsCardData {
    const fsrsRating = validateFsrsRating(rating);
    const tsCard = toTsFsrsCard(card);
    const nowDate = new Date(now);

    const result = scheduler.next(tsCard, nowDate, fsrsRating);

    return toFsrsCardData(result.card);
}
