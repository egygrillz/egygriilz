const db=firebase.firestore(),auth=firebase.auth();
const collection=(db,path)=>db.collection(path),getDocs=ref=>ref.get(),doc=(db,path,id)=>db.collection(path).doc(id),setDoc=(ref,data)=>ref.set(data),serverTimestamp=()=>firebase.firestore.FieldValue.serverTimestamp();
/* ══════════════════════════════════════════════════
   LOCK SCREEN
══════════════════════════════════════════════════ */
sessionStorage.removeItem('egy_invoice_auth');
document.getElementById('lock-btn').textContent='Sign in with your admin account';
document.getElementById('lock-input').style.display='none';
document.getElementById('lock-btn').addEventListener('click',()=>location.href='admin.html');
/* ══════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════ */
let toastTimer;
function showToast(msg, type='', dur=2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = 'toast', dur);
}

function fmt(n) { return new Intl.NumberFormat('en-EG',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0); }
function todayStr() { return egyCairoNow().date; }

let invoiceCache=[];
function genInvNum(){return 'Assigned on save';}
function getInvoices(){return invoiceCache.slice();}
async function loadCloudInvoices(){
 const items=[];let cursor=null;
 do{const page=await egyCall('invoiceAdmin',{action:'list',cursor});items.push(...page.items);cursor=page.cursor;}while(cursor);
 invoiceCache=items;
}
async function importLocalInvoices(){
 let old;try{old=JSON.parse(localStorage.getItem('egy_invoices')||'[]');}catch{showToast('Local invoice data is invalid. Export it for recovery.','error-toast');return;}
 if(!Array.isArray(old)||!old.length){showToast('No local invoices to import.');return;}
 if(!await confirm('Migrate invoices', 'Download a private backup and import '+old.length+' invoices to your studio account? Cloud invoice numbers will be assigned.'))return;
 const backup=new Blob([JSON.stringify(old,null,2)],{type:'application/json'}),url=URL.createObjectURL(backup),link=document.createElement('a');link.href=url;link.download='egygrillz-private-invoices-backup.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
 let done=0;
 try{for(const inv of old){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('legacy-invoice:'+String(inv.id)));const requestId=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');await egyCall('invoiceAdmin',{action:'save',requestId,invoice:{...inv,clientId:String(inv.clientId||'legacy'),legacyNumber:String(inv.number||'')}});done++;}
  await loadCloudInvoices();loadAccountingTab();updateHeroStats();showToast('Imported '+done+' invoices. Keep the private backup safe.','success');
  if(await confirm('Remove local copy?', 'All invoices were imported. Remove the unencrypted browser copy?'))localStorage.removeItem('egy_invoices');
 }catch(e){await loadCloudInvoices();loadAccountingTab();showToast('Imported '+done+' before an error: '+e.message+'. Local data was kept. You can retry.','error-toast',10000);}
}
/* ══════════════════════════════════════════════════
   CONFIRM DIALOG (replaces window.confirm)
══════════════════════════════════════════════════ */
function confirm(title, msg) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirm-modal');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = msg;
    overlay.classList.add('open');
    const ok = document.getElementById('confirm-ok');
    const cancel = document.getElementById('confirm-cancel');
    function cleanup(val) {
      overlay.classList.remove('open');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      resolve(val);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
  });
}

/* ══════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════ */
let clients = [];
let lineItems = [];
let selectedClient = null;
let paymentMethod = 'Cash';
let currentCategory = 'golds';
let designCache = {};
let allDesigns = []; // flat list for item search
let editingInvoiceId = null;
let editingInvoiceVersion=null;
let invoiceRequestId=egyRequestId();
let accStatusFilter = 'all';

/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */
async function initApp() {
  setupHeader();
  setupTabs();
  setupReveal();
  setupInvoiceForm();
  setupDesignPicker();
  setupPaymentMethods();
  setupSaveEmail();
  setupAddClientModal();
  setupClientsTabSearch();
  setupAccSearch();
  setupResetBtn();
  setupClientSearchAutocomplete();
  setupItemSearchAutocomplete();
  await Promise.all([loadClients(),loadCloudInvoices()]);
  loadAccountingTab();
  const migrate=document.createElement('button');migrate.textContent='Import invoices from this device';migrate.className='btn-outline';migrate.onclick=importLocalInvoices;document.getElementById('app').append(migrate);const refresh=document.createElement('button');refresh.className='btn-outline';refresh.textContent='Refresh cloud invoices';refresh.onclick=async()=>{try{await loadCloudInvoices();loadAccountingTab();updateHeroStats();showToast('Invoices refreshed.');}catch(e){showToast(e.message,'error-toast');}};document.getElementById('app').append(refresh);
  setDefaultDates();
  updatePreview();
}

/* ══════════════════════════════════════════════════
   HEADER
══════════════════════════════════════════════════ */
function setupHeader() {
  const header = document.getElementById('site-header');
  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    header.classList.toggle('hidden', y > lastY && y > 80);
    lastY = y;
  }, {passive:true});
  document.querySelector('.menu-toggle').addEventListener('click', () => {
    document.querySelector('.main-nav').classList.toggle('active');
  });
}

/* ══════════════════════════════════════════════════
   TABS
══════════════════════════════════════════════════ */
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'accounting') loadAccountingTab();
      if (btn.dataset.tab === 'clients') renderClientsTable(clients);
    });
  });
  document.getElementById('new-invoice-btn').addEventListener('click', () => {
    document.querySelectorAll('.tab-btn')[0].click();
    window.scrollTo({top:0, behavior:'smooth'});
  });
}

/* ══════════════════════════════════════════════════
   REVEAL
══════════════════════════════════════════════════ */
function setupReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if(e.isIntersecting){ e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, {threshold:0.05});
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

/* ══════════════════════════════════════════════════
   CLIENT AUTOCOMPLETE SEARCH
══════════════════════════════════════════════════ */
function setupClientSearchAutocomplete() {
  const input = document.getElementById('client-search-input');
  const dropdown = document.getElementById('client-dropdown');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { dropdown.classList.remove('open'); return; }
    const matches = clients.filter(c =>
      (c.name||'').toLowerCase().includes(q) ||
      (c.id||'').includes(q) ||
      (c.email||'').toLowerCase().includes(q)
    ).slice(0, 8);
    renderClientDropdown(matches);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim()) input.dispatchEvent(new Event('input'));
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.client-search-wrap')) dropdown.classList.remove('open');
  });

  document.getElementById('client-clear-btn').addEventListener('click', () => {
    selectedClient = null;
    input.value = '';
    document.getElementById('client-card').classList.remove('visible');
    dropdown.classList.remove('open');
    updatePreview();
  });
}

function renderClientDropdown(matches) {
  const dropdown = document.getElementById('client-dropdown');
  if (!matches.length) {
    dropdown.innerHTML = DOMPurify.sanitize('<div class="client-option-empty">No clients found</div>');
    dropdown.classList.add('open');
    return;
  }
  dropdown.innerHTML = DOMPurify.sanitize(matches.map(c => `
    <div class="client-option" data-id="${escHtml(c.id)}">
      <div class="client-option-name">${escHtml(c.name || c.id)}</div>
      <div class="client-option-sub">${escHtml(c.id)}${c.email ? ' · ' + escHtml(c.email) : ''}</div>
    </div>
  `).join(''));
  dropdown.classList.add('open');
  dropdown.querySelectorAll('.client-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const id = opt.dataset.id;
      selectClient(clients.find(c => c.id === id));
      dropdown.classList.remove('open');
    });
  });
}

function selectClient(c) {
  if (!c) return;
  selectedClient = c;
  document.getElementById('client-search-input').value = c.name || c.id;
  const card = document.getElementById('client-card');
  card.classList.add('visible');
  document.getElementById('cc-name').textContent = c.name || c.id;
  document.getElementById('cc-info').textContent =
    [c.phone, c.email].filter(Boolean).join(' · ');
  document.getElementById('cc-badge').textContent = `${Number(c.totalAppointments)||0} visits`;
  updatePreview();
}

/* ══════════════════════════════════════════════════
   ITEM SEARCH AUTOCOMPLETE (across designs)
══════════════════════════════════════════════════ */
function setupItemSearchAutocomplete() {
  const input = document.getElementById('item-search-input');
  const dropdown = document.getElementById('item-search-dropdown');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { dropdown.classList.remove('open'); return; }
    const matches = allDesigns.filter(d =>
      (d.name||'').toLowerCase().includes(q) ||
      (d.cat||'').toLowerCase().includes(q)
    ).slice(0, 10);
    renderItemSearchDropdown(matches, q);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.item-search-wrap')) dropdown.classList.remove('open');
  });
}

function renderItemSearchDropdown(matches, q) {
  const dropdown = document.getElementById('item-search-dropdown');
  if (!matches.length) {
    dropdown.innerHTML = DOMPurify.sanitize('<div class="item-search-empty">No designs found for "' + escHtml(q) + '"</div>');
    dropdown.classList.add('open');
    return;
  }
  dropdown.innerHTML = DOMPurify.sanitize(matches.map(d => {
    const imgSrc = d.images && d.images[0] ? `assets/images/${d.cat}/${d.folder}/${d.images[0]}` : '';
    return `
      <div class="item-search-option" data-name="${d.name||d.folder}" data-price="${d.priceNum||0}">
        ${imgSrc ? `<img src="${imgSrc}" alt="${d.name}" onerror="this.style.display='none'">` : '<div style="width:40px;height:50px;background:#f0f0f0;flex-shrink:0"></div>'}
        <div class="item-search-option-info">
          <div class="item-search-option-name">${d.name||d.folder}</div>
          <div class="item-search-option-meta">${d.cat} · ${d.folder}</div>
        </div>
        <div class="item-search-option-price">${d.price||'—'}</div>
      </div>
    `;
  }).join(''));
  dropdown.classList.add('open');
  dropdown.querySelectorAll('.item-search-option').forEach(opt => {
    opt.addEventListener('click', () => {
      addCustomItem({ name: opt.dataset.name, qty: 1, price: +opt.dataset.price });
      showToast('Added: ' + opt.dataset.name, 'success');
      document.getElementById('item-search-input').value = '';
      dropdown.classList.remove('open');
    });
  });
}

/* ══════════════════════════════════════════════════
   LOAD CLIENTS FROM FIREBASE
══════════════════════════════════════════════════ */
async function loadClients() {
  try {
    const snap = await getDocs(collection(db, 'clients'));
    clients = [];
    snap.forEach(docSnap => { if(/^[\w-]{1,128}$/.test(docSnap.id))clients.push({ ...docSnap.data(), id: docSnap.id }); });
    clients.sort((a,b) => (a.name||'').localeCompare(b.name||''));
    updateHeroStats();
  } catch(e) {
    console.error('Firebase error:', e);
    showToast('Firebase connection error', 'error-toast');
  }
}

function updateHeroStats() {
  document.getElementById('stat-clients').textContent = clients.length;
  const invs = getInvoices();
  document.getElementById('stat-invoices').textContent = invs.length;
  const totalRev = invs.filter(i=>i.status==='paid').reduce((s,i)=>s+i.total,0);
  const outstanding = invs.filter(i=>i.status!=='paid').reduce((s,i)=>{
    return s + Math.max(0, i.total - (i.deposit||0));
  },0);
  document.getElementById('stat-revenue').textContent = fmt(totalRev);
  document.getElementById('stat-pending').textContent = fmt(outstanding);
}

/* ══════════════════════════════════════════════════
   INVOICE FORM SETUP
══════════════════════════════════════════════════ */
function setupInvoiceForm() {
  ['inv-number','inv-date','inv-due','inv-status','inv-notes',
   'discount-val','discount-type','deposit-val','usd-rate'].forEach(id => {
    document.getElementById(id).addEventListener('input', updatePreview);
    document.getElementById(id).addEventListener('change', updatePreview);
  });
  document.getElementById('add-item-btn').addEventListener('click', () => addCustomItem());
}

function setDefaultDates() {
  const today = todayStr();
  document.getElementById('inv-number').readOnly=true;
  document.getElementById('inv-date').value = today;
  const due = new Date(); due.setDate(due.getDate() + 7);
  document.getElementById('inv-due').value = due.toISOString().slice(0,10);
  document.getElementById('inv-number').value = genInvNum();
}

/* ══════════════════════════════════════════════════
   RESET FORM
══════════════════════════════════════════════════ */
function setupResetBtn() {
  document.getElementById('reset-invoice-btn').addEventListener('click', async () => {
    const ok = await confirm('Reset Form', 'Clear all items and start a new invoice?');
    if (!ok) return;
    resetForm();
  });
}

function resetForm() {
  editingInvoiceId = null;editingInvoiceVersion=null;invoiceRequestId=egyRequestId();
  selectedClient = null;
  lineItems = [];
  paymentMethod = 'Cash';

  document.getElementById('client-search-input').value = '';
  document.getElementById('client-card').classList.remove('visible');
  document.getElementById('inv-notes').value = '';
  document.getElementById('discount-val').value = '0';
  document.getElementById('discount-type').value = 'egp';
  document.getElementById('deposit-val').value = '0';
  document.getElementById('inv-status').value = 'pending';

  document.querySelectorAll('.pmeth-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.method === 'Cash');
  });

  setDefaultDates();
  renderItems();
  updatePreview();
  showToast('Form reset', 'success');
}

/* ══════════════════════════════════════════════════
   LINE ITEMS
══════════════════════════════════════════════════ */
function addCustomItem(prefill={}) {
  const item = {
    id: Date.now() + Math.random(),
    name: prefill.name || '',
    qty: prefill.qty || 1,
    price: prefill.price || 0
  };
  lineItems.push(item);
  renderItems();
  updatePreview();
}

function removeItem(id) {
  lineItems = lineItems.filter(i => i.id !== id);
  renderItems();
  updatePreview();
  showToast('Item removed');
}

function renderItems() {
  const wrap = document.getElementById('items-list');
  if (lineItems.length === 0) {
    wrap.innerHTML = DOMPurify.sanitize('<div class="items-empty" id="items-empty">No items added yet</div>');
    return;
  }

  // Column headers
  let html = `<div class="item-cols-header">
    <div class="item-col-head">Description</div>
    <div class="item-col-head">Qty</div>
    <div class="item-col-head">Price EGP</div>
    <div class="item-col-head"></div>
  </div>`;

  lineItems.forEach(item => {
    html += `
      <div class="item-row" data-item-id="${item.id}">
        <input class="item-field" placeholder="Item name / description" value="${escHtml(item.name)}" data-id="${item.id}" data-field="name">
        <input class="item-field" type="number" min="1" value="${item.qty}" data-id="${item.id}" data-field="qty" style="text-align:center">
        <input class="item-field" type="number" min="0" step="0.01" value="${item.price}" data-id="${item.id}" data-field="price">
        <button class="item-remove" data-remove="${item.id}" title="Remove item"><i class="fas fa-times"></i></button>
      </div>
    `;
  });

  wrap.innerHTML = DOMPurify.sanitize(html);

  wrap.querySelectorAll('.item-field').forEach(inp => {
    inp.addEventListener('input', () => {
      const id = +inp.dataset.id;
      const field = inp.dataset.field;
      const it = lineItems.find(i => i.id == id);
      if (!it) return;
      it[field] = field === 'name' ? inp.value : Math.max(0, +inp.value || 0);
      updatePreview();
    });
  });

  wrap.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removeItem(+btn.dataset.remove));
  });
}

function escHtml(str) {
  return String(str??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ══════════════════════════════════════════════════
   DESIGN PICKER
══════════════════════════════════════════════════ */
function setupDesignPicker() {
  document.getElementById('toggle-picker-btn').addEventListener('click', () => {
    const picker = document.getElementById('design-picker');
    picker.classList.toggle('open');
    if (picker.classList.contains('open')) loadDesigns(currentCategory);
  });
  document.querySelectorAll('.dpick-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dpick-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.cat;
      loadDesigns(currentCategory);
    });
  });
}

async function loadDesigns(cat) {
  if (designCache[cat]) { renderDesignGrid(designCache[cat]); return; }
  document.getElementById('design-grid').innerHTML = DOMPurify.sanitize('<div class="design-picker-loading">Loading...</div>');
  try {
    const jsonFile = cat === 'latest-designs' ? 'designs.json' : `${cat}.json`;
    const list = await fetch(`assets/images/${cat}/${jsonFile}`).then(r => r.json());
    const designs = [];
    for (const folder of list.slice(0,20)) {
      try {
        const txt = await fetch(`assets/images/${cat}/${folder}/info.txt`).then(r => r.text());
        const d = parseInfo(txt);
        d.folder = folder; d.cat = cat;
        d.priceNum = parseFloat((d.price||'').replace(/[^0-9.]/g,'')) || 0;
        designs.push(d);
      } catch{}
    }
    designCache[cat] = designs;
    // add to flat list for item search
    designs.forEach(d => { if (!allDesigns.find(x => x.folder===d.folder && x.cat===d.cat)) allDesigns.push(d); });
    renderDesignGrid(designs);
  } catch(e) {
    document.getElementById('design-grid').innerHTML = DOMPurify.sanitize('<div class="design-picker-loading">No designs found</div>');
  }
}

function renderDesignGrid(designs) {
  const grid = document.getElementById('design-grid');
  if (!designs.length) { grid.innerHTML = DOMPurify.sanitize('<div class="design-picker-loading">No designs found</div>'); return; }
  grid.innerHTML = DOMPurify.sanitize('');
  designs.forEach(d => {
    const thumb = document.createElement('div');
    thumb.className = 'design-thumb';
    const imgSrc = d.images && d.images[0] ? `assets/images/${d.cat}/${d.folder}/${d.images[0]}` : '';
    thumb.innerHTML = DOMPurify.sanitize(`
      ${imgSrc ? `<img src="${imgSrc}" alt="${d.name}" loading="lazy" onerror="this.parentElement.querySelector('.design-thumb-name').textContent+=' (no img)'">` : '<div style="aspect-ratio:3/4;background:#f0f0f0;display:flex;align-items:center;justify-content:center;"><i class="fas fa-image" style="color:#ccc;font-size:20px"></i></div>'}
      <div class="design-thumb-name">${d.name || d.folder}</div>
      <div class="design-thumb-price">${d.price || ''}</div>
    `);
    thumb.addEventListener('click', () => {
      addCustomItem({ name: d.name || d.folder, qty: 1, price: d.priceNum });
      showToast('Added: ' + (d.name || d.folder), 'success');
    });
    grid.appendChild(thumb);
  });
}

function parseInfo(text) {
  const info = {name:'',price:'',desc:'',images:[]};
  text.split('\n').forEach(line => {
    const ci = line.indexOf(':'); if(ci===-1) return;
    const k = line.slice(0,ci).trim().toLowerCase();
    const v = line.slice(ci+1).trim();
    if(k==='name'||k==='title') info.name=v;
    else if(k==='price') info.price=v;
    else if(k==='description'||k==='desc') info.desc=v;
    else if(k==='images') info.images=v.split(',').map(s=>s.trim()).filter(Boolean);
  });
  return info;
}

/* ══════════════════════════════════════════════════
   PAYMENT METHODS
══════════════════════════════════════════════════ */
function setupPaymentMethods() {
  document.querySelectorAll('.pmeth-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pmeth-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      paymentMethod = btn.dataset.method;
      updatePreview();
    });
  });
}

/* ══════════════════════════════════════════════════
   PREVIEW UPDATE
══════════════════════════════════════════════════ */
function calcTotals() {
  const subtotal = lineItems.reduce((s,i) => s + (i.qty * i.price), 0);
  const discVal = parseFloat(document.getElementById('discount-val').value) || 0;
  const discType = document.getElementById('discount-type').value;
  const discount = discType === 'pct' ? subtotal * discVal / 100 : discVal;
  const total = Math.max(0, subtotal - discount);
  const rate = parseFloat(document.getElementById('usd-rate').value) || 50;
  const usd = total / rate;
  const deposit = parseFloat(document.getElementById('deposit-val').value) || 0;
  const remaining = Math.max(0, total - deposit);
  return { subtotal, discount, total, usd, deposit, remaining, rate };
}

function updatePreview() {
  const num = document.getElementById('inv-number').value || 'EGY-001';
  const date = document.getElementById('inv-date').value;
  const status = document.getElementById('inv-status').value;
  const notes = document.getElementById('inv-notes').value;
  const { subtotal, discount, total, usd, deposit, remaining } = calcTotals();

  document.getElementById('prev-num').textContent = num;
  document.getElementById('prev-date').textContent = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-EG',{year:'numeric',month:'long',day:'numeric'})
    : '';

  const badge = document.getElementById('prev-status');
  badge.textContent = status==='paid'?'Paid':status==='partial'?'Partial Payment':'Pending';
  badge.className = 'inv-status-badge ' + status;

  if (selectedClient) {
    document.getElementById('prev-client-name').textContent = selectedClient.name || selectedClient.id;
    document.getElementById('prev-client-detail').innerHTML =
      DOMPurify.sanitize([selectedClient.phone, selectedClient.email].filter(Boolean).map(escHtml).join('<br>'));
  } else {
    document.getElementById('prev-client-name').textContent = '—';
    document.getElementById('prev-client-detail').textContent = 'No client selected';
  }

  const tbody = document.getElementById('prev-items');
  if (lineItems.length === 0) {
    tbody.innerHTML = DOMPurify.sanitize('<tr><td colspan="4" style="text-align:center;color:#ccc;font-size:11px;padding:20px 0">No items yet</td></tr>');
  } else {
    tbody.innerHTML = DOMPurify.sanitize(lineItems.map(i => `
      <tr>
        <td>${escHtml(i.name) || '—'}</td>
        <td style="text-align:right">${i.qty}</td>
        <td style="text-align:right">${fmt(i.price)} EGP</td>
        <td style="text-align:right">${fmt(i.qty * i.price)} EGP</td>
      </tr>
    `).join(''));
  }

  document.getElementById('prev-subtotal').textContent = fmt(subtotal) + ' EGP';
  const discRow = document.getElementById('prev-discount-row');
  if (discount > 0) {
    discRow.style.display = 'flex';
    document.getElementById('prev-discount').textContent = '-' + fmt(discount) + ' EGP';
  } else { discRow.style.display = 'none'; }
  document.getElementById('prev-total').textContent = fmt(total) + ' EGP';
  document.getElementById('prev-usd').textContent = '≈ $' + usd.toFixed(2);

  document.getElementById('tot-subtotal').textContent = fmt(subtotal) + ' EGP';
  document.getElementById('tot-total').textContent = fmt(total) + ' EGP';
  document.getElementById('tot-usd').textContent = '≈ $' + usd.toFixed(2);

  document.getElementById('prev-payment-method').textContent = paymentMethod;
  const depRow = document.getElementById('prev-deposit-row');
  const remRow = document.getElementById('prev-remaining-row');
  if (deposit > 0) {
    depRow.style.display = 'flex'; remRow.style.display = 'flex';
    document.getElementById('prev-deposit').textContent = fmt(deposit) + ' EGP';
    document.getElementById('prev-remaining').textContent = fmt(remaining) + ' EGP';
  } else { depRow.style.display = 'none'; remRow.style.display = 'none'; }

  document.getElementById('prev-notes').textContent = notes || '';
}

/* ══════════════════════════════════════════════════
   SAVE / PDF / EMAIL
══════════════════════════════════════════════════ */
function setupSaveEmail() {
  document.getElementById('save-invoice-btn').addEventListener('click', saveInvoice);
  document.getElementById('download-pdf-btn').addEventListener('click', downloadPDF);
  document.getElementById('email-invoice-btn').addEventListener('click', emailInvoice);
}

function buildInvoiceData() {
  const { subtotal, discount, total, deposit, remaining } = calcTotals();
  return {
    id: editingInvoiceId || Date.now(),
    number: document.getElementById('inv-number').value,
    date: document.getElementById('inv-date').value,
    due: document.getElementById('inv-due').value,
    status: document.getElementById('inv-status').value,
    notes: document.getElementById('inv-notes').value,
    clientId: selectedClient?.id || null,
    clientName: selectedClient?.name || '—',
    clientEmail: selectedClient?.email || '',
    clientPhone: selectedClient?.phone || '',
    items: lineItems.map(i => ({...i})),
    subtotal, discount, total, deposit, remaining,
    paymentMethod,
    createdAt: new Date().toISOString()
  };
}

async function saveInvoice(){
 if(!selectedClient||!lineItems.length){showToast('Select a client and add at least one item.','error-toast');return;}
 const button=document.getElementById('save-invoice-btn');button.disabled=true;
 try{const saved=await egyCall('invoiceAdmin',{action:'save',...(editingInvoiceId?{id:editingInvoiceId,version:editingInvoiceVersion}:{requestId:invoiceRequestId}),invoice:buildInvoiceData()});editingInvoiceId=saved.id;editingInvoiceVersion=saved.version;invoiceCache=invoiceCache.filter(i=>i.id!==saved.id);invoiceCache.push(saved);document.getElementById('inv-number').value=saved.number;document.getElementById('deposit-val').value=saved.deposit;lineItems=saved.items;renderItems();document.getElementById('discount-type').value='egp';document.getElementById('discount-val').value=saved.discount;updatePreview();updateHeroStats();loadAccountingTab();showToast('Saved securely · '+saved.number,'success');return true;}
 catch(e){showToast(e.message,'error-toast',8000);return false;}finally{button.disabled=false;}
}

async function downloadPDF() {
  if(!await saveInvoice())return;
  const overlay = document.getElementById('pdf-overlay');
  const btn = document.getElementById('download-pdf-btn');

  // Check libraries loaded
  if (typeof window.html2canvas === 'undefined') {
    showToast('html2canvas not loaded — refresh page', 'error-toast'); return;
  }
  if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
    showToast('jsPDF not loaded — refresh page', 'error-toast'); return;
  }

  overlay.classList.add('open');
  btn.disabled = true;

  try {
    await new Promise(r => setTimeout(r, 150));

    // Support both window.jspdf.jsPDF and window.jsPDF
    const JsPDFConstructor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!JsPDFConstructor) throw new Error('jsPDF constructor not found');

    const preview = document.getElementById('invoice-preview');

    // Clone the preview into a clean off-screen container to avoid
    // layout/sticky/shadow issues during capture
    const clone = preview.cloneNode(true);
    clone.style.cssText = `
      position:fixed; left:-9999px; top:0;
      width:${preview.offsetWidth}px;
      background:#fff; padding:40px 36px;
      font-family:Arimo,sans-serif;
      box-shadow:none; border:none;
    `;
    document.body.appendChild(clone);

    let canvas;
    try {
      canvas = await window.html2canvas(clone, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        allowTaint: true,
        width: clone.offsetWidth,
        height: clone.scrollHeight
      });
    } finally {
      document.body.removeChild(clone);
    }

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new JsPDFConstructor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();   // 210mm
    const pageH = pdf.internal.pageSize.getHeight();  // 297mm

    const pxPerMm = canvas.width / pageW;
    const contentHeightMm = canvas.height / pxPerMm;

    if (contentHeightMm <= pageH) {
      // Fits on one page
      pdf.addImage(imgData, 'JPEG', 0, 0, pageW, contentHeightMm);
    } else {
      // Slice into pages
      const pageHeightPx = pageH * pxPerMm;
      let offsetPx = 0;
      let pageNum = 0;
      while (offsetPx < canvas.height) {
        if (pageNum > 0) pdf.addPage();
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.min(pageHeightPx, canvas.height - offsetPx);
        const ctx = sliceCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, offsetPx, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
        const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.95);
        const sliceHeightMm = (sliceCanvas.height / pxPerMm);
        pdf.addImage(sliceData, 'JPEG', 0, 0, pageW, sliceHeightMm);
        offsetPx += pageHeightPx;
        pageNum++;
      }
    }

    const num = (document.getElementById('inv-number').value || 'invoice').replace(/[^a-zA-Z0-9\-]/g,'');
    const clientName = (selectedClient?.name || 'client').replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'');
    pdf.save(`EGYGRILLZ-${num}-${clientName}.pdf`);
    showToast('PDF downloaded!', 'success');

  } catch(e) {
    console.error('PDF error:', e);
    showToast('PDF failed: ' + e.message, 'error-toast');
  } finally {
    overlay.classList.remove('open');
    btn.disabled = false;
  }
}

async function emailInvoice() {
  if(!await saveInvoice())return;
  if (!selectedClient?.email) {
    showToast('Client has no email address', 'error-toast'); return;
  }
  const num = document.getElementById('inv-number').value;
  const { total, deposit, remaining } = calcTotals();
  const status = document.getElementById('inv-status').value;
  const notes = document.getElementById('inv-notes').value;
  const itemLines = lineItems.map(i => `  - ${i.name} (x${i.qty}): ${fmt(i.qty*i.price)} EGP`).join('\n');

  const subject = encodeURIComponent(`EGYGRILLZ Invoice ${num}`);
  const body = encodeURIComponent(
`Dear ${selectedClient.name},

Thank you for choosing EGYGRILLZ — Egypt's First Custom Dental Jewelry Studio.

INVOICE: ${num}
Date: ${document.getElementById('inv-date').value}
Status: ${status.toUpperCase()}

──────────────────────
ITEMS:
${itemLines}
──────────────────────
Subtotal: ${fmt(lineItems.reduce((s,i)=>s+i.qty*i.price,0))} EGP
Total: ${fmt(total)} EGP${deposit > 0 ? `
Deposit Paid: ${fmt(deposit)} EGP
Balance Due: ${fmt(remaining)} EGP` : ''}
Payment Method: ${paymentMethod}
Tax: Free · No VAT Applied
──────────────────────
${notes ? `Notes: ${notes}\n` : ''}
For any questions, contact us via Instagram @egygrillz or reply to this email.

With care,
DR Mohamed Mahdy
EGYGRILLZ Studio · Smart Smile Dental Clinic, Heliopolis, Cairo`
  );

  window.location.href = `mailto:${selectedClient.email}?subject=${subject}&body=${body}`;
  showToast('Opening email client...', 'success');
}

/* ══════════════════════════════════════════════════
   ACCOUNTING TAB
══════════════════════════════════════════════════ */
function setupAccSearch() {
  document.getElementById('acc-search-input').addEventListener('input', () => renderInvoicesList());
  document.querySelectorAll('.acc-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.acc-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      accStatusFilter = btn.dataset.filter;
      renderInvoicesList();
    });
  });
}

function loadAccountingTab() {
  const invs = getInvoices();
  const totalRev = invs.filter(i=>i.status==='paid').reduce((s,i)=>s+i.total,0);
  const outstanding = invs.filter(i=>i.status!=='paid').reduce((s,i)=>s+Math.max(0,i.total-(i.deposit||0)),0);
  const avg = invs.length ? invs.reduce((s,i)=>s+i.total,0)/invs.length : 0;

  document.getElementById('acc-total-rev').textContent = fmt(totalRev);
  document.getElementById('acc-outstanding').textContent = fmt(outstanding);
  document.getElementById('acc-count').textContent = invs.length;
  document.getElementById('acc-avg').textContent = fmt(avg);

  renderInvoicesList();
}

function renderInvoicesList() {
  const q = (document.getElementById('acc-search-input')?.value || '').toLowerCase();
  let invs = getInvoices().sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));

  if (accStatusFilter !== 'all') invs = invs.filter(i => i.status === accStatusFilter);
  if (q) invs = invs.filter(i =>
    (i.number||'').toLowerCase().includes(q) ||
    (i.clientName||'').toLowerCase().includes(q) ||
    (i.clientPhone||'').includes(q)
  );

  const wrap = document.getElementById('invoices-list-wrap');
  if (!invs.length) {
    wrap.innerHTML = DOMPurify.sanitize('<div class="no-invoices">No invoices match your search</div>');
    return;
  }

  wrap.innerHTML = DOMPurify.sanitize(invs.map(inv => `
    <div class="inv-list-row">
      <div class="inv-list-num">${inv.number || '—'}</div>
      <div class="inv-list-client">${inv.clientName || '—'}</div>
      <div class="inv-list-date">${inv.date || ''}</div>
      <div class="inv-list-amount">${fmt(inv.total)} EGP</div>
      <div class="inv-list-status">
        <span class="status-dot ${inv.status}"></span>
        <span class="status-text">${inv.status}</span>
      </div>
      <div class="inv-list-actions">
        <button class="inv-mini-btn" data-edit="${inv.id}">Edit</button>
        <button class="inv-mini-btn" data-email="${inv.id}" ${!inv.clientEmail?'disabled title="No email"':''}>Email</button>
        <button class="inv-mini-btn danger" data-del="${inv.id}">Delete</button>
      </div>
    </div>
  `).join(''));

  wrap.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirm('Delete Invoice', `Delete invoice ${btn.dataset.del}? This cannot be undone.`);
      if (!ok) return;
      const inv=getInvoices().find(i=>i.id===btn.dataset.del);if(!inv)return;
      try{await egyCall('invoiceAdmin',{action:'delete',id:inv.id,version:inv.version});invoiceCache=invoiceCache.filter(i=>i.id!==inv.id);}catch(e){showToast(e.message,'error-toast');return;}
      loadAccountingTab();
      updateHeroStats();
      showToast('Invoice deleted');
    });
  });

  wrap.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const inv = getInvoices().find(i => i.id == btn.dataset.edit);
      if (!inv) return;
      loadInvoiceIntoBuilder(inv);
      document.querySelectorAll('.tab-btn')[0].click();
      window.scrollTo({top:0, behavior:'smooth'});
    });
  });

  wrap.querySelectorAll('[data-email]').forEach(btn => {
    btn.addEventListener('click', () => {
      const inv = getInvoices().find(i => i.id == btn.dataset.email);
      if (!inv || !inv.clientEmail) { showToast('No email for this client', 'error-toast'); return; }
      const itemLines = (inv.items||[]).map(i=>`  - ${i.name} (x${i.qty}): ${fmt(i.qty*i.price)} EGP`).join('\n');
      const subject = encodeURIComponent(`EGYGRILLZ Invoice ${inv.number}`);
      const body = encodeURIComponent(
`Dear ${inv.clientName},\n\nInvoice: ${inv.number}\nTotal: ${fmt(inv.total)} EGP\nTax: Free · No VAT Applied\n\n${itemLines}\n\nThank you,\nEGYGRILLZ Studio · DR Mohamed Mahdy`
      );
      window.location.href = `mailto:${inv.clientEmail}?subject=${subject}&body=${body}`;
    });
  });
}

function loadInvoiceIntoBuilder(inv) {
  editingInvoiceId = inv.id;editingInvoiceVersion=inv.version;
  document.getElementById('discount-val').value=inv.discount||0;document.getElementById('discount-type').value='egp';
  document.getElementById('inv-number').value = inv.number || '';
  document.getElementById('inv-date').value = inv.date || todayStr();
  document.getElementById('inv-due').value = inv.due || '';
  document.getElementById('inv-status').value = inv.status || 'pending';
  document.getElementById('inv-notes').value = inv.notes || '';
  document.getElementById('deposit-val').value = inv.deposit || 0;

  // Restore client
  if (inv.clientId) {
    const c = clients.find(x => x.id === inv.clientId);
    if (c) selectClient(c);
    else {
      // Fake client from invoice data
      selectedClient = { id: inv.clientId, name: inv.clientName, email: inv.clientEmail, phone: inv.clientPhone };
      document.getElementById('client-search-input').value = inv.clientName || inv.clientId;
    }
  }

  lineItems = (inv.items || []).map(i => ({...i, id: Date.now() + Math.random()}));
  renderItems();

  paymentMethod = inv.paymentMethod || 'Cash';
  document.querySelectorAll('.pmeth-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.method === paymentMethod);
  });

  updatePreview();
  showToast('Invoice loaded for editing · ' + inv.number, 'success');
}

/* ══════════════════════════════════════════════════
   CLIENTS TABLE
══════════════════════════════════════════════════ */
function renderClientsTable(list) {
  const wrap = document.getElementById('clients-table-wrap');
  if (!list.length) {
    wrap.innerHTML = DOMPurify.sanitize('<div class="clients-empty">No clients found</div>'); return;
  }
  wrap.innerHTML = DOMPurify.sanitize(`
    <table class="clients-table">
      <thead>
        <tr>
          <th>Name</th><th>Phone</th><th>Email</th><th>Visits</th><th>Last Visit</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${list.map(c => `
          <tr>
            <td class="client-name-cell">${escHtml(c.name || '—')}</td>
            <td class="client-phone-cell">${escHtml(c.id || '')}</td>
            <td class="client-email-cell">${escHtml(c.email || '—')}</td>
            <td class="client-visits-cell">${Number(c.totalAppointments)||0} visits</td>
            <td class="client-visits-cell">${escHtml(c.lastVisit || '—')}</td>
            <td>
              <button class="client-action-btn" data-client="${escHtml(c.id)}">Invoice</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `);
  wrap.querySelectorAll('[data-client]').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = clients.find(x => x.id === btn.dataset.client);
      if (c) selectClient(c);
      document.querySelectorAll('.tab-btn')[0].click();
      window.scrollTo({top:0, behavior:'smooth'});
      showToast('Client selected — add items to invoice', 'success');
    });
  });
}

function setupClientsTabSearch() {
  document.getElementById('client-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderClientsTable(clients.filter(c =>
      (c.name||'').toLowerCase().includes(q) ||
      (c.id||'').includes(q) ||
      (c.email||'').toLowerCase().includes(q)
    ));
  });
}

/* ══════════════════════════════════════════════════
   ADD CLIENT MODAL
══════════════════════════════════════════════════ */
function setupAddClientModal() {
  const modal = document.getElementById('add-client-modal');
  const open = () => modal.classList.add('open');
  const close = () => modal.classList.remove('open');

  document.getElementById('open-add-client-btn').addEventListener('click', open);
  document.getElementById('open-add-client-btn-2').addEventListener('click', open);
  document.getElementById('close-add-client').addEventListener('click', close);
  document.getElementById('cancel-add-client').addEventListener('click', close);
  modal.addEventListener('click', e => { if(e.target===modal) close(); });

  document.getElementById('save-new-client').addEventListener('click', async () => {
    const name = document.getElementById('nc-name').value.trim();
    const phone = document.getElementById('nc-phone').value.trim();
    const email = document.getElementById('nc-email').value.trim();
    const notes = document.getElementById('nc-notes').value.trim();

    if (!name || !phone) { showToast('Name and phone are required', 'error-toast'); return; }

    const btn = document.getElementById('save-new-client');
    btn.textContent = 'Saving...'; btn.disabled = true;

    try {
      await setDoc(doc(db, 'clients', phone), {
        name, phone, email, notes,
        createdAt: serverTimestamp(),
        firstVisit: todayStr(), lastVisit: todayStr(),
        totalAppointments: 0, totalNoShows: 0, services: []
      });
      showToast('Client saved!', 'success');
      close();
      ['nc-name','nc-phone','nc-email','nc-notes'].forEach(id => document.getElementById(id).value = '');
      await loadClients();
      renderClientsTable(clients);
    } catch(e) {
      showToast('Error: ' + e.message, 'error-toast');
    } finally {
      btn.textContent = 'Save Client'; btn.disabled = false;
    }
  });
}

/* ══════════════════════════════════════════════════
   AUTO-INIT if already authenticated
══════════════════════════════════════════════════ */
let initialized=false;
egyWatchAdmin(async ()=>{
 document.getElementById('lock-screen').style.display='none';document.getElementById('app').style.display='block';
 if(!initialized){initialized=true;try{await initApp();}catch(e){showToast('Could not initialize invoices: '+e.message,'error-toast',10000);}}
},()=>{invoiceCache=[];clients=[];lineItems=[];selectedClient=null;document.getElementById('app').replaceChildren();location.replace('admin.html');});
