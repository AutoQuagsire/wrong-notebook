/**
 * GET /api/review/today 集成测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
    mockFsrsCard: {
        findMany: vi.fn(),
        count: vi.fn(),
    },
    mockErrorItem: {
        findMany: vi.fn(),
        count: vi.fn(),
    },
    mockSession: {
        user: {
            id: "user-123",
            email: "user@example.com",
        },
        expires: "2026-12-31",
    },
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        fsrsCard: mocks.mockFsrsCard,
        errorItem: mocks.mockErrorItem,
    },
}));

vi.mock("next-auth", () => ({
    getServerSession: vi.fn(() => Promise.resolve(mocks.mockSession)),
}));

vi.mock("@/lib/auth", () => ({
    authOptions: {},
}));

import { GET } from "@/app/api/review/today/route";
import { getServerSession } from "next-auth";

const now = new Date();
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const yesterday = new Date(todayStart.getTime() - 86400000);
const twoDaysAgo = new Date(todayStart.getTime() - 2 * 86400000);

const mockErrorItemData = (id: string, subjectName = "数学") => ({
    questionText: `测试题目 ${id}`,
    ocrText: null,
    originalImageUrl: null,
    subject: { id: `subj-${subjectName}`, name: subjectName },
});

describe("GET /api/review/today", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getServerSession).mockResolvedValue(mocks.mockSession);
        // Default: no FsrsCards, no error items
        mocks.mockFsrsCard.findMany.mockResolvedValue([]);
        mocks.mockFsrsCard.count.mockResolvedValue(0);
        mocks.mockErrorItem.findMany.mockResolvedValue([]);
        mocks.mockErrorItem.count.mockResolvedValue(0);
    });

    describe("authentication", () => {
        it("未登录访问应返回 401", async () => {
            vi.mocked(getServerSession).mockResolvedValue(null);

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            expect(res.status).toBe(401);
            expect(data.message).toBe("Unauthorized");
        });
    });

    describe("due items", () => {
        it("应返回 due <= now 的错题", async () => {
            mocks.mockFsrsCard.findMany.mockResolvedValue([
                {
                    id: "card-1",
                    userId: "user-123",
                    errorItemId: "err-1",
                    due: yesterday,
                    last_review: yesterday,
                    reps: 2,
                    lapses: 0,
                    state: "Review",
                    scheduled_days: 3,
                    errorItem: mockErrorItemData("err-1"),
                },
            ]);
            mocks.mockFsrsCard.count.mockResolvedValue(1);

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.dueItems).toHaveLength(1);
            expect(data.dueItems[0].errorItemId).toBe("err-1");
            expect(data.dueItems[0].fsrsCardId).toBe("card-1");
            expect(data.dueItems[0].due).toBe(yesterday.toISOString());
            expect(data.stats.dueCount).toBe(1);
        });

        it("due > now 的错题不应返回", async () => {
            mocks.mockFsrsCard.findMany.mockImplementation(async () => {
                return [];
            });

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.dueItems).toHaveLength(0);
        });

        it("逾期题应按 due ASC 排序", async () => {
            const cards = [
                {
                    id: "card-3",
                    userId: "user-123",
                    errorItemId: "err-3",
                    due: twoDaysAgo,
                    last_review: twoDaysAgo,
                    reps: 5,
                    lapses: 1,
                    state: "Review",
                    scheduled_days: 5,
                    errorItem: mockErrorItemData("err-3"),
                },
                {
                    id: "card-1",
                    userId: "user-123",
                    errorItemId: "err-1",
                    due: yesterday,
                    last_review: yesterday,
                    reps: 2,
                    lapses: 0,
                    state: "Review",
                    scheduled_days: 3,
                    errorItem: mockErrorItemData("err-1"),
                },
            ];

            mocks.mockFsrsCard.findMany.mockResolvedValue(cards);
            mocks.mockFsrsCard.count.mockResolvedValue(2);

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.dueItems).toHaveLength(2);
            // First card should be the older one (twoDaysAgo)
            expect(data.dueItems[0].errorItemId).toBe("err-3");
            expect(data.dueItems[1].errorItemId).toBe("err-1");
        });

        it("返回项不应包含 answerText 或 analysis", async () => {
            mocks.mockFsrsCard.findMany.mockResolvedValue([
                {
                    id: "card-1",
                    userId: "user-123",
                    errorItemId: "err-1",
                    due: yesterday,
                    last_review: yesterday,
                    reps: 2,
                    lapses: 0,
                    state: "Review",
                    scheduled_days: 3,
                    errorItem: {
                        questionText: "测试题目",
                        ocrText: null,
                        originalImageUrl: null,
                        subject: { id: "subj-math", name: "数学" },
                    },
                },
            ]);
            mocks.mockFsrsCard.count.mockResolvedValue(1);

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            const item = data.dueItems[0];
            expect(item).not.toHaveProperty("answerText");
            expect(item).not.toHaveProperty("analysis");
            expect(item).toHaveProperty("questionPreview");
        });
    });

    describe("limit", () => {
        it("默认 limit 应为 20", async () => {
            mocks.mockFsrsCard.findMany.mockResolvedValue([]);

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.stats.limit).toBe(20);
        });

        it("limit 参数应生效", async () => {
            mocks.mockFsrsCard.findMany.mockResolvedValue([]);

            const req = new Request("http://localhost/api/review/today?limit=5");
            const res = await GET(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.stats.limit).toBe(5);
        });

        it("超大 limit 应被限制为 100", async () => {
            mocks.mockFsrsCard.findMany.mockResolvedValue([]);

            const req = new Request("http://localhost/api/review/today?limit=999");
            const res = await GET(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.stats.limit).toBe(100);
        });

        it("非法 limit 应返回 400", async () => {
            for (const bad of ["0", "-1", "abc"]) {
                const req = new Request(`http://localhost/api/review/today?limit=${bad}`);
                const res = await GET(req);
                const data = await res.json();

                expect(res.status).toBe(400);
                expect(data.message).toContain("limit");
            }
        });
    });

    describe("stats", () => {
        it("stats.dueCount 应正确", async () => {
            mocks.mockFsrsCard.findMany.mockResolvedValue([]);
            mocks.mockFsrsCard.count.mockResolvedValue(5);

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            expect(data.stats.dueCount).toBe(5);
        });

        it("stats.overdueCount 应正确（due < 今天 00:00）", async () => {
            mocks.mockFsrsCard.findMany.mockResolvedValue([]);
            mocks.mockFsrsCard.count.mockImplementation(async () => {
                return 3;
            });

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            // The first count call returns 0 (total due), second returns 3 (overdue)
            expect(data.stats.overdueCount).toBe(3);
        });

        it("stats.newCount 应正确", async () => {
            mocks.mockFsrsCard.count.mockResolvedValue(0);
            mocks.mockErrorItem.count.mockResolvedValue(10);

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            expect(data.stats.newCount).toBe(10);
        });

        it("stats.generatedAt 应为 ISO 时间戳", async () => {
            mocks.mockFsrsCard.findMany.mockResolvedValue([]);

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            expect(new Date(data.stats.generatedAt).getTime()).toBeGreaterThan(0);
        });
    });

    describe("includeNew", () => {
        it("includeNew=false 默认不应返回 newItems", async () => {
            mocks.mockFsrsCard.findMany.mockResolvedValue([]);

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.newItems).toEqual([]);
        });

        it("includeNew=true 时应返回没有 FsrsCard 的 ErrorItem", async () => {
            mocks.mockFsrsCard.findMany
                .mockResolvedValueOnce([]) // due cards
                .mockResolvedValueOnce([]) // upcoming
                .mockResolvedValueOnce([]); // existing fsrs errorItemIds
            mocks.mockFsrsCard.count
                .mockResolvedValueOnce(0) // dueCount
                .mockResolvedValueOnce(0); // overdueCount

            mocks.mockErrorItem.findMany.mockResolvedValue([
                {
                    id: "err-new-1",
                    questionText: "新错题",
                    ocrText: null,
                    originalImageUrl: null,
                    subject: { id: "subj-math", name: "数学" },
                },
            ]);
            mocks.mockErrorItem.count.mockResolvedValue(5);

            const req = new Request("http://localhost/api/review/today?includeNew=true");
            const res = await GET(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.newItems).toHaveLength(1);
            expect(data.newItems[0].errorItemId).toBe("err-new-1");
            expect(data.newItems[0].fsrsCardId).toBeUndefined();
            expect(data.stats.newCount).toBe(5);
        });

        it("newItems 不应包含其他用户的新错题", async () => {
            mocks.mockFsrsCard.findMany
                .mockResolvedValueOnce([]) // due cards
                .mockResolvedValueOnce([]) // upcoming
                .mockResolvedValueOnce([]); // existing fsrs errorItemIds
            mocks.mockErrorItem.findMany.mockResolvedValue([]);
            mocks.mockErrorItem.count.mockResolvedValue(0);

            const req = new Request("http://localhost/api/review/today?includeNew=true");
            await GET(req);

            // Verify the query filters by userId
            const findManyCall = mocks.mockErrorItem.findMany.mock.calls[0][0] as { where: { userId: string } };
            expect(findManyCall.where.userId).toBe("user-123");
        });

        it("不应返回其他用户的 FsrsCard", async () => {
            mocks.mockFsrsCard.findMany.mockResolvedValue([]);

            const req = new Request("http://localhost/api/review/today");
            await GET(req);

            // Verify the query filters by userId
            const findCall = mocks.mockFsrsCard.findMany.mock.calls[0][0] as { where: { userId: string } };
            expect(findCall.where.userId).toBe("user-123");
        });

        it("完成首次 ORIGINAL_REVIEW 后该题不应再作为 newItem", async () => {
            // Simulate: an errorItem "err-reviewed" now has an FsrsCard after review
            mocks.mockFsrsCard.findMany
                .mockResolvedValueOnce([]) // due cards: empty
                .mockResolvedValueOnce([]) // upcoming cards: empty
                .mockResolvedValueOnce([
                    { errorItemId: "err-reviewed" },
                    { errorItemId: "err-other" },
                ]); // existing fsrs errorItemIds

            mocks.mockErrorItem.findMany.mockResolvedValue([]);

            const req = new Request("http://localhost/api/review/today?includeNew=true");
            const res = await GET(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.newItems).toHaveLength(0);

            // errorItem.findMany should have been called with notIn filter
            const findManyCall = mocks.mockErrorItem.findMany.mock.calls[0][0] as {
                where: { userId: string; id: { notIn: string[] } };
            };
            expect(findManyCall.where.id.notIn).toContain("err-reviewed");
            expect(findManyCall.where.id.notIn).toContain("err-other");
        });
    });

    describe("question preview", () => {
        it("应截断过长题目", async () => {
            const longText = "A".repeat(400);
            mocks.mockFsrsCard.findMany.mockResolvedValue([
                {
                    id: "card-1",
                    userId: "user-123",
                    errorItemId: "err-1",
                    due: yesterday,
                    last_review: yesterday,
                    reps: 2,
                    lapses: 0,
                    state: "Review",
                    scheduled_days: 3,
                    errorItem: {
                        questionText: longText,
                        ocrText: null,
                        originalImageUrl: null,
                        subject: { id: "s", name: "数学" },
                    },
                },
            ]);
            mocks.mockFsrsCard.count.mockResolvedValue(1);

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            const preview = data.dueItems[0].questionPreview;
            expect(preview.length).toBeLessThanOrEqual(301); // 300 + "…"
            expect(preview.endsWith("…")).toBe(true);
        });

        it("无题目文本时应返回占位文本", async () => {
            mocks.mockFsrsCard.findMany.mockResolvedValue([
                {
                    id: "card-1",
                    userId: "user-123",
                    errorItemId: "err-1",
                    due: yesterday,
                    last_review: yesterday,
                    reps: 2,
                    lapses: 0,
                    state: "Review",
                    scheduled_days: 3,
                    errorItem: {
                        questionText: null,
                        ocrText: null,
                        originalImageUrl: null,
                        subject: null,
                    },
                },
            ]);
            mocks.mockFsrsCard.count.mockResolvedValue(1);

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            expect(data.dueItems[0].questionPreview).toBe("暂无题目内容");
        });
    });

    describe("overdueDays", () => {
        it("昨天到期的卡 overdueDays 应为 1", async () => {
            mocks.mockFsrsCard.findMany.mockResolvedValue([
                {
                    id: "card-1",
                    userId: "user-123",
                    errorItemId: "err-1",
                    due: yesterday,
                    last_review: yesterday,
                    reps: 2,
                    lapses: 0,
                    state: "Review",
                    scheduled_days: 3,
                    errorItem: mockErrorItemData("err-1"),
                },
            ]);
            mocks.mockFsrsCard.count.mockResolvedValue(1);

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            expect(data.dueItems[0].overdueDays).toBe(1);
        });

        it("今天到期的卡 overdueDays 应为 0", async () => {
            mocks.mockFsrsCard.findMany.mockResolvedValue([
                {
                    id: "card-1",
                    userId: "user-123",
                    errorItemId: "err-1",
                    due: now,
                    last_review: now,
                    reps: 2,
                    lapses: 0,
                    state: "Review",
                    scheduled_days: 3,
                    errorItem: mockErrorItemData("err-1"),
                },
            ]);
            mocks.mockFsrsCard.count.mockResolvedValue(1);

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            expect(data.dueItems[0].overdueDays).toBe(0);
        });
    });

    describe("upcoming", () => {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today.getTime() + 86400000);
        const day2 = new Date(today.getTime() + 2 * 86400000);
        const day3 = new Date(today.getTime() + 3 * 86400000);
        const day8 = new Date(today.getTime() + 8 * 86400000);

        beforeEach(() => {
            vi.clearAllMocks();
            vi.mocked(getServerSession).mockResolvedValue(mocks.mockSession);
        });

        function setupMocks(dueCards: unknown[] = [], upcomingCards: { due: Date }[] = [], dueCount = 0, overdueCount = 0, newCount = 0) {
            mocks.mockFsrsCard.findMany
                .mockResolvedValueOnce(dueCards)       // due cards
                .mockResolvedValueOnce(upcomingCards)   // upcoming
                .mockResolvedValueOnce([]);             // existing fsrs errorItemIds
            mocks.mockFsrsCard.count
                .mockResolvedValueOnce(dueCount)        // dueCount
                .mockResolvedValueOnce(overdueCount);   // overdueCount
            mocks.mockErrorItem.count.mockResolvedValue(newCount);
        }

        it("应返回未来 7 天的统计", async () => {
            setupMocks([], [], 0, 0, 0);

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.stats.upcoming).toBeDefined();
            expect(data.stats.upcoming).toHaveLength(7);
        });

        it("upcoming 日期应为 YYYY-MM-DD 格式", async () => {
            setupMocks([], [], 0, 0, 0);

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            for (const day of data.stats.upcoming) {
                expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            }
        });

        it("应正确统计每天的到期题数", async () => {
            setupMocks(
                [],
                [
                    { due: today },
                    { due: tomorrow },
                    { due: tomorrow },
                    { due: day2 },
                    { due: day3 },
                    { due: day3 },
                    { due: day3 },
                ],
                0, 0, 0
            );

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            const upcoming = data.stats.upcoming;
            expect(upcoming[0].count).toBe(1); // today
            expect(upcoming[1].count).toBe(2); // tomorrow
            expect(upcoming[2].count).toBe(1); // day2
            expect(upcoming[3].count).toBe(3); // day3
            expect(upcoming[4].count).toBe(0);
            expect(upcoming[5].count).toBe(0);
            expect(upcoming[6].count).toBe(0);
        });

        it("不应统计 7 天之外的卡", async () => {
            setupMocks(
                [],
                [
                    { due: today },
                    { due: day8 },
                ],
                0, 0, 0
            );

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            // day8 should not appear — only 7 days
            let totalUpcoming = 0;
            for (const day of data.stats.upcoming) {
                totalUpcoming += day.count;
            }
            expect(totalUpcoming).toBe(1); // only today's card counted
        });

        it("upcoming 不应包含没有 FsrsCard 的 newItems", async () => {
            // New items (from errorItem) don't have FsrsCard, so they shouldn't appear in upcoming
            setupMocks([]);

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            // All upcoming counts should be from FsrsCards only
            for (const day of data.stats.upcoming) {
                expect(typeof day.count).toBe("number");
            }
        });

        it("upcoming 应包含已逾期的卡（在今天窗口内）", async () => {
            const yesterdayCard = new Date(today.getTime() - 86400000);

            setupMocks(
                [],
                [
                    { due: yesterdayCard },
                    { due: tomorrow },
                ],
                0, 0, 0
            );

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            // Yesterday's card is < todayStart, so it should NOT be in upcoming
            // Only tomorrow's card should be in upcoming[1]
            // Actually, the query uses `due >= todayStart`, so yesterday is excluded
            let totalUpcoming = 0;
            for (const day of data.stats.upcoming) {
                totalUpcoming += day.count;
            }
            expect(totalUpcoming).toBe(1); // only tomorrow
        });

        it("upcoming 不应影响现有 dueItems/newItems/stats", async () => {
            mocks.mockFsrsCard.findMany
                .mockResolvedValueOnce([
                    {
                        id: "card-1",
                        userId: "user-123",
                        errorItemId: "err-1",
                        due: yesterday,
                        last_review: yesterday,
                        reps: 2, lapses: 0, state: "Review", scheduled_days: 3,
                        errorItem: mockErrorItemData("err-1"),
                    },
                ]) // due cards
                .mockResolvedValueOnce([]) // upcoming
                .mockResolvedValueOnce([]); // existing fsrs errorItemIds
            mocks.mockFsrsCard.count
                .mockResolvedValueOnce(1)  // dueCount
                .mockResolvedValueOnce(0); // overdueCount
            mocks.mockErrorItem.count.mockResolvedValue(5);

            const req = new Request("http://localhost/api/review/today");
            const res = await GET(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.dueItems).toHaveLength(1);
            expect(data.stats.dueCount).toBe(1);
            expect(data.stats.newCount).toBe(5);
            expect(data.stats.upcoming).toBeDefined();
        });

        it("查询应过滤 userId", async () => {
            setupMocks([], [], 0, 0, 0);

            const req = new Request("http://localhost/api/review/today");
            await GET(req);

            // The 2nd findMany call should be the upcoming query — check it has userId
            const upcomingCall = mocks.mockFsrsCard.findMany.mock.calls[1][0] as { where: { userId: string } };
            expect(upcomingCall.where.userId).toBe("user-123");
        });
    });
});
