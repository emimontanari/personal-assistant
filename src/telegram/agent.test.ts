// Import order matters: the test harness installs the resource catalog before agents register.
import { mockChatAgent } from '@trigger.dev/sdk/ai/test'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import { simulateReadableStream } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { createTelegramAssistant, telegramChannel } from '../trigger/telegram.js'

function modelWithText(text: string) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start', id: 't1' },
          { type: 'text-delta', id: 't1', delta: text },
          { type: 'text-end', id: 't1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: 1, text: 1, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  })
}

const update = (id: number, chatId: number, text?: string) => ({
  update_id: id,
  message: { message_id: id, chat: { id: chatId }, ...(text === undefined ? {} : { text }) },
})

let n = 0
const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  delete process.env.TELEGRAM_BOT_TOKEN
})

describe('telegram assistant agent', () => {
  it('answers a Telegram text update and posts the reply with sendMessage', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TOKEN123'
    const sent: { url: string; body: { chat_id: number; text: string } }[] = []
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response('{}')
    }) as typeof fetch

    const model = modelWithText('hola!')
    const agent = createTelegramAssistant(`telegram-assistant-test-${++n}`, () => model)
    const harness = mockChatAgent(agent, { chatId: '555' })
    try {
      await harness.sendChannelEvent({ event: update(1, 555, 'hola'), connectorId: 'telegram' })
      const { __waitForChannelEgressForTests } = await import('@trigger.dev/sdk/ai')
      await __waitForChannelEgressForTests('555')
    } finally {
      await harness.close()
    }

    assert.equal(model.doStreamCalls.length, 1)
    const prompt = model.doStreamCalls[0].prompt
    assert.equal(prompt[0].role, 'system')
    assert.ok(JSON.stringify(prompt[0]).includes('asistente personal'))
    assert.ok(prompt.some((m) => m.role === 'user' && JSON.stringify(m.content).includes('hola')))
    assert.deepEqual(model.doStreamCalls[0].providerOptions?.openai, { reasoningEffort: 'minimal' })

    assert.equal(sent.length, 1)
    assert.equal(sent[0].url, 'https://api.telegram.org/botTOKEN123/sendMessage')
    assert.deepEqual(sent[0].body, { chat_id: 555, text: 'hola!' })
  })

  it('runs no turn and sends nothing for an update without text', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TOKEN123'
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response('{}')
    }) as typeof fetch
    const model = modelWithText('nope')
    const agent = createTelegramAssistant(`telegram-assistant-test-${++n}`, () => model)
    const harness = mockChatAgent(agent, { chatId: '556' })
    try {
      await harness.deliverChannelEvent({ event: update(2, 556), connectorId: 'telegram' })
    } finally {
      await harness.close()
    }
    assert.equal(model.doStreamCalls.length, 0)
    assert.equal(calls, 0)
  })

  it('keeps the conversation across turns (second turn sees the first)', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TOKEN123'
    globalThis.fetch = (async () => new Response('{}')) as typeof fetch
    const model = modelWithText('ok')
    const agent = createTelegramAssistant(`telegram-assistant-test-${++n}`, () => model)
    const harness = mockChatAgent(agent, { chatId: '557' })
    try {
      await harness.sendChannelEvent({ event: update(3, 557, 'primero'), connectorId: 'telegram' })
      await harness.sendChannelEvent({ event: update(4, 557, 'segundo'), connectorId: 'telegram' })
    } finally {
      await harness.close()
    }
    assert.equal(model.doStreamCalls.length, 2)
    const second = JSON.stringify(model.doStreamCalls[1].prompt)
    assert.ok(second.includes('primero') && second.includes('segundo'))
  })

  it('exposes the channel under the id the endpoint routes to', () => {
    assert.equal(telegramChannel.id, 'telegram')
  })
})
