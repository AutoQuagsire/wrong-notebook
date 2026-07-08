import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, badRequest, notFound, internalError, conflict } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:knowledge-items");

function autoSuggestSource(existingSources: string[]): string | null {
    // Find all sources matching pattern PREFIX + NUMBER (e.g. "MFD-09", "DE-18", "CH2-003")
    const parsed: { prefix: string; num: number; width: number }[] = [];
    for (const s of existingSources) {
        const m = s.match(/^(.*?)(\d+)$/);
        if (m) {
            parsed.push({ prefix: m[1], num: parseInt(m[2], 10), width: m[2].length });
        }
    }
    if (parsed.length === 0) return null;
    // Use the most common prefix for this deck
    const prefixCount = new Map<string, number>();
    for (const p of parsed) prefixCount.set(p.prefix, (prefixCount.get(p.prefix) ?? 0) + 1);
    const dominantPrefix = [...prefixCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const samePrefix = parsed.filter(p => p.prefix === dominantPrefix);
    const maxNum = Math.max(...samePrefix.map(p => p.num));
    const width = samePrefix.find(p => p.num === maxNum)?.width ?? 2;
    const nextNum = (maxNum + 1).toString().padStart(width, '0');
    return `${dominantPrefix}${nextNum}`;
}

function normalizeDeck(deck: unknown): string {
    return typeof deck === "string" && deck.trim().length > 0 ? deck.trim() : "";
}

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return unauthorized("Authentication required");

    const { searchParams } = new URL(req.url);
    const subjectId = searchParams.get("subjectId");
    const tagId = searchParams.get("tagId");
    const deck = searchParams.get("deck");
    const query = searchParams.get("query");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));

    try {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } });
        if (!user) return unauthorized("Authentication required");

        const where: Record<string, unknown> = { userId: user.id };
        if (subjectId) where.subjectId = subjectId;
        if (tagId) where.tagId = tagId;
        if (deck) where.deck = deck;

        if (query) {
            where.OR = [
                { prompt: { contains: query } },
                { answer: { contains: query } },
                { detail: { contains: query } },
            ];
        }

        const [items, total] = await Promise.all([
            prisma.knowledgeItem.findMany({
                where,
                orderBy: [{ deck: "asc" }, { order: "asc" }, { updatedAt: "desc" }],
                skip: (page - 1) * pageSize,
                take: pageSize,
                select: {
                    id: true,
                    userId: true,
                    subjectId: true,
                    subject: { select: { id: true, name: true } },
                    prompt: true,
                    answer: true,
                    detail: true,
                    deck: true,
                    order: true,
                    tagId: true,
                    tag: { select: { id: true, name: true, subject: true } },
                    questionType: true,
                    source: true,
                    manualDifficulty: true,
                    createdAt: true,
                    updatedAt: true,
                    reviewState: {
                        select: {
                            due: true,
                            state: true,
                            reps: true,
                            lapses: true,
                            last_review: true,
                        },
                    },
                },
            }),
            prisma.knowledgeItem.count({ where }),
        ]);

        return NextResponse.json({
            items,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        });
    } catch (error) {
        logger.error({ error }, "Error listing knowledge items");
        return internalError("Failed to list knowledge items");
    }
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

    const {
        subjectId, tagId, prompt, answer, detail,
        deck, order, questionType, source, manualDifficulty,
    } = body;

    if (typeof subjectId !== "string" || subjectId.length === 0) return badRequest("subjectId is required");
    if (typeof prompt !== "string" || prompt.trim().length === 0) return badRequest("prompt is required");

    try {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } });
        if (!user) return unauthorized("Authentication required");

        const subject = await prisma.subject.findFirst({
            where: { id: subjectId, userId: user.id },
            select: { id: true },
        });
        if (!subject) return notFound("Subject not found");

        if (typeof tagId === "string" && tagId.length > 0) {
            const tag = await prisma.knowledgeTag.findFirst({
                where: { id: tagId, OR: [{ isSystem: true }, { userId: user.id }] },
                select: { id: true },
            });
            if (!tag) return notFound("Tag not found");
        }

        const effectiveDeck = normalizeDeck(deck);

        // Auto-compute order if not provided
        let effectiveOrder: number;
        if (typeof order === "number" && Number.isFinite(order)) {
            effectiveOrder = order;
        } else {
            const maxOrder = await prisma.knowledgeItem.aggregate({
                where: { userId: user.id, subjectId, deck: effectiveDeck || null },
                _max: { order: true },
            });
            effectiveOrder = (maxOrder._max.order ?? -1) + 1;
        }

        // Auto-suggest or validate source
        let effectiveSource: string | null = null;
        if (typeof source === "string" && source.trim().length > 0) {
            effectiveSource = source.trim();
        } else {
            // Try auto-suggest from existing sources in same deck
            const existingRows = await prisma.knowledgeItem.findMany({
                where: {
                    userId: user.id,
                    subjectId,
                    deck: effectiveDeck || null,
                    source: { not: null },
                },
                select: { source: true },
                orderBy: { source: "asc" },
            });
            const existingSources = existingRows.map(r => r.source!).filter(Boolean);
            effectiveSource = autoSuggestSource(existingSources);
        }

        // Soft duplicate check
        if (effectiveSource) {
            const sourceWhere: Record<string, unknown> = {
                userId: user.id,
                subjectId,
                deck: effectiveDeck || null,
                source: effectiveSource,
            };
            const duplicate = await prisma.knowledgeItem.findFirst({ where: sourceWhere, select: { id: true } });
            if (duplicate) {
                return conflict("同一章节下已存在相同编号");
            }
        }

        const item = await prisma.knowledgeItem.create({
            data: {
                userId: user.id,
                subjectId,
                prompt: prompt.trim(),
                answer: (typeof answer === "string" && answer.trim().length > 0) ? answer.trim() : "",
                detail: typeof detail === "string" ? detail : null,
                deck: typeof deck === "string" ? deck : null,
                order: effectiveOrder,
                tagId: typeof tagId === "string" && tagId.length > 0 ? tagId : null,
                questionType: typeof questionType === "string" ? questionType : "DICTATION",
                source: effectiveSource,
                manualDifficulty: typeof manualDifficulty === "string" ? manualDifficulty : null,
            },
        });

        logger.info({ knowledgeItemId: item.id, userId: user.id, source: effectiveSource, order: effectiveOrder }, "Knowledge item created");
        return NextResponse.json(item, { status: 201 });
    } catch (error) {
        logger.error({ error }, "Error creating knowledge item");
        return internalError("Failed to create knowledge item");
    }
}
