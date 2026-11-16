# personal-assistant

## Qué es

Bot de Telegram que responde a tus mensajes con IA, ejecutado en [Trigger.dev](https://trigger.dev):

```
Telegram → endpoint webhook `telegram` → chat.agent `telegram-assistant` (una sesión por chat)
         → OpenAI `gpt-5-nano` (AI SDK) → sendMessage
```

- El endpoint y el agente están en `src/trigger/telegram.ts`; el cliente de la Bot API, en `src/telegram/`; el prompt y el modelo, en `src/ai/assistant.ts`.
- Modelo por defecto `gpt-5-nano` (el más barato, esfuerzo de razonamiento `minimal`); configurable con `AI_MODEL`.
- Los updates sin texto (foto, sticker, etc.) no generan respuesta. Las respuestas de más de 4096 caracteres se envían en varios mensajes.
- [Hono](https://hono.dev) en Railway solo sirve `GET /` (`src/app.ts`). Ya no existe `POST /telegram/webhook`.

## Memoria de la conversación

Cada chat de Telegram conserva su propio historial gracias al *transcript storage* por defecto de `chat.agent` (`storage: defaultStorage`): un snapshot por sesión en el almacenamiento de objetos de Trigger.dev. No hay base de datos ni infraestructura extra; una run nueva retoma desde el snapshot.

Límites documentados:

- Los snapshots se acumulan por sesión y no vencen por defecto; las sesiones cerradas no se limpian solas. Si hace falta, se puede definir una política de ciclo de vida en el bucket (ver `persistence-and-replay.mdx` en la documentación de Trigger.dev).

## Variables de entorno

| Variable | Dónde | Descripción |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Entorno de Trigger.dev | Token del bot (@BotFather). |
| `OPENAI_API_KEY` | Entorno de Trigger.dev | API key de OpenAI; la lee `@ai-sdk/openai`. |
| `AI_MODEL` | Entorno de Trigger.dev | Opcional. Por defecto `gpt-5-nano`. |
| `TELEGRAM_WEBHOOK_SECRET` | Local / tu terminal | Secreto de firma del endpoint `telegram`, también enviado a Telegram como `secret_token`. |

- Las variables del bot tienen que existir en el entorno de Trigger.dev, ya no en Railway. En Development, `trigger dev` lee el `.env` local; en Production, cargalas en las variables de entorno del dashboard de Trigger.dev.
- `TELEGRAM_WEBHOOK_SECRET`: 1–256 caracteres, solo `A-Z a-z 0-9 _ -` (lo exige Telegram).
- Railway ya no necesita `TELEGRAM_*` ni `OPENAI_API_KEY`. Nunca sincronices `TRIGGER_SECRET_KEY` a Railway (ver `AGENTS.md`): la clave del `.env` local es la de Development.
- No subas valores reales al repo.

## Registrar el webhook en Telegram

Hacelo por separado para Development y Production. El endpoint `telegram` existe una vez por entorno, con su propia URL y su propio secreto.

1. **Descubrir el endpoint.** Development: `npx trigger.dev@latest dev`. Production: deploy (`npx trigger.dev@latest deploy --env prod`). El endpoint `telegram` aparece en la página **Webhooks** del entorno.
2. **Definir el secreto de firma** (se guarda sin imprimirse):
   ```bash
   # Development (usa --env dev; para producción, --env prod)
   npx trigger.dev@latest webhooks generate-secret telegram --env dev --to-env TELEGRAM_WEBHOOK_SECRET
   ```
   Escribe `TELEGRAM_WEBHOOK_SECRET` en `.env.local`. Para reutilizar un valor existente: `npx trigger.dev@latest webhooks set-secret telegram --env <dev|prod> --from-env TELEGRAM_WEBHOOK_SECRET`. Verificá que el valor generado cumpla `A-Z a-z 0-9 _ -` (1–256 caracteres); si no, definí uno propio con `set-secret`.
3. **Copiar la URL** del endpoint desde la página Webhooks.
4. **Registrar en Telegram** y comprobar:
   ```bash
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -d "url=<URL del endpoint>" \
     -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"

   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
   ```
   `getWebhookInfo` tiene que mostrar la URL del endpoint y sin `last_error_message`.

Notas:

- Telegram admite un solo webhook por bot: registrar este detiene el tráfico hacia la ruta vieja de Railway. Para volver atrás, `setWebhook` con la URL de Railway y el secreto anterior.
- Mientras el endpoint muestre **Needs secret** en la columna *Signing secret*, se rechazan todas las entregas.
- El endpoint de Development solo procesa updates mientras `npx trigger.dev@latest dev` está corriendo.
- Production requiere deploy en Trigger.dev, hoy bloqueado para esta organización.
- Si cambiás el secreto, volvé a ejecutar `setWebhook` con el nuevo valor.

## Tareas en segundo plano (Trigger.dev)

Proyecto: `proj_jlpqfxtzvlysgjgaxtuo`. Además del bot, la tarea `hello-world` está en `src/trigger/example.ts`.

1. Autenticate con `npx trigger.dev@latest login` si hace falta.
2. Copiá la clave de desarrollo `TRIGGER_SECRET_KEY` desde el dashboard a tu `.env` local. No la subas al repo.
3. Ejecutá `npx trigger.dev@latest dev` en otra terminal, separado del servidor Hono.
4. En el [dashboard del proyecto](https://cloud.trigger.dev/projects/v3/proj_jlpqfxtzvlysgjgaxtuo), seleccioná Development y probá `hello-world` con `{}`. Resultado esperado: `{"message":"Hello, world!"}` tras cinco segundos.

`npx tsc --noEmit` comprueba la aplicación y `trigger.config.ts`. `npm run build` usa `tsconfig.build.json` para conservar `dist/index.js` como entrada del servidor; Trigger.dev compila sus tareas por separado. Los archivos locales de Trigger.dev se ignoran en `.trigger/`.

## Desarrollo y pruebas

```bash
npm install
npm run dev   # servidor Hono en http://localhost:3000 (usa PORT si está definido; Railway lo inyecta)
npm test
```

- `npm test` corre las pruebas unitarias sin red ni secretos.
- Prueba end to end: en el dashboard, pestaña **Test** del endpoint `telegram`; las entregas se ven (y se pueden reenviar) en su pestaña **Deliveries**.

Con la CLI de Hono, sin levantar el servidor. Como `src/app.ts` ya no importa `ai` ni `@ai-sdk/openai`, funciona sin flags:

```bash
npx hono routes src/app.ts
npx hono request / src/app.ts
```

La forma anterior, `-e ai -e @ai-sdk/openai -e @trigger.dev/sdk`, sigue funcionando (verificado con ambos comandos), pero ya no es necesaria.
