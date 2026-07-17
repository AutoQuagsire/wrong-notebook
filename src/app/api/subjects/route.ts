import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const logger = createLogger("api:subjects");

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return unauthorized("Authentication required");

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { id: true },
        });

        if (!user) return unauthorized("Authentication required");

        const subjects = await prisma.subject.findMany({
            where: { userId: user.id },
            select: { id: true, name: true },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json(subjects);
    } catch (error) {
        logger.error({ error }, "Error fetching subjects");
        return internalError("Failed to fetch subjects");
    }
}
