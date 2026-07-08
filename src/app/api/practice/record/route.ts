import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, badRequest, forbidden, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { processFsrsReview } from "@/lib/fsrs/service";
import type { PrismaClient } from "@prisma/client";

type PrismaTx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

const logger = createLogger('api:practice:record');
const ORIGINAL_REVIEW = "ORIGINAL_REVIEW";
const DEFAULT_PRACTICE_TYPE = "SIMILAR_QUESTION";
const VALID_RATINGS = new Set([1, 2, 3, 4]);
const MAX_DURATION_SECONDS = 24 * 60 * 60;
const MAX_IMAGE_DATA_URL_LENGTH = 2_000_000;
const IMAGE_DATA_URL_PATTERN = /^data:image\/(?:png|jpe?g|webp|gif);base64,/i;
const EASY_STREAK_THRESHOLD = 3;

/**
 * Count consecutive Easy (rating=4) ORIGINAL_REVIEW records for a given errorItem.
 * Stops counting when it hits a non-Easy ORIGINAL_REVIEW rating.
 * SIMILAR_QUESTION records are skipped (they do NOT break the streak).
 *
 * Returns the count of consecutive Easy records (0 if the most recent
 * ORIGINAL_REVIEW is not rating=4).
 *
 * In-tx variant: uses the same transaction client so it sees uncommitted writes.
 */
async function countConsecutiveEasyReviewsInTx(
    tx: PrismaTx,
    userId: string,
    errorItemId: string,
): Promise<number> {
    const recentReviews = await tx.practiceRecord.findMany({
        where: {
            userId,
            errorItemId,
            practiceType: ORIGINAL_REVIEW,
            rating: { not: null },
        },
        orderBy: { createdAt: "desc" },
        select: { rating: true },
        take: 10,
    });

    let count = 0;
    for (const record of recentReviews) {
        if (record.rating === 4) {
            count++;
        } else {
            break;
        }
    }

    return count;
}

async function countConsecutiveEasyReviews(
    userId: string,
    errorItemId: string,
): Promise<number> {
    const recentReviews = await prisma.practiceRecord.findMany({
        where: {
            userId,
            errorItemId,
            practiceType: ORIGINAL_REVIEW,
            rating: { not: null },
        },
        orderBy: { createdAt: "desc" },
        select: { rating: true },
        take: 10,
    });

    let count = 0;
    for (const record of recentReviews) {
        if (record.rating === 4) {
            count++;
        } else {
            break;
        }
    }

    return count;
}

async function maybeMarkMasteredAfterEasyStreak(
    userId: string,
    errorItemId: string,
): Promise<void> {
    const recentReviews = await prisma.practiceRecord.findMany({
        where: {
            userId,
            errorItemId,
            practiceType: ORIGINAL_REVIEW,
            rating: { not: null },
        },
        orderBy: { createdAt: "desc" },
        select: { rating: true, id: true },
        take: EASY_STREAK_THRESHOLD,
    });

    if (
        recentReviews.length === EASY_STREAK_THRESHOLD &&
        recentReviews.every((r) => r.rating === 4)
    ) {
        await prisma.errorItem.updateMany({
            where: { id: errorItemId, userId, masteryLevel: { not: 2 } },
            data: { masteryLevel: 2 },
        });
    }
}

function normalizeAnswerText(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeAnswerImageUrl(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function validateAnswerImageUrl(answerImageUrl: string | null): string | null {
    if (!answerImageUrl) {
        return null;
    }

    if (!IMAGE_DATA_URL_PATTERN.test(answerImageUrl)) {
        return "answerImageUrl must be a valid image Data URL";
    }

    if (answerImageUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
        return "answerImageUrl is too large";
    }

    return null;
}

function validateRating(value: unknown): number | null {
    if (value === undefined || value === null) {
        return null;
    }

    if (!Number.isInteger(value) || !VALID_RATINGS.has(value as number)) {
        return null;
    }

    return value as number;
}

function validateDurationSeconds(value: unknown): number | null {
    if (value === undefined || value === null) {
        return null;
    }

    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > MAX_DURATION_SECONDS) {
        return null;
    }

    return value as number;
}

function mapRatingToCorrectness(rating: number): boolean {
    return rating >= 3;
}

const VALID_PRACTICE_TYPES = new Set(["SIMILAR_QUESTION", "ORIGINAL_REVIEW"]);

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }

    const { searchParams } = new URL(req.url);
    const errorItemId = searchParams.get("errorItemId");
    const practiceType = searchParams.get("practiceType");

    if (!errorItemId) {
        return badRequest("errorItemId is required");
    }

    if (practiceType && !VALID_PRACTICE_TYPES.has(practiceType)) {
        return badRequest(`Invalid practiceType. Must be one of: ${Array.from(VALID_PRACTICE_TYPES).join(", ")}`);
    }

    const userId = session.user.id;

    try {
        const errorItem = await prisma.errorItem.findUnique({
            where: { id: errorItemId },
            select: { userId: true },
        });

        if (!errorItem) {
            return badRequest("Error item not found");
        }

        if (errorItem.userId !== userId) {
            return forbidden("Cannot access another user's review history");
        }

        const whereClause: Record<string, unknown> = {
            userId,
            errorItemId,
        };

        if (practiceType) {
            whereClause.practiceType = practiceType;
        }

        const records = await prisma.practiceRecord.findMany({
            where: whereClause,
            orderBy: {
                createdAt: "desc",
            },
        });

        return NextResponse.json(records);
    } catch (error) {
        logger.error({ error, userId, errorItemId }, 'Error fetching practice history');
        return internalError("Failed to fetch practice history");
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }

    try {
        const {
            subject,
            difficulty,
            isCorrect,
            errorItemId,
            practiceType,
            rating,
            durationSeconds,
            usedHint,
            independent,
            answerText,
            answerImageUrl,
            revealedAnswer,
        } = await req.json();

        const userId = session.user.id;
        const normalizedPracticeType = practiceType || DEFAULT_PRACTICE_TYPE;
        const normalizedAnswerText = normalizeAnswerText(answerText);
        const normalizedAnswerImageUrl = normalizeAnswerImageUrl(answerImageUrl);
        const normalizedRating = validateRating(rating);
        const normalizedDurationSeconds = validateDurationSeconds(durationSeconds);

        const answerImageError = validateAnswerImageUrl(normalizedAnswerImageUrl);
        if (answerImageError) {
            return badRequest(answerImageError);
        }

        if ((rating !== undefined && rating !== null) && normalizedRating === null) {
            return badRequest("rating must be an integer between 1 and 4");
        }

        if ((durationSeconds !== undefined && durationSeconds !== null) && normalizedDurationSeconds === null) {
            return badRequest("durationSeconds must be an integer between 0 and 86400");
        }

        let errorItem: { userId: string; subject: { name: string } | null } | null = null;

        // Validate errorItemId ownership if provided
        if (errorItemId) {
            errorItem = await prisma.errorItem.findUnique({
                where: { id: errorItemId },
                select: {
                    userId: true,
                    subject: {
                        select: {
                            name: true,
                        },
                    },
                },
            });

            if (!errorItem) {
                return badRequest("Error item not found");
            }

            if (errorItem.userId !== userId) {
                logger.warn({
                    userId,
                    errorItemId,
                    errorItemOwnerId: errorItem.userId,
                }, 'Attempted to record practice for another user\'s error item');
                return forbidden("Cannot record practice for another user's error item");
            }
        }

        if (normalizedPracticeType === ORIGINAL_REVIEW) {
            if (!errorItemId || !errorItem) {
                return badRequest("errorItemId is required for original review");
            }

            if (!revealedAnswer) {
                return badRequest("Please reveal the answer before rating this review");
            }

            if (normalizedRating === null) {
                return badRequest("rating is required for original review");
            }

            if (normalizedDurationSeconds === null) {
                return badRequest("durationSeconds is required for original review");
            }

            const duplicateRecord = await prisma.practiceRecord.findFirst({
                where: {
                    userId,
                    errorItemId,
                    practiceType: ORIGINAL_REVIEW,
                    rating: normalizedRating,
                    durationSeconds: normalizedDurationSeconds,
                    answerText: normalizedAnswerText,
                    answerImageUrl: normalizedAnswerImageUrl,
                    createdAt: {
                        gte: new Date(Date.now() - 10_000),
                    },
                },
                orderBy: {
                    createdAt: "desc",
                },
            });

            if (duplicateRecord) {
                return NextResponse.json(duplicateRecord);
            }

            const [record, fsrsResult] = await prisma.$transaction(async (tx) => {
                const created = await tx.practiceRecord.create({
                    data: {
                        userId,
                        subject: errorItem.subject?.name || subject || null,
                        difficulty: null,
                        isCorrect: mapRatingToCorrectness(normalizedRating),
                        errorItemId,
                        practiceType: ORIGINAL_REVIEW,
                        rating: normalizedRating,
                        durationSeconds: normalizedDurationSeconds,
                        usedHint: usedHint ?? null,
                        independent: independent ?? null,
                        answerText: normalizedAnswerText,
                        answerImageUrl: normalizedAnswerImageUrl,
                    },
                });

                // Compute Easy streak count BEFORE creating the record:
                // count existing consecutive Easy ORIGINAL_REVIEW records.
                // The current rating (just created above) counts as +1 if it's Easy.
                let easyStreakCount = 0;
                const existingEasyCount = await countConsecutiveEasyReviewsInTx(
                    tx,
                    userId,
                    errorItemId,
                );
                if (normalizedRating === 4) {
                    easyStreakCount = existingEasyCount + 1;
                }

                // Auto-mastery: 3+ consecutive Easy → delete FsrsCard + mark masteryLevel=2
                if (easyStreakCount >= 3) {
                    await tx.fsrsCard.deleteMany({
                        where: { errorItemId, userId },
                    });
                    await tx.errorItem.updateMany({
                        where: { id: errorItemId, userId, masteryLevel: { not: 2 } },
                        data: { masteryLevel: 2 },
                    });

                    // Return a synthetic result — card has been deleted
                    const now = new Date();
                    return [created, {
                        due: now,
                        scheduled_days: 0,
                        state: "Mastered",
                        reps: 0,
                        lapses: 0,
                        stability: null,
                        difficulty: null,
                        elapsed_days: 0,
                        last_review: now,
                    }];
                }

                const updatedCard = await processFsrsReview(
                    userId,
                    errorItemId,
                    normalizedRating,
                    tx,
                    easyStreakCount,
                );

                return [created, updatedCard];
            });

            // After successful FSRS review, check for easy streak → auto-master
            // (backward compat: catch the case where easyStreakCount was computed
            //  but auto-mastery wasn't applied in the tx because easyStreakCount < 3
            //  and maybeMarkMasteredAfterEasyStreak is the old 3-in-a-row check)
            // Must run outside the transaction so the new record is visible
            if (normalizedRating !== 4) {
                await maybeMarkMasteredAfterEasyStreak(userId, errorItemId);
            }

            const responseBody = {
                ...record,
                reviewResult: {
                    nextReviewAt: fsrsResult.due.toISOString(),
                    scheduledDays: fsrsResult.scheduled_days,
                    state: fsrsResult.state,
                    reps: fsrsResult.reps,
                    lapses: fsrsResult.lapses,
                },
            };

            return NextResponse.json(responseBody);
        }

        const record = await prisma.practiceRecord.create({
            data: {
                userId,
                subject: errorItem?.subject?.name || subject || null,
                difficulty,
                isCorrect,
                errorItemId: errorItemId || null,
                practiceType: normalizedPracticeType,
                rating: normalizedRating,
                durationSeconds: normalizedDurationSeconds,
                usedHint: usedHint ?? null,
                independent: independent ?? null,
                answerText: normalizedAnswerText,
                answerImageUrl: normalizedAnswerImageUrl,
            },
        });

        return NextResponse.json(record);
    } catch (error) {
        logger.error({ error }, 'Error saving practice record');
        return internalError("Failed to save record");
    }
}
