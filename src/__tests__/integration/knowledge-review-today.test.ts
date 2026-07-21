/**
 * GET /api/knowledge/review/today integration tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/knowledge/review/today/route";
import { getServerSession } from "next-auth";

const mocks = vi.hoisted(() => ({
    mockPrismaUser: { findUnique: vi.fn() },
    mockPrismaKnowledgeReviewState: {
        findMany: vi.fn(),
        count: vi.fn(),
    },
    mockPrismaKnowledgeItem: {
        findMany: vi.fn(),
        count: vi.fn(),
    },
    mockSession: { user: { email: "user@test.com", id: "user-123" } },
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: mocks.mockPrismaUser,
        knowledgeReviewState: mocks.mockPrismaKnowledgeReviewState,
        knowledgeItem: mocks.mockPrismaKnowledgeItem,
    },
}));
vi.mock("next-auth");
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

function localDate(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute = 0,
): Date {
    return new Date(year, month - 1, day, hour, minute, 0, 0);
}

describe("GET /api/knowledge/review/today", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getServerSession).mockResolvedValue(mocks.mockSession);
        mocks.mockPrismaUser.findUnique.mockResolvedValue({ id: "user-123", email: "user@test.com" });

        // Default: no due items, no new items
        mocks.mockPrismaKnowledgeReviewState.findMany.mockResolvedValue([]);
        mocks.mockPrismaKnowledgeReviewState.count.mockResolvedValue(0);
        mocks.mockPrismaKnowledgeItem.findMany.mockResolvedValue([]);
        mocks.mockPrismaKnowledgeItem.count.mockResolvedValue(0);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    function reqWithParams(params: string) {
        return new Request(`http://localhost/api/knowledge/review/today${params}`);
    }

    it("returns 401 when not logged in", async () => {
        vi.mocked(getServerSession).mockResolvedValue(null);
        const res = await GET(reqWithParams(""));
        expect(res.status).toBe(401);
    });

    it("returns 200 with empty lists", async () => {
        const res = await GET(reqWithParams(""));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.dueItems).toEqual([]);
        expect(data.newItems).toEqual([]);
    });

    it("uses the current study-day end for due items and counts", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(localDate(2026, 7, 22, 10, 0));

        const res = await GET(reqWithParams(""));
        expect(res.status).toBe(200);

        const dueFindCall = mocks.mockPrismaKnowledgeReviewState.findMany.mock.calls[0][0] as {
            where: { due: { lt: Date } };
        };
        const dueCountCall = mocks.mockPrismaKnowledgeReviewState.count.mock.calls[0][0] as {
            where: { due: { lt: Date } };
        };
        const overdueCountCall = mocks.mockPrismaKnowledgeReviewState.count.mock.calls[1][0] as {
            where: { due: { lt: Date } };
        };

        expect(dueFindCall.where.due.lt.getTime()).toBe(localDate(2026, 7, 23, 6, 0).getTime());
        expect(dueCountCall.where.due.lt.getTime()).toBe(localDate(2026, 7, 23, 6, 0).getTime());
        expect(overdueCountCall.where.due.lt.getTime()).toBe(localDate(2026, 7, 22, 6, 0).getTime());
    });

    it("returns newItems when includeNew=true", async () => {
        mocks.mockPrismaKnowledgeItem.findMany.mockResolvedValue([
            { id: "ki-1", prompt: "test prompt", answer: "ans", detail: null,
              subject: { id: "s1", name: "Math" }, tag: null },
        ]);
        mocks.mockPrismaKnowledgeItem.count.mockResolvedValue(1);
        const res = await GET(reqWithParams("?includeNew=true"));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.newItems.length).toBe(1);
    });

    it("excludes newItems when includeNew=false", async () => {
        const res = await GET(reqWithParams("?includeNew=false"));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.newItems).toEqual([]);
    });

    it("respects limit parameter", async () => {
        const res = await GET(reqWithParams("?limit=5"));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.stats.limit).toBe(5);
    });

    it("returns 400 for invalid limit", async () => {
        const res = await GET(reqWithParams("?limit=0"));
        expect(res.status).toBe(400);
    });

    it("returns overdueCount in stats", async () => {
        const res = await GET(reqWithParams(""));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(typeof data.stats.overdueCount).toBe("number");
    });

    it("returns upcoming array with 7 days", async () => {
        const res = await GET(reqWithParams(""));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.stats.upcoming).toBeDefined();
        expect(data.stats.upcoming.length).toBe(7);
    });

    it("filters by subjectId", async () => {
        mocks.mockPrismaKnowledgeReviewState.findMany.mockResolvedValue([]);
        mocks.mockPrismaKnowledgeReviewState.count.mockResolvedValue(0);
        const res = await GET(reqWithParams("?subjectId=s1"));
        expect(res.status).toBe(200);
    });

    it("filters by deck", async () => {
        mocks.mockPrismaKnowledgeReviewState.findMany.mockResolvedValue([]);
        mocks.mockPrismaKnowledgeReviewState.count.mockResolvedValue(0);
        const res = await GET(reqWithParams("?deck=chapter1"));
        expect(res.status).toBe(200);
    });
});
