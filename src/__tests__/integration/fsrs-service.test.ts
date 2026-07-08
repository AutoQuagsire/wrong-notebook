/**
 * FSRS service integration tests
 * Tests database-backed service functions with mocked Prisma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
    mockFsrsCard: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
    mockPrismaErrorItem: {
        delete: vi.fn(),
    },
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        fsrsCard: mocks.mockFsrsCard,
        errorItem: mocks.mockPrismaErrorItem,
    },
}));

import { getOrCreateFsrsCard, saveFsrsCard, getFsrsCardId, processFsrsReview } from "@/lib/fsrs/service";

describe("FSRS Service", () => {
    const userId = "user-123";
    const errorItemId = "error-item-abc";

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getOrCreateFsrsCard", () => {
        it("应为 ErrorItem 创建新 FsrsCard", async () => {
            mocks.mockFsrsCard.findUnique.mockResolvedValue(null);
            mocks.mockFsrsCard.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
                id: "card-new-1",
                ...args.data,
                createdAt: new Date(),
                updatedAt: new Date(),
            }));

            const card = await getOrCreateFsrsCard(userId, errorItemId);

            expect(card.state).toBe("New");
            expect(card.reps).toBe(0);
            expect(card.lapses).toBe(0);
            expect(card.due).toBeInstanceOf(Date);

            expect(mocks.mockFsrsCard.findUnique).toHaveBeenCalledWith({
                where: { errorItemId },
            });
            expect(mocks.mockFsrsCard.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        userId,
                        errorItemId,
                        state: "New",
                    }),
                })
            );
        });

        it("已存在 FsrsCard 时不应重复创建", async () => {
            const existingCard = {
                id: "card-existing",
                userId,
                errorItemId,
                due: new Date("2025-06-20T12:00:00Z"),
                stability: 2.5,
                difficulty: 0.3,
                elapsed_days: 0,
                scheduled_days: 1,
                reps: 3,
                lapses: 1,
                state: "Review",
                last_review: new Date("2025-06-19T12:00:00Z"),
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mocks.mockFsrsCard.findUnique.mockResolvedValue(existingCard);

            const card = await getOrCreateFsrsCard(userId, errorItemId);

            expect(card.state).toBe("Review");
            expect(card.reps).toBe(3);
            expect(card.lapses).toBe(1);
            expect(card.difficulty).toBe(0.3);
            expect(card.stability).toBe(2.5);

            // Should not create
            expect(mocks.mockFsrsCard.create).not.toHaveBeenCalled();
        });
    });

    describe("saveFsrsCard", () => {
        it("应更新 FsrsCard 状态", async () => {
            mocks.mockFsrsCard.update.mockResolvedValue({});

            const cardData = {
                due: new Date("2025-06-25T12:00:00Z"),
                stability: 3.0,
                difficulty: 0.2,
                elapsed_days: 1,
                scheduled_days: 5,
                reps: 4,
                lapses: 1,
                state: "Review",
                last_review: new Date("2025-06-20T12:00:00Z"),
            };

            await saveFsrsCard("card-123", cardData);

            expect(mocks.mockFsrsCard.update).toHaveBeenCalledWith({
                where: { id: "card-123" },
                data: expect.objectContaining({
                    due: cardData.due,
                    stability: cardData.stability,
                    difficulty: cardData.difficulty,
                    state: "Review",
                    reps: 4,
                }),
            });
        });
    });

    describe("getFsrsCardId", () => {
        it("应返回现有卡的 ID", async () => {
            mocks.mockFsrsCard.findUnique.mockResolvedValue({ id: "card-id-42" });

            const id = await getFsrsCardId(errorItemId);

            expect(id).toBe("card-id-42");
        });

        it("不存在卡时应返回 null", async () => {
            mocks.mockFsrsCard.findUnique.mockResolvedValue(null);

            const id = await getFsrsCardId(errorItemId);

            expect(id).toBeNull();
        });
    });

    describe("processFsrsReview", () => {
        it("第一次调用应创建 FsrsCard", async () => {
            mocks.mockFsrsCard.findUnique.mockResolvedValue(null);
            mocks.mockFsrsCard.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
                id: "card-new",
                ...args.data,
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
            mocks.mockFsrsCard.update.mockResolvedValue({});

            const result = await processFsrsReview(userId, errorItemId, 3);

            // Should have created a card (findUnique returned null)
            expect(mocks.mockFsrsCard.create).toHaveBeenCalled();
            // Should have updated with computed state
            expect(mocks.mockFsrsCard.update).toHaveBeenCalled();
            // Result state should be set
            expect(result.state).toBeDefined();
            expect(result.due).toBeInstanceOf(Date);
            expect(result.reps).toBeGreaterThan(0);
        });

        it("后续调用应更新同一个 FsrsCard，不重复创建", async () => {
            // First, let processFsrsReview create a card with real FSRS state
            mocks.mockFsrsCard.findUnique.mockResolvedValue(null);
            mocks.mockFsrsCard.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
                id: "card-real",
                ...args.data,
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
            mocks.mockFsrsCard.update.mockResolvedValue({});

            const firstResult = await processFsrsReview(userId, errorItemId, 3);
            expect(mocks.mockFsrsCard.create).toHaveBeenCalled();
            const firstReps = firstResult.reps;

            // Now simulate second review — findUnique returns the updated card
            mocks.mockFsrsCard.findUnique.mockResolvedValue({
                id: "card-real",
                userId,
                errorItemId,
                ...firstResult,
                due: new Date(firstResult.due),
                last_review: firstResult.last_review ? new Date(firstResult.last_review) : null,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            mocks.mockFsrsCard.create.mockClear();
            mocks.mockFsrsCard.update.mockClear();

            const secondResult = await processFsrsReview(userId, errorItemId, 4);

            // Should NOT create a second card
            expect(mocks.mockFsrsCard.create).not.toHaveBeenCalled();
            // Should update the same card
            expect(mocks.mockFsrsCard.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: "card-real" },
                })
            );
            // Reps should increase
            expect(secondResult.reps).toBeGreaterThan(firstReps);
            // Due should be updated to a future date
            expect(secondResult.due.getTime()).toBeGreaterThan(firstResult.due.getTime());
        });

        it("非法 rating 应抛出错误", async () => {
            await expect(
                processFsrsReview(userId, errorItemId, 5)
            ).rejects.toThrow("Invalid rating");
        });

        it("null rating 应抛出错误", async () => {
            await expect(
                processFsrsReview(userId, errorItemId, null as unknown as number)
            ).rejects.toThrow("Rating is required");
        });

        it("Rating 1 (Again) 后 due 不应在同一天", async () => {
            mocks.mockFsrsCard.findUnique.mockResolvedValue(null);
            mocks.mockFsrsCard.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
                id: "card-again",
                ...args.data,
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
            mocks.mockFsrsCard.update.mockResolvedValue({});

            const now = new Date();
            const result = await processFsrsReview(userId, errorItemId, 1);

            // due should be at least tomorrow 00:00 local time
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(6, 0, 0, 0);
            expect(result.due.getTime()).toBeGreaterThanOrEqual(tomorrow.getTime());
            expect(result.scheduled_days).toBeGreaterThanOrEqual(1);
        });

        it("Rating 3 (Good) 后 due 应已在未来", async () => {
            mocks.mockFsrsCard.findUnique.mockResolvedValue(null);
            mocks.mockFsrsCard.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
                id: "card-good",
                ...args.data,
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
            mocks.mockFsrsCard.update.mockResolvedValue({});

            const now = new Date();
            const result = await processFsrsReview(userId, errorItemId, 3);

            // Good rating should schedule at least tomorrow or later
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(6, 0, 0, 0);
            expect(result.due.getTime()).toBeGreaterThanOrEqual(tomorrow.getTime());
        });
    });

    describe("fixed-interval scheduling", () => {
        beforeEach(() => {
            vi.clearAllMocks();
            mocks.mockFsrsCard.findUnique.mockResolvedValue(null);
            mocks.mockFsrsCard.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
                id: "card-fixed",
                ...args.data,
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
            mocks.mockFsrsCard.update.mockResolvedValue({});
        });

        function expectDueDate(due: Date, daysFromNow: number) {
            const expected = new Date();
            expected.setDate(expected.getDate() + daysFromNow);
            expected.setHours(6, 0, 0, 0);
            expect(due.getTime()).toBe(expected.getTime());
        }

        // Test 1: Again → scheduled_days=1, due 1 day later 06:00
        it("Again (1) → scheduled_days=1, due 1 day later at 06:00", async () => {
            const result = await processFsrsReview(userId, errorItemId, 1);
            expect(result.scheduled_days).toBe(1);
            expect(result.state).toBe("Relearning");
            expect(result.lapses).toBe(1);
            expect(result.reps).toBe(1);
            expectDueDate(result.due, 1);
        });

        // Test 2: Hard → scheduled_days=2, due 2 days later 06:00
        it("Hard (2) → scheduled_days=2, due 2 days later at 06:00", async () => {
            const result = await processFsrsReview(userId, errorItemId, 2);
            expect(result.scheduled_days).toBe(2);
            expect(result.state).toBe("Review");
            expect(result.lapses).toBe(0);
            expect(result.reps).toBe(1);
            expectDueDate(result.due, 2);
        });

        // Test 3: Good → scheduled_days=5, due 5 days later 06:00
        it("Good (3) → scheduled_days=5, due 5 days later at 06:00", async () => {
            const result = await processFsrsReview(userId, errorItemId, 3);
            expect(result.scheduled_days).toBe(5);
            expect(result.state).toBe("Review");
            expect(result.reps).toBe(1);
            expectDueDate(result.due, 5);
        });

        // Test 4: Easy first time → scheduled_days=7
        it("Easy (4) first time (easyStreakCount=1) → scheduled_days=7", async () => {
            const result = await processFsrsReview(userId, errorItemId, 4, undefined, 1);
            expect(result.scheduled_days).toBe(7);
            expect(result.state).toBe("Review");
            expect(result.reps).toBe(1);
            expectDueDate(result.due, 7);
        });

        // Test 5: Easy second consecutive → scheduled_days=3
        it("Easy (4) second consecutive (easyStreakCount=2) → scheduled_days=3", async () => {
            const result = await processFsrsReview(userId, errorItemId, 4, undefined, 2);
            expect(result.scheduled_days).toBe(3);
            expect(result.reps).toBe(1);
            expectDueDate(result.due, 3);
        });

        // Test 6: Easy third consecutive → still updates FsrsCard, scheduled_days=3
        it("Easy (4) third consecutive (easyStreakCount=3) → scheduled_days=3, FsrsCard updated", async () => {
            const result = await processFsrsReview(userId, errorItemId, 4, undefined, 3);
            expect(result.scheduled_days).toBe(3);
            expect(result.reps).toBe(1);
            // FsrsCard is always updated — never deleted
            expect(mocks.mockFsrsCard.update).toHaveBeenCalled();
            expect(mocks.mockFsrsCard.delete).not.toHaveBeenCalled();
        });

        // Test 7: Good does NOT trigger mastery
        it("Good (3) with easyStreakCount=0 → does NOT set mastery", async () => {
            const result = await processFsrsReview(userId, errorItemId, 3);
            expect(result.scheduled_days).toBe(5);
            expect(result.state).toBe("Review");
            // processFsrsReview itself never sets masteryLevel=2
            // (that's the caller's job in route.ts)
        });

        // Test 8: lapses increments on Again
        it("Again (1) should increment lapses", async () => {
            // Simulate existing card with lapses=2
            mocks.mockFsrsCard.findUnique.mockResolvedValue({
                id: "card-lapsed",
                userId,
                errorItemId,
                due: new Date(),
                stability: 2.0,
                difficulty: 0.3,
                elapsed_days: 0,
                scheduled_days: 1,
                reps: 5,
                lapses: 2,
                state: "Review",
                last_review: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const result = await processFsrsReview(userId, errorItemId, 1);
            expect(result.lapses).toBe(3); // was 2, now +1
            expect(result.reps).toBe(6);   // was 5, now +1
        });

        // Test 9: SIMILAR_QUESTION does not affect Easy streak (tested via route.ts)
        //   — covered by practice test: "SIMILAR_QUESTION 不参与也不打断 Easy streak"

        // Test 10: stability/difficulty are preserved
        it("should preserve existing stability and difficulty values", async () => {
            mocks.mockFsrsCard.findUnique.mockResolvedValue({
                id: "card-preserve",
                userId,
                errorItemId,
                due: new Date(),
                stability: 4.2,
                difficulty: 0.75,
                elapsed_days: 3,
                scheduled_days: 5,
                reps: 8,
                lapses: 1,
                state: "Review",
                last_review: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const result = await processFsrsReview(userId, errorItemId, 3);
            expect(result.stability).toBe(4.2);
            expect(result.difficulty).toBe(0.75);
        });
    });
});
