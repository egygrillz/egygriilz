/* Drawing facts -> review form -> priced specification. Geometry and unfinished
   work never become calculator input. One charge per applicable FDI tooth. */
(function (root) {
  'use strict';
  const materials = {
    chrome: 'Cobalt Chrome',
    silver: 'Sterling Silver 925',
    gold: 'Gold',
    titanium: 'Titanium',
  };
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);
  const tier = (n) => (n < 1 ? 'None' : n === 1 ? 'Single colour' : n === 2 ? 'Multi-colour' : 'Master work');
  const defaults = {
    karat: '18K',
    level: '1 Solid',
    plating: 'None',
    engraving: 'Small',
    accentType: 'CZ',
    setting: 'Flush',
    diamondType: 'Moissanite',
    coverage: 'Standard pavé',
    accentCustomPrice: '',
    fullCustomPrice: '',
  };
  function inspect(state, layer) {
    const teeth = new Map(
      layer.teeth.map((t) => [
        Number(t),
        { colors: new Set(), laser: false, emboss: false, stones: [], ice: null },
      ]),
    );
    for (const s of state.ink || []) {
      if (s.designId !== layer.id) continue;
      for (const id of s.touchedTeeth?.length ? s.touchedTeeth : [s.tooth]) {
        const tooth = teeth.get(Number(id));
        if (!tooth) continue;
        if (s.effect === 'enamel') tooth.colors = new Set((s.colors || []).map(hex).filter(Boolean));
        if (s.effect === 'laser') tooth.laser = true;
        if (s.effect === 'emboss') tooth.emboss = true;
      }
    }
    for (const g of state.gems || []) {
      const t = teeth.get(Number(g.tooth));
      if (!t || g.designId !== layer.id) continue;
      if (g.kind === 'iced') t.ice ||= g;
      else t.stones.push(g);
    }
    for (const i of state.icedTeeth || []) {
      const t = teeth.get(Number(i.tooth));
      if (t && i.designId === layer.id && i.count !== 0) t.ice ||= {};
    }
    return teeth;
  }
  function compile(layer, facts) {
    const groups = new Map();
    const designColors = new Set([...facts.values()].flatMap((f) => [...f.colors]));
    for (const [tooth, f] of facts) {
      const d = { ...defaults, ...layer.details?.[layer.mode === 'mix' ? tooth : 'all'] };
      const colors = [...f.colors].sort();
      const material = materials[layer.materials[tooth]] || layer.materials[tooth] || materials.chrome;
      const spec = {
        material,
        karat: d.karat || '18K',
        level: d.level,
        plating: d.plating,
        enamel: tier(colors.length && layer.mode !== 'mix' ? designColors.size : colors.length),
        enamelColors: colors,
        engraving: f.laser ? d.engraving : 'None',
        productionEffect: f.emboss ? 'emboss' : f.laser ? 'laser' : 'standard',
        stoneMode: f.ice ? 'full' : 'none',
        ...(f.ice && {
          diamondType: d.diamondType,
          coverage: d.coverage,
          fullCustomPrice: d.fullCustomPrice,
          fullCut: f.ice.cut || 'round',
          fullSize: f.ice.sizeMm || '1',
        }),
        ...(f.stones.length && { setting: d.setting }),
      };
      const key = JSON.stringify(spec);
      if (!groups.has(key)) groups.set(key, { name: layer.name, ...spec, teeth: [], pricedStones: [] });
      const g = groups.get(key);
      g.teeth.push(tooth);
      const batches = new Map();
      for (const gem of f.stones) {
        const stone = {
          tooth,
          stoneType: d.accentType,
          customPrice: d.accentCustomPrice,
          cut: gem.cut || 'round',
          color: gem.color || 'clear',
          sizeMm: gem.sizeMm || '1',
        };
        const k = JSON.stringify(stone);
        if (!batches.has(k)) batches.set(k, { ...stone, count: 0 });
        batches.get(k).count++;
      }
      g.pricedStones.push(...batches.values());
    }
    return [...groups.values()];
  }
  // Old local drafts/templates priced the canvas directly. Freeze that exact
  // breakdown once (including partial ice and preset accents), not every render.
  function migrateLegacy(state) {
    for (const g of state.groups) {
      if (Array.isArray(g.pricedStones)) continue;
      g.pricedStones = [];
      g.pricedIce = {};
      for (const gem of state.gems || []) {
        if (gem.designId !== g.layerId || !g.teeth.includes(Number(gem.tooth))) continue;
        const { tooth, stoneType, cut, color, sizeMm, customPrice } = gem;
        const spec = { tooth: Number(tooth), stoneType, cut, color, sizeMm, customPrice };
        if (gem.kind === 'iced') g.pricedIce[tooth] ||= spec;
        else g.pricedStones.push({ ...spec, count: 1 });
      }
      for (const i of state.icedTeeth || [])
        if (i.designId === g.layerId && g.teeth.includes(Number(i.tooth)) && i.count !== 0)
          g.pricedIce[i.tooth] ||= {};
    }
  }
  // Compress identical per-tooth pricing facts, not image pixels, for change detection.
  const revision = (state, layer) => JSON.stringify(compile(layer, inspect(state, layer)));
  root.OrderDesign = { inspect, compile, revision, defaults, tier, hex, migrateLegacy };
})(globalThis);
