import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { createExpenseRepository, type RegisterInput } from './repository.js';
import { getExpenseRepository } from './production.js';
import pg from 'pg';
import type { FxEvidence } from './money.js';

const input: RegisterInput = { ownerId: '123', sourceKey: 'turn-1', description: 'Lunch', amount: '10.50', currency: 'ARS', expenseDate: '2024-02-29' };
function evidence(three = false): FxEvidence {
  const sells = three ? ['1000', '1001', '1001'] : ['1000', '1001'];
  return { quoteDate: '2024-02-28', rateNumeratorMicro: three ? '3002000000' : '2001000000', rateDenominator: sells.length, meanRate: three ? '1000.666667' : '1000.500000', arsCents: three ? '1050700' : '1050525', quotes: sells.map((sell, i) => ({ portal: `portal-${i}`, sourceUrl: `https://example.com/${i}`, quoteDate: '2024-02-28', sell, observedAt: '2024-02-29T12:00:00Z' })) };
}
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const client = new PGlite();
  t.after(() => client.close());
  await client.exec(await readFile(new URL('../../drizzle/0000_personal_expenses.sql', import.meta.url), 'utf8'));
  return createExpenseRepository(drizzle(client));
}
const error = (code: string) => (e: unknown) => { assert.equal((e as {code: string}).code, code); return true; };

test('ARS register, normalized records, totals and replay collision', async t => {
  const repo = await fixture(t);
  const saved = await repo.register(input);
  assert.match(saved.id, /^[0-9a-f-]{36}$/);
  assert.equal(saved.amount, '10.50'); assert.equal(saved.arsAmount, '10.50'); assert.equal(saved.version, 1);
  assert.deepEqual(await repo.register({...input, amount: '10.5'}), saved);
  await assert.rejects(repo.register({...input, description: 'Other'}), error('conflict'));
  const result = await repo.list({ownerId: '123'});
  assert.deepEqual(result, { records: [saved], totalArs: '10.50', pendingCount: 0 });
});

test('USD pending and exact two/three portal evidence persisted and totaled', async t => {
  const repo = await fixture(t);
  const pending = await repo.register({...input, currency: 'USD'});
  assert.equal(pending.amount, '10.50'); assert.equal(pending.arsAmount, null); assert.equal(pending.conversionStatus, 'pending');
  for (const three of [false, true]) {
    const conversion = evidence(three);
    const saved = await repo.register({...input, sourceKey: `fx-${three}`, currency: 'USD', conversion});
    assert.deepEqual(saved.conversion, conversion);
    assert.equal(saved.arsAmount, three ? '10507.00' : '10505.25');
  }
  const listed = await repo.list({ownerId:'123'});
  assert.equal(listed.totalArs, '21012.25'); assert.equal(listed.pendingCount, 1);
});

test('validation rejects bad inputs and evidence without changing public state', async t => {
  const repo = await fixture(t);
  const bad: unknown[] = [undefined, '0', '-1', 'NaN', 'Infinity', '1e3', '1.001', 1, '92233720368547758.08'];
  for (const amount of bad) await assert.rejects(repo.register({...input, amount} as RegisterInput), error('validation'));
  for (const expenseDate of ['2023-02-29','2024-04-31','2024-13-01','2024-2-01','0000-01-01']) await assert.rejects(repo.register({...input, expenseDate}), error('validation'));
  for (const patch of [{ownerId:''},{sourceKey:''},{description:'x'.repeat(501)},{category:'x'.repeat(101)},{currency:'EUR'}]) await assert.rejects(repo.register({...input,...patch} as RegisterInput), error('validation'));
  const fx = evidence();
  for (const conversion of [fx, {...fx, quotes: fx.quotes.slice(0,1)}, {...fx, meanRate:'1000.500001'}, {...fx, arsCents:'1'}, {...fx, rateNumeratorMicro:'1'}, {...fx, quoteDate:'2024-03-01'}, {...fx, quotes:[fx.quotes[0]!,fx.quotes[0]!]}, {...fx, quotes:fx.quotes.map(q=>({...q,sell:'NaN'}))}]) {
    await assert.rejects(repo.register({...input, currency: conversion === fx ? 'ARS' : 'USD', conversion}), error('validation'));
  }
  for (const request of [{ownerId:''},{ownerId:'123',limit:101},{ownerId:'123',limit:0},{ownerId:'123',from:'2024-03-01',to:'2024-02-01'}]) await assert.rejects(repo.list(request), error('validation'));
  assert.deepEqual(await repo.list({ownerId:'123'}), {records:[],totalArs:'0.00',pendingCount:0});
  const saved = await repo.register({...input,amount:'0.01',category:'a'.repeat(100),description:'a'.repeat(500)});
  assert.equal(saved.amount,'0.01');
});

test('owner scope, date filters, correction version and transactional audit', async t => {
  const repo = await fixture(t);
  const saved = await repo.register(input);
  await repo.register({...input,ownerId:'456'});
  assert.equal((await repo.list({ownerId:'456'})).records.length,1);
  assert.equal((await repo.list({ownerId:'123',from:'2024-03-01'})).records.length,0);
  assert.equal((await repo.list({ownerId:'123',to:'2024-02-29',limit:1})).records.length,1);
  await assert.rejects(repo.correct({ownerId:'456',id:saved.id,expectedVersion:1,patch:{amount:'11'}}),error('not_found'));
  await assert.rejects(repo.correct({ownerId:'123',id:saved.id,expectedVersion:2,patch:{amount:'11'}}),error('conflict'));
  await assert.rejects(repo.correct({ownerId:'123',id:saved.id,expectedVersion:1,patch:{amount:'-1'}}),error('validation'));
  assert.deepEqual(await repo.revisions({ownerId:'123',id:saved.id}),[]);
  const changed = await repo.correct({ownerId:'123',id:saved.id,expectedVersion:1,patch:{amount:'11'}});
  assert.equal(changed.version,2); assert.equal(changed.createdAt,saved.createdAt); assert.equal(changed.sourceKey,saved.sourceKey);
  assert.deepEqual((await repo.revisions({ownerId:'123',id:saved.id})).map(r=>r.snapshot),[saved]);
  assert.deepEqual(await repo.revisions({ownerId:'456',id:saved.id}),[]);
  await assert.rejects(repo.correct({ownerId:'123',id:saved.id,expectedVersion:1,patch:{amount:'12'}}),error('conflict'));
  assert.deepEqual((await repo.list({ownerId:'123'})).records,[changed]);
  assert.equal((await repo.revisions({ownerId:'123',id:saved.id})).length,1);
  assert.deepEqual(await repo.register(input),changed); // Original retry cannot undo a correction.
});

test('correction retains FX only for nonmonetary changes, fresh evidence and currency transition', async t => {
  const repo = await fixture(t);
  const saved = await repo.register({...input,currency:'USD',conversion:evidence()});
  const described = await repo.correct({ownerId:'123',id:saved.id,expectedVersion:1,patch:{description:'New',category:'food'}});
  assert.deepEqual(described.conversion,saved.conversion); assert.equal(described.arsAmount,saved.arsAmount);
  const dated = await repo.correct({ownerId:'123',id:saved.id,expectedVersion:2,patch:{expenseDate:'2024-03-01'}});
  assert.equal(dated.arsAmount,null); assert.equal(dated.conversionStatus,'pending');
  const verified = await repo.correct({ownerId:'123',id:saved.id,expectedVersion:3,patch:{},conversion:evidence()});
  assert.equal(verified.arsAmount,saved.arsAmount);
  const amountChanged = await repo.correct({ownerId:'123',id:saved.id,expectedVersion:4,patch:{amount:'20'}});
  assert.equal(amountChanged.conversion,null);
  const ars = await repo.correct({ownerId:'123',id:saved.id,expectedVersion:5,patch:{currency:'ARS'}});
  assert.equal(ars.arsAmount,'20.00'); assert.equal(ars.conversion,null);
});

test('half-up conversion and full-filter totals despite page limit', async t => {
  const repo = await fixture(t);
  const fx: FxEvidence = {quoteDate:'2024-02-28',rateNumeratorMicro:'3000000',rateDenominator:2,meanRate:'1.500000',arsCents:'2',quotes:evidence().quotes.map((q,i)=>({...q,sell:String(i+1)}))};
  const saved = await repo.register({...input,currency:'USD',amount:'0.01',conversion:fx});
  assert.equal(saved.arsAmount,'0.02');
  await repo.register({...input,sourceKey:'another'});
  const listed = await repo.list({ownerId:'123',limit:1});
  assert.equal(listed.records.length,1); assert.equal(listed.totalArs,'10.52');
});

test('audit insertion failure rolls back correction completely', async t => {
  const client = new PGlite(); t.after(()=>client.close());
  await client.exec(await readFile(new URL('../../drizzle/0000_personal_expenses.sql',import.meta.url),'utf8'));
  const repo = createExpenseRepository(drizzle(client));
  const saved = await repo.register(input);
  // Test-only fault at the second write, not a mock transaction.
  await client.exec("CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$; CREATE TRIGGER reject_audit BEFORE INSERT ON expense_revisions FOR EACH ROW EXECUTE FUNCTION reject_audit();");
  await assert.rejects(repo.correct({ownerId:'123',id:saved.id,expectedVersion:1,patch:{amount:'99'}}));
  assert.deepEqual((await repo.list({ownerId:'123'})).records,[saved]);
  assert.deepEqual(await repo.revisions({ownerId:'123',id:saved.id}),[]);
});

test('production import is inert; missing URL is sanitized unconfigured', async () => {
  const original = pg.Pool;
  let constructions = 0;
  pg.Pool = class { constructor() { constructions++; throw new Error('pool must not be constructed'); } } as unknown as typeof pg.Pool;
  try {
    await import(`./production.js?inert-proof`);
    assert.equal(constructions,0);
    assert.throws(()=>getExpenseRepository({}), error('unconfigured'));
    assert.equal(constructions,0);
  } finally { pg.Pool = original; }
});
