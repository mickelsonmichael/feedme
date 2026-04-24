# Agents

This file provides instructions that all agents must follow when working on tasks in this repository.

## Code Quality

All agents **must** run the **code-quality** skill as part of every task to ensure the project meets formatting standards. See [`.github/copilot/skills/code-quality.md`](./copilot/skills/code-quality.md) for instructions on how to run it.

## Task Completion Requirements

Before a task is considered complete, all agents **must**:

1. Run the **code-quality-agent** (`.github/agents/code-quality.md`) as the **last step** of every task.
2. Resolve any issues reported by the code-quality agent.
3. Re-run the code-quality agent after resolving issues to confirm all issues are fixed.
4. Ensure the CI `prettier` job is passing. Check the workflow run status for the pull request and confirm the `Prettier` job has a green check. If it is failing, fix the issues and push again before marking the task as complete.

A task is **not complete** until the code-quality agent reports no issues and the `Prettier` CI job is passing on the pull request.
