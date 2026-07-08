import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorized, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { createNewCard } from "@/lib/fsrs/adapter";

const logger = createLogger("api:knowledge-items:mark-unknown");

function getResetStateName(state: string | null | undefined, reps: number): string {
    if (state === "Review" || state === "Relearning" || reps > 0) {
        return "Relearning";
    }

    return "Learning";
}

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return unauthorized("Authentication required");
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { id: true },
        });

        if (!user) {
            return unauthorized("Authentication required");
        }

        const knowledgeItem = await prisma.knowledgeItem.findFirst({
            where: { id, userId: user.id },
            select: { id: true },
        });

        if (!knowledgeItem) {
            return notFound("Knowledge item not found");
        }

        const now = new Date();

        const reviewState = await prisma.$transaction(async (tx) => {
            const existing = await tx.knowledgeReviewState.findUnique({
                where: { knowledgeItemId: id },
                select: {
                    id: true,
                    stability: true,
                    difficulty: true,
                    elapsed_days: true,
                    scheduled_days: true,
                    reps: true,
                    lapses: true,
                    state: true,
                    last_review: true,
                },
            });

            const newCard = createNewCard(now);

            return tx.knowledgeReviewState.upsert({
                where: { knowledgeItemId: id },
                create: {
                    userId: user.id,
                    knowledgeItemId: id,
                    due: now,
                    stability: newCard.stability,
                    difficulty: newCard.difficulty,
                    elapsed_days: newCard.elapsed_days,
                    scheduled_days: newCard.scheduled_days,
                    reps: newCard.reps,
                    lapses: newCard.lapses,
                    state: "Learning",
                    last_review: newCard.last_review,
                },
                update: {
                    due: now,
                    state: getResetStateName(existing?.state, existing?.reps ?? 0),
                },
                select: {
                    knowledgeItemId: true,
                    due: true,
                    state: true,
                },
            });
        });

        logger.info(
            { knowledgeItemId: id, userId: user.id, due: reviewState.due.toISOString() },
            "Knowledge item marked as unknown",
        );

        return NextResponse.json({
            knowledgeItemId: reviewState.knowledgeItemId,
            due: reviewState.due.toISOString(),
            state: reviewState.state,
            status: "ok",
            message: "已设为不会，已加入待复习队列",
        });
    } catch (error) {
        logger.error({ error, knowledgeItemId: id }, "Error marking knowledge item as unknown");
        return internalError("Failed to mark knowledge item as unknown");
    }
}
