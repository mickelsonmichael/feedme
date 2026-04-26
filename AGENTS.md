# Repository Instructions

This repository contains two projects:

- `app/`: React Native + TypeScript RSS app (Android + Web).
- `worker/`: Cloudflare Worker backend/service code.

These instructions apply across both projects unless a nested `AGENTS.md` provides additional rules.

## Commits

Use Conventional Commits.
Examples:

- `feat(feeds): add ability to favorite feeds`
- `fix(settings): persist dark mode selection longer than 1 day`

## Testing

- New features should include tests.
- Keep the full existing test suite passing.
- Follow `Arrange - Act - Assert` structure in tests.

## Code Quality

All agents must run the `code-quality` skill as part of each task.

## Task Completion Requirements

Before considering a task complete:

1. Plan the work.
2. Implement the requested changes.
3. Add or update tests when functionality changes.
4. Run the appropriate quality checks and fix any issues.
