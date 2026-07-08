import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, badRequest, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:knowledge-items:import");

const MAX_ITEMS = 200;

interface ImportItem {
    prompt: unknown;
    answer?: unknown;
    detail?: unknown;
    code?: unknown;
    tagId?: unknown;
    questionType?: unknown;
    source?: unknown;
    manualDifficulty?: unknown;
    order?: unknown;
    deck?: unknown;
}

interface ImportError {
    row: number;
    message: string;
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return unauthorized("Authentication required");

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return badRequest("Invalid JSON body");
    }

    const { subjectId, deck: topDeck, allowPlaceholderAnswer, items } = body;

    // Validate subjectId
    if (typeof subjectId !== "string" || subjectId.length === 0) {
        return badRequest("subjectId is required");
    }

    // Validate items is an array
    if (!Array.isArray(items)) {
        return badRequest("items must be an array");
    }
    if (items.length === 0) {
        return badRequest("items must not be empty");
    }
    if (items.length > MAX_ITEMS) {
        return badRequest(`items exceeds max of ${MAX_ITEMS}`);
    }

    const allowPlaceholder = Boolean(allowPlaceholderAnswer);

    try {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } });
        if (!user) return unauthorized("Authentication required");

        // Verify subject ownership
        const subject = await prisma.subject.findFirst({
            where: { id: subjectId, userId: user.id },
            select: { id: true },
        });
        if (!subject) return notFound("Subject not found");

        // Pre-validate all tagIds in batch
        const tagIds = new Set<string>();
        for (const item of items as ImportItem[]) {
            if (typeof item.tagId === "string" && item.tagId.length > 0) {
                tagIds.add(item.tagId);
            }
        }

        const validTagIds = new Set<string>();
        if (tagIds.size > 0) {
            const tags = await prisma.knowledgeTag.findMany({
                where: {
                    id: { in: Array.from(tagIds) },
                    OR: [{ isSystem: true }, { userId: user.id }],
                },
                select: { id: true },
            });
            for (const tag of tags) validTagIds.add(tag.id);
        }

        // Process items
        const errors: ImportError[] = [];
        const toCreate: Array<{
            userId: string;
            subjectId: string;
            prompt: string;
            answer: string;
            detail: string | null;
            deck: string | null;
            order: number;
            tagId: string | null;
            questionType: string;
            source: string | null;
            manualDifficulty: string | null;
        }> = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i] as ImportItem | undefined;
            const row = i + 1;

            if (!item || typeof item !== "object") {
                errors.push({ row, message: "item is not an object" });
                continue;
            }

            // Prompt is required
            if (typeof item.prompt !== "string" || item.prompt.trim().length === 0) {
                errors.push({ row, message: "prompt is required" });
                continue;
            }

            // Answer handling: always allow empty — answer is no longer required
            let answer: string;
            const rawAnswer = item.answer;
            if (typeof rawAnswer === "string" && rawAnswer.trim().length > 0) {
                answer = rawAnswer.trim();
            } else {
                answer = "";
            }

            // TagId validation
            let tagId: string | null = null;
            if (typeof item.tagId === "string" && item.tagId.length > 0) {
                if (!validTagIds.has(item.tagId)) {
                    errors.push({ row, message: `tagId "${item.tagId}" not found or not accessible` });
                    continue;
                }
                tagId = item.tagId;
            }

            // Deck: item.deck overrides top-level deck
            const deck = typeof item.deck === "string" && item.deck.trim().length > 0
                ? item.deck.trim()
                : typeof topDeck === "string" && topDeck.trim().length > 0
                    ? topDeck.trim()
                    : null;

            // source: code maps to source if source not already set
            let source: string | null = null;
            if (typeof item.source === "string" && item.source.trim().length > 0) {
                source = item.source.trim();
            } else if (typeof item.code === "string" && item.code.trim().length > 0) {
                source = item.code.trim();
            }

            toCreate.push({
                userId: user.id,
                subjectId,
                prompt: item.prompt.trim(),
                answer,
                detail: typeof item.detail === "string" && item.detail.trim().length > 0 ? item.detail.trim() : null,
                deck,
                order: typeof item.order === "number" ? item.order : i,
                tagId,
                questionType: typeof item.questionType === "string" && item.questionType.trim().length > 0
                    ? item.questionType.trim()
                    : "DICTATION",
                source,
                manualDifficulty: typeof item.manualDifficulty === "string" && item.manualDifficulty.trim().length > 0
                    ? item.manualDifficulty.trim()
                    : null,
            });
        }

        // Batch create
        const created: Array<{ id: string; prompt: string }> = [];
        if (toCreate.length > 0) {
            const results = await prisma.$transaction(
                toCreate.map((data) =>
                    prisma.knowledgeItem.create({
                        data,
                        select: { id: true, prompt: true },
                    })
                )
            );
            created.push(...results);
        }

        const result = {
            created: created.length,
            skipped: errors.length,
            errors,
            items: created,
        };

        logger.info({
            userId: user.id,
            subjectId,
            created: result.created,
            skipped: result.skipped,
        }, "Knowledge import completed");

        return NextResponse.json(result);
    } catch (error) {
        logger.error({ error }, "Error importing knowledge items");
        return internalError("Failed to import knowledge items");
    }
}
