/**
 * POST /api/knowledge/review/submit 集成测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/knowledge/review/submit/route";
import { getServerSession } from "next-auth";

const mocks = vi.hoisted(() => ({
    mockPrismaUser: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
    },
    mockPrismaKnowledgeItem: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
    },
    mockPrismaKnowledgeReviewState: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
    },
    mockPrismaKnowledgeReviewLog: {
        create: vi.fn(),
    },
    mockSession: {
        user: { email: "user@test.com", id: "user-123", name: "Test" },
    },
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: mocks.mockPrismaUser,
        knowledgeItem: mocks.mockPrismaKnowledgeItem,
        knowledgeReviewState: mocks.mockPrismaKnowledgeReviewState,
        knowledgeReviewLog: mocks.mockPrismaKnowledgeReviewLog,
        $transaction: vi.fn(async (fn: Function) => {
            return fn({
                knowledgeItem: mocks.mockPrismaKnowledgeItem,
                knowledgeReviewState: mocks.mockPrismaKnowledgeReviewState,
                knowledgeReviewLog: mocks.mockPrismaKnowledgeReviewLog,
            });
        }),
    },
}));

vi.mock("next-auth");
vi.mock("@/lib/auth", () => ({
    authOptions: {},
}));

describe("POST /api/knowledge/review/submit", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getServerSession).mockResolvedValue(mocks.mockSession);

        // Default: user exists
        mocks.mockPrismaUser.findUnique.mockResolvedValue({
            id: "user-123",
            email: "user@test.com",
        });

        // Default: knowledge item exists and belongs to user
        mocks.mockPrismaKnowledgeItem.findUnique.mockResolvedValue({
            userId: "user-123",
        });
        mocks.mockPrismaKnowledgeItem.findFirst.mockResolvedValue({
            id: "ki-1",
        });
    });

    function buildRequest(body: Record<string, unknown>) {
        return new Request("http://localhost/api/knowledge/review/submit", {
            method: "POST",
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
        });
    }

    describe("authentication", () => {
        it("returns 401 when not logged in", async () => {
            vi.mocked(getServerSession).mockResolvedValue(null);
            const req = buildRequest({ knowledgeItemId: "ki-1", rating: 3 });
            const res = await POST(req);
            expect(res.status).toBe(401);
        });

        it("returns 401 when user email missing", async () => {
            vi.mocked(getServerSession).mockResolvedValue({ user: { id: "x" } } as any);
            const req = buildRequest({ knowledgeItemId: "ki-1", rating: 3 });
            const res = await POST(req);
            expect(res.status).toBe(401);
        });
    });

    describe("validation", () => {
        it("returns 400 when knowledgeItemId is missing", async () => {
            const req = buildRequest({ rating: 3 });
            const res = await POST(req);
            expect(res.status).toBe(400);
        });

        it("returns 400 when knowledgeItemId is empty string", async () => {
            const req = buildRequest({ knowledgeItemId: "", rating: 3 });
            const res = await POST(req);
            expect(res.status).toBe(400);
        });

        it("returns 400 when rating is missing", async () => {
            const req = buildRequest({ knowledgeItemId: "ki-1" });
            const res = await POST(req);
            expect(res.status).toBe(400);
        });

        it("returns 400 when rating is 0", async () => {
            const req = buildRequest({ knowledgeItemId: "ki-1", rating: 0 });
            const res = await POST(req);
            expect(res.status).toBe(400);
        });

        it("returns 400 when rating is 5", async () => {
            const req = buildRequest({ knowledgeItemId: "ki-1", rating: 5 });
            const res = await POST(req);
            expect(res.status).toBe(400);
        });

        it("returns 400 when rating is not integer", async () => {
            const req = buildRequest({ knowledgeItemId: "ki-1", rating: 2.5 });
            const res = await POST(req);
            expect(res.status).toBe(400);
        });

        it("returns 400 when answerText is not string", async () => {
            const req = buildRequest({ knowledgeItemId: "ki-1", rating: 3, answerText: 123 });
            const res = await POST(req);
            expect(res.status).toBe(400);
        });

        it("returns 400 when durationSeconds is negative", async () => {
            const req = buildRequest({ knowledgeItemId: "ki-1", rating: 3, durationSeconds: -1 });
            const res = await POST(req);
            expect(res.status).toBe(400);
        });
    });

    describe("ownership", () => {
        it("returns 404 when knowledge item does not exist", async () => {
            mocks.mockPrismaKnowledgeItem.findFirst.mockResolvedValue(null);
            mocks.mockPrismaKnowledgeItem.findUnique.mockResolvedValue(null);
            const req = buildRequest({ knowledgeItemId: "nonexistent", rating: 3 });
            const res = await POST(req);
            expect(res.status).toBe(404);
        });

        it("returns 404 when knowledge item belongs to another user", async () => {
            mocks.mockPrismaKnowledgeItem.findFirst.mockResolvedValue(null);
            mocks.mockPrismaKnowledgeItem.findUnique.mockResolvedValue({
                userId: "other-user",
            });
            const req = buildRequest({ knowledgeItemId: "ki-1", rating: 3 });
            const res = await POST(req);
            expect(res.status).toBe(404);
        });
    });

    describe("successful submission", () => {
        beforeEach(() => {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(6, 0, 0, 0);

            // First review: no existing state
            mocks.mockPrismaKnowledgeItem.findFirst.mockResolvedValue({ id: "ki-1" });
            mocks.mockPrismaKnowledgeReviewState.findUnique.mockResolvedValue(null);
            mocks.mockPrismaKnowledgeReviewState.create.mockResolvedValue({
                id: "state-1",
                due: now,
                stability: null,
                difficulty: null,
                elapsed_days: 0,
                scheduled_days: 0,
                reps: 0,
                lapses: 0,
                state: "New",
                last_review: null,
            });
            mocks.mockPrismaKnowledgeReviewState.update.mockResolvedValue({});
            mocks.mockPrismaKnowledgeReviewLog.create.mockResolvedValue({
                id: "log-1",
                userId: "user-123",
                knowledgeItemId: "ki-1",
                rating: 3,
                isCorrect: true,
                answerText: null,
                durationSeconds: 120,
                nextReviewAt: tomorrow,
                scheduledDays: 1,
                createdAt: now,
            });
        });

        it("returns 200 with log and reviewResult for rating 3", async () => {
            const req = buildRequest({ knowledgeItemId: "ki-1", rating: 3, durationSeconds: 120 });
            const res = await POST(req);
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.log).toBeDefined();
            expect(data.log.isCorrect).toBe(true);
            expect(data.reviewResult).toBeDefined();
            expect(data.reviewResult.nextReviewAt).toBeDefined();
            expect(data.reviewResult.state).toBeDefined();
        });

        it("returns 200 with isCorrect false for rating 1", async () => {
            mocks.mockPrismaKnowledgeReviewLog.create.mockResolvedValue({
                id: "log-2",
                userId: "user-123",
                knowledgeItemId: "ki-1",
                rating: 1,
                isCorrect: false,
                answerText: null,
                durationSeconds: null,
                nextReviewAt: new Date(),
                scheduledDays: 1,
                createdAt: new Date(),
            });

            const req = buildRequest({ knowledgeItemId: "ki-1", rating: 1 });
            const res = await POST(req);
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.log.isCorrect).toBe(false);
        });

        it("returns 200 with isCorrect true for rating 4", async () => {
            mocks.mockPrismaKnowledgeReviewLog.create.mockResolvedValue({
                id: "log-3",
                userId: "user-123",
                knowledgeItemId: "ki-1",
                rating: 4,
                isCorrect: true,
                answerText: null,
                durationSeconds: null,
                nextReviewAt: new Date(),
                scheduledDays: 1,
                createdAt: new Date(),
            });

            const req = buildRequest({ knowledgeItemId: "ki-1", rating: 4 });
            const res = await POST(req);
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.log.isCorrect).toBe(true);
        });

        it("allows answerText to be an empty string", async () => {
            const req = buildRequest({ knowledgeItemId: "ki-1", rating: 3, answerText: "" });
            const res = await POST(req);
            expect(res.status).toBe(200);
        });

        it("returns 500 when database error occurs", async () => {
            mocks.mockPrismaKnowledgeItem.findUnique.mockRejectedValue(new Error("DB down"));
            const req = buildRequest({ knowledgeItemId: "ki-1", rating: 3 });
            const res = await POST(req);
            expect(res.status).toBe(500);
        });
    });
});
