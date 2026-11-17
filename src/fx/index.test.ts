import test from 'node:test';
import assert from 'node:assert/strict';
import { convertUsdToArs } from './index.js';

const D = 'https://dolarapi.com/v1/dolares/oficial';
const B = 'https://api.bluelytics.com.ar/v2/evolution.json?days=512';
const A = (date: string) => `https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial/${date.replaceAll('-', '/')}`;
const now = () => new Date('2026-11-17T20:00:00Z');
const dollar = (date = '2026-11-16', venta: unknown = 1575) => ({ moneda: 'USD', casa: 'oficial', venta, fechaActualizacion: `${date}T18:00Z` });
const blue = (date = '2026-11-16', value_sell: unknown = 1572) => ({ date, source: 'Oficial', value_sell });
const argentina = (date = '2026-11-16', venta: unknown = 1570) => ({ casa: 'oficial', fecha: date, venta });
function fixture(data: Record<string, unknown>) {
  const calls: string[] = [];
  const fetchImpl = (async (input, init) => {
    const url = String(input);
    calls.push(url);
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(init?.redirect, 'error');
    assert.ok(url === D || url === B || /^https:\/\/api\.argentinadatos\.com\/v1\/cotizaciones\/dolares\/oficial\/\d{4}\/\d{2}\/\d{2}$/.test(url));
    return new Response(JSON.stringify(data[url] ?? null));
  }) as typeof fetch;
  return { calls, options: { fetchImpl, now } };
}

test('three same-date official sellers yield exact evidence, mean and ARS cents', async () => {
  const f = fixture({ [D]: dollar(), [B]: [blue(), { ...blue(), source: 'Blue', value_sell: 9000 }], [A('2026-11-16')]: argentina() });
  const result = await convertUsdToArs(10000n, '2026-11-17', f.options);
  assert.deepEqual(result, {
    quoteDate: '2026-11-16', rateNumeratorMicro: '4717000000', rateDenominator: 3,
    meanRate: '1572.333333', arsCents: '15723333',
    quotes: [
      { portal: 'DolarAPI', sourceUrl: D, quoteDate: '2026-11-16', sell: '1575', observedAt: now().toISOString() },
      { portal: 'Bluelytics', sourceUrl: B, quoteDate: '2026-11-16', sell: '1572', observedAt: now().toISOString() },
      { portal: 'ArgentinaDatos', sourceUrl: A('2026-11-16'), quoteDate: '2026-11-16', sell: '1570', observedAt: now().toISOString() },
    ],
  });
  assert.deepEqual(f.calls, [D, B, A('2026-11-16')]);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result?.quotes[0]));
});

test('latest two beat richer older date, deduplicating portal rows', async () => {
  const f = fixture({ [D]: dollar(), [B]: [blue('2026-11-17', 1574), blue('2026-11-17', 1574), blue()], [A('2026-11-17')]: argentina('2026-11-17', 1570) });
  const r = await convertUsdToArs(10000n, '2026-11-17', f.options);
  assert.equal(r?.quoteDate, '2026-11-17');
  assert.equal(r?.rateDenominator, 2);
  assert.equal(r?.rateNumeratorMicro, '3144000000');
  assert.equal(r?.arsCents, '15720000');
  assert.deepEqual(f.calls, [D, B, A('2026-11-17')]);
});

test('mismatched exact-date result excluded; select latest prior common date', async () => {
  const f = fixture({ [D]: dollar(), [B]: [blue('2026-11-17'), blue()], [A('2026-11-17')]: argentina('2026-11-16'), [A('2026-11-16')]: argentina() });
  const r = await convertUsdToArs(10000n, '2026-11-17', f.options);
  assert.equal(r?.quoteDate, '2026-11-16');
  assert.equal(r?.rateDenominator, 3);
  assert.deepEqual(f.calls, [D, B, A('2026-11-17'), A('2026-11-16')]);
});

test('weekend preserves Friday quote; Argentina timezone governs DolarAPI update', async () => {
  const f = fixture({ [D]: { ...dollar('2026-11-14'), fechaActualizacion: '2026-11-14T01:00:00Z' }, [B]: [blue('2026-11-13')], [A('2026-11-13')]: argentina('2026-11-13') });
  const r = await convertUsdToArs(100n, '2026-11-15', f.options);
  assert.equal(r?.quoteDate, '2026-11-13');
  assert.equal(r?.quotes.length, 3);
});

test('Blue unavailable: DolarAPI plus exact-date Argentina still work', async () => {
  const f = fixture({ [D]: dollar(), [A('2026-11-16')]: argentina() });
  const r = await convertUsdToArs(1n, '2026-11-16', f.options);
  assert.equal(r?.rateDenominator, 2);
  assert.equal(r?.meanRate, '1572.500000');
  assert.equal(r?.arsCents, '1573');
});

test('exact fractional-cent half-up and arbitrarily large amount arithmetic', async () => {
  const f = fixture({ [D]: dollar('2026-11-16', '1.000001'), [B]: [blue('2026-11-16', '1.000002')] });
  const r = await convertUsdToArs(1000000n, '2026-11-16', f.options);
  assert.equal(r?.meanRate, '1.000002');
  assert.equal(r?.arsCents, '1000002');
  const huge = 900719925474099312345n;
  const r2 = await convertUsdToArs(huge, '2026-11-16', f.options);
  assert.equal(r2?.arsCents, ((huge * 2000003n + 1000000n) / 2000000n).toString());
});

test('invalid amount, impossible/noncanonical/future dates make no requests', async () => {
  const f = fixture({});
  for (const date of ['2026-02-30', '2026-2-03', '2026-11-18', 'bad', '0000-01-01']) {
    assert.equal(await convertUsdToArs(1n, date, f.options), null);
  }
  for (const amount of [0n, -1n, 1 as unknown as bigint]) assert.equal(await convertUsdToArs(amount, '2026-11-17', f.options), null);
  assert.equal(f.calls.length, 0);
  const local = fixture({});
  assert.equal(await convertUsdToArs(1n, '2026-11-17', { ...local.options, now: () => new Date('2026-11-17T01:00Z') }), null);
  assert.equal(local.calls.length, 0);
});

test('untrusted nonofficial, future, malformed and invalid numeric quotes never count', async () => {
  for (const value of [0, -1, null, 'NaN', 'Infinity', '1e100', 1e30, '1.0000001', {}, true]) {
    const f = fixture({ [D]: dollar('2026-11-16', value), [B]: [blue('2026-11-16', value)], [A('2026-11-16')]: argentina('2026-11-16', value) });
    assert.equal(await convertUsdToArs(1n, '2026-11-16', f.options), null);
  }
  for (const d of [{ ...dollar(), casa: 'blue' }, { ...dollar(), moneda: 'EUR' }, dollar('2026-11-18'), { ...dollar(), fechaActualizacion: '2026-02-30T18:00Z' }]) {
    const f = fixture({ [D]: d, [B]: [{ ...blue(), source: 'Blue' }, blue('2026-11-18')], [A('2026-11-17')]: { ...argentina('2026-11-17'), moneda: 'EUR' } });
    assert.equal(await convertUsdToArs(1n, '2026-11-17', f.options), null);
  }
});

test('old expense outside history attempts exact date, cannot convert from one portal', async () => {
  const f = fixture({ [D]: dollar(), [B]: [blue()], [A('2020-01-01')]: argentina('2020-01-01') });
  assert.equal(await convertUsdToArs(1n, '2020-01-01', f.options), null);
  assert.deepEqual(f.calls, [D, B, A('2020-01-01')]);
});

test('bounded five candidates / seven requests, no current historical fallback', async () => {
  const f = fixture({ [B]: Array.from({ length: 10 }, (_, i) => blue(`2026-11-${String(17 - i).padStart(2, '0')}`)) });
  assert.equal(await convertUsdToArs(1n, '2026-11-17', f.options), null);
  assert.equal(f.calls.length, 7);
  assert.deepEqual(f.calls.slice(2), ['17', '16', '15', '14', '13'].map(d => A(`2026-11-${d}`)));
});

test('request timeout permits two quotes, or null when fewer than two remain', async () => {
  for (const keepBlue of [true, false]) {
    const f = fixture({ [D]: dollar(), [B]: keepBlue ? [blue()] : null });
    let aborted = false;
    const fetchImpl = (async (url, init) => {
      if (String(url).startsWith('https://api.argentinadatos.com/')) return await new Promise<Response>((_, reject) => {
        init!.signal!.addEventListener('abort', () => { aborted = true; reject(new Error('timeout')); }, { once: true });
      });
      return f.options.fetchImpl(url, init);
    }) as typeof fetch;
    const r = await convertUsdToArs(1n, '2026-11-16', { ...f.options, fetchImpl, requestTimeoutMs: 10 });
    assert.equal(r?.rateDenominator ?? null, keepBlue ? 2 : null);
    assert.ok(aborted);
  }
});

test('parent abort is forwarded to inflight requests and returns null without more calls', async () => {
  const controller = new AbortController();
  let calls = 0;
  let aborted = 0;
  const fetchImpl = (async (_url, init) => {
    calls++;
    return await new Promise<Response>((_, reject) => {
      init!.signal!.addEventListener('abort', () => { aborted++; reject(new Error('aborted')); }, { once: true });
      if (calls === 2) controller.abort();
    });
  }) as typeof fetch;
  assert.equal(await convertUsdToArs(1n, '2026-11-16', { fetchImpl, now, signal: controller.signal }), null);
  assert.equal(calls, 2);
  assert.equal(aborted, 2);
  assert.equal(await convertUsdToArs(1n, '2026-11-16', { fetchImpl, now, signal: controller.signal }), null);
  assert.equal(calls, 2);
});

test('total deadline aborts both initial requests without retries', async () => {
  let calls = 0;
  let aborted = 0;
  const fetchImpl = (async (_url, init) => {
    calls++;
    return await new Promise<Response>((_, reject) => {
      init!.signal!.addEventListener('abort', () => { aborted++; reject(new Error('deadline')); }, { once: true });
    });
  }) as typeof fetch;
  assert.equal(await convertUsdToArs(1n, '2026-11-16', { fetchImpl, now, totalTimeoutMs: 10 }), null);
  assert.equal(calls, 2);
  assert.equal(aborted, 2);
});

test('parent abort cancels a stalled response body, not just fetch headers', async () => {
  const controller = new AbortController();
  let calls = 0;
  let canceled = 0;
  const fetchImpl = (async () => {
    calls++;
    return new Response(new ReadableStream({
      start() { if (calls === 2) setTimeout(() => controller.abort(), 5); },
      cancel() { canceled++; },
    }));
  }) as typeof fetch;
  assert.equal(await convertUsdToArs(1n, '2026-11-16', { fetchImpl, now, signal: controller.signal }), null);
  assert.equal(calls, 2);
  assert.equal(canceled, 2);
});

test('duplicate history rows alone never satisfy the two-portal requirement', async () => {
  const f = fixture({ [B]: [blue(), blue(), blue()] });
  assert.equal(await convertUsdToArs(1n, '2026-11-16', f.options), null);
  assert.deepEqual(f.calls, [D, B, A('2026-11-16')]);
});

test('HTTP, malformed JSON and nonofficial exact-date failures stay pending', async () => {
  for (const mode of ['http', 'json', 'nonofficial']) {
    const f = fixture({ [D]: dollar(), [A('2026-11-16')]: { ...argentina(), casa: 'blue' } });
    const fetchImpl = (async (url, init) => {
      if (String(url) === B) return mode === 'json' ? new Response('{broken') : new Response('down', { status: 503 });
      return f.options.fetchImpl(url, init);
    }) as typeof fetch;
    assert.equal(await convertUsdToArs(1n, '2026-11-16', { ...f.options, fetchImpl }), null);
  }
});

test('payload byte limit and history row cap enforced, including streamed bodies', async () => {
  for (const mode of ['length', 'stream', 'rows']) {
    const f = fixture({ [D]: dollar(), [A('2026-11-16')]: null });
    let canceled = false;
    const fetchImpl = (async (url, init) => {
      if (String(url) !== B) return f.options.fetchImpl(url, init);
      if (mode === 'rows') return new Response(JSON.stringify(Array.from({ length: 513 }, () => blue())));
      if (mode === 'length') return new Response('[]', { headers: { 'content-length': '999999' } });
      return new Response(new ReadableStream({
        pull(c) { c.enqueue(new Uint8Array(300000)); },
        cancel() { canceled = true; },
      }));
    }) as typeof fetch;
    assert.equal(await convertUsdToArs(1n, '2026-11-16', { ...f.options, fetchImpl }), null);
    if (mode === 'stream') assert.ok(canceled);
  }
});
