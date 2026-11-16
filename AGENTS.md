## Hono CLI

Run `npx hono --help` first, and use the CLI instead of a dev server.

The app is exported from `src/app.ts` (`src/index.ts` only starts the server), so pass that file to every CLI command, e.g. `npx hono request / src/app.ts -e ai -e @ai-sdk/openai`.

Always pass `-e ai -e @ai-sdk/openai` (mark those packages as external; `zod` is no longer needed); without them the CLI fails with `Dynamic require of "path" is not supported`.

## Railway environment variables

- Never overwrite Railway's `TRIGGER_SECRET_KEY` with the local value. The local `.env` key belongs to the Trigger.dev Development environment and must never be used in production (Railway needs the Production key).
- Whenever the Railway skill (`use-railway`) is used to sync environment variables, exclude `TRIGGER_SECRET_KEY` from the sync. Do not set, update or delete it as part of a sync.
- Changing `TRIGGER_SECRET_KEY` on Railway requires an explicit user request, using the Production key.

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.agents/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-chat-agent`, `trigger-authoring-tasks`, `trigger-chat-agent-advanced`, `trigger-cost-savings`, `trigger-getting-started`, `trigger-realtime-and-frontend`.
<!-- TRIGGER.DEV SKILLS END -->
