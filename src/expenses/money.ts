export class ExpenseError extends Error {
  constructor(public readonly code: 'validation' | 'conflict' | 'not_found' | 'unconfigured' | 'unavailable') { super(`expenses:${code}`); }
}
export function valid(condition: unknown): asserts condition { if (!condition) throw new ExpenseError('validation'); }
export function text(value: unknown, max: number): string {
  valid(typeof value === 'string' && value.trim().length > 0 && value.length <= max);
  return value;
}
export function date(value: unknown): string {
  valid(typeof value === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) && value.slice(0,4) !== '0000');
  const parsed = new Date(`${value}T00:00:00Z`);
  valid(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value);
  return value;
}
const MAX = 9223372036854775807n;
export function decimal(value: unknown, precision: number): bigint {
  valid(typeof value === 'string' && value.length <= 40 && new RegExp(`^[0-9]+(?:\\.[0-9]{1,${precision}})?$`).test(value));
  const [whole, fraction = ''] = value.split('.');
  const result = BigInt(whole!) * 10n ** BigInt(precision) + BigInt(fraction.padEnd(precision,'0'));
  valid(result > 0n && result <= MAX); return result;
}
export function format(value: bigint, precision = 2): string {
  const scale = 10n ** BigInt(precision);
  return `${value / scale}.${(value % scale).toString().padStart(precision,'0')}`;
}
const round = (n: bigint, d: bigint) => (n + d / 2n) / d;
export interface FxEvidence {
  quoteDate: string;
  rateNumeratorMicro: string;
  rateDenominator: number;
  meanRate: string;
  arsCents: string;
  quotes: Array<{portal: string; sourceUrl: string; quoteDate: string; sell: string; observedAt: string}>;
}
export function conversion(amount: bigint, currency: 'ARS' | 'USD', expenseDate: string, fx?: FxEvidence | null) {
  if (currency === 'ARS') { valid(fx == null); return { arsCents: amount, conversion: null }; }
  if (fx == null) return { arsCents: null, conversion: null };
  valid(typeof fx === 'object' && Array.isArray(fx.quotes) && fx.quotes.length >= 2 && fx.quotes.length <= 3);
  valid(date(fx.quoteDate) <= expenseDate && fx.rateDenominator === fx.quotes.length);
  const portals = new Set<string>();
  let sum = 0n;
  for (const q of fx.quotes) {
    valid(q && typeof q === 'object');
    const portal = text(q.portal,100).trim().toLowerCase(); valid(!portals.has(portal)); portals.add(portal);
    valid(date(q.quoteDate) === fx.quoteDate);
    const url = text(q.sourceUrl,2048);
    try { const parsed = new URL(url); valid(parsed.protocol === 'https:' && !parsed.username && !parsed.password); } catch { throw new ExpenseError('validation'); }
    valid(typeof q.observedAt === 'string' && q.observedAt.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(q.observedAt) && Number.isFinite(Date.parse(q.observedAt)));
    sum += decimal(q.sell,6);
  }
  const count = BigInt(fx.quotes.length);
  valid(fx.rateNumeratorMicro === sum.toString() && fx.meanRate === format(round(sum,count),6));
  const arsCents = round(amount * sum, count * 1000000n);
  valid(arsCents > 0n && arsCents <= MAX && fx.arsCents === arsCents.toString());
  // Copy the bounded, validated shape: caller mutation cannot rewrite stored evidence.
  const evidence: FxEvidence = { quoteDate: fx.quoteDate, rateNumeratorMicro: fx.rateNumeratorMicro, rateDenominator: fx.rateDenominator, meanRate: fx.meanRate, arsCents: fx.arsCents, quotes: fx.quotes.map(q=>({portal:q.portal,sourceUrl:q.sourceUrl,quoteDate:q.quoteDate,sell:q.sell,observedAt:q.observedAt})) };
  return { arsCents, conversion: evidence };
}
