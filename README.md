# wokify

Teach your AI coding assistant to use inclusive language.

`wokify` adds a short set of inclusive-language guidelines to the context files that **Claude Code** (`CLAUDE.md`) and **Codex** (`AGENTS.md`) read at the start of every session. New code, comments, docs, and commit messages come out with terms like `allowlist`, `primary / replica`, and `main`, with no linter fixes needed afterward.

## Quick start

Run this in your project folder:

```bash
npx wokify init
```

That adds the guidelines to `CLAUDE.md` and `AGENTS.md`, creating them if needed. Commit both files so your whole team gets the same behavior.

To apply them to every project on your machine instead:

```bash
npx wokify init --global
```

That writes to `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` (or `$CODEX_HOME/AGENTS.md`).

## What it adds

The guidelines ask the assistant to:

- use inclusive terms by default in new code and text, without commenting on it
- leave existing public APIs, config keys, and outside names alone, so nothing breaks
- use "they" for a generic person

They come with a table of preferred terms. Run `npx wokify print` to see the full text, or read [RULES.md](RULES.md).

## Commands

| Command | What it does |
| --- | --- |
| `npx wokify init` | Adds the guidelines, or updates them to the current version |
| `npx wokify uninstall` | Removes the guidelines and leaves the rest of each file as it was |
| `npx wokify print` | Prints the guidelines |

| Option | What it does |
| --- | --- |
| `--global` | Uses your user-level files instead of the project's |
| `--dir <path>` | Uses a different project folder |
| `--claude-only` | Only touches `CLAUDE.md` |
| `--codex-only` | Only touches `AGENTS.md` |
| `--dry-run` | Shows what would change without writing anything |

## How it works

The guidelines sit between two markers in each file:

```md
<!-- wokify:start v0.1.0 ... -->
...
<!-- wokify:end -->
```

Everything outside the markers is yours and stays untouched. Running `init` again replaces only what's between them, which is how updates work. If your `CLAUDE.md` already loads `AGENTS.md` (with an `@AGENTS.md` line or a symlink), the guidelines go in `AGENTS.md` only, so Claude reads them once.

The package never runs install scripts. Nothing changes until you run `init`.

## Using it from code

```js
import { init, uninstall, RULES } from 'wokify';

init({ dir: './my-project' });          // same options as the CLI
console.log(RULES);                     // the guidelines as markdown
```

The markdown file is also available at `wokify/RULES.md`.

## Pairs well with

[alex](https://alexjs.com) catches insensitive wording in files you already have. `wokify` shapes what your assistant writes, and alex checks the result.

## License

MIT
