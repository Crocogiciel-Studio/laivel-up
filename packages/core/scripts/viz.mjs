#!/usr/bin/env node
// One command to see evaluations rendered:
//
//   pnpm viz                       # every profile in test/fixtures/profiles/
//   pnpm viz arthur                # just that fixture
//   pnpm viz -p <dir> -g <preset.json>
//
// Rebuilds the core, evaluates the profile(s), drops the JSON where the viewer's
// dev server picks it up, then opens the browser.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = 'usage: pnpm viz [<profile-name-or-dir>] [-p <dir>] [-g <preset.json>]';
const die = (msg) => {
  process.stderr.write(`${msg}\n${USAGE}\n`);
  process.exit(1);
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const consumed = new Set();
const flag = (...names) => {
  for (const name of names) {
    const i = argv.indexOf(name);
    if (i === -1) continue;
    if (argv[i + 1] === undefined || argv[i + 1].startsWith('-')) die(`${name} needs a value`);
    consumed.add(i).add(i + 1);
    return argv[i + 1];
  }
  return undefined;
};

const FIXTURES = 'test/fixtures/profiles';
const grid = flag('--grid', '-g') ?? 'presets/aidd.json';
const publicDir = resolve(root, '../viewer/public');
const evalDir = resolve(publicDir, 'evaluations');

/** `--profile`/`-p`, or a bare positional; a path as-is, or a name under the fixtures dir. */
const positional = argv.find((a, i) => !consumed.has(i) && !a.startsWith('-'));
const asked = flag('--profile', '-p') ?? positional;
const resolveProfile = (v) => {
  if (v.includes('/')) return v;
  if (existsSync(resolve(root, FIXTURES, v))) return `${FIXTURES}/${v}`;
  if (existsSync(resolve(root, 'examples', v))) return `examples/${v}`;
  return v;
};

// Always rebuild — skipping when dist/ merely exists would render a stale
// engine's output after any src/ edit, with nothing saying so.
process.stderr.write('building core…\n');
execFileSync('pnpm', ['build'], { cwd: root, stdio: 'inherit' });

const evaluate = (profileDir) =>
  execFileSync('node', ['dist/cli/main.js', '--profile', profileDir, '--grid', grid], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'inherit'],
  });

mkdirSync(publicDir, { recursive: true });
rmSync(evalDir, { recursive: true, force: true });
rmSync(resolve(publicDir, 'evaluation.json'), { force: true });

try {
  if (asked === undefined) {
    const names = readdirSync(resolve(root, FIXTURES), { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(resolve(root, FIXTURES, e.name, 'profile.json')))
      .map((e) => e.name)
      .sort();
    if (names.length === 0) throw new Error(`no profiles under ${FIXTURES}`);
    mkdirSync(evalDir, { recursive: true });
    for (const name of names) {
      writeFileSync(resolve(evalDir, `${name}.json`), evaluate(`${FIXTURES}/${name}`));
    }
    writeFileSync(resolve(evalDir, 'index.json'), JSON.stringify(names));
    process.stderr.write(`evaluated ${String(names.length)} profiles: ${names.join(', ')}\n`);
  } else {
    const profileDir = resolveProfile(asked);
    writeFileSync(resolve(publicDir, 'evaluation.json'), evaluate(profileDir));
    process.stderr.write(`evaluated ${profileDir}\n`);
  }
} catch (err) {
  process.stderr.write(`\nevaluation failed: ${err.message}\n`);
  process.exit(1);
}

process.stderr.write('opening the viewer (Ctrl+C to stop)…\n');
try {
  execFileSync('pnpm', ['-C', '../viewer', 'exec', 'vite', '--open'], { cwd: root, stdio: 'inherit' });
} catch {
  // vite exits non-zero on Ctrl+C — nothing to report.
}
