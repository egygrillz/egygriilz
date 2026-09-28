/* ════════════════════════════════════════
   DATA
════════════════════════════════════════ */
const _BASE = 'https://raw.githubusercontent.com/egygrillz/egygriilz/main/';

/* ── CURRENCY CONFIG ── */
// Rates are multiplied against the EGP total to get the display currency
// These are approximate rates — the app fetches live EGP/USD from the gold API
// and derives the others from stable cross-rates
const CURRENCIES = {
  EGP: { symbol: 'EGP', sign: '',    rate: 1,       decimals: 0  },
  USD: { symbol: 'USD', sign: '$',   rate: 0.021,   decimals: 0  },
  EUR: { symbol: 'EUR', sign: '€',   rate: 0.019,   decimals: 0  },
  SAR: { symbol: 'SAR', sign: 'ر.س', rate: 0.079,   decimals: 0  },
  AED: { symbol: 'AED', sign: 'د.إ', rate: 0.077,   decimals: 0  },
};
let activeCurrency = 'EGP';
// EGP/USD rate updated after live gold fetch
let EGP_TO_USD = 0.021;

/* Silver: 125 EGP/g default */
let SILVER_PER_GRAM = 125;
let GOLD18K_PER_GRAM = 6250; /* fallback, overridden by live fetch */
let goldFetchedAt = 0;
const GOLD_REFRESH_MS = 60 * 60 * 1000; /* 1 hour */

/* ── MATERIALS ── */
const MATS = [
  {
    id:'Silver 925', nm:'Silver 925', sub:'Sterling Silver · Lost-Wax Cast',
    desc:'The brilliant, affordable classic. Perfect for intricate cutwork and iced-out designs. Hypoallergenic and easy to polish.',
    precious:true,
    img:_BASE+'materials/SILVER.png',
    calcBase: ()=> Math.round((200 + 37.5 + 46 + 2.3 * SILVER_PER_GRAM) * 2.8)
  },
  {
    id:'Gold 18K', nm:'Gold 18K', sub:'Solid 18K Gold · Lost-Wax Cast',
    desc:'The pinnacle of grillz. Hypoallergenic, tarnish-free, holds its value. Karat purity certified at point of sale.',
    precious:true,
    img:_BASE+'materials/GOLD.png',
    calcBase: ()=> Math.round((200 + 60 + 50 + 1.15 * GOLD18K_PER_GRAM) * 2.8)
  },
  {
    id:'Cobalt Chrome', nm:'Cobalt Chrome', sub:'Gunmetal Alloy · 3D Printed (DMLS)',
    desc:'Ultra-durable, scratch-resistant. Distinctive dark silver appearance. Fixed production cost — no metal market fluctuation.',
    precious:false,
    img:_BASE+'materials/CHROME.png',
    calcBase: ()=> 1000
  },
  {
    id:'Titanium', nm:'Titanium', sub:'Aerospace Grade · 3D Printed (DMLS)',
    desc:'Lightest material, fully biocompatible (used in dental implants). Stronger than steel. Anodize-ready for permanent vivid colors.',
    precious:false,
    img:_BASE+'materials/TITANUM.png',
    calcBase: ()=> 2000
  }
];

/* ── LEVELS ── */
const CPLX = [
  {id:'L1', nm:'Level 1 — The Bar',      sub:'Simple solid bar — no cuts, no detail.',             mult:1.00, img:_BASE+'levels/LEVEL 1.png'},
  {id:'L2', nm:'Level 2 — Solid Cap',    sub:'Seamless polished plain cap. Standard base.',        mult:1.05, img:_BASE+'levels/LEVEL 2.png'},
  {id:'L3', nm:'Level 3 — Medium',       sub:'Texture work or shaped framing (drip / flame).',     mult:1.10, img:_BASE+'levels/LEVEL 3.png'},
  {id:'L4', nm:'Level 4 — Hard',         sub:'Intricate manual detail (e.g. flower).',             mult:1.15, img:_BASE+'levels/LEVEL 4.png'},
  {id:'L5', nm:'Level 5 — Complex',      sub:'Advanced layering, multi-step (snake / scorpion).',  mult:1.25, img:_BASE+'levels/LEVEL 5.png'},
  {id:'L6', nm:'Level 6 — Master',       sub:'Full artistic sculpting, expert modeling (mermaid).',mult:1.40, img:_BASE+'levels/LEVEL 6.png'},
  {id:'L7', nm:'Level 7 — Masterpiece',  sub:'Maximum complexity. One-of-a-kind commission.',      mult:1.60, img:_BASE+'levels/LEVEL 7.png'}
];

/* ── PLATES ── */
const PLATES = [
  {id:'Yellow Gold', nm:'Yellow Gold Plating', sub:'Classic warm gold tone',    price:300, img:_BASE+'plating/YELLOW GOLD PLATING.png'},
  {id:'Rose Gold',   nm:'Rose Gold Plating',   sub:'Romantic pink-gold tone',   price:300, img:_BASE+'plating/ROSE GOLD PLATING.png'},
  {id:'White Gold',  nm:'White Gold Plating',  sub:'Cool bright silver-white',  price:400, img:_BASE+'plating/WHITE GOLD PLATING.png'},
  {id:'Black Gold',  nm:'Black Gold Plating',  sub:'Dark edgy gunmetal finish',  price:400, img:_BASE+'plating/BLACK GOLD PLATING.png'},
  {id:'Silver',      nm:'Silver Plating',       sub:'Bright mirror silver coat',  price:200, img:_BASE+'plating/SILVER PLATING.png'}
];

/* ── PRICING TABLES ── */
const ENAMEL_PRICES  = {'Single Tone':200,'Multi-Tone':350,'Master Color':750};
const LASER_PRICES   = {'Small':200,'Medium':450,'Large':700};
const ANOD_PRICES    = {'Single':300,'Dual':350,'Multi':450};
const SETTING_PRICE  = {Flush:150,Prong:200,Bezel:250};
const GEM_SINGLE     = {CZ:50,Moissanite:360,Natural:0};
const ICED_SETTING   = {Pave:1000,Channel:1500};
const ICED_GEM_EXTRA = {CZ:0,Moissanite:1800,Natural:5000};

/* ── FAQ ── */
const FAQ_DATA = [
  {q:'How much does it cost?',a:'Prices depend on material, number of teeth, and design level. Cobalt Chrome starts at 1,000 EGP per tooth and Titanium at 2,000 EGP at Level 1. Silver 925 and Gold 18K are calculated from live metal rates. Use the builder above to get your exact estimate — the price updates in real time as you configure your set.'},
  {q:'How does payment work?',a:'A 50% deposit is required to confirm your order and begin production. No changes can be made after the deposit is received. The remaining 50% is due in full before the finished piece is released or shipped. We accept cash, bank transfer, and Vodafone Cash. All deposits are 100% non-refundable.'},
  {q:'Is my price locked after I get a quote?',a:'Price quotations are valid for 7 calendar days from the date of issue. Gold 18K prices in particular fluctuate with the live gold market. Your quoted price is only locked once you pay the deposit — not before. A fresh quote will be issued if the 7-day window expires.'},
  {q:'What is your refund and return policy?',a:'All products are custom-made to your exact dental measurements and are strictly non-refundable and non-exchangeable under any circumstance. Used dental jewelry cannot be returned for hygiene reasons. The only exception is if EGYGRILLZ cancels your order — in that case a full deposit refund is issued.'},
  {q:'What are the design levels?',a:'We offer 7 design levels. Level 1 is a simple solid bar. Level 2 is a seamless polished solid cap. Levels 3 through 6 increase in complexity from texture work up to full artistic sculpting. Level 7 is a one-of-a-kind masterpiece commission priced individually on consultation.'},
  {q:'What materials do you work with?',a:'We work with four materials: Sterling Silver 925 and Gold 18K (both made by lost-wax casting), and Cobalt Chrome and Titanium (both 3D printed using DMLS). Diamond setting is only available on Silver 925 and Gold 18K — not on Chrome or Titanium.'},
  {q:'Are diamonds available on all materials?',a:'No. Diamond setting is only available for precious metals — Silver 925 and Gold 18K. We offer CZ (AAAAA cubic zirconia), Moissanite (GRA-certified VVS1 / D color), and Natural Diamonds (SI or VS grade).'},
  {q:'How do I care for my grillz?',a:'Rinse with cold water immediately after every wear. Use a soft-bristle toothbrush only. Do not use whitening or abrasive toothpaste on plated pieces. Pat dry with a microfiber cloth and store in the provided EGYGRILLZ case. Avoid all chemicals including bleach, chlorine, perfume, and hairspray.'},
  {q:'Can I eat, drink, or sleep wearing my grillz?',a:'No. Remove your grillz before eating, drinking anything other than plain water, smoking, or sleeping. Food trapped under the piece causes hygiene issues. Sleeping with grillz in can cause dental shifting.'},
  {q:'Does it hurt to get grillz or wear them?',a:'Not at all. The impression process takes 3–5 minutes using dental-grade impression material. There is no discomfort. When properly fitted, grillz rest snugly over your teeth with no adhesive, no drilling, and no permanent alteration.'},
  {q:'What if my grillz don\'t fit properly?',a:'Fit-related complaints must be reported within 48 hours of receiving your piece, with clear photo or video evidence. Requests submitted after that 48-hour window will incur a service fee.'},
  {q:'How do you ship orders?',a:'Our official carrier is FedEx. All FedEx shipments are fully tracked and tracking numbers are sent via WhatsApp or email immediately upon dispatch. Domestic delivery within Egypt takes 2–4 business days.'},
  {q:'Can I collect my order in person?',a:'Yes — in-person collection is by confirmed appointment only. Proof of identity is required for all high-value orders at the time of collection. Items not collected within 30 days may incur storage fees.'},
  {q:'What is the minimum order?',a:'There is no minimum. You can order a single tooth or a full-mouth set. Each piece is priced individually so you only pay for exactly what you want.'},
  {q:'Is my personal data kept private?',a:'Yes. Your name, contact details, and dental impressions are kept strictly confidential. Physical moulds are classified as private health data and are destroyed after order completion. Contact: egygrillz@gmail.com.'}
];

/* ════════════════════════════════════════
   STATE
════════════════════════════════════════ */
const S = {
  teeth: new Set(),
  matIdx:0, cplxIdx:0, plateIdx:0,
  enamel:false, plate:false, laser:false, anod:false, stones:false,
  en:'Single Tone', ls:'Small', an:'Single',
  sg:'None', set:'Flush', gem:'CZ', stoneN:1,
  ios:'Pave', iog:'CZ'
};

/* ════════════════════════════════════════
   CURRENCY FUNCTIONS
════════════════════════════════════════ */
function setCurrency(cur, btn) {
  activeCurrency = cur;
  // Sync all currency switchers
  document.querySelectorAll('.cur-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cur === cur);
  });
  updatePrice();
}

function convertEGP(egpAmount) {
  const cfg = CURRENCIES[activeCurrency];
  if (!cfg) return { amount: egpAmount, symbol: 'EGP', sign: '' };
  let rate = cfg.rate;
  // If currency is USD, use the live-fetched rate
  if (activeCurrency === 'USD') rate = EGP_TO_USD;
  // Derive other currencies from USD cross-rates
  if (activeCurrency === 'EUR') rate = EGP_TO_USD * 0.92;
  if (activeCurrency === 'SAR') rate = EGP_TO_USD * 3.75;
  if (activeCurrency === 'AED') rate = EGP_TO_USD * 3.67;
  return {
    amount: Math.round(egpAmount * rate),
    symbol: cfg.symbol,
    sign: cfg.sign
  };
}

function formatCurrency(egpAmount) {
  if (!egpAmount) return '0';
  const { amount, symbol, sign } = convertEGP(egpAmount);
  return `${amount.toLocaleString()} <span class="curr">${symbol}</span>`;
}

function formatSecondary(egpAmount) {
  if (!egpAmount || activeCurrency === 'EGP') return '';
  // Always show EGP equivalent when displaying non-EGP
  return `≈ ${egpAmount.toLocaleString()} EGP`;
}

/* ════════════════════════════════════════
   LIVE GOLD PRICE — Multiple fallback APIs
════════════════════════════════════════ */
async function fetchGoldPrice() {
  const apis = [
    tryGoldPriceOrg,
    tryMetalsPriceAPI,
  ];
  for (const fn of apis) {
    try {
      const result = await fn();
      if (result) {
        GOLD18K_PER_GRAM = result;
        goldFetchedAt = Date.now();
        updateGoldUI();
        updatePrice();
        return;
      }
    } catch(e) { /* try next */ }
  }
  /* All APIs failed — use fallback */
  GOLD18K_PER_GRAM = 6250;
  goldFetchedAt = Date.now();
  updateGoldUI();
  updatePrice();
}

async function tryGoldPriceOrg() {
  const res = await fetch('https://data-asg.goldprice.org/dbXRates/EGP', {
    cache: 'no-store',
    signal: AbortSignal.timeout(6000)
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data && data.items && data.items[0] && data.items[0].xauPrice) {
    const perOzEGP = data.items[0].xauPrice;
    const perGram24K = perOzEGP / 31.1035;
    const gold18k = Math.round(perGram24K * 0.75);
    // Also extract USD rate for currency conversion
    if (data.items[0].xauPrice && data.items[0].chgVnit) {
      // Derive EGP/USD rate: if we know gold oz in EGP and oz in USD (~3300 USD/oz)
      // Use a conservative estimate
      const goldUSDoz = 3300;
      EGP_TO_USD = goldUSDoz / perOzEGP;
      // Clamp to reasonable range
      EGP_TO_USD = Math.max(0.015, Math.min(0.03, EGP_TO_USD));
    }
    return gold18k;
  }
  return null;
}

async function tryMetalsPriceAPI() {
  /* Backup: metals-api free tier or similar CORS endpoint */
  const res = await fetch('https://api.gold-api.com/price/XAU', {
    cache: 'no-store',
    signal: AbortSignal.timeout(6000)
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data && data.price) {
    // data.price is in USD per troy oz
    const goldUSDoz = data.price;
    // Convert to EGP using our current rate
    const perOzEGP = goldUSDoz / EGP_TO_USD;
    const perGram24K = perOzEGP / 31.1035;
    return Math.round(perGram24K * 0.75);
  }
  return null;
}

function updateGoldUI() {
  const txt = `${GOLD18K_PER_GRAM.toLocaleString()} EGP/g`;
  const el1 = document.getElementById('hero-gold-price');
  const el2 = document.getElementById('gold-badge-text');
  const t   = document.getElementById('hero-gold-time');
  const badge = document.getElementById('gold-badge');
  if(el1) el1.textContent = txt;
  if(el2) el2.textContent = `18K: ${txt}`;
  if(badge) badge.style.display = MATS[S.matIdx].id === 'Gold 18K' ? 'flex' : 'none';
  if(t) {
    const d = new Date();
    t.textContent = `(${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')})`;
  }
  updateMatDesc();
}

function maybeRefreshGold() {
  if(Date.now() - goldFetchedAt > GOLD_REFRESH_MS) fetchGoldPrice();
}
setInterval(maybeRefreshGold, 60000);

/* ════════════════════════════════════════
   CAROUSEL REGISTRY
════════════════════════════════════════ */
const CR = {
  'mat-track':   {key:'matIdx',   dots:'mat-dots',   data:MATS},
  'cplx-track':  {key:'cplxIdx',  dots:'cplx-dots',  data:CPLX},
  'plate-track': {key:'plateIdx', dots:'plate-dots',  data:PLATES}
};
const TT = {mat:'mat-track', cplx:'cplx-track', plate:'plate-track'};

/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
function init() {
  buildDiagram();
  buildTeeth();
  buildCarousel('mat-track','mat-dots',MATS);
  buildCarousel('cplx-track','cplx-dots',CPLX);
  buildCarousel('plate-track','plate-dots',PLATES);
  buildFAQ();
  centerAll();
  updateMatDesc();
  updatePrice();
  initScrollBehavior();
  initReveal();
  initCursor();
  initSplineOpacity();
  fetchGoldPrice();
}

/* ── DIAGRAM ── */
function buildDiagram() {
  ['diag-upper','diag-lower'].forEach((id,isL) => {
    const row = document.getElementById(id);
    row.innerHTML = '';
    const pre = isL ? 'L' : 'U';
    for(let i=8;i>=1;i--) {
      if(i===4){ const s=document.createElement('div');s.className='diagram-sep';row.appendChild(s); }
      const d=document.createElement('div');
      d.className='diagram-tooth';d.textContent=i;
      d.title=`${pre}${i} — ${isL?'Lower':'Upper'} tooth ${i} from center`;
      row.appendChild(d);
    }
  });
}

/* ── TEETH ── */
function buildTeeth() {
  buildJawRow('upper-row', 'U');
  buildJawRow('lower-row', 'L');
}

function buildJawRow(containerId, prefix) {
  const row = document.getElementById(containerId);
  row.innerHTML = '';
  const n = 8;
  for(let i=n;i>=1;i--) {
    const id = `${prefix}R${i}`;
    row.appendChild(makeToothBtn(id, i, prefix, i));
  }
  const sep = document.createElement('div');
  sep.className='jaw-sep';
  sep.innerHTML='<div class="jaw-sep-line"></div>';
  row.appendChild(sep);
  for(let i=1;i<=n;i++) {
    const id = `${prefix}L${i}`;
    row.appendChild(makeToothBtn(id, i, prefix, i));
  }
}

function makeToothBtn(id, num, prefix, pos) {
  const btn = document.createElement('button');
  btn.className = 'tooth-btn' + (S.teeth.has(id) ? ' on' : '');
  btn.type = 'button';
  btn.innerHTML = `${num}<span class="tn">${prefix}${num}</span>`;
  let lastTouch = 0;
  btn.addEventListener('touchend', (e) => {
    e.preventDefault();
    const now = Date.now();
    if(now - lastTouch < 300) return;
    lastTouch = now;
    toggleTooth(id, btn);
  }, {passive:false});
  btn.addEventListener('click', (e) => {
    const now = Date.now();
    if(now - lastTouch < 400) return;
    toggleTooth(id, btn);
  });
  return btn;
}

function toggleTooth(id, btn) {
  if(S.teeth.has(id)) {
    S.teeth.delete(id);
    btn.classList.remove('on');
  } else {
    S.teeth.add(id);
    btn.classList.add('on');
  }
  document.getElementById('tooth-cnt').textContent = S.teeth.size;
  updateProgress();
  updatePrice();
}

/* ── CAROUSELS ── */
function buildCarousel(trackId, dotsId, data) {
  const track = document.getElementById(trackId);
  const dots  = document.getElementById(dotsId);
  if(!track||!dots) return;
  track.innerHTML = ''; dots.innerHTML = '';
  data.forEach((d,i) => {
    const item = document.createElement('div');
    item.className = 'c-item';
    item.innerHTML = `<div class="c-img-wrap"><img src="${d.img}" alt="${d.nm}" loading="lazy"></div><div class="c-name">${d.nm}</div><div class="c-sub">${d.sub}</div>`;
    item.onclick = () => carouselClick(trackId, i);
    track.appendChild(item);
    const dot = document.createElement('button');
    dot.className = 'c-dot';
    dot.onclick = () => carouselClick(trackId, i);
    dots.appendChild(dot);
  });
}

function moveCarousel(type, dir) {
  const trackId = TT[type];
  const cfg = CR[trackId];
  S[cfg.key] = (S[cfg.key] + dir + cfg.data.length) % cfg.data.length;
  updateCarouselUI(trackId, cfg.dots, S[cfg.key]);
  if(type==='mat') { onMatChange(); updateMatDesc(); }
  updatePrice();
}

function carouselClick(trackId, idx) {
  const cfg = CR[trackId];
  S[cfg.key] = idx;
  updateCarouselUI(trackId, cfg.dots, idx);
  if(trackId==='mat-track') { onMatChange(); updateMatDesc(); }
  updatePrice();
}

function updateCarouselUI(trackId, dotsId, activeIdx) {
  const track = document.getElementById(trackId);
  const dots  = document.getElementById(dotsId);
  if(!track) return;
  const items = track.querySelectorAll('.c-item');
  items.forEach((el,i) => {
    el.classList.remove('active','near');
    const d = Math.abs(i-activeIdx);
    if(d===0) el.classList.add('active');
    else if(d===1) el.classList.add('near');
  });
  const outerW = track.parentElement.offsetWidth || 600;
  const itemW = 220;
  track.style.transform = `translateX(${-(activeIdx*itemW)+(outerW/2)-(itemW/2)}px)`;
  if(dots) dots.querySelectorAll('.c-dot').forEach((d,i) => d.classList.toggle('on', i===activeIdx));
}

function centerAll() {
  updateCarouselUI('mat-track','mat-dots',S.matIdx);
  updateCarouselUI('cplx-track','cplx-dots',S.cplxIdx);
  updateCarouselUI('plate-track','plate-dots',S.plateIdx);
}

/* ── MATERIAL DESC ── */
function updateMatDesc() {
  const m = MATS[S.matIdx];
  const box = document.getElementById('mat-single-desc');
  if(!box) return;
  let extraLine = '';
  if(m.id === 'Gold 18K') {
    extraLine = `<div class="mg"><span class="gold-dot" style="display:inline-block;margin-right:4px;"></span>Live 18K rate: ${GOLD18K_PER_GRAM.toLocaleString()} EGP/g</div>`;
  }
  box.innerHTML = `<div class="mn">${m.nm}</div><div class="md">${m.desc}</div>${extraLine}`;
  const badge = document.getElementById('gold-badge');
  if(badge) badge.style.display = m.id === 'Gold 18K' ? 'flex' : 'none';
}

function onMatChange() {
  document.getElementById('ao-anod').style.display = MATS[S.matIdx].id === 'Titanium' ? '' : 'none';
  const isPrecious = MATS[S.matIdx].precious;
  document.getElementById('stones-avail-note').classList.toggle('show', !isPrecious);
}

/* ── INFO PANELS ── */
function toggleInfo(id) {
  const panel = document.getElementById(id);
  const trigger = panel.previousElementSibling;
  panel.classList.toggle('open');
  if(trigger && trigger.classList.contains('info-trigger'))
    trigger.classList.toggle('active', panel.classList.contains('open'));
}

/* ── ADDON TOGGLE ── */
function toggleAO(key, el) {
  S[key] = !S[key];
  el.classList.toggle('open', S[key]);
  updateProgress();
  updatePrice();
}

/* ── PILLS ── */
function pp(e, btn, group) {
  e.stopPropagation();
  btn.closest('.pills').querySelectorAll('.pill').forEach(p => p.classList.remove('on'));
  btn.classList.add('on');
  S[group] = btn.dataset.v;
  if(group === 'sg') {
    document.getElementById('single-wrap').style.display = S.sg==='Single' ? 'block' : 'none';
    document.getElementById('iced-wrap').style.display   = S.sg==='Iced'   ? 'block' : 'none';
  }
  updatePrice();
}

/* ── STEPPER ── */
function adjS(e, dir) {
  e.stopPropagation();
  S.stoneN = Math.max(1, Math.min(20, S.stoneN+dir));
  document.getElementById('stn').textContent = S.stoneN;
  updatePrice();
}

/* ── PROGRESS ── */
function updateProgress() {
  const done = [
    S.teeth.size > 0,
    true,
    true,
    S.enamel || S.plate || S.laser || S.anod || S.stones
  ];
  done.forEach((d,i) => {
    const el = document.getElementById(`ps${i+1}`);
    if(el) el.classList.toggle('done', d);
  });
}

/* ════════════════════════════════════════
   PRICE CALCULATION
════════════════════════════════════════ */
function calcBreakdown() {
  const n = S.teeth.size;
  if(!n) return {rows:[], total:0};
  const rows = [];
  let total = 0;
  const mat   = MATS[S.matIdx];
  const cplx  = CPLX[S.cplxIdx];

  const basePer = mat.calcBase();
  const baseTotal = Math.round(basePer * cplx.mult * n);
  rows.push({label:`${mat.nm} × ${n} piece${n>1?'s':''} (${cplx.nm})`, val:baseTotal});
  total += baseTotal;

  if(S.plate) {
    const pv = PLATES[S.plateIdx].price * n;
    rows.push({label:`${PLATES[S.plateIdx].nm} × ${n}`, val:pv});
    total += pv;
  }
  if(S.enamel) {
    const ev = (ENAMEL_PRICES[S.en] || 200) * n;
    rows.push({label:`Enamel (${S.en}) × ${n}`, val:ev});
    total += ev;
  }
  if(S.laser) {
    const lv = (LASER_PRICES[S.ls] || 200) * n;
    rows.push({label:`Laser Engraving (${S.ls}) × ${n}`, val:lv});
    total += lv;
  }
  if(S.anod) {
    const av = (ANOD_PRICES[S.an] || 300) * n;
    rows.push({label:`Anodize (${S.an}) × ${n}`, val:av});
    total += av;
  }
  if(S.stones && S.sg !== 'None') {
    const isPrecious = mat.precious;
    if(!isPrecious) {
      rows.push({label:'⚠️ Stones (not available for this material)', val:0});
    } else if(S.sg === 'Single') {
      const settingFee = (SETTING_PRICE[S.set] || 150) * S.stoneN;
      const gemFee     = S.gem === 'Natural' ? 0 : (GEM_SINGLE[S.gem] || 0) * S.stoneN;
      const sv = settingFee + gemFee;
      const label = S.gem === 'Natural'
        ? `${S.stoneN}× Natural Diamond (${S.set}) — contact for stone price`
        : `${S.stoneN}× ${S.gem} (${S.set} setting)`;
      rows.push({label, val:sv});
      total += sv;
    } else if(S.sg === 'Iced') {
      const settingFlat = (ICED_SETTING[S.ios] || 1000) * n;
      const gemExtra    = S.iog === 'CZ' ? 0 : (ICED_GEM_EXTRA[S.iog] || 0) * n;
      const iv = settingFlat + gemExtra;
      rows.push({label:`Iced Out — ${S.ios} (${S.iog}) × ${n}`, val:iv});
      total += iv;
    }
  }

  return {rows, total: Math.round(total)};
}

/* ════════════════════════════════════════
   ANIMATED NUMBER
════════════════════════════════════════ */
let _af = null, _lastTotalEGP = 0;
function animateNum(fromEGP, toEGP, el) {
  if(_af) cancelAnimationFrame(_af);
  const dur = 380, start = performance.now();
  function step(now) {
    const p = Math.min((now-start)/dur, 1);
    const ease = 1 - Math.pow(1-p, 3);
    const cur = Math.round(fromEGP + (toEGP-fromEGP)*ease);
    el.innerHTML = formatCurrency(cur);
    if(p < 1) _af = requestAnimationFrame(step);
    else el.innerHTML = formatCurrency(toEGP);
  }
  requestAnimationFrame(step);
}

/* ════════════════════════════════════════
   UPDATE UI
════════════════════════════════════════ */
function updatePrice() {
  const {rows, total} = calcBreakdown();

  /* price bar main */
  const priceEl = document.getElementById('pb-price');
  animateNum(_lastTotalEGP, total, priceEl);
  priceEl.classList.remove('pop'); void priceEl.offsetWidth; priceEl.classList.add('pop');

  /* price bar secondary (shows EGP if non-EGP selected) */
  const pbSec = document.getElementById('pb-secondary');
  if(pbSec) pbSec.textContent = total > 0 ? formatSecondary(total) : '';

  /* mini bar */
  document.getElementById('pb-mini-price').innerHTML = formatCurrency(total);

  /* footer big price */
  const sfEl = document.getElementById('sf-price');
  if(activeCurrency === 'EGP') {
    sfEl.innerHTML = `<sup>EGP</sup>${total.toLocaleString()}`;
  } else {
    const { amount, symbol } = convertEGP(total);
    sfEl.innerHTML = `<sup>${symbol}</sup>${amount.toLocaleString()}`;
  }
  const sfSec = document.getElementById('sf-secondary');
  if(sfSec) sfSec.textContent = total > 0 ? formatSecondary(total) : '';

  _lastTotalEGP = total;

  /* breakdown btn */
  document.getElementById('breakdown-btn').style.display = total > 0 ? '' : 'none';

  /* config tags */
  const tags = [
    `${S.teeth.size} teeth`,
    MATS[S.matIdx].nm,
    CPLX[S.cplxIdx].nm
  ];
  if(S.plate)  tags.push(PLATES[S.plateIdx].nm);
  if(S.enamel) tags.push(`Enamel (${S.en})`);
  if(S.laser)  tags.push(`Laser (${S.ls})`);
  if(S.anod)   tags.push(`Anodize (${S.an})`);
  if(S.stones && S.sg !== 'None') tags.push(`Stones: ${S.sg}`);

  document.getElementById('sf-config').innerHTML = tags.map(t => `<span class="sf-tag">${t}</span>`).join('');
  updateShareText(tags, total);
}

/* ════════════════════════════════════════
   SCROLL BEHAVIOR
════════════════════════════════════════ */
function initScrollBehavior() {
  const header   = document.getElementById('site-header');
  const priceBar = document.getElementById('price-bar');
  let lastY = window.scrollY;
  let pbCollapsed = false;

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const scrollingDown = y > lastY;

    if(y > 80) {
      header.classList.add('hidden');
      priceBar.classList.add('pb-visible');
      if(y > 250 && scrollingDown && !pbCollapsed) {
        priceBar.classList.add('pb-collapsed');
        priceBar.classList.remove('pb-expanded');
        pbCollapsed = true;
      }
    } else {
      header.classList.remove('hidden');
      priceBar.classList.remove('pb-visible');
      priceBar.classList.remove('pb-collapsed');
      priceBar.classList.add('pb-expanded');
      pbCollapsed = false;
    }
    lastY = y;
  }, {passive:true});
}

function expandPriceBar() {
  const priceBar = document.getElementById('price-bar');
  priceBar.classList.remove('pb-collapsed');
  priceBar.classList.add('pb-expanded');
}

/* ════════════════════════════════════════
   SPLINE BG — fade on scroll
════════════════════════════════════════ */
function initSplineOpacity() {
  const splineBg = document.getElementById('spline-bg');
  const heroH = window.innerHeight;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const fade = Math.max(0, 1 - (y / (heroH * 0.7)));
    if(splineBg) splineBg.style.opacity = fade;
  }, {passive:true});
}

/* ════════════════════════════════════════
   SCROLL REVEAL
════════════════════════════════════════ */
function initReveal() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if(e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
    });
  }, {threshold:0.12});
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

/* ════════════════════════════════════════
   CUSTOM CURSOR
════════════════════════════════════════ */
function initCursor() {
  if(window.matchMedia('(hover:none)').matches) return;
  const cursor = document.getElementById('cursor');
  let cx = 0, cy = 0, rx = 0, ry = 0;
  document.addEventListener('mousemove', e => { cx = e.clientX; cy = e.clientY; });
  function tick() {
    rx += (cx-rx) * 0.14;
    ry += (cy-ry) * 0.14;
    cursor.style.transform = `translate(${rx}px,${ry}px)`;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  document.querySelectorAll('button,a,.tooth-btn,.addon-tile,.c-item').forEach(el => {
    el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
  });
}

/* ════════════════════════════════════════
   MODAL
════════════════════════════════════════ */
function openModal() {
  const {rows, total} = calcBreakdown();
  if(!total) return;
  const { amount: convAmount, symbol } = convertEGP(total);
  const convStr = activeCurrency !== 'EGP' ? `<div style="font-size:11px;color:var(--text3);text-align:center;margin-top:8px;">≈ ${convAmount.toLocaleString()} ${symbol}</div>` : '';
  document.getElementById('modal-body').innerHTML =
    rows.map(r => `<div class="breakdown-row"><span class="br-label">${r.label}</span><span class="br-val">${r.val > 0 ? r.val.toLocaleString()+' EGP' : '—'}</span></div>`).join('') +
    `<div class="breakdown-total"><span>Total Estimate</span><span>${total.toLocaleString()} EGP</span></div>` +
    convStr;
  document.getElementById('modal-overlay').classList.add('open');
}

/* ════════════════════════════════════════
   SHARE
════════════════════════════════════════ */
function updateShareText(tags, total) {
  const { amount, symbol } = convertEGP(total);
  const priceStr = activeCurrency === 'EGP'
    ? `${total.toLocaleString()} EGP`
    : `${amount.toLocaleString()} ${symbol} (${total.toLocaleString()} EGP)`;
  const txt = [
    'EGYGRILLZ — My Custom Estimate',
    '─────────────────────',
    ...tags.map(t => `• ${t}`),
    '─────────────────────',
    `Total: ${priceStr}`,
    '',
    'Estimate only — final price confirmed at studio.',
    'Book: egygrillz.com/booking.html'
  ].join('\n');
  const el = document.getElementById('share-text');
  if(el) el.textContent = txt;
}

function toggleShare() {
  document.getElementById('share-panel').classList.toggle('show');
}

function copyEstimate() {
  navigator.clipboard.writeText(document.getElementById('share-text').textContent).then(() => {
    const btn = event.target.closest('.share-btn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
    setTimeout(() => btn.innerHTML = orig, 2000);
  });
}

function shareWhatsApp() {
  window.open(`https://wa.me/?text=${encodeURIComponent(document.getElementById('share-text').textContent)}`, '_blank');
}

/* ════════════════════════════════════════
   FAQ
════════════════════════════════════════ */
function buildFAQ() {
  document.getElementById('faq-list').innerHTML = FAQ_DATA.map((f,i) =>
    `<div class="faq-item" id="faq_${i}">
      <div class="faq-q" onclick="document.getElementById('faq_${i}').classList.toggle('open')">
        <span>${f.q}</span>
        <span class="faq-chev"><i class="fas fa-chevron-down"></i></span>
      </div>
      <div class="faq-a"><p>${f.a}</p></div>
    </div>`
  ).join('');
}

/* ════════════════════════════════════════
   BOOT
════════════════════════════════════════ */
window.addEventListener('load', init);
window.addEventListener('resize', centerAll);
