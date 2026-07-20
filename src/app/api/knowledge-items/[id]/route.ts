import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, badRequest, notFound, internalError, conflict } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:knowledge-items:id");

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return unauthorized("Authentication required");

    try {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } });
        if (!user) return unauthorized("Authentication required");

        const item = await prisma.knowledgeItem.findUnique({
            where: { id },
            include: {
                subject: { select: { id: true, name: true } },
                tag: { select: { id: true, name: true, subject: true } },
                reviewState: true,
            },
        });

        if (!item || item.userId !== user.id) return notFound("Knowledge item not found");

        return NextResponse.json(item);
    } catch (error) {
        logger.error({ error, id }, "Error fetching knowledge item");
        return internalError("Failed to fetch knowledge item");
    }
}

export async function PUT(
    req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return unauthorized("Authentication required");

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return badRequest("Invalid JSON body");
    }

    try {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } });
        if (!user) return unauthorized("Authentication required");

        const existing = await prisma.knowledgeItem.findUnique({
            where: { id },
            select: { userId: true },
        });
        if (!existing || existing.userId !== user.id) return notFound("Knowledge item not found");

        const {
            subjectId, tagId, prompt, answer, detail,
            deck, order, questionType, source, manualDifficulty,
        } = body;

        if (typeof subjectId === "string" && subjectId.length > 0) {
            const subject = await prisma.subject.findFirst({
                where: { id: subjectId, userId: user.id },
                select: { id: true },
            });
            if (!subject) return notFound("Subject not found");
        }

        if (typeof tagId === "string") {
            if (tagId.length > 0) {
                const tag = await prisma.knowledgeTag.findFirst({
                    where: { id: tagId, OR: [{ isSystem: true }, { userId: user.id }] },
                    select: { id: true },
                });
                if (!tag) return notFound("Tag not found");
            }
        }

        const data: Record<string, unknown> = {};
        if (typeof prompt === "string") data.prompt = prompt.trim();
        if (typeof answer === "string") data.answer = answer.trim();
        if (typeof detail !== "undefined") data.detail = typeof detail === "string" ? detail : null;
        if (typeof subjectId === "string") data.subjectId = subjectId;
        if (typeof deck !== "undefined") data.deck = typeof deck === "string" ? deck : null;
        if (typeof order === "number" && Number.isFinite(order)) data.order = order;
        if (typeof tagId === "string") data.tagId = tagId.length > 0 ? tagId : null;
        if (typeof questionType === "string") data.questionType = questionType;
        if (typeof source !== "undefined") data.source = typeof source === "string" ? source : null;
        if (typeof manualDifficulty !== "undefined") data.manualDifficulty = typeof manualDifficulty === "string" ? manualDifficulty : null;

        // Soft duplicate check for source
        if (typeof source === "string" && source.trim().length > 0) {
            const effectiveDeck = typeof deck === "string" && deck.trim().length > 0 ? deck.trim() : "";
            const existingForDuplicate = await prisma.knowledgeItem.findUnique({
                where: { id },
                select: { subjectId: true, deck: true, source: true },
            });
            const targetSubjectId = typeof subjectId === "string" ? subjectId : existingForDuplicate?.subjectId;
            const targetDeck = typeof deck !== "undefined"
                ? (typeof deck === "string" && deck.trim().length > 0 ? deck.trim() : null)
                : (existingForDuplicate?.deck ?? null);
            const duplicate = await prisma.knowledgeItem.findFirst({
                where: {
                    userId: user.id,
                    subjectId: targetSubjectId ?? (existingForDuplicate?.subjectId ?? ""),
                    deck: targetDeck,
                    source: source.trim(),
                    id: { not: id },
                },
                select: { id: true },
            });
            if (duplicate) {
                return conflict("同一章节下已存在相同编号");
            }
        }

        const updated = await prisma.knowledgeItem.update({
            where: { id },
            data,
        });

        logger.info({ knowledgeItemId: id, userId: user.id }, "Knowledge item updated");
        return NextResponse.json(updated);
    } catch (error) {
        logger.error({ error, id }, "Error updating knowledge item");
        return internalError("Failed to update knowledge item");
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    return handleDeleteKnowledgeItem(req, { params });
}

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    return handleDeleteKnowledgeItem(req, { params });
}

async function handleDeleteKnowledgeItem(
    req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return unauthorized("Authentication required");

    try {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } });
        if (!user) return unauthorized("Authentication required");

        const existing = await prisma.knowledgeItem.findUnique({
            where: { id },
            select: { userId: true },
        });
        if (!existing || existing.userId !== user.id) return notFound("Knowledge item not found");

        await prisma.knowledgeItem.delete({ where: { id } });

        logger.info({ knowledgeItemId: id, userId: user.id }, "Knowledge item deleted");
        return NextResponse.json({ deleted: true });
    } catch (error) {
        logger.error({ error, id }, "Error deleting knowledge item");
        return internalError("Failed to delete knowledge item");
    }
}
