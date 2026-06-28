import type { ReanswerQuestionResult } from "./types";
import { extractXmlTag, extractXmlTagRaw, parseKnowledgePoints } from "./xml-utils";
import { normalizeMistakeStatusForSave } from "../mistake-status";

/**
 * Parse LLM raw XML response into a ReanswerQuestionResult.
 *
 * This function is equivalent to the inline parsing logic that was
 * duplicated across all three providers (OpenAI, Azure, Gemini).
 *
 * Required tags: answer_text, analysis
 * Optional tags: knowledge_points, wrong_answer_text, mistake_analysis, mistake_status
 *
 * Behaviour preserved:
 * - Missing required tags → empty string (not an error; providers never validated here)
 * - Missing optional tags → empty string / empty array
 * - knowledge_points is comma/newline split and trimmed
 * - mistake_status is normalized via normalizeMistakeStatusForSave
 */
export function parseReanswerXmlResponse(content: string): ReanswerQuestionResult {
    const answerText = extractXmlTag(content, "answer_text");
    const analysis = extractXmlTag(content, "analysis");
    const knowledgePointsRaw = extractXmlTag(content, "knowledge_points");
    const knowledgePoints = parseKnowledgePoints(knowledgePointsRaw);
    const wrongAnswerText = extractXmlTag(content, "wrong_answer_text");
    const mistakeAnalysis = extractXmlTag(content, "mistake_analysis");
    const mistakeStatusRaw = extractXmlTagRaw(content, "mistake_status");
    const mistakeStatus = normalizeMistakeStatusForSave(mistakeStatusRaw, wrongAnswerText);

    return { answerText, analysis, knowledgePoints, wrongAnswerText, mistakeAnalysis, mistakeStatus };
}
