# Firecrawl tools for the Telegram Trigger.dev agent

Canonical user intent for adding intent-driven web tools to the existing Telegram agent.
Tracking only: S1–S4 implementation and independent functional verification are complete; commits and native review remain pending.
The full feature remains open until native review closes; implementation decisions are recorded separately from user requirements.

## Specs

- **S1** — "Configurá la **skill de Firecrawl** en este proyecto y registrala como una herramienta (*tool*) en nuestro agente de Telegram de Trigger."
- **S2** — "Desarrollá las instrucciones del agente para que reconozca cuándo debe utilizar las herramientas de Firecrawl en situaciones como las que se describen en estos ejemplos: [https://www.firecrawl.dev/prompts](https://www.firecrawl.dev/prompts?utm_source=chatgpt.com)"
  - "Tené en cuenta que los clientes que utilizan este bot no conocen Firecrawl ni Alexandria, por lo que el bot debe decidir inteligentemente cuándo utilizar estas herramientas según lo que solicite el usuario, sin necesidad de que este mencione ninguna de esas tecnologías."
- **S3** — "Utilizá las skills de **Firecrawl, Trigger y AI SDK**."
- **S4** — "Al finalizar, indicame si necesito agregar alguna variable de entorno (*environment variable*) para que funcione correctamente."

## Tasks

- **T1 — Verified done; commit pending — S1–S4:** Tools/runtime, tests, documentation, and agent instructions implemented as one functional unit under L2. Allowed implementation surfaces remain `src/ai/**`, `src/trigger/telegram.ts`, `src/telegram/agent.test.ts`, `package.json`, `package-lock.json`, `README.md`, and `AGENTS.md` (narrow changes only). No migrations or Telegram registration changes. Environment-variable guidance is included. Split review into these work-unit slices to protect review size:
  - **U1:** Runtime module, tests, and SDK dependency; approximately 435 authored lines excluding the lockfile.
  - **U2:** Agent integration, instructions, documentation, and tests; approximately 145 authored lines.
- **T2 — Functional verification done; native review pending — S1–S4:** Independent verifier confirmed T1 after the three fixes recorded in L3. Native review must still close before marking the full feature done. Live OpenAI semantic routing and runtime Firecrawl calls remain unverified; offline fixtures and research discovery do not establish either.

## Log

- **L1 — User request (verbatim):**

  > Configurá la **skill de Firecrawl** en este proyecto y registrala como una herramienta (*tool*) en nuestro agente de Telegram de Trigger.
  >
  > Desarrollá las instrucciones del agente para que reconozca cuándo debe utilizar las herramientas de Firecrawl en situaciones como las que se describen en estos ejemplos: [https://www.firecrawl.dev/prompts](https://www.firecrawl.dev/prompts?utm_source=chatgpt.com)
  >
  > Tené en cuenta que los clientes que utilizan este bot no conocen Firecrawl ni Alexandria, por lo que el bot debe decidir inteligentemente cuándo utilizar estas herramientas según lo que solicite el usuario, sin necesidad de que este mencione ninguna de esas tecnologías.
  >
  > Utilizá las skills de **Firecrawl, Trigger y AI SDK**.
  >
  > Al finalizar, indicame si necesito agregar alguna variable de entorno (*environment variable*) para que funcione correctamente.

- **L2 — Parent-provided research evidence and implementation decisions (not additional user requirements):**
  - **Research provenance:** Firecrawl skills already exist in `.agents/skills`; the SDK was not installed at initial research time. The actual authenticated CLI is version `1.29.0`. The user-linked prompt catalog was fetched into ignored `.firecrawl/firecrawl-prompts-agent.md`: 35 examples, including ticket price history, market odds, shopping, travel, jobs, and apartment search. Actual `find-tools` output in `.firecrawl/firecrawl-alexandria-contracts.json` supplies vetted read-only `polymarket/search/query` and `polymarket/markets/list` contracts with explicit query/filter schemas. This tracking unit records the supplied evidence; it does not independently rerun that research.
  - **SDK evidence:** The current official SDK `4.54.0` supports `search(query, { sources: ['web', 'alexandria'], limit: 5, toolDetail: 'full' })`, `scrape(url, ...)`, `map`, and `scrape({ alexandria: { provider, capability, options } })`. Verify actual installed types during T1. Catalog discovery returns descriptions/contracts, not executed results or current data; arbitrary providers have no read-only guarantee.
  - **Implementation boundary:** Build a narrow AI SDK tool factory using official `firecrawl@4.54.0`. Expose web search (web plus Alexandria discovery), public HTTP(S) URL scraping, site mapping, Alexandria contract discovery, and explicitly allowlisted read-only Polymarket query/markets lookups. Never expose arbitrary provider dispatch, shell execution, purchases, bookings, logins, or terms acceptance. Other provider records remain unavailable until specifically vetted; fall back honestly to web search and explain the limitation.
  - **Environment and compatibility:** Read `FIRECRAWL_API_KEY` lazily from the Trigger environment. An absent key disables web tools, with instructions explicitly stating that live browsing is unavailable, rather than breaking existing chat. Document local development and Trigger production configuration; do not sync this key to Railway. Keep the existing model unchanged (`gpt-5-nano`, minimal reasoning).
  - **Execution limits:** Return at most five results, bound text/result sizes, impose 20-second transport timeouts for web search, scraping, mapping, and discovery, and 45-second transport timeouts for the two allowlisted Polymarket SDK request variants (the SDK adds a mandatory 30-second response margin to the 15-second operation timeout). Keep at most five steps per turn. Set `maxRetries: 1`, which means one attempt in this SDK, not one retry. The SDK does not support in-flight cancellation: abort prevents new calls and discards results, but cannot cancel an in-flight paid request; remote work may outlive transport timeouts. Reject localhost, private address literals, credentials in URLs, and non-HTTP(S) URLs. Firecrawl performs remote fetching; do not locally fetch user URLs. Treat external content as untrusted prompt-injection data, never as instructions.
  - **Agent behavior:** Register tools on `chat.agent` and forward managed run tools. Select tools from user intent without requiring brand names; cite returned URLs. Never claim unsupported bookings, alerts, or historical data. Ask for destination, date, location, or currency only when needed. Do not call web tools for ordinary greetings, rewriting, arithmetic, or facts already known from the transcript.
  - **Tests and authorization:** Mock Firecrawl and AI SDK multi-step tool selection by intent without brand names. Cover cancellation, errors/redaction, URL boundaries, missing-key behavior, and preservation of memory/no-tool behavior. No live paid model run unless necessary and authorized later; no publishing is authorized.
  - **Documentation:** Update `README.md` and narrowly update `AGENTS.md` with tool scope, limits, missing-key behavior, `FIRECRAWL_API_KEY` for local development and Trigger production (not Railway), examples grounded in the actual catalog, and unsupported capabilities. No migration or Telegram registration changes.

- **L3 — Parent-reported implementation and independent verification evidence:** S1–S4 implementation completed and the independent verifier confirmed the result after three fixes: preserve long URLs, explicitly mark truncation when clipping 41 fields, and redact property names as well as values. Reported checks passed: 41/41 tests, both TypeScript checks (`tsc`), `npm run build`, and successful bundling with Trigger CLI `--dry-run`. Exact invocations for the test runner, TypeScript checks, and Trigger command were not supplied in this tracking update; these are recorded as parent-reported results, not commands rerun here. No live OpenAI semantic-routing run or runtime Firecrawl call has been performed. Actual research CLI calls fetched the prompt catalog and discovery contracts; discovered contracts are not live records. T1 is verified done with commit pending; T2 functional verification is done with native review pending. U1 and U2 above are review-size slices, not additional tasks or evidence of completed native review. The full feature remains open until native review closes.
