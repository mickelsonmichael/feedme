# Instructions

This app is an RSS feeder app that can run either (A) as an Android mobile app or (B) as a web page.
To support this, the app is written using React Native and TypeScript.
Every feature added to the app should support both these environments and use a local SQLite database or storing long-term data.
The web app can choose to use Local Storage where appropriate.

Users will add a list of RSS Feeds by URL and give them an optional title.
The items will then be fetched from all the RSS Feeds and displayed on the main "Feeds" page as an aggregated list,
similar to Reddit's mechanism. `Subreddits : Posts :: Feeds : Items`.

Each time the above functionality is modified as part of a change, we should update the above description to reflect the new functionality only if the change was explicitly requested.
Otherwise, the above is the contract for the app's behavior and all changes should be consistent with this description.

For commits, use Conventional Commits (e.g. `feat(feeds): Added ability fo favorite feeds` or `fix(settings): Persisted dark mode selection longer than 1 day`).

## Unit Tests

New features should be well tested and before each merge requests the new tests and previous tests must pass.
You must follow the `Arrange - Act - Asssert` paradigm to better organize the tests.

## Code Quality

All agents **must** run the **code-quality** skill as part of every task to ensure the project meets formatting and type-safety standards.

## Task Completion Requirements

Before a task is considered complete, all agents **must**:

1. Plan your work, analyze the issue and come up with a proper plan before beginning work.
2. Implement the plan and execute the changes.
3. Write a unit test to validate the new functionality. Ensure all previous tests pass.
4. Run the **code-quality-agent** and fix any issues found, re-running until no issues are returned.
