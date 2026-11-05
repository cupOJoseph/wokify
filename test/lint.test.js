import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { lintSource, lintPaths, runHook, changedRanges } from '../lib/lint.js';
import { init, uninstall, block } from '../lib/index.js';

const BIN = join(import.meta.dirname, '..', 'bin', 'wokify.js');
const tmp = () => mkdtempSync(join(tmpdir(), 'wokify-lint-'));
const words = (issues) => issues.map((i) => i.message.match(/`([^`]+)`/)[1]);
const EXAMPLE = 'The boogeyman wrote all changes to the master server, as he was tired of waiting.';

test('flags the classic example', () => {
  assert.deepEqual(words(lintSource(EXAMPLE, 'notes.md')), ['boogeyman', 'master', 'he']);
});

test('shortens long suggestion lists to three', () => {
  const [issue] = lintSource('That plan is crazy.', 'notes.md');
  assert.equal((issue.message.match(/`/g) ?? []).length, 8); // the word plus three suggestions
});

test('code: flags whitelist, leaves kill and execute alone', () => {
  const code = '// Kill the worker and execute the job\nconst whitelist = [];\n';
  assert.deepEqual(words(lintSource(code, 'app.js')), ['whitelist']);
});

test('one message per spot when equality and profanity both fire', () => {
  const issues = lintSource('The slaves were copies.', 'notes.md');
  assert.equal(issues.length, 1);
});

test('wokify-ignore comments skip a line or the next line', () => {
  const code = [
    'const a = master; // wokify-ignore',
    '// wokify-ignore-next-line',
    'const b = master;',
    'const c = master;',
  ].join('\n');
  assert.deepEqual(lintSource(code, 'x.js').map((i) => i.line), [4]);
});

test('skips the wokify rules block in CLAUDE.md', () => {
  const text = `# Notes\n\n${block()}\n\nThe master branch.\n`;
  const issues = lintSource(text, 'CLAUDE.md');
  assert.deepEqual(words(issues), ['master']);
  assert.equal(issues[0].line, text.split('\n').findIndex((l) => l.includes('The master')) + 1);
});

test('.alexrc allow list is honored', () => {
  const dir = tmp();
  writeFileSync(join(dir, '.alexrc'), JSON.stringify({ allow: ['master'] }));
  writeFileSync(join(dir, 'a.md'), EXAMPLE);
  const { results } = lintPaths([dir], JSON.parse(readFileSync(join(dir, '.alexrc'), 'utf8')));
  assert.deepEqual(words(results[0].issues), ['boogeyman', 'he']);
});

test('folder lint skips node_modules and unknown file types', () => {
  const dir = tmp();
  mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'x', 'a.md'), EXAMPLE);
  writeFileSync(join(dir, 'photo.bin'), EXAMPLE);
  writeFileSync(join(dir, 'ok.md'), 'All good here.');
  const { results, checked } = lintPaths([dir]);
  assert.equal(checked, 1);
  assert.equal(results.length, 0);
});

test('CLI lint exits 1 with issues and 0 when clean', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'bad.md'), EXAMPLE);
  writeFileSync(join(dir, 'good.md'), 'Ship it.');
  const bad = spawnSync('node', [BIN, 'lint', join(dir, 'bad.md')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /3 issues in 1 file/);
  const good = spawnSync('node', [BIN, 'lint', join(dir, 'good.md')], { encoding: 'utf8' });
  assert.equal(good.status, 0);
  assert.match(good.stdout, /All clear/);
});

test('changedRanges finds the lines an edit wrote', () => {
  const source = 'one\ntwo\nthree master\nfour\n';
  assert.deepEqual(changedRanges(source, 'Edit', { new_string: 'three master\nfour' }), [[3, 4]]);
  assert.equal(changedRanges(source, 'Write', {}), null);
});

test('hook only reports lines Claude just wrote', () => {
  const dir = tmp();
  const file = join(dir, 'doc.md');
  writeFileSync(file, 'Old line about the master node.\n\nNew line: he deploys it.\n');
  const feedback = runHook({
    tool_name: 'Edit', cwd: dir,
    tool_input: { file_path: file, old_string: 'x', new_string: 'New line: he deploys it.' },
  });
  assert.match(feedback, /doc\.md:3:\d+ +`he`/);
  assert.doesNotMatch(feedback, /master/);
});

test('hook is quiet for clean edits and unknown file types', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'a.md'), 'All good.\n');
  writeFileSync(join(dir, 'a.bin'), EXAMPLE);
  const input = (f) => ({ tool_name: 'Write', cwd: dir, tool_input: { file_path: join(dir, f) } });
  assert.equal(runHook(input('a.md')), '');
  assert.equal(runHook(input('a.bin')), '');
});

test('CLI hook mode exits 2 with feedback on stderr, 0 on bad input', () => {
  const dir = tmp();
  const file = join(dir, 'a.md');
  writeFileSync(file, EXAMPLE);
  const payload = JSON.stringify({ tool_name: 'Write', cwd: dir, tool_input: { file_path: file } });
  const r = spawnSync('node', [BIN, 'lint', '--hook'], { input: payload, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /wokify found 3 inclusive-language issues/);
  const junk = spawnSync('node', [BIN, 'lint', '--hook'], { input: 'not json', encoding: 'utf8' });
  assert.equal(junk.status, 0);
});

test('init adds the hook next to existing settings; uninstall removes only it', () => {
  const dir = tmp();
  const settingsPath = join(dir, '.claude', 'settings.json');
  mkdirSync(join(dir, '.claude'));
  const other = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi' }] };
  writeFileSync(settingsPath, JSON.stringify({ model: 'opus', hooks: { PostToolUse: [other] } }));

  init({ dir });
  init({ dir }); // twice: still one wokify hook
  const after = JSON.parse(readFileSync(settingsPath, 'utf8'));
  assert.equal(after.model, 'opus');
  assert.equal(after.hooks.PostToolUse.length, 2);
  assert.match(after.hooks.PostToolUse[1].hooks[0].command, /^npx -y wokify@\d+\.\d+\.\d+ lint --hook$/);

  uninstall({ dir });
  assert.deepEqual(JSON.parse(readFileSync(settingsPath, 'utf8')), { model: 'opus', hooks: { PostToolUse: [other] } });
});

test('uninstall deletes a settings file that only held the hook', () => {
  const dir = tmp();
  init({ dir });
  assert.ok(existsSync(join(dir, '.claude', 'settings.json')));
  uninstall({ dir });
  assert.ok(!existsSync(join(dir, '.claude', 'settings.json')));
});

test('leaves unreadable settings.json alone; --no-hook and --codex-only skip it', () => {
  const dir = tmp();
  mkdirSync(join(dir, '.claude'));
  writeFileSync(join(dir, '.claude', 'settings.json'), '{ not json');
  const hookRow = init({ dir }).at(-1);
  assert.equal(hookRow.status, 'skipped');
  assert.equal(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'), '{ not json');

  const dir2 = tmp();
  assert.equal(init({ dir: dir2, hook: false }).length, 2);
  assert.equal(init({ dir: dir2, claude: false }).length, 1);
  assert.ok(!existsSync(join(dir2, '.claude')));
});
