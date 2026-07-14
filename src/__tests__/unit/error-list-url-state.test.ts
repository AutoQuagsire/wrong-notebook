import { describe, expect, it } from "vitest";

import {
    buildErrorItemDetailHref,
    buildErrorListUrlSearchParams,
    DEFAULT_ERROR_LIST_URL_STATE,
    getSafeErrorItemReturnTo,
    parseErrorListUrlState,
} from "@/lib/error-list-url-state";

describe("error-list url state helpers", () => {
    it("can initialize search and filters from URL params", () => {
        const state = parseErrorListUrlState(new URLSearchParams(
            "query=%E5%AE%9A%E7%A7%AF%E5%88%86&mastery=2&timeRange=month&gradeSemester=%E9%AB%98%E4%B8%80&chapter=%E7%AC%AC%E4%B8%80%E7%AB%A0&paperLevel=a&questionType=CALCULATION&tag=%E5%87%BD%E6%95%B0&page=2",
        ));

        expect(state).toEqual({
            search: "定积分",
            masteryFilter: "mastered",
            timeFilter: "month",
            gradeFilter: "高一",
            chapterFilter: "第一章",
            paperLevelFilter: "a",
            questionTypeFilter: "CALCULATION",
            selectedTag: "函数",
            page: 2,
        });
    });

    it("falls back to defaults for invalid params", () => {
        const state = parseErrorListUrlState(new URLSearchParams(
            "mastery=foo&timeRange=year&paperLevel=z&questionType=BAD&page=-3",
        ));

        expect(state).toEqual(DEFAULT_ERROR_LIST_URL_STATE);
    });

    it("builds URL params without writing defaults", () => {
        const params = buildErrorListUrlSearchParams(DEFAULT_ERROR_LIST_URL_STATE);
        expect(params.toString()).toBe("");
    });

    it("removes cleared filters from URL params", () => {
        const params = buildErrorListUrlSearchParams({
            ...DEFAULT_ERROR_LIST_URL_STATE,
            search: "定积分",
            masteryFilter: "unmastered",
            timeFilter: "week",
            questionTypeFilter: "CALCULATION",
            page: 1,
        });

        expect(params.toString()).toBe("query=%E5%AE%9A%E7%A7%AF%E5%88%86&mastery=0&timeRange=week&questionType=CALCULATION");
    });

    it("keeps page in URL only when page is greater than one", () => {
        const params = buildErrorListUrlSearchParams({
            ...DEFAULT_ERROR_LIST_URL_STATE,
            page: 3,
        });

        expect(params.get("page")).toBe("3");
    });

    it("builds detail href with full encoded returnTo", () => {
        const href = buildErrorItemDetailHref("err-1", "/notebooks/nb-1", {
            ...DEFAULT_ERROR_LIST_URL_STATE,
            search: "定积分",
            masteryFilter: "unmastered",
            selectedTag: "函数",
            page: 2,
        });

        expect(href).toBe(
            "/error-items/err-1?returnTo=%2Fnotebooks%2Fnb-1%3Fquery%3D%25E5%25AE%259A%25E7%25A7%25AF%25E5%2588%2586%26mastery%3D0%26tag%3D%25E5%2587%25BD%25E6%2595%25B0%26page%3D2",
        );
    });

    it("returns the validated returnTo when it is an on-site relative path", () => {
        expect(getSafeErrorItemReturnTo("/notebooks/nb-1?query=test&page=2", "nb-1")).toBe("/notebooks/nb-1?query=test&page=2");
    });

    it("falls back to the notebook path when returnTo is missing", () => {
        expect(getSafeErrorItemReturnTo(null, "nb-1")).toBe("/notebooks/nb-1");
    });

    it("rejects invalid external returnTo values", () => {
        expect(getSafeErrorItemReturnTo("http://evil.test", "nb-1")).toBe("/notebooks/nb-1");
        expect(getSafeErrorItemReturnTo("https://evil.test", "nb-1")).toBe("/notebooks/nb-1");
        expect(getSafeErrorItemReturnTo("//evil.test", "nb-1")).toBe("/notebooks/nb-1");
        expect(getSafeErrorItemReturnTo("javascript:alert(1)", "nb-1")).toBe("/notebooks/nb-1");
    });

    it("falls back to /notebooks when there is no subjectId", () => {
        expect(getSafeErrorItemReturnTo(null, null)).toBe("/notebooks");
    });
});
