# feedme monorepo

This repository contains two isolated projects:

- `app/` - React Native + TypeScript RSS reader app (Android + Web)
- `worker/` - Cloudflare Worker services used by the app

## Directory layout

```text
.
├─ app/
└─ worker/
```

## Getting started

### App

```bash
cd app
npm install
npm run start
```

### Worker

```bash
cd worker
npm install
npm run test -- --run
npx wrangler dev
```

## Quality checks

Run checks from the project you are working on:

- App: `cd app && npm run format:check && npm run typecheck`
- Worker: `cd worker && npm run test -- --run` (and any worker-specific checks)
