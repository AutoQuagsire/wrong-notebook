/**
 * /api/knowledge-items CRUD integration tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/knowledge-items/route";
import { GET as GET_ID, PUT, DELETE } from "@/app/api/knowledge-items/[id]/route";
import { getServerSession } from "next-auth";

const mocks = vi.hoisted(() => ({
    mockPrismaUser: { findUnique: vi.fn() },
    mockPrismaSubject: { findFirst: vi.fn() },
    mockPrismaKnowledgeTag: { findFirst: vi.fn() },
    mockPrismaKnowledgeItem: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        aggregate: vi.fn(),
    },
    mockSession: { user: { email: "user@test.com", id: "user-123" } },
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: mocks.mockPrismaUser,
        subject: mocks.mockPrismaSubject,
        knowledgeTag: mocks.mockPrismaKnowledgeTag,
        knowledgeItem: mocks.mockPrismaKnowledgeItem,
    },
}));
vi.mock("next-auth");
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

describe("/api/knowledge-items", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getServerSession).mockResolvedValue(mocks.mockSession);
        mocks.mockPrismaUser.findUnique.mockResolvedValue({ id: "user-123", email: "user@test.com" });
    });

    function buildReq(method: string, url: string, body?: Record<string, unknown>) {
        return new Request(`http://localhost${url}`, {
            method,
            body: body ? JSON.stringify(body) : undefined,
            headers: { "Content-Type": "application/json" },
        });
    }

    // ── POST ──
    describe("POST", () => {
        it("returns 401 when not logged in", async () => {
            vi.mocked(getServerSession).mockResolvedValue(null);
            const req = buildReq("POST", "/api/knowledge-items", { subjectId: "s1", prompt: "p" });
            const res = await POST(req);
            expect(res.status).toBe(401);
        });

        it("returns 400 when subjectId missing", async () => {
            const req = buildReq("POST", "/api/knowledge-items", { prompt: "p" });
            const res = await POST(req);
            expect(res.status).toBe(400);
        });

        it("returns 400 when prompt empty", async () => {
            const req = buildReq("POST", "/api/knowledge-items", { subjectId: "s1", prompt: "" });
            const res = await POST(req);
            expect(res.status).toBe(400);
        });

        it("returns 404 when subject not found or not owned", async () => {
            mocks.mockPrismaSubject.findFirst.mockResolvedValue(null);
            const req = buildReq("POST", "/api/knowledge-items", { subjectId: "s1", prompt: "p" });
            const res = await POST(req);
            expect(res.status).toBe(404);
        });

        it("returns 404 when tag not found", async () => {
            mocks.mockPrismaSubject.findFirst.mockResolvedValue({ id: "s1" });
            mocks.mockPrismaKnowledgeTag.findFirst.mockResolvedValue(null);
            const req = buildReq("POST", "/api/knowledge-items", { subjectId: "s1", tagId: "bad", prompt: "p" });
            const res = await POST(req);
            expect(res.status).toBe(404);
        });

        it("creates successfully without answer", async () => {
            mocks.mockPrismaSubject.findFirst.mockResolvedValue({ id: "s1" });
            mocks.mockPrismaKnowledgeItem.aggregate.mockResolvedValue({ _max: { order: 5 } } as any);
            mocks.mockPrismaKnowledgeItem.findMany.mockResolvedValue([]);
            mocks.mockPrismaKnowledgeItem.create.mockResolvedValue({
                id: "ki-1", userId: "user-123", subjectId: "s1", prompt: "p", answer: "",
                detail: null, deck: null, order: 0, tagId: null, questionType: "DICTATION",
                source: null, manualDifficulty: null, createdAt: new Date(), updatedAt: new Date(),
            });
            const req = buildReq("POST", "/api/knowledge-items", { subjectId: "s1", prompt: "p" });
            const res = await POST(req);
            expect(res.status).toBe(201);
            const data = await res.json();
            expect(data.prompt).toBe("p");
        });
    });

    // ── GET list ──
    describe("GET list", () => {
        it("returns 401 when not logged in", async () => {
            vi.mocked(getServerSession).mockResolvedValue(null);
            const req = buildReq("GET", "/api/knowledge-items");
            const res = await GET(req);
            expect(res.status).toBe(401);
        });

        it("returns paginated items", async () => {
            mocks.mockPrismaKnowledgeItem.findMany.mockResolvedValue([]);
            mocks.mockPrismaKnowledgeItem.count.mockResolvedValue(0);
            const req = buildReq("GET", "/api/knowledge-items");
            const res = await GET(req);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.items).toBeDefined();
            expect(data.total).toBe(0);
        });
    });

    // ── GET detail ──
    describe("GET [id]", () => {
        it("returns 404 when not found", async () => {
            mocks.mockPrismaKnowledgeItem.findUnique.mockResolvedValue(null);
            const req = buildReq("GET", "/api/knowledge-items/ki-1");
            const res = await GET_ID(req, { params: Promise.resolve({ id: "ki-1" }) });
            expect(res.status).toBe(404);
        });

        it("returns 404 when belongs to other user", async () => {
            mocks.mockPrismaKnowledgeItem.findUnique.mockResolvedValue({ id: "ki-1", userId: "other" });
            const req = buildReq("GET", "/api/knowledge-items/ki-1");
            const res = await GET_ID(req, { params: Promise.resolve({ id: "ki-1" }) });
            expect(res.status).toBe(404);
        });
    });

    // ── PUT ──
    describe("PUT", () => {
        it("returns 404 when not owner", async () => {
            mocks.mockPrismaKnowledgeItem.findUnique.mockResolvedValue(null);
            const req = buildReq("PUT", "/api/knowledge-items/ki-1", { prompt: "new" });
            const res = await PUT(req, { params: Promise.resolve({ id: "ki-1" }) });
            expect(res.status).toBe(404);
        });

        it("updates successfully", async () => {
            mocks.mockPrismaKnowledgeItem.findUnique.mockResolvedValue({ userId: "user-123" });
            mocks.mockPrismaKnowledgeItem.update.mockResolvedValue({
                id: "ki-1", userId: "user-123", prompt: "new prompt", answer: "ans",
                detail: null, deck: "deck1", order: 1, questionType: "DICTATION",
                subjectId: "s1", tagId: null, source: null, manualDifficulty: null,
                createdAt: new Date(), updatedAt: new Date(),
            });
            const req = buildReq("PUT", "/api/knowledge-items/ki-1", { prompt: "new prompt" });
            const res = await PUT(req, { params: Promise.resolve({ id: "ki-1" }) });
            expect(res.status).toBe(200);
        });
    });

    // ── DELETE ──
    describe("DELETE", () => {
        it("returns 404 when not owner", async () => {
            mocks.mockPrismaKnowledgeItem.findUnique.mockResolvedValue(null);
            const req = buildReq("DELETE", "/api/knowledge-items/ki-1");
            const res = await DELETE(req, { params: Promise.resolve({ id: "ki-1" }) });
            expect(res.status).toBe(404);
        });

        it("deletes successfully", async () => {
            mocks.mockPrismaKnowledgeItem.findUnique.mockResolvedValue({ userId: "user-123" });
            mocks.mockPrismaKnowledgeItem.delete.mockResolvedValue({});
            const req = buildReq("DELETE", "/api/knowledge-items/ki-1");
            const res = await DELETE(req, { params: Promise.resolve({ id: "ki-1" }) });
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.deleted).toBe(true);
        });
    });
});
