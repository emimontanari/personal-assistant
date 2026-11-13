# Telegram echo webhook

Webhook de Hono para un bot de Telegram que devuelve exactamente lo que el usuario le envía.
Branch: `feat/telegram-echo-webhook`. Investigación de la API: Firecrawl (`.firecrawl/`, ignorado).

## Specs

- **S1** — "Utilizá Hono para desarrollar un webhook sencillo para un bot de Telegram que devuelva exactamente lo que el usuario le envíe."
  - Ruta `POST /telegram/webhook` en `src/app.ts` (la app que carga `npx hono ... src/app.ts`).
  - Para un update con `message`, el bot llama a `copyMessage` de la Bot API (`https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/copyMessage`) con `chat_id` = `message.chat.id`, `from_chat_id` = `message.chat.id`, `message_id` = `message.message_id`. `copyMessage` reproduce el mensaje tal cual (texto, foto, sticker, etc.), no solo texto.
  - Responde `200` a Telegram. Un update sin `message` (ej. `edited_message`, `callback_query`) responde `200` y no llama a la Bot API.
  - Si la llamada a `copyMessage` falla (red o respuesta no OK), se loguea el error sin el token y se responde `200` igual, para que Telegram no reintente el update indefinidamente.
- **S2** — "Variables de entorno agregadas: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET".
  - Telegram envía el `secret_token` de `setWebhook` en el header `X-Telegram-Bot-Api-Secret-Token` en cada request (fuente: Bot API vía Firecrawl search; hookdeck.com/webhooks/skills/telegram-webhooks).
  - Si el header falta o no coincide con `TELEGRAM_WEBHOOK_SECRET` (comparación en tiempo constante), responde `401` y NO llama a la Bot API.
  - Si `TELEGRAM_WEBHOOK_SECRET` o `TELEGRAM_BOT_TOKEN` no están configuradas, responde `500` y NO llama a la Bot API (fail closed).
  - Las variables se leen de `process.env` en cada request; el token nunca aparece en logs ni respuestas.
- **S3** — "Utilizá Firecrawl para investigar la API de bots de Telegram." Hecho en la investigación previa; el README documenta cómo registrar el webhook con `setWebhook` y `secret_token` (1–256 caracteres, `A-Z a-z 0-9 _ -`).

## Tasks

- T1 — S1, S2 — writer `gentle-ai-worker` — ruta, verificación de secret, eco con `copyMessage`, tests (`node:test` + `tsx`, `fetch` mockeado), script `npm test` — commit: 3cf166a (done: 11/11 tests; `invalid JSON` → 400 elegido por el writer)
- T2 — S3 — writer `gentle-ai-worker` — README: variables, registro de webhook, prueba con Hono CLI — commit: 4518510 (done; verify: S1-S3 met, regression tests added)

## Log

- **L1** (pedido original, verbatim):
  > Utilizá Firecrawl para investigar la API de bots de Telegram.
  >
  > Utilizá Hono para desarrollar un webhook sencillo para un bot de Telegram que devuelva exactamente lo que el usuario le envíe.
  >
  > Variables de entorno agregadas:
  > - TELEGRAM_BOT_TOKEN
  > - TELEGRAM_WEBHOOK_SECRET
- **L2** — Firecrawl no puede scrapear `core.telegram.org` ("we do not support this site"); la investigación se hizo con `firecrawl search` (highlights de la Bot API oficial + hookdeck, StackOverflow, aiogram docs). Hallazgos: header `X-Telegram-Bot-Api-Secret-Token`; `copyMessage(chat_id, from_chat_id, message_id)`.
- **L3** — Decisión: eco con `copyMessage` vía `fetch` usando `TELEGRAM_BOT_TOKEN` (en vez de responder el método en el body del webhook) para cubrir cualquier tipo de mensaje y poder loguear fallos.
