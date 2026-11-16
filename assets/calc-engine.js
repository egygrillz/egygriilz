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
(function (global) {
  'use strict';

  const FIRESTORE_PROJECT = 'egygrillz-studio';

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
      sixprong: 220, bezelfull: 250, bezelhalf: 225, bar: 200,
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
    level: {
      '0.5': '0.5 Bars', '1': '1 Solid', '2': '2 Open face', '3': '3 Mid detail',
      '4': '4 Complex', '5': '5 Scorpion', '6': '6 Ultimate',
    },
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

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  function apply(saved) {
    if (!saved || typeof saved !== 'object') return S;
    if (saved.servicePrices && typeof saved.servicePrices === 'object') {
      Object.keys(saved.servicePrices).forEach(k => _customServiceKeys.add(k));
    }
    for (const key of Object.keys(DEFAULTS)) {
      const d = DEFAULTS[key];
      const v = saved[key];
      if (v === undefined || v === null) continue;
      if (d && typeof d === 'object' && !Array.isArray(d)) {
        S[key] = Object.assign({}, d, typeof v === 'object' ? v : {});
      } else {
        S[key] = v;
      }
    }
    for (const key of ['materialBase', 'designPct', 'accentPrice', 'settingPrice', 'fullPrice',
      'coveragePrice', 'plating', 'enamel', 'engraving', 'anodize', 'servicePrices',
      'timelinePct', 'moldFlat', 'goldGramsPerTooth']) {
      const m = S[key];
      if (!m || typeof m !== 'object') continue;
      for (const k of Object.keys(m)) {
        if (m[k] === null || m[k] === '') {
          if (key === 'accentPrice' || key === 'fullPrice') m[k] = null;
          continue;
        }
        const n = Number(m[k]);
        if (!Number.isNaN(n)) m[k] = n;
      }
    }
    ['goldPrice', 'goldCastFee', 'goldWeightFactor', 'barsStonesPerTooth', 'roundTo', 'depositPct'].forEach((k) => {
      const n = Number(S[k]);
      S[k] = Number.isNaN(n) ? DEFAULTS[k] : n;
    });
    return S;
  }

  const get = () => S;
  const set = (next) => apply(next);
  const reset = () => {
    S = deepClone(DEFAULTS);
    _customServiceKeys = new Set();
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

  /** Full price breakdown for one design line. Returns a new object. */
  function calculateLine(input) {
    const line = Object.assign({
      teeth: 6,
      material: 'chrome',
      level: '1',
      plating: 'none',
      enamel: 'none',
      engraving: 'none',
      anodize: 'none',
    }, input);

    line.teeth = Math.max(1, Math.min(16, Number(line.teeth) || 6));
    line.base = basePerTooth(line);

    const isBars = String(line.level) === '0.5';
    line.materialTotal = isBars ? line.base * 0.5 * line.teeth : line.base * line.teeth;

    const pct = Number(S.designPct[line.level] || 0);
    line.designPct = isBars ? 0 : pct;
    line.designCost = isBars ? 0 : line.materialTotal * (pct / 100);

    // Stones (precious metals only: Silver 925 & Gold)
    line.stoneCost = 0;
    line.stoneDetail = 'none';
    if (allowsStones(line.material)) {
      if (line.accent && Number(line.accent.count) > 0) {
        const type = line.accent.type || 'cz';
        const setting = line.accent.setting || 'flush';
        let unit = S.accentPrice[type];
        if (unit === null || unit === undefined) {
          unit = Number(line.accent.customPrice !== undefined ? line.accent.customPrice : line.accent.price) || 0;
        }
        const sp = Number(S.settingPrice[setting] || 0);
        line.stoneDetail = 'accent';
        line.accentUnit = Number(unit);
        line.settingUnit = sp;
        line.stoneCost = Number(line.accent.count) * (Number(unit) + sp);
      } else if (line.full && (line.full.bars || isBars)) {
        line.stoneDetail = 'bars';
        line.stoneCost = line.teeth * Number(S.barsStonesPerTooth || 0);
      } else if (line.full) {
        const type = line.full.type || 'moissanite';
        const cov = line.full.coverage || 'standardpave';
        let unit = S.fullPrice[type];
        if (unit === null || unit === undefined) {
          unit = Number(line.full.customPrice !== undefined ? line.full.customPrice : line.full.price) || 0;
        }
        const cp = Number(S.coveragePrice[cov] || 0);
        line.stoneDetail = 'full';
        line.fullUnit = Number(unit);
        line.coverageUnit = cp;
        line.stoneCost = line.teeth * (Number(unit) + cp);
      }
    }

    // Per-tooth finishes
    line.platingCost = Number(S.plating[line.plating] || 0) * line.teeth;
    line.enamelCost = Number(S.enamel[line.enamel] || 0) * line.teeth;
    line.engravingCost = Number(S.engraving[line.engraving] || 0) * line.teeth;
    line.anodizeCost = line.material === 'titanium' ? Number(S.anodize[line.anodize] || 0) * line.teeth : 0;

    line.subtotal = money(
      line.materialTotal +
      line.designCost +
      line.stoneCost +
      line.platingCost +
      line.enamelCost +
      line.engravingCost +
      line.anodizeCost
    );

    return line;
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
    return { type, name, qty, unitPrice: money(unitPrice), notes, subtotal };
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
    const moldCost = Number(S.moldFlat[o.mold] || 0);

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
    const total = (o.round !== false && roundTo > 1 && preRound > 0)
      ? Math.ceil(preRound / roundTo) * roundTo
      : money(preRound);

    const depositPct = Number(o.depositPct) || 0;
    const deposit = Math.round(total * depositPct / 100);

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
      total: money(total),
      depositPct,
      deposit: money(deposit),
      balance: money(Math.max(0, total - deposit)),
      currency: S.currency,
    };
  }

  /** Plain-text breakdown, ready for a PDF, email, or WhatsApp */
  function describeOrder(order) {
    const out = [];
    (order.lines || []).forEach((l, i) => {
      out.push(`DESIGN ${i + 1}: ${lineLabel(l)}`);
      out.push(`  Material: ${L.material[l.material] || l.material} x ${l.teeth} teeth = ${fmt(l.materialTotal)} ${S.currency}`);
      out.push(`  Design:   ${l.level === '0.5' ? 'Bars (0.5x base, no surcharge)' : `+${l.designPct}% = ${fmt(l.designCost)} ${S.currency}`}`);
      if (l.stoneCost) out.push(`  Stones:   ${fmt(l.stoneCost)} ${S.currency}`);
      if (l.platingCost) out.push(`  Plating:  ${L.plating[l.plating]} = ${fmt(l.platingCost)} ${S.currency}`);
      if (l.enamelCost) out.push(`  Enamel:   ${L.enamel[l.enamel]} = ${fmt(l.enamelCost)} ${S.currency}`);
      if (l.engravingCost) out.push(`  Engraving: ${L.engraving[l.engraving]} = ${fmt(l.engravingCost)} ${S.currency}`);
      if (l.anodizeCost) out.push(`  Anodize:  ${L.anodize[l.anodize]} = ${fmt(l.anodizeCost)} ${S.currency}`);
      out.push(`  Subtotal: ${fmt(l.subtotal)} ${S.currency}`);
      out.push('');
    });
    if ((order.services || []).length) {
      out.push('STUDIO SERVICES:');
      order.services.forEach((sv) => {
        out.push(`  - ${sv.name}${sv.qty > 1 ? ' x' + sv.qty : ''}: ${fmt(sv.subtotal)} ${S.currency}`);
      });
      out.push('');
    }
    if (order.linesSubtotal) out.push(`Designs subtotal: ${fmt(order.linesSubtotal)} ${S.currency}`);
    if (order.servicesSubtotal) out.push(`Services subtotal: ${fmt(order.servicesSubtotal)} ${S.currency}`);
    if (order.timelineAmount) out.push(`Timeline (${L.timeline[order.timeline]} +${order.timelinePct}%): ${fmt(order.timelineAmount)} ${S.currency}`);
    if (order.moldCost) out.push(`Mold (${L.mold[order.mold]}): ${fmt(order.moldCost)} ${S.currency}`);
    if (order.discountAmount) out.push(`Discount: -${fmt(order.discountAmount)} ${S.currency}`);
    out.push(`TOTAL: ${fmt(order.total)} ${S.currency}`);
    if (order.depositPct) {
      out.push(`Deposit (${order.depositPct}%): ${fmt(order.deposit)} ${S.currency}`);
      out.push(`Balance before delivery: ${fmt(order.balance)} ${S.currency}`);
    }
    return out.join('\n');
  }

  const L = LABELS;
  const fmt = (n) => String(money(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  function lineLabel(line) {
    const mat = line.material === 'gold' ? `Gold ${line.karat || '18'}K` : (L.material[line.material] || line.material);
    const bits = [`${mat} / ${line.teeth} teeth / ${L.level[line.level] || line.level}`];
    if (line.accent && line.accent.count) bits.push(`${line.accent.count}x ${L.accentType[line.accent.type] || ''}`.trim());
    if (line.full && (line.full.bars || String(line.level) === '0.5')) bits.push('Full iced on bars');
    else if (line.full) bits.push(`Full iced ${L.accentType[line.full.type] || ''}`.trim());
    if (line.plating && line.plating !== 'none') bits.push(L.plating[line.plating]);
    if (line.enamel && line.enamel !== 'none') bits.push('Enamel ' + L.enamel[line.enamel]);
    if (line.engraving && line.engraving !== 'none') bits.push('Engraving ' + L.engraving[line.engraving]);
    if (line.anodize && line.anodize !== 'none' && line.material === 'titanium') bits.push('Anodize ' + L.anodize[line.anodize]);
    return bits.join(' · ');
  }

  /* ─────────────────────────── persistence ─────────────────────────── */

  const SETTINGS_DOC = 'pricing';

  function decodeFirestoreValue(v) {
    if (!v || typeof v !== 'object') return v;
    if (v.nullValue !== undefined) return null;
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.doubleValue !== undefined) return Number(v.doubleValue);
    if (v.booleanValue !== undefined) return v.booleanValue;
    if (v.arrayValue) return (v.arrayValue.values || []).map(decodeFirestoreValue);
    if (v.mapValue) {
      const out = {};
      const f = v.mapValue.fields || {};
      for (const k of Object.keys(f)) out[k] = decodeFirestoreValue(f[k]);
      return out;
    }
    return undefined;
  }

  async function fetchSettingsRest(docId) {
    const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/settings/${encodeURIComponent(docId)}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    const doc = await r.json().catch(() => null);
    if (!doc || !doc.fields) return null;
    const out = {};
    for (const k of Object.keys(doc.fields)) out[k] = decodeFirestoreValue(doc.fields[k]);
    return out;
  }

  async function load(db) {
    try {
      if (db && typeof db.collection === 'function') {
        const snap = await db.collection('settings').doc(SETTINGS_DOC).get();
        if (snap && snap.exists) {
          apply(snap.data() || {});
          return { ok: true, source: 'firestore' };
        }
        return { ok: true, source: 'defaults' };
      }
      const data = await fetchSettingsRest(SETTINGS_DOC);
      if (data) {
        apply(data);
        return { ok: true, source: 'rest' };
      }
      return { ok: true, source: 'defaults' };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e), source: 'defaults' };
    }
  }

  async function save(db, extra) {
    const payload = Object.assign({}, S, extra || {}, {
      updatedAt: new Date().toISOString(),
    });
    await db.collection('settings').doc(SETTINGS_DOC).set(payload, { merge: true });
    return { ok: true };
  }

  /* ─────────────────────────── export ─────────────────────────── */

  global.CalcEngine = {
    DEFAULTS,
    LABELS,
    get, set, reset, apply,
    calculateLine, calculateService, calculateOrder, describeOrder, lineLabel,
    basePerTooth, allowsStones, money, fmt, syncServiceDefaults,
    load, save, fetchSettingsRest,
    SETTINGS_DOC,
  };
})(window);


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

  /* Reminders */
  reminderHour: 12,
  reminderDaysBefore: 1,

  /* Quotations */
  quoteValidDays: 14,
  quoteDepositDefaultPct: 50,
  quoteRoundTo: 50,

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
  reminderHour: 'Reminder hour (24h)',
  reminderDaysBefore: 'Remind days before',
  quoteValidDays: 'Quote valid (days)',
  quoteDepositDefaultPct: 'Default deposit %',
  quoteRoundTo: 'Round totals to',
  vatPct: 'VAT %',
  workingDays: 'Working days (1=Mon)',
  openHour: 'Opens at',
  closeHour: 'Closes at',
};

const SITE_GROUPS = [
  { id:'identity', title:'Brand',  keys:['studioName','tagline','addressLine1','addressLine2','addressLine3','currency'] },
  { id:'booking',  title:'Booking', keys:['impressionPrice','impressionMinutes','gemFromPrice','consultPrice','consultMinutes','pickupMinutes','fittingMinutes','bookingSlotMinutes','cancelFreeHours','bookingLeadDays','maxBookingsPerDay'] },
  { id:'hours',    title:'Working hours', keys:['openHour','closeHour','workingDays'] },
  { id:'quotes',   title:'Quotations', keys:['quoteValidDays','quoteDepositDefaultPct','quoteRoundTo','vatPct'] },
  { id:'auto',     title:'Automatic', keys:['reminderHour','reminderDaysBefore'] },
];

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
    if (window.CalcEngine && window.CalcEngine.syncServiceDefaults) {
      window.CalcEngine.syncServiceDefaults(this.data);
    }
    this.apply(document);
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
    scope.querySelectorAll('[data-cfg]').forEach(el => {
      const key = el.getAttribute('data-cfg');
      const val = this.get(key);
      const fmt = el.getAttribute('data-cfg-format');
      let out = val;
      if (fmt === 'money') out = window.CalcEngine.fmt(val);
      else if (fmt === 'num') out = window.CalcEngine.fmt(val);
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

  async load(db) {
    try {
      if (db && typeof db.collection === 'function') {
        const snap = await db.collection('settings').doc(SITE_DOC).get();
        if (snap.exists) Object.assign(this.data, snap.data() || {});
      } else if (window.CalcEngine && window.CalcEngine.fetchSettingsRest) {
        const data = await window.CalcEngine.fetchSettingsRest(SITE_DOC);
        if (data) Object.assign(this.data, data);
      }
    } catch (e) {
      /* offline or unavailable — fall back to defaults */
    }
    if (window.CalcEngine && window.CalcEngine.syncServiceDefaults) {
      window.CalcEngine.syncServiceDefaults(this.data);
    }
    this._loaded = true;
    this.apply(document);
    this._emit();
    return this.data;
  },

  async save(db) {
    const payload = {};
    for (const k of Object.keys(SITE_DEFAULTS)) {
      const v = this.data[k];
      payload[k] = v === undefined ? SITE_DEFAULTS[k] : v;
    }
    await db.collection('settings').doc(SITE_DOC).set(payload, { merge: true });
    if (window.CalcEngine && window.CalcEngine.syncServiceDefaults) {
      window.CalcEngine.syncServiceDefaults(this.data);
    }
    this._loaded = true;
    this.apply(document);
    this._emit();
    return payload;
  },

  async reset(db) {
    this.data = Object.assign({}, SITE_DEFAULTS);
    if (db) await this.save(db);
    if (window.CalcEngine && window.CalcEngine.syncServiceDefaults) {
      window.CalcEngine.syncServiceDefaults(this.data);
    }
    this.apply(document);
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
                 ${isNum ? 'step="any"' : ''} value="${String(val).replace(/"/g, '&quot;')}">
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
        .sc-save:hover{background:#000;}
        .sc-reset{background:#f4f4f4;color:#1f1f1f;border:1px solid #e2e2e2;}
        .sc-reset:hover{background:#1f1f1f;color:#fff;}
        .sc-note{font-size:11px;color:#8a8a8a;}
      </style>`;

    container.querySelectorAll('.sc-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const k = inp.getAttribute('data-k');
        const raw = inp.value;
        this.data[k] = typeof SITE_DEFAULTS[k] === 'number' ? (raw === '' ? 0 : Number(raw)) : raw;
      });
    });

    const note = container.querySelector('.sc-note');
    container.querySelector('.sc-save').addEventListener('click', async () => {
      note.textContent = 'Saving...';
      try { await this.save(db); note.textContent = 'Saved'; if (onSaved) onSaved(); }
      catch (e) { note.textContent = 'Could not save: ' + (e.message || e); }
      setTimeout(() => { note.textContent = ''; }, 2500);
    });
    container.querySelector('.sc-reset').addEventListener('click', async () => {
      if (!confirm('Reset every setting to its default?')) return;
      await this.reset(db);
      this.renderSettings(container, db, onSaved);
      if (onSaved) onSaved();
    });
  },
};

window.SiteConfig = SiteConfig;
