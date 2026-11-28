/* A library recipe describes ordered tooth SLOTS, never fixed FDI positions or artwork.
   Orders still store their own editable drawing. The first mark on a new tooth binds
   the next slot, so mixed-material recipes work on a different arch too. */
(function (root) {
  'use strict';
  const cleanName = (v) =>
    String(v || 'Design')
      .trim()
      .slice(0, 60) || 'Design';
  const detail = (obj) => ({
    ...Object.fromEntries(
      Object.entries(root.OrderDesign.defaults).map(([k, v]) => [
        k,
        ['string', 'number'].includes(typeof obj?.[k]) ? obj[k] : v,
      ]),
    ),
    level: root.CalcEngine.levelKey(obj?.level),
    engraving:
      typeof obj?.engraving === 'string' && obj.engraving && obj.engraving !== 'None'
        ? obj.engraving
        : root.OrderDesign.defaults.engraving,
  });
  const brush = (g) => ({
    cut: String(g?.cut || 'round'),
    color: String(g?.color || 'clear'),
    sizeMm: Math.max(0.5, Math.min(5, Number(g?.sizeMm) || 1.5)),
  });
  const kind = (g) => (g.kind === 'pave' ? 'pave' : 'gem');
  const signature = (tool, g) => JSON.stringify([tool, ...Object.values(brush(g))]);
  function fromLayer(layer, state, groups) {
    if (!layer.teeth?.length || layer.teeth.length > 32) throw Error('A recipe needs one to 32 tooth slots.');
    const slots = layer.teeth.map((tooth) => {
      const g = groups.find((g) => g.teeth?.includes(tooth)) || {};
      const marks = (state.ink || []).filter(
        (s) =>
          (!s.designId || s.designId === layer.id) &&
          (s.touchedTeeth?.length ? s.touchedTeeth : [s.tooth]).includes(tooth),
      );
      const stones = (state.gems || []).filter(
        (s) => (!s.designId || s.designId === layer.id) && Number(s.tooth) === tooth,
      );
      const batches = new Map();
      const batch = (tool, s, count) => {
        const key = signature(tool, s);
        if (!batches.has(key)) batches.set(key, { tool, ...brush(s), count: 0 });
        batches.get(key).count += count;
      };
      for (const s of stones) if (s.kind !== 'iced') batch(kind(s), s, 1);
      if (!batches.size)
        for (const s of g.pricedStones || []) if (Number(s.tooth) === tooth) batch('gem', s, s.count || 1);
      if (
        (g.stoneMode === 'accent' || g.stoneMode === 'both') &&
        Number(g.teeth[0]) === tooth &&
        g.accentCount
      )
        batch('gem', { cut: g.accentCut, sizeMm: g.accentSize || 1 }, Number(g.accentCount));
      const d = detail({ ...g, ...layer.details?.[layer.mode === 'mix' ? tooth : 'all'] });
      const isBarLine = root.OrderDesign.isBar(d.level) && stones.some((s) => s.kind === 'pave');
      const oldFill = (state.icedTeeth || []).some(
        (i) => (!i.designId || i.designId === layer.id) && Number(i.tooth) === tooth && i.count !== 0,
      );
      const ice =
        stones.find((s) => s.kind === 'iced') ||
        g.pricedIce?.[tooth] ||
        (oldFill || (['full', 'both'].includes(g.stoneMode) && !isBarLine)
          ? { cut: g.fullCut, sizeMm: g.fullSize || 1 }
          : null);
      return {
        material: layer.materials?.[tooth] || g.material || 'chrome',
        detail: d,
        laser:
          marks.some((s) => s.effect === 'laser' && s.laserStyle !== 'cutout') ||
          (g.engraving && g.engraving !== 'None' && !marks.some((s) => s.laserStyle === 'cutout')) ||
          false,
        white: marks.some((s) => s.effect === 'laser' && s.laserStyle === 'cutout'),
        emboss: marks.some((s) => s.effect === 'emboss') || g.productionEffect === 'emboss',
        colors: (marks.filter((s) => s.effect === 'enamel').at(-1)?.colors || g.enamelColors || [])
          .map(root.OrderDesign.hex)
          .filter(Boolean),
        stones: [...batches.values()],
        ice: ice ? brush(ice) : null,
      };
    });
    return { schema: 2, name: cleanName(layer.name), mode: layer.mode === 'mix' ? 'mix' : 'single', slots };
  }
  function read(doc) {
    if (doc.schema == null || doc.schema === 1) return fromLayer(doc, doc, doc.groups || []); // read old library entries as specs only
    if (doc.schema !== 2 || !Array.isArray(doc.slots) || !doc.slots.length || doc.slots.length > 32)
      throw Error('Invalid tooth slots');
    return {
      schema: 2,
      name: cleanName(doc.name),
      mode: doc.mode === 'mix' ? 'mix' : 'single',
      slots: doc.slots.map((s) => ({
        material: typeof s.material === 'string' ? s.material : 'chrome',
        detail: detail(s.detail),
        laser: !!s.laser,
        white: !!s.white,
        emboss: !!s.emboss,
        colors: (s.colors || []).map(root.OrderDesign.hex).filter(Boolean),
        ice: s.ice ? brush(s.ice) : null,
        stones: (s.stones || []).map((g) => ({
          tool: g.tool === 'pave' ? 'pave' : 'gem',
          ...brush(g),
          count: Math.max(1, Math.min(220, Math.round(g.count) || 1)),
        })),
      })),
    };
  }
  const teethAfter = (layer, actions) => [
    ...new Set([...layer.teeth, ...actions.map((a) => a.tooth).filter(Boolean)]),
  ];
  const slotAt = (layer, tooth, teeth = layer.teeth) =>
    layer.recipe?.slots[teeth.includes(tooth) ? teeth.indexOf(tooth) : teeth.length];
  // The cursor is temporary: crossing into a new tooth or the next saved
  // batch within ONE gesture must not consume a slot until the user accepts it.
  function brushCursor(layer, tool, gems) {
    const teeth = [...layer.teeth],
      counts = new Map();
    const key = (id, g) => id + ':' + signature(tool, g);
    const count = (g) => {
      const k = key(g.tooth, g);
      counts.set(k, (counts.get(k) || 0) + 1);
    };
    for (const g of gems) if (g.designId === layer.id && g.kind !== 'iced' && kind(g) === tool) count(g);
    return {
      at(tooth) {
        const slot = slotAt(layer, tooth, teeth);
        if (tool === 'ice') return slot?.ice;
        const choices = slot?.stones.filter((s) => s.tool === tool) || [];
        return choices.find((b) => (counts.get(key(tooth, b)) || 0) < b.count) || choices[0];
      },
      place(g) {
        if (!teeth.includes(g.tooth)) teeth.push(g.tooth);
        count(g);
      },
    };
  }
  const savedBrush = (layer, tooth, tool, gems) => brushCursor(layer, tool, gems).at(tooth);
  // Check the whole proposed gesture before changing the layer, including every
  // candidate in a pavé line. A rejected line must not leave even one billed stone.
  function problem(layer, actions, gems, excludeId) {
    const teeth = teethAfter(layer, actions);
    if (teeth.length > layer.recipe.slots.length)
      return `This design fits ${layer.recipe.slots.length} teeth. The new mark would use ${teeth.length}.`;
    const counts = new Map();
    const key = (tooth, tool, g) => tooth + ':' + signature(tool, g);
    for (const g of gems)
      if (g.designId === layer.id && g.kind !== 'iced' && g.id !== excludeId) {
        const k = key(g.tooth, kind(g), g);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    for (const a of actions) {
      const s = slotAt(layer, a.tooth, teeth),
        t = a.tool;
      if (
        ['laser', 'white', 'emboss', 'ice', 'enamel'].includes(t) &&
        !(t === 'enamel' ? s.colors.length : s[t])
      )
        return `${t === 'ice' ? 'Iced coverage' : t} is not in the saved details for this tooth.`;
      if (t === 'ice' && signature('ice', s.ice) !== signature('ice', a))
        return 'This iced setting uses a different stone size or colour.';
      if (t === 'gem' || t === 'pave') {
        const k = key(a.tooth, t, a),
          n = (counts.get(k) || 0) + 1;
        const batch = s.stones.find((b) => signature(b.tool, b) === signature(t, a));
        const limit = batch?.count || 0; // a saved quantity limit is independent of its billing basis
        if (n > limit)
          return `That diamond count, cut, size or colour is outside the saved specification for this tooth.`;
        counts.set(k, n);
      }
    }
    return '';
  }
  // Do not issue a saved recipe with its enamel, engraving or counted stones
  // silently missing. A Bars line has a coverage spec, not a billing quantity.
  function progress(layer, state) {
    const marks = state.ink.filter((m) => m.designId === layer.id),
      gems = state.gems.filter((g) => g.designId === layer.id);
    return layer.recipe.slots.map((s, i) => {
      const tooth = layer.teeth[i];

      const ink = marks.filter((m) => (m.touchedTeeth?.length ? m.touchedTeeth : [m.tooth]).includes(tooth));
      const gs = gems.filter((g) => g.tooth === tooth);

      const missing = [];
      if (s.laser && !ink.some((m) => m.effect === 'laser' && m.laserStyle !== 'cutout'))
        missing.push('laser engraving');
      if (s.white && !ink.some((m) => m.laserStyle === 'cutout')) missing.push('white cutout');
      if (s.emboss && !ink.some((m) => m.effect === 'emboss')) missing.push('emboss');
      if (s.colors.length && !ink.some((m) => m.effect === 'enamel')) missing.push('enamel fill');
      if (s.ice && !gs.some((g) => g.kind === 'iced')) missing.push('iced fill');
      for (const batch of s.stones) {
        const n = gs.filter(
          (g) => g.kind !== 'iced' && signature(kind(g), g) === signature(batch.tool, batch),
        ).length;
        const wanted = batch.tool === 'pave' && root.OrderDesign.isBar(s.detail.level) ? 1 : batch.count;
        if (n < wanted)
          missing.push(
            batch.tool === 'pave' && root.OrderDesign.isBar(s.detail.level)
              ? `iced-out bar: ${batch.color} pavé line (${batch.sizeMm} mm)`
              : `${wanted - n} ${batch.color} ${batch.cut} ${batch.tool === 'pave' ? 'pavé' : 'accent'} (${batch.sizeMm} mm)`,
          );
      }
      return (
        missing.join(', ') ||
        (!tooth ? 'Draw on an unused tooth' : !ink.length && !gs.length ? 'Redraw this tooth' : '')
      );
    });
  }
  // Compare production facts, not a client's tooth numbers, sketch, name or
  // the order in which the artist happened to select teeth/colours/stones.
  function matchKey(recipe) {
    const metal = (s) =>
      ({ 'Cobalt Chrome': 'chrome', 'Sterling Silver 925': 'silver', Gold: 'gold', Titanium: 'titanium' })[
        s
      ] || s;
    const rate = (v) => (v == null || v === '' ? null : Number(v));
    const designColors = new Set(recipe.slots.flatMap((s) => s.colors));
    return JSON.stringify(
      recipe.slots
        .map((s) => {
          const m = metal(s.material),
            d = s.detail,
            bar = root.OrderDesign.isBar(d.level),
            counted = s.stones.some((b) => b.tool !== 'pave' || !bar);
          return JSON.stringify([
            m,
            m === 'gold' ? d.karat : null,
            root.CalcEngine.levelKey(d.level),
            d.plating,
            s.laser,
            s.white,
            s.laser || s.white ? d.engraving : null,
            s.emboss,
            [...new Set(s.colors)].sort(),
            root.OrderDesign.tier(
              s.colors.length && recipe.mode !== 'mix' ? designColors.size : s.colors.length,
            ),
            s.ice && signature('ice', s.ice),
            s.ice && !bar ? [d.diamondType, d.coverage, rate(d.fullCustomPrice)] : null,
            counted ? [d.accentType, d.setting, rate(d.accentCustomPrice)] : null,
            s.stones.map((b) => JSON.stringify([signature(b.tool, b), b.count])).sort(),
          ]);
        })
        .sort(),
    );
  }
  root.OrderRecipe = {
    fromLayer,
    read,
    slotAt,
    teethAfter,
    savedBrush,
    brushCursor,
    problem,
    progress,
    signature,
    matchKey,
  };
})(globalThis);
