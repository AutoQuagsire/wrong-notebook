import { VALID_QUESTION_TYPES } from "@/lib/question-type";

type SearchParamsReader = Pick<URLSearchParams, "get">;

export type MasteryFilter = "all" | "mastered" | "unmastered";
export type TimeFilter = "all" | "week" | "month";
export type PaperLevelFilter = "all" | "a" | "b" | "other";

export interface ErrorListUrlState {
    search: string;
    masteryFilter: MasteryFilter;
    timeFilter: TimeFilter;
    gradeFilter: string;
    chapterFilter: string;
    paperLevelFilter: PaperLevelFilter;
    questionTypeFilter: string;
    selectedTag: string | null;
    page: number;
}

export const DEFAULT_ERROR_LIST_URL_STATE: ErrorListUrlState = {
    search: "",
    masteryFilter: "all",
    timeFilter: "all",
    gradeFilter: "",
    chapterFilter: "",
    paperLevelFilter: "all",
    questionTypeFilter: "all",
    selectedTag: null,
    page: 1,
};

function readTrimmedParam(searchParams: SearchParamsReader, key: string): string {
    return searchParams.get(key)?.trim() ?? "";
}

function parseMasteryFilter(value: string): MasteryFilter {
    if (value === "2") return "mastered";
    if (value === "0" || value === "1") return "unmastered";
    return "all";
}

function parseTimeFilter(value: string): TimeFilter {
    if (value === "week" || value === "month") return value;
    return "all";
}

function parsePaperLevelFilter(value: string): PaperLevelFilter {
    if (value === "a" || value === "b" || value === "other") return value;
    return "all";
}

function parseQuestionTypeFilter(value: string): string {
    if (!value || value === "all") return "all";
    return VALID_QUESTION_TYPES.includes(value as (typeof VALID_QUESTION_TYPES)[number]) ? value : "all";
}

function parsePage(value: string): number {
    if (!value) return 1;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function parseErrorListUrlState(
    searchParams: SearchParamsReader,
): ErrorListUrlState {
    return {
        search: readTrimmedParam(searchParams, "query"),
        masteryFilter: parseMasteryFilter(readTrimmedParam(searchParams, "mastery")),
        timeFilter: parseTimeFilter(readTrimmedParam(searchParams, "timeRange")),
        gradeFilter: readTrimmedParam(searchParams, "gradeSemester"),
        chapterFilter: readTrimmedParam(searchParams, "chapter"),
        paperLevelFilter: parsePaperLevelFilter(readTrimmedParam(searchParams, "paperLevel")),
        questionTypeFilter: parseQuestionTypeFilter(readTrimmedParam(searchParams, "questionType")),
        selectedTag: readTrimmedParam(searchParams, "tag") || null,
        page: parsePage(readTrimmedParam(searchParams, "page")),
    };
}

export function buildErrorListUrlSearchParams(state: ErrorListUrlState): URLSearchParams {
    const params = new URLSearchParams();

    if (state.search) params.set("query", state.search);
    if (state.masteryFilter === "mastered") params.set("mastery", "2");
    if (state.masteryFilter === "unmastered") params.set("mastery", "0");
    if (state.timeFilter !== "all") params.set("timeRange", state.timeFilter);
    if (state.gradeFilter) params.set("gradeSemester", state.gradeFilter);
    if (state.chapterFilter) params.set("chapter", state.chapterFilter);
    if (state.paperLevelFilter !== "all") params.set("paperLevel", state.paperLevelFilter);
    if (state.questionTypeFilter !== "all") params.set("questionType", state.questionTypeFilter);
    if (state.selectedTag) params.set("tag", state.selectedTag);
    if (state.page > 1) params.set("page", String(state.page));

    return params;
}

export function buildErrorItemDetailHref(itemId: string, pathname: string, state: ErrorListUrlState): string {
    const params = buildErrorListUrlSearchParams(state).toString();
    const returnTo = params ? `${pathname}?${params}` : pathname;
    return `/error-items/${itemId}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function getSafeErrorItemReturnTo(returnTo: string | null | undefined, subjectId?: string | null): string {
    const fallback = subjectId ? `/notebooks/${subjectId}` : "/notebooks";

    if (!returnTo) return fallback;
    if (!returnTo.startsWith("/")) return fallback;
    if (returnTo.startsWith("//")) return fallback;
    if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(returnTo)) return fallback;

    return returnTo;
}
