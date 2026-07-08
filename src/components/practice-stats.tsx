"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";
import { Loader2, TrendingUp, BookOpen, Target } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { PracticeStatsData } from "@/types/api";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];
const DIFFICULTY_COLORS: Record<string, string> = {
    'easy': '#4ade80',   // Green-400
    'medium': '#facc15', // Yellow-400
    'hard': '#fb923c',   // Orange-400
    'harder': '#f87171', // Red-400
    'Unknown': '#94a3b8' // Slate-400
};

const CustomTooltip = ({ active, payload, label, t }: {
    active?: boolean;
    payload?: { name: string; value: number; color: string }[];
    label?: string;
    t: { stats?: { total?: string } };
}) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
                <p className="font-medium mb-2">{label}</p>
                {payload.map((entry, index: number) => (
                    <div key={index} className="flex items-center gap-2 mb-1 last:mb-0">
                        <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-muted-foreground">
                            {entry.name}:
                        </span>
                        <span className="font-medium">
                            {entry.value}
                        </span>
                    </div>
                ))}
                <div className="mt-2 pt-2 border-t flex justify-between gap-4">
                    <span className="text-muted-foreground">{t.stats?.total || "Total"}:</span>
                    <span className="font-bold">
                        {payload.reduce((acc: number, curr) => acc + (typeof curr.value === 'number' ? curr.value : 0), 0)}
                    </span>
                </div>
            </div>
        );
    }
    return null;
};

export function PracticeStats() {
    const { t, language } = useLanguage();
    const [stats, setStats] = useState<PracticeStatsData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        apiClient.get<PracticeStatsData>("/api/stats/practice")
            .then(data => {
                setStats(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch stats:", err);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
                <p className="text-muted-foreground">练习统计加载失败，请稍后重试</p>
            </div>
        );
    }

    const subjectStats = stats?.subjectStats ?? [];
    const activityStats = stats?.activityStats ?? [];
    const difficultyStats = stats?.difficultyStats ?? [];
    const overallStats = stats?.overallStats ?? { total: 0, correct: 0, rate: "0.0" };

    const hasActivityData = activityStats.length > 0;
    const hasSubjectData = subjectStats.length > 0;
    const hasDifficultyData = difficultyStats.length > 0;
    const hasCorrectnessData = overallStats.total > 0;
    const hasAnyStatsData = hasActivityData || hasSubjectData || hasDifficultyData || hasCorrectnessData;

    if (!hasAnyStatsData) {
        return (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
                <p className="text-muted-foreground">暂无练习统计数据</p>
                <p className="text-sm text-muted-foreground">完成原题复习或相似题练习后会在这里展示统计</p>
            </div>
        );
    }

    // Helper to translate difficulty
    const getDifficultyLabel = (key: string) => {
        // @ts-expect-error — translation object has dynamic nested keys
        return t.practice?.difficulty?.[key] || key;
    };

    // Get unique difficulties for the bar chart
    const difficulties = stats.difficultyStats.map(d => d.name);

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight">{t.stats?.title || "Practice Statistics"}</h2>

            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {t.stats?.totalPractices || "Total Practiced"}
                        </CardTitle>
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{overallStats.total}</div>
                    </CardContent>
                </Card>
            {hasCorrectnessData ? (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            相似题正确率
                        </CardTitle>
                        <Target className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{Number(overallStats.rate).toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground">
                            {overallStats.correct} / {overallStats.total} 题正确
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">相似题正确率</CardTitle>
                        <Target className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-muted-foreground">—</div>
                        <p className="text-xs text-muted-foreground">暂无相似题正确率数据</p>
                    </CardContent>
                </Card>
            )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {hasSubjectData ? (
                <Card className="col-span-2 md:col-span-1">
                    <CardHeader>
                        <CardTitle>{t.stats?.subjectDistribution || "Subject Distribution"}</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={subjectStats}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    paddingAngle={5}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                                >
                                    {subjectStats.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            ) : (
                <Card className="col-span-2 md:col-span-1">
                    <CardHeader>
                        <CardTitle>{t.stats?.subjectDistribution || "Subject Distribution"}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center h-[300px] text-muted-foreground">
                        <p>暂无学科分布数据</p>
                    </CardContent>
                </Card>
            )}

                {hasActivityData ? (
                <Card className="col-span-2 md:col-span-1">
                    <CardHeader>
                        <CardTitle>{t.stats?.weeklyTrend || "Monthly Trend"}</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={activityStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#6b7280', fontSize: 12 }}
                                    dy={10}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#6b7280', fontSize: 12 }}
                                />
                                <Tooltip content={<CustomTooltip t={t} />} cursor={{ fill: 'transparent' }} />
                                <Legend
                                    iconType="circle"
                                    iconSize={8}
                                    wrapperStyle={{ paddingTop: '20px' }}
                                />
                                {difficulties.map((diff, index) => (
                                    <Bar
                                        key={diff}
                                        dataKey={diff}
                                        name={getDifficultyLabel(diff)}
                                        stackId="a"
                                        fill={DIFFICULTY_COLORS[diff] || COLORS[index % COLORS.length]}
                                        radius={index === difficulties.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                        barSize={32}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            ) : (
                <Card className="col-span-2 md:col-span-1">
                    <CardHeader>
                        <CardTitle>{t.stats?.weeklyTrend || "Monthly Trend"}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center h-[300px] text-muted-foreground">
                        <p>暂无练习活动数据</p>
                    </CardContent>
                </Card>
            )}
            </div>
        </div>
    );
}
