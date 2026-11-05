import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { init, uninstall, block } from '../lib/index.js';

const BIN = join(import.meta.dirname, '..', 'bin', 'wokify.js');
const tmp = () => mkdtempSync(join(tmpdir(), 'wokify-'));
const read = (dir, f) => readFileSync(join(dir, f), 'utf8');
const count = (s) => s.split('wokify:start').length - 1;

test('creates both files in an empty project', () => {
  const dir = tmp();
  const r = init({ dir });
  assert.deepEqual(r.map((x) => x.status), ['created', 'created', 'created']);
  assert.equal(read(dir, 'CLAUDE.md'), `${block()}\n`);
  assert.equal(read(dir, 'AGENTS.md'), `${block()}\n`);
});

test('appends to existing content and keeps it intact', () => {
  const dir = tmp();
  const original = '# My project\n\nUse pnpm.\n';
  writeFileSync(join(dir, 'CLAUDE.md'), original);
  init({ dir });
  const text = read(dir, 'CLAUDE.md');
  assert.ok(text.startsWith(original));
  assert.equal(count(text), 1);
});

test('running init twice changes nothing', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'AGENTS.md'), '# Notes\n');
  init({ dir });
  const first = read(dir, 'AGENTS.md');
  const r = init({ dir });
  assert.deepEqual(r.map((x) => x.status), ['unchanged', 'unchanged', 'unchanged']);
  assert.equal(read(dir, 'AGENTS.md'), first);
});

test('replaces an older block in place, keeping content after it', () => {
  const dir = tmp();
  writeFileSync(
    join(dir, 'AGENTS.md'),
    '# Top\n\n<!-- wokify:start v0.0.1 -->\nold rules\n<!-- wokify:end -->\n\n## Bottom\n',
  );
  const [, agents] = init({ dir });
  assert.equal(agents.status, 'updated');
  const text = read(dir, 'AGENTS.md');
  assert.ok(!text.includes('old rules'));
  assert.ok(text.includes('# Top') && text.includes('## Bottom'));
  assert.equal(count(text), 1);
});

test('uninstall restores the original file and deletes files it created', () => {
  const dir = tmp();
  const original = '# My project\n\nUse pnpm.\n';
  writeFileSync(join(dir, 'CLAUDE.md'), original);
  init({ dir });
  const r = uninstall({ dir });
  assert.deepEqual(r.map((x) => x.status), ['removed', 'removed', 'removed']);
  assert.equal(read(dir, 'CLAUDE.md'), original);
  assert.ok(!existsSync(join(dir, 'AGENTS.md')));
});

test('skips CLAUDE.md when it already imports AGENTS.md', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'CLAUDE.md'), '@AGENTS.md\n');
  const [claude, agents] = init({ dir });
  assert.equal(claude.status, 'skipped');
  assert.equal(agents.status, 'created');
  assert.equal(read(dir, 'CLAUDE.md'), '@AGENTS.md\n');
});

test('writes once when CLAUDE.md is a symlink to AGENTS.md', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'AGENTS.md'), '# Shared\n');
  symlinkSync('AGENTS.md', join(dir, 'CLAUDE.md'));
  init({ dir });
  assert.equal(count(read(dir, 'AGENTS.md')), 1);
});

test('dry run writes nothing', () => {
  const dir = tmp();
  const r = init({ dir, dryRun: true });
  assert.deepEqual(r.map((x) => x.status), ['created', 'created', 'created']);
  assert.ok(!existsSync(join(dir, 'CLAUDE.md')));
});

test('--global writes to the home folder and honors CODEX_HOME', () => {
  const home = tmp();
  const codexHome = join(home, 'custom-codex');
  const env = { ...process.env, HOME: home, CODEX_HOME: codexHome };
  execFileSync('node', [BIN, 'init', '--global'], { env });
  assert.equal(count(readFileSync(join(home, '.claude', 'CLAUDE.md'), 'utf8')), 1);
  assert.equal(count(readFileSync(join(codexHome, 'AGENTS.md'), 'utf8')), 1);
});

test('CLI --codex-only and bad flags', () => {
  const dir = tmp();
  execFileSync('node', [BIN, 'init', '--codex-only', '--dir', dir]);
  assert.ok(existsSync(join(dir, 'AGENTS.md')));
  assert.ok(!existsSync(join(dir, 'CLAUDE.md')));
  assert.throws(() => execFileSync('node', [BIN, 'init', '--nope'], { stdio: 'pipe' }));
});
