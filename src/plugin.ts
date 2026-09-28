/**
 * dsh wiring for transcript-search: /find searches the transcript sidecars
 * (same JSONL schema and default dataDir as dsh-plugin-transcript — the two
 * plugins interop by contract, not by import).
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-commands';
import type {} from '@deepseek-ai/dsh-tools';
import { mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { parseJsonl, type TranscriptLine } from './transcript/line.ts';
import { search, renderResult, snippetAround } from './search.ts';

export const name = 'transcript-search';
export const inject = ['commands', 'tools'];

export interface Config {
  enabled: boolean;
  dataDir?: string;
  sessionLimit: number;
  snippetLimit: number;
  snippetWidth: number;
}

export const Config = Schema.object({
  enabled: Schema.boolean().default(true),
  dataDir: Schema.string(),
  sessionLimit: Schema.natural().default(20),
  snippetLimit: Schema.natural().default(3),
  snippetWidth: Schema.natural().default(160),
});

export function expandHome(dir: string): string {
  return dir.startsWith('~') ? join(homedir(), dir.slice(1)) : dir;
}

export function readAllLines(dataDir: string): { records: TranscriptLine[]; skipped: number } {
  const records: TranscriptLine[] = [];
  let skipped = 0;
  if (!existsSync(dataDir)) return { records, skipped };
  for (const name of readdirSync(dataDir).filter(validName).sort()) {
    const result = parseJsonl(readFileSync(join(dataDir, name), 'utf8'));
    records.push(...result.records);
    skipped += result.skipped;
  }
  return { records, skipped };
}

function validName(name: string): boolean {
  const match = /^transcript-(\d{4})-(\d{2})\.jsonl$/.exec(name);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

export function apply(ctx: Context, config: Config): void {
  const log = ctx.logger('transcript-search');
  if (!config.enabled) return void log.info('disabled by config');

  const dataDir = config.dataDir ? expandHome(config.dataDir) : join(homedir(), '.dsh', 'transcripts');
  const options = { sessionLimit: config.sessionLimit, snippetLimit: config.snippetLimit, snippetWidth: config.snippetWidth };

  ctx.commands.register({
    name: 'find',
    description: '跨会话全文搜索归档转录：/find 关键词1 关键词2（多词 AND）',
    input: { hint: '<关键词...>' },
    handler: ({ rawInput }) => {
      const query = String(rawInput ?? '').trim();
      if (!query) return { kind: 'error', text: '给点关键词，例如 /find 台账 预算' };
      const all = readAllLines(dataDir);
      if (!all.records.length) return { kind: 'error', text: `还没有归档转录（${dataDir}）。先装 dsh-plugin-transcript 积累数据。` };
      return { kind: 'success', text: renderResult(search(all.records, query, options)) };
    },
  });

  ctx.tools.register(
    defineTool({
      name: 'session_search',
      description: '在历史会话归档里全文搜索。用户问"之前那次对话说过什么"时用。多关键词是与关系。',
      parameters: {
        query: { type: 'string', required: true, description: '空格分隔的多个关键词' },
      },
      output: {
        schema: { type: 'string' } as const,
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        const all = readAllLines(dataDir);
        const result = search(all.records, args.query, options);
        return renderResult(result);
      },
    }),
  );

  void mkdirSync; // dataDir is owned by the transcript plugin; we only read
  void snippetAround;
  log.info(`mounted · dataDir=${dataDir}`);
}
