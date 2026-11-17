import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import * as production from './production.js';

const connectionString = 'postgresql://test:synthetic-secret@db.example/test?sslmode=no-verify&statement_timeout=999999&query_timeout=999999&idle_in_transaction_session_timeout=999999&options=-c%20statement_timeout%3D0&connectionTimeoutMillis=999999&application_name=expenses';

test('pool options enforce server/client budgets despite URL overrides, retaining TLS validation', () => {
  const options = production.expensePoolOptions(connectionString);
  assert.equal(options.statement_timeout,5000);
  assert.equal(options.query_timeout,6000);
  assert.equal(options.idle_in_transaction_session_timeout,5000);
  assert.equal(options.connectionTimeoutMillis,10000);
  assert.deepEqual(options.ssl,{rejectUnauthorized:true});
  const startupOptions = '-c statement_timeout=5000 -c idle_in_transaction_session_timeout=5000';
  assert.equal(options.options,startupOptions); // Suppress PGOPTIONS fallback too.
  const client = new pg.Client(options); // Configuration only, never connect.
  const parameters = (client as unknown as {connectionParameters: Record<string,unknown>}).connectionParameters;
  assert.equal(parameters.statement_timeout,5000);
  assert.equal(parameters.query_timeout,6000);
  assert.equal(parameters.idle_in_transaction_session_timeout,5000);
  assert.equal(parameters.options,startupOptions);
  assert.deepEqual(parameters.ssl,{rejectUnauthorized:true});
  const startup = (client as unknown as {getStartupConf(): Record<string,unknown>}).getStartupConf();
  assert.equal(startup.statement_timeout,'5000');
  assert.equal(startup.idle_in_transaction_session_timeout,'5000');
  assert.equal(startup.options,startupOptions);
  assert.equal(new URL(options.connectionString!).searchParams.get('application_name'),'expenses');
  for (const invalid of ['not a URL','https://synthetic-secret@example.com']) {
    assert.throws(()=>production.expensePoolOptions(invalid),e=>{
      assert.equal((e as {code:string}).code,'unconfigured');
      assert.equal((e as Error).message,'expenses:unconfigured');
      return true;
    });
  }
});

test('lazy production uses protected options and sanitizes query timeout failures', async () => {
  const original = pg.Pool;
  let captured: pg.PoolConfig | undefined;
  let queries = 0;
  class TimeoutPool {
    constructor(options: pg.PoolConfig) { captured = options; }
    on() { return this; }
    async query() { queries++; throw new Error(`Query read timeout ${connectionString}`); }
  }
  pg.Pool = TimeoutPool as unknown as typeof pg.Pool;
  try {
    const module = await import('./production.js?timeout-proof');
    assert.equal(captured,undefined);
    const repo = module.getExpenseRepository({DATABASE_URL:connectionString});
    assert.equal(captured?.statement_timeout,5000);
    assert.equal(captured?.query_timeout,6000);
    assert.equal(captured?.idle_in_transaction_session_timeout,5000);
    await assert.rejects(repo.get({ownerId:'123',id:'00000000-0000-4000-8000-000000000000'}),e=>{
      assert.equal((e as {code:string}).code,'unavailable');
      assert.equal((e as Error).message,'expenses:unavailable');
      assert.equal((e as Error).cause,undefined);
      return true;
    });
    assert.equal(queries,1);
  } finally { pg.Pool = original; }
});
