import type { TranscriptLine } from './transcript/line.ts';

/** Full-text search over transcript sidecar records. Matching is a multi-keyword
 * AND over case-folded text (CJK has no case; folding only helps latin hits).
 * Snippets are line-clipped, not word-clipped, so CJK hits keep their context. */

export interface SearchHit {
  sessionId: string;
  at: string;
  kind: TranscriptLine['kind'];
  who?: string;
  snippet: string;
}

export interface SessionResult {
  sessionId: string;
  hits: number;
  firstAt: string;
  lastAt: string;
  samples: SearchHit[]; // up to `snippetLimit` newest-first
}

export interface SearchResult {
  query: string[];
  sessions: SessionResult[]; // descending by hit count
  totalHits: number;
}

export function parseQuery(raw: string): string[] {
  return [...new Set(String(raw ?? '').toLowerCase().split(/\s+/).filter(Boolean))];
}

export function matches(line: TranscriptLine, terms: string[]): boolean {
  if (!terms.length) return false;
  const haystack = `${line.text}\u0000${line.who ?? ''}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function snippetAround(text: string, terms: string[], width: number): string {
  if (text.length <= width) return text.replace(/\s+/g, ' ');
  const folded = text.toLowerCase();
  let center = -1;
  for (const term of terms) {
    const index = folded.indexOf(term);
    if (index !== -1) {
      center = index;
      break;
    }
  }
  if (center === -1) center = 0;
  const start = Math.max(0, center - Math.floor(width / 2));
  const end = Math.min(text.length, start + width);
  const clip = `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`;
  return clip;
}

export function search(lines: TranscriptLine[], rawQuery: string, options: { sessionLimit?: number; snippetLimit?: number; snippetWidth?: number } = {}): SearchResult {
  const terms = parseQuery(rawQuery);
  const sessionLimit = options.sessionLimit ?? 20;
  const snippetLimit = options.snippetLimit ?? 3;
  const snippetWidth = options.snippetWidth ?? 160;
  const bySession = new Map<string, SessionResult>();
  for (const line of lines) {
    if (!matches(line, terms)) continue;
    let result = bySession.get(line.sessionId);
    if (!result) {
      result = { sessionId: line.sessionId, hits: 0, firstAt: line.at, lastAt: line.at, samples: [] };
      bySession.set(line.sessionId, result);
    }
    result.hits++;
    result.firstAt = result.firstAt < line.at ? result.firstAt : line.at;
    result.lastAt = result.lastAt > line.at ? result.lastAt : line.at;
    result.samples.push({
      sessionId: line.sessionId,
      at: line.at,
      kind: line.kind,
      who: line.who,
      snippet: snippetAround(line.text, terms, snippetWidth),
    });
  }
  for (const result of bySession.values()) {
    result.samples.sort((a, b) => (a.at < b.at ? 1 : -1));
    result.samples = result.samples.slice(0, snippetLimit);
  }
  const sessions = [...bySession.values()].sort((a, b) => b.hits - a.hits).slice(0, sessionLimit);
  return { query: terms, sessions, totalHits: sessions.reduce((total, session) => total + session.hits, 0) };
}

const KIND_LABEL: Record<TranscriptLine['kind'], string> = { user: '👤', assistant: '🤖', tool: '🔧', system: 'ℹ️' };

export function renderResult(result: SearchResult): string {
  if (!result.sessions.length) return `没有命中：${result.query.join(' + ') || '（空查询）'}`;
  const blocks = result.sessions.map((session) => {
    const head = `${session.sessionId.slice(0, 8)}… · ${session.hits} 处命中 · ${session.firstAt.slice(0, 10)}~${session.lastAt.slice(0, 10)}`;
    const samples = session.samples.map((sample) => `  ${KIND_LABEL[sample.kind]} ${sample.who ? `[${sample.who}] ` : ''}${sample.snippet}`).join('\n');
    return `${head}\n${samples}`;
  });
  return `${result.totalHits} 处命中 · ${result.sessions.length} 个会话（查询: ${result.query.join(' + ')}）\n\n${blocks.join('\n')}`;
}
