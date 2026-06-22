import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, badRequest, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { getTodayReviewList } from "@/lib/review/today-service";

const logger = createLogger("api:review:today");
const MAX_LIMIT = 100;

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return unauthorized();
    }

    const { searchParams } = new URL(req.url);
    const limitRaw = searchParams.get("limit");
    const includeNew = searchParams.get("includeNew") === "true";

    let limit = 20;
    if (limitRaw !== null) {
        const parsed = parseInt(limitRaw, 10);
        if (isNaN(parsed) || parsed < 1) {
            return badRequest("limit must be a positive integer");
        }
        limit = Math.min(parsed, MAX_LIMIT);
    }

    // @ts-expect-error — session.user.id is injected via JWT callback
    const userId = session.user.id;

    try {
        const result = await getTodayReviewList(userId, limit, includeNew);

        return NextResponse.json(result);
    } catch (error) {
        logger.error({ error, userId }, "Error fetching today review list");
        return internalError("Failed to fetch today review list");
    }
}
