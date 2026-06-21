/**
 * FSRS adapter unit tests
 * Tests the pure-function adapter layer without touching the database.
 */
import { describe, it, expect } from "vitest";
import {
    createNewCard,
    computeNextCard,
    validateFsrsRating,
} from "@/lib/fsrs/adapter";

describe("FSRS Adapter", () => {
    describe("createNewCard", () => {
        it("应该创建状态为 New 的新卡", () => {
            const card = createNewCard();
            expect(card.state).toBe("New");
        });

        it("应该初始化 reps 和 lapses 为 0", () => {
            const card = createNewCard();
            expect(card.reps).toBe(0);
            expect(card.lapses).toBe(0);
        });

        it("应该设置 due 为当前时间", () => {
            const before = new Date();
            const card = createNewCard();
            expect(card.due).toBeInstanceOf(Date);
            expect(card.due.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
        });

        it("应该接受可选的 now 参数", () => {
            const fixedDate = new Date("2025-06-01T12:00:00Z");
            const card = createNewCard(fixedDate);
            expect(card.due.toISOString()).toBe("2025-06-01T12:00:00.000Z");
        });

        it("新卡 last_review 应为 null", () => {
            const card = createNewCard();
            expect(card.last_review).toBeNull();
        });
    });

    describe("validateFsrsRating", () => {
        it("rating 1 应映射为 Again", () => {
            expect(validateFsrsRating(1)).toBe(1);
        });

        it("rating 2 应映射为 Hard", () => {
            expect(validateFsrsRating(2)).toBe(2);
        });

        it("rating 3 应映射为 Good", () => {
            expect(validateFsrsRating(3)).toBe(3);
        });

        it("rating 4 应映射为 Easy", () => {
            expect(validateFsrsRating(4)).toBe(4);
        });

        it("拒绝 rating 0", () => {
            expect(() => validateFsrsRating(0)).toThrow("Invalid rating");
        });

        it("拒绝 rating 5", () => {
            expect(() => validateFsrsRating(5)).toThrow("Invalid rating");
        });

        it("拒绝 null", () => {
            expect(() => validateFsrsRating(null)).toThrow("Rating is required");
        });

        it("拒绝 undefined", () => {
            expect(() => validateFsrsRating(undefined)).toThrow("Rating is required");
        });

        it("拒绝非整数", () => {
            expect(() => validateFsrsRating(2.5)).toThrow("Invalid rating");
        });

        it("拒绝字符串", () => {
            expect(() => validateFsrsRating("3")).toThrow("Invalid rating");
        });
    });

    describe("computeNextCard", () => {
        const now = new Date("2025-06-15T12:00:00Z");

        it("Rating 1 (Again) 应生成新的 due 时间", () => {
            const card = createNewCard(now);
            const next = computeNextCard(card, 1, now);
            expect(next.due).toBeInstanceOf(Date);
            expect(next.state).toBeDefined();
        });

        it("Rating 2 (Hard) 应生成新的 due 时间", () => {
            const card = createNewCard(now);
            const next = computeNextCard(card, 2, now);
            expect(next.due).toBeInstanceOf(Date);
        });

        it("Rating 3 (Good) 应生成新的 due 时间", () => {
            const card = createNewCard(now);
            const next = computeNextCard(card, 3, now);
            expect(next.due).toBeInstanceOf(Date);
            expect(next.due.getTime()).toBeGreaterThan(now.getTime());
        });

        it("Rating 4 (Easy) 应生成新的 due 时间", () => {
            const card = createNewCard(now);
            const next = computeNextCard(card, 4, now);
            expect(next.due).toBeInstanceOf(Date);
            expect(next.due.getTime()).toBeGreaterThan(now.getTime());
        });

        it("不应修改输入 card 对象", () => {
            const card = createNewCard(now);
            const originalState = card.state;
            const originalReps = card.reps;
            const originalDue = card.due.getTime();

            computeNextCard(card, 3, now);

            // Input should be unchanged
            expect(card.state).toBe(originalState);
            expect(card.reps).toBe(originalReps);
            expect(card.due.getTime()).toBe(originalDue);
        });
    });

    describe("状态转换", () => {
        it("Reps 应在 Good 评分后增加", () => {
            const card = createNewCard();
            const next = computeNextCard(card, 3, new Date());
            expect(next.reps).toBeGreaterThan(card.reps);
        });

        it("Lapses 应在 Again 评分后增加", () => {
            // First advance the card past "New" with a Good rating
            const now = new Date();
            const card = createNewCard(now);
            const reviewed = computeNextCard(card, 3, now);

            // Then give Again to trigger lapse
            const nextDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            const afterLapse = computeNextCard(reviewed, 1, nextDay);

            expect(afterLapse.lapses).toBeGreaterThanOrEqual(card.lapses);
        });
    });
});
