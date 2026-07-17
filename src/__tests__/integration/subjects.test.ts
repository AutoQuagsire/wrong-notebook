import { beforeEach, describe, expect, it, vi } from "vitest";
import { getServerSession } from "next-auth";

import { GET } from "@/app/api/subjects/route";

const mocks = vi.hoisted(() => ({
    mockPrismaUser: { findUnique: vi.fn() },
    mockPrismaSubject: { findMany: vi.fn(), create: vi.fn() },
    mockSession: { user: { email: "user@test.com", id: "user-123" } },
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: mocks.mockPrismaUser,
        subject: mocks.mockPrismaSubject,
    },
}));
vi.mock("next-auth");
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

describe("GET /api/subjects", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getServerSession).mockResolvedValue(mocks.mockSession);
        mocks.mockPrismaUser.findUnique.mockResolvedValue({ id: "user-123", email: "user@test.com" });
        mocks.mockPrismaSubject.findMany.mockResolvedValue([]);
    });

    it("returns 401 when not logged in", async () => {
        vi.mocked(getServerSession).mockResolvedValue(null);

        const response = await GET();

        expect(response.status).toBe(401);
    });

    it("returns only current user's subjects in existing order", async () => {
        mocks.mockPrismaSubject.findMany.mockResolvedValue([
            { id: "sub-2", name: "线性代数" },
            { id: "sub-1", name: "高等数学" },
        ]);

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual([
            { id: "sub-2", name: "线性代数" },
            { id: "sub-1", name: "高等数学" },
        ]);
        expect(mocks.mockPrismaSubject.findMany).toHaveBeenCalledWith({
            where: { userId: "user-123" },
            select: { id: true, name: true },
            orderBy: { createdAt: "desc" },
        });
    });

    it("returns an empty array when the user has no subjects", async () => {
        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual([]);
    });

    it("does not create default subjects when list is empty", async () => {
        await GET();

        expect(mocks.mockPrismaSubject.create).not.toHaveBeenCalled();
    });
});
