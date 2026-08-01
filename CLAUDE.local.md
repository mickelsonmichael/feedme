# Duplicated Agent Instructions — Keep In Sync

This repo shares skills, agents, and root instructions with GitHub Copilot. These were
symlinks until 2026-08-01; they are now **real duplicated files**, because symlinks could
not be checked out on this Windows machine (Developer Mode off, no elevation) and so the
`.claude/` skills and agents silently never loaded.

Each pair below is a byte-for-byte copy. **Editing one side does not update the other** —
that is the cost of dropping the symlinks, and the thing most likely to go wrong.

| Copy | Source of truth |
| --- | --- |
| `CLAUDE.md` | `AGENTS.md` |
| `.claude/skills/**` | `.agents/skills/**` |
| `.claude/agents/**` | `.github/agents/**` |
| `.agents/skills/dev-environment/SKILL.md` | `.github/instructions/dev-environment.instructions.md` |

Treat the right-hand column as authoritative. After changing anything there, re-sync:

```sh
cp AGENTS.md CLAUDE.md
cp .github/instructions/dev-environment.instructions.md .agents/skills/dev-environment/SKILL.md
rm -rf .claude/skills .claude/agents
cp -r .agents/skills .claude/skills
cp -r .github/agents .claude/agents
```

To verify they haven't drifted:

```sh
diff -q AGENTS.md CLAUDE.md
diff -q .github/instructions/dev-environment.instructions.md .agents/skills/dev-environment/SKILL.md
diff -rq .agents/skills .claude/skills
diff -rq .github/agents .claude/agents
```

If a diff reports a difference, ask which side is intended before overwriting — the edit
may have been made on the copy by mistake, and blindly running the re-sync above would
discard it.

Note `core.symlinks=false` is set locally. It no longer matters (nothing in the index is
mode `120000` anymore), but leave it alone unless the symlink approach is deliberately
revived, which would need Developer Mode or an elevated shell.
