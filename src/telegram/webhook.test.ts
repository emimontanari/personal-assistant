import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import app from '../app.js'

const TOKEN = '123456:SECRET-TOKEN'
const SECRET = 'hook-secret'
const HEADER = 'X-Telegram-Bot-Api-Secret-Token'

type FetchCall = { url: string; init?: RequestInit }

const realFetch = globalThis.fetch
const realConsoleError = console.error
const savedEnv = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
}

let calls: FetchCall[]
let errorLogs: string[]
let fetchImpl: () => Promise<Response>

function restoreEnv(name: keyof typeof savedEnv) {
  const v = savedEnv[name]
  if (v === undefined) delete process.env[name]
  else process.env[name] = v
}

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = TOKEN
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET
  calls = []
  errorLogs = []
  fetchImpl = async () => new Response('{"ok":true}', { status: 200 })
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return fetchImpl()
  }) as typeof fetch
  console.error = (...args: unknown[]) => {
    errorLogs.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(' '))
  }
})

afterEach(() => {
  globalThis.fetch = realFetch
  console.error = realConsoleError
  restoreEnv('TELEGRAM_BOT_TOKEN')
  restoreEnv('TELEGRAM_WEBHOOK_SECRET')
})

const textUpdate = {
  update_id: 1,
  message: { message_id: 42, chat: { id: 777 }, text: 'hola' },
}

function post(body: unknown, headers: Record<string, string> = { [HEADER]: SECRET }) {
  return app.request('/telegram/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /telegram/webhook', () => {
  it('echoes a text message with copyMessage', async () => {
    const res = await post(textUpdate)
    assert.equal(res.status, 200)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, `https://api.telegram.org/bot${TOKEN}/copyMessage`)
    assert.equal(calls[0].init?.method, 'POST')
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      chat_id: 777,
      from_chat_id: 777,
      message_id: 42,
    })
  })

  it('echoes a non-text message (photo) with the same body', async () => {
    const res = await post({
      update_id: 2,
      message: { message_id: 43, chat: { id: 888 }, photo: [{ file_id: 'x' }] },
    })
    assert.equal(res.status, 200)
    assert.equal(calls.length, 1)
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      chat_id: 888,
      from_chat_id: 888,
      message_id: 43,
    })
  })

  it('returns 401 without the secret header and does not call the Bot API', async () => {
    const res = await post(textUpdate, {})
    assert.equal(res.status, 401)
    assert.equal(calls.length, 0)
  })

  it('returns 401 with a wrong secret header and does not call the Bot API', async () => {
    const res = await post(textUpdate, { [HEADER]: 'wrong' })
    assert.equal(res.status, 401)
    assert.equal(calls.length, 0)
  })

  it('returns 500 when TELEGRAM_WEBHOOK_SECRET is missing', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET
    const res = await post(textUpdate)
    assert.equal(res.status, 500)
    assert.equal(calls.length, 0)
  })

  it('returns 500 when TELEGRAM_BOT_TOKEN is missing', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN
    const res = await post(textUpdate)
    assert.equal(res.status, 500)
    assert.equal(calls.length, 0)
  })

  it('returns 200 without calling the Bot API when the update has no message', async () => {
    const res = await post({ update_id: 3, edited_message: { message_id: 1, chat: { id: 1 } } })
    assert.equal(res.status, 200)
    assert.equal(calls.length, 0)
  })

  it('returns 200 when copyMessage responds non-OK and logs without the token', async () => {
    fetchImpl = async () => new Response('{"ok":false}', { status: 400 })
    const res = await post(textUpdate)
    assert.equal(res.status, 200)
    assert.equal(calls.length, 1)
    assert.ok(errorLogs.length > 0)
    for (const l of errorLogs) assert.ok(!l.includes(TOKEN))
  })

  it('returns 200 when fetch throws and logs without the token', async () => {
    fetchImpl = async () => {
      throw new Error(`network down for https://api.telegram.org/bot${TOKEN}/copyMessage`)
    }
    const res = await post(textUpdate)
    assert.equal(res.status, 200)
    assert.ok(errorLogs.length > 0)
    for (const l of errorLogs) assert.ok(!l.includes(TOKEN))
  })

  it('returns 400 for invalid JSON with a valid secret and does not call the Bot API', async () => {
    const res = await post('{not json')
    assert.equal(res.status, 400)
    assert.equal(calls.length, 0)
  })

  it('S2: returns 401 for a same-length wrong secret, no Bot API call', async () => {
    const wrong = SECRET.slice(0, -1) + (SECRET.endsWith('x') ? 'y' : 'x')
    assert.equal(wrong.length, SECRET.length)
    assert.notEqual(wrong, SECRET)
    const res = await post(textUpdate, { [HEADER]: wrong })
    assert.equal(res.status, 401)
    assert.equal(calls.length, 0)
  })

  it('S2: 500 response and logs never contain the token', async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET
    const res = await post(textUpdate)
    assert.equal(res.status, 500)
    assert.ok(!(await res.text()).includes(TOKEN))
    for (const l of errorLogs) assert.ok(!l.includes(TOKEN))
  })

  it('S1: message without chat returns 200, no Bot API call and no error log', async () => {
    const res = await post({ update_id: 5, message: { message_id: 1 } })
    assert.equal(res.status, 200)
    assert.equal(calls.length, 0)
    assert.equal(errorLogs.length, 0)
  })

  it('S1: message with chat but non-numeric message_id returns 200, no Bot API call', async () => {
    for (const message of [{ chat: { id: 1 } }, { message_id: 'abc', chat: { id: 1 } }]) {
      const res = await post({ update_id: 6, message })
      assert.equal(res.status, 200)
    }
    assert.equal(calls.length, 0)
    assert.equal(errorLogs.length, 0)
  })

  it('S1: copyMessage is called with an AbortSignal and a timeout is logged without the token', async () => {
    fetchImpl = async () => {
      throw new DOMException(`timed out calling https://api.telegram.org/bot${TOKEN}/copyMessage`, 'TimeoutError')
    }
    const res = await post(textUpdate)
    assert.equal(res.status, 200)
    assert.equal(calls.length, 1)
    assert.ok(calls[0].init?.signal instanceof AbortSignal)
    assert.ok(errorLogs.some((l) => l.includes('TimeoutError')))
    for (const l of errorLogs) assert.ok(!l.includes(TOKEN))
  })

  it('S1: JSON null body returns 200 without calling the Bot API', async () => {
    const res = await post('null')
    assert.equal(res.status, 200)
    assert.equal(calls.length, 0)
  })
})

describe('GET /', () => {
  it('still returns Hello Hono!', async () => {
    const res = await app.request('/')
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'Hello Hono!')
  })
})
