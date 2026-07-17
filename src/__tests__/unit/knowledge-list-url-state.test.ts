import { describe, expect, it } from "vitest";

import {
    buildKnowledgeItemDetailHref,
    buildKnowledgeListUrlSearchParams,
    DEFAULT_KNOWLEDGE_LIST_URL_STATE,
    getSafeKnowledgeReturnTo,
    parseKnowledgeListUrlState,
} from "@/lib/knowledge-list-url-state";

describe("knowledge list url state helpers", () => {
    it("returns defaults for empty params", () => {
        expect(parseKnowledgeListUrlState(new URLSearchParams())).toEqual(
            DEFAULT_KNOWLEDGE_LIST_URL_STATE,
        );
    });

    it("parses query, subjectId and page from url params", () => {
        expect(
            parseKnowledgeListUrlState(
                new URLSearchParams("query=%E4%BA%8C%E9%87%8D%E7%A7%AF%E5%88%86&subjectId=sub-1&page=2"),
            ),
        ).toEqual({
            query: "二重积分",
            subjectId: "sub-1",
            page: 2,
        });
    });

    it("trims query and subjectId and falls back invalid page to 1", () => {
        expect(
            parseKnowledgeListUrlState(
                new URLSearchParams("query=%20%20test%20%20&subjectId=%20sub-1%20&page=-3"),
            ),
        ).toEqual({
            query: "test",
            subjectId: "sub-1",
            page: 1,
        });
        expect(parseKnowledgeListUrlState(new URLSearchParams("page=abc")).page).toBe(1);
        expect(parseKnowledgeListUrlState(new URLSearchParams("page=0")).page).toBe(1);
    });

    it("builds url params without default values", () => {
        expect(buildKnowledgeListUrlSearchParams(DEFAULT_KNOWLEDGE_LIST_URL_STATE).toString()).toBe("");
    });

    it("trims values and omits page when page is 1", () => {
        const params = buildKnowledgeListUrlSearchParams({
            query: "  二重积分  ",
            subjectId: " sub-1 ",
            page: 1,
        });

        expect(params.toString()).toBe("query=%E4%BA%8C%E9%87%8D%E7%A7%AF%E5%88%86&subjectId=sub-1");
    });

    it("keeps special characters encoded correctly", () => {
        const params = buildKnowledgeListUrlSearchParams({
            query: "线性代数 + 微积分",
            subjectId: "sub-1",
            page: 3,
        });

        expect(params.toString()).toBe(
            "query=%E7%BA%BF%E6%80%A7%E4%BB%A3%E6%95%B0+%2B+%E5%BE%AE%E7%A7%AF%E5%88%86&subjectId=sub-1&page=3",
        );
    });

    it("builds detail href with encoded returnTo", () => {
        expect(
            buildKnowledgeItemDetailHref("ki-1", "/knowledge", {
                query: "二重积分",
                subjectId: "sub-1",
                page: 2,
            }),
        ).toBe(
            "/knowledge/ki-1?returnTo=%2Fknowledge%3Fquery%3D%25E4%25BA%258C%25E9%2587%258D%25E7%25A7%25AF%25E5%2588%2586%26subjectId%3Dsub-1%26page%3D2",
        );
    });

    it("accepts safe on-site knowledge returnTo values", () => {
        expect(getSafeKnowledgeReturnTo("/knowledge?query=test&subjectId=sub-1&page=2")).toBe(
            "/knowledge?query=test&subjectId=sub-1&page=2",
        );
    });

    it("rejects invalid or external returnTo values", () => {
        expect(getSafeKnowledgeReturnTo(null)).toBe("/knowledge");
        expect(getSafeKnowledgeReturnTo("http://evil.test")).toBe("/knowledge");
        expect(getSafeKnowledgeReturnTo("https://evil.test")).toBe("/knowledge");
        expect(getSafeKnowledgeReturnTo("//evil.test")).toBe("/knowledge");
        expect(getSafeKnowledgeReturnTo("javascript:alert(1)")).toBe("/knowledge");
        expect(getSafeKnowledgeReturnTo("/notebooks/1")).toBe("/knowledge");
    });
});
