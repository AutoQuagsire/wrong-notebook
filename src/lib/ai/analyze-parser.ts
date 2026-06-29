/**
 * Client-safe XML parser for image analysis responses.
 *
 * Parses the LLM raw XML output from the analyze-image prompt into a
 * ParsedQuestion shape compatible with the homepage review step.
 *
 * Required tags: question_text, answer_text, analysis
 * Optional tags: knowledge_points, subject, wrong_answer_text,
 *                mistake_analysis, mistake_status, requires_image
 *
 * Never imports server-only modules. Never reads config or DB.
 */

import { extractXmlTag, extractXmlTagRaw, parseKnowledgePoints, parseBooleanTag } from "./xml-utils";
import { normalizeMistakeStatusForSave } from "../mistake-status";
import type { ParsedQuestion } from "./types";

/**
 * Parse the LLM raw analyze response into a ParsedQuestion.
 *
 * Matches the XML schema that the existing server-side analyze prompt uses:
 *   <question_text> <answer_text> <analysis> <knowledge_points>
 *   <subject> <requires_image> <wrong_answer_text>
 *   <mistake_status> <mistake_analysis>
 */
export function parseAnalyzeXmlResponse(content: string): ParsedQuestion {
    const questionText = extractXmlTag(content, "question_text");
    const answerText = extractXmlTag(content, "answer_text");
    const analysis = extractXmlTag(content, "analysis"); // 快速模式允许为空

    // Critical fields must be present
    if (!questionText || !answerText) {
        throw new Error(
            "AI_RESPONSE_ERROR: 本机 LLM 返回缺少必要字段 (question_text / answer_text)"
        );
    }

    // Subject — validate against allowed values
    const validSubjects: ParsedQuestion["subject"][] = [
        "数学", "物理", "化学", "生物",
        "英语", "语文", "历史", "地理",
        "政治", "其他",
    ];
    const subjectRaw = extractXmlTag(content, "subject");
    let subject: ParsedQuestion["subject"] = "其他";
    if (subjectRaw && (validSubjects as string[]).includes(subjectRaw)) {
        subject = subjectRaw as ParsedQuestion["subject"];
    }

    // Knowledge points
    const knowledgePointsRaw = extractXmlTag(content, "knowledge_points");
    const knowledgePoints = parseKnowledgePoints(knowledgePointsRaw);

    // Optional fields
    const requiresImage = parseBooleanTag(extractXmlTagRaw(content, "requires_image"));
    const wrongAnswerText = extractXmlTag(content, "wrong_answer_text");
    const mistakeAnalysis = extractXmlTag(content, "mistake_analysis");
    const mistakeStatusRaw = extractXmlTagRaw(content, "mistake_status");
    const mistakeStatus = normalizeMistakeStatusForSave(mistakeStatusRaw, wrongAnswerText);

    return {
        questionText,
        answerText,
        analysis,
        subject,
        knowledgePoints: knowledgePoints.slice(0, 5), // max 5 per schema
        requiresImage,
        wrongAnswerText: wrongAnswerText || "",
        mistakeAnalysis: mistakeAnalysis || "",
        mistakeStatus,
    };
}
