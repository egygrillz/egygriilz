import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/order-design.js';
import '../assets/order-pricing.js';
import '../assets/calc-engine.js';
import worker from '../cloudflare-worker.js';

const D = globalThis.OrderDesign,
  E = globalThis.CalcEngine;
test('only reviewed details price the design; marks and unfinished layers cannot change a quote', () => {
  E.reset();
  const layer = {
    id: 'L',
    name: 'Top',
    mode: 'single',
    teeth: [11, 12],
    materials: { 11: 'silver', 12: 'silver' },
    details: { all: { engraving: 'Medium', accentType: 'CZ', setting: '4-Prong' } },
  };
  const state = { ink: [], gems: [], icedTeeth: [], groups: [], services: [] };
  const review = () => D.compile(layer, D.inspect(state, layer));
  const build = () => OrderPricing.build(state, E).order;
  assert.equal(build().lineCount, 0);
  state.groups = review().map((g) => ({ ...g, layerId: 'L' }));
  const base = build();
  assert.equal(base.teethTotal, 2);
  state.ink.push(
    { designId: 'L', tooth: 11, effect: 'enamel', colors: ['#aa0000', '#112233'] },
    { designId: 'L', tooth: 11, effect: 'laser', touchedTeeth: [11, 12] },
  );
  state.gems.push({
    designId: 'L',
    tooth: 12,
    kind: 'placed',
    stoneType: 'Natural diamond',
    customPrice: 999999,
    cut: 'pear',
    color: 'black',
    sizeMm: 2,
  });
  assert.deepEqual(build(), base); // even a forged raw stone price has no effect
  const next = review();
  assert.equal(next.length, 2);
  assert.equal(next[0].enamel, 'Multi-colour');
  assert.equal(next[1].enamel, 'None');
  assert.equal(next[1].engraving, 'Medium');
  assert.equal(next[1].pricedStones[0].stoneType, 'CZ');
  assert.equal(next[1].pricedStones[0].count, 1);
  state.groups = next.map((g) => ({ ...g, layerId: 'L' }));
  assert.ok(build().total > base.total);
  assert.equal(build().services.length, 1);
  state.ink = [];
  state.gems = [];
  const plain = review()[0];
  assert.equal(plain.enamel, 'None');
  assert.equal(plain.engraving, 'None');
  assert.deepEqual(plain.pricedStones, []);
});
test('enamel uses distinct visible colours; single vs mix, replacement fill and partial ice', () => {
  const layer = {
    id: 'p',
    name: 'Palette',
    mode: 'single',
    teeth: [11, 12, 13],
    materials: { 11: 'silver', 12: 'silver', 13: 'silver' },
    details: {},
  };
  const colors = ['#112233', '#445566', '#778899', '#abcdef', '#eeeedd'];
  const state = {
    ink: [],
    gems: [{ designId: 'p', kind: 'iced', tooth: 12, cut: 'round', sizeMm: 2 }],
    icedTeeth: [{ designId: 'p', tooth: 12, count: 91 }],
  };
  const fill = (tooth, colors) => state.ink.push({ designId: 'p', tooth, effect: 'enamel', colors });
  const spec = (t) => D.compile(layer, D.inspect(state, layer)).find((g) => g.teeth.includes(t));
  for (let n = 1; n <= 5; n++) {
    fill(11, colors.slice(0, n));
    assert.equal(
      spec(11).enamel,
      ['Single colour', 'Multi-colour', 'Master work', 'Master work', 'Master work'][n - 1],
    );
  }
  fill(11, ['#112233', '#112233']);
  assert.equal(spec(11).enamel, 'Single colour');
  fill(12, ['#445566']);
  assert.equal(spec(11).enamel, 'Multi-colour');
  assert.equal(spec(13).enamel, 'None');
  layer.mode = 'mix';
  layer.details = {
    12: { level: '4 Complex', plating: 'Black gold', diamondType: 'Lab-grown diamond', fullCustomPrice: 0 },
  };
  assert.equal(spec(11).enamel, 'Single colour');
  assert.equal(spec(11).stoneMode, 'none');
  assert.equal(spec(12).stoneMode, 'full');
  assert.equal(spec(12).fullCustomPrice, 0);
  assert.equal(spec(12).level, '4 Complex');
});
const doc = (fields) => ({
  document: {
    name: 'projects/demo/databases/(default)/documents/appointments/example',
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { stringValue: v }])),
  },
});
const manual = (headers = {}, method = 'POST') =>
  new Request('https://studio.invalid/api/remind', {
    method,
    headers: { Origin: 'https://egygrillz.com', ...headers },
  });
function backend(rows = [], overrides = {}) {
  const calls = [],
    messages = [],
    dates = [],
    tokens = [];
  const env = {
    FIREBASE_API_KEY: 'fixture',
    STAFF_EMAIL: 'admin@example.test',
    STAFF_PASSWORD: 'fixture',
    TELEGRAM_BOT_TOKEN: 'fixture',
    TELEGRAM_CHAT_ID: 'studio',
    ...overrides,
    fetchImpl: async (url, opts = {}) => {
      calls.push(String(url));
      if (url.includes('signInWithPassword')) return Response.json({ idToken: 'cron-user' });
      if (url.includes(':runQuery')) {
        const q = JSON.parse(opts.body).structuredQuery;
        assert.equal(q.from[0].collectionId, 'appointments');
        dates.push(q.where.fieldFilter.value.stringValue);
        tokens.push(opts.headers.Authorization);
        if (opts.headers.Authorization === 'Bearer denied') return new Response('', { status: 403 });
        return Response.json(rows);
      }
      if (url.endsWith('/getWebhookInfo'))
        return Response.json({ ok: true, result: { url: 'https://studio.invalid/hook' } });
      if (url.endsWith('/sendMessage')) {
        const body = JSON.parse(opts.body);
        assert.equal(body.chat_id, 'studio');
        assert.ok(body.text.length <= 4096);
        messages.push(body.text);
        return Response.json({ ok: true });
      }
      throw Error('Unexpected test request');
    },
  };
  return { calls, messages, dates, tokens, env };
}
test('Cairo noon based on scheduled time in winter and summer; no false empty on a missed/late poll', async () => {
  for (const [at, expected] of [
    ['2026-12-31T10:00:00Z', '2027-01-01'],
    ['2026-06-22T09:00:00Z', '2026-06-23'],
  ]) {
    const b = backend();
    let registered;
    const out = await worker.scheduled({ scheduledTime: Date.parse(at) }, b.env, {
      waitUntil: (p) => (registered = p),
    });
    assert.equal((await registered).digest.ok, true);
    assert.equal(out.digest.date, expected);
    assert.deepEqual(b.dates, [expected]);
    assert.deepEqual(b.tokens, ['Bearer cron-user']);
    assert.match(b.messages[0], /No appointments/);
  }
  const b = backend();
  const out = await worker.scheduled({ scheduledTime: Date.parse('2026-06-22T10:00:00Z') }, b.env);
  assert.equal(out.digest.skipped, true);
  assert.equal(b.messages.length, 0);
  assert.deepEqual(b.dates, []);
});
test('manual Telegram uses Firestore as caller, not server credentials; no reads/sends for anonymous GET or POST', async () => {
  const b = backend([
    doc({ name: 'Evening', time: '08:00 PM' }),
    doc({ name: 'Cancelled', status: 'cancelled' }),
    doc({ name: 'Morning', time: '09:00 AM' }),
  ]);
  assert.equal((await worker.fetch(manual({}, 'GET'), b.env)).status, 405);
  assert.equal((await worker.fetch(manual(), b.env)).status, 401);
  assert.equal(b.calls.length, 0);
  const bad = await worker.fetch(manual({ Authorization: 'Bearer denied' }), b.env);
  assert.equal(bad.status, 403);
  assert.deepEqual(b.tokens, ['Bearer denied']);
  assert.equal(b.messages.length, 0);
  const res = await worker.fetch(manual({ Authorization: 'Bearer owner' }), b.env);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://egygrillz.com');
  const d = await res.json();
  assert.equal(d.found, 2);
  assert.equal(d.ok, true);
  assert.ok(!JSON.stringify(d).includes('Morning'));
  assert.equal(b.tokens.at(-1), 'Bearer owner');
  assert.match(b.messages[0], /Morning[\s\S]*Evening/);
  assert.doesNotMatch(b.messages[0], /Cancelled/);
  assert.ok(!b.calls.some((url) => url.includes('signInWithPassword')));
});
test('long digests split; a failed part, missing bindings or malformed Firestore data never report delivery', async () => {
  const b = backend(
    Array.from({ length: 80 }, (_, i) => doc({ name: 'Synthetic ' + i, service: 's'.repeat(150) })),
    { CRON_SECRET: 'op' },
  );
  const base = b.env.fetchImpl;
  b.env.fetchImpl = async (url, o) =>
    url.endsWith('/sendMessage') && b.messages.length === 1
      ? Response.json({ ok: false, error_code: 429 }, { status: 429 })
      : base(url, o);
  const r = await worker.fetch(manual({ 'X-Cron-Key': 'op' }), b.env);
  assert.equal(r.status, 502);
  const d = await r.json();
  assert.equal(d.error, 'telegram-429');
  assert.equal(d.sent, 1);
  assert.ok(d.parts > 1);
  b.env.fetchImpl = base;
  const retry = await (await worker.fetch(manual({ 'X-Cron-Key': 'op' }), b.env)).json();
  assert.equal(retry.sent, retry.parts);
  assert.ok(retry.ok);
  assert.match(b.messages.at(-1), /Synthetic 79/);
  b.env.TELEGRAM_CHAT_ID = '';
  const cfg = await (await worker.fetch(manual({ Authorization: 'Bearer owner' }), b.env)).json();
  assert.equal(cfg.error, 'telegram-not-configured');
  b.env.fetchImpl = async () => new Response('not a JSON array');
  const broken = await (await worker.fetch(manual({ Authorization: 'Bearer owner' }), b.env)).json();
  assert.equal(broken.ok, false);
  assert.equal(broken.error, 'invalid-query-response');
  const noLogin = backend([], { STAFF_PASSWORD: '', CRON_SECRET: 'op' });
  assert.equal(
    (await (await worker.fetch(manual({ 'X-Cron-Key': 'op' }), noLogin.env)).json()).error,
    'staff-login-required',
  );
  assert.equal(noLogin.calls.length, 0);
});
test('booking notification honours Turnstile and records Telegram acknowledgement separately from booking', async () => {
  const b = backend();
  const env = { ...b.env, TURNSTILE_SECRET: 'fixture' };
  const f = env.fetchImpl;
  env.fetchImpl = (url, o) =>
    url.includes('siteverify') ? Response.json({ success: o.body.get('response') === 'passed' }) : f(url, o);
  const notify = async (token) =>
    worker.fetch(
      new Request('https://studio.invalid/api/notify', {
        method: 'POST',
        body: JSON.stringify({
          type: 'booking',
          turnstile: token,
          data: { name: 'Synthetic booking', phone: '01000000000', date: '2027-01-01' },
        }),
      }),
      env,
    );
  assert.equal((await notify('')).status, 403);
  assert.equal(b.messages.length, 0);
  const d = await (await notify('passed')).json();
  assert.equal(d.channels.find((x) => x.c === 'telegram')?.ok, true);
  assert.match(b.messages[0], /NEW BOOKING/);
});
test('a broken scheduled delivery fails the cron, and polling encodes Telegram allowed_updates as JSON', async () => {
  const b = backend([], { TELEGRAM_CHAT_ID: '' });
  const base = b.env.fetchImpl;
  let polls = 0;
  b.env.fetchImpl = (url, o) => {
    if (url.endsWith('/getWebhookInfo')) return Response.json({ ok: true, result: { url: '' } });
    if (url.includes('/getUpdates?')) {
      polls++;
      assert.deepEqual(JSON.parse(new URL(url).searchParams.get('allowed_updates')), [
        'message',
        'edited_message',
        'callback_query',
      ]);
      return Response.json({ ok: true, result: [] });
    }
    return base(url, o);
  };
  await assert.rejects(
    worker.scheduled({ scheduledTime: Date.parse('2026-02-22T10:00:00Z') }, b.env),
    /telegram-not-configured/,
  );
  assert.equal(polls, 1);
});
test('the dashboard never uses the server mould cache or falls back to staff credentials on denial', async () => {
  const b = backend();
  const u = 'https://studio.invalid/api/moulds/orders';
  let reads = 0;
  b.env.MOULDS_KEY = 'operator';
  b.env.fetchImpl = async (url, o) => {
    if (url.includes('signInWithPassword')) return Response.json({ idToken: 'cron-user' });
    if (url.includes(':runQuery')) {
      reads++;
      return o.headers.Authorization === 'Bearer denied'
        ? new Response('', { status: 403 })
        : Response.json([doc({ name: 'Synthetic private fixture', createdAt: '2027-01-01' })]);
    }
    throw Error('Unexpected request');
  };
  assert.equal(
    (await worker.fetch(new Request(u, { headers: { 'X-Moulds-Key': 'operator' } }), b.env)).status,
    200,
  );
  assert.equal(
    (await worker.fetch(new Request(u, { headers: { Authorization: 'Bearer denied' } }), b.env)).status,
    403,
  );
  assert.equal(reads, 2);
  delete b.env.MOULDS_KEY;
  assert.equal((await worker.fetch(new Request(u), b.env)).status, 401);
});
test('cron refreshes an old staff ID token after email verification without changing caller authorization', async () => {
  const b = backend([], { STAFF_EMAIL: 'fresh-identity@example.test', CRON_SECRET: 'op' }),
    f = b.env.fetchImpl;
  let logins = 0;
  const seen = [];
  b.env.fetchImpl = (url, o) => {
    if (url.includes('signInWithPassword'))
      return Response.json({ idToken: ++logins === 1 ? 'before-verify' : 'after-verify' });
    if (url.includes(':runQuery')) {
      seen.push(o.headers.Authorization);
      if (seen.length === 1) return new Response('', { status: 403 });
    }
    return f(url, o);
  };
  const r = await worker.fetch(manual({ 'X-Cron-Key': 'op' }), b.env);
  assert.equal((await r.json()).ok, true);
  assert.equal(logins, 2);
  assert.deepEqual(seen, ['Bearer before-verify', 'Bearer after-verify']);
});
