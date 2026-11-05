#!/usr/bin/env node
import { init, uninstall, RULES, VERSION } from '../lib/index.js';
import { relative } from 'node:path';
import { homedir } from 'node:os';

const HELP = `wokify ${VERSION}
Adds inclusive-language guidance to the context files Claude Code and Codex read.

Usage
  npx wokify init        Add or update the rules in ./CLAUDE.md and ./AGENTS.md
  npx wokify uninstall   Remove the rules, leaving the rest of each file as it was
  npx wokify print       Print the rules to the terminal

Options
  --global       Use ~/.claude/CLAUDE.md and ~/.codex/AGENTS.md (every project)
  --dir <path>   Use a different project folder (default: current folder)
  --claude-only  Only touch CLAUDE.md
  --codex-only   Only touch AGENTS.md
  --dry-run      Show what would change without writing anything
  -h, --help     Show this help
  -v, --version  Show the version`;

function parse(argv) {
  const opts = { claude: true, codex: true };
  let command;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--global' || a === '-g') opts.global = true;
    else if (a === '--dir') {
      opts.dir = argv[++i];
      if (!opts.dir) fail('--dir needs a path');
    } else if (a.startsWith('--dir=')) opts.dir = a.slice(6);
    else if (a === '--claude-only') opts.codex = false;
    else if (a === '--codex-only') opts.claude = false;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '-h' || a === '--help') command = 'help';
    else if (a === '-v' || a === '--version') command = 'version';
    else if (a.startsWith('-')) fail(`Unknown option: ${a}`);
    else if (!command) command = a;
    else fail(`Unexpected argument: ${a}`);
  }
  if (!opts.claude && !opts.codex) fail('Pick one of --claude-only or --codex-only, not both');
  if (opts.global && opts.dir) fail('Use --global or --dir, not both');
  return { command: command ?? 'help', opts };
}

function fail(msg) {
  console.error(`wokify: ${msg}\nRun "npx wokify --help" for usage.`);
  process.exit(1);
}

function show(file) {
  const rel = relative(process.cwd(), file);
  if (!rel.startsWith('..')) return rel || file;
  return file.startsWith(homedir()) ? `~${file.slice(homedir().length)}` : file;
}

function report(results, dryRun) {
  const width = Math.max(...results.map((r) => show(r.file).length));
  for (const r of results) {
    const note = r.note ? ` (${r.note})` : '';
    console.log(`  ${show(r.file).padEnd(width)}  ${r.status}${note}`);
  }
  if (dryRun) console.log('\nDry run: nothing was written.');
}

const { command, opts } = parse(process.argv.slice(2));

switch (command) {
  case 'init':
  case 'install':
  case 'update': {
    console.log(`wokify ${VERSION}: adding inclusive-language rules\n`);
    report(init(opts), opts.dryRun);
    if (!opts.dryRun) console.log('\nDone. Claude Code and Codex pick up the rules in their next session.');
    break;
  }
  case 'uninstall':
  case 'remove': {
    console.log(`wokify ${VERSION}: removing inclusive-language rules\n`);
    report(uninstall(opts), opts.dryRun);
    break;
  }
  case 'print':
    console.log(RULES);
    break;
  case 'version':
    console.log(VERSION);
    break;
  case 'help':
    console.log(HELP);
    break;
  default:
    fail(`Unknown command: ${command}`);
}
