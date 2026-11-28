// The pages and gates are real; Firebase is a fixture. Exact identity, CRUD and
// the public/private boundary are independently tested in firestore-rules.test.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  headless: true,
});
const base = 'http://127.0.0.1:8000/';
const compat = await readFile(new URL('./fixtures/firebase-compat.js', import.meta.url), 'utf8');
const modular = await readFile(new URL('./fixtures/firebase-modular.mjs', import.meta.url), 'utf8');
const errors = [];
async function context() {
  const ctx = await browser.newContext();
  await ctx.route(/^https:\/\//, (r) => {
    const u = r.request().url();
    return u.includes('firebasejs/')
      ? r.fulfill({
          contentType: 'application/javascript',
          body: u.includes('-compat.js') ? compat : modular,
        })
      : r.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.setDefaultTimeout(6000);
  return { ctx, page };
}
try {
  const { ctx, page } = await context();
  await page.addInitScript(() => {
    localStorage.__fixture = JSON.stringify({ clients: { x: { name: 'Studio fixture' } }, settings: {} });
    localStorage.__testOwnerLogin = '1';
    localStorage.eq_slots_sync = Date.now();
  });
  await page.goto(base + 'editx.html');
  assert.equal(await page.locator('#app').isVisible(), false);
  await page.locator('#email-input').fill('admin@egygrillz.com');
  await page.locator('#pw-input').fill('fixture-password');
  await page.locator('#login-btn').click();
  await page.locator('#app').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => firebase.auth().currentUser.emailVerified), false);
  assert.equal(await page.locator('#verify-access').isVisible(), false);
  await page.evaluate(() => showPage('clients'));
  await page.getByText('Studio fixture', { exact: true }).first().waitFor();
  console.log(
    'PASS EditX email/password login opens private client data without verifying the listed owner email',
  );
  await ctx.close();

  const { ctx: second, page: desk } = await context();
  await desk.addInitScript(() => {
    localStorage.__fixture = JSON.stringify({ settings: {}, clients: {} });
    localStorage.egy_invoices = JSON.stringify([
      { number: 'PRIVATE-LEGACY-INVOICE', status: 'paid', total: 700 },
    ]);
    sessionStorage.__fixtureOther = '1';
  });
  await desk.goto(base + 'invoice.html');
  await desk.locator('#egygz-gate-err').filter({ hasText: 'Private reads denied' }).waitFor();
  assert.equal(await desk.locator('#app').isVisible(), false);
  assert.equal(await desk.getByText('PRIVATE-LEGACY-INVOICE', { exact: true }).count(), 0);
  await desk.locator('#egygz-gate-retry').click();
  await desk.locator('#egygz-gate-err').filter({ hasText: 'Private reads denied' }).waitFor();
  await desk.locator('#egygz-gate-switch').click();
  await desk.locator('#egygz-gate-email').fill('admin@egygrillz.com');
  await desk.locator('#egygz-gate-pass').fill('wrong-fixture');
  await desk.locator('#egygz-gate-btn').click();
  await desk.locator('#egygz-gate-err').filter({ hasText: 'Could not sign in' }).waitFor();
  await desk.locator('#egygz-gate-pass').fill('fixture-password');
  await desk.locator('#egygz-gate-btn').click();
  await desk.locator('#app').waitFor({ state: 'visible' });
  assert.equal(await desk.locator('#egygz-auth-gate').count(), 0);
  console.log(
    'PASS Invoice desk rejects unrelated signed-in account before displaying caches, then accepts the studio login',
  );
  await second.close();

  const { ctx: third, page: order } = await context(),
    id = 'EGZ-261127-ABCDEF012345';
  await order.addInitScript((id) => {
    sessionStorage.__fixtureSignedOut = '1';
    localStorage.__fixture = JSON.stringify({
      settings: {},
      order_sheets: { [id]: { label: 'Linked fixture · ' + id, quoteId: '', revision: 'test' } },
      ['order_sheets/' + id + '/data']: {
        current: {
          step: 'client',
          locked: false,
          schema: 1,
          sheetJson: JSON.stringify({ orderNo: id, clientName: 'Linked fixture' }),
        },
      },
    });
  }, id);
  await order.goto(base + 'order-sheet.html?sheet=' + id);
  await order.locator('#egygz-gate-email').fill('admin@egygrillz.com');
  await order.locator('#egygz-gate-pass').fill('fixture-password');
  await order.locator('#egygz-gate-btn').click();
  await order.waitForFunction(() => document.querySelector('#client-name').value === 'Linked fixture');
  assert.equal(await order.locator('#order-number-badge').innerText(), id);
  console.log(
    'PASS signed-out Telegram deep link signs in on the same page and opens the intended private sheet',
  );
  await third.close();
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
