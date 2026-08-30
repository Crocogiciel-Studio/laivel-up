#!/usr/bin/env node
// One command to see an evaluation rendered:
//
//   pnpm viz                        # evaluates examples/dev-sample
//   pnpm viz -p test/fixtures/profiles/arthur
//   pnpm viz -p <dir> -g <preset.json>
//
// Builds the core if needed, evaluates the profile, drops the JSON where the
// viewer's dev server picks it up, then opens the browser.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (...names) => {
  for (const name of names) {
    const i = argv.indexOf(name);
    if (i !== -1 && argv[i + 1] !== undefined) return argv[i + 1];
  }
  return undefined;
};

const profile = flag('--profile', '-p') ?? 'examples/dev-sample';
const grid = flag('--grid', '-g') ?? 'presets/aidd.json';
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });

if (!existsSync(resolve(root, 'dist/cli/main.js'))) {
  process.stderr.write('building core (one-time)…\n');
  execFileSync('pnpm', ['build'], { cwd: root, stdio: 'inherit' });
}

let json;
try {
  json = run('node', ['dist/cli/main.js', '--profile', profile, '--grid', grid]);
} catch {
  process.stderr.write(`\nevaluation failed for "${profile}" — check the path and the preset.\n`);
  process.exit(1);
}

mkdirSync(resolve(root, 'ui/public'), { recursive: true });
writeFileSync(resolve(root, 'ui/public/evaluation.json'), json);
process.stderr.write(`evaluated ${profile} → opening the viewer (Ctrl+C to stop)…\n`);

try {
  execFileSync('pnpm', ['-C', 'ui', 'exec', 'vite', '--open'], { cwd: root, stdio: 'inherit' });
} catch {
  // vite exits non-zero on Ctrl+C — nothing to report.
}
