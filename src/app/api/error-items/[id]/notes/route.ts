import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, forbidden, notFound, badRequest, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:error-items:notes');

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

        let body;
        try {
            body = await req.json();
        } catch {
            return badRequest("Invalid JSON body");
        }

        const { userNotes } = body;

        // userNotes 必须是 string（允许空字符串，用于清空笔记）
        if (typeof userNotes !== "string") {
            return badRequest("userNotes must be a string");
        }

        // 校验错题所有权
        const existing = await prisma.errorItem.findFirst({
            where: { id, userId: user.id },
            select: { id: true },
        });

        if (!existing) {
            return notFound("Error item not found");
        }

        const updated = await prisma.errorItem.update({
            where: { id },
            data: { userNotes },
        });

        logger.info(
            { errorItemId: id, userId: user.id, notesLength: userNotes.length },
            "Notes updated"
        );

        return NextResponse.json(updated);
    } catch (error) {
        logger.error({ error, errorItemId: id }, "Error updating notes");
        return internalError("Failed to update notes");
    }
}
