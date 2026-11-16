import { openai } from '@ai-sdk/openai'
import { webhooks } from '@trigger.dev/sdk'
import { chat, defaultStorage } from '@trigger.dev/sdk/ai'
import type { LanguageModel } from 'ai'
import { INSTRUCTIONS, modelId } from '../ai/assistant.js'
import { sendTelegramReply } from '../telegram/api.js'
import { inboundText, type TelegramUpdate } from '../telegram/update.js'

// Hosted endpoint: Telegram posts here with `secret_token` echoed in the
// X-Telegram-Bot-Api-Secret-Token header (compared against the endpoint's signing secret).
export const telegramEndpoint = webhooks.endpoint.define({
  id: 'telegram',
  source: webhooks.custom<TelegramUpdate>(
    {
      scheme: 'shared-secret',
      placement: 'header',
      fieldName: 'x-telegram-bot-api-secret-token',
      idempotencyField: { from: 'body', name: 'update_id' },
    },
    {
      setupPrompt:
        'Call Telegram setWebhook with this URL and the endpoint signing secret as secret_token.',
    },
  ),
})

// One session (conversation) per Telegram chat.
export const telegramChannel = chat.channels.custom({
  id: 'telegram',
  endpoint: telegramEndpoint,
  key: '{event.message.chat.id}',
  inbound: (event) => inboundText(event),
  send: async (message, ctx) => {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set')
    const chatId = ctx.event?.message?.chat.id
    if (chatId === undefined) throw new Error('Telegram chat id is missing from the event')
    await sendTelegramReply({ token, chatId, text: message.text })
    return {}
  },
})

export function createTelegramAssistant<TId extends string>(
  id: TId,
  model: () => LanguageModel = () => openai(modelId()),
) {
  return chat.agent({
    id,
    channels: [telegramChannel],
    // Conversation memory: the documented default platform snapshot per session
    // (about the last 100 messages once compacted, no expiry). No database.
    storage: defaultStorage,
    system: INSTRUCTIONS,
    run: async ({ messages, signal, streamText }) =>
      streamText({
        model: model(),
        messages,
        abortSignal: signal,
        // gpt-5-nano is a reasoning model: the lowest effort keeps billed tokens down.
        providerOptions: { openai: { reasoningEffort: 'minimal' } },
      }),
  })
}

export const telegramAssistant = createTelegramAssistant('telegram-assistant')
