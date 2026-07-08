import { beforeEach, describe, expect, it, vi } from "vitest";
import { getServerSession } from "next-auth";
import { POST } from "@/app/api/knowledge-items/[id]/mark-unknown/route";
import { GET as GET_TODAY } from "@/app/api/knowledge/review/today/route";

const mocks = vi.hoisted(() => ({
    mockPrismaUser: {
        findUnique: vi.fn(),
    },
    mockPrismaKnowledgeItem: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
    },
    mockPrismaKnowledgeReviewState: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        upsert: vi.fn(),
    },
    mockSession: {
        user: { email: "user@test.com", id: "user-123" },
    },
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: mocks.mockPrismaUser,
        knowledgeItem: mocks.mockPrismaKnowledgeItem,
        knowledgeReviewState: mocks.mockPrismaKnowledgeReviewState,
        $transaction: vi.fn(async (fn: (tx: {
            knowledgeReviewState: typeof mocks.mockPrismaKnowledgeReviewState;
        }) => unknown) =>
            fn({
                knowledgeReviewState: mocks.mockPrismaKnowledgeReviewState,
            })),
    },
}));

vi.mock("next-auth");
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

describe("POST /api/knowledge-items/[id]/mark-unknown", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getServerSession).mockResolvedValue(mocks.mockSession);

        mocks.mockPrismaUser.findUnique.mockResolvedValue({
            id: "user-123",
            email: "user@test.com",
        });
        mocks.mockPrismaKnowledgeItem.findFirst.mockResolvedValue({ id: "ki-1" });
        mocks.mockPrismaKnowledgeReviewState.findUnique.mockResolvedValue(null);
        mocks.mockPrismaKnowledgeReviewState.findMany.mockResolvedValue([]);
        mocks.mockPrismaKnowledgeReviewState.count.mockResolvedValue(0);
        mocks.mockPrismaKnowledgeItem.findMany.mockResolvedValue([]);
        mocks.mockPrismaKnowledgeItem.count.mockResolvedValue(0);
        mocks.mockPrismaKnowledgeReviewState.upsert.mockImplementation(async ({ create, update }: {
            create: { knowledgeItemId: string; due: Date; state: string };
            update: { due: Date; state: string };
        }) => ({
            knowledgeItemId: create.knowledgeItemId,
            due: create.due ?? update.due,
            state: create.state ?? update.state,
        }));
    });

    async function callMarkUnknown(id = "ki-1") {
        return POST(new Request(`http://localhost/api/knowledge-items/${id}/mark-unknown`, {
            method: "POST",
        }), {
            params: Promise.resolve({ id }),
        });
    }

    it("returns 401 when not logged in", async () => {
        vi.mocked(getServerSession).mockResolvedValue(null);

        const res = await callMarkUnknown();

        expect(res.status).toBe(401);
    });

    it("returns 404 when knowledge item does not exist or is not owned", async () => {
        mocks.mockPrismaKnowledgeItem.findFirst.mockResolvedValue(null);

        const res = await callMarkUnknown("missing");

        expect(res.status).toBe(404);
    });

    it("creates review state with due <= now when none exists", async () => {
        const before = Date.now();

        const res = await callMarkUnknown();

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.knowledgeItemId).toBe("ki-1");
        expect(new Date(data.due).getTime()).toBeGreaterThanOrEqual(before);
        expect(mocks.mockPrismaKnowledgeReviewState.upsert).toHaveBeenCalledTimes(1);
        const upsertArgs = mocks.mockPrismaKnowledgeReviewState.upsert.mock.calls[0][0];
        expect(upsertArgs.create.state).toBe("Learning");
    });

    it("updates existing review state to due <= now", async () => {
        mocks.mockPrismaKnowledgeReviewState.findUnique.mockResolvedValue({
            id: "state-1",
            stability: 3.2,
            difficulty: 4.1,
            elapsed_days: 2,
            scheduled_days: 5,
            reps: 3,
            lapses: 1,
            state: "Review",
            last_review: new Date("2026-07-01T00:00:00.000Z"),
        });
        mocks.mockPrismaKnowledgeReviewState.upsert.mockImplementation(async ({ update }: {
            update: { due: Date; state: string };
        }) => ({
            knowledgeItemId: "ki-1",
            due: update.due,
            state: update.state,
        }));

        const before = Date.now();
        const res = await callMarkUnknown();

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(new Date(data.due).getTime()).toBeGreaterThanOrEqual(before);
        const upsertArgs = mocks.mockPrismaKnowledgeReviewState.upsert.mock.calls[0][0];
        expect(upsertArgs.update.state).toBe("Relearning");
    });

    it("makes the item show up in knowledge review dueItems", async () => {
        const dueNow = new Date();
        mocks.mockPrismaKnowledgeReviewState.upsert.mockResolvedValue({
            knowledgeItemId: "ki-1",
            due: dueNow,
            state: "Learning",
        });

        const markRes = await callMarkUnknown();
        expect(markRes.status).toBe(200);

        mocks.mockPrismaKnowledgeReviewState.findMany
            .mockResolvedValueOnce([
                {
                    id: "state-1",
                    knowledgeItemId: "ki-1",
                    due: dueNow,
                    last_review: null,
                    reps: 0,
                    lapses: 0,
                    state: "Learning",
                    scheduled_days: 0,
                    knowledgeItem: {
                        prompt: "test prompt",
                        answer: "test answer",
                        detail: null,
                        subject: { id: "s1", name: "Math" },
                        tag: null,
                    },
                },
            ])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);
        mocks.mockPrismaKnowledgeReviewState.count
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(0);

        const todayRes = await GET_TODAY(new Request("http://localhost/api/knowledge/review/today?includeNew=false"));

        expect(todayRes.status).toBe(200);
        const todayData = await todayRes.json();
        expect(todayData.dueItems).toHaveLength(1);
        expect(todayData.dueItems[0].knowledgeItemId).toBe("ki-1");
    });
});
