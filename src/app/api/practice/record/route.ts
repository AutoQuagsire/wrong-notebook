import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, badRequest, forbidden, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { processFsrsReview } from "@/lib/fsrs/service";

const logger = createLogger('api:practice:record');
const ORIGINAL_REVIEW = "ORIGINAL_REVIEW";
const DEFAULT_PRACTICE_TYPE = "SIMILAR_QUESTION";
const VALID_RATINGS = new Set([1, 2, 3, 4]);
const MAX_DURATION_SECONDS = 24 * 60 * 60;
const MAX_IMAGE_DATA_URL_LENGTH = 2_000_000;
const IMAGE_DATA_URL_PATTERN = /^data:image\/(?:png|jpe?g|webp|gif);base64,/i;

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

    // @ts-expect-error — session.user.id is injected via JWT callback but not in NextAuth types
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

        // @ts-expect-error — session.user.id is injected via JWT callback but not in NextAuth types
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

            const [record] = await prisma.$transaction(async (tx) => {
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

                await processFsrsReview(userId, errorItemId, normalizedRating, tx);

                return [created];
            });

            return NextResponse.json(record);
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
