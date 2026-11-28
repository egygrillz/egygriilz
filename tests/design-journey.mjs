// Actual pointer/touch input, canvas pixels, staged pricing and access recovery.
// Only the external services are mocked; do not send live studio reminders here.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { observeSheet } from './fixtures/working-sheet.mjs';
const sdk = await readFile(new URL('./fixtures/firebase-modular.mjs', import.meta.url), 'utf8');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  headless: true,
});
const base = 'http://127.0.0.1:8000/',
  errors = [];
const watch = (p) => {
  p.setDefaultTimeout(4500);
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (d) => d.accept());
};
try {
  for (const mobile of [false, true]) {
    const ctx = await browser.newContext({
      viewport: { width: mobile ? 390 : 1360, height: mobile ? 844 : 938 },
      hasTouch: mobile,
      isMobile: mobile,
      deviceScaleFactor: mobile ? 2 : 1,
    });
    await observeSheet(ctx);
    await ctx.addInitScript(() => {
      if (!localStorage.__fixture)
        localStorage.__fixture = JSON.stringify({ settings: { pricing: {}, site: {} } });
    });
    await ctx.route(/^https:\/\//, (r) =>
      r.request().url().includes('/firebasejs/')
        ? r.fulfill({ contentType: 'application/javascript', body: sdk })
        : r.abort(),
    );
    const p = await ctx.newPage();
    watch(p);
    const $ = (s) => p.locator(s),
      click = (s) => $(s).click();
    const state = () => p.evaluate(() => window.__testSheet);
    const cdp = await ctx.newCDPSession(p);
    const point = async (id, fx = 0.5, fy = 0.48) => {
      const el = $(`[data-tooth="${id}"]`);
      await el.scrollIntoViewIfNeeded();
      const b = await el.boundingBox();
      return { x: b.x + b.width * fx, y: b.y + b.height * fy };
    };
    const tap = async (id, x = 0.5, y = 0.48) => {
      const a = await point(id, x, y);
      if (mobile) await p.touchscreen.tap(a.x, a.y);
      else await p.mouse.click(a.x, a.y);
    };
    const stroke = async (id, x1, x2, y) => {
      const a = await point(id, x1, y),
        b = await point(id, x2, y);
      if (mobile) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
        for (let n = 1; n <= 4; n++)
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: a.x + ((b.x - a.x) * n) / 4, y: a.y }],
          });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await p.mouse.move(a.x, a.y);
        await p.mouse.down();
        await p.mouse.move(b.x, b.y, { steps: 5 });
        await p.mouse.up();
      }
    };
    const pixel = async (id, x, y) => {
      const pt = await point(id, x, y);
      return $('#ink-layer').evaluate((c, p) => {
        const r = c.getBoundingClientRect();
        return Array.from(
          c
            .getContext('2d')
            .getImageData(
              Math.floor(((p.x - r.x) * c.width) / r.width),
              Math.floor(((p.y - r.y) * c.height) / r.height),
              1,
              1,
            ).data,
        );
      }, pt);
    };
    await p.goto(base + 'order-sheet.html');
    await click('[data-step="design"]');
    await $('#group-name').fill('Studio test');
    await click('[data-material="silver"]');
    await click('#add-design-layer');
    assert.equal(await $('#group-name').inputValue(), 'Studio test');
    assert.equal(await $('[data-tool="erase"],[data-tool="select"]').count(), 0);
    const width = await p.evaluate(() => ({
      page: document.documentElement.clientWidth,
      canvas: document.querySelector('#chart-viewport').getBoundingClientRect().width,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.ok(Math.abs(width.page - width.canvas) <= 2, JSON.stringify(width));
    assert.equal(width.scroll, width.page);
    await tap(11);
    assert.deepEqual((await state()).selectedTeeth, [11]);
    assert.equal(
      await $('[data-tooth="11"]').evaluate((el) => getComputedStyle(el).fill),
      'rgb(255, 255, 255)',
    );
    await tap(12);
    await click('#apply-design');
    assert.equal((await state()).groups.length, 0);
    assert.equal(await $('#design-review-card').isVisible(), false);
    assert.equal(await $('#gem-type').count(), 0);
    // First apply a plain design. Later unsaved artwork cannot silently change its price.
    await click('#apply-design');
    assert.equal(await $('[data-detail="level"],[data-detail="plating"]').count(), 2);
    assert.equal(await $('.detail-effect,[data-detail="engraving"]').count(), 0);
    await click('#save-design-details');
    const plain = (await state()).price;
    if (mobile) {
      const a = await point(11),
        q = { x: a.x + 25, y: a.y };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { ...a, id: 1 },
          { ...q, id: 2 },
        ],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: a.x - 10, y: a.y, id: 1 },
          { x: q.x + 15, y: q.y, id: 2 },
        ],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.notEqual(await $('#zoom-readout').innerText(), '100%');
      assert.equal((await state()).ink.length, 0);
      await click('#zoom-fit');
    }
    await click('[data-tool="enamel"]');
    assert.ok(await $('#enamel-dialog').isVisible());
    await $('#palette-inputs input').first().fill('#cc2255');
    await click('#add-colour');
    await $('#palette-inputs input').nth(1).fill('#2288bb');
    assert.match(await $('#palette-tier').innerText(), /Multi/);
    await click('#use-palette');
    await tap(11);
    assert.deepEqual(await pixel(11, 0.35, 0.6), [204, 34, 85, 255]);
    assert.deepEqual(await pixel(11, 0.65, 0.6), [34, 136, 187, 255]);
    assert.equal((await state()).price, plain);
    assert.equal(await $('#quote-pdf-btn').isDisabled(), true);
    await click('[data-tool="laser"]');
    await $('#brush-size').focus();
    await p.keyboard.press('End');
    await stroke(11, 0.3, 0.65, 0.4);
    assert.deepEqual(await pixel(11, 0.5, 0.4), [57, 54, 52, 255]);
    await click('[data-tool="white"]');
    await stroke(11, 0.3, 0.65, 0.7);
    assert.deepEqual(await pixel(11, 0.5, 0.7), [255, 255, 255, 255]);
    await click('[data-tool="gem"]');
    await click('[data-gem-color="black"]');
    await click('[data-cut="pear"]');
    assert.equal(
      await $('.gem-cut.active').evaluate((el) => getComputedStyle(el).backgroundColor),
      'rgb(255, 255, 255)',
    );
    await tap(12);
    await click('[data-gem-color="blue"]');
    assert.equal((await state()).gems[0].color, 'black');
    await tap(12);
    assert.ok((await state()).selectedGemId);
    assert.equal(await $('#delete-selected-gem').isEnabled(), true);
    await click('#apply-design');
    assert.equal(await $('[data-detail="diamondType"]').count(), 0);
    assert.equal(await $('[data-detail="accentType"]').count(), 1);
    assert.match(await $('#review-fields').innerText(), /Multi-colour/);
    assert.match(await $('#review-fields').innerText(), /black \/ pear/);
    await $('[data-detail="engraving"]').selectOption('Medium');
    await $('[data-detail="accentType"]').selectOption('Natural diamond');
    await $('[data-detail="accentCustomPrice"]').fill('325');
    await click('#save-design-details');
    const applied = await state();
    assert.ok(Number(applied.price) > Number(plain));
    assert.equal(applied.groups.find((g) => g.teeth.includes(12)).pricedStones[0].customPrice, '325');
    assert.equal(await $('#quote-pdf-btn').isEnabled(), true);
    await click('#undo-ink');
    await click('#apply-design');
    assert.equal(await $('[data-detail="accentType"]').count(), 0);
    await click('#back-to-drawing');
    await click('[data-tool="ice"]');
    await tap(12);
    await click('#apply-design');
    assert.equal(await $('[data-detail="diamondType"]').count(), 1);
    assert.equal(await $('[data-detail="accentType"]').count(), 0);
    await click('#save-design-details');
    await click('#save-draft');
    await p.waitForURL(/sheet=EGZ/);
    await p.reload();
    await p.waitForFunction(() => window.__testSheet?.gems?.length > 0);
    assert.ok((await state()).gems.length > 0);
    assert.equal(await $('#quote-pdf-btn').isEnabled(), true);
    if (process.env.DESIGN_SCREENSHOT_DIR) {
      await $('#design-canvas-card').scrollIntoViewIfNeeded();
      await p.screenshot({
        path: `${process.env.DESIGN_SCREENSHOT_DIR}/drawing-${mobile ? 'mobile' : 'desktop'}.png`,
      });
    }
    await click('[data-step="review"]');
    await p.reload();
    await p.waitForFunction(() => window.__testSheet?.gems?.length > 0);
    await click('[data-step="review"]');
    await $('[data-fdi-label="11"]').waitFor({ state: 'attached' });
    await click('#preview-sheet');
    assert.ok(
      await $('.print-layer-ink')
        .first()
        .evaluate(async (img) => {
          await img.decode();
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const cx = c.getContext('2d');
          cx.drawImage(img, 0, 0);
          const d = cx.getImageData(0, 0, c.width, c.height).data;
          for (let i = 0; i < d.length; i += 4)
            if (d[i] === 204 && d[i + 1] === 34 && d[i + 2] === 85 && d[i + 3] === 255) return true;
          return false;
        }),
      'Enamel must survive printing when Design was never visible on this load',
    );
    console.log(
      'PASS ' +
        (mobile ? 'mobile touch' : 'desktop mouse') +
        ' · full width, selection, fill pixels, laser + white pixels, stones, undo, details-only price, reload',
    );
    await ctx.close();
  }
  const ctx = await browser.newContext(),
    p = await ctx.newPage();
  watch(p);
  const compat = await readFile(new URL('./fixtures/firebase-compat.js', import.meta.url), 'utf8');
  let delivery = 'success',
    calls = 0;
  await ctx.addInitScript(() => {
    localStorage.__fixture = JSON.stringify({
      clients: { test: { name: 'Synthetic client' } },
      settings: {},
    });
    localStorage.egygz_cache_private = 'Stale fixture';
    localStorage.egygz_mould_orders_v1 = 'Stale fixture';
    localStorage.eq_slots_sync = Date.now();
  });
  await ctx.route(/^https:\/\//, (r) => {
    const u = r.request().url();
    if (u.includes('firebasejs/') && u.includes('-compat.js'))
      return r.fulfill({ contentType: 'application/javascript', body: compat });
    if (u.endsWith('/api/remind')) {
      calls++;
      assert.equal(r.request().method(), 'POST');
      assert.equal(r.request().headers().authorization, 'Bearer fake');
      return r.fulfill({
        status: delivery === 'success' ? 200 : 502,
        json:
          delivery === 'success'
            ? { ok: true, date: '2026-11-28', found: 3 }
            : { ok: false, error: 'telegram-403' },
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }
    return r.abort();
  });
  await p.addInitScript(() => {
    localStorage.__testDenied = '1';
  });
  await p.goto(base + 'editx.html');
  const $ = (s) => p.locator(s);
  await p.waitForFunction(() =>
    document.querySelector('#pw-err').textContent.includes('Private reads denied'),
  );
  assert.equal(await $('#app').isVisible(), false);
  assert.equal(await $('#verify-access').isVisible(), true);
  assert.equal(await p.evaluate(() => localStorage.egygz_cache_private ?? null), null);
  assert.equal(await p.evaluate(() => localStorage.egygz_mould_orders_v1 ?? null), null);
  await $('#verify-access').click();
  assert.match(await $('#pw-err').innerText(), /email sent/);
  await p.evaluate(() => {
    localStorage.__testDenied = '0';
  });
  await $('#retry-access').click();
  await $('#app').waitFor({ state: 'visible' });
  await p.evaluate(() => showPage('clients'));
  await $('.client-card').first().waitFor({ state: 'visible' });
  await p.evaluate(() => showPage('appointments'));
  await $('#telegram-reminder').click();
  await p.waitForFunction(() =>
    document.querySelector('#telegram-reminder-status').textContent.includes('Sent to studio Telegram'),
  );
  delivery = 'failure';
  await $('#telegram-reminder').click();
  await p.waitForFunction(() =>
    document.querySelector('#telegram-reminder-status').textContent.includes('Not delivered'),
  );
  assert.equal(calls, 2);
  await p.evaluate(async () => {
    localStorage.__testDenied = '1';
    await loadAppointments();
  });
  assert.equal(await $('#app').isVisible(), false);
  assert.equal(await $('#appt-tbody tr').count(), 0);
  console.log(
    'PASS EditX · denied private read, no stale cache, verification/retry, old client without lastVisit, authenticated Telegram success/failure, revoked access',
  );
  await ctx.close();
  const book = await browser.newContext(),
    bp = await book.newPage();
  watch(bp);
  let posted;
  await book.addInitScript(() => {
    localStorage.__fixture = '{}';
  });
  await book.route(/^https:\/\//, (r) => {
    const u = r.request().url();
    if (u.includes('firebasejs/') && u.includes('-compat.js'))
      return r.fulfill({ contentType: 'application/javascript', body: compat });
    if (u.endsWith('/api/health'))
      return r.fulfill({
        json: { channels: { turnstile: true }, turnstileSiteKey: 'public-fixture' },
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    if (u.includes('/turnstile/v0/api.js'))
      return r.fulfill({
        contentType: 'application/javascript',
        body: `window.turnstile={ready:cb=>cb(),render:(host,opts)=>{host.dataset.key=opts.sitekey;return 'review-widget';},getResponse:id=>id==='review-widget'?'challenge-response':''}`,
      });
    if (u.endsWith('/api/notify')) {
      posted = r.request().postDataJSON();
      return r.fulfill({
        json: { ok: true, notified: false, channels: [{ c: 'telegram', ok: false }] },
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }
    return r.abort();
  });
  await bp.goto(base + 'booking.html');
  await bp.evaluate(() => {
    selectedServices = ['Consultation'];
    selectedDate = '2027-01-18';
    selectedTime = '01:00 PM';
    document.querySelector('#f-name').value = 'Test booking';
    document.querySelector('#f-email').value = 'fixture@example.test';
    document.querySelector('#f-phone').value = '01000000000';
    document.querySelector('#termsBox').checked = true;
    // Rules tests independently exercise the atomic writes. Record this UI's writes, not a production database.
    db.runTransaction = async (fn) => {
      const writes = [];
      await fn({ get: (ref) => ref.get(), set: (ref, value) => writes.push([ref, value]) });
      for (const [ref, value] of writes) await ref.set(value);
    };
    goStep(4);
  });
  await bp.waitForFunction(
    () => document.querySelector('#booking-alert-widget').dataset.key === 'public-fixture',
  );
  await bp.locator('#confirm-btn').click();
  await bp.locator('#step5').waitFor({ state: 'visible' });
  assert.equal(posted.turnstile, 'challenge-response');
  assert.equal(posted.data.ref, '2027-01-18_0100PM');
  assert.match(await bp.locator('#booking-alert-result').innerText(), /saved.*no need to book again/);
  assert.equal(
    await bp.evaluate(() => Object.keys(JSON.parse(localStorage.__fixture).appointments).length),
    1,
  );
  console.log(
    'PASS booking · review widget uses public site key, saved booking sends challenge token and survives Telegram failure',
  );
  await book.close();
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
