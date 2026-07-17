type SearchParamsReader = Pick<URLSearchParams, "get">;

export interface KnowledgeListUrlState {
    query: string;
    subjectId: string | null;
    page: number;
}

export const DEFAULT_KNOWLEDGE_LIST_URL_STATE: KnowledgeListUrlState = {
    query: "",
    subjectId: null,
    page: 1,
};

function readTrimmedParam(searchParams: SearchParamsReader, key: string): string {
    return searchParams.get(key)?.trim() ?? "";
}

function parsePage(value: string): number {
    if (!value) return 1;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function parseKnowledgeListUrlState(searchParams: SearchParamsReader): KnowledgeListUrlState {
    const subjectId = readTrimmedParam(searchParams, "subjectId");

    return {
        query: readTrimmedParam(searchParams, "query"),
        subjectId: subjectId || null,
        page: parsePage(readTrimmedParam(searchParams, "page")),
    };
}

export function buildKnowledgeListUrlSearchParams(state: KnowledgeListUrlState): URLSearchParams {
    const params = new URLSearchParams();
    const query = state.query.trim();
    const subjectId = state.subjectId?.trim() ?? "";

    if (query) params.set("query", query);
    if (subjectId) params.set("subjectId", subjectId);
    if (state.page > 1) params.set("page", String(state.page));

    return params;
}

export function buildKnowledgeItemDetailHref(
    itemId: string,
    pathname: string,
    state: KnowledgeListUrlState,
): string {
    const params = buildKnowledgeListUrlSearchParams(state).toString();
    const returnTo = params ? `${pathname}?${params}` : pathname;
    return `/knowledge/${itemId}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function getSafeKnowledgeReturnTo(returnTo: string | null | undefined): string {
    const fallback = "/knowledge";

    if (!returnTo) return fallback;
    if (!returnTo.startsWith("/")) return fallback;
    if (returnTo.startsWith("//")) return fallback;
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(returnTo)) return fallback;

    try {
        const parsed = new URL(returnTo, "http://localhost");
        if (parsed.pathname !== "/knowledge") return fallback;
        return `${parsed.pathname}${parsed.search}`;
    } catch {
        return fallback;
    }
}
