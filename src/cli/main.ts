#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { evaluate } from '../core/index.js';
import { type Result, ok, err } from '../core/model/result.js';
import { inMemoryCatalogue } from '../adapters/catalogue/in-memory-catalogue.js';
import { readProfileFromDirectory } from '../adapters/inbound/json-profile.js';
import { jsonGridSource } from '../adapters/inbound/json-grid.js';
import { jsonStreamSink } from '../adapters/outbound/json-evaluation.js';
import { builtInEvaluators } from '../criteria/index.js';

export type Options =
  | { readonly help: true }
  | {
      readonly help: false;
      readonly profileDir: string;
      readonly gridPath: string;
      readonly minAxes: number | undefined;
      readonly format: 'json';
    };

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_GRID = resolve(HERE, '../../presets/aidd.json');

export const USAGE =
  'usage: laivel-up --profile|-p <dir> [--grid|-g <preset.json>] [--min-axes <n>] [--format json] [--help|-h]\n';

export function parseArgs(argv: readonly string[]): Result<Options, string> {
  if (argv.includes('--help') || argv.includes('-h')) {
    return ok({ help: true });
  }

  let profileDir: string | undefined;
  let gridPath = DEFAULT_GRID;
  let minAxes: number | undefined;
  const format = 'json';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--profile' || arg === '-p') {
      if (next === undefined) {
        return err('missing value for --profile');
      }
      profileDir = next;
      i += 1;
    } else if (arg === '--grid' || arg === '-g') {
      if (next === undefined) {
        return err('missing value for --grid');
      }
      gridPath = next;
      i += 1;
    } else if (arg === '--min-axes') {
      if (next === undefined) {
        return err('missing value for --min-axes');
      }
      minAxes = Number(next);
      if (!Number.isInteger(minAxes) || minAxes < 0) {
        return err(`invalid --min-axes value: ${next} (expected: a non-negative integer)`);
      }
      i += 1;
    } else if (arg === '--format') {
      if (next === undefined) {
        return err('missing value for --format');
      }
      if (next !== 'json') {
        return err(`invalid --format value: ${next} (expected: json)`);
      }
      i += 1;
    } else {
      return err(`unknown flag: ${String(arg)}`);
    }
  }

  if (profileDir === undefined) {
    return err('missing required flag: --profile');
  }

  return ok({ help: false, profileDir, gridPath, minAxes, format });
}

function fail(message: string, issues: readonly string[] = []): never {
  process.stderr.write(`error: ${message}\n`);
  for (const issue of issues) {
    process.stderr.write(`  - ${issue}\n`);
  }
  process.exit(1);
}

function argError(message: string): never {
  process.stderr.write(`error: ${message}\n`);
  process.stderr.write(USAGE);
  process.exit(2);
}

export function main(): void {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    argError(parsed.error);
  }

  const options = parsed.value;
  if (options.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  const profileResult = readProfileFromDirectory(options.profileDir);
  if (!profileResult.ok) {
    fail(profileResult.error.message, profileResult.error.issues);
  }

  const gridResult = jsonGridSource(options.gridPath).load();
  if (!gridResult.ok) {
    fail(gridResult.error.message, gridResult.error.issues);
  }

  const catalogue = inMemoryCatalogue(builtInEvaluators);
  const evalOptions = options.minAxes === undefined ? {} : { minRuledAxes: options.minAxes };
  const evaluation = evaluate(profileResult.value, gridResult.value, catalogue, evalOptions);

  const emitted = jsonStreamSink().emit(evaluation);
  if (!emitted.ok) {
    fail(emitted.error.message);
  }
}

/**
 * `process.argv[1]` is whatever path the process was launched with — for a package's
 * `bin` entry, package managers expose it through a symlink (e.g. `node_modules/.bin/laivel-up`),
 * while `import.meta.url` always resolves to the target file's realpath. Comparing the
 * two directly never matches through that indirection, so resolve `argv[1]` first.
 */
function isDirectInvocation(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  main();
}
