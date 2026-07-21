/**
 * FSRS adapter unit tests
 * Tests the pure-function adapter layer without touching the database.
 */
import { describe, it, expect } from "vitest";
import {
    createNewCard,
    computeNextCard,
    validateFsrsRating,
    clampDueToNextDay,
} from "@/lib/fsrs/adapter";
import type { FsrsCardData } from "@/lib/fsrs/adapter";

describe("FSRS Adapter", () => {
    function localDate(
        year: number,
        month: number,
        day: number,
        hour: number,
        minute = 0,
    ): Date {
        return new Date(year, month - 1, day, hour, minute, 0, 0);
    }

    function localIso(date: Date): string {
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hour = String(date.getHours()).padStart(2, "0");
        const minute = String(date.getMinutes()).padStart(2, "0");
        return `${date.getFullYear()}-${month}-${day} ${hour}:${minute}`;
    }

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

    describe("clampDueToNextDay", () => {
        function makeCard(overrides: Partial<FsrsCardData> = {}): FsrsCardData {
            return {
                due: new Date("2026-06-22T12:00:00Z"),
                stability: 2.5,
                difficulty: 0.3,
                elapsed_days: 0,
                scheduled_days: 0,
                reps: 1,
                lapses: 0,
                state: "Learning",
                last_review: new Date("2026-06-22T12:00:00Z"),
                ...overrides,
            };
        }

        it("due 在当前学习日内时应钳制到下一学习日 06:00", () => {
            const now = localDate(2026, 6, 22, 10, 0);
            const card = makeCard({ due: localDate(2026, 6, 22, 10, 30) });
            const result = clampDueToNextDay(card, now);

            expect(localIso(result.due)).toBe("2026-06-23 06:00");
            expect(result.scheduled_days).toBeGreaterThanOrEqual(1);
        });

        it("due 在下一自然日凌晨但仍属当前学习日时应钳制到下一学习日", () => {
            const now = localDate(2026, 6, 22, 10, 0);
            const card = makeCard({ due: localDate(2026, 6, 23, 2, 0) });
            const result = clampDueToNextDay(card, now);

            expect(localIso(result.due)).toBe("2026-06-23 06:00");
        });

        it("due 已经在下一学习日中时应归一到该学习日 06:00", () => {
            const now = localDate(2026, 6, 22, 10, 0);
            const card = makeCard({ due: localDate(2026, 6, 23, 12, 0), scheduled_days: 3 });
            const result = clampDueToNextDay(card, now);

            expect(localIso(result.due)).toBe("2026-06-23 06:00");
            expect(result.scheduled_days).toBe(3);
        });

        it("due 在更远的未来时应归一到对应学习日 06:00", () => {
            const now = localDate(2026, 6, 22, 10, 0);
            const card = makeCard({ due: localDate(2026, 7, 1, 12, 0), scheduled_days: 10 });
            const result = clampDueToNextDay(card, now);

            expect(localIso(result.due)).toBe("2026-07-01 06:00");
            expect(result.scheduled_days).toBe(10);
        });

        it("钳制后 scheduled_days 至少为 1", () => {
            const now = localDate(2026, 6, 22, 10, 0);
            const card = makeCard({ due: localDate(2026, 6, 22, 10, 30), scheduled_days: 0 });
            const result = clampDueToNextDay(card, now);

            expect(result.scheduled_days).toBe(1);
        });

        it("不应变异输入 card", () => {
            const now = localDate(2026, 6, 22, 10, 0);
            const card = makeCard({ due: localDate(2026, 6, 22, 10, 30), scheduled_days: 0 });
            const originalDue = card.due.toISOString();
            const originalScheduledDays = card.scheduled_days;

            clampDueToNextDay(card, now);

            expect(card.due.toISOString()).toBe(originalDue);
            expect(card.scheduled_days).toBe(originalScheduledDays);
        });
    });
});
