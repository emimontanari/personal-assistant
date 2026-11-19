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

## Gastos personales por texto (etapa inicial)

Tres tools en Trigger.dev, no en Hono: `registrarGasto`, `consultarGastos` y `corregirGasto`. Requieren **`TELEGRAM_OWNER_ID` y `DATABASE_URL`** en el entorno de Trigger.dev. Configurá el propietario **antes de usar datos financieros**: es el ID numérico positivo de Telegram `message.from.id`, no el username. Con propietario configurado solo se aceptan mensajes de ese remitente en su chat privado con el mismo ID; grupos, otros usuarios y mensajes sin remitente se descartan antes del modelo. Un ID configurado inválido también bloquea la entrada. Sin propietario se conserva el chat general/web, pero no se ofrecen tools de gastos ni se permiten escrituras; sin DB tampoco se habilitan gastos.

**Interruptor del servidor `EXPENSES_ENABLED`:** omitido conserva la disponibilidad anterior (DB + propietario válido); solo el string exacto `true` permite gastos con todas las barreras existentes. Cualquier otro valor presente (`false`, `0`, vacío, `TRUE`, ` true ` o un typo) desactiva las tres tools, incluidas consultas. Se comprueba al ofrecerlas y dentro de cada ejecutor, incluso si el contexto autorizado se creó antes de desactivarlo, antes de acceder a DB/FX. No acepta overrides del modelo ni de `clientData`. No cambia el filtro de propietario, el chat general, Firecrawl ni la memoria.

- “Gasté 3500 en café” ⇒ ARS 3500.00 por defecto. Solo USD explícito: no se infiere la moneda por el nombre de un producto.
- “Gasté USD100 en GTA6” ⇒ conserva USD 100.00 y muestra ARS **indicativo** si hay evidencia, junto con la fecha de cotización y las fuentes guardadas; no hay tasa fija ni liquidación de tarjeta garantizada.
- Importe decimal positivo de hasta dos decimales, descripción de hasta 500 caracteres, categoría opcional de hasta 100. Si faltan datos o son ambiguos el agente pregunta; datos claros se guardan mediante la tool, un gasto por turno. Fecha omitida: hoy en `America/Argentina/Buenos_Aires`; fechas explícitas reales `YYYY-MM-DD`. Para semanas/meses se usan límites `from`/`to` inclusivos en esa zona.
- Consulta sin fechas: primeros 20 registros por fecha ascendente (límite configurable 1–100), con total ARS de **todo** el intervalo, no solo la página. Las conversiones pendientes se cuentan aparte y no se suman como ARS inventado. Para corregir se consulta y selecciona un UUID y su versión; una selección ambigua se pregunta y una versión desactualizada da conflicto. Hay historial de revisiones; no hay eliminación.

**Permiso de escritura por turno:** además de autenticar al propietario, el backend usa únicamente el texto del **último mensaje del usuario**, antes de llamar al modelo. Reconoce un conjunto conservador de comienzos explícitos: «Gasté 3500 en café», «Pagué 2000», «Registrá un gasto…», «Anotá el gasto…» (alta) y «Corregí el/ese gasto…» (corrección); también «Ese café era2500,no3500», siempre desambiguando el registro antes de corregir. Normaliza mayúsculas y acentos. Alta no autoriza corrección, ni viceversa. El permiso congelado viaja solo por contexto del servidor; se filtran las tools ofrecidas y cada ejecutor vuelve a comprobarlo antes de acceder a la base.

«Cuánto gasté», hipótesis, ejemplos entre comillas, preguntas, mensajes con enlaces o varias líneas, negativas y un **«sí» aislado** no habilitan escrituras. Ni páginas web/resultados de tools, ni respuestas del asistente, historial anterior, `clientData` o argumentos del modelo pueden conceder el permiso. Para frases ambiguas/no reconocidas, el agente pide una nueva directiva explícita como «Registrá el gasto de 3500 en café» o «Corregí el gasto…» sin citas ni enlaces. No es comprensión general del lenguaje ni una garantía sobre cada dato elegido por el modelo: es una barrera determinista por acción, con falsos negativos deliberados. Las consultas de gastos (si están habilitados) y las tools web configuradas siguen disponibles sin permiso de escritura.

La conversión usa la media aritmética exacta de dos o tres portales comparables del **dólar oficial vendedor**, todos de la misma fecha: DolarAPI, fuente `Oficial` de Bluelytics y ArgentinaDatos. Si no alcanza evidencia del día del gasto se busca la última fecha anterior disponible y se indica que **no es la fecha del gasto**; nunca se usa una fecha posterior. Con menos de dos cotizaciones válidas se guarda USD con conversión pendiente, sin fabricar ARS. Se conservan importe/moneda original, ARS, fecha, media y evidencia con fuentes y observación. Cambiar importe/moneda/fecha vuelve a consultar la conversión con los campos finales; cambiar solo descripción/categoría conserva la evidencia.

Límites del servicio de cotización: hasta 512 filas de historial, cinco fechas candidatas y siete requests por conversión, timeout total 15 s y 5 s por request, sin reintentos ni URLs/tasas suministradas por el modelo. No garantiza cobertura histórica completa: fuera del historial solo puede probar la fecha exacta en ArgentinaDatos. Firecrawl no es la fuente numérica canónica del cambio.

Identidad y origen los fija el backend: contexto server-only por tool (`toolsContext` + `contextSchema`), remitente validado antes del turno y clave `${run.id}:${turn}:register`. El webhook deduplica `update_id`; la base impide dos altas para la misma clave. En el mismo turno, repetir el mismo payload comparte resultado; uno distinto da conflicto. La garantía está **acotada a la misma run/turn/sourceKey**, no es exactly-once entre cualquier reinicio o redelivery. En un retry con nueva evidencia USD puede haber conflicto en lugar de una segunda alta. Otro turno permite repetir un gasto genuino. Los errores se devuelven con códigos saneados; nunca se debe afirmar que se guardó sin resultado exitoso. Las pruebas con modelos offline verifican el cableado, no decisiones semánticas reales.

Persistencia: Postgres con Drizzle, conexión perezosa; importar/iniciar el agente **no conecta ni migra**. La memoria del chat no cambia y no es el libro de gastos. Fotos de tickets, voz, CRM, calendario y listas de supermercado quedan para etapas posteriores.

### Migraciones: manuales y pendientes de aprobación

El SQL está en `drizzle/`; las pruebas locales usan PGlite aislado en memoria, sin tocar una DB real. **No se aplicó ninguna migración.** No ejecutar `npx drizzle-kit migrate` hasta que el usuario apruebe la DB/rama de desarrollo destino y, para producción real, exista aprobación explícita y backup. La configuración está en `drizzle.config.ts`; esa CLI toma `DATABASE_URL`. El runtime no aplica migraciones y no se agregaron scripts que las ejecuten. La activación con propietario y DB reales sigue pendiente; no hubo push ni deploy.

## Herramientas web por intención

Las skills de `.agents/skills/` guían a quienes programan; no son herramientas ejecutables ni se copian al prompt. El bot tiene cinco tools reales AI SDK en `src/ai/firecrawl-tools.ts`, registradas en `chat.agent` y reenviadas desde su `run` al `streamText` administrado por Trigger.dev:

| Intención / ejemplo del catálogo [Prompts](https://www.firecrawl.dev/prompts) | Tool |
| --- | --- |
| «Compará precios de zapatillas», vuelos/hoteles, entradas, noticias, empleos nuevos o alquileres | `webSearch` (web + descubrimiento Alexandria) |
| «Resumí esta URL» | `readWebPage` |
| «Encontrá la página de precios de este sitio» | `mapWebsite`, luego lectura |
| «Probabilidades de este evento», información financiera o registros estructurados | `discoverDataSources`, luego solo una consulta permitida si corresponde |
| Buscar eventos de predicción o leer slugs exactos | `predictionMarketLookup` (`query` / `markets`) |

No hace falta mencionar Firecrawl ni Alexandria. Saludos, reescrituras y preguntas sobre el historial no necesitan web. El agente recibe instrucciones para citar enlaces, distinguir precios estimados de verificados y datos actuales de históricos, y pedir fecha, destino, ubicación o moneda solo cuando sea necesario.

**Búsqueda temporal y evidencia:** la descripción de `webSearch` y su campo `query` guían consultas enfocadas en el tema y las restricciones reales del pedido. «Últimas noticias de OpenAI» usa como referencia la fecha actual `YYYY-MM-DD UTC`, calculada de nuevo en **cada turno**, incluso en sesiones largas; no exige que el usuario indique una fecha ni agrega años antiguos inventados. En cambio, «noticias de OpenAI de diciembre de 2025» conserva ese período histórico, sin sustituirlo por hoy. El wrapper no reescribe las queries automáticamente. Se prefieren fuentes primarias/oficiales cuando corresponde y se conocen, sin inventar un dominio obligatorio.

Para noticias recientes, las instrucciones piden leer artículos concretos con `readWebPage` (o encontrarlos con map/search) y verificar sus fechas de publicación y contenido dentro del presupuesto existente. Un índice, home o landing de novedades/release notes no cuenta como noticia individual; un snippet no prueba que el artículo se haya leído ni permite inventar su fecha desde una URL. Si solo hay evidencia vieja, sin fecha, parcial o insuficiente, debe explicarse y citar menos noticias que las pedidas. El contenido puede estar desactualizado: estas instrucciones no garantizan frescura en vivo ni que el modelo económico nunca se equivoque.

**Alcance limitado:** descubrir contratos no ejecuta proveedores ni devuelve registros actuales. Solo se ejecutan los endpoints de lectura `polymarket/search/query` (`q`, `limit_per_type: 5`) y `polymarket/markets/list` (`slug`, `closed` opcional, `limit: 5`), cotejados con los contratos reales de `firecrawl find-tools` guardados durante la investigación en `.firecrawl/firecrawl-alexandria-contracts.json` (archivo local ignorado). No se muestran ejemplos de contratos como datos vivos. Los demás proveedores solo se descubren; se puede recurrir a páginas web con límites explícitos. No se prometen los 35 casos del catálogo: no hay historial de precios garantizado, reservas, compras, trades, alertas, monitoreo, crawl, shell, login ni aceptación automática de términos. Una negativa por permisos, términos o saldo se devuelve como no disponible, sin reintentos.

**Límites y costos:** máximo cinco pasos de modelo y cinco ejecuciones totales por turno, incluso en paralelo, con estado nuevo por turno/chat. Hasta cinco resultados/contratos y 12.000 caracteres de JSON por llamada, con `truncated` explícito; también se acotan los campos y arreglos anidados. Queries de hasta 500 caracteres y URLs de hasta 2048. Se consumen créditos Firecrawl según endpoint/proveedor y tokens OpenAI por las consultas y resultados; estos límites no son un presupuesto monetario garantizado. No se envía feedback automáticamente.

El SDK oficial 4.54.0 usa timeout de operación de 15 s: búsqueda, lectura y mapa tienen timeout HTTP de 20 s (añade 5 s). `discoverDataSources` usa `search` con `sources: ['alexandria']`, no `findTools` ni ejecución Alexandria, por lo que también tiene 20 s. Solo `predictionMarketLookup` usa el overload Alexandria: allí el SDK reemplaza el timeout HTTP con 15 s + 30 s de margen, hasta 45 s. Se configura un solo intento (`maxRetries: 1` cuenta intentos en esta versión; cero no hace ninguna solicitud), sin reintentos automáticos, sin auto-resume de scrape y sin parseo de archivos/PDF. No admite `AbortSignal` en estas llamadas: Stop cancela el modelo y evita nuevas llamadas/descarta resultados, pero **no cancela la solicitud API paga ya iniciada**; esta puede seguir hasta su timeout y generar costo, y el trabajo remoto podría continuar incluso tras un timeout de transporte. No hay carreras de timers que abandonen operaciones activas.

Se rechazan URLs con credenciales, protocolos distintos de HTTP(S), hosts de una sola etiqueta, localhost y direcciones literales privadas/loopback/link-local, incluyendo IPv4 mapeado en IPv6. Firecrawl hace la descarga remota, nunca el servidor local hacia la URL del usuario. Esto **no garantiza** protección completa frente a DNS privado/rebinding ni redirecciones controladas por el servicio. El contenido recuperado se trata como datos no confiables, no instrucciones; no deben enviarse secretos ni datos personales innecesarios del historial.

**Configuración:** agregá `FIRECRAWL_API_KEY` al `.env` local para Trigger Development y a las variables del entorno Production de Trigger.dev. No hace falta en Railway; no sincronices ninguna clave `TRIGGER_SECRET_KEY` ni cambies la configuración del webhook. La clave se lee al ejecutar, sin credenciales embebidas. Sin ella se ocultan las tools en cada turno, se informa al modelo que no hay consulta en vivo y el chat normal sigue funcionando.

Las pruebas son offline, con clientes inyectados y modelos deterministas multistep: verifican ejecución, resultados, fuentes y continuidad del historial, **no** la selección semántica de un modelo real ni funcionamiento en producción.

## Memoria de la conversación

Cada chat de Telegram conserva su propio historial gracias al *transcript storage* por defecto de `chat.agent` (`storage: defaultStorage`): un snapshot por sesión en el almacenamiento de objetos de Trigger.dev. El historial no usa la base de gastos ni infraestructura extra; una run nueva retoma desde el snapshot. El libro de gastos habilitado por separado sí requiere Postgres.

Límites documentados:

- Los snapshots se acumulan por sesión y no vencen por defecto; las sesiones cerradas no se limpian solas. Si hace falta, se puede definir una política de ciclo de vida en el bucket (ver `persistence-and-replay.mdx` en la documentación de Trigger.dev).

## Variables de entorno

| Variable | Dónde | Descripción |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Entorno de Trigger.dev | Token del bot (@BotFather). |
| `OPENAI_API_KEY` | Entorno de Trigger.dev | API key de OpenAI; la lee `@ai-sdk/openai`. |
| `AI_MODEL` | Entorno de Trigger.dev | Opcional. Por defecto `gpt-5-nano`. |
| `TELEGRAM_OWNER_ID` | Entorno de Trigger.dev | ID numérico positivo `from.id` del único propietario; requiere chat privado del mismo ID. Necesario para gastos y obligatorio para Production privado, incluso con gastos desactivados. |
| `EXPENSES_ENABLED` | Entorno de Trigger.dev | Opcional: omitido conserva DB + propietario; solo `true` exacto permite gastos, cualquier otro valor presente los desactiva. Production bot + Firecrawl: `false`. |
| `DATABASE_URL` | Entorno de Trigger.dev | Conexión Postgres para gastos; necesaria junto al propietario. Conexión perezosa, sin migraciones automáticas. Nunca publicar el valor. |
| `FIRECRAWL_API_KEY` | `.env` local (Development) / variables de Trigger.dev (Production) | Habilita las consultas web; opcional para conversar sin web. No configurar ni sincronizar en Railway. |
| `TELEGRAM_WEBHOOK_SECRET` | Local / tu terminal | Secreto de firma del endpoint `telegram`, también enviado a Telegram como `secret_token`. |

- Las variables del bot tienen que existir en el entorno de Trigger.dev, ya no en Railway. En Development, `trigger dev` lee el `.env` local; en Production, cargalas en las variables de entorno del dashboard de Trigger.dev.
- `TELEGRAM_WEBHOOK_SECRET`: 1–256 caracteres, solo `A-Z a-z 0-9 _ -` (lo exige Telegram).
- Railway ya no necesita `TELEGRAM_*` ni `OPENAI_API_KEY`. Nunca sincronices `TRIGGER_SECRET_KEY` a Railway (ver `AGENTS.md`): la clave del `.env` local es la de Development.
- No subas valores reales al repo.

### Production: bot + Firecrawl, gastos desactivados

Configurar en Trigger.dev Production `TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`, `FIRECRAWL_API_KEY`, un `TELEGRAM_OWNER_ID` válido del usuario (no del bot) y explícitamente **`EXPENSES_ENABLED=false`**; `AI_MODEL` es opcional. El propietario sigue siendo obligatorio para este despliegue privado aunque no haya gastos. `DATABASE_URL` no es necesaria para bot/Firecrawl: si ya existe, conservarla; no borrar tampoco el propietario. Este modo no requiere ni autoriza migraciones, activación financiera o acceso al ledger. Deploy y cambio de webhook son pasos separados, pendientes de readiness y verificación de permisos; esta receta no prueba capacidad Production ni modifica la restricción histórica indicada abajo.

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
