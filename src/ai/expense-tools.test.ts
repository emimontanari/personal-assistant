import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { asSchema } from 'ai'
import { createExpenseRepository } from '../expenses/repository.js'
import { convertUsdToArs } from '../fx/index.js'
import { createExpenseTools, type ExpenseRuntime } from './expense-tools.js'

async function fixture(t: { after(fn: () => Promise<void>): void }, pending = false, portals = 3) {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(await readFile(new URL('../../drizzle/0000_personal_expenses.sql', import.meta.url), 'utf8'))
  const repository = createExpenseRepository(drizzle(db))
  let fxCalls = 0
  const env = { TELEGRAM_OWNER_ID: '555', DATABASE_URL: 'configured-test-only' }
  const now = () => new Date('2024-03-02T01:00:00Z')
  const runtime: ExpenseRuntime = { getEnv: () => env, getRepository: () => repository,
    convert: async (amount, date, options) => {
      fxCalls++
      return convertUsdToArs(amount, date, { ...options, fetchImpl: async url => {
        const text = String(url)
        return Response.json(pending ? {} : text.includes('dolarapi.com')
          ? { casa: 'oficial', moneda: 'USD', venta: '1000', fechaActualizacion: '2024-02-29T12:00:00Z' }
          : text.includes('bluelytics') ? [{ source: 'Oficial', date: '2024-02-29', value_sell: '1001' }]
          : portals === 2 ? {} : { casa: 'oficial', fecha: '2024-02-29', venta: '1002' })
      } })
    }, now }
  const capability = Symbol('test-server')
  const context = Object.freeze({ ownerId: '555', chatId: '555', runId: 'run_test', capability })
  const tools = createExpenseTools({ chatId: '555', turn: 0, capability }, runtime)
  const execute = (name: keyof typeof tools, input: unknown, stamp: unknown = context) =>
    tools[name].execute!(input as never, { toolCallId: 'test', messages: [], context: stamp } as never) as Promise<any>
  return { repository, tools, execute, runtime, context, capability, env, fxCalls: () => fxCalls }
}

test('expense schemas are closed root objects without model identity or rates', async t => {
  const f = await fixture(t)
  for (const tool of Object.values(f.tools)) {
    const schema = await asSchema(tool.inputSchema).jsonSchema
    assert.equal(schema.type, 'object'); assert.equal(schema.additionalProperties, false)
    for (const forbidden of ['ownerId', 'sourceKey', 'runId', 'rates', 'portalURLs', 'capability']) assert.ok(!JSON.stringify(schema).includes(forbidden))
  }
})

test('ARS registration, backend date, replay conflict, distinct turn and scoped query', async t => {
  const f = await fixture(t)
  const input = { description: 'café', amount: '3500' }
  const result = await f.execute('registrarGasto', input)
  assert.equal(result.status, 'saved'); assert.equal(result.record.amount, '3500.00')
  assert.equal(result.record.arsAmount, '3500.00'); assert.equal(result.record.expenseDate, '2024-03-01')
  assert.equal(result.record.currency, 'ARS'); assert.equal(result.record.sourceKey, 'run_test:0:register')
  const beforeReplay = await f.repository.list({ ownerId: '555' })
  const concurrent = await Promise.all([f.execute('registrarGasto', input), f.execute('registrarGasto', { ...input, amount: '3500.00' })])
  assert.deepEqual(concurrent, [result, result]); assert.deepEqual(await f.repository.list({ ownerId: '555' }), beforeReplay)
  // A reconstructed resolver on task retry uses the same stable DB source key.
  const retried = createExpenseTools({ chatId: '555', turn: 0, capability: f.capability }, f.runtime)
  assert.deepEqual(await retried.registrarGasto.execute!(input as never, { context: f.context, toolCallId: 'retry', messages: [] } as never), result)
  assert.deepEqual(await f.execute('registrarGasto', input), result)
  assert.deepEqual(await f.execute('registrarGasto', { ...input, amount: '99' }), { status: 'conflict', message: 'Gasto no confirmado: conflict.' })
  const next = createExpenseTools({ chatId: '555', turn: 1, capability: f.capability }, f.runtime)
  await next.registrarGasto.execute!(input as never, { context: f.context, toolCallId: 'next', messages: [] } as never)
  const query = await f.execute('consultarGastos', {})
  assert.equal(query.status, 'ok'); assert.equal(query.totalArs, '7000.00'); assert.equal(query.records.length, 2)
  const page = await f.execute('consultarGastos', { from: '2024-03-01', to: '2024-03-01', limit: 1 })
  assert.equal(page.records.length, 1); assert.equal(page.totalArs, '7000.00')
  assert.equal((await f.execute('consultarGastos', { from: '2024-03-02' })).records.length, 0)
  for (const input of [{ limit: 0 }, { limit: 101 }, { ownerId: 'other' }, { from: '2024-03-02', to: '2024-03-01' }]) assert.equal((await f.execute('consultarGastos', input)).status, 'validation')
  assert.equal(f.fxCalls(), 0)
  assert.deepEqual(await f.repository.list({ ownerId: 'other' }), { records: [], totalArs: '0.00', pendingCount: 0 })
})

test('invalid input, forged context, cancellation and absent configuration never write', async t => {
  const f = await fixture(t)
  for (const patch of [{ ownerId: 'other' }, { sourceKey: 'forged' }, { amount: '0' }, { amount: '1.001' }, { amount: '-1' }, { expenseDate: '2023-02-29' }, { description: 'x'.repeat(501) }, { category: 'x'.repeat(101) }]) {
    assert.equal((await f.execute('registrarGasto', { description: 'x', amount: '1', ...patch })).status, 'validation')
  }
  for (const stamp of [undefined, {}, Object.freeze({ ...f.context, capability: Symbol('forged') }), Object.freeze({ ...f.context, ownerId: 'other' }), Object.freeze({ ...f.context, runId: '' })]) {
    // Explicit null avoids the fixture default parameter.
    assert.equal((await f.execute('registrarGasto', { description: 'x', amount: '1' }, stamp ?? null)).status, 'unavailable')
  }
  const aborted = AbortSignal.abort()
  assert.equal((await f.tools.registrarGasto.execute!({ description: 'x', amount: '1' } as never, { context: f.context, toolCallId: 'aborted', messages: [], abortSignal: aborted } as never) as any).status, 'unavailable')
  f.env.DATABASE_URL = ''
  assert.equal((await f.execute('registrarGasto', { description: 'x', amount: '1' })).status, 'unconfigured')
  assert.deepEqual(await f.repository.list({ ownerId: '555' }), { records: [], totalArs: '0.00', pendingCount: 0 })
  assert.equal(f.fxCalls(), 0)
})

for (const { pending, portals } of [{ pending: false, portals: 2 }, { pending: false, portals: 3 }, { pending: true, portals: 0 }]) test(`USD real fixture conversion and corrections (pending ${pending}, portals ${portals})`, async t => {
  const f = await fixture(t, pending, portals)
  const expectedArs = portals === 2 ? '100050.00' : '100100.00'
  const saved = await f.execute('registrarGasto', { description: 'GTA6', amount: '100', currency: 'USD', expenseDate: '2024-03-01' })
  assert.equal(saved.status, 'saved'); assert.equal(saved.record.amount, '100.00')
  assert.equal(saved.record.arsAmount, pending ? null : expectedArs)
  assert.equal(saved.record.conversionStatus, pending ? 'pending' : 'verified')
  if (!pending) { assert.equal(saved.record.conversion.quoteDate, '2024-02-29'); assert.equal(saved.record.conversion.quotes.length, portals); assert.match(saved.message, /indicativa/) }
  const query = await f.execute('consultarGastos', {})
  assert.equal(query.totalArs, pending ? '0.00' : expectedArs); assert.equal(query.pendingCount, pending ? 1 : 0)
  const id = saved.record.id
  const meta = await f.execute('corregirGasto', { id, expectedVersion: 1, patch: { description: 'juego' } })
  assert.equal(meta.status, 'corrected'); assert.deepEqual(meta.record.conversion, saved.record.conversion); assert.equal(f.fxCalls(), 1)
  const corrected = await f.execute('corregirGasto', { id, expectedVersion: 2, patch: { amount: '50' } })
  assert.equal(corrected.status, 'corrected'); assert.equal(corrected.record.amount, '50.00'); assert.equal(f.fxCalls(), 2)
  assert.equal(corrected.record.arsAmount, pending ? null : portals === 2 ? '50025.00' : '50050.00')
  const dated = await f.execute('corregirGasto', { id, expectedVersion: 3, patch: { expenseDate: '2024-02-29' } })
  assert.equal(dated.status, 'corrected'); assert.equal(f.fxCalls(), 3)
  const ars = await f.execute('corregirGasto', { id, expectedVersion: 4, patch: { currency: 'ARS' } })
  assert.equal(ars.status, 'corrected'); assert.equal(ars.record.arsAmount, '50.00'); assert.equal(ars.record.conversion, null); assert.equal(f.fxCalls(), 3)
  const before = await f.repository.list({ ownerId: '555' }); const audit = await f.repository.revisions({ ownerId: '555', id })
  for (const input of [{ id, expectedVersion: 1, patch: { amount: '2' } }, { id: '00000000-0000-4000-8000-000000000000', expectedVersion: 1, patch: { amount: '2' } }, { id: 'último', expectedVersion: 1, patch: { amount: '2' } }]) {
    assert.ok(['conflict', 'not_found', 'validation'].includes((await f.execute('corregirGasto', input)).status))
  }
  assert.deepEqual(await f.repository.list({ ownerId: '555' }), before)
  assert.deepEqual(await f.repository.revisions({ ownerId: '555', id }), audit)
})

test('repository errors are sanitized without returning successful records', async t => {
  const f = await fixture(t)
  f.runtime.getRepository = () => { throw Error('postgres://private DATABASE_URL SQL') }
  const tools = createExpenseTools({ chatId: '555', turn: 0, capability: f.capability }, f.runtime)
  const result = await tools.registrarGasto.execute!({ description: 'café', amount: '1' } as never, { context: f.context, toolCallId: 'bad', messages: [] } as never)
  assert.deepEqual(result, { status: 'unavailable', message: 'Gasto no confirmado: unavailable.' })
})
