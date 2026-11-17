import { configuredOwner } from '../ai/expense-tools.js'

export type TelegramUpdate = {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number; type?: string }
    from?: { id: number }
    text?: string
  }
  edited_message?: unknown
}

/** The user's text of a Telegram update; empty (no turn) for anything without message text. */
export function inboundText(update: TelegramUpdate, ownerSetting?: string): string {
  if (ownerSetting !== undefined && ownerSetting !== '') {
    const owner = configuredOwner(ownerSetting)
    const message = update?.message
    if (!owner || !message || message.chat?.type !== 'private'
      || String(message.from?.id) !== owner || String(message.chat.id) !== owner) return ''
  }
  const text = update?.message?.text
  return typeof text === 'string' ? text : ''
}
