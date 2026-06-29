/**
 * Shared normalizer: maps a ReanswerQuestionResult to a ParsedQuestion shape
 * suitable for use by CorrectionEditor and other frontend consumers.
 *
 * This replaces the duplicated inline mapping in:
 * - src/app/page.tsx          (handleTextSubmit)
 * - src/app/notebooks/[id]/add/page.tsx (handleTextSubmit)
 * - src/components/correction-editor.tsx (handleReanswer, partial)
 */

import type { ReanswerQuestionResult } from "./ai/types";
import type { ParsedQuestion } from "./ai";

/**
 * Convert a ReanswerQuestionResult into a ParsedQuestion that can be
 * consumed by the Review step (ParsedDisplay / CorrectionEditor).
 *
 * The caller provides the original questionText and (optionally)
 * overrides for properties that the reanswer API doesn't return.
 */
export function normalizeReanswerToParsedQuestion(
    result: ReanswerQuestionResult,
    options: {
        questionText: string;
        subject?: ParsedQuestion["subject"];
        requiresImage?: boolean;
    }
): ParsedQuestion {
    return {
        questionText: options.questionText,
        answerText: result.answerText,
        analysis: result.analysis,
        knowledgePoints: result.knowledgePoints,
        wrongAnswerText: result.wrongAnswerText || "",
        mistakeAnalysis: result.mistakeAnalysis || "",
        mistakeStatus: result.mistakeStatus,
        subject: options.subject || "其他",
        requiresImage: options.requiresImage ?? false,
        questionType: "OTHER" as const, // reanswer doesn't provide questionType
    };
}
