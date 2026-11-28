import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import worker from '../cloudflare-worker.js';
import '../assets/order-pricing.js';
import '../assets/order-file.js';
import '../assets/order-design.js';
import '../assets/order-email.js';
const E = globalThis.CalcEngine,
  id = 'EGZ-261127-ABCDEF012345',
  version = 'a9679897-9035-4e05-9b09-5df477ed3b0c',
  url = `https://worker.test/api/orders/${id}/email?version=${version}`;
const order = E.calculateOrder([], { services: [{ type: 'custom', name: 'Mold', unitPrice: 800 }] }),
  q = {
    sheetId: id,
    orderNo: id,
    clientEmail: 'recipient@example.test',
    clientName: '',
    order,
    total: order.total,
    createdAt: '2026-11-27T11:00:00Z',
    deliveryVersion: version,
    status: 'draft',
    payments: [{ amount: 130 }],
  };
test('client draft links encode one recipient and a personal message, never private links, notes or a submission', () => {
  const to = 'desk+fitting@example.test',
    name = 'Nour & ليلى';
  const links = OrderEmail.compose({
    ...q,
    clientEmail: to,
    clientName: name,
    notes: 'PRIVATE-NOTES',
    token: 'PRIVATE-TOKEN',
  });
  const g = new URL(links.gmail),
    m = new URL(links.mailto);
  assert.equal(g.origin + g.pathname, 'https://mail.google.com/mail/');
  assert.deepEqual([...g.searchParams.keys()].sort(), ['body', 'fs', 'su', 'tf', 'to', 'view']);
  assert.equal(g.searchParams.get('view'), 'cm');
  assert.equal(g.searchParams.get('to'), to);
  assert.match(g.searchParams.get('su'), new RegExp(id));
  assert.ok(g.searchParams.get('body').includes('Hello ' + name));
  assert.ok(g.searchParams.get('body').includes(id));
  assert.equal(m.protocol, 'mailto:');
  assert.equal(decodeURIComponent(m.pathname), to);
  assert.equal(m.searchParams.get('subject'), g.searchParams.get('su'));
  assert.equal(m.searchParams.get('body').replaceAll('\r\n', '\n'), g.searchParams.get('body'));
  assert.doesNotMatch(decodeURIComponent(links.gmail), /order-sheet|editx|sheet=|PRIVATE-|file:|data:/i);
  for (const bad of [
    '',
    'one@test',
    'one@test.com,two@test.com',
    'one@test.com\nBcc:b@test.com',
    'a'.repeat(250) + '@a.test',
  ]) {
    assert.equal(OrderEmail.validRecipient(bad), false);
    assert.throws(() => OrderEmail.compose({ ...q, clientEmail: bad }));
  }
});
test('retired order email endpoint performs no external fetch, even with old bindings and a signed-in caller', async () => {
  let calls = 0;
  const env = {
    RESEND_KEY: 'fixture',
    RESEND_FROM: 'studio@example.test',
    fetchImpl: () => {
      calls++;
      throw Error('Unexpected fetch');
    },
  };
  for (const headers of [{}, { Authorization: 'Bearer fixture', 'Content-Type': 'application/pdf' }]) {
    const res = await worker.fetch(
      new Request(url, { method: 'POST', headers, body: '%PDF-1.4\n%%EOF' }),
      env,
    );
    assert.equal(res.status, 410);
    assert.deepEqual(await res.json(), { ok: false, error: 'manual-draft-only' });
  }
  assert.equal(calls, 0);
});
test('the committed Dashboard file is the reproducible builder output and runs without any sibling modules', async () => {
  const path = new URL('../worker.js', import.meta.url),
    bytes = readFileSync(path);
  const built = execFileSync(process.execPath, [
    fileURLToPath(new URL('../scripts/build-worker.mjs', import.meta.url)),
  ]);
  assert.ok(bytes.equals(built), 'Refresh with node scripts/build-worker.mjs > worker.js');
  // Relative imports cannot resolve from a data: URL. Start the module the way
  // Dashboard does, as one file, and exercise the embedded pricing engine too.
  delete globalThis.CalcEngine;
  try {
    const { default: dashboard } = await import('data:text/javascript;base64,' + bytes.toString('base64'));
    assert.equal(typeof dashboard.scheduled, 'function');
    const health = await (await dashboard.fetch(new Request('https://worker.test/api/health'), {})).json();
    assert.equal(health.orderEmailMode, 'manual-draft');
    assert.equal(health.endpoints.order_email, undefined);
    assert.equal((await dashboard.fetch(new Request(url, { method: 'POST' }), {})).status, 410);
    assert.deepEqual(globalThis.CalcEngine.buildQuotePdfBytes(order, q), E.buildQuotePdfBytes(order, q));
    assert.notEqual(globalThis.CalcEngine, E);
  } finally {
    globalThis.CalcEngine = E;
  }
});
test('compact editable files omit raster/PDF data; same-client and nameless orders have distinct names', () => {
  const s = {
    orderNo: id,
    date: '2026-11-27',
    ink: [{ points: [{ x: 10.2345, y: 20.567 }] }],
    signature: 'data:image/png;base64,image',
    printPreview: 'data:application/pdf;base64,pdf',
    signatureLines: [[200, 350, 301, 356]],
  };
  const str = OrderFile.pack(s);
  assert.doesNotMatch(str, /data:|base64/);
  const opened = OrderFile.unpack(str);
  assert.deepEqual(opened.ink[0].points, [{ x: 10.23, y: 20.57 }]);
  assert.deepEqual(opened.signatureLines, s.signatureLines);
  assert.equal(OrderFile.label(s), '2026-11-27 · ' + id);
  assert.notEqual(E.quotePdfFilename({ ...q, orderNo: id + '1' }), E.quotePdfFilename(q));
  assert.match(E.quotePdfFilename(q), /2026-11-27-EGZ-/);
  assert.notEqual(E.quotePdfFilename({ clientName: 'Same' }), E.quotePdfFilename({ clientName: 'Same' }));
  const tr = E.quoteToInvoice(q);
  assert.equal(tr.depositAmount, 130);
  assert.equal(tr.depositDue, 400);
  assert.equal(E.quoteToInvoice({ ...q, payments: [] }).depositAmount, 0);
});
test('mold as a studio service reads EditX rates, quantity and explicit zero; never charged twice', () => {
  const engine = E.withSettings({ moldFlat: { normalperarch: 375, digitalfullmouth: 1620 }, roundTo: 1 });
  const s = { type: 'mold:normalperarch', qty: 2 },
    build = (svc) => OrderPricing.build({ groups: [], services: [svc] }, engine).order;
  assert.equal(build(s).total, 750);
  assert.equal(build(s).moldCost, 0);
  assert.equal(build(s).services[0].unitPrice, 375);
  engine.set({ moldFlat: { normalperarch: 0 } });
  assert.equal(build(s).total, 0);
  assert.equal(build({ ...s, type: 'mold:digitalfullmouth', unitPrice: 0 }).total, 0);
});
