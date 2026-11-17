import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { ExpenseError } from './money.js';
import { createExpenseRepository, type ExpenseRepository } from './repository.js';

// Pure configuration builder: no environment or certificate-file reads, no pool.
export function expensePoolOptions(connectionString: string): pg.PoolConfig {
  try {
    const url = new URL(connectionString);
    if (!['postgres:','postgresql:'].includes(url.protocol) || !url.hostname) throw new Error();
    // Ignore URL TLS switches/file paths; always authenticate the remote certificate.
    // Do not let pg-connection-string read certificate paths or opt into libpq's weaker require mode.
    for (const key of [...url.searchParams.keys()]) {
      // pg merges parsed URL fields OVER explicit config. Strip budget overrides
      // and arbitrary startup options as well as the existing TLS switches.
      if (key.startsWith('ssl') || ['uselibpqcompat','statement_timeout','query_timeout','idle_in_transaction_session_timeout','options','connectionTimeoutMillis','connect_timeout'].includes(key)) url.searchParams.delete(key);
    }
    return {connectionString:url.toString(),ssl:{rejectUnauthorized:true},max:5,connectionTimeoutMillis:10000,
      statement_timeout:5000,query_timeout:6000,idle_in_transaction_session_timeout:5000,
      options:'-c statement_timeout=5000 -c idle_in_transaction_session_timeout=5000'};
  } catch { throw new ExpenseError('unconfigured'); }
}

let repository: ExpenseRepository | undefined;
// Called by trusted server tool execution only. Importing this module is inert.
export function getExpenseRepository(env: {DATABASE_URL?: string} = process.env): ExpenseRepository {
  if (!env.DATABASE_URL) throw new ExpenseError('unconfigured');
  if (repository) return repository;
  try {
    const pool = new pg.Pool(expensePoolOptions(env.DATABASE_URL));
    pool.on('error', () => { /* Do not log raw driver errors or connection configuration. */ });
    const raw = createExpenseRepository(drizzle(pool));
    const safe = <A, R>(fn: (arg:A)=>Promise<R>) => async (arg:A): Promise<R> => {
      try { return await fn(arg); } catch (e) { if (e instanceof ExpenseError) throw e; throw new ExpenseError('unavailable'); }
    };
    repository = {register:safe(raw.register),get:safe(raw.get),list:safe(raw.list),correct:safe(raw.correct),revisions:safe(raw.revisions)};
    return repository;
  } catch { throw new ExpenseError('unconfigured'); }
}
