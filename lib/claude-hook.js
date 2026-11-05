import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

const MATCHER = 'Write|Edit|MultiEdit';

export function hookCommand(version) {
  return `npx -y wokify@${version} lint --hook`;
}

export function settingsFile({ dir = process.cwd(), global = false } = {}) {
  return global ? join(homedir(), '.claude', 'settings.json') : join(resolve(dir), '.claude', 'settings.json');
}

const isOurs = (h) => typeof h?.command === 'string' && /\bwokify(@[^\s]+)?\s+lint\s+--hook\b/.test(h.command);

function readSettings(file) {
  if (!existsSync(file)) return { settings: {} };
  const raw = readFileSync(file, 'utf8');
  if (!raw.trim()) return { settings: {} };
  try {
    const settings = JSON.parse(raw);
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error();
    return { settings, raw };
  } catch {
    return { error: 'could not read it as JSON, so it was left alone' };
  }
}

/** Remove wokify's hook entries. Returns true if anything was removed. */
function strip(settings) {
  const list = settings.hooks?.PostToolUse;
  if (!Array.isArray(list)) return false;
  let removed = false;
  const kept = [];
  for (const entry of list) {
    const hooks = Array.isArray(entry?.hooks) ? entry.hooks : [];
    const rest = hooks.filter((h) => !isOurs(h));
    if (rest.length !== hooks.length) removed = true;
    if (rest.length) kept.push({ ...entry, hooks: rest });
    else if (!hooks.length) kept.push(entry);
  }
  if (kept.length) settings.hooks.PostToolUse = kept;
  else delete settings.hooks.PostToolUse;
  if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  return removed;
}

function write(file, settings) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
}

/** Add (or refresh) the PostToolUse hook that lints each file Claude Code edits. */
export function installHook({ version, dryRun, ...opts }) {
  const file = settingsFile(opts);
  const base = { tool: 'Claude Code hook', file };
  const { settings, raw, error } = readSettings(file);
  if (error) return { ...base, status: 'skipped', note: error };
  const had = strip(settings);
  settings.hooks ??= {};
  settings.hooks.PostToolUse ??= [];
  settings.hooks.PostToolUse.push({
    matcher: MATCHER,
    hooks: [{ type: 'command', command: hookCommand(version), timeout: 60 }],
  });
  const next = `${JSON.stringify(settings, null, 2)}\n`;
  if (raw === next) return { ...base, status: 'unchanged' };
  if (!dryRun) write(file, settings);
  const status = had ? 'updated' : raw === undefined ? 'created' : 'added';
  return { ...base, status, note: 'Claude Code hook that lints each file it edits' };
}

/** Remove the hook, leaving other settings as they were. */
export function removeHook({ dryRun, ...opts }) {
  const file = settingsFile(opts);
  const base = { tool: 'Claude Code hook', file };
  const { settings, error } = readSettings(file);
  if (error) return { ...base, status: 'skipped', note: error };
  if (!strip(settings)) return { ...base, status: 'not present' };
  const empty = !Object.keys(settings).length;
  if (!dryRun) {
    if (empty) unlinkSync(file);
    else write(file, settings);
  }
  return { ...base, status: 'removed', note: empty ? 'file only held the hook, so it was deleted' : undefined };
}
