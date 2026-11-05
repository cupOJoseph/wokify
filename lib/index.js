import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { installHook, removeHook } from './claude-hook.js';

export { lintSource, lintPaths, runHook } from './lint.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
export const RULES = readFileSync(join(ROOT, 'RULES.md'), 'utf8').trim();

const START = '<!-- wokify:start';
const END = '<!-- wokify:end -->';
const BLOCK_RE = /\n*<!-- wokify:start[^>]*-->[\s\S]*?<!-- wokify:end -->\n*/g;

export function block() {
  return `${START} v${VERSION} (managed by wokify; edits here are overwritten) -->\n${RULES}\n${END}`;
}

/** The context files to manage, for a project folder or for the user's global config. */
export function targets({ dir = process.cwd(), global = false, claude = true, codex = true } = {}) {
  const list = [];
  if (global) {
    const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
    if (claude) list.push({ tool: 'Claude Code', file: join(homedir(), '.claude', 'CLAUDE.md') });
    if (codex) list.push({ tool: 'Codex', file: join(codexHome, 'AGENTS.md') });
  } else {
    const base = resolve(dir);
    if (claude) list.push({ tool: 'Claude Code', file: join(base, 'CLAUDE.md') });
    if (codex) list.push({ tool: 'Codex', file: join(base, 'AGENTS.md') });
  }
  return list;
}

function read(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function realpath(file) {
  try { return realpathSync(file); } catch { return resolve(file); }
}

/**
 * Skip a CLAUDE.md that already pulls in AGENTS.md (via `@AGENTS.md` or a symlink),
 * so Claude doesn't load the rules twice.
 */
function claudeReadsAgents(list) {
  const claude = list.find((t) => t.file.endsWith('CLAUDE.md'));
  const agents = list.find((t) => t.file.endsWith('AGENTS.md'));
  if (!claude || !agents) return false;
  if (existsSync(claude.file) && existsSync(agents.file) && realpath(claude.file) === realpath(agents.file)) return true;
  const text = read(claude.file);
  return text != null && /^\s*@(\.\/)?AGENTS\.md\s*$/m.test(text);
}

export function stripBlock(text) {
  const stripped = text.replace(BLOCK_RE, '\n\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
  return stripped.trim() ? stripped.replace(/\n*$/, '\n') : '';
}

export function withBlock(text) {
  const rest = stripBlock(text ?? '');
  return rest ? `${rest.replace(/\n*$/, '')}\n\n${block()}\n` : `${block()}\n`;
}

/** Add or refresh the rules block. Returns one result per target file. */
export function init(opts = {}) {
  const list = targets(opts);
  const skipClaude = claudeReadsAgents(list);
  const results = [];
  const written = new Set();
  for (const t of list) {
    if (skipClaude && t.file.endsWith('CLAUDE.md')) {
      results.push({ ...t, status: 'skipped', note: 'already loads AGENTS.md' });
      continue;
    }
    const real = realpath(t.file);
    if (written.has(real)) {
      results.push({ ...t, status: 'skipped', note: 'same file as above' });
      continue;
    }
    const before = read(t.file);
    const after = withBlock(before);
    let status = before == null ? 'created' : before.includes(START) ? 'updated' : 'added';
    if (before === after) status = 'unchanged';
    if (status !== 'unchanged' && !opts.dryRun) {
      mkdirSync(dirname(t.file), { recursive: true });
      writeFileSync(t.file, after);
    }
    written.add(real);
    results.push({ ...t, status });
  }
  if (opts.claude !== false && opts.hook !== false) results.push(installHook({ ...opts, version: VERSION }));
  return results;
}

/** Remove the rules block, leaving the rest of each file as it was. */
export function uninstall(opts = {}) {
  const results = targets(opts).map((t) => {
    const before = read(t.file);
    if (before == null || !before.includes(START)) return { ...t, status: 'not present' };
    const after = stripBlock(before);
    if (!opts.dryRun) {
      if (after) writeFileSync(t.file, after);
      else unlinkSync(t.file);
    }
    return { ...t, status: 'removed', note: after ? undefined : 'file only held the rules, so it was deleted' };
  });
  if (opts.claude !== false) results.push(removeHook(opts));
  return results;
}
