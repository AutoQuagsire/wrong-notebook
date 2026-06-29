/**
 * Unit tests for extractAssistantContent() and buildContentEmptyError() in client-llm-chat.ts
 *
 * Covers:
 * 1. Normal string content → success
 * 2. Content is array of text parts → extracts and merges
 * 3. choices array empty → diagnostic error
 * 4. Model refusal → refused=true
 * 5. finish_reason=length + empty content → truncation hint
 * 6. reasoning_content present but content empty → thinking-model hint
 * 7. content is null → diagnostic
 * 8. content is unknown type → diagnostic
 */

import { describe, it, expect } from 'vitest';
import { extractAssistantContent } from '@/lib/client-llm-chat';

// Reconstruct the response type locally (the interface is private in source)
interface OpenAiChoiceMessage {
    role?: string;
    content?: string | Array<{ type: string; text?: string; [key: string]: unknown }> | null;
    reasoning_content?: string | null;
    refusal?: string | null;
}
interface OpenAiChoice {
    finish_reason?: string | null;
    message?: OpenAiChoiceMessage | null;
}
interface OpenAiChatCompletionResponse {
    choices?: OpenAiChoice[] | null;
}

type TestResponse = OpenAiChatCompletionResponse;

describe('extractAssistantContent', () => {
    describe('正常返回', () => {
        it('应提取普通字符串 content', () => {
            const data: TestResponse = {
                choices: [{
                    finish_reason: 'stop',
                    message: {
                        role: 'assistant',
                        content: '<answer_text>答案</answer_text>\n<analysis>解析</analysis>',
                    },
                }],
            };
            const result = extractAssistantContent(data);
            expect(result.content).toContain('<answer_text>');
            expect(result.content).toContain('<analysis>');
            expect(result.hasReasoningContent).toBe(false);
            expect(result.refused).toBe(false);
            expect(result.diagnosticSummary).toBe('');
        });
    });

    describe('content 为数组格式（vision-capable 模型）', () => {
        it('应提取并拼接 text parts', () => {
            const data: TestResponse = {
                choices: [{
                    finish_reason: 'stop',
                    message: {
                        role: 'assistant',
                        content: [
                            { type: 'text', text: '<answer_text>答案1</answer_text>\n' },
                            { type: 'text', text: '<analysis>解析1</analysis>' },
                        ],
                    },
                }],
            };
            const result = extractAssistantContent(data);
            expect(result.content).toContain('<answer_text>');
            expect(result.content).toContain('<analysis>');
            expect(result.hasReasoningContent).toBe(false);
            expect(result.refused).toBe(false);
        });

        it('应忽略非 text 类型的 part', () => {
            const data: TestResponse = {
                choices: [{
                    finish_reason: 'stop',
                    message: {
                        role: 'assistant',
                        content: [
                            { type: 'image_url', image_url: { url: 'data:...' } },
                            { type: 'text', text: 'only text' },
                        ],
                    },
                }],
            };
            const result = extractAssistantContent(data);
            expect(result.content).toBe('only text');
            expect(result.diagnosticSummary).toContain('image_url');
        });

        it('数组中无 text 内容时返回空 content', () => {
            const data: TestResponse = {
                choices: [{
                    finish_reason: 'stop',
                    message: {
                        role: 'assistant',
                        content: [
                            { type: 'image_url', image_url: { url: 'data:...' } },
                        ],
                    },
                }],
            };
            const result = extractAssistantContent(data);
            expect(result.content).toBe('');
            // 数组中有非 text 类型会被记录，content 为空
            expect(result.diagnosticSummary).toContain('含非 text 类型');
        });
    });

    describe('choices 为空', () => {
        it('choices 数组为空应返回诊断', () => {
            const data: TestResponse = { choices: [] };
            const result = extractAssistantContent(data);
            expect(result.content).toBe('');
            expect(result.diagnosticSummary).toContain('choices 数组为空');
        });

        it('choices 为 null 应返回诊断', () => {
            const data: TestResponse = { choices: null };
            const result = extractAssistantContent(data);
            expect(result.content).toBe('');
            expect(result.diagnosticSummary).toContain('choices 数组为空');
        });

        it('无 choices 字段应返回诊断', () => {
            const data = {} as TestResponse;
            const result = extractAssistantContent(data);
            expect(result.content).toBe('');
            expect(result.diagnosticSummary).toContain('choices 数组为空');
        });
    });

    describe('模型拒答（拒答）', () => {
        it('应检测 refusal 并标记 refused=true', () => {
            const data: TestResponse = {
                choices: [{
                    finish_reason: 'content_filter',
                    message: {
                        role: 'assistant',
                        content: null,
                        refusal: 'I cannot answer this question.',
                    },
                }],
            };
            const result = extractAssistantContent(data);
            expect(result.content).toBe('');
            expect(result.refused).toBe(true);
            expect(result.diagnosticSummary).toContain('模型拒答');
            expect(result.diagnosticSummary).toContain('I cannot answer this question.');
        });

        it('长 refusal 应截断', () => {
            const longRefusal = 'x'.repeat(300);
            const data: TestResponse = {
                choices: [{
                    finish_reason: 'content_filter',
                    message: {
                        role: 'assistant',
                        content: null,
                        refusal: longRefusal,
                    },
                }],
            };
            const result = extractAssistantContent(data);
            expect(result.refused).toBe(true);
            expect(result.diagnosticSummary.length).toBeLessThan(250);
        });
    });

    describe('finish_reason 截断提示', () => {
        it('finish_reason=length 且 content 为空应提示截断', () => {
            const data: TestResponse = {
                choices: [{
                    finish_reason: 'length',
                    message: {
                        role: 'assistant',
                        content: '',
                    },
                }],
            };
            const result = extractAssistantContent(data);
            expect(result.content).toBe('');
            expect(result.finishReason).toBe('length');
            expect(result.diagnosticSummary).toContain('截断');
        });

        it('finish_reason=length 但 content 有值不提示截断', () => {
            const data: TestResponse = {
                choices: [{
                    finish_reason: 'length',
                    message: {
                        role: 'assistant',
                        content: '部分答案...',
                    },
                }],
            };
            const result = extractAssistantContent(data);
            expect(result.content).toBe('部分答案...');
            expect(result.diagnosticSummary).toBe('');
        });
    });

    describe('reasoning_content 存在但 content 为空', () => {
        it('应标记 hasReasoningContent=true 且不把推理当答案', () => {
            const data: TestResponse = {
                choices: [{
                    finish_reason: 'stop',
                    message: {
                        role: 'assistant',
                        content: '',
                        reasoning_content: '首先分析题目，然后计算...最终得到答案 x=3。',
                    },
                }],
            };
            const result = extractAssistantContent(data);
            expect(result.content).toBe('');
            expect(result.hasReasoningContent).toBe(true);
            expect(result.refused).toBe(false);
            // 推理内容不应出现在 content 中
            expect(result.content).not.toContain('首先分析');
            expect(result.diagnosticSummary).toContain('reasoning_content');
        });

        it('content null + reasoning_content 存在', () => {
            const data: TestResponse = {
                choices: [{
                    finish_reason: 'stop',
                    message: {
                        role: 'assistant',
                        content: null,
                        reasoning_content: '推理过程...',
                    },
                }],
            };
            const result = extractAssistantContent(data);
            expect(result.content).toBe('');
            expect(result.hasReasoningContent).toBe(true);
            expect(result.diagnosticSummary).toContain('reasoning_content');
        });
    });

    describe('content 为 null', () => {
        it('content null 且无推理应返回诊断', () => {
            const data: TestResponse = {
                choices: [{
                    finish_reason: 'stop',
                    message: {
                        role: 'assistant',
                        content: null,
                    },
                }],
            };
            const result = extractAssistantContent(data);
            expect(result.content).toBe('');
            expect(result.diagnosticSummary).toContain('content 为 null');
        });
    });

    describe('未知 content 类型', () => {
        it('应返回类型异常诊断', () => {
            const data = {
                choices: [{
                    finish_reason: 'stop',
                    message: {
                        role: 'assistant',
                        content: 12345, // 异常类型
                    },
                }],
            } as unknown as TestResponse;
            const result = extractAssistantContent(data);
            expect(result.content).toBe('');
            expect(result.diagnosticSummary).toContain('类型异常');
        });
    });

    describe('仅有 finish_reason 异常', () => {
        it('应记录 finish_reason', () => {
            const data: TestResponse = {
                choices: [{
                    finish_reason: 'content_filter',
                    message: {
                        role: 'assistant',
                        content: null,
                    },
                }],
            };
            const result = extractAssistantContent(data);
            expect(result.finishReason).toBe('content_filter');
        });
    });
});
