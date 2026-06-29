/**
 * 题型分类常量和工具。
 *
 * 推荐枚举值：
 * - CHOICE      选择题
 * - FILL_BLANK  填空题
 * - CALCULATION 计算题
 * - PROOF       证明题
 * - OTHER       其他（无法归类、默认值）
 */

export const VALID_QUESTION_TYPES = [
    "CHOICE",
    "FILL_BLANK",
    "CALCULATION",
    "PROOF",
    "OTHER",
] as const;

export type QuestionType = (typeof VALID_QUESTION_TYPES)[number];

/** 题型中文显示名 */
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
    CHOICE: "选择题",
    FILL_BLANK: "填空题",
    CALCULATION: "计算题",
    PROOF: "证明题",
    OTHER: "其他",
};

/** 校验并规范化 questionType，非法值回退 OTHER */
export function normalizeQuestionType(raw: unknown): QuestionType {
    if (typeof raw === "string" && (VALID_QUESTION_TYPES as readonly string[]).includes(raw)) {
        return raw as QuestionType;
    }
    return "OTHER";
}
