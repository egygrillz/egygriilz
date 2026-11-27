/* Adapter, not a second calculator. The canvas uses FDI numbers and human
   labels; CalcEngine takes tooth groups and returns the issued amounts. */
(function (global) {
  'use strict';
  const key = (v) =>
    String(v || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const material = (v) => ({ cobaltchrome: 'chrome', sterlingsilver925: 'silver' })[key(v)] || key(v);
  const stone = (v) => ({ labgrowndiamond: 'labgrown', naturaldiamond: 'natural' })[key(v)] || key(v);
  const setting = (v) =>
    ({
      '2prong': 'twoprong',
      '3prong': 'threeprong',
      '4prong': 'fourprong',
      '6prong': 'sixprong',
      barsetting: 'bar',
    })[key(v)] ||
    key(v) ||
    'flush';
  const cut = (v) => (key(v) === 'straightbaguette' ? 'baguette' : key(v) || 'round');
  const fdi = (id) => ['', 'UR', 'UL', 'LL', 'LR'][Math.floor(id / 10)] + String(id % 10);
  const supplied = (v) => v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;

  function build(state, engine) {
    const cfg = engine.get(),
      issues = new Set(),
      designs = new Map(),
      extras = new Map();
    const gems = new Map(),
      ice = new Map();
    for (const g of state.gems || []) {
      const k = `${g.designId}:${g.tooth}`;
      if (g.kind === 'iced') {
        if (!ice.has(k)) ice.set(k, g);
      } else {
        if (!gems.has(k)) gems.set(k, []);
        gems.get(k).push(g);
      }
    }
    for (const i of state.icedTeeth || []) {
      const k = `${i.designId}:${i.tooth}`;
      if (i.count !== 0 && !ice.has(k)) ice.set(k, {});
    }
    function checkRate(table, obj) {
      if (cfg[table][obj.type] == null && !supplied(obj.customPrice))
        issues.add(
          `Set a ${engine.LABELS.accentType[obj.type] || obj.type} stone rate in EditX pricing or enter its unit price.`,
        );
    }
    for (const g of state.groups || []) {
      const teeth = [...new Set((g.teeth || []).map(Number))];
      if (!teeth.length) continue;
      const id = g.layerId || g.id,
        layer = state.designLayers.find((l) => l.id === id);
      if (!designs.has(id)) designs.set(id, { name: layer?.name || g.name || 'Design', groups: [] });
      const mat = material(g.material),
        precious = engine.allowsStones(mat);
      if (mat === 'gold' && !(cfg.goldPrice > 0))
        issues.add('Gold rate unavailable. Refresh studio pricing before issuing this quote.');
      const base = {
        label: g.name,
        material: mat,
        level: String(g.level || '1').split(' ')[0],
        plating: key(g.plating) || 'none',
        enamel:
          { singlecolour: 'single', multicolour: 'multi', masterwork: 'master' }[key(g.enamel)] || 'none',
        engraving: key(g.engraving) || 'none',
      };
      if (mat === 'gold') base.karat = String(g.karat || '18').replace(/\D/g, '');
      // Split partial iced coverage only where the full-stone spec differs.
      // A group-wide accent count is applied ONCE, not once per split tooth.
      const buckets = new Map();
      for (const id of teeth) {
        const k = `${g.layerId}:${id}`,
          fill = ice.get(k);
        const full =
          precious && (fill || ['full', 'both'].includes(g.stoneMode))
            ? {
                type: stone(fill?.stoneType || g.diamondType || 'Moissanite'),
                coverage: key(g.coverage || 'Standard pavé'),
                cut: cut(fill?.cut || g.fullCut),
                size: engine.cleanSize(fill?.sizeMm || g.fullSize),
              }
            : null;
        if (full) {
          const price = supplied(fill?.customPrice) ? fill.customPrice : g.fullCustomPrice;
          if (supplied(price)) full.customPrice = Number(price);
          if (base.level !== '0.5') checkRate('fullPrice', full);
        }
        const b = JSON.stringify(full);
        if (!buckets.has(b)) buckets.set(b, { ...base, ...(full && { full }), teeth: 0, toothIds: [] });
        const spec = buckets.get(b);
        spec.teeth++;
        spec.toothIds.push(fdi(id));
        for (const gem of precious ? gems.get(k) || [] : []) {
          const accent = {
            type: stone(gem.stoneType || 'CZ'),
            setting: setting(g.setting),
            cut: cut(gem.cut),
            size: engine.cleanSize(gem.sizeMm),
            count: 1,
          };
          if (supplied(gem.customPrice)) accent.customPrice = Number(gem.customPrice);
          checkRate('accentPrice', accent);
          const batch = JSON.stringify([g.layerId, mat, accent, gem.color]);
          if (!extras.has(batch))
            extras.set(batch, {
              material: mat,
              accent,
              teeth: new Set(),
              count: 0,
              color: gem.color || 'clear',
              design: g.name || 'Design',
            });
          extras.get(batch).count++;
          extras.get(batch).teeth.add(id);
        }
      }
      if (precious && ['accent', 'both'].includes(g.stoneMode)) {
        const accent = {
          type: stone(g.accentType || 'CZ'),
          setting: setting(g.setting),
          cut: cut(g.accentCut),
          size: engine.cleanSize(g.accentSize),
          count: Math.max(1, Math.round(g.accentCount || 1)),
        };
        if (supplied(g.accentCustomPrice)) accent.customPrice = Number(g.accentCustomPrice);
        checkRate('accentPrice', accent);
        buckets.values().next().value.accent = accent;
      }
      designs.get(id).groups.push(...buckets.values());
    }
    const services = [...state.services];
    for (const x of extras.values()) {
      const line = engine.calculateLine({ material: x.material, teeth: 1, accent: x.accent });
      services.push({
        type: 'custom',
        name: `Hand-set ${engine.LABELS.accentType[x.accent.type] || x.accent.type} · ${x.design}`,
        qty: x.count,
        unitPrice: line.accentCost,
        notes: `${x.color} ${x.accent.cut}, ${x.accent.size} mm · ${engine.LABELS.setting[x.accent.setting] || x.accent.setting} · FDI ${[...x.teeth].join(', ')}`,
      });
    }
    const manual = state.priceMode === 'manual',
      manualDeposit = state.depositAuto === false;
    if (manual && (!supplied(state.price) || !Number.isInteger(Number(state.price))))
      issues.add('Enter an agreed total in whole EGP, or switch back to the calculator.');
    const order = engine.calculateOrder([...designs.values()], {
      services,
      timeline: state.timeline || 'standard',
      mold: state.mold || 'none',
      agreedTotal: manual && supplied(state.price) ? state.price : null,
      depositAmount: manualDeposit ? state.deposit : null,
    });
    if (
      manualDeposit &&
      (!supplied(state.deposit) ||
        !Number.isInteger(Number(state.deposit)) ||
        Number(state.deposit) > order.total)
    )
      issues.add('Enter a deposit in whole EGP between zero and the total.');
    return { order, issues: [...issues] };
  }
  global.OrderPricing = { build };
})(globalThis);
