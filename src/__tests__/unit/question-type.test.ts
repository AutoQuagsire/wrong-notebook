import { describe, expect, it } from 'vitest';
import {
    VALID_QUESTION_TYPES,
    QUESTION_TYPE_LABELS,
    normalizeQuestionType,
    type QuestionType,
} from '@/lib/question-type';

describe('question-type', () => {
    describe('VALID_QUESTION_TYPES', () => {
        it('should contain all five types', () => {
            expect(VALID_QUESTION_TYPES).toEqual([
                "CHOICE",
                "FILL_BLANK",
                "CALCULATION",
                "PROOF",
                "OTHER",
            ]);
        });
    });

    describe('QUESTION_TYPE_LABELS', () => {
        it('should have Chinese labels for all types', () => {
            expect(QUESTION_TYPE_LABELS["CHOICE"]).toBe("选择题");
            expect(QUESTION_TYPE_LABELS["FILL_BLANK"]).toBe("填空题");
            expect(QUESTION_TYPE_LABELS["CALCULATION"]).toBe("计算题");
            expect(QUESTION_TYPE_LABELS["PROOF"]).toBe("证明题");
            expect(QUESTION_TYPE_LABELS["OTHER"]).toBe("其他");
        });

        it('should have a label for every valid type', () => {
            for (const qt of VALID_QUESTION_TYPES) {
                expect(QUESTION_TYPE_LABELS[qt]).toBeDefined();
                expect(typeof QUESTION_TYPE_LABELS[qt]).toBe("string");
            }
        });
    });

    describe('normalizeQuestionType', () => {
        it('should accept all valid types', () => {
            expect(normalizeQuestionType("CHOICE")).toBe("CHOICE");
            expect(normalizeQuestionType("FILL_BLANK")).toBe("FILL_BLANK");
            expect(normalizeQuestionType("CALCULATION")).toBe("CALCULATION");
            expect(normalizeQuestionType("PROOF")).toBe("PROOF");
            expect(normalizeQuestionType("OTHER")).toBe("OTHER");
        });

        it('should fallback to OTHER for invalid values', () => {
            expect(normalizeQuestionType("INVALID")).toBe("OTHER");
            expect(normalizeQuestionType("")).toBe("OTHER");
            expect(normalizeQuestionType(undefined)).toBe("OTHER");
            expect(normalizeQuestionType(null)).toBe("OTHER");
            expect(normalizeQuestionType(123)).toBe("OTHER");
            expect(normalizeQuestionType({})).toBe("OTHER");
        });

        it('should handle lowercase (reject and fallback, per current behavior)', () => {
            // current behavior: lowercase is not in VALID_QUESTION_TYPES list
            expect(normalizeQuestionType("choice")).toBe("OTHER");
        });
    });
});
