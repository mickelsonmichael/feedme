# feedme worker

Cloudflare Worker project for backend/service functionality.

## Scripts and commands

- `npm run test -- --run` - run tests
- `npx wrangler dev` - start local worker
- `npx wrangler deploy` - deploy worker
- `npx wrangler types` - regenerate worker type definitions after binding changes

## Local development

```bash
npm install
npm run test -- --run
npx wrangler dev
```

## Notes

- This project is isolated from the app and has its own dependencies and tooling.
- Follow Cloudflare Workers limits and API docs for implementation details.
