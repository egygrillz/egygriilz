(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const ACTIVE_KEY = 'egygz_order_sheet_active_v1',
    DRAFTS_KEY = 'egygz_order_sheet_drafts_v1';
  const MATERIALS = {
    chrome: { label: 'Cobalt Chrome', color: '#aeb7bd', ink: '#4f5f6a', edge: '#45525b' },
    silver: { label: 'Sterling Silver 925', color: '#d8dce0', ink: '#7d8790', edge: '#68747c' },
    gold: { label: 'Gold', color: '#d7b35d', ink: '#a9780f', edge: '#7d5810' },
    titanium: { label: 'Titanium', color: '#778b9d', ink: '#2f4a60', edge: '#34495b' },
  };
  const FINISH_DEFAULTS = {
    chrome: {
      none: '#aeb7bd',
      yellowgold: '#c5a04c',
      whitegold: '#dce1e4',
      rosegold: '#c8958f',
      blackgold: '#625f60',
      silverplating: '#dce1e4',
    },
    silver: {
      none: '#d8dce0',
      yellowgold: '#cba450',
      whitegold: '#e1e6e8',
      rosegold: '#cd9993',
      blackgold: '#676364',
      silverplating: '#e5e9eb',
    },
    gold: {
      none: '#d7b35d',
      yellowgold: '#d7b35d',
      whitegold: '#dad4bf',
      rosegold: '#c6886a',
      blackgold: '#60523a',
      silverplating: '#ded8c1',
    },
    titanium: {
      none: '#778b9d',
      yellowgold: '#b59342',
      whitegold: '#ccd4db',
      rosegold: '#b78886',
      blackgold: '#515256',
      silverplating: '#d0d8dd',
    },
  };

  const MAX_STONES_PER_TOOTH = 220;
  const toothBoxes = new Map();
  const CHART_VIEW = { x: 0, y: 84, width: 900, height: 330.6 };
  const GEM_CUTS = [
    ['round', 'Round brilliant'],
    ['princess', 'Princess'],
    ['cushion', 'Cushion'],
    ['emerald', 'Emerald'],
    ['oval', 'Oval'],
    ['pear', 'Pear'],
    ['radiant', 'Radiant'],
    ['heart', 'Heart'],
    ['marquise', 'Marquise'],
    ['straight-baguette', 'Straight baguette'],
    ['tapered-baguette', 'Tapered baguette'],
  ];
  const GEM_COLORS = [
    ['clear', '#f6f8fb'],
    ['yellow', '#f4d35e'],
    ['blue', '#6cb5e8'],
    ['pink', '#ec8fbd'],
    ['green', '#55b889'],
    ['red', '#db5058'],
    ['black', '#393941'],
    ['champagne', '#c99c61'],
    ['purple', '#9a72db'],
    ['aqua', '#45c7c9'],
    ['orange', '#ee8b43'],
    ['teal', '#168f88'],
    ['brown', '#895b43'],
  ];
  const DIAMOND_FILE = (id) =>
    `/diamonds/${encodeURIComponent(id === 'round' ? 'round-brilliant' : id)}-cut.webp`;
  const gemSpriteCache = new Map();
  const mixHex = (a, b, t) => {
    const h = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
    const A = h(a),
      B = h(b);
    return (
      '#' +
      A.map((v, i) =>
        Math.round(v * t + B[i] * (1 - t))
          .toString(16)
          .padStart(2, '0'),
      ).join('')
    );
  };
  const smoothD = (pts, fmt) => {
    if (!pts.length) return '';
    let d = 'M' + fmt(pts[0]);
    if (pts.length < 3) return d + (pts.length > 1 ? ' L' + fmt(pts[pts.length - 1]) : ' l0.1 0.1');
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2,
        my = (pts[i].y + pts[i + 1].y) / 2;
      d += ' Q' + fmt(pts[i]) + ' ' + fmt({ x: mx, y: my });
    }
    return d + ' L' + fmt(pts[pts.length - 1]);
  };
  let svgChart = null,
    canvasCtx = null,
    appointmentClients = [],
    zoom = 1,
    renderedZoom = 1,
    activeStroke = null,
    pricingSource = 'loading',
    records = null,
    currentOrder = null,
    orderBlock = '',
    savingQuote = false,
    staffUser = null,
    savedDesignDocs = new Map(),
    printDesignMapHtml = '',
    printDesignMapDirty = true,
    capturingPrintMap = false;
  const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
  const GROUP_TONES = [
    ['#b7b7b2', '#f0f0ed'],
    ['#777772', '#e6e6e2'],
    ['#999993', '#ededeb'],
    ['#555550', '#e2e2de'],
    ['#aaa9a2', '#f2f2f0'],
  ];
  const esc = (s) =>
    String(s == null ? '' : s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const makeOrderNo = () =>
    `EGZ-${today().replace(/-/g, '').slice(2)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  function blankState() {
    return {
      id: '',
      orderNo: makeOrderNo(),
      clientName: '',
      clientPhone: '',
      date: today(),
      deliveryDate: '',
      reference: '',
      status: 'Draft',
      clientEmail: '',
      selectedTeeth: [],
      toothMaterials: {},
      ink: [],
      gems: [],
      designLayers: [],
      activeDesignId: '',
      showAllDesigns: false,
      selectedGemId: '',
      freeDraw: false,
      drawMode: false,
      isolateDrawn: false,
      isolateDesign: false,
      newDesignSelection: true,
      pendingToothSpecs: {},
      zoom: 1,
      priceMode: 'auto',
      timeline: 'standard',
      mold: 'none',
      groups: [],
      designMode: 'single',
      services: [],
      productionStage: 'consultation',
      productionChecks: {},
      notes: '',
      price: '',
      deposit: '',
      paymentMethod: 'Not decided',
      depositAuto: true,
      agreement: false,
      signature: '',
      editor: {
        name: '',
        material: 'Cobalt Chrome',
        karat: '18K',
        level: '1 Solid',
        plating: 'None',
        enamel: 'None',
        engraving: 'None',
        productionEffect: 'standard',
        stoneMode: 'none',
        accentType: 'CZ',
        setting: 'Flush',
        accentCount: '4',
        diamondType: 'Moissanite',
        coverage: 'Standard pavé',
        stoneNotes: '',
        laserStyle: 'material',
      },
    };
  }
  function loadActive() {
    try {
      const raw = localStorage.getItem(ACTIVE_KEY);
      if (!raw) return blankState();
      return Object.assign(blankState(), JSON.parse(raw));
    } catch (e) {
      return blankState();
    }
  }
  let state = loadActive(),
    toastTimer = 0,
    signatureDirty = false;
  function normalizeDesignState() {
    const defaults = blankState(),
      teeth = (arr) => [
        ...new Set(
          (Array.isArray(arr) ? arr : []).map(Number).filter((t) => UPPER.includes(t) || LOWER.includes(t)),
        ),
      ];
    state.editor = { ...defaults.editor, diamondCut: 'round', gemColor: 'clear', ...state.editor };
    for (const k of ['clientName', 'clientPhone', 'clientEmail', 'notes']) state[k] = String(state[k] || '');
    state.selectedTeeth = teeth(state.selectedTeeth);
    for (const k of ['groups', 'gems', 'ink', 'services', 'icedTeeth', 'designLayers'])
      if (!Array.isArray(state[k])) state[k] = [];
    state.pendingToothSpecs = state.pendingToothSpecs || {};
    state.toothMaterials = state.toothMaterials || {};
    state.designLayers = state.designLayers.map((l) => ({
      ...l,
      teeth: teeth(l.teeth),
      materials: l.materials || {},
      visible: l.visible !== false,
    }));
    // Older local sheets pre-date layers. Keep their design specs, tooth IDs and artwork.
    for (const g of state.groups) {
      g.teeth = teeth(g.teeth);
      g.id = g.id || crypto.randomUUID();
      let layer = state.designLayers.find((l) => l.id === g.layerId);
      if (!layer) {
        layer = {
          id: g.layerId || crypto.randomUUID(),
          name: g.name || 'Design',
          teeth: [],
          materials: {},
          visible: true,
        };
        state.designLayers.push(layer);
        g.layerId = layer.id;
      }
      layer.teeth = teeth([...layer.teeth, ...g.teeth]);
      g.teeth.forEach((t) => {
        layer.materials[t] ??= materialForGroup(g.material);
      });
    }
    if (!state.designLayers.length)
      state.designLayers.push({ id: 'design-1', name: 'Design 1', teeth: [], materials: {}, visible: true });
    if (!state.designLayers.some((l) => l.id === state.activeDesignId))
      state.activeDesignId = state.designLayers[0].id;
    for (const mark of [...state.ink, ...state.gems, ...state.icedTeeth]) {
      mark.tooth = Number(mark.tooth) || 0;
      if (!mark.designId)
        mark.designId =
          state.designLayers.find((l) => l.teeth.includes(mark.tooth))?.id || state.activeDesignId;
    }
    // Hydrate v1 specs once, retaining their pricing until explicitly reviewed.
    const oldLayers = new Set(
      state.groups.filter((g) => !Array.isArray(g.pricedStones)).map((g) => g.layerId),
    );
    OrderDesign.migrateLegacy(state);
    for (const layer of state.designLayers) {
      const groups = state.groups.filter((g) => g.layerId === layer.id);
      if (oldLayers.has(layer.id)) layer.legacy = true;
      layer.mode ||= groups.length > 1 ? 'mix' : 'single';
      if (!layer.details) {
        layer.details = {};
        for (const g of groups)
          for (const t of g.teeth)
            layer.details[layer.mode === 'mix' ? t : 'all'] = {
              ...Object.fromEntries(
                Object.keys(OrderDesign.defaults)
                  .filter((k) => g[k] != null)
                  .map((k) => [k, g[k]]),
              ),
            };
      }
      if (groups.length) layer.revision ??= OrderDesign.revision(state, layer);
      else if (layer.teeth.length) layer.draft = true;
    }
    if (state.editingGroupId && !state.newDesignSelection) {
      state.reviewLayerId = state.activeDesignId;
      state.editingGroupId = '';
      state.selectedTeeth = [];
    }
    if (!state.designLayers.find((l) => l.id === state.activeDesignId)?.teeth.length)
      state.newDesignSelection = true;
    state.tool = state.newDesignSelection
      ? 'select'
      : ['select', 'erase', undefined].includes(state.tool)
        ? 'draw'
        : state.tool;
    state.productionChecks = state.productionChecks || {};
  }
  normalizeDesignState();
  const assignedIds = () => new Set(state.groups.flatMap((g) => g.teeth || []));
  const assignedGroupFor = (id) => state.groups.findIndex((g) => (g.teeth || []).includes(id));
  function notify(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }
  function persist() {
    try {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(state));
      $('#save-status').textContent = 'Saved on this device';
    } catch (e) {
      $('#save-status').textContent = 'Browser storage is full';
    }
  }
  function syncInputs() {
    $$('[data-field]').forEach((el) => {
      const k = el.dataset.field;
      if (el.type === 'checkbox') el.checked = !!state[k];
      else el.value = state[k] == null ? '' : state[k];
    });
    $('#free-draw-outside').checked = !!state.freeDraw;
    $$('[data-editor]').forEach((el) => {
      const k = el.dataset.editor;
      el.value = state.editor[k] == null ? '' : state.editor[k];
    });
    $('#order-number-badge').textContent = state.orderNo;
    syncSignature(true);
  }
  function activeLayer() {
    return state.designLayers.find((l) => l.id === state.activeDesignId) || state.designLayers[0];
  }
  function visibleLayerIds() {
    if (state.newDesignSelection && !state.showAllDesigns && !capturingPrintMap) return new Set();
    return state.showAllDesigns
      ? new Set(state.designLayers.filter((l) => l.visible !== false).map((l) => l.id))
      : new Set([state.activeDesignId]);
  }
  function renderDesignLayers() {
    const host = $('#design-layers');
    if (!host) return;
    host.innerHTML = '';
    state.designLayers
      .filter((l) => l.teeth.length)
      .forEach((layer, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className =
          'design-layer-chip' + (layer.id === state.activeDesignId && !state.showAllDesigns ? ' active' : '');
        button.dataset.layer = layer.id;
        button.setAttribute(
          'aria-pressed',
          String(!state.newDesignSelection && !state.showAllDesigns && layer.id === state.activeDesignId),
        );
        const content = document.createElement('span');
        content.textContent = layer.name || `Design ${index + 1}`;
        const count = document.createElement('small');
        count.textContent = `${layer.teeth.length} teeth${layerPending(layer) ? ' · needs review' : ''}`;
        button.append(content, count);
        host.appendChild(button);
      });
    $('#active-layer-label').textContent = state.newDesignSelection
      ? 'New selection'
      : state.showAllDesigns
        ? 'All designs together'
        : activeLayer()?.name || 'Design layer';
    $('.design-layer-tools').hidden = !state.designLayers.some((l) => l.teeth.length);
    $('#show-all-designs').hidden = state.designLayers.filter((l) => l.teeth.length).length < 2;
    $('#isolate-design').hidden = state.newDesignSelection;
    $('#show-all-designs').classList.toggle('active', !!state.showAllDesigns);
    $('#show-all-designs').textContent = state.showAllDesigns ? 'Isolate active design' : 'View all together';
  }
  const levels = [
    '0.5 Bars',
    '1 Solid',
    '2 Open face',
    '3 Mid detail',
    '4 Complex',
    '5 Scorpion',
    '6 Ultimate',
  ];
  const platings = ['None', 'Yellow gold', 'White gold', 'Rose gold', 'Black gold', 'Silver plating'];
  const types = ['CZ', 'Moissanite', 'Lab-grown diamond', 'Natural diamond'];
  const options = (values, current) =>
    values.map((v) => `<option ${v === current ? 'selected' : ''}>${esc(v)}</option>`).join('');
  function renderDesignMode() {
    const selecting = state.newDesignSelection,
      layer = activeLayer();
    $('#design-mode').value = state.designMode;
    $('#design-mode').disabled = $('#group-name').disabled = !selecting;
    $$('.material-chip').forEach((b) => (b.disabled = !selecting));
    $('#design-mode-hint').textContent = selecting
      ? 'Tap tooth outlines to select or deselect. The material colours your pencil, not the tooth.'
      : `Working on ${layer.name}. Start a new selection to add another design.`;
    $('#design-groups-title').textContent = 'Added designs';
    $('#design-groups-help').textContent = 'Only the applied design details below go to the calculator.';
    $('#apply-design').disabled = selecting && !state.selectedTeeth.length;
    $('#apply-design').textContent = selecting ? 'Start drawing →' : 'Finish drawing → Design details';
    $('#apply-hint').textContent = selecting
      ? 'Choose at least one tooth to open a drawing layer.'
      : 'Done sketching? Review this layer before adding its price.';
    $('#discard-design').hidden = selecting || !layer.draft;
    $('[data-action="clear-selection"]').hidden = !selecting;
    $('#undo-ink').disabled =
      selecting || ![...state.ink, ...state.gems].some((x) => x.designId === layer.id);
    renderMixedToothSpecs();
    renderDetailForm();
  }
  function renderMixedToothSpecs() {
    const host = $('#mixed-tooth-specs');
    host.hidden = !state.newDesignSelection || state.designMode !== 'mix' || !state.selectedTeeth.length;
    host.innerHTML = host.hidden
      ? ''
      : '<p class="micro-label">Material per tooth</p><div class="detail-grid">' +
        state.selectedTeeth
          .map(
            (id) =>
              `<label>FDI ${id}<select data-mix-tooth="${id}" data-mix-field="material">${options(
                Object.values(MATERIALS).map((m) => m.label),
                state.pendingToothSpecs[id]?.material || state.editor.material,
              )}</select></label>`,
          )
          .join('') +
        '</div>';
  }
  function renderDetailForm() {
    const layer = activeLayer(),
      card = $('#design-review-card');
    card.hidden = state.newDesignSelection || state.reviewLayerId !== layer.id;
    if (card.hidden) {
      $('#review-fields').replaceChildren();
      return;
    }
    const facts = OrderDesign.inspect(state, layer),
      cfg = CalcEngine.get();
    $('#detail-heading').textContent = layer.name + ' · Design details';
    $('#detail-caption').textContent = layer.legacy
      ? 'Imported specification. Applying this review replaces the original priced details with the effects currently drawn.'
      : 'Check the finish and the effects used in this drawing. Applying these details updates the estimate.';
    const rows = layer.mode === 'mix' ? layer.teeth.map((id) => [id, [id]]) : [['all', layer.teeth]];
    $('#review-fields').innerHTML = rows
      .map(([key, ids]) => {
        const d = { ...OrderDesign.defaults, ...layer.details?.[key] },
          marks = ids.map((id) => facts.get(id));
        const field = (label, k, choices) =>
          `<label>${label}<select data-detail="${k}" data-row="${key}">${options(choices, d[k])}</select></label>`;
        const rate = (label, k) =>
          `<label>${label}<input data-detail="${k}" data-row="${key}" type="number" min="0" step="any" required placeholder="EGP" value="${esc(d[k])}"></label>`;
        const colors = [...new Set(marks.flatMap((m) => [...m.colors]))],
          stones = marks.flatMap((m) => m.stones),
          iced = ids.filter((id) => facts.get(id).ice);
        const materials = [
          ...new Set(ids.map((id) => MATERIALS[materialForGroup(layer.materials[id])].label)),
        ];
        return `<fieldset class="detail-row"><legend>FDI ${ids.join(' · ')} &nbsp; / &nbsp; ${esc(materials.join(' + '))}</legend><div class="detail-grid">${field('Design level', 'level', levels)}${field('Plating', 'plating', platings)}${materials.includes('Gold') ? field('Gold purity', 'karat', ['10K', '14K', '18K', '21K', '22K']) : ''}${marks.some((m) => m.laser) ? field('Laser engraving size', 'engraving', ['Small', 'Medium', 'Large']) : ''}</div>
      ${colors.length ? `<div class="detail-effect"><strong>Enamel · ${OrderDesign.tier(colors.length)}</strong><span>${colors.map((c) => `<i class="colour-chip" style="--colour:${c}"></i>${c}`).join(' · ')}</span></div>` : ''}
      ${
        stones.length
          ? `<div class="detail-effect"><strong>Hand-set stones · ${stones.length}</strong><span>${Object.entries(
              stones.reduce((acc, s) => {
                const k = [s.color || 'clear', s.cut || 'round', `${s.sizeMm || 1} mm`].join(' / ');
                acc[k] = (acc[k] || 0) + 1;
                return acc;
              }, {}),
            )
              .map(([k, n]) => `${n} × ${esc(k)}`)
              .join(
                ' · ',
              )}</span><div class="detail-grid">${field('Stone type', 'accentType', types)}${field('Setting', 'setting', ['Flush', '2-Prong', '3-Prong', '4-Prong', '6-Prong', 'Bezel full', 'Bezel half', 'Bar setting', 'Channel'])}${cfg.accentPrice[stoneKey(d.accentType)] == null ? rate('Unlisted rate · EGP per stone', 'accentCustomPrice') : ''}</div></div>`
          : ''
      }
      ${iced.length ? `<div class="detail-effect"><strong>Iced coverage · FDI ${iced.join(', ')}</strong><div class="detail-grid">${field('Diamond type', 'diamondType', types)}${field('Coverage', 'coverage', ['Standard pavé', 'French pavé', 'Micro-pavé', 'Channel', 'Invisible'])}${cfg.fullPrice[stoneKey(d.diamondType)] == null && d.level !== '0.5 Bars' ? rate('Unlisted rate · EGP per tooth', 'fullCustomPrice') : ''}</div></div>` : ''}</fieldset>`;
      })
      .join('');
  }
  function reviewDesign() {
    state.reviewLayerId = activeLayer().id;
    renderDesignMode();
    persist();
    $('#design-review-card').scrollIntoView({ block: 'start' });
    $('#review-fields select')?.focus({ preventScroll: true });
  }
  function applyDesign() {
    if (!state.newDesignSelection) {
      reviewDesign();
      return;
    }
    const teeth = [...state.selectedTeeth];
    if (!teeth.length) return;
    const name =
      state.editor.name.trim() || `Design ${state.designLayers.filter((l) => l.teeth.length).length + 1}`;
    const layer = {
      id: crypto.randomUUID(),
      name,
      mode: state.designMode,
      teeth,
      details: {},
      draft: true,
      visible: true,
      materials: Object.fromEntries(
        teeth.map((t) => [
          t,
          materialForGroup(
            (state.designMode === 'mix' && state.pendingToothSpecs[t]?.material) || state.editor.material,
          ),
        ]),
      ),
    };
    state.designLayers = state.designLayers.filter((l) => l.teeth.length);
    state.designLayers.push(layer);
    activateLayer(layer);
    notify('Layer ready. Sketch, or finish now for a plain design.');
  }
  function activateLayer(layer) {
    state.activeDesignId = layer.id;
    state.showAllDesigns = false;
    state.isolateDesign = false;
    state.newDesignSelection = false;
    state.selectedTeeth = [];
    state.pendingToothSpecs = {};
    state.selectedGemId = '';
    state.editingGroupId = '';
    state.reviewLayerId = '';
    state.designMode = layer.mode || 'single';
    state.editor.name = layer.name;
    state.editor.materialKey = materialForGroup(layer.materials[layer.teeth[0]]);
    state.editor.material = MATERIALS[state.editor.materialKey].label;
    syncInputs();
    setTool('draw');
    renderAll();
    persist();
  }
  function saveDesignDetails() {
    const layer = activeLayer();
    if (layer.id !== state.reviewLayerId) return;
    const invalid = $('#review-fields input:invalid');
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    if (layer.legacy && !confirm('Replace the imported pricing specification with the details shown here?'))
      return;
    const oldGroups = state.groups.filter((g) => g.layerId === layer.id),
      specs = OrderDesign.compile(layer, OrderDesign.inspect(state, layer));
    const groups = specs.map((g) => ({
      ...g,
      id: oldGroups.find((old) => String(old.teeth) === String(g.teeth))?.id || crypto.randomUUID(),
      layerId: layer.id,
    }));
    const start = state.groups.findIndex((g) => g.layerId === layer.id);
    state.groups = state.groups.filter((g) => g.layerId !== layer.id);
    state.groups.splice(start < 0 ? state.groups.length : start, 0, ...groups);
    layer.draft = false;
    delete layer.legacy;
    layer.revision = JSON.stringify(specs);
    state.reviewLayerId = '';
    renderAll();
    persist();
    notify('Design details applied to the estimate');
  }
  function renderProductionChecklist() {
    const checks = state.productionChecks || {},
      done = ['measurements', 'materials', 'stones', 'artwork'].every((k) => !!checks[k]);
    $('#production-readiness').textContent = done
      ? 'Production handoff ready — all checks confirmed.'
      : 'Production handoff checklist not complete.';
    $('#production-readiness').classList.toggle('ready', done);
    $$('[data-production-check]').forEach((el) => (el.checked = !!checks[el.dataset.productionCheck]));
  }
  function renderServiceRows() {
    const host = $('#order-services-list');
    if (!host) return;
    host.innerHTML =
      (state.services || [])
        .map((s) => CalcEngine.calculateService(s))
        .map(
          (svc, i) =>
            `<div class="order-service-row" data-service-id="${esc(state.services[i].id)}"><strong>${esc(svc.name || svc.type || 'Service')}</strong><span>${Number(svc.qty) || 1} × ${Number(svc.unitPrice || 0).toLocaleString('en-US')} EGP = ${esc(formatMoney(svc.subtotal))}</span><button type="button" class="icon-btn" data-remove-service="${esc(state.services[i].id)}" aria-label="Remove service ${esc(svc.name || '')}">Remove</button></div>`,
        )
        .join('') || '<div class="empty-service-list">No additional services</div>';
  }
  function setDesignMode(mode) {
    state.designMode = mode === 'mix' ? 'mix' : 'single';
    persist();
    renderDesignMode();
    renderTeeth();
  }
  function renderServiceCatalog() {
    const select = $('#order-service-type');
    if (!select || !window.CalcEngine) return;
    const labels = CalcEngine.LABELS?.service || {},
      prices = CalcEngine.get?.()?.servicePrices || {},
      current = select.value || 'impression',
      types = Object.keys(prices).filter((type) => type !== 'custom');
    select.innerHTML =
      types.map((type) => `<option value="${esc(type)}">${esc(labels[type] || type)}</option>`).join('') +
      '<option value="custom">Custom service</option>';
    select.value = types.includes(current) || current === 'custom' ? current : types[0] || 'custom';
    updateServicePriceHint();
  }
  function updateServicePriceHint() {
    const host = $('#order-service-price-hint');
    if (!host) return;
    const type = $('#order-service-type').value,
      labels = CalcEngine?.LABELS?.service || {},
      prices = CalcEngine?.get?.()?.servicePrices || {},
      override = $('#order-service-price').value;
    if (type === 'custom') {
      host.textContent = 'Custom service · enter the studio-agreed unit price.';
      return;
    }
    const price = Number(prices[type]) || 0;
    host.textContent =
      override !== ''
        ? `Manual unit price: ${Number(override || 0).toLocaleString('en-US')} EGP · clear to use the shared ${labels[type] || type} price.`
        : `${labels[type] || type}: ${price.toLocaleString('en-US')} EGP per unit · synced with EditX and Invoice pricing.`;
  }
  function addOrderService() {
    const type = $('#order-service-type').value,
      entered = $('#order-service-price').value,
      qty = Number($('#order-service-qty').value);
    if (
      !Number.isInteger(qty) ||
      qty < 1 ||
      !$('#order-service-price').validity.valid ||
      (type === 'custom' && !entered)
    ) {
      notify('Enter a positive quantity and a valid unit price');
      return;
    }
    const name =
      type === 'custom'
        ? $('#order-service-name').value.trim() || 'Custom service'
        : CalcEngine.LABELS.service[type] || type;
    state.services.push({
      id: crypto.randomUUID(),
      type,
      name,
      qty,
      ...(entered !== '' && { unitPrice: Number(entered) }),
    });
    $('#order-service-name').value = '';
    $('#order-service-qty').value = 1;
    $('#order-service-price').value = '';
    renderAll();
    persist();
    updateServicePriceHint();
    notify(`${name} added`);
  }
  function addProductionEffectDetails(g) {
    return {
      laser: 'Laser engraving / cutout',
      emboss: 'Embossed · darker raised detail',
      standard: 'Standard finish',
    }[g.productionEffect || 'standard'];
  }
  function productionNotes() {
    const checks = state.productionChecks || {},
      stage = $('#production-stage option:checked')?.textContent || state.productionStage,
      laserMarks = (state.ink || []).filter((s) => s.effect === 'laser').length,
      embossMarks = (state.ink || []).filter((s) => s.effect === 'emboss').length,
      icedGroups = new Map();
    (state.groups || [])
      .filter((g) => ['full', 'both'].includes(g.stoneMode))
      .forEach((g) => {
        const key = g.layerId || g.name || 'design',
          entry = icedGroups.get(key) || { name: g.name || 'Design', teeth: new Set() };
        (g.teeth || []).forEach((tooth) => entry.teeth.add(Number(tooth)));
        icedGroups.set(key, entry);
      });
    (state.icedTeeth || []).forEach((rec) => {
      const layer = state.designLayers.find((item) => item.id === rec.designId),
        key = rec.designId || layer?.name || 'design',
        entry = icedGroups.get(key) || { name: layer?.name || 'Design', teeth: new Set() };
      entry.teeth.add(Number(rec.tooth));
      icedGroups.set(key, entry);
    });
    const iced = [...icedGroups.values()].map(
      (entry) => `${entry.name} · FDI ${[...entry.teeth].join(', ') || 'confirm teeth'}`,
    );
    return `Production stage: ${stage}. ${['measurements', 'materials', 'stones', 'artwork'].map((k) => `${k}: ${checks[k] ? 'verified' : 'pending'}`).join(' · ')}${iced.length ? ` · ICED OUT: ${iced.join(' / ')}` : ''} · Laser marks: ${laserMarks} · Emboss marks: ${embossMarks}`;
  }
  function refreshOrder() {
    const input = $('#price'),
      isAuto = state.priceMode !== 'manual';
    input.readOnly = isAuto;
    $('#price-mode').textContent = isAuto ? 'Manual override' : 'Use calculator';
    if (!window.CalcEngine || !window.OrderPricing) {
      currentOrder = null;
      $('#auto-price-note').textContent = $('#summary-balance').textContent =
        'Calculator unavailable. Reload before issuing documents.';
      $('#summary-total').textContent = '—';
      return;
    }
    const { order, issues } = OrderPricing.build(state, CalcEngine);
    const hasItems = order.lineCount > 0 || order.services.length > 0;
    const pending = pendingTeeth();
    currentOrder = order;
    const gold = orderUsesGold(order);
    if (gold && !window.MetalRates?.goldEgpPerGram24())
      issues.push('Live gold rate unavailable. Refresh before issuing a gold quote.');
    if (pending) issues.push('Review the drawing and apply its design details before issuing documents.');
    if (pricingSource === 'loading') issues.push('Loading studio pricing…');
    orderBlock = issues[0] || (!hasItems && 'Add a design or service first.');
    if (unverifiedPricing())
      issues.push('Studio pricing could not be verified. Refresh or confirm the estimate before export.');
    if (gold && window.MetalRates?.snapshot().stale)
      issues.push('Using the last known gold rate. Confirm the rate before production.');
    const amount = hasItems ? order.total : null;
    if (isAuto) state.price = amount == null ? '' : String(amount);
    input.value = state.price;
    if (state.depositAuto !== false) state.deposit = amount == null ? '' : String(order.deposit);
    $('#deposit').value = state.deposit;
    $('#auto-deposit').textContent =
      state.depositAuto === false ? 'Use studio %' : `Auto · ${CalcEngine.get().depositPct}%`;
    $('#auto-deposit').disabled = state.depositAuto !== false;
    $('#deposit').setAttribute('placeholder', `${CalcEngine.get().depositPct}% of total`);
    const source =
      {
        loading: 'Loading pricing',
        defaults: 'Default pricing · not verified',
        'stale-cache': 'Last known studio pricing',
        cache: 'Cached studio pricing',
        rest: 'Studio pricing',
        firestore: 'Studio pricing',
      }[pricingSource] || 'Studio pricing';
    $('#auto-price-note').textContent =
      `${source}${gold && window.MetalRates ? ' · Gold: ' + MetalRates.statusLine() : ''}`;
    $('#summary-total').textContent = amount == null ? '—' : formatMoney(order.total);
    $('#summary-balance').textContent = hasItems
      ? `Deposit ${formatMoney(order.deposit)} · Balance ${formatMoney(order.balance)}`
      : 'Add a design or a studio service to begin.';
    $('#price-breakdown').hidden = !hasItems;
    const amounts = [
      ...order.lines.map((l, i) => [l.name || `Design ${i + 1}`, l.subtotal]),
      ...order.services.map((s) => [`${s.name} × ${s.qty}`, s.subtotal]),
      ...CalcEngine.quoteTotalRows(order),
    ];
    $('#price-rows').innerHTML = amounts
      .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(formatMoney(v))}</dd>`)
      .join('');
    const link = $('#open-saved-quote');
    link.hidden = !state.quoteId || !staffUser;
    if (!link.hidden) link.href = '/quotes.html?id=' + encodeURIComponent(state.quoteId);
    $('#summary-teeth').textContent = order.teethTotal;
    $('#summary-group-count').textContent = order.lineCount;
    $('#summary-service-count').textContent = order.services.reduce((n, s) => n + s.qty, 0);
    $('#summary-unassigned').textContent = pending;
    $('#order-warning').textContent = issues.join(' ');
    $('#order-warning').hidden = !issues.length || (!hasItems && !pending);
    $('#quote-pdf-btn').disabled = $('#create-proforma-btn').disabled = !!orderBlock;
    $('#save-quote-btn').disabled = !!orderBlock || !staffUser || savingQuote;
    $('#save-quote-btn').title = staffUser
      ? 'Save the priced quotation to EditX / Quotes'
      : 'Sign in to EditX to save a studio quotation';
    return order;
  }
  function pendingTeeth() {
    return (
      state.selectedTeeth.length +
      state.designLayers.reduce((n, l) => n + (layerPending(l) ? l.teeth.length : 0), 0)
    );
  }
  function layerPending(layer) {
    return layer.teeth.length && (layer.draft || layer.revision !== OrderDesign.revision(state, layer));
  }
  const orderUsesGold = (order) =>
    order.lines.some((l) => (l.groups || [l]).some((g) => g.material === 'gold'));
  function unverifiedPricing() {
    const unverified = (source) => ['defaults', 'stale-cache'].includes(source);
    return (
      unverified(pricingSource) ||
      (unverified(window.SiteConfig?.source) &&
        state.services.some(
          (s) => s.unitPrice == null && ['consultation', 'impression', 'toothgem'].includes(s.type),
        ))
    );
  }
  function issuedQuote() {
    const order = refreshOrder();
    if (!order || orderBlock) {
      notify(orderBlock || 'Calculator unavailable');
      return null;
    }
    const fallback = unverifiedPricing();
    const staleGold = orderUsesGold(order) && window.MetalRates?.snapshot().stale;
    const warning = [
      fallback && 'Studio prices could not be verified.',
      staleGold && 'Gold is priced at the last known rate.',
    ]
      .filter(Boolean)
      .join(' ');
    if (
      warning &&
      state.priceMode !== 'manual' &&
      !confirm(warning + ' Issue an estimate using the displayed prices?')
    )
      return null;
    return {
      id: state.quoteId || '',
      orderNo: state.orderNo,
      clientName: state.clientName.trim(),
      clientPhone: state.clientPhone.trim(),
      clientEmail: state.clientEmail.trim(),
      notes: [
        state.notes.trim(),
        warning && state.priceMode !== 'manual' ? warning + ' Confirm before production.' : '',
      ]
        .filter(Boolean)
        .join('\n'),
      order,
      validDays: SiteConfig.num('quoteValidDays'),
      studioName: SiteConfig.get('studioName'),
    };
  }
  function sendProforma() {
    const quote = issuedQuote();
    if (!quote) return;
    if (!quote.clientName) {
      showStep('client');
      $('#client-name').focus();
      notify('Enter a client name for the invoice');
      return;
    }
    try {
      localStorage.setItem(
        'egygz_pending_invoice_from_quote',
        JSON.stringify(CalcEngine.quoteToInvoice(quote)),
      );
      location.assign('/invoice.html');
    } catch {
      notify('Could not transfer this quote. Check browser storage.');
    }
  }
  async function saveStudioQuote() {
    if (savingQuote || !records || !staffUser) return;
    const q = issuedQuote();
    if (!q) return;
    if (!q.clientName) {
      showStep('client');
      $('#client-name').focus();
      notify('Enter a client name first');
      return;
    }
    const target = state,
      now = new Date().toISOString();
    const data = {
      clientName: q.clientName,
      clientPhone: q.clientPhone,
      clientEmail: q.clientEmail,
      orderNo: q.orderNo,
      notes: q.notes,
      source: 'order-sheet',
      validDays: q.validDays,
      studioName: q.studioName,
      lines: q.order.lines.map(CalcEngine.cleanLineSpec),
      services: q.order.services,
      order: q.order,
      total: q.order.total,
      designLabel: `${q.order.lineCount} designs / ${q.order.teethTotal} teeth`,
      updatedAt: now,
      ...(!q.id && { status: 'draft', createdAt: now, createdBy: staffUser.email || staffUser.uid }),
    };
    savingQuote = true;
    $('#save-quote-btn').disabled = true;
    try {
      const id = await records.saveQuote(JSON.parse(JSON.stringify(data)), q.id);
      if (
        state === target &&
        state.clientName.trim() === q.clientName &&
        state.clientPhone.trim() === q.clientPhone
      ) {
        state.quoteId = id;
        persist();
      }
      notify('Quotation saved to Quotes');
    } catch (e) {
      notify(recordError(e, 'save this quotation'));
    } finally {
      savingQuote = false;
      refreshOrder();
    }
  }

  function renderTeeth() {
    if (!capturingPrintMap) printDesignMapDirty = true;
    const assigned = assignedIds().size;
    $('#selected-count').textContent = state.newDesignSelection
      ? `${state.selectedTeeth.length} selected`
      : `FDI ${activeLayer().teeth.join(' · ')}`;
    $('#assigned-count').textContent = `· ${assigned} assigned`;
    if (!capturingPrintMap) renderDesignMode();
    if (!svgChart) return;
    const visible = visibleLayerIds(),
      active = activeLayer(),
      inkTeeth = new Set([
        ...(state.ink || []).filter((st) => visible.has(st.designId)).map((st) => Number(st.tooth)),
        ...(state.gems || []).filter((g) => visible.has(g.designId)).map((g) => Number(g.tooth)),
      ]);
    svgChart.classList.toggle('isolate-design', !!state.isolateDesign && !state.showAllDesigns);
    svgChart.querySelectorAll('[data-tooth]').forEach((path) => {
      const id = Number(path.dataset.tooth),
        selected = state.selectedTeeth.includes(id),
        strokes = inkTeeth.has(id),
        material = active?.materials?.[id] ? materialForGroup(active.materials[id]) : '';
      path.classList.toggle('is-selected', selected);
      path.classList.toggle('has-ink', strokes);
      path.classList.toggle('in-active-design', (active?.teeth || []).map(Number).includes(id));
      path.dataset.material = material && MATERIALS[material] ? material : '';
      path.setAttribute(
        'aria-label',
        `Tooth ${id}${material ? ` · ${MATERIALS[material]?.label || material}` : ''}${strokes ? ' · has sketch' : ''}`,
      );
      path.setAttribute('aria-pressed', String(selected));
      path.setAttribute('tabindex', state.tool === 'select' ? '0' : '-1');
      path.setAttribute('role', 'button');
      path.style.fill = '#fff';
      path.style.fillOpacity = '1';
      const member = !state.newDesignSelection && active?.teeth.includes(id);
      path.style.stroke = selected || member ? '#856826' : '#777872';
      path.style.strokeWidth = selected ? '3' : member ? '2.1' : '1.15';
      path.style.filter = '';
      const label = svgChart.querySelector(`[data-fdi-label="${id}"]`);
      if (label) {
        label.setAttribute('fill', selected || member ? '#856826' : '#78766e');
        label.style.display = state.isolateDesign && !state.showAllDesigns && !member ? 'none' : '';
      }
    });
    $('#chart-stage-inner').classList.toggle(
      'drawing',
      ['draw', 'pave', 'laser', 'emboss'].includes(state.tool),
    );
    $('#chart-stage-inner').classList.toggle('interacting', state.tool !== 'select');
    updateFinishSwatches();
    $$('.material-chip').forEach((chip) =>
      chip.classList.toggle('active', chip.dataset.material === selectedMaterial()),
    );
    const drawn = inkTeeth.size;
    $('#ink-count').textContent = drawn
      ? `${drawn} ${drawn === 1 ? 'tooth' : 'teeth'} with sketches`
      : 'No sketched teeth yet';
    $('#isolate-design').classList.toggle('active', !!state.isolateDesign);
    $('#isolate-design').textContent = state.isolateDesign ? 'Show full chart' : 'Isolate active design';
    $('#delete-selected-gem').disabled = !state.selectedGemId;
    renderDesignLayers();
    renderInk();
    setTool(state.tool || 'select');
  }
  function selectedMaterial() {
    return (
      state.editor.materialKey ||
      { 'Cobalt Chrome': 'chrome', 'Sterling Silver 925': 'silver', Gold: 'gold', Titanium: 'titanium' }[
        state.editor.material
      ] ||
      'chrome'
    );
  }
  function setTool(tool) {
    if (tool === 'enamel' && !state.editor.palette?.length) tool = 'draw';
    if (['gem', 'pave', 'ice'].includes(tool) && !stoneToolAvailable()) {
      notify('Choose Gold or Silver 925 to add diamonds');
      tool = 'draw';
    }
    state.tool = tool;
    state.drawMode = ['draw', 'laser', 'white', 'emboss', 'enamel', 'pave'].includes(tool);
    const ready = !state.newDesignSelection,
      stones = ready && stoneToolAvailable();
    $$('[data-tool]').forEach((b) => {
      const on = b.dataset.tool === tool;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
      b.disabled = !ready;
    });
    for (const id of ['gem-tools', 'gem-cut-rail', 'gem-colors', 'gem-selection-preview', 'diamond-options'])
      $('#' + id).hidden = !stones;
    $('#gem-cut-rail').hidden = !stones || ['ice', 'pave'].includes(tool);
    $('#diamond-options summary').textContent = ['ice', 'pave'].includes(tool)
      ? 'Round stones · colour'
      : 'Diamond cut & colour';
    $('#edit-palette').hidden = tool !== 'enamel';
    $('.chart-toolgroup').hidden = !ready;
    const brush = ready && ['draw', 'laser', 'white', 'emboss'].includes(tool);
    $('.brush-control').hidden = !brush;
    $('.free-draw-toggle').hidden = !brush;
    $('#gem-tools')
      .querySelectorAll('label, [data-rotate], #delete-selected-gem')
      .forEach((el) => {
        const id = el.querySelector('input')?.id;
        el.hidden =
          id === 'gem-size'
            ? !['gem', 'ice', 'pave'].includes(tool)
            : id === 'gem-spacing'
              ? !['ice', 'pave'].includes(tool)
              : tool !== 'gem' || !state.selectedGemId;
      });

    $('#canvas-mode-hint').textContent =
      {
        select: 'Tap the teeth for this design. Selected teeth have a gold outline.',
        draw: 'Draw with a finger, pen or mouse. Pinch with two fingers to zoom.',
        laser: 'Draw a dark engraved line inside the selected teeth.',
        white: 'Draw a white cutout. Its fine grey edge stays visible on bare teeth.',
        enamel:
          'Tap a tooth to fill it with your palette. Tap again with a different palette to replace the fill.',
        emboss: 'Draw a raised metal detail.',
        gem: 'Tap a tooth to place a stone. Drag an existing stone to move it.',
        pave: 'Draw a line of stones on gold or silver.',
        ice: 'Tap a gold or silver tooth for a full iced setting.',
      }[tool] || '';
    $('#chart-stage-inner').classList.toggle('drawing', state.drawMode);
    $('#chart-stage-inner').classList.toggle('interacting', tool !== 'select');
  }
  async function loadChart() {
    try {
      const res = await fetch('/assets/teeth-chart.svg');
      if (!res.ok) throw new Error('SVG unavailable');
      const text = await res.text();
      $('#chart-stage-inner').innerHTML =
        text +
        '<canvas id="ink-layer" width="900" height="331" class="ink-layer" aria-label="Apple Pencil design canvas"></canvas>';
      svgChart = $('#teeth-chart-root');
      measureChart();
      const layer = $('#ink-layer');
      canvasCtx = layer.getContext('2d');
      $('#chart-loading').hidden = true;
      $('#chart-stage-inner').hidden = false;
      zoom = Number(state.zoom) || 1;
      setupChartEvents();
      applyZoom();
      resizeInk();
      renderTeeth();
      renderPrint();
    } catch (e) {
      $('#chart-loading').hidden = false;
      $('#chart-loading').textContent = 'Tooth chart unavailable. Reload to retry.';
      console.error('Design canvas:', e);
      notify('Could not load the drawing canvas. Check the connection and retry.');
    }
  }
  function applyZoom(nextZoom = zoom, anchorX = null, anchorY = null) {
    const inner = $('#chart-stage-inner'),
      viewport = $('#chart-viewport');
    if (!inner || !viewport || !svgChart) return;
    const viewRect = viewport.getBoundingClientRect(),
      innerBefore = inner.getBoundingClientRect(),
      previous = Math.max(0.01, renderedZoom || 1);
    if (anchorX == null) anchorX = viewport.clientWidth / 2;
    if (anchorY == null) anchorY = viewport.clientHeight / 2;
    const oldOffsetX = innerBefore.left - viewRect.left + viewport.scrollLeft,
      oldOffsetY = innerBefore.top - viewRect.top + viewport.scrollTop;
    const contentX = (viewport.scrollLeft + anchorX - oldOffsetX) / previous,
      contentY = (viewport.scrollTop + anchorY - oldOffsetY) / previous;
    zoom = Math.max(0.5, Math.min(5, Math.round(Number(nextZoom) * 100) / 100));
    state.zoom = zoom;
    inner.style.width = `${zoom * 100}%`;
    $('#zoom-readout').textContent = `${Math.round(zoom * 100)}%`;
    const innerAfter = inner.getBoundingClientRect(),
      newOffsetX = innerAfter.left - viewRect.left + viewport.scrollLeft,
      newOffsetY = innerAfter.top - viewRect.top + viewport.scrollTop;
    viewport.scrollLeft = Math.max(0, contentX * zoom + newOffsetX - anchorX);
    viewport.scrollTop = Math.max(0, contentY * zoom + newOffsetY - anchorY);
    renderedZoom = zoom;
    requestAnimationFrame(resizeInk);
  }
  function chartView() {
    return svgChart?.viewBox?.baseVal || CHART_VIEW;
  }
  function setInkTransform() {
    const v = chartView(),
      canvas = canvasCtx.canvas;
    const scale = Math.min(canvas.width / v.width, canvas.height / v.height);
    canvasCtx.setTransform(
      scale,
      0,
      0,
      scale,
      (canvas.width - v.width * scale) / 2 - v.x * scale,
      (canvas.height - v.height * scale) / 2 - v.y * scale,
    );
  }
  // getBBox() is zero in a hidden step (including a draft reopened directly in
  // Review). Measure the asset once in SVG coordinates for both screen and print.
  function measureChart() {
    const ns = svgChart.namespaceURI,
      probe = document.createElementNS(ns, 'svg');
    probe.style.cssText =
      'position:fixed;left:-10000px;top:0;width:900px;height:331px;visibility:hidden;pointer-events:none';
    probe.setAttribute('aria-hidden', 'true');
    for (const path of svgChart.querySelectorAll('[data-tooth]')) {
      const shape = document.createElementNS(ns, 'path');
      shape.dataset.toothId = path.dataset.tooth;
      shape.setAttribute('d', path.getAttribute('d'));
      probe.append(shape);
    }
    document.body.append(probe);
    try {
      for (const shape of probe.children) {
        const id = Number(shape.dataset.toothId),
          b = shape.getBBox();
        toothBoxes.set(id, b);
        const t = document.createElementNS(svgChart.namespaceURI, 'text');
        Object.entries({
          'data-fdi-label': id,
          x: b.x + b.width / 2,
          y: UPPER.includes(id) ? b.y - 7 : b.y + b.height + 12,
          'font-size': 9,
          'text-anchor': 'middle',
          'font-family': 'monospace',
          fill: '#78766e',
          'pointer-events': 'none',
          'aria-hidden': 'true',
        }).forEach(([k, v]) => t.setAttribute(k, v));
        t.textContent = id;
        svgChart.append(t);
      }
    } finally {
      probe.remove();
    }
  }
  function resizeInk() {
    const layer = $('#ink-layer');
    if (!layer || !svgChart) return;
    const rect = svgChart.getBoundingClientRect(),
      dpr = Math.max(1, window.devicePixelRatio || 1);
    if (rect.width < 1) return;
    // Keep a zoomed desktop/tablet canvas within the browser's backing-store limits.
    const density = Math.min(dpr, 4096 / rect.width, 4096 / rect.height);
    layer.width = Math.round(rect.width * density);
    layer.height = Math.round(rect.height * density);
    layer.style.width = rect.width + 'px';
    layer.style.height = rect.height + 'px';
    canvasCtx = layer.getContext('2d');
    setInkTransform();
    renderInk();
  }
  function svgPoint(event) {
    if (!svgChart) return null;
    const pt = svgChart.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    return pt.matrixTransform(svgChart.getScreenCTM().inverse());
  }
  function pointOnTooth(event) {
    const p = svgPoint(event);
    if (!p) return null;
    const allowed = state.isolateDesign ? new Set((activeLayer()?.teeth || []).map(Number)) : null;
    for (const path of svgChart.querySelectorAll('[data-tooth]')) {
      const id = Number(path.dataset.tooth);
      if (allowed && !allowed.has(id)) continue;
      try {
        if (path.isPointInFill(p)) return { tooth: id, x: p.x, y: p.y };
      } catch (e) {}
    }
    return null;
  }
  function darkenHex(color, amount = 0.42) {
    const n = parseInt(color.slice(1), 16),
      r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount))),
      g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount))),
      b = Math.max(0, Math.round((n & 255) * (1 - amount)));
    return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  function finishKey(value) {
    const key = String(value || 'none')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    return ['yellowgold', 'whitegold', 'rosegold', 'blackgold', 'silverplating'].includes(key) ? key : 'none';
  }
  function finishColor(material, plating) {
    return FINISH_DEFAULTS[material]?.[finishKey(plating)] || FINISH_DEFAULTS[material]?.none || '#aeb7bd';
  }
  function updateFinishSwatches() {
    $$('.material-chip').forEach((chip) => {
      const color = finishColor(chip.dataset.material, 'None');
      chip.dataset.color = color;
      chip.querySelector('.material-dot')?.style.setProperty('--mat-color', color);
    });
  }
  function strokeMaterial(st) {
    return st.material || materialKeyForLayerTooth(st.designId, st.tooth) || selectedMaterial() || 'chrome';
  }
  function strokeColor(st) {
    if (st.effect === 'laser') return st.laserStyle === 'cutout' ? '#ffffff' : '#393634';
    const group = [...state.groups]
        .reverse()
        .find((g) => g.layerId === st.designId && (g.teeth || []).map(Number).includes(Number(st.tooth))),
      plating = st.plating || group?.plating || state.editor.plating || 'None',
      base = finishColor(strokeMaterial(st), plating);
    return darkenHex(base, st.effect === 'emboss' ? 0.48 : 0.22);
  }
  function getGemSprite(cut, color) {
    const key = `${cut}:${color}`,
      cached = gemSpriteCache.get(key);
    if (cached) return cached.canvas || null;
    const entry = { canvas: null };
    gemSpriteCache.set(key, entry);
    const option = GEM_CUTS.find((x) => x[0] === cut) || GEM_CUTS[0],
      img = new Image();
    entry.loading = true;
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 144;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, c.width, c.height);
        const image = x.getImageData(0, 0, c.width, c.height),
          pixels = image.data,
          tint = GEM_COLORS.find((v) => v[0] === color)?.[1] || '#f6f8fb',
          tr = parseInt(tint.slice(1, 3), 16),
          tg = parseInt(tint.slice(3, 5), 16),
          tb = parseInt(tint.slice(5, 7), 16);
        for (let i = 0; i < pixels.length; i += 4) {
          const lum = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2],
            oldA = pixels[i + 3];
          if (lum < 16) {
            pixels[i + 3] = 0;
            continue;
          }
          const keep = (Math.min(1, (lum - 10) / 48) * oldA) / 255,
            shine = Math.min(0.82, (lum / 255) * 0.72);
          pixels[i] = Math.round(tr * (1 - shine) + 255 * shine);
          pixels[i + 1] = Math.round(tg * (1 - shine) + 255 * shine);
          pixels[i + 2] = Math.round(tb * (1 - shine) + 255 * shine);
          pixels[i + 3] = Math.round(keep * 255);
        }
        x.putImageData(image, 0, 0);
        entry.canvas = c;
        entry.url = c.toDataURL();
        entry.loading = false;
        renderInk();
        renderGemOptions();
      } catch (err) {
        entry.loading = false;
        console.warn('Gem tint unavailable', err);
      }
    };
    img.onerror = () => {
      entry.loading = false;
    };
    img.src = DIAMOND_FILE(option[0]);
    return null;
  }
  function drawGemFallback(x, y, size, color, cut) {
    const tint = GEM_COLORS.find((v) => v[0] === color)?.[1] || '#f6f8fb';
    canvasCtx.save();
    canvasCtx.translate(x, y);
    canvasCtx.fillStyle = tint;
    canvasCtx.strokeStyle = '#ffffff';
    canvasCtx.lineWidth = 0.65;
    canvasCtx.beginPath();
    if (cut === 'princess' || cut === 'emerald' || cut.includes('baguette'))
      canvasCtx.rect(-size / 2, -size / 2, size, size);
    else canvasCtx.arc(0, 0, size / 2, 0, Math.PI * 2);
    canvasCtx.fill();
    canvasCtx.stroke();
    canvasCtx.beginPath();
    canvasCtx.moveTo(-size * 0.38, 0);
    canvasCtx.lineTo(0, -size * 0.38);
    canvasCtx.lineTo(size * 0.38, 0);
    canvasCtx.lineTo(0, size * 0.38);
    canvasCtx.closePath();
    canvasCtx.stroke();
    canvasCtx.restore();
  }
  function renderInk() {
    if (!capturingPrintMap) printDesignMapDirty = true;
    if (!canvasCtx || !svgChart) return;
    const layer = $('#ink-layer');
    if (!layer) return;
    setInkTransform();
    const view = chartView();
    canvasCtx.clearRect(view.x, view.y, view.width, view.height);
    const paths = new Map(
        [...svgChart.querySelectorAll('[data-tooth]')].map((path) => [Number(path.dataset.tooth), path]),
      ),
      visible = visibleLayerIds();
    // Bucket fills sit under the strokes. Only the last fill on a layer/tooth is visible (undo reveals the previous one).
    const fills = new Map();
    for (const mark of state.ink)
      if (mark.effect === 'enamel' && visible.has(mark.designId))
        fills.set(`${mark.designId}:${mark.tooth}`, mark);
    for (const mark of fills.values()) {
      const path = paths.get(Number(mark.tooth)),
        colors = (mark.colors || []).map(OrderDesign.hex).filter(Boolean);
      if (!path || !colors.length) continue;
      const box = toothBoxes.get(Number(mark.tooth)),
        shape = new Path2D(path.getAttribute('d'));
      canvasCtx.save();
      canvasCtx.clip(shape);
      colors.forEach((c, i) => {
        canvasCtx.fillStyle = c;
        canvasCtx.fillRect(
          box.x + (i * box.width) / colors.length,
          box.y,
          box.width / colors.length + 0.2,
          box.height,
        );
      });
      canvasCtx.restore();
    }
    [...(state.ink || []), activeStroke]
      .filter(Boolean)
      .filter((st) => visible.has(st.designId))
      .forEach((st) => {
        if (!st.points || !st.points.length) return;
        const clipIds =
            st.clipToTooth === false
              ? []
              : Array.isArray(st.clipTeeth) && st.clipTeeth.length
                ? st.clipTeeth.map(Number)
                : [Number(st.tooth)],
          clipPaths = clipIds.map((id) => paths.get(id)).filter(Boolean);
        if (st.clipToTooth !== false && !clipPaths.length) return;
        const drawingPath = new Path2D(smoothD(st.points, (q) => q.x.toFixed(2) + ' ' + q.y.toFixed(2)));
        if (st.points.length === 1) drawingPath.lineTo(st.points[0].x + 0.01, st.points[0].y);
        const paint = () => {
          canvasCtx.lineCap = 'round';
          canvasCtx.lineJoin = 'round';
          canvasCtx.lineWidth = Number(st.width) || 4;
          canvasCtx.strokeStyle = strokeColor(st);
          canvasCtx.setLineDash([]);
          if (st.effect === 'laser' && st.laserStyle === 'cutout') {
            canvasCtx.lineWidth += 1.35;
            canvasCtx.strokeStyle = '#737571';
            canvasCtx.stroke(drawingPath);
            canvasCtx.lineWidth -= 1.35;
            canvasCtx.strokeStyle = '#fff';
          }
          canvasCtx.stroke(drawingPath);
        };
        if (st.clipToTooth === false) {
          canvasCtx.save();
          paint();
          canvasCtx.restore();
        } else
          clipPaths.forEach((tooth) => {
            canvasCtx.save();
            try {
              canvasCtx.clip(new Path2D(tooth.getAttribute('d')));
              paint();
            } catch (e) {}
            canvasCtx.restore();
          });
      });
    (state.gems || [])
      .filter((g) => visible.has(g.designId) && supportsStones(materialKeyForLayerTooth(g.designId, g.tooth)))
      .forEach((g) => {
        const size = Math.max(2, (Number(g.sizeMm) || 1.5) * 4.5),
          sprite = getGemSprite(g.cut || 'round', g.color || 'clear'),
          tooth = paths.get(Number(g.tooth));
        canvasCtx.save();
        if (tooth)
          try {
            canvasCtx.clip(new Path2D(tooth.getAttribute('d')));
          } catch (e) {}
        canvasCtx.translate(g.x, g.y);
        canvasCtx.rotate(((Number(g.rotation) || 0) * Math.PI) / 180);
        if (sprite) canvasCtx.drawImage(sprite, -size / 2, -size / 2, size, size);
        else drawGemFallback(0, 0, size, g.color || 'clear', g.cut || 'round');
        canvasCtx.restore();
        if (!capturingPrintMap && g.id === state.selectedGemId) {
          canvasCtx.save();
          canvasCtx.strokeStyle = '#191919';
          canvasCtx.lineWidth = 0.8;
          canvasCtx.beginPath();
          canvasCtx.arc(g.x, g.y, size * 0.68, 0, Math.PI * 2);
          canvasCtx.stroke();
          canvasCtx.restore();
        }
      });
  }
  // An iced fill has ONE per-tooth price, so its priced attributes change together.
  function selectedStoneBatch() {
    const selected = state.gems.find((g) => g.id === state.selectedGemId);
    if (!selected) return [];
    return selected.kind === 'iced'
      ? state.gems.filter(
          (g) => g.kind === 'iced' && g.designId === selected.designId && g.tooth === selected.tooth,
        )
      : [selected];
  }
  function gemCountOnTooth(designId, tooth) {
    return state.gems.filter((g) => g.designId === designId && Number(g.tooth) === Number(tooth)).length;
  }
  function addGem(tooth, x, y, kind = 'placed') {
    const layer = activeLayer();
    if (!supportsStones(materialKeyForLayerTooth(layer.id, tooth))) {
      notify('Stones are not priced for this material. Choose Sterling Silver 925 or Gold.');
      return null;
    }
    if (gemCountOnTooth(layer.id, tooth) >= MAX_STONES_PER_TOOTH) {
      notify('Maximum stone placement reached on this tooth');
      return null;
    }
    const gem = {
      id: `gem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      operationId: `op-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
      createdAt: Date.now(),
      designId: layer.id,
      tooth: Number(tooth),
      x,
      y,
      sizeMm: Number($('#gem-size')?.value) || 1.5,
      cut: state.editor.diamondCut || 'round',
      color: state.editor.gemColor || 'clear',

      kind,
    };
    state.gems.push(gem);
    // Placement keeps a brush, not a selection: choosing the next colour must not repaint the previous stone.
    state.selectedGemId = '';
    renderGemOptions();

    $('#gem-size').value = gem.sizeMm;
    $('#gem-size-value').textContent = `${Number(gem.sizeMm).toFixed(1)} mm`;
    layer.teeth = [...new Set([...(layer.teeth || []), Number(tooth)])];
    persist();
    renderTeeth();
    renderDesignLayers();
    renderSummary();
    renderPrint();
    return gem;
  }
  function fillToothWithGems(tooth) {
    const path = svgChart.querySelector(`[data-tooth="${Number(tooth)}"]`);
    if (!path) return;
    const layer = activeLayer();
    if (!supportsStones(materialKeyForLayerTooth(layer.id, tooth))) {
      notify('Iced-out stones are not priced for this material. Choose Sterling Silver 925 or Gold.');
      return;
    }
    state.gems = state.gems.filter(
      (g) => !(g.designId === layer.id && Number(g.tooth) === Number(tooth) && g.kind === 'iced'),
    );
    layer.teeth = [...new Set([...(layer.teeth || []), Number(tooth)])];
    const operationId = `ice-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
      b = path.getBBox(),
      size = (Number($('#gem-size').value) || 1.5) * 4.5,
      space = (Number($('#gem-spacing').value) || 1) * 4.5,
      step = Math.max(2, size + space),
      pt = svgChart.createSVGPoint(),
      overlaps = (x, y) => {
        const r = size * 0.48,
          samples = [
            [0, 0],
            [r, 0],
            [-r, 0],
            [0, r],
            [0, -r],
            [r * 0.7, r * 0.7],
            [-r * 0.7, r * 0.7],
            [r * 0.7, -r * 0.7],
            [-r * 0.7, -r * 0.7],
          ];
        return samples.some(([dx, dy]) => {
          pt.x = x + dx;
          pt.y = y + dy;
          try {
            return path.isPointInFill(pt);
          } catch (e) {
            return false;
          }
        });
      };
    let count = 0,
      maxCount = Math.max(0, MAX_STONES_PER_TOOTH - gemCountOnTooth(layer.id, tooth));
    for (let y = b.y - size / 2; y <= b.y + b.height + size / 2 && count < maxCount; y += step) {
      for (let x = b.x - size / 2; x <= b.x + b.width + size / 2 && count < maxCount; x += step) {
        if (overlaps(x, y) && addGemRecord(layer.id, tooth, x, y, 'iced', operationId)) count++;
      }
    }
    state.icedTeeth = state.icedTeeth || [];
    state.icedTeeth = state.icedTeeth.filter(
      (i) => !(i.designId === layer.id && Number(i.tooth) === Number(tooth)),
    );
    state.icedTeeth.push({ designId: layer.id, tooth: Number(tooth), count });
    persist();
    renderTeeth();
    renderSummary();
    renderPrint();
    notify(`Iced-out preview applied to tooth ${tooth}`);
  }
  function addGemRecord(designId, tooth, x, y, kind = 'placed', operationId = '') {
    if (gemCountOnTooth(designId, tooth) >= MAX_STONES_PER_TOOTH) return null;
    const gem = {
      id: `gem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${state.gems.length}`,
      operationId: operationId || `op-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
      createdAt: Date.now(),
      designId,
      tooth: Number(tooth),
      x,
      y,
      sizeMm: Number($('#gem-size').value) || 1.5,
      cut: kind === 'iced' || kind === 'pave' ? 'round' : state.editor.diamondCut || 'round',
      color: state.editor.gemColor || 'clear',

      kind,
    };
    state.gems.push(gem);
    return gem;
  }
  function placePaveAlong(points, tooth) {
    if (points.length < 1) return;
    const layer = activeLayer();
    layer.teeth = [...new Set([...(layer.teeth || []), Number(tooth)])];
    const operationId = `line-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
      dist = Math.max(
        2,
        (Number($('#gem-size').value) || 1.5) * 4.5 + (Number($('#gem-spacing').value) || 1) * 4.5,
      );
    let carry = 0,
      prev = points[0],
      placed = 0;
    if (addGemRecord(layer.id, tooth, prev.x, prev.y, 'pave', operationId)) placed++;
    for (let i = 1; i < points.length; i++) {
      const next = points[i],
        dx = next.x - prev.x,
        dy = next.y - prev.y,
        len = Math.hypot(dx, dy);
      if (len < 0.01) {
        prev = next;
        continue;
      }
      let offset = dist - carry;
      while (offset <= len && placed < MAX_STONES_PER_TOOTH * 32) {
        const t = offset / len,
          x = prev.x + dx * t,
          y = prev.y + dy * t,
          under = pointInAnyTooth(x, y);
        if (
          under &&
          layer.teeth.includes(under) &&
          supportsStones(materialKeyForLayerTooth(layer.id, under)) &&
          addGemRecord(layer.id, under, x, y, 'pave', operationId)
        )
          placed++;
        offset += dist;
      }
      carry = (carry + len) % dist;
      prev = next;
    }
    persist();
    renderTeeth();
    renderSummary();
    renderPrint();
    notify('Diamond line preview added');
  }
  function pointInAnyTooth(x, y) {
    const pt = svgChart.createSVGPoint();
    pt.x = x;
    pt.y = y;
    const allowed = state.isolateDesign ? new Set((activeLayer()?.teeth || []).map(Number)) : null;
    for (const path of svgChart.querySelectorAll('[data-tooth]')) {
      const id = Number(path.dataset.tooth);
      if (allowed && !allowed.has(id)) continue;
      try {
        if (path.isPointInFill(pt)) return id;
      } catch (e) {}
    }
    return null;
  }
  function gemAt(x, y) {
    const layer = activeLayer();
    return [...state.gems]
      .reverse()
      .find(
        (g) =>
          g.designId === layer.id &&
          Math.hypot(g.x - x, g.y - y) < Math.max(7, (Number(g.sizeMm) || 1.5) * 4),
      );
  }
  function renderGemOptions() {
    const rail = $('#gem-cut-rail'),
      colors = $('#gem-colors'),
      preview = $('#gem-selection-preview');
    if (!rail || !colors) return;
    const selectedCut = ['ice', 'pave'].includes(state.tool) ? 'round' : state.editor.diamondCut || 'round',
      selectedColor = state.editor.gemColor || 'clear',
      cutLabel = GEM_CUTS.find((x) => x[0] === selectedCut)?.[1] || selectedCut,
      colorHex = GEM_COLORS.find((x) => x[0] === selectedColor)?.[1] || '#f6f8fb';
    rail.innerHTML = GEM_CUTS.map(
      ([id, label]) =>
        `<button type="button" class="gem-cut ${selectedCut === id ? 'active' : ''}" data-cut="${id}" aria-pressed="${selectedCut === id}">${getGemSprite(id, selectedColor) ? `<img src="${gemSpriteCache.get(`${id}:${selectedColor}`).url}" alt="${label} diamond">` : `<i class="gem-preview-fallback" style="--gem-color:${colorHex}"></i>`}<span>${label}</span></button>`,
    ).join('');
    colors.innerHTML = GEM_COLORS.map(
      ([id, color]) =>
        `<button type="button" class="gem-color ${selectedColor === id ? 'active' : ''}" data-gem-color="${id}" title="${id}" aria-label="${id} gemstone" aria-pressed="${selectedColor === id}" style="--gem-color:${color}"><i class="gem-swatch" aria-hidden="true"></i><span>${id}</span></button>`,
    ).join('');
    if (preview) {
      const sprite = getGemSprite(selectedCut, selectedColor);
      preview.innerHTML = `${sprite ? `<img src="${gemSpriteCache.get(`${selectedCut}:${selectedColor}`).url}" alt="${esc(cutLabel)} · ${esc(colorLabel(selectedColor))} selected">` : `<i class="gem-preview-fallback" style="--gem-color:${colorHex}" aria-hidden="true"></i>`}<span>${state.selectedGemId ? 'Editing stone' : 'Next stone'} · ${esc(cutLabel)} · ${esc(colorLabel(selectedColor))}</span>`;
    }
  }
  function newDesignLayer() {
    state.reviewLayerId = '';
    state.editingGroupId = '';
    state.selectedGemId = '';
    state.selectedTeeth = [];
    state.showAllDesigns = false;
    state.isolateDesign = false;
    state.newDesignSelection = true;
    state.pendingToothSpecs = {};
    state.editor.name = '';
    $('#group-name').value = '';
    setTool('select');
    persist();
    renderAll();
    notify('Select the teeth for your next design');
  }
  function svgCoordFromEvent(event) {
    const p = svgPoint(event),
      v = chartView();
    return p && p.x >= v.x && p.x <= v.x + v.width && p.y >= v.y && p.y <= v.y + v.height ? p : null;
  }
  function activeDesignBounds() {
    const ids = (activeLayer()?.teeth || []).map(Number),
      paths = [...svgChart.querySelectorAll('[data-tooth]')].filter((path) =>
        ids.includes(Number(path.dataset.tooth)),
      );
    if (!paths.length) return null;
    const boxes = paths.map((path) => path.getBBox()),
      pad = 10;
    return {
      minX: Math.min(...boxes.map((b) => b.x)) - pad,
      maxX: Math.max(...boxes.map((b) => b.x + b.width)) + pad,
      minY: Math.min(...boxes.map((b) => b.y)) - pad,
      maxY: Math.max(...boxes.map((b) => b.y + b.height)) + pad,
    };
  }
  function pointInActiveDesignBounds(point) {
    if (!state.isolateDesign) return true;
    const b = activeDesignBounds();
    return !b || (point.x >= b.minX && point.x <= b.maxX && point.y >= b.minY && point.y <= b.maxY);
  }
  function toggleTooth(id) {
    if (!id || state.tool !== 'select') return;
    if (state.isolateDesign && !activeLayer().teeth.includes(id)) return;
    const ids = new Set(state.selectedTeeth);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    state.selectedTeeth = [...ids];
    renderAll();
    persist();
  }
  function clearSelection() {
    state.selectedTeeth = [];
    state.pendingToothSpecs = {};
    state.editingGroupId = '';
  }
  function materialForGroup(name) {
    return MATERIALS[name]
      ? name
      : { 'Cobalt Chrome': 'chrome', 'Sterling Silver 925': 'silver', Gold: 'gold', Titanium: 'titanium' }[
          name
        ] || 'chrome';
  }
  function materialKeyForLayerTooth(layerId, tooth) {
    const layer = state.designLayers.find((item) => item.id === layerId),
      group = [...state.groups]
        .reverse()
        .find((item) => item.layerId === layerId && (item.teeth || []).map(Number).includes(Number(tooth))),
      raw = layer?.materials?.[tooth] || group?.material || state.editor.material;
    return materialForGroup(raw);
  }
  function supportsStones(material) {
    const key = materialForGroup(material);
    return window.CalcEngine?.allowsStones
      ? CalcEngine.allowsStones(key)
      : key === 'silver' || key === 'gold';
  }
  function stoneToolAvailable() {
    const ids = state.selectedTeeth.length ? state.selectedTeeth : activeLayer()?.teeth || [];
    if (!ids.length) return supportsStones(selectedMaterial());
    return ids.some((id) => {
      const group = [...state.groups]
          .reverse()
          .find((g) => g.layerId === activeLayer()?.id && (g.teeth || []).map(Number).includes(Number(id))),
        raw =
          state.pendingToothSpecs[id]?.material ||
          (state.newDesignSelection || state.editingGroupId
            ? state.editor.material
            : materialKeyForLayerTooth(activeLayer()?.id, id) || group?.material || state.editor.material);
      return supportsStones(raw);
    });
  }
  const stoneKey = (v) =>
    ({ 'Lab-grown diamond': 'labgrown', 'Natural diamond': 'natural' })[v] || String(v || 'cz').toLowerCase();
  function groupDescription(g) {
    const bits = [
      g.material === 'Gold' ? `Gold ${g.karat}` : g.material,
      g.level,
      g.plating !== 'None' ? g.plating + ' plating' : '',
      g.enamel !== 'None' ? g.enamel + ' enamel' : '',
      g.engraving !== 'None' ? g.engraving + ' engraving' : '',
    ];
    if (g.stoneMode === 'accent' || g.stoneMode === 'both')
      bits.push(`${g.accentCount} ${g.accentType} · ${g.setting}`);
    if (g.stoneMode === 'full' || g.stoneMode === 'both') bits.push(`Full ${g.diamondType} · ${g.coverage}`);
    if (g.pricedStones?.length)
      bits.push(`${g.pricedStones.reduce((n, x) => n + x.count, 0)} hand-set stones`);
    bits.push(addProductionEffectDetails(g));
    if (g.stoneNotes) bits.push(g.stoneNotes);
    return bits.filter(Boolean).join(' / ');
  }
  function renderGroups() {
    const host = $('#design-groups'),
      summary = $('#summary-groups');
    if (!state.groups.length) {
      host.innerHTML =
        '<div class="empty-designs">No design groups yet. Select teeth above and add the first design.</div>';
      summary.innerHTML =
        '<div style="font-size:10px;color:#888;padding:8px 0">Groups appear here as you build the order.</div>';
      return;
    }
    host.innerHTML = '';
    summary.innerHTML = '';
    state.groups.forEach((g, i) => {
      const tone = GROUP_TONES[i % GROUP_TONES.length];
      const card = document.createElement('article');
      card.className = 'design-group';
      card.style.setProperty('--group-tone', tone[0]);
      card.style.setProperty('--group-bg', tone[1]);
      const sw = document.createElement('div');
      sw.className = 'group-swatch';
      sw.textContent = String(i + 1).padStart(2, '0');
      const info = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'group-title';
      title.textContent = g.name || `Design group ${i + 1}`;
      const sub = document.createElement('div');
      sub.className = 'group-sub';
      sub.textContent = `Teeth ${(g.teeth || []).join(', ')} · ${groupDescription(g)}`;
      info.append(title, sub);
      const actions = document.createElement('div');
      actions.className = 'group-actions';
      const edit = document.createElement('button');
      edit.className = 'icon-btn';
      edit.type = 'button';
      edit.dataset.action = 'edit-group';
      edit.dataset.id = g.id;
      edit.textContent = 'Edit';
      const remove = document.createElement('button');
      remove.className = 'icon-btn';
      remove.type = 'button';
      remove.dataset.action = 'remove-group';
      remove.dataset.id = g.id;
      remove.textContent = 'Remove';
      actions.append(edit, remove);
      card.append(sw, info, actions);
      host.appendChild(card);
      const row = document.createElement('div');
      row.className = 'summary-line';
      const strong = document.createElement('strong');
      strong.textContent = g.name || `Design group ${i + 1}`;
      const span = document.createElement('span');
      span.textContent = `${(g.teeth || []).length} teeth · ${(g.teeth || []).join(', ')} · ${groupDescription(g)}`;
      row.append(strong, span);
      summary.appendChild(row);
    });
  }
  function formatMoney(value) {
    return value === '' || value == null ? '—' : `${CalcEngine.fmt(value)} ${CalcEngine.get().currency}`;
  }
  function renderSummary() {
    $('#summary-client').textContent = state.clientName.trim() || 'New client';
    $('#summary-phone').textContent = state.clientPhone || 'No phone added';
    refreshOrder();
  }
  const ASSET_LEVEL = {
    0.5: 'LEVEL 0.5.png',
    1: 'LEVEL 1.png',
    2: 'LEVEL 2.png',
    3: 'LEVEL 3.png',
    4: 'LEVEL 4.png',
    5: 'LEVEL 5.png',
    6: 'LEVEL 6.png',
  };
  const ASSET_MATERIAL = {
    'Cobalt Chrome': 'CHROME.png',
    'Sterling Silver 925': 'SILVER.png',
    Gold: 'GOLD.png',
    Titanium: 'TITANUM.png',
  };
  const ASSET_PLATING = {
    'Yellow gold': 'YELLOW GOLD PLATING.png',
    'White gold': 'WHITE GOLD PLATING.png',
    'Rose gold': 'ROSE GOLD PLATING.png',
    'Black gold': 'BLACK GOLD PLATING.png',
    'Silver plating': 'SILVER PLATING.png',
  };
  const assetUrl = (folder, name) => `/${folder}/${encodeURIComponent(name)}`;
  const colorLabel = (id) => GEM_COLORS.find((c) => c[0] === id)?.[0] || 'clear';
  function createPrintDesignMaps() {
    if (!svgChart || !$('#ink-layer')) return '';
    capturingPrintMap = true;
    const original = {
      tool: state.tool,
      activeDesignId: state.activeDesignId,
      showAllDesigns: state.showAllDesigns,
      isolateDrawn: state.isolateDrawn,
      selectedTeeth: state.selectedTeeth,
      activeStroke,
    };
    const archOrder = UPPER.concat(LOWER),
      cards = [];
    try {
      state.showAllDesigns = false;
      state.isolateDrawn = false;
      state.selectedTeeth = [];
      activeStroke = null;
      state.designLayers.forEach((design, index) => {
        const ink = (state.ink || []).filter((st) => st.designId === design.id),
          gems = (state.gems || []).filter((g) => g.designId === design.id),
          groups = state.groups.filter((g) => g.layerId === design.id);
        const teeth = [
          ...new Set([
            ...(design.teeth || []).map(Number),
            ...ink.map((st) => Number(st.tooth)).filter((id) => id > 0),
            ...gems.map((g) => Number(g.tooth)).filter((id) => id > 0),
            ...groups.flatMap((g) => g.teeth || []).map(Number),
          ]),
        ].sort((a, b) => archOrder.indexOf(a) - archOrder.indexOf(b));
        if (!teeth.length && !ink.length && !gems.length && !groups.length) return;
        state.activeDesignId = design.id;
        renderTeeth();
        renderInk();
        const clone = svgChart.cloneNode(true);
        clone.setAttribute('color', '#565650');
        clone.classList.remove('isolate-drawn', 'isolate-design');
        clone.removeAttribute('id');
        const designToothSet = new Set(teeth);
        clone.querySelectorAll('[data-fdi-label]').forEach((t) => {
          if (!designToothSet.has(Number(t.dataset.fdiLabel))) t.remove();
          else t.style.display = '';
        });
        clone.querySelectorAll('[data-tooth]').forEach((path) => {
          if (!designToothSet.has(Number(path.dataset.tooth))) path.remove();
          else path.classList.remove('is-selected', 'drag-over');
        });
        const svgText = new XMLSerializer().serializeToString(clone),
          svgImage = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText))),
          inkImage = $('#ink-layer').toDataURL('image/png');
        const heading = design.name || `Design ${index + 1}`,
          groupNames = groups.map((g) => `${g.name || 'Design'} · ${(g.teeth || []).join(', ')}`).join(' / '),
          caption = [`FDI teeth: ${teeth.join(', ') || 'Freehand artwork'}`, groupNames]
            .filter(Boolean)
            .join(' · ');
        cards.push(
          `<figure class="design-layer-print"><h4 class="design-layer-print-title">${esc(heading)}</h4><div class="print-layer-map"><img class="print-layer-teeth" src="${svgImage}" alt="FDI tooth chart for ${esc(heading)}"><img class="print-layer-ink" src="${inkImage}" alt="Sketch and stone overlay for ${esc(heading)}"></div><figcaption>${esc(caption)}</figcaption></figure>`,
        );
      });
    } catch (error) {
      console.error('Order PDF design map:', error);
    } finally {
      state.tool = original.tool;
      state.activeDesignId = original.activeDesignId;
      state.showAllDesigns = original.showAllDesigns;
      state.isolateDrawn = original.isolateDrawn;
      state.selectedTeeth = original.selectedTeeth;
      activeStroke = original.activeStroke;
      capturingPrintMap = false;
      renderTeeth();
      renderInk();
    }
    if (!cards.length) return '';
    return `<section class="print-design-map"><h3 class="print-section-title">Design drawings · FDI tooth chart</h3><p class="print-design-map-note">Each design layer is shown separately. The same tooth may appear in more than one layer.</p><div class="print-design-map-grid">${cards.join('')}</div></section>`;
  }
  function renderPrint(captureDesignMaps = false) {
    if (!captureDesignMaps && $('#print-sheet').hidden) return;
    if ((captureDesignMaps || printDesignMapDirty) && svgChart) {
      printDesignMapHtml = createPrintDesignMaps();
      printDesignMapDirty = false;
    }
    const designMaps = printDesignMapHtml;
    const host = $('#print-sheet'),
      all = assignedIds();
    const layerMaterials = state.designLayers
      .flatMap((layer) => Object.values(layer.materials || {}))
      .map((key) => MATERIALS[key]?.label)
      .filter(Boolean);
    const materialKeys = [
      ...new Set([
        ...state.groups.map((g) => g.material).filter(Boolean),
        ...layerMaterials,
        ...(state.selectedTeeth.length ? [state.editor.material] : []),
      ]),
    ];
    const platingKeys = [
      ...new Set([
        ...state.groups.map((g) => g.plating).filter((p) => p && p !== 'None'),
        ...(state.selectedTeeth.length && state.editor.plating && state.editor.plating !== 'None'
          ? [state.editor.plating]
          : []),
      ]),
    ];
    const levelKeys = [
      ...new Set([
        ...state.groups.map((g) => String(g.level || '1').split(' ')[0]),
        ...(state.selectedTeeth.length ? [String(state.editor.level || '1').split(' ')[0]] : []),
      ]),
    ];
    const materialPics = materialKeys
      .map((m) =>
        ASSET_MATERIAL[m]
          ? `<div class="rollup-item"><img src="${assetUrl('materials', ASSET_MATERIAL[m])}" alt=""><span>${esc(m)}</span></div>`
          : '',
      )
      .join('');
    const platingPics = platingKeys
      .map((m) =>
        ASSET_PLATING[m]
          ? `<div class="rollup-item"><img src="${assetUrl('plating', ASSET_PLATING[m])}" alt=""><span>${esc(m)} plating</span></div>`
          : `<div class="rollup-item"><span>${esc(m)} plating</span></div>`,
      )
      .join('');
    const levelPics = levelKeys
      .map((level) =>
        ASSET_LEVEL[level]
          ? `<div class="rollup-item"><img src="${assetUrl('levels', ASSET_LEVEL[level])}" alt=""><span>Complexity ${esc(level)}</span></div>`
          : '',
      )
      .join('');
    const gemKinds = [
      ...new Map(
        (state.gems || []).map((g) => {
          const key = [g.cut || 'round', g.color || 'clear', Number(g.rotation) || 0].join('|');
          return [
            key,
            {
              cut: g.cut || 'round',
              color: g.color || 'clear',
              rotation: Number(g.rotation) || 0,
            },
          ];
        }),
      ).values(),
    ];
    const gemPics = gemKinds
      .map(({ cut, color, rotation }) => {
        const cutName = GEM_CUTS.find((x) => x[0] === cut)?.[1] || cut;
        return `<div class="rollup-item gem-rollup"><img src="${DIAMOND_FILE(cut)}" alt=""><i style="--gem-color:${GEM_COLORS.find((x) => x[0] === color)?.[1] || '#f6f8fb'}"></i><span>${esc(colorLabel(color))} · ${esc(cutName)} · ${esc(rotation)}°</span></div>`;
      })
      .join('');
    const groupHtml = state.groups.length
      ? state.groups
          .map((g, i) => {
            const groupTeeth = (g.teeth || []).map(Number),
              icedOut = ['full', 'both'].includes(g.stoneMode) || Object.keys(g.pricedIce || {}).length > 0,
              handSet = (g.pricedStones || []).map(
                (x) =>
                  `${x.count || 1} × ${x.color || 'clear'} ${GEM_CUTS.find((c) => c[0] === x.cut)?.[1] || x.cut || 'Round brilliant'} · ${x.stoneType || 'CZ'} · ${Number(x.sizeMm || 1.5).toFixed(1)} mm · FDI ${x.tooth}`,
              );
            return `<article class="print-group"><div class="print-group-head"><strong>${esc(g.name || `Design group ${i + 1}`)}</strong><span>${groupTeeth.length} ${groupTeeth.length === 1 ? 'tooth' : 'teeth'} · ${groupTeeth.join(', ')}</span></div><div class="print-details"><div class="print-detail"><span>Material</span><span>${esc(g.material === 'Gold' ? `Gold ${g.karat}` : g.material)}</span></div><div class="print-detail"><span>Design level</span><span>${esc(g.level)}</span></div><div class="print-detail"><span>Plating</span><span>${esc(g.plating)}</span></div><div class="print-detail"><span>Enamel</span><span>${esc([g.enamel, ...(g.enamelColors || [])].join(' · '))}</span></div><div class="print-detail"><span>Engraving</span><span>${esc(g.engraving)}</span></div><div class="print-detail"><span>Production finish</span><span>${esc(addProductionEffectDetails(g))}</span></div>${g.stoneMode === 'accent' || g.stoneMode === 'both' ? `<div class="print-detail"><span>Accent</span><span>${esc(g.accentCount + ' × ' + g.accentType + ' · ' + g.setting)}</span></div>` : ''}${icedOut ? `<div class="print-detail"><span>Stone coverage</span><span>${esc(g.diamondType || 'Moissanite')} · ${esc(g.coverage || 'Standard pavé')}</span></div>` : ''}${handSet.length ? `<div class="print-detail"><span>Hand-set stones</span><span>${handSet.map(esc).join(' · ')}</span></div>` : ''}${g.stoneNotes ? `<div class="print-detail"><span>Stone notes</span><span>${esc(g.stoneNotes)}</span></div>` : ''}</div></article>`;
          })
          .join('')
      : '<div class="print-notes"><p>No design groups have been assigned yet.</p></div>';
    const signature = state.signature ? `<img src="${esc(state.signature)}" alt="Client signature">` : '';
    const toothIds = [...new Set([...all, ...state.selectedTeeth])].sort((a, b) => a - b).join(', ') || '—';
    const depositPct =
      Number(state.price) > 0 ? Math.round((Number(state.deposit || 0) / Number(state.price)) * 100) : 0;
    host.innerHTML = `<div class="print-header"><img class="print-logo" src="/logo/logo_black.png" alt="EGYGRILLZ"><div class="print-heading"><h2>CLIENT ORDER SHEET</h2><div><strong>${esc(state.orderNo)}</strong><br>${esc(state.status)} · ${esc(state.date || '')}</div></div></div><div class="print-meta"><div><span>Client</span><br><strong>${esc(state.clientName || '—')}</strong>${state.clientPhone ? `<br>${esc(state.clientPhone)}` : ''}</div><div><span>Delivery</span><br><strong>${esc(state.deliveryDate || 'To confirm')}</strong></div><div><span>Teeth · FDI</span><br><strong>${esc(toothIds)}</strong></div><div><span>Reference</span><br><strong>${esc(state.reference || '—')}</strong></div></div>${designMaps}<h3 class="print-section-title">Design specification</h3>${groupHtml}<div class="print-notes"><h3 class="print-section-title" style="margin:0">Notes &amp; special requests</h3><p>${esc(state.notes || '—')}</p><p><strong>Production:</strong> ${esc(productionNotes())}</p>${state.services.length ? `<p><strong>Services:</strong> ${state.services.map((x) => `${esc(x.name)} ×${Number(x.qty) || 1} · ${formatMoney(CalcEngine.calculateService(x).subtotal)}`).join(' · ')}</p>` : ''}<p><strong>Payment:</strong> ${esc(state.paymentMethod)} · Deposit ${esc(Number(state.deposit || 0).toLocaleString('en-US'))} EGP</p></div><div class="print-price"><span>${state.priceMode === 'manual' ? 'Agreed price' : 'Estimated price'} · ${depositPct}% deposit due</span><strong>${esc(formatMoney(state.price))}</strong></div><section class="print-material-rollup"><strong>Materials &amp; finishes used</strong><div class="rollup-row">${materialPics}${platingPics}${levelPics}${gemPics || '<span class="rollup-empty">No placed diamonds</span>'}</div></section><div class="print-signatures"><div class="signature-line">${signature}<span>Client approval</span></div></div><div class="print-legal">${state.agreement ? 'DESIGN SPECIFICATIONS REVIEWED BY CLIENT.' : 'CLIENT REVIEW PENDING.'}</div>`;
  }
  async function loadPricing(force = false) {
    const E = window.CalcEngine;
    if (!E) return;
    const btn = $('#refresh-pricing');
    btn.disabled = true;
    pricingSource = 'loading';
    refreshOrder();
    try {
      const [result] = await Promise.all([E.load(null, { force }), SiteConfig.load(null, { force })]);
      pricingSource = result?.source || 'defaults';
      if (force && window.MetalRates) await MetalRates.load({ force: true });
      if (window.MetalRates?.goldEgpPerGram24() > 0) E.set({ goldPrice: MetalRates.goldEgpPerGram24() });
    } catch {
      pricingSource = 'defaults';
    } finally {
      btn.disabled = false;
      renderOrderOptions();
      renderAll();
      persist();
    }
  }
  function renderOrderOptions() {
    const cfg = CalcEngine.get();
    for (const [id, key, table, labels] of [
      ['#order-timeline', 'timeline', 'timelinePct', 'timeline'],
      ['#order-mold', 'mold', 'moldFlat', 'mold'],
    ]) {
      const el = $(id);
      el.replaceChildren(
        ...Object.keys(cfg[table]).map((k) => new Option(CalcEngine.LABELS[labels][k] || k, k)),
      );
      el.value = state[key];
    }
    renderServiceCatalog();
  }
  function setupChartEvents() {
    const freeDrawToggle = $('#free-draw-outside');
    freeDrawToggle.checked = !!state.freeDraw;
    freeDrawToggle.addEventListener('change', () => {
      state.freeDraw = freeDrawToggle.checked;
      persist();
      setTool(state.tool || 'draw');
    });
    const dialog = $('#enamel-dialog'),
      wells = $('#palette-inputs');
    let palette = [];
    const readPalette = () => [...wells.querySelectorAll('input')].map((el) => el.value.toLowerCase());
    function paletteStatus() {
      palette = readPalette();
      const unique = new Set(palette).size === palette.length;
      $('#use-palette').disabled = !unique;
      $('#palette-tier').textContent = unique
        ? `${OrderDesign.tier(palette.length)} · ${palette.length} colour${palette.length === 1 ? '' : 's'}`
        : 'Each colour must be different.';
    }
    function renderPalette() {
      wells.innerHTML = palette
        .map(
          (c, i) =>
            `<label>Colour ${i + 1}<input type="color" value="${c}"></label>${palette.length > 1 ? `<button type="button" data-remove-colour="${i}" class="mini-btn" aria-label="Remove colour ${i + 1}">−</button>` : ''}`,
        )
        .join('');
      paletteStatus();
    }
    function chooseEnamel() {
      palette = (state.editor.palette || ['#b32841']).map(OrderDesign.hex).filter(Boolean);
      if (!palette.length) palette = ['#b32841'];
      renderPalette();
      dialog.returnValue = '';
      dialog.showModal();
    }
    wells.oninput = paletteStatus;
    wells.onclick = (e) => {
      const b = e.target.closest('[data-remove-colour]');
      if (b) {
        palette.splice(Number(b.dataset.removeColour), 1);
        renderPalette();
      }
    };
    $('#add-colour').onclick = () => {
      let next = GEM_COLORS.map((x) => x[1]).find((c) => !palette.includes(c));
      while (!next || palette.includes(next))
        next =
          '#' +
          Math.floor(Math.random() * 16777216)
            .toString(16)
            .padStart(6, '0');
      palette.push(next);
      renderPalette();
    };
    dialog.addEventListener('close', () => {
      if (dialog.returnValue === 'apply') {
        state.editor.palette = readPalette();
        state.reviewLayerId = '';
        state.selectedGemId = '';
        setTool('enamel');
        renderInk();
        renderDesignMode();
        persist();
      }
    });
    $('#edit-palette').onclick = chooseEnamel;
    renderGemOptions();
    updateFinishSwatches();
    setTool(state.tool || 'select');
    $('#save-current-design').addEventListener('click', saveCurrentDesignTemplate);
    $('#load-saved-design').addEventListener('click', loadSelectedDesignTemplate);
    document.addEventListener('click', (e) => {
      const chip = e.target.closest('.material-chip');
      if (chip) {
        state.editor.materialKey = chip.dataset.material;
        state.editor.material = MATERIALS[chip.dataset.material].label;
        $('#material').value = state.editor.material;
        renderTeeth();
        persist();
        return;
      }
      const rotateBtn = e.target.closest('[data-rotate]');
      if (rotateBtn) {
        const gem = state.gems.find((x) => x.id === state.selectedGemId);
        if (gem) {
          gem.rotation = ((Number(gem.rotation) || 0) + Number(rotateBtn.dataset.rotate) + 360) % 360;
          $('#gem-rotation').value = gem.rotation;
          $('#gem-rotation-value').textContent = `${gem.rotation}°`;
          renderInk();
          persist();
          renderPrint();
        } else notify('Tap a diamond to select it before rotating');
        return;
      }
      const tool = e.target.closest('[data-tool]');
      if (tool) {
        if (tool.disabled) return;
        if (tool.dataset.tool === 'enamel') {
          chooseEnamel();
          return;
        }
        state.reviewLayerId = '';
        state.selectedGemId = '';
        renderDesignMode();
        setTool(tool.dataset.tool);
        renderGemOptions();
        renderInk();
        persist();
        if (state.tool === 'gem') $('#diamond-options').open = true;
        return;
      }
      const layerButton = e.target.closest('[data-layer]');
      if (layerButton) {
        const l = state.designLayers.find((l) => l.id === layerButton.dataset.layer);
        if (l?.teeth.length) activateLayer(l);
        return;
      }
      const cut = e.target.closest('[data-cut]');
      if (cut) {
        state.editor.diamondCut = cut.dataset.cut;
        selectedStoneBatch().forEach((g) => (g.cut = state.editor.diamondCut));
        renderGemOptions();
        persist();
        renderInk();
        renderPrint();
        refreshOrder();
        return;
      }
      const gemColor = e.target.closest('[data-gem-color]');
      if (gemColor) {
        state.editor.gemColor = gemColor.dataset.gemColor;
        renderGemOptions();
        if (state.selectedGemId) {
          const gem = state.gems.find((x) => x.id === state.selectedGemId);
          if (gem) gem.color = state.editor.gemColor;
          refreshOrder();
        }
        persist();
        renderInk();
        renderPrint();
        return;
      }
    });
    let draggingGemId = null,
      tapAction = null,
      dragOrigin = null,
      drawingPointer = null;
    const canvas = $('#ink-layer'),
      viewport = $('#chart-viewport');
    svgChart.addEventListener('keydown', (e) => {
      if (e.target.dataset.tooth && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        toggleTooth(Number(e.target.dataset.tooth));
      }
    });
    const activeTouches = new Map();
    let touchGesture = null;
    viewport.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType !== 'touch') return;
        e.preventDefault();
        if (state.tool === 'select') viewport.setPointerCapture(e.pointerId);
        activeTouches.set(e.pointerId, {
          x: e.clientX,
          y: e.clientY,
          startX: e.clientX,
          startY: e.clientY,
          lastX: e.clientX,
          lastY: e.clientY,
          moved: false,
        });
        if (activeTouches.size === 1) {
          touchGesture = {
            mode: state.tool === 'select' ? 'tap-pan' : 'draw',
            startX: e.clientX,
            startY: e.clientY,
            startScrollLeft: viewport.scrollLeft,
            startScrollTop: viewport.scrollTop,
          };
        } else if (activeTouches.size === 2) {
          if (dragOrigin && draggingGemId)
            Object.assign(
              state.gems.find((g) => g.id === draggingGemId),
              dragOrigin,
            );
          draggingGemId = dragOrigin = tapAction = activeStroke = drawingPointer = null;
          renderInk();
          for (const id of activeTouches.keys()) viewport.setPointerCapture(id);
          e.stopPropagation();
          const points = [...activeTouches.values()],
            rect = viewport.getBoundingClientRect(),
            cx = (points[0].x + points[1].x) / 2 - rect.left,
            cy = (points[0].y + points[1].y) / 2 - rect.top;
          touchGesture = {
            mode: 'pinch',
            distance: Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)),
            zoom,
            scrollLeft: viewport.scrollLeft,
            scrollTop: viewport.scrollTop,
            cx,
            cy,
            rect,
          };
        }
      },
      true,
    );
    viewport.addEventListener('pointermove', (e) => {
      if (!activeTouches.has(e.pointerId)) return;
      e.preventDefault();
      const point = activeTouches.get(e.pointerId),
        dx = e.clientX - point.lastX,
        dy = e.clientY - point.lastY;
      point.x = e.clientX;
      point.y = e.clientY;
      if (Math.hypot(e.clientX - point.startX, e.clientY - point.startY) > 8) point.moved = true;
      point.lastX = e.clientX;
      point.lastY = e.clientY;
      if (activeTouches.size > 1 && touchGesture?.mode === 'pinch') {
        const points = [...activeTouches.values()],
          distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)),
          rect = viewport.getBoundingClientRect(),
          cx = (points[0].x + points[1].x) / 2 - rect.left,
          cy = (points[0].y + points[1].y) / 2 - rect.top;
        zoom = Math.max(0.5, Math.min(5, (touchGesture.zoom * distance) / touchGesture.distance));
        applyZoom(zoom, cx, cy);
      } else if (
        activeTouches.size === 1 &&
        (state.tool === 'select' || touchGesture?.mode === 'pan') &&
        point.moved
      ) {
        viewport.scrollLeft -= dx;
        viewport.scrollTop -= dy;
      }
    });
    const endTouch = (e) => {
      if (!activeTouches.has(e.pointerId)) return;
      const point = activeTouches.get(e.pointerId);
      activeTouches.delete(e.pointerId);
      if (viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId);
      if (activeTouches.size === 1) {
        const remaining = [...activeTouches.values()][0];
        remaining.lastX = remaining.x;
        remaining.lastY = remaining.y;
        remaining.moved = true;
        touchGesture = { mode: 'pan' };
        return;
      }
      if (activeTouches.size) return;
      if (
        e.type === 'pointerup' &&
        point &&
        !point.moved &&
        touchGesture?.mode === 'tap-pan' &&
        state.tool === 'select'
      ) {
        const pos = svgPoint({ clientX: e.clientX, clientY: e.clientY });
        if (pos) {
          for (const path of svgChart.querySelectorAll('[data-tooth]'))
            try {
              if (path.isPointInFill(pos)) {
                toggleTooth(Number(path.dataset.tooth));
                break;
              }
            } catch (err) {}
        }
      }
      touchGesture = null;
    };
    viewport.addEventListener('pointerup', endTouch);
    viewport.addEventListener('pointercancel', endTouch);
    canvas.addEventListener('pointerdown', (e) => {
      if (activeTouches.size > 1 || drawingPointer != null || e.button !== 0 || state.tool === 'select')
        return;
      if (state.newDesignSelection || !activeLayer()?.teeth.length) {
        notify('Add a design before drawing');
        return;
      }
      const coords = svgCoordFromEvent(e);
      if (!coords) return;
      if (!state.freeDraw && state.isolateDesign && !pointInActiveDesignBounds(coords)) return;
      drawingPointer = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      if (state.tool === 'gem') {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        let gem = gemAt(coords.x, coords.y);
        if (gem) {
          state.selectedGemId = gem.id;
          state.editor.diamondCut = gem.cut || 'round';
          state.editor.gemColor = gem.color || 'clear';

          $('#gem-size').value = gem.sizeMm;
          $('#gem-size-value').textContent = `${Number(gem.sizeMm).toFixed(1)} mm`;
          $('#gem-rotation').value = Number(gem.rotation) || 0;
          $('#gem-rotation-value').textContent = `${Number(gem.rotation) || 0}°`;
          draggingGemId = gem.id;
          dragOrigin = { x: gem.x, y: gem.y, tooth: gem.tooth };
          renderInk();
        } else {
          const point = pointOnTooth(e);
          if (!point || !activeLayer().teeth.includes(point.tooth)) return;
          tapAction = () => addGem(point.tooth, point.x, point.y);
        }
        return;
      }
      const toothPoint = pointOnTooth(e);
      if (toothPoint && !activeLayer().teeth.includes(toothPoint.tooth)) return;
      if (
        state.tool === 'pave' &&
        (!toothPoint || !supportsStones(materialKeyForLayerTooth(activeLayer().id, toothPoint.tooth)))
      ) {
        notify('Pavé needs a gold or silver tooth');
        return;
      }
      if (state.tool === 'ice') {
        if (toothPoint) tapAction = () => fillToothWithGems(toothPoint.tooth);
        return;
      }
      if (state.tool === 'enamel') {
        if (toothPoint)
          tapAction = () => {
            state.ink.push({
              effect: 'enamel',
              designId: activeLayer().id,
              tooth: toothPoint.tooth,
              colors: [...state.editor.palette],
              createdAt: Date.now(),
            });
            renderAll();
            persist();
          };
        return;
      }
      if (!['draw', 'pave', 'laser', 'white', 'emboss'].includes(state.tool)) return;
      const point = coords;
      if (!point || (!state.freeDraw && !toothPoint)) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const layer = activeLayer(),
        tooth =
          toothPoint?.tooth ||
          pointInAnyTooth(point.x, point.y) ||
          state.selectedTeeth[0] ||
          (layer?.teeth || [])[0] ||
          0;
      if (tooth) layer.teeth = [...new Set([...(layer.teeth || []), tooth])];
      const clipTeeth = [
        ...new Set([
          ...(layer?.teeth || []),
          ...state.selectedTeeth.map(Number),
          ...(tooth ? [Number(tooth)] : []),
        ]),
      ];
      activeStroke = {
        tooth,
        designId: layer.id,
        material: materialKeyForLayerTooth(layer.id, tooth),
        laserStyle: state.tool === 'white' ? 'cutout' : 'engrave',
        kind: state.tool,
        effect: ['laser', 'white'].includes(state.tool)
          ? 'laser'
          : state.tool === 'emboss'
            ? 'emboss'
            : 'standard',
        freeDraw: !!state.freeDraw,
        clipToTooth: !state.freeDraw,
        clipTeeth,
        width: Number($('#brush-size').value) || 2,
        points: [{ x: point.x, y: point.y }],
      };
      renderInk();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (drawingPointer !== e.pointerId) return;
      if (draggingGemId && canvas.hasPointerCapture(e.pointerId)) {
        const p = svgCoordFromEvent(e),
          gem = state.gems.find((x) => x.id === draggingGemId);
        const tooth = pointOnTooth(e)?.tooth;
        if (
          p &&
          gem &&
          activeLayer().teeth.includes(tooth) &&
          supportsStones(materialKeyForLayerTooth(gem.designId, tooth)) &&
          (tooth === gem.tooth ||
            (gem.kind !== 'iced' && gemCountOnTooth(gem.designId, tooth) < MAX_STONES_PER_TOOTH))
        ) {
          gem.x = p.x;
          gem.y = p.y;
          gem.tooth = tooth;
          renderInk();
        }
        return;
      }
      if (!activeStroke || !canvas.hasPointerCapture(e.pointerId)) return;
      const evs = e.getCoalescedEvents && e.getCoalescedEvents().length ? e.getCoalescedEvents() : [e];
      evs.forEach((ev) => {
        const point = svgCoordFromEvent(ev);
        if (!point || (!activeStroke.freeDraw && !pointInActiveDesignBounds(point))) return;
        if (activeStroke.clipToTooth && !pointInAnyTooth(point.x, point.y)) return;
        activeStroke.points.push({ x: point.x, y: point.y });
      });
      renderInk();
    });
    const finish = (e) => {
      if (drawingPointer !== e.pointerId) return;
      drawingPointer = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (e.type === 'pointercancel') {
        if (draggingGemId && dragOrigin)
          Object.assign(
            state.gems.find((g) => g.id === draggingGemId),
            dragOrigin,
          );
        activeStroke = draggingGemId = tapAction = dragOrigin = null;
        renderInk();
        return;
      }
      if (tapAction) {
        const fn = tapAction;
        tapAction = null;
        fn();
        return;
      }
      dragOrigin = null;
      if (draggingGemId) {
        draggingGemId = null;
        persist();
        renderTeeth();
        renderGemOptions();
        renderPrint();
        refreshOrder();
        return;
      }
      if (!activeStroke) return;
      const stroke = activeStroke;
      activeStroke = null;
      if (stroke.kind === 'pave') placePaveAlong(stroke.points, stroke.tooth);
      else {
        if (stroke.effect === 'laser' || stroke.effect === 'emboss') {
          const touched = new Set();
          let prev = stroke.points[0];
          for (const p of stroke.points) {
            const steps = Math.max(1, Math.ceil(Math.hypot(p.x - prev.x, p.y - prev.y) / 3));
            for (let i = 1; i <= steps; i++) {
              const id = pointInAnyTooth(
                prev.x + ((p.x - prev.x) * i) / steps,
                prev.y + ((p.y - prev.y) * i) / steps,
              );
              if (activeLayer().teeth.includes(id)) touched.add(id);
            }
            prev = p;
          }
          stroke.touchedTeeth = [...touched];
        }
        stroke.createdAt = Date.now();
        state.ink.push(stroke);
        persist();
        renderTeeth();
        refreshOrder();
        renderPrint();
      }
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
    canvas.addEventListener('keydown', (e) => {
      if (!state.selectedGemId || state.tool !== 'gem') return;
      if (e.key === '[' || e.key === ']') {
        e.preventDefault();
        const current = Number($('#gem-rotation').value) || 0;
        setGemRotation(current + (e.key === ']' ? 15 : -15));
      }
    });
    $('#brush-size').addEventListener('input', (e) => {
      const n = Number(e.target.value);
      $('#brush-value').textContent = String(n);
      $('#brush-dot').style.setProperty('--brush-size', `${Math.max(2, n)}px`);
    });
    $('#gem-size').addEventListener('input', (e) => {
      const n = Number(e.target.value);
      $('#gem-size-value').textContent = `${n.toFixed(1)} mm`;
      selectedStoneBatch().forEach((g) => (g.sizeMm = n));
      renderInk();
      persist();
      renderPrint();
      refreshOrder();
    });
    const setGemRotation = (value) => {
      const gem = state.gems.find((x) => x.id === state.selectedGemId);
      if (!gem) {
        notify('Tap a diamond to select it before rotating');
        return;
      }
      gem.rotation = ((Math.round(Number(value) || 0) % 360) + 360) % 360;
      $('#gem-rotation').value = gem.rotation;
      $('#gem-rotation-value').textContent = `${gem.rotation}°`;
      renderInk();
      persist();
      renderPrint();
    };
    $('#gem-rotation').addEventListener('input', (e) => setGemRotation(e.target.value));
    $('#gem-spacing').addEventListener(
      'input',
      (e) => ($('#gem-spacing-value').textContent = `${Number(e.target.value).toFixed(1)} mm`),
    );
    $('#delete-selected-gem').addEventListener('click', () => {
      if (!state.selectedGemId) return;
      const selected = state.gems.find((g) => g.id === state.selectedGemId),
        operation = selected?.kind === 'iced' ? selected.operationId : '';
      state.gems = state.gems.filter((g) =>
        operation
          ? !(g.designId === selected.designId && g.operationId === operation)
          : g.id !== state.selectedGemId,
      );
      state.selectedGemId = '';
      state.icedTeeth = (state.icedTeeth || [])
        .map((rec) => ({
          ...rec,
          count: state.gems.filter(
            (g) => g.designId === rec.designId && Number(g.tooth) === Number(rec.tooth) && g.kind === 'iced',
          ).length,
        }))
        .filter((rec) => rec.count > 0);
      persist();
      renderTeeth();
      renderPrint();
      refreshOrder();
      notify(operation ? 'Iced fill removed' : 'Stone removed');
    });
    $('#add-design-layer').onclick = () => {
      if (state.newDesignSelection) {
        $('#chart-viewport').scrollIntoView({ block: 'center' });
        return;
      }
      newDesignLayer();
      $('#group-name').focus();
    };
    $('#save-design-details').onclick = saveDesignDetails;
    $('#back-to-drawing').onclick = () => {
      state.reviewLayerId = '';
      renderDesignMode();
      persist();
      $('#chart-viewport').scrollIntoView({ block: 'center' });
    };
    $('#discard-design').onclick = () => {
      const l = activeLayer();
      if (!l.draft || !confirm('Discard this unpriced drawing?')) return;
      for (const k of ['ink', 'gems', 'icedTeeth']) state[k] = state[k].filter((x) => x.designId !== l.id);
      state.designLayers = state.designLayers.filter((x) => x !== l);
      normalizeDesignState();
      newDesignLayer();
    };
    $('#isolate-design').addEventListener('click', () => {
      state.isolateDesign = !state.isolateDesign;
      state.showAllDesigns = false;
      persist();
      renderTeeth();
    });
    $('#show-all-designs').addEventListener('click', () => {
      state.showAllDesigns = !state.showAllDesigns;
      persist();
      renderAll();
    });
    $('#undo-ink').addEventListener('click', () => {
      const layer = activeLayer(),
        lastGem = [...state.gems].filter((g) => g.designId === layer.id).at(-1),
        strokeIndex = state.ink.map((x) => x.designId).lastIndexOf(layer.id),
        lastStroke = strokeIndex >= 0 ? state.ink[strokeIndex] : null;
      if (lastGem && (!lastStroke || (lastGem.createdAt || 0) >= (lastStroke.createdAt || 0))) {
        const op = lastGem.operationId;
        state.gems = state.gems.filter(
          (g) => g.designId !== layer.id || (op ? g.operationId !== op : g !== lastGem),
        );
        if (state.selectedGemId === lastGem.id) state.selectedGemId = '';
      } else if (strokeIndex >= 0) state.ink.splice(strokeIndex, 1);
      state.icedTeeth = (state.icedTeeth || [])
        .map((rec) => ({
          ...rec,
          count: state.gems.filter(
            (g) => g.designId === rec.designId && Number(g.tooth) === Number(rec.tooth) && g.kind === 'iced',
          ).length,
        }))
        .filter((rec) => rec.count > 0);
      persist();
      renderTeeth();
      renderPrint();
      refreshOrder();
    });
    $('#zoom-in').addEventListener('click', () => applyZoom(zoom + 0.25));
    $('#zoom-out').addEventListener('click', () => applyZoom(zoom - 0.25));
    $('#zoom-fit').addEventListener('click', () => applyZoom(1));

    window.addEventListener('resize', resizeInk);
    new ResizeObserver(resizeInk).observe($('#chart-viewport'));
  }
  const recordError = (err, action) =>
    err?.code === 'permission-denied'
      ? 'Studio permission denied. Check the signed-in EditX account and published Firestore rules.'
      : `Could not ${action}. Check your connection and retry.`;
  const signInHint =
    'Sign in to <a href="/editx.html" target="_blank" rel="noopener">EditX ↗</a> to use studio records, or enter details manually.';
  let directoryVersion = 0;
  function useClient(c) {
    if (
      state.clientName &&
      state.clientName !== c.name &&
      !confirm('Replace the client on this sheet? The design will be kept.')
    )
      return;
    const changed =
      c.id !== state.clientId || (c.phone || '') !== state.clientPhone || (c.name || '') !== state.clientName;
    state.clientId = c.id || '';
    state.clientName = c.name || '';
    state.clientPhone = c.phone || '';
    state.clientEmail = c.email || '';
    state.appointmentDate = c.appointmentDate || '';
    state.appointmentTime = c.appointmentTime || '';
    if (changed) {
      state.quoteId = '';
      state.signature = '';
      state.agreement = false;
    } // never transfer a different client's approval
    syncInputs();
    renderAll();
    persist();
    $('#client-search').value = '';
    $('#client-results').hidden = true;
    $('#client-search-status').textContent =
      'Client loaded from EditX' +
      (c.appointmentDate ? ` · ${c.appointmentDate} ${c.appointmentTime || ''}` : '');
  }
  function showClients() {
    const results = $('#client-results'),
      term = $('#client-search').value.toLowerCase().trim();
    results.replaceChildren();
    results.hidden = true;
    if (!term || !staffUser) return;
    const digits = term.replace(/\D/g, '');
    const hits = appointmentClients
      .filter(
        (c) =>
          [c.name, c.phone, c.email].join(' ').toLowerCase().includes(term) ||
          (digits &&
            String(c.phone || '')
              .replace(/\D/g, '')
              .includes(digits)),
      )
      .slice(0, 10);
    for (const c of hits) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'client-result';
      btn.innerHTML = `<span><strong>${esc(c.name || 'Unnamed client')}</strong><small>${esc(c.phone)} ${esc(c.email)}</small></span><small>${esc(c.appointmentDate || 'Client record')}</small>`;
      btn.addEventListener('click', () => useClient(c));
      results.append(btn);
    }
    results.hidden = !hits.length;
    $('#client-search-status').textContent = hits.length
      ? 'Choose a matching studio record.'
      : 'No match in recent records. Enter this client manually or open their file in EditX.';
  }
  async function refreshDirectory() {
    const version = ++directoryVersion,
      status = $('#client-search-status');
    if (!staffUser) {
      status.innerHTML = signInHint;
      return;
    }
    status.textContent = 'Loading EditX appointments and clients…';
    try {
      const rows = await records.directory();
      if (version !== directoryVersion) return;
      appointmentClients = rows;
      status.textContent = `${rows.length} recent client records available.`;
      showClients();
    } catch (e) {
      if (version === directoryVersion) {
        appointmentClients = [];
        $('#client-results').hidden = true;
        status.textContent = recordError(e, 'load client records');
      }
    }
  }
  async function setupAppointments() {
    $('#client-search').addEventListener('input', showClients);
    $('#client-search').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') $('#client-results').hidden = true;
    });
    $('#refresh-client-search').addEventListener('click', () => (records ? refreshDirectory() : connect()));
    let connecting = false;
    async function connect() {
      if (connecting) return;
      connecting = true;
      try {
        records = await import('/assets/order-records.js?v=1');
        records.watchUser(async (user) => {
          staffUser = user;
          appointmentClients = [];
          savedDesignDocs.clear();
          $('#client-results').replaceChildren();
          $('#client-results').hidden = true;
          refreshOrder();
          refreshDirectory();
          loadSavedDesignTemplates();
          if (user && new URLSearchParams(location.search).get('from') === 'editx') {
            try {
              const id = sessionStorage.getItem('egygz_order_client');
              if (!id) return;
              const c = await records.client(id);
              if (staffUser !== user) return;
              sessionStorage.removeItem('egygz_order_client');
              history.replaceState(null, '', location.pathname);
              if (c) useClient(c);
              else notify('This client no longer exists in EditX.');
            } catch (e) {
              notify(recordError(e, 'open the EditX client'));
            }
          }
        });
      } catch {
        $('#client-search-status').textContent =
          'Studio directory offline. Enter details manually or refresh records.';
      } finally {
        connecting = false;
      }
    }
    connect();
  }
  function renderAll() {
    renderTeeth();
    renderGroups();
    renderSummary();
    renderPrint();
    renderServiceRows();
    renderProductionChecklist();
  }
  function syncSignature(force = false) {
    const canvas = $('#signature-pad');
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(300, Math.floor(rect.width * ratio)),
      h = Math.max(100, Math.floor(rect.height * ratio));
    const resized = canvas.width !== w || canvas.height !== h;
    if (resized) {
      canvas.width = w;
      canvas.height = h;
    }
    if (resized || force) {
      const ctx = canvas.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      if (state.signature) {
        const src = state.signature,
          img = new Image();
        img.onload = () => {
          if (state.signature === src) ctx.drawImage(img, 0, 0, rect.width, rect.height);
        };
        img.src = src;
      }
    }
  }
  async function loadSavedDesignTemplates() {
    const select = $('#saved-design-templates'),
      status = $('#design-template-status');
    if (!select) return;
    $('#save-current-design').disabled = $('#load-saved-design').disabled = !records || !staffUser;
    if (!records || !staffUser) {
      savedDesignDocs.clear();
      select.innerHTML = '<option value="">Sign in to load saved designs</option>';
      if (status) status.textContent = 'Staff sign-in required';
      return;
    }
    const user = staffUser;
    try {
      const docs = await records.templates();
      if (staffUser !== user) return;
      savedDesignDocs = new Map(docs.map((d) => [d.id, d]));
      const current = select.value;
      select.innerHTML =
        '<option value="">Choose a saved design</option>' +
        [...savedDesignDocs.entries()]
          .map(([id, d]) => `<option value="${esc(id)}">${esc(d.name || 'Unnamed design')}</option>`)
          .join('');
      if (savedDesignDocs.has(current)) select.value = current;
      if (status)
        status.textContent = `${savedDesignDocs.size} saved design${savedDesignDocs.size === 1 ? '' : 's'} in the studio library`;
    } catch (e) {
      if (staffUser !== user) return;
      console.warn('Saved design templates:', e);
      select.innerHTML = '<option value="">Saved designs unavailable</option>';
      if (status)
        status.textContent =
          e.code === 'permission-denied'
            ? 'Staff permission needed for design_templates'
            : 'Could not load saved designs';
    }
  }
  async function saveCurrentDesignTemplate() {
    if (!records || !staffUser) {
      notify('Sign in to EditX to save designs to the database');
      return;
    }
    const layer = activeLayer();
    if (!layer?.teeth?.length) {
      notify('Start a named design with selected teeth first');
      return;
    }
    const groups = state.groups.filter((g) => g.layerId === layer.id),
      template = {
        name: String(layer.name || 'Design')
          .trim()
          .slice(0, 60),
        teeth: (layer.teeth || []).map(Number),
        materials: layer.materials || {},
        mode: layer.mode,
        details: structuredClone(layer.details),
        legacy: !!layer.legacy,
        groups: JSON.parse(JSON.stringify(groups)),
        icedTeeth: state.icedTeeth
          .filter((x) => x.designId === layer.id)
          .map((x) => ({ ...x, designId: '' })),
        ink: state.ink.filter((x) => x.designId === layer.id).map((x) => ({ ...x, designId: '' })),
        gems: state.gems.filter((x) => x.designId === layer.id).map((x) => ({ ...x, designId: '' })),
        createdBy: staffUser.uid,
        updatedAt: new Date().toISOString(),
      };
    if (!groups.length || layerPending(layer)) {
      notify('Apply the design details before saving a template');
      return;
    }
    try {
      const ref = await records.saveTemplate(template);
      await loadSavedDesignTemplates();
      $('#saved-design-templates').value = ref.id;
      notify(`“${template.name}” saved to the design library`);
    } catch (e) {
      console.error('Save design template:', e);
      notify(
        e.code === 'permission-denied'
          ? 'Database permission denied; publish the staff design_templates rule'
          : 'Could not save this design',
      );
    }
  }
  async function loadSelectedDesignTemplate() {
    if (!records || !staffUser) {
      notify('Sign in to load saved studio designs');
      return;
    }
    const id = $('#saved-design-templates').value;
    if (!id) {
      notify('Choose a saved design first');
      return;
    }
    try {
      const source = savedDesignDocs.get(id);
      if (!source) {
        notify('Refresh the studio library and try again');
        return;
      }
      const newId = `design-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        teeth = [...new Set((source.teeth || []).map(Number).filter((n) => n > 0))],
        layer = {
          id: newId,
          name: String(source.name || 'Saved design').slice(0, 60),
          teeth,
          materials: { ...(source.materials || {}) },
          mode: source.mode,
          details: source.details && structuredClone(source.details),
          legacy: !!source.legacy,
          visible: true,
        };
      state.designLayers = state.designLayers.filter((l) => l.teeth.length);
      layer.draft = !source.groups?.length;
      state.designLayers.push(layer);
      source.icedTeeth?.forEach((x) => state.icedTeeth.push({ ...x, designId: newId }));
      source.groups?.forEach((g) =>
        state.groups.push({
          ...g,
          id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          layerId: newId,
          teeth: (g.teeth || []).map(Number),
        }),
      );
      source.ink?.forEach((st) =>
        state.ink.push({
          ...st,
          id: `ink-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          designId: newId,
        }),
      );
      source.gems?.forEach((g) =>
        state.gems.push({
          ...g,
          id: `gem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          designId: newId,
        }),
      );
      Object.entries(layer.materials).forEach(([tooth, material]) => {
        state.toothMaterials[tooth] = material;
      });
      state.activeDesignId = newId;
      normalizeDesignState();
      activateLayer(activeLayer());
      notify(`Loaded “${layer.name}” as a new design layer`);
    } catch (e) {
      console.error('Load design template:', e);
      notify('Could not load the saved design');
    }
  }
  function saveDraft(show = true) {
    try {
      const drafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');
      if (!state.id) state.id = crypto.randomUUID();
      const entry = {
        id: state.id,
        label: `${state.clientName || 'New client'} · ${state.orderNo}`,
        updatedAt: new Date().toISOString(),
        state,
      };
      const index = drafts.findIndex((d) => d.id === state.id);
      if (index >= 0) drafts[index] = entry;
      else drafts.unshift(entry);
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts.slice(0, 40)));
      populateDrafts();
      persist();
      if (show) notify('Draft saved on this device');
      return true;
    } catch (e) {
      notify('Could not save draft — browser storage may be full');
      return false;
    }
  }
  function populateDrafts() {
    try {
      const drafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');
      const select = $('#saved-drafts');
      select.innerHTML =
        '<option value="">Saved sheets</option>' +
        drafts.map((d) => `<option value="${esc(d.id)}">${esc(d.label)}</option>`).join('');
    } catch (e) {}
  }
  function loadDraft(id) {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]').find((x) => x.id === id);
      if (!d) return;
      state = Object.assign(blankState(), d.state);
      normalizeDesignState();
      syncInputs();
      renderAll();
      showStep(steps.includes(state.step) ? state.step : 'client');
      notify('Saved sheet opened');
    } catch (e) {
      notify('Could not open this sheet');
    }
  }
  function syncLayerTeeth(layer) {
    const groups = state.groups.filter((g) => g.layerId === layer.id);
    layer.teeth = [...new Set(groups.flatMap((g) => g.teeth))];
    layer.materials = Object.fromEntries(
      groups.flatMap((g) => g.teeth.map((t) => [t, materialForGroup(g.material)])),
    );
    const keep = (x) =>
      x.designId !== layer.id || (layer.teeth.length && (!x.tooth || layer.teeth.includes(x.tooth)));
    state.ink = state.ink.filter(keep);
    state.gems = state.gems.filter(keep);
    state.icedTeeth = state.icedTeeth.filter(keep);
    state.toothMaterials = Object.assign({}, ...state.designLayers.map((l) => l.materials));
  }
  function removeGroup(id) {
    const group = state.groups.find((g) => g.id === id);
    if (!group || !confirm('Remove this design group and its artwork?')) return;
    state.groups = state.groups.filter((g) => g !== group);
    const layer = state.designLayers.find((l) => l.id === group.layerId);
    if (layer) {
      const wasPending = layerPending(layer);
      syncLayerTeeth(layer);
      if (!wasPending) layer.revision = OrderDesign.revision(state, layer);
      if (!layer.teeth.length) state.designLayers = state.designLayers.filter((l) => l !== layer);
    }
    state.editingGroupId = '';
    state.selectedTeeth = [];
    state.selectedGemId = '';
    state.isolateDesign = false;
    state.newDesignSelection = true;
    normalizeDesignState();
    setTool('select');
    renderAll();
    persist();
  }
  function editGroup(id) {
    const group = state.groups.find((g) => g.id === id),
      layer = state.designLayers.find((l) => l.id === group?.layerId);
    if (layer) {
      activateLayer(layer);
      reviewDesign();
    }
  }
  function updateField(el) {
    const key = el.dataset.field;
    if (key === 'designMode') {
      setDesignMode(el.value);
      return;
    }
    if (['clientName', 'clientPhone', 'clientEmail'].includes(key) && el.value !== state[key]) {
      state.quoteId = '';
      state.clientId = '';
      state.agreement = false;
      state.signature = '';
      $('#agreement').checked = false;
      syncSignature(true);
    }
    state[key] = el.type === 'checkbox' ? el.checked : el.value;
    if (key === 'deposit') state.depositAuto = el.value === '';
    $$('[data-field]').forEach((peer) => {
      if (peer !== el && peer.dataset.field === key) {
        if (peer.type === 'checkbox') peer.checked = !!state[key];
        else peer.value = state[key] || '';
      }
    });
    renderSummary();
    renderPrint();
    persist();
    if (key === 'productionStage') renderProductionChecklist();
  }
  function updateEditor(el) {
    const key = el.dataset.editor;
    state.editor[key] = el.value;
    renderSummary();
    renderPrint();
    persist();
  }
  document.addEventListener('input', (e) => {
    const detail = e.target.closest('[data-detail]');
    if (detail) {
      const l = activeLayer();
      if (l.id !== state.reviewLayerId) return;
      const d = (l.details[detail.dataset.row] ||= {});
      d[detail.dataset.detail] = detail.value;
      if (detail.dataset.detail === 'accentType') d.accentCustomPrice = '';
      if (detail.dataset.detail === 'diamondType') d.fullCustomPrice = '';
      if (['accentType', 'diamondType', 'level'].includes(detail.dataset.detail)) renderDetailForm();
      refreshOrder();
      persist();
      return;
    }
    const field = e.target.closest('[data-field]');
    if (field) {
      updateField(field);
      return;
    }
    const editor = e.target.closest('[data-editor]');
    if (editor) updateEditor(editor);
  });
  document.addEventListener('change', (e) => {
    const mix = e.target.closest('[data-mix-tooth]');
    if (mix) {
      const id = Number(mix.dataset.mixTooth),
        key = mix.dataset.mixField;
      state.pendingToothSpecs[id] = state.pendingToothSpecs[id] || {};
      state.pendingToothSpecs[id][key] = mix.value;
      if (key === 'material' && mix.value !== 'Gold') state.pendingToothSpecs[id].karat = '18K';
      persist();
      renderGemOptions();
      setTool(state.tool || 'select');
      renderMixedToothSpecs();
      return;
    }
  });
  document.addEventListener('click', (e) => {
    const tooth = e.target.closest('[data-tooth]');
    if (tooth) {
      if (e.pointerType === 'touch') return;
      toggleTooth(Number(tooth.dataset.tooth));
      return;
    }
    const action = e.target.closest('[data-action]');
    if (!action) return;
    switch (action.dataset.action) {
      case 'select-upper':
        state.selectedTeeth = [
          ...new Set([...state.selectedTeeth, ...UPPER.filter((id) => assignedGroupFor(id) < 0)]),
        ];
        break;
      case 'select-lower':
        state.selectedTeeth = [
          ...new Set([...state.selectedTeeth, ...LOWER.filter((id) => assignedGroupFor(id) < 0)]),
        ];
        break;
      case 'clear-selection':
        clearSelection();
        break;
      case 'apply-design':
        applyDesign();
        return;
      case 'remove-group':
        removeGroup(action.dataset.id);
        return;
      case 'edit-group':
        editGroup(action.dataset.id);
        return;
    }
    persist();
    renderAll();
  });
  $('#saved-drafts').addEventListener('change', (e) => {
    if (e.target.value) loadDraft(e.target.value);
  });
  $('#save-draft').addEventListener('click', () => saveDraft(true));
  $('#new-sheet').addEventListener('click', () => {
    if (
      state.clientName ||
      state.services.length ||
      state.groups.length ||
      state.notes ||
      state.selectedTeeth.length ||
      state.ink.length ||
      state.signature
    ) {
      if (!confirm('Save this sheet as a local draft and start a new one?') || !saveDraft(false)) return;
    }
    state = blankState();
    normalizeDesignState();
    syncInputs();
    renderAll();
    persist();
    showStep('client');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  let printPrepared = false;
  $('#print-sheet-btn').addEventListener('click', async () => {
    renderPrint(true);
    printPrepared = true;
    try {
      await Promise.allSettled([...$('#print-sheet').querySelectorAll('img')].map((img) => img.decode()));
      window.print();
    } finally {
      printPrepared = false;
    }
  });
  $('#create-proforma-btn').addEventListener('click', sendProforma);
  $('#add-order-service').addEventListener('click', addOrderService);
  $('#order-service-type').addEventListener('change', () => {
    $('#custom-service-label').hidden = $('#order-service-name').hidden =
      $('#order-service-type').value !== 'custom';
    $('#order-service-price').placeholder =
      $('#order-service-type').value === 'custom'
        ? 'Required custom price'
        : 'Optional studio-price override';
    updateServicePriceHint();
  });
  $('#order-service-price').addEventListener('input', updateServicePriceHint);
  $('#order-service-name').hidden = true;
  $('#order-services-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove-service]');
    if (!b) return;
    state.services = state.services.filter((x) => x.id !== b.dataset.removeService);
    renderServiceRows();
    renderSummary();
    renderPrint();
    persist();
  });
  $$('[data-production-check]').forEach((el) =>
    el.addEventListener('change', () => {
      state.productionChecks[el.dataset.productionCheck] = el.checked;
      persist();
      renderProductionChecklist();
      renderPrint();
    }),
  );
  $('#clear-signature').addEventListener('click', () => {
    state.signature = '';
    signatureDirty = true;
    syncSignature(true);
    persist();
    renderPrint();
  });
  $('#signature-pad').addEventListener('pointerdown', (e) => {
    const canvas = e.currentTarget,
      rect = canvas.getBoundingClientRect(),
      ctx = canvas.getContext('2d');
    canvas.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#161616';
    signatureDirty = true;
  });
  $('#signature-pad').addEventListener('pointermove', (e) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const rect = e.currentTarget.getBoundingClientRect(),
      ctx = e.currentTarget.getContext('2d');
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  });
  $('#signature-pad').addEventListener('pointerup', (e) => {
    const canvas = e.currentTarget;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (signatureDirty) {
      state.signature = canvas.toDataURL('image/png');
      persist();
      renderPrint();
      signatureDirty = false;
    }
  });
  $('#signature-pad').addEventListener('pointercancel', () => {
    const canvas = $('#signature-pad');
    state.signature = canvas.toDataURL('image/png');
    persist();
    renderPrint();
    signatureDirty = false;
  });
  window.addEventListener('resize', () => syncSignature(true));
  window.addEventListener('beforeprint', () => {
    if (!printPrepared) renderPrint(true);
  });

  const steps = ['client', 'design', 'pricing', 'review'];
  function showStep(step, scroll = true) {
    const i = steps.indexOf(step);
    if (i < 0) return;
    state.step = step;
    document.body.dataset.workspace = step;
    $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== step));
    $$('[data-step]').forEach((b) => {
      if (b.dataset.step === step) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    $('#step-back').hidden = i === 0;
    $('#step-next').hidden = i === 3;
    $('#step-next').textContent = `Continue to ${steps[i + 1] || ''} →`;
    $('#step-position').textContent = `Step ${i + 1} of 4`;
    $('#print-sheet').hidden = true;
    $('#preview-sheet').setAttribute('aria-expanded', 'false');
    $('#preview-sheet').textContent = 'Preview order sheet';
    if (step === 'review') requestAnimationFrame(() => syncSignature(true));
    if (step === 'design')
      requestAnimationFrame(() => {
        applyZoom(Number(state.zoom) || 1);
        resizeInk();
      });
    if (scroll) document.querySelector('.step-nav').scrollIntoView({ behavior: 'smooth', block: 'start' });
    persist();
  }
  $$('[data-step]').forEach((b) => b.addEventListener('click', () => showStep(b.dataset.step)));
  $('#step-back').addEventListener('click', () => showStep(steps[steps.indexOf(state.step) - 1]));
  $('#step-next').addEventListener('click', () => showStep(steps[steps.indexOf(state.step) + 1]));
  $('#preview-sheet').addEventListener('click', (e) => {
    const sheet = $('#print-sheet');
    sheet.hidden = !sheet.hidden;
    e.currentTarget.setAttribute('aria-expanded', String(!sheet.hidden));
    e.currentTarget.textContent = sheet.hidden ? 'Preview order sheet' : 'Hide preview';
    if (!sheet.hidden) {
      renderPrint(true);
      sheet.scrollIntoView({ behavior: 'smooth' });
    }
  });
  $('#quote-pdf-btn').addEventListener('click', () => {
    const q = issuedQuote();
    if (q) CalcEngine.downloadQuotePdf(q.order, q);
  });
  $('#save-quote-btn').addEventListener('click', saveStudioQuote);
  $('#price-mode').addEventListener('click', () => {
    state.priceMode = state.priceMode === 'auto' ? 'manual' : 'auto';
    refreshOrder();
    persist();
    if (state.priceMode === 'manual') $('#price').focus();
    renderPrint();
  });
  $('#auto-deposit').addEventListener('click', () => {
    state.depositAuto = true;
    refreshOrder();
    renderPrint();
    persist();
  });
  $('#refresh-pricing').addEventListener('click', () => loadPricing(true));
  renderOrderOptions();
  syncInputs();
  populateDrafts();
  renderAll();
  showStep(steps.includes(state.step) ? state.step : 'client', false);
  loadChart();
  loadPricing();
  setupAppointments();
  if (window.MetalRates) {
    MetalRates.attach(CalcEngine);
    MetalRates.onChange(() => {
      refreshOrder();
      renderPrint();
    });
  }
})();
