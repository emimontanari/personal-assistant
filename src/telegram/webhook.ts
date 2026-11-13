import { timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'

const SECRET_HEADER = 'X-Telegram-Bot-Api-Secret-Token'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

type TelegramUpdate = {
  message?: { message_id: number; chat: { id: number } }
}

const telegram = new Hono()

telegram.post('/', async (c) => {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!token || !secret) {
    console.error('Telegram webhook is not configured')
    return c.text('Server misconfigured', 500)
  }

  const provided = c.req.header(SECRET_HEADER)
  if (!provided || !safeEqual(provided, secret)) {
    return c.text('Unauthorized', 401)
  }

  let update: TelegramUpdate
  try {
    update = (await c.req.json()) as TelegramUpdate
  } catch {
    return c.text('Invalid JSON', 400)
  }

  const message = update?.message
  if (!message) return c.text('OK', 200)

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/copyMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: message.chat.id,
        from_chat_id: message.chat.id,
        message_id: message.message_id,
      }),
    })
    if (!res.ok) {
      console.error(`copyMessage failed with status ${res.status}`)
    }
  } catch (err) {
    // Do not log the error object: its message may embed the URL with the token.
    console.error(`copyMessage request failed (${err instanceof Error ? err.name : 'unknown error'})`)
  }

  return c.text('OK', 200)
})

export default telegram
