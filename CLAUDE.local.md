# Symlink Health Check

This repo shares skills, agents, and root instructions with GitHub Copilot via symlinks:

- `CLAUDE.md` -> `AGENTS.md`
- `.claude/skills` -> `../.agents/skills`
- `.claude/agents` -> `../.github/agents`

Git doesn't reliably preserve symlinks on every checkout (Windows without symlink support, non-git zip downloads). If a skill or agent you expect isn't showing up as available, check before assuming it doesn't exist:

```
ls -la .claude/skills .claude/agents CLAUDE.md
```

- If these show as real symlinks (`->` target) pointing at existing files/dirs, they're fine.
- If any resolve to a plain file containing just a path string, or `.claude/skills`/`.claude/agents` are missing or empty, the symlinks did not materialize on checkout. Tell the user and suggest `git config core.symlinks true` followed by `git checkout -- .claude CLAUDE.md` (or a fresh clone with symlink support enabled).
