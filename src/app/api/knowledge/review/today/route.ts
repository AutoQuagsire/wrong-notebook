import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, badRequest, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { getKnowledgeTodayReviewList } from "@/lib/review/knowledge-today-service";
import { prisma } from "@/lib/prisma";

const logger = createLogger("api:knowledge:review:today");
const MAX_LIMIT = 100;

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return unauthorized("Authentication required");

    const { searchParams } = new URL(req.url);
    const limitRaw = searchParams.get("limit");
    const includeNew = searchParams.get("includeNew") === "true";
    const subjectId = searchParams.get("subjectId");
    const deck = searchParams.get("deck");

    let limit = 20;
    if (limitRaw !== null) {
        const parsed = parseInt(limitRaw, 10);
        if (isNaN(parsed) || parsed < 1) return badRequest("limit must be a positive integer");
        limit = Math.min(parsed, MAX_LIMIT);
    }

    try {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } });
        if (!user) return unauthorized("Authentication required");

        const result = await getKnowledgeTodayReviewList(
            user.id,
            limit,
            includeNew,
            subjectId,
            deck,
        );

        return NextResponse.json(result);
    } catch (error) {
        logger.error({ error }, "Error fetching knowledge review today list");
        return internalError("Failed to fetch today review list");
    }
}
