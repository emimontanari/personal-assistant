## Hono CLI

Run `npx hono --help` first, and use the CLI instead of a dev server.

The app is exported from `src/app.ts` (`src/index.ts` only starts the server), so pass that file to every CLI command, e.g. `npx hono request / src/app.ts` or `npx hono routes src/app.ts`.

No flags are required now that `src/app.ts` no longer imports `ai`/`@ai-sdk/openai`. If the app imports them again and the CLI fails with `Dynamic require of "path" is not supported`, add `-e ai -e @ai-sdk/openai` (the form `-e ai -e @ai-sdk/openai -e @trigger.dev/sdk` also still works).

## Telegram bot

The Telegram bot lives in `src/trigger/telegram.ts` (Trigger.dev hosted webhook endpoint `telegram` + `chat.agent` `telegram-assistant`). The Hono app (`src/app.ts`) no longer has `/telegram/webhook`; it only serves `GET /`. Bot env vars (`TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`, `AI_MODEL`) belong to the Trigger.dev environment, not Railway. Registration steps are in `README.md`.

## Runtime web tools

Coding skills in `.agents/skills/` are authoring guidance, not runtime tools or prompt text. The Telegram agent declares and forwards five real AI SDK tools from `src/ai/firecrawl-tools.ts` via Trigger's managed `run.streamText`; never import `streamText` from `ai`. Resolve tools per turn to isolate the shared five-execution parallel-safe budget. Preserve the five-step cap and no-key fallback.

Intent routes: current shopping/travel/tickets/jobs/housing/news → search; supplied URL → read; a subpage in a known site → map; structured/live financial/public data → discovery before vetted lookup. Only `polymarket/search/query` and `polymarket/markets/list` may execute provider calls, using the CLI-discovered contracts cited in README. Discovery is not live records. No arbitrary provider/options dispatch, terms acceptance, booking, trades, alerts, crawl or shell. Do not claim the complete prompts catalogue is supported.

`FIRECRAWL_API_KEY` belongs in local `.env` for Trigger Development and Trigger Production env vars, never Railway sync. Missing key disables offering tools without breaking chat. Keep SDK lazy, no embedded credentials, bounded output, URL validation, sanitized errors and no automatic retries. SDK 4.54.0 lacks request signals: abort stops the model and prevents new calls/discards results, but never cancels an in-flight paid API request. Search/read/map and discovery (search with Alexandria sources, not findTools) have 20 s transport timeouts; vetted Polymarket execution has 45 s because the SDK adds a mandatory 30 s response margin to its 15 s operation timeout. Remote work may outlive a transport timeout. Keep maxRetries: 1 (one attempt in this SDK; zero makes no request) and scrape autoResume: false. DNS/redirect SSRF is not fully controlled locally. See README for scope, costs and limits. Offline model fixtures prove plumbing, not real semantic intent selection.

## Personal expenses

Text tools live in `src/ai/expense-tools.ts`, merged into the Telegram agent; ledger persistence is separate from unchanged transcript memory. Require `TELEGRAM_OWNER_ID` (positive Telegram `from.id`, not username) and `DATABASE_URL` in Trigger.dev. Gate configured owners before a turn by sender AND private chat of the same ID. Without owner/DB, preserve general chat and configured web but expose no expense tools. Model inputs never carry owner/source/rate/URL authority. Use managed `run.streamText`, with server-only `toolsContext` keyed by tool name and `contextSchema`; installed AI SDK separates this from `runtimeContext`. Keep the opaque capability and resolver-captured chat/turn, backend run ID source keys, one registration per turn, sanitized failures, and versioned corrections. Never claim general exactly-once across arbitrary recovery.

Current-user write intent is also enforced by `src/ai/expense-intent.ts`: derive one action permission from only the latest user message text BEFORE model execution, never tool/assistant/system content, older history, clientData or model inputs. Keep permission private in frozen server toolsContext; filter activeTools AND check inside each executor before DB access. Registration cannot authorize correction or vice versa. Support the documented narrow Spanish declarations/imperatives; deny queries, quoted examples, hypotheses, links/multiline context and a bare yes, asking for a fresh explicit directive. This is a conservative action gate, not general semantic or field-level verification. Read-only expenses and configured web remain available. Preserve offline malicious-web/forced-model regressions with unchanged public records, revisions and write/FX counters.

ARS by default; USD only explicit. Use the existing exact money parser and FX service, never model arithmetic or web search rates. Preserve original USD, same-date official seller evidence from two/three portals, latest qualifying prior date disclosure, and pending conversion when evidence is insufficient. Financial/date corrections refetch final-field FX; metadata corrections retain evidence. Dates default to Argentina. No live DB access or migrations during ordinary agent startup; migrations require separately approved target and production backup. Offline tests use isolated PGlite. Photos, voice, CRM, calendar and supermarket lists remain deferred.

## Railway environment variables

- Never overwrite Railway's `TRIGGER_SECRET_KEY` with the local value. The local `.env` key belongs to the Trigger.dev Development environment and must never be used in production (Railway needs the Production key).
- Whenever the Railway skill (`use-railway`) is used to sync environment variables, exclude `TRIGGER_SECRET_KEY` from the sync. Do not set, update or delete it as part of a sync.
- Changing `TRIGGER_SECRET_KEY` on Railway requires an explicit user request, using the Production key.

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.agents/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-chat-agent`, `trigger-authoring-tasks`, `trigger-chat-agent-advanced`, `trigger-cost-savings`, `trigger-getting-started`, `trigger-realtime-and-frontend`.
<!-- TRIGGER.DEV SKILLS END -->
