import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, badRequest, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { processKnowledgeReview, KnowledgeItemNotFoundError } from "@/lib/fsrs/knowledge-service";

const logger = createLogger("api:knowledge:review:submit");

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return unauthorized("Authentication required");
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return badRequest("Invalid JSON body");
    }

    const { knowledgeItemId, rating, answerText, durationSeconds } = body;

    // Validate knowledgeItemId
    if (typeof knowledgeItemId !== "string" || knowledgeItemId.length === 0) {
        return badRequest("knowledgeItemId is required");
    }

    // Validate rating
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 4) {
        return badRequest("rating must be an integer between 1 and 4");
    }

    // Validate optional fields
    if (answerText !== undefined && answerText !== null && typeof answerText !== "string") {
        return badRequest("answerText must be a string");
    }

    if (durationSeconds !== undefined && durationSeconds !== null) {
        if (typeof durationSeconds !== "number" || !Number.isInteger(durationSeconds) || durationSeconds < 0) {
            return badRequest("durationSeconds must be a non-negative integer");
        }
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });

        if (!user) {
            return unauthorized("Authentication required");
        }

        // Verify ownership
        const knowledgeItem = await prisma.knowledgeItem.findUnique({
            where: { id: knowledgeItemId },
            select: { userId: true },
        });

        if (!knowledgeItem) {
            return notFound("Knowledge item not found");
        }

        if (knowledgeItem.userId !== user.id) {
            return notFound("Knowledge item not found");
        }

        const isCorrect = rating >= 3;

        const [log, reviewResult] = await prisma.$transaction(async (tx) => {
            const result = await processKnowledgeReview(user.id, knowledgeItemId, rating, tx);

            const created = await tx.knowledgeReviewLog.create({
                data: {
                    userId: user.id,
                    knowledgeItemId,
                    rating,
                    isCorrect,
                    answerText: typeof answerText === "string" ? answerText : null,
                    durationSeconds:
                        typeof durationSeconds === "number" ? durationSeconds : null,
                    nextReviewAt: result.nextReviewAt,
                    scheduledDays: result.scheduledDays,
                },
            });

            return [created, result];
        });

        logger.info(
            {
                knowledgeItemId,
                userId: user.id,
                rating,
                answerTextLength: typeof answerText === "string" ? answerText.length : 0,
                durationSeconds: durationSeconds ?? null,
                nextReviewAt: reviewResult.nextReviewAt.toISOString(),
            },
            "Knowledge review submitted",
        );

        return NextResponse.json({
            log,
            reviewResult: {
                nextReviewAt: reviewResult.nextReviewAt.toISOString(),
                scheduledDays: reviewResult.scheduledDays,
                state: reviewResult.state,
                reps: reviewResult.reps,
                lapses: reviewResult.lapses,
            },
        });
    } catch (error) {
        if (error instanceof KnowledgeItemNotFoundError) {
            return notFound("Knowledge item not found");
        }
        logger.error({ error, knowledgeItemId: knowledgeItemId as string }, "Error submitting knowledge review");
        return internalError("Failed to submit review");
    }
}
