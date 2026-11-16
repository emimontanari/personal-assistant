# personal-assistant

## Qué es

Bot de Telegram que responde a tus mensajes con IA. Usa [AI SDK](https://ai-sdk.dev) con OpenAI (`@ai-sdk/openai`; modelo por defecto `gpt-5-nano`, el más barato, con esfuerzo de razonamiento `minimal`; configurable con `AI_MODEL`) y envía la respuesta con `sendMessage`. Está hecho con [Hono](https://hono.dev) y expone `POST /telegram/webhook`.

- Si el mensaje no es de texto (foto, sticker, etc.), responde `Por ahora solo puedo responder mensajes de texto.`
- Si falla la generación, responde `No pude generar una respuesta en este momento. Probá de nuevo en un rato.`

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Token del bot, lo da @BotFather. |
| `TELEGRAM_WEBHOOK_SECRET` | Secreto compartido con Telegram: 1–256 caracteres, solo `A-Z a-z 0-9 _ -`. |
| `OPENAI_API_KEY` | API key de OpenAI; la lee `@ai-sdk/openai`. |
| `AI_MODEL` | Opcional. Modelo a usar; por defecto `gpt-5-nano`. |

Las tres primeras son obligatorias. En local van en un archivo `.env`; en el deploy, como variables de Railway: `OPENAI_API_KEY` también tiene que cargarse ahí (y `AI_MODEL` si lo cambiás). No subas valores reales al repo.

## Comportamiento del endpoint

`POST /telegram/webhook` responde:

- `401`: falta el header `X-Telegram-Bot-Api-Secret-Token` o no coincide con `TELEGRAM_WEBHOOK_SECRET`.
- `500`: falta `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` u `OPENAI_API_KEY`.
- `400`: el body no es JSON válido.
- `200`: en cualquier otro caso, incluso si el update no trae `message`, si falla la generación o si falla `sendMessage` (así Telegram no reintenta el update).

## Tareas en segundo plano (Trigger.dev)

Proyecto: `proj_jlpqfxtzvlysgjgaxtuo`. La tarea exportada `hello-world` está en `src/trigger/example.ts`; no llama al webhook ni a servicios externos.

1. Autenticate con `npx trigger.dev@latest login` si hace falta.
2. Copiá la clave de desarrollo `TRIGGER_SECRET_KEY` desde el dashboard a tu `.env` local. No la subas al repo.
3. Ejecutá `npx trigger.dev@latest dev` en otra terminal, separado del servidor Hono.
4. En el [dashboard del proyecto](https://cloud.trigger.dev/projects/v3/proj_jlpqfxtzvlysgjgaxtuo), seleccioná el entorno Development y probá `hello-world` con `{}`. El resultado esperado es `{"message":"Hello, world!"}` después de una espera de cinco segundos.

`npx tsc --noEmit` comprueba la aplicación y `trigger.config.ts`. `npm run build` usa `tsconfig.build.json` para conservar `dist/index.js` como entrada del servidor; Trigger.dev compila sus tareas por separado. Los archivos locales de Trigger.dev se ignoran en `.trigger/`.

## Registrar el webhook

Requiere una URL pública con HTTPS.

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://<tu-dominio>/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

Para comprobarlo:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

Si cambiás el secreto, ejecutá `setWebhook` de nuevo.

## Desarrollo y pruebas

```bash
npm install
npm run dev   # servidor en http://localhost:3000 (usa PORT si está definido; Railway lo inyecta)
npm test
```

Con la CLI de Hono, sin levantar el servidor. Hace falta marcar como externos `ai` y `@ai-sdk/openai` con `-e`; sin eso falla con `Dynamic require of "path" is not supported`:

```bash
npx hono routes src/app.ts -e ai -e @ai-sdk/openai

# Update sin `message`: no llama a la Bot API
TELEGRAM_BOT_TOKEN=dummy TELEGRAM_WEBHOOK_SECRET=dummy \
OPENAI_API_KEY=dummy \
npx hono request -X POST /telegram/webhook src/app.ts \
  -e ai -e @ai-sdk/openai \
  -H 'X-Telegram-Bot-Api-Secret-Token: dummy' \
  -d '{"update_id":1}'
```
