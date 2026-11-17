export interface FxEvidence {
  quoteDate: string;
  rateNumeratorMicro: string;
  rateDenominator: number;
  meanRate: string;
  arsCents: string;
  quotes: Array<{ portal: string; sourceUrl: string; quoteDate: string; sell: string; observedAt: string }>;
}

export interface FxOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  totalTimeoutMs?: number;
}

const DOLAR = 'https://dolarapi.com/v1/dolares/oficial';
const BLUE = 'https://api.bluelytics.com.ar/v2/evolution.json?days=512';
const MICRO = 1_000_000n;
const MAX_BYTES = 256 * 1024;
const argentinaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
});

function localDate(date: Date): string {
  const parts = argentinaDate.formatToParts(date);
  return ['year', 'month', 'day'].map(key => parts.find(p => p.type === key)!.value).join('-');
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Numeric JSON tokens are first converted to their finite decimal spelling.
// Exponents, excess precision and implausibly large rates are not rounded into validity.
function rate(value: unknown): { micro: bigint; sell: string } | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  const text = value.toString();
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const micro = BigInt(whole) * MICRO + BigInt(fraction.padEnd(6, '0'));
  if (micro <= 0n) return null;
  const tail = fraction.replace(/0+$/, '');
  return { micro, sell: whole + (tail ? `.${tail}` : '') };
}

function updateDate(value: unknown, now: Date): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return null;
  if (!validDate(value.slice(0, 10))) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date <= now ? localDate(date) : null;
}

function timeout(value: number | undefined, maximum: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.min(value, maximum) : maximum;
}

// Read the actual stream, not just the optional (and untrusted) Content-Length.
async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    return null;
  }
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) {
    await response.body.cancel();
    return null;
  }
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

/**
 * Indicative accounting conversion, NOT an actual card settlement rate.
 * Dates are Argentina calendar dates. No quote can be newer than the expense.
 * Searches at most five candidate dates from a 512-row Bluelytics response and
 * the current DolarAPI observation; outside that history only an exact-date
 * ArgentinaDatos probe is possible. Insufficient evidence stays USD/pending.
 * All returned monetary values are decimal strings; the raw USD amount belongs
 * to the caller and is never replaced or persisted by this stateless service.
 */
export async function convertUsdToArs(
  amountUsdCents: bigint, expenseDate: string, options: FxOptions = {},
): Promise<FxEvidence | null> {
  const clock = options.now ?? (() => new Date());
  const instant = clock();
  if (typeof amountUsdCents !== 'bigint' || amountUsdCents <= 0n || !validDate(expenseDate)
    || !Number.isFinite(instant.getTime()) || expenseDate > localDate(instant) || options.signal?.aborted) return null;

  const total = new AbortController();
  const totalTimer = setTimeout(() => total.abort(), timeout(options.totalTimeoutMs, 15_000));
  const overall = options.signal ? AbortSignal.any([options.signal, total.signal]) : total.signal;
  const fetchImpl = options.fetchImpl ?? fetch;
  let requests = 0;
  const request = async (url: string): Promise<{ data: unknown; observedAt: string } | null> => {
    if (overall.aborted || requests >= 7) return null;
    requests++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout(options.requestTimeoutMs, 5_000));
    const signal = AbortSignal.any([overall, controller.signal]);
    try {
      const response = await fetchImpl(url, { signal, redirect: 'error', headers: { accept: 'application/json' } });
      const data = await boundedJson(response, signal);
      signal.throwIfAborted();
      return { data, observedAt: clock().toISOString() };
    } catch {
      // Do not expose remote payloads, transport errors or credentials.
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  type Quote = FxEvidence['quotes'][number];
  const quotes = new Map<string, Map<string, { quote: Quote; micro: bigint }>>();
  const add = (portal: string, sourceUrl: string, date: unknown, value: unknown, observedAt: string) => {
    if (!validDate(date) || date > expenseDate) return;
    const parsed = rate(value);
    if (!parsed) return;
    const day = quotes.get(date) ?? new Map<string, { quote: Quote; micro: bigint }>();
    // A portal is one source, regardless of how many history rows it sends.
    if (!day.has(portal)) day.set(portal, {
      quote: { portal, sourceUrl, quoteDate: date, sell: parsed.sell, observedAt }, micro: parsed.micro,
    });
    quotes.set(date, day);
  };
  try {
    const [dolar, blue] = await Promise.all([request(DOLAR), request(BLUE)]);
    if (overall.aborted) return null;
    if (dolar && record(dolar.data) && dolar.data.casa === 'oficial' && dolar.data.moneda === 'USD') {
      add('DolarAPI', DOLAR, updateDate(dolar.data.fechaActualizacion, instant), dolar.data.venta, dolar.observedAt);
    }
    if (blue && Array.isArray(blue.data) && blue.data.length <= 512) {
      for (const row of blue.data) {
        if (record(row) && row.source === 'Oficial' && (row.moneda === undefined || row.moneda === 'USD')) {
          add('Bluelytics', BLUE, row.date, row.value_sell, blue.observedAt);
        }
      }
    }
    const dates = [...quotes.keys()].sort().reverse().slice(0, 5);
    if (dates.length === 0) dates.push(expenseDate);
    for (const date of dates) {
      if (overall.aborted) return null;
      // date has already passed strict validation; no caller-supplied URL path.
      const url = `https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial/${date.replaceAll('-', '/')}`;
      const extra = await request(url);
      if (options.signal?.aborted) return null;
      if (extra && record(extra.data) && extra.data.casa === 'oficial' && extra.data.fecha === date
        && (extra.data.moneda === undefined || extra.data.moneda === 'USD')) {
        add('ArgentinaDatos', url, date, extra.data.venta, extra.observedAt);
      }
      const day = [...(quotes.get(date)?.values() ?? [])];
      if (day.length < 2) continue;
      const sum = day.reduce((value, entry) => value + entry.micro, 0n);
      const count = BigInt(day.length);
      const mean = (sum + count / 2n) / count;
      const denominator = MICRO * count;
      const evidence: FxEvidence = {
        quoteDate: date,
        rateNumeratorMicro: sum.toString(), rateDenominator: day.length,
        meanRate: `${mean / MICRO}.${(mean % MICRO).toString().padStart(6, '0')}`,
        arsCents: ((amountUsdCents * sum + denominator / 2n) / denominator).toString(),
        quotes: day.map(entry => Object.freeze(entry.quote)),
      };
      Object.freeze(evidence.quotes);
      return Object.freeze(evidence);
    }
    return null;
  } finally {
    clearTimeout(totalTimer);
  }
}
