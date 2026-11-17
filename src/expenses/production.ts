import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { ExpenseError } from './money.js';
import { createExpenseRepository, type ExpenseRepository } from './repository.js';

let repository: ExpenseRepository | undefined;
// Called by trusted server tool execution only. Importing this module is inert.
export function getExpenseRepository(env: {DATABASE_URL?: string} = process.env): ExpenseRepository {
  if (!env.DATABASE_URL) throw new ExpenseError('unconfigured');
  if (repository) return repository;
  try {
    const url = new URL(env.DATABASE_URL);
    if (!['postgres:','postgresql:'].includes(url.protocol) || !url.hostname) throw new Error();
    // Ignore URL TLS switches/file paths; always authenticate the remote certificate.
    // Do not let pg-connection-string read certificate paths or opt into libpq's weaker require mode.
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('ssl') || key === 'uselibpqcompat') url.searchParams.delete(key);
    }
    const pool = new pg.Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true},max:5,connectionTimeoutMillis:10000});
    pool.on('error', () => { /* Do not log raw driver errors or connection configuration. */ });
    const raw = createExpenseRepository(drizzle(pool));
    const safe = <A, R>(fn: (arg:A)=>Promise<R>) => async (arg:A): Promise<R> => {
      try { return await fn(arg); } catch (e) { if (e instanceof ExpenseError) throw e; throw new ExpenseError('unavailable'); }
    };
    repository = {register:safe(raw.register),get:safe(raw.get),list:safe(raw.list),correct:safe(raw.correct),revisions:safe(raw.revisions)};
    return repository;
  } catch { throw new ExpenseError('unconfigured'); }
}
