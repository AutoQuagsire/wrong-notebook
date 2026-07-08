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

        it("Again (1) should schedule 1 day later", async () => {
            const result = await processFsrsReview(userId, errorItemId, 1);
            expect(result.scheduled_days).toBe(1);
            expect(result.state).toBe("Relearning");
            expect(result.lapses).toBe(1);
        });

        it("Hard (2) should schedule 2 days later", async () => {
            const result = await processFsrsReview(userId, errorItemId, 2);
            expect(result.scheduled_days).toBe(2);
            expect(result.state).toBe("Review");
        });

        it("Good (3) should schedule 5 days later", async () => {
            const result = await processFsrsReview(userId, errorItemId, 3);
            expect(result.scheduled_days).toBe(5);
            expect(result.state).toBe("Review");
        });

        it("Easy (4) first time should schedule 7 days later", async () => {
            const result = await processFsrsReview(userId, errorItemId, 4, undefined, 1);
            expect(result.scheduled_days).toBe(7);
            expect(result.state).toBe("Review");
        });

        it("Second consecutive Easy should schedule 3 days later", async () => {
            const result = await processFsrsReview(userId, errorItemId, 4, undefined, 2);
            expect(result.scheduled_days).toBe(3);
        });
    });
});
