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

import { getOrCreateFsrsCard, saveFsrsCard, getFsrsCardId } from "@/lib/fsrs/service";

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
});
