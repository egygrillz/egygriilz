/* ═══════════════════════════════════════
   DATA
═══════════════════════════════════════ */
const _B = 'https://raw.githubusercontent.com/egygrillz/egygriilz/main/';

const CURRENCIES = {
  EGP:{symbol:'EGP',rate:1,decimals:0},
  USD:{symbol:'USD',rate:0.021,decimals:0},
  EUR:{symbol:'EUR',rate:0.019,decimals:0},
  SAR:{symbol:'SAR',rate:0.079,decimals:0},
  AED:{symbol:'AED',rate:0.077,decimals:0},
};
let activeCurrency='EGP';
let EGP_TO_USD=0.021;

let SILVER_PER_GRAM=125;
let GOLD18K_PER_GRAM=6250;
let goldFetchedAt=0;

const MATS=[
  {id:'Silver 925',nm:'Silver 925',sub:'Sterling Silver · Lost-Wax Cast',
   desc:'The brilliant, affordable classic. Perfect for intricate cutwork and iced-out designs. Hypoallergenic and easy to polish.',
   icon:'🥈',precious:true,
   calcBase:()=>Math.round((200+37.5+46+2.3*SILVER_PER_GRAM)*2.8)},
  {id:'Gold 18K',nm:'Gold 18K',sub:'Solid 18K Gold · Lost-Wax Cast',
   desc:'The pinnacle of grillz. Hypoallergenic, tarnish-free, holds its value. Karat purity certified at point of sale.',
   icon:'🥇',precious:true,
   calcBase:()=>Math.round((200+60+50+1.15*GOLD18K_PER_GRAM)*2.8)},
  {id:'Cobalt Chrome',nm:'Cobalt Chrome',sub:'Gunmetal Alloy · 3D Printed (DMLS)',
   desc:'Ultra-durable, scratch-resistant. Distinctive dark silver appearance. Fixed production cost — no metal market fluctuation.',
   icon:'⚙️',precious:false,
   calcBase:()=>1000},
  {id:'Titanium',nm:'Titanium',sub:'Aerospace Grade · 3D Printed (DMLS)',
   desc:'Lightest material, fully biocompatible (used in dental implants). Stronger than steel. Anodize-ready for permanent vivid colors.',
   icon:'🚀',precious:false,
   calcBase:()=>2000},
];

const CPLX=[
  {id:'L1',nm:'The Bar',        label:'L1',mult:1.00,pct:'0%',   desc:'Simple solid bar — no cuts, no detail.'},
  {id:'L2',nm:'Solid Cap',      label:'L2',mult:1.05,pct:'+5%',  desc:'Seamless polished plain cap.'},
  {id:'L3',nm:'Medium',         label:'L3',mult:1.10,pct:'+10%', desc:'Texture work or shaped framing.'},
  {id:'L4',nm:'Hard',           label:'L4',mult:1.15,pct:'+15%', desc:'Intricate manual detail.'},
  {id:'L5',nm:'Complex',        label:'L5',mult:1.25,pct:'+25%', desc:'Advanced layering, multi-step.'},
  {id:'L6',nm:'Master',         label:'L6',mult:1.40,pct:'+40%', desc:'Full artistic sculpting.'},
  {id:'L7',nm:'Masterpiece',    label:'L7',mult:1.60,pct:'+60%', desc:'One-of-a-kind commission.'},
];

const PLATES={
  'Yellow Gold':300,'Rose Gold':300,
  'White Gold':400,'Black Gold':400,'Silver':200
};
const ENAMEL_PRICES={'Single Tone':200,'Multi-Tone':350,'Master Color':750};
const LASER_PRICES={'Small':200,'Medium':450,'Large':700};
const ANOD_PRICES={'Single':300,'Dual':350,'Multi':450};
const SETTING_PRICE={Flush:150,Prong:200,Bezel:250};
const GEM_SINGLE={CZ:50,Moissanite:360,Natural:0};
const ICED_SETTING={Pave:1000,Channel:1500};
const ICED_GEM_EXTRA={CZ:0,Moissanite:1800,Natural:5000};

const FAQ_DATA=[
  {q:'How much does it cost?',a:'Prices depend on material, teeth count, and design level. Cobalt Chrome starts at 1,000 EGP/tooth, Titanium at 2,000 EGP/tooth at Level 1. Silver 925 and Gold 18K are calculated from live metal rates. Use the builder above for your exact estimate.'},
  {q:'How does payment work?',a:'A 50% deposit is required to confirm your order and begin production. The remaining 50% is due before the finished piece is released or shipped. We accept cash, bank transfer, and Vodafone Cash. All deposits are 100% non-refundable.'},
  {q:'Is my price locked after a quote?',a:'Price quotations are valid for 7 calendar days. Gold 18K prices fluctuate with the live gold market. Your price is only locked once you pay the deposit.'},
  {q:'What is your refund policy?',a:'All products are custom-made to your exact dental measurements and are strictly non-refundable and non-exchangeable. The only exception is if EGYGRILLZ cancels your order — in that case a full deposit refund is issued.'},
  {q:'Are diamonds available on all materials?',a:'No. Diamond setting is only available for precious metals — Silver 925 and Gold 18K. We offer CZ (AAAAA cubic zirconia), Moissanite (GRA-certified VVS1/D color), and Natural Diamonds (SI or VS grade).'},
  {q:'How do I care for my grillz?',a:'Rinse with cold water after every wear. Use a soft toothbrush only. Do not use whitening or abrasive toothpaste on plated pieces. Pat dry and store in the provided EGYGRILLZ case. Avoid all chemicals.'},
  {q:'Does it hurt to get fitted?',a:'Not at all. The impression takes 3–5 minutes with dental-grade material. No discomfort. Grillz rest over your teeth with no adhesive, no drilling, no permanent alteration.'},
  {q:'How long does it take?',a:'Chrome & Titanium: 5–7 days. Silver 925 & Gold 18K: 10–14 days. Rush service available on request.'},
];

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
const S={
  teeth:new Set(),
  matIdx:0,cplxIdx:0,
  enamel:false,plate:false,laser:false,anod:false,stones:false,
  plc:'Yellow Gold',en:'Single Tone',ls:'Small',an:'Single',
  sg:'None',set:'Flush',gem:'CZ',stoneN:1,
  ios:'Pave',iog:'CZ',
};

/* ═══════════════════════════════════════
   CURRENCY
═══════════════════════════════════════ */
function setCurrency(cur,btn){
  activeCurrency=cur;
  document.querySelectorAll('.cur-btn').forEach(b=>b.classList.toggle('active',b.dataset.cur===cur));
  updatePrice();
}
function convertEGP(egp){
  let rate=CURRENCIES[activeCurrency].rate;
  if(activeCurrency==='USD') rate=EGP_TO_USD;
  if(activeCurrency==='EUR') rate=EGP_TO_USD*0.92;
  if(activeCurrency==='SAR') rate=EGP_TO_USD*3.75;
  if(activeCurrency==='AED') rate=EGP_TO_USD*3.67;
  return{amount:Math.round(egp*rate),symbol:CURRENCIES[activeCurrency].symbol};
}
function fmtCur(egp){
  if(!egp) return `0 <span class="curr">EGP</span>`;
  const{amount,symbol}=convertEGP(egp);
  return `${amount.toLocaleString()} <span class="curr">${symbol}</span>`;
}

/* ═══════════════════════════════════════
   LIVE GOLD
═══════════════════════════════════════ */
async function fetchGold(){
  try{
    const r=await fetch('https://data-asg.goldprice.org/dbXRates/EGP',{cache:'no-store',signal:AbortSignal.timeout(6000)});
    if(!r.ok) throw 0;
    const d=await r.json();
    if(d&&d.items&&d.items[0]&&d.items[0].xauPrice){
      const ozEGP=d.items[0].xauPrice;
      GOLD18K_PER_GRAM=Math.round((ozEGP/31.1035)*0.75);
      const usdOz=3300;
      EGP_TO_USD=Math.max(0.015,Math.min(0.03,usdOz/ozEGP));
      goldFetchedAt=Date.now();
      updateGoldUI();
      updatePrice();
      return;
    }
  }catch(e){}
  try{
    const r=await fetch('https://api.gold-api.com/price/XAU',{cache:'no-store',signal:AbortSignal.timeout(6000)});
    if(!r.ok) throw 0;
    const d=await r.json();
    if(d&&d.price){
      const ozEGP=d.price/EGP_TO_USD;
      GOLD18K_PER_GRAM=Math.round((ozEGP/31.1035)*0.75);
      goldFetchedAt=Date.now();
      updateGoldUI();
      updatePrice();
    }
  }catch(e){}
}
function updateGoldUI(){
  const txt=`18K: ${GOLD18K_PER_GRAM.toLocaleString()} EGP/g`;
  const hdr=document.getElementById('hdr-gold');
  if(hdr) hdr.textContent=txt;
  // Update gold mat card price label
  buildMatGrid();
}
setInterval(()=>{if(Date.now()-goldFetchedAt>3600000)fetchGold();},60000);

/* ═══════════════════════════════════════
   BUILD UI
═══════════════════════════════════════ */
function buildTeeth(){
  buildJaw('upper-row','U');
  buildJaw('lower-row','L');
}
function buildJaw(id,pre){
  const row=document.getElementById(id);
  row.innerHTML='';
  // Right side: R8..R1
  for(let i=8;i>=1;i--){
    const tid=`${pre}R${i}`;
    row.appendChild(makeToothBtn(tid,i,pre));
  }
  const sep=document.createElement('div');
  sep.className='tooth-sep';
  row.appendChild(sep);
  // Left side: L1..L8
  for(let i=1;i<=8;i++){
    const tid=`${pre}L${i}`;
    row.appendChild(makeToothBtn(tid,i,pre));
  }
}
function makeToothBtn(id,num,pre){
  const btn=document.createElement('button');
  btn.className='tooth-btn'+(S.teeth.has(id)?' on':'');
  btn.innerHTML=`${num}<span class="tn">${id}</span>`;
  let lastT=0;
  btn.addEventListener('touchend',e=>{
    e.preventDefault();
    const n=Date.now();
    if(n-lastT<300)return;
    lastT=n;
    toggleTooth(id,btn);
  },{passive:false});
  btn.addEventListener('click',e=>{
    const n=Date.now();
    if(n-lastT<400)return;
    toggleTooth(id,btn);
  });
  return btn;
}
function toggleTooth(id,btn){
  S.teeth.has(id)?S.teeth.delete(id):S.teeth.add(id);
  btn.classList.toggle('on',S.teeth.has(id));
  document.getElementById('tooth-cnt').textContent=S.teeth.size;
  updatePrice();
}

function buildMatGrid(){
  const grid=document.getElementById('mat-grid');
  if(!grid)return;
  grid.innerHTML=MATS.map((m,i)=>`
    <div class="mat-card${S.matIdx===i?' on':''}" onclick="selectMat(${i})">
      <div class="mat-icon">${m.icon}</div>
      <div class="mat-nm">${m.nm}</div>
      <div class="mat-sub">${m.sub}</div>
      <div class="mat-desc">${m.desc}</div>
      <div class="mat-price">${m.id==='Gold 18K'?`Live: ${GOLD18K_PER_GRAM.toLocaleString()} EGP/g`:m.id==='Silver 925'?`${SILVER_PER_GRAM} EGP/g`:'Fixed price'}</div>
    </div>
  `).join('');
}
function selectMat(i){
  S.matIdx=i;
  buildMatGrid();
  onMatChange();
  updatePrice();
}
function onMatChange(){
  document.getElementById('ao-anod').style.display=MATS[S.matIdx].id==='Titanium'?'':'none';
  const prec=MATS[S.matIdx].precious;
  document.getElementById('stones-avail-note').classList.toggle('show',!prec);
}

function buildLevelGrid(){
  const grid=document.getElementById('level-grid');
  if(!grid)return;
  grid.innerHTML=CPLX.map((c,i)=>`
    <div class="level-card${S.cplxIdx===i?' on':''}" onclick="selectLevel(${i})">
      <div class="lv-num">${i+1}</div>
      <div class="lv-nm">${c.nm}</div>
      <div class="lv-mult">${c.pct}</div>
      <div class="lv-desc">${c.desc}</div>
    </div>
  `).join('');
}
function selectLevel(i){
  S.cplxIdx=i;
  buildLevelGrid();
  updatePrice();
}

function buildFAQ(){
  document.getElementById('faq-list').innerHTML=FAQ_DATA.map((f,i)=>`
    <div class="faq-item" id="faq_${i}">
      <div class="faq-q" onclick="document.getElementById('faq_${i}').classList.toggle('open')">
        <span>${f.q}</span><span class="faq-chev">▼</span>
      </div>
      <div class="faq-a"><p>${f.a}</p></div>
    </div>
  `).join('');
}

/* ═══════════════════════════════════════
   COMBOS
═══════════════════════════════════════ */
function selectCombo(type){
  const allU=Array.from({length:8},(_,i)=>[`UR${i+1}`,`UL${i+1}`]).flat();
  const allL=Array.from({length:8},(_,i)=>[`LR${i+1}`,`LL${i+1}`]).flat();
  const top6=['UR3','UR2','UR1','UL1','UL2','UL3'];
  const top8=[...top6,'UR4','UL4'];
  const bot6=['LR3','LR2','LR1','LL1','LL2','LL3'];
  const bot8=[...bot6,'LR4','LL4'];
  const fangs=['UR3','UL3','LR3','LL3'];
  const combos={
    top6,top8,bot6,bot8,fangs,
    full:[...allU,...allL],none:[]
  };
  const set=combos[type]||[];
  S.teeth=new Set(set);
  // Update all buttons
  document.querySelectorAll('.tooth-btn').forEach(btn=>{
    const id=btn.querySelector('.tn')?.textContent;
    if(id) btn.classList.toggle('on',S.teeth.has(id));
  });
  document.getElementById('tooth-cnt').textContent=S.teeth.size;
  // Update combo button active state
  document.querySelectorAll('.combo-btn').forEach(b=>b.classList.remove('active'));
  const map={top6:0,top8:1,bot6:2,bot8:3,fangs:4,full:5,none:6};
  const idx=map[type];
  if(idx!==undefined){
    document.querySelectorAll('.combo-btn')[idx]?.classList.add('active');
  }
  updatePrice();
}

/* ═══════════════════════════════════════
   ADDONS
═══════════════════════════════════════ */
function toggleAO(key,el){
  S[key]=!S[key];
  el.classList.toggle('open',S[key]);
  updatePrice();
}
function pp(e,btn,group){
  e.stopPropagation();
  btn.closest('.pills').querySelectorAll('.pill').forEach(p=>p.classList.remove('on'));
  btn.classList.add('on');
  S[group]=btn.dataset.v;
  if(group==='sg'){
    document.getElementById('single-wrap').style.display=S.sg==='Single'?'block':'none';
    document.getElementById('iced-wrap').style.display=S.sg==='Iced'?'block':'none';
  }
  updatePrice();
}
function adjS(e,dir){
  e.stopPropagation();
  S.stoneN=Math.max(1,Math.min(20,S.stoneN+dir));
  document.getElementById('stn').textContent=S.stoneN;
  updatePrice();
}

/* ═══════════════════════════════════════
   PRICE CALCULATION (same logic as original)
═══════════════════════════════════════ */
function calcBreakdown(){
  const n=S.teeth.size;
  if(!n)return{rows:[],total:0};
  const rows=[];let total=0;
  const mat=MATS[S.matIdx];
  const cplx=CPLX[S.cplxIdx];
  const basePer=mat.calcBase();
  const baseTotal=Math.round(basePer*cplx.mult*n);
  rows.push({label:`${mat.nm} × ${n} piece${n>1?'s':''} (${cplx.nm})`,val:baseTotal});
  total+=baseTotal;
  if(S.plate){
    const pv=(PLATES[S.plc]||300)*n;
    rows.push({label:`${S.plc} Plating × ${n}`,val:pv});
    total+=pv;
  }
  if(S.enamel){
    const ev=(ENAMEL_PRICES[S.en]||200)*n;
    rows.push({label:`Enamel (${S.en}) × ${n}`,val:ev});
    total+=ev;
  }
  if(S.laser){
    const lv=(LASER_PRICES[S.ls]||200)*n;
    rows.push({label:`Laser Engraving (${S.ls}) × ${n}`,val:lv});
    total+=lv;
  }
  if(S.anod){
    const av=(ANOD_PRICES[S.an]||300)*n;
    rows.push({label:`Anodize (${S.an}) × ${n}`,val:av});
    total+=av;
  }
  if(S.stones&&S.sg!=='None'){
    if(!mat.precious){
      rows.push({label:'⚠ Stones (not available for this material)',val:0});
    } else if(S.sg==='Single'){
      const sf=(SETTING_PRICE[S.set]||150)*S.stoneN;
      const gf=S.gem==='Natural'?0:(GEM_SINGLE[S.gem]||0)*S.stoneN;
      const sv=sf+gf;
      const lbl=S.gem==='Natural'
        ?`${S.stoneN}× Natural Diamond (${S.set}) — contact for stone price`
        :`${S.stoneN}× ${S.gem} (${S.set} setting)`;
      rows.push({label:lbl,val:sv});
      total+=sv;
    } else if(S.sg==='Iced'){
      const sf=(ICED_SETTING[S.ios]||1000)*n;
      const gx=S.iog==='CZ'?0:(ICED_GEM_EXTRA[S.iog]||0)*n;
      const iv=sf+gx;
      rows.push({label:`Iced Out — ${S.ios} (${S.iog}) × ${n}`,val:iv});
      total+=iv;
    }
  }
  return{rows,total:Math.round(total)};
}

/* ═══════════════════════════════════════
   ANIMATED COUNTER
═══════════════════════════════════════ */
let _af=null,_last=0;
function animateNum(from,to,el){
  if(_af)cancelAnimationFrame(_af);
  const dur=380,start=performance.now();
  function step(now){
    const p=Math.min((now-start)/dur,1);
    const ease=1-Math.pow(1-p,3);
    const cur=Math.round(from+(to-from)*ease);
    el.innerHTML=fmtCur(cur);
    if(p<1)_af=requestAnimationFrame(step);
    else el.innerHTML=fmtCur(to);
  }
  requestAnimationFrame(step);
}

/* ═══════════════════════════════════════
   UPDATE UI
═══════════════════════════════════════ */
function updatePrice(){
  const{rows,total}=calcBreakdown();
  const pEl=document.getElementById('pb-price');
  animateNum(_last,total,pEl);
  pEl.classList.remove('flash');void pEl.offsetWidth;pEl.classList.add('flash');
  const pbSec=document.getElementById('pb-secondary');
  if(pbSec)pbSec.textContent=total>0&&activeCurrency!=='EGP'?`≈ ${total.toLocaleString()} EGP`:'';
  document.getElementById('pb-mini-price')&&(document.getElementById('pb-mini-price').innerHTML=fmtCur(total));
  const sfEl=document.getElementById('sf-price');
  if(activeCurrency==='EGP'){
    sfEl.innerHTML=`<sup>EGP</sup>${total.toLocaleString()}`;
  }else{
    const{amount,symbol}=convertEGP(total);
    sfEl.innerHTML=`<sup>${symbol}</sup>${amount.toLocaleString()}`;
  }
  const sfSec=document.getElementById('sf-sec');
  if(sfSec)sfSec.textContent=total>0&&activeCurrency!=='EGP'?`≈ ${total.toLocaleString()} EGP`:'';
  _last=total;
  document.getElementById('bd-btn').style.display=total>0?'':'none';
  const tags=[
    `${S.teeth.size} teeth`,MATS[S.matIdx].nm,CPLX[S.cplxIdx].nm,
    ...(S.plate?[`${S.plc} Plating`]:[]),
    ...(S.enamel?[`Enamel (${S.en})`]:[]),
    ...(S.laser?[`Laser (${S.ls})`]:[]),
    ...(S.anod?[`Anodize (${S.an})`]:[]),
    ...(S.stones&&S.sg!=='None'?[`Stones: ${S.sg}`]:[]),
  ];
  document.getElementById('sf-config').innerHTML=tags.map(t=>`<span class="sum-tag">${t}</span>`).join('');
  updateShareText(tags,total);
  // show price bar
  if(total>0)document.getElementById('price-bar').classList.add('show');
}

/* ═══════════════════════════════════════
   MODAL
═══════════════════════════════════════ */
function openModal(){
  const{rows,total}=calcBreakdown();
  if(!total)return;
  const{amount,symbol}=convertEGP(total);
  const convStr=activeCurrency!=='EGP'?`<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);text-align:center;margin-top:8px;">≈ ${amount.toLocaleString()} ${symbol}</div>`:'';
  document.getElementById('modal-body').innerHTML=
    rows.map(r=>`<div class="br-row"><span class="br-label">${r.label}</span><span class="br-val">${r.val>0?r.val.toLocaleString()+' EGP':'—'}</span></div>`).join('')+
    `<div class="br-total"><span>Total Estimate</span><span>${total.toLocaleString()} EGP</span></div>`+
    convStr;
  document.getElementById('modal-overlay').classList.add('open');
}

/* ═══════════════════════════════════════
   SHARE
═══════════════════════════════════════ */
function updateShareText(tags,total){
  const{amount,symbol}=convertEGP(total);
  const ps=activeCurrency==='EGP'?`${total.toLocaleString()} EGP`:`${amount.toLocaleString()} ${symbol} (${total.toLocaleString()} EGP)`;
  const txt=['EGYGRILLZ — My Custom Estimate','─────────────────────',...tags.map(t=>`• ${t}`),'─────────────────────',`Total: ${ps}`,'','Estimate only — final price confirmed at studio.','Book: egygrillz.com/booking.html'].join('\n');
  const el=document.getElementById('share-text');
  if(el)el.textContent=txt;
}
function toggleShare(){document.getElementById('share-panel').classList.toggle('show');}
function copyEst(){
  navigator.clipboard.writeText(document.getElementById('share-text').textContent).then(()=>{
    const btn=event.target.closest('.share-btn');
    const o=btn.innerHTML;btn.innerHTML='✓ Copied!';setTimeout(()=>btn.innerHTML=o,2000);
  });
}
function shareWA(){window.open(`https://wa.me/?text=${encodeURIComponent(document.getElementById('share-text').textContent)}`);}

/* ═══════════════════════════════════════
   SCROLL REVEAL
═══════════════════════════════════════ */
function initReveal(){
  const obs=new IntersectionObserver(entries=>{
    entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('vis');obs.unobserve(e.target);}});
  },{threshold:0.1});
  document.querySelectorAll('.reveal').forEach(el=>obs.observe(el));
}

/* ═══════════════════════════════════════
   CURSOR
═══════════════════════════════════════ */
function initCursor(){
  if(window.matchMedia('(hover:none)').matches)return;
  const c=document.getElementById('cursor');
  const t=document.getElementById('cursor-trail');
  let cx=0,cy=0,tx=0,ty=0;
  document.addEventListener('mousemove',e=>{cx=e.clientX;cy=e.clientY;c.style.left=cx+'px';c.style.top=cy+'px';});
  function tick(){tx+=(cx-tx)*.12;ty+=(cy-ty)*.12;t.style.left=tx+'px';t.style.top=ty+'px';requestAnimationFrame(tick);}
  requestAnimationFrame(tick);
  document.querySelectorAll('button,a,.tooth-btn,.mat-card,.level-card,.addon-tile,.combo-btn,.pill,.faq-q,.suggest-btn').forEach(el=>{
    el.addEventListener('mouseenter',()=>document.body.classList.add('hovering'));
    el.addEventListener('mouseleave',()=>document.body.classList.remove('hovering'));
  });
}

/* ═══════════════════════════════════════
   AI CHAT
═══════════════════════════════════════ */
let chatOpen=false;
let chatHistory=[];
const CHAT_CONTEXT=`You are GRILLZ AI, the official AI assistant for EGYGRILLZ — Egypt's #1 custom dental jewelry studio. You are embedded in the price estimator page. Be helpful, friendly, concise, and knowledgeable. Answer in the same language the user writes in.

ABOUT EGYGRILLZ:
- Custom dental jewelry (grillz) studio in Egypt, founded by Dr. Mohamed Mahdy
- Serves clients across Egypt and ships worldwide via FedEx
- Instagram: @egygrillz | Email: egygrillz@gmail.com

MATERIALS:
1. Silver 925 (Sterling Silver, Lost-Wax Cast): Hypoallergenic, brilliant, affordable. Price tied to live silver rate (~125 EGP/g). Good for intricate cutwork and iced-out designs.
2. Gold 18K (Solid 18K Gold, Lost-Wax Cast): Hypoallergenic, tarnish-free, highest value. Price calculated from live 18K gold market rate (~6,250 EGP/g). Karat purity certified.
3. Cobalt Chrome (3D Printed DMLS): Ultra-durable, scratch-resistant, dark silver gunmetal look. Fixed price: 1,000 EGP per tooth at Level 1. No metal market fluctuation.
4. Titanium (Aerospace Grade, 3D Printed DMLS): Lightest, fully biocompatible (used in dental implants), stronger than steel. Fixed price: 2,000 EGP per tooth at Level 1. Anodize-ready.

DESIGN LEVELS (multiplier applied to base per-tooth price):
- Level 1 — The Bar: 0% premium (×1.00). Simple solid bar, no cuts or detail.
- Level 2 — Solid Cap: +5% (×1.05). Seamless polished plain cap.
- Level 3 — Medium: +10% (×1.10). Texture work or shaped framing (e.g., drip, flame).
- Level 4 — Hard: +15% (×1.15). Intricate manual detail (e.g., flower).
- Level 5 — Complex: +25% (×1.25). Advanced layering or multi-step (e.g., snake, scorpion).
- Level 6 — Master: +40% (×1.40). Full artistic sculpting, expert-level modeling (e.g., mermaid).
- Level 7 — Masterpiece: +60% (×1.60). Maximum complexity, one-of-a-kind commission.

ADD-ONS:
- Enamel Coloring: Single Tone 200 EGP/tooth | Multi-Tone 350 EGP/tooth | Master Color 750 EGP/tooth
- Surface Plating: Yellow Gold/Rose Gold 300 EGP/tooth | White Gold/Black Gold 400 EGP/tooth | Silver 200 EGP/tooth
- Laser Engraving: Small 200 EGP | Medium 450 EGP | Large 700 EGP
- Anodize Coloring (Titanium only): Single Color 300 EGP | Dual Tone 350 EGP | Multi-Color 450 EGP

STONES & DIAMONDS (only available on Silver 925 and Gold 18K):
- Single Stone styles: Flush +150/stone | Prong +200/stone | Bezel +250/stone
- Gem types: CZ (AAAAA cubic zirconia) +50/stone | Moissanite (GRA-certified VVS1/D) +360/stone | Natural Diamond (SI or VS) — price on consultation
- Iced Out (full coverage): Pavé +1,000/tooth | Channel +1,500/tooth
- Iced Out gem upgrade: CZ included | Moissanite +1,800/tooth | Natural Diamond +5,000/tooth

COMMON COMBOS:
- Top 6: Upper jaw, R3 through L3 (6 teeth front)
- Top 8: Upper jaw, R4 through L4 (8 teeth)
- Bottom 6/8: Same for lower jaw
- Fangs: Canines only (4 teeth: UR3, UL3, LR3, LL3)
- Full Set: All available teeth

PRICING EXAMPLE:
- 6 teeth Silver 925, Level 2 = 6 × (200+37.5+46+2.3×125) × 2.8 × 1.05 ≈ rough estimate
- 1 tooth Cobalt Chrome Level 1 = 1,000 EGP
- 1 tooth Titanium Level 1 = 2,000 EGP

PAYMENT:
- 50% deposit to start production, 100% non-refundable
- Remaining 50% paid before release/shipment
- Accepts: cash, bank transfer, Vodafone Cash
- Quote valid for 7 days only

TURNAROUND:
- Cobalt Chrome / Titanium: 5–7 days
- Silver 925 / Gold 18K: 10–14 days
- Rush service available

CARE INSTRUCTIONS:
- Rinse with cold water after every wear
- Soft-bristle toothbrush only
- No whitening or abrasive toothpaste on plated pieces
- Pat dry with microfiber cloth, store in EGYGRILLZ case
- Avoid chemicals: bleach, chlorine, perfume, hairspray
- Remove before eating, drinking (except plain water), smoking, sleeping

FIT & SAFETY:
- Impression takes 3–5 minutes using dental-grade material
- No pain, no drilling, no permanent alteration
- Fit issues must be reported within 48 hours with photo/video evidence
- All products are custom — strictly non-refundable and non-exchangeable

SHIPPING:
- Official carrier: FedEx with full tracking
- Domestic Egypt: 2–4 business days
- In-person collection by appointment only (ID required for high-value orders)

REFUND POLICY: Custom-made to your exact dental measurements. Non-refundable and non-exchangeable in all circumstances except if EGYGRILLZ cancels the order.

Respond concisely. If asked about a specific price with a configuration, calculate it. Use Egyptian Arabic informally if user writes in Arabic. Always be warm and professional.`;

function toggleChat(){
  chatOpen=!chatOpen;
  document.getElementById('chat-window').classList.toggle('open',chatOpen);
  if(chatOpen){
    document.getElementById('unread-badge').classList.remove('show');
    if(chatHistory.length===0) addAIMsg("مرحباً! 👋 I'm GRILLZ AI — ask me anything about materials, pricing, design levels, or care. I can also help you understand your estimate!");
  }
}

function addMsg(text,role){
  const msgs=document.getElementById('chat-msgs');
  const now=new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  const div=document.createElement('div');
  div.className=`msg ${role}`;
  const bubble=document.createElement('div');bubble.className='msg-bubble';bubble.textContent=String(text);const time=document.createElement('span');time.className='msg-time';time.textContent=now;div.append(bubble,time);
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
}

function addAIMsg(text){addMsg(text,'ai');}
function addUserMsg(text){addMsg(text,'user');}

function showTyping(){
  const msgs=document.getElementById('chat-msgs');
  const div=document.createElement('div');
  div.className='msg ai';div.id='typing-indicator';
  div.innerHTML='<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
}
function removeTyping(){
  const t=document.getElementById('typing-indicator');
  if(t)t.remove();
}

async function sendChat(){
  const input=document.getElementById('chat-input');
  const text=input.value.trim();
  if(!text)return;
  input.value='';
  addUserMsg(text);
  chatHistory.push({role:'user',content:text});
  showTyping();
  // Build context-aware message including current config
  const{rows,total}=calcBreakdown();
  const configNote=total>0?`\n\n[User's current estimate config: ${MATS[S.matIdx].nm}, ${CPLX[S.cplxIdx].nm}, ${S.teeth.size} teeth, Total: ${total.toLocaleString()} EGP]`:'';
  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:400,
        system:CHAT_CONTEXT+configNote,
        messages:chatHistory,
      })
    });
    const data=await res.json();
    removeTyping();
    const reply=data.content?.find(b=>b.type==='text')?.text||'Sorry, I couldn\'t process that. Please try again.';
    addAIMsg(reply);
    chatHistory.push({role:'assistant',content:reply});
    if(chatHistory.length>20)chatHistory=chatHistory.slice(-20);
  }catch(e){
    removeTyping();
    addAIMsg('Connection issue — please try again or contact us on Instagram @egygrillz');
  }
}

function sendSuggestion(btn){
  document.getElementById('chat-input').value=btn.textContent;
  sendChat();
  document.getElementById('chat-suggestions').style.display='none';
}

// Show unread badge after delay
setTimeout(()=>{
  if(!chatOpen){
    document.getElementById('unread-badge').classList.add('show');
  }
},4000);

/* ═══════════════════════════════════════
   INIT
═══════════════════════════════════════ */
function init(){
  buildTeeth();
  buildMatGrid();
  buildLevelGrid();
  buildFAQ();
  updatePrice();
  initReveal();
  initCursor();
  fetchGold();
}
window.addEventListener('load',init);
