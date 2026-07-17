import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";

const mocks = vi.hoisted(() => {
    const currentSearchParams = new URLSearchParams();

    return {
        apiClient: {
            get: vi.fn(),
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
    usePathname: () => "/knowledge",
    useSearchParams: () => mocks.currentSearchParams,
    useParams: () => ({ id: "ki-1" }),
}));

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        className,
    }: {
        href: string;
        children: React.ReactNode;
        className?: string;
    }) => (
        <a href={href} className={className}>
            {children}
        </a>
    ),
}));

vi.mock("@/lib/api-client", () => ({
    apiClient: mocks.apiClient,
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

vi.mock("@/components/ui/input", () => ({
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/components/ui/card", () => ({
    Card: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
    CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
    CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
    CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
}));

vi.mock("@/components/ui/badge", () => ({
    Badge: ({
        children,
        className,
    }: {
        children: React.ReactNode;
        className?: string;
    }) => <span className={className}>{children}</span>,
}));

vi.mock("@/components/markdown-renderer", () => ({
    MarkdownRenderer: ({ content }: { content: string }) => <span>{content}</span>,
}));

vi.mock("lucide-react", () => {
    const Icon = () => null;
    return {
        Plus: Icon,
        Brain: Icon,
        Search: Icon,
        Upload: Icon,
        ArrowLeft: Icon,
        Edit: Icon,
        Save: Icon,
        Trash2: Icon,
    };
});

vi.mock("@/components/ui/select", () => ({
    Select: ({
        value,
        onValueChange,
        disabled,
        children,
    }: {
        value?: string;
        onValueChange?: (value: string) => void;
        disabled?: boolean;
        children: React.ReactNode;
    }) => (
        <div data-disabled={disabled ? "true" : "false"}>
            <select
                aria-label="科目筛选"
                disabled={disabled}
                value={value}
                onChange={(event) => onValueChange?.(event.target.value)}
            >
                {children}
            </select>
        </div>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <option value="__placeholder__">{placeholder}</option>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectItem: ({
        children,
        value,
    }: {
        children: React.ReactNode;
        value: string;
    }) => <option value={value}>{children}</option>,
}));

import { KnowledgeListPageClient } from "@/app/knowledge/knowledge-list-client";
import KnowledgeDetailPage from "@/app/knowledge/[id]/page";

function flush(): Promise<void> {
    return act(async () => {
        await Promise.resolve();
    });
}

describe("Knowledge page navigation state", () => {
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

        mocks.apiClient.get.mockImplementation((url: string) => {
            if (url === "/api/subjects") {
                return Promise.resolve([
                    { id: "sub-1", name: "高等数学" },
                    { id: "sub-2", name: "线性代数" },
                ]);
            }

            if (url.startsWith("/api/knowledge-items?")) {
                return Promise.resolve({
                    items: [
                        {
                            id: "ki-1",
                            prompt: "二重积分定义",
                            deck: "第一章",
                            order: 0,
                            source: "MATH-01",
                            tag: { id: "tag-1", name: "积分", subject: "高数" },
                            subject: { id: "sub-1", name: "高等数学" },
                            questionType: "DICTATION",
                            manualDifficulty: null,
                            reviewState: null,
                            createdAt: "2026-07-17T00:00:00.000Z",
                            updatedAt: "2026-07-17T00:00:00.000Z",
                        },
                    ],
                    total: 40,
                    page: 2,
                    pageSize: 20,
                    totalPages: 2,
                });
            }

            if (url === "/api/knowledge-items/ki-1") {
                return Promise.resolve({
                    id: "ki-1",
                    userId: "user-1",
                    subjectId: "sub-1",
                    prompt: "二重积分定义",
                    answer: "答案",
                    detail: null,
                    deck: "第一章",
                    order: 0,
                    tagId: "tag-1",
                    tag: { id: "tag-1", name: "积分", subject: "高数" },
                    subject: { id: "sub-1", name: "高等数学" },
                    questionType: "DICTATION",
                    source: "MATH-01",
                    manualDifficulty: null,
                    reviewState: null,
                    createdAt: "2026-07-17T00:00:00.000Z",
                    updatedAt: "2026-07-17T00:00:00.000Z",
                });
            }

            return Promise.reject(new Error(`Unexpected GET ${url}`));
        });
    });

    afterEach(async () => {
        await act(async () => {
            root.unmount();
        });
        container.remove();
    });

    it("restores query, subject and page from url params on first load", async () => {
        mocks.setSearchParams("query=%E4%BA%8C%E9%87%8D%E7%A7%AF%E5%88%86&subjectId=sub-1&page=2");

        await act(async () => {
            root.render(<KnowledgeListPageClient />);
        });
        await flush();
        await flush();

        const searchInput = container.querySelector("input") as HTMLInputElement;
        const subjectSelect = container.querySelector("select[aria-label='科目筛选']") as HTMLSelectElement;

        expect(searchInput.value).toBe("二重积分");
        expect(subjectSelect.value).toBe("sub-1");
        expect(container.textContent).toContain("第 2 页 / 共 2 页");
        expect(mocks.apiClient.get).toHaveBeenCalledWith(
            "/api/knowledge-items?page=2&pageSize=20&query=%E4%BA%8C%E9%87%8D%E7%A7%AF%E5%88%86&subjectId=sub-1",
        );
    });

    it("updates url and resets page when subject changes", async () => {
        mocks.setSearchParams("query=%E4%BA%8C%E9%87%8D%E7%A7%AF%E5%88%86&page=2");

        await act(async () => {
            root.render(<KnowledgeListPageClient />);
        });
        await flush();
        await flush();

        const subjectSelect = container.querySelector("select[aria-label='科目筛选']") as HTMLSelectElement;

        await act(async () => {
            subjectSelect.value = "sub-2";
            subjectSelect.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await flush();
        await flush();

        expect(mocks.router.replace).toHaveBeenLastCalledWith(
            "/knowledge?query=%E4%BA%8C%E9%87%8D%E7%A7%AF%E5%88%86&subjectId=sub-2",
            { scroll: false },
        );
        expect(container.textContent).toContain("第 1 页 / 共 2 页");
    });

    it("removes subjectId from url and falls back to all subjects when the subject is invalid", async () => {
        mocks.setSearchParams("query=%E4%BA%8C%E9%87%8D%E7%A7%AF%E5%88%86&subjectId=bad-subject&page=3");

        await act(async () => {
            root.render(<KnowledgeListPageClient />);
        });
        await flush();
        await flush();
        await flush();

        const subjectSelect = container.querySelector("select[aria-label='科目筛选']") as HTMLSelectElement;
        expect(subjectSelect.value).toBe("__all__");
        expect(mocks.router.replace).toHaveBeenLastCalledWith(
            "/knowledge?query=%E4%BA%8C%E9%87%8D%E7%A7%AF%E5%88%86&page=3",
            { scroll: false },
        );
        expect(mocks.apiClient.get).toHaveBeenLastCalledWith(
            "/api/knowledge-items?page=3&pageSize=20&query=%E4%BA%8C%E9%87%8D%E7%A7%AF%E5%88%86",
        );
    });

    it("shows a non-blocking error and keeps listing with all subjects when subject loading fails", async () => {
        mocks.setSearchParams("subjectId=sub-1&page=2");
        mocks.apiClient.get.mockImplementation((url: string) => {
            if (url === "/api/subjects") {
                return Promise.reject(new Error("network error"));
            }

            if (url.startsWith("/api/knowledge-items?")) {
                return Promise.resolve({
                    items: [],
                    total: 0,
                    page: 2,
                    pageSize: 20,
                    totalPages: 0,
                });
            }

            return Promise.reject(new Error(`Unexpected GET ${url}`));
        });

        await act(async () => {
            root.render(<KnowledgeListPageClient />);
        });
        await flush();
        await flush();

        expect(container.textContent).toContain("科目加载失败，当前已按全部科目显示");
        expect(mocks.apiClient.get).toHaveBeenLastCalledWith("/api/knowledge-items?page=2&pageSize=20");
    });

    it("builds detail links with the full returnTo state", async () => {
        mocks.setSearchParams("query=%E4%BA%8C%E9%87%8D%E7%A7%AF%E5%88%86&subjectId=sub-1&page=2");

        await act(async () => {
            root.render(<KnowledgeListPageClient />);
        });
        await flush();
        await flush();

        const detailLink = container.querySelector("a[href^='/knowledge/ki-1']") as HTMLAnchorElement;
        expect(detailLink.getAttribute("href")).toBe(
            "/knowledge/ki-1?returnTo=%2Fknowledge%3Fquery%3D%25E4%25BA%258C%25E9%2587%258D%25E7%25A7%25AF%25E5%2588%2586%26subjectId%3Dsub-1%26page%3D2",
        );
    });

    it("uses the safe returnTo on the detail page and falls back for invalid values", async () => {
        mocks.setSearchParams("returnTo=%2Fknowledge%3Fquery%3Dtest%26subjectId%3Dsub-1%26page%3D2");

        await act(async () => {
            root.render(<KnowledgeDetailPage />);
        });
        await flush();
        await flush();

        const backLink = Array.from(container.querySelectorAll("a")).find((anchor) =>
            anchor.textContent?.includes("返回列表"),
        ) as HTMLAnchorElement;
        expect(backLink.getAttribute("href")).toBe("/knowledge?query=test&subjectId=sub-1&page=2");

        await act(async () => {
            root.unmount();
        });
        root = createRoot(container);
        mocks.setSearchParams("returnTo=https%3A%2F%2Fevil.test");

        await act(async () => {
            root.render(<KnowledgeDetailPage />);
        });
        await flush();
        await flush();

        const fallbackBackLink = Array.from(container.querySelectorAll("a")).find((anchor) =>
            anchor.textContent?.includes("返回列表"),
        ) as HTMLAnchorElement;
        expect(fallbackBackLink.getAttribute("href")).toBe("/knowledge");
    });
});
