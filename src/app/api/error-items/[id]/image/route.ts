import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, notFound } from "@/lib/api-errors";

/**
 * GET /api/error-items/[id]/image
 *
 * Returns the original image as binary (image/png, image/jpeg, etc.)
 * instead of as a base64 data URL embedded in JSON.
 *
 * Cache: private, 1 day (images don't change after upload).
 */
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return unauthorized();
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });

    if (!user) {
        return unauthorized();
    }

    const item = await prisma.errorItem.findFirst({
        where: { id, userId: user.id },
        select: { originalImageUrl: true },
    });

    if (!item) {
        return notFound("Error item not found");
    }

    const raw = item.originalImageUrl;

    if (!raw) {
        return notFound("No image attached to this error item");
    }

    // Handle data: URLs (the current storage format)
    const dataUrlMatch = raw.match(/^data:(.+?);base64,(.*)$/);
    if (dataUrlMatch) {
        const [, mimeType, base64] = dataUrlMatch;
        const buffer = Buffer.from(base64, "base64");

        return new Response(buffer, {
            status: 200,
            headers: {
                "Content-Type": mimeType,
                "Cache-Control": "private, max-age=86400",
                "Content-Length": String(buffer.length),
            },
        });
    }

    // Handle regular URLs (s3, external, etc.) — redirect
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
        return NextResponse.redirect(raw);
    }

    // Unknown format — return 400 to fail safely
    return new NextResponse("Unsupported image format", { status: 400 });
}
