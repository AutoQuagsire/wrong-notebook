/**
 * normalizeMathDelimiters & MarkdownRenderer 测试
 */
import { describe, it, expect } from 'vitest';
import { normalizeMathDelimiters } from '@/lib/markdown-utils';

describe('normalizeMathDelimiters', () => {
    describe('\\( ... \\) → $...$ (行内公式)', () => {
        it('应转换基本行内公式 \(x+1\)', () => {
            expect(normalizeMathDelimiters('\\(x+1\\)')).toBe('$x+1$');
        });

        it('应转换含分数的行内公式', () => {
            const input = '解：\\(\\frac{1}{2}\\) 是答案';
            const output = normalizeMathDelimiters(input);
            expect(output).toBe('解：$\\frac{1}{2}$ 是答案');
        });

        it('应转换含多个行内公式的文本', () => {
            const input = '\\(a\\) 和 \\(b\\) 的关系是 \\(a = b^2\\)';
            const output = normalizeMathDelimiters(input);
            expect(output).toBe('$a$ 和 $b$ 的关系是 $a = b^2$');
        });
    });

    describe('\\[ ... \\] → $$...$$ (块级公式)', () => {
        it('应转换基本块级公式', () => {
            expect(normalizeMathDelimiters('\\[x = 1\\]')).toBe('$$x = 1$$');
        });

        it('应转换含复杂内容的块级公式', () => {
            const input = '\\[y(t) = 1 - e^{-t/T}\\]';
            const output = normalizeMathDelimiters(input);
            expect(output).toBe('$$y(t) = 1 - e^{-t/T}$$');
        });

        it('应同时转换行内和块级公式', () => {
            const input = '已知 \\(a = 3\\)，求：\\[x = a^2 + 2a\\]';
            const output = normalizeMathDelimiters(input);
            expect(output).toBe('已知 $a = 3$，求：$$x = a^2 + 2a$$');
        });
    });

    describe('不破坏已有的 $...$ 和 $$...$$', () => {
        it('应保留已有的行内 $...$', () => {
            const input = '答案是 $x = 5$';
            const output = normalizeMathDelimiters(input);
            expect(output).toBe('答案是 $x = 5$');
        });

        it('应保留已有的块级 $$...$$', () => {
            const input = '$$\\int_0^1 x dx$$';
            const output = normalizeMathDelimiters(input);
            expect(output).toBe('$$\\int_0^1 x dx$$');
        });

        it('不应重复转换混合使用 $...$ 和 \\(...\\) 的文本', () => {
            const input = '行内 $x$ 和 \\(y\\) 都是变量';
            const output = normalizeMathDelimiters(input);
            expect(output).toBe('行内 $x$ 和 $y$ 都是变量');
        });
    });

    describe('不破坏代码块内容', () => {
        it('应保留行内代码中的反斜杠', () => {
            const input = '使用 `\\(x\\)` 语法';
            const output = normalizeMathDelimiters(input);
            expect(output).toBe('使用 `\\(x\\)` 语法');
        });

        it('应保留围栏代码块中的反斜杠', () => {
            const input = '```\n这是 \\(x\\) 和 \\[y\\]\n```';
            const output = normalizeMathDelimiters(input);
            expect(output).toBe('```\n这是 \\(x\\) 和 \\[y\\]\n```');
        });

        it('应只在代码块外转换', () => {
            const input = '源码：\n```\n\\(a\\)\n```\n结果：\\(a\\)';
            const output = normalizeMathDelimiters(input);
            expect(output).toBe('源码：\n```\n\\(a\\)\n```\n结果：$a$');
        });
    });

    describe('边界情况', () => {
        it('应处理空字符串', () => {
            expect(normalizeMathDelimiters('')).toBe('');
        });

        it('应处理空值', () => {
            expect(normalizeMathDelimiters(null as unknown as string)).toBe("");
            expect(normalizeMathDelimiters(undefined as unknown as string)).toBe("");
        });

        it('应处理非字符串输入', () => {
            expect(normalizeMathDelimiters(123 as unknown as string)).toBe("123");
            expect(normalizeMathDelimiters({} as unknown as string)).toBe("[object Object]");
        });

        it('应处理不含任何公式的纯文本', () => {
            const input = '这是一段纯文本，没有任何数学公式。';
            const output = normalizeMathDelimiters(input);
            expect(output).toBe(input);
        });

        it('应处理公式中包含反斜杠命令的情况', () => {
            const input = '\\(\\mathcal{L}\\{f(t)\\}\\)';
            const output = normalizeMathDelimiters(input);
            // Delimiters converted, content preserved (even if \mathcal isn't supported by KaTeX)
            expect(output).toBe('$\\mathcal{L}\\{f(t)\\}$');
        });

        it('应正确处理中文字符混合', () => {
            const input = '根据公式\\(F = ma\\)，可以推导出\\[a = \\frac{F}{m}\\]';
            const output = normalizeMathDelimiters(input);
            expect(output).toBe('根据公式$F = ma$，可以推导出$$a = \\frac{F}{m}$$');
        });
    });
});

describe('MarkdownRenderer math integration', () => {
    it('normalizeMathDelimiters 转换的结果不含 \\( 或 \\[ 分隔符', () => {
        const testCases = [
            '\\(x+1\\)',
            '\\[y = mx + b\\]',
            '已知 \\(a\\) 和 \\(b\\)',
            '\\[\\frac{1}{2}\\]',
        ];

        for (const input of testCases) {
            const output = normalizeMathDelimiters(input);
            expect(output).not.toContain('\\(');
            expect(output).not.toContain('\\)');
            expect(output).not.toContain('\\[');
            expect(output).not.toContain('\\]');
        }
    });

    it('转换后应包含 $ 分隔符', () => {
        const input = '\\(x=1\\) 和 \\[y=2\\]';
        const output = normalizeMathDelimiters(input);
        expect(output).toContain('$');
        expect(output).toContain('$$');
    });
});

describe('MarkdownRenderer null safety', () => {
    // These tests verify that normalizeMathDelimiters (the preprocessor used by MarkdownRenderer)
    // handles null/undefined/non-string inputs safely, preventing the "client-side exception"
    // caused by TypeError when calling .replace() on null/undefined.

    it('normalizeMathDelimiters(null) 返回 "" 而不是 null', () => {
        expect(normalizeMathDelimiters(null as unknown as string)).toBe("");
    });

    it('normalizeMathDelimiters(undefined) 返回 "" 而不是 undefined', () => {
        expect(normalizeMathDelimiters(undefined as unknown as string)).toBe("");
    });

    it('normalizeMathDelimiters("") 返回 ""', () => {
        expect(normalizeMathDelimiters("")).toBe("");
    });

    it('normalizeMathDelimiters 返回结果始终是 string 类型，可以安全调用 .replace()', () => {
        const inputs: (string | null | undefined)[] = [
            null,
            undefined,
            "",
            "\\(x+1\\)",
        ];
        for (const input of inputs) {
            const result = normalizeMathDelimiters(input);
            expect(typeof result).toBe("string");
            // Must not throw: .replace() on the result
            expect(() => result.replace(/a/g, "b")).not.toThrow();
        }
    });
});

