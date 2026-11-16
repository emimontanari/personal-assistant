import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { asSchema } from 'ai'
import { createFirecrawlTools, type FirecrawlRuntime } from './firecrawl-tools.js'

function fixture(overrides: Partial<FirecrawlRuntime> = {}) {
  const calls: unknown[][] = []
  const client = {
    search: async (...args: unknown[]) => { calls.push(['search', ...args]); return { web: [{ url: 'https://example.com', title: 'Source' }], tools: [] } },
    scrape: async (...args: unknown[]) => { calls.push(['scrape', ...args]); return { markdown: 'page', metadata: { sourceURL: 'https://example.com' } } },
    map: async (...args: unknown[]) => { calls.push(['map', ...args]); return { links: [{ url: 'https://example.com/page' }] } },
  }
  const runtime = { getKey: () => 'fake-key', createClient: async () => client, ...overrides } as FirecrawlRuntime
  const tools = createFirecrawlTools(runtime)
  const run = (name: keyof typeof tools, input: unknown, signal = new AbortController().signal) =>
    (tools[name].execute as Function)(input, { toolCallId: 'test', messages: [], abortSignal: signal })
  return { tools, run, calls, runtime }
}

describe('read-only web tools', () => {
  it('generates a closed root-object JSON schema for every OpenAI function tool', async () => {
    const { tools } = fixture()
    for (const [name, tool] of Object.entries(tools)) {
      const schema = await asSchema(tool.inputSchema).jsonSchema
      assert.equal(schema.type, 'object', `${name}: OpenAI requires an object root`)
      assert.equal(schema.additionalProperties, false, name)
      assert.ok(schema.properties && Object.keys(schema.properties).length > 0, name)
      for (const unsupported of ['anyOf', 'oneOf', 'allOf', '$ref', 'if', 'then', 'else']) {
        assert.equal(schema[unsupported as keyof typeof schema], undefined, `${name}: root ${unsupported}`)
      }
      // These tools need only this small supported subset, not arbitrary JSON Schema.
      const checkNode = (node: unknown) => {
        assert.ok(node && typeof node === 'object' && !Array.isArray(node), name)
        const value = node as Record<string, unknown>
        const supported = new Set(['$schema', 'type', 'properties', 'required', 'additionalProperties', 'description', 'enum', 'items', 'minLength', 'maxLength', 'minItems', 'maxItems'])
        for (const key of Object.keys(value)) assert.ok(supported.has(key), `${name}: unexpected schema keyword ${key}`)
        assert.ok(['object', 'string', 'boolean', 'array'].includes(String(value.type)), `${name}: invalid type`)
        if (value.properties) Object.values(value.properties as object).forEach(checkNode)
        if (value.items) checkNode(value.items)
      }
      checkNode(schema)
      assert.ok(!JSON.stringify(schema).includes('fake-key'))
    }
    const lookup = await asSchema(tools.predictionMarketLookup.inputSchema).jsonSchema
    assert.deepEqual(lookup.required, ['operation'])
    assert.deepEqual((lookup.properties?.operation as { enum: string[] }).enum, ['query', 'markets'])
  })

  it('maps search, read, map and discovery to installed SDK shapes', async () => {
    const f = fixture()
    await f.run('webSearch', { query: 'prices' })
    await f.run('readWebPage', { url: 'https://example.com' })
    await f.run('mapWebsite', { url: 'https://example.com', search: 'pricing' })
    const discovery = await f.run('discoverDataSources', { query: 'odds' })
    assert.deepEqual(f.calls, [
      ['search', 'prices', { sources: ['web', 'alexandria'], limit: 5, toolDetail: 'full', timeout: 15000 }],
      ['scrape', 'https://example.com', { formats: ['markdown'], onlyMainContent: true, timeout: 15000, autoResume: false, parsers: [] }],
      ['map', 'https://example.com', { search: 'pricing', limit: 5, timeout: 15000 }],
      ['search', 'odds', { sources: ['alexandria'], limit: 5, toolDetail: 'full', timeout: 15000 }],
    ])
    assert.equal(discovery.kind, 'contracts-not-records')
  })

  it('preserves source URL query references and fragments through search, read and map', async () => {
    const source = 'https://example.com/prices?currency=ARS&date=2026-05-30#fees'
    const f = fixture({ createClient: async () => ({
      search: async () => ({ web: [{ url: source }] }),
      scrape: async () => ({ markdown: 'Price with fees', metadata: { sourceURL: source } }),
      map: async () => ({ links: [{ url: source }] }),
    }) as never })
    for (const [name, input] of [
      ['webSearch', { query: 'prices' }],
      ['readWebPage', { url: source }],
      ['mapWebsite', { url: 'https://example.com', search: 'prices' }],
    ] as const) {
      const result = await f.run(name, input)
      assert.equal(result.status, 'ok')
      assert.deepEqual(result.sources, [source])
    }
  })

  it('validates query bounds without consuming budget on rejection', async () => {
    const f = fixture()
    assert.equal((await f.run('webSearch', { query: 'a'.repeat(501) })).status, 'invalid_input')
    for (let i = 0; i < 5; i++) assert.equal((await f.run('webSearch', { query: 'a'.repeat(500) })).status, 'ok')
    assert.equal(f.calls.length, 5)
  })

  it('rejects unsafe URL boundaries without any request', async () => {
    const f = fixture()
    for (const url of ['file:///etc/passwd', 'ftp://example.com', 'http://user:pass@example.com', 'http://localhost', 'http://localhost.', 'http://local', 'http://127.1', 'http://2130706433', 'http://10.0.0.1', 'http://172.16.0.1', 'http://192.168.1.1', 'http://169.254.169.254', 'http://0.0.0.0', 'http://[::1]', 'http://[::]', 'http://[fc00::1]', 'http://[fe80::1]', 'http://[::ffff:127.0.0.1]', 'http://[::ffff:7f00:1]', 'http://example.com/' + 'a'.repeat(2048)]) {
      assert.equal((await f.run('readWebPage', { url })).status, 'invalid_input', url)
      assert.equal((await f.run('mapWebsite', { url })).status, 'invalid_input', url)
    }
    assert.equal(f.calls.length, 0)
    assert.equal((await f.run('readWebPage', { url: 'https://example.com/path' })).status, 'ok')
    assert.equal((await f.run('readWebPage', { url: 'https://[2606:4700:4700::1111]/' })).status, 'ok')
  })

  it('has no keyless requests and sanitizes failures and cancellation', async () => {
    let creations = 0
    const absent = fixture({ getKey: () => undefined, createClient: async () => { creations++; throw Error('secret') } })
    assert.equal((await absent.run('webSearch', { query: 'hi' })).status, 'unavailable')
    assert.equal(creations, 0)
    const aborted = new AbortController(); aborted.abort()
    assert.equal((await absent.run('webSearch', { query: 'hi' }, aborted.signal)).status, 'cancelled')
    const failed = fixture({ createClient: async () => { throw Error('fake-key raw headers') } })
    assert.equal(JSON.stringify(await failed.run('webSearch', { query: 'hi' })).includes('fake-key'), false)
    const timeout = fixture({ createClient: async () => { throw Object.assign(Error('raw'), { code: 'ETIMEDOUT' }) } })
    assert.equal((await timeout.run('webSearch', { query: 'hi' })).status, 'timeout')
    const inflight = new AbortController()
    const delayed = fixture({ createClient: async () => { inflight.abort(); return { search: async () => ({ web: [] }) } as never } })
    assert.equal((await delayed.run('webSearch', { query: 'hi' }, inflight.signal)).status, 'cancelled')
  })

  it('enforces five executions atomically across parallel calls and resets per factory', async () => {
    const f = fixture()
    const results = await Promise.all(Array.from({ length: 12 }, () => f.run('webSearch', { query: 'hi' })))
    assert.equal(f.calls.length, 5)
    assert.equal(results.filter(r => r.status === 'budget_exhausted').length, 7)
    assert.equal((await fixture().run('webSearch', { query: 'hi' })).status, 'ok')
  })

  it('executes only vetted contracts with explicit minimal inputs', async () => {
    const f = fixture()
    await f.run('predictionMarketLookup', { operation: 'query', q: 'bitcoin' })
    await f.run('predictionMarketLookup', { operation: 'markets', slugs: ['bitcoin'], closed: false })
    assert.deepEqual(f.calls, [
      ['scrape', { alexandria: { provider: 'polymarket', capability: 'search/query', options: { q: 'bitcoin', limit_per_type: 5 } }, timeout: 15000 }],
      ['scrape', { alexandria: { provider: 'polymarket', capability: 'markets/list', options: { slug: ['bitcoin'], closed: false, limit: 5 } }, timeout: 15000 }],
    ])
    for (const input of [{ operation: 'query' }, { operation: 'markets' }, { operation: 'query', q: '' }, { operation: 'markets', slugs: [] }, { operation: 'query', q: 'x', provider: 'shell' }, { operation: 'other', q: 'x' }, { operation: 'query', q: 'x', slugs: ['unexpected'] }, { operation: 'query', q: 'x', closed: false }, { operation: 'markets', slugs: ['event'], q: 'unexpected' }]) {
      assert.equal((await f.run('predictionMarketLookup', input)).status, 'invalid_input')
    }
    assert.equal(f.calls.length, 2)
    for (let i = 0; i < 3; i++) await f.run('predictionMarketLookup', { operation: 'query', q: 'bitcoin' })
    assert.equal(f.calls.length, 5) // invalid operation combinations spent no execution budget
    assert.equal((await f.run('predictionMarketLookup', { operation: 'query', q: 'bitcoin' })).status, 'budget_exhausted')
  })

  it('preserves live provider records and request IDs, but never returns provider refusals as records', async () => {
    const success = fixture({ createClient: async () => ({ scrape: async () => ({ requestId: 'req-1', scrapeId: 'scrape-1', alexandria: [{ provider: 'polymarket', capability: 'markets/list', feedbackToken: 'hidden', data: [{ question: 'Will it happen?', outcomes: '["Yes","No"]', outcomePrices: '["0.4","0.6"]' }] }] }) }) as never })
    const result = await success.run('predictionMarketLookup', { operation: 'markets', slugs: ['event'] })
    assert.equal(result.status, 'ok')
    assert.equal(result.requestId, 'req-1')
    assert.equal(result.scrapeId, 'scrape-1')
    assert.ok(JSON.stringify(result).includes('outcomePrices'))
    assert.ok(!JSON.stringify(result).includes('hidden'))
    for (const code of ['TERMS_REQUIRED', 'PERMISSION_DENIED', 'INSUFFICIENT_CREDITS']) {
      let calls = 0
      const failure = fixture({ createClient: async () => ({ scrape: async () => { calls++; return { alexandria: [{ error: { code, message: 'fake-key raw secret' } }] } } }) as never })
      const rejected = await failure.run('predictionMarketLookup', { operation: 'query', q: 'event' })
      assert.equal(rejected.status, 'unavailable')
      assert.ok(!JSON.stringify(rejected).includes('secret'))
      assert.equal(calls, 1)
    }
  })

  it('awaits in-flight SDK completion after abort, discards it, and makes no subsequent request', async () => {
    let complete!: (value: unknown) => void
    let started!: () => void
    const start = new Promise<void>(resolve => { started = resolve })
    const pending = new Promise(resolve => { complete = resolve })
    let calls = 0
    const f = fixture({ createClient: async () => ({ search: async () => { calls++; started(); return pending } }) as never })
    const controller = new AbortController()
    let settled = false
    const execution = f.run('webSearch', { query: 'current' }, controller.signal).then((value: unknown) => { settled = true; return value })
    await start
    controller.abort()
    await Promise.resolve()
    assert.equal(settled, false) // no promise race pretending to cancel the SDK transport
    complete({ web: [{ url: 'https://example.com' }] })
    assert.equal((await execution as { status: string }).status, 'cancelled')
    assert.equal((await f.run('webSearch', { query: 'more' }, controller.signal)).status, 'cancelled')
    assert.equal(calls, 1)
  })

  it('bounds structured output, preserves sources and removes examples and feedback tokens', async () => {
    const f = fixture({ createClient: async () => ({ search: async () => ({ web: Array.from({ length: 8 }, () => ({ url: 'https://example.com', description: 'x'.repeat(30000) })), tools: [{ provider: 'polymarket', capability: 'search/query', description: 'contract', example: { response: 'NOT LIVE' }, feedbackToken: 'TOKEN' }] }) }) as never })
    const result = await f.run('webSearch', { query: 'hi' })
    const text = JSON.stringify(result)
    assert.ok(text.length <= 12000)
    assert.equal(result.truncated, true)
    assert.ok(text.includes('https://example.com'))
    assert.ok(!text.includes('NOT LIVE') && !text.includes('TOKEN'))
  })

  it('preserves an accepted 1801-character citation whole, never as a partial URL', async () => {
    const source = 'https://example.com/' + 'a'.repeat(1781)
    assert.equal(source.length, 1801)
    const f = fixture({ createClient: async () => ({ search: async () => ({ web: [{ url: source }] }) }) as never })
    const result = await f.run('webSearch', { query: 'prices' })
    assert.deepEqual(result.sources, [source])
    assert.equal(result.results[0].url, source)
    assert.equal(result.truncated, false)
  })

  it('omits overlong URLs whole and keeps only complete citations when the envelope fills', async () => {
    const sources = Array.from({ length: 5 }, (_, i) => `https://example.com/${i}/` + 'a'.repeat(2026))
    const f = fixture({ createClient: async () => ({ search: async () => ({ web: sources.map(url => ({ url })) }) }) as never })
    const result = await f.run('webSearch', { query: 'prices' })
    assert.ok(JSON.stringify(result).length <= 12000)
    assert.equal(result.truncated, true)
    for (const source of result.sources ?? []) assert.ok(sources.includes(source))
    for (const record of result.results ?? []) assert.ok(sources.includes(record.url))
    const overlong = 'https://example.com/' + 'a'.repeat(2049)
    const omitted = fixture({ createClient: async () => ({ search: async () => ({ web: [{ url: overlong }] }) }) as never })
    const missing = await omitted.run('webSearch', { query: 'prices' })
    assert.deepEqual(missing.sources, [])
    assert.equal(missing.results[0].url, undefined)
    assert.equal(missing.truncated, true)
  })

  it('reports truncation when a normal record has 41 fields', async () => {
    const record = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`field${i}`, i]))
    const f = fixture({ createClient: async () => ({ scrape: async () => ({ requestId: 'request', scrapeId: 'scrape', alexandria: [{ provider: 'polymarket', capability: 'markets/list', data: [record] }] }) }) as never })
    const result = await f.run('predictionMarketLookup', { operation: 'markets', slugs: ['event'] })
    assert.equal(result.truncated, true)
    assert.equal(Object.keys(result.results[0].data[0]).length, 40)
  })

  it('redacts API keys in nested property names as well as values and URLs', async () => {
    const f = fixture({ createClient: async () => ({ search: async () => ({ web: [{ url: 'https://example.com/?q=fake-key', json: JSON.parse('{"nested-fake-key":{"value":"fake-key","__proto__":{"polluted":true},"constructor":"ignored"}}') }] }) }) as never })
    const result = await f.run('webSearch', { query: 'prices' })
    assert.ok(!JSON.stringify(result).includes('fake-key'))
    assert.equal(result.status, 'ok')
    assert.equal(result.truncated, true)
    assert.ok(!JSON.stringify(result).includes('__proto__'))
    assert.equal(({} as { polluted?: boolean }).polluted, undefined)
  })

  it('bounds JSON escaping and contract counts too', async () => {
    const f = fixture({ createClient: async () => ({ search: async () => ({ web: Array.from({ length: 5 }, () => ({ url: 'https://example.com/' + '\u0001'.repeat(2000) })), tools: Array.from({ length: 8 }, () => ({ provider: 'other', capability: 'unknown', description: 'discovery only' })) }) }) as never })
    const result = await f.run('webSearch', { query: 'records' })
    assert.ok(JSON.stringify(result).length <= 12000)
    assert.equal(result.truncated, true)
    const discovery = await f.run('discoverDataSources', { query: 'records' })
    assert.equal(discovery.contracts.length, 5)
    assert.equal(discovery.truncated, true)
    assert.ok(discovery.contracts.every((c: { executable: boolean }) => c.executable === false))
  })
})
