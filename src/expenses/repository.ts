import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { conversion, date, decimal, ExpenseError, format, text, valid, type FxEvidence } from './money.js';
import { expenseRevisions as revisions, personalExpenses as expenses } from './schema.js';
export { ExpenseError } from './money.js';
export type { FxEvidence } from './money.js';
export interface RegisterInput {
  ownerId: string; sourceKey: string; description: string; amount: string;
  currency: 'ARS'|'USD'; expenseDate: string; category?: string;
  conversion?: FxEvidence | null;
}
export interface ListInput { ownerId: string; from?: string; to?: string; limit?: number }
export interface CorrectInput {
  ownerId: string; id: string; expectedVersion: number;
  patch: Partial<Pick<RegisterInput,'description'|'amount'|'currency'|'expenseDate'|'category'>>;
  conversion?: FxEvidence | null;
}
type Stored = typeof expenses.$inferSelect;
function record(row: Stored) {
  return { id:row.id, ownerId:row.ownerId, sourceKey:row.sourceKey, description:row.description,
    amount:format(row.amountCents), currency:row.currency, expenseDate:row.expenseDate, category:row.category,
    arsAmount:row.arsCents === null ? null : format(row.arsCents), conversion:row.conversion,
    conversionStatus: row.currency === 'ARS' ? 'direct' as const : row.conversion ? 'verified' as const : 'pending' as const,
    version:row.version, createdAt:new Date(row.createdAt).toISOString() };
}
export type ExpenseRecord = ReturnType<typeof record>;
function fields(input: Pick<RegisterInput,'description'|'amount'|'currency'|'expenseDate'|'category'|'conversion'>) {
  valid(input && typeof input === 'object');
  const description = text(input.description,500);
  const amountCents = decimal(input.amount,2);
  valid(input.currency === 'ARS' || input.currency === 'USD');
  const expenseDate = date(input.expenseDate);
  const category = input.category === undefined ? null : text(input.category,100);
  return {description,amountCents,currency:input.currency,expenseDate,category,...conversion(amountCents,input.currency,expenseDate,input.conversion)};
}
function identity(input: {ownerId:string;id:string}) {
  text(input.ownerId,100);
  valid(typeof input.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id));
  return and(eq(expenses.ownerId,input.ownerId),eq(expenses.id,input.id));
}
export function createExpenseRepository<Q extends PgQueryResultHKT, S extends Record<string, unknown>>(db: PgDatabase<Q,S>) {
  return {
    async register(input: RegisterInput) {
      valid(input && typeof input === 'object');
      const ownerId = text(input.ownerId,100), sourceKey = text(input.sourceKey,256);
      const values = fields(input);
      const sourcePayload = JSON.stringify({...values,amountCents:values.amountCents.toString(),arsCents:values.arsCents?.toString() ?? null});
      const inserted = await db.insert(expenses).values({id:randomUUID(),ownerId,sourceKey,sourcePayload,...values})
        .onConflictDoNothing({target:[expenses.ownerId,expenses.sourceKey]}).returning();
      if (inserted[0]) return record(inserted[0]);
      const [existing] = await db.select().from(expenses).where(and(eq(expenses.ownerId,ownerId),eq(expenses.sourceKey,sourceKey)));
      if (!existing || existing.sourcePayload !== sourcePayload) throw new ExpenseError('conflict');
      return record(existing);
    },
    async get(input: {ownerId:string;id:string}): Promise<ExpenseRecord | null> {
      valid(input && typeof input === 'object');
      const where = identity(input);
      const [row] = await db.select().from(expenses).where(where).limit(1);
      return row ? record(row) : null;
    },
    async list(input: ListInput) {
      valid(input && typeof input === 'object'); text(input.ownerId,100);
      const limit = input.limit ?? 100; valid(Number.isInteger(limit) && limit >= 1 && limit <= 100);
      const from = input.from === undefined ? undefined : date(input.from), to = input.to === undefined ? undefined : date(input.to);
      valid(!from || !to || from <= to);
      const where = and(eq(expenses.ownerId,input.ownerId),from ? gte(expenses.expenseDate,from) : undefined,to ? lte(expenses.expenseDate,to) : undefined);
      // Snapshot both the page and whole-filter totals, never silently total only the page.
      return db.transaction(async tx => {
        const rows = await tx.select().from(expenses).where(where).orderBy(asc(expenses.expenseDate),asc(expenses.id)).limit(limit);
        const [totals] = await tx.select({total:sql<string>`coalesce(sum(${expenses.arsCents}),0)::text`, pending:sql<string>`count(*) filter (where ${expenses.currency} = 'USD' and ${expenses.arsCents} is null)::text`}).from(expenses).where(where);
        return {records:rows.map(record),totalArs:format(BigInt(totals!.total)),pendingCount:Number(totals!.pending)};
      }, {isolationLevel:'repeatable read'});
    },
    async correct(input: CorrectInput) {
      valid(input && typeof input === 'object');
      const where = identity(input);
      valid(Number.isInteger(input.expectedVersion) && input.expectedVersion > 0 && input.expectedVersion < 2147483647);
      valid(input.patch && typeof input.patch === 'object' && !Array.isArray(input.patch));
      valid(Object.keys(input.patch).every(k=>['description','amount','currency','expenseDate','category'].includes(k)));
      valid(Object.values(input.patch).every(v=>v !== undefined));
      return db.transaction(async tx => {
        const [old] = await tx.select().from(expenses).where(where).for('update');
        if (!old) throw new ExpenseError('not_found');
        if (old.version !== input.expectedVersion) throw new ExpenseError('conflict');
        const before = record(old);
        const monetary = (input.patch.amount !== undefined && decimal(input.patch.amount,2) !== old.amountCents)
          || (input.patch.currency !== undefined && input.patch.currency !== old.currency)
          || (input.patch.expenseDate !== undefined && input.patch.expenseDate !== old.expenseDate);
        const fx = input.conversion !== undefined ? input.conversion : monetary ? null : old.conversion;
        const values = fields({description:old.description,amount:before.amount,currency:old.currency,expenseDate:old.expenseDate,category:old.category ?? undefined,...input.patch,conversion:fx});
        const [updated] = await tx.update(expenses).set({...values,version:old.version+1}).where(and(where,eq(expenses.version,input.expectedVersion))).returning();
        if (!updated) throw new ExpenseError('conflict');
        await tx.insert(revisions).values({id:randomUUID(),expenseId:old.id,ownerId:input.ownerId,version:old.version,snapshot:before});
        return record(updated);
      });
    },
    async revisions(input: {ownerId:string;id:string}) {
      valid(input && typeof input === 'object'); identity(input);
      return db.select({snapshot:revisions.snapshot,version:revisions.version,createdAt:revisions.createdAt}).from(revisions)
        .where(and(eq(revisions.ownerId,input.ownerId),eq(revisions.expenseId,input.id))).orderBy(asc(revisions.version));
    },
  };
}
export type ExpenseRepository = ReturnType<typeof createExpenseRepository>;
