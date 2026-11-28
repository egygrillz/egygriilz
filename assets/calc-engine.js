/* ═══════════════════════════════════════════════════════════════════════════
 *  EGYGRILLZ — PRICING ENGINE  (single source of truth)
 *  ---------------------------------------------------------------------------
 *  Loaded by the staff panel, /quotes, /invoice, /atelier, /x, and /about.
 *
 *      <script src="/assets/calc-engine.js"></script>
 *
 *  All pricing numbers live in Firestore -> settings/pricing.
 *  Studio & booking settings live in Firestore -> settings/site.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function createCalcEngine(global) {
  'use strict';

  const FIRESTORE_PROJECT = 'egygrillz-studio';
  /* The public web key of the project — the same one every page already
     ships. Firestore's REST API rejects keyless reads, which is why the
     settings used to fall back to the defaults on the public pages. */
  const FIRESTORE_KEY = 'AIzaSyDg8i3Bk1LVvScITFL1rDd5NSa0B5TjBZk';

  /* ─────────────────────────── defaults ─────────────────────────── */

  const DEFAULTS = {
    // Base price per tooth for non-gold materials
    materialBase: { chrome: 1000, titanium: 2800, silver: 1600 },

    // Gold: base = (goldCastFee + goldWeightFactor * rate * purity) * margin
    goldKarat: {
      '10': { purity: 0.417, margin: 2.5 },
      '14': { purity: 0.583, margin: 2.6 },
      '18': { purity: 0.750, margin: 2.8 },
      '21': { purity: 0.875, margin: 3.0 },
      '22': { purity: 0.917, margin: 3.2 },
    },
    goldCastFee: 310,
    goldWeightFactor: 1.15,
    goldGramsPerTooth: { '10': 0.35, '14': 0.35, '18': 0.34, '21': 0.34, '22': 0.33 },
    goldPrice: 0, // Today's 24K rate in EGP per gram

    // Design level surcharge, percent on top of material cost
    designPct: { '0.5': 0, '1': 0, '2': 10, '3': 15, '4': 25, '5': 40, '6': 60 },

    // Stones (precious metals only: silver & gold)
    accentPrice: { cz: 50, moissanite: 375, labgrown: null, natural: null },
    settingPrice: {
      flush: 150, twoprong: 175, threeprong: 200, fourprong: 200,
      sixprong: 220, bezelfull: 250, bezelhalf: 225, bar: 200, channel: 175,
    },

    /* Diamond CUT surcharge — a percentage on the stone price.
       Round brilliant is the default and the cheapest to produce, every other
       cut costs more to source. These are percentages, not EGP, so they
       survive a rate change:  { cut: pct }. */
    cutPct: {
      round: 0, cushion: 8, oval: 8, princess: 6, emerald: 12, pear: 12,
      radiant: 10, heart: 18, marquise: 20, baguette: 14, taperedbaguette: 16,
    },

    /* Stone SIZE in millimetres. Price scales with the square of the diameter
       (a 2 mm stone is four times a 1 mm stone in face area, not twice), so
       this table stores the multiplier at each preset size. 1 mm is the base.
       The UI derives presets from these keys, in this order. */
    sizeFactor: {
      '1': 1.00, '1.5': 1.55, '2': 2.40, '2.5': 3.45, '3': 4.75,
      '3.5': 6.30, '4': 8.10, '4.5': 10.20, '5': 12.60, '6': 18.10,
    },
    fullPrice: { cz: 0, moissanite: 500, labgrown: null, natural: null },
    coveragePrice: {
      standardpave: 1000, frenchpave: 1100, micropave: 1200,
      channel: 1500, invisible: 2500,
    },
    barsStonesPerTooth: 400,

    // Finishes (per tooth)
    plating: { none: 0, yellowgold: 300, blackgold: 400, whitegold: 400, rosegold: 300, silverplating: 200 },
    enamel: { none: 0, single: 200, multi: 350, master: 750 },
    engraving: { none: 0, small: 200, medium: 450, large: 700 },
    anodize: { none: 0, single: 300, dual: 350, multi: 450 },

    // Studio services (line-item pricing used in Quotes & Invoices)
    servicePrices: {
      impression: 200,
      consultation: 1000,
      toothgem: 500,
      polishing: 300,
      fitting: 0,
      shipping: 0,
      custom: 0,
    },

    // Order level
    timelinePct: { standard: 0, rush: 25, emergency: 50 },
    moldFlat: { none: 0, normalperarch: 200, digitalfullmouth: 1500 },

    // Rounding and deposit
    roundTo: 50,
    depositPct: 50,

    // Brand
    studioName: 'EGYGRILLZ',
    currency: 'EGP',
  };

  /* ─────────────────────────── labels ─────────────────────────── */

  const LABELS = {
    material: { chrome: 'Cobalt Chrome', titanium: 'Titanium', silver: 'Sterling Silver 925', gold: 'Gold' },
    level: { '0.5': 'Bars', '1': 'Solid', '2': 'Open face', '3': 'Mid detail', '4': 'Complex', '5': 'Scorpion', '6': 'Ultimate' },
    accentType: { cz: 'CZ', moissanite: 'Moissanite', labgrown: 'Lab-Grown', natural: 'Natural' },
    setting: {
      flush: 'Flush', twoprong: '2-Prong', threeprong: '3-Prong', fourprong: '4-Prong',
      sixprong: '6-Prong', bezelfull: 'Bezel full', bezelhalf: 'Bezel half', bar: 'Bar setting',
    },
    coverage: {
      standardpave: 'Standard Pave', frenchpave: 'French Pave', micropave: 'Micro-Pave',
      channel: 'Channel', invisible: 'Invisible',
    },
    plating: { none: 'None', yellowgold: 'Yellow gold', blackgold: 'Black gold', whitegold: 'White gold', rosegold: 'Rose gold', silverplating: 'Silver plating' },
    enamel: { none: 'None', single: 'Single', multi: 'Multi', master: 'Master' },
    engraving: { none: 'None', small: 'Small', medium: 'Medium', large: 'Large' },
    anodize: { none: 'None', single: 'Single', dual: 'Dual', multi: 'Multi' },
    timeline: { standard: 'Standard', rush: 'Rush', emergency: 'Emergency' },
    mold: { none: 'None', normalperarch: 'Normal per arch', digitalfullmouth: 'Digital full mouth' },
    service: {
      impression: 'Dental Impression (per arch)',
      consultation: 'Studio Consultation',
      toothgem: 'Toothgem Application',
      polishing: 'Clean & Polish',
      fitting: 'Studio Pickup / Fitting',
      shipping: 'Courier Shipping',
      custom: 'Custom Studio Service',
    },
  };

  /* ─────────────────────────── state ─────────────────────────── */

  let S = deepClone(DEFAULTS);
  let _customServiceKeys = new Set();
  const _subs = [];

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  function emitChange() {
    _subs.forEach((fn) => { try { fn(S); } catch (e) {} });
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    _subs.push(fn);
    return function () {
      const idx = _subs.indexOf(fn);
      if (idx !== -1) _subs.splice(idx, 1);
    };
  }

  function apply(saved) {
    if (!saved || typeof saved !== 'object') return S;
    if (saved.servicePrices && typeof saved.servicePrices === 'object') {
      Object.keys(saved.servicePrices).forEach(k => _customServiceKeys.add(k));
    }
    for (const key of Object.keys(DEFAULTS)) {
      const d = DEFAULTS[key];
      const v = saved[key];
      if (v === undefined || v === null) continue;
      if (key === 'goldKarat' && typeof v === 'object' && !Array.isArray(v)) {
        const nextK = Object.assign({}, deepClone(d), deepClone(S.goldKarat || {}));
        for (const kk of Object.keys(v)) {
          const kv = v[kk];
          if (!kv || typeof kv !== 'object') continue;
          const base = nextK[kk] || d[kk] || { purity: 0.75, margin: 2.8 };
          const pur = Number(kv.purity);
          const mar = Number(kv.margin);
          nextK[kk] = {
            purity: Number.isFinite(pur) && pur > 0 ? pur : base.purity,
            margin: Number.isFinite(mar) && mar > 0 ? mar : base.margin,
          };
        }
        S.goldKarat = nextK;
      } else if (d && typeof d === 'object' && !Array.isArray(d)) {
        if (typeof v === 'object' && !Array.isArray(v)) {
          S[key] = Object.assign({}, d, S[key] || {}, v);
        }
      } else {
        S[key] = v;
      }
    }
    for (const key of ['materialBase', 'designPct', 'accentPrice', 'settingPrice', 'fullPrice',
      'coveragePrice', 'plating', 'enamel', 'engraving', 'anodize', 'servicePrices',
      'timelinePct', 'moldFlat', 'goldGramsPerTooth', 'cutPct', 'sizeFactor']) {
      const m = S[key];
      const dm = DEFAULTS[key] || {};
      if (!m || typeof m !== 'object') continue;
      for (const k of Object.keys(m)) {
        if (m[k] === null || m[k] === '') {
          if (key === 'accentPrice' || key === 'fullPrice') m[k] = null;
          else if (dm[k] !== undefined) m[k] = dm[k];
          continue;
        }
        const n = Number(m[k]);
        if (Number.isFinite(n)) m[k] = n;
        else if (dm[k] !== undefined) m[k] = dm[k];
      }
    }
    ['goldPrice', 'goldCastFee', 'goldWeightFactor', 'barsStonesPerTooth', 'roundTo', 'depositPct'].forEach((k) => {
      const n = Number(S[k]);
      S[k] = Number.isFinite(n) ? n : DEFAULTS[k];
    });
    emitChange();
    return S;
  }

  const get = () => S;
  const set = (next) => apply(next);
  const reset = () => {
    S = deepClone(DEFAULTS);
    _customServiceKeys = new Set();
    emitChange();
    return S;
  };

  function syncServiceDefaults(siteData) {
    if (!siteData || typeof siteData !== 'object') return;
    const map = {
      impression: 'impressionPrice',
      consultation: 'consultPrice',
      toothgem: 'gemFromPrice',
    };
    Object.keys(map).forEach((svcKey) => {
      if (_customServiceKeys.has(svcKey)) return;
      const v = siteData[map[svcKey]];
      const n = Number(v);
      if (v !== undefined && v !== null && v !== '' && Number.isFinite(n)) {
        S.servicePrices[svcKey] = n;
      }
    });
  }

  /* ─────────────────────────── maths ─────────────────────────── */

  const money = (n) => Math.round(Number(n) || 0);

  /** Round a price the way the studio quotes it: nearest whole EGP.
   *  Everything a client sees (cards, PDFs, invoices) goes through this so a
   *  calculated 21,898.62 never surfaces as a ragged decimal. */
  function roundPrice(n) { return Math.round(Number(n) || 0); }

  /** Nearest whole EGP *and* up to the studio's roundTo step (default 50).
   *  Used for set totals only — per-tooth maths stays exact until the end. */
  function roundUpTo(n, step) {
    const s = Math.max(1, Math.round(Number(step) || 0));
    const v = Math.max(0, Number(n) || 0);
    return s > 1 ? Math.ceil(v / s) * s : Math.round(v);
  }

  /** Both finishes can live on ONE tooth group (a tooth can be iced out and
   *  carry accent stones at the same time), so the engine must be able to
   *  price `accent` + `full` together. Anything that only understands one of
   *  them keeps working — `stoneDetail` simply reports 'both'. */
  const STONE_DETAIL_BOTH = 'both';

  /* ───────────────────────── stone cut & size ─────────────────────────

     A stone is described by four things: what it is (type), how it is cut
     (cut), how big it is in millimetres (size) and how it is held (setting
     / coverage). Type sets the base price; cut and size multiply it.

     Round brilliant is the default everywhere — it is what the studio uses
     unless someone asks for something else. */

  const CUTS = ['round', 'cushion', 'oval', 'princess', 'emerald', 'pear',
                'radiant', 'heart', 'marquise', 'baguette', 'taperedbaguette'];

  /* 1 mm is the base size; presets run in 0.5 mm steps up to 6 mm. */
  const SIZE_PRESETS = ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '6'];

  function cleanCut(cut) {
    const c = String(cut || '').toLowerCase().replace(/[\s_-]/g, '');
    return CUTS.indexOf(c) !== -1 ? c : 'round';
  }

  function cleanSize(size) {
    const n = Number(size);
    if (!Number.isFinite(n) || n <= 0) return '1';
    /* snap to the nearest preset so a stray decimal never invents a tier */
    let best = '1', bestD = Infinity;
    SIZE_PRESETS.forEach((p) => {
      const d = Math.abs(Number(p) - n);
      if (d < bestD) { bestD = d; best = p; }
    });
    return best;
  }

  function cutPctOf(cut) {
    const p = S.cutPct[cleanCut(cut)];
    return Number.isFinite(Number(p)) ? Number(p) : 0;
  }

  function sizeFactorOf(size) {
    const f = S.sizeFactor[cleanSize(size)];
    return Number.isFinite(Number(f)) && Number(f) > 0 ? Number(f) : 1;
  }

  /** Price of ONE stone after cut and size surcharges. */
  function stoneUnitPrice(base, cut, size) {
    const b = Number(base) || 0;
    if (!b) return 0;
    return money(b * (1 + cutPctOf(cut) / 100) * sizeFactorOf(size));
  }

  function basePerTooth(line) {
    if (line.material === 'gold') {
      const karat = String(line.karat || '18');
      const k = S.goldKarat[karat] || S.goldKarat['18'];
      const rate = Number(line.goldPrice || S.goldPrice || 0);
      const castFee = Number(line.goldCastFee !== undefined ? line.goldCastFee : S.goldCastFee);
      const weightFactor = Number(line.goldWeightFactor !== undefined ? line.goldWeightFactor : S.goldWeightFactor);
      return (castFee + weightFactor * rate * k.purity) * k.margin;
    }
    return Number(S.materialBase[line.material] || 0);
  }

  function allowsStones(material) {
    return material !== 'chrome' && material !== 'titanium';
  }

  /** Sanitize tooth IDs array (e.g. ['UR3','UR2','UR1','UL1','UL2','UL3']). */
  function cleanToothIds(arr) {
    if (!Array.isArray(arr)) return [];
    const seen = new Set();
    const out = [];
    arr.forEach((id) => {
      const s = String(id || '').trim().toUpperCase().slice(0, 6);
      if (s && /^[UL][RL][1-8]$/.test(s) && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    });
    return out;
  }

  /** Price breakdown for a single uniform tooth group / line. */
  function calculateSingleGroup(input, maxTeeth) {
    const cap = maxTeeth || 16;
    const line = Object.assign({
      teeth: 6,
      material: 'chrome',
      level: '1',
      plating: 'none',
      enamel: 'none',
      engraving: 'none',
      anodize: 'none',
    }, input || {});

    delete line.groups;
    delete line.isMixed;
    delete line.mixedMaterials;

    const tids = cleanToothIds(line.toothIds);
    if (tids.length) line.toothIds = tids;
    else delete line.toothIds;

    line.level = levelKey(line.level);
    if (S.designPct[line.level] === undefined && line.level !== '0.5') line.level = '1';
    line.teeth = Math.max(1, Math.min(cap, Math.round(Number(line.teeth) || (tids.length || 6))));
    if (line.material === 'gold') {
      line.karat = String(line.karat || '18');
      if (!S.goldKarat[line.karat]) line.karat = '18';
      line.goldPrice = Number(line.goldPrice || S.goldPrice || 0);
    }
    line.base = basePerTooth(line);

    const isBars = String(line.level) === '0.5';
    line.materialTotal = isBars ? line.base * 0.5 * line.teeth : line.base * line.teeth;

    const pct = Number(S.designPct[line.level] || 0);
    line.designPct = pct;
    line.designCost = line.materialTotal * (pct / 100);

    // Stones (precious metals only: Silver 925 & Gold)
    /* A single tooth group can carry BOTH finishes at once: the tooth is
       iced out (pavé / full cover) and still has accent stones set on it.
       They used to be mutually exclusive, which silently dropped whichever
       one was typed second. Both are now priced and added together. */
    line.stoneCost = 0;
    line.stoneDetail = 'none';
    if (allowsStones(line.material)) {
      let cost = 0;
      let hasAccent = false;
      let hasFull = false;

      if (line.accent && Number(line.accent.count) > 0) {
        const count = Math.max(1, Math.round(Number(line.accent.count) || 1));
        const type = line.accent.type || 'cz';
        const setting = line.accent.setting || 'flush';
        const cut = cleanCut(line.accent.cut);
        const size = cleanSize(line.accent.size);
        let unit = S.accentPrice[type];
        if (unit === null || unit === undefined) {
          unit = Number(line.accent.customPrice !== undefined ? line.accent.customPrice : line.accent.price) || 0;
        }
        /* A fancy cut and a bigger stone both cost more. The surcharges apply
           to the STONE only — the setting labour does not change with cut. */
        const unitPriced = stoneUnitPrice(Number(unit) || 0, cut, size);
        const sp = Number(S.settingPrice[setting] || 0);
        line.accent = Object.assign({}, line.accent, { count, type, setting, cut, size });
        line.accentUnit = Number(unit);
        line.accentPricedUnit = unitPriced;
        line.accentCutPct = cutPctOf(cut);
        line.accentSizeFactor = sizeFactorOf(size);
        line.settingUnit = sp;
        line.accentCost = count * (unitPriced + sp);
        cost += line.accentCost;
        hasAccent = true;
      } else {
        delete line.accent;
        delete line.accentCost;
      }

      if (line.full && (line.full.bars || isBars)) {
        line.full = { bars: true };
        line.fullCost = line.teeth * Number(S.barsStonesPerTooth || 0);
        cost += line.fullCost;
        hasFull = true;
      } else if (line.full) {
        const type = line.full.type || 'moissanite';
        const cov = line.full.coverage || 'standardpave';
        const cut = cleanCut(line.full.cut);
        const size = cleanSize(line.full.size);
        let unit = S.fullPrice[type];
        if (unit === null || unit === undefined) {
          unit = Number(line.full.customPrice !== undefined ? line.full.customPrice : line.full.price) || 0;
        }
        const unitPriced = stoneUnitPrice(Number(unit) || 0, cut, size);
        const cp = Number(S.coveragePrice[cov] || 0);
        line.full = Object.assign({}, line.full, { type, coverage: cov, cut, size });
        line.fullUnit = Number(unit);
        line.fullPricedUnit = unitPriced;
        line.fullCutPct = cutPctOf(cut);
        line.fullSizeFactor = sizeFactorOf(size);
        line.coverageUnit = cp;
        line.fullCost = line.teeth * (unitPriced + cp);
        cost += line.fullCost;
        hasFull = true;
      } else {
        delete line.full;
        delete line.fullCost;
      }

      line.stoneCost = cost;
      if (hasAccent && hasFull) line.stoneDetail = STONE_DETAIL_BOTH;
      else if (hasAccent) line.stoneDetail = 'accent';
      else if (hasFull) line.stoneDetail = (line.full && line.full.bars) ? 'bars' : 'full';
      else line.stoneDetail = 'none';
    } else {
      delete line.accent;
      delete line.full;
      delete line.fullCost;
      delete line.accentCost;
    }

    // Per-tooth finishes
    line.plating = line.plating || 'none';
    line.enamel = line.enamel || 'none';
    line.engraving = line.engraving || 'none';
    line.anodize = line.material === 'titanium' ? (line.anodize || 'none') : 'none';

    line.platingCost = Number(S.plating[line.plating] || 0) * line.teeth;
    line.enamelCost = Number(S.enamel[line.enamel] || 0) * line.teeth;
    line.engravingCost = Number(S.engraving[line.engraving] || 0) * line.teeth;
    line.anodizeCost = line.material === 'titanium' ? Number(S.anodize[line.anodize] || 0) * line.teeth : 0;

    const rawTotal =
      line.materialTotal +
      line.designCost +
      line.stoneCost +
      line.platingCost +
      line.enamelCost +
      line.engravingCost +
      line.anodizeCost;

    line.subtotal = money(rawTotal);
    return { line, rawTotal };
  }

  /** Merge parent set defaults into a child tooth-group without clobbering overrides. */
  function mergeGroupDefaults(parent, grp) {
    const p = parent || {};
    const g = Object.assign({}, grp || {});
    if (!g.material) g.material = p.material || 'chrome';
    if (g.material === 'gold') {
      if (!g.karat) g.karat = (p.material === 'gold' && p.karat) ? p.karat : '18';
      if (!g.goldPrice && p.goldPrice) g.goldPrice = p.goldPrice;
      if (g.goldCastFee === undefined && p.goldCastFee !== undefined) g.goldCastFee = p.goldCastFee;
      if (g.goldWeightFactor === undefined && p.goldWeightFactor !== undefined) g.goldWeightFactor = p.goldWeightFactor;
    }
    if (g.plating === undefined && p.plating && p.plating !== 'mixed') g.plating = p.plating;
    if (g.enamel === undefined && p.enamel && p.enamel !== 'mixed') g.enamel = p.enamel;
    if (g.engraving === undefined && p.engraving && p.engraving !== 'mixed') g.engraving = p.engraving;
    if (g.anodize === undefined && g.material === 'titanium' && p.anodize && p.anodize !== 'mixed') g.anodize = p.anodize;
    if (g.label) g.label = String(g.label).trim().slice(0, 40);
    else delete g.label;
    delete g.name;
    return g;
  }

  function commonField(groups, key, fallback) {
    if (!groups.length) return fallback;
    const first = groups[0][key] !== undefined ? groups[0][key] : fallback;
    for (let i = 1; i < groups.length; i++) {
      const cur = groups[i][key] !== undefined ? groups[i][key] : fallback;
      if (String(cur) !== String(first)) return 'mixed';
    }
    return first;
  }

  /**
   * Full price breakdown for one set/design line.
   * Supports BOTH:
   *   1) Uniform set: { name, material, karat, goldPrice, teeth, level, accent|full, plating, enamel, engraving, anodize }
   *   2) Mixed-teeth set: { name, material?, karat?, goldPrice?, groups: [ { teeth, level, accent|full, plating, ... }, ... ] }
   */
  function calculateLine(input) {
    const src = input || {};
    const rawGroups = Array.isArray(src.groups) ? src.groups.filter((g) => g && typeof g === 'object') : [];

    // Single-group array collapses cleanly into a uniform line
    if (rawGroups.length === 1) {
      const merged = mergeGroupDefaults(src, rawGroups[0]);
      if (src.designId) merged.designId = src.designId;
      if (src.name) merged.name = String(src.name).trim().slice(0, 40);
      else if (rawGroups[0].label) merged.name = String(rawGroups[0].label).trim().slice(0, 40);
      if (!merged.toothIds && Array.isArray(src.toothIds)) merged.toothIds = src.toothIds;
      return calculateSingleGroup(merged, 32).line;
    }

    // Standard uniform line (100% backward-compatible)
    if (rawGroups.length === 0) {
      return calculateSingleGroup(src, src.toothIds && src.toothIds.length > 16 ? 32 : 16).line;
    }

    // Mixed-teeth set (2+ tooth groups inside one single set)
    let rawSum = 0;
    const pricedGroups = rawGroups.map((g) => {
      const res = calculateSingleGroup(mergeGroupDefaults(src, g), 32);
      rawSum += res.rawTotal;
      return res.line;
    });

    const sum = (k) => pricedGroups.reduce((acc, g) => acc + (Number(g[k]) || 0), 0);
    const teeth = sum('teeth');
    const materialTotal = sum('materialTotal');
    const designCost = sum('designCost');
    const stoneCost = sum('stoneCost');
    const platingCost = sum('platingCost');
    const enamelCost = sum('enamelCost');
    const engravingCost = sum('engravingCost');
    const anodizeCost = sum('anodizeCost');

    const matKey = (g) => g.material === 'gold' ? ('gold:' + (g.karat || '18')) : g.material;
    const firstMatKey = matKey(pricedGroups[0]);
    const mixedMaterials = pricedGroups.some((g) => matKey(g) !== firstMatKey);
    const firstGold = pricedGroups.find((g) => g.material === 'gold');

    const allToothIds = cleanToothIds(
      pricedGroups.reduce((arr, g) => arr.concat(g.toothIds || []), []).concat(src.toothIds || [])
    );

    const level = commonField(pricedGroups, 'level', '1');
    const designPct = level !== 'mixed'
      ? Number(pricedGroups[0].designPct || 0)
      : (materialTotal > 0 ? Math.round((designCost / materialTotal) * 1000) / 10 : 0);

    const out = {
      ...(src.designId && {designId:src.designId}),
      name: src.name ? String(src.name).trim().slice(0, 40) : '',
      isMixed: true,
      mixedMaterials,
      material: pricedGroups[0].material,
      teeth,
      level,
      base: teeth > 0 ? materialTotal / teeth : 0,
      materialTotal,
      designPct,
      designCost,
      stoneDetail: stoneCost > 0 ? 'mixed' : 'none',
      stoneCost,
      plating: commonField(pricedGroups, 'plating', 'none'),
      platingCost,
      enamel: commonField(pricedGroups, 'enamel', 'none'),
      enamelCost,
      engraving: commonField(pricedGroups, 'engraving', 'none'),
      engravingCost,
      anodize: commonField(pricedGroups, 'anodize', 'none'),
      anodizeCost,
      groups: pricedGroups,
      subtotal: money(rawSum),
    };
    if (firstGold) {
      out.karat = firstGold.karat || '18';
      out.goldPrice = Number(firstGold.goldPrice || S.goldPrice || 0);
    }
    if (allToothIds.length) out.toothIds = allToothIds;
    return out;
  }

  /** Strip runtime/undefined keys from a group or line for safe Firestore/JSON storage. */
  function cleanGroupSpec(g) {
    if (!g || typeof g !== 'object') return null;
    const out = {
      material: g.material || 'chrome',
      teeth: Math.max(1, Math.min(32, Math.round(Number(g.teeth) || 1))),
      level: levelKey(g.level),
      plating: (g.plating && g.plating !== 'mixed') ? g.plating : 'none',
      enamel: (g.enamel && g.enamel !== 'mixed') ? g.enamel : 'none',
      engraving: (g.engraving && g.engraving !== 'mixed') ? g.engraving : 'none',
      anodize: g.material === 'titanium' && g.anodize && g.anodize !== 'mixed' ? g.anodize : 'none',
    };
    if (g.label) out.label = String(g.label).trim().slice(0, 40);
    if (out.material === 'gold') {
      out.karat = String(g.karat || '18');
      const gp = Number(g.goldPrice || S.goldPrice || 0);
      if (gp > 0) out.goldPrice = gp;
    }
    if (allowsStones(out.material)) {
      /* Accent stones and full iced cover may both sit on the same teeth —
         keep both, never let one silently replace the other. */
      if (g.accent && Number(g.accent.count) > 0) {
        const a = {
          count: Math.max(1, Math.round(Number(g.accent.count) || 1)),
          type: g.accent.type || 'cz',
          setting: g.accent.setting || 'flush',
          cut: cleanCut(g.accent.cut),
          size: cleanSize(g.accent.size),
        };
        const ap = g.accent.customPrice !== undefined ? g.accent.customPrice : g.accent.price;
        if (ap !== undefined && ap !== null && Number.isFinite(Number(ap))) {
          a.price = Number(ap);
          a.customPrice = Number(ap);
        }
        out.accent = a;
      }
      if (g.full && (g.full.bars || out.level === '0.5')) {
        out.full = { bars: true };
      } else if (g.full) {
        const f = {
          type: g.full.type || 'moissanite',
          coverage: g.full.coverage || 'standardpave',
          cut: cleanCut(g.full.cut),
          size: cleanSize(g.full.size),
        };
        const fp = g.full.customPrice !== undefined ? g.full.customPrice : g.full.price;
        if (fp !== undefined && fp !== null && Number.isFinite(Number(fp))) {
          f.price = Number(fp);
          f.customPrice = Number(fp);
        }
        out.full = f;
      }
    }
    const tids = cleanToothIds(g.toothIds);
    if (tids.length) out.toothIds = tids;
    return out;
  }

  function cleanLineSpec(line) {
    if (!line || typeof line !== 'object') return null;
    if (Array.isArray(line.groups) && line.groups.length > 1) {
      const gs = line.groups.map((g) => cleanGroupSpec(mergeGroupDefaults(line, g))).filter(Boolean);
      const out = {
        material: gs[0] ? gs[0].material : (line.material || 'chrome'),
        teeth: gs.reduce((s, g) => s + g.teeth, 0),
        level: 'mixed',
        isMixed: true,
        groups: gs,
      };
      if (line.designId) out.designId=line.designId;
      if (line.name) out.name = String(line.name).trim().slice(0, 40);
      const fg = gs.find((g) => g.material === 'gold');
      if (fg) {
        out.karat = fg.karat;
        if (fg.goldPrice) out.goldPrice = fg.goldPrice;
      }
      const tids = cleanToothIds(line.toothIds);
      if (tids.length) out.toothIds = tids;
      return out;
    }
    const base = Array.isArray(line.groups) && line.groups.length === 1
      ? mergeGroupDefaults(line, line.groups[0])
      : line;
    const single = cleanGroupSpec(base);
    if (!single) return null;
    delete single.label;
    if (line.designId) single.designId=line.designId;
    if (line.name) single.name = String(line.name).trim().slice(0, 40);
    return single;
  }

  /** Calculate one studio service item */
  function calculateService(input) {
    const type = (input && input.type) || 'custom';
    const qty = Math.max(1, Number(input && input.qty) || 1);
    const defaultPrice = Number((S.servicePrices && S.servicePrices[type]) || 0);
    const hasCustomPrice = input && input.unitPrice !== undefined && input.unitPrice !== null && input.unitPrice !== '';
    const unitPrice = hasCustomPrice ? Math.max(0, Number(input.unitPrice) || 0) : defaultPrice;
    const name = (input && input.name && String(input.name).trim()) || LABELS.service[type] || 'Studio Service';
    const notes = (input && input.notes && String(input.notes).trim()) || '';
    const subtotal = money(qty * unitPrice);
    const teeth = cleanToothIds(input?.forTeeth);
    return { type, name, qty, unitPrice: money(unitPrice), notes, subtotal,
      ...(typeof input?.forDesign==='string' && teeth.length && { forDesign:input.forDesign, forTeeth:teeth }) };
  }

  /** Whole order: design lines + services + timeline + mold + discount + rounding + deposit */
  function calculateOrder(lines, opts) {
    const o = Object.assign({
      timeline: 'standard',
      mold: 'none',
      depositPct: S.depositPct,
      services: [],
      discount: null,
      round: true,
    }, opts || {});

    const priced = (lines || []).map(calculateLine);
    const linesSubtotalRaw = priced.reduce((s, l) => s + (l.subtotal || 0), 0);

    const services = (o.services || []).map(calculateService);
    const servicesSubtotal = services.reduce((s, x) => s + (x.subtotal || 0), 0);

    const tlPct = Number(S.timelinePct[o.timeline] || 0);
    const timelineAmount = linesSubtotalRaw * (tlPct / 100);
    const moldCost = o.mold === 'none' ? 0 : Number(S.moldFlat[o.mold] || 0);

    const gross = linesSubtotalRaw + timelineAmount + moldCost + servicesSubtotal;
    let discountAmount = 0;
    if (o.discount && Number(o.discount.value) > 0) {
      discountAmount = o.discount.type === 'pct'
        ? gross * (Number(o.discount.value) / 100)
        : Number(o.discount.value);
      discountAmount = Math.min(gross, Math.max(0, discountAmount));
    }

    const preRound = Math.max(0, gross - discountAmount);
    const roundTo = Number(S.roundTo) || 1;
    /* Totals always land on a whole EGP (and on the studio's rounding step
       when one is configured) so no quotation, invoice or catalogue card can
       ever print a figure like 21,898.62. */
    const calculatedTotal = o.round !== false
      ? roundUpTo(preRound, roundTo > 1 ? roundTo : 1)
      : money(preRound);

    const hasAmount = v => v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;
    const agreed = hasAmount(o.agreedTotal), depositManual = hasAmount(o.depositAmount);
    const total = agreed ? money(o.agreedTotal) : calculatedTotal;
    const depositPct = Math.max(0, Math.min(100, Number(o.depositPct) || 0));
    const deposit = depositManual ? Math.min(total, money(o.depositAmount)) : money(total * depositPct / 100);

    return {
      lines: priced,
      lineCount: priced.length,
      teethTotal: priced.reduce((s, l) => s + l.teeth, 0),
      linesSubtotal: money(linesSubtotalRaw),
      services,
      servicesSubtotal: money(servicesSubtotal),
      timeline: o.timeline,
      timelinePct: tlPct,
      timelineAmount: money(timelineAmount),
      mold: o.mold,
      moldCost: money(moldCost),
      discountAmount: money(discountAmount),
      preRound: money(preRound),
      ...(agreed && {calculatedTotal}), ...(depositManual && {depositManual}),
      total: money(total),
      depositPct,
      deposit: money(deposit),
      balance: money(Math.max(0, total - deposit)),
      currency: S.currency,
    };
  }

  // Placed-stone charges retain their original pricing basis (e.g. timeline
  // surcharge does not apply to setting labour). Nest them in the owning tooth
  // detail for display, without repricing a posted quote or matching names.
  function designBreakdown(order) {
    const designs=(order.lines || []).map(line=>({line,subtotal:line.subtotal,
      groups:(line.groups || [line]).map(group=>({group,stones:[],subtotal:group.subtotal}))}));
    const byId = new Map(designs.filter(d=>d.line.designId).map(d=>[d.line.designId,d]));
    const services=[];
    let settingTotal=0;
    for(const s of order.services || []) {
      const design=byId.get(s.forDesign);
      const row=s.forTeeth?.length && design?.groups.find(({group})=>s.forTeeth.every(id=>group.toothIds?.includes(id)));
      if(!row) {services.push(s);continue;}
      row.stones.push(s);row.subtotal+=s.subtotal;design.subtotal+=s.subtotal;settingTotal+=s.subtotal;
    }
    return {designs,services,linesSubtotal:order.linesSubtotal+settingTotal,servicesSubtotal:order.servicesSubtotal-settingTotal};
  }

  /** Plain-text breakdown, ready for a PDF, email, or WhatsApp */
  function describeOrder(order, opts) {
    const o = opts || {};
    const out = [];
    const shown=designBreakdown(order);
    shown.designs.forEach(({line:l,groups,subtotal},i)=>{
      out.push(l.name || `Design ${i+1}`);
      for(const {group:g,stones,subtotal:sub} of groups) {
        out.push('  '+toothHeading(g,l.name)+': '+groupLabel(g,{includeMaterial:true,omitCount:true}));
        out.push(`    Material ${fmt(g.materialTotal)} + complexity ${fmt(g.designCost)} ${S.currency}`);
        if(g.material==='gold' && g.goldPrice) out.push(`    Gold rate used: ${fmt(g.goldPrice)} ${S.currency}/g`);
        if(g.accent) out.push(`    ${g.accent.count} × ${g.accent.cut}, ${g.accent.size} mm, ${L.setting[g.accent.setting] || g.accent.setting}: ${fmt(g.accentCost)} ${S.currency}`);
        if(g.full) out.push(`    ${g.full.bars ? 'Bar setting' : L.coverage[g.full.coverage] || 'Full setting'}: ${fmt(g.fullCost)} ${S.currency}`);
        for(const [field,label] of [['plating','Plating'],['enamel','Enamel'],['engraving','Engraving'],['anodize','Anodizing']])
          if(g[field+'Cost']) out.push(`    ${label}: ${fmt(g[field+'Cost'])} ${S.currency}`);
        for(const stone of stones) out.push(`    ${stone.qty} × ${stone.name} (${stone.notes}): ${fmt(stone.subtotal)} ${S.currency}`);
        if(groups.length>1) out.push(`    Subtotal: ${fmt(sub)} ${S.currency}`);
      }
      out.push(`  Design subtotal: ${fmt(subtotal)} ${S.currency}`, '');
    });
    if(shown.services.length) {
      out.push('STUDIO SERVICES:');
      for(const s of shown.services) out.push(`  - ${s.name} x${s.qty}: ${fmt(s.subtotal)} ${S.currency}`);
      out.push('');
    }
    if(shown.linesSubtotal) out.push(`Designs subtotal: ${fmt(shown.linesSubtotal)} ${S.currency}`);
    if(shown.servicesSubtotal) out.push(`Services subtotal: ${fmt(shown.servicesSubtotal)} ${S.currency}`);
    if (order.timelineAmount) out.push(`Timeline (${L.timeline[order.timeline]} +${order.timelinePct}%): ${fmt(order.timelineAmount)} ${S.currency}`);
    if (order.moldCost) out.push(`Mold (${L.mold[order.mold]}): ${fmt(order.moldCost)} ${S.currency}`);
    if (order.discountAmount) out.push(`Discount: -${fmt(order.discountAmount)} ${S.currency}`);
    out.push(`TOTAL: ${fmt(order.total)} ${S.currency}`);
    if (order.depositPct || order.depositManual) {
      out.push(`${order.depositManual ? 'Agreed deposit due' : `Deposit (${order.depositPct}%)`}: ${fmt(order.deposit)} ${S.currency}`);
      out.push(`Balance before delivery: ${fmt(order.balance)} ${S.currency}`);
    }
    if (o.includeCode) {
      try {
        const code = typeof o.includeCode === 'string' ? o.includeCode : encodeCode(order);
        if (code) { out.push(''); out.push(`Quote Code: ${code}`); }
      } catch (e) {}
    }
    return out.join('\n');
  }

  const L = LABELS;
  const fmt = (n) => String(money(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const SHORT_LEVEL = LABELS.level;
  // Numeric keys stay in settings, saved quotes and design codes. Accept earlier
  // sheet labels such as "0.5 Bars" without displaying their pricing keys.
  function levelKey(value) {
    const v = String(value ?? '').trim().toLowerCase();
    const key = v.match(/^l?(0\.5|[1-6])(?:[\s:–—-]|$)/)?.[1];
    if (Object.hasOwn(LABELS.level, key)) return key;
    if (v === 'bar') return '0.5';
    return Object.keys(LABELS.level).find(k => LABELS.level[k].toLowerCase() === v) || '1';
  }
  const levelName = v => LABELS.level[levelKey(v)];
  function toothHeading(g, name) {
    const teeth = g.toothIds?.map(id=>/^[UL][RL][1-8]$/.test(id) ? ({UR:1, UL:2, LL:3, LR:4})[id.slice(0,2)]+id[2] : id).join(', ');
    const label = g.label && g.label !== name ? g.label : '';
    return [(teeth ? 'FDI '+teeth : '') || `${g.teeth} ${g.teeth === 1 ? 'tooth' : 'teeth'}`, label && label !== teeth ? label : ''].filter(Boolean).join(' · ');
  }

  function groupLabel(g, opts) {
    if (!g) return '';
    const o = opts || {};
    const tWord = Number(g.teeth) === 1 ? '1 tooth' : `${g.teeth} teeth`;
    const parts = [];
    if (o.includeMaterial) {
      const m = g.material === 'gold' ? `Gold ${g.karat || '18'}K` : (L.material[g.material] || g.material);
      parts.push(o.omitCount ? m : `${tWord} ${m}`);
    } else if (!o.omitCount) {
      parts.push(tWord);
    }
    parts.push(o.levelLabel || levelName(g.level));
    if (g.accent && g.accent.count) parts.push(`${g.accent.count}x ${L.accentType[g.accent.type] || g.accent.type}`.trim());
    if (g.full && (g.full.bars || String(g.level) === '0.5')) parts.push('Iced-out bar');
    else if (g.full) parts.push(`Full coverage ${L.accentType[g.full.type] || g.full.type}`.trim());
    if (g.plating && g.plating !== 'none') parts.push(L.plating[g.plating] || g.plating);
    if (g.enamel && g.enamel !== 'none') parts.push('Enamel ' + (L.enamel[g.enamel] || g.enamel));
    if (g.engraving && g.engraving !== 'none') parts.push('Engraving ' + (L.engraving[g.engraving] || g.engraving));
    if (g.anodize && g.anodize !== 'none' && g.material === 'titanium') parts.push('Anodize ' + (L.anodize[g.anodize] || g.anodize));
    return parts.join(' · ');
  }

  function lineLabel(line) {
    if (!line) return '';
    if (Array.isArray(line.groups) && line.groups.length > 1) {
      const gs = line.groups;
      const totalT = Number(line.teeth) || gs.reduce((s, g) => s + (Number(g.teeth) || 0), 0);
      const mk = (g) => g.material === 'gold' ? `Gold ${g.karat || '18'}K` : (L.material[g.material] || g.material);
      const firstMat = mk(gs[0]);
      const mixedMat = gs.some((g) => mk(g) !== firstMat);
      const head = mixedMat
        ? `Mixed Materials / ${totalT} teeth`
        : `${firstMat} / ${totalT} teeth (Mixed)`;
      const detail = gs.map((g) => {
        const lbl = toothHeading(g, line.name) + ': ';
        return lbl + groupLabel(g, { includeMaterial: mixedMat, omitCount:true });
      }).join(' + ');
      return `${head} — ${detail}`;
    }
    const mat = line.material === 'gold' ? `Gold ${line.karat || '18'}K` : (L.material[line.material] || line.material);
    const tWord = Number(line.teeth) === 1 ? '1 tooth' : `${line.teeth} teeth`;
    const bits = [`${mat} / ${tWord} / ${levelName(line.level)}`];
    if (line.accent && line.accent.count) bits.push(`${line.accent.count}x ${L.accentType[line.accent.type] || ''}`.trim());
    if (line.full && (line.full.bars || String(line.level) === '0.5')) bits.push('Iced-out bar');
    else if (line.full) bits.push(`Full coverage ${L.accentType[line.full.type] || ''}`.trim());
    if (line.plating && line.plating !== 'none') bits.push(L.plating[line.plating]);
    if (line.enamel && line.enamel !== 'none') bits.push('Enamel ' + L.enamel[line.enamel]);
    if (line.engraving && line.engraving !== 'none') bits.push('Engraving ' + L.engraving[line.engraving]);
    if (line.anodize && line.anodize !== 'none' && line.material === 'titanium') bits.push('Anodize ' + L.anodize[line.anodize]);
    return bits.join(' · ');
  }

  /* ───────────── universal compact transfer code (EGZ- / EGZ1:) ─────────────
   *
   *  Ultra-short human-copyable code shared by EVERY calculator on the site:
   *    • Single uniform set:  EGZ-g18.6.3.pr               (14 chars)
   *    • Mixed-teeth set:     EGZ-(s.2.4.fms+s.4.1.vs)     (24 chars)
   *    • Multi-set + options: EGZ-g18.6.3.pr/s.6.1|tr.mn   (26 chars)
   *    • Optional UTF-8 metadata (names, tooth IDs, notes): ...~<base64url>
   *    • Also imports legacy intake codes: EGZ1:<base64url> and share URLs.
   * ─────────────────────────────────────────────────────────────────────── */

  function b64uEnc(str) {
    const s = String(str || '');
    let bin = '';
    if (typeof TextEncoder === 'function') {
      const bytes = new TextEncoder().encode(s);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    } else {
      bin = unescape(encodeURIComponent(s));
    }
    const b64 = typeof btoa === 'function'
      ? btoa(bin)
      : Buffer.from(bin, 'binary').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64uDec(str) {
    const clean = String(str || '').trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = clean.length % 4 ? '='.repeat(4 - (clean.length % 4)) : '';
    const bin = typeof atob === 'function'
      ? atob(clean + pad)
      : Buffer.from(clean + pad, 'base64').toString('binary');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (typeof TextDecoder === 'function') {
      return new TextDecoder().decode(bytes);
    }
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += '%' + ('0' + bytes[i].toString(16)).slice(-2);
    return decodeURIComponent(out);
  }

  function flipMap(m) {
    const r = {};
    Object.keys(m).forEach((k) => { r[m[k]] = k; });
    return r;
  }

  const CODE_MAT = { chrome: 'c', titanium: 't', silver: 's', gold: 'g' };
  const CODE_MAT_R = flipMap(CODE_MAT);
  const CODE_STYPE = { cz: 'c', moissanite: 'm', labgrown: 'l', natural: 'n' };
  const CODE_STYPE_R = flipMap(CODE_STYPE);
  const CODE_SET = {
    flush: 'f', twoprong: 'p', threeprong: 't', fourprong: 'q', sixprong: 's',
    bezelfull: 'b', bezelhalf: 'z', bar: 'r', channel: 'h', invisible: 'i', pave: 'v',
    /* legacy aliases kept so old saved codes still decode */
    prong: 'p', bezel: 'b',
  };
  /* cut: one letter. round is the default so it can be omitted. */
  const CODE_CUT = { round: 'r', cushion: 'c', oval: 'o', princess: 'p', emerald: 'e',
                     pear: 'a', radiant: 'd', heart: 'h', marquee: 'm', marquise: 'm',
                     baguette: 'b', taperedbaguette: 't' };
  const CODE_CUT_R = flipMap(CODE_CUT);
  const CODE_SET_R = {...flipMap(CODE_SET), p:'twoprong', b:'bezelfull'};
  const CODE_COV = { standardpave: 's', honeycomb: 'h', micro: 'i', baguette: 'b', frenchpave:'f', micropave:'m', channel:'c', invisible:'v' };
  const CODE_COV_R = flipMap(CODE_COV);
  const CODE_PL = { yellowgold: 'py', whitegold: 'pw', rosegold: 'pr', blackrhodium: 'pb', blackgold:'pk', silverplating: 'ps' };
  const CODE_PL_R = flipMap(CODE_PL);
  const CODE_EN = { '1color': 'e1', '2color': 'e2', '3plus': 'e3', single:'es', multi:'em', master:'ex' };
  const CODE_EN_R = flipMap(CODE_EN);
  const CODE_EG = { small: 'vs', medium: 'vm', large: 'vl' };
  const CODE_EG_R = flipMap(CODE_EG);
  const CODE_AN = { single: 'ns', dual: 'nd', rainbow: 'nr', multi:'nm' };
  const CODE_AN_R = flipMap(CODE_AN);
  const CODE_TL = { rush: 'tr', emergency: 'te' };
  const CODE_TL_R = flipMap(CODE_TL);
  const CODE_MD = { normalperarch: 'mn', digitalfullmouth: 'md' };
  const CODE_MD_R = flipMap(CODE_MD);
  const CODE_SVC = {
    impression: 'i', consultation: 'c', toothgem: 'g', polishing: 'p',
    fitting:'f', shipping:'s', deepclean: 'b', repair: 'r', resize: 'e', remake: 'w', custom: 'x',
  };
  const CODE_SVC_R = flipMap(CODE_SVC);

  function fmtRateTok(n) {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    return String(v >= 0 ? v : 0);
  }

  /** `^<cut><size>` on a stone token — omitted when it is the plain default.
   *  `^` is used rather than `~`, which already separates the code metadata. */
  function stoneSuffix(stone) {
    const cut = cleanCut(stone && stone.cut);
    const size = cleanSize(stone && stone.size);
    if (cut === 'round' && size === '1') return '';
    return '^' + (CODE_CUT[cut] || 'r') + String(size).replace('.', 'p');
  }

  /** Read a `^<cut><size>` suffix back off a token. */
  function readStoneSuffix(tok) {
    const m = /\^([a-z])(\d+(?:p\d+)?)$/.exec(String(tok || ''));
    if (!m) return { cut: 'round', size: '1' };
    return {
      cut: CODE_CUT_R[m[1]] || 'round',
      size: cleanSize(String(m[2]).replace('p', '.')),
    };
  }

  function encodeGroupToken(g, state) {
    const c = cleanGroupSpec(g);
    if (!c) return '';
    let matTok = CODE_MAT[c.material] || 'c';
    if (c.material === 'gold') {
      matTok = 'g' + (c.karat || '18');
      const gp = Number(c.goldPrice || 0);
      if (gp > 0 && gp !== state.lastGoldRate) {
        matTok += '@' + fmtRateTok(gp).replace('.', 'p');
        state.lastGoldRate = gp;
      }
    }
    const lvlTok = String(c.level) === '0.5' ? '0' : String(c.level || '1');
    const toks = [matTok, String(c.teeth || 1), lvlTok];

    if (allowsStones(c.material)) {
      /* both tokens are emitted when a tooth group is iced out AND accented */
      if (c.accent && c.accent.count > 0) {
        let at = 'a' + c.accent.count + (CODE_STYPE[c.accent.type] || 'c') + (CODE_SET[c.accent.setting] || 'f');
        if ((c.accent.type === 'labgrown' || c.accent.type === 'natural') && c.accent.price != null) {
          at += '@' + fmtRateTok(c.accent.price).replace('.', 'p');
        }
        /* cut & size ride as a suffix only when they are not the default,
           so an ordinary round 1 mm stone keeps the short code it always had */
        at += stoneSuffix(c.accent);
        toks.push(at);
      }
      if (c.full && (c.full.bars || String(c.level) === '0.5')) {
        toks.push('fb');
      } else if (c.full) {
        let ft = 'f' + (CODE_STYPE[c.full.type] || 'm') + (CODE_COV[c.full.coverage] || 's');
        if ((c.full.type === 'labgrown' || c.full.type === 'natural') && c.full.price != null) {
          ft += '@' + fmtRateTok(c.full.price).replace('.', 'p');
        }
        ft += stoneSuffix(c.full);
        toks.push(ft);
      }
    }
    if (CODE_PL[c.plating]) toks.push(CODE_PL[c.plating]);
    if (CODE_EN[c.enamel]) toks.push(CODE_EN[c.enamel]);
    if (CODE_EG[c.engraving]) toks.push(CODE_EG[c.engraving]);
    if (c.material === 'titanium' && CODE_AN[c.anodize]) toks.push(CODE_AN[c.anodize]);
    return toks.join('.');
  }

  function decodeGroupToken(rawTok, state) {
    const parts = String(rawTok || '').toLowerCase().split('.').filter(Boolean).map(t => t.replace(/@(\d+)p(\d+)/, '@$1.$2'));
    if (parts.length < 2) return null;
    const mPart = parts[0];
    let material = 'chrome';
    let karat = '18';
    let goldPrice = 0;

    if (mPart.startsWith('g')) {
      material = 'gold';
      const atIdx = mPart.indexOf('@');
      const kStr = (atIdx >= 0 ? mPart.slice(1, atIdx) : mPart.slice(1)) || '18';
      karat = S.goldKarat[kStr] ? kStr : '18';
      if (atIdx >= 0) {
        const gp = parseFloat(mPart.slice(atIdx + 1));
        if (Number.isFinite(gp) && gp > 0) {
          goldPrice = gp;
          state.lastGoldRate = gp;
        }
      } else if (state.lastGoldRate > 0) {
        goldPrice = state.lastGoldRate;
      } else if (Number(S.goldPrice) > 0) {
        goldPrice = Number(S.goldPrice);
      }
    } else if (CODE_MAT_R[mPart[0]]) {
      material = CODE_MAT_R[mPart[0]];
    } else {
      return null;
    }

    const teeth = Math.max(1, Math.min(32, parseInt(parts[1], 10) || 1));
    const lvRaw = parts[2] || '1';
    const level = (lvRaw === '0' || lvRaw === '05') ? '0.5' : (S.designPct[lvRaw] !== undefined ? lvRaw : '1');

    const g = {
      material,
      teeth,
      level,
      plating: 'none',
      enamel: 'none',
      engraving: 'none',
      anodize: 'none',
    };
    if (material === 'gold') {
      g.karat = karat;
      if (goldPrice > 0) g.goldPrice = goldPrice;
    }

    // Handle 0.5 stored as "0.5" across two dot tokens if ever hand-typed
    let startIdx = 3;
    if (parts[2] === '0' && parts[3] === '5') {
      g.level = '0.5';
      startIdx = 4;
    }

    for (let i = startIdx; i < parts.length; i++) {
      const tk = parts[i];
      if (!tk) continue;
      if (CODE_PL_R[tk]) { g.plating = CODE_PL_R[tk]; continue; }
      if (CODE_EN_R[tk]) { g.enamel = CODE_EN_R[tk]; continue; }
      if (CODE_EG_R[tk]) { g.engraving = CODE_EG_R[tk]; continue; }
      if (CODE_AN_R[tk]) { if (material === 'titanium') g.anodize = CODE_AN_R[tk]; continue; }
      if (tk === 'fb') {
        if (allowsStones(material)) g.full = { bars: true };
        continue;
      }
      if (tk[0] === 'a' && allowsStones(material)) {
        const sfx = readStoneSuffix(tk);
        const core = tk.split('^')[0];
        const am = core.match(/^a(\d+)([cmln])([a-z])(?:@(\d+(?:\.\d+)?))?$/);
        if (am) {
          const count = Math.max(1, parseInt(am[1], 10) || 1);
          const type = CODE_STYPE_R[am[2]] || 'cz';
          const setting = CODE_SET_R[am[3]] || 'flush';
          const acc = { count, type, setting, cut: sfx.cut, size: sfx.size };
          if (am[4] !== undefined) {
            const pr = parseFloat(am[4]);
            if (Number.isFinite(pr) && pr >= 0) { acc.price = pr; acc.customPrice = pr; }
          } else if (S.accentPrice[type] !== null && S.accentPrice[type] !== undefined) {
            acc.price = Number(S.accentPrice[type]);
          }
          g.accent = acc;
        }
        continue;
      }
      if (tk[0] === 'f' && allowsStones(material)) {
        const sfx = readStoneSuffix(tk);
        const core = tk.split('^')[0];
        const fm = core.match(/^f([cmln])([shibfmcv])(?:@(\d+(?:\.\d+)?))?$/);
        if (fm) {
          if (g.level === '0.5') {
            g.full = { bars: true };
          } else {
            const type = CODE_STYPE_R[fm[1]] || 'moissanite';
            const coverage = CODE_COV_R[fm[2]] || 'standardpave';
            const fl = { type, coverage, cut: sfx.cut, size: sfx.size };
            if (fm[3] !== undefined) {
              const pr = parseFloat(fm[3]);
              if (Number.isFinite(pr) && pr >= 0) { fl.price = pr; fl.customPrice = pr; }
            } else if (S.fullPrice[type] !== null && S.fullPrice[type] !== undefined) {
              fl.price = Number(S.fullPrice[type]);
            }
            g.full = fl;
          }
        }
      }
    }
    return g;
  }

  /**
   * Encode a single line OR a full order into a short universal `EGZ-...` code.
   * Options: { compact: true } omits optional text metadata for the shortest possible code.
   */
  function encodeCode(input, opts) {
    const o = opts || {};
    if (!input || typeof input !== 'object') return '';

    // Allow passing a single line directly
    const isOrder = Array.isArray(input.lines) || Array.isArray(input.services);
    const rawLines = isOrder ? (input.lines || []) : [input];
    const rawServices = isOrder ? (input.services || []) : [];

    const state = { lastGoldRate: 0 };
    const lineTokens = [];
    const meta = {};
    const lineNames = [];
    const groupLabels = [];
    const toothMap = [];
    let hasLineNames = false;
    let hasGroupLabels = false;
    let hasTeeth = false;

    rawLines.forEach((rawLine, li) => {
      const c = cleanLineSpec(rawLine);
      if (!c) return;
      if (c.isMixed && Array.isArray(c.groups) && c.groups.length > 1) {
        const gToks = c.groups.map((g) => encodeGroupToken(g, state)).filter(Boolean);
        if (!gToks.length) return;
        lineTokens.push('(' + gToks.join('+') + ')');
        const gl = c.groups.map((g) => g.label || '');
        groupLabels[li] = gl;
        if (gl.some(Boolean)) hasGroupLabels = true;
        const gt = c.groups.map((g) => (Array.isArray(g.toothIds) && g.toothIds.length ? g.toothIds.join(',') : ''));
        toothMap[li] = gt;
        if (gt.some(Boolean)) hasTeeth = true;
      } else {
        const tok = encodeGroupToken(c, state);
        if (!tok) return;
        lineTokens.push(tok);
        if (Array.isArray(c.toothIds) && c.toothIds.length) {
          toothMap[li] = c.toothIds.join(',');
          hasTeeth = true;
        }
      }
      const nm = String(c.name || '').trim().slice(0, 40);
      lineNames[li] = nm;
      if (nm) hasLineNames = true;
    });

    const optTokens = [];
    const svcNames = [];
    let hasSvcNames = false;

    rawServices.forEach((sv, si) => {
      if (!sv || typeof sv !== 'object') return;
      const type = sv.type || 'custom';
      const qty = Math.max(1, Math.round(Number(sv.qty) || 1));
      const defP = Number((S.servicePrices && S.servicePrices[type]) || 0);
      const unit = sv.unitPrice !== undefined && sv.unitPrice !== null && sv.unitPrice !== ''
        ? Math.max(0, Number(sv.unitPrice) || 0)
        : defP;
      const sc = CODE_SVC[type] || 'x';
      let st = 'u' + sc + qty;
      if (sc === 'x' || unit !== defP) st += '@' + fmtRateTok(unit || 0);
      optTokens.push(st);
      const defName = L.service[type] || 'Studio Service';
      const customName = sv.name && String(sv.name).trim() !== defName ? String(sv.name).trim().slice(0, 40) : '';
      svcNames[si] = customName;
      if (customName) hasSvcNames = true;
    });

    if (!lineTokens.length && !optTokens.length) return '';

    if (isOrder) {
      if (CODE_TL[input.timeline]) optTokens.push(CODE_TL[input.timeline]);
      if (CODE_MD[input.mold]) optTokens.push(CODE_MD[input.mold]);
      const dep = Number(input.depositPct);
      if (dep > 0) optTokens.push('d' + Math.round(dep));
      const disc = input.discount;
      if (disc && Number(disc.value) > 0) {
        optTokens.push('k' + (disc.type === 'pct' ? 'p' : 'f') + fmtRateTok(disc.value));
      } else if (Number(input.discountAmount) > 0) {
        optTokens.push('kf' + fmtRateTok(input.discountAmount));
      }
    }

    if (!o.compact) {
      if (hasLineNames) meta.n = lineNames;
      if (hasGroupLabels) meta.g = groupLabels;
      if (hasTeeth) meta.t = toothMap;
      if (hasSvcNames) meta.s = svcNames;
      // Transfer the relationship, not a studio layer ID. The full code already
      // carries the corresponding tooth IDs; compact legacy codes remain unchanged.
      const linked = rawServices.map(s => {
        const i = s.forDesign ? rawLines.findIndex(l => l.designId === s.forDesign) : -1;
        return i < 0 ? null : [i, cleanToothIds(s.forTeeth), String(s.notes || '').slice(0,160)];
      });
      if(linked.some(Boolean)) meta.h=linked;
      const cn = String(input.clientName || '').trim().slice(0, 60);
      const cp = String(input.clientPhone || '').trim().slice(0, 30);
      const nt = String(input.notes || '').trim().slice(0, 160);
      if (cn) meta.c = cn;
      if (cp) meta.p = cp;
      if (nt) meta.m = nt;
    }

    let body = lineTokens.length ? lineTokens.join('/') : '_';
    if (optTokens.length) body += '|' + optTokens.join('.');
    if (Object.keys(meta).length) body += '~' + b64uEnc(JSON.stringify(meta));
    return 'EGZ-' + body;
  }

  function encodeLineCode(line, opts) {
    return encodeCode(line, opts);
  }

  /** Decode legacy `EGZ1:<base64url(query)>` intake codes into the unified shape. */
  function decodeLegacyEgz1(payload) {
    try {
      const qs = b64uDec(payload);
      const p = new URLSearchParams(qs);
      if (!p.has('m') && !p.has('t') && !p.has('mx')) return null;

      // Mixed groups inside EGZ1 if `mx` param is present
      if (p.get('mx')) {
        const inner = decodeCode(p.get('mx'));
        if (inner) {
          if (p.get('c') && !inner.clientName) inner.clientName = p.get('c');
          if (p.get('ph') && !inner.clientPhone) inner.clientPhone = p.get('ph');
          if (p.get('nt') && !inner.notes) inner.notes = p.get('nt');
          if (p.get('k')) inner.token = p.get('k');
          inner.version = 1;
          return inner;
        }
      }

      const material = p.get('m') || 'chrome';
      const teeth = Math.max(1, Math.min(16, parseInt(p.get('t'), 10) || 6));
      const level = p.get('l') || '1';
      const line = {
        name: (p.get('n') || '').trim().slice(0, 40),
        material,
        teeth,
        level,
        plating: p.get('pl') || 'none',
        enamel: p.get('en') || 'none',
        engraving: p.get('eg') || 'none',
        anodize: material === 'titanium' ? (p.get('an') || 'none') : 'none',
      };
      if (material === 'gold') {
        const rawK = p.get('krt') || p.get('k') || '18';
        line.karat = S.goldKarat[rawK] ? rawK : '18';
        const rg = parseFloat(p.get('rg') || p.get('gr'));
        if (Number.isFinite(rg) && rg > 0) line.goldPrice = rg;
        else if (Number(S.goldPrice) > 0) line.goldPrice = Number(S.goldPrice);
      }
      const st = p.get('s') || 'none';
      if (allowsStones(material)) {
        if (st === 'accent') {
          const count = Math.max(1, parseInt(p.get('sc'), 10) || 1);
          const type = p.get('at') || 'cz';
          const setting = p.get('ss') || 'flush';
          const acc = { count, type, setting };
          const ra = parseFloat(p.get('ra'));
          if (Number.isFinite(ra) && ra >= 0) { acc.price = ra; acc.customPrice = ra; }
          else if (S.accentPrice[type] !== null && S.accentPrice[type] !== undefined) acc.price = Number(S.accentPrice[type]);
          line.accent = acc;
        } else if (st === 'fulliced') {
          if (String(level) === '0.5') {
            line.full = { bars: true };
          } else {
            const type = p.get('ft') || 'moissanite';
            const coverage = p.get('cv') || 'standardpave';
            const fl = { type, coverage };
            const rf = parseFloat(p.get('rf'));
            if (Number.isFinite(rf) && rf >= 0) { fl.price = rf; fl.customPrice = rf; }
            else if (S.fullPrice[type] !== null && S.fullPrice[type] !== undefined) fl.price = Number(S.fullPrice[type]);
            line.full = fl;
          }
        }
      }
      return {
        version: 1,
        token: p.get('k') || '',
        lines: [line],
        services: [],
        timeline: p.get('tl') || 'standard',
        mold: p.get('md') || 'none',
        depositPct: 0,
        discount: null,
        clientName: (p.get('c') || '').trim(),
        clientPhone: (p.get('ph') || '').trim(),
        notes: (p.get('nt') || '').trim(),
      };
    } catch (e) {
      return null;
    }
  }

  /** Extract a valid code string out of arbitrary text, WhatsApp message, or URL. */
  function extractCode(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    // URL query/hash ?c=... or ?code=... or #c=...
    const urlC = s.match(/[?#&](?:c|code)=([^&#\s]+)/i);
    if (urlC) {
      try {
        const dec = decodeURIComponent(urlC[1]).trim();
        if (/^EGZ-/i.test(dec) || /^EGZ1[:\uff1a]/i.test(dec)) return dec;
        return 'EGZ-' + dec;
      } catch (e) {}
    }
    // URL hash/query #d=... (legacy intake share link)
    const urlD = s.match(/[?#&]d=([A-Za-z0-9\-_=+/%]+)/);
    if (urlD) {
      try { return 'EGZ1:' + decodeURIComponent(urlD[1]); } catch (e) {}
    }
    // Embedded EGZ- code inside text
    /* `^` carries stone cut/size, `/` separates sets, `~` starts metadata */
    const m2 = s.match(/EGZ-([A-Za-z0-9.+()/@|~^_-]+)/i);
    if (m2) return 'EGZ-' + m2[1].replace(/[.,;:]+$/, '');
    // Embedded legacy EGZ1: code inside text
    const m1 = s.match(/EGZ1[:\uff1a]\s*([A-Za-z0-9\-_=+/]+)/i);
    if (m1) return 'EGZ1:' + m1[1];
    return s;
  }

  /** Decode any `EGZ-...`, `EGZ1:...`, or share URL into a ready-to-load order spec. */
  function decodeCode(raw) {
    const extracted = extractCode(raw);
    if (!extracted) return null;

    if (/^EGZ1[:\uff1a]/i.test(extracted)) {
      const legacy = decodeLegacyEgz1(extracted.replace(/^EGZ1[:\uff1a]\s*/i, ''));
      if (legacy) legacy.code = extracted;
      return legacy;
    }

    let body = extracted.replace(/^EGZ-/i, '').trim().replace(/[.,;:]+$/, '');
    if (!body) return null;

    // Split optional ~<base64url> metadata first (case-sensitive!)
    let meta = {};
    const tildeIdx = body.indexOf('~');
    if (tildeIdx >= 0) {
      const metaRaw = body.slice(tildeIdx + 1);
      body = body.slice(0, tildeIdx);
      try {
        const parsed = JSON.parse(b64uDec(metaRaw));
        if (parsed && typeof parsed === 'object') meta = parsed;
      } catch (e) {}
    }

    // Split lines and |options
    const pipeIdx = body.indexOf('|');
    const linesPart = pipeIdx >= 0 ? body.slice(0, pipeIdx) : body;
    const optsPart = pipeIdx >= 0 ? body.slice(pipeIdx + 1) : '';

    const state = { lastGoldRate: 0 };
    const lines = [];

    if (linesPart && linesPart !== '_') {
      const rawSets = linesPart.split('/').filter(Boolean);
      for (let li = 0; li < rawSets.length; li++) {
        const seg = rawSets[li].trim();
        if (!seg) continue;
        const name = (Array.isArray(meta.n) && meta.n[li]) ? String(meta.n[li]).slice(0, 40) : '';
        if (seg.startsWith('(') && seg.endsWith(')')) {
          const inner = seg.slice(1, -1);
          const gSegs = inner.split('+').filter(Boolean);
          const gLabels = (Array.isArray(meta.g) && Array.isArray(meta.g[li])) ? meta.g[li] : [];
          const gTeeth = (Array.isArray(meta.t) && Array.isArray(meta.t[li])) ? meta.t[li] : [];
          const groups = [];
          for (let gi = 0; gi < gSegs.length; gi++) {
            const g = decodeGroupToken(gSegs[gi], state);
            if (!g) return null;
            if (gLabels[gi]) g.label = String(gLabels[gi]).slice(0, 40);
            if (gTeeth[gi]) {
              const tids = cleanToothIds(String(gTeeth[gi]).split(','));
              if (tids.length) g.toothIds = tids;
            }
            groups.push(g);
          }
          if (!groups.length) return null;
          if (groups.length === 1) {
            const single = groups[0];
            delete single.label;
            if (name) single.name = name;
            lines.push(single);
          } else {
            const mixed = {
              name,
              isMixed: true,
              material: groups[0].material,
              teeth: groups.reduce((s, g) => s + g.teeth, 0),
              level: 'mixed',
              groups,
            };
            const fg = groups.find((g) => g.material === 'gold');
            if (fg) {
              mixed.karat = fg.karat;
              if (fg.goldPrice) mixed.goldPrice = fg.goldPrice;
            }
            const allT = cleanToothIds(groups.reduce((a, g) => a.concat(g.toothIds || []), []));
            if (allT.length) mixed.toothIds = allT;
            lines.push(mixed);
          }
        } else {
          const single = decodeGroupToken(seg, state);
          if (!single) return null;
          if (name) single.name = name;
          if (Array.isArray(meta.t) && typeof meta.t[li] === 'string' && meta.t[li]) {
            const tids = cleanToothIds(meta.t[li].split(','));
            if (tids.length) single.toothIds = tids;
          }
          lines.push(single);
        }
      }
    }

    let timeline = 'standard';
    let mold = 'none';
    let depositPct = 0;
    let discount = null;
    const services = [];
    const svcNames = Array.isArray(meta.s) ? meta.s : [];
    let svcIdx = 0;

    if (optsPart) {
      // Split on dots that are NOT decimal points inside numbers (e.g. kf12.5 or ux1@12.5)
      const optSegs = optsPart.toLowerCase().split(/\.(?=[a-z])/).filter(Boolean);
      optSegs.forEach((op) => {
        if (CODE_TL_R[op]) { timeline = CODE_TL_R[op]; return; }
        if (CODE_MD_R[op]) { mold = CODE_MD_R[op]; return; }
        const dm = op.match(/^d(\d+)$/);
        if (dm) { depositPct = Math.max(0, Math.min(100, parseInt(dm[1], 10) || 0)); return; }
        const km = op.match(/^k([pf])(\d+(?:\.\d+)?)$/);
        if (km) {
          const val = parseFloat(km[2]);
          if (val > 0) discount = { type: km[1] === 'p' ? 'pct' : 'flat', value: val };
          return;
        }
        const um = op.match(/^u([a-z])(\d+)(?:@(\d+(?:\.\d+)?))?$/);
        if (um) {
          const type = CODE_SVC_R[um[1]] || 'custom';
          const qty = Math.max(1, parseInt(um[2], 10) || 1);
          const defP = Number((S.servicePrices && S.servicePrices[type]) || 0);
          const unitPrice = um[3] !== undefined ? Math.max(0, parseFloat(um[3]) || 0) : defP;
          const customName = svcNames[svcIdx] ? String(svcNames[svcIdx]).slice(0, 40) : '';
          const link=meta.h?.[svcIdx];
          svcIdx++;
          const target=Array.isArray(link) && Number.isInteger(link[0]) && lines[link[0]];
          const teeth=target && cleanToothIds(link[1]);
          if(teeth?.length) target.designId ||= 'set-'+link[0];
          services.push({
            ...(teeth?.length && {forDesign:target.designId,forTeeth:teeth,notes:String(link[2] || '').slice(0,160)}),
            type,
            name: customName || L.service[type] || 'Studio Service',
            qty,
            unitPrice,
          });
        }
      });
    }

    if (!lines.length && !services.length) return null;

    // Detect custom market rates carried inside the decoded lines
    const rates = {};
    lines.forEach((ln) => {
      const list = Array.isArray(ln.groups) ? ln.groups : [ln];
      list.forEach((g) => {
        if (g.material === 'gold' && Number(g.goldPrice) > 0 && !rates.gold) rates.gold = Number(g.goldPrice);
        if (g.accent && Number(g.accent.customPrice) > 0) {
          if (g.accent.type === 'labgrown') rates.labAccent = Number(g.accent.customPrice);
          if (g.accent.type === 'natural') rates.natAccent = Number(g.accent.customPrice);
        }
        if (g.full && Number(g.full.customPrice) > 0) {
          if (g.full.type === 'labgrown') rates.labFull = Number(g.full.customPrice);
          if (g.full.type === 'natural') rates.natFull = Number(g.full.customPrice);
        }
      });
    });

    return {
      version: 2,
      code: extracted.startsWith('EGZ-') ? extracted : ('EGZ-' + extracted.replace(/^EGZ-/i, '')),
      lines,
      services,
      timeline,
      mold,
      depositPct,
      discount,
      rates,
      clientName: meta.c ? String(meta.c) : '',
      clientPhone: meta.p ? String(meta.p) : '',
      notes: meta.m ? String(meta.m) : '',
    };
  }

  /* ───────────── zero-dependency branded client/staff PDF builder ───────────── */

  // Standard PDF fonts are Latin. Preserve Arabic names in readable transliteration
  // rather than silently dropping a client or emitting broken WinAnsi glyphs.
  const pdfArabic = Object.fromEntries(Array.from('ءآأؤإئابتثجحخدذرزسشصضطظعغفقكلمنهويىة٠١٢٣٤٥٦٧٨٩،؟',
    (ch, i) => [ch, "' aa a w i y a b t th j h kh d dh r z s sh s d t z a gh f q k l m n h w y a a 0 1 2 3 4 5 6 7 8 9 , ?".split(' ')[i]]));
  function pdfClean(value) {
    return String(value ?? '').normalize('NFKC').replace(/[\u0600-\u06ff]/g, c => pdfArabic[c] || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-').replace(/[·•]/g, ' - ').replace(/×/g, 'x').replace(/[^\S ]+/g, ' ').replace(/[^ -~]/g, '').trim();
  }
  const pdfEsc = s => pdfClean(s).replace(/[\\()]/g, '\\$&');
  function documentFilename(kind, meta = {}) {
    const clean = (value) =>
      pdfClean(value)
        .replace(/[^\w-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const issued = meta.date || meta.createdAt;
    const date = new Date(issued?.toDate?.() || issued || Date.now());
    const day = (Number.isFinite(+date) ? date : new Date()).toISOString().slice(0, 10);
    const ref = clean(meta.orderNo || meta.id || globalThis.crypto.randomUUID());
    return `EGYGRILLZ-${kind}-${clean(meta.clientName).slice(0, 44) || day}-${ref.slice(0, 48)}.pdf`;
  }
  const quotePdfFilename = (meta) => documentFilename('Quotation', meta);
  // Only posted receipts count as cash collected. Deposit/balance in the quotation are terms.
  function paymentSummary(q) {
    const paid = (Array.isArray(q?.payments) ? q.payments : []).reduce(
      (n, p) => n + (Number.isSafeInteger(p.amount) && p.amount > 0 ? p.amount : 0),
      0,
    );
    const outstanding = Math.max(0, (q?.order?.total ?? q?.total ?? 0) - paid);
    return { paid, outstanding, status: !outstanding ? 'Settled' : paid ? 'Part-paid' : 'Unpaid' };
  }

  // Issued quotations are snapshots: a later change to the gold rate or studio
  // settings must not change the document downloaded from history or the bot.
  function savedQuoteOrder(quote) {
    const o = quote && (quote.order || quote);
    if (!o || !Number.isFinite(o.total)) return null;
    const lines = o.lines || [], services = o.services || [];
    if (!Array.isArray(lines) || !Array.isArray(services) || !(lines.length || services.length) ||
        [...lines, ...services].some(i => !Number.isFinite(i?.subtotal))) return null;
    const sum = (arr, field) => arr.reduce((n, x) => n + (Number(x[field]) || 0), 0);
    return { linesSubtotal: sum(lines, 'subtotal'), servicesSubtotal: sum(services, 'subtotal'),
      teethTotal: sum(lines, 'teeth'), ...o, lines, services };
  }

  // An estimate describes money DUE, not money received. Both invoice studios
  // consume these exact issued amounts rather than re-pricing individual teeth.
  function matchQuoteClient(clients, q) {
    const phone = s => String(s || '').replace(/\D/g,'').replace(/^(?:0020|20)(?=1\d{9}$)/, '0');
    const normal = s => String(s || '').trim().toLowerCase();
    const digits = phone(q.clientPhone), email = normal(q.clientEmail), name = normal(q.clientName);
    const matches = clients.filter(c => digits ? (phone(c.phone) === digits || c.id === digits)
      : email ? normal(c.email) === email : name && normal(c.name) === name);
    return matches.length === 1 ? matches[0] : null;
  }
  function quoteToInvoice(q) {
    const order = savedQuoteOrder(q);
    if (!order) return null;
    const shown=designBreakdown(order);
    const items=shown.designs.map(({line:l,groups,subtotal})=>({name:l.name || (LABELS.material[l.material] || 'Custom')+' Grillz',
      spec:groups.map(({group:g,stones})=>toothHeading(g,l.name)+': '+[groupLabel(g,{includeMaterial:true,omitCount:true}),
        g.accent && `${g.accent.cut || 'round'} ${g.accent.size || 1} mm, ${LABELS.setting[g.accent.setting] || g.accent.setting}`,
        g.full && !g.full.bars && LABELS.coverage[g.full.coverage], ...stones.map(s=>`${s.qty} × ${s.name} (${s.notes})`)].filter(Boolean).join(' / ')).join('\n'),
      qty:1,price:subtotal,line:l}));
    shown.services.forEach(s=>items.push({name:s.name,spec:s.notes || 'Studio service',qty:s.qty,price:s.unitPrice,serviceType:s.type}));
    if (order.timelineAmount) items.push({ name: LABELS.timeline[order.timeline] + ' timeline', spec: `+${order.timelinePct}%`, qty: 1, price: order.timelineAmount });
    if (order.moldCost) items.push({ name: 'Mold', spec: LABELS.mold[order.mold], qty: 1, price: order.moldCost });
    let discountAmount = Number(order.discountAmount) || 0;
    const gap = order.total - (items.reduce((n,i) => n + money(i.qty * i.price), 0) - discountAmount);
    if (gap > 0) items.push({ name: order.calculatedTotal != null ? 'Agreed price adjustment' : 'Rounding adjustment', spec: '', qty: 1, price: gap });
    if (gap < 0) discountAmount -= gap;
    return { quoteId: q.id || '', clientName: q.clientName || (q.sheetId ? q.label || q.sheetId : ''), clientPhone: q.clientPhone || '', clientEmail: q.clientEmail || '',
      notes: [q.orderNo, q.notes, order.deposit ? `Deposit due: ${fmt(order.deposit)} ${order.currency || 'EGP'}.` : ''].filter(Boolean).join('\n'),
      items, total: order.total, discountAmount, depositDue: order.deposit || 0, depositAmount: paymentSummary(q).paid };
  }

  // Same reconciled rows on the estimate screen, Quotes and the issued PDF.
  function quoteTotalRows(order, { omitEmptyMold = false } = {}) {
    const autoTotal = order.calculatedTotal ?? order.total;
    const rounding = autoTotal - order.linesSubtotal - order.servicesSubtotal - (order.timelineAmount || 0) - (order.moldCost || 0) + (order.discountAmount || 0);
    const adj = order.total - autoTotal;
    const shown=designBreakdown(order);
    const rows = [[`Subtotal (${order.lines.length} ${order.lines.length===1?'design':'designs'})`, shown.linesSubtotal]];
    if (shown.services.length) rows.push(['Additional services', shown.servicesSubtotal]);
    rows.push([`Timeline - ${L.timeline[order.timeline] || 'Standard'}${order.timelinePct ? ' (+'+order.timelinePct+'%)' : ' (no surcharge)'}`, order.timelineAmount || 0]);
    if (!omitEmptyMold || order.mold !== 'none') rows.push(['Mold - ' + (L.mold[order.mold] || 'None'), order.moldCost || 0]);
    if (order.discountAmount) rows.push(['Discount', -order.discountAmount]);
    if (rounding) rows.push(['Rounding adjustment', rounding]);
    if (adj) rows.push(['Agreed price adjustment', adj]);
    return rows;
  }

  // Adobe Helvetica metrics (ASCII, thousandths of an em). Amounts are flush
  // right even when they contain narrow digits/punctuation or bold glyphs.
  const pdfWidths = [
    [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
    [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584],
  ];
  const pdfWidth = (s, size, bold) => Array.from(s).reduce((w, ch) => w + (pdfWidths[bold ? 1 : 0][ch.charCodeAt(0) - 32] || 500), 0) * size / 1000;
  function pdfWrap(value, width, size, bold = false) {
    const out = []; let line = '';
    for (const word of pdfClean(value).split(' ')) {
      if (line && pdfWidth(line + ' ' + word, size, bold) > width) { out.push(line); line = ''; }
      if (line) line += ' ';
      for (const ch of word) {
        if (line && pdfWidth(line + ch, size, bold) > width) { out.push(line); line = ''; }
        line += ch;
      }
    }
    if (line) out.push(line);
    return out;
  }

  /** The one A4 quotation layout, used for browser downloads, uploads and Worker bytes. */
  function buildQuotePdfBytes(rawOrder, meta = {}) {
    const m = meta;
    const order = savedQuoteOrder(rawOrder) || calculateOrder(rawOrder?.lines || [], rawOrder || {});
    const {lines}=order, {designs,services}=designBreakdown(order), cur = order.currency || 'EGP';
    const amt = n => fmt(n) + ' ' + cur;
    const issued = m.date || m.createdAt;
    const when = new Date(issued?.toDate?.() || issued || Date.now());
    const stamp = Number.isFinite(when.getTime()) ? when : new Date();
    const date = stamp.toLocaleDateString('en-GB', { timeZone: 'Africa/Cairo' });
    const time = m.time || stamp.toLocaleTimeString('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
    const W = 595.28, H = 841.89, M = 40, R = W - M, bottom = H - 56;
    const f2 = n => Number(n).toFixed(2);
    const pages = [[]]; let ops = pages[0], y = 0;
    function text(value, x, top, size = 9.5, bold = false, right = false, gray = 0) {
      const str = pdfClean(value);
      if (right) x -= pdfWidth(str, size, bold);
      if (str) ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${gray} g 1 0 0 1 ${f2(x)} ${f2(H-top)} Tm (${pdfEsc(str)}) Tj ET`);
    }
    const rule = (top, dark = false) => ops.push(`${dark ? '0' : '0.86'} G 1 w ${M} ${f2(H-top)} m ${f2(R)} ${f2(H-top)} l S`);
    const need = h => { if (y + h > bottom) { ops = []; pages.push(ops); y = 54; } };
    function title(label) {
      const wrapped = pdfWrap(label, R-M, 10.5, true);
      need(24 + wrapped.length * 14);
      wrapped.forEach(t => { text(t, M, y, 10.5, true); y += 14; });
      rule(y - 9); y += 5;
    }
    function row(label, value, bold = false, indent = 10) {
      const left = pdfWrap(label, 215-indent, 9.5, bold), right = pdfWrap(value, R-M-225, 9.5, bold);
      for (let i = 0; i < Math.max(left.length, right.length); i++) {
        need(15); text(left[i], M+indent, y, 9.5, bold); text(right[i], R, y, 9.5, bold, true); y += 15;
      }
    }
    function paragraph(value, size, gray) {
      pdfWrap(value, R-M, size).forEach(t => { need(12); text(t, M, y, size, false, false, gray); y += 12; });
    }
    // The studio's interlocking mark (logo/logo_black.png), as vector outlines.
    ops.push(`q 0 g 0.314 0 0 -0.297 ${M} ${f2(H-30)} cm 0 44 m 27 0 l 74 0 l 74 15 l 35 15 l 18 44 l 65 104 l 83 81 l 75 71 l 60 71 l 60 56 l 81 56 l 102 81 l 65 128 l h f 111 0 m 158 0 l 185 44 l 120 128 l 94 96 l 104 83 l 120 104 l 167 44 l 150 15 l 111 15 l h f 79 0 m 93 15 l 106 0 l 106 16 l 100 23 l 100 40 l 93 50 l 85 40 l 85 23 l 79 16 l h f 102 56 m 125 56 l 125 71 l 110 71 l 104 79 l 94 67 l h f Q`);
    text(m.studioName || 'EGYGRILLZ', M+80, 50, 15, true);
    text('Beyond Jewelry.', M+80, 62, 8, false, false, 0.48);
    text('Custom dental jewelry - Cairo, Egypt', M+80, 72, 8, false, false, 0.48);
    text('DATE   ' + date, R, 46, 9, false, true, 0.22);
    text('TIME   ' + time, R, 58, 9, false, true, 0.22);
    text('QUOTATION', R, 74, 11, true, true); rule(90);
    y = 106;
    const nameLines = pdfWrap('Client: ' + (pdfClean(m.clientName) || '-'), 180, 9.5);
    text(nameLines[0], M, y);
    text('Designs: ' + lines.length, M+190, y); text('Teeth total: ' + order.teethTotal, M+280, y);
    text('Timeline: ' + (L.timeline[order.timeline] || 'Standard'), M+380, y);
    y += 14;
    nameLines.slice(1).forEach(t => { need(14); text(t, M, y); y += 14; });
    const contact = [m.clientPhone, m.clientEmail].filter(Boolean).join('  /  ');
    if (contact) paragraph(contact, 8, 0.35);
    paragraph(`Prices in ${cur}. This quotation is an estimate - gold and diamond rates are confirmed against the day of production.`, 8, 0.48);
    y += 6;
    function details(g, stones) {
      const stone = [];
      if (g.accent) stone.push(`${g.accent.count} x ${L.accentType[g.accent.type] || g.accent.type}, ${L.setting[g.accent.setting] || g.accent.setting}, ${g.accent.cut || 'round'} ${g.accent.size || 1} mm`);
      if (g.full) stone.push(g.full.bars ? 'Iced-out bar' : `Full ${L.accentType[g.full.type] || g.full.type}, ${L.coverage[g.full.coverage] || g.full.coverage}, ${g.full.cut || 'round'} ${g.full.size || 1} mm`);
      row('Material', g.material === 'gold' ? `Gold ${g.karat}K` : L.material[g.material] || g.material);
      row('Complexity', levelName(g.level));
      if (g.material === 'gold' && g.goldPrice) row('Gold rate used', amt(g.goldPrice) + '/g');
      row('Base cost', amt(g.materialTotal)); row('Design cost', g.designCost ? amt(g.designCost) : '-');
      if(stone.length || !stones.length) row('Stones', stone.length ? stone.join(' / ') + ' - ' + amt(g.stoneCost) : 'None');
      for(const s of stones) row(`${s.qty} x ${s.name}`, `${s.notes} - ${amt(s.subtotal)}`);
      for (const [k, label] of [['plating','Plating'],['enamel','Enamel'],['engraving','Engraving'],['anodize','Anodizing']]) {
        if (g[k] && g[k] !== 'none') row(label, `${L[k][g[k]] || g[k]} - ${amt(g[k+'Cost'])}`);
      }
    }
    designs.forEach(({line:l,groups,subtotal},i)=>{
      title(pdfClean(l.name) || 'Design '+(i+1));
      for(const {group,stones,subtotal:sub} of groups){
        need(60);row(toothHeading(group,l.name),'',true);details(group,stones);
        if(groups.length>1) row('Subtotal',amt(sub),true);
      }
      row('Design subtotal',amt(subtotal),true);y+=5;
    });
    if (services.length) {
      title('Additional services');
      services.forEach(s => { row(`${s.name} (x${s.qty || 1})`, amt(s.subtotal)); if (s.notes) paragraph(s.notes, 8, 0.4); }); y += 5;
    }
    // Match the reference: let the breakdown finish before breaking for the total band.
    title('Quote totals'); quoteTotalRows(order,{omitEmptyMold:!!m.sheetId}).forEach(([k,v]) => row(k,amt(v),false,0));
    need(48); y += 6; rule(y, true); y += 26; text('TOTAL', M, y, 14, true); text(amt(order.total), R, y, 14, true, true); y += 24;
    if (order.depositPct || order.deposit || order.depositManual) {
      row(order.depositManual ? 'Agreed deposit due' : `Deposit (${order.depositPct}%) to start production`, amt(order.deposit));
      row(m.sheetId ? 'Balance if deposit paid' : 'Balance before delivery / pickup', amt(order.balance));
    }
    if (m.sheetId) {
      const receipts = paymentSummary({...m, order});
      title('Payment record'); row('Amount received', amt(receipts.paid)); row('Outstanding today', amt(receipts.outstanding),true);
      paragraph('Order reference: '+m.sheetId, 8, 0.4);
    }
    if (m.notes) { y += 4; title('Notes'); paragraph(m.notes, 9, 0.2); }
    if (m.validDays > 0) paragraph(`Valid for ${m.validDays} days from the date of issue.`, 8, 0.45);
    if (m.code) paragraph('Design code: ' + m.code, 7, 0.45);
    pages.forEach((page, i) => {
      ops = page;
      text('egygrillz.com - @egygrillz - booking: egygrillz.com/booking.html', M, H-26, 8, false, false, 0.56);
      text(`Page ${i+1} of ${pages.length}`, R, H-26, 8, false, true, 0.56);
      pages[i] = page.join('\n');
    });

    const enc = (str) => {
      const arr = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i) & 0xff;
      return arr;
    };
    const objs = [];
    const addObj = (body) => { objs.push(body); return objs.length; };
    const catalogId = addObj('');
    const pagesId = addObj('');
    const f1 = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2Id = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const pageIds = pages.map((stream) => {
      const contentId = addObj(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      return addObj(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${f2(W)} ${f2(H)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2Id} 0 R >> >> /Contents ${contentId} 0 R >>`);
    });
    objs[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    let out = '%PDF-1.4\n';
    const offsets = [0];
    objs.forEach((body, index) => {
      offsets.push(out.length);
      out += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xrefPos = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index < offsets.length; index++) {
      out += String(offsets[index]).padStart(10, '0') + ' 00000 n \n';
    }
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
    return enc(out);
  }

  function downloadQuotePdf(rawOrder, meta) {
    const m = meta || {};
    const bytes = buildQuotePdfBytes(rawOrder, m);
    if (typeof Blob !== 'function' || typeof document === 'undefined') return bytes;
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const fname = quotePdfFilename(m);
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 15000);
    return bytes;
  }

  /* ─────────────────────────── persistence & caching ─────────────────────────── */

  const SETTINGS_DOC = 'pricing';
  const SETTINGS_TTL_MS = 30 * 60 * 1000;      // 30 minutes fresh cache (invalidated immediately on save)
  const QUOTA_COOLDOWN_MS = 15 * 60 * 1000;    // 15 minutes pause after HTTP 429 / resource-exhausted
  const QUOTA_KEY = 'egygz_fs_quota_until_v1';
  const FETCH_TIMEOUT_MS = 8000;
  const _inflight = {};

  function lsGet(key) {
    try { return global.localStorage ? global.localStorage.getItem(key) : null; } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try { if (global.localStorage) global.localStorage.setItem(key, val); } catch (e) {}
  }
  function lsDel(key) {
    try { if (global.localStorage) global.localStorage.removeItem(key); } catch (e) {}
  }

  function isQuotaPaused() {
    const until = Number(lsGet(QUOTA_KEY) || 0);
    return Number.isFinite(until) && until > Date.now();
  }
  function markQuotaPaused(ms) {
    lsSet(QUOTA_KEY, String(Date.now() + (Number(ms) || QUOTA_COOLDOWN_MS)));
  }
  function isQuotaErr(err) {
    if (!err) return false;
    const code = String(err.code || '').toLowerCase();
    const msg = String(err.message || err || '').toLowerCase();
    return code === 'resource-exhausted' || /resource-exhausted|quota|429/.test(msg);
  }

  function dbProjectId(db) {
    try {
      if (db && db._egygzProjectId) return String(db._egygzProjectId);
      if (db && db.app && db.app.options && db.app.options.projectId) return String(db.app.options.projectId);
    } catch (e) {}
    return FIRESTORE_PROJECT;
  }

  function settingsCacheKey(docId, projectId) {
    const proj = projectId && projectId !== FIRESTORE_PROJECT ? projectId + '_' : '';
    return 'egygz_settings_v1_' + proj + docId;
  }

  function readSettingsCache(docId, allowStale, projectId) {
    try {
      const raw = lsGet(settingsCacheKey(docId, projectId));
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || typeof entry !== 'object' || !entry.data || typeof entry.data !== 'object') return null;
      if (!allowStale && (Date.now() - Number(entry.at || 0)) > SETTINGS_TTL_MS) return null;
      return entry.data;
    } catch (e) { return null; }
  }

  function writeSettingsCache(docId, data, projectId) {
    if (!data || typeof data !== 'object') return;
    lsSet(settingsCacheKey(docId, projectId), JSON.stringify({ at: Date.now(), data }));
  }

  function clearSettingsCache(docId, projectId) {
    lsDel(settingsCacheKey(docId, projectId));
  }

  async function dbReadSettings(db, docId) {
    if (!db || !docId) return { supported: false, exists: false, data: null };
    if (typeof db.collection === 'function') {
      const snap = await db.collection('settings').doc(docId).get();
      const exists = !!(snap && (typeof snap.exists === 'function' ? snap.exists() : snap.exists));
      return { supported: true, exists, data: exists ? (snap.data() || {}) : null };
    }
    if (typeof db._egygzGet === 'function') {
      const res = await db._egygzGet('settings', docId);
      return { supported: true, exists: !!(res && res.exists), data: (res && res.exists) ? (res.data || {}) : null };
    }
    return { supported: false, exists: false, data: null };
  }

  async function dbWriteSettings(db, docId, payload, merge) {
    if (!db) throw new Error('Database not connected');
    if (typeof db.collection === 'function') {
      await db.collection('settings').doc(docId).set(payload, merge === false ? {} : { merge: true });
      return;
    }
    if (typeof db._egygzSet === 'function') {
      await db._egygzSet('settings', docId, payload, merge !== false);
      return;
    }
    throw new Error('Database write adapter unavailable');
  }

  function decodeFirestoreValue(v) {
    if (!v || typeof v !== 'object') return v;
    if (v.nullValue !== undefined) return null;
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.doubleValue !== undefined) return Number(v.doubleValue);
    if (v.booleanValue !== undefined) return v.booleanValue;
    if (v.timestampValue !== undefined) return v.timestampValue;
    if (v.arrayValue) return (v.arrayValue.values || []).map(decodeFirestoreValue);
    if (v.mapValue) {
      const out = {};
      const f = v.mapValue.fields || {};
      for (const k of Object.keys(f)) out[k] = decodeFirestoreValue(f[k]);
      return out;
    }
    return undefined;
  }

  function fetchWithTimeout(url, opts, timeoutMs) {
    const ms = timeoutMs || FETCH_TIMEOUT_MS;
    if (typeof AbortController === 'undefined') return fetch(url, opts);
    const ctrl = new AbortController();
    const timer = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, ms);
    return fetch(url, Object.assign({}, opts, { signal: ctrl.signal }))
      .finally(() => clearTimeout(timer));
  }

  async function restSettings(docId, opts) {
    const defaults = { data: null, source: 'defaults' };
    if (!docId || typeof docId !== 'string') return defaults;
    const fallback = () => {
      const data = readSettingsCache(docId, true, FIRESTORE_PROJECT);
      return data ? { data, source: 'stale-cache' } : defaults;
    };
    const force = !!(opts && opts.force);
    if (!force) {
      const fresh = readSettingsCache(docId, false, FIRESTORE_PROJECT);
      if (fresh) return { data: fresh, source: 'cache' };
    }
    if (isQuotaPaused() && !force) {
      return fallback();
    }
    const flightKey = 'rest:' + docId;
    if (_inflight[flightKey]) return _inflight[flightKey];

    _inflight[flightKey] = (async () => {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/settings/${encodeURIComponent(docId)}?key=${FIRESTORE_KEY}`;
        const r = await fetchWithTimeout(url, { cache: force ? 'no-store' : 'default' }, FETCH_TIMEOUT_MS);
        if (r.status === 429) {
          markQuotaPaused();
          return fallback();
        }
        if (r.status === 404) return defaults;
        if (!r.ok) return fallback();
        const doc = await r.json().catch(() => null);
        if (!doc || !doc.fields) return defaults;
        const out = {};
        for (const k of Object.keys(doc.fields)) out[k] = decodeFirestoreValue(doc.fields[k]);
        writeSettingsCache(docId, out, FIRESTORE_PROJECT);
        return { data: out, source: 'rest' };
      } catch (e) {
        return fallback();
      } finally {
        delete _inflight[flightKey];
      }
    })();

    return _inflight[flightKey];
  }

  // Public API retained for site settings readers which only need the data.
  async function fetchSettingsRest(docId, opts) { return (await restSettings(docId, opts)).data; }

  async function load(db, opts) {
    const force = !!(opts && opts.force);
    const canDb = !!(db && (typeof db.collection === 'function' || typeof db._egygzGet === 'function'));
    const proj = canDb ? dbProjectId(db) : FIRESTORE_PROJECT;

    if (!force) {
      const cached = readSettingsCache(SETTINGS_DOC, false, proj);
      if (cached) {
        apply(cached);
        return { ok: true, source: 'cache' };
      }
    }

    if (isQuotaPaused() && !force) {
      const stale = readSettingsCache(SETTINGS_DOC, true, proj)
        || readSettingsCache(SETTINGS_DOC, true, FIRESTORE_PROJECT);
      if (stale) {
        apply(stale);
        return { ok: true, source: 'stale-cache' };
      }
      return { ok: true, source: 'defaults' };
    }

    const flightKey = 'load:' + proj + ':' + (canDb ? 'db' : 'rest');
    if (_inflight[flightKey] && !force) return _inflight[flightKey];

    const run = (async () => {
      try {
        if (canDb) {
          try {
            const res = await dbReadSettings(db, SETTINGS_DOC);
            if (res.exists && res.data) {
              writeSettingsCache(SETTINGS_DOC, res.data, proj);
              apply(res.data);
              return { ok: true, source: 'firestore' };
            }
            if (proj !== FIRESTORE_PROJECT) {
              const pub = await restSettings(SETTINGS_DOC, { force });
              if (pub.data) {
                apply(pub.data);
                return { ok: true, source: pub.source };
              }
            }
            return { ok: true, source: 'defaults' };
          } catch (dbErr) {
            if (isQuotaErr(dbErr)) markQuotaPaused();
            const stale = readSettingsCache(SETTINGS_DOC, true, proj);
            if (stale) {
              apply(stale);
              return { ok: true, source: 'stale-cache' };
            }
            const restFallback = await restSettings(SETTINGS_DOC, { force });
            if (restFallback.data) {
              apply(restFallback.data);
              return { ok: true, source: restFallback.source };
            }
            return { ok: false, error: String((dbErr && dbErr.message) || dbErr), source: 'defaults' };
          }
        }
        const result = await restSettings(SETTINGS_DOC, { force });
        if (result.data) apply(result.data);
        return { ok: true, source: result.source };
      } catch (e) {
        if (isQuotaErr(e)) markQuotaPaused();
        const stale = readSettingsCache(SETTINGS_DOC, true, proj)
          || readSettingsCache(SETTINGS_DOC, true, FIRESTORE_PROJECT);
        if (stale) {
          apply(stale);
          return { ok: true, source: 'stale-cache' };
        }
        return { ok: false, error: String((e && e.message) || e), source: 'defaults' };
      } finally {
        delete _inflight[flightKey];
      }
    })();

    if (!force) _inflight[flightKey] = run;
    return run;
  }

  async function save(db, extra) {
    if (extra && typeof extra === 'object') apply(extra);
    const payload = Object.assign({}, deepClone(S), extra || {}, {
      updatedAt: new Date().toISOString(),
    });
    const proj = dbProjectId(db);
    await dbWriteSettings(db, SETTINGS_DOC, payload, true);
    writeSettingsCache(SETTINGS_DOC, payload, proj);
    if (proj === FIRESTORE_PROJECT) writeSettingsCache(SETTINGS_DOC, payload, FIRESTORE_PROJECT);
    emitChange();
    return { ok: true };
  }

  /* ─────────────────────────── export ─────────────────────────── */

  global.CalcEngine = {
    DEFAULTS,
    LABELS,
    SHORT_LEVEL, levelKey, levelName, toothHeading, designBreakdown,
    get, set, reset, apply, onChange,
    // Concurrent Worker requests must never share mutable pricing settings.
    withSettings(settings) {
      const scope = {}; createCalcEngine(scope);
      scope.CalcEngine.set(settings);
      return scope.CalcEngine;
    },
    calculateLine, calculateService, calculateOrder, describeOrder,
    lineLabel, groupLabel, cleanLineSpec, cleanGroupSpec, cleanToothIds,
    encodeCode, encodeLineCode, decodeCode, extractCode,
    buildQuotePdfBytes, downloadQuotePdf, quotePdfFilename, documentFilename, paymentSummary, savedQuoteOrder, quoteToInvoice, quoteTotalRows, matchQuoteClient,
    basePerTooth, allowsStones, money, fmt, roundPrice, roundUpTo, syncServiceDefaults,
    cleanCut, cleanSize, cutPctOf, sizeFactorOf, stoneUnitPrice, CUTS, SIZE_PRESETS,
    load, save, fetchSettingsRest, restSettings,
    readSettingsCache, writeSettingsCache, clearSettingsCache,
    dbReadSettings, dbWriteSettings, dbProjectId,
    isQuotaPaused, markQuotaPaused, isQuotaErr, fetchWithTimeout, decodeFirestoreValue,
    SETTINGS_DOC,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);


/* ═══════════════════════════════════════════════════════════════════════════
 *  SITE SETTINGS — shared non-pricing configuration across the website
 *  ---------------------------------------------------------------------------
 *  Stored in Firestore -> settings/site (public read, staff write).
 * ═══════════════════════════════════════════════════════════════════════════ */

const SITE_DOC = 'site';

const SITE_DEFAULTS = {
  /* Brand */
  studioName: 'EGYGRILLZ',
  tagline: 'CUSTOM GRILLZ STUDIO',
  addressLine1: 'Inside Smart Smile Clinics',
  addressLine2: '38 Abou Bakr EL-Sdeek, Heliopolis',
  addressLine3: 'Floor 5, Apt 504 - Cairo, Egypt',
  currency: 'EGP',

  /* Booking */
  impressionPrice: 200,
  impressionMinutes: 30,
  gemFromPrice: 500,
  consultPrice: 1000,
  consultMinutes: 60,
  pickupMinutes: 10,
  fittingMinutes: 30,
  bookingSlotMinutes: 60,
  cancelFreeHours: 24,
  bookingLeadDays: 30,
  maxBookingsPerDay: 8,

  /* At-home mould kit (Get Your Moulds) */
  mouldPerArch: 450,
  mouldDeliveryFee: 100,

  /* Reminders */
  reminderHour: 12,
  reminderDaysBefore: 1,

  /* Quotations */
  quoteValidDays: 14,
  gmailWebClientId: '', // Public web OAuth client ID, never a client secret

  /* General */
  vatPct: 0,
  workingDays: '1,2,3,4,5,6',
  openHour: 11,
  closeHour: 21,
};

const SITE_LABELS = {
  studioName: 'Studio name',
  tagline: 'Tagline',
  addressLine1: 'Address line 1',
  addressLine2: 'Address line 2',
  addressLine3: 'Address line 3',
  currency: 'Currency code',
  impressionPrice: 'Impression price (per arch)',
  impressionMinutes: 'Impression (minutes)',
  gemFromPrice: 'Gem applying - from',
  consultPrice: 'Consultation price',
  consultMinutes: 'Consultation (minutes)',
  pickupMinutes: 'Pickup (minutes)',
  fittingMinutes: 'Fitting (minutes)',
  bookingSlotMinutes: 'Slot length (minutes)',
  cancelFreeHours: 'Free cancellation (hours)',
  bookingLeadDays: 'Book this many days ahead',
  maxBookingsPerDay: 'Max bookings per day',
  mouldPerArch: 'Mould kit — price per arch',
  mouldDeliveryFee: 'Mould kit — flat delivery fee',
  reminderHour: 'Reminder hour (24h)',
  reminderDaysBefore: 'Remind days before',
  quoteValidDays: 'Quote valid (days)',
  gmailWebClientId: 'Gmail drafts — Google web client ID (public .apps.googleusercontent.com ID only)',
  vatPct: 'VAT %',
  workingDays: 'Working days (1=Mon)',
  openHour: 'Opens at',
  closeHour: 'Closes at',
};

const SITE_GROUPS = [
  { id:'identity', title:'Brand',  keys:['studioName','tagline','addressLine1','addressLine2','addressLine3','currency'] },
  { id:'booking',  title:'Booking', keys:['impressionPrice','impressionMinutes','gemFromPrice','consultPrice','consultMinutes','pickupMinutes','fittingMinutes','bookingSlotMinutes','cancelFreeHours','bookingLeadDays','maxBookingsPerDay'] },
  { id:'moulds',   title:'Mould kit', keys:['mouldPerArch','mouldDeliveryFee'] },
  { id:'hours',    title:'Working hours', keys:['openHour','closeHour','workingDays'] },
  { id:'quotes',   title:'Quotations', keys:['quoteValidDays','vatPct','gmailWebClientId'] },
  { id:'auto',     title:'Automatic', keys:['reminderHour','reminderDaysBefore'] },
];

const _g = typeof globalThis !== 'undefined' ? globalThis : window;

const SiteConfig = {
  DEFAULTS: SITE_DEFAULTS,
  LABELS: SITE_LABELS,
  GROUPS: SITE_GROUPS,
  DOC: SITE_DOC,
  data: Object.assign({}, SITE_DEFAULTS),

  get(key) {
    const v = this.data[key];
    return v === undefined || v === null || v === '' ? SITE_DEFAULTS[key] : v;
  },

  num(key) {
    const n = Number(this.get(key));
    return isFinite(n) ? n : Number(SITE_DEFAULTS[key]) || 0;
  },

  set(key, value) {
    this.data[key] = value;
    if (_g.CalcEngine && _g.CalcEngine.syncServiceDefaults) {
      _g.CalcEngine.syncServiceDefaults(this.data);
    }
    this.apply(typeof document !== 'undefined' ? document : null);
    this._emit();
  },

  define(key, value, label, group) {
    if (!(key in SITE_DEFAULTS)) {
      SITE_DEFAULTS[key] = value;
      SITE_LABELS[key] = label || key;
      const g = SITE_GROUPS.find(x => x.id === (group || 'custom'));
      if (g) g.keys.push(key);
      else SITE_GROUPS.push({ id: group || 'custom', title: 'Custom', keys: [key] });
    }
    return this;
  },

  apply(root) {
    const scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope || !scope.querySelectorAll) return;
    const fmtFn = (_g.CalcEngine && _g.CalcEngine.fmt)
      ? _g.CalcEngine.fmt
      : (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    scope.querySelectorAll('[data-cfg]').forEach(el => {
      const key = el.getAttribute('data-cfg');
      const val = this.get(key);
      const fmt = el.getAttribute('data-cfg-format');
      let out = val;
      if (fmt === 'money' || fmt === 'num') out = fmtFn(val);
      else if (fmt === 'upper') out = String(val).toUpperCase();
      if (el.hasAttribute('data-cfg-attr')) el.setAttribute(el.getAttribute('data-cfg-attr'), out);
      else el.textContent = out;
    });
  },

  onChange(fn) {
    if (!this._subs) this._subs = [];
    this._subs.push(fn);
    return () => { this._subs = this._subs.filter(f => f !== fn); };
  },
  _emit() { (this._subs || []).forEach(fn => { try { fn(this.data); } catch (e) {} }); },

  async load(db, opts) {
    const E = _g.CalcEngine;
    const force = !!(opts && opts.force);
    const canDb = !!(db && E && (typeof db.collection === 'function' || typeof db._egygzGet === 'function'));
    const proj = canDb ? E.dbProjectId(db) : 'egygrillz-studio';
    this.source = 'defaults';

    try {
      if (E && !force) {
        const cached = E.readSettingsCache(SITE_DOC, false, proj);
        if (cached) {
          Object.assign(this.data, cached); this.source = 'cache';
          if (E.syncServiceDefaults) E.syncServiceDefaults(this.data);
          this._loaded = true;
          this.apply(typeof document !== 'undefined' ? document : null);
          this._emit();
          return this.data;
        }
      }
      if (canDb && !(E.isQuotaPaused() && !force)) {
        try {
          const res = await E.dbReadSettings(db, SITE_DOC);
          if (res.exists && res.data) {
            Object.assign(this.data, res.data); this.source = 'firestore';
            E.writeSettingsCache(SITE_DOC, res.data, proj);
          } else if (proj !== 'egygrillz-studio') {
            const pub = await E.fetchSettingsRest(SITE_DOC, { force });
            if (pub) Object.assign(this.data, pub);
          }
        } catch (dbErr) {
          if (E.isQuotaErr(dbErr)) E.markQuotaPaused();
          const stale = E.readSettingsCache(SITE_DOC, true, proj) || await E.fetchSettingsRest(SITE_DOC);
          if (stale) { Object.assign(this.data, stale); this.source = 'stale-cache'; }
        }
      } else if (E) {
        const {data, source} = await E.restSettings(SITE_DOC, { force });
        this.source = source;
        if (data) Object.assign(this.data, data);
      }
    } catch (e) {
      if (E) {
        const stale = E.readSettingsCache(SITE_DOC, true, proj) || E.readSettingsCache(SITE_DOC, true, 'egygrillz-studio');
        if (stale) { Object.assign(this.data, stale); this.source = 'stale-cache'; }
      }
    }
    if (E && E.syncServiceDefaults) E.syncServiceDefaults(this.data);
    this._loaded = true;
    this.apply(typeof document !== 'undefined' ? document : null);
    this._emit();
    return this.data;
  },

  async save(db) {
    const E = _g.CalcEngine;
    const id=String(this.data.gmailWebClientId || '').trim();
    if(id && !/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)) throw Error('Use a public Google web client ID, never a client secret.');
    this.data.gmailWebClientId=id;
    const payload = {};
    for (const k of Object.keys(SITE_DEFAULTS)) {
      const v = this.data[k];
      payload[k] = v === undefined ? SITE_DEFAULTS[k] : v;
    }
    payload.updatedAt = new Date().toISOString();
    if (E && E.dbWriteSettings) {
      await E.dbWriteSettings(db, SITE_DOC, payload, true);
      const proj = E.dbProjectId(db);
      E.writeSettingsCache(SITE_DOC, payload, proj);
    } else {
      await db.collection('settings').doc(SITE_DOC).set(payload, { merge: true });
    }
    if (E && E.syncServiceDefaults) E.syncServiceDefaults(this.data);
    this._loaded = true;
    this.apply(typeof document !== 'undefined' ? document : null);
    this._emit();
    return payload;
  },

  async reset(db) {
    this.data = Object.assign({}, SITE_DEFAULTS);
    if (db) await this.save(db);
    else if (_g.CalcEngine && _g.CalcEngine.clearSettingsCache) {
      _g.CalcEngine.clearSettingsCache(SITE_DOC, 'egygrillz-studio');
    }
    if (_g.CalcEngine && _g.CalcEngine.syncServiceDefaults) {
      _g.CalcEngine.syncServiceDefaults(this.data);
    }
    this.apply(typeof document !== 'undefined' ? document : null);
    this._emit();
  },

  renderSettings(container, db, onSaved) {
    if (!container) return;
    const g = this.GROUPS.map(grp => {
      const rows = grp.keys.map(k => {
        const val = this.get(k);
        const isNum = typeof SITE_DEFAULTS[k] === 'number';
        return `<label class="sc-row">
          <span class="sc-name">${SITE_LABELS[k] || k}</span>
          <input class="sc-input" data-k="${k}" type="${isNum ? 'number' : 'text'}"
                 ${isNum ? 'step="any"' : ''} value="${String(val).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">
        </label>`;
      }).join('');
      return `<div class="sc-group"><div class="sc-title">${grp.title}</div>${rows}</div>`;
    }).join('');

    container.innerHTML = `<div class="sc-wrap">${g}
      <div class="sc-actions">
        <button type="button" class="sc-save">Save settings</button>
        <button type="button" class="sc-reset">Reset to defaults</button>
        <span class="sc-note"></span>
      </div></div>
      <style>
        .sc-wrap{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px 30px;}
        .sc-group{border-top:1px solid #e6e6e6;padding-top:14px;}
        .sc-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.6px;color:#8a8a8a;margin-bottom:12px;}
        .sc-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:5px 0;}
        .sc-name{font-size:12px;color:#3a3a3a;}
        .sc-input{width:120px;padding:7px 9px;border:1px solid #e2e2e2;border-radius:2px;font-family:'Arimo',sans-serif;font-size:12px;text-align:right;color:#1f1f1f;background:#fff;}
        .sc-input:focus{outline:none;border-color:#1f1f1f;}
        .sc-actions{grid-column:1/-1;display:flex;align-items:center;gap:14px;margin-top:8px;padding-top:18px;border-top:1px solid #e6e6e6;}
        .sc-save,.sc-reset{font-family:'Arimo',sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;padding:12px 26px;border-radius:2px;cursor:pointer;transition:.2s;}
        .sc-save{background:#1f1f1f;color:#fff;border:1px solid #1f1f1f;}
        .sc-save:hover:not(:disabled){background:#000;}
        .sc-save:disabled,.sc-reset:disabled{opacity:.55;cursor:not-allowed;}
        .sc-reset{background:#f4f4f4;color:#1f1f1f;border:1px solid #e2e2e2;}
        .sc-reset:hover:not(:disabled){background:#1f1f1f;color:#fff;}
        .sc-note{font-size:11px;color:#8a8a8a;}
      </style>`;

    container.querySelectorAll('.sc-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const k = inp.getAttribute('data-k');
        const raw = inp.value;
        if (typeof SITE_DEFAULTS[k] === 'number') {
          const n = Number(raw);
          this.data[k] = raw === '' ? 0 : (Number.isFinite(n) ? n : SITE_DEFAULTS[k]);
        } else {
          this.data[k] = raw;
        }
      });
    });

    const note = container.querySelector('.sc-note');
    const saveBtn = container.querySelector('.sc-save');
    const resetBtn = container.querySelector('.sc-reset');
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      note.textContent = 'Saving…';
      try {
        await this.save(db);
        note.textContent = 'Saved';
        if (onSaved) onSaved();
      } catch (e) {
        note.textContent = 'Could not save: ' + ((e && e.message) || e);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save settings';
      }
      setTimeout(() => { if (note.textContent === 'Saved') note.textContent = ''; }, 2500);
    });
    resetBtn.addEventListener('click', async () => {
      if (typeof confirm === 'function' && !confirm('Reset every setting to its default?')) return;
      resetBtn.disabled = true;
      note.textContent = 'Resetting…';
      try {
        await this.reset(db);
        this.renderSettings(container, db, onSaved);
        const n2 = container.querySelector('.sc-note');
        if (n2) n2.textContent = 'Defaults restored';
        if (onSaved) onSaved();
      } catch (e) {
        resetBtn.disabled = false;
        note.textContent = 'Could not reset: ' + ((e && e.message) || e);
      }
    });
  },
};

_g.SiteConfig = SiteConfig;
