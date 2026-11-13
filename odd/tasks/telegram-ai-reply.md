# Telegram AI reply

El webhook del bot deja de repetir el mensaje y responde con texto generado por AI SDK usando un modelo económico del Neon AI Gateway.
Branch: `feat/telegram-ai-reply`. Base: `odd/tasks/telegram-echo-webhook.md` (secret guard, códigos de estado y manejo de errores se mantienen).

## Specs

- **S1** — "Modificá el webhook del bot de Telegram para que, en lugar de repetir el mensaje del usuario, genere una respuesta utilizando AI SDK con un modelo económico."
  - Para un update con `message.text` (string no vacío), se llama a `generateText` de `ai` con el texto del usuario como prompt y un system prompt corto (asistente personal, conciso, responde en el idioma del usuario), y se envía la respuesta con `sendMessage` (`chat_id` = `message.chat.id`, `text` = respuesta generada) a `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage`. Ya no se usa `copyMessage`.
  - Modelo económico por defecto: `gpt-5-nano` (el más barato del catálogo Neon en models.dev: $0.05 in / $0.40 out por M tokens), configurable con la variable opcional `AI_MODEL`.
  - Mensaje sin texto (foto, sticker, etc.) con `chat.id` válido: se responde con `sendMessage` y el texto fijo `Por ahora solo puedo responder mensajes de texto.`, sin llamar al modelo.
  - Si la generación falla (error del modelo, timeout, 403 por créditos): se loguea el nombre del error sin secretos y se envía `sendMessage` con `No pude generar una respuesta en este momento. Probá de nuevo en un rato.`; el webhook responde `200`.
  - Timeouts: la generación se corta a los 25 s (`abortSignal`), el `sendMessage` a los 10 s. Respuesta generada vacía → se trata como fallo de generación.
  - Se mantienen: `401` secret inválido, `400` JSON inválido, `200` para updates sin `message` o con campos inválidos (sin llamadas externas), `200` aunque falle `sendMessage`, y nunca se loguean tokens.
- **S2** — "Instalá el paquete correspondiente de AI SDK para mi proveedor de IA."
  - Proveedor: Neon AI Gateway → paquete `@neon/ai-sdk-provider` (peer: `ai` ^6 || ^7, `zod`). `ai` ^7.0.172 ya está en `package.json` (instalado por el usuario).
  - Variables: `NEON_AI_GATEWAY_TOKEN` y `NEON_AI_GATEWAY_BASE_URL` (las lee el provider). Si falta alguna, el webhook responde `500` sin llamadas externas (fail closed, igual que las de Telegram).
  - `neon.ts` declara `aiGateway: true`.
- **S3** — "Utilizá las skills de ai-sdk, hono y neon." Los writers cargan `.agents/skills/ai-sdk/SKILL.md`, `.agents/skills/hono/SKILL.md` y la skill `neon-ai-gateway`; las APIs de AI SDK se verifican contra `node_modules/ai/docs` de la versión instalada.

## Tasks

- T1 — S1, S2, S3 — writer `gentle-ai-worker` — instalar `@neon/ai-sdk-provider` (+ `zod`), reescribir el webhook con inyección de dependencias para tests, tests, `neon.ts` — commit: pending
- T2 — S1, S2 — writer `gentle-ai-worker` — README y AGENTS.md: comportamiento nuevo, variables, modelo — commit: pending

## Log

- **L1** (pedido original, verbatim):
  > Modificá el webhook del bot de Telegram para que, en lugar de repetir el mensaje del usuario, genere una respuesta utilizando AI SDK con un modelo económico.
  >
  > Instalá el paquete correspondiente de AI SDK para mi proveedor de IA.
  >
  > Utilizá las skills de ai-sdk, hono y neon.
- **L2** — Contexto: el usuario creó la credencial Neon `personal-assistant-bot` (`ai_gateway:invoke`) y está cargando `NEON_AI_GATEWAY_*` en `.env`; el agente no puede leer `.env`. Proyecto Neon `crimson-flower-57816235`, branch `main`, `aws-us-east-1`.
- **L3** — Decisiones del orquestador (no pedidas explícitamente, reversibles): modelo `gpt-5-nano` con override `AI_MODEL`; respuesta fija para mensajes sin texto; mensaje fijo de fallo; timeouts 25 s / 10 s.
