/**
 * Import/Export round-trip 测试 — PracticeRecord 新字段
 * 验证 errorItemId、practiceType、rating 等字段在导入导出的完整往返中不丢失
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type PrismaMockArgs = { data: Record<string, unknown>; where?: Record<string, unknown> };

const mocks = vi.hoisted(() => ({
    mockUser: {
        id: 'user-roundtrip',
        email: 'roundtrip@example.com',
        name: 'Roundtrip User',
        educationStage: 'junior_high',
        enrollmentYear: 2024,
        role: 'user',
    },
    mockSession: {
        user: {
            id: 'user-roundtrip',
            email: 'roundtrip@example.com',
            name: 'Roundtrip User',
            role: 'user',
        },
        expires: '2025-12-31',
    },
    mockPrismaPracticeRecord: {
        findMany: vi.fn(),
        create: vi.fn(),
    },
    mockPrismaSubject: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
    },
    mockPrismaUser: {
        findUnique: vi.fn(),
    },
    mockPrismaKnowledgeTag: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
    },
    mockPrismaErrorItem: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
    },
    mockPrismaReviewSchedule: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
    },
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        user: mocks.mockPrismaUser,
        practiceRecord: mocks.mockPrismaPracticeRecord,
        subject: mocks.mockPrismaSubject,
        knowledgeTag: mocks.mockPrismaKnowledgeTag,
        errorItem: mocks.mockPrismaErrorItem,
        reviewSchedule: mocks.mockPrismaReviewSchedule,
        $transaction: vi.fn((fn: (tx: Record<string, unknown>) => unknown) => fn({
            subject: mocks.mockPrismaSubject,
            knowledgeTag: mocks.mockPrismaKnowledgeTag,
            errorItem: mocks.mockPrismaErrorItem,
            reviewSchedule: mocks.mockPrismaReviewSchedule,
            practiceRecord: mocks.mockPrismaPracticeRecord,
        })),
    },
}));

vi.mock('next-auth', () => ({
    getServerSession: vi.fn(() => Promise.resolve(mocks.mockSession)),
}));

vi.mock('@/lib/auth', () => ({
    authOptions: {},
}));

import { GET as EXPORT_GET } from '@/app/api/export/route';
import { POST as IMPORT_POST } from '@/app/api/import/route';

describe('Import/Export round-trip — PracticeRecord 新字段', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.mockPrismaUser.findUnique.mockResolvedValue(mocks.mockUser);
        mocks.mockPrismaSubject.findMany.mockResolvedValue([]);
        mocks.mockPrismaKnowledgeTag.findMany.mockResolvedValue([]);
        mocks.mockPrismaErrorItem.findMany.mockResolvedValue([]);
        mocks.mockPrismaReviewSchedule.findMany.mockResolvedValue([]);
        mocks.mockPrismaKnowledgeTag.findFirst.mockResolvedValue(null);
        mocks.mockPrismaErrorItem.findFirst.mockResolvedValue(null);
        // Default: errorItem.create returns the created item with id
        mocks.mockPrismaErrorItem.create.mockImplementation(async (args: PrismaMockArgs) => ({
            id: args.data.id || 'created-error-' + Date.now(),
            ...args.data,
        }));
        mocks.mockPrismaErrorItem.update.mockImplementation(async (args: PrismaMockArgs) => ({
            id: args.where!.id,
            ...args.data,
        }));
    });

    const fullPracticeRecord = {
        id: 'record-full',
        userId: 'user-roundtrip',
        subject: '物理',
        difficulty: 'hard',
        isCorrect: false,
        errorItemId: 'error-item-abc',
        practiceType: 'SIMILAR_QUESTION',
        rating: 3,
        durationSeconds: 85,
        usedHint: true,
        independent: false,
        answerText: 'F = ma = 10',
        answerImageUrl: 'data:image/jpeg;base64,answer-photo',
        createdAt: new Date('2025-06-15T10:30:00Z'),
    };

    describe('GET /api/export (导出包含新字段)', () => {
        it('导出应包含 errorItemId、practiceType 等新字段', async () => {
            mocks.mockPrismaPracticeRecord.findMany.mockResolvedValue([fullPracticeRecord]);

            const request = new Request('http://localhost/api/export');
            const response = await EXPORT_GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            const exported = data.practiceRecords[0];
            expect(exported.errorItemId).toBe('error-item-abc');
            expect(exported.practiceType).toBe('SIMILAR_QUESTION');
            expect(exported.rating).toBe(3);
            expect(exported.durationSeconds).toBe(85);
            expect(exported.usedHint).toBe(true);
            expect(exported.independent).toBe(false);
            expect(exported.answerText).toBe('F = ma = 10');
            expect(exported.answerImageUrl).toBe('data:image/jpeg;base64,answer-photo');
        });

        it('导出应包含旧记录（errorItemId 为 null）', async () => {
            const legacyRecord = {
                id: 'record-legacy',
                userId: 'user-roundtrip',
                subject: '数学',
                difficulty: 'easy',
                isCorrect: true,
                errorItemId: null,
                practiceType: 'SIMILAR_QUESTION',
                rating: null,
                durationSeconds: null,
                usedHint: null,
                independent: null,
                answerText: null,
                answerImageUrl: null,
                createdAt: new Date('2025-01-01T00:00:00Z'),
            };
            mocks.mockPrismaPracticeRecord.findMany.mockResolvedValue([legacyRecord]);

            const request = new Request('http://localhost/api/export');
            const response = await EXPORT_GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            const exported = data.practiceRecords[0];
            expect(exported.errorItemId).toBeNull();
            expect(exported.practiceType).toBe('SIMILAR_QUESTION');
            expect(exported.answerImageUrl).toBeNull();
        });
    });

    describe('POST /api/import (导入处理新字段)', () => {
        it('导入应保留所有新字段', async () => {
            mocks.mockPrismaPracticeRecord.create.mockImplementation(async (args: PrismaMockArgs) => ({
                id: 'imported-record-1',
                ...args.data,
                createdAt: new Date(),
            }));

            const exportPayload = {
                version: 1,
                exportedAt: '2025-06-15T10:30:00Z',
                user: {
                    id: 'user-roundtrip',
                    email: 'roundtrip@example.com',
                    name: 'Roundtrip User',
                    educationStage: 'junior_high',
                    enrollmentYear: 2024,
                    role: 'user',
                },
                subjects: [],
                customTags: [],
                errorItems: [
                    {
                        id: 'error-item-abc',
                        userId: 'user-roundtrip',
                        subjectId: null,
                        originalImageUrl: 'data:image/png;base64,test',
                        ocrText: null,
                        questionText: 'test question',
                        answerText: 'test answer',
                        analysis: 'test analysis',
                        wrongAnswerText: null,
                        mistakeAnalysis: null,
                        mistakeStatus: null,
                        knowledgePoints: '[]',
                        source: null,
                        errorType: null,
                        userNotes: null,
                        masteryLevel: 0,
                        gradeSemester: null,
                        paperLevel: null,
                        createdAt: '2025-06-15T10:00:00Z',
                        updatedAt: '2025-06-15T10:00:00Z',
                        tags: [],
                    },
                ],
                reviewSchedules: [],
                practiceRecords: [
                    {
                        id: 'record-to-import',
                        userId: 'user-roundtrip',
                        subject: '物理',
                        difficulty: 'hard',
                        isCorrect: false,
                        errorItemId: 'error-item-abc',
                        practiceType: 'SIMILAR_QUESTION',
                        rating: 3,
                        durationSeconds: 85,
                        usedHint: true,
                        independent: false,
                        answerText: 'F = ma = 10',
                        answerImageUrl: 'data:image/jpeg;base64,answer-photo',
                        createdAt: '2025-06-15T10:30:00Z',
                    },
                ],
            };

            const request = new Request('http://localhost/api/import', {
                method: 'POST',
                body: JSON.stringify(exportPayload),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await IMPORT_POST(request);
            const result = await response.json();

            expect(response.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.stats.practiceRecordsCreated).toBe(1);

            // errorItemId gets mapped through errorItemIdMap (old → new ID from error item creation)
            // Verify it was set to a non-null value (the mapped ID)
            const createCallArgs = mocks.mockPrismaPracticeRecord.create.mock.calls[0][0] as PrismaMockArgs;
            expect(createCallArgs.data.errorItemId).toBeTruthy();
            expect(createCallArgs.data.errorItemId).not.toBe('error-item-abc'); // mapped to new ID
            expect(createCallArgs.data.practiceType).toBe('SIMILAR_QUESTION');
            expect(createCallArgs.data.rating).toBe(3);
            expect(createCallArgs.data.durationSeconds).toBe(85);
            expect(createCallArgs.data.usedHint).toBe(true);
            expect(createCallArgs.data.independent).toBe(false);
            expect(createCallArgs.data.answerText).toBe('F = ma = 10');
            expect(createCallArgs.data.answerImageUrl).toBe('data:image/jpeg;base64,answer-photo');
        });

        it('导入旧格式（无新字段）应有效', async () => {
            mocks.mockPrismaPracticeRecord.create.mockImplementation(async (args: PrismaMockArgs) => ({
                id: 'imported-legacy',
                ...args.data,
                createdAt: new Date(),
            }));

            const legacyExportPayload = {
                version: 1,
                exportedAt: '2025-01-01T00:00:00Z',
                user: {
                    id: 'user-roundtrip',
                    email: 'roundtrip@example.com',
                    name: 'Roundtrip User',
                    educationStage: 'junior_high',
                    enrollmentYear: 2024,
                    role: 'user',
                },
                subjects: [],
                customTags: [],
                errorItems: [],
                reviewSchedules: [],
                practiceRecords: [
                    {
                        id: 'record-old',
                        userId: 'user-roundtrip',
                        subject: '英语',
                        difficulty: 'medium',
                        isCorrect: true,
                        createdAt: '2025-01-01T00:00:00Z',
                        // 无 errorItemId、practiceType 等新字段
                    },
                ],
            };

            const request = new Request('http://localhost/api/import', {
                method: 'POST',
                body: JSON.stringify(legacyExportPayload),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await IMPORT_POST(request);
            const result = await response.json();

            expect(response.status).toBe(200);
            expect(result.success).toBe(true);
            expect(result.stats.practiceRecordsCreated).toBe(1);

            expect(mocks.mockPrismaPracticeRecord.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        practiceType: 'SIMILAR_QUESTION', // default applied
                        errorItemId: null,
                        rating: null,
                        durationSeconds: null,
                        usedHint: null,
                        independent: null,
                        answerText: null,
                        answerImageUrl: null,
                    }),
                })
            );
        });

        it('不应导入关联到其他用户错题的 errorItemId', async () => {
            // Import payload has errorItemId pointing to other user's item
            // findFirst checks ownership — returns null if not owned by target user
            // So the errorItemId should be dropped (set to null)

            mocks.mockPrismaErrorItem.findFirst.mockResolvedValue(null); // not found for this user
            mocks.mockPrismaPracticeRecord.create.mockImplementation(async (args: PrismaMockArgs) => ({
                id: 'imported-stripped',
                ...args.data,
                createdAt: new Date(),
            }));

            const payload = {
                version: 1,
                exportedAt: '2025-06-15T10:30:00Z',
                user: {
                    id: 'user-roundtrip',
                    email: 'roundtrip@example.com',
                    name: 'Roundtrip User',
                    educationStage: 'junior_high',
                    enrollmentYear: 2024,
                    role: 'user',
                },
                subjects: [],
                customTags: [],
                errorItems: [],
                reviewSchedules: [],
                practiceRecords: [
                    {
                        id: 'record-stolen',
                        userId: 'user-roundtrip',
                        subject: '数学',
                        difficulty: 'easy',
                        isCorrect: true,
                        errorItemId: 'other-users-error-item',
                        practiceType: 'SIMILAR_QUESTION',
                        createdAt: '2025-06-15T10:30:00Z',
                    },
                ],
            };

            const request = new Request('http://localhost/api/import', {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'application/json' },
            });

            await IMPORT_POST(request);

            // errorItemId should be null because the error item doesn't belong to this user
            expect(mocks.mockPrismaPracticeRecord.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        errorItemId: null,
                    }),
                })
            );
        });
    });

    describe('round-trip: export → import (完整往返)', () => {
        it('所有新字段应存活于 export → import 往返过程', async () => {
            // Step 1: Export — mock practiceRecords with all new fields
            mocks.mockPrismaPracticeRecord.findMany.mockResolvedValue([fullPracticeRecord]);

            const exportRequest = new Request('http://localhost/api/export');
            const exportResponse = await EXPORT_GET(exportRequest);
            const exportedData = await exportResponse.json();

            // Step 2: Verify export contains all fields
            const exported = exportedData.practiceRecords[0];
            expect(exported.errorItemId).toBe('error-item-abc');
            expect(exported.practiceType).toBe('SIMILAR_QUESTION');
            expect(exported.rating).toBe(3);
            expect(exported.durationSeconds).toBe(85);
            expect(exported.usedHint).toBe(true);
            expect(exported.independent).toBe(false);
            expect(exported.answerText).toBe('F = ma = 10');
            expect(exported.answerImageUrl).toBe('data:image/jpeg;base64,answer-photo');

            // Step 3: Import the exported data
            mocks.mockPrismaPracticeRecord.findMany.mockReset();
            mocks.mockPrismaPracticeRecord.create.mockImplementation(async (args: PrismaMockArgs) => ({
                id: 'roundtrip-final',
                ...args.data,
                createdAt: new Date(),
            }));

            // Add an errorItem that matches the export so the import can link it
            mocks.mockPrismaErrorItem.findFirst.mockResolvedValue({ id: 'error-item-abc' });

            const importRequest = new Request('http://localhost/api/import', {
                method: 'POST',
                body: JSON.stringify(exportedData),
                headers: { 'Content-Type': 'application/json' },
            });

            const importResponse = await IMPORT_POST(importRequest);
            const importResult = await importResponse.json();

            expect(importResponse.status).toBe(200);
            expect(importResult.success).toBe(true);

            // Step 4: Verify import preserved all fields
            expect(mocks.mockPrismaPracticeRecord.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        subject: '物理',
                        difficulty: 'hard',
                        isCorrect: false,
                        errorItemId: 'error-item-abc',
                        practiceType: 'SIMILAR_QUESTION',
                        rating: 3,
                        durationSeconds: 85,
                        usedHint: true,
                        independent: false,
                        answerText: 'F = ma = 10',
                        answerImageUrl: 'data:image/jpeg;base64,answer-photo',
                    }),
                })
            );
        });
    });

    describe('Normal user import with different source userId', () => {
        const differentUserPayload = {
            version: 1,
            exportedAt: '2025-06-15T10:30:00Z',
            user: {
                id: 'user-source',
                email: 'source@example.com',
                name: 'Source User',
                educationStage: 'junior_high',
                enrollmentYear: 2024,
                role: 'user',
            },
            subjects: [
                {
                    id: 'subj-old-1',
                    name: '数学',
                    userId: 'user-source',
                    createdAt: '2025-06-15T10:00:00Z',
                    updatedAt: '2025-06-15T10:00:00Z',
                },
            ],
            customTags: [],
            errorItems: [
                {
                    id: 'err-old-1',
                    userId: 'user-source',
                    subjectId: 'subj-old-1',
                    originalImageUrl: 'data:image/png;base64,test',
                    ocrText: null,
                    questionText: 'test question from another user',
                    answerText: 'test answer',
                    analysis: 'test analysis',
                    wrongAnswerText: null,
                    mistakeAnalysis: null,
                    mistakeStatus: null,
                    knowledgePoints: '[]',
                    source: null,
                    errorType: null,
                    userNotes: null,
                    masteryLevel: 0,
                    gradeSemester: null,
                    paperLevel: null,
                    createdAt: '2025-06-15T10:00:00Z',
                    updatedAt: '2025-06-15T10:00:00Z',
                    tags: [],
                },
            ],
            reviewSchedules: [],
            practiceRecords: [],
        };

        beforeEach(() => {
            vi.clearAllMocks();
            mocks.mockPrismaUser.findUnique.mockResolvedValue(mocks.mockUser); // session user is user-roundtrip
            mocks.mockPrismaSubject.findMany.mockResolvedValue([]);
            mocks.mockPrismaKnowledgeTag.findMany.mockResolvedValue([]);
            mocks.mockPrismaErrorItem.findMany.mockResolvedValue([]);
            mocks.mockPrismaReviewSchedule.findMany.mockResolvedValue([]);
            mocks.mockPrismaKnowledgeTag.findFirst.mockResolvedValue(null);
            mocks.mockPrismaErrorItem.findFirst.mockResolvedValue(null);
            mocks.mockPrismaSubject.findFirst = vi.fn().mockResolvedValue(null);
            mocks.mockPrismaErrorItem.create.mockImplementation(async (args: PrismaMockArgs) => ({
                id: 'created-err-' + Date.now(),
                ...args.data,
            }));
            mocks.mockPrismaErrorItem.update.mockImplementation(async (args: PrismaMockArgs) => ({
                id: args.where!.id,
                ...args.data,
            }));
            mocks.mockPrismaSubject.create = vi.fn().mockImplementation(async (args: PrismaMockArgs) => ({
                id: 'created-subj-' + Date.now(),
                ...args.data,
            }));
            mocks.mockPrismaReviewSchedule.findFirst = vi.fn().mockResolvedValue(null);
            mocks.mockPrismaReviewSchedule.create = vi.fn().mockImplementation(async (args: PrismaMockArgs) => ({
                id: 'created-sched-' + Date.now(),
                ...args.data,
            }));
            mocks.mockPrismaPracticeRecord.create = vi.fn().mockImplementation(async (args: PrismaMockArgs) => ({
                id: 'created-rec-' + Date.now(),
                ...args.data,
            }));
        });

        afterEach(() => {
            vi.clearAllMocks();
        });

        it('should accept import from a different source user and assign data to current user', async () => {
            const request = new Request('http://localhost/api/import', {
                method: 'POST',
                body: JSON.stringify(differentUserPayload),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await IMPORT_POST(request);
            const result = await response.json();

            expect(response.status).toBe(200);
            expect(result.success).toBe(true);

            // The subject should be created with current user ID, not source user ID
            const subjectCreateCalls = mocks.mockPrismaSubject.create.mock?.calls || [];
            if (subjectCreateCalls.length > 0) {
                const subjectData = (subjectCreateCalls[0][0] as PrismaMockArgs).data;
                expect(subjectData.userId).toBe('user-roundtrip'); // current session user
                expect(subjectData.userId).not.toBe('user-source');
            }

            // Error item should be created with current user ID
            expect(mocks.mockPrismaErrorItem.create).toHaveBeenCalled();
            const errorItemCall = (mocks.mockPrismaErrorItem.create.mock.calls[0][0] as PrismaMockArgs).data;
            expect(errorItemCall.userId).toBe('user-roundtrip');
            expect(errorItemCall.userId).not.toBe('user-source');
        });

        it('should default questionType to OTHER when missing in import data', async () => {
            const noTypePayload = {
                ...differentUserPayload,
                errorItems: [
                    {
                        ...differentUserPayload.errorItems[0],
                        // no questionType field
                    },
                ],
            };

            const request = new Request('http://localhost/api/import', {
                method: 'POST',
                body: JSON.stringify(noTypePayload),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await IMPORT_POST(request);
            const result = await response.json();

            expect(response.status).toBe(200);
            expect(result.success).toBe(true);
            expect(mocks.mockPrismaErrorItem.create).toHaveBeenCalled();
            const createData = (mocks.mockPrismaErrorItem.create.mock.calls[0][0] as PrismaMockArgs).data;
            expect(createData.questionType).toBe('OTHER');
        });

        it('should still reject import with missing version', async () => {
            const invalidPayload = { user: { email: 'x@x.com' }, errorItems: [] };

            const request = new Request('http://localhost/api/import', {
                method: 'POST',
                body: JSON.stringify(invalidPayload),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await IMPORT_POST(request);
            expect(response.status).toBe(400);
        });

        it('normal user should not bypass importAll mode', async () => {
            const request = new Request('http://localhost/api/import?all=true', {
                method: 'POST',
                body: JSON.stringify(differentUserPayload),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await IMPORT_POST(request);
            expect(response.status).toBe(403);
        });
    });
});
