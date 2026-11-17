import { sql } from 'drizzle-orm';
import { bigint, check, date, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { FxEvidence } from './money.js';

export const personalExpenses = pgTable('personal_expenses', {
  id: uuid('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  sourceKey: text('source_key').notNull(),
  sourcePayload: text('source_payload').notNull(),
  description: text('description').notNull(),
  amountCents: bigint('amount_cents', {mode:'bigint'}).notNull(),
  currency: text('currency').$type<'ARS'|'USD'>().notNull(),
  expenseDate: date('expense_date', {mode:'string'}).notNull(),
  category: text('category'),
  arsCents: bigint('ars_cents', {mode:'bigint'}),
  conversion: jsonb('conversion').$type<FxEvidence>(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', {withTimezone:true,mode:'string'}).notNull().defaultNow(),
}, t => [
  unique('personal_expenses_owner_source_unique').on(t.ownerId,t.sourceKey),
  check('personal_expenses_owner_id_check',sql`length(${t.ownerId}) between 1 and 100`),
  check('personal_expenses_source_key_check',sql`length(${t.sourceKey}) between 1 and 256`),
  check('personal_expenses_description_check',sql`length(${t.description}) between 1 and 500`),
  check('personal_expenses_amount_cents_check',sql`${t.amountCents} > 0`),
  check('personal_expenses_currency_check',sql`${t.currency} in ('ARS', 'USD')`),
  check('personal_expenses_category_check',sql`length(${t.category}) between 1 and 100`),
  check('personal_expenses_ars_cents_check',sql`${t.arsCents} > 0`),
  check('personal_expenses_version_check',sql`${t.version} > 0`),
  check('personal_expenses_check',sql`(${t.currency} = 'ARS' and ${t.arsCents} is not null and ${t.arsCents} = ${t.amountCents} and ${t.conversion} is null) or (${t.currency} = 'USD' and ((${t.arsCents} is null and ${t.conversion} is null) or (${t.arsCents} is not null and ${t.conversion} is not null)))`),
]);

export const expenseRevisions = pgTable('expense_revisions', {
  id: uuid('id').primaryKey(),
  expenseId: uuid('expense_id').notNull().references(()=>personalExpenses.id),
  ownerId: text('owner_id').notNull(),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', {withTimezone:true,mode:'string'}).notNull().defaultNow(),
}, t => [unique('expense_revisions_expense_version_unique').on(t.expenseId,t.version),check('expense_revisions_version_check',sql`${t.version} > 0`)]);
export const expenseSchema = {personalExpenses, expenseRevisions};
