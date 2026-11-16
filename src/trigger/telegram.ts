import { openai } from '@ai-sdk/openai'
import { webhooks } from '@trigger.dev/sdk'
import { chat, defaultStorage } from '@trigger.dev/sdk/ai'
import { stepCountIs, type LanguageModel } from 'ai'
import { INSTRUCTIONS, instructionsForTurn, modelId } from '../ai/assistant.js'
import { createFirecrawlTools, firecrawlRuntime, type FirecrawlRuntime } from '../ai/firecrawl-tools.js'
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
  web: FirecrawlRuntime = firecrawlRuntime,
  now: () => Date = () => new Date(),
) {
  return chat.agent({
    id,
    channels: [telegramChannel],
    // Conversation memory: the documented default platform snapshot per session
    // (snapshots accumulate with no expiry by default). No database.
    storage: defaultStorage,
    system: INSTRUCTIONS,
    // Trigger resolves this once each turn, preserving tool conversion across history
    // while giving parallel executions a fresh, shared turn-local budget.
    tools: () => createFirecrawlTools(web),
    run: async ({ messages, tools, signal, streamText }) => {
      const available = Boolean(web.getKey())
      return streamText({
        model: model(),
        messages,
        instructions: instructionsForTurn(now(), available),
        tools,
        activeTools: available ? undefined : [],
        abortSignal: signal,
        stopWhen: stepCountIs(5),
        // gpt-5-nano is a reasoning model: the lowest effort keeps billed tokens down.
        providerOptions: { openai: { reasoningEffort: 'minimal' } },
      })
    },
  })
}

export const telegramAssistant = createTelegramAssistant('telegram-assistant')
