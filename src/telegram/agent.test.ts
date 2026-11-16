// Import order matters: the test harness installs the resource catalog before agents register.
import { mockChatAgent } from '@trigger.dev/sdk/ai/test'
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import { simulateReadableStream } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { createTelegramAssistant, telegramChannel } from '../trigger/telegram.js'
import type { FirecrawlRuntime } from '../ai/firecrawl-tools.js'

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

  it('does not offer web tools without a key and explicitly explains unavailable browsing', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'TOKEN123'
    globalThis.fetch = (async () => new Response('{}')) as typeof fetch
    const model = modelWithText('No puedo verificar precios en vivo.')
    const agent = createTelegramAssistant(`telegram-assistant-test-${++n}`, () => model, {
      getKey: () => undefined,
      createClient: async () => { throw Error('must not create client') },
    })
    const harness = mockChatAgent(agent, { chatId: 'no-key' })
    try { await harness.sendChannelEvent({ event: update(20, 560, 'precio actual de entradas'), connectorId: 'telegram' }) }
    finally { await harness.close() }
    assert.equal(model.doStreamCalls[0].tools?.length ?? 0, 0)
    assert.ok(JSON.stringify(model.doStreamCalls[0].prompt).includes('no está disponible en este turno'))
  })

  for (const available of [true, false]) {
    it(`refreshes UTC date each turn in the same session (browsing ${available ? 'available' : 'unavailable'})`, async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'TOKEN123'
      globalThis.fetch = (async () => new Response('{}')) as typeof fetch
      let now = new Date('2042-01-01T00:30:00+02:00')
      let clockCalls = 0
      const model = modelWithText('ok')
      const agent = createTelegramAssistant(`telegram-assistant-test-${++n}`, () => model, {
        getKey: () => available ? 'fake-key' : undefined,
        createClient: async () => { throw Error('no tool execution expected') },
      }, () => { clockCalls++; return now })
      assert.equal(clockCalls, 0)
      const harness = mockChatAgent(agent, { chatId: `clock-${n}` })
      try {
        await harness.sendChannelEvent({ event: update(40, 562, 'últimas noticias de OpenAI'), connectorId: 'telegram' })
        now = new Date('2042-01-01T00:30:00Z')
        await harness.sendChannelEvent({ event: update(41, 562, '¿Y ahora?'), connectorId: 'telegram' })
      } finally { await harness.close() }
      assert.equal(clockCalls, 2)
      assert.equal(model.doStreamCalls.length, 2)
      const first = JSON.stringify(model.doStreamCalls[0].prompt.filter(m => m.role === 'system'))
      const second = JSON.stringify(model.doStreamCalls[1].prompt.filter(m => m.role === 'system'))
      assert.ok(first.includes('2041-12-31 UTC'))
      assert.ok(second.includes('2042-01-01 UTC') && !second.includes('2041-12-31 UTC'))
      assert.ok(JSON.stringify(model.doStreamCalls[1].prompt).includes('últimas noticias de OpenAI'))
      for (const call of model.doStreamCalls) {
        assert.deepEqual(call.providerOptions?.openai, { reasoningEffort: 'minimal' })
        if (available) {
          const search = call.tools?.find(t => t.type === 'function' && t.name === 'webSearch')
          assert.ok(search?.type === 'function')
          assert.ok(search.description?.includes('información factual externa'))
          const query = search.inputSchema.properties?.query as { description?: string }
          assert.ok(query.description?.includes('fecha UTC del turno'))
        } else {
          assert.equal(call.tools?.length ?? 0, 0)
          assert.ok(JSON.stringify(call.prompt).includes('no está disponible en este turno'))
        }
      }
    })
  }

  // Deterministic fixtures prove execution/plumbing, not a live model's semantic selection.
  for (const scenario of [
    { name: 'webSearch', input: { query: 'precio zapatillas hoy' }, user: 'Compará el precio de zapatillas hoy', response: { web: [{ url: 'https://example.com/precio', title: 'Precio verificado' }] } },
    { name: 'predictionMarketLookup', input: { operation: 'query', q: 'bitcoin' }, user: 'Qué probabilidades tiene bitcoin de subir este mes', response: { requestId: 'request-1', scrapeId: 'scrape-1', alexandria: [{ provider: 'polymarket', capability: 'search/query', data: { events: [{ title: 'Bitcoin', url: 'https://example.com/precio' }] } }] } },
  ]) {
    it(`forwards ${scenario.name} execution and result through Telegram, retaining tools and history next turn`, async () => {
      process.env.TELEGRAM_BOT_TOKEN = 'TOKEN123'
      const sent: string[] = []
      globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
        sent.push(JSON.parse(String(init?.body)).text)
        return new Response('{}')
      }) as typeof fetch
      const requests: unknown[] = []
      const web = {
        getKey: () => 'fake-key',
        createClient: async () => ({
          search: async (...args: unknown[]) => {
            requests.push(args)
            return scenario.name === 'predictionMarketLookup'
              ? { tools: [{ provider: 'polymarket', capability: 'search/query', description: 'Search public prediction events' }] }
              : scenario.response
          },
          scrape: async (...args: unknown[]) => { requests.push(args); return scenario.response },
        }),
      } as unknown as FirecrawlRuntime
      let step = 0
      const textModel = modelWithText('Verificado: https://example.com/precio')
      const model = new MockLanguageModelV4({ doStream: async (options) => {
        const current = step++
        const discover = scenario.name === 'predictionMarketLookup' && current === 0
        if (current >= (scenario.name === 'predictionMarketLookup' ? 2 : 1)) return textModel.doStream(options)
        return { stream: simulateReadableStream({ chunks: [
          { type: 'tool-call', toolCallId: discover ? 'discover-1' : 'lookup-1', toolName: discover ? 'discoverDataSources' : scenario.name, input: JSON.stringify(discover ? { query: 'prediction market bitcoin' } : scenario.input) },
          { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool-calls' }, usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 1, text: 0, reasoning: undefined },
          } },
        ] }) }
      } })
      const agent = createTelegramAssistant(`telegram-assistant-test-${++n}`, () => model, web)
      const chatId = `tools-${n}`
      const harness = mockChatAgent(agent, { chatId })
      try {
        await harness.sendChannelEvent({ event: update(30, 561, scenario.user), connectorId: 'telegram' })
        const { __waitForChannelEgressForTests } = await import('@trigger.dev/sdk/ai')
        await __waitForChannelEgressForTests(chatId)
        await harness.sendChannelEvent({ event: update(31, 561, 'Recordame la fuente'), connectorId: 'telegram' })
        await __waitForChannelEgressForTests(chatId)
      } finally { await harness.close() }
      const expectedRequests = scenario.name === 'predictionMarketLookup' ? 2 : 1
      assert.equal(requests.length, expectedRequests)
      assert.equal(model.doStreamCalls.length, expectedRequests + 2)
      assert.ok(model.doStreamCalls.every(call => call.tools?.some(t => t.type === 'function' && t.name === scenario.name)))
      const resultPrompt = JSON.stringify(model.doStreamCalls[expectedRequests].prompt)
      assert.ok(resultPrompt.includes('tool-result') && resultPrompt.includes('https://example.com/precio'))
      const nextPrompt = JSON.stringify(model.doStreamCalls[expectedRequests + 1].prompt)
      assert.ok(nextPrompt.includes(scenario.user) && nextPrompt.includes('lookup-1') && nextPrompt.includes('https://example.com/precio'))
      assert.ok(sent[0].includes('https://example.com/precio'))
    })
  }

  it('exposes the channel under the id the endpoint routes to', () => {
    assert.equal(telegramChannel.id, 'telegram')
  })
})
