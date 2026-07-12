import React, { act, useContext } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";

const mocks = vi.hoisted(() => {
    class MockApiError extends Error {
        status: number;
        statusText: string;
        data: unknown;

        constructor(status: number, statusText: string, data: unknown) {
            super(`API Error: ${status} ${statusText}`);
            this.name = "ApiError";
            this.status = status;
            this.statusText = statusText;
            this.data = data;
        }
    }

    return {
        apiClient: {
            get: vi.fn(),
            post: vi.fn(),
            patch: vi.fn(),
        },
        router: {
            back: vi.fn(),
        },
        useParams: vi.fn(() => ({ errorItemId: "err-1" })),
        ApiError: MockApiError,
    };
});

vi.mock("next/navigation", () => ({
    useParams: mocks.useParams,
    useRouter: () => mocks.router,
}));

vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/api-client", () => ({
    apiClient: mocks.apiClient,
    ApiError: mocks.ApiError,
}));

vi.mock("@/lib/image-utils", () => ({
    processImageFile: vi.fn(),
}));

vi.mock("@/components/markdown-renderer", () => ({
    MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
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

vi.mock("@/components/ui/card", () => ({
    Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/input", () => ({
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/components/ui/textarea", () => ({
    Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

vi.mock("@/components/ui/dialog", async () => {
    const ReactModule = await import("react");
    const DialogContext = ReactModule.createContext(false);

    return {
        Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (
            <DialogContext.Provider value={open}>{children}</DialogContext.Provider>
        ),
        DialogContent: ({ children }: { children: React.ReactNode }) => {
            const open = useContext(DialogContext);
            return open ? <div>{children}</div> : null;
        },
        DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
        DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
        DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
        DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    };
});

import ReviewPage from "@/app/review/[errorItemId]/page";

function getButtonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent?.replace(/\s+/g, " ").trim() === text,
    ) as HTMLButtonElement | undefined;
}

async function flush(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
    });
}

describe("ReviewPage mastery action", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.clearAllMocks();
        // Tell React this environment supports act(), to avoid noisy warnings.
        // @ts-expect-error test-only global flag
        globalThis.IS_REACT_ACT_ENVIRONMENT = true;
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        mocks.router.back.mockReset();
    });

    afterEach(async () => {
        await act(async () => {
            root.unmount();
        });
        container.remove();
    });

    it("已掌握题目进入页面时应直接显示已掌握状态", async () => {
        mocks.apiClient.get.mockResolvedValue({
            id: "err-1",
            masteryLevel: 2,
            questionText: "题目内容",
            userNotes: "",
            subject: { id: "subj-1", name: "数学" },
        });

        await act(async () => {
            root.render(<ReviewPage />);
        });
        await flush();

        const masteredButton = getButtonByText(container, "已掌握");
        expect(masteredButton).toBeDefined();
        expect(masteredButton?.disabled).toBe(true);
    });

    it("设置已掌握失败时前端不应误显示成功状态", async () => {
        mocks.apiClient.get.mockResolvedValue({
            id: "err-1",
            masteryLevel: 0,
            questionText: "题目内容",
            userNotes: "",
            subject: { id: "subj-1", name: "数学" },
        });
        mocks.apiClient.patch.mockRejectedValue(
            new mocks.ApiError(500, "Internal Server Error", { message: "设置已掌握失败，请稍后重试。" }),
        );

        await act(async () => {
            root.render(<ReviewPage />);
        });
        await flush();

        const openDialogButton = getButtonByText(container, "设为已掌握");
        expect(openDialogButton).toBeDefined();

        await act(async () => {
            openDialogButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const confirmButton = getButtonByText(container, "确认设为已掌握");
        expect(confirmButton).toBeDefined();

        await act(async () => {
            confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        await flush();

        expect(mocks.apiClient.patch).toHaveBeenCalledWith("/api/error-items/err-1/mastery", { masteryLevel: 2 });
        expect(container.textContent).toContain("设置已掌握失败，请稍后重试。");
        expect(getButtonByText(container, "已掌握")).toBeUndefined();

        const retryButton = getButtonByText(container, "设为已掌握");
        expect(retryButton).toBeDefined();
        expect(retryButton?.disabled).toBe(false);
    });
});
