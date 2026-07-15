import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, forbidden, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { isErrorItemInTodayReviewQueue } from "@/lib/review/today-service";

const logger = createLogger('api:error-items:mastery');
const TODAY_REVIEW_SOURCE = "TODAY_REVIEW";

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    try {
        let user;
        if (session?.user?.email) {
            user = await prisma.user.findUnique({
                where: { email: session.user.email },
            });
        }

        if (!user) {
            return unauthorized("Authentication required");
        }

        const { masteryLevel, source } = await req.json();

        if (typeof masteryLevel !== "number" || ![0, 1, 2].includes(masteryLevel)) {
            return NextResponse.json(
                { message: "masteryLevel must be 0, 1, or 2" },
                { status: 400 },
            );
        }

        if (source !== undefined && source !== TODAY_REVIEW_SOURCE) {
            return NextResponse.json(
                { message: "Invalid source" },
                { status: 400 },
            );
        }

        // Verify ownership before update
        const existingItem = await prisma.errorItem.findUnique({
            where: { id },
            select: {
                id: true,
                userId: true,
                masteryLevel: true,
            },
        });

        if (!existingItem) {
            return notFound("Item not found");
        }

        if (existingItem.userId !== user.id) {
            return forbidden("Not authorized to update this item");
        }

        if (existingItem.masteryLevel === masteryLevel) {
            return NextResponse.json({
                id: existingItem.id,
                masteryLevel: existingItem.masteryLevel,
            });
        }

        const errorItem = await prisma.$transaction(async (tx) => {
            const shouldCountAsCompleted =
                source === TODAY_REVIEW_SOURCE &&
                masteryLevel === 2 &&
                existingItem.masteryLevel !== 2 &&
                await isErrorItemInTodayReviewQueue(user.id, id, tx);

            const updated = await tx.errorItem.updateMany({
                where: {
                    id,
                    userId: user.id,
                    masteryLevel: { not: masteryLevel },
                },
                data: {
                    masteryLevel,
                },
            });

            if (updated.count === 0) {
                return tx.errorItem.findUniqueOrThrow({
                    where: { id },
                    select: {
                        id: true,
                        masteryLevel: true,
                    },
                });
            }

            if (shouldCountAsCompleted) {
                await tx.practiceRecord.create({
                    data: {
                        userId: user.id,
                        subject: null,
                        difficulty: null,
                        isCorrect: null,
                        errorItemId: id,
                        practiceType: "MARK_MASTERED",
                        rating: null,
                        durationSeconds: null,
                        usedHint: null,
                        independent: null,
                        answerText: null,
                        answerImageUrl: null,
                    },
                });
            }

            return tx.errorItem.findUniqueOrThrow({
                where: { id },
                select: {
                    id: true,
                    masteryLevel: true,
                },
            });
        });

        return NextResponse.json(errorItem);
    } catch (error) {
        logger.error({ error }, 'Error updating item');
        return internalError("Failed to update error item");
    }
}
