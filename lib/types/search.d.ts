import type { TranscriptLine } from './transcript/line.ts';
/** Full-text search over transcript sidecar records. Matching is a multi-keyword
 * AND over case-folded text (CJK has no case; folding only helps latin hits).
 * Snippets are line-clipped, not word-clipped, so CJK hits keep their context. */
export interface SearchHit {
    sessionId: string;
    at: string;
    kind: TranscriptLine['kind'];
    who?: string | undefined;
    snippet: string;
}
export interface SessionResult {
    sessionId: string;
    hits: number;
    firstAt: string;
    lastAt: string;
    samples: SearchHit[];
}
export interface SearchResult {
    query: string[];
    sessions: SessionResult[];
    totalHits: number;
}
export declare function parseQuery(raw: string): string[];
export declare function matches(line: TranscriptLine, terms: string[]): boolean;
export declare function snippetAround(text: string, terms: string[], width: number): string;
export declare function search(lines: TranscriptLine[], rawQuery: string, options?: {
    sessionLimit?: number;
    snippetLimit?: number;
    snippetWidth?: number;
}): SearchResult;
/** ids all share the 'session-' prefix; showing it wastes 8 of 8 chars. */
export declare function shortSessionId(sessionId: string): string;
export declare function renderResult(result: SearchResult): string;
//# sourceMappingURL=search.d.ts.map