import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare-worker.js';
import '../assets/order-pricing.js';
import '../assets/order-file.js';
import '../assets/order-design.js';
const E = globalThis.CalcEngine,
  id = 'EGZ-261127-ABCDEF012345',
  version = 'a9679897-9035-4e05-9b09-5df477ed3b0c',
  url = `https://worker.test/api/orders/${id}/email?version=${version}`;
const val = (x) =>
  x == null
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
const sheet = '%PDF-1.4\norder bytes\n%%EOF';
function fixture(opts = {}) {
  const calls = [];
  let receipt;
  const env = {
    STAFF_EMAIL: 'not-used',
    STAFF_PASSWORD: 'not-used',
    RESEND_KEY: 'fixture',
    RESEND_FROM: 'studio@example.test',
    fetchImpl: async (url, init) => {
      calls.push([url, init]);
      if (url.startsWith('https://firestore.googleapis.com/')) {
        assert.equal(init.headers.Authorization, 'Bearer fake');
        assert.ok(url.includes(`/quotes/${id}`));
        if (init.method === 'PATCH') {
          receipt = JSON.parse(init.body);
          assert.ok(url.includes('currentDocument.updateTime='));
          return Response.json({}, { status: opts.patch || 200 });
        }
        return Response.json(
          { fields: val({ ...q, ...opts.q }).mapValue.fields, updateTime: '2026-11-27T12:00:00Z' },
          { status: opts.db || 200 },
        );
      }
      assert.equal(url, 'https://api.resend.com/emails');
      return Response.json({ id: 'test-message' }, { status: opts.mail || 200 });
    },
  };
  async function send(extra = {}, body = sheet) {
    const req = new Request(url, {
      method: 'POST',
      body,
      headers: { Authorization: 'Bearer fake', 'Content-Type': 'application/pdf', ...extra },
    });
    return worker.fetch(req, env);
  }
  return { env, calls, send, receipt: () => receipt };
}
test('only the signed-in caller can email a saved current order; no service-account fallback', async () => {
  const a = fixture();
  assert.equal((await worker.fetch(new Request(url), a.env)).status, 405);
  assert.equal((await a.send({ Authorization: '' })).status, 401);
  assert.equal((await a.send({ Origin: 'https://bad.invalid' })).status, 403);
  assert.equal(a.calls.length, 0);
  for (const [opts, code] of [
    [{ db: 403 }, 403],
    [{ q: { deliveryVersion: 'new' } }, 409],
    [{ q: { sheetId: 'other' } }, 409],
    [{ q: { clientEmail: 'first@test.com, second@test.com' } }, 422],
  ]) {
    const f = fixture(opts);
    assert.equal((await f.send()).status, code);
    assert.equal(f.calls.length, 1);
  }
});
test('missing sender, invalid or oversized attachments, and provider failure never mark emailed', async () => {
  const f = fixture();
  delete f.env.RESEND_FROM;
  assert.equal((await f.send()).status, 503);
  const bad = fixture();
  assert.equal((await bad.send({}, 'not a PDF')).status, 400);
  assert.equal((await bad.send({ 'Content-Length': String(7 * 1024 * 1024) })).status, 413);
  assert.equal(bad.calls.length, 2);
  const unavailable = fixture({ mail: 422 });
  assert.equal((await unavailable.send()).status, 502);
  assert.equal(unavailable.receipt(), undefined);
});
test('email has the real order attachment and immutable saved quotation; duplicate and unrecorded outcomes', async () => {
  const f = fixture();
  assert.equal((await f.send()).status, 200);
  assert.equal(f.calls.length, 3);
  const init = f.calls[1][1],
    msg = JSON.parse(init.body);
  assert.deepEqual(msg.to, [q.clientEmail]);
  assert.equal(init.headers['Idempotency-Key'], `studio-order/${id}/${version}`);
  const [production, quotation] = msg.attachments;
  assert.equal(production.filename, E.documentFilename('Order', q));
  assert.equal(Buffer.from(production.content, 'base64').toString(), sheet);
  assert.equal(quotation.filename, E.quotePdfFilename(q));
  assert.deepEqual(Buffer.from(quotation.content, 'base64'), Buffer.from(E.buildQuotePdfBytes(order, q)));
  assert.match(
    Buffer.from(quotation.content, 'base64').toString(),
    /Amount received.*130 EGP.*Outstanding today.*670 EGP/s,
  );
  assert.deepEqual(f.receipt().fields.emailedVersion, { stringValue: version });
  assert.ok(!JSON.stringify(f.receipt()).includes('attachment'));
  const again = fixture({ q: { emailedVersion: version } });
  assert.equal((await (await again.send()).json()).alreadySubmitted, true);
  assert.equal(again.calls.length, 1);
  const partial = fixture({ patch: 409 });
  assert.deepEqual(await (await partial.send()).json(), { ok: true, recorded: false });
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
