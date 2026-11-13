## Hono CLI

Run `npx hono --help` first, and use the CLI instead of a dev server.

The app is exported from `src/app.ts` (`src/index.ts` only starts the server), so pass that file to every CLI command, e.g. `npx hono request / src/app.ts`.
