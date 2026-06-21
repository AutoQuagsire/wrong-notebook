/**
 * /api/practice API 集成测试
 * 测试举一反三功能（生成类似题目和记录练习结果）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type PrismaMockArgs = { data: Record<string, unknown> };

// Use vi.hoisted to ensure mocks are initialized before module imports
const mocks = vi.hoisted(() => ({
    mockPrismaErrorItem: {
        findUnique: vi.fn(),
    },
    mockPrismaPracticeRecord: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
    },
    mockAIService: {
        generateSimilarQuestion: vi.fn(),
    },
    mockSession: {
        user: {
            id: 'user-123',
            email: 'user@example.com',
            name: 'Test User',
        },
        expires: '2025-12-31',
    },
}));

// Mock Prisma client
vi.mock('@/lib/prisma', () => ({
    prisma: {
        errorItem: mocks.mockPrismaErrorItem,
        practiceRecord: mocks.mockPrismaPracticeRecord,
    },
}));

// Mock AI service
vi.mock('@/lib/ai', () => ({
    getAIService: vi.fn(() => mocks.mockAIService),
}));

// Mock next-auth
vi.mock('next-auth', () => ({
    getServerSession: vi.fn(() => Promise.resolve(mocks.mockSession)),
}));

vi.mock('@/lib/auth', () => ({
    authOptions: {},
}));

// Import after mocks
import { POST as GENERATE_POST } from '@/app/api/practice/generate/route';
import { GET as RECORD_GET, POST as RECORD_POST } from '@/app/api/practice/record/route';
import { getServerSession } from 'next-auth';

describe('/api/practice', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getServerSession).mockResolvedValue(mocks.mockSession);
        mocks.mockPrismaPracticeRecord.findFirst.mockResolvedValue(null);
        mocks.mockPrismaPracticeRecord.findMany.mockResolvedValue([]);
    });

    describe('POST /api/practice/generate (生成类似题目)', () => {
        const mockErrorItem = {
            id: 'error-item-1',
            questionText: '求解 x + 2 = 5',
            knowledgePoints: '["一元一次方程", "移项"]',
            subject: { id: 'math', name: '数学' },
        };

        it('应该成功生成类似题目', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(mockErrorItem);
            const aiResult = {
                questionText: '求解 2x - 3 = 7',
                answerText: 'x = 5',
                analysis: '移项得 2x = 10, x = 5',
                knowledgePoints: ['一元一次方程'],
                subject: '数学',
            };
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue(aiResult);

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                    difficulty: 'medium',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await GENERATE_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.questionText).toBe('求解 2x - 3 = 7');
            expect(data.subject).toBe('数学');
        });

        it('应该支持不同难度级别', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(mockErrorItem);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: '简单题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: [],
            });

            const difficulties = ['easy', 'medium', 'hard', 'harder'];

            for (const difficulty of difficulties) {
                const request = new Request('http://localhost/api/practice/generate', {
                    method: 'POST',
                    body: JSON.stringify({
                        errorItemId: 'error-item-1',
                        language: 'zh',
                        difficulty,
                    }),
                    headers: { 'Content-Type': 'application/json' },
                });

                const response = await GENERATE_POST(request);
                expect(response.status).toBe(200);
            }

            // 验证 AI 服务被调用时使用了不同难度
            expect(mocks.mockAIService.generateSimilarQuestion).toHaveBeenCalledTimes(4);
        });

        it('应该默认使用 medium 难度', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(mockErrorItem);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: '题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: [],
            });

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                    // 不指定 difficulty
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            await GENERATE_POST(request);

            expect(mocks.mockAIService.generateSimilarQuestion).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Array),
                'zh',
                'medium', // 默认难度
                undefined
            );
        });

        it('应该返回 404 当错题不存在', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(null);

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'not-exist',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await GENERATE_POST(request);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.message).toBe('Item not found');
        });

        it('应该正确解析知识点标签', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(mockErrorItem);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: '题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: ['一元一次方程'],
            });

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            await GENERATE_POST(request);

            expect(mocks.mockAIService.generateSimilarQuestion).toHaveBeenCalledWith(
                '求解 x + 2 = 5',
                ['一元一次方程', '移项'], // 解析后的标签数组
                'zh',
                'medium',
                undefined
            );
        });

        it('应该处理无效的知识点 JSON', async () => {
            const errorItemWithInvalidTags = {
                ...mockErrorItem,
                knowledgePoints: 'invalid json{',
            };
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(errorItemWithInvalidTags);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: '题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: [],
            });

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await GENERATE_POST(request);

            expect(response.status).toBe(200);
            // 应该使用空数组作为标签
            expect(mocks.mockAIService.generateSimilarQuestion).toHaveBeenCalledWith(
                expect.any(String),
                [], // 空数组
                'zh',
                'medium',
                undefined
            );
        });

        it('应该处理空的知识点', async () => {
            const errorItemWithNoTags = {
                ...mockErrorItem,
                knowledgePoints: null,
            };
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(errorItemWithNoTags);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: '题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: [],
            });

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await GENERATE_POST(request);

            expect(response.status).toBe(200);
        });

        it('应该从数据库获取正确的学科', async () => {
            const errorItemWithPhysics = {
                ...mockErrorItem,
                subject: { id: 'physics', name: '物理' },
            };
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(errorItemWithPhysics);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: '物理题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: [],
                subject: undefined, // AI 返回的可能没有学科
            });

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await GENERATE_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.subject).toBe('物理'); // 应该从数据库注入
        });

        it('应该处理未知学科为"其他"', async () => {
            const errorItemWithUnknownSubject = {
                ...mockErrorItem,
                subject: { id: 'unknown', name: '未知学科' },
            };
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(errorItemWithUnknownSubject);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: '题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: [],
            });

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await GENERATE_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.subject).toBe('其他');
        });

        it('应该处理没有关联学科的错题', async () => {
            const errorItemWithNoSubject = {
                ...mockErrorItem,
                subject: null,
            };
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(errorItemWithNoSubject);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: '题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: [],
            });

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await GENERATE_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.subject).toBe('其他');
        });

        it('应该处理 AI 服务错误', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(mockErrorItem);
            mocks.mockAIService.generateSimilarQuestion.mockRejectedValue(
                new Error('AI service unavailable')
            );

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await GENERATE_POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.message).toBe('AI service unavailable');
        });
    });

    describe('GET /api/practice/record (获取原题复习历史)', () => {
        it('应该返回当前用户自己的原题复习历史', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({ userId: 'user-123' });
            mocks.mockPrismaPracticeRecord.findMany.mockResolvedValue([
                {
                    id: 'review-1',
                    userId: 'user-123',
                    errorItemId: 'error-item-1',
                    practiceType: 'ORIGINAL_REVIEW',
                    rating: 3,
                    answerImageUrl: 'data:image/jpeg;base64,abc',
                    createdAt: new Date(),
                },
            ]);

            const request = new Request('http://localhost/api/practice/record?errorItemId=error-item-1');
            const response = await RECORD_GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toHaveLength(1);
            expect(data[0].practiceType).toBe('ORIGINAL_REVIEW');
            expect(data[0].answerImageUrl).toBe('data:image/jpeg;base64,abc');
        });

        it('应该拒绝查看其他用户的原题复习历史', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({ userId: 'other-user' });

            const request = new Request('http://localhost/api/practice/record?errorItemId=error-item-2');
            const response = await RECORD_GET(request);
            const data = await response.json();

            expect(response.status).toBe(403);
            expect(data.message).toBe("Cannot access another user's review history");
        });

        it('应该拒绝非法 errorItemId 的历史查询', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(null);

            const request = new Request('http://localhost/api/practice/record?errorItemId=not-found');
            const response = await RECORD_GET(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.message).toBe('Error item not found');
        });

        it('缺少 errorItemId 时应该返回 400', async () => {
            const request = new Request('http://localhost/api/practice/record');
            const response = await RECORD_GET(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.message).toBe('errorItemId is required');
        });

        it('应只返回 practiceType=ORIGINAL_REVIEW 的记录', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({ userId: 'user-123' });
            const originalReviewRecord = {
                id: 'review-original',
                userId: 'user-123',
                errorItemId: 'error-item-1',
                practiceType: 'ORIGINAL_REVIEW',
                rating: 3,
                createdAt: new Date(),
            };
            mocks.mockPrismaPracticeRecord.findMany.mockResolvedValue([originalReviewRecord]);

            const request = new Request('http://localhost/api/practice/record?errorItemId=error-item-1&practiceType=ORIGINAL_REVIEW');
            const response = await RECORD_GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toHaveLength(1);
            expect(data[0].practiceType).toBe('ORIGINAL_REVIEW');

            // Verify the query included practiceType filter
            const callArgs = mocks.mockPrismaPracticeRecord.findMany.mock.calls[0][0] as PrismaMockArgs;
            expect(callArgs.where).toHaveProperty('practiceType', 'ORIGINAL_REVIEW');
        });

        it('不传 practiceType 时应返回所有记录（向后兼容）', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({ userId: 'user-123' });
            const mixedRecords = [
                { id: 'r1', userId: 'user-123', errorItemId: 'error-item-1', practiceType: 'ORIGINAL_REVIEW', rating: 3, createdAt: new Date() },
                { id: 'r2', userId: 'user-123', errorItemId: 'error-item-1', practiceType: 'SIMILAR_QUESTION', isCorrect: true, createdAt: new Date() },
            ];
            mocks.mockPrismaPracticeRecord.findMany.mockResolvedValue(mixedRecords);

            const request = new Request('http://localhost/api/practice/record?errorItemId=error-item-1');
            const response = await RECORD_GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toHaveLength(2);

            // Verify no practiceType filter was applied
            const callArgs = mocks.mockPrismaPracticeRecord.findMany.mock.calls[0][0] as PrismaMockArgs;
            expect(callArgs.where).not.toHaveProperty('practiceType');
        });

        it('非法 practiceType 应返回 400', async () => {
            const request = new Request('http://localhost/api/practice/record?errorItemId=error-item-1&practiceType=INVALID');
            const response = await RECORD_GET(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.message).toContain('Invalid practiceType');
        });

        it('仍然应拒绝其他用户的 errorItemId（带 practiceType 参数）', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({ userId: 'other-user' });

            const request = new Request('http://localhost/api/practice/record?errorItemId=error-item-2&practiceType=ORIGINAL_REVIEW');
            const response = await RECORD_GET(request);
            const data = await response.json();

            expect(response.status).toBe(403);
            expect(data.message).toBe("Cannot access another user's review history");
        });
    });

    describe('POST /api/practice/record (记录练习结果)', () => {
        const mockOwnedErrorItem = {
            userId: 'user-123',
        };

        it('应该成功记录正确的练习结果', async () => {
            const createdRecord = {
                id: 'record-1',
                userId: 'user-123',
                subject: '数学',
                difficulty: 'medium',
                isCorrect: true,
                createdAt: new Date(),
            };
            mocks.mockPrismaPracticeRecord.create.mockResolvedValue(createdRecord);

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    subject: '数学',
                    difficulty: 'medium',
                    isCorrect: true,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.subject).toBe('数学');
            expect(data.isCorrect).toBe(true);
        });

        it('应该成功记录错误答案', async () => {
            const createdRecord = {
                id: 'record-2',
                userId: 'user-123',
                subject: '英语',
                difficulty: 'hard',
                isCorrect: false,
                createdAt: new Date(),
            };
            mocks.mockPrismaPracticeRecord.create.mockResolvedValue(createdRecord);

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    subject: '英语',
                    difficulty: 'hard',
                    isCorrect: false,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.isCorrect).toBe(false);
        });

        it('应该记录不同学科的练习结果', async () => {
            const subjects = ['数学', '物理', '化学', '英语', '语文'];

            for (const subject of subjects) {
                mocks.mockPrismaPracticeRecord.create.mockResolvedValue({
                    id: `record-${subject}`,
                    userId: 'user-123',
                    subject,
                    difficulty: 'medium',
                    isCorrect: true,
                });

                const request = new Request('http://localhost/api/practice/record', {
                    method: 'POST',
                    body: JSON.stringify({
                        subject,
                        difficulty: 'medium',
                        isCorrect: true,
                    }),
                    headers: { 'Content-Type': 'application/json' },
                });

                const response = await RECORD_POST(request);
                expect(response.status).toBe(200);
            }
        });

        it('应该拒绝未登录用户', async () => {
            vi.mocked(getServerSession).mockResolvedValue(null);

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    subject: '数学',
                    difficulty: 'medium',
                    isCorrect: true,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.message).toBe('Unauthorized');
        });

        it('应该拒绝 session 中没有 user 的请求', async () => {
            vi.mocked(getServerSession).mockResolvedValue({
                user: undefined,
                expires: '2025-12-31',
            } as unknown as import('next-auth').Session);

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    subject: '数学',
                    difficulty: 'medium',
                    isCorrect: true,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.message).toBe('Unauthorized');
        });

        it('应该处理数据库错误', async () => {
            mocks.mockPrismaPracticeRecord.create.mockRejectedValue(
                new Error('Database connection failed')
            );

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    subject: '数学',
                    difficulty: 'medium',
                    isCorrect: true,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.message).toBe('Failed to save record');
        });

        // === New tests for errorItemId tracking ===

        it('应该成功保存带有 errorItemId 的练习记录', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(mockOwnedErrorItem);
            const createdRecord = {
                id: 'record-ei-1',
                userId: 'user-123',
                subject: '数学',
                difficulty: 'medium',
                isCorrect: true,
                errorItemId: 'error-item-1',
                practiceType: 'SIMILAR_QUESTION',
                answerText: 'x = 5',
                createdAt: new Date(),
            };
            mocks.mockPrismaPracticeRecord.create.mockResolvedValue(createdRecord);

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    subject: '数学',
                    difficulty: 'medium',
                    isCorrect: true,
                    errorItemId: 'error-item-1',
                    practiceType: 'SIMILAR_QUESTION',
                    answerText: 'x = 5',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.errorItemId).toBe('error-item-1');
            expect(data.practiceType).toBe('SIMILAR_QUESTION');
            expect(data.answerText).toBe('x = 5');
        });

        it('保存的 PracticeRecord 应该包含 errorItemId 字段', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(mockOwnedErrorItem);
            mocks.mockPrismaPracticeRecord.create.mockImplementation(async (args: PrismaMockArgs) => ({
                id: 'record-check-1',
                ...args.data,
                createdAt: new Date(),
            }));

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    subject: '物理',
                    difficulty: 'hard',
                    isCorrect: false,
                    errorItemId: 'error-item-42',
                    practiceType: 'SIMILAR_QUESTION',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.errorItemId).toBe('error-item-42');
            expect(data.practiceType).toBe('SIMILAR_QUESTION');

            // Verify create was called with correct fields
            expect(mocks.mockPrismaPracticeRecord.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        errorItemId: 'error-item-42',
                        practiceType: 'SIMILAR_QUESTION',
                        rating: null,
                        durationSeconds: null,
                    }),
                })
            );
        });

        it('应该拒绝其他用户的 errorItemId', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({
                userId: 'other-user-999',
            });

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    subject: '数学',
                    difficulty: 'medium',
                    isCorrect: true,
                    errorItemId: 'other-user-item',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(403);
            expect(data.message).toBe("Cannot record practice for another user's error item");
        });

        it('应该返回 400 当 errorItemId 对应的错题不存在', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(null);

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    subject: '数学',
                    difficulty: 'medium',
                    isCorrect: true,
                    errorItemId: 'non-existent-item',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.message).toBe('Error item not found');
        });

        it('不传 errorItemId 的旧请求仍兼容', async () => {
            // No errorItem.findUnique should be called
            mocks.mockPrismaErrorItem.findUnique.mockReset();
            const createdRecord = {
                id: 'record-legacy',
                userId: 'user-123',
                subject: '数学',
                difficulty: 'easy',
                isCorrect: true,
                errorItemId: null,
                practiceType: 'SIMILAR_QUESTION',
                createdAt: new Date(),
            };
            mocks.mockPrismaPracticeRecord.create.mockResolvedValue(createdRecord);

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    subject: '数学',
                    difficulty: 'easy',
                    isCorrect: true,
                    // No errorItemId — legacy request
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.errorItemId).toBeNull();
            expect(data.practiceType).toBe('SIMILAR_QUESTION');
            // Should not have tried to look up an errorItem
            expect(mocks.mockPrismaErrorItem.findUnique).not.toHaveBeenCalled();
        });

        it('应该保存额外的可选字段 (rating, durationSeconds, usedHint, independent)', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(mockOwnedErrorItem);
            mocks.mockPrismaPracticeRecord.create.mockImplementation(async (args: PrismaMockArgs) => ({
                id: 'record-full',
                ...args.data,
                createdAt: new Date(),
            }));

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    subject: '数学',
                    difficulty: 'medium',
                    isCorrect: true,
                    errorItemId: 'error-item-1',
                    practiceType: 'SIMILAR_QUESTION',
                    rating: 4,
                    durationSeconds: 120,
                    usedHint: false,
                    independent: true,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.rating).toBe(4);
            expect(data.durationSeconds).toBe(120);
            expect(data.usedHint).toBe(false);
            expect(data.independent).toBe(true);
        });

        it('应该支持 ORIGINAL_REVIEW 并按 rating 映射 isCorrect=false', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({
                userId: 'user-123',
                subject: { name: '数学' },
            });
            mocks.mockPrismaPracticeRecord.create.mockImplementation(async (args: PrismaMockArgs) => ({
                id: 'review-record-1',
                ...args.data,
                createdAt: new Date(),
            }));

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-review',
                    practiceType: 'ORIGINAL_REVIEW',
                    rating: 2,
                    answerText: '我的作答',
                    durationSeconds: 95,
                    revealedAnswer: true,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.practiceType).toBe('ORIGINAL_REVIEW');
            expect(data.rating).toBe(2);
            expect(data.isCorrect).toBe(false);
            expect(data.subject).toBe('数学');
            expect(data.answerText).toBe('我的作答');
        });

        it('应该支持 ORIGINAL_REVIEW 并按 rating 映射 isCorrect=true', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({
                userId: 'user-123',
                subject: { name: '英语' },
            });
            mocks.mockPrismaPracticeRecord.create.mockImplementation(async (args: PrismaMockArgs) => ({
                id: 'review-record-2',
                ...args.data,
                createdAt: new Date(),
            }));

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-review-2',
                    practiceType: 'ORIGINAL_REVIEW',
                    rating: 4,
                    durationSeconds: 30,
                    revealedAnswer: true,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.isCorrect).toBe(true);
            expect(data.answerText).toBeNull();
        });

        it('ORIGINAL_REVIEW 允许 answerText 和 answerImageUrl 同时为空', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({
                userId: 'user-123',
                subject: { name: '物理' },
            });
            mocks.mockPrismaPracticeRecord.create.mockImplementation(async (args: PrismaMockArgs) => ({
                id: 'review-record-3',
                ...args.data,
                createdAt: new Date(),
            }));

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-review-3',
                    practiceType: 'ORIGINAL_REVIEW',
                    rating: 3,
                    durationSeconds: 0,
                    revealedAnswer: true,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.answerText).toBeNull();
            expect(data.answerImageUrl).toBeNull();
        });

        it('ORIGINAL_REVIEW 应该保存 answerImageUrl', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({
                userId: 'user-123',
                subject: { name: '化学' },
            });
            mocks.mockPrismaPracticeRecord.create.mockImplementation(async (args: PrismaMockArgs) => ({
                id: 'review-record-4',
                ...args.data,
                createdAt: new Date(),
            }));

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-review-4',
                    practiceType: 'ORIGINAL_REVIEW',
                    rating: 1,
                    durationSeconds: 180,
                    answerImageUrl: 'data:image/jpeg;base64,abc123',
                    revealedAnswer: true,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.answerImageUrl).toBe('data:image/jpeg;base64,abc123');
        });

        it('ORIGINAL_REVIEW 应该拒绝非法 rating', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({
                userId: 'user-123',
                subject: { name: '数学' },
            });

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-invalid-rating',
                    practiceType: 'ORIGINAL_REVIEW',
                    rating: 5,
                    durationSeconds: 60,
                    revealedAnswer: true,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.message).toBe('rating must be an integer between 1 and 4');
        });

        it('ORIGINAL_REVIEW 应该拒绝负数 durationSeconds', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({
                userId: 'user-123',
                subject: { name: '数学' },
            });

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-invalid-duration',
                    practiceType: 'ORIGINAL_REVIEW',
                    rating: 3,
                    durationSeconds: -1,
                    revealedAnswer: true,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.message).toBe('durationSeconds must be an integer between 0 and 86400');
        });

        it('ORIGINAL_REVIEW 未查看答案前不能提交评分', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({
                userId: 'user-123',
                subject: { name: '数学' },
            });

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-no-reveal',
                    practiceType: 'ORIGINAL_REVIEW',
                    rating: 3,
                    durationSeconds: 60,
                    revealedAnswer: false,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.message).toBe('Please reveal the answer before rating this review');
        });

        it('ORIGINAL_REVIEW 重复提交不应重复创建记录', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({
                userId: 'user-123',
                subject: { name: '数学' },
            });

            let existingRecord: Record<string, unknown> | null = null;
            mocks.mockPrismaPracticeRecord.findFirst.mockImplementation(async () => existingRecord);
            mocks.mockPrismaPracticeRecord.create.mockImplementation(async (args: PrismaMockArgs) => {
                existingRecord = {
                    id: 'review-record-dedup',
                    ...args.data,
                    createdAt: new Date(),
                };
                return existingRecord;
            });

            const requestBody = {
                errorItemId: 'error-item-dedup',
                practiceType: 'ORIGINAL_REVIEW',
                rating: 3,
                durationSeconds: 42,
                answerText: '同一份作答',
                answerImageUrl: 'data:image/jpeg;base64,same',
                revealedAnswer: true,
            };

            const firstResponse = await RECORD_POST(new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify(requestBody),
                headers: { 'Content-Type': 'application/json' },
            }));

            const secondResponse = await RECORD_POST(new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify(requestBody),
                headers: { 'Content-Type': 'application/json' },
            }));

            const firstData = await firstResponse.json();
            const secondData = await secondResponse.json();

            expect(firstResponse.status).toBe(200);
            expect(secondResponse.status).toBe(200);
            expect(firstData.id).toBe('review-record-dedup');
            expect(secondData.id).toBe('review-record-dedup');
            expect(mocks.mockPrismaPracticeRecord.create).toHaveBeenCalledTimes(1);
        });
    });
});
