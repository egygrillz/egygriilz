import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare-worker.js';
const E = globalThis.CalcEngine;
const ref = (n) => `EGZ-261127-${String(n).padStart(12, '0')}`;
const id = ref(22),
  doc = (col, id, data) => ({ name: `${col}/${id}`, fields: val(data).mapValue.fields });
function val(x) {
  if (Array.isArray(x)) return { arrayValue: { values: x.map(val) } };
  if (typeof x === 'object')
    return { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, val(v)])) } };
  if (typeof x === 'number') return { integerValue: String(x) };
  if (typeof x === 'boolean') return { booleanValue: x };
  return { stringValue: x };
}
let run = 0;
function bot(route) {
  const calls = [],
    messages = [],
    files = [];
  const env = {
    FIREBASE_API_KEY: 'demo',
    STAFF_EMAIL: 'studio@example.test',
    STAFF_PASSWORD: 'test-password-' + ++run,
    TELEGRAM_CHAT_ID: '42',
    TELEGRAM_BOT_TOKEN: 'test',
    TELEGRAM_WEBHOOK_SECRET: 'test-secret',
    fetchImpl: async (url, init) => {
      calls.push(url);
      if (url.includes('signInWithPassword'))
        return Response.json({ idToken: 'test-id-token', expiresIn: '3600' });
      if (url.endsWith('/sendMessage')) {
        messages.push(JSON.parse(init.body));
        return Response.json({ ok: true });
      }
      if (url.endsWith('/sendDocument')) {
        files.push(init.body.get('document'));
        return Response.json({ ok: true });
      }
      if (url.startsWith('https://firestore.googleapis.com')) {
        assert.equal(init.headers.Authorization, 'Bearer test-id-token');
        assert.ok(!url.includes('/data/current'), 'order summaries should never read drawings');
      }
      return route(url, init);
    },
  };
  const post = async (text, chat = 42, secret = 'test-secret') =>
    worker.fetch(
      new Request('https://worker.test/api/telegram', {
        method: 'POST',
        headers: { 'X-Telegram-Bot-Api-Secret-Token': secret },
        body: JSON.stringify({ message: { chat: { id: chat }, text } }),
      }),
      env,
    );
  const say = async (text, chat) => {
    const res = await post(text, chat);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
    return messages.at(-1)?.text || '';
  };
  return { env, calls, messages, files, say, post };
}
const header = (n, name, issued = true) =>
  doc('order_sheets', ref(n), {
    label: name + ' · ' + ref(n),
    quoteId: issued ? ref(n) : '',
    updatedAt: '2026-11-27',
  });

test('no bot reads for a wrong chat/webhook or absent chat; bootstrapping /id needs no studio credentials', async () => {
  const b = bot(() => assert.fail('No database reads allowed'));
  assert.equal((await b.post('/receipts ' + id, 42, 'wrong')).status, 401);
  assert.match(await b.say('/outstanding', 77), /private/);
  delete b.env.TELEGRAM_CHAT_ID;
  assert.equal((await (await b.post('/sheets')).json()).error, 'studio-chat-not-configured');
  assert.match(await b.say('/id'), /42/);
  b.env.TELEGRAM_CHAT_ID = '42';
  delete b.env.STAFF_PASSWORD;
  assert.match(await b.say('/sheets'), /STAFF_EMAIL, STAFF_PASSWORD/);
  assert.ok(b.calls.every((u) => u.endsWith('/sendMessage')));
});
test('recent sheets use updatedAt headers, disambiguate the client, preserve draft state and mould aliases', async () => {
  const headers = [header(22, 'Same customer'), header(21, 'Same customer', false)];
  const b = bot((url, init) => {
    if (url.includes(':runQuery')) {
      const q = JSON.parse(init.body).structuredQuery;
      if (q.from[0].collectionId === 'mould_orders') return Response.json([]);
      assert.equal(q.from[0].collectionId, 'order_sheets');
      assert.equal(q.orderBy[0].field.fieldPath, 'updatedAt');
      assert.deepEqual(
        q.select.fields.map((x) => x.fieldPath),
        ['label', 'quoteId', 'updatedAt'],
      );
      return Response.json(headers.map((document) => ({ document })));
    }
    const u = new URL(url);
    assert.ok(u.pathname.endsWith('/order_sheets/' + ref(21)));
    assert.deepEqual(u.searchParams.getAll('mask.fieldPaths'), ['label', 'quoteId', 'updatedAt']);
    return Response.json(headers[1]);
  });
  assert.match(await b.say('/sheets'), /RECENT.*quotation saved.*unpriced draft/s);
  assert.match(await b.say('/sheet Same'), /choose a reference/);
  assert.match(await b.say('/sheet@studio_test_bot ' + ref(21).toLowerCase()), /Draft — no quotation/);
  assert.deepEqual(
    b.messages.at(-1).reply_markup.inline_keyboard[0][0].url,
    'https://egygrillz.com/order-sheet.html?sheet=' + ref(21),
  );
  assert.match(await b.say('/sheet missing'), /No match in the latest 80/);
  assert.match(await b.say('/orders all'), /mould/i);
  assert.match(await b.say('/order'), /mould kit order/);
  assert.match(await b.say('/help'), /\/sheets.*\/receipts.*\/outstanding/s);
});
test('outstanding pages report only issued sheets using receipts, not the requested deposit or copied invoices', async () => {
  const rows = Array.from({ length: 21 }, (_, i) => {
    const n = 22 - i,
      total = 5000;
    return doc('quotes', ref(n), {
      sheetId: ref(n),
      order: { total, deposit: 1200 },
      payments: [{ amount: n === 22 ? 850 : n === 2 ? 0 : 5000 }],
    });
  });
  let lastQ;
  const b = bot((url, opts) => {
    assert.ok(url.includes(':runQuery'));
    const q = (lastQ = JSON.parse(opts.body).structuredQuery);
    assert.equal(q.from[0].collectionId, 'quotes');
    assert.equal(q.orderBy[0].field.fieldPath, 'sheetId');
    assert.ok(q.select.fields.some((x) => x.fieldPath === 'payments'));
    assert.equal(q.limit, 21);
    if (q.startAt) assert.deepEqual(q.startAt, { values: [{ stringValue: ref(3) }], before: false });
    return Response.json((q.startAt ? rows.slice(20) : rows).map((document) => ({ document })));
  });
  const first = await b.say('/outstanding');
  assert.match(first, /paid 850 \/ due 4,150 EGP/);
  assert.match(first, /1 outstanding of 20 checked on this page/);
  assert.ok(first.includes('Next: /outstanding ' + ref(3)));
  const second = await b.say('/outstanding ' + ref(3));
  assert.match(second, /1 outstanding of 1 checked on this page · 5,000 EGP/);
  assert.match(second, /End of order ledger/);
  assert.ok(lastQ.startAt);
});
test('exact /pdf fetches the issued snapshot by ID even outside the recent list; /sheet reports earlier email accurately', async () => {
  const order = E.calculateOrder([], { services: [{ type: 'custom', name: 'Mold', unitPrice: 5000 }] }),
    q = {
      sheetId: id,
      orderNo: id,
      clientName: 'Example',
      validDays: 14,
      issuedAt: '2026-11-27T10:00:00Z',
      order,
      deliveryVersion: 'v2',
      emailedVersion: 'v1',
      emailedAt: '2026-11-26',
      payments: [{ amount: 850, method: 'Cash', at: '2026-11-27' }],
    };
  const b = bot((url) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/order_sheets/' + id)) return Response.json(header(22, 'Example'));
    if (u.pathname.endsWith('/settings/site')) return Response.json({ fields: {} });
    assert.ok(u.pathname.endsWith('/quotes/' + id));
    return Response.json(doc('quotes', id, q));
  });
  assert.match(await b.say('/sheet ' + id), /earlier version was submitted/);
  assert.equal((await (await b.post('/pdf ' + id.toLowerCase())).json()).pdf, true);
  assert.deepEqual(
    new Uint8Array(await b.files[0].arrayBuffer()),
    E.buildQuotePdfBytes(order, { ...q, date: q.issuedAt }),
  );
  assert.equal(b.files[0].name, E.quotePdfFilename(q));
  assert.ok(!b.calls.some((u) => u.includes(':runQuery')));
});
test('invoice report subtracts receipts from each invoice, excludes paid/cancelled; rates include EditX mold overrides', async () => {
  const b = bot((url, opts) => {
    if (url.includes(':runQuery')) {
      assert.equal(JSON.parse(opts.body).structuredQuery.from[0].collectionId, 'invoices');
      return Response.json(
        [
          { total: 1000, deposit: 300 },
          { total: 3333, deposit: 700 },
          { total: 600, status: 'paid' },
          { total: 850, status: 'cancelled' },
        ].map((d, i) => ({ document: doc('invoices', 'i' + i, d) })),
      );
    }
    if (url.includes('/settings/pricing?'))
      return Response.json(
        doc('settings', 'pricing', { moldFlat: { normalperarch: 0, digitalfullmouth: 1620 } }),
      );
    return new Response(null, { status: 503 }); // market feeds offline
  });
  const out = await b.say('/unpaid');
  assert.match(out, /2 unpaid of 4/);
  assert.match(out, /700 EGP due/);
  assert.match(out, /2,633 EGP due/);
  assert.match(out, /balance in this list: 3,333 EGP/);
  assert.match(await b.say('/rates'), /Normal per arch: 0 EGP.*Digital full mouth: 1,620 EGP/s);
});
test('health reports configuration only; diagnostics never equate a failed order read with empty records or expose them', async () => {
  const cols = [];
  const b = bot((url, opts) => {
    const q = JSON.parse(opts.body).structuredQuery,
      col = q.from[0].collectionId;
    cols.push(col);
    if (col === 'quotes') return new Response('private-fixture-detail', { status: 403 });
    assert.equal(q.limit, 1);
    assert.deepEqual(q.select.fields, [{ fieldPath: '__name__' }]);
    return Response.json([{ document: doc(col, 'must-not-appear', { clientName: 'private-fixture' }) }]);
  });
  const get = async (path) =>
    (await worker.fetch(new Request('https://worker.test/api/' + path), b.env)).json();
  assert.equal((await get('health')).channels.order_email, false);
  Object.assign(b.env, { RESEND_KEY: 'secret-test-key', RESEND_FROM: 'example@example.test' });
  const health = await get('health');
  assert.equal(health.channels.order_email, true);
  assert.doesNotMatch(JSON.stringify(health), /secret-test-key|example@example\.test/);
  const check = await get('telegram/check');
  assert.equal(check.ok, false);
  assert.equal(check.collection, 'quotes');
  assert.equal(check.error, 'permission-denied');
  assert.deepEqual(cols, ['appointments', 'order_sheets', 'quotes']);
  assert.doesNotMatch(JSON.stringify(check), /private-fixture|must-not-appear|test-id-token/);
  assert.match(await b.say('/outstanding'), /refusing to let me read/);
});

test('a refused Telegram message is not reported as a successful order report', async () => {
  const b = bot(() => Response.json([]));
  const f = b.env.fetchImpl;
  b.env.fetchImpl = (url, init) =>
    url.endsWith('/sendMessage') ? Response.json({ ok: false }, { status: 403 }) : f(url, init);
  const r = await (await b.post('/outstanding')).json();
  assert.equal(r.ok, false);
  assert.equal(r.error, 'telegram-send-failed');
});
