# personal-assistant

## Qué es

Bot de Telegram que te devuelve exactamente lo que le enviás. Usa `copyMessage` de la Bot API, así que funciona con texto, fotos, stickers, etc. Está hecho con [Hono](https://hono.dev) y expone `POST /telegram/webhook`.

## Variables de entorno

| Variable | Descripción |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Token del bot, lo da @BotFather. |
| `TELEGRAM_WEBHOOK_SECRET` | Secreto compartido con Telegram: 1–256 caracteres, solo `A-Z a-z 0-9 _ -`. |

En local van en un archivo `.env`; en el deploy, como variables de Railway. No subas valores reales al repo.

## Comportamiento del endpoint

`POST /telegram/webhook` responde:

- `401`: falta el header `X-Telegram-Bot-Api-Secret-Token` o no coincide con `TELEGRAM_WEBHOOK_SECRET`.
- `500`: falta `TELEGRAM_BOT_TOKEN` o `TELEGRAM_WEBHOOK_SECRET`.
- `400`: el body no es JSON válido.
- `200`: en cualquier otro caso, incluso si el update no trae `message` o si `copyMessage` falla (así Telegram no reintenta el update).

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
npm run dev   # servidor en http://localhost:3000
npm test
```

Con la CLI de Hono, sin levantar el servidor:

```bash
npx hono routes src/app.ts

# Update sin `message`: no llama a la Bot API
TELEGRAM_BOT_TOKEN=dummy TELEGRAM_WEBHOOK_SECRET=dummy \
npx hono request -X POST /telegram/webhook src/app.ts \
  -H 'X-Telegram-Bot-Api-Secret-Token: dummy' \
  -d '{"update_id":1}'
```
