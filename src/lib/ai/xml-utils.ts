/**
 * Shared XML tag extraction utilities.
 *
 * Re-exported here so providers and (in the future) browser-side parsers
 * all use the same extraction logic.
 *
 * Rules (matched to OpenAIProvider.extractTag / AzureOpenAIProvider.extractTag):
 * 1. extractXmlTag        — returns the trimmed content, or "" if the tag is missing.
 * 2. extractXmlTagRaw     — returns the trimmed content, or null if the tag is missing.
 * 3. extractXmlTagOptional — returns the trimmed content, or undefined if the tag is missing.
 */

/**
 * Extract the text content between <tag>…</tag>.
 * Returns an empty string when the tag is not found.
 *
 * This is the **required-tag** variant — callers that use it on optional tags
 * should fall back with `|| defaultValue` as the three providers already do.
 */
export function extractXmlTag(content: string, tag: string): string {
    const startTag = `<${tag}>`;
    const endTag = `</${tag}>`;

    const startIndex = content.indexOf(startTag);

    // Special case: the legacy OpenAI provider falls back to reading
    // to the end of the content if the closing </analysis> tag is missing
    // (the analysis tag is always the last one in the reanswer prompt).
    if (startIndex === -1) {
        return "";
    }

    const contentStart = startIndex + startTag.length;
    const endIndex = content.lastIndexOf(endTag);

    // If the closing tag is missing AND the tag is 'analysis',
    // treat the response as truncated and return the rest.
    if (endIndex === -1 && tag === "analysis") {
        return content.substring(contentStart).trim();
    }

    if (endIndex === -1 || contentStart >= endIndex) {
        return "";
    }

    return content.substring(contentStart, endIndex).trim();
}

/**
 * Extract the text content between <tag>…</tag>.
 * Returns `null` when the tag is not found.
 * No special-case for truncated analysis.
 *
 * This matches the behaviour of GeminiProvider.extractTag and
 * AzureOpenAIProvider.extractTag (which never had the analysis fallback).
 */
export function extractXmlTagRaw(content: string, tag: string): string | null {
    const startTag = `<${tag}>`;
    const endTag = `</${tag}>`;

    const startIndex = content.indexOf(startTag);
    const endIndex = content.lastIndexOf(endTag);

    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
        return null;
    }

    return content.substring(startIndex + startTag.length, endIndex).trim();
}

/**
 * Convenience wrapper: returns `undefined` instead of `null`.
 */
export function extractXmlTagOptional(content: string, tag: string): string | undefined {
    return extractXmlTagRaw(content, tag) ?? undefined;
}

/**
 * Split a comma- or newline- separated raw string into a cleaned string[].
 * Used by all three providers to parse the <knowledge_points> tag.
 */
export function parseKnowledgePoints(raw: string): string[] {
    return raw.split(/[,，\n]/).map(k => k.trim()).filter(k => k.length > 0);
}

/**
 * Parse a "true"/"false" string from an XML tag.
 */
export function parseBooleanTag(raw: string | null | undefined): boolean {
    return raw?.toLowerCase().trim() === "true";
}
