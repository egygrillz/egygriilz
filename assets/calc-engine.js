/* ═══════════════════════════════════════════════════════════════════════════
 *  EGYGRILLZ — PRICING ENGINE  (one source of truth)
 *  ---------------------------------------------------------------------------
 *  Loaded by BOTH the staff panel and /quotes.
 *
 *      <script src="/assets/calc-engine.js"></script>
 *
 *  All numbers live in Firestore -> settings/pricing.
 *  Change a number anywhere and every calculator on the site follows.
 *
 *  Defaults are the values that used to be hard-coded in the staff panel, so
 *  nothing changes until you actually edit something.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ─────────────────────────── defaults ─────────────────────────── */

  const DEFAULTS = {
    // One price per tooth for the non-gold materials
    materialBase: { chrome: 1000, titanium: 2800, silver: 1600 },

    // Gold: price per gram is multiplied by purity, then by margin
    goldKarat: {
      '10': { purity: 0.417, margin: 2.5 },
      '14': { purity: 0.583, margin: 2.6 },
      '18': { purity: 0.750, margin: 2.8 },
      '21': { purity: 0.875, margin: 3.0 },
      '22': { purity: 0.917, margin: 3.2 },
    },
    // Grams of metal used per tooth, per karat
    goldGramsPerTooth: { '10': 0.35, '14': 0.35, '18': 0.34, '21': 0.34, '22': 0.33 },
    goldPrice: 0,          // today's rate, EGP per gram — set from the panel

    // Design level surcharge, percent on top of the material cost
    designPct: { '0.5': 0, '1': 0, '2': 10, '3': 15, '4': 25, '5': 40, '6': 60 },

    // Stones
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

    // Finishes
    plating: { none: 0, blackgold: 400, whitegold: 400, rosegold: 300, silverplating: 200 },
    enamel: { none: 0, single: 200, multi: 350, master: 750 },
    engraving: { none: 0, small: 200, medium: 450, large: 700 },

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
    plating: { none: 'None', blackgold: 'Black gold', whitegold: 'White gold', rosegold: 'Rose gold', silverplating: 'Silver plating' },
    enamel: { none: 'None', single: 'Single', multi: 'Multi', master: 'Master' },
    engraving: { none: 'None', small: 'Small', medium: 'Medium', large: 'Large' },
    timeline: { standard: 'Standard', rush: 'Rush', emergency: 'Emergency' },
    mold: { none: 'None', normalperarch: 'Normal per arch', digitalfullmouth: 'Digital full mouth' },
  };

  /* ─────────────────────────── state ─────────────────────────── */

  let S = deepClone(DEFAULTS);

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  /** Shallow-merge a saved settings object over the defaults. */
  function apply(saved) {
    if (!saved || typeof saved !== 'object') return S;
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
    // keep numeric maps numeric, in case Firestore hands back strings
    for (const key of ['materialBase', 'designPct', 'accentPrice', 'settingPrice', 'fullPrice',
      'coveragePrice', 'plating', 'enamel', 'engraving', 'timelinePct', 'moldFlat', 'goldGramsPerTooth']) {
      const m = S[key];
      for (const k of Object.keys(m)) {
        if (m[k] === null) continue;
        const n = Number(m[k]);
        if (!Number.isNaN(n)) m[k] = n;
      }
    }
    ['goldPrice', 'barsStonesPerTooth', 'roundTo', 'depositPct'].forEach((k) => {
      const n = Number(S[k]);
      S[k] = Number.isNaN(n) ? DEFAULTS[k] : n;
    });
    return S;
  }

  const get = () => S;
  const set = (next) => apply(next);
  const reset = () => { S = deepClone(DEFAULTS); return S; };

  /* ─────────────────────────── maths ─────────────────────────── */

  const money = (n) => Math.round(Number(n) || 0);

  /** Base cost per tooth for a material */
  function basePerTooth(line) {
    if (line.material === 'gold') {
      const karat = String(line.karat || '18');
      const k = S.goldKarat[karat] || S.goldKarat['18'];
      const grams = Number(line.gramsPerTooth || S.goldGramsPerTooth[karat] || 0.34);
      const rate = Number(line.goldPrice || S.goldPrice || 0);
      // rate x purity = metal cost per gram ; x grams per tooth = metal cost
      // then x margin = the price we charge
      return rate * k.purity * grams * k.margin;
    }
    return Number(S.materialBase[line.material] || 0);
  }

  /** Full price breakdown for one design line. Returns a new object. */
  function calculateLine(input) {
    const line = Object.assign({ teeth: 6, material: 'chrome', level: '1', plating: 'none', enamel: 'none', engraving: 'none' }, input);

    line.teeth = Math.max(1, Math.min(16, Number(line.teeth) || 6));
    line.base = basePerTooth(line);
    line.materialTotal = line.base * line.teeth;

    const isBars = String(line.level) === '0.5';
    const pct = Number(S.designPct[line.level] || 0);
    line.designPct = isBars ? 0 : pct;
    line.designCost = isBars ? 0 : line.materialTotal * (pct / 100);

    // Stones
    line.stoneCost = 0;
    line.stoneDetail = 'none';
    if (line.accent && Number(line.accent.count) > 0) {
      const type = line.accent.type || 'cz';
      const setting = line.accent.setting || 'flush';
      let unit = S.accentPrice[type];
      if (unit === null || unit === undefined) unit = Number(line.accent.customPrice) || 0;
      const sp = Number(S.settingPrice[setting] || 0);
      line.stoneDetail = 'accent';
      line.accentUnit = Number(unit);
      line.settingUnit = sp;
      line.stoneCost = Number(line.accent.count) * (Number(unit) + sp);
    } else if (line.full && line.full.bars) {
      line.stoneDetail = 'bars';
      line.stoneCost = line.teeth * Number(S.barsStonesPerTooth || 0);
    } else if (line.full) {
      const type = line.full.type || 'moissanite';
      const cov = line.full.coverage || 'standardpave';
      let unit = S.fullPrice[type];
      if (unit === null || unit === undefined) unit = Number(line.full.customPrice) || 0;
      const cp = Number(S.coveragePrice[cov] || 0);
      // unit is a price per tooth, coverage adds a per-tooth premium
      line.stoneDetail = 'full';
      line.stoneCost = line.teeth * (Number(unit) + cp / line.teeth >= 0 ? Number(unit) + Math.round(cp / line.teeth) : Number(unit));
    }

    line.platingCost = Number(S.plating[line.plating] || 0);
    line.enamelCost = Number(S.enamel[line.enamel] || 0);
    line.engravingCost = Number(S.engraving[line.engraving] || 0);

    line.subtotal = money(line.materialTotal + line.designCost + line.stoneCost
      + line.platingCost + line.enamelCost + line.engravingCost);

    return line;
  }

  /** Whole order: lines + timeline + mold + rounding + deposit */
  function calculateOrder(lines, opts) {
    const o = Object.assign({ timeline: 'standard', mold: 'none', depositPct: S.depositPct }, opts || {});
    const priced = (lines || []).map(calculateLine);
    const linesSubtotal = priced.reduce((s, l) => s + (l.subtotal || 0), 0);

    const tlPct = Number(S.timelinePct[o.timeline] || 0);
    const timelineAmount = linesSubtotal * (tlPct / 100);
    const moldCost = Number(S.moldFlat[o.mold] || 0);

    const preRound = linesSubtotal + timelineAmount + moldCost;
    const roundTo = Number(S.roundTo) || 1;
    const total = Math.ceil(preRound / roundTo) * roundTo;

    const depositPct = Number(o.depositPct) || 0;
    const deposit = Math.round(total * depositPct / 100);

    return {
      lines: priced,
      lineCount: priced.length,
      teethTotal: priced.reduce((s, l) => s + l.teeth, 0),
      linesSubtotal: money(linesSubtotal),
      timeline: o.timeline,
      timelinePct: tlPct,
      timelineAmount: money(timelineAmount),
      mold: o.mold,
      moldCost: money(moldCost),
      preRound: money(preRound),
      total: money(total),
      depositPct,
      deposit: money(deposit),
      balance: money(total - deposit),
      currency: S.currency,
    };
  }

  /** Plain-text breakdown, ready for a PDF or an email */
  function describeOrder(order) {
    const out = [];
    (order.lines || []).forEach((l, i) => {
      out.push(`DESIGN ${i + 1}: ${lineLabel(l)}`);
      out.push(`  Material: ${L.material[l.material] || l.material} x ${l.teeth} teeth = ${fmt(l.materialTotal)} ${S.currency}`);
      out.push(`  Design:   ${l.level === '0.5' ? 'Bars (no surcharge)' : `+${l.designPct}% = ${fmt(l.designCost)} ${S.currency}`}`);
      if (l.stoneCost) out.push(`  Stones:   ${fmt(l.stoneCost)} ${S.currency}`);
      if (l.platingCost) out.push(`  Plating:  ${L.plating[l.plating]} = ${fmt(l.platingCost)} ${S.currency}`);
      if (l.enamelCost) out.push(`  Enamel:   ${L.enamel[l.enamel]} = ${fmt(l.enamelCost)} ${S.currency}`);
      if (l.engravingCost) out.push(`  Engraving: ${L.engraving[l.engraving]} = ${fmt(l.engravingCost)} ${S.currency}`);
      out.push(`  Subtotal: ${fmt(l.subtotal)} ${S.currency}`);
      out.push('');
    });
    out.push(`Lines subtotal: ${fmt(order.linesSubtotal)} ${S.currency}`);
    if (order.timelineAmount) out.push(`Timeline (${L.timeline[order.timeline]} +${order.timelinePct}%): ${fmt(order.timelineAmount)} ${S.currency}`);
    if (order.moldCost) out.push(`Mold (${L.mold[order.mold]}): ${fmt(order.moldCost)} ${S.currency}`);
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
    if (line.full && line.full.bars) bits.push('Full iced on bars');
    else if (line.full) bits.push(`Full iced ${L.accentType[line.full.type] || ''}`.trim());
    if (line.plating && line.plating !== 'none') bits.push(L.plating[line.plating]);
    if (line.enamel && line.enamel !== 'none') bits.push('Enamel ' + L.enamel[line.enamel]);
    if (line.engraving && line.engraving !== 'none') bits.push('Engraving ' + L.engraving[line.engraving]);
    return bits.join(' · ');
  }

  /* ─────────────────────────── persistence ─────────────────────────── */

  const SETTINGS_DOC = 'pricing';

  /**
   * Load settings from Firestore.
   * Expects a compatible `db` – works with the v9 compat SDK
   * (firebase.firestore()) and with the modular SDK if you pass helpers.
   */
  async function load(db, opts) {
    const o = opts || {};
    try {
      const snap = await db.collection('settings').doc(SETTINGS_DOC).get();
      if (snap && snap.exists) {
        apply(snap.data() || {});
        return { ok: true, source: 'firestore' };
      }
      return { ok: true, source: 'defaults' };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e), source: 'defaults' };
    }
  }

  /** Save the current settings back to Firestore. */
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
    calculateLine, calculateOrder, describeOrder, lineLabel,
    basePerTooth, money, fmt,
    load, save,
    SETTINGS_DOC,
  };
})(window);


/* ═══════════════════════════════════════════════════════════════════════════
 *  SITE SETTINGS — نفس فكرة الأسعار بالظبط، بس لكل حاجة تانية في الموقع
 *  ---------------------------------------------------------------------------
 *  كل رقم أو نص ظاهر في أي صفحة ممكن يبقى متغير هنا:
 *  رقم واتساب، سعر الكشف، مدة الحجز، عدد الأيام المسموح فيها الإلغاء،
 *  ساعات العمل، اسم الاستوديو، العنوان… أي حاجة.
 *
 *  التخزين: settings/site  (نفس الجدول اللي فيه pricing، القواعد بتسمح
 *  بالقراءة العامة والكتابة للموظف فقط)
 *
 *  الاستخدام في أي صفحة:
 *      <script src="/assets/calc-engine.js"></script>
 *      <span data-cfg="consultPrice">1000</span> EGP / hr
 *      <script>
 *        SiteConfig.apply(document);        // يملأ كل data-cfg
 *        SiteConfig.onChange(() => render());
 *      </script>
 * ═══════════════════════════════════════════════════════════════════════════ */

const SITE_DOC = 'site';

/** كل القيم الافتراضية — لو مش موجودة في الداتابيز بتيجي من هنا */
const SITE_DEFAULTS = {
  /* هوية */
  studioName: 'EGYGRILLZ',
  tagline: 'CUSTOM GRILLZ STUDIO',
  addressLine1: 'Inside Smart Smile Clinics',
  addressLine2: '38 Abou Bakr EL-Sdeek, Heliopolis',
  addressLine3: 'Floor 5, Apt 504 - Cairo, Egypt',
  currency: 'EGP',

  /* الحجز */
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

  /* التذكيرات */
  reminderHour: 12,
  reminderDaysBefore: 1,

  /* العروض */
  quoteValidDays: 14,
  quoteDepositDefaultPct: 50,
  quoteRoundTo: 50,

  /* الإعدادات العامة */
  vatPct: 0,
  workingDays: '1,2,3,4,5,6',
  openHour: 11,
  closeHour: 21,
};

/** أسماء مقروءة — تظهر في شاشة الإعدادات */
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

/** مجموعات — كل مجموعة تظهر في قسم لوحدها */
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

  /** Read every value as a number — handy inside calculations */
  num(key) {
    const n = Number(this.get(key));
    return isFinite(n) ? n : Number(SITE_DEFAULTS[key]) || 0;
  },

  set(key, value) {
    this.data[key] = value;
    this.apply(document);
    this._emit();
  },

  /** Add a key that did not exist before — appears in settings automatically */
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

  /** Fill every [data-cfg] element on the page */
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

  /** Load from Firestore, fall back to defaults silently */
  async load(db) {
    try {
      const snap = await db.collection('settings').doc(SITE_DOC).get();
      if (snap.exists) Object.assign(this.data, snap.data() || {});
    } catch (e) {
      /* offline or not signed in — defaults are fine */
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
    this._loaded = true;
    this.apply(document);
    this._emit();
    return payload;
  },

  async reset(db) {
    this.data = Object.assign({}, SITE_DEFAULTS);
    if (db) await this.save(db);
    this.apply(document);
    this._emit();
  },

  /**
   * Render an editable settings panel into a container.
   * Reuses the same look as the pricing screen.
   */
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

/* attached for every page that loads this file */
window.SiteConfig = SiteConfig;
