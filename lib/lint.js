import { markdown, html, text } from 'alex';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative, resolve, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const MARKDOWN = new Set(['.md', '.markdown', '.mdx', '.mdown', '.mkd']);
const HTML = new Set(['.html', '.htm']);
const TEXT = new Set([
  '.txt', '.rst', '.adoc',
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.vue', '.svelte', '.astro',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.kts', '.swift', '.scala', '.dart',
  '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.m', '.mm',
  '.php', '.lua', '.ex', '.exs', '.erl', '.clj', '.hs', '.ml', '.r', '.jl', '.pl',
  '.sh', '.bash', '.zsh', '.fish', '.ps1',
  '.sql', '.graphql', '.gql', '.proto', '.tf', '.yml', '.yaml', '.toml', '.ini',
  '.css', '.scss', '.less',
]);
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', 'coverage', 'vendor',
  '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', '.venv', 'venv', '__pycache__', 'target',
]);
const MAX_BYTES = 1024 * 1024;
const BLOCK_RE = /<!-- wokify:start[^>]*-->[\s\S]*?<!-- wokify:end -->/g;

/** Whether wokify knows how to lint this file type. */
export function isLintable(file) {
  const ext = extname(file).toLowerCase();
  return MARKDOWN.has(ext) || HTML.has(ext) || TEXT.has(ext);
}

/** Alex options from .alexrc / .alexrc.json / package.json "alex", with wokify's defaults. */
export function loadConfig(dir = process.cwd()) {
  const config = { profanitySureness: 1 };
  for (const name of ['.alexrc', '.alexrc.json']) {
    const file = join(dir, name);
    if (existsSync(file)) {
      try { return { ...config, ...JSON.parse(readFileSync(file, 'utf8')) }; } catch {}
    }
  }
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    if (pkg.alex && typeof pkg.alex === 'object') return { ...config, ...pkg.alex };
  } catch {}
  return config;
}

/** Blank out wokify's own rules block (it lists the flagged terms on purpose), keeping line numbers. */
function maskRulesBlock(source) {
  return source.replace(BLOCK_RE, (m) => m.replace(/[^\n]/g, ' '));
}

function ignoredLines(source) {
  const ignored = new Set();
  source.split('\n').forEach((line, i) => {
    if (line.includes('wokify-ignore-next-line')) ignored.add(i + 2);
    else if (line.includes('wokify-ignore')) ignored.add(i + 1);
  });
  return ignored;
}

function shorten(m) {
  if (m.source === 'retext-equality' && m.actual && Array.isArray(m.expected) && m.expected.length > 3) {
    const q = (s) => `\`${s}\``;
    return `${q(m.actual)} may be insensitive, use ${m.expected.slice(0, 3).map(q).join(', ')} instead`;
  }
  return m.reason;
}

/**
 * Lint one file's text. Returns [{ line, column, message, rule }], sorted, one per spot.
 * Lines with a `wokify-ignore` comment (or after `wokify-ignore-next-line`) are skipped.
 */
export function lintSource(source, file = 'file.txt', config = loadConfig()) {
  const ext = extname(file).toLowerCase();
  const masked = maskRulesBlock(source);
  const run = MARKDOWN.has(ext) ? markdown : HTML.has(ext) ? html : text;
  const vfile = run(masked, config);
  const ignored = ignoredLines(source);
  const seen = new Set();
  const out = [];
  for (const m of vfile.messages) {
    if (!m.line || ignored.has(m.line)) continue;
    const key = `${m.line}:${m.column}`;
    if (seen.has(key)) continue; // equality and profanity can flag the same word
    seen.add(key);
    out.push({ line: m.line, column: m.column, message: shorten(m), rule: m.ruleId });
  }
  return out;
}

export function lintFile(file, config) {
  if (statSync(file).size > MAX_BYTES) return [];
  return lintSource(readFileSync(file, 'utf8'), file, config);
}

function gitFiles(dir) {
  try {
    const out = execFileSync('git', ['-C', dir, 'ls-files', '-co', '--exclude-standard', '-z'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
    });
    return out.split('\0').filter(Boolean).map((f) => join(dir, f));
  } catch {
    return null;
  }
}

function walk(dir, list = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) walk(join(dir, entry.name), list);
    } else if (entry.isFile()) list.push(join(dir, entry.name));
  }
  return list;
}

/** Expand paths into the files to lint. Folders use git's file list when they can (so .gitignore applies). */
export function collectFiles(paths) {
  const files = new Set();
  for (const p of paths) {
    const abs = resolve(p);
    if (!existsSync(abs)) throw new Error(`No such file or folder: ${p}`);
    if (statSync(abs).isDirectory()) {
      const list = gitFiles(abs) ?? walk(abs);
      for (const f of list) {
        const parts = relative(abs, f).split(/[\\/]/);
        if (parts.some((part) => SKIP_DIRS.has(part))) continue;
        if (/^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/.test(basename(f))) continue;
        if (isLintable(f) && existsSync(f)) files.add(f);
      }
    } else {
      files.add(abs); // a file named directly is always linted
    }
  }
  return [...files].sort();
}

/** Lint paths. Returns [{ file, issues }] for files with issues, plus the number of files checked. */
export function lintPaths(paths = ['.'], config = loadConfig()) {
  const files = collectFiles(paths);
  const results = [];
  for (const file of files) {
    const issues = lintFile(file, config);
    if (issues.length) results.push({ file, issues });
  }
  return { results, checked: files.length };
}

/** Line ranges (1-based, inclusive) that a Claude Code edit just wrote, or null for the whole file. */
export function changedRanges(source, toolName, input) {
  if (toolName === 'Write') return null;
  const pieces = toolName === 'MultiEdit'
    ? (input.edits ?? []).map((e) => e.new_string)
    : [input.new_string];
  const ranges = [];
  for (const piece of pieces) {
    if (typeof piece !== 'string' || !piece.trim()) continue;
    let from = 0;
    let idx;
    while ((idx = source.indexOf(piece, from)) !== -1) {
      const start = source.slice(0, idx).split('\n').length;
      ranges.push([start, start + piece.split('\n').length - 1]);
      from = idx + Math.max(piece.length, 1);
    }
  }
  return ranges;
}

/**
 * Claude Code PostToolUse hook. Reads the hook JSON from stdin and lints only the lines the
 * edit wrote. Returns the feedback text for Claude, or '' when there's nothing to report.
 */
export function runHook(payload) {
  const toolName = payload.tool_name;
  const input = payload.tool_input ?? {};
  const file = input.file_path;
  if (!file || !['Write', 'Edit', 'MultiEdit'].includes(toolName)) return '';
  if (!isLintable(file) || !existsSync(file)) return '';
  if (relative(payload.cwd ?? process.cwd(), file).split(/[\\/]/).some((p) => SKIP_DIRS.has(p))) return '';

  const source = readFileSync(file, 'utf8');
  if (source.length > MAX_BYTES) return '';
  const config = loadConfig(payload.cwd ?? process.cwd());
  let issues = lintSource(source, file, config);
  const ranges = changedRanges(source, toolName, input);
  if (ranges) issues = issues.filter((i) => ranges.some(([a, b]) => i.line >= a && i.line <= b));
  if (!issues.length) return '';

  const shown = relative(payload.cwd ?? process.cwd(), file) || file;
  const lines = issues.map((i) => `  ${shown}:${i.line}:${i.column}  ${i.message}`);
  return [
    `wokify found ${issues.length} inclusive-language ${issues.length === 1 ? 'issue' : 'issues'} in the text you just wrote:`,
    ...lines,
    'Reword these in new text. If one is a name you must keep (an existing public API, a third-party name, quoted text), leave it and add a `wokify-ignore` comment on that line.',
  ].join('\n');
}
