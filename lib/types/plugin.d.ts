/**
 * dsh wiring for transcript-search: /find searches the transcript sidecars
 * (same JSONL schema and default dataDir as dsh-plugin-transcript — the two
 * plugins interop by contract, not by import).
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { type TranscriptLine } from './transcript/line.ts';
/** Per-month parsed-sidecar cache. Month files are parsed at most once per
 * (mtime,size) key: /find on hundreds of MB of sidecar only pays the read on
 * the first call after each format change; callers spread the arrays and must
 * not mutate the cached ones. Entries live for the process lifetime of the
 * mounted plugin — month files only ever shrink under family rotation. */
interface MonthCache {
    mtimeMs: number;
    size: number;
    records: TranscriptLine[];
    skipped: number;
}
export declare const name = "transcript-search";
export declare const inject: string[];
export interface Config {
    enabled: boolean;
    dataDir?: string;
    sessionLimit: number;
    snippetLimit: number;
    snippetWidth: number;
}
export declare const Config: Schema<Schemastery.ObjectS<{
    enabled: Schema<boolean, boolean>;
    dataDir: Schema<string, string>;
    sessionLimit: Schema<number, number>;
    snippetLimit: Schema<number, number>;
    snippetWidth: Schema<number, number>;
}>, Schemastery.ObjectT<{
    enabled: Schema<boolean, boolean>;
    dataDir: Schema<string, string>;
    sessionLimit: Schema<number, number>;
    snippetLimit: Schema<number, number>;
    snippetWidth: Schema<number, number>;
}>>;
export declare function expandHome(dir: string): string;
export declare function readAllLines(dataDir: string, cache?: Map<string, MonthCache>): {
    records: TranscriptLine[];
    skipped: number;
};
export declare function apply(ctx: Context, config: Config): void;
export {};
//# sourceMappingURL=plugin.d.ts.map