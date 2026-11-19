# Telegram production
Tracking-only bootstrap for hosted Trigger.dev Production bot and Firecrawl, with expenses disabled.
The expense-disable guard is locally verified, pending independent verification; owner configuration, deployment, webhook switching, and closure remain pending.

## Specs

- **S1 — Hosted operation.** User request: "bueno lo detengamos eso tiene que estar corriendo deploy no en mi px". Run the bot hosted rather than depending on the user's PC.
- **S2 — Accepted production scope.** Selected UI label: "Bot y Firecrawl; gastos desactivados". Accepted UI description: "Alojar el bot sin depender de tu PC, sin aplicar la migración ni activar escrituras de gastos." These are UI acceptance evidence, not user-composed prose.
- **S3 — Existing sole-user scope.** Carry forward `odd/tasks/personal-expenses.md` S1: "Es mi asistente personal lo voy a utilizar yo solamente". This preserves the existing personal-owner privacy requirement; it is not a new production request.

## Tasks

- T5 — IN PROGRESS, SOURCE LOCALLY VERIFIED: minimal `EXPENSES_ENABLED` availability/executor guard and tests/docs locally verified in L3; pending independent T4 code-phase verification against the parent's frozen commit; route: guard implementation, commit: pending parent source-work-unit commit (S2, S3).
- T1 — PENDING: complete readiness and candidate freeze after trusted Production owner configuration and verified expense-disable guard; read-only metadata probe reported in L2; route: readiness, commit: pending (S1–S3).
- T2 — PENDING: after readiness and owner configuration, set Production `EXPENSES_ENABLED` to `false` through normal remote configuration and deploy the frozen bot/Firecrawl candidate using actual official cached CLI `4.8.5`, whose environment-scoped client enforces Production capability; route: production configuration/deployment, commit: pending or no source change (S1–S3).
- T3 — PENDING: switch the Telegram webhook to the hosted production endpoint while preserving queued updates and the signing secret; route: webhook cutover, commit: pending or no source change (S1–S3).
- T4 — PENDING: independently verify offline guard behavior against the frozen commit after the parent's source-work-unit commit, then separately verify production readback before closure; route: independent code verification followed by deployment readback, commit: pending or tracking-only closure (S1–S3).

## Log

### L1 — Human request, accepted selection, and bootstrap constraints

Full original human request, verbatim:
> bueno lo detengamos eso tiene que estar corriendo deploy no en mi px

Selected UI label (UI acceptance, not user-composed prose):
> Bot y Firecrawl; gastos desactivados

Accepted UI description (UI acceptance, not user-composed prose):
> Alojar el bot sin depender de tu PC, sin aplicar la migración ni activar escrituras de gastos.

Existing sole-owner carryover from `odd/tasks/personal-expenses.md` S1:
> Es mi asistente personal lo voy a utilizar yo solamente

Engineering constraints and parent-reported context, not additional Specs or newly verified remote evidence:

- This bootstrap writes only this canonical tracking file before implementation. No source, existing feature-document/history, `dist/`, helper, dependency, generated-output, or human-authored content changes; no installs, deployment, endpoint registration, database actions, or credential reads in this work. No commit, push, merge, Railway changes, or `TRIGGER_SECRET_KEY` changes. No Engram writes; the parent mirrors tracking.
- Branch `feat/telegram-production` starts at `72de354b1810a8c6fb575fc1029710c7ce5d6d1c` and includes the parent-reported verified source `ea21af9e85f71a38f841add98382f1f835618c6d`. Preserve the existing untracked `dist/` and all source. Local development job 7 is already stopped, verified by the parent's job-stop tool; no local worker restart is authorized.
- Readiness must be a read-only probe before any deployment or configuration changes. Organization Production permission/capability is not yet verified: historical README wording that Production was blocked is not proof of continuing denial. The existing remote-auth grant recorded in personal-expenses L19 carries forward; this Production intent is a new scope. Later authorized remote operations may consume necessary authentication in memory, never log it or read local environment secrets.
- Readiness records environment names and presence/validity only, never values, owner PII, credentials, or secret logs. Required names are `TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`, and `FIRECRAWL_API_KEY`; `AI_MODEL` is optional. A valid configured `TELEGRAM_OWNER_ID` is required to preserve sole-user privacy. If absent or invalid, ask the human for the exact owner value only after readiness; never record it here.
- Only bot and Firecrawl activation is authorized. If `DATABASE_URL` is absent, retain the existing expense-disable gate without removing `TELEGRAM_OWNER_ID`. If `DATABASE_URL` is already configured, do not delete it or the owner configuration: route a minimal explicit expense-disable guard with tests and documentation before deployment if necessary. No database schema/data changes, migrations, or expense activation are authorized.
- Freeze/read back the chosen candidate and confirm the expense-disable/privacy route before deploying with the actual CLI `4.8.5`. Do not add source helpers or install dependencies unless separately needed and scoped. Webhook cutover must preserve the queue and existing signing secret; do not treat deployment alone as successful cutover or closure.
- Parent-reported prior expense evidence remains intact: 141 passing tests, three independent probes, and successful dry-run. This separate deployment authority neither resets native budgets nor reopens completed expense implementation/review work. Independent production readback and closure are still pending; this bootstrap claims no remote readiness or deployment proof.

### L2 — Parent-reported readiness and bounded guard route

- Readiness handoff `mwnhghuh-1g-8s6l` reports official authentication and project/organization match. This tracking writer did not rerun remote commands. Exact command lines were not supplied; the parent reports a deploy-settings GET returning `401` through a personal client with the wrong scope, and current-deployment lookup returning `404` with no endpoint. The wrong-client `401` is not organization Production denial and does not confirm the historical README restriction. One probe-helper technical correction was used; do not repeat the wrong-scope probe.
- Metadata only: Production `TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`, `FIRECRAWL_API_KEY`, and `DATABASE_URL` are present; `TELEGRAM_OWNER_ID` and optional `AI_MODEL` are absent. Development owner configuration is also absent, `DATABASE_URL` is present, and `FIRECRAWL_API_KEY` is absent. No secret values, owner IDs, authentication URLs, or endpoint URLs are recorded.
- No provider configuration, deployment, webhook, or database changes occurred. Production capability remains unverified. When prerequisites are ready, actual official cached CLI `4.8.5` with the proper environment-scoped client will enforce it; no privilege bypass, upgrades, payments, or retry after permission denial is authorized.
- Because Production already has `DATABASE_URL`, preserve it and do not remove owner configuration. T5 routes only the minimum explicit `EXPENSES_ENABLED` guard: unset preserves previous behavior; exact string `true` permits expenses only when otherwise configured; every other provided value disables expenses fail-closed. Enforce the guard both in availability and inside expense executors, never from model-controlled configuration. Preserve S3 owner checks. No database changes or new dependencies. Source edits remain delegated to a bounded writer after the parent supplies its actual allowed edit surfaces; no source work is claimed complete here.
- T2 must set Production `EXPENSES_ENABLED` to exact string `false` through normal remote configuration after owner configuration is provided; do not activate finances. Risk item 2 is security and risk item 5 is deployment; T4 includes independent offline guard verification as well as production readback.
- The real human prerequisite is a trusted numeric Telegram USER ID, not the bot ID: ask the human to configure Production `TELEGRAM_OWNER_ID` directly through the Dashboard, outside chat, and confirm completion without sending its value. Do not persist the value or an authentication URL. The existing hosted bot/Firecrawl-with-expenses-off selection already authorizes the necessary guard, configuration, deployment, and webhook scope; do not add a generic continue-consent requirement.
- This update changes tracking only and preserves Specs and exact human quotes, existing task IDs, all source, `dist/`, authentication staging, and runtime helper files. No commit or remote action is performed. T5 is in progress as a route, T1–T4 remain pending; no deployment or source implementation is claimed complete.

### L3 — Parent-reported local guard verification; independent phase pending

- Worker `mwnhp13q-1i-bfmy` reports two focused RED runs, each exit `1` with 28/31 passing. The first replay-conflict fixture was corrected; the subsequent run reproduced actual USD registration and managed query access with the flag set to `false`. These are reported observed failures, not checks rerun by this tracking writer.
- GREEN: focused tests passed 31/31; worker `npm test` passed 145/145; both TypeScript checks exited `0`. The parent independently ran `npm test`: 145/145 passed, zero failures or skips, exit `0`. Exact focused and TypeScript command lines were not supplied in this update.
- A single differential script compared HEAD with the working candidate under unset and exact `true` flag values: ARS/USD registration, replay, queries, corrections, counters, stdout, stderr, and exit status were identical. The worker reports that the script created no files. No independent T4 verification is claimed by these local checks.
- Implemented semantics reported: optional server-only `EXPENSES_ENABLED` preserves legacy behavior when undefined; exact string `true` permits the other existing checks; every other provided value disables expenses. Executor revalidation reads fresh server environment and revokes previously issued opaque contexts before DB/FX access. Wrong-owner and group tests still reject before model execution; configured web and transcript history remain preserved.
- Source-work-unit surfaces reported are `src/ai/expense-tools.ts`, `src/ai/expense-tools.test.ts`, `src/telegram/agent.test.ts`, `README.md`, and `AGENTS.md`. The parent plans the authorized source-work-unit commit under 400 lines plus this feature tracking file; this writer performs no source edits or commit. T5 remains in progress, source locally verified, pending independent verification against that frozen commit.
- Parent reports native ASSESS of the uncommitted candidate was unavailable because untracked files required selection. No INSPECT or START occurred and no native budget opened. The parent owns retrying ASSESS on the correct committed range excluding `dist/`; this is not a review disposition. Risk item 2 remains the guard/security boundary and item 5 remains Production deployment.
- No remote configuration, owner configuration, migration, deployment, webhook, or database changes occurred. S1 is not deployed; S2 has a locally verified code guard but awaits Production `EXPENSES_ENABLED=false`; S3 still awaits the missing trusted Production `TELEGRAM_OWNER_ID`, configured by the human through the Dashboard without sending its value in chat. No new generic consent is required. T4's independent code phase must follow the parent's frozen commit; later deployment readback remains separate and unperformed.
- This tracking-only update preserves Specs, exact human quotes, all pre-existing source changes, `dist/`, authentication staging, and runtime helpers. No secrets, owner values, or URLs are recorded; no remote actions or commit are performed.
