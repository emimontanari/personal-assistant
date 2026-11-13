# Telegram AI reply

El webhook del bot deja de repetir el mensaje y responde con texto generado por AI SDK usando el modelo más barato de OpenAI.
Branch: `feat/telegram-ai-reply`. Base: `odd/tasks/telegram-echo-webhook.md` (secret guard, códigos de estado y manejo de errores se mantienen).

## Specs

- **S1** — "Modificá el webhook del bot de Telegram para que, en lugar de repetir el mensaje del usuario, genere una respuesta utilizando AI SDK con un modelo económico."
  - Para un update con `message.text` (string no vacío), se llama a `generateText` de `ai` con el texto del usuario como prompt y un system prompt corto (asistente personal, conciso, responde en el idioma del usuario), y se envía la respuesta con `sendMessage` (`chat_id` = `message.chat.id`, `text` = respuesta generada) a `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage`. Ya no se usa `copyMessage`.
  - Modelo más barato posible por defecto: `gpt-5-nano` (el modelo de chat más barato de OpenAI en models.dev: $0.05 in / $0.40 out por M tokens), configurable con la variable opcional `AI_MODEL`. Como es un modelo de razonamiento, se pide el menor esfuerzo de razonamiento que soporte el provider para minimizar tokens facturados.
  - Mensaje sin texto (foto, sticker, etc.) con `chat.id` válido: se responde con `sendMessage` y el texto fijo `Por ahora solo puedo responder mensajes de texto.`, sin llamar al modelo.
  - Si la generación falla (error del modelo, timeout, 403 por créditos): se loguea el nombre del error sin secretos y se envía `sendMessage` con `No pude generar una respuesta en este momento. Probá de nuevo en un rato.`; el webhook responde `200`.
  - Timeouts: la generación se corta a los 25 s (`abortSignal`), el `sendMessage` a los 10 s. Respuesta generada vacía → se trata como fallo de generación.
  - Se mantienen: `401` secret inválido, `400` JSON inválido, `200` para updates sin `message` o con campos inválidos (sin llamadas externas), `200` aunque falle `sendMessage`, y nunca se loguean tokens.
- **S2** — "Instalá el paquete correspondiente de AI SDK para mi proveedor de IA." Actualizado por L6: el proveedor es **OpenAI** ("al final no voy a cargar créditos en Neon, sino que tengo en OpenEI"; "ya tengo la apikey cargado en el env, siempre con el modelo mas barato posible").
  - Paquete: `@ai-sdk/openai@latest` (línea 4.x, compatible con `ai` ^7). Se desinstala `@neon/ai-sdk-provider`.
  - Variable: `OPENAI_API_KEY` (la lee el provider). Si falta, el webhook responde `500` sin llamadas externas (fail closed). `NEON_AI_GATEWAY_*` dejan de ser requeridas.
  - `neon.ts` ya no declara `aiGateway`.
- **S3** — "Utilizá las skills de ai-sdk, hono y neon." Los writers cargan `.agents/skills/ai-sdk/SKILL.md`, `.agents/skills/hono/SKILL.md` y la skill `neon-ai-gateway`; las APIs de AI SDK se verifican contra `node_modules/ai/docs` de la versión instalada.

## Tasks

- T1 — S1, S2, S3 — writer `gentle-ai-worker` — instalar `@neon/ai-sdk-provider` (+ `zod`), reescribir el webhook con inyección de dependencias para tests, tests, `neon.ts` — commit: 2245455 (26/26 tests; tsconfig excluye neon.ts)
- T2 — S1, S2 — writer `gentle-ai-worker` — README y AGENTS.md: comportamiento nuevo, variables, modelo — commit: e6390bc
- T3 — S1, S2 — writer `gentle-ai-worker` — cambiar provider Neon → OpenAI (`@ai-sdk/openai`), `OPENAI_API_KEY`, menor esfuerzo de razonamiento, tests, docs, `neon.ts` — commit: b9e3e50 (27/27 tests)

## Log

- **L1** (pedido original, verbatim):
  > Modificá el webhook del bot de Telegram para que, en lugar de repetir el mensaje del usuario, genere una respuesta utilizando AI SDK con un modelo económico.
  >
  > Instalá el paquete correspondiente de AI SDK para mi proveedor de IA.
  >
  > Utilizá las skills de ai-sdk, hono y neon.
- **L2** — Contexto: el usuario creó la credencial Neon `personal-assistant-bot` (`ai_gateway:invoke`) y está cargando `NEON_AI_GATEWAY_*` en `.env`; el agente no puede leer `.env`. Proyecto Neon `crimson-flower-57816235`, branch `main`, `aws-us-east-1`.
- **L3** — Decisiones del orquestador (no pedidas explícitamente, reversibles): modelo `gpt-5-nano` con override `AI_MODEL`; respuesta fija para mensajes sin texto; mensaje fijo de fallo; timeouts 25 s / 10 s.
- **L4** — Verify independiente (Risk items 2, 5): S1, S2, S3 cumplidos; build + runtime con Node OK (200/401/500); 0 vulnerabilidades (`npm audit --omit=dev`). Advisories: no hay test que fije los valores 25 s / 10 s; el 403 real del gateway solo se probó con mock.
- **L5** — Review nativa RDD `review-bc259e053efd0e8e` (risk, resilience, reliability) sobre `main..6f07053`: **approved**, autoridad quemada. Advisories no bloqueantes: WARNING `R1-unmetered-paid-generation` (cualquiera que escriba al bot consume créditos, sin límite ni allowlist); WARNING `R3-tg-4096-limit` / `R4-reply-length-unbounded` (respuestas > 4096 caracteres hacen fallar `sendMessage`); WARNING `R3-weak-abort-and-timeout-tests`; SUGGESTION sobre peso de dependencias y wiring de rutas sin test.
- **L6** (usuario, verbatim): "Acá quiero que me ayudes con una cosa, porque al final no voy a cargar créditos en Neon, sino que tengo en OpenEI. ¿Qué tengo que usar? ¿Versar el SDK y conectarlo con OpenEI? ¿Cómo se tendría que hacer ahí?" → luego: "si hacelo por que ya tengo la apikey cargado en el env, siempre con el modelo mas barato posible". Reabre S1 (modelo) y S2 (proveedor) → T3.
- **L7** — Verify independiente del cambio a OpenAI (b9e3e50): S1, S2, S3 cumplidos; 27/27; runtime Node 200/401/500; `@ai-sdk/openai@4.0.117` comparte `@ai-sdk/provider@4.0.38` con `ai@7`; 0 vulnerabilidades. `gpt-5-nano` confirmado como el modelo de texto más barato de OpenAI (models.dev). Con un `AI_MODEL` no razonador, el provider descarta `reasoningEffort` con un warning (no falla). Sin llamada real a OpenAI.
