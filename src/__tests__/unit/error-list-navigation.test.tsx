import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";

const mocks = vi.hoisted(() => {
    const currentSearchParams = new URLSearchParams();

    return {
        apiClient: {
            get: vi.fn(),
            post: vi.fn(),
        },
        router: {
            replace: vi.fn((href: string) => {
                const queryIndex = href.indexOf("?");
                const search = queryIndex >= 0 ? href.slice(queryIndex + 1) : "";
                for (const key of Array.from(currentSearchParams.keys())) {
                    currentSearchParams.delete(key);
                }
                new URLSearchParams(search).forEach((value, key) => currentSearchParams.set(key, value));
            }),
            push: vi.fn(),
        },
        currentSearchParams,
        setSearchParams(search: string) {
            for (const key of Array.from(currentSearchParams.keys())) {
                currentSearchParams.delete(key);
            }
            new URLSearchParams(search).forEach((value, key) => currentSearchParams.set(key, value));
        },
    };
});

vi.mock("next/navigation", () => ({
    useRouter: () => mocks.router,
    usePathname: () => "/notebooks/nb-1",
    useSearchParams: () => mocks.currentSearchParams,
}));

vi.mock("next/link", () => ({
    default: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: React.MouseEventHandler<HTMLAnchorElement> }) => (
        <a href={href} onClick={onClick}>
            {children}
        </a>
    ),
}));

vi.mock("@/lib/api-client", () => ({
    apiClient: mocks.apiClient,
}));

vi.mock("@/contexts/LanguageContext", () => ({
    useLanguage: () => ({
        language: "zh",
        t: {
            notebook: {
                search: "搜索错题",
                filter: "筛选",
                mastered: "已掌握",
                review: "待复习",
                exportPrint: "导出打印",
                selectMode: "多选",
                cancelSelect: "取消",
                deleteSelected: "删除选中",
                selectedCount: "{count} selected",
            },
            filter: {
                all: "全部",
                masteryStatus: "掌握状态",
                review: "待复习",
                mastered: "已掌握",
                timeRange: "时间范围",
                allTime: "全部时间",
                lastWeek: "最近一周",
                lastMonth: "最近一月",
                filteringByTag: "按标签筛选",
            },
            editor: {
                paperLevels: {
                    a: "Paper A",
                    b: "Paper B",
                    other: "Other",
                },
            },
            notebooks: {
                expandTags: "+{count} more",
                collapseTags: "Collapse",
                expandTagsTooltip: "Click to expand {count} tags",
                collapseTagsTooltip: "Click to collapse",
            },
            common: {
                messages: {
                    deleteFailed: "Delete failed",
                },
            },
        },
    }),
}));

vi.mock("@/components/ui/card", () => ({
    Card: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
    CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
    CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
}));

vi.mock("@/components/ui/badge", () => ({
    Badge: ({
        children,
        onClick,
        className,
        variant,
        title,
    }: {
        children: React.ReactNode;
        onClick?: React.MouseEventHandler<HTMLElement>;
        className?: string;
        variant?: string;
        title?: string;
    }) => (
        <button data-variant={variant} className={className} onClick={onClick} title={title} type="button">
            {children}
        </button>
    ),
}));

vi.mock("@/components/ui/input", () => ({
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/components/ui/button", () => ({
    Button: ({
        children,
        onClick,
        disabled,
        type = "button",
        ...rest
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button type={type} onClick={onClick} disabled={disabled} {...rest}>
            {children}
        </button>
    ),
}));

vi.mock("@/components/ui/checkbox", () => ({
    Checkbox: ({ checked }: { checked?: boolean }) => <input type="checkbox" checked={checked} readOnly />,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
    DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuItem: ({
        children,
        onClick,
    }: {
        children: React.ReactNode;
        onClick?: React.MouseEventHandler<HTMLButtonElement>;
    }) => (
        <button type="button" onClick={onClick}>
            {children}
        </button>
    ),
    DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuSeparator: () => <hr />,
}));

vi.mock("@/components/knowledge-filter", () => ({
    KnowledgeFilter: ({
        onFilterChange,
    }: {
        onFilterChange: (value: { gradeSemester?: string; chapter?: string; tag?: string | null }) => void;
    }) => (
        <div>
            <button type="button" onClick={() => onFilterChange({ gradeSemester: "高一", chapter: "第一章", tag: "函数" })}>
                apply-knowledge-filter
            </button>
            <button type="button" onClick={() => onFilterChange({ gradeSemester: undefined, chapter: undefined, tag: undefined })}>
                clear-knowledge-filter
            </button>
        </div>
    ),
}));

vi.mock("@/components/ui/pagination", () => ({
    Pagination: ({
        page,
        onPageChange,
    }: {
        page: number;
        onPageChange: (page: number) => void;
    }) => (
        <div>
            <span data-testid="page-value">{page}</span>
            <button type="button" onClick={() => onPageChange(page + 1)}>
                next-page
            </button>
        </div>
    ),
}));

import { ErrorList } from "@/components/error-list";

function flush(): Promise<void> {
    return act(async () => {
        await Promise.resolve();
    });
}

function getButtonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent?.replace(/\s+/g, " ").trim() === text,
    ) as HTMLButtonElement | undefined;
}

describe("ErrorList navigation state", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.clearAllMocks();
        // @ts-expect-error test-only
        globalThis.IS_REACT_ACT_ENVIRONMENT = true;
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        mocks.setSearchParams("");
        mocks.apiClient.get.mockResolvedValue({
            items: [
                {
                    id: "err-1",
                    createdAt: "2026-07-14T00:00:00.000Z",
                    masteryLevel: 0,
                    mistakeStatus: "wrong_attempt",
                    knowledgePoints: JSON.stringify(["函数"]),
                    tags: [{ name: "函数" }],
                },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
        });
    });

    afterEach(async () => {
        await act(async () => {
            root.unmount();
        });
        container.remove();
    });

    it("restores URL params on first load and keeps page from URL", async () => {
        mocks.setSearchParams("query=%E5%AE%9A%E7%A7%AF%E5%88%86&mastery=2&timeRange=month&gradeSemester=%E9%AB%98%E4%B8%80&chapter=%E7%AC%AC%E4%B8%80%E7%AB%A0&paperLevel=a&questionType=CALCULATION&tag=%E5%87%BD%E6%95%B0&page=2");

        await act(async () => {
            root.render(<ErrorList subjectId="nb-1" subjectName="数学" />);
        });
        await flush();

        const searchInput = container.querySelector("input") as HTMLInputElement;
        expect(searchInput.value).toBe("定积分");
        expect(container.textContent).toContain("函数");
        expect(container.querySelector("[data-testid='page-value']")?.textContent).toBe("2");
        expect(mocks.apiClient.get).toHaveBeenCalledWith(
            `/api/error-items/list?subjectId=nb-1&query=%E5%AE%9A%E7%A7%AF%E5%88%86&mastery=2&timeRange=month&tag=%E5%87%BD%E6%95%B0&gradeSemester=%E9%AB%98%E4%B8%80&chapter=%E7%AC%AC%E4%B8%80%E7%AB%A0&paperLevel=a&questionType=CALCULATION&page=2&pageSize=${DEFAULT_PAGE_SIZE}`,
        );
    });

    it("updates URL with router.replace, resets page on filter changes, and removes cleared params", async () => {
        mocks.setSearchParams("query=%E5%AE%9A%E7%A7%AF%E5%88%86&page=2");

        await act(async () => {
            root.render(<ErrorList subjectId="nb-1" subjectName="数学" />);
        });
        await flush();

        const applyFilterButton = getButtonByText(container, "apply-knowledge-filter");
        expect(applyFilterButton).toBeDefined();

        await act(async () => {
            applyFilterButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await flush();
        await flush();

        expect(mocks.router.replace).toHaveBeenLastCalledWith(
            "/notebooks/nb-1?query=%E5%AE%9A%E7%A7%AF%E5%88%86&gradeSemester=%E9%AB%98%E4%B8%80&chapter=%E7%AC%AC%E4%B8%80%E7%AB%A0&tag=%E5%87%BD%E6%95%B0",
            { scroll: false },
        );
        expect(container.querySelector("[data-testid='page-value']")?.textContent).toBe("1");
    });

    it("builds detail links with the full returnTo URL state", async () => {
        mocks.setSearchParams("query=%E5%AE%9A%E7%A7%AF%E5%88%86&questionType=CALCULATION&page=2");

        await act(async () => {
            root.render(<ErrorList subjectId="nb-1" subjectName="数学" />);
        });
        await flush();

        const detailLink = container.querySelector("a[href^='/error-items/err-1']") as HTMLAnchorElement;
        expect(detailLink).toBeTruthy();
        expect(detailLink.getAttribute("href")).toBe(
            "/error-items/err-1?returnTo=%2Fnotebooks%2Fnb-1%3Fquery%3D%25E5%25AE%259A%25E7%25A7%25AF%25E5%2588%2586%26questionType%3DCALCULATION%26page%3D2",
        );
    });

    it("keeps default behavior when there are no query params", async () => {
        await act(async () => {
            root.render(<ErrorList subjectId="nb-1" subjectName="数学" />);
        });
        await flush();

        const searchInput = container.querySelector("input") as HTMLInputElement;
        expect(searchInput.value).toBe("");
        expect(container.querySelector("[data-testid='page-value']")?.textContent).toBe("1");
        expect(mocks.apiClient.get).toHaveBeenCalledWith(`/api/error-items/list?subjectId=nb-1&page=1&pageSize=${DEFAULT_PAGE_SIZE}`);
    });
});
