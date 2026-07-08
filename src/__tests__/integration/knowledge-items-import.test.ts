/**
 * /api/knowledge-items/import integration tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/knowledge-items/import/route";
import { getServerSession } from "next-auth";

const mocks = vi.hoisted(() => ({
    mockPrismaUser: { findUnique: vi.fn() },
    mockPrismaSubject: { findFirst: vi.fn() },
    mockPrismaKnowledgeTag: { findMany: vi.fn() },
    mockPrismaKnowledgeItem: {
        create: vi.fn(),
    },
    mockSession: { user: { email: "user@test.com", id: "user-123" } },
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: mocks.mockPrismaUser,
        subject: mocks.mockPrismaSubject,
        knowledgeTag: mocks.mockPrismaKnowledgeTag,
        knowledgeItem: {
            ...mocks.mockPrismaKnowledgeItem,
        },
        $transaction: vi.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
    },
}));
vi.mock("next-auth");
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

describe("/api/knowledge-items/import", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getServerSession).mockResolvedValue(mocks.mockSession);
        mocks.mockPrismaUser.findUnique.mockResolvedValue({ id: "user-123", email: "user@test.com" });
        mocks.mockPrismaSubject.findFirst.mockResolvedValue({ id: "s1" });
        mocks.mockPrismaKnowledgeTag.findMany.mockResolvedValue([]);
    });

    function buildReq(body: Record<string, unknown>) {
        return new Request("http://localhost/api/knowledge-items/import", {
            method: "POST",
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
        });
    }

    function makeItem(overrides?: Record<string, unknown>) {
        return { prompt: "默写：全微分定义", answer: "设函数 z=f(x,y) ...", ...overrides };
    }

    // ── 401 ──
    it("returns 401 when not logged in", async () => {
        vi.mocked(getServerSession).mockResolvedValue(null);
        const req = buildReq({ subjectId: "s1", items: [makeItem()] });
        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    // ── 400 ──
    it("returns 400 when subjectId missing", async () => {
        const req = buildReq({ items: [makeItem()] });
        const res = await POST(req);
        expect(res.status).toBe(400);
    });

    it("returns 400 when items is not array", async () => {
        const req = buildReq({ subjectId: "s1", items: "not-an-array" });
        const res = await POST(req);
        expect(res.status).toBe(400);
    });

    it("returns 400 when items is empty array", async () => {
        const req = buildReq({ subjectId: "s1", items: [] });
        const res = await POST(req);
        expect(res.status).toBe(400);
    });

    it("returns 400 when items exceeds 200", async () => {
        const items = Array.from({ length: 201 }, (_, i) => makeItem({ prompt: `item ${i}` }));
        const req = buildReq({ subjectId: "s1", items });
        const res = await POST(req);
        expect(res.status).toBe(400);
    });

    // ── 404 ──
    it("returns 404 when subject not found", async () => {
        mocks.mockPrismaSubject.findFirst.mockResolvedValue(null);
        const req = buildReq({ subjectId: "bad-subject", items: [makeItem()] });
        const res = await POST(req);
        expect(res.status).toBe(404);
    });

    // ── Validation: prompt ──
    it("skips item with empty prompt", async () => {
        const req = buildReq({
            subjectId: "s1",
            items: [makeItem({ prompt: "" }), makeItem({ prompt: "valid prompt" })],
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.created).toBe(1);
        expect(data.skipped).toBe(1);
        expect(data.errors[0].row).toBe(1);
        expect(data.errors[0].message).toContain("prompt is required");
    });

    // ── Validation: answer — now always allowed (answer no longer required)
    it("creates item without answer (answer no longer required)", async () => {
        mocks.mockPrismaKnowledgeItem.create.mockResolvedValue({ id: "ki-1", prompt: "test" });
        const req = buildReq({
            subjectId: "s1",
            items: [makeItem({ prompt: "only prompt", answer: undefined })],
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.created).toBe(1);
        expect(data.skipped).toBe(0);
    });

    it("creates item with empty answer (answer no longer required)", async () => {
        mocks.mockPrismaKnowledgeItem.create.mockResolvedValue({ id: "ki-1", prompt: "test" });
        const req = buildReq({
            subjectId: "s1",
            allowPlaceholderAnswer: false,
            items: [makeItem({ answer: "" })],
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.created).toBe(1);
        expect(data.skipped).toBe(0);
    });

    // ── Validation: tagId ──
    it("skips item with invalid tagId", async () => {
        const req = buildReq({
            subjectId: "s1",
            items: [makeItem({ tagId: "bad-tag" })],
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.created).toBe(0);
        expect(data.skipped).toBe(1);
        expect(data.errors[0].message).toContain("tagId");
    });

    // ── Success ──
    it("successfully batch creates items", async () => {
        mocks.mockPrismaKnowledgeItem.create
            .mockResolvedValueOnce({ id: "ki-1", prompt: "p1" })
            .mockResolvedValueOnce({ id: "ki-2", prompt: "p2" });

        const req = buildReq({
            subjectId: "s1",
            items: [
                makeItem({ prompt: "p1", answer: "a1" }),
                makeItem({ prompt: "p2", answer: "a2" }),
            ],
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.created).toBe(2);
        expect(data.skipped).toBe(0);
        expect(data.items.length).toBe(2);
        expect(data.items[0].id).toBe("ki-1");
    });

    // ── Mixed: some valid, some skipped ──
    it("handles mixed valid and skipped items", async () => {
        mocks.mockPrismaKnowledgeItem.create
            .mockResolvedValueOnce({ id: "ki-1", prompt: "p1" })
            .mockResolvedValueOnce({ id: "ki-2", prompt: "p2" })
            .mockResolvedValueOnce({ id: "ki-3", prompt: "p3" });

        const req = buildReq({
            subjectId: "s1",
            allowPlaceholderAnswer: false,
            items: [
                makeItem({ prompt: "p1", answer: "a1" }),
                makeItem({ prompt: "", answer: "a2" }),   // skipped - empty prompt
                makeItem({ prompt: "p2", answer: "" }),    // valid - answer no longer required
                makeItem({ prompt: "p3", answer: "a3" }),
            ],
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.created).toBe(3);
        expect(data.skipped).toBe(1);
        expect(data.errors.length).toBe(1);
    });

    // ── Invalid JSON body ──
    it("returns 400 for invalid JSON", async () => {
        const req = new Request("http://localhost/api/knowledge-items/import", {
            method: "POST",
            body: "not json",
            headers: { "Content-Type": "application/json" },
        });
        const res = await POST(req);
        expect(res.status).toBe(400);
    });

    // ── code → source mapping ──
    it("maps code to source when source not provided", async () => {
        mocks.mockPrismaKnowledgeItem.create.mockResolvedValue({ id: "ki-1", prompt: "test" });
        const req = buildReq({
            subjectId: "s1",
            items: [makeItem({ code: "MFD-01", source: undefined })],
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
        // Verify source was set from code
        const createCalls = mocks.mockPrismaKnowledgeItem.create.mock.calls;
        expect(createCalls[0][0].data.source).toBe("MFD-01");
    });

    // ── item.deck overrides top-level deck ──
    it("uses item deck over top-level deck", async () => {
        mocks.mockPrismaKnowledgeItem.create.mockResolvedValue({ id: "ki-1", prompt: "test" });
        const req = buildReq({
            subjectId: "s1",
            deck: "default-deck",
            items: [makeItem({ deck: "specific-deck" })],
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
        const createCalls = mocks.mockPrismaKnowledgeItem.create.mock.calls;
        expect(createCalls[0][0].data.deck).toBe("specific-deck");
    });
});
