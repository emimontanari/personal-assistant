import { timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { generateReply as defaultGenerateReply, type GenerateReply } from '../ai/reply.js'

const SECRET_HEADER = 'X-Telegram-Bot-Api-Secret-Token'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

const GENERATE_TIMEOUT_MS = 25_000
const SEND_MESSAGE_TIMEOUT_MS = 10_000

const NON_TEXT_REPLY = 'Por ahora solo puedo responder mensajes de texto.'
const FAILURE_REPLY = 'No pude generar una respuesta en este momento. Probá de nuevo en un rato.'

type TelegramUpdate = {
  message?: { message_id?: unknown; chat?: { id?: unknown }; text?: unknown }
}

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : 'unknown error'
}

export function createTelegramWebhook({
  generateReply = defaultGenerateReply,
}: { generateReply?: GenerateReply } = {}) {
  const telegram = new Hono()

  telegram.post('/', async (c) => {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!token || !secret || !process.env.OPENAI_API_KEY) {
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

    const messageId = message.message_id
    const chatId = message.chat?.id
    if (
      typeof messageId !== 'number' ||
      (typeof chatId !== 'number' && typeof chatId !== 'string')
    ) {
      return c.text('OK', 200)
    }

    let reply = NON_TEXT_REPLY
    if (typeof message.text === 'string' && message.text !== '') {
      try {
        const generated = await generateReply(message.text, AbortSignal.timeout(GENERATE_TIMEOUT_MS))
        if (generated.trim() === '') throw new Error('empty generation')
        reply = generated
      } catch (err) {
        // Log only the error name: messages may embed tokens or user text.
        console.error(`reply generation failed (${errorName(err)})`)
        reply = FAILURE_REPLY
      }
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: reply }),
        signal: AbortSignal.timeout(SEND_MESSAGE_TIMEOUT_MS),
      })
      if (!res.ok) {
        console.error(`sendMessage failed with status ${res.status}`)
      }
    } catch (err) {
      // Do not log the error object: its message may embed the URL with the token.
      console.error(`sendMessage request failed (${errorName(err)})`)
    }

    return c.text('OK', 200)
  })

  return telegram
}

export default createTelegramWebhook()
