import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, badRequest, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:knowledge-items");

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
    if (typeof answer !== "string" || answer.trim().length === 0) return badRequest("answer is required");

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

        const item = await prisma.knowledgeItem.create({
            data: {
                userId: user.id,
                subjectId,
                prompt: prompt.trim(),
                answer: answer.trim(),
                detail: typeof detail === "string" ? detail : null,
                deck: typeof deck === "string" ? deck : null,
                order: typeof order === "number" ? order : 0,
                tagId: typeof tagId === "string" && tagId.length > 0 ? tagId : null,
                questionType: typeof questionType === "string" ? questionType : "DICTATION",
                source: typeof source === "string" ? source : null,
                manualDifficulty: typeof manualDifficulty === "string" ? manualDifficulty : null,
            },
        });

        logger.info({ knowledgeItemId: item.id, userId: user.id }, "Knowledge item created");
        return NextResponse.json(item, { status: 201 });
    } catch (error) {
        logger.error({ error }, "Error creating knowledge item");
        return internalError("Failed to create knowledge item");
    }
}
