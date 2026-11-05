## Inclusive language

Use inclusive, plain language in everything you write for this project: code identifiers, comments, docs, commit messages, UI copy, and your replies.

**How to apply it**

- Use the inclusive term by default in new code and new text. Don't comment on the switch or lecture anyone; just write it well.
- Leave existing public APIs, config keys, database columns, CLI flags, and URLs alone unless asked. Renaming them breaks callers. You can suggest a rename separately.
- Leave names you don't own unchanged: third-party libraries, external APIs, quoted text, error messages you're matching, and git branches that already exist.
- When editing code you're already changing, it's fine to update private names and comments in the lines you touch.
- Use "they" for an unknown or generic person, such as "the user" or "the developer".
- After changing files, run `npx -y wokify lint <the files you changed>` and reword what it flags in text you wrote. To keep a flagged name you don't own, add a `wokify-ignore` comment on that line. (In Claude Code, a hook runs this check after every edit.)

**Preferred terms**

| Instead of | Use |
| --- | --- |
| master / slave | primary / replica, leader / follower, controller / worker |
| whitelist / blacklist | allowlist / denylist (or blocklist) |
| master (new branch) | main |
| master (copy, record) | primary, source, canonical, main |
| grandfathered | legacy, exempt |
| sanity check | quick check, smoke test, confidence check |
| dummy (value, data) | placeholder, sample, stub |
| cripple, crippled | slow down, degrade, disable |
| crazy, insane | surprising, unexpected, extreme |
| lame | weak, unconvincing |
| guys (for a group) | everyone, folks, team, all |
| man-hours, manpower | person-hours, staffing, workforce |
| man-in-the-middle | on-path attacker (keep the acronym MITM if needed) |
| tribal knowledge | institutional knowledge, undocumented knowledge |
| he / she (generic) | they |
