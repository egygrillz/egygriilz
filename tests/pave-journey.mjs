// End-to-end: real canvas -> complexity chosen AFTER drawing -> actual issued
// PDFs -> geometry-free library -> another arch, without re-entering the specs.
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { observeSheet } from './fixtures/working-sheet.mjs';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  headless: true,
});
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await observeSheet(ctx);
  await ctx.addInitScript(() => {
    localStorage.__fixture ||= JSON.stringify({
      settings: { pricing: { barsStonesPerTooth: 517 }, site: {} },
    });
  });
  const sdk = await readFile(new URL('./fixtures/firebase-modular.mjs', import.meta.url), 'utf8');
  await ctx.route(/^https:\/\//, (r) =>
    r.request().url().includes('/firebasejs/')
      ? r.fulfill({ contentType: 'application/javascript', body: sdk })
      : r.abort(),
  );
  const page = await ctx.newPage(),
    errors = [];
  page.setDefaultTimeout(5500);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const $ = (s) => page.locator(s),
    click = (s) => $(s).click(),
    step = (s) => click(`[data-step="${s}"]`),
    tool = (s) => click(`[data-tool="${s}"]`);
  const state = () => page.evaluate(() => window.__testSheet);
  const snapshot = () => page.evaluate(() => OrderFile.pack(window.__testSheet));
  const priced = () =>
    page.evaluate(() => CalcEngine.designBreakdown(OrderPricing.build(window.__testSheet, CalcEngine).order));
  const library = () => page.evaluate(() => JSON.parse(localStorage.__fixture).design_templates);
  async function path(id, points) {
    const shape = $(`path[data-tooth="${id}"]`);
    await shape.scrollIntoViewIfNeeded();
    const b = await shape.boundingBox();
    const xy = ([x, y]) => [b.x + b.width * x, b.y + b.height * y];
    await page.mouse.move(...xy(points[0]));
    await page.mouse.down();
    for (const p of points.slice(1)) await page.mouse.move(...xy(p), { steps: 5 });
    await page.mouse.up();
  }
  async function across(from, to, start = [0.25, 0.5], end = [0.75, 0.5]) {
    await $(`path[data-tooth="${from}"]`).scrollIntoViewIfNeeded();
    const xy = async (id, [u, v]) => {
      const b = await $(`path[data-tooth="${id}"]`).boundingBox();
      return [b.x + u * b.width, b.y + v * b.height];
    };
    await page.mouse.move(...(await xy(from, start)));
    await page.mouse.down();
    await page.mouse.move(...(await xy(to, end)), { steps: 18 });
    await page.mouse.up();
  }
  const tap = (id, x = 0.5, y = 0.45) => path(id, [[x, y]]);
  await page.goto('http://127.0.0.1:8000/order-sheet.html');
  await step('design');
  await $('#group-name').fill('Twin rails');
  await $('#design-mode').selectOption('mix');
  await click('[data-material="silver"]');
  await tap(11);
  await tap(21);
  await click('#apply-design');
  await tool('pave');
  await path(11, [
    [0.2, 0.45],
    [0.8, 0.45],
    [0.3, 0.46],
    [0.6, 0.68],
    [0.6, 0.28],
  ]);
  await path(11, [
    [0.4, 0.68],
    [0.4, 0.25],
  ]);
  await tap(21, 0.35, 0.4);
  let s = await state();
  const bar = s.gems.filter((g) => g.tooth === 11);
  assert.ok(bar.length >= 3, 'a line, not a single stamp');
  for (const [i, g] of bar.entries())
    for (const h of bar.slice(0, i))
      assert.ok(Math.hypot(g.x - h.x, g.y - h.y) >= 4.5 * (g.sizeMm + 1), '1 mm edge gap');
  await tool('gem');
  await click('[data-cut="pear"]');
  await click('[data-gem-color="pink"]');
  await tap(21, 0.66, 0.62);
  assert.equal((await state()).groups.length, 0);
  await click('#apply-design');
  await $('[data-row="11"][data-detail="level"]').selectOption({ label: 'Bars' });
  assert.match(await $('#review-fields').innerText(), /Iced-out bar/);
  assert.equal(await $('[data-row="11"][data-detail="accentType"]').count(), 0);
  await $('[data-row="21"][data-detail="level"]').selectOption({ label: 'Complex' });
  await click('#save-design-details');
  let first = await priced();
  assert.equal(first.designs[0].groups[0].group.fullCost, 517);
  assert.equal(
    first.designs[0].groups[1].stones.reduce((n, x) => n + x.qty, 0),
    2,
  );
  assert.deepEqual(first.services, []);
  await click('#step-design .library summary');
  await click('#save-current-design');
  await page.waitForFunction(() => document.querySelector('#saved-design-templates').options.length === 2);
  const savedLibrary = await library();
  assert.equal(Object.values(savedLibrary)[0].slots.length, 2);
  await step('review');
  await click('#preview-sheet');
  assert.deepEqual(await $('.print-design h4').allTextContents(), ['Twin rails']);
  assert.deepEqual(await $('.print-design h5').allTextContents(), ['FDI 11', 'FDI 21']);
  for (const [id, file] of [
    ['order-pdf-btn', 'order'],
    ['quote-pdf-btn', 'quote'],
  ]) {
    const [d] = await Promise.all([page.waitForEvent('download'), click('#' + id)]);
    const b = await readFile(await d.path());
    assert.equal(b.subarray(0, 4).toString(), '%PDF');
    if (file === 'quote') {
      const pdf = b.toString('latin1');
      assert.equal(pdf.split('Twin rails').length - 1, 1);
      assert.match(pdf, /Iced-out bar/);
      assert.match(pdf, /FDI 21/);
    }
    if (file === 'order') {
      // Inspect the actual production PDF page, not the HTML preview. Its first
      // JPEG must include the tooth outlines around the ink, not floating dots.
      const start = b.indexOf(Buffer.from([255, 216])),
        end = b.indexOf(Buffer.from([255, 217]), start + 2);
      assert.ok(start > 0 && end > start);
      const darkRows = await page.evaluate(
        async (bytes) => {
          const img = new Image();
          img.src = 'data:image/jpeg;base64,' + bytes;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const cx = c.getContext('2d');
          cx.drawImage(img, 0, 0);
          const roi = cx.getImageData(c.width * 0.35, c.height * 0.26, c.width * 0.3, c.height * 0.14);
          let rows = 0;
          for (let y = 0; y < roi.height; y++)
            for (let x = 0; x < roi.width; x++) {
              if (roi.data[(y * roi.width + x) * 4] < 180) {
                rows++;
                break;
              }
            }
          return rows / roi.height;
        },
        b.subarray(start, end + 2).toString('base64'),
      );
      assert.ok(darkRows > 0.45, 'FDI outlines visible in the downloaded order map');
    }
    if (process.env.DESIGN_SCREENSHOT_DIR) {
      await mkdir(process.env.DESIGN_SCREENSHOT_DIR, { recursive: true });
      await d.saveAs(process.env.DESIGN_SCREENSHOT_DIR + '/twin-rails-' + file + '.pdf');
    }
  }
  await click('#new-sheet');
  await step('design');
  if (!(await $('#load-saved-design').isVisible())) await click('#step-design .library summary');
  await $('#saved-design-templates').selectOption({ index: 1 });
  await click('#load-saved-design');
  s = await state();
  assert.equal(s.gems.length + s.ink.length + s.groups.length, 0);
  assert.equal(await $('#apply-design').isVisible(), false);
  await tool('pave');
  await tap(31);
  await tap(32, 0.35, 0.4);
  assert.equal((await state()).groups.length, 0, 'do not issue an incomplete recipe');
  await tool('gem');
  await tap(32, 0.7, 0.65);
  s = await state();
  assert.equal(s.gems.at(-1).cut, 'pear');
  assert.equal(s.gems.at(-1).color, 'pink');
  assert.deepEqual(s.designLayers[0].teeth, [31, 32]);
  assert.equal(s.groups.length, 2);
  assert.equal((await priced()).designs[0].subtotal, first.designs[0].subtotal);
  // Cloud reopen keeps the order drawing AND its limits; the library stays geometry-free.
  await click('#save-draft');
  await page.waitForURL(/sheet=EGZ/);
  await page.reload();
  await page.waitForFunction(() => window.__testSheet.gems.length === 3);
  await step('design');
  let before = await snapshot();
  await tool('pave');
  await path(32, [
    [0.22, 0.6],
    [0.75, 0.6],
  ]);
  await $('#extra-design-dialog').waitFor({ state: 'visible' });
  assert.equal(await snapshot(), before, 'no partial stamps');
  if (process.env.DESIGN_SCREENSHOT_DIR)
    await page.screenshot({ path: process.env.DESIGN_SCREENSHOT_DIR + '/recipe-consent.png' });
  await click('#extra-design-dialog [value="cancel"]');
  assert.equal(await snapshot(), before);
  await tool('gem-edit');
  await tap(32, 0.7, 0.65);
  assert.ok((await state()).selectedGemId);
  before = await snapshot();
  await across(32, 33, [0.7, 0.65], [0.5, 0.45]);
  await $('#extra-design-dialog').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  assert.equal(await snapshot(), before, 'no speculative cross-tooth drag');
  await click('#delete-selected-gem');
  assert.equal((await state()).groups.length, 0, 'removing a required stone unprices its recipe');
  await tool('gem');
  await tap(32, 0.7, 0.65);
  assert.equal((await priced()).designs[0].subtotal, first.designs[0].subtotal);
  await tool('gem-edit');
  await tap(32, 0.7, 0.65);
  before = await snapshot();
  await click('[data-size-step="0.5"]');
  await page.keyboard.press('Escape');
  assert.equal(await snapshot(), before);
  await click('[data-size-step="0.5"]');
  await $('#extra-name').fill('Twin rails rose');
  await click('#extra-design-dialog [value="create"]');
  await page.waitForFunction(() => window.__testSheet.designLayers[0].name === 'Twin rails rose');
  s = await state();
  assert.equal(s.designLayers.length, 1);
  assert.equal(s.gems.length, 3);
  assert.equal(s.gems.at(-1).sizeMm, 2);
  assert.deepEqual(await library(), savedLibrary);
  assert.equal(s.groups.length, 0, 'the new specification needs review');
  await click('#apply-design');
  await click('#save-design-details');
  assert.equal((await priced()).designs[0].line.name, 'Twin rails rose');
  // Independent synthetic library records to exercise cross-slot gestures and
  // the fork path BEFORE the saved slots are filled. No live studio records.
  await click('#new-sheet');
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.__fixture),
      rail = (material, color, sizeMm) => ({
        material,
        detail: { level: '0.5' },
        stones: [{ tool: 'pave', cut: 'round', color, sizeMm, count: 25 }],
      });
    db.design_templates.twoTone = {
      schema: 2,
      name: 'Two metals',
      mode: 'mix',
      slots: [rail('silver', 'clear', 1), rail('gold', 'blue', 2.5)],
    };
    db.design_templates.effects = {
      schema: 2,
      name: 'Three finishes',
      mode: 'mix',
      slots: [
        {
          material: 'chrome',
          detail: { level: '3', plating: 'Rose gold', engraving: 'Medium' },
          colors: ['#df3355'],
          laser: true,
          emboss: true,
        },
        { material: 'gold', detail: { level: '4', karat: '21K' } },
      ],
    };
    localStorage.__fixture = JSON.stringify(db);
  });
  await page.reload();
  const load = async (id) => {
    await step('design');
    if (!(await $('#load-saved-design').isVisible())) await click('#step-design .library summary');
    await $('#saved-design-templates').selectOption(id);
    await click('#load-saved-design');
  };
  await load('twoTone');
  await tool('pave');
  await across(11, 21);
  s = await state();
  assert.deepEqual(s.designLayers[0].teeth, [11, 21]);
  for (const [tooth, color, mm] of [
    [11, 'clear', 1],
    [21, 'blue', 2.5],
  ]) {
    const stones = s.gems.filter((g) => g.tooth === tooth);
    assert.ok(stones.length >= 2);
    assert.ok(stones.every((g) => g.color === color && g.sizeMm === mm));
  }
  assert.equal(s.groups.length, 2);
  await click('#undo-ink');
  s = await state();
  assert.deepEqual(s.designLayers[0].teeth, []);
  assert.equal(s.gems.length + s.groups.length, 0);
  await tool('draw');
  await across(11, 21);
  const tones = await page.evaluate(() => {
    const c = document.querySelector('#ink-layer'),
      svg = document.querySelector('#teeth-chart-root'),
      v = svg.viewBox.baseVal,
      k = Math.min(c.width / v.width, c.height / v.height);
    return [11, 21].map((id) => {
      const b = svg.querySelector(`[data-tooth="${id}"]`).getBBox(),
        d = c
          .getContext('2d')
          .getImageData(
            (b.x - v.x) * k + (c.width - v.width * k) / 2,
            (b.y - v.y) * k + (c.height - v.height * k) / 2,
            b.width * k,
            b.height * k,
          ).data;
      let sum = 0,
        n = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i + 3] > 150) {
          sum += d[i] - d[i + 2];
          n++;
        }
      return n ? sum / n : null;
    });
  });
  assert.ok(tones[0] < 0 && tones[1] > 35, 'one stroke uses each tooth’s own metal: ' + tones);
  await click('#new-sheet');
  await load('effects');
  await tool('enamel');
  await tap(41);
  assert.deepEqual((await state()).ink[0].colors, ['#df3355']);
  before = await snapshot();
  await tap(42);
  await $('#extra-design-dialog').waitFor({ state: 'visible' });
  await click('#extra-design-dialog [value="cancel"]');
  assert.equal(await snapshot(), before);
  for (const effect of ['laser', 'emboss']) {
    await tool(effect);
    await path(41, [
      [0.3, 0.4],
      [0.7, 0.6],
    ]);
  }
  await tool('gem');
  before = await snapshot();
  await tap(41);
  assert.ok(await $('#extra-metal-label').isVisible());
  await click('#extra-design-dialog [value="cancel"]');
  assert.equal(await snapshot(), before);
  await tap(41);
  await $('#extra-metal').selectOption('silver');
  await $('#extra-name').fill('Silver accent');
  await click('#extra-design-dialog [value="create"]');
  await page.waitForFunction(() => window.__testSheet.designLayers[0].name === 'Silver accent');
  assert.equal((await state()).designLayers[0].remainingSlots[0].material, 'gold');
  await click('[data-material="titanium"]');
  await tool('draw');
  await tap(42);
  await click('#apply-design');
  assert.equal(await $('[data-fork-metal="41"]').inputValue(), 'Sterling Silver 925');
  assert.equal(await $('[data-fork-metal="42"]').inputValue(), 'Titanium');
  assert.equal(await $('[data-row="42"][data-detail="level"]').inputValue(), '4');
  await click('#save-design-details');
  s = await state();
  const detail = s.groups.find((g) => g.teeth.includes(41));
  assert.equal(detail.productionEffect, 'emboss');
  assert.equal(detail.engraving, 'Medium');
  assert.equal(detail.enamel, 'Single colour');
  assert.equal(detail.plating, 'Rose gold');
  assert.equal((await library()).effects.slots[0].material, 'chrome');
  // Same details created independently, on different FDI: propose only the
  // library name at naming time. No artwork is copied or priced twice.
  await click('#new-sheet');
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.__fixture);
    d.design_templates.scorpion = {
      schema: 2,
      name: 'Scorpion',
      slots: [{ material: 'silver', detail: { level: '5', plating: 'Rose gold' } }],
    };
    localStorage.__fixture = JSON.stringify(d);
  });
  await page.reload();
  await step('design');
  await click('[data-material="silver"]');
  await tap(43);
  await click('#apply-design');
  await tap(43);
  await click('#apply-design');
  await $('[data-row="all"][data-detail="level"]').selectOption('5');
  await $('[data-row="all"][data-detail="plating"]').selectOption('Rose gold');
  await $('#review-name').focus();
  await $('#match-design-dialog').waitFor({ state: 'visible' });
  assert.equal(await $('#match-title').innerText(), 'Is this Scorpion?');
  if (process.env.DESIGN_SCREENSHOT_DIR)
    await page.screenshot({ path: process.env.DESIGN_SCREENSHOT_DIR + '/design-name-match.png' });
  assert.equal((await state()).groups.length, 0);
  await click('#match-design-dialog [value="use"]');
  await page.waitForFunction(() => document.querySelector('#review-name').value === 'Scorpion');
  await click('#save-design-details');
  s = await state();
  assert.equal(s.groups[0].name, 'Scorpion');
  assert.equal(s.groups.length, 1);
  assert.deepEqual(s.groups[0].teeth, [43]);
  assert.equal(s.ink.length, 1);
  assert.deepEqual(errors, []);
  console.log(
    'PASS spaced, retraced and crossing pavé; per-tooth Bars vs counted diamonds; grouped PDFs; redraw on different FDI, scoped stone edits, complete rollback and named fork after cloud reopen',
  );
} finally {
  await browser.close();
}
