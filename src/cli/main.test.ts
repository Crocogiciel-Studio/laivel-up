import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseArgs } from './main.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const TSX_BIN = resolve(ROOT, 'node_modules/.bin/tsx');
const CLI_ENTRY = resolve(ROOT, 'src/cli/main.ts');
const PROFILE_DIR = resolve(ROOT, 'examples/dev-sample');
const GRID_PATH = resolve(ROOT, 'presets/aidd.json');

function runCli(args: readonly string[]): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  const result = spawnSync(TSX_BIN, [CLI_ENTRY, ...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('parseArgs', () => {
  it('accepts valid full args', () => {
    const result = parseArgs(['--profile', 'some-dir', '--grid', 'some-grid.json', '--min-axes', '2', '--format', 'json']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        profileDir: 'some-dir',
        gridPath: 'some-grid.json',
        minAxes: 2,
        format: 'json',
        help: false,
      });
    }
  });

  it('accepts --help alone without requiring --profile', () => {
    const result = parseArgs(['--help']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.help).toBe(true);
    }
  });

  it('accepts -h as a short alias for --help', () => {
    const result = parseArgs(['-h']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.help).toBe(true);
    }
  });

  it('rejects an unknown flag', () => {
    const result = parseArgs(['--profile', 'some-dir', '--bogus']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('unknown flag');
    }
  });

  it('rejects --format outside the accepted enum', () => {
    const result = parseArgs(['--profile', 'some-dir', '--format', 'yaml']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('invalid --format value');
    }
  });

  it('rejects a missing value for --grid', () => {
    const result = parseArgs(['--profile', 'some-dir', '--grid']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('missing value for --grid');
    }
  });

  it('rejects a missing --profile', () => {
    const result = parseArgs([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('missing required flag: --profile');
    }
  });
});

describe('CLI end-to-end', () => {
  it('prints parsable JSON to stdout and exits 0 for --format json', () => {
    const { status, stdout } = runCli(['-p', PROFILE_DIR, '-g', GRID_PATH, '--format', 'json']);
    expect(status).toBe(0);
    expect(() => {
      JSON.parse(stdout);
    }).not.toThrow();
  });

  it('prints usage and exits 0 for --help', () => {
    const { status, stdout, stderr } = runCli(['--help']);
    expect(status).toBe(0);
    expect(stdout).toContain('usage:');
    expect(stderr).toBe('');
  });

  it('exits 2 for an unknown flag', () => {
    const { status } = runCli(['-p', PROFILE_DIR, '--bogus']);
    expect(status).toBe(2);
  });

  it('exits 2 for --format yaml', () => {
    const { status } = runCli(['-p', PROFILE_DIR, '-g', GRID_PATH, '--format', 'yaml']);
    expect(status).toBe(2);
  });
});
