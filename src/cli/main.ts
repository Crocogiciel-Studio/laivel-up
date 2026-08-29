import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { evaluate } from '../core/index.js';
import { inMemoryCatalogue } from '../adapters/catalogue/in-memory-catalogue.js';
import { readDossierFromDirectory } from '../adapters/inbound/json-dossier.js';
import { jsonGrilleSource } from '../adapters/inbound/json-grille.js';
import { jsonStreamSink } from '../adapters/outbound/json-resultat.js';
import { builtInEvaluators } from '../criteria/index.js';

interface CliArgs {
  readonly dossierDir: string | undefined;
  readonly grillePath: string;
  readonly minAxes: number | undefined;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_GRILLE = resolve(HERE, '../../presets/aidd.json');

function parseArgs(argv: readonly string[]): CliArgs {
  let dossierDir: string | undefined;
  let grillePath = DEFAULT_GRILLE;
  let minAxes: number | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === '--dossier' || arg === '-d') && next !== undefined) {
      dossierDir = next;
      i += 1;
    } else if ((arg === '--grille' || arg === '-g') && next !== undefined) {
      grillePath = next;
      i += 1;
    } else if (arg === '--min-axes' && next !== undefined) {
      minAxes = Number(next);
      i += 1;
    }
  }
  return { dossierDir, grillePath, minAxes };
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
  if (args.dossierDir === undefined) {
    fail('usage: laivel-up --dossier <profile-dir> [--grille <preset.json>] [--min-axes <n>]');
  }

  const dossierResult = readDossierFromDirectory(args.dossierDir);
  if (!dossierResult.ok) {
    fail(dossierResult.error.message, dossierResult.error.issues);
  }

  const grilleResult = jsonGrilleSource(args.grillePath).load();
  if (!grilleResult.ok) {
    fail(grilleResult.error.message, grilleResult.error.issues);
  }

  const catalogue = inMemoryCatalogue(builtInEvaluators);
  const options = args.minAxes === undefined ? {} : { minRuledAxes: args.minAxes };
  const resultat = evaluate(dossierResult.value, grilleResult.value, catalogue, options);

  const emitted = jsonStreamSink().emit(resultat);
  if (!emitted.ok) {
    fail(emitted.error.message);
  }
}

main();
