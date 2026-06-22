import { remark } from 'remark';
import stripMarkdown from 'strip-markdown';

/**
 * Clean markdown content to plain text.
 * Note: This function is synchronous and uses remark.processSync.
 */
export function cleanMarkdown(content: string): string {
    if (!content) return "";

    try {
        // 1. First, handle custom LaTeX-like escape sequences that remark might not catch or handle as we want
        // Specifically, handle escaped underscores manually before markdown stripping
        // because we want "\_" to become "_" (plain text underscore), not removed entirely
        let text = content.replace(/\\_/g, '_');

        // 2. Use remark to strip markdown formatting
        const file = remark().use(stripMarkdown as () => unknown).processSync(text);
        text = String(file);

        // 3. Post-processing: specific cleanups for this app
        // Remove common LaTeX commands that might remain as plain text
        text = text
            // Layout commands
            .replace(/\\left/g, '')
            .replace(/\\right/g, '')
            .replace(/\\begin\{.*?\}/g, '')
            .replace(/\\end\{.*?\}/g, '')
            .replace(/\\text\{.*?\}/g, '')
            .replace(/\\mbox\{.*?\}/g, '')
            // Math structures (Simple recursive patterns are not supported in JS regex, so we handle basic cases)
            .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1/$2')
            .replace(/\\sqrt\s*\{([^{}]+)\}/g, '√$1')
            .replace(/\^\{([^{}]+)\}/g, '^$1')
            .replace(/_\{([^{}]+)\}/g, '_$1')
            // Symbols map
            .replace(/\\times/g, '×')
            .replace(/\\div/g, '÷')
            .replace(/\\cdot/g, '·')
            .replace(/\\le/g, '≤')
            .replace(/\\ge/g, '≥')
            .replace(/\\neq/g, '≠')
            .replace(/\\approx/g, '≈')
            .replace(/\\pm/g, '±')
            .replace(/\\infty/g, '∞')
            .replace(/\\circ/g, '°')
            .replace(/\\triangle/g, '△')
            .replace(/\\angle/g, '∠')
            .replace(/\\because/g, '∵')
            .replace(/\\therefore/g, '∴')
            // Explicitly remove math delimiters ($)
            .replace(/\$/g, '')
            // Cleanup remaining backslashes
            .replace(/\\/g, '')
            .trim();

        return text;
    } catch (error) {
        console.error("Failed to strip markdown:", error);
        // Fallback to original content if stripping fails
        return content;
    }
}

/**
 * Normalize math delimiters from AI output to KaTeX-compatible format.
 *
 * Converts:
 *   \\( ... \\) → $...$   (inline math)
 *   \\[ ... \\] → $$...$$ (display math)
 *
 * Skips content inside code blocks (``` ... ```) and inline code (` ... `).
 * Does not double-convert already-correct $...$ and $$...$$.
 *
 * @param input - Raw text potentially containing LaTeX delimiters
 * @returns Text with normalized delimiters
 */
export function normalizeMathDelimiters(input: string): string {
    if (!input) return input;

    // Protect code blocks first — split by fenced code blocks
    const fenceRegex = /(`{3,})[\s\S]*?\1/g;
    const fences: string[] = [];

    let normalized = input.replace(fenceRegex, (match) => {
        fences.push(match);
        return `\x00FENCE${fences.length - 1}\x00`;
    });

    // Protect inline code
    const inlineRegex = /`[^`\n]+`/g;
    const inlines: string[] = [];

    normalized = normalized.replace(inlineRegex, (match) => {
        inlines.push(match);
        return `\x00INLINE${inlines.length - 1}\x00`;
    });

    // Convert \( ... \) → $...$ (inline LaTeX → KaTeX)
    // $$ in replacement string means literal $ (single)
    normalized = normalized.replace(/\\\(/g, '$$');
    normalized = normalized.replace(/\\\)/g, '$$');

    // Convert \[ ... \] → $$...$$ (display LaTeX → KaTeX)
    // Note: $$ in replacement string means literal $, so $$$$ = literal $$
    normalized = normalized.replace(/\\\[/g, '$$$$');
    normalized = normalized.replace(/\\\]/g, '$$$$');

    // Restore inline code
    normalized = normalized.replace(/\x00INLINE(\d+)\x00/g, (_, i) => inlines[parseInt(i)]);

    // Restore fenced code blocks
    normalized = normalized.replace(/\x00FENCE(\d+)\x00/g, (_, i) => fences[parseInt(i)]);

    return normalized;
}
