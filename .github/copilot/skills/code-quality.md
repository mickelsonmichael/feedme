# Code Quality

Use Prettier to check that the code meets the project's formatting standards.

## How to Run

Run the following command to check for Prettier issues:

```bash
npm run format:check
```

If there are issues, run the following command to automatically fix them:

```bash
npm run format
```

## Requirements

- All files must pass `npm run format:check` with no errors before a task is considered complete.
- After fixing any formatting issues, verify the CI `prettier` job will pass by running `npm run format:check` again and confirming it exits with no warnings.
