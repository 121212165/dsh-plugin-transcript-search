/**
 * Wire-level (assembly layer) tests for transcript-search: mount the real
 * apply() against a scripted cordis context, seed a real JSONL sidecar store
 * in a temp dir (same contract dsh-plugin-transcript writes), and drive /find
 * and the session_search tool against it — including the corrupt-line and
 * unreadable-file degrade accounting. No network anywhere.
 * Template: dsh-plugin-quota/test/harness.ts (style: dsh-plugin-tool-trace/test/wire.test.ts).
 * @module test/wire
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { ToolArgsError } from '@deepseek-ai/dsh-tools';

import { toLine, type TranscriptLine, type TranscriptLineInput } from '../src/transcript/line.ts';

interface CapturedCommand { name: string; handler: (args: { rawInput?: string }) => { kind: string; text: string } }

interface CapturedTool {
  name: string;
  execute: (args: Record<string, unknown>) => Promise<string>;
  presentCall: (args: Record<string, unknown>) => { card: string; title: string; kind: string } | undefined;
  presentResult: (args: Record<string, unknown>, value: unknown) => { card: string; title: string; kind: string } | undefined;
  output: { render: (args: unknown, value: string) => Array<{ type: string; text: string }> };
}

type Apply = (ctx: unknown, config: Record<string, unknown>) => void;

const plugin = await import('../src/plugin.ts');
const apply = plugin.apply as unknown as Apply;

function cmdLogger() {
  return { info() {}, warn() {}, debug() {} };
}

function mount(config: Record<string, unknown> = {}, dataDir?: string): { commands: CapturedCommand[]; tools: CapturedTool[]; dataDir: string } {
  const commands: CapturedCommand[] = [];
  const tools: CapturedTool[] = [];
  const dir = dataDir ?? mkdtempSync(join(tmpdir(), 'transcript-search-wire-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const ctx = {
    logger: cmdLogger,
    on() { assert.fail('transcript-search registers no listeners'); },
    commands: { register(definition: CapturedCommand) { commands.push(definition); } },
    tools: { register(definition: CapturedTool) { tools.push(definition); } },
  };
  apply(ctx, { enabled: true, dataDir: dir, sessionLimit: 20, snippetLimit: 3, snippetWidth: 160, ...config });
  return { commands, tools, dataDir: dir };
}

function lineAt(sessionId: string, kind: TranscriptLineInput['kind'], text: string, at: string, who?: string): TranscriptLine {
  return toLine(who === undefined ? { sessionId, at, kind, text } : { sessionId, at, kind, text, who });
}

/** Two sessions + one corrupt line; invalid filenames must read as absent, not skipped. */
function seedStore(dataDir: string, alpha: string, beta: string): void {
  writeFileSync(join(dataDir, 'transcript-2026-01.jsonl'), [
    lineAt(alpha, 'user', '请帮我对账：台账 预算 的问题', '2026-01-10T08:00:00.000Z'),
    lineAt(alpha, 'assistant', '预算 台账 已更新完毕', '2026-01-10T09:00:00.000Z'),
    lineAt(beta, 'tool', '预算 关键词扫描', '2026-01-11T10:00:00.000Z', 'find'),
    'torn-write\n',
  ].map((entry) => (typeof entry === 'string' ? entry : `${JSON.stringify(entry)}\n`)).join(''), 'utf8');
  writeFileSync(join(dataDir, 'transcript-2026-00.jsonl'), 'garbage-that-must-not-count\n', 'utf8');
  writeFileSync(join(dataDir, 'notes.txt'), 'ignored-by-name\n', 'utf8');
}

test('mount registers /find and the session_search tool with its surface; disabled mounts nothing', () => {
  const { commands, tools } = mount();
  assert.deepEqual(commands.map((command) => command.name), ['find']);
  assert.deepEqual(tools.map((tool) => tool.name), ['session_search']);
  const tool = tools[0]!;
  assert.equal(typeof tool.execute, 'function');
  assert.deepEqual(tool.output.render({}, 'value'), [{ type: 'text', text: 'value' }]);
  assert.deepEqual(tool.presentCall({ query: '记账' }), { card: 'generic', title: '搜索会话', kind: 'search' });

  const disabled = {
    logger: cmdLogger,
    on() { assert.fail('listener registered while disabled'); },
    commands: { register() { assert.fail('command registered while disabled'); } },
    tools: { register() { assert.fail('tool registered while disabled'); } },
  };
  apply(disabled, { enabled: false });
});

test('an empty query and an empty archive both error with guidance, naming the dataDir', () => {
  const { commands, dataDir } = mount();
  const find = commands[0]!;
  const blank = find.handler({ rawInput: '   ' });
  assert.equal(blank.kind, 'error');
  assert.ok(blank.text.includes('给点关键词'), blank.text);

  const missing = find.handler({ rawInput: '预算' });
  assert.equal(missing.kind, 'error');
  assert.ok(missing.text.includes('还没有归档转录'), missing.text);
  assert.ok(missing.text.includes(dataDir), `the message names the store it searched: ${missing.text}`);
});

test('/find searches the seeded sidecar with multi-keyword AND and counts the corrupt line', () => {
  const { commands, dataDir } = mount();
  seedStore(dataDir, 'session-alpha', 'session-beta');
  const result = commands[0]!.handler({ rawInput: '预算 台账' });
  assert.equal(result.kind, 'success');
  // alpha's two lines carry both words; beta's tool line only has 预算 → AND excludes it
  assert.ok(result.text.includes('2 处命中 · 1 个会话'), result.text);
  assert.ok(result.text.includes('（查询: 预算 + 台账）'), result.text);
  assert.ok(result.text.includes('👤 请帮我对账'), 'the user line is quoted with its kind icon');
  assert.ok(!result.text.includes('关键词扫描'), 'the beta line fails the AND and never shows');
  // the corrupt line is skipped and counted; the bad-month file filters out silently
  assert.ok(result.text.includes('⚠ 1 条损坏行/不可读文件被跳过'), result.text);
});

test('sessionLimit and snippetLimit truncate what /find shows', () => {
  const { commands, dataDir } = mount({ sessionLimit: 1, snippetLimit: 1 });
  const alpha = 'session-keep-a';
  const beta = 'session-keep-b';
  writeFileSync(join(dataDir, 'transcript-2026-02.jsonl'), [
    lineAt(alpha, 'user', '预算 第一条', '2026-01-15T08:00:00.000Z'),
    lineAt(alpha, 'assistant', '预算 第二条', '2026-01-16T09:00:00.000Z'),
    lineAt(beta, 'user', '预算 第三条', '2026-01-17T09:00:00.000Z'),
  ].map((entry) => `${JSON.stringify(entry)}\n`).join(''), 'utf8');

  const result = commands[0]!.handler({ rawInput: '预算' });
  assert.ok(result.text.includes('2 处命中 · 1 个会话'), `limits cut the ranked tail: ${result.text}`);
  assert.ok(!result.text.includes('keep-b'), 'sessionLimit drops the lower-ranked session');
  assert.ok(!result.text.includes('第一条'), 'snippetLimit keeps only the newest sample');
  assert.ok(result.text.includes('第二条'), 'the kept sample is the newest');
});

test('session_search validates args locally, searches the store, and renders cards without touching /find suffixes', async () => {
  const { tools, dataDir } = mount();
  seedStore(dataDir, 'session-alpha', 'session-beta');
  const tool = tools[0]!;

  await assert.rejects(tool.execute({}), ToolArgsError, 'missing query never reaches the search');

  const search = await tool.execute({ query: '预算' });
  assert.ok(search.includes('3 处命中 · 2 个会话'), search);
  assert.ok(search.includes('🔧 [find]'), search);
  assert.ok(!search.includes('损坏'), 'the corrupt-line suffix is a /find-only contract');

  const card = tool.presentResult({ query: '预算' }, search);
  assert.ok(card && card.card === 'generic' && card.kind === 'search');
  assert.ok(card!.title.startsWith('3 处命中'), `card title opens with the count line: ${card!.title}`);
  assert.equal(tool.presentCall({ query: 42 as unknown as string }), undefined, 'soft validation returns no card for junk args');
});

test('repeated searches hit the mtime cache and stays correct across appends', () => {
  const { commands, dataDir } = mount();
  writeFileSync(join(dataDir, 'transcript-2026-01.jsonl'), `${JSON.stringify(lineAt('session-alpha', 'user', '预算 起草完成', '2026-01-10T08:00:00.000Z'))}\n`, 'utf8');
  const first = commands[0]!.handler({ rawInput: '预算' });
  const second = commands[0]!.handler({ rawInput: '预算' });
  assert.equal(second.text, first.text, 'repeat search serves the same answer from cache');
  appendFileSync(join(dataDir, 'transcript-2026-01.jsonl'), `${JSON.stringify(lineAt('session-alpha', 'assistant', '预算 已批复', '2026-01-11T09:00:00.000Z'))}\n`, 'utf8');
  const third = commands[0]!.handler({ rawInput: '预算' });
  assert.ok(third.text.includes('2 处命中') && first.text.includes('1 处命中'), `append invalidates the cache: before=${first.text.split('\n')[0]} after=${third.text.split('\n')[0]}`);
});
