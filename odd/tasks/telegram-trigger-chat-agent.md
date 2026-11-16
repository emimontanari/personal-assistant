# Telegram via Trigger.dev inbound webhook + chat.agent

Telegram updates go to a Trigger.dev hosted webhook endpoint instead of the Hono route; a durable `chat.agent` (one session per Telegram chat) generates the reply with AI SDK and sends it back with `sendMessage`. Conversation memory comes from the agent's transcript storage, not from our own database.
Branch: `feat/telegram-trigger-chat-agent`. Docs: SDK 4.8.5 bundled docs (`node_modules/@trigger.dev/sdk/docs/webhooks/*`, `docs/ai-chat/*`), https://trigger.dev/docs/webhooks/overview.

## Specs

- **S1** — "Replace our Telegram Bot API webhook which uses AI SDK with Trigger.dev inbound webhook which uses chat agent."
  - A hosted endpoint is defined with `webhooks.endpoint.define()` in `src/trigger/` (exported). Its source is a `webhooks.custom` verifier using the shared secret Telegram sends in the `X-Telegram-Bot-Api-Secret-Token` header (Telegram's `secret_token`), and deduplicates on the body field `update_id`.
  - A `chat.agent` (exported, in `src/trigger/`) subscribes through `chat.channels.custom({ ... })` from `@trigger.dev/sdk/ai`, keyed per Telegram chat (`message.chat.id`). `inbound` returns the user's text (`message.text`); updates without text return empty and run no turn.
  - The turn uses `streamText` from the run argument (never imported from `ai`) with `@ai-sdk/openai`, model `process.env.AI_MODEL || 'gpt-5-nano'`, `reasoningEffort: 'minimal'` (cheapest model, same as today) and the existing short system prompt (personal assistant, concise, answers in the user's language).
  - The channel's `send` posts the reply with Telegram `sendMessage` (`chat_id`, `text`) using `TELEGRAM_BOT_TOKEN`, with a 10 s timeout. Replies longer than Telegram's 4096-character limit are split into consecutive messages. Never log the bot token, the webhook secret, or user message text.
  - The Hono webhook route `POST /telegram/webhook`, its module and its tests are removed; `GET /` stays. The Hono app no longer needs `TELEGRAM_*` or `OPENAI_API_KEY`.
- **S2** — "Then, add transcript-based persistance for the agent to have memory of the conversation without needing a database."
  - Memory uses the chat.agent transcript storage (the documented default platform snapshot per session, `docs/ai-chat/patterns/persistence-and-replay.mdx`, `transcript-storage.mdx`), configured explicitly so it is visible in code. No database, no extra infrastructure. Each Telegram chat keeps its own transcript across messages and across runs (a new run boots from the snapshot).
  - Documented limits are recorded in the README: snapshots accumulate with no expiry by default (`persistence-and-replay.mdx`). The "~100 messages" figure from exploration is NOT in the bundled docs and must not be claimed.
- **S3** — "Tell me the steps required to register the new webhook to Telegram Bot API."
  - README documents, for dev and prod: get the endpoint URL from the Trigger.dev dashboard **Webhooks** page, set the endpoint's signing secret (`npx trigger.dev@latest webhooks generate-secret <endpoint> --env <env> --to-env TELEGRAM_WEBHOOK_SECRET` or `set-secret --from-env`), then call Telegram `setWebhook` with `url` and the same value as `secret_token`, and check with `getWebhookInfo`. Notes: Telegram allows one webhook per bot, so this stops traffic to the Railway route; prod requires Trigger.dev deploys (currently blocked for the org); the dev endpoint only processes updates while `npx trigger.dev@latest dev` runs; `TELEGRAM_BOT_TOKEN` and `OPENAI_API_KEY` must exist in the Trigger.dev environment.
- **S4** — "Use hono, trigger, ai-sdk, and firecrawl skills to find relevant documentation". Writers load the trigger, ai-sdk and hono skills; APIs are checked against the installed SDK docs and types.

## Tasks

- T1 — S1, S2, S4 — writer `gentle-ai-worker` — endpoint + chat.agent + channel + transcript storage + tests; remove Hono webhook — commit: 07b6e51 (22/22 tests)
- T2 — S1, S2, S3 — writer `gentle-ai-worker` — README/AGENTS.md: architecture, env vars, registration steps — commit: pending

## Log

- **L1** (user request, verbatim):
  > Replace our Telegram Bot API webhook which uses AI SDK with Trigger.dev inbound webhook which
  > uses chat agent.
  > Then, add transcript-based persistance for the agent to have memory of the conversation without needing a database.
  > Tell me the steps required to register the new webhook to Telegram Bot API.
  > Use hono, trigger, ai-sdk, and firecrawl skills to find relevant documentation like:
  > https://trigger.dev/docs/webhooks/overview
- **L2** — Exploration (bundled SDK 4.8.5 docs): webhooks are public beta (SDK ≥ 4.8.1); endpoint per environment, discovered by `trigger dev`/deploy, URL on the dashboard Webhooks page; deliveries rejected until the endpoint has a signing secret; `chat.channels.custom({ id, endpoint, key, inbound, send })` routes deliveries into one session per key; default transcript storage is a platform snapshot (no expiry; a "~100 messages" claim was unverified and dropped). Uncertain: exact `shared-secret` header option semantics (verify in `@trigger.dev/core` types).
- **L3** — Orchestrator decisions: non-text updates produce no reply (previously a fixed text); long replies split at 4096 chars; Trigger.dev prod deploys are blocked for the org, so the change stays on the branch and production keeps the Railway route until the user re-registers the webhook.
- **L4** — Dev worker 20261116.3/.4 registered `telegram-assistant`. Independent verify (Risk items 2, 3): S1, S3, S4 met; S2 met after removing an unverified "100 messages" comment. Undocumented in SDK 4.8.5: retry behavior when channel `send` throws, behavior for updates whose key can't resolve, server-side shared-secret comparison internals. No live Telegram end-to-end run (requires the user's setWebhook).
- **L5** — Native review `review-0e85c39e54114950` (risk, resilience, reliability) on `b69643d..d0b6b70`: **approved**, authority burned. Non-blocking warnings: no fixed reply on generation failure (bundled `channels.mdx:82` says a throwing turn posts the channel's "Something went wrong answering this. Try again." line — not covered by our tests); secret-header verification and update_id dedup rest on SDK config with no test; a throwing `send` may be retried and re-send earlier chunks of a long reply (retry behavior undocumented).
- **L6** — Live end-to-end test in Development (user confirmed): Telegram `setWebhook` → Trigger.dev endpoint `telegram` (dev) → `telegram-assistant` run `run_06guavghf9k3mthsrc6b4ndda2` → reply received in Telegram, and a follow-up message showed the agent remembers the conversation ("si se acuerda!!!"). Telegram now points to the dev endpoint; it only answers while `trigger dev` runs. The webhook secret was exposed twice in the chat while registering; rotation pending.
