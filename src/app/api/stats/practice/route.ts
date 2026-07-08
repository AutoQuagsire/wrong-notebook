import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { startOfMonth, subMonths, format } from "date-fns";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:stats:practice');

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }

    const userId = session.user.id;

    try {
        // 1. Subject Distribution — only current active subjects
        const activeSubjects = await prisma.subject.findMany({
            where: { userId },
            select: { id: true, name: true },
        });
        const activeSubjectNames = new Set(activeSubjects.map(s => s.name));

        const rawSubjectStats = await prisma.practiceRecord.groupBy({
            by: ['subject'],
            where: { userId },
            _count: { id: true },
        });

        const subjectStats = rawSubjectStats
            .filter(s => s.subject && activeSubjectNames.has(s.subject))
            .map(s => ({ name: s.subject!, value: s._count.id }));

        // 2. Monthly Activity (Last 6 months)
        const sixMonthsAgo = subMonths(new Date(), 5);
        const activityStats = await prisma.practiceRecord.findMany({
            where: {
                userId,
                createdAt: {
                    gte: startOfMonth(sixMonthsAgo)
                }
            },
            select: {
                createdAt: true,
                isCorrect: true,
                difficulty: true
            }
        });

        // Process activity stats into monthly counts
        const monthlyActivity: Record<string, { total: number, correct: number, [key: string]: number }> = {};

        // Initialize last 6 months
        for (let i = 5; i >= 0; i--) {
            const date = subMonths(new Date(), i);
            const key = format(date, 'yyyy-MM');
            monthlyActivity[key] = { total: 0, correct: 0 };
        }

        activityStats.forEach(record => {
            const date = format(record.createdAt, 'yyyy-MM');
            if (monthlyActivity[date]) {
                monthlyActivity[date].total++;
                if (record.isCorrect) {
                    monthlyActivity[date].correct++;
                }

                const difficulty = record.difficulty || 'Unknown';
                monthlyActivity[date][difficulty] = (monthlyActivity[date][difficulty] || 0) + 1;
            }
        });

        const chartData = Object.entries(monthlyActivity).map(([date, stats]) => ({
            date,
            ...stats
        })).sort((a, b) => a.date.localeCompare(b.date));

        // 3. Difficulty Distribution
        const difficultyStats = await prisma.practiceRecord.groupBy({
            by: ['difficulty'],
            where: { userId },
            _count: {
                id: true
            }
        });

        // 4. Overall Correctness — only records with explicit boolean isCorrect
        const correctableRecords = await prisma.practiceRecord.count({
            where: { userId, isCorrect: { not: null } },
        });
        const correctRecords = await prisma.practiceRecord.count({
            where: { userId, isCorrect: true },
        });

        return NextResponse.json({
            subjectStats,
            activityStats: chartData,
            difficultyStats: difficultyStats.map(s => ({ name: s.difficulty || 'Unknown', value: s._count.id })),
            overallStats: {
                total: correctableRecords,
                correct: correctRecords,
                rate: correctableRecords > 0 ? (correctRecords / correctableRecords * 100).toFixed(1) : 0
            }
        });

    } catch (error) {
        logger.error({ error }, 'Error fetching practice stats');
        return internalError("Failed to fetch stats");
    }
}
