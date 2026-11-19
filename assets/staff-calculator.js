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
  color:#1d1d1d;font-size:13px;line-height:1.45;-webkit-font-smoothing:antialiased;text-align:left;}
.sc-host *{box-sizing:border-box;}
.sc-host p{margin:0;}
.sc-host h3,.sc-host h4{margin:0;}
.sc-stack>*+*{margin-top:16px;}
.sc-stack-sm>*+*{margin-top:10px;}
.sc-note{font-size:10px;color:#949494;line-height:1.5;}
.sc-mut{font-size:10px;color:#696969;}
.sc-faint{font-size:10px;color:#949494;}
.sc-strong{font-weight:600;}
.sc-card{border:1px solid #e5e7eb;border-radius:8px;background:#fff;}
.sc-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;
  padding:10px 12px;background:linear-gradient(90deg,#f9fafb,#fff);border-bottom:1px solid #f3f4f6;}
.sc-card-body{padding:12px;}
.sc-lbl{display:block;font-size:10px;font-weight:600;color:#696969;text-transform:uppercase;
  letter-spacing:.05em;margin-bottom:4px;}
.sc-lbl-lite{display:block;font-size:10px;color:#696969;margin-bottom:4px;}
.sc-lbl span{color:#ebebeb;font-weight:600;}
.sc-req{display:inline;color:#949494;font-weight:600;text-transform:none;letter-spacing:0;}
.sc-input,.sc-select{width:100%;font-family:inherit;font-size:12px;color:#1d1d1d;background:#f9fafb;
  border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;outline:none;transition:border-color .15s;appearance:auto;}
.sc-input::placeholder{color:#949494;}
.sc-input:focus,.sc-select:focus{border-color:#949494;}
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
.sc-btn:hover{background:#232323;border-color:#232323;}
.sc-btn-ghost{background:#fff;color:#1d1d1d;border-color:#000;}
.sc-btn-ghost:hover{background:#000;color:#fff;border-color:#000;}
.sc-btn-soft{background:#fff;color:#404040;border-color:#ebebeb;}
.sc-btn-soft:hover{background:#f9fafb;color:#1d1d1d;}
.sc-btn-sm{padding:6px 10px;font-size:10px;border-radius:6px;}
.sc-btn-block{width:100%;display:block;}
.sc-link{background:none;border:0;padding:0;font-family:inherit;font-size:10px;color:#696969;
  text-decoration:underline;cursor:pointer;}
.sc-link:hover{color:#1d1d1d;}
.sc-link-danger:hover{color:#797979;}
.sc-line{border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;background:#fff;}
.sc-line+.sc-line{margin-top:8px;}
.sc-line-name{font-size:12px;font-weight:500;color:#1d1d1d;}
.sc-line-price{font-size:12px;font-weight:600;white-space:nowrap;}
.sc-line-sub{font-size:10px;color:#696969;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sc-lines-empty{font-size:10px;color:#949494;border:1px dashed #e5e7eb;border-radius:8px;
  padding:8px 12px;line-height:1.5;}
.sc-badge{font-size:10px;color:#949494;}
.sc-subcard{border:1px solid #e5e7eb;border-radius:8px;padding:12px;space-y:8px;}
.sc-subcard>*+*{margin-top:8px;}
.sc-levelstrip{display:flex;gap:8px;overflow-x:auto;margin-top:8px;padding-bottom:4px;}
.sc-chip{flex:0 0 auto;text-align:left;border:1px solid #e5e7eb;border-radius:8px;
  padding:6px 10px;background:#fff;cursor:pointer;font-family:inherit;transition:border-color .15s,box-shadow .15s;}
.sc-chip:hover{border-color:#949494;}
.sc-chip.on{border-color:#000;box-shadow:inset 0 0 0 1px #000;}
.sc-chip.sc-chip-on{background:#000;color:#fff;border-color:#000;box-shadow:none;}
.sc-chip.sc-chip-on .sc-chip-s{color:#d8d8d8;}
.sc-chip-t{display:block;font-size:11px;font-weight:600;line-height:1.25;}

@media (max-width:520px){.sc-pad{left:10px;right:10px;bottom:10px;width:auto;}}
.sc-chip-s{display:block;font-size:9px;color:#949494;line-height:1.25;}
.sc-guide{display:grid;gap:8px;margin-top:8px;}
.sc-guide-card{border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#fff;}
.sc-guide-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}
.sc-guide-title{font-size:11px;font-weight:600;margin:0;}
.sc-guide-desc{font-size:10px;color:#696969;margin:2px 0 0;line-height:1.5;}
.sc-guide-pct{font-size:10px;color:#949494;flex:0 0 auto;}
.sc-examples{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;}
.sc-example{font-size:9px;color:#696969;background:#f9fafb;border:1px solid #e5e7eb;
  border-radius:4px;padding:2px 6px;}
.sc-thumb{display:block;width:100%;max-width:220px;border-radius:6px;margin-top:8px;border:1px solid #f3f4f6;}
.sc-result{border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;padding:16px;}
.sc-result pre{font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:12px;
  white-space:pre-wrap;color:#232323;margin:0;line-height:1.55;}
.sc-result-actions{display:flex;gap:8px;margin-top:12px;}
.sc-result-actions .sc-btn{flex:1;}
.sc-svc-row{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:6px;align-items:center;
  border:1px solid #e5e7eb;border-radius:4px;padding:8px;background:#f9fafb;}
.sc-svc-row+.sc-svc-row{margin-top:8px;}
.sc-col6{grid-column:span 6;}
.sc-col2{grid-column:span 2;}
.sc-col3{grid-column:span 3;}
.sc-col1{grid-column:span 1;}
.sc-del{font-size:12px;color:#949494;background:none;border:0;cursor:pointer;text-align:center;padding:0;}
.sc-del:hover{color:#797979;}
.sc-live{display:flex;align-items:baseline;justify-content:space-between;gap:12px;
  border:1px solid #e5e7eb;border-left:3px solid #000;border-radius:0 8px 8px 0;background:#f9fafb;padding:12px 16px;}
.sc-live-lbl{font-size:10px;font-weight:600;color:#696969;text-transform:uppercase;letter-spacing:.05em;}
.sc-live-spec{font-size:11px;color:#696969;margin-top:2px;}
.sc-live-val{font-size:22px;font-weight:600;letter-spacing:.5px;white-space:nowrap;}
.sc-hidden{display:none !important;}
.sc-rate-wrap{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;padding:16px;}
.sc-rate-mask{position:absolute;inset:0;background:rgba(0,0,0,.32);backdrop-filter:blur(2px);}
.sc-rate-box{position:relative;background:#fff;border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,.28);
  padding:20px;width:100%;max-width:320px;font-family:'Inter','Arimo',sans-serif;color:#1d1d1d;}
.sc-rate-box h3{font-size:14px;font-weight:600;margin:0;}
.sc-rate-box p{font-size:11px;color:#949494;margin:4px 0 0;}
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
.sc-close{background:none;border:0;font-size:22px;line-height:1;color:#949494;cursor:pointer;padding:0 4px;}
.sc-close:hover{color:#000;}
/* settings editor */
.sc-set{font-family:'Inter','Arimo',sans-serif;color:#1d1d1d;}
.sc-set-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px 28px;}
.sc-set-group{border-top:1px solid #e5e7eb;padding-top:12px;}
.sc-set-group.fail{border-top-color:#aaaaaa;}
.sc-set-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.14em;
  color:#696969;margin-bottom:10px;}
.sc-set-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px 0;}
.sc-set-name{font-size:12px;color:#404040;}
.sc-set-input{width:116px;padding:7px 9px;border:1px solid #e2e2e2;border-radius:4px;font-family:inherit;
  font-size:12px;text-align:right;color:#1f1f1f;background:#fff;}
.sc-set-input:focus{outline:none;border-color:#1d1d1d;}
.sc-set-actions{display:flex;align-items:center;gap:12px;margin-top:14px;padding-top:16px;
  border-top:1px solid #e5e7eb;flex-wrap:wrap;}
.sc-set-note{font-size:11px;color:#696969;}
.sc-codebar{border:1px solid #e5e7eb;border-radius:8px;background:#fafafa;padding:9px 11px;}
.sc-codebar-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;flex-wrap:wrap;}
.sc-codebar-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.sc-codebar-inp{flex:1 1 170px;min-width:0;padding:7px 9px;border:1px solid #d1d5db;border-radius:6px;
  font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11.5px;background:#fff;color:#111;}
.sc-codebar-inp:focus{outline:none;border-color:#1d1d1d;}
.sc-code-pill{display:inline-flex;align-items:center;gap:6px;margin-top:6px;padding:4px 8px;
  background:#fff;border:1px dashed #c8b285;border-radius:5px;font-size:11px;color:#1d1d1d;
  font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;word-break:break-all;max-width:100%;}
.sc-mode-tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:3px;background:#f3f4f6;border-radius:7px;}
.sc-mode-tab{border:none;background:transparent;border-radius:5px;padding:6px 8px;font-family:inherit;
  font-size:11px;font-weight:600;color:#6b7280;cursor:pointer;transition:.15s;text-align:center;}
.sc-mode-tab:hover{color:#1d1d1d;}
.sc-mode-tab.on{background:#1d1d1d;color:#fff;box-shadow:0 1px 3px rgba(0,0,0,.12);}
.sc-mixed-box{border:1px solid #e5dec9;border-radius:8px;background:#fdfcf8;padding:10px;}
.sc-grp-row{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:7px 9px;
  background:#fff;border:1px solid #ece8db;border-radius:6px;margin-top:6px;}
.sc-grp-row.editing{border-color:#1d1d1d;background:#f8f9fa;}
.sc-grp-main{min-width:0;flex:1;font-size:11.5px;color:#1d1d1d;line-height:1.4;}
.sc-grp-price{font-size:11.5px;font-weight:700;color:#1d1d1d;white-space:nowrap;}
.sc-grp-sum{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;
  padding-top:7px;border-top:1px dashed #e2dac4;font-size:11px;font-weight:600;color:#1d1d1d;}
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

  /* Every figure the studio reads or sends is a whole EGP — no decimals. */
  const money = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
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
      showCodeBar: true,
      autoCalculate: false,
      designName: '',
      onChange: null,
      onApply: null,
      onCalculate: null,
      onImportCode: null,
      getExtraCodeData: null,
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
      mixedMode: false,
      editorGroups: [],
      editingGroupId: null,
      lastQuote: null,
      lastCode: '',
      rateKind: null,
      rateBox: null,
      unsubEngine: null,
      stoneAccent: false,   /* accent stones on the tooth group being edited */
      stoneFull: false,     /* full iced cover on the same tooth group */
    };

    host.innerHTML = renderShell();
    host.classList.add('sc-host');

    wire();
    syncVisibility();
    renderLevelStrip();
    renderMixedGroups();
    renderLines();
    renderServices();
    syncLive();
    if (o.autoCalculate) calculate();
    if (engine() && typeof engine().onChange === 'function') {
      S.unsubEngine = engine().onChange(() => {
        try { refreshOptions(); renderLevelStrip(); syncVisibility(); renderMixedGroups(); syncLive(); } catch (e) {}
      });
    }

    const api = {
      host,
      el,
      getLines: () => S.lines.map((l) => Object.assign({}, l)),
      setLines: (lines) => {
        S.lines = Array.isArray(lines) ? lines.map((l) => engine().calculateLine(l)) : [];
        S.editingId = null;
        renderLines();
        setEditorMode('add');
      },
      getServices: () => S.services.map((s) => Object.assign({}, s)),
      setServices: (svc) => { S.services = Array.isArray(svc) ? svc.map((s) => Object.assign({}, s)) : []; renderServices(); },
      getOrder: () => S.lastQuote,
      getResultText: () => (el('resultText') ? el('resultText').textContent : ''),
      getLastQuote: () => S.lastQuote,
      lineLabel: (line) => lineLabel(line),
      lineSubLabel: (line) => lineSubLabel(line),
      exportCode: (opts) => exportCode(opts),
      importCode: (raw, opts) => importCode(raw, opts),
      setField: (name, value) => {
        const node = el(name);
        if (!node) return;
        try {
          if (node.options && !Array.from(node.options).some((opt) => opt.value === String(value))) return;
        } catch (e) { /* not a select */ }
        node.value = value;
        syncVisibility();
        renderLevelStrip();
        syncLive();
      },
      getField: (name) => { const node = el(name); return node ? node.value : ''; },
      loadLine: (line, name) => {
        writeEditor(Object.assign({}, line || {}, { name: name !== undefined ? name : (line && line.name) || '' }));
        syncVisibility(); renderLevelStrip(); renderMixedGroups(); syncLive();
      },
      readLine: () => readEditor(),
      refresh: () => {
        refreshOptions();
        S.lines = S.lines.map((l) => engine().calculateLine(l));
        S.editorGroups = S.editorGroups.map((g) => engine().calculateLine(g));
        syncVisibility();
        renderLevelStrip();
        renderMixedGroups();
        renderLines();
        renderServices();
        syncLive();
      },
      calculate,
      apply: apply,
      reset: () => {
        S.lines = []; S.services = []; S.editingId = null;
        S.mixedMode = false; S.editorGroups = []; S.editingGroupId = null;
        syncMixedUi(); renderMixedGroups();
        renderLines(); renderServices(); setEditorMode('add');
        const r = el('result'); if (r) r.classList.add('sc-hidden');
        const cp = el('codeOut'); if (cp) cp.classList.add('sc-hidden');
        S.lastQuote = null; syncLive();
      },
      destroy: () => {
        if (typeof S.unsubEngine === 'function') { try { S.unsubEngine(); } catch (e) {} S.unsubEngine = null; }
        if (S.rateKeyHandler) { document.removeEventListener('keydown', S.rateKeyHandler); S.rateKeyHandler = null; }
        if (S.rateBox && S.rateBox.parentNode) { S.rateBox.parentNode.removeChild(S.rateBox); S.rateBox = null; }
        host.innerHTML = '';
        host.classList.remove('sc-host');
      },
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

        ${o.showCodeBar !== false ? `
        <div class="sc-codebar" data-sc="codeBar">
          <div class="sc-codebar-top">
            <span class="sc-lbl" style="margin:0">Quick Transfer Code <span class="sc-req">(works across all calculators)</span></span>
            <button type="button" class="sc-btn sc-btn-sm" data-sc="copyCodeBtn">Copy Code</button>
          </div>
          <div class="sc-codebar-row">
            <input type="text" class="sc-codebar-inp" data-sc="codeInput" placeholder="Paste EGZ-... code or link to load instantly" autocomplete="off" spellcheck="false">
            <button type="button" class="sc-btn sc-btn-soft sc-btn-sm" data-sc="loadCodeBtn">Load</button>
          </div>
          <div class="sc-code-pill sc-hidden" data-sc="codeOut"></div>
        </div>` : ''}

        ${parts.lines ? `
        <div data-sc="linesWrap">
          <div class="sc-between" style="margin-bottom:6px">
            <label class="sc-lbl" style="margin:0">Design lines <span class="sc-req">(multiple sets in one quote)</span></label>
            <span style="display:flex;align-items:center;gap:8px;flex-shrink:0">
              <span class="sc-badge" data-sc="lineBadge"></span>
              <button type="button" class="sc-link sc-link-danger" data-sc="clearLines">Clear all</button>
            </span>
          </div>
          <div data-sc="linesList"></div>
          <div class="sc-lines-empty" data-sc="linesEmpty">
            No lines yet. Configure a set below (all teeth same level, or mixed teeth in one set) and press “Add design line” — or press “Calculate Exact Quote” to quote a single set.
          </div>
        </div>` : ''}

        ${parts.editor ? `
        <div class="sc-card" data-sc="lineEditor" style="padding:12px">
          <div class="sc-stack-sm">
            <div class="sc-between">
              <span class="sc-lbl" style="margin:0" data-sc="editorTitle">Set editor</span>
              <button type="button" class="sc-link sc-hidden" data-sc="cancelEdit">Cancel edit</button>
            </div>

            <div>
              <label class="sc-lbl">Set / design name <span class="sc-req">(optional — appears on the quote &amp; PDF)</span></label>
              <input type="text" class="sc-input" data-sc="name" maxlength="40" placeholder="e.g. Top 6 set · Bottom bars · Custom fangs">
            </div>

            <div>
              <label class="sc-lbl">Teeth setup inside this set</label>
              <div class="sc-mode-tabs" role="tablist">
                <button type="button" class="sc-mode-tab on" data-sc="modeUniform">Same level on all teeth</button>
                <button type="button" class="sc-mode-tab" data-sc="modeMixed">Mixed teeth in 1 set</button>
              </div>
            </div>

            <div class="sc-mixed-box sc-hidden" data-sc="mixedWrap">
              <div class="sc-between">
                <span class="sc-lbl" style="margin:0">Tooth groups in this set</span>
                <button type="button" class="sc-link sc-link-danger sc-hidden" data-sc="clearGroups">Clear groups</button>
              </div>
              <div data-sc="groupsList"></div>
              <div class="sc-faint" style="margin-top:6px" data-sc="groupsEmpty">
                Example: add <strong>2 teeth Level 4 + Iced</strong>, then add <strong>4 teeth Level 1 Plain</strong> — all priced together as one single set.
              </div>
              <div class="sc-grp-sum sc-hidden" data-sc="groupsSum">
                <span data-sc="groupsSumLbl">0 teeth</span>
                <span data-sc="groupsSumVal">0 EGP</span>
              </div>
            </div>

            <div class="sc-hidden" data-sc="groupLabelWrap">
              <div class="sc-between" style="margin-bottom:4px">
                <label class="sc-lbl" style="margin:0" data-sc="groupFormTitle">Configure tooth group to add</label>
                <button type="button" class="sc-link sc-hidden" data-sc="cancelGroupEdit">Cancel group edit</button>
              </div>
              <input type="text" class="sc-input sc-input-sm" data-sc="groupLabel" maxlength="40" placeholder="Tooth group label (optional, e.g. 2 Canines / Front 4 / Left fang)">
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
                <input type="number" class="sc-input" data-sc="goldPrice" step="0.01" inputmode="decimal" placeholder="Type today's rate here">
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
              <!-- A tooth can be iced out AND carry accent stones at the same
                   time, so these are two independent switches, not a choice. -->
              <div class="sc-wrap" data-sc="stonesToggles">
                <button type="button" class="sc-chip" data-sc="accentToggle" data-stone="accent">
                  <span class="sc-chip-t">Accent stones</span><span class="sc-chip-s">per stone</span>
                </button>
                <button type="button" class="sc-chip" data-sc="fullToggle" data-stone="fulliced">
                  <span class="sc-chip-t">Full iced</span><span class="sc-chip-s">per tooth</span>
                </button>
              </div>
              <button type="button" class="sc-link sc-hidden" style="margin-top:6px" data-sc="clearStones">Clear stones</button>
              <p class="sc-faint sc-hidden" style="margin-top:4px" data-sc="noStonesNote">Chrome and Titanium don't take stones.</p>
              <p class="sc-faint" style="margin-top:4px">Both can be on at once — e.g. a tooth iced out with a few accent stones on top.</p>
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
              <div class="sc-grid2-sm" style="margin-top:8px">
                <div>
                  <label class="sc-lbl-lite">Diamond cut</label>
                  <select class="sc-select sc-select-sm" data-sc="accentCut"></select>
                </div>
                <div>
                  <label class="sc-lbl-lite">Stone size (mm)</label>
                  <select class="sc-select sc-select-sm" data-sc="accentSize"></select>
                </div>
              </div>
              <p class="sc-faint" style="margin-top:4px">Size is measured against the real tooth. Fancy cuts carry a surcharge on the stone only.</p>
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
              <div class="sc-grid2-sm" style="margin-top:8px">
                <div>
                  <label class="sc-lbl-lite">Diamond cut</label>
                  <select class="sc-select sc-select-sm" data-sc="fullCut"></select>
                </div>
                <div>
                  <label class="sc-lbl-lite">Stone size (mm)</label>
                  <select class="sc-select sc-select-sm" data-sc="fullSize"></select>
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

            <div class="sc-hidden" data-sc="addGroupWrap">
              <button type="button" class="sc-btn sc-btn-block" style="background:#2d2a24" data-sc="addGroupBtn">+ Add tooth group to this set</button>
            </div>

            ${o.designMode ? `
            <div class="sc-live">
              <div>
                <div class="sc-live-lbl">Calculated set total</div>
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
            <button type="button" class="sc-btn sc-btn-soft" data-sc="copyResultCode">Copy Code</button>
            ${o.showPdf ? `<button type="button" class="sc-btn" data-sc="downloadPdf">Download PDF</button>` : ''}
            ${typeof o.onInsert === 'function' ? `<button type="button" class="sc-btn sc-btn-soft" data-sc="insertResult">${esc(o.insertLabel || 'Send to Chat')}</button>` : ''}
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
        const keys = Object.keys(map);
        node.innerHTML = keys.map((k) => {
          const v = map[k];
          const base = k === 'none' ? 'None'
            : (L.setting && L.setting[k]) || (L.coverage && L.coverage[k]) || (L.plating && L.plating[k]) ||
              (L.enamel && L.enamel[k]) || (L.engraving && L.engraving[k]) || (L.anodize && L.anodize[k]) || k;
          const label = k === 'none' ? 'None' : base + ' (' + v + (suffix || '') + ')';
          return `<option value="${esc(k)}">${esc(label)}</option>`;
        }).join('');
        if (current && keys.includes(current)) node.value = current;
      };
      setOpts(el('plating'), c.plating);
      setOpts(el('enamel'), c.enamel);
      setOpts(el('engraving'), c.engraving);
      setOpts(el('anodize'), c.anodize);
      setOpts(el('accentSetting'), c.settingPrice);
      setOpts(el('coverage'), c.coveragePrice);
      /* Cut and size drive the stone's unit price; round + 1 mm is the base. */
      const CUT_NAMES = { round:'Round', cushion:'Cushion', oval:'Oval', princess:'Princess',
        emerald:'Emerald', pear:'Pear', radiant:'Radiant', heart:'Heart', marquise:'Marquise',
        baguette:'Baguette', taperedbaguette:'Tapered Baguette' };
      const cutOpts = {};
      Object.keys(CUT_NAMES).forEach((k) => {
        const pct = engine().cutPctOf ? engine().cutPctOf(k) : 0;
        cutOpts[k] = CUT_NAMES[k] + (pct ? ' (+' + pct + '%)' : '');
      });
      setOpts(el('accentCut'), cutOpts);
      setOpts(el('fullCut'), cutOpts);
      const sizeOpts = {};
      ['1','1.5','2','2.5','3','3.5','4','4.5','5','6'].forEach((mm) => {
        const f = engine().sizeFactorOf ? engine().sizeFactorOf(mm) : 1;
        sizeOpts[mm] = mm + ' mm' + (f > 1 ? ' (' + f.toFixed(2) + '×)' : '');
      });
      setOpts(el('accentSize'), sizeOpts);
      setOpts(el('fullSize'), sizeOpts);
      if (el('accentCut')) el('accentCut').value = 'round';
      if (el('fullCut')) el('fullCut').value = 'round';
      if (el('accentSize')) el('accentSize').value = '1';
      if (el('fullSize')) el('fullSize').value = '1';

      const lvl = el('level');
      if (lvl && c.designPct) {
        const curLvl = lvl.value || '1';
        const lvlLabels = {
          '0.5': '0.5 — Bars (half base, no design %)',
          '1': '1 — Solid (+' + number(c.designPct['1']) + '%)',
          '2': '2 — Open face (+' + number(c.designPct['2']) + '%)',
          '3': '3 — Mid detail (+' + number(c.designPct['3']) + '%)',
          '4': '4 — Complex (+' + number(c.designPct['4']) + '%)',
          '5': '5 — Scorpion / heavy detail (+' + number(c.designPct['5']) + '%)',
          '6': '6 — Ultimate (+' + number(c.designPct['6']) + '%)',
        };
        lvl.innerHTML = Object.keys(lvlLabels).map((k) =>
          `<option value="${esc(k)}">${esc(lvlLabels[k])}</option>`).join('');
        lvl.value = curLvl;
      }

      const barsNote = el('fullBarsNote');
      if (barsNote) {
        const barsRate = number(c.barsStonesPerTooth) || 400;
        barsNote.textContent = 'Level 0.5 Bars + full iced uses a fixed ' + barsRate + ' EGP/tooth — no type/coverage needed.';
      }

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
      if (el('accentToggle')) el('accentToggle').addEventListener('click', () => {
        const f = stoneFlags();
        setStoneFlag('accent', !f.accent);
        onStonesChange();
        if (stoneFlags().accent && (el('accentType').value === 'labgrown' || el('accentType').value === 'natural')) {
          onAccentTypeChange(true);
        }
        syncLive();
      });
      if (el('fullToggle')) el('fullToggle').addEventListener('click', () => {
        const f = stoneFlags();
        setStoneFlag('full', !f.full);
        onStonesChange();
        if (stoneFlags().full && (el('fullType').value === 'labgrown' || el('fullType').value === 'natural')) {
          onFullTypeChange(true);
        }
        syncLive();
      });
      if (el('clearStones')) el('clearStones').addEventListener('click', () => {
        setStoneFlag('accent', false);
        setStoneFlag('full', false);
        onStonesChange();
        syncLive();
      });
      if (el('accentType')) el('accentType').addEventListener('change', () => { onAccentTypeChange(true); syncLive(); });
      if (el('accentCount')) el('accentCount').addEventListener('input', syncLive);
      if (el('accentSetting')) el('accentSetting').addEventListener('change', syncLive);
      if (el('accentCut')) el('accentCut').addEventListener('change', syncLive);
      if (el('accentSize')) el('accentSize').addEventListener('change', syncLive);
      if (el('fullCut')) el('fullCut').addEventListener('change', syncLive);
      if (el('fullSize')) el('fullSize').addEventListener('change', syncLive);
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
      if (el('modeUniform')) el('modeUniform').addEventListener('click', () => setMixedMode(false));
      if (el('modeMixed')) el('modeMixed').addEventListener('click', () => setMixedMode(true));
      if (el('addGroupBtn')) el('addGroupBtn').addEventListener('click', addOrSaveGroup);
      if (el('cancelGroupEdit')) el('cancelGroupEdit').addEventListener('click', cancelGroupEdit);
      if (el('clearGroups')) el('clearGroups').addEventListener('click', clearGroups);
      if (el('copyCodeBtn')) el('copyCodeBtn').addEventListener('click', () => copyCode());
      if (el('copyResultCode')) el('copyResultCode').addEventListener('click', () => copyCode());
      if (el('loadCodeBtn')) el('loadCodeBtn').addEventListener('click', () => {
        const inp = el('codeInput');
        const val = inp ? inp.value.trim() : '';
        if (val) { importCode(val); return; }
        if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.readText) {
          global.navigator.clipboard.readText().then((clip) => {
            if (!clip || !clip.trim()) { notify('Paste an EGZ- code in the box first', true); return; }
            if (inp) inp.value = clip.trim();
            importCode(clip.trim());
          }).catch(() => notify('Paste an EGZ- code in the box first', true));
        } else {
          notify('Paste an EGZ- code in the box first', true);
        }
      });
      if (el('codeInput')) {
        el('codeInput').addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); importCode(el('codeInput').value); }
        });
      }
      if (el('timeline')) el('timeline').addEventListener('change', () => { if (o.autoCalculate) calculate(); });
      if (el('mold')) el('mold').addEventListener('change', () => { if (o.autoCalculate) calculate(); });
      if (el('deposit')) el('deposit').addEventListener('change', () => { if (o.autoCalculate) calculate(); });
      if (el('addLine')) el('addLine').addEventListener('click', addLine);
      if (el('cancelEdit')) el('cancelEdit').addEventListener('click', () => {
        S.editingId = null;
        S.mixedMode = false; S.editorGroups = []; S.editingGroupId = null;
        syncMixedUi(); renderMixedGroups();
        setEditorMode('add');
      });
      if (el('clearLines')) el('clearLines').addEventListener('click', clearLines);
      if (el('addService')) el('addService').addEventListener('click', () => addService());
      host.querySelectorAll('[data-sc="quickSvc"]').forEach((b) => {
        b.addEventListener('click', () => addService(b.getAttribute('data-svc')));
      });
      if (el('calculate')) el('calculate').addEventListener('click', calculate);
      if (el('copyResult')) el('copyResult').addEventListener('click', copyResult);
      if (el('downloadPdf')) el('downloadPdf').addEventListener('click', () => {
        if (!S.lastQuote) calculate();
        if (!S.lastQuote) return;
        if (typeof o.onPdf === 'function') o.onPdf(S.lastQuote, api);
        else if (typeof global.downloadQuotationPdf === 'function') global.downloadQuotationPdf();
        else if (engine() && typeof engine().downloadQuotePdf === 'function') {
          engine().downloadQuotePdf(S.lastQuote, {
            clientName: el('clientName') ? el('clientName').value : '',
            notes: el('clientNotes') ? el('clientNotes').value : '',
            code: exportCode(),
          });
          notify('PDF downloaded');
        }
      });
      if (el('insertResult')) el('insertResult').addEventListener('click', () => {
        if (!S.lastQuote) calculate();
        if (typeof o.onInsert === 'function') o.onInsert(api.getResultText(), S.lastQuote, api);
      });
      if (el('resultApply')) el('resultApply').addEventListener('click', apply);
      if (el('applyBtn')) el('applyBtn').addEventListener('click', apply);
    }

    /* ───────────────────────── visibility ───────────────────────── */

    /* Stones are two independent switches: a tooth group can be iced out and
       still have accent stones on it. `stoneFlags` holds the two answers. */
    function stoneFlags() {
      const f = { accent: false, full: false };
      const at = el('accentToggle');
      const ft = el('fullToggle');
      if (at) f.accent = at.classList.contains('sc-chip-on') || at.getAttribute('aria-pressed') === 'true';
      if (ft) f.full = ft.classList.contains('sc-chip-on') || ft.getAttribute('aria-pressed') === 'true';
      return f;
    }

    function setStoneFlag(which, on) {
      const btn = which === 'accent' ? el('accentToggle') : el('fullToggle');
      const next = !!on;
      if (btn) {
        btn.classList.toggle('sc-chip-on', next);
        btn.classList.toggle('on', next);
        btn.setAttribute('aria-pressed', next ? 'true' : 'false');
      }
      S.stoneAccent = which === 'accent' ? next : !!S.stoneAccent;
      S.stoneFull = which === 'full' ? next : !!S.stoneFull;
    }

    function syncStoneChips() {
      ['accent', 'full'].forEach((which) => {
        const btn = which === 'accent' ? el('accentToggle') : el('fullToggle');
        if (!btn) return;
        const on = which === 'accent' ? !!S.stoneAccent : !!S.stoneFull;
        btn.classList.toggle('sc-chip-on', on);
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      const clear = el('clearStones');
      if (clear) clear.classList.toggle('sc-hidden', !(S.stoneAccent || S.stoneFull));
    }

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
      ['accentToggle', 'fullToggle'].forEach((k) => {
        const b = el(k);
        if (!b) return;
        b.disabled = !!noStones;
        b.style.opacity = noStones ? '.45' : '';
        b.style.pointerEvents = noStones ? 'none' : '';
      });
      if (noStones) { S.stoneAccent = false; S.stoneFull = false; }
      syncStoneChips();
      onStonesChange();
      if (isGold) autoFillGoldPrice();
    }

    function onMaterialChange(user) {
      syncVisibility();
      if (user === true && el('material').value === 'gold' && !getRate('gold')) askRate('gold');
    }

    function onStonesChange() {
      const f = stoneFlags();
      if (el('accentWrap')) el('accentWrap').classList.toggle('sc-hidden', !f.accent);
      if (el('fullWrap')) el('fullWrap').classList.toggle('sc-hidden', !f.full);
      if (f.accent) autoFillStone('accent');
      if (f.full) {
        const isBars = el('level') && el('level').value === '0.5';
        if (el('fullBarsNote')) el('fullBarsNote').classList.toggle('sc-hidden', !isBars);
        if (el('fullFields')) el('fullFields').classList.toggle('sc-hidden', !!isBars);
        if (!isBars) autoFillStone('full');
      }
      syncStoneChips();
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
      if (!meta) return;
      let box = S.rateBox;
      if (!box || !box.parentNode) {
        box = document.createElement('div');
        box.className = 'sc-rate-wrap sc-hidden';
        box.setAttribute('data-sc', 'rateWrap');
        box.innerHTML = `
          <div class="sc-rate-mask" data-sc="rateMask"></div>
          <div class="sc-rate-box" role="dialog" aria-modal="true">
            <h3 data-sc="rateTitle"></h3>
            <p data-sc="rateHint"></p>
            <input type="number" class="sc-input" style="margin-top:12px" data-sc="rateInput" inputmode="decimal" min="0" step="any" placeholder="0">
            <div class="sc-rate-actions">
              <button type="button" class="sc-btn sc-btn-ghost" data-sc="rateCancel">Cancel</button>
              <button type="button" class="sc-btn" data-sc="rateSave">Save</button>
            </div>
          </div>`;
        document.body.appendChild(box);
        S.rateBox = box;
        box.querySelector('[data-sc="rateMask"]').addEventListener('click', closeRate);
        box.querySelector('[data-sc="rateCancel"]').addEventListener('click', closeRate);
        box.querySelector('[data-sc="rateSave"]').addEventListener('click', saveRate);
        box.querySelector('[data-sc="rateInput"]').addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); saveRate(); }
          if (e.key === 'Escape') { e.preventDefault(); closeRate(); }
        });
        if (!S.rateKeyHandler) {
          S.rateKeyHandler = (e) => {
            if (e.key === 'Escape' && S.rateBox && !S.rateBox.classList.contains('sc-hidden')) closeRate();
          };
          document.addEventListener('keydown', S.rateKeyHandler);
        }
      }
      box.querySelector('[data-sc="rateTitle"]').textContent = meta.t;
      box.querySelector('[data-sc="rateHint"]').textContent = o.db
        ? meta.h + ' — saved to the database for every device.'
        : meta.h + ' — used immediately for this calculation.';
      box.querySelector('[data-sc="rateInput"]').value = getRate(kind) || '';
      box.classList.remove('sc-hidden');
      setTimeout(() => {
        const inp = box && box.querySelector('[data-sc="rateInput"]');
        if (inp) inp.focus();
      }, 60);
    }

    function closeRate() {
      if (S.rateBox) S.rateBox.classList.add('sc-hidden');
    }

    function saveRate() {
      const box = S.rateBox;
      if (!box) return;
      const inp = box.querySelector('[data-sc="rateInput"]');
      const v = parseFloat(inp ? inp.value : '');
      if (!Number.isFinite(v) || v <= 0) { notify('Enter a valid rate greater than 0', true); return; }
      const kind = S.rateKind;
      if (!kind || !RATE_META[kind]) { closeRate(); return; }
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
      if (el('accentCustom') && (kind === 'labAccent' || kind === 'natAccent')) el('accentCustom').value = v;
      if (el('fullCustom') && (kind === 'labFull' || kind === 'natFull')) el('fullCustom').value = v;
      S.lines = S.lines.map((l) => {
        if (kind === 'gold') {
          if (l.material === 'gold') l.goldPrice = v;
          if (Array.isArray(l.groups)) {
            l.groups.forEach((g) => { if (g.material === 'gold') g.goldPrice = v; });
          }
        }
        return engine().calculateLine(l);
      });
      S.editorGroups = S.editorGroups.map((g) => {
        if (kind === 'gold' && g.material === 'gold') g.goldPrice = v;
        return engine().calculateLine(g);
      });
      renderMixedGroups();
      renderLines();
      persist(patch);
      closeRate();
      syncLive();
      fireChange();
      notify(o.db ? 'Rate saved to the database' : 'Rate updated');
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
      if (n) { n.textContent = msg; n.style.color = isErr ? '#797979' : '#1d1d1d'; setTimeout(() => { if (n.textContent === msg) n.textContent = ''; }, 2600); }
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

    /* ───────────────────── numeric keyboards ─────────────────────
       Staff type teeth counts, stone counts and rates on a phone all day.
       `inputmode="numeric"` gives the compact number pad instead of the full
       letter keyboard; decimals keep a decimal point where it belongs. */
    function applyNumericInputModes() {
      host.querySelectorAll('input[type="number"]').forEach((inp) => {
        const step = String(inp.getAttribute('step') || '').toLowerCase();
        const decimal = step === 'any' || step === '0.01' || step === '0.1';
        /* an author-specified inputmode wins, but a numeric one without a
           decimal step is still treated as a whole number */
        if (!inp.hasAttribute('inputmode')) {
          inp.setAttribute('inputmode', decimal ? 'decimal' : 'numeric');
        }
        inp.setAttribute('enterkeyhint', 'done');
        inp.setAttribute('autocomplete', 'off');
      });
      if (global.Numpad) global.Numpad.attach(host);
    }
    applyNumericInputModes();

    if (global.Numpad) global.Numpad.bindGlobalClose();
    /* re-rendered lists (services, mixed groups) need the same treatment */
    const _renderServices = renderServices;
    renderServices = function () { _renderServices.apply(this, arguments); applyNumericInputModes(); };
    const _renderMixedGroups = renderMixedGroups;
    renderMixedGroups = function () { _renderMixedGroups.apply(this, arguments); applyNumericInputModes(); };
    const _renderLines = renderLines;
    renderLines = function () { _renderLines.apply(this, arguments); applyNumericInputModes(); };

    /* ───────────────────── editor ⇄ line (uniform & mixed-teeth) ───────────────────── */

    function readGroupFields() {
      const c = cfg();
      const material = el('material').value;
      const teeth = parseInt(el('teeth').value, 10);
      const level = el('level').value;
      const flags = (material === 'chrome' || material === 'titanium') ? { accent: false, full: false } : stoneFlags();
      const spec = {
        material,
        teeth,
        level,
        plating: el('plating').value,
        enamel: el('enamel').value,
        engraving: el('engraving').value,
        anodize: material === 'titanium' ? el('anodize').value : 'none',
      };
      const gl = el('groupLabel') ? (el('groupLabel').value || '').trim().slice(0, 40) : '';
      if (gl) spec.label = gl;
      if (!teeth || teeth < 1 || teeth > 16) return { error: 'Teeth must be between 1 and 16' };
      if (material === 'gold') {
        spec.karat = el('karat').value;
        const gp = parseFloat(el('goldPrice').value);
        if (!gp || gp <= 0) return { needRates: 'GOLD', error: "Enter today's gold EGP/g for the gold line" };
        spec.goldPrice = gp;
      }
      /* Accent stones and full iced cover are independent — both are read, so
         a tooth that is iced out can also carry accent stones. */
      if (flags.accent) {
        const count = parseInt(el('accentCount').value, 10) || 0;
        if (count < 1) return { error: 'Accent stones: count must be at least 1' };
        const type = el('accentType').value;
        const setting = el('accentSetting').value;
        let price = (c.accentPrice || {})[type];
        if (price === null || price === undefined) {
          price = parseFloat(el('accentCustom').value);
          if (price === null || isNaN(price) || price < 0) return { needRates: 'LAB_ACCENT', error: "Enter today's rate for Lab-Grown/Natural accent stones" };
        }
        spec.accent = {
          count, type, setting, price, customPrice: price,
          cut: el('accentCut') ? el('accentCut').value : 'round',
          size: el('accentSize') ? el('accentSize').value : '1',
        };
      }
      if (flags.full) {
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
          spec.full = {
            type, coverage, price, customPrice: price,
            cut: el('fullCut') ? el('fullCut').value : 'round',
            size: el('fullSize') ? el('fullSize').value : '1',
          };
        }
      }
      return { group: spec };
    }

    function readEditor() {
      const setName = el('name') ? (el('name').value || '').trim().slice(0, 40) : '';
      if (S.mixedMode && S.editorGroups.length > 0) {
        const cleanGs = S.editorGroups.map((g) => engine().cleanGroupSpec ? engine().cleanGroupSpec(g) : Object.assign({}, g)).filter(Boolean);
        if (cleanGs.length === 1) {
          const single = Object.assign({}, cleanGs[0]);
          delete single.label;
          single.name = setName;
          return { line: single };
        }
        const firstGold = cleanGs.find((g) => g.material === 'gold');
        const mixed = {
          name: setName,
          isMixed: true,
          material: cleanGs[0].material,
          teeth: cleanGs.reduce((s, g) => s + (Number(g.teeth) || 0), 0),
          level: 'mixed',
          groups: cleanGs,
        };
        if (firstGold) {
          mixed.karat = firstGold.karat || '18';
          if (firstGold.goldPrice) mixed.goldPrice = firstGold.goldPrice;
        }
        return { line: mixed };
      }
      const r = readGroupFields();
      if (r.error) return r;
      const spec = Object.assign({}, r.group, { name: setName });
      delete spec.label;
      return { line: spec };
    }

    function promptIfMissingRate(r) {
      if (!r || !r.error) return;
      notify(r.error, true);
      if (r.needRates === 'GOLD') askRate('gold');
      if (r.needRates === 'LAB_ACCENT') askRate(el('accentType').value === 'natural' ? 'natAccent' : 'labAccent');
      if (r.needRates === 'LAB_FULL') askRate(el('fullType').value === 'natural' ? 'natFull' : 'labFull');
    }

    function buildLine() {
      const r = readEditor();
      if (r.error) { promptIfMissingRate(r); return null; }
      return engine().calculateLine(r.line);
    }

    function writeGroupFields(g) {
      const grp = g || {};
      if (el('groupLabel')) el('groupLabel').value = grp.label || '';
      if (el('material')) el('material').value = grp.material || 'chrome';
      syncVisibility();
      if (el('teeth')) el('teeth').value = grp.teeth || 2;
      if (el('level')) el('level').value = String((grp.level && grp.level !== 'mixed') ? grp.level : '1');
      if (grp.material === 'gold') {
        if (el('karat')) el('karat').value = String(grp.karat || '18');
        if (el('goldPrice')) el('goldPrice').value = grp.goldPrice || getRate('gold') || '';
      }
      setStoneFlag('accent', !!grp.accent);
      setStoneFlag('full', !!grp.full);
      if (el('stones')) el('stones').value = grp.accent ? 'accent' : (grp.full ? 'fulliced' : 'none');
      onStonesChange();
      if (grp.accent) {
        if (el('accentCount')) el('accentCount').value = grp.accent.count || 1;
        if (el('accentType')) el('accentType').value = grp.accent.type || 'cz';
        onAccentTypeChange();
        if (el('accentSetting')) el('accentSetting').value = grp.accent.setting || 'flush';
        if (el('accentCut')) el('accentCut').value = grp.accent.cut || 'round';
        if (el('accentSize')) el('accentSize').value = grp.accent.size || '1';
        if ((cfg().accentPrice || {})[grp.accent.type] === null && grp.accent.price && el('accentCustom')) {
          el('accentCustom').value = grp.accent.price;
        }
      }
      if (grp.full && !grp.full.bars) {
        if (el('fullType')) el('fullType').value = grp.full.type || 'moissanite';
        onFullTypeChange();
        if (el('coverage')) el('coverage').value = grp.full.coverage || 'standardpave';
        if (el('fullCut')) el('fullCut').value = grp.full.cut || 'round';
        if (el('fullSize')) el('fullSize').value = grp.full.size || '1';
        if ((cfg().fullPrice || {})[grp.full.type] === null && grp.full.price && el('fullCustom')) {
          el('fullCustom').value = grp.full.price;
        }
      }
      if (el('plating')) el('plating').value = (grp.plating && grp.plating !== 'mixed') ? grp.plating : 'none';
      if (el('enamel')) el('enamel').value = (grp.enamel && grp.enamel !== 'mixed') ? grp.enamel : 'none';
      if (el('engraving')) el('engraving').value = (grp.engraving && grp.engraving !== 'mixed') ? grp.engraving : 'none';
      if (el('anodize')) el('anodize').value = (grp.anodize && grp.anodize !== 'mixed') ? grp.anodize : 'none';
      renderLevelStrip();
    }

    function writeEditor(line) {
      const src = line || {};
      if (el('name')) el('name').value = src.name || '';
      if (Array.isArray(src.groups) && src.groups.length > 1) {
        S.mixedMode = true;
        S.editingGroupId = null;
        S.editorGroups = src.groups.map((g) => {
          const priced = engine().calculateLine(g);
          if (g.label) priced.label = g.label;
          if (Array.isArray(g.toothIds) && g.toothIds.length) priced.toothIds = g.toothIds.slice();
          return priced;
        });
        writeGroupFields(Object.assign({}, S.editorGroups[0], { label: '', teeth: 2, accent: null, full: null }));
        syncMixedUi();
        renderMixedGroups();
        return;
      }
      S.mixedMode = false;
      S.editorGroups = [];
      S.editingGroupId = null;
      syncMixedUi();
      renderMixedGroups();
      writeGroupFields(Object.assign({ teeth: 6 }, src));
    }

    function syncMixedUi() {
      const on = !!S.mixedMode;
      if (el('modeUniform')) el('modeUniform').classList.toggle('on', !on);
      if (el('modeMixed')) el('modeMixed').classList.toggle('on', on);
      if (el('mixedWrap')) el('mixedWrap').classList.toggle('sc-hidden', !on);
      if (el('groupLabelWrap')) el('groupLabelWrap').classList.toggle('sc-hidden', !on);
      if (el('addGroupWrap')) el('addGroupWrap').classList.toggle('sc-hidden', !on);
      const isEdGrp = on && S.editingGroupId !== null && S.editorGroups[S.editingGroupId];
      if (el('groupFormTitle')) {
        el('groupFormTitle').textContent = isEdGrp
          ? `Editing tooth group #${S.editingGroupId + 1}`
          : 'Configure tooth group to add';
      }
      if (el('addGroupBtn')) {
        el('addGroupBtn').textContent = isEdGrp
          ? `Save tooth group #${S.editingGroupId + 1}`
          : '+ Add tooth group to this set';
      }
      if (el('cancelGroupEdit')) el('cancelGroupEdit').classList.toggle('sc-hidden', !isEdGrp);
    }

    function setMixedMode(on) {
      const next = !!on;
      if (S.mixedMode === next) return;
      if (!next && S.editorGroups.length > 0) {
        writeGroupFields(S.editorGroups[0]);
        S.editorGroups = [];
        S.editingGroupId = null;
      } else if (next && S.editorGroups.length === 0) {
        if (el('teeth') && Number(el('teeth').value) === 6) el('teeth').value = 2;
      }
      S.mixedMode = next;
      syncMixedUi();
      renderMixedGroups();
      syncLive();
      if (o.autoCalculate) calculate();
    }

    function addOrSaveGroup() {
      const r = readGroupFields();
      if (r.error) { promptIfMissingRate(r); return; }
      const priced = engine().calculateLine(r.group);
      if (r.group.label) priced.label = r.group.label;
      if (S.editingGroupId !== null && S.editorGroups[S.editingGroupId]) {
        const prevT = S.editorGroups[S.editingGroupId].toothIds;
        if (Array.isArray(prevT) && prevT.length && Number(priced.teeth) === prevT.length) {
          priced.toothIds = prevT.slice();
        }
        S.editorGroups[S.editingGroupId] = priced;
        S.editingGroupId = null;
        notify('Tooth group updated');
      } else {
        S.editorGroups.push(priced);
        notify(`Added ${priced.teeth} ${priced.teeth === 1 ? 'tooth' : 'teeth'} to set (${S.editorGroups.length} group${S.editorGroups.length > 1 ? 's' : ''})`);
      }
      if (el('groupLabel')) el('groupLabel').value = '';
      // Reset stones for next group while keeping same material/karat/plating for fast entry
      if (el('stones')) el('stones').value = 'none';
      setStoneFlag('accent', false);
      setStoneFlag('full', false);
      onStonesChange();
      syncMixedUi();
      renderMixedGroups();
      syncLive();
      if (o.autoCalculate) calculate();
    }

    function cancelGroupEdit() {
      S.editingGroupId = null;
      if (el('groupLabel')) el('groupLabel').value = '';
      syncMixedUi();
      renderMixedGroups();
    }

    function clearGroups() {
      S.editorGroups = [];
      S.editingGroupId = null;
      syncMixedUi();
      renderMixedGroups();
      syncLive();
    }

    function renderMixedGroups() {
      const list = el('groupsList');
      const empty = el('groupsEmpty');
      const sumBox = el('groupsSum');
      const clr = el('clearGroups');
      if (!list) return;
      const gs = S.editorGroups || [];
      if (empty) empty.classList.toggle('sc-hidden', gs.length > 0);
      if (clr) clr.classList.toggle('sc-hidden', gs.length === 0);
      if (sumBox) {
        sumBox.classList.toggle('sc-hidden', gs.length === 0);
        if (gs.length > 0) {
          const combined = engine().calculateLine({
            name: el('name') ? el('name').value : '',
            groups: gs.map((g) => engine().cleanGroupSpec ? engine().cleanGroupSpec(g) : g),
          });
          if (el('groupsSumLbl')) {
            el('groupsSumLbl').textContent = `${combined.teeth} ${combined.teeth === 1 ? 'tooth' : 'teeth'} across ${gs.length} group${gs.length > 1 ? 's' : ''}`;
          }
          if (el('groupsSumVal')) el('groupsSumVal').textContent = `Set subtotal: ${money(combined.subtotal)} EGP`;
        }
      }
      list.innerHTML = gs.map((g, i) => {
        const lbl = g.label ? `<strong>${esc(g.label)}:</strong> ` : `<strong>#${i + 1}:</strong> `;
        const desc = engine().groupLabel
          ? esc(engine().groupLabel(g, { includeMaterial: true }))
          : esc(`${g.teeth} teeth · L${g.level}`);
        return `<div class="sc-grp-row${S.editingGroupId === i ? ' editing' : ''}">
          <div class="sc-grp-main">${lbl}${desc}</div>
          <div style="display:flex;align-items:center;gap:7px;flex-shrink:0">
            <span class="sc-grp-price">${esc(money(g.subtotal))} EGP</span>
            <button type="button" class="sc-link" data-gedit="${i}">Edit</button>
            <button type="button" class="sc-link sc-link-danger" data-gdel="${i}">&times;</button>
          </div>
        </div>`;
      }).join('');
      list.querySelectorAll('[data-gedit]').forEach((b) => {
        b.addEventListener('click', () => {
          const i = Number(b.getAttribute('data-gedit'));
          if (!S.editorGroups[i]) return;
          S.editingGroupId = i;
          writeGroupFields(S.editorGroups[i]);
          syncMixedUi();
          renderMixedGroups();
        });
      });
      list.querySelectorAll('[data-gdel]').forEach((b) => {
        b.addEventListener('click', () => {
          const i = Number(b.getAttribute('data-gdel'));
          S.editorGroups.splice(i, 1);
          if (S.editingGroupId === i) S.editingGroupId = null;
          else if (S.editingGroupId !== null && S.editingGroupId > i) S.editingGroupId -= 1;
          syncMixedUi();
          renderMixedGroups();
          syncLive();
          if (o.autoCalculate) calculate();
        });
      });
    }

    function syncLive() {
      if (!o.designMode) return;
      const r = readEditor();
      const spec = el('liveSpec');
      const val = el('liveVal');
      if (!spec || !val) return;
      if (r.error) { spec.textContent = r.error; val.textContent = '—'; return; }
      const line = engine().calculateLine(r.line);
      spec.textContent = engine().lineLabel(line);
      val.textContent = money(line.subtotal) + ' EGP';
    }

    /* ───────────────────── lines list ───────────────────── */

    function lineLabel(line) {
      const L = labels();
      const name = (line.name || '').trim();
      if (line.isMixed && Array.isArray(line.groups) && line.groups.length > 1) {
        const mat = line.mixedMaterials
          ? 'Mixed Materials'
          : (line.material === 'gold' ? 'Gold ' + (line.karat || '18') + 'K' : ((L.material || {})[line.material] || line.material));
        const core = `${mat} · ${line.teeth} teeth · Mixed (${line.groups.length} groups)`;
        return name ? name + ' — ' + core : core;
      }
      const mat = line.material === 'gold' ? 'Gold ' + (line.karat || '18') + 'K' : ((L.material || {})[line.material] || line.material);
      const core = mat + ' · ' + line.teeth + ' ' + (Number(line.teeth) === 1 ? 'tooth' : 'teeth') + ' · ' + ((L.level || {})[line.level] || line.level);
      return name ? name + ' — ' + core : core;
    }

    function lineSubLabel(line) {
      if (line.isMixed && Array.isArray(line.groups) && line.groups.length > 1) {
        return line.groups.map((g) => {
          const pre = g.label ? g.label + ': ' : '';
          return pre + (engine().groupLabel ? engine().groupLabel(g, { includeMaterial: !!line.mixedMaterials }) : (g.teeth + 'T L' + g.level));
        }).join('  +  ');
      }
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
          else if (S.editingId !== null && S.editingId > idx) { S.editingId -= 1; }
          renderLines();
          fireChange();
        });
      });
    }

    function setEditorMode(mode) {
      const title = el('editorTitle');
      const btn = el('addLine');
      const cancel = el('cancelEdit');
      if (title) title.textContent = mode === 'edit' ? 'Editing set' : 'Set editor';
      if (btn) btn.textContent = mode === 'edit' ? 'Update this set' : o.addLineLabel;
      if (cancel) cancel.classList.toggle('sc-hidden', mode !== 'edit');
    }

    function addLine() {
      if (S.mixedMode && S.editingGroupId !== null && S.editorGroups[S.editingGroupId]) {
        addOrSaveGroup();
      }
      const line = buildLine();
      if (!line) return;
      const wasEdit = S.editingId !== null && S.editingId !== undefined && S.lines[S.editingId];
      if (wasEdit) {
        S.lines[S.editingId] = line;
        S.editingId = null;
        setEditorMode('add');
      } else {
        S.lines.push(line);
        if (el('name')) el('name').value = '';
      }
      if (S.mixedMode) {
        S.editorGroups = [];
        S.editingGroupId = null;
        syncMixedUi();
        renderMixedGroups();
      }
      renderLines();
      fireChange();
      notify(wasEdit ? 'Set updated' : 'Set added to quote');
    }

    function clearLines() {
      if ((S.lines.length || S.services.length) && !global.confirm('Remove all design lines and services from this quote?')) return;
      S.lines = []; S.services = []; S.editingId = null;
      S.editorGroups = []; S.editingGroupId = null;
      setEditorMode('add');
      syncMixedUi(); renderMixedGroups();
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

    function levelPctLabel(k) {
      if (k === '0.5') return 'half base';
      const dp = cfg().designPct || {};
      const pct = dp[k] !== undefined ? number(dp[k]) : number((LEVEL_INFO[k] || {}).pct);
      return '+' + pct + '%';
    }

    function renderLevelStrip() {
      const strip = el('levelStrip');
      if (!strip) return;
      const selected = el('level') ? el('level').value : '1';
      strip.innerHTML = Object.keys(LEVEL_INFO).map((k) => {
        const info = LEVEL_INFO[k];
        return `<button type="button" class="sc-chip${k === selected ? ' on' : ''}" data-level="${esc(k)}">
          <span class="sc-chip-t">${esc(k)} ${esc(info.name)}</span>
          <span class="sc-chip-s">${esc(levelPctLabel(k))}</span>
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
      guide.innerHTML = Object.keys(LEVEL_INFO).map((k) => {
        const info = LEVEL_INFO[k];
        return `<div class="sc-guide-card">
          <div class="sc-guide-top">
            <div style="min-width:0">
              <p class="sc-guide-title">${esc(k)} — ${esc(info.name)}</p>
              <p class="sc-guide-desc">${esc(info.desc)}</p>
            </div>
            <span class="sc-guide-pct">${esc(levelPctLabel(k))}</span>
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
          out.push('SET ' + (i + 1) + ': ' + lineLabel(l));
          if (l.isMixed && Array.isArray(l.groups) && l.groups.length > 1) {
            l.groups.forEach((g, gi) => {
              const gHead = g.label ? (g.label + ' — ') : ('Group ' + (gi + 1) + ': ');
              const gDesc = engine().groupLabel ? engine().groupLabel(g, { includeMaterial: true }) : (g.teeth + ' teeth · L' + g.level);
              out.push('  [' + (gi + 1) + '] ' + gHead + gDesc + ' = ' + money(g.subtotal) + ' EGP');
            });
            out.push('  Material total: ' + money(l.materialTotal) + ' EGP · Complexity: +' + money(l.designCost) + ' EGP'
              + (l.stoneCost ? ' · Stones: +' + money(l.stoneCost) + ' EGP' : '')
              + (l.platingCost ? ' · Plating: +' + money(l.platingCost) + ' EGP' : '')
              + (l.enamelCost ? ' · Enamel: +' + money(l.enamelCost) + ' EGP' : '')
              + (l.engravingCost ? ' · Engraving: +' + money(l.engravingCost) + ' EGP' : '')
              + (l.anodizeCost ? ' · Anodize: +' + money(l.anodizeCost) + ' EGP' : ''));
          } else {
            const materialLine = l.material === 'gold'
              ? 'Gold ' + l.karat + 'K @ ' + l.goldPrice + ' EGP/g → base/tooth = ' + money(l.base) + ' EGP'
              : ((L.material || {})[l.material] || l.material) + ' → base/tooth = ' + money(l.base) + ' EGP';
            const stoneBits = [];
            if (l.accent) {
              stoneBits.push('Accent × ' + l.accent.count + ' (' + ((L.accentType || {})[l.accent.type] || '') + ' ' + money(l.accentUnit) + ' + ' + ((L.setting || {})[l.accent.setting] || '') + ' ' + l.settingUnit + ') = ' + money(l.accentCost !== undefined ? l.accentCost : l.stoneCost) + ' EGP');
            }
            if (l.full && l.full.bars) {
              stoneBits.push('Full iced on Bars: ' + l.teeth + ' × ' + (c.barsStonesPerTooth || 400) + ' = ' + money(l.fullCost !== undefined ? l.fullCost : l.stoneCost) + ' EGP');
            } else if (l.full) {
              stoneBits.push('Full iced × ' + l.teeth + ' (' + ((L.accentType || {})[l.full.type] || '') + ' ' + money(l.fullUnit) + ' + ' + ((L.coverage || {})[l.full.coverage] || '') + ' ' + l.coverageUnit + ') = ' + money(l.fullCost !== undefined ? l.fullCost : l.stoneCost) + ' EGP');
            }
            const stoneLine = stoneBits.length ? stoneBits.join('  +  ') + '  →  ' + money(l.stoneCost) + ' EGP' : 'None';
            out.push('  Material: ' + materialLine + ' → ' + money(l.materialTotal) + ' EGP');
            out.push('  Design: ' + (l.level === '0.5' ? '0 (Bars)' : '+' + l.designPct + '% = ' + money(l.designCost) + ' EGP'));
            out.push('  Stones: ' + stoneLine);
            out.push('  Plating: ' + ((L.plating || {})[l.plating] || l.plating) + ' → ' + money(l.platingCost) + ' EGP');
            out.push('  Enamel: ' + ((L.enamel || {})[l.enamel] || l.enamel) + ' → ' + money(l.enamelCost) + ' EGP');
            out.push('  Engraving: ' + ((L.engraving || {})[l.engraving] || l.engraving) + ' → ' + money(l.engravingCost) + ' EGP');
            if (l.anodizeCost) out.push('  Anodizing: ' + ((L.anodize || {})[l.anodize] || l.anodize) + ' → ' + money(l.anodizeCost) + ' EGP');
          }
          out.push('  Set subtotal: ' + money(l.subtotal) + ' EGP');
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
        try {
          if (engine() && typeof engine().encodeCode === 'function') {
            const qCode = engine().encodeCode(order);
            if (qCode) { out.push(''); out.push('Transfer Code: ' + qCode); }
          }
        } catch (e) {}
        el('resultText').textContent = out.join('\n');
        el('result').classList.remove('sc-hidden');
      }

      S.lastQuote = order;
      if (typeof o.onCalculate === 'function') {
        try { o.onCalculate(order, el('resultText') ? el('resultText').textContent : ''); } catch (e) {}
      }
      return order;
    }

    /* ───────────────────── universal short code (export / import) ───────────────────── */

    function exportCode(opts) {
      const E = engine();
      if (!E || typeof E.encodeCode !== 'function') return '';
      if (o.designMode) {
        const r = readEditor();
        if (r.error) { promptIfMissingRate(r); return ''; }
        return E.encodeCode(r.line, opts);
      }
      let extra = {};
      if (typeof o.getExtraCodeData === 'function') {
        try { extra = o.getExtraCodeData() || {}; } catch (e) { extra = {}; }
      }
      let lines = Array.isArray(extra.lines) && extra.lines.length
        ? extra.lines
        : S.lines.slice();
      const services = Array.isArray(extra.services) ? extra.services : S.services.slice();
      if (!lines.length && !services.length) {
        const r = readEditor();
        if (r.error) { promptIfMissingRate(r); return ''; }
        lines = [r.line];
      }
      const payload = {
        lines,
        services,
        timeline: extra.timeline || (el('timeline') ? el('timeline').value : 'standard'),
        mold: extra.mold || (el('mold') ? el('mold').value : 'none'),
        depositPct: extra.depositPct !== undefined
          ? Number(extra.depositPct) || 0
          : (el('deposit') ? (parseInt(el('deposit').value, 10) || 0) : 0),
        discount: extra.discount || null,
        clientName: extra.clientName || (el('clientName') ? el('clientName').value : ''),
        clientPhone: extra.clientPhone || '',
        notes: extra.notes || (el('clientNotes') ? el('clientNotes').value : ''),
      };
      return E.encodeCode(payload, opts);
    }

    function copyText(text, okMsg) {
      if (!text) return;
      const done = () => notify(okMsg || 'Copied');
      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, okMsg));
      } else {
        fallbackCopy(text, okMsg);
      }
    }

    function copyCode(opts) {
      const code = exportCode(opts);
      if (!code) return '';
      S.lastCode = code;
      const out = el('codeOut');
      if (out) {
        out.textContent = code;
        out.classList.remove('sc-hidden');
      }
      if (el('codeInput')) el('codeInput').value = code;
      copyText(code, 'Code copied: ' + (code.length > 32 ? code.slice(0, 30) + '…' : code));
      return code;
    }

    function importCode(raw, opts) {
      const E = engine();
      if (!E || typeof E.decodeCode !== 'function') { notify('Code reader unavailable', true); return null; }
      const decoded = E.decodeCode(raw);
      if (!decoded) {
        notify('Invalid code — paste an EGZ-... or EGZ1:... code', true);
        return null;
      }

      // Apply any gold / lab / natural rates embedded in the code when missing locally
      const r = decoded.rates || {};
      const curCfg = cfg();
      const ratePatch = {};
      if (r.gold && !number(curCfg.goldPrice)) ratePatch.goldPrice = r.gold;
      if (r.labAccent && !number((curCfg.accentPrice || {}).labgrown)) {
        ratePatch.accentPrice = Object.assign({}, curCfg.accentPrice || {}, ratePatch.accentPrice || {}, { labgrown: r.labAccent });
      }
      if (r.natAccent && !number((curCfg.accentPrice || {}).natural)) {
        ratePatch.accentPrice = Object.assign({}, curCfg.accentPrice || {}, ratePatch.accentPrice || {}, { natural: r.natAccent });
      }
      if (r.labFull && !number((curCfg.fullPrice || {}).labgrown)) {
        ratePatch.fullPrice = Object.assign({}, curCfg.fullPrice || {}, ratePatch.fullPrice || {}, { labgrown: r.labFull });
      }
      if (r.natFull && !number((curCfg.fullPrice || {}).natural)) {
        ratePatch.fullPrice = Object.assign({}, curCfg.fullPrice || {}, ratePatch.fullPrice || {}, { natural: r.natFull });
      }
      if (Object.keys(ratePatch).length) E.set(ratePatch);

      const pricedLines = (decoded.lines || []).map((ln) => E.calculateLine(ln));
      const pricedSvcs = (decoded.services || []).map((sv) => E.calculateService(sv));

      if (o.designMode) {
        if (pricedLines.length) {
          writeEditor(pricedLines[0]);
          syncLive();
        }
        if (typeof o.onImportCode === 'function') {
          try { o.onImportCode(decoded, pricedLines, pricedSvcs); } catch (e) {}
        }
        const opt = opts || {};
        if (!opt.silent) {
          notify(pricedLines.length > 1
            ? `Code loaded (${pricedLines.length} sets)`
            : 'Code loaded into calculator');
        }
        return decoded;
      }

      S.lines = pricedLines;
      S.editingId = null;
      setEditorMode('add');
      if (pricedLines.length === 1) {
        writeEditor(pricedLines[0]);
      } else if (pricedLines.length > 1) {
        S.mixedMode = false; S.editorGroups = []; S.editingGroupId = null;
        syncMixedUi(); renderMixedGroups();
      }
      if (parts.services) {
        S.services = pricedSvcs;
        renderServices();
      }
      if (el('timeline') && decoded.timeline) el('timeline').value = decoded.timeline;
      if (el('mold') && decoded.mold) el('mold').value = decoded.mold;
      if (el('deposit') && decoded.depositPct !== undefined) {
        const depStr = String(decoded.depositPct || 0);
        if (Array.from(el('deposit').options).some((op) => op.value === depStr)) {
          el('deposit').value = depStr;
        }
      }
      if (el('clientName') && decoded.clientName) el('clientName').value = decoded.clientName;
      if (el('clientNotes') && decoded.notes) el('clientNotes').value = decoded.notes;
      renderLines();

      if (typeof o.onImportCode === 'function') {
        try { o.onImportCode(decoded, pricedLines, pricedSvcs); } catch (e) {}
      }
      fireChange();
      if (parts.result) calculate();

      const opt = opts || {};
      if (!opt.silent) {
        const bits = [];
        if (pricedLines.length) bits.push(`${pricedLines.length} set${pricedLines.length > 1 ? 's' : ''}`);
        if (pricedSvcs.length) bits.push(`${pricedSvcs.length} service${pricedSvcs.length > 1 ? 's' : ''}`);
        notify('Code loaded: ' + (bits.join(' + ') || 'ready'));
      }
      return decoded;
    }

    function copyResult() {
      const text = el('resultText') ? el('resultText').textContent : '';
      copyText(text, 'Copied');
    }

    function fallbackCopy(text, okMsg) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        notify(okMsg || 'Copied');
      } catch (e) { notify('Copy failed', true); }
    }

    function apply() {
      if (S.mixedMode && S.editingGroupId !== null && S.editorGroups[S.editingGroupId]) {
        addOrSaveGroup();
      }
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

  function splitSettingPath(path) {
    if (path.indexOf('designPct.') === 0) return ['designPct', path.slice('designPct.'.length)];
    return path.split('.');
  }
  function readPath(obj, path) {
    return splitSettingPath(path).reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
  }
  function writePath(obj, path, value) {
    const keys = splitSettingPath(path);
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
          const empty = inp.value === '';
          const isStone = /^(accentPrice|fullPrice)\./.test(path);
          const num = Number(inp.value);
          const value = empty ? (isStone ? null : 0) : (Number.isFinite(num) ? num : 0);
          const patch = {};
          writePath(patch, path, value);
          E.set(patch);
        });
      });

      const saveBtn = host.querySelector('[data-set="save"]');
      const resetBtn = host.querySelector('[data-set="reset"]');

      saveBtn.addEventListener('click', async () => {
        const status = host.querySelector('[data-set="status"]');
        if (!o.db) { status.textContent = 'Not connected to the database.'; return; }
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        status.textContent = 'Saving…';
        try {
          await E.save(o.db);
          status.textContent = 'Saved to the database — every page now uses these numbers.';
          if (typeof o.onSaved === 'function') o.onSaved(E.get());
        } catch (err) {
          status.textContent = 'Could not save: ' + ((err && err.message) || err);
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save to database';
        }
        setTimeout(() => { if (status && status.textContent.indexOf('Saved') === 0) status.textContent = ''; }, 4000);
      });

      resetBtn.addEventListener('click', async () => {
        if (typeof global.confirm === 'function' && !global.confirm('Reset every pricing setting to its default?')) return;
        resetBtn.disabled = true;
        const status = host.querySelector('[data-set="status"]');
        if (status) status.textContent = 'Resetting…';
        E.reset();
        let saveErr = null;
        if (o.db) {
          try { await E.save(o.db); } catch (e) { saveErr = e; }
        }
        render();
        const st2 = host.querySelector('[data-set="status"]');
        if (st2) {
          st2.textContent = saveErr
            ? 'Reset locally, but could not save: ' + (saveErr.message || saveErr)
            : 'Defaults restored and saved.';
        }
        if (typeof o.onSaved === 'function') o.onSaved(E.get());
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
})(typeof globalThis !== 'undefined' ? globalThis : window);
