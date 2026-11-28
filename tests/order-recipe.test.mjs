import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/calc-engine.js';
import '../assets/order-design.js';
import '../assets/order-recipe.js';
import '../assets/order-pave.js';
import '../assets/order-pricing.js';
import '../assets/order-file.js';

const E = globalThis.CalcEngine,
  D = globalThis.OrderDesign,
  R = globalThis.OrderRecipe;
const brush = { cut: 'round', color: 'clear', sizeMm: 1.5 };
const gem = (tooth, kind = 'pave', extra = {}) => ({ designId: 'A', tooth, kind, ...brush, ...extra });
const layer = {
  id: 'A',
  name: 'Silver ribbons',
  mode: 'mix',
  teeth: [11, 21, 22],
  materials: { 11: 'silver', 21: 'silver', 22: 'silver' },
  details: { 11: { level: '0.5 Bars' }, 21: { level: '2 Open face' }, 22: { level: 'Bars' } },
};
const fresh = () => ({ groups: [], services: [], ink: [], gems: [], icedTeeth: [] });
const review = (s, l) => D.compile(l, D.inspect(s, l)).map((g) => ({ ...g, layerId: l.id }));
const amounts = (s) => OrderPricing.build(s, E).order;

test('pavé: straight-line pitch is diameter plus edge gap; retraces, turns and old, resized stones leave real clearance', () => {
  const unit = OrderPave.unitsPerMm,
    sizeMm = 2,
    gapMm = 0.8,
    radius = (sizeMm * unit) / 2;
  const pt = (x, y) => ({ x, y }),
    opts = { sizeMm, gapMm, existing: [], toothAt: () => 11, room: () => 220 };
  const straight = OrderPave.plan([pt(0, 0), pt(100, 0)], opts);
  assert.equal(straight.length, 8);
  for (let i = 1; i < straight.length; i++)
    assert.ok(Math.abs(straight[i].x - straight[i - 1].x - (sizeMm + gapMm) * unit) < 0.03);
  const existing = [
    { ...pt(36, 8), sizeMm: 1, visualSizeMm: 4, visualCut: 'princess' },
    { ...pt(12, 15), sizeMm: 3 },
  ];
  const path = [pt(0, 0), pt(97, 0), pt(97, 0), pt(61, 4), pt(0, 0), pt(50, 45), pt(85, -8), pt(0, 0)];
  const dots = OrderPave.plan(path, { ...opts, existing });
  assert.ok(dots.length >= 10);
  const check = (a, b, min) =>
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= min, JSON.stringify({ a, b, min }));
  dots.forEach((a, i) => {
    for (const b of dots.slice(0, i)) check(a, b, 2 * radius + gapMm * unit);
    check(a, existing[0], radius + (4 * unit * Math.SQRT2) / 2 + gapMm * unit);
    check(a, existing[1], radius + (3 * unit) / 2 + gapMm * unit);
  });
  assert.deepEqual(
    OrderPave.plan([pt(0, 0), pt(100, 0)], { ...opts, existing: straight.map((g) => ({ ...g, sizeMm })) }),
    [],
  );
  const limited = OrderPave.plan([pt(0, 0), pt(300, 0)], {
    ...opts,
    toothAt: (x) => (x < 80 ? 11 : x > 140 ? 21 : null),
    room: (id) => (id === 11 ? 1 : 3),
  });
  assert.deepEqual(
    limited.map((p) => p.tooth),
    [11, 21, 21, 21],
  );
  assert.ok(limited.slice(1).every((p) => p.x > 140));
});

test('Bars line = one iced rate per covered tooth, even with several lines and fill; other complexities count actual stones, accents stay independent', () => {
  E.reset();
  E.set({ barsStonesPerTooth: 517 });
  const s = fresh();
  s.gems = [gem(11), gem(11), gem(11, 'iced'), gem(11, 'placed'), gem(21), gem(21), gem(21), gem(22)];
  s.icedTeeth = [{ designId: 'A', tooth: 11, count: 1 }];
  s.groups = review(s, layer);
  assert.equal(D.oldBarCharges(s, layer, s.groups), false);
  const old = structuredClone(s.groups);
  old[0].pricedStones[0].count += 2;
  assert.equal(D.oldBarCharges(s, layer, old), true);
  const priced = amounts(s),
    { designs, services } = E.designBreakdown(priced);
  assert.equal(designs.length, 1);
  assert.deepEqual(services, []);
  const part = (id) => designs[0].groups.find((r) => r.group.toothIds.includes(id));
  assert.deepEqual(part('UR1').group.full, { bars: true });
  assert.equal(part('UR1').group.fullCost, 517);
  assert.equal(part('UL2').group.fullCost, 517);
  assert.equal(part('UL1').group.full, undefined);
  assert.deepEqual(
    part('UR1').stones.map((s) => s.qty),
    [1],
  );
  assert.deepEqual(
    part('UL1').stones.map((s) => s.qty),
    [3],
  );
  assert.equal(designs[0].subtotal, priced.servicesSubtotal + priced.linesSubtotal);
  const clone = structuredClone(layer);
  clone.details[21].level = '0.5';
  assert.deepEqual(amounts(s), priced); // changing the form is not applying it
  s.groups = review(s, clone);
  assert.equal(
    E.designBreakdown(amounts(s))
      .designs[0].groups.flatMap((g) => g.stones)
      .reduce((n, s) => n + s.qty, 0),
    1,
  );
  s.gems = s.gems.filter((g) => g.tooth !== 22);
  s.groups = review(s, clone);
  assert.equal(amounts(s).lines[0].groups.find((g) => g.toothIds.includes('UL2')).full, undefined);
});

test('display follows layer identity and tooth headings; PDF, breakdown and invoice never repeat the design title or duplicate setting charges', () => {
  E.reset();
  const s = fresh();
  s.gems = [gem(11), gem(21), gem(21)];
  s.groups = review(s, layer);
  s.groups.push({ ...s.groups[0], id: 'other', layerId: 'B', teeth: [31], pricedStones: [] }); // equal name, different design
  s.services = [{ type: 'consultation', qty: 1 }];
  const order = amounts(s),
    shown = E.designBreakdown(order);
  assert.equal(shown.designs.length, 2);
  assert.equal(shown.services.length, 1);
  const q = { order, id: 'demo', clientName: 'Test', date: '2026-11-27T10:20:00Z' };
  for (const [i, l] of order.lines.entries())
    for (const g of l.groups || [l]) g.label = i === 0 ? layer.name : ''; // historic group labels
  const doc = Buffer.from(E.buildQuotePdfBytes(order, q)).toString('latin1'),
    text = E.describeOrder(order);
  for (const output of [doc, text]) {
    assert.equal(output.split(layer.name).length - 1, 2);
    assert.match(output, /Iced-out bar/);
    assert.match(output, /FDI 21/);
    assert.match(output, /Open face/);
    assert.doesNotMatch(output, /\b(?:L?0\.5 Bars|L?2 Open face)\b/);
  }
  const inv = E.quoteToInvoice(q);
  assert.equal(inv.items.filter((i) => i.name === layer.name).length, 2);
  assert.match(inv.items[0].spec, /FDI 21: .*Hand-set CZ/);
  assert.ok(!inv.items[0].spec.includes(layer.name));
  assert.equal(inv.items[0].price, shown.designs[0].subtotal);
  assert.equal(inv.total, inv.items.reduce((n, i) => n + i.qty * i.price, 0) - inv.discountAmount);
  assert.deepEqual(['L0.5 Bars', 'Bars', '0.5 — Bars', 'Bar'].map(E.levelKey), ['0.5', '0.5', '0.5', '0.5']);
  assert.equal(E.levelName('L3 Detailed'), 'Mid detail');
});

test('library projects one layer and legacy clones into geometry-free slots; new orders still round-trip their actual art', () => {
  const l = structuredClone(layer);
  l.teeth = [11, 21];
  l.details[21] = {
    level: '2 Open face',
    plating: 'Rose gold',
    engraving: 'Medium',
    accentType: 'Natural diamond',
    accentCustomPrice: 329,
  };
  const s = fresh();
  s.gems = [
    gem(11),
    gem(21, 'placed', { cut: 'pear', color: 'pink', sizeMm: 2, x: 800.12, y: 192.42 }),
    gem(21, 'iced'),
    gem(21, 'placed', { designId: 'OTHER', color: 'black' }),
  ];
  s.ink = [
    { designId: 'A', tooth: 21, effect: 'enamel', colors: ['#ff4400'] },
    { designId: 'A', tooth: 21, effect: 'laser', points: [{ x: 34.12, y: 102.47 }], touchedTeeth: [11, 21] },
  ];
  s.groups = review(s, l);
  const recipe = R.fromLayer(l, s, s.groups);
  assert.equal(recipe.slots[1].detail.accentCustomPrice, 329);
  assert.equal(recipe.slots[1].ice.sizeMm, 1.5);
  assert.deepEqual(recipe.slots[1].stones, [
    { tool: 'gem', cut: 'pear', color: 'pink', sizeMm: 2, count: 1 },
  ]);
  assert.equal(recipe.slots[0].ice, null);
  const scan = (obj) => {
    for (const [key, v] of Object.entries(obj)) {
      assert.ok(
        ![
          'id',
          'designId',
          'layerId',
          'tooth',
          'teeth',
          'points',
          'xy',
          'x',
          'y',
          'gems',
          'ink',
          'groups',
          'orderNo',
          'label',
          'clientName',
        ].includes(key),
        key,
      );
      if (v && typeof v === 'object') scan(v);
    }
  };
  scan(recipe);
  assert.deepEqual(R.read({ ...recipe, orderNo: 'removed', ink: s.ink }), recipe);
  const legacy = {
    ...l,
    ...s,
    label: 'PRIVATE REF',
    updatedAt: '2025-01-01',
    ink: s.ink.map((m) => ({ ...m, designId: '' })),
    gems: s.gems.filter((g) => g.designId === 'A').map((g) => ({ ...g, designId: '' })),
  };
  assert.deepEqual(R.read(legacy), recipe);
  const order = OrderFile.unpack(OrderFile.pack({ ...s, designLayers: [l] }));
  assert.deepEqual(order.ink, s.ink);
  assert.equal(order.gems[1].x, 800.12);
  const bound = { id: 'B', recipe, teeth: [31] };
  const accent = { tool: 'gem', tooth: 32, color: 'pink', sizeMm: 2, cut: 'pear' };
  const before = JSON.stringify(bound);
  assert.equal(R.problem(bound, [accent], []), '');
  assert.match(R.problem(bound, [accent, accent], []), /count/);
  assert.match(R.problem(bound, [{ ...accent, color: 'blue' }], []), /colour/);
  assert.match(R.problem(bound, [accent, { tooth: 33, tool: 'draw' }], []), /fits 2/);
  assert.equal(R.problem(bound, [{ tooth: 31, tool: 'enamel' }], []).includes('not in'), true);
  const bar = { tooth: 31, tool: 'pave', ...brush };
  assert.match(R.problem(bound, [bar, bar], []), /count/);
  assert.equal(JSON.stringify(bound), before);
});

test('full transfer codes retain tooth/setting ownership even after reordering same-name designs', () => {
  E.reset();
  const s = fresh();
  s.gems = [gem(11), gem(21)];
  s.groups = review(s, layer);
  s.groups.push({ ...s.groups[0], layerId: 'other', teeth: [21], pricedStones: [] });
  s.services = [
    { type: 'custom', name: 'Polish', qty: 2, unitPrice: 51 },
    { type: 'custom', name: 'Fitting', qty: 1, unitPrice: 79 },
  ];
  const basis = amounts(s),
    source = E.calculateOrder(basis.lines, { ...basis, timeline: 'rush' }),
    code = E.encodeCode(source),
    spec = E.decodeCode(code);
  const reordered = E.calculateOrder(spec.lines.reverse(), spec),
    shown = E.designBreakdown(reordered);
  assert.deepEqual(
    shown.services.map((x) => [x.name, x.subtotal]),
    [
      ['Polish', 102],
      ['Fitting', 79],
    ],
  );
  assert.equal(shown.designs[0].groups[0].stones.length, 0);
  const attached = shown.designs[1].groups.find((r) => r.group.toothIds.includes('UL1')).stones;
  assert.deepEqual(
    attached.map(({ qty, notes }) => ({ qty, notes })),
    [{ qty: 1, notes: source.services.at(-1).notes }],
  );
  assert.equal(source.timelineAmount, reordered.timelineAmount);
  assert.equal(source.total, reordered.total);
  // The original format has names but no ownership array. Consume one index per service.
  const legacy =
    'EGZ-_|ux2@51.ux1@79~' + Buffer.from(JSON.stringify({ s: ['Polish', 'Fitting'] })).toString('base64url');
  assert.deepEqual(
    E.decodeCode(legacy).services.map((s) => s.name),
    ['Polish', 'Fitting'],
  );
});

test('one line can use two saved slots and a change of brush inside a slot without mutating the layer', () => {
  const stamp = (sizeMm, color, count) => ({ tool: 'pave', sizeMm, color, cut: 'round', count });
  const recipe = R.read({
    schema: 2,
    slots: [
      { material: 'silver', stones: [stamp(1, 'clear', 2), stamp(2, 'aqua', 40)] },
      { material: 'gold', stones: [stamp(3, 'pink', 40)] },
    ],
  });
  const l = { id: 'new layer', recipe, teeth: [] },
    c = R.brushCursor(l, 'pave', []);
  const dots = OrderPave.plan(
    [
      { x: 0, y: 0 },
      { x: 180, y: 0 },
    ],
    {
      sizeMm: 1,
      gapMm: 0.8,
      existing: [],
      room: () => 220,
      toothAt: (x) => (x < 80 ? 41 : 31),
      brushAt: c.at,
      onPlace: c.place,
    },
  );
  assert.deepEqual(
    dots.slice(0, 3).map((p) => p.color),
    ['clear', 'clear', 'aqua'],
  );
  assert.ok(dots.filter((p) => p.tooth === 31).length > 2);
  assert.ok(dots.filter((p) => p.tooth === 31).every((p) => p.color === 'pink' && p.sizeMm === 3));
  for (let i = 1; i < dots.length; i++)
    assert.ok(
      dots[i].x - dots[i - 1].x >= (0.8 + (dots[i].sizeMm + dots[i - 1].sizeMm) / 2) * OrderPave.unitsPerMm,
    );
  assert.equal(
    R.problem(
      l,
      dots.map((p) => ({ ...p, tool: 'pave' })),
      [],
    ),
    '',
  );
  assert.deepEqual(l.teeth, []);
});

test('partial fill in a legacy mixed library entry is not promoted to ice on untouched teeth', () => {
  const recipe = R.read({
    name: 'Two caps',
    teeth: [21, 22],
    materials: { 21: 'silver', 22: 'silver' },
    groups: [
      { teeth: [21, 22], level: 'Solid', stoneMode: 'none', pricedIce: { 21: { cut: 'pear', sizeMm: 2 } } },
    ],
    icedTeeth: [{ tooth: 22, count: 0 }],
    ink: [{ tooth: 21, effect: 'laser', laserStyle: 'cutout' }],
  });
  assert.equal(recipe.slots[0].ice.cut, 'pear');
  assert.equal(recipe.slots[0].white, true);
  assert.equal(recipe.slots[0].laser, false);
  assert.equal(recipe.slots[1].ice, null);
  assert.equal(recipe.slots[1].white, false);
  assert.throws(() => R.read({ ...recipe, schema: 99 }));
});

test('name suggestion compares effective specifications, not names/FDI/selection order or unused controls', () => {
  const plain = { material: 'silver', detail: { level: 'Scorpion' }, colors: ['#ff0000'] };
  const stone = {
    material: 'Gold',
    detail: { level: '2 Open face', karat: '14K' },
    colors: ['#ffffff'],
    stones: [{ tool: 'gem', color: 'pink', sizeMm: 2, cut: 'pear', count: 2 }],
  };
  const key = (slots, mode = 'mix') => R.matchKey(R.read({ schema: 2, name: 'unrelated', mode, slots }));
  const expected = key([plain, stone]);
  assert.equal(
    key([stone, { ...plain, detail: { level: '5', karat: '10K', coverage: 'ignored' } }]),
    expected,
  );
  assert.notEqual(key([plain, stone], 'single'), expected);
  assert.notEqual(key([plain, { ...stone, detail: { ...stone.detail, karat: '18K' } }]), expected);
  assert.notEqual(key([plain, { ...stone, stones: [{ ...stone.stones[0], count: 1 }] }]), expected);
  assert.notEqual(key([plain]), expected);
});
