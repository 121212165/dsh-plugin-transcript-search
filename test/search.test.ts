import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseQuery, matches, snippetAround, search, renderResult } from '../src/search.ts';
import type { TranscriptLine } from '../src/transcript/line.ts';

const line = (over: Partial<TranscriptLine>): TranscriptLine =>
  ({ v: 1, sessionId: 's1', at: '2026-09-28T01:00:00.000Z', kind: 'assistant', text: '', ...over }) as TranscriptLine;

const corpus: TranscriptLine[] = [
  line({ sessionId: 'ledger', text: '预算门禁在花费接近上限时会停下来问用户' }),
  line({ sessionId: 'ledger', at: '2026-09-28T02:00:00.000Z', kind: 'user', text: '怎么关闭预算门禁' }),
  line({ sessionId: 'novel', text: '女主在雨夜推翻了既定大纲', who: 'deepseek-v4-pro' }),
  line({ sessionId: 'novel', at: '2026-09-27T00:00:00.000Z', kind: 'tool', who: 'bash', text: 'ls大纲目录' }),
];

test('multi-keyword is AND, case-folded, across text and who', () => {
  const terms = parseQuery('预算 门禁');
  assert.ok(matches(corpus[0]!, terms));
  assert.ok(matches(corpus[1]!, terms)); // '怎么关闭预算门禁' contains both terms
  assert.ok(matches(corpus[1]!, parseQuery('预算')));
  assert.ok(matches(line({ who: 'DeepSeek-V4-Pro', text: 'x' }), parseQuery('deepseek')));
  assert.equal(matches(corpus[0]!, []), false);
});

test('search groups by session, ranks by hits, dedupes query terms', () => {
  const result = search(corpus, '预算 预算 门禁', { sessionLimit: 10 });
  assert.deepEqual(result.query, ['预算', '门禁']);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0]!.sessionId, 'ledger');
  assert.equal(result.sessions[0]!.hits, 2);
  assert.equal(result.totalHits, 2);
});

test('snippets clip around the first hit with ellipses, whitespace collapsed', () => {
  const long = '前'.repeat(200) + '关键词' + '后'.repeat(300);
  const clip = snippetAround(long, ['关键词'], 50);
  assert.ok(clip.startsWith('…'));
  assert.ok(clip.endsWith('…'));
  assert.ok(clip.includes('关键词'));
  assert.ok(clip.length <= 60);
});

test('empty query and no-hit paths are safe', () => {
  assert.equal(search(corpus, '   ').sessions.length, 0);
  const none = search(corpus, '不存在的词');
  assert.ok(renderResult(none).startsWith('没有命中'));
  assert.equal(search(corpus, '雨夜').totalHits, 1);
});

test('render lists sessions with kind icons and sample lines', () => {
  const text = renderResult(search(corpus, '大纲'));
  assert.ok(text.includes('novel'));
  assert.ok(text.includes('🔧') || text.includes('🤖'));
});
