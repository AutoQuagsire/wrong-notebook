import { describe, it, expect, vi, beforeEach } from "vitest";
import { createNewCard, computeNextCard, clampDueToNextDay, validateFsrsRating } from "@/lib/fsrs/adapter";

// We test the pure functions from adapter.ts that knowledge-service reuses.
// The knowledge-service itself wraps DB calls, tested in integration tests.

describe("FSRS Knowledge Service (unit)", () => {
    describe("validateFsrsRating (shared)", () => {
        it("accepts rating 1 (Again)", () => {
            expect(() => validateFsrsRating(1)).not.toThrow();
        });

        it("accepts rating 2 (Hard)", () => {
            expect(() => validateFsrsRating(2)).not.toThrow();
        });

        it("accepts rating 3 (Good)", () => {
            expect(() => validateFsrsRating(3)).not.toThrow();
        });

        it("accepts rating 4 (Easy)", () => {
            expect(() => validateFsrsRating(4)).not.toThrow();
        });

        it("rejects rating 0", () => {
            expect(() => validateFsrsRating(0)).toThrow();
        });

        it("rejects rating 5", () => {
            expect(() => validateFsrsRating(5)).toThrow();
        });

        it("rejects non-integer", () => {
            expect(() => validateFsrsRating(2.5)).toThrow();
        });

        it("rejects null", () => {
            expect(() => validateFsrsRating(null)).toThrow();
        });

        it("rejects undefined", () => {
            expect(() => validateFsrsRating(undefined)).toThrow();
        });
    });

    describe("createNewCard", () => {
        it("creates a card in New state", () => {
            const card = createNewCard();
            expect(card.state).toBe("New");
            expect(card.reps).toBe(0);
            expect(card.lapses).toBe(0);
            expect(card.due).toBeInstanceOf(Date);
        });
    });

    describe("computeNextCard", () => {
        it("computes next state for rating 3 (Good)", () => {
            const card = createNewCard();
            const next = computeNextCard(card, 3, new Date());
            expect(next.due).toBeInstanceOf(Date);
            expect(next.due.getTime()).toBeGreaterThan(Date.now());
        });

        it("computes next state for rating 1 (Again)", () => {
            const card = createNewCard();
            const next = computeNextCard(card, 1, new Date());
            expect(next.state).toBeDefined();
        });
    });

    describe("clampDueToNextDay", () => {
        it("pushes same-day due to tomorrow", () => {
            const card = createNewCard();
            const now = new Date();
            const clamped = clampDueToNextDay(card, now);
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(6, 0, 0, 0);
            expect(clamped.due.getTime()).toBeGreaterThanOrEqual(tomorrow.getTime());
            expect(clamped.scheduled_days).toBeGreaterThanOrEqual(1);
        });
    });

    describe("processKnowledgeReview (service layer)", () => {
        it("throws KnowledgeItemNotFoundError when item does not belong to user", async () => {
            const { processKnowledgeReview, KnowledgeItemNotFoundError } = await import("@/lib/fsrs/knowledge-service");

            const { prisma: prismaMock } = await import("@/lib/prisma");
            const origFindFirst = (prismaMock.knowledgeItem as any).findFirst;
            (prismaMock.knowledgeItem as any).findFirst = vi.fn().mockResolvedValue(null);

            await expect(
                processKnowledgeReview("user-A", "ki-belonging-to-user-B", 3)
            ).rejects.toThrow(KnowledgeItemNotFoundError);

            (prismaMock.knowledgeItem as any).findFirst = origFindFirst;
        });

        it("executes full review pipeline when item belongs to user", async () => {
            const { processKnowledgeReview } = await import("@/lib/fsrs/knowledge-service");

            const { prisma: prismaMock } = await import("@/lib/prisma");
            const origFindFirst = (prismaMock.knowledgeItem as any).findFirst;
            (prismaMock.knowledgeItem as any).findFirst = vi.fn().mockResolvedValue({ id: "ki-1" });

            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(6, 0, 0, 0);

            const origFindUnique = (prismaMock.knowledgeReviewState as any).findUnique;
            const origCreate = (prismaMock.knowledgeReviewState as any).create;
            const origUpdate = (prismaMock.knowledgeReviewState as any).update;

            (prismaMock.knowledgeReviewState as any).findUnique = vi.fn().mockResolvedValue(null);
            (prismaMock.knowledgeReviewState as any).create = vi.fn().mockResolvedValue({
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
            (prismaMock.knowledgeReviewState as any).update = vi.fn().mockResolvedValue({});

            const result = await processKnowledgeReview("user-123", "ki-1", 3);

            expect(result.nextReviewAt).toBeInstanceOf(Date);
            expect(typeof result.scheduledDays).toBe("number");
            expect(typeof result.state).toBe("string");
            expect(typeof result.reps).toBe("number");
            expect(typeof result.lapses).toBe("number");

            (prismaMock.knowledgeItem as any).findFirst = origFindFirst;
            (prismaMock.knowledgeReviewState as any).findUnique = origFindUnique;
            (prismaMock.knowledgeReviewState as any).create = origCreate;
            (prismaMock.knowledgeReviewState as any).update = origUpdate;
        });
    });
});
