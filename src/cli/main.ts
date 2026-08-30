import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { evaluate } from '../core/index.js';
import { type Result, ok, err } from '../core/model/result.js';
import { inMemoryCatalogue } from '../adapters/catalogue/in-memory-catalogue.js';
import { readProfileFromDirectory } from '../adapters/inbound/json-profile.js';
import { jsonGridSource } from '../adapters/inbound/json-grid.js';
import { jsonStreamSink } from '../adapters/outbound/json-evaluation.js';
import { builtInEvaluators } from '../criteria/index.js';

export interface Options {
  readonly profileDir: string | undefined;
  readonly gridPath: string;
  readonly minAxes: number | undefined;
  readonly format: 'json';
  readonly help: boolean;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_GRID = resolve(HERE, '../../presets/aidd.json');

export const USAGE =
  'usage: laivel-up --profile <dir> [--grid <preset.json>] [--min-axes <n>] [--format json]\n';

export function parseArgs(argv: readonly string[]): Result<Options, string> {
  let profileDir: string | undefined;
  let gridPath = DEFAULT_GRID;
  let minAxes: number | undefined;
  let format = 'json' as const;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }

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
      i += 1;
    } else if (arg === '--format') {
      if (next === undefined) {
        return err('missing value for --format');
      }
      if (next !== 'json') {
        return err(`invalid --format value: ${next} (expected: json)`);
      }
      format = 'json';
      i += 1;
    } else {
      return err(`unknown flag: ${String(arg)}`);
    }
  }

  if (!help && profileDir === undefined) {
    return err('missing required flag: --profile');
  }

  return ok({ profileDir, gridPath, minAxes, format, help });
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

  const { profileDir } = options;
  if (profileDir === undefined) {
    // Unreachable: parseArgs rejects a missing --profile outside the help path.
    argError('missing required flag: --profile');
  }

  const profileResult = readProfileFromDirectory(profileDir);
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
