## Hono CLI

Run `npx hono --help` first, and use the CLI instead of a dev server.

The app is exported from `src/app.ts` (`src/index.ts` only starts the server), so pass that file to every CLI command, e.g. `npx hono request / src/app.ts` or `npx hono routes src/app.ts`.

No flags are required now that `src/app.ts` no longer imports `ai`/`@ai-sdk/openai`. If the app imports them again and the CLI fails with `Dynamic require of "path" is not supported`, add `-e ai -e @ai-sdk/openai` (the form `-e ai -e @ai-sdk/openai -e @trigger.dev/sdk` also still works).

## Telegram bot

The Telegram bot lives in `src/trigger/telegram.ts` (Trigger.dev hosted webhook endpoint `telegram` + `chat.agent` `telegram-assistant`). The Hono app (`src/app.ts`) no longer has `/telegram/webhook`; it only serves `GET /`. Bot env vars (`TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`, `AI_MODEL`) belong to the Trigger.dev environment, not Railway. Registration steps are in `README.md`.

## Railway environment variables

- Never overwrite Railway's `TRIGGER_SECRET_KEY` with the local value. The local `.env` key belongs to the Trigger.dev Development environment and must never be used in production (Railway needs the Production key).
- Whenever the Railway skill (`use-railway`) is used to sync environment variables, exclude `TRIGGER_SECRET_KEY` from the sync. Do not set, update or delete it as part of a sync.
- Changing `TRIGGER_SECRET_KEY` on Railway requires an explicit user request, using the Production key.

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.agents/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-chat-agent`, `trigger-authoring-tasks`, `trigger-chat-agent-advanced`, `trigger-cost-savings`, `trigger-getting-started`, `trigger-realtime-and-frontend`.
<!-- TRIGGER.DEV SKILLS END -->
