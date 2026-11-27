// Test the production pages in a fresh browser context with deterministic external services.
import { readFile } from 'node:fs/promises';
import { chromium as pw } from 'playwright-core';
import assert from 'node:assert/strict';
const browser = await pw.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1360, height: 938 } }),
  page = await ctx.newPage();
page.setDefaultTimeout(5500);
const errors = [];
page.on('pageerror', (e) => {
  errors.push(e.message);
  console.log('EXCEPTION', page.url(), e.message);
});
page.on('console', (m) => {
  if (/failed:|failed\)|render error|Order PDF design map/i.test(m.text()) && m.type() !== 'error')
    console.warn('WARN', m.text());
});
let dismiss = false,
  lastPrompt = '';
page.on('dialog', (d) => {
  lastPrompt = d.message();
  return dismiss ? d.dismiss() : d.accept();
});
const sdk = await readFile(new URL('./fixtures/firebase-modular.mjs', import.meta.url), 'utf8');
const compat = await readFile(new URL('./fixtures/firebase-compat.js', import.meta.url), 'utf8');
const pricing = { materialBase: { chrome: 1234 }, depositPct: 30, roundTo: 75 },
  site = { consultPrice: 850, studioName: 'EGYGRILLZ', quoteValidDays: 14 };
const previousInvoice = {
  number: 'EGY-075',
  status: 'paid',
  clientName: 'Previous Client',
  clientId: 'previous',
  deposit: 600,
  total: 600,
  items: [{ name: 'Previous work', qty: 1, price: 600 }],
  createdAt: '2026-10-19',
};
const fixtures = {
  invoices: { previous: previousInvoice },
  clients: {
    'test-client': {
      name: 'Marten',
      phone: '01000000000',
      email: 'marten@example.test',
      lastVisit: '2026-10-17',
    },
  },
  appointments: { a: { name: 'Mx', phone: '+201000000000', date: '2026-11-11', time: '1:00 PM' } },
  settings: { pricing, site },
};
await ctx.addInitScript((seed) => {
  if (!localStorage.__fixture) localStorage.__fixture = JSON.stringify(seed);
  localStorage.eq_slots_sync = Date.now();
}, fixtures);
let offline = false,
  staleGold = false;
await ctx.route(/^https:\/\//, (r) => {
  const url = r.request().url();
  const js = (body) =>
    r.fulfill({
      contentType: 'application/javascript',
      body,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  if (url.includes('/firebasejs/')) {
    if (url.includes('-compat.js')) return js(compat);
    return js(sdk);
  }
  if (offline) return r.abort();
  if (url.includes('/api/rates'))
    return r.fulfill({ json: { goldUsdPerOz: 3100, usdEgp: 50, at: Date.now(), stale: staleGold } });
  if (url.includes('/settings/pricing?'))
    return r.fulfill({
      json: {
        fields: {
          roundTo: { integerValue: 75 },
          depositPct: { integerValue: 30 },
          materialBase: { mapValue: { fields: { chrome: { integerValue: 1234 } } } },
        },
      },
    });
  if (url.includes('/settings/site?'))
    return r.fulfill({ json: { fields: { consultPrice: { integerValue: 850 } } } });
  return r.abort();
});
const nav = (file) =>
  page.goto('http://127.0.0.1:8000/' + file, { waitUntil: 'domcontentloaded', timeout: 18000 });
const $ = (s) => page.locator(s),
  step = (s) => $(`[data-step="${s}"]`).click();
const val = (s) => $(s).inputValue(),
  state = () => page.evaluate(() => JSON.parse(localStorage.egygz_order_sheet_active_v1)),
  table = (key) => page.evaluate((k) => JSON.parse(localStorage.__fixture)[k], key);
const tooth = async (n) => {
  await $(`path[data-tooth="${n}"]`).focus();
  await page.keyboard.press('Enter');
};
const wait = (cond) => page.waitForFunction(cond);
try {
  await nav('editx.html');
  await page.evaluate(async () => {
    await loadClients();
    await openClientModal('test-client');
  });
  await page.evaluate(() => openOrderForClient());
  await wait(() => document.querySelector('#client-name')?.value === 'Marten');
  assert.equal(await val('#client-email'), 'marten@example.test');
  assert.equal(new URL(page.url()).search, '');
  await $('#client-search').fill('Mx');
  await $('#client-search').fill('Marten');
  assert.equal(await $('.client-result').count(), 1);
  assert.match(await $('.client-result').first().innerText(), /2026-11-11/);
  await $('.client-result').first().click();
  console.log('PASS EditX → Order, merged directory');
  await step('design');
  await tooth(11);
  await tooth(12);
  await $('#design-mode').selectOption('mix');
  await $('[data-mix-tooth="12"][data-mix-field="material"]').selectOption('Sterling Silver 925');
  await $('#group-name').fill('Top mix');
  assert.equal(await $('#quote-pdf-btn').isDisabled(), true);
  await $('#apply-design').click();
  let s = await state();
  assert.equal(s.groups.length, 2);
  assert.equal(s.designLayers.length, 1);
  const original = s.groups[1];
  await $('[data-tool="draw"]').click();
  await $('path[data-tooth="11"]').scrollIntoViewIfNeeded();
  const pos = await $('path[data-tooth="11"]').boundingBox();
  await page.mouse.move(pos.x + pos.width / 2, pos.y + pos.height / 2);
  await page.mouse.down();
  await page.mouse.move(pos.x + pos.width / 2 + 5, pos.y + pos.height / 2 + 4, { steps: 4 });
  await page.mouse.up();
  assert.equal((await state()).ink.length, 1);
  await $('[data-action="edit-group"]').first().click();
  await $('#complexity').selectOption('2 Open face');
  await $('#apply-design').click();
  s = await state();
  assert.deepEqual(s.groups[1], original);
  assert.equal(s.ink.length, 1);
  console.log('PASS mixed specs, actual ink, non-destructive group edit');
  await $('.library summary').click();
  await $('#save-current-design').click();
  await wait(() => document.querySelector('#saved-design-templates').options.length > 1);
  await $('#load-saved-design').click();
  s = await state();
  assert.equal(s.designLayers.length, 2);
  assert.equal(s.groups.length, 4);
  assert.equal(s.ink.length, 2);
  console.log('PASS template round trip');
  await step('pricing');
  await $('#order-service-type').selectOption('consultation');
  await $('#add-order-service').click();
  await $('#price-mode').click();
  await $('#price').fill('5000');
  await $('#deposit').fill('1200');
  await step('review');
  await $('#signature-pad').scrollIntoViewIfNeeded();
  const pad = await $('#signature-pad').boundingBox();
  await page.mouse.move(pad.x + 35, pad.y + 36);
  await page.mouse.down();
  await page.mouse.move(pad.x + 115, pad.y + 52, { steps: 8 });
  await page.mouse.up();
  await $('#agreement').check();
  assert.ok((await state()).signature?.startsWith('data:image/png'));
  await $('#preview-sheet').click();
  assert.equal(await $('.design-layer-print').count(), 2);
  const inkStats = await $('.print-layer-ink').evaluateAll(async (imgs) =>
    Promise.all(
      imgs.map(async (img) => {
        await img.decode();
        let c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const cx = c.getContext('2d');
        cx.drawImage(img, 0, 0);
        return cx.getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0);
      }),
    ),
  );
  assert.deepEqual(inkStats, [true, true]);
  assert.equal(await $('.print-signatures img').getAttribute('src'), (await state()).signature);
  assert.match(await $('.print-legal').innerText(), /REVIEWED BY CLIENT/);
  await page.emulateMedia({ media: 'print' });
  assert.ok(await $('#print-sheet').isVisible());
  assert.equal(await $('.work-rail').isVisible(), false);
  const print = await page.pdf({ preferCSSPageSize: true });
  assert.ok(print.subarray(0, 4).equals(Buffer.from('%PDF')));
  await page.emulateMedia({ media: 'screen' });
  await $('#save-quote-btn').click();
  await wait(() => Object.keys(JSON.parse(localStorage.__fixture).quotes || {}).length === 1);
  let quotes = await table('quotes'),
    saved = Object.values(quotes)[0];
  assert.equal(saved.order.total, 5000);
  assert.equal(saved.order.deposit, 1200);
  assert.equal(saved.order.lineCount, 2);
  assert.equal(saved.order.services.length, 1);
  assert.equal(saved.order.depositManual, true);
  assert.ok(!JSON.stringify(saved).includes('data:image/'));
  await $('#save-draft').click();
  await $('#new-sheet').click();
  assert.equal(await val('#client-name'), '');
  await $('#saved-drafts').selectOption({ index: 1 });
  assert.equal((await state()).clientName, 'Marten');
  console.log('PASS artwork in hidden-step print, save quotation, local draft');
  await step('review');
  await $('#open-saved-quote').click();
  await wait(() => document.querySelector('#agreedTotal')?.value === '5000');
  assert.equal(await val('#agreedTotal'), '5000');
  assert.equal(await val('#agreedDeposit'), '1200');
  assert.match(await $('#totalVal').innerText(), /5,000/);
  await $('[data-pdf]').first().focus();
  const [historical] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  assert.equal(historical.suggestedFilename(), 'EGYGRILLZ-Quotation-Marten.pdf');
  await $('#agreedTotal').fill('0');
  await $('#agreedDeposit').fill('0');
  await $('#saveBtn').evaluate((el) => el.click());
  await wait(() => Object.values(JSON.parse(localStorage.__fixture).quotes)[0].order.total === 0);
  await $('[data-open]')
    .first()
    .evaluate((el) => el.click());
  assert.equal(await val('#agreedTotal'), '0');
  assert.equal(await val('#agreedDeposit'), '0');
  await $('#agreedTotal').fill('');
  await $('#agreedDeposit').fill('');
  await $('#saveBtn').evaluate((el) => el.click());
  await wait(() => Object.values(JSON.parse(localStorage.__fixture).quotes)[0].order.calculatedTotal == null);
  await $('[data-open]')
    .first()
    .evaluate((el) => el.click());
  assert.equal(await val('#agreedTotal'), '');
  assert.equal(await val('#agreedDeposit'), '');
  await $('#newQuoteBtn').evaluate((el) => el.click());
  assert.equal(await val('#clientName'), '');
  assert.equal(await $('#agreedFields').getAttribute('open'), null);
  console.log('PASS Quotes history, open/save/update/new, zero and cleared overrides');
  const code = await page.evaluate(() =>
    CalcEngine.encodeCode({
      lines: [{ material: 'chrome', teeth: 1 }],
      services: [{ type: 'consultation', qty: 1 }],
      clientName: 'Tester',
      depositPct: 30,
    }),
  );
  await nav('quotes.html?c=' + encodeURIComponent(code));
  await wait(() => document.querySelector('#clientName')?.value === 'Tester');
  assert.match(await $('#totalVal').innerText(), /2,100/);
  await $('#agreedFields summary').evaluate((el) => el.click());
  await $('#agreedTotal').fill('1000');
  await $('#agreedDeposit').fill('300');
  await $('#toInvoiceBtn').evaluate((el) => el.click());
  await wait(() => document.querySelector('#cc-name')?.textContent === 'Tester');
  assert.match(await $('#prev-total').innerText(), /1,000/);
  assert.equal(await val('#deposit-val'), '0');
  assert.match(await val('#inv-notes'), /Deposit due: 300/);
  assert.equal(await val('#inv-status'), 'pending');
  console.log('PASS code → Quotes → standalone Invoice, deposit not paid');
  const click = (s) =>
    $(s)
      .first()
      .evaluate((el) => el.click());
  await click('[data-tab="accounting"]');
  await click('[data-edit="previous"]');
  assert.equal(await val('#inv-status'), 'paid');
  assert.equal(await val('#deposit-val'), '600');
  await click('#open-import-quote-btn');
  await click('[data-use-q]');
  assert.equal(await val('#inv-status'), 'pending');
  assert.equal(await val('#deposit-val'), '0');
  assert.notEqual(await val('#inv-number'), previousInvoice.number);
  await $('#inv-number').fill('IMPORT-STANDALONE');
  await click('#save-invoice-btn');
  await wait(() => !!JSON.parse(localStorage.__fixture).invoices['IMPORT-STANDALONE']);
  assert.deepEqual((await table('invoices')).previous, previousInvoice);
  await nav('editx.html');
  await page.evaluate(async () => {
    const q = Object.values(JSON.parse(localStorage.__fixture).quotes)[0];
    q.order = CalcEngine.calculateOrder(q.lines, {
      agreedTotal: 3333,
      depositAmount: 700,
      services: q.services,
    });
    localStorage.egygz_pending_invoice_from_quote = JSON.stringify(CalcEngine.quoteToInvoice(q));
    await openInvoicesPanel();
  });
  assert.match(await $('#inv-prev-total').textContent(), /3,333/);
  assert.equal(await val('#inv-deposit-val'), '0');
  assert.match(await val('#inv-notes'), /700/);
  console.log('PASS EditX Invoice from quote');
  await click('#inv-list-tbody [data-edit="previous"]');
  assert.equal(await val('#inv-status'), 'paid');
  await click('#inv-open-import-quote-btn');
  await click('#inv-import-quote-list [data-q]');
  assert.equal(await val('#inv-status'), 'pending');
  assert.equal(await val('#inv-deposit-val'), '0');
  await $('#inv-number').evaluate((el) => (el.value = 'IMPORT-EDITX'));
  await click('#inv-save-btn');
  await wait(() => !!JSON.parse(localStorage.__fixture).invoices['IMPORT-EDITX']);
  assert.deepEqual((await table('invoices')).previous, previousInvoice);
  console.log(
    'PASS both invoice builders start a new invoice without modifying the previously edited paid one',
  );
  await nav('order-sheet.html');
  await $('#new-sheet').click();
  await step('pricing');
  await $('#order-service-type').selectOption('consultation');
  await $('#add-order-service').click();
  await $('#deposit').fill('999999');
  assert.equal(await $('#quote-pdf-btn').isDisabled(), true);
  await $('#auto-deposit').click();
  assert.equal(await val('#deposit'), '270');
  await $('#price-mode').click();
  await $('#price').fill('0');
  await step('review');
  assert.equal(await $('#quote-pdf-btn').isEnabled(), true);
  assert.equal((await state()).price, '0');
  console.log('PASS service-only, invalid deposit and zero agreed total');
  await nav('order-sheet.html');
  await $('#new-sheet').click();
  await page.evaluate(() => {
    localStorage.removeItem('egygz_rates_v1');
  });
  offline = true;
  await page.reload();
  await step('design');
  await $('[data-material="gold"]').click();
  await tooth(11);
  await $('#apply-design').click();
  await wait(
    () =>
      document.querySelector('#order-warning').textContent.includes('gold rate unavailable') ||
      document.querySelector('#order-warning').textContent.includes('Gold rate unavailable'),
  );
  assert.equal(await $('#quote-pdf-btn').isDisabled(), true);
  console.log('PASS no gold quote without rate');
  offline = false;
  staleGold = true;
  await step('pricing');
  await $('#refresh-pricing').click();
  await wait(
    () =>
      !document.querySelector('#refresh-pricing').disabled &&
      document.querySelector('#order-warning').textContent.includes('last known gold'),
  );
  await step('review');
  await page.evaluate(() => {
    const original = CalcEngine.downloadQuotePdf;
    CalcEngine.downloadQuotePdf = (o, m) => {
      window.__issuedNotes = m.notes;
      return original(o, m);
    };
  });
  dismiss = true;
  await $('#quote-pdf-btn').click();
  assert.match(lastPrompt, /last known rate/);
  assert.equal(await page.evaluate(() => window.__issuedNotes), undefined);
  dismiss = false;
  await Promise.all([page.waitForEvent('download'), $('#quote-pdf-btn').click()]);
  assert.match(await page.evaluate(() => window.__issuedNotes), /last known rate/);
  staleGold = false;
  console.log('PASS stale gold: cancel blocks issue; confirmation records the caveat');
  const preview = await page.evaluate(() =>
    CalcEngine.encodeCode({
      lines: [
        {
          name: 'Public test',
          material: 'silver',
          teeth: 1,
          enamel: 'single',
          accent: { count: 2, type: 'cz', cut: 'pear', size: '2.5', setting: 'twoprong' },
        },
      ],
      services: [{ type: 'consultation', qty: 1 }],
      discount: { type: 'flat', value: 120 },
      clientName: 'Test',
      depositPct: 30,
    }),
  );
  await nav('calculator.html?c=' + encodeURIComponent(preview));
  await wait(() => document.querySelector('[data-order=clientName]')?.value === 'Test');
  const spy = () =>
    page.evaluate(() => {
      const build = CalcEngine.downloadQuotePdf;
      CalcEngine.downloadQuotePdf = (o, m) => {
        window.__testPdfTotal = o.total;
        window.__testOrder = o;
        return build(o, m);
      };
    });
  await spy();
  const [publicPdf] = await Promise.all([
    page.waitForEvent('download'),
    $('#mb-pdf').evaluate((el) => el.click()),
  ]);
  assert.match(publicPdf.suggestedFilename(), /^EGYGRILLZ-Quotation/);
  const publicOrder = await page.evaluate(() => window.__testOrder);
  assert.equal(publicOrder.servicesSubtotal, 850);
  assert.equal(publicOrder.discountAmount, 120);
  assert.equal(publicOrder.depositPct, 30);
  assert.equal(publicOrder.lines[0].accent.cut, 'pear');
  assert.equal(publicOrder.lines[0].accent.size, '2.5');
  assert.equal(publicOrder.lines[0].name, 'Public test');
  assert.equal(publicOrder.total, 3300);
  await $('#lang-ar').click();
  assert.match(await $('#summary').innerText(), /المطلوب قبل بدء التصنيع \(30%\)/);
  for (const route of ['staff-panel-x7k2.html', 'staff-panel-x7k2/index.html']) {
    await nav(route);
    await wait(() => window.CalcEngine?.get().roundTo === 75);
    await spy();
    await page.evaluate(() => {
      const c = mountStaffCalculator();
      c.setLines([{ teeth: 1, material: 'chrome' }]);
      c.calculate();
      c.setServices([{ type: 'consultation', qty: 1 }]);
    });
    const [pdf] = await Promise.all([
      page.waitForEvent('download'),
      $('#scalcHost [data-sc="downloadPdf"]').evaluate((el) => el.click()),
    ]);
    assert.match(pdf.suggestedFilename(), /^EGYGRILLZ-Quotation/);
    assert.equal(await page.evaluate(() => window.__testPdfTotal), 2100);
  }
  console.log('PASS public Calculator and both Staff routes download with studio pricing');
  assert.deepEqual(errors, []);
} catch (e) {
  console.log(
    'AT',
    page.url(),
    await page
      .locator('#toast')
      .first()
      .textContent()
      .catch(() => ''),
  );
  throw e;
} finally {
  await browser.close();
}
