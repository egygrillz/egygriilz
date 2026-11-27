import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../assets/calc-engine.js';
import '../assets/order-pricing.js';
import worker from '../cloudflare-worker.js';
const E = globalThis.CalcEngine;
beforeEach(() => E.reset());
const martenSpec = [
  { teeth: 1, enamel: 'single', engraving: 'medium' },
  { teeth: 1 },
  { teeth: 1, level: '2' },
  { teeth: 1, level: '4' },
];
const meta = { clientName: 'Marten', date: '2026-10-17T14:50:00Z' };
const state = (patch) => ({
  designLayers: [{ id: 'A', name: 'Set A' }],
  groups: [],
  services: [],
  gems: [],
  icedTeeth: [],
  ...patch,
});
const build = (patch) => globalThis.OrderPricing.build(state(patch), E);
const val = (x) =>
  x === null
    ? { nullValue: null }
    : Array.isArray(x)
      ? { arrayValue: { values: x.map(val) } }
      : typeof x === 'object'
        ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, val(v)])) } }
        : typeof x === 'number'
          ? { doubleValue: x }
          : typeof x === 'boolean'
            ? { booleanValue: x }
            : { stringValue: x };
const pdfText = (bytes) => Buffer.from(bytes).toString('latin1');

test('Marten: four quoted subtotals, two A4 pages, ruled total on page two', () => {
  const o = E.calculateOrder(martenSpec, { depositPct: 0 });
  assert.deepEqual(
    o.lines.map((l) => l.subtotal),
    [1650, 1000, 1100, 1250],
  );
  assert.equal(o.total, 5000);
  const bytes = E.buildQuotePdfBytes(o, meta),
    text = pdfText(bytes);
  assert.equal(E.quotePdfFilename(meta), 'EGYGRILLZ-Quotation-Marten.pdf');
  assert.deepEqual(
    Buffer.from(bytes),
    readFileSync(new URL('../examples/EGYGRILLZ-Quotation-Marten.pdf', import.meta.url)),
  );
  assert.equal((text.match(/\/MediaBox \[0 0 595.28 841.89\]/g) || []).length, 2);
  assert.match(text, /\(Quote totals\).*\(Page 1 of 2\)/s);
  assert.match(text, /\(Page 1 of 2\).*\(TOTAL\).*\(5,000 EGP\).*\(Page 2 of 2\)/s);
  E.set({ materialBase: { chrome: 12345 } });
  assert.deepEqual(E.buildQuotePdfBytes(E.savedQuoteOrder({ order: o }), meta), bytes);
});

test('FDI, mixed materials, partial ice and hand-set stones are priced once', () => {
  const base = { layerId: 'A', name: 'Set A', level: '1 Solid' };
  const { order, issues } = build({
    groups: [
      {
        ...base,
        material: 'Sterling Silver 925',
        teeth: [11, 12],
        stoneMode: 'accent',
        accentType: 'CZ',
        setting: '4-prong',
        accentCount: 2,
      },
      { ...base, material: 'Cobalt Chrome', teeth: [31], level: '2 Open face' },
    ],
    gems: [
      { designId: 'A', tooth: 12, kind: 'iced', stoneType: 'Moissanite', sizeMm: 1 },
      { designId: 'A', tooth: 12, kind: 'iced' },
      { designId: 'A', tooth: 11, kind: 'accent', stoneType: 'CZ', cut: 'round', sizeMm: 1 },
    ],
  });
  assert.deepEqual(issues, []);
  assert.equal(order.lineCount, 1);
  assert.equal(order.teethTotal, 3);
  assert.deepEqual(order.lines[0].toothIds, ['UR1', 'UR2', 'LL1']);
  const sum = (key) => order.lines[0].groups.reduce((n, g) => n + (g[key] || 0), 0);
  assert.equal(sum('accentCost'), 2 * (50 + 200));
  assert.equal(sum('fullCost'), 500 + 1000);
  assert.equal(order.servicesSubtotal, 250);
  assert.equal(order.total, 6550);
});

test('missing stone and gold rates are not silently accepted by Order', () => {
  const g = {
    layerId: 'A',
    teeth: [11],
    material: 'Gold',
    stoneMode: 'accent',
    accentType: 'Natural diamond',
  };
  assert.match(build({ groups: [g] }).issues.join(' '), /Gold rate unavailable/);
  assert.match(build({ groups: [g] }).issues.join(' '), /stone rate/);
  E.set({ goldPrice: 5000 });
  assert.deepEqual(build({ groups: [{ ...g, accentCustomPrice: 325 }] }).issues, []);
});

test('service-only estimates respect site defaults, explicit unit price and deposit zero', () => {
  E.syncServiceDefaults({ consultPrice: 850 });
  let out = build({ services: [{ type: 'consultation', qty: 2 }] });
  assert.equal(out.order.total, 1700);
  assert.equal(out.order.deposit, 850);
  assert.equal(out.order.lineCount, 0);
  out = build({ services: [{ type: 'consultation', unitPrice: 0 }], depositAuto: false, deposit: 0 });
  assert.equal(out.order.total, 0);
  assert.equal(out.order.depositManual, true);
  assert.deepEqual(out.issues, []);
  assert.match(E.describeOrder(out.order), /Agreed deposit due: 0 EGP/);
  assert.ok(build({ services: [{ type: 'fitting' }], depositAuto: false, deposit: 1 }).issues.length);
});

test('invoice imports reconcile agreement, rounding, discounts and deposit due (not paid)', () => {
  for (const total of [null, 0, 1055, 4200]) {
    const order = E.calculateOrder([{ teeth: 1, level: '3' }], {
      services: [{ type: 'custom', qty: 3, unitPrice: 42.3 }],
      timeline: 'rush',
      mold: 'normalperarch',
      discount: { type: 'pct', value: 7 },
      agreedTotal: total,
      depositAmount: 100,
    });
    const tx = E.quoteToInvoice({ id: 'quote-a', order });
    assert.equal(
      tx.items.reduce((s, i) => s + Math.round(i.price * i.qty), 0) - tx.discountAmount,
      order.total,
    );
    assert.equal(tx.depositAmount, 0);
    assert.equal(tx.depositDue, order.deposit);
    assert.equal(E.savedQuoteOrder({ order }).total, order.total);
  }
  assert.equal(E.quoteToInvoice({ total: 999 }), null);
  const clients = [
    { name: 'Marten', phone: '01100000000' },
    { name: 'Marten', phone: '01000000000' },
  ];
  assert.equal(
    E.matchQuoteClient(clients, { clientName: 'Marten', clientPhone: '+20 100 000 0000' }),
    clients[1],
  );
  assert.equal(E.matchQuoteClient(clients, { clientName: 'Marten' }), null);
  assert.equal(E.matchQuoteClient(clients, { clientName: 'Marten', clientPhone: '01200000000' }), null);
});

test('settings adapter and REST report the real source even when a forced refresh fails', async (t) => {
  const store = new Map();
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ fields: { roundTo: { integerValue: '75' } } }),
  );
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => store.get(k),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  try {
    assert.equal((await E.load(null, { force: true })).source, 'rest');
    assert.equal(E.get().roundTo, 75);
    assert.equal((await E.load()).source, 'cache');
    globalThis.fetch.mock.mockImplementation(async () => Response.json({}, { status: 503 }));
    assert.equal((await E.load(null, { force: true })).source, 'stale-cache');
    assert.equal(
      (await E.load({ _egygzGet: async () => ({ exists: true, data: { roundTo: 125 } }) }, { force: true }))
        .source,
      'firestore',
    );
    assert.equal(E.get().roundTo, 125);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test('Telegram /pdf serves the saved quotation with identical bytes, not current rates', async () => {
  const order = E.calculateOrder(martenSpec, { depositPct: 0 }),
    validDays = 14;
  const saved = {
    name: 'projects/demo-studio/databases/(default)/documents/quotes/sample',
    fields: val({ clientName: meta.clientName, createdAt: meta.date, validDays, order, total: order.total })
      .mapValue.fields,
  };
  const wanted = E.buildQuotePdfBytes(order, { ...meta, validDays });
  E.set({ materialBase: { chrome: 7000 } });
  let uploaded;
  const env = {
    FIREBASE_API_KEY: 'demo',
    TELEGRAM_CHAT_ID: '1',
    TELEGRAM_BOT_TOKEN: 'demo',
    fetchImpl: async (url, opts) => {
      if (url.includes(':runQuery')) return Response.json([{ document: saved }]);
      if (url.includes('/quotes/sample?')) return Response.json(saved);
      if (url.includes('/settings/site?')) return Response.json({ fields: {} });
      if (url.endsWith('/sendDocument')) {
        uploaded = opts.body.get('document');
        return Response.json({ ok: true });
      }
      throw new Error('Unexpected test request: ' + url);
    },
  };
  const request = new Request('https://studio.invalid/api/telegram', {
    method: 'POST',
    body: JSON.stringify({ message: { chat: { id: 1 }, text: '/pdf Marten' } }),
  });
  const res = await worker.fetch(request, env);
  assert.equal((await res.json()).pdf, true);
  assert.equal(uploaded.name, E.quotePdfFilename(meta));
  assert.deepEqual(new Uint8Array(await uploaded.arrayBuffer()), wanted);
});

test('share codes keep mixed finishes, positions, decimal rates, zero-priced services and terms', () => {
  const spec = {
    lines: [
      {
        name: 'Upper',
        toothIds: ['UR1', 'UR2', 'UL2'],
        groups: [
          {
            material: 'silver',
            teeth: 2,
            toothIds: ['UR1', 'UR2'],
            enamel: 'multi',
            plating: 'blackgold',
            accent: {
              type: 'natural',
              customPrice: 123.45,
              count: 2,
              setting: 'twoprong',
              cut: 'pear',
              size: '2.5',
            },
            full: { type: 'labgrown', customPrice: 0, coverage: 'micropave', cut: 'oval', size: '1.5' },
          },
          { material: 'gold', teeth: 1, karat: '18', goldPrice: 4300.75, toothIds: ['UL2'] },
        ],
      },
      { material: 'titanium', teeth: 1, anodize: 'multi' },
    ],
    services: [
      { type: 'custom', name: 'Waived', qty: 1, unitPrice: 0 },
      { type: 'shipping', qty: 2, unitPrice: 75 },
    ],
    discount: { type: 'pct', value: 5 },
    depositPct: 30,
  };
  const decoded = E.decodeCode(E.encodeCode(spec));
  assert.deepEqual(decoded.lines.map(E.cleanLineSpec), spec.lines.map(E.cleanLineSpec));
  assert.deepEqual(
    decoded.services.map((s) => [s.type, s.unitPrice]),
    [
      ['custom', 0],
      ['shipping', 75],
    ],
  );
  const issued = E.calculateOrder(spec.lines, spec),
    restored = E.calculateOrder(decoded.lines, decoded);
  for (const k of [
    'teethTotal',
    'linesSubtotal',
    'servicesSubtotal',
    'discountAmount',
    'deposit',
    'balance',
    'total',
  ])
    assert.equal(restored[k], issued[k], k);
});

test('Worker reports issued zeros, studio rounding/deposit, and compares only saved design specs', async () => {
  const p = { materialBase: { chrome: 1234 }, roundTo: 0, depositPct: 0, goldPrice: 5000 };
  const invoice = {
    clientName: 'Fixture',
    total: 0,
    items: [
      { name: 'Design', qty: 2, price: 0, line: { teeth: 1, material: 'chrome', enamel: 'single' } },
      { name: 'Legacy service', price: 0, subtotal: 300 },
    ],
  };
  const quote = { clientName: 'Fixture', order: { total: 0 }, total: 9000 };
  let sent = '';
  const env = {
    FIREBASE_API_KEY: 'test',
    TELEGRAM_CHAT_ID: '1',
    TELEGRAM_BOT_TOKEN: 'test',
    fetchImpl: async (url, opts) => {
      if (url.includes(':runQuery')) {
        const col = JSON.parse(opts.body).structuredQuery.from[0].collectionId;
        return Response.json([
          {
            document: {
              name: `${col}/test`,
              fields: val(col === 'quotes' ? quote : invoice).mapValue.fields,
            },
          },
        ]);
      }
      if (url.includes('/settings/pricing?')) return Response.json({ fields: val(p).mapValue.fields });
      if (url.includes('gold-api.com') || url.includes('jsdelivr.net'))
        return new Response(null, { status: 503 });
      if (url.endsWith('/sendMessage')) {
        sent = JSON.parse(opts.body).text;
        return Response.json({ ok: true });
      }
      throw Error('Unexpected request ' + url);
    },
  };
  async function command(text) {
    sent = '';
    await worker.fetch(
      new Request('https://studio.invalid/api/telegram', {
        method: 'POST',
        body: JSON.stringify({ message: { chat: { id: 1 }, text } }),
      }),
      env,
    );
    return sent;
  }
  assert.match(await command('/quote Fixture'), /Total:\s+0 EGP/);
  const rates = await command('/calc');
  assert.match(rates, /Rounding:\s+0 EGP/);
  assert.match(rates, /Deposit:\s+0%/);
  assert.match(rates, /5,000 EGP\/g 24K \(stored, not live\)/);
  const report = await command('/invoice Fixture');
  assert.match(report, /Saved:\s+0 EGP/);
  assert.match(report, /0 → 1,434 EGP × 2/);
  assert.match(report, /Legacy service\s+0 EGP \(saved only\)/);
  assert.match(report, /difference: 2,868 EGP/);
  assert.equal(E.get().materialBase.chrome, 1000, 'Worker settings must remain request-local');
});
