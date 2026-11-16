/* ═══════════════════════════════════════════════════════════════════════════
 *  EGYGRILLZ — STAFF CALCULATOR  (one calculator, everywhere)
 *  ---------------------------------------------------------------------------
 *  This is the calculator from /staff-panel-x7k2, extracted verbatim in layout
 *  and logic so that every page (staff panel, /quotes, /invoice, /editx,
 *  /atelier, /x) renders the *same* calculator: same fields, same order, same
 *  spacing, same wording and the same maths.
 *
 *  Numbers always come from window.CalcEngine (Firestore -> settings/pricing).
 *  Nothing here writes settings to localStorage: rates entered by staff are
 *  written to Firestore so every device, page and invoice stays in sync.
 *
 *      <script src="/assets/calc-engine.js"></script>
 *      <script src="/assets/staff-calculator.js"></script>
 *
 *      const calc = StaffCalculator.mount(el, { db, parts:{...} });
 *      StaffCalculator.mountSettings(el, { db });
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const LEVEL_INFO = {
    '0.5': { name: 'Bars', pct: 0, desc: 'Half base. Open bars / windows in the front only, visible teeth behind.', examples: ['Single bar across the front', 'Bars + windows', '3-4 bars with gaps'] },
    '1': { name: 'Solid', pct: 0, desc: 'Fully solid metal, no cuts. One clean metal surface.', examples: ['Plain solid cap / full cover', 'Solid front, plain sides', 'Solid with mirror finish'] },
    '2': { name: 'Open face', pct: 10, desc: 'Solid base with openings cut over the face of the teeth.', examples: ['Window over the front teeth', 'Centre opening + solid sides', 'Solid with an open face section'] },
    '3': { name: 'Mid detail', pct: 15, desc: 'Moderate detail — lettering, simple outlines, a few cuts.', examples: ['Name or lettering', 'Diamond-cut outlines', 'Two-tone with simple line pattern'] },
    '4': { name: 'Complex', pct: 25, desc: 'Dense, intricate detail across most of the piece.', examples: ['Full deep engraving', 'Dense diamond-cut pattern', 'Multi-eyelet / many cuts'] },
    '5': { name: 'Scorpion', pct: 40, desc: 'Heavy 3D detail — sculpted shapes and deep relief.', examples: ['Scorpion or animal shape', '3D logo sculpted in metal', 'Deep relief across all teeth'] },
    '6': { name: 'Ultimate', pct: 60, desc: 'Ultimate custom work — fully sculpted, multi-layer, maximum detail.', examples: ['Full custom sculpture piece', 'Multi-layer 3D with cut-outs', 'Anything beyond heavy detail'] },
  };
  const LEVEL_IMAGES = {
    '0.5': '/levels/LEVEL%200.5.png',
    '1': '/levels/LEVEL%201.png',
    '2': '/levels/LEVEL%202.png',
    '3': '/levels/LEVEL%203.png',
    '4': '/levels/LEVEL%204.png',
    '5': '/levels/LEVEL%205.png',
    '6': '/levels/LEVEL%206.png',
  };

  /* ───────────────────────────── styles ───────────────────────────── */

  const CSS = `
.sc-host{font-family:'Inter','Arimo',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  color:#111827;font-size:13px;line-height:1.45;-webkit-font-smoothing:antialiased;text-align:left;}
.sc-host *{box-sizing:border-box;}
.sc-host p{margin:0;}
.sc-host h3,.sc-host h4{margin:0;}
.sc-stack>*+*{margin-top:16px;}
.sc-stack-sm>*+*{margin-top:10px;}
.sc-note{font-size:10px;color:#9ca3af;line-height:1.5;}
.sc-mut{font-size:10px;color:#6b7280;}
.sc-faint{font-size:10px;color:#9ca3af;}
.sc-strong{font-weight:600;}
.sc-card{border:1px solid #e5e7eb;border-radius:8px;background:#fff;}
.sc-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;
  padding:10px 12px;background:linear-gradient(90deg,#f9fafb,#fff);border-bottom:1px solid #f3f4f6;}
.sc-card-body{padding:12px;}
.sc-lbl{display:block;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;
  letter-spacing:.05em;margin-bottom:4px;}
.sc-lbl-lite{display:block;font-size:10px;color:#6b7280;margin-bottom:4px;}
.sc-lbl span{color:#d1d5db;font-weight:600;}
.sc-req{display:inline;color:#9ca3af;font-weight:600;text-transform:none;letter-spacing:0;}
.sc-input,.sc-select{width:100%;font-family:inherit;font-size:12px;color:#111827;background:#f9fafb;
  border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;outline:none;transition:border-color .15s;appearance:auto;}
.sc-input::placeholder{color:#9ca3af;}
.sc-input:focus,.sc-select:focus{border-color:#9ca3af;}
.sc-input-sm,.sc-select-sm{padding:6px 8px;border-radius:4px;background:#fff;font-size:12px;}
.sc-select:disabled{opacity:.55;cursor:not-allowed;}
.sc-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
.sc-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}
.sc-grid2-sm{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}
.sc-grid3-sm{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}
.sc-row{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.sc-between{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.sc-wrap{display:flex;flex-wrap:wrap;gap:6px;}
.sc-btn{font-family:inherit;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:.05em;
  border-radius:8px;padding:10px 16px;cursor:pointer;border:1px solid #000;background:#000;color:#fff;
  transition:background .15s,color .15s;line-height:1.2;}
.sc-btn:hover{background:#1f2937;border-color:#1f2937;}
.sc-btn-ghost{background:#fff;color:#111827;border-color:#000;}
.sc-btn-ghost:hover{background:#000;color:#fff;border-color:#000;}
.sc-btn-soft{background:#fff;color:#374151;border-color:#d1d5db;}
.sc-btn-soft:hover{background:#f9fafb;color:#111827;}
.sc-btn-sm{padding:6px 10px;font-size:10px;border-radius:6px;}
.sc-btn-block{width:100%;display:block;}
.sc-link{background:none;border:0;padding:0;font-family:inherit;font-size:10px;color:#6b7280;
  text-decoration:underline;cursor:pointer;}
.sc-link:hover{color:#111827;}
.sc-link-danger:hover{color:#ef4444;}
.sc-line{border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;background:#fff;}
.sc-line+.sc-line{margin-top:8px;}
.sc-line-name{font-size:12px;font-weight:500;color:#111827;}
.sc-line-price{font-size:12px;font-weight:600;white-space:nowrap;}
.sc-line-sub{font-size:10px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sc-lines-empty{font-size:10px;color:#9ca3af;border:1px dashed #e5e7eb;border-radius:8px;
  padding:8px 12px;line-height:1.5;}
.sc-badge{font-size:10px;color:#9ca3af;}
.sc-subcard{border:1px solid #e5e7eb;border-radius:8px;padding:12px;space-y:8px;}
.sc-subcard>*+*{margin-top:8px;}
.sc-levelstrip{display:flex;gap:8px;overflow-x:auto;margin-top:8px;padding-bottom:4px;}
.sc-chip{flex:0 0 auto;text-align:left;border:1px solid #e5e7eb;border-radius:8px;
  padding:6px 10px;background:#fff;cursor:pointer;font-family:inherit;transition:border-color .15s,box-shadow .15s;}
.sc-chip:hover{border-color:#9ca3af;}
.sc-chip.on{border-color:#000;box-shadow:inset 0 0 0 1px #000;}
.sc-chip-t{display:block;font-size:11px;font-weight:600;line-height:1.25;}
.sc-chip-s{display:block;font-size:9px;color:#9ca3af;line-height:1.25;}
.sc-guide{display:grid;gap:8px;margin-top:8px;}
.sc-guide-card{border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#fff;}
.sc-guide-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}
.sc-guide-title{font-size:11px;font-weight:600;margin:0;}
.sc-guide-desc{font-size:10px;color:#6b7280;margin:2px 0 0;line-height:1.5;}
.sc-guide-pct{font-size:10px;color:#9ca3af;flex:0 0 auto;}
.sc-examples{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;}
.sc-example{font-size:9px;color:#6b7280;background:#f9fafb;border:1px solid #e5e7eb;
  border-radius:4px;padding:2px 6px;}
.sc-thumb{display:block;width:100%;max-width:220px;border-radius:6px;margin-top:8px;border:1px solid #f3f4f6;}
.sc-result{border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;padding:16px;}
.sc-result pre{font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:12px;
  white-space:pre-wrap;color:#1f2937;margin:0;line-height:1.55;}
.sc-result-actions{display:flex;gap:8px;margin-top:12px;}
.sc-result-actions .sc-btn{flex:1;}
.sc-svc-row{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:6px;align-items:center;
  border:1px solid #e5e7eb;border-radius:4px;padding:8px;background:#f9fafb;}
.sc-svc-row+.sc-svc-row{margin-top:8px;}
.sc-col6{grid-column:span 6;}
.sc-col2{grid-column:span 2;}
.sc-col3{grid-column:span 3;}
.sc-col1{grid-column:span 1;}
.sc-del{font-size:12px;color:#9ca3af;background:none;border:0;cursor:pointer;text-align:center;padding:0;}
.sc-del:hover{color:#ef4444;}
.sc-live{display:flex;align-items:baseline;justify-content:space-between;gap:12px;
  border:1px solid #e5e7eb;border-left:3px solid #000;border-radius:0 8px 8px 0;background:#f9fafb;padding:12px 16px;}
.sc-live-lbl{font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;}
.sc-live-spec{font-size:11px;color:#6b7280;margin-top:2px;}
.sc-live-val{font-size:22px;font-weight:600;letter-spacing:.5px;white-space:nowrap;}
.sc-hidden{display:none !important;}
.sc-rate-wrap{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;padding:16px;}
.sc-rate-mask{position:absolute;inset:0;background:rgba(0,0,0,.32);backdrop-filter:blur(2px);}
.sc-rate-box{position:relative;background:#fff;border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,.28);
  padding:20px;width:100%;max-width:320px;font-family:'Inter','Arimo',sans-serif;color:#111827;}
.sc-rate-box h3{font-size:14px;font-weight:600;margin:0;}
.sc-rate-box p{font-size:11px;color:#9ca3af;margin:4px 0 0;}
.sc-rate-actions{display:flex;gap:8px;margin-top:16px;}
.sc-rate-actions .sc-btn{flex:1;}
.sc-modal-wrap{position:fixed;inset:0;z-index:2147481900;display:flex;align-items:center;justify-content:center;padding:16px;}
.sc-modal-mask{position:absolute;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(3px);}
.sc-modal{position:relative;background:#fff;border-radius:12px;box-shadow:0 30px 80px rgba(0,0,0,.3);
  width:100%;max-width:760px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;}
.sc-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:14px 18px;border-bottom:1px solid #f3f4f6;flex:0 0 auto;}
.sc-modal-head h3{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin:0;}
.sc-modal-body{overflow:auto;padding:16px 18px;flex:1 1 auto;}
.sc-modal-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;
  padding:12px 18px;border-top:1px solid #f3f4f6;background:#fafafa;flex:0 0 auto;}
.sc-close{background:none;border:0;font-size:22px;line-height:1;color:#9ca3af;cursor:pointer;padding:0 4px;}
.sc-close:hover{color:#000;}
/* settings editor */
.sc-set{font-family:'Inter','Arimo',sans-serif;color:#111827;}
.sc-set-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px 28px;}
.sc-set-group{border-top:1px solid #e5e7eb;padding-top:12px;}
.sc-set-group.fail{border-top-color:#fca5a5;}
.sc-set-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.14em;
  color:#6b7280;margin-bottom:10px;}
.sc-set-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px 0;}
.sc-set-name{font-size:12px;color:#374151;}
.sc-set-input{width:116px;padding:7px 9px;border:1px solid #e2e2e2;border-radius:4px;font-family:inherit;
  font-size:12px;text-align:right;color:#1f1f1f;background:#fff;}
.sc-set-input:focus{outline:none;border-color:#111827;}
.sc-set-actions{display:flex;align-items:center;gap:12px;margin-top:14px;padding-top:16px;
  border-top:1px solid #e5e7eb;flex-wrap:wrap;}
.sc-set-note{font-size:11px;color:#6b7280;}
`;

  function injectCss() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('sc-style')) return;
    const st = document.createElement('style');
    st.id = 'sc-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ───────────────────────────── helpers ───────────────────────────── */

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US');
  const number = (n) => Number(n) || 0;
  const engine = () => global.CalcEngine;
  const labels = () => (engine() ? engine().LABELS : {});
  const cfg = () => (engine() ? engine().get() : {});

  function fmtOption(text, value, suffix) {
    const base = String(text || '').replace(/\s*\([^)]*\)\s*$/, '');
    if (value === undefined || value === null) return base;
    if (String(value) === '0' && !suffix) return base + ' (0)';
    return base + ' (' + value + (suffix || '') + ')';
  }
  function optionsHtml(map, current, suffix, allowZero) {
    return Object.keys(map).map((k) => {
      const v = map[k];
      const label = (k === 'none' ? 'None' : fmtOption((labels().plating || {})[k] || (labels().enamel || {})[k] || (labels().engraving || {})[k] || (labels().anodize || {})[k] || (labels().setting || {})[k] || (labels().coverage || {})[k] || k, v, suffix));
      return `<option value="${esc(k)}"${String(k) === String(current) ? ' selected' : ''}>${esc(label)}</option>`;
    }).join('');
  }

  let seq = 0;
  const uid = () => 'sc' + (++seq) + '_' + Math.random().toString(36).slice(2, 6);

  /* ══════════════════════════════ MOUNT ══════════════════════════════ */

  function mount(host, options) {
    if (!host) throw new Error('StaffCalculator.mount: host element required');
    if (!engine()) throw new Error('StaffCalculator: calc-engine.js must load first');
    injectCss();

    const o = Object.assign({
      db: null,
      designMode: false,
      parts: null,          // { lines, editor, services, order, result }
      title: '',
      note: 'Deterministic — follows the pricing spec exactly, every time. Use this for the number you actually quote.',
      applyLabel: 'Add to Invoice',
      addLineLabel: '+ Add design line to quote',
      showApply: false,
      showPdf: false,
      showIntake: false,
      autoCalculate: false,
      designName: '',
      onChange: null,
      onApply: null,
      onCalculate: null,
      initialLines: [],
      initialServices: [],
    }, options || {});

    const parts = Object.assign({
      lines: true, editor: true, services: true, order: true, result: true,
    }, o.parts || (o.designMode ? { lines: false, services: false, order: false, result: false } : {}));

    const id = uid();
    const el = (name) => host.querySelector('[data-sc="' + name + '"]');
    const S = {
      lines: Array.isArray(o.initialLines) ? o.initialLines.map((l) => Object.assign({}, l)) : [],
      services: Array.isArray(o.initialServices) ? o.initialServices.map((s) => Object.assign({}, s)) : [],
      editingId: null,
      lastQuote: null,
      rateKind: null,
    };

    host.innerHTML = renderShell();
    host.classList.add('sc-host');

    wire();
    syncVisibility();
    renderLevelStrip();
    renderLines();
    renderServices();
    syncLive();
    if (o.autoCalculate) calculate();

    const api = {
      host,
      el,
      getLines: () => S.lines.map((l) => Object.assign({}, l)),
      setLines: (lines) => { S.lines = Array.isArray(lines) ? lines.map((l) => Object.assign({}, l)) : []; S.editingId = null; renderLines(); setEditorMode('add'); },
      getServices: () => S.services.map((s) => Object.assign({}, s)),
      setServices: (svc) => { S.services = Array.isArray(svc) ? svc.map((s) => Object.assign({}, s)) : []; renderServices(); },
      getOrder: () => S.lastQuote,
      getResultText: () => (el('resultText') ? el('resultText').innerText : ''),
      getLastQuote: () => S.lastQuote,
      lineLabel: (line) => lineLabel(line),
      lineSubLabel: (line) => lineSubLabel(line),
      setField: (name, value) => {
        const node = el(name);
        if (!node) return;
        try {
          if (node.options && !Array.from(node.options).some((o) => o.value === String(value))) return;
        } catch (e) { /* not a select */ }
        node.value = value;
        syncVisibility();
        renderLevelStrip();
        syncLive();
      },
      getField: (name) => { const node = el(name); return node ? node.value : ''; },
      loadLine: (line, name) => {
        writeEditor(Object.assign({}, line || {}, { name: name !== undefined ? name : (line && line.name) || '' }));
        syncVisibility(); renderLevelStrip(); syncLive();
      },
      readLine: () => readEditor(),
      refresh: () => { syncVisibility(); renderLevelStrip(); renderLines(); renderServices(); syncLive(); },
      calculate,
      apply: apply,
      reset: () => {
        S.lines = []; S.services = []; S.editingId = null;
        renderLines(); renderServices(); setEditorMode('add');
        const r = el('result'); if (r) r.classList.add('sc-hidden');
        S.lastQuote = null; syncLive();
      },
      destroy: () => { host.innerHTML = ''; host.classList.remove('sc-host'); },
    };

    /* ───────────────────────── markup ───────────────────────── */

    function renderShell() {
      const head = o.title
        ? `<div class="sc-between"><div>
             <h3 style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em">${esc(o.title)}</h3>
             ${o.note ? `<p class="sc-note" style="margin-top:2px">${esc(o.note)}</p>` : ''}
           </div></div>`
        : (o.note ? `<p class="sc-note">${esc(o.note)}</p>` : '');

      return `
      ${head}
      <div class="sc-stack" style="margin-top:${head ? '12' : '0'}px">

        ${parts.lines ? `
        <div data-sc="linesWrap">
          <div class="sc-between" style="margin-bottom:6px">
            <label class="sc-lbl" style="margin:0">Design lines <span class="sc-req">(multiple designs in one quote)</span></label>
            <span style="display:flex;align-items:center;gap:8px;flex-shrink:0">
              <span class="sc-badge" data-sc="lineBadge"></span>
              <button type="button" class="sc-link sc-link-danger" data-sc="clearLines">Clear all</button>
            </span>
          </div>
          <div data-sc="linesList"></div>
          <div class="sc-lines-empty" data-sc="linesEmpty">
            No lines yet. Fill the line editor below and press “Add design line” for each design in the set — or just press “Calculate Exact Quote” to quote a single design.
          </div>
        </div>` : ''}

        ${parts.editor ? `
        <div class="sc-card" data-sc="lineEditor" style="padding:12px">
          <div class="sc-stack-sm">
            <div class="sc-between">
              <span class="sc-lbl" style="margin:0" data-sc="editorTitle">Line editor</span>
              <button type="button" class="sc-link sc-hidden" data-sc="cancelEdit">Cancel edit</button>
            </div>

            <div>
              <label class="sc-lbl">Design name <span class="sc-req">(optional — appears on the quote &amp; PDF)</span></label>
              <input type="text" class="sc-input" data-sc="name" maxlength="40" placeholder="e.g. Top grillz — Ahmed · Bottom bars · Left fang">
            </div>

            <div class="sc-grid2">
              <div>
                <label class="sc-lbl">Material</label>
                <select class="sc-select" data-sc="material">
                  <option value="chrome">Cobalt Chrome</option>
                  <option value="titanium">Titanium</option>
                  <option value="silver">Sterling Silver 925</option>
                  <option value="gold">Gold</option>
                </select>
              </div>
              <div>
                <label class="sc-lbl">Teeth (1–16)</label>
                <input type="number" class="sc-input" data-sc="teeth" min="1" max="16" value="6">
              </div>
            </div>

            <div class="sc-grid2 sc-hidden" data-sc="goldWrap">
              <div>
                <label class="sc-lbl">Karat</label>
                <select class="sc-select" data-sc="karat">
                  <option value="10">10K</option>
                  <option value="14">14K</option>
                  <option value="18" selected>18K</option>
                  <option value="21">21K</option>
                  <option value="22">22K</option>
                </select>
              </div>
              <div>
                <label class="sc-lbl">Today's Gold EGP/g</label>
                <input type="number" class="sc-input" data-sc="goldPrice" placeholder="Type today's rate here">
              </div>
              <div class="sc-faint" style="grid-column:span 2">Loaded from the studio rates and saved to the database for every device. You can still edit it here.</div>
            </div>

            <div>
              <label class="sc-lbl">Design Level</label>
              <select class="sc-select" data-sc="level">
                <option value="0.5">0.5 — Bars (half base, no design %)</option>
                <option value="1" selected>1 — Solid (+0%)</option>
                <option value="2">2 — Open face (+10%)</option>
                <option value="3">3 — Mid detail (+15%)</option>
                <option value="4">4 — Complex (+25%)</option>
                <option value="5">5 — Scorpion / heavy detail (+40%)</option>
                <option value="6">6 — Ultimate (+60%)</option>
              </select>
              <div class="sc-levelstrip" data-sc="levelStrip"></div>
              <button type="button" class="sc-link" style="margin-top:4px" data-sc="toggleGuide">Level guide &amp; examples</button>
              <div class="sc-guide sc-hidden" data-sc="levelGuide"></div>
            </div>

            <div>
              <label class="sc-lbl">Stones</label>
              <select class="sc-select" data-sc="stones">
                <option value="none">None</option>
                <option value="accent">Accent (per stone)</option>
                <option value="fulliced">Full iced (per tooth)</option>
              </select>
              <p class="sc-faint sc-hidden" style="margin-top:4px" data-sc="noStonesNote">Chrome and Titanium don't take stones.</p>
            </div>

            <div class="sc-subcard sc-hidden" data-sc="accentWrap">
              <div class="sc-grid3-sm">
                <div>
                  <label class="sc-lbl-lite">Count</label>
                  <input type="number" class="sc-input sc-input-sm" data-sc="accentCount" min="1" value="1">
                </div>
                <div>
                  <label class="sc-lbl-lite">Type</label>
                  <select class="sc-select sc-select-sm" data-sc="accentType">
                    <option value="cz">CZ</option>
                    <option value="moissanite">Moissanite</option>
                    <option value="labgrown">Lab-Grown</option>
                    <option value="natural">Natural</option>
                  </select>
                </div>
                <div>
                  <label class="sc-lbl-lite">Setting</label>
                  <select class="sc-select sc-select-sm" data-sc="accentSetting"></select>
                </div>
              </div>
              <div class="sc-hidden" data-sc="accentCustomWrap">
                <label class="sc-lbl-lite">Today's stone price (EGP/stone)</label>
                <input type="number" class="sc-input sc-input-sm" data-sc="accentCustom" placeholder="Type today's rate">
                <p class="sc-faint" style="margin-top:4px">Asked once and saved to the database for every device.</p>
              </div>
            </div>

            <div class="sc-subcard sc-hidden" data-sc="fullWrap">
              <div class="sc-mut sc-hidden" data-sc="fullBarsNote">Level 0.5 Bars + full iced uses a fixed 400 EGP/tooth — no type/coverage needed.</div>
              <div class="sc-grid2-sm" data-sc="fullFields">
                <div>
                  <label class="sc-lbl-lite">Type</label>
                  <select class="sc-select sc-select-sm" data-sc="fullType">
                    <option value="cz">CZ</option>
                    <option value="moissanite">Moissanite</option>
                    <option value="labgrown">Lab-Grown</option>
                    <option value="natural">Natural</option>
                  </select>
                </div>
                <div>
                  <label class="sc-lbl-lite">Coverage</label>
                  <select class="sc-select sc-select-sm" data-sc="coverage"></select>
                </div>
              </div>
              <div class="sc-hidden" data-sc="fullCustomWrap">
                <label class="sc-lbl-lite">Today's stone price (EGP/tooth)</label>
                <input type="number" class="sc-input sc-input-sm" data-sc="fullCustom" placeholder="Type today's rate">
                <p class="sc-faint" style="margin-top:4px">Asked once and saved to the database for every device.</p>
              </div>
            </div>

            <div class="sc-grid3">
              <div>
                <label class="sc-lbl">Plating</label>
                <select class="sc-select" data-sc="plating"></select>
              </div>
              <div>
                <label class="sc-lbl">Enamel</label>
                <select class="sc-select" data-sc="enamel"></select>
              </div>
              <div>
                <label class="sc-lbl">Engraving</label>
                <select class="sc-select" data-sc="engraving"></select>
              </div>
            </div>

            <div class="sc-hidden" data-sc="anodizeWrap">
              <label class="sc-lbl">Titanium Anodizing (per tooth)</label>
              <select class="sc-select" data-sc="anodize"></select>
            </div>

            ${o.designMode ? `
            <div class="sc-live">
              <div>
                <div class="sc-live-lbl">Calculated line total</div>
                <div class="sc-live-spec" data-sc="liveSpec">—</div>
              </div>
              <div class="sc-live-val" data-sc="liveVal">0 EGP</div>
            </div>
            ${o.showApply === false ? '' : `<div class="sc-row" style="gap:8px">
              <button type="button" class="sc-btn sc-btn-ghost sc-btn-block" data-sc="applyBtn">${esc(o.applyLabel)}</button>
            </div>`}` : `
            <button type="button" class="sc-btn sc-btn-ghost sc-btn-block" data-sc="addLine">${esc(o.addLineLabel)}</button>`}
          </div>
        </div>` : ''}

        ${parts.services ? `
        <div class="sc-card" style="padding:12px">
          <div class="sc-stack-sm">
            <div class="sc-between">
              <label class="sc-lbl" style="margin:0">Studio services <span class="sc-req">(optional)</span></label>
              <button type="button" class="sc-link" data-sc="addService">+ Add service</button>
            </div>
            <div class="sc-wrap">
              <button type="button" class="sc-btn sc-btn-soft sc-btn-sm" data-sc="quickSvc" data-svc="impression">+ Impression</button>
              <button type="button" class="sc-btn sc-btn-soft sc-btn-sm" data-sc="quickSvc" data-svc="consultation">+ Consultation</button>
              <button type="button" class="sc-btn sc-btn-soft sc-btn-sm" data-sc="quickSvc" data-svc="toothgem">+ Toothgem</button>
              <button type="button" class="sc-btn sc-btn-soft sc-btn-sm" data-sc="quickSvc" data-svc="polishing">+ Clean &amp; Polish</button>
            </div>
            <div data-sc="servicesList"></div>
            <div class="sc-faint" data-sc="servicesEmpty">No extra studio services added.</div>
          </div>
        </div>` : ''}

        ${parts.order ? `
        <div>
          <label class="sc-lbl" style="margin-bottom:6px">Order settings (whole quote)</label>
          <div class="sc-grid3">
            <div data-sc="timelineWrap">
              <label class="sc-lbl-lite">Timeline</label>
              <select class="sc-select" data-sc="timeline">
                <option value="standard">Standard (+0%)</option>
                <option value="rush">Rush (+25%)</option>
                <option value="emergency">Emergency (+50%)</option>
              </select>
            </div>
            <div data-sc="moldWrap">
              <label class="sc-lbl-lite">Mold</label>
              <select class="sc-select" data-sc="mold">
                <option value="none">None</option>
                <option value="normalperarch">Normal, per arch (200)</option>
                <option value="digitalfullmouth">Digital full mouth (1500)</option>
              </select>
            </div>
            <div data-sc="depositWrap">
              <label class="sc-lbl-lite">Deposit (shown on PDF)</label>
              <select class="sc-select" data-sc="deposit">
                <option value="0">Not shown</option>
                <option value="25">25%</option>
                <option value="50">50%</option>
                <option value="100">100%</option>
              </select>
            </div>
          </div>
        </div>` : ''}

        ${parts.result ? `
        <button type="button" class="sc-btn sc-btn-block" data-sc="calculate">Calculate Exact Quote</button>
        <div class="sc-result sc-hidden" data-sc="result">
          <pre data-sc="resultText"></pre>
          ${o.showPdf ? `
          <div style="margin-top:12px">
            <label class="sc-lbl">Client name (for PDF, optional)</label>
            <input type="text" class="sc-input" style="background:#fff" data-sc="clientName" placeholder="e.g. Ahmed Mostafa">
          </div>
          <div style="margin-top:12px">
            <label class="sc-lbl">Notes for the client (printed on the PDF, optional)</label>
            <textarea class="sc-input" style="background:#fff;resize:none" data-sc="clientNotes" rows="2" placeholder="e.g. Deposit confirms the order · fitting appointment 5 PM Thursday"></textarea>
          </div>` : ''}
          <div class="sc-result-actions">
            <button type="button" class="sc-btn sc-btn-soft" data-sc="copyResult">Copy</button>
            ${o.showResultApply ? `<button type="button" class="sc-btn" data-sc="resultApply">${esc(o.applyLabel)}</button>` : ''}
          </div>
        </div>` : ''}
      </div>`;
    }

    /* ───────────────────── sync option labels w/ DB ───────────────────── */

    function refreshOptions() {
      const c = cfg();
      const L = labels();
      const setOpts = (node, map, suffix) => {
        if (!node || !map) return;
        const current = node.value;
        node.innerHTML = Object.keys(map).map((k) => {
          const v = map[k];
          const base = k === 'none' ? 'None'
            : (L.setting && L.setting[k]) || (L.coverage && L.coverage[k]) || (L.plating && L.plating[k]) ||
              (L.enamel && L.enamel[k]) || (L.engraving && L.engraving[k]) || (L.anodize && L.anodize[k]) || k;
          const label = k === 'none' ? 'None' : base + ' (' + v + (suffix || '') + ')';
          return `<option value="${esc(k)}">${esc(label)}</option>`;
        }).join('');
        node.value = current;
      };
      setOpts(el('plating'), c.plating);
      setOpts(el('enamel'), c.enamel);
      setOpts(el('engraving'), c.engraving);
      setOpts(el('anodize'), c.anodize);
      setOpts(el('accentSetting'), c.settingPrice);
      setOpts(el('coverage'), c.coveragePrice);

      const tl = el('timeline');
      if (tl) {
        const cur = tl.value;
        tl.innerHTML = Object.keys(c.timelinePct || {}).map((k) =>
          `<option value="${esc(k)}">${esc((L.timeline && L.timeline[k]) || k)} (+${c.timelinePct[k]}%)</option>`).join('');
        tl.value = cur || 'standard';
      }
      const mold = el('mold');
      if (mold) {
        const cur = mold.value;
        mold.innerHTML = Object.keys(c.moldFlat || {}).map((k) =>
          `<option value="${esc(k)}">${k === 'none' ? 'None' : esc(((L.mold && L.mold[k]) || k) + ' (' + c.moldFlat[k] + ')')}</option>`).join('');
        mold.value = cur || 'none';
      }
    }

    /* ───────────────────────── wiring ───────────────────────── */

    function wire() {
      refreshOptions();

      if (el('material')) el('material').addEventListener('change', () => { onMaterialChange(true); syncLive(); });
      if (el('teeth')) el('teeth').addEventListener('input', syncLive);
      if (el('level')) el('level').addEventListener('change', () => { renderLevelStrip(); onStonesChange(); syncLive(); });
      if (el('stones')) el('stones').addEventListener('change', () => { onStonesChange(); syncLive(); });
      if (el('accentType')) el('accentType').addEventListener('change', () => { onAccentTypeChange(true); syncLive(); });
      if (el('accentCount')) el('accentCount').addEventListener('input', syncLive);
      if (el('accentSetting')) el('accentSetting').addEventListener('change', syncLive);
      if (el('accentCustom')) el('accentCustom').addEventListener('input', syncLive);
      if (el('fullType')) el('fullType').addEventListener('change', () => { onFullTypeChange(true); syncLive(); });
      if (el('coverage')) el('coverage').addEventListener('change', syncLive);
      if (el('fullCustom')) el('fullCustom').addEventListener('input', syncLive);
      ['plating', 'enamel', 'engraving', 'anodize', 'karat'].forEach((k) => {
        if (el(k)) el(k).addEventListener('change', syncLive);
      });
      if (el('goldPrice')) el('goldPrice').addEventListener('input', syncLive);
      if (el('name')) el('name').addEventListener('input', syncLive);

      if (el('toggleGuide')) el('toggleGuide').addEventListener('click', toggleGuide);
      if (el('addLine')) el('addLine').addEventListener('click', addLine);
      if (el('cancelEdit')) el('cancelEdit').addEventListener('click', () => { S.editingId = null; setEditorMode('add'); });
      if (el('clearLines')) el('clearLines').addEventListener('click', clearLines);
      if (el('addService')) el('addService').addEventListener('click', () => addService());
      host.querySelectorAll('[data-sc="quickSvc"]').forEach((b) => {
        b.addEventListener('click', () => addService(b.getAttribute('data-svc')));
      });
      if (el('calculate')) el('calculate').addEventListener('click', calculate);
      if (el('copyResult')) el('copyResult').addEventListener('click', copyResult);
      if (el('resultApply')) el('resultApply').addEventListener('click', apply);
      if (el('applyBtn')) el('applyBtn').addEventListener('click', apply);
      if (el('rateSave')) el('rateSave').addEventListener('click', saveRate);
      if (el('rateCancel')) el('rateCancel').addEventListener('click', closeRate);
      if (el('rateMask')) el('rateMask').addEventListener('click', closeRate);
    }

    /* ───────────────────────── visibility ───────────────────────── */

    function syncVisibility() {
      const material = el('material') ? el('material').value : 'chrome';
      const isGold = material === 'gold';
      const isTi = material === 'titanium';
      if (el('goldWrap')) el('goldWrap').classList.toggle('sc-hidden', !isGold);
      if (el('anodizeWrap')) el('anodizeWrap').classList.toggle('sc-hidden', !isTi);

      const stones = el('stones');
      const noStones = material === 'chrome' || material === 'titanium';
      if (el('noStonesNote')) el('noStonesNote').classList.toggle('sc-hidden', !noStones);
      if (stones) {
        if (noStones) { stones.value = 'none'; stones.disabled = true; }
        else stones.disabled = false;
      }
      onStonesChange();
      if (isGold) autoFillGoldPrice();
    }

    function onMaterialChange(user) {
      syncVisibility();
      if (user === true && el('material').value === 'gold' && !getRate('gold')) askRate('gold');
    }

    function onStonesChange() {
      const mode = el('stones') ? el('stones').value : 'none';
      if (el('accentWrap')) el('accentWrap').classList.toggle('sc-hidden', mode !== 'accent');
      if (el('fullWrap')) el('fullWrap').classList.toggle('sc-hidden', mode !== 'fulliced');
      if (mode === 'accent') autoFillStone('accent');
      if (mode === 'fulliced') {
        const isBars = el('level') && el('level').value === '0.5';
        if (el('fullBarsNote')) el('fullBarsNote').classList.toggle('sc-hidden', !isBars);
        if (el('fullFields')) el('fullFields').classList.toggle('sc-hidden', !!isBars);
        if (!isBars) autoFillStone('full');
      }
    }

    function onAccentTypeChange(user) {
      const type = el('accentType').value;
      if (el('accentCustomWrap')) el('accentCustomWrap').classList.toggle('sc-hidden', !(type === 'labgrown' || type === 'natural'));
      autoFillStone('accent');
      if (user === true && (type === 'labgrown' || type === 'natural')) {
        const k = type === 'labgrown' ? 'labAccent' : 'natAccent';
        if (!getRate(k)) askRate(k);
      }
    }

    function onFullTypeChange(user) {
      const type = el('fullType').value;
      if (el('fullCustomWrap')) el('fullCustomWrap').classList.toggle('sc-hidden', !(type === 'labgrown' || type === 'natural'));
      autoFillStone('full');
      if (user === true && (type === 'labgrown' || type === 'natural')) {
        const k = type === 'labgrown' ? 'labFull' : 'natFull';
        if (!getRate(k)) askRate(k);
      }
    }

    /* ───────────────────────── rates (database) ───────────────────────── */

    const RATE_META = {
      gold: { t: "Today's gold rate", h: 'EGP per gram', key: 'goldPrice' },
      labAccent: { t: "Today's lab-grown stone rate", h: 'EGP per stone', key: 'accentPrice.labgrown' },
      natAccent: { t: "Today's natural stone rate", h: 'EGP per stone', key: 'accentPrice.natural' },
      labFull: { t: "Today's lab-grown rate, full iced", h: 'EGP per tooth', key: 'fullPrice.labgrown' },
      natFull: { t: "Today's natural rate, full iced", h: 'EGP per tooth', key: 'fullPrice.natural' },
    };

    function getRate(kind) {
      const c = cfg();
      if (kind === 'gold') return number(c.goldPrice);
      const [map, k] = RATE_META[kind].key.split('.');
      return number((c[map] || {})[k]);
    }

    function autoFillGoldPrice() {
      if (!el('goldPrice')) return;
      const r = getRate('gold');
      if (!el('goldPrice').value && r) el('goldPrice').value = r;
    }

    function autoFillStone(which) {
      if (which === 'accent') {
        const type = el('accentType').value;
        const node = el('accentCustom');
        if (!node || node.value) return;
        const r = getRate(type === 'labgrown' ? 'labAccent' : type === 'natural' ? 'natAccent' : 'gold');
        if ((type === 'labgrown' || type === 'natural') && r) node.value = r;
      }
      if (which === 'full') {
        const type = el('fullType').value;
        const node = el('fullCustom');
        if (!node || node.value) return;
        const r = getRate(type === 'labgrown' ? 'labFull' : type === 'natural' ? 'natFull' : 'gold');
        if ((type === 'labgrown' || type === 'natural') && r) node.value = r;
      }
    }

    function askRate(kind) {
      S.rateKind = kind;
      const meta = RATE_META[kind];
      let box = host.querySelector('[data-sc="rateWrap"]');
      if (!box) {
        box = document.createElement('div');
        box.className = 'sc-rate-wrap sc-hidden';
        box.setAttribute('data-sc', 'rateWrap');
        box.innerHTML = `
          <div class="sc-rate-mask" data-sc="rateMask"></div>
          <div class="sc-rate-box">
            <h3 data-sc="rateTitle"></h3>
            <p data-sc="rateHint"></p>
            <input type="number" class="sc-input" style="margin-top:12px" data-sc="rateInput" inputmode="decimal" placeholder="0">
            <div class="sc-rate-actions">
              <button type="button" class="sc-btn sc-btn-ghost" data-sc="rateCancel">Cancel</button>
              <button type="button" class="sc-btn" data-sc="rateSave">Save</button>
            </div>
          </div>`;
        document.body.appendChild(box);
        box.querySelector('[data-sc="rateMask"]').addEventListener('click', closeRate);
        box.querySelector('[data-sc="rateCancel"]').addEventListener('click', closeRate);
        box.querySelector('[data-sc="rateSave"]').addEventListener('click', saveRate);
        box.querySelector('[data-sc="rateInput"]').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveRate(); });
      }
      box.querySelector('[data-sc="rateTitle"]').textContent = meta.t;
      box.querySelector('[data-sc="rateHint"]').textContent = o.db
        ? meta.h + ' — saved to the database for every device.'
        : meta.h + ' — the studio rate is used on every page.';
      box.querySelector('[data-sc="rateInput"]').value = getRate(kind) || '';
      box.classList.remove('sc-hidden');
      setTimeout(() => box.querySelector('[data-sc="rateInput"]').focus(), 60);
    }

    function closeRate() {
      const box = host.querySelector('[data-sc="rateWrap"]');
      if (box) box.classList.add('sc-hidden');
    }

    function saveRate() {
      const box = host.querySelector('[data-sc="rateWrap"]');
      const v = parseFloat(box.querySelector('[data-sc="rateInput"]').value);
      if (!v || v <= 0) { notify('Enter a valid rate', true); return; }
      const kind = S.rateKind;
      const c = cfg();
      const patch = {};
      if (kind === 'gold') {
        patch.goldPrice = v;
      } else {
        const [map, k] = RATE_META[kind].key.split('.');
        patch[map] = Object.assign({}, c[map] || {}, { [k]: v });
      }
      engine().set(patch);
      if (el('goldPrice') && kind === 'gold') el('goldPrice').value = v;
      if (el('accentCustom') && kind === 'labAccent' || kind === 'natAccent') { if (el('accentCustom')) el('accentCustom').value = v; }
      if (el('fullCustom') && (kind === 'labFull' || kind === 'natFull')) el('fullCustom').value = v;
      S.lines.forEach((l) => Object.assign(l, engine().calculateLine(l)));
      renderLines();
      persist(patch);
      closeRate();
      syncLive();
      notify('Rate saved to the database');
    }

    async function persist(patch) {
      if (!o.db) return;
      try {
        await engine().save(o.db);
      } catch (e) {
        notify('Could not save the rate: ' + (e.message || e), true);
      }
    }

    function notify(msg, isErr) {
      if (typeof global.showToast === 'function') { try { global.showToast(msg, isErr); return; } catch (e) {} }
      if (typeof global.toast === 'function') { try { global.toast(msg, isErr); return; } catch (e) {} }
      const n = host.querySelector('[data-sc="notice"]');
      if (n) { n.textContent = msg; n.style.color = isErr ? '#ef4444' : '#111827'; setTimeout(() => { if (n.textContent === msg) n.textContent = ''; }, 2600); }
    }

    function showNoticeSlot() {
      if (host.querySelector('[data-sc="notice"]')) return;
      const slot = document.createElement('div');
      slot.className = 'sc-faint';
      slot.setAttribute('data-sc', 'notice');
      slot.style.minHeight = '14px';
      slot.style.marginTop = '6px';
      host.appendChild(slot);
    }
    showNoticeSlot();

    /* ───────────────────── editor ⇄ line ───────────────────── */

    function readEditor() {
      const c = cfg();
      const material = el('material').value;
      const teeth = parseInt(el('teeth').value, 10);
      const level = el('level').value;
      const stones = material === 'chrome' || material === 'titanium' ? 'none' : el('stones').value;
      const spec = {
        name: (el('name').value || '').trim().slice(0, 40),
        material,
        teeth,
        level,
        plating: el('plating').value,
        enamel: el('enamel').value,
        engraving: el('engraving').value,
        anodize: material === 'titanium' ? el('anodize').value : 'none',
      };
      if (!teeth || teeth < 1 || teeth > 16) return { error: 'Teeth must be between 1 and 16' };
      if (material === 'gold') {
        spec.karat = el('karat').value;
        const gp = parseFloat(el('goldPrice').value);
        if (!gp || gp <= 0) return { needRates: 'GOLD', error: "Enter today's gold EGP/g for the gold line" };
        spec.goldPrice = gp;
      }
      if (stones === 'accent') {
        const count = parseInt(el('accentCount').value, 10) || 0;
        if (count < 1) return { error: 'Accent stones: count must be at least 1' };
        const type = el('accentType').value;
        const setting = el('accentSetting').value;
        let price = (c.accentPrice || {})[type];
        if (price === null || price === undefined) {
          price = parseFloat(el('accentCustom').value);
          if (price === null || isNaN(price) || price < 0) return { needRates: 'LAB_ACCENT', error: "Enter today's rate for Lab-Grown/Natural accent stones" };
        }
        spec.accent = { count, type, setting, price, customPrice: price };
      } else if (stones === 'fulliced') {
        if (level === '0.5') {
          spec.full = { bars: true };
        } else {
          const type = el('fullType').value;
          const coverage = el('coverage').value;
          let price = (c.fullPrice || {})[type];
          if (price === null || price === undefined) {
            price = parseFloat(el('fullCustom').value);
            if (isNaN(price) || price < 0) return { needRates: 'LAB_FULL', error: "Enter today's rate for Lab-Grown/Natural full-iced stones" };
          }
          spec.full = { type, coverage, price, customPrice: price };
        }
      }
      return { line: spec };
    }

    function buildLine() {
      const r = readEditor();
      if (r.error) {
        notify(r.error, true);
        if (r.needRates === 'GOLD') askRate('gold');
        if (r.needRates === 'LAB_ACCENT') askRate(el('accentType').value === 'natural' ? 'natAccent' : 'labAccent');
        if (r.needRates === 'LAB_FULL') askRate(el('fullType').value === 'natural' ? 'natFull' : 'labFull');
        return null;
      }
      return engine().calculateLine(r.line);
    }

    function writeEditor(line) {
      el('name').value = line.name || '';
      el('material').value = line.material || 'chrome';
      syncVisibility();
      el('teeth').value = line.teeth || 6;
      el('level').value = String(line.level || '1');
      if (line.material === 'gold') {
        el('karat').value = String(line.karat || '18');
        el('goldPrice').value = line.goldPrice || getRate('gold') || '';
      }
      const mode = line.accent ? 'accent' : (line.full && line.full.bars ? 'fulliced' : (line.full ? 'fulliced' : 'none'));
      el('stones').value = mode;
      onStonesChange();
      if (line.accent) {
        el('accentCount').value = line.accent.count || 1;
        el('accentType').value = line.accent.type || 'cz';
        onAccentTypeChange();
        el('accentSetting').value = line.accent.setting || 'flush';
        if ((cfg().accentPrice || {})[line.accent.type] === null && line.accent.price) el('accentCustom').value = line.accent.price;
      }
      if (line.full && !line.full.bars) {
        el('fullType').value = line.full.type || 'moissanite';
        onFullTypeChange();
        el('coverage').value = line.full.coverage || 'standardpave';
        if ((cfg().fullPrice || {})[line.full.type] === null && line.full.price) el('fullCustom').value = line.full.price;
      }
      el('plating').value = line.plating || 'none';
      el('enamel').value = line.enamel || 'none';
      el('engraving').value = line.engraving || 'none';
      el('anodize').value = line.anodize || 'none';
      renderLevelStrip();
    }

    function syncLive() {
      if (!o.designMode) return;
      const r = readEditor();
      const spec = el('liveSpec');
      const val = el('liveVal');
      if (!spec || !val) return;
      if (r.error) { spec.textContent = r.error; val.textContent = '—'; return; }
      const line = engine().calculateLine(r.line);
      spec.textContent = lineLabel(line);
      val.textContent = money(line.subtotal) + ' EGP';
    }

    /* ───────────────────── lines list ───────────────────── */

    function lineLabel(line) {
      const L = labels();
      const mat = line.material === 'gold' ? 'Gold ' + (line.karat || '18') + 'K' : ((L.material || {})[line.material] || line.material);
      const core = mat + ' · ' + line.teeth + ' teeth · ' + ((L.level || {})[line.level] || line.level);
      const name = (line.name || '').trim();
      return name ? name + ' — ' + core : core;
    }

    function lineSubLabel(line) {
      const L = labels();
      const bits = [];
      if (line.accent) bits.push(line.accent.count + '× ' + ((L.accentType || {})[line.accent.type] || '') + ' ' + ((L.setting || {})[line.accent.setting] || ''));
      if (line.full && line.full.bars) bits.push('Full iced (Bars @' + ((cfg().barsStonesPerTooth) || 400) + ')');
      else if (line.full) bits.push('Full iced ' + ((L.accentType || {})[line.full.type] || '') + ' ' + ((L.coverage || {})[line.full.coverage] || ''));
      if (line.plating && line.plating !== 'none') bits.push((L.plating || {})[line.plating]);
      if (line.enamel && line.enamel !== 'none') bits.push('Enamel ' + (L.enamel || {})[line.enamel]);
      if (line.engraving && line.engraving !== 'none') bits.push('Engraving ' + (L.engraving || {})[line.engraving]);
      if (line.anodize && line.anodize !== 'none' && line.material === 'titanium') bits.push('Anodize ' + (L.anodize || {})[line.anodize]);
      return bits.filter(Boolean).length ? bits.filter(Boolean).join(' · ') : 'Base only';
    }

    function renderLines() {
      if (!parts.lines) return;
      const list = el('linesList');
      const empty = el('linesEmpty');
      const badge = el('lineBadge');
      if (!list || !empty) return;
      badge.textContent = S.lines.length ? S.lines.length + ' line' + (S.lines.length > 1 ? 's' : '') : '';
      empty.classList.toggle('sc-hidden', S.lines.length > 0);
      list.innerHTML = S.lines.map((line, i) => `
        <div class="sc-line">
          <div class="sc-between">
            <span class="sc-line-name">${esc(lineLabel(line))}</span>
            <span class="sc-line-price">${esc(money(line.subtotal))} EGP</span>
          </div>
          <div class="sc-between" style="margin-top:2px">
            <span class="sc-line-sub">${esc(lineSubLabel(line))}</span>
            <span style="display:flex;gap:6px;flex-shrink:0">
              <button type="button" class="sc-link" data-edit="${i}">Edit</button>
              <button type="button" class="sc-link sc-link-danger" data-del="${i}">Remove</button>
            </span>
          </div>
        </div>`).join('');
      list.querySelectorAll('[data-edit]').forEach((b) => {
        b.addEventListener('click', () => {
          const idx = Number(b.getAttribute('data-edit'));
          S.editingId = idx;
          writeEditor(S.lines[idx]);
          setEditorMode('edit');
          const ed = el('lineEditor');
          if (ed && ed.scrollIntoView) ed.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      });
      list.querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', () => {
          const idx = Number(b.getAttribute('data-del'));
          S.lines.splice(idx, 1);
          if (S.editingId === idx) { S.editingId = null; setEditorMode('add'); }
          renderLines();
          fireChange();
        });
      });
    }

    function setEditorMode(mode) {
      const title = el('editorTitle');
      const btn = el('addLine');
      const cancel = el('cancelEdit');
      if (title) title.textContent = mode === 'edit' ? 'Editing line' : 'Line editor';
      if (btn) btn.textContent = mode === 'edit' ? 'Update this line' : o.addLineLabel;
      if (cancel) cancel.classList.toggle('sc-hidden', mode !== 'edit');
    }

    function addLine() {
      const line = buildLine();
      if (!line) return;
      if (S.editingId !== null && S.editingId !== undefined && S.lines[S.editingId]) {
        S.lines[S.editingId] = line;
        S.editingId = null;
        setEditorMode('add');
      } else {
        S.lines.push(line);
        if (el('name')) el('name').value = '';
      }
      renderLines();
      fireChange();
      notify('Line added to quote');
    }

    function clearLines() {
      if ((S.lines.length || S.services.length) && !global.confirm('Remove all design lines and services from this quote?')) return;
      S.lines = []; S.services = []; S.editingId = null;
      setEditorMode('add');
      renderLines(); renderServices();
      if (el('result')) el('result').classList.add('sc-hidden');
      S.lastQuote = null;
      fireChange();
    }

    function fireChange() {
      if (typeof o.onChange === 'function') {
        try { o.onChange(S.lines.map((l) => Object.assign({}, l)), S.services.map((s) => Object.assign({}, s))); } catch (e) {}
      }
      if (o.autoCalculate) calculate();
      syncLive();
    }

    /* ───────────────────── services ───────────────────── */

    function renderServices() {
      if (!parts.services) return;
      const list = el('servicesList');
      const empty = el('servicesEmpty');
      if (!list || !empty) return;
      empty.classList.toggle('sc-hidden', S.services.length > 0);
      list.innerHTML = S.services.map((sv, i) => `
        <div class="sc-svc-row">
          <input type="text" class="sc-input sc-input-sm sc-col6" data-sv="name" data-i="${i}" value="${esc(sv.name || '')}" placeholder="Service name">
          <input type="number" class="sc-input sc-input-sm sc-col2" data-sv="qty" data-i="${i}" min="1" value="${Number(sv.qty) || 1}" style="text-align:center">
          <input type="number" class="sc-input sc-input-sm sc-col3" data-sv="price" data-i="${i}" min="0" value="${Number(sv.unitPrice) || 0}" style="text-align:right">
          <button type="button" class="sc-del sc-col1" data-sv-del="${i}" title="Remove">×</button>
        </div>`).join('');
      list.querySelectorAll('[data-sv]').forEach((inp) => {
        inp.addEventListener('input', () => {
          const i = Number(inp.getAttribute('data-i'));
          const f = inp.getAttribute('data-sv');
          const sv = S.services[i];
          if (!sv) return;
          if (f === 'name') sv.name = inp.value;
          if (f === 'qty') sv.qty = Math.max(1, parseInt(inp.value, 10) || 1);
          if (f === 'price') sv.unitPrice = Math.max(0, parseFloat(inp.value) || 0);
          fireChange();
        });
      });
      list.querySelectorAll('[data-sv-del]').forEach((b) => {
        b.addEventListener('click', () => {
          S.services.splice(Number(b.getAttribute('data-sv-del')), 1);
          renderServices(); fireChange();
        });
      });
    }

    function addService(type) {
      const L = labels();
      const key = type || 'custom';
      const price = number((cfg().servicePrices || {})[key]);
      S.services.push({ type: key, name: (L.service || {})[key] || 'Studio Service', qty: 1, unitPrice: price });
      renderServices(); fireChange();
      if (type) notify('Service added');
    }

    /* ───────────────────── level strip + guide ───────────────────── */

    function renderLevelStrip() {
      const strip = el('levelStrip');
      if (!strip) return;
      const selected = el('level') ? el('level').value : '1';
      strip.innerHTML = Object.keys(LEVEL_INFO).map((k) => {
        const info = LEVEL_INFO[k];
        return `<button type="button" class="sc-chip${k === selected ? ' on' : ''}" data-level="${esc(k)}">
          <span class="sc-chip-t">${esc(k)} ${esc(info.name)}</span>
          <span class="sc-chip-s">${info.pct ? '+' + info.pct + '%' : 'half base'}</span>
        </button>`;
      }).join('');
      strip.querySelectorAll('[data-level]').forEach((b) => {
        b.addEventListener('click', () => {
          el('level').value = b.getAttribute('data-level');
          renderLevelStrip();
          onStonesChange();
          syncLive();
        });
      });
    }

    function toggleGuide() {
      const guide = el('levelGuide');
      if (!guide) return;
      const willShow = guide.classList.contains('sc-hidden');
      if (willShow) renderGuide();
      guide.classList.toggle('sc-hidden', !willShow);
    }

    function renderGuide() {
      const guide = el('levelGuide');
      if (!guide) return;
      const L = labels();
      guide.innerHTML = Object.keys(LEVEL_INFO).map((k) => {
        const info = LEVEL_INFO[k];
        const pct = number((cfg().designPct || {})[k]);
        return `<div class="sc-guide-card">
          <div class="sc-guide-top">
            <div style="min-width:0">
              <p class="sc-guide-title">${esc(k)} — ${esc(info.name)}</p>
              <p class="sc-guide-desc">${esc(info.desc)}</p>
            </div>
            <span class="sc-guide-pct">${info.pct ? '+' + pct + '%' : 'half base'}</span>
          </div>
          <img class="sc-thumb" alt="${esc(info.name)} example" loading="lazy" decoding="async" src="${LEVEL_IMAGES[k]}">
          <div class="sc-examples">${info.examples.map((x) => `<span class="sc-example">${esc(x)}</span>`).join('')}</div>
          <button type="button" class="sc-link" style="margin-top:8px" data-use-level="${esc(k)}">Use this level</button>
        </div>`;
      }).join('');
      guide.querySelectorAll('[data-use-level]').forEach((b) => {
        b.addEventListener('click', () => {
          el('level').value = b.getAttribute('data-use-level');
          renderLevelStrip(); onStonesChange(); syncLive();
        });
      });
    }

    /* ───────────────────── calculate ───────────────────── */

    function orderOptions() {
      return {
        timeline: el('timeline') ? el('timeline').value : 'standard',
        mold: el('mold') ? el('mold').value : 'none',
        depositPct: el('deposit') ? (parseInt(el('deposit').value, 10) || 0) : 0,
        services: S.services,
        round: true,
      };
    }

    function calculate() {
      const L = labels();
      const c = cfg();
      let lines = S.lines.map((l) => Object.assign({}, l));
      if (!lines.length && !S.services.length) {
        const added = buildLine();
        if (!added) return null;
        lines = [added];
      }
      const opts = orderOptions();
      const order = engine().calculateOrder(lines, opts);

      if (el('resultText')) {
        const out = [];
        order.lines.forEach((l, i) => {
          const materialLine = l.material === 'gold'
            ? 'Gold ' + l.karat + 'K @ ' + l.goldPrice + ' EGP/g → base/tooth = ' + money(l.base) + ' EGP'
            : ((L.material || {})[l.material] || l.material) + ' → base/tooth = ' + money(l.base) + ' EGP';
          let stoneLine = 'None';
          if (l.accent) {
            stoneLine = 'Accent × ' + l.accent.count + ' (' + ((L.accentType || {})[l.accent.type] || '') + ' ' + money(l.accentUnit) + ' + ' + ((L.setting || {})[l.accent.setting] || '') + ' ' + l.settingUnit + ') = ' + money(l.stoneCost) + ' EGP';
          } else if (l.full && l.full.bars) {
            stoneLine = 'Full iced on Bars: ' + l.teeth + ' × ' + (c.barsStonesPerTooth || 400) + ' = ' + money(l.stoneCost) + ' EGP';
          } else if (l.full) {
            stoneLine = 'Full iced × ' + l.teeth + ' (' + ((L.accentType || {})[l.full.type] || '') + ' ' + money(l.fullUnit) + ' + ' + ((L.coverage || {})[l.full.coverage] || '') + ' ' + l.coverageUnit + ') = ' + money(l.stoneCost) + ' EGP';
          }
          out.push('DESIGN ' + (i + 1) + ': ' + lineLabel(l));
          out.push('  Material: ' + materialLine + ' → ' + money(l.materialTotal) + ' EGP');
          out.push('  Design: ' + (l.level === '0.5' ? '0 (Bars)' : '+' + l.designPct + '% = ' + money(l.designCost) + ' EGP'));
          out.push('  Stones: ' + stoneLine);
          out.push('  Plating: ' + ((L.plating || {})[l.plating] || l.plating) + ' → ' + money(l.platingCost) + ' EGP');
          out.push('  Enamel: ' + ((L.enamel || {})[l.enamel] || l.enamel) + ' → ' + money(l.enamelCost) + ' EGP');
          out.push('  Engraving: ' + ((L.engraving || {})[l.engraving] || l.engraving) + ' → ' + money(l.engravingCost) + ' EGP');
          if (l.anodizeCost) out.push('  Anodizing: ' + ((L.anodize || {})[l.anodize] || l.anodize) + ' → ' + money(l.anodizeCost) + ' EGP');
          out.push('  Line subtotal: ' + money(l.subtotal) + ' EGP');
          out.push('');
        });
        if (order.services.length) {
          out.push('STUDIO SERVICES:');
          order.services.forEach((sv) => {
            out.push('  • ' + sv.name + ' (' + sv.qty + ' × ' + money(sv.unitPrice) + ') = ' + money(sv.subtotal) + ' EGP');
          });
          out.push('  Services subtotal: ' + money(order.servicesSubtotal) + ' EGP');
          out.push('');
        }
        if (order.lines.length) out.push('Designs subtotal: ' + money(order.linesSubtotal) + ' EGP');
        if (order.servicesSubtotal) out.push('Services subtotal: ' + money(order.servicesSubtotal) + ' EGP');
        out.push('Timeline: ' + ((L.timeline || {})[opts.timeline] || opts.timeline) + ' (+' + order.timelinePct + '%) = ' + money(order.timelineAmount) + ' EGP');
        out.push('Mold: ' + ((L.mold || {})[opts.mold] || opts.mold) + ' → ' + money(order.moldCost) + ' EGP');
        out.push('');
        out.push('QUOTE TOTAL: ' + order.total.toLocaleString('en-US') + ' EGP');
        if (opts.depositPct) {
          out.push('Deposit (' + opts.depositPct + '%): ' + order.deposit.toLocaleString('en-US') + ' EGP');
          out.push('Balance before delivery: ' + order.balance.toLocaleString('en-US') + ' EGP');
        }
        el('resultText').innerText = out.join('\n');
        el('result').classList.remove('sc-hidden');
      }

      S.lastQuote = order;
      if (typeof o.onCalculate === 'function') {
        try { o.onCalculate(order, el('resultText') ? el('resultText').innerText : ''); } catch (e) {}
      }
      return order;
    }

    function copyResult() {
      const text = el('resultText') ? el('resultText').innerText : '';
      if (!text) return;
      if (global.navigator && global.navigator.clipboard) {
        global.navigator.clipboard.writeText(text).then(() => notify('Copied')).catch(() => {});
      }
    }

    function apply() {
      const line = buildLine();
      if (!line) return null;
      if (typeof o.onApply === 'function') {
        try { o.onApply(line); } catch (e) { notify('Error: ' + (e.message || e), true); }
      }
      return line;
    }

    return api;
  }

  /* ══════════════════════════════ MODAL ══════════════════════════════ */

  function openModal(options) {
    const o = Object.assign({}, options || {});
    injectCss();
    const wrap = document.createElement('div');
    wrap.className = 'sc-modal-wrap';
    wrap.innerHTML = `
      <div class="sc-modal-mask" data-sc="modalMask"></div>
      <div class="sc-modal" role="dialog" aria-modal="true">
        <div class="sc-modal-head">
          <h3>${esc(o.title || 'Exact Calculator')}</h3>
          <button type="button" class="sc-close" data-sc="modalClose" aria-label="Close">&times;</button>
        </div>
        <div class="sc-modal-body" data-sc="modalBody"></div>
        <div class="sc-modal-foot">
          <button type="button" class="sc-btn sc-btn-soft" data-sc="modalCancel">Cancel</button>
          <button type="button" class="sc-btn" data-sc="modalApply">${esc(o.applyLabel || 'Apply')}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const body = wrap.querySelector('[data-sc="modalBody"]');
    const instance = mount(body, Object.assign({}, o, { designMode: o.designMode !== false }));

    const close = () => {
      try { instance.destroy(); } catch (e) {}
      wrap.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    wrap.querySelector('[data-sc="modalClose"]').addEventListener('click', close);
    wrap.querySelector('[data-sc="modalCancel"]').addEventListener('click', close);
    wrap.querySelector('[data-sc="modalMask"]').addEventListener('click', close);
    wrap.querySelector('[data-sc="modalApply"]').addEventListener('click', () => {
      const line = instance.apply();
      if (line && o.closeOnApply !== false) close();
    });

    return { instance, close };
  }

  /* ══════════════════════════════ SETTINGS ══════════════════════════════ */

  const SETTING_GROUPS = [
    { id: 'materials', title: 'Materials — base price per tooth', keys: [
      ['materialBase.chrome', 'Cobalt Chrome'],
      ['materialBase.titanium', 'Titanium'],
      ['materialBase.silver', 'Sterling Silver 925'],
    ] },
    { id: 'gold', title: 'Gold', keys: [
      ['goldPrice', "Today's 24K gold rate (EGP/g)"],
      ['goldCastFee', 'Cast fee per tooth'],
      ['goldWeightFactor', 'Weight factor'],
      ['goldGramsPerTooth.10', 'Grams / tooth — 10K'],
      ['goldGramsPerTooth.14', 'Grams / tooth — 14K'],
      ['goldGramsPerTooth.18', 'Grams / tooth — 18K'],
      ['goldGramsPerTooth.21', 'Grams / tooth — 21K'],
      ['goldGramsPerTooth.22', 'Grams / tooth — 22K'],
      ['goldKarat.10.purity', 'Purity — 10K'],
      ['goldKarat.14.purity', 'Purity — 14K'],
      ['goldKarat.18.purity', 'Purity — 18K'],
      ['goldKarat.21.purity', 'Purity — 21K'],
      ['goldKarat.22.purity', 'Purity — 22K'],
      ['goldKarat.10.margin', 'Margin — 10K'],
      ['goldKarat.14.margin', 'Margin — 14K'],
      ['goldKarat.18.margin', 'Margin — 18K'],
      ['goldKarat.21.margin', 'Margin — 21K'],
      ['goldKarat.22.margin', 'Margin — 22K'],
    ] },
    { id: 'levels', title: 'Design levels — surcharge %', keys: [
      ['designPct.0.5', '0.5 Bars'],
      ['designPct.1', '1 Solid'],
      ['designPct.2', '2 Open face'],
      ['designPct.3', '3 Mid detail'],
      ['designPct.4', '4 Complex'],
      ['designPct.5', '5 Scorpion'],
      ['designPct.6', '6 Ultimate'],
    ] },
    { id: 'stones', title: 'Stones — price per stone', keys: [
      ['accentPrice.cz', 'Accent — CZ'],
      ['accentPrice.moissanite', 'Accent — Moissanite'],
      ['accentPrice.labgrown', 'Accent — Lab-Grown'],
      ['accentPrice.natural', 'Accent — Natural'],
      ['fullPrice.cz', 'Full iced — CZ'],
      ['fullPrice.moissanite', 'Full iced — Moissanite'],
      ['fullPrice.labgrown', 'Full iced — Lab-Grown'],
      ['fullPrice.natural', 'Full iced — Natural'],
      ['barsStonesPerTooth', 'Full iced on bars (per tooth)'],
    ] },
    { id: 'settings', title: 'Stone settings — per stone', keys: [
      ['settingPrice.flush', 'Flush'],
      ['settingPrice.twoprong', '2-Prong'],
      ['settingPrice.threeprong', '3-Prong'],
      ['settingPrice.fourprong', '4-Prong'],
      ['settingPrice.sixprong', '6-Prong'],
      ['settingPrice.bezelfull', 'Bezel full'],
      ['settingPrice.bezelhalf', 'Bezel half'],
      ['settingPrice.bar', 'Bar setting'],
    ] },
    { id: 'coverage', title: 'Coverage — per tooth', keys: [
      ['coveragePrice.standardpave', 'Standard Pave'],
      ['coveragePrice.frenchpave', 'French Pave'],
      ['coveragePrice.micropave', 'Micro-Pave'],
      ['coveragePrice.channel', 'Channel'],
      ['coveragePrice.invisible', 'Invisible'],
    ] },
    { id: 'finishes', title: 'Finishes — per tooth', keys: [
      ['plating.none', 'Plating — none'],
      ['plating.yellowgold', 'Plating — yellow gold'],
      ['plating.blackgold', 'Plating — black gold'],
      ['plating.whitegold', 'Plating — white gold'],
      ['plating.rosegold', 'Plating — rose gold'],
      ['plating.silverplating', 'Plating — silver'],
      ['enamel.none', 'Enamel — none'],
      ['enamel.single', 'Enamel — single'],
      ['enamel.multi', 'Enamel — multi'],
      ['enamel.master', 'Enamel — master'],
      ['engraving.none', 'Engraving — none'],
      ['engraving.small', 'Engraving — small'],
      ['engraving.medium', 'Engraving — medium'],
      ['engraving.large', 'Engraving — large'],
      ['anodize.none', 'Anodize — none'],
      ['anodize.single', 'Anodize — single'],
      ['anodize.dual', 'Anodize — dual'],
      ['anodize.multi', 'Anodize — multi'],
    ] },
    { id: 'services', title: 'Studio services', keys: [
      ['servicePrices.impression', 'Dental Impression'],
      ['servicePrices.consultation', 'Studio Consultation'],
      ['servicePrices.toothgem', 'Toothgem Application'],
      ['servicePrices.polishing', 'Clean & Polish'],
      ['servicePrices.fitting', 'Pickup / Fitting'],
      ['servicePrices.shipping', 'Courier Shipping'],
      ['servicePrices.custom', 'Custom Studio Service'],
    ] },
    { id: 'order', title: 'Order level', keys: [
      ['timelinePct.standard', 'Timeline — standard %'],
      ['timelinePct.rush', 'Timeline — rush %'],
      ['timelinePct.emergency', 'Timeline — emergency %'],
      ['moldFlat.none', 'Mold — none'],
      ['moldFlat.normalperarch', 'Mold — per arch'],
      ['moldFlat.digitalfullmouth', 'Mold — digital full mouth'],
      ['roundTo', 'Round totals up to'],
      ['depositPct', 'Default deposit %'],
    ] },
  ];

  function readPath(obj, path) {
    return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
  }
  function writePath(obj, path, value) {
    const keys = path.split('.');
    let cur = obj;
    keys.forEach((k, i) => {
      if (i === keys.length - 1) { cur[k] = value; return; }
      if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
      cur = cur[k];
    });
  }

  function mountSettings(host, options) {
    if (!host) return null;
    injectCss();
    const o = Object.assign({ db: null, onSaved: null }, options || {});
    const E = engine();

    function render() {
      const S = E.get();
      const html = SETTING_GROUPS.map((g) => {
        const rows = g.keys.map(([path, label]) => {
          const raw = readPath(S, path);
          const val = (raw === null || raw === undefined) ? '' : raw;
          return `<label class="sc-set-row">
            <span class="sc-set-name">${esc(label)}</span>
            <input class="sc-set-input" data-path="${esc(path)}" type="number" step="any" value="${esc(val)}">
          </label>`;
        }).join('');
        return `<div class="sc-set-group" id="sc-set-${esc(g.id)}"><div class="sc-set-title">${esc(g.title)}</div>${rows}</div>`;
      }).join('');

      host.innerHTML = `<div class="sc-set">
        <div class="sc-set-note" style="margin-bottom:12px">These are the calculator settings. They live in Firestore (<code>settings/pricing</code>) and are the only numbers the calculator uses — on the staff panel, quotes, invoices, the admin and the public estimator. Leave a stone rate empty to quote it at the studio.</div>
        <div class="sc-set-grid">${html}</div>
        <div class="sc-set-actions">
          <button type="button" class="sc-btn" data-set="save">Save to database</button>
          <button type="button" class="sc-btn sc-btn-soft" data-set="reset">Reset to defaults</button>
          <span class="sc-set-note" data-set="status"></span>
        </div>
      </div>`;

      host.querySelectorAll('[data-path]').forEach((inp) => {
        inp.addEventListener('input', () => {
          const path = inp.getAttribute('data-path');
          const key = path.split('.').pop();
          const empty = inp.value === '';
          const isStone = /^(accentPrice|fullPrice)\./.test(path);
          const value = empty ? (isStone ? null : 0) : Number(inp.value);
          const patch = {};
          writePath(patch, path, value);
          E.set(patch);
        });
      });

      host.querySelector('[data-set="save"]').addEventListener('click', async () => {
        const status = host.querySelector('[data-set="status"]');
        if (!o.db) { status.textContent = 'Not connected to the database.'; return; }
        status.textContent = 'Saving…';
        try {
          await E.save(o.db);
          status.textContent = 'Saved to the database — every page now uses these numbers.';
          if (typeof o.onSaved === 'function') o.onSaved();
        } catch (err) {
          status.textContent = 'Could not save: ' + (err.message || err);
        }
        setTimeout(() => { status.textContent = ''; }, 4000);
      });

      host.querySelector('[data-set="reset"]').addEventListener('click', async () => {
        if (!global.confirm('Reset every pricing setting to its default?')) return;
        E.reset();
        if (o.db) { try { await E.save(o.db); } catch (e) {} }
        render();
      });
    }

    render();
    return { refresh: render };
  }

  global.StaffCalculator = {
    LEVEL_INFO,
    LEVEL_IMAGES,
    mount,
    openModal,
    mountSettings,
    SETTING_GROUPS,
    _css: CSS,
  };
})(window);
