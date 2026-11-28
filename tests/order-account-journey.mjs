// Real production pages + both document builders. The browser's Firebase SDK,
// Cloudflare transport and email provider are fixtures: never contacts a client.
import { chromium } from 'playwright-core';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import worker from '../cloudflare-worker.js';
const sdk = await readFile(new URL('./fixtures/firebase-modular.mjs', import.meta.url), 'utf8');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  headless: true,
});
const base = 'http://127.0.0.1:8000/',
  ctx = await browser.newContext({ viewport: { width: 1240, height: 970 } }),
  p = await ctx.newPage();
p.setDefaultTimeout(6500);
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
let consent = true;
p.on('dialog', (d) => (consent ? d.accept() : d.dismiss()));
await ctx.addInitScript(() => {
  if (!localStorage.__fixture)
    localStorage.__fixture = JSON.stringify({
      settings: {
        pricing: { moldFlat: { normalperarch: 350 }, materialBase: { chrome: 1000 }, roundTo: 1 },
        site: {},
      },
    });
});
const $ = (s) => p.locator(s),
  click = (s) => $(s).click(),
  step = (s) => click(`[data-step="${s}"]`),
  db = () => p.evaluate(() => JSON.parse(localStorage.__fixture)),
  wait = (fn) => p.waitForFunction(fn);
const fs = (x) =>
  x == null
    ? { nullValue: null }
    : Array.isArray(x)
      ? { arrayValue: { values: x.map(fs) } }
      : typeof x === 'object'
        ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, fs(v)])) } }
        : typeof x === 'number'
          ? { doubleValue: x }
          : typeof x === 'boolean'
            ? { booleanValue: x }
            : { stringValue: x };
let attempts = 0,
  accepted = 0,
  reject = true,
  mail,
  orderId;
await ctx.route(/^https:\/\//, async (r) => {
  const req = r.request(),
    url = req.url();
  if (url.includes('firebasejs/')) return r.fulfill({ contentType: 'application/javascript', body: sdk });
  if (url.includes('/api/orders/')) {
    attempts++;
    const response = await worker.fetch(
      new Request(url, { method: req.method(), headers: req.headers(), body: req.postDataBuffer() }),
      {
        RESEND_FROM: 'studio@example.test',
        RESEND_KEY: 'fixture',
        fetchImpl: async (u, o) => {
          if (u.startsWith('https://api.resend.com/')) {
            mail = JSON.parse(o.body);
            if (reject) return Response.json({ message: 'fixture failure' }, { status: 422 });
            accepted++;
            return Response.json({ id: 'fixture-message' });
          }
          assert.equal(o.headers.Authorization, 'Bearer fake');
          assert.ok(u.includes('/quotes/' + orderId));
          if (o.method === 'PATCH') {
            await p.evaluate(
              ({ orderId, fields }) => {
                const d = JSON.parse(localStorage.__fixture);
                Object.assign(d.quotes[orderId], fields);
                localStorage.__fixture = JSON.stringify(d);
              },
              {
                orderId,
                fields: globalThis.CalcEngine.decodeFirestoreValue({ mapValue: JSON.parse(o.body) }),
              },
            );
            return Response.json({});
          }
          return Response.json({
            fields: fs((await db()).quotes[orderId]).mapValue.fields,
            updateTime: '2026-11-27T13:00:00Z',
          });
        },
      },
    );
    return r.fulfill({
      status: response.status,
      body: await response.text(),
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
  return r.abort();
});
try {
  await p.goto(base + 'order-sheet.html');
  await $('#client-email').fill('first-address@example.test');
  orderId = await $('#order-number-badge').textContent();
  await click('#save-draft');
  await wait(() => location.search.includes('sheet='));
  assert.equal(Object.keys((await db()).quotes || {}).length, 0);
  await step('design');
  assert.equal(await $('.material-chip img').count(), 4);
  assert.deepEqual(
    await $('.material-chip img').evaluateAll((imgs) => imgs.map((i) => i.complete && i.naturalWidth > 0)),
    [true, true, true, true],
  );
  if (process.env.DESIGN_SCREENSHOT_DIR)
    await p.screenshot({ path: process.env.DESIGN_SCREENSHOT_DIR + '/materials.png' });
  await $('[data-tooth="11"]').focus();
  await p.keyboard.press('Enter');
  await click('#apply-design');
  await click('[data-tool="enamel"]');
  await $('#palette-inputs input').fill('#ad423a');
  await click('#use-palette');
  const b = await $('[data-tooth="11"]').boundingBox();
  await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await click('#apply-design');
  await click('#save-design-details');
  await step('pricing');
  assert.equal(await $('#order-mold').count(), 0);
  await $('#order-service-type').selectOption('mold:normalperarch');
  await $('#order-service-qty').fill('2');
  await click('#add-order-service');
  await p.evaluate(() => {
    const d = JSON.parse(localStorage.__fixture);
    d.settings.pricing.moldFlat.normalperarch = 450;
    localStorage.__fixture = JSON.stringify(d);
    window.dispatchEvent(new Event('fixture-settings'));
  });
  await wait(() => document.querySelector('#order-services-list').textContent.includes('900 EGP'));
  await click('#price-mode');
  await $('#price').fill('5000');
  await $('#deposit').fill('1200');
  await step('review');
  await $('#client-notes').fill('Upper arch fitting · مراجعة المقاس');
  await $('#signature-pad').scrollIntoViewIfNeeded();
  const pb = await $('#signature-pad').boundingBox();
  await p.mouse.move(pb.x + 25, pb.y + 25);
  await p.mouse.down();
  await p.mouse.move(pb.x + 150, pb.y + 40, { steps: 6 });
  await p.mouse.up();
  await $('#agreement').check();
  assert.equal(await $('#delivery-email').inputValue(), 'first-address@example.test');
  await $('#delivery-email').fill('order-test@example.test');
  assert.equal(await $('#agreement').isChecked(), true);
  assert.equal(await $('#client-email').inputValue(), 'order-test@example.test');
  await click('#save-quote-btn');
  await wait(() => document.querySelector('#record-payment').disabled === false);
  const quote = async () => (await db()).quotes[orderId];
  assert.equal((await quote()).order.moldCost, 0);
  assert.equal((await quote()).order.services[0].subtotal, 900);
  assert.match((await quote()).label, /^\d{4}-\d\d-\d\d · EGZ-/);
  await $('#receipt-amount').fill('850');
  await click('#record-payment');
  await wait(() => document.querySelector('#payment-summary').textContent.includes('Paid 850 EGP'));
  assert.match(await $('#payment-summary').innerText(), /Outstanding 4,150 EGP/);
  assert.equal((await quote()).order.deposit, 1200);
  await $('#receipt-amount').fill('4500');
  await click('#record-payment');
  assert.equal((await quote()).payments.length, 1);
  // Reopening from the cloud must not reprice an issued order, even when a service changes.
  await p.evaluate(() => {
    const d = JSON.parse(localStorage.__fixture);
    d.settings.pricing.moldFlat.normalperarch = 700;
    localStorage.__fixture = JSON.stringify(d);
  });
  await p.reload();
  await wait(() => document.querySelector('#payment-history').textContent.includes('850 EGP'));
  await step('pricing');
  assert.match(await $('#order-services-list').innerText(), /900 EGP/);
  await step('review');
  await $('#receipt-amount').fill('4150');
  await click('#record-payment');
  await wait(() => document.querySelector('#payment-summary').textContent.includes('Settled'));
  assert.equal((await quote()).payments.length, 2);
  assert.match(await $('#payment-summary').innerText(), /Outstanding 0 EGP/);
  const [download] = await Promise.all([p.waitForEvent('download'), click('#order-pdf-btn')]);
  assert.match(
    download.suggestedFilename(),
    new RegExp(`^EGYGRILLZ-Order-\\d{4}-\\d{2}-\\d{2}-${orderId}\\.pdf$`),
  );
  const bytes = await readFile(await download.path());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.match(bytes.toString('latin1'), /\/DCTDecode/);
  assert.ok(bytes.length > 10000);
  if (process.env.DESIGN_SCREENSHOT_DIR)
    await writeFile(process.env.DESIGN_SCREENSHOT_DIR + '/test-order.pdf', bytes);
  consent = false;
  await click('#email-order');
  consent = true;
  assert.equal(attempts, 0);
  await click('#email-order');
  await wait(() => document.querySelector('#mail-status').textContent.includes('rejected'));
  assert.equal(accepted, 0);
  assert.ok(!(await quote()).emailedVersion);
  reject = false;
  await click('#email-order');
  await wait(() => document.querySelector('#mail-status').textContent.includes('accepted'));
  assert.equal(accepted, 1);
  assert.deepEqual(mail.to, ['order-test@example.test']);
  assert.equal(mail.attachments.length, 2);
  assert.deepEqual(Buffer.from(mail.attachments[0].content, 'base64'), bytes);
  assert.match(
    Buffer.from(mail.attachments[1].content, 'base64').toString(),
    /Payment record.*Amount received.*5,000 EGP.*Outstanding today.*0 EGP/s,
  );
  assert.equal(await $('#email-order').isDisabled(), true);
  assert.equal((await quote()).emailedVersion, (await quote()).deliveryVersion);
  const stored = await db();
  assert.doesNotMatch(JSON.stringify(stored), /data:image|application\/pdf|%PDF-|JVBERi0/);
  assert.ok(
    JSON.parse(stored[`order_sheets/${orderId}/data`].current.sheetJson).signatureLines[0].length > 2,
  );
  assert.equal(
    await p.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k !== '__fixture')
        .some((k) => k.includes('order_sheet') || localStorage[k].includes('order-test@example.test')),
    ),
    false,
  );
  // A saved order cannot be lowered below actual receipts, even from another tab.
  await step('pricing');
  await $('#price').fill('4900');
  await step('review');
  await click('#save-quote-btn');
  await wait(() =>
    document.querySelector('#save-status').textContent.includes('below the money already received'),
  );
  assert.equal((await quote()).total, 5000);
  await step('pricing');
  await $('#price').fill('5000');
  await step('review');
  await p.evaluate((id) => {
    const d = JSON.parse(localStorage.__fixture);
    d.order_sheets[id].revision = 'second-device';
    localStorage.__fixture = JSON.stringify(d);
  }, orderId);
  await click('#save-quote-btn');
  await wait(() => document.querySelector('#save-status').textContent.includes('another device'));
  assert.equal((await quote()).payments.length, 2);
  await p.reload();
  await wait(() => document.querySelector('#payment-summary').textContent.includes('Settled'));
  await click('#create-proforma-btn');
  await wait(() => document.querySelector('#deposit-val')?.value === '5000');
  assert.equal(await $('#inv-status').inputValue(), 'paid');
  assert.equal(await p.evaluate(() => localStorage.getItem('egygz_pending_invoice_from_quote')), null);
  // Explicit legacy import: no silent upload, no raster approval resurrection,
  // and no second cloud record when the same old draft is opened again.
  const legacy = {
    orderNo: 'EGZ-251110-ABCDEF',
    clientName: 'Earlier fixture',
    date: '2025-11-10',
    signature: 'data:image/png;base64,old',
    agreement: true,
    mold: 'normalperarch',
    services: [],
  };
  await p.evaluate((old) => localStorage.setItem('egygz_order_sheet_active_v1', JSON.stringify(old)), legacy);
  await p.goto(base + 'order-sheet.html');
  await click('#legacy-files summary');
  await click('#legacy-open');
  assert.equal(await $('#client-name').inputValue(), legacy.clientName);
  assert.equal(await $('#agreement').isChecked(), false);
  await click('#save-draft');
  await wait(() => location.search.includes('sheet='));
  const migrated = await db();
  assert.equal(Object.keys(migrated.order_sheets).length, 2);
  const oldId = await $('#order-number-badge').textContent();
  assert.ok(migrated.quotes[oldId]);
  assert.equal(migrated.quotes[oldId].order.moldCost, 0);
  assert.equal(migrated.quotes[oldId].order.services[0].unitPrice, 700);
  assert.doesNotMatch(JSON.stringify(migrated), /data:image/);
  assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.egygz_order_sheet_active_v1)), legacy);
  await click('#new-sheet');
  if (!(await $('#legacy-files').evaluate((el) => el.open))) await click('#legacy-files summary');
  await click('#legacy-open');
  await wait(() => location.search.includes('sheet='));
  assert.equal(await $('#order-number-badge').textContent(), oldId);
  assert.deepEqual(errors, []);
  console.log(
    'PASS cloud draft → unique nameless order + quotation · EditX mold updates · receipts, overpayment, settled invoice · PDF file, actual two-attachment Worker path and safe retry · no PDF/image/device saves',
  );
} finally {
  await browser.close();
}
