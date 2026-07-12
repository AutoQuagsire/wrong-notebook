import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, forbidden, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:error-items:mastery');

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

        const { masteryLevel } = await req.json();

        if (typeof masteryLevel !== "number" || ![0, 1, 2].includes(masteryLevel)) {
            return NextResponse.json(
                { message: "masteryLevel must be 0, 1, or 2" },
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

        const errorItem = await prisma.errorItem.update({
            where: {
                id,
            },
            data: {
                masteryLevel,
            },
            select: {
                id: true,
                masteryLevel: true,
            },
        });

        return NextResponse.json(errorItem);
    } catch (error) {
        logger.error({ error }, 'Error updating item');
        return internalError("Failed to update error item");
    }
}
