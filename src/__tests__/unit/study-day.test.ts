import { describe, expect, it } from "vitest";
import {
    addStudyDays,
    getStudyDayEnd,
    getStudyDayStart,
    getStudyDayStartForDue,
} from "@/lib/review/study-day";

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

describe("study-day boundary", () => {
    it("maps times before 06:00 to the previous study day", () => {
        expect(localIso(getStudyDayStart(localDate(2026, 7, 22, 5, 59)))).toBe("2026-07-21 06:00");
    });

    it("maps 06:00 and later to the same study day", () => {
        expect(localIso(getStudyDayStart(localDate(2026, 7, 22, 6, 0)))).toBe("2026-07-22 06:00");
        expect(localIso(getStudyDayStart(localDate(2026, 7, 22, 6, 1)))).toBe("2026-07-22 06:00");
        expect(localIso(getStudyDayStart(localDate(2026, 7, 22, 23, 59)))).toBe("2026-07-22 06:00");
    });

    it("returns the next 06:00 as the study day end", () => {
        expect(localIso(getStudyDayEnd(localDate(2026, 7, 22, 5, 59)))).toBe("2026-07-22 06:00");
        expect(localIso(getStudyDayEnd(localDate(2026, 7, 22, 6, 0)))).toBe("2026-07-23 06:00");
    });

    it("maps arbitrary due times back to their study-day start", () => {
        expect(localIso(getStudyDayStartForDue(localDate(2026, 7, 22, 12, 0)))).toBe("2026-07-22 06:00");
        expect(localIso(getStudyDayStartForDue(localDate(2026, 7, 23, 2, 0)))).toBe("2026-07-22 06:00");
        expect(localIso(getStudyDayStartForDue(localDate(2026, 7, 23, 6, 0)))).toBe("2026-07-23 06:00");
    });

    it("adds study days from the reference study-day start", () => {
        expect(localIso(addStudyDays(localDate(2026, 7, 22, 2, 0), 1))).toBe("2026-07-22 06:00");
        expect(localIso(addStudyDays(localDate(2026, 7, 22, 10, 0), 1))).toBe("2026-07-23 06:00");
    });

    it("handles month, year, and leap-day boundaries using local calendar arithmetic", () => {
        expect(localIso(addStudyDays(localDate(2026, 1, 31, 23, 30), 1))).toBe("2026-02-01 06:00");
        expect(localIso(addStudyDays(localDate(2026, 12, 31, 23, 30), 1))).toBe("2027-01-01 06:00");
        expect(localIso(addStudyDays(localDate(2028, 2, 28, 23, 30), 1))).toBe("2028-02-29 06:00");
    });

    it("does not mutate input dates and is repeatable", () => {
        const input = localDate(2026, 7, 22, 2, 0);
        const before = input.getTime();
        const first = addStudyDays(input, 1);
        const second = addStudyDays(input, 1);

        expect(input.getTime()).toBe(before);
        expect(first.getTime()).toBe(second.getTime());
        expect(first).not.toBe(second);
    });
});
