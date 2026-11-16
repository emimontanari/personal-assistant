export const TELEGRAM_MESSAGE_LIMIT = 4096
export const SEND_MESSAGE_TIMEOUT_MS = 10_000

/**
 * Error from the Telegram Bot API. The message never contains the bot token,
 * the request URL or the message text: `fetch` errors can embed the URL.
 */
export class TelegramApiError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'TelegramApiError'
    this.status = status
  }
}

/** Split text into chunks of at most 4096 UTF-16 units without breaking a surrogate pair. */
export function splitMessage(text: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] {
  if (text.trim() === '') return []
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + limit, text.length)
    if (end < text.length) {
      const last = text.charCodeAt(end - 1)
      // Do not cut between a high and a low surrogate.
      if (last >= 0xd800 && last <= 0xdbff) end -= 1
    }
    chunks.push(text.slice(start, end))
    start = end
  }
  return chunks
}

export type SendMessageOptions = {
  token: string
  chatId: number | string
  text: string
  fetchImpl?: typeof fetch
}

export async function sendTelegramMessage({
  token,
  chatId,
  text,
  fetchImpl = fetch,
}: SendMessageOptions): Promise<void> {
  let res: Response
  try {
    res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(SEND_MESSAGE_TIMEOUT_MS),
    })
  } catch (err) {
    // Only the error name: the original message may embed the URL with the token.
    const name = err instanceof Error ? err.name : 'unknown error'
    throw new TelegramApiError(`sendMessage request failed (${name})`)
  }
  if (!res.ok) {
    throw new TelegramApiError(`sendMessage failed with status ${res.status}`, res.status)
  }
}

/** Send a reply as consecutive messages (one per ≤4096-char chunk), strictly in order. */
export async function sendTelegramReply(options: SendMessageOptions): Promise<void> {
  for (const chunk of splitMessage(options.text)) {
    await sendTelegramMessage({ ...options, text: chunk })
  }
}
