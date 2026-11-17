# Personal expenses
Text-first expense tools for a single-user personal assistant, with persistent records and evidence-backed USD conversion.
Tracking bootstrap only: this document authorizes no source implementation, publishing, or live database changes.

## Specs

1. **S1 — Initial text expense workflow.** Support recording, querying, and correcting personal expenses through text tools. User acceptance: U2, "perfecto vamos con esa implementacion entonces, que vamos a utilizar?" Personal scope: U3, "Es mi asistente personal lo voy a utilizar yo solamente". Recording/query/correction is the agreed staged initial scope; U2 accepts the proposal but does not independently specify its technical architecture.
2. **S2 — Currency and conversion.** Default expenses to ARS; explicitly identified USD expenses require conversion to ARS with the applicable quote date disclosed. U3: "es siempre en ARS y si aclaro puede ser es USD pero me los tiene que convertir". U3's example is illustrative, not a fixed exchange-rate fixture: "por ejemplo de digo che gaste 100 gta 6 y vos me decis 100 usd (156.000 ARS) al dia de cambio de ese dia,".
3. **S3 — Official exchange-rate evidence.** Use the official seller rate and an indicative arithmetic mean from two or three comparable portals. U4: "Dolar oficial, compara en diferentes portales dos o tres y dame una media". The seller side is the agreed implementation interpretation, not an additional verbatim user requirement. U5 selected UI: "Última fecha disponible, indicando cuál"; description: "Busca la última fecha anterior con al menos dos cotizaciones comparables. Guarda y muestra esa fecha, sin presentarla como cotización del día del gasto." Compare only the same quote date; if the expense date has insufficient evidence, use the latest prior qualifying date and disclose it. Never substitute a newer date or invent a completed conversion when fewer than two valid comparable quotes exist.
4. **S4 — Deferred ideas, not initial implementation.** Preserve U1's future ideas: "registrar los gastos mediante una foto del ticket, mediante un mensaje de voz escrito", "se registre en un CRM que vamos a crear a futuro", "También como lista de supermercado, che, me falta esto." and "Que tenga acceso a mi Google Calendar." Photos, voice, CRM integration, supermarket lists, and calendar integration are explicitly outside the agreed initial staged implementation. Do not treat this staging decision as a verbatim user restriction on future work.

## Tasks

- T1 — DONE (`54fec7b`): expense domain, Drizzle/Postgres persistence, and SQL migration; parent reports 8 isolated PGlite tests exercising the exact migration SQL; schema not applied live (S1, S2).
- T2 — DONE (`0c3f394`): fixed official-rate adapters, exact decimal mean, same-date/latest-prior selection and pending conversion; parent reports 17 mocked FX tests (S2, S3).
- T3 — SOURCE IMPLEMENTED (`e210e0b5e7ba2e7da929eaf1571950f97c277b91`, domain owner get `3231b42`): owner-gated text tools and docs; managed AI SDK 7 `toolsContext` with per-tool `contextSchema` forwarding works, with the negative `runtimeContext`-only probe preserved; writer and parent report 90/90 local tests, both TypeScript checks, and Trigger `--dry-run` passing; independent proof and authorized activation remain outstanding (S1–S3; preserve S4 exclusions).
- T4 — BLOCKED, NOT DONE: independent verification of fixed candidate `e210e0b5e7ba2e7da929eaf1571950f97c277b91` stopped during mandatory preparation, before any independent tests; safe preparation needs explicit human approval before one bounded verification attempt; full-candidate native review has not started, and overall feature completion awaits T4 proof and authorized activation (S1–S4).

## Log

### L1 — Verbatim user evidence

U1:
> Claro, porque la idea sería esa, tener una tool en el cual se pueda registrar los gastos mediante una foto del ticket, mediante un mensaje de voz escrito y eso se pase limpio y se registre en un CRM que vamos a crear a futuro porque es algo medir que quiero hacer yo y se puede ir registrando. Y también estaría bueno, bueno, principalmente que se pueda hacer eso. También como lista de supermercado, che, me falta esto. Que tenga acceso a mi Google Calendar. pero ahora nos efoquemos en las tools del agent, vos cuales mas agregarias?

U2:
> perfecto vamos con esa implementacion entonces, que vamos a utilizar?

U3:
> Es mi asistente personal lo voy a utilizar yo solamente, es siempre en ARS y si aclaro puede ser es USD pero me los tiene que convertir, por ejemplo de digo che gaste 100 gta 6 y vos me decis 100 usd (156.000 ARS) al dia de cambio de ese dia,

U4:
> Dolar oficial, compara en diferentes portales dos o tres y dame una media

U5 selected UI:
> Última fecha disponible, indicando cuál

U5 description:
> Busca la última fecha anterior con al menos dos cotizaciones comparables. Guarda y muestra esa fecha, sin presentarla como cotización del día del gasto.

### L2 — Parent-provided implementation decisions and constraints

These are engineering decisions and evidence supplied in the delegation, not additional user quotations or independent user requirements. This tracking bootstrap does not execute them.

- Branch plan: `feat/personal-expenses`, stacked on unmerged `feat/firecrawl-agent-tools`. Publishing is not authorized. No live production database mutations or migrations, and no changes to existing expense records. Review disposition, lifecycle, and terminal Git actions remain parent-owned.
- Persistence plan: Neon Postgres using `pg` and `drizzle-orm`; development dependencies `drizzle-kit`, `@types/pg`, and PGlite. Prefer a ready Drizzle schema and transaction adapter compatible with pg and PGlite. Review and test actual migration SQL in isolation before any separately authorized manual migration. Never read environment secrets or apply migrations to a live database in this work.
- Configuration: require a positive Telegram user ID in `TELEGRAM_OWNER_ID` to enable expense tools; initialize `DATABASE_URL` lazily. Without the owner setting, expose no expense tools and permit no expense writes while preserving existing bot behavior. Apply the personal owner gate only when the owner setting is configured. Missing database configuration must leave basic chat and Firecrawl usable; expenses are unconfigured and the model must not claim success.
- Identity: derive ownership from the backend-configured ID AND verified `message.from.id` in a private chat, never model parameters. Validate sender and private chat before channel ingestion of `{message, externalUserId, externalMessageId}`. Scope every database query by owner. Model arguments cannot supply owner, quotation URLs, or origin IDs.
- Dates and arithmetic: default expense timestamps to the Argentina local date, timezone `America/Argentina/Buenos_Aires`, and document that default. Accept decimal strings, store bigint cents, and use exact decimal rates/micro-units, never JavaScript floating-point arithmetic. Parse external numeric values as exact finite decimal strings.
- Evidence: store raw currency and amount, ARS amount, quote date, evidence, and the immutable indicative mean used for a conversion. Keep USD conversion pending if fewer than two valid comparable quotes exist. Select the latest matching prior day if needed, never a date newer than the expense. Example quotations are illustrative, not fixed fixtures.
- Fetch only fixed allowlisted APIs, with bounded network requests and failures; accept no model-supplied URLs or rates. Firecrawl search is not a canonical numeric-rate source. A third portal is optional; two comparable portals are mandatory.
- Records use UUIDs. Corrections require version checking and a transactional audit trail. Reject ambiguous correction IDs: ask the user to query and select a record first. No deletion or annulment in initial scope; no photo, voice, calendar, or list features.
- Preserve the rule against syncing or modifying Railway `TRIGGER_SECRET_KEY`; no environment-secret reads are needed.

### L3 — Parent-supplied fixed-read API evidence

These observations were supplied by the parent and were not independently fetched during this documentation-only bootstrap. They establish candidate response shapes, not permanent rate values or complete historical coverage.

- DolarAPI: `GET https://dolarapi.com/v1/dolares/oficial` returned `moneda: USD`, `casa: oficial`, `venta: 1575`, `fechaActualizacion: 2026-11-16T18:00Z`.
- Bluelytics: `GET https://api.bluelytics.com.ar/v2/evolution.json?days=6` returned entries including `{date: '2026-11-17', source: 'Oficial', value_sell: 1574}` and `{date: '2026-11-16', source: 'Oficial', value_sell: 1572}`. Ignore `source: Blue` entries.
- ArgentinaDatos: `GET https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial/2026/11/16` returned `casa: oficial`, `venta: 1570`, `fecha: 2026-11-16`.
- Actual parent-observed official seller rates for November 16, 2026: DolarAPI 1575, Bluelytics 1572, ArgentinaDatos 1570. These are illustrative historical observations, not fixed production rates; Bluelytics here means its `Oficial` source, not `Blue`.
- Only compare observations with the same quote date; do not combine the Bluelytics November 17 observation with November 16 observations. Select the latest prior qualifying date when needed, never a date newer than the expense. Historical availability outside the observed responses is not established by this evidence.

### L4 — T3 security and idempotency proof: corrected forwarding contract

- Trigger's `tools` resolver receives `{chatId, turn}`; the run has trusted `ctx.run.id`. The initial `runtimeContext` forwarding hypothesis was superseded by local probe evidence: installed AI SDK 7 separates `runtimeContext` from server-only `toolsContext` keyed by tool name with per-tool `contextSchema`.
- Parent reports managed `run.streamText` forwarding works through `toolsContext`; preserve the negative `runtimeContext`-only probe. This is local evidence, not completed independent verification or authorization to activate ledger writes.
- Use backend run ID plus turn as the idempotency identity, stable across task retries; initially one expense per turn. Test replay of identical trusted context and retain existing webhook `update_id` deduplication.
- Do not claim exactly-once behavior across SDK behaviors that have not been proven. Resolve missing context safely before any ledger write.

### L5 — Parent-reported T1/T2 completion and verification handoff

- T1 completed in `54fec7b`: 8 isolated PGlite tests exercise the exact migration SQL. T2 completed in `0c3f394`: 17 mocked FX tests. The parent reran the combined tests with 25/25 passing and reports that TypeScript checking (`tsc`) passes. Exact runner commands were not supplied in this tracking update; these are parent-reported results, not checks rerun by this documentation writer.
- Dependency installs for `pg` and `drizzle-orm`, plus PGlite and development tooling, generated lockfile changes. This update records that implementation evidence only; it performs no dependency installs or lockfile edits.
- The schema has not been applied to a live database. No production migration or data mutation is authorized by this update.
- Parent-reported native assessment against base `ead5920`, `committedOnly`: medium / not due. Parent escalation item 1 nevertheless requires an independent verifier; this is a verification requirement, not an approval request or completed review disposition. T4 remains pending and parent-owned.
- At this earlier handoff T3 was next, including the then-unproven `runtimeContext` hypothesis; L4 and L6 supersede that implementation status and forwarding hypothesis. Future photo, voice, CRM, supermarket-list, and calendar stages remain deferred, not obsolete; all user evidence above remains applicable.

### L6 — Parent-reported T3 implementation and public FX probe

- Source implementation: `e210e0b5e7ba2e7da929eaf1571950f97c277b91`; domain owner get: `3231b42`. Writer and parent each report 90/90 local tests passing, both TypeScript checks passing, and Trigger `--dry-run` passing. Exact test, typecheck, and dry-run command lines were not supplied in this update; this documentation writer did not rerun them. T1/T2 are locally verified; T3 is implemented with local checks, not independently verified.
- The public FX probe actually returned `expenseDate: 2026-11-17`, `quoteDate: 2026-11-17`, Bluelytics official seller 1574 and ArgentinaDatos 1575, indicative mean `1574.500000`, and 100 USD converted to 157450 ARS. Record this as observed probe/test evidence, never a hardcoded production rate. It supplements, rather than replaces, L3's November 16 observations; same-date and latest-prior selection rules remain in force.
- No live database schema was applied and no live data writes occurred. Overall feature status remains INCOMPLETE until T4 proof and authorized activation. No publishing is authorized.

### L7 — Independent verification preparation failure

- Independent verifier binding is fixed to candidate `e210e0b5e7ba2e7da929eaf1571950f97c277b91`. The mandatory preparer rejects 16 symlinks and enforces a 256 MiB payload cap. Reduced functional dependencies excluding maps total 235406164 bytes and would fit the cap; that size estimate is not successful preparation evidence.
- The preparation writer's `.trigger/verifier-expenses-deps` stage stopped BEFORE copying after the environment-filename policy block. Actual preparation attempt: exit 1, `Environment file prohibited`. No automatic rerun is permitted.
- Zero independent tests ran. No isolated scratch directory or payload was created. Only the existing untracked, ignored `prepare.py` helper remains, as reported by the parent; this tracking writer does not alter it.
- This is a preparation failure, not evidence that verifier capability is unavailable or an upgrade is needed. T4 is blocked, not done. Full-candidate native review has not started; no native budgets have been opened. Earlier native assessment in L5 is not full-candidate review or approval.

### L8 — Static observations pending technical work/review

These are parent-supplied static observations, not reproduced blockers, exploit demonstrations, or approval dispositions.

1. Evidence validation checks arithmetic but does not establish portal-allowlist authenticity.
2. The capability authenticates the owner, not explicit current-user intent. Web prompt injection leading to expense writes remains unproven; owner authentication alone does not prove intent authorization.
3. PostgreSQL has a connection-acquisition timeout but no statement/query timeout.

### L9 — Bounded continuation proposal; not authorization

- Parent may offer the same implementation writers narrowly scoped continuation for the three static findings in L8, with exact edit surfaces, correction limits, and focused checks explicitly authorized before work. Keep these findings pending until technical disposition and evidence exist; do not weaken checks.
- Human approval is required for a repaired safe preparation plan that excludes environment files, handles the rejected symlinks without weakening mandatory checks, and stays within the 256 MiB cap. Only after safe preparation is repaired and approved may one bounded independent-verifier attempt run; no automatic retries or silent candidate rebinding.
- The parent retains candidate binding, review disposition, and activation decisions. Do not reset native budgets (none have been opened), treat local checks as independent proof, claim approval, publish, or apply a live schema. Future stages remain deferred, not obsolete.
