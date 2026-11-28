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

  function serviceCatalog(engine) {
    const cfg = engine.get(),
      labels = engine.LABELS;
    return Object.fromEntries([
      ...Object.entries(cfg.servicePrices)
        .filter(([k]) => k !== 'custom')
        .map(([k, price]) => [k, { name: labels.service[k] || k, price }]),
      ...Object.entries(cfg.moldFlat)
        .filter(([k]) => k !== 'none')
        .map(([k, price]) => ['mold:' + k, { name: 'Mold — ' + (labels.mold[k] || k), price }]),
    ]);
  }
  // Mold choices use the same settings/pricing.moldFlat table edited in EditX.
  // In an issued quote they are ordinary service rows, never a second flat fee.
  function serviceSpec(s, engine) {
    if (!s.type?.startsWith('mold:')) return s;
    const mold = serviceCatalog(engine)[s.type];
    return { ...s, type: 'custom', name: s.name || mold?.name, unitPrice: s.unitPrice ?? mold?.price };
  }
  function build(state, engine) {
    const cfg = engine.get(),
      issues = new Set(),
      designs = new Map(),
      extras = new Map();
    function checkRate(table, obj) {
      if (cfg[table][obj.type] == null && !supplied(obj.customPrice))
        issues.add(
          `Set a ${engine.LABELS.accentType[obj.type] || obj.type} stone rate in EditX pricing or enter its unit price.`,
        );
    }
    for (const g of state.groups || []) {
      const teeth = [...new Set((g.teeth || []).map(Number))];
      if (!teeth.length) continue;
      const layerId = g.layerId || g.id;
      if (!designs.has(layerId))
        designs.set(layerId, { designId: layerId, name: g.name || 'Design', groups: [] });
      const mat = material(g.material),
        precious = engine.allowsStones(mat);
      if (mat === 'gold' && !(cfg.goldPrice > 0))
        issues.add('Gold rate unavailable. Refresh studio pricing before issuing this quote.');
      const base = {
        material: mat,
        level: engine.levelKey(g.level),
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
        const fill = g.pricedIce?.[id];
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
        for (const gem of precious ? (g.pricedStones || []).filter((s) => Number(s.tooth) === id) : []) {
          const accent = {
            type: stone(gem.stoneType || 'CZ'),
            setting: setting(g.setting),
            cut: cut(gem.cut),
            size: engine.cleanSize(gem.sizeMm),
            count: 1,
          };
          if (supplied(gem.customPrice)) accent.customPrice = Number(gem.customPrice);
          checkRate('accentPrice', accent);
          const batch = JSON.stringify([layerId, teeth, b, mat, accent, gem.color]);
          if (!extras.has(batch))
            extras.set(batch, {
              material: mat,
              accent,
              teeth: new Set(),
              groupSize: teeth.length,
              count: 0,
              color: gem.color || 'clear',
              designId: layerId,
            });
          extras.get(batch).teeth.add(id);
          extras.get(batch).count += Math.max(1, Number(gem.count) || 1);
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
      designs.get(layerId).groups.push(...buckets.values());
    }
    const services = state.services.map((s) => serviceSpec(s, engine));
    for (const x of extras.values()) {
      const line = engine.calculateLine({ material: x.material, teeth: 1, accent: x.accent });
      services.push({
        type: 'custom',
        name: `Hand-set ${engine.LABELS.accentType[x.accent.type] || x.accent.type}`,
        forDesign: x.designId,
        forTeeth: [...x.teeth].map(fdi),
        qty: x.count,
        unitPrice: line.accentCost,
        notes: `${x.color} ${x.accent.cut}, ${x.accent.size} mm · ${engine.LABELS.setting[x.accent.setting] || x.accent.setting}${x.teeth.size === x.groupSize ? '' : ' · FDI ' + [...x.teeth].join(', ')}`,
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
  global.OrderPricing = { build, serviceCatalog, serviceSpec };
})(globalThis);
