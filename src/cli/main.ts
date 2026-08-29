import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { evaluate } from '../core/index.js';
import { inMemoryCatalogue } from '../adapters/catalogue/in-memory-catalogue.js';
import { readProfileFromDirectory } from '../adapters/inbound/json-profile.js';
import { jsonGridSource } from '../adapters/inbound/json-grid.js';
import { jsonStreamSink } from '../adapters/outbound/json-evaluation.js';
import { builtInEvaluators } from '../criteria/index.js';

interface CliArgs {
  readonly profileDir: string | undefined;
  readonly gridPath: string;
  readonly minAxes: number | undefined;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_GRID = resolve(HERE, '../../presets/aidd.json');

function parseArgs(argv: readonly string[]): CliArgs {
  let profileDir: string | undefined;
  let gridPath = DEFAULT_GRID;
  let minAxes: number | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === '--profile' || arg === '-p') && next !== undefined) {
      profileDir = next;
      i += 1;
    } else if ((arg === '--grid' || arg === '-g') && next !== undefined) {
      gridPath = next;
      i += 1;
    } else if (arg === '--min-axes' && next !== undefined) {
      minAxes = Number(next);
      i += 1;
    }
  }
  return { profileDir, gridPath, minAxes };
}

function fail(message: string, issues: readonly string[] = []): never {
  process.stderr.write(`error: ${message}\n`);
  for (const issue of issues) {
    process.stderr.write(`  - ${issue}\n`);
  }
  process.exit(1);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.profileDir === undefined) {
    fail('usage: laivel-up --profile <profile-dir> [--grid <preset.json>] [--min-axes <n>]');
  }

  const profileResult = readProfileFromDirectory(args.profileDir);
  if (!profileResult.ok) {
    fail(profileResult.error.message, profileResult.error.issues);
  }

  const gridResult = jsonGridSource(args.gridPath).load();
  if (!gridResult.ok) {
    fail(gridResult.error.message, gridResult.error.issues);
  }

  const catalogue = inMemoryCatalogue(builtInEvaluators);
  const options = args.minAxes === undefined ? {} : { minRuledAxes: args.minAxes };
  const evaluation = evaluate(profileResult.value, gridResult.value, catalogue, options);

  const emitted = jsonStreamSink().emit(evaluation);
  if (!emitted.ok) {
    fail(emitted.error.message);
  }
}

main();
