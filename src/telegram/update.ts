export type TelegramUpdate = {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number }
    text?: string
  }
  edited_message?: unknown
}

/** The user's text of a Telegram update; empty (no turn) for anything without message text. */
export function inboundText(update: TelegramUpdate): string {
  const text = update?.message?.text
  return typeof text === 'string' ? text : ''
}
