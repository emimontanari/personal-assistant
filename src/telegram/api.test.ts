import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import {
  TELEGRAM_MESSAGE_LIMIT,
  TelegramApiError,
  sendTelegramMessage,
  sendTelegramReply,
  splitMessage,
} from './api.js'

const TOKEN = '123456:SECRET-TOKEN'

type Call = { url: string; init: RequestInit }

function fakeFetch(respond: (call: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} }
    calls.push(call)
    return respond(call, calls.length)
  }) as typeof fetch
  return { fn, calls }
}

describe('splitMessage', () => {
  it('keeps text of exactly 4096 characters in one chunk', () => {
    const text = 'a'.repeat(4096)
    assert.deepEqual(splitMessage(text), [text])
  })

  it('splits 4097 characters into two chunks, in order', () => {
    const text = 'a'.repeat(4096) + 'b'
    assert.deepEqual(splitMessage(text), ['a'.repeat(4096), 'b'])
  })

  it('returns no chunks for empty or whitespace-only text', () => {
    assert.deepEqual(splitMessage(''), [])
    assert.deepEqual(splitMessage('  \n '), [])
  })

  it('never exceeds the limit and preserves content', () => {
    const text = 'xyz'.repeat(5000)
    const chunks = splitMessage(text)
    assert.equal(chunks.length, 4)
    assert.ok(chunks.every((c) => c.length <= TELEGRAM_MESSAGE_LIMIT))
    assert.equal(chunks.join(''), text)
  })

  it('does not split a surrogate pair across chunks', () => {
    const text = 'a'.repeat(4095) + '😀' + 'b'
    const chunks = splitMessage(text)
    assert.ok(chunks.every((c) => c.length <= TELEGRAM_MESSAGE_LIMIT))
    assert.equal(chunks.join(''), text)
    assert.equal(chunks[0], 'a'.repeat(4095))
  })
})

describe('sendTelegramMessage', () => {
  it('POSTs chat_id and text as JSON to the bot URL with a 10s abort signal', async () => {
    const { fn, calls } = fakeFetch(() => new Response('{}', { status: 200 }))
    await sendTelegramMessage({ token: TOKEN, chatId: 42, text: 'hola', fetchImpl: fn })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, `https://api.telegram.org/bot${TOKEN}/sendMessage`)
    assert.equal(calls[0].init.method, 'POST')
    assert.deepEqual(calls[0].init.headers, { 'Content-Type': 'application/json' })
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), { chat_id: 42, text: 'hola' })
    assert.ok(calls[0].init.signal instanceof AbortSignal)
  })

  it('uses a timeout signal of 10 seconds', async () => {
    const spy = mock.method(AbortSignal, 'timeout')
    try {
      const { fn } = fakeFetch(() => new Response('{}'))
      await sendTelegramMessage({ token: TOKEN, chatId: 1, text: 'x', fetchImpl: fn })
      assert.deepEqual(spy.mock.calls[0].arguments, [10_000])
    } finally {
      spy.mock.restore()
    }
  })

  it('throws a TelegramApiError with the status on non-OK, without the token', async () => {
    const { fn } = fakeFetch(() => new Response('{"description":"nope"}', { status: 400 }))
    const logged: unknown[] = []
    const err = mock.method(console, 'error', (...a: unknown[]) => logged.push(a))
    const log = mock.method(console, 'log', (...a: unknown[]) => logged.push(a))
    try {
      await assert.rejects(
        sendTelegramMessage({ token: TOKEN, chatId: 1, text: 'secret user text', fetchImpl: fn }),
        (e: unknown) => {
          assert.ok(e instanceof TelegramApiError)
          assert.equal(e.status, 400)
          assert.ok(!e.message.includes(TOKEN))
          assert.ok(!e.message.includes('secret user text'))
          return true
        },
      )
    } finally {
      err.mock.restore()
      log.mock.restore()
    }
    assert.ok(!JSON.stringify(logged).includes(TOKEN))
  })

  it('wraps a fetch failure without leaking the URL (token) from its message', async () => {
    const { fn } = fakeFetch(() => {
      throw new TypeError(`fetch failed: https://api.telegram.org/bot${TOKEN}/sendMessage`)
    })
    await assert.rejects(
      sendTelegramMessage({ token: TOKEN, chatId: 1, text: 'x', fetchImpl: fn }),
      (e: unknown) => {
        assert.ok(e instanceof TelegramApiError)
        assert.equal(e.status, undefined)
        assert.ok(!e.message.includes(TOKEN))
        assert.ok(e.message.includes('TypeError'))
        assert.equal((e as Error).cause, undefined)
        return true
      },
    )
  })
})

describe('sendTelegramReply', () => {
  it('sends one message for a short reply', async () => {
    const { fn, calls } = fakeFetch(() => new Response('{}'))
    await sendTelegramReply({ token: TOKEN, chatId: 7, text: 'hi', fetchImpl: fn })
    assert.equal(calls.length, 1)
  })

  it('sends 4097 characters as two sequential messages in order', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const { fn, calls } = fakeFetch(async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return new Response('{}')
    })
    await sendTelegramReply({
      token: TOKEN,
      chatId: 7,
      text: 'a'.repeat(4096) + 'b',
      fetchImpl: fn,
    })
    assert.equal(maxInFlight, 1)
    const texts = calls.map((c) => JSON.parse(String(c.init.body)).text)
    assert.deepEqual(texts, ['a'.repeat(4096), 'b'])
  })

  it('stops at the first failing chunk and sends nothing for empty text', async () => {
    const { fn, calls } = fakeFetch((_c, n) => new Response('{}', { status: n === 1 ? 500 : 200 }))
    await assert.rejects(
      sendTelegramReply({ token: TOKEN, chatId: 7, text: 'a'.repeat(5000), fetchImpl: fn }),
      TelegramApiError,
    )
    assert.equal(calls.length, 1)

    const none = fakeFetch(() => new Response('{}'))
    await sendTelegramReply({ token: TOKEN, chatId: 7, text: '  ', fetchImpl: none.fn })
    assert.equal(none.calls.length, 0)
  })
})
