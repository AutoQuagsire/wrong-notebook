import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, badRequest, forbidden, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:practice:record');

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
        } = await req.json();

        // @ts-expect-error — session.user.id is injected via JWT callback but not in NextAuth types
        const userId = session.user.id;

        // Validate errorItemId ownership if provided
        if (errorItemId) {
            const errorItem = await prisma.errorItem.findUnique({
                where: { id: errorItemId },
                select: { userId: true },
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

        const record = await prisma.practiceRecord.create({
            data: {
                userId,
                subject,
                difficulty,
                isCorrect,
                errorItemId: errorItemId || null,
                practiceType: practiceType || "SIMILAR_QUESTION",
                rating: rating ?? null,
                durationSeconds: durationSeconds ?? null,
                usedHint: usedHint ?? null,
                independent: independent ?? null,
                answerText: answerText ?? null,
            },
        });

        return NextResponse.json(record);
    } catch (error) {
        logger.error({ error }, 'Error saving practice record');
        return internalError("Failed to save record");
    }
}
