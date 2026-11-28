(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
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
    dragPreview = null,
    pricingSource = 'loading',
    records = null,
    currentOrder = null,
    orderBlock = '',
    busy = false,
    saved = null, // header revision and last issued quotation
    cleanSheet = '',
    lockedTerms = '',
    repriceRequested = false,
    dirty = false,
    pendingReceipt = null,
    draftVersion = '',
    preparedMail = null,
    stopPrices = null,
    staffUser = null,
    savedDesignDocs = new Map(),
    printDesignMaps = new Map(),
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
    `EGZ-${today().replace(/-/g, '').slice(2)}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
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
      signatureLines: [],
      editor: {
        name: '',
        material: 'Cobalt Chrome',
        karat: '18K',
        level: '1',
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
  let state = blankState(),
    toastTimer = 0;
  const oldBarLayers = new WeakSet();
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
    // Selection IDs are ephemeral. Older device drafts may lack them entirely.
    const seenGems = new Set();
    for (const g of state.gems) {
      if (!g.id || seenGems.has(g.id)) g.id = crypto.randomUUID();
      seenGems.add(g.id);
    }
    // Hydrate v1 specs once, retaining their pricing until explicitly reviewed.
    const oldLayers = new Set(
      state.groups.filter((g) => !Array.isArray(g.pricedStones)).map((g) => g.layerId),
    );
    OrderDesign.migrateLegacy(state);
    for (const layer of state.designLayers) {
      const groups = state.groups.filter((g) => g.layerId === layer.id);
      if (oldLayers.has(layer.id)) layer.legacy = true;
      if (OrderDesign.oldBarCharges(state, layer, groups)) oldBarLayers.add(layer);
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
    if (!activeLayer()?.teeth.length && !activeLayer()?.recipe && !activeLayer()?.customized)
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
  // Edits are in memory until the studio confirms an explicit database save.
  function persist() {
    dirty = repriceRequested || OrderFile.pack(state) !== cleanSheet;
    $('#save-status').textContent = dirty
      ? 'Unsaved changes'
      : saved
        ? 'Saved to studio database'
        : 'Not saved';
    renderFileActions();
  }
  function fileBase() {
    cleanSheet = OrderFile.pack(state);
    dirty = false;
  }
  function priceLocked() {
    return !!saved?.quote && lockedTerms === OrderFile.termsKey(state);
  }
  window.addEventListener('beforeunload', (e) => {
    if (dirty || busy) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
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
      .filter((l) => l.teeth.length || l.recipe || l.customized)
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
        count.textContent = `${layer.teeth.length} teeth${layerPending(layer) ? (layer.recipe ? ' · to draw' : ' · needs review') : ''}`;
        button.append(content, count);
        host.appendChild(button);
      });
    $('#active-layer-label').textContent = state.newDesignSelection
      ? 'New selection'
      : state.showAllDesigns
        ? 'All designs together'
        : activeLayer()?.name || 'Design layer';
    $('.design-layer-tools').hidden = !state.designLayers.some(
      (l) => l.teeth.length || l.recipe || l.customized,
    );
    $('#show-all-designs').hidden = state.designLayers.filter((l) => l.teeth.length).length < 2;
    $('#isolate-design').hidden = state.newDesignSelection || !!activeLayer()?.recipe;
    $('#show-all-designs').classList.toggle('active', !!state.showAllDesigns);
    $('#show-all-designs').textContent = state.showAllDesigns ? 'Isolate active design' : 'View all together';
  }
  const levels = ['0.5', '1', '2', '3', '4', '5', '6'];
  const platings = ['None', 'Yellow gold', 'White gold', 'Rose gold', 'Black gold', 'Silver plating'];
  const types = ['CZ', 'Moissanite', 'Lab-grown diamond', 'Natural diamond'];
  const options = (values, current) =>
    values.map((v) => `<option ${v === current ? 'selected' : ''}>${esc(v)}</option>`).join('');
  function renderDesignMode() {
    const selecting = state.newDesignSelection,
      layer = activeLayer();
    const reuse = !selecting && !!layer.recipe;
    $('#recipe-progress').hidden = !reuse;
    if (reuse) {
      const missing = OrderRecipe.progress(layer, state);
      const rows = layer.recipe.slots.map((slot, i) => {
        const metal = MATERIALS[materialForGroup(slot.material)].label;
        return `<li><strong>${layer.teeth[i] ? 'FDI ' + layer.teeth[i] : 'Tooth slot ' + (i + 1)}</strong> · ${esc(metal)} · ${esc(CalcEngine.levelName(slot.detail.level))} · ${esc(slot.detail.plating === 'None' ? 'No plating' : slot.detail.plating)}<br>${esc(missing[i] || 'Drawing complete')}</li>`;
      });
      $('#recipe-progress').innerHTML =
        `<strong>${esc(layer.name)}</strong> · ${layer.teeth.length} of ${layer.recipe.slots.length} teeth assigned. ${missing.some(Boolean) ? 'Draw on the chart. Each new tooth takes the next saved slot.' : 'Ready for pricing.'}<ol>${rows.join('')}</ol>`;
    }
    $('#customise-recipe').hidden = !reuse;
    $('#material-palette').hidden = reuse;
    $$('.design-session-bar label').forEach((el) => (el.hidden = reuse));
    $('#design-details-card h2').textContent = reuse ? 'Draw your saved design' : 'Set up your design';
    $('#design-details-card .card-head p').hidden = reuse;
    $('#design-mode-hint').hidden = reuse;
    $('#apply-design').hidden = reuse;
    $('#apply-hint').hidden = reuse;
    $('#design-mode').value = state.designMode;
    $('#design-mode').disabled = $('#group-name').disabled = !selecting;
    $$('.material-chip').forEach((b) => (b.disabled = !selecting && !layer.customized));
    $('.material-palette-label').textContent =
      !selecting && layer.customized ? 'Metal for the next tooth' : 'Material';
    $('#design-mode-hint').textContent = selecting
      ? 'Tap tooth outlines to select or deselect. The material colours your pencil, not the tooth.'
      : `Working on ${layer.name}. Start a new selection to add another design.`;
    $('#design-groups-title').textContent = 'Added designs';
    $('#design-groups-help').textContent = 'Only the applied design details below go to the calculator.';
    $('#apply-design').disabled = selecting ? !state.selectedTeeth.length : !layer.teeth.length;
    $('#apply-design').textContent = selecting ? 'Start drawing' : 'Finish drawing: design details';
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
    card.hidden = !!layer.recipe || state.newDesignSelection || state.reviewLayerId !== layer.id;
    if (card.hidden) {
      $('#review-fields').replaceChildren();
      return;
    }
    const facts = OrderDesign.inspect(state, layer),
      cfg = CalcEngine.get();
    $('#detail-heading').textContent = layer.name;
    $('#detail-caption').textContent = layer.legacy
      ? 'Imported specification. Applying this review replaces the original priced details with the effects currently drawn.'
      : 'Check the finish and the effects used in this drawing. Applying these details updates the estimate.';
    const rows = layer.mode === 'mix' ? layer.teeth.map((id) => [id, [id]]) : [['all', layer.teeth]];
    $('#review-fields').innerHTML = rows
      .map(([key, ids]) => {
        const d = { ...OrderDesign.defaults, ...layer.details?.[key] },
          marks = ids.map((id) => facts.get(id));
        const field = (label, k, choices) =>
          `<label>${label}<select data-detail="${k}" data-row="${key}">${k === 'level' ? levels.map((v) => `<option value="${v}" ${CalcEngine.levelKey(v) === CalcEngine.levelKey(d.level) ? 'selected' : ''}>${CalcEngine.levelName(v)}</option>`).join('') : options(choices, d[k])}</select></label>`;
        const rate = (label, k) =>
          `<label>${label}<input data-detail="${k}" data-row="${key}" type="number" min="0" step="any" required placeholder="EGP" value="${esc(d[k])}"></label>`;
        const colors = [...new Set(marks.flatMap((m) => [...m.colors]))],
          stones = marks.flatMap((m) => m.stones),
          iced = ids.filter((id) => facts.get(id).ice);
        const materials = [
          ...new Set(ids.map((id) => MATERIALS[materialForGroup(layer.materials[id])].label)),
        ];
        return `<fieldset class="detail-row"><legend>FDI ${ids.join(' · ')} &nbsp; / &nbsp; ${esc(materials.join(' + '))}</legend><div class="detail-grid">${
          layer.customized
            ? `<label>Material<select data-fork-metal="${key}">${options(
                Object.values(MATERIALS)
                  .map((m) => m.label)
                  .filter((m) => supportsStones(m) || (!stones.length && !iced.length)),
                materials[0],
              )}</select></label>`
            : ''
        }${field('Complexity', 'level', levels)}${field('Plating', 'plating', platings)}${materials.includes('Gold') ? field('Gold purity', 'karat', ['10K', '14K', '18K', '21K', '22K']) : ''}${marks.some((m) => m.laser) ? field('Laser engraving size', 'engraving', ['Small', 'Medium', 'Large']) : ''}</div>
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
      ${iced.length && OrderDesign.isBar(d.level) ? `<div class="detail-effect"><strong>Iced-out bar · FDI ${iced.join(', ')}</strong><span>One studio bar-setting rate per tooth, regardless of the line’s diamond count.</span></div>` : iced.length ? `<div class="detail-effect"><strong>Iced coverage · FDI ${iced.join(', ')}</strong><div class="detail-grid">${field('Diamond type', 'diamondType', types)}${field('Coverage', 'coverage', ['Standard pavé', 'French pavé', 'Micro-pavé', 'Channel', 'Invisible'])}${cfg.fullPrice[stoneKey(d.diamondType)] == null && !OrderDesign.isBar(d.level) ? rate('Unlisted rate · EGP per tooth', 'fullCustomPrice') : ''}</div></div>` : ''}</fieldset>`;
      })
      .join('');
  }
  function reviewDesign() {
    if (activeLayer().recipe || !activeLayer().teeth.length) return;
    state.reviewLayerId = activeLayer().id;
    $('#review-name').value = activeLayer().name;
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
    state.designLayers = state.designLayers.filter((l) => l.teeth.length || l.recipe || l.customized);
    state.designLayers.push(layer);
    activateLayer(layer);
    notify('Layer ready. Sketch, or finish now for a plain design.');
  }
  function activateLayer(layer) {
    brushOverride = null;
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
    state.editor.materialKey = materialForGroup(
      layer.materials[layer.teeth[0]] || layer.recipe?.slots[0]?.material,
    );
    if (layer.recipe) state.freeDraw = false;
    state.editor.material = MATERIALS[state.editor.materialKey].label;
    syncInputs();
    setTool('draw');
    renderGemOptions();
    renderAll();
    persist();
  }
  const askedNames = new WeakMap();
  let naming = null;
  function suggestName(layer, specs, applying) {
    if (!staffUser || !savedDesignDocs.size || layer.recipe || naming) return false;
    const key = OrderRecipe.matchKey(OrderRecipe.fromLayer(layer, state, specs));
    if (askedNames.get(layer) === key) return false;
    const names = [
      ...new Set(
        [...savedDesignDocs.values()].filter((r) => OrderRecipe.matchKey(r) === key).map((r) => r.name),
      ),
    ].sort();
    if (!names.length || names.includes($('#review-name').value.trim())) return false;
    const dialog = $('#match-design-dialog');
    askedNames.set(layer, key);
    naming = { layer, applying, user: staffUser, target: state };
    $('#match-title').textContent =
      names.length === 1 ? `Is this ${names[0]}?` : 'Which saved design is this?';
    $('#match-name').replaceChildren(...names.map((n) => new Option(n, n)));
    $('#match-choices').hidden = names.length === 1;
    dialog.returnValue = '';
    dialog.showModal();
    return true;
  }
  $('#review-name').onfocus = () => {
    const l = activeLayer();
    if (l.id === state.reviewLayerId && !l.recipe)
      suggestName(l, OrderDesign.compile(l, OrderDesign.inspect(state, l)), false);
  };
  $('#match-design-dialog').onclose = (e) => {
    const pending = naming;
    naming = null;
    if (
      !pending ||
      pending.layer !== activeLayer() ||
      pending.target !== state ||
      pending.user !== staffUser ||
      activeLayer().id !== state.reviewLayerId
    )
      return;
    const choice = e.target.returnValue;
    if (choice === 'edit') {
      $('#review-name').focus();
      $('#review-name').select();
      return;
    }
    if (choice === 'use') $('#review-name').value = $('#match-name').value;
    if (pending.applying && ['keep', 'use'].includes(choice)) saveDesignDetails();
  };
  function saveDesignDetails() {
    const layer = activeLayer();
    if (layer.id !== state.reviewLayerId) return;
    const invalid = $('#review-fields input:invalid');
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    if (suggestName(layer, OrderDesign.compile(layer, OrderDesign.inspect(state, layer)), true)) return;
    if (layer.legacy && !confirm('Replace the imported pricing specification with the details shown here?'))
      return;
    layer.name = state.editor.name = $('#review-name').value.trim() || layer.name;
    $('#group-name').value = layer.name;
    applySpecs(layer, OrderDesign.compile(layer, OrderDesign.inspect(state, layer)));
    delete layer.legacy;
    state.reviewLayerId = '';
    renderAll();
    persist();
    notify('Design details applied to the estimate');
  }
  function applySpecs(layer, specs) {
    oldBarLayers.delete(layer);
    const oldGroups = state.groups.filter((g) => g.layerId === layer.id);
    const groups = specs.map((g) => ({
      ...g,
      id: oldGroups.find((old) => String(old.teeth) === String(g.teeth))?.id || crypto.randomUUID(),
      layerId: layer.id,
    }));
    const start = state.groups.findIndex((g) => g.layerId === layer.id);
    state.groups = state.groups.filter((g) => g.layerId !== layer.id);
    state.groups.splice(start < 0 ? state.groups.length : start, 0, ...groups);
    layer.draft = !specs.length;
    layer.revision = JSON.stringify(specs);
  }
  function reconcileRemovedMark(layer) {
    if (!layer.recipe) return;
    const used = new Set(
      [...state.ink, ...state.gems]
        .filter((m) => m.designId === layer.id)
        .flatMap((m) => (m.touchedTeeth?.length ? m.touchedTeeth : [m.tooth])),
    );
    while (layer.teeth.length && !used.has(layer.teeth.at(-1))) {
      const id = layer.teeth.pop();
      delete layer.materials[id];
      delete layer.details[id];
    }
    syncRecipePrice(layer);
  }
  function syncRecipePrice(layer) {
    if (!layer.recipe) return;
    const specs = layerPending(layer) ? [] : OrderDesign.compile(layer, OrderDesign.inspect(state, layer));
    if (JSON.stringify(specs) !== layer.revision) applySpecs(layer, specs);
  }
  // Stage additions, including tooth bindings, until the entire gesture fits.
  // Nothing here prompts for the saved name, metal, complexity or finish again.
  let extraWork = null,
    brushOverride = null;
  const acceptsNewTooth = (layer) => layer.recipe || layer.customized;
  const slotMaterial = (layer, id, teeth = layer.teeth) =>
    materialForGroup(
      layer.materials[id] ||
        OrderRecipe.slotAt(layer, id, teeth)?.material ||
        layer.nextMaterial ||
        layer.remainingSlots?.[
          Math.max(0, (teeth.includes(id) ? teeth.indexOf(id) : teeth.length) - layer.teeth.length)
        ]?.material ||
        layer.recipe?.slots.at(-1)?.material ||
        state.editor.material,
    );
  function bindSlots(layer, actions) {
    for (const id of OrderRecipe.teethAfter(layer, actions)) {
      if (layer.teeth.includes(id)) continue;
      layer.materials[id] = slotMaterial(layer, id);
      const slot =
        OrderRecipe.slotAt(layer, id) || layer.recipe?.slots.at(-1) || layer.remainingSlots?.shift();
      layer.details[id] = { ...OrderDesign.defaults, ...slot?.detail };
      layer.teeth.push(id);
    }
  }
  function withScope(actions, apply, { excludeId, reason } = {}) {
    const layer = activeLayer();
    const proposedTeeth = OrderRecipe.teethAfter(layer, actions);
    const needsMetal = layer.recipe
      ? actions.filter(
          (a) =>
            ['gem', 'pave', 'ice'].includes(a.tool) &&
            !supportsStones(slotMaterial(layer, a.tooth, proposedTeeth)),
        )
      : [];
    const why =
      layer.recipe &&
      (reason ||
        OrderRecipe.problem(layer, actions, state.gems, excludeId) ||
        (needsMetal.length && 'This tooth needs silver or gold for a stone setting.'));
    if (why) {
      extraWork = { layer, actions, apply, sheet: state, user: staffUser, needsMetal };
      $('#extra-reason').textContent = why;
      $('#extra-name').value = '';
      $('#extra-name').setCustomValidity('');
      $('#extra-metal-label').hidden = !needsMetal.length;
      const dialog = $('#extra-design-dialog');
      dialog.returnValue = 'cancel';
      dialog.showModal();
      syncGemControls(state.tool);
      renderInk();
      return;
    }
    if (acceptsNewTooth(layer)) bindSlots(layer, actions);
    apply(layer);
    syncRecipePrice(layer);
    if (layer.recipe) renderGemOptions();
    renderAll();
    persist();
  }
  $('#extra-name').oninput = (e) => e.target.setCustomValidity('');
  $('#extra-design-dialog form').onsubmit = (e) => {
    if (e.submitter?.value === 'create' && !$('#extra-name').value.trim()) {
      e.preventDefault();
      $('#extra-name').setCustomValidity('Name the new design first.');
      $('#extra-name').reportValidity();
    }
  };
  $('#extra-design-dialog').onclose = (e) => {
    const work = extraWork;
    extraWork = null;
    if (
      e.target.returnValue !== 'create' ||
      !work ||
      work.sheet !== state ||
      work.layer !== activeLayer() ||
      work.user !== staffUser
    )
      return;
    const layer = work.layer,
      name = $('#extra-name').value.trim();
    if (!name) return;
    // Fork this order instance, not the library document. Keep its existing marks
    // and tooth bindings; don't bill a second base for editing the same tooth.
    bindSlots(layer, work.actions);
    for (const a of work.needsMetal) layer.materials[a.tooth] = $('#extra-metal').value;
    layer.remainingSlots = layer.recipe.slots.slice(layer.teeth.length);
    delete layer.recipe;
    layer.customized = true;
    layer.name = state.editor.name = name;
    state.designMode = layer.mode = 'mix';
    state.editor.materialKey = slotMaterial(layer, 0);
    state.editor.material = MATERIALS[state.editor.materialKey].label;
    brushOverride = null;
    applySpecs(layer, []);
    syncInputs();
    work.apply(layer);
    renderAll();
    persist();
    notify(`Continuing as “${name}”.`);
  };
  $('#customise-recipe').onclick = () =>
    withScope(
      [],
      (layer) => {
        if (layer.teeth.length) reviewDesign();
      },
      { reason: 'Changing the saved material, finish or complexity makes this a new design.' },
    );
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
        .map(
          (s, i) =>
            (priceLocked() && saved.quote.order.services[i]) ||
            CalcEngine.calculateService(OrderPricing.serviceSpec(s, CalcEngine)),
        )
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
    const catalog = OrderPricing.serviceCatalog(CalcEngine),
      current = select.value;
    select.replaceChildren(
      ...Object.entries(catalog).map(([k, v]) => new Option(v.name, k)),
      new Option('Custom service', 'custom'),
    );
    select.value = current === 'custom' || catalog[current] ? current : Object.keys(catalog)[0];
    updateServicePriceHint();
  }
  function updateServicePriceHint() {
    const host = $('#order-service-price-hint');
    if (!host) return;
    const type = $('#order-service-type').value,
      item = OrderPricing.serviceCatalog(CalcEngine)[type],
      override = $('#order-service-price').value;
    if (type === 'custom') {
      host.textContent = 'Custom service · enter the studio-agreed unit price.';
      return;
    }
    const price = Number(item?.price) || 0;
    host.textContent =
      override !== ''
        ? `Manual unit price: ${Number(override || 0).toLocaleString('en-US')} EGP · clear to use the shared ${item?.name || type} price.`
        : `${item?.name || type}: ${price.toLocaleString('en-US')} EGP per unit · synced with EditX and Invoice pricing.`;
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
        : OrderPricing.serviceCatalog(CalcEngine)[type]?.name || type;
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
  function productionNotes() {
    const stage = $('#production-stage option:checked')?.textContent || state.productionStage;
    return (
      `Production stage: ${stage}. ` +
      ['measurements', 'materials', 'stones', 'artwork']
        .map((k) => `${k}: ${state.productionChecks?.[k] ? 'verified' : 'pending'}`)
        .join(' · ')
    );
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
    const locked = priceLocked();
    const { order, issues } = locked
      ? { order: saved.quote.order, issues: [] }
      : OrderPricing.build(state, CalcEngine);
    const hasItems = order.lineCount > 0 || order.services.length > 0;
    const pending = pendingTeeth();
    currentOrder = order;
    const gold = orderUsesGold(order);
    if (!locked && gold && !window.MetalRates?.goldEgpPerGram24())
      issues.push('Live gold rate unavailable. Refresh before issuing a gold quote.');
    if (pending)
      issues.push(
        state.designLayers.some((l) => l.recipe && layerPending(l))
          ? 'Complete the saved design’s drawing checklist, or discard it before issuing.'
          : 'Review the drawing and apply its design details before issuing documents.',
      );
    if (!locked && pricingSource === 'loading') issues.push('Loading studio pricing…');
    orderBlock = issues[0] || (!hasItems && 'Add a design or service first.');
    if (!locked && unverifiedPricing())
      issues.push('Studio pricing could not be verified. Refresh or confirm the estimate before export.');
    if (!locked && gold && window.MetalRates?.snapshot().stale)
      issues.push('Using the last known gold rate. Confirm the rate before production.');
    const amount = hasItems ? order.total : null;
    if (isAuto) state.price = amount == null ? '' : String(amount);
    input.value = state.price;
    if (state.depositAuto !== false) state.deposit = amount == null ? '' : String(order.deposit);
    $('#deposit').value = state.deposit;
    $('#auto-deposit').textContent =
      state.depositAuto === false ? 'Use studio %' : `Auto · ${order.depositPct}%`;
    $('#auto-deposit').disabled = state.depositAuto !== false;
    $('#deposit').setAttribute('placeholder', `${order.depositPct}% of total`);
    const source =
      {
        loading: 'Loading pricing',
        defaults: 'Default pricing · not verified',
        'stale-cache': 'Last known studio pricing',
        cache: 'Cached studio pricing',
        rest: 'Studio pricing',
        firestore: 'Studio pricing',
      }[pricingSource] || 'Studio pricing';
    $('#reprice').hidden = !locked;
    $('#auto-price-note').textContent = locked
      ? 'Saved quotation · issued amounts'
      : `${source}${gold && window.MetalRates ? ' · Gold: ' + MetalRates.statusLine() : ''}`;
    $('#summary-total').textContent = amount == null ? '—' : formatMoney(order.total);
    $('#summary-balance').textContent = hasItems
      ? `Deposit due ${formatMoney(order.deposit)} · Paid ${formatMoney(CalcEngine.paymentSummary(saved?.quote).paid)} · Outstanding ${formatMoney(Math.max(0, order.total - CalcEngine.paymentSummary(saved?.quote).paid))}`
      : 'Add a design or a studio service to begin.';
    $('#price-breakdown').hidden = !hasItems;
    const shown = CalcEngine.designBreakdown(order);
    const amounts = [
      ...shown.designs.map(({ line, subtotal }, i) => [line.name || `Design ${i + 1}`, subtotal]),
      ...shown.services.map((s) => [`${s.name} × ${s.qty}`, s.subtotal]),
      ...CalcEngine.quoteTotalRows(order, { omitEmptyMold: true }),
    ];
    $('#price-rows').innerHTML = amounts
      .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(formatMoney(v))}</dd>`)
      .join('');
    const link = $('#open-saved-quote');
    link.hidden = !saved?.quote || !staffUser;
    if (!link.hidden) link.href = '/quotes.html?id=' + encodeURIComponent(state.orderNo);
    $('#summary-teeth').textContent = order.teethTotal;
    $('#summary-group-count').textContent = order.lineCount;
    $('#summary-service-count').textContent = shown.services.reduce((n, s) => n + s.qty, 0);
    $('#summary-unassigned').textContent = pending;
    $('#order-warning').textContent = issues.join(' ');
    $('#order-warning').hidden = !issues.length || (!hasItems && !pending);
    renderFileActions();
    return order;
  }
  function pendingTeeth() {
    return (
      state.selectedTeeth.length +
      state.designLayers.reduce(
        (n, l) =>
          n +
          (l.recipe
            ? OrderRecipe.progress(l, state).filter(Boolean).length
            : layerPending(l)
              ? Math.max(1, l.teeth.length)
              : 0),
        0,
      )
    );
  }
  function layerPending(layer) {
    if (oldBarLayers.has(layer) && !priceLocked()) return true;
    if (layer.recipe) return OrderRecipe.progress(layer, state).some(Boolean);
    if (layer.customized && !layer.teeth.length) return true;
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
    const locked = priceLocked();
    const fallback = !locked && unverifiedPricing();
    const staleGold = !locked && orderUsesGold(order) && window.MetalRates?.snapshot().stale;
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
      id: state.orderNo,
      orderNo: state.orderNo,
      clientName: state.clientName.trim(),
      clientPhone: state.clientPhone.trim(),
      clientEmail: state.clientEmail.trim(),
      notes: [
        state.notes.trim(),
        locked
          ? saved.quote.pricingWarning
          : warning && state.priceMode !== 'manual'
            ? warning + ' Confirm before production.'
            : '',
      ]
        .filter(Boolean)
        .join('\n'),
      order,
      pricingWarning: locked
        ? saved.quote.pricingWarning || ''
        : warning && state.priceMode !== 'manual'
          ? warning + ' Confirm before production.'
          : '',
      validDays: locked ? saved.quote.validDays : SiteConfig.num('quoteValidDays'),
      studioName: locked ? saved.quote.studioName : SiteConfig.get('studioName'),
    };
  }
  function renderFileActions() {
    const q = saved?.quote,
      auth = !!(records && staffUser),
      canIssue = auth && !busy && !orderBlock;
    const paid = CalcEngine.paymentSummary(q);
    $('#save-draft').disabled = !auth || busy;
    $('#saved-drafts').disabled = !auth || busy;
    for (const id of [
      'quote-pdf-btn',
      'save-quote-btn',
      'order-pdf-btn',
      'create-proforma-btn',
      'print-sheet-btn',
    ]) {
      const b = $('#' + id);
      b.disabled = !canIssue;
      b.title = !auth ? 'Sign in to EditX to save orders' : orderBlock || '';
    }
    const email = state.clientEmail.trim(),
      validEmail = OrderEmail.validRecipient(email) && $('#delivery-email').validity.valid;
    $('#email-order').disabled = !canIssue || !validEmail;
    $('#mail-recipient').textContent = !auth
      ? 'Sign in to EditX to save and prepare the documents.'
      : !validEmail
        ? 'Enter one valid client email address.'
        : '';
    if (
      !$('#draft-links').hidden &&
      (!auth || dirty || q?.deliveryVersion !== draftVersion || q?.clientEmail !== email)
    )
      clearDraftLinks();
    $('#payment-summary').textContent = q
      ? `${paid.status} · Quoted ${formatMoney(q.total)} · Paid ${formatMoney(paid.paid)} · Outstanding ${formatMoney(paid.outstanding)} · Deposit still due ${formatMoney(Math.max(0, q.order.deposit - paid.paid))}`
      : 'Save the quotation to record a payment.';
    $('#payment-history').innerHTML = (q?.payments || [])
      .map(
        (p) =>
          `<li>${esc(String(p.at).slice(0, 10))} · ${esc(p.method)} · ${esc(formatMoney(p.amount))}</li>`,
      )
      .join('');
    $('#receipt-amount').max = String(paid.outstanding);
    $('#record-payment').disabled = !canIssue || !q || !priceLocked() || dirty || paid.outstanding < 1;
    $('#record-payment').title = dirty ? 'Save your changes before posting a receipt.' : '';
  }
  const fileError = (e, action) =>
    ['order/document', 'order/conflict'].includes(e?.code) ? e.message : recordError(e, action);
  async function deskAction(action) {
    if (busy) return;
    busy = true;
    const shell = $('.app-shell');
    shell.inert = true;
    try {
      return await action();
    } catch (e) {
      const message = fileError(e, 'complete this action');
      $('#save-status').textContent = message;
      notify(message);
    } finally {
      busy = false;
      shell.inert = false;
      renderFileActions();
    }
  }
  function requireDesk() {
    if (!staffUser || !records)
      throw Object.assign(new Error('Sign in to EditX before saving this order.'), {
        code: 'order/conflict',
      });
  }
  async function saveFile(requireQuote) {
    requireDesk();
    refreshOrder();
    if (requireQuote && orderBlock) {
      notify(orderBlock);
      return null;
    }
    const q = !orderBlock ? issuedQuote() : null;
    if (!q && !orderBlock) return null; // staff declined a stale-rate estimate
    const user = staffUser,
      target = state,
      locked = priceLocked(),
      sheetJson = OrderFile.pack(state),
      label = OrderFile.label(state);
    const data = q && {
      orderNo: state.orderNo,
      label,
      clientName: q.clientName,
      clientPhone: q.clientPhone,
      clientEmail: q.clientEmail,
      notes: q.notes,
      pricingWarning: q.pricingWarning,
      validDays: q.validDays,
      studioName: q.studioName,
      source: 'order-sheet',
      lines: q.order.lines.map(CalcEngine.cleanLineSpec),
      services: q.order.services,
      order: q.order,
      total: q.order.total,
      designLabel: `${q.order.lineCount} designs / ${q.order.teethTotal} teeth`,
    };
    $('#save-status').textContent = 'Saving to studio…';
    const result = await records.saveSheet({
      id: state.orderNo,
      expected: saved?.revision || '',
      label,
      sheetJson,
      step: state.step,
      uid: user.uid,
      quote: data && JSON.parse(JSON.stringify(data)),
      locked,
      unchanged: !!saved && sheetJson === cleanSheet && (!q || locked),
    });
    if (staffUser !== user || state !== target) return null;
    saved = result;
    cleanSheet = sheetJson;
    repriceRequested = false;
    if (q) lockedTerms = OrderFile.termsKey(state);
    history.replaceState(null, '', location.pathname + '?sheet=' + encodeURIComponent(state.orderNo));
    persist();
    refreshOrder();
    const msg = q
      ? 'Order and quotation saved to studio.'
      : 'Draft saved. Unfinished details have not been issued as a quotation.';
    $('#save-status').textContent = msg;
    notify(msg);
    const picker = $('#saved-drafts');
    let opt = Array.from(picker.options).find((x) => x.value === state.orderNo);
    if (!opt) {
      opt = new Option('', state.orderNo);
      picker.add(opt, 1);
    }
    opt.textContent = label;
    picker.value = state.orderNo;
    return q ? { ...result.quote, id: state.orderNo } : null;
  }
  async function recordPayment() {
    requireDesk();
    const q = saved?.quote,
      user = staffUser,
      target = state;
    if (!q || dirty || !priceLocked()) {
      notify('Save the quotation before recording a payment.');
      return;
    }
    const amount = Number($('#receipt-amount').value),
      method = $('#receipt-method').value;
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > CalcEngine.paymentSummary(q).outstanding) {
      notify('Check the amount and the outstanding balance.');
      return;
    }
    if (!confirm(`Record ${formatMoney(amount)} received by ${method} for ${OrderFile.label(state)}?`))
      return;
    if (!pendingReceipt || pendingReceipt.amount !== amount || pendingReceipt.method !== method)
      pendingReceipt = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        amount,
        method,
        by: user.uid,
      };
    const updated = await records.postPayment(state.orderNo, q.deliveryVersion, pendingReceipt);
    if (user !== staffUser || target !== state) return;
    saved.quote = updated;
    pendingReceipt = null;
    $('#receipt-amount').value = '';
    $('#mail-status').textContent = '';
    $('#receipt-status').textContent = 'Payment recorded in the studio ledger.';
    refreshOrder();
    renderPrint();
  }
  async function productionDocument(q) {
    const { build, download } = await import('/assets/order-document.js?v=3');
    if (q.id !== state.orderNo || !staffUser) throw Error('Order changed');
    renderPrint(true);
    if (
      $('#print-sheet').querySelectorAll('.design-layer-print').length <
      state.designLayers.filter((l) => l.teeth.length).length
    )
      throw Object.assign(new Error('The drawing is not ready. Reload the saved order and try again.'), {
        code: 'order/document',
      });
    const blob = await build($('#print-sheet'), q);
    return { blob, download };
  }
  function clearDraftLinks() {
    preparedMail = null;
    draftVersion = '';
    $('#draft-links').hidden = $('#attached-draft').hidden = true;
    for (const id of ['draft-gmail', 'draft-mailto', 'gmail-created', 'gmail-folder'])
      $('#' + id).removeAttribute('href');
    $('#mail-status').textContent = '';
  }
  function mailCurrent(m) {
    return (
      !!m &&
      preparedMail === m &&
      staffUser === m.user &&
      m.target === state &&
      !dirty &&
      saved?.quote?.deliveryVersion === m.version &&
      state.clientEmail.trim() === m.fields.to
    );
  }
  async function openOrderDraft() {
    requireDesk();
    if (!OrderEmail.validRecipient(state.clientEmail.trim()) || !$('#delivery-email').validity.valid) return;
    const user = staffUser,
      target = state,
      status = $('#mail-status');
    clearDraftLinks();
    status.textContent = 'Saving the quotation and preparing both PDFs…';
    try {
      const q = await saveFile(true);
      if (user !== staffUser || state !== target) return;
      if (!q) {
        status.textContent = 'No draft prepared. Save a valid quotation first.';
        return;
      }
      const meta = { ...q, date: q.issuedAt },
        { blob } = await productionDocument(q);
      const files = [
        new File([blob], CalcEngine.documentFilename('Order', q), { type: 'application/pdf' }),
        new File([CalcEngine.buildQuotePdfBytes(q.order, meta)], CalcEngine.quotePdfFilename(meta), {
          type: 'application/pdf',
        }),
      ];
      if (
        user !== staffUser ||
        state !== target ||
        dirty ||
        saved?.quote?.deliveryVersion !== q.deliveryVersion
      )
        return;
      const m = (preparedMail = {
        target,
        user,
        version: q.deliveryVersion,
        fields: OrderEmail.fields(q),
        files,
        clientId: String(SiteConfig.get('gmailWebClientId') || '').trim(),
      });
      draftVersion = m.version;
      const links = OrderEmail.compose(q);
      $('#draft-gmail').href = links.gmail;
      $('#draft-mailto').href = links.mailto;
      $('#attach-gmail').hidden = true;
      $('#share-pdfs').hidden = !navigator.canShare?.({ files });
      $('#draft-links').hidden = false;
      status.textContent = 'Both PDFs are ready. Nothing has been sent.';
      const hint = $('#gmail-setup');
      hint.textContent = '';
      if (OrderGmail.clientIdOK(m.clientId)) {
        try {
          await OrderGmail.loadIdentity();
          if (mailCurrent(m)) $('#attach-gmail').hidden = false;
        } catch (err) {
          if (mailCurrent(m)) hint.textContent = err.message;
        }
      } else
        hint.textContent =
          'For web Gmail, set the public Google web client ID in EditX → Site settings → Quotations. On supported devices, use Share both PDFs and choose Gmail.';
    } catch (e) {
      if (user === staffUser && target === state)
        status.textContent = fileError(e, 'prepare the two PDF attachments');
    }
  }
  $('#attach-gmail').onclick = async () => {
    const m = preparedMail;
    if (!mailCurrent(m) || busy || m.created) return;
    let destination;
    await deskAction(async () => {
      try {
        const token = await OrderGmail.authorize(m.clientId);
        if (!mailCurrent(m)) return;
        $('#mail-status').textContent = 'Creating an unsent Gmail draft with two attachments…';
        const draft = await OrderGmail.create(token, m.fields, m.files, () => mailCurrent(m));
        if (!mailCurrent(m)) return;
        m.created = true;
        $('#gmail-created').href = draft.url;
        $('#gmail-folder').href = draft.inbox;
        $('#attached-draft').hidden = false;
        $('#attach-gmail').hidden = true;
        $('#mail-status').textContent =
          'Gmail saved the draft with both PDFs. Review the recipient and attachments before sending.';
        destination = draft.url;
      } catch (e) {
        if (mailCurrent(m)) $('#mail-status').textContent = e.message || 'Gmail was not authorized.';
      }
    });
    if (destination && mailCurrent(m)) {
      // Do not frame Gmail. In an embedded preview the ordinary new-tab link
      // remains available if the browser blocks opening after the API call.
      if (window.top === window) location.assign(destination);
      else window.open(destination, '_blank', 'noopener,noreferrer');
    }
  };
  $('#share-pdfs').onclick = async () => {
    const m = preparedMail;
    if (!mailCurrent(m) || busy) return;
    try {
      await navigator.share({ files: m.files, title: m.fields.subject, text: m.fields.body });
      if (mailCurrent(m))
        $('#mail-status').textContent =
          'Files shared with the chosen app. Check the To address before sending.';
    } catch (e) {
      if (mailCurrent(m))
        $('#mail-status').textContent =
          e.name === 'AbortError'
            ? 'Sharing cancelled. Nothing was sent by the sheet.'
            : 'File sharing is unavailable. Use Gmail authorization or the manual alternative.';
    }
  };

  function renderTeeth() {
    if (!capturingPrintMap) printDesignMapDirty = true;
    const assigned = assignedIds().size;
    $('#selected-count').textContent = state.newDesignSelection
      ? `${state.selectedTeeth.length} selected`
      : !activeLayer().teeth.length
        ? 'Draw on any tooth'
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
      path.style.stroke = selected || member ? '#222222' : '#777777';
      path.style.strokeWidth = selected ? '3' : member ? '2.1' : '1.15';
      path.style.filter = '';
      const label = svgChart.querySelector(`[data-fdi-label="${id}"]`);
      if (label) {
        label.setAttribute('fill', selected || member ? '#222222' : '#777777');
        label.style.display = state.isolateDesign && !state.showAllDesigns && !member ? 'none' : '';
      }
    });
    $('#chart-stage-inner').classList.toggle(
      'drawing',
      ['draw', 'pave', 'laser', 'emboss'].includes(state.tool),
    );
    $('#chart-stage-inner').classList.toggle('interacting', state.tool !== 'select');
    $$('.material-chip').forEach((chip) => {
      const selected =
        chip.dataset.material ===
        (!state.newDesignSelection && activeLayer().customized
          ? slotMaterial(activeLayer(), 0)
          : selectedMaterial());
      chip.classList.toggle('active', selected);
      chip.setAttribute('aria-pressed', String(selected));
    });
    const drawn = inkTeeth.size;
    $('#ink-count').textContent = drawn
      ? `${drawn} ${drawn === 1 ? 'tooth' : 'teeth'} with sketches`
      : 'No sketched teeth yet';
    $('#isolate-design').classList.toggle('active', !!state.isolateDesign);
    $('#isolate-design').textContent = state.isolateDesign ? 'Show full chart' : 'Isolate active design';
    renderDesignLayers();
    renderInk();
    if (!capturingPrintMap) setTool(state.tool || 'select');
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
    if (tool === 'enamel' && !activeLayer().recipe && !state.editor.palette?.length) tool = 'draw';
    if (['gem', 'gem-edit', 'pave', 'ice'].includes(tool) && !stoneToolAvailable()) {
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
    $('.free-draw-toggle').hidden = !brush || !!activeLayer().recipe;
    $('#diamond-material-note').hidden = !ready || stones;
    syncGemControls(tool);

    $('#canvas-mode-hint').textContent =
      {
        select: 'Tap tooth outlines to select or deselect them for this design.',
        draw: 'Draw with a finger, pen or mouse. Pinch with two fingers to zoom.',
        laser: 'Draw a dark engraved line inside the selected teeth.',
        white: 'Draw a white cutout. Its fine grey edge stays visible on bare teeth.',
        enamel:
          'Tap a tooth to fill it with your palette. Tap again with a different palette to replace the fill.',
        emboss: 'Draw a raised metal detail.',
        gem: 'Tap an empty spot to place a diamond. Tap an existing diamond to edit it.',
        'gem-edit': 'Tap a diamond on this layer, or choose Next diamond. Drag to move it.',
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
        '<canvas id="ink-layer" width="900" height="331" class="ink-layer" tabindex="-1" aria-label="Design canvas" aria-describedby="canvas-mode-hint"></canvas>';
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
          fill: '#777777',
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
        x.drawImage(img, 5, 5, c.width - 10, c.height - 10);
        // The cut photos already have transparent backgrounds. Clear keeps the
        // original dark and bright facets; lifting every pixel towards white
        // makes it disappear on paper. Tint the other stones without erasing shadows.
        if (color !== 'clear') {
          const image = x.getImageData(0, 0, c.width, c.height),
            pixels = image.data;
          const tint = GEM_COLORS.find((v) => v[0] === color)?.[1] || '#f6f8fb';
          const rgb = [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16));
          for (let i = 0; i < pixels.length; i += 4) {
            if (!pixels[i + 3]) continue;
            const lum = (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255;
            const shade = 0.2 + 0.8 * lum,
              glint = 0.58 * lum ** 4;
            for (let ch = 0; ch < 3; ch++) pixels[i + ch] = rgb[ch] * shade * (1 - glint) + 255 * glint;
          }
          x.putImageData(image, 0, 0);
        }
        // Bake a subtle cut-shaped rim into the shared sprite once, not a square
        // tile behind each stone. The palette, canvas and printed overlay match.
        const rim = document.createElement('canvas');
        rim.width = rim.height = c.width;
        const mask = rim.getContext('2d');
        mask.drawImage(c, 0, 0);
        mask.globalCompositeOperation = 'source-in';
        mask.fillStyle = color === 'black' ? '#bec1c6' : '#535861';
        mask.fillRect(0, 0, rim.width, rim.height);
        x.globalCompositeOperation = 'destination-over';
        for (const [dx, dy] of [
          [-3, 0],
          [3, 0],
          [0, -3],
          [0, 3],
        ])
          x.drawImage(rim, dx, dy);
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
    canvasCtx.strokeStyle = color === 'black' ? '#d7d9de' : '#535861';
    canvasCtx.lineWidth = Math.max(0.65, size * 0.09);
    canvasCtx.beginPath();
    if (cut === 'princess' || cut === 'emerald' || cut.includes('baguette'))
      canvasCtx.rect(-size / 2, -size / 2, size, size);
    else if (cut === 'pear') {
      canvasCtx.moveTo(0, -size / 2);
      canvasCtx.bezierCurveTo(size * 0.7, size / 2, -size * 0.7, size / 2, 0, -size / 2);
    } else canvasCtx.arc(0, 0, size / 2, 0, Math.PI * 2);
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
        const paint = (style = st) => {
          canvasCtx.lineCap = 'round';
          canvasCtx.lineJoin = 'round';
          canvasCtx.lineWidth = Number(st.width) || 4;
          canvasCtx.strokeStyle = strokeColor(style);
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
              const toothId = Number(tooth.dataset.tooth);
              const layer = state.designLayers.find((l) => l.id === st.designId);
              const material = layer && slotMaterial(layer, toothId);
              paint({ ...st, tooth: toothId, material: material || st.material });
            } catch (e) {}
            canvasCtx.restore();
          });
      });
    (state.gems || [])
      .map((g) => (!capturingPrintMap && dragPreview?.id === g.id ? dragPreview : g))
      .filter((g) => visible.has(g.designId) && supportsStones(materialKeyForLayerTooth(g.designId, g.tooth)))
      .forEach((g) => {
        const size = Math.max(2, gemSize(g) * OrderPave.unitsPerMm),
          sprite = getGemSprite(gemCut(g), g.color || 'clear'),
          tooth = paths.get(Number(g.tooth));
        canvasCtx.save();
        if (tooth)
          try {
            canvasCtx.clip(new Path2D(tooth.getAttribute('d')));
          } catch (e) {}
        canvasCtx.translate(g.x, g.y);
        canvasCtx.rotate(((Number(g.rotation) || 0) * Math.PI) / 180);
        if (sprite) canvasCtx.drawImage(sprite, -size / 2, -size / 2, size, size);
        else drawGemFallback(0, 0, size, g.color || 'clear', gemCut(g));
        canvasCtx.restore();
      });
    const selected = !capturingPrintMap && selectedGem();
    if (selected && visible.has(selected.designId)) {
      canvasCtx.save();
      canvasCtx.beginPath();
      canvasCtx.arc(selected.x, selected.y, Math.max(4, gemSize(selected) * 3.2), 0, Math.PI * 2);
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = '#fff';
      canvasCtx.stroke();
      canvasCtx.lineWidth = 1;
      canvasCtx.strokeStyle = '#242424';
      canvasCtx.stroke();
      canvasCtx.restore();
    }
  }
  // Iced settings have one priced cut/size per tooth. Retouching a single iced
  // stone changes its artwork, not its neighbours or the setting's quoted rate.
  function gemSize(g) {
    return Number(g?.visualSizeMm || g?.sizeMm) || 1.5;
  }
  function gemCut(g) {
    return g?.visualCut || g?.cut || 'round';
  }
  function brushSize() {
    return Number(state.editor.gemSize) || 1.5;
  }
  function selectedGem() {
    return state.tool === 'gem-edit' && state.selectedGemId
      ? state.gems.find((g) => g.id === state.selectedGemId && onEditableLayer(g))
      : null;
  }
  function syncGemControls(tool) {
    const edit = tool === 'gem-edit',
      multiple = ['pave', 'ice'].includes(tool),
      g = selectedGem();
    const size = g ? gemSize(g) : stoneBrush(tool).sizeMm,
      rotation = Number(g?.rotation) || 0;
    $('#gem-adjustments').hidden = !edit && tool !== 'gem' && !multiple;
    $('#gem-edit-hint').hidden = $('#next-gem').hidden = !edit;
    if (edit) {
      const any = state.gems.some(onEditableLayer);
      $('#next-gem').disabled = !any;
      $('#gem-edit-hint').textContent = g
        ? `Selected: ${g.color || 'clear'} ${gemCut(g)} · FDI ${g.tooth}. ${g.kind === 'iced' ? 'Adjust this stone only; the iced setting is priced per tooth.' : 'Drag to move, or adjust below.'}`
        : any
          ? 'Tap a diamond on the chart or choose Next diamond.'
          : 'No diamonds on this layer yet. Choose Place diamond first.';
      $('#diamond-options').hidden = !g;
    }
    $('#gem-spacing-control').hidden = !multiple;
    $('#gem-size').disabled = edit && !g;
    $('#gem-size').value = size;
    $('#gem-size-value').textContent = `${size.toFixed(1)} mm`;
    $('#gem-rotation').value = rotation;
    $('#gem-rotation-value').textContent = `${rotation}°`;
    for (const el of $$('#gem-tools [data-gem-edit]')) {
      el.hidden = !edit;
      (el.querySelector('input') || el).disabled =
        !g || (el.dataset.sizeStep < 0 && size <= 0.5) || (el.dataset.sizeStep > 0 && size >= 5);
    }
    const canvas = $('#ink-layer');
    if (canvas) canvas.tabIndex = edit ? 0 : -1;
  }
  function selectGem(g) {
    state.selectedGemId = g?.id || '';
    setTool('gem-edit');
    renderGemOptions();
    renderInk();
  }
  function gemCountOnTooth(designId, tooth) {
    return state.gems.filter((g) => g.designId === designId && Number(g.tooth) === Number(tooth)).length;
  }
  function stoneBrush(tool, tooth) {
    const layer = activeLayer();
    const basic = {
      sizeMm: brushSize(),
      cut: tool === 'gem' ? state.editor.diamondCut || 'round' : 'round',
      color: state.editor.gemColor || 'clear',
    };
    if (!layer.recipe) return basic;
    if (brushOverride?.tool === tool) return brushOverride.brush;
    const saved = OrderRecipe.savedBrush(layer, tooth, tool, state.gems);
    // With no target yet, preview the next applicable brush. A tap uses its own slot.
    const fallback = tooth
      ? null
      : layer.recipe.slots.flatMap((s) =>
          tool === 'ice' ? [s.ice].filter(Boolean) : s.stones.filter((b) => b.tool === tool),
        )[0];
    const spec = saved || fallback || basic;
    return { sizeMm: spec.sizeMm, cut: spec.cut, color: spec.color };
  }
  function eligibleStone(layer, tooth) {
    return layer.recipe || supportsStones(slotMaterial(layer, tooth));
  }
  function addGem(tooth, x, y) {
    const layer = activeLayer();
    if (!eligibleStone(layer, tooth)) return notify('Choose silver or gold for stones.');
    if (gemCountOnTooth(layer.id, tooth) >= MAX_STONES_PER_TOOTH)
      return notify('Maximum stone placement reached on this tooth');
    const brush = stoneBrush('gem', tooth);
    withScope([{ tool: 'gem', tooth, ...brush }], (l) => {
      addGemRecord(l.id, tooth, x, y, 'placed', crypto.randomUUID(), brush);
      state.selectedGemId = '';
      renderGemOptions();
    });
  }
  function fillToothWithGems(tooth) {
    const path = svgChart.querySelector(`[data-tooth="${tooth}"]`);
    if (!path) return;
    const layer = activeLayer(),
      brush = stoneBrush('ice', tooth);
    if (!eligibleStone(layer, tooth)) return notify('Choose silver or gold for an iced setting.');
    withScope([{ tool: 'ice', tooth, ...brush }], (l) => fillIce(l, path, tooth, brush));
  }
  function fillIce(layer, path, tooth, brush) {
    state.gems = state.gems.filter(
      (g) => !(g.designId === layer.id && Number(g.tooth) === Number(tooth) && g.kind === 'iced'),
    );
    layer.teeth = [...new Set([...(layer.teeth || []), Number(tooth)])];
    const operationId = `ice-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
      b = path.getBBox(),
      size = brush.sizeMm * OrderPave.unitsPerMm,
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
        if (overlaps(x, y)) {
          addGemRecord(layer.id, tooth, x, y, 'iced', operationId, brush);
          count++;
        }
      }
    }
    state.icedTeeth = state.icedTeeth || [];
    state.icedTeeth = state.icedTeeth.filter(
      (i) => !(i.designId === layer.id && Number(i.tooth) === Number(tooth)),
    );
    state.icedTeeth.push({ designId: layer.id, tooth: Number(tooth), count });
    notify(`Iced-out preview applied to tooth ${tooth}`);
  }
  function addGemRecord(designId, tooth, x, y, kind, operationId, brush) {
    state.gems.push({
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      designId,
      tooth,
      x,
      y,
      kind,
      operationId,
      sizeMm: brush.sizeMm,
      cut: brush.cut,
      color: brush.color,
    });
  }
  function placePaveAlong(points, tooth) {
    const layer = activeLayer(),
      brush = stoneBrush('pave', tooth);
    const cursor = layer.recipe && OrderRecipe.brushCursor(layer, 'pave', state.gems);
    const proposedTeeth = [...layer.teeth];
    const counts = new Map();
    for (const g of state.gems)
      if (g.designId === layer.id) counts.set(g.tooth, (counts.get(g.tooth) || 0) + 1);
    const dots = OrderPave.plan(points, {
      sizeMm: brush.sizeMm,
      gapMm: Number($('#gem-spacing').value),
      cut: brush.cut,
      existing: state.gems,
      ...(cursor && {
        brushAt: (id) => (brushOverride?.tool === 'pave' ? brushOverride.brush : cursor.at(id) || brush),
      }),
      onPlace(p) {
        cursor?.place(p);
        if (!proposedTeeth.includes(p.tooth)) proposedTeeth.push(p.tooth);
      },
      toothAt: (x, y) => {
        const id = pointInAnyTooth(x, y);
        return id &&
          (acceptsNewTooth(layer) || layer.teeth.includes(id)) &&
          (layer.recipe || supportsStones(slotMaterial(layer, id, proposedTeeth)))
          ? id
          : null;
      },
      room: (id) => MAX_STONES_PER_TOOTH - (counts.get(id) || 0),
    });
    if (!dots.length) {
      renderInk();
      notify('No room for another stone along this line.');
      return;
    }
    withScope(
      dots.map((p) => ({ ...brush, ...p, tool: 'pave' })),
      (l) => {
        const op = crypto.randomUUID();
        for (const p of dots) addGemRecord(l.id, p.tooth, p.x, p.y, 'pave', op, p.sizeMm ? p : brush);
        notify(`${dots.length} pavé ${dots.length === 1 ? 'stone' : 'stones'} placed`);
      },
    );
  }
  function pointInAnyTooth(x, y) {
    const pt = svgChart.createSVGPoint();
    pt.x = x;
    pt.y = y;
    const allowed = state.isolateDesign ? new Set((activeLayer()?.teeth || []).map(Number)) : null;
    for (const path of svgChart.querySelectorAll('[data-tooth]')) {
      const id = Number(path.dataset.tooth);
      if (allowed && !allowed.has(id)) continue;
      const box = toothBoxes.get(id);
      if (box && (x < box.x || y < box.y || x > box.x + box.width || y > box.y + box.height)) continue;
      try {
        if (path.isPointInFill(pt)) return id;
      } catch (e) {}
    }
    return null;
  }
  function onEditableLayer(g) {
    return (
      g.designId === state.activeDesignId &&
      (!state.showAllDesigns || activeLayer()?.visible !== false) &&
      supportsStones(materialKeyForLayerTooth(g.designId, g.tooth))
    );
  }
  function gemAt(x, y, slopPx) {
    // Translate a finger/mouse target into chart units at the current zoom. In
    // dense pavé pick the nearest centre (last drawn wins ties), not the last in range.
    const slop = slopPx / (svgChart.getScreenCTM()?.a || 1);
    let hit = null,
      distance = Infinity;
    for (const g of state.gems) {
      const d = Math.hypot(g.x - x, g.y - y);
      if (d <= distance && d <= Math.max(slop, gemSize(g) * 2.25) && onEditableLayer(g)) {
        hit = g;
        distance = d;
      }
    }
    return hit;
  }
  function renderGemOptions() {
    const rail = $('#gem-cut-rail'),
      colors = $('#gem-colors'),
      preview = $('#gem-selection-preview');
    if (!rail || !colors) return;
    const selected = selectedGem(),
      previewBrush = stoneBrush(state.tool),
      selectedCut = selected ? gemCut(selected) : previewBrush.cut,
      selectedColor = selected?.color || previewBrush.color,
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
      preview.innerHTML = `${sprite ? `<img src="${gemSpriteCache.get(`${selectedCut}:${selectedColor}`).url}" alt="${esc(cutLabel)} · ${esc(colorLabel(selectedColor))} selected">` : `<i class="gem-preview-fallback" style="--gem-color:${colorHex}" aria-hidden="true"></i>`}<span>${selected ? 'Editing diamond' : 'Next diamond'} · ${esc(cutLabel)} · ${esc(colorLabel(selectedColor))}</span>`;
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
    if (
      !state.newDesignSelection &&
      activeLayer()?.customized &&
      supportsStones(slotMaterial(activeLayer(), 0))
    )
      return true;
    if (!state.newDesignSelection && activeLayer()?.recipe) return true; // propose an extra stone: the fork dialog can switch its tooth to a valid metal
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
  // Screen, print and the production PDF all consume the same tooth details.
  function toothDetails(g) {
    const details = [
      ['Material', g.material === 'Gold' ? `Gold ${g.karat}` : g.material],
      ['Complexity', CalcEngine.levelName(g.level)],
    ];
    if (g.plating && g.plating !== 'None') details.push(['Plating', g.plating]);
    if (g.enamel && g.enamel !== 'None')
      details.push(['Enamel', [g.enamel, ...(g.enamelColors || [])].join(' · ')]);
    if (g.engraving && g.engraving !== 'None') details.push(['Laser engraving', g.engraving]);
    if (g.productionEffect === 'emboss') details.push(['Production finish', 'Embossed']);
    const full = ['full', 'both'].includes(g.stoneMode),
      ice = Object.keys(g.pricedIce || {});
    if (full || ice.length)
      details.push([
        'Stone setting',
        (OrderDesign.isBar(g.level)
          ? 'Iced-out bar'
          : `Full iced · ${g.diamondType || 'Moissanite'} · ${g.coverage || 'Standard pavé'}`) +
          (!full && ice.length < g.teeth.length ? ' · FDI ' + ice.join(', ') : ''),
      ]);
    if (['accent', 'both'].includes(g.stoneMode))
      details.push(['Accents', `${g.accentCount} × ${g.accentType} · ${g.setting}`]);
    const batches = new Map();
    for (const stone of g.pricedStones || []) {
      const desc = `${stone.color || 'clear'} ${GEM_CUTS.find((c) => c[0] === stone.cut)?.[1] || stone.cut || 'Round brilliant'} · ${stone.stoneType || 'CZ'} · ${Number(stone.sizeMm || 1).toFixed(1)} mm`;
      if (!batches.has(desc)) batches.set(desc, { count: 0, teeth: new Set() });
      const batch = batches.get(desc);
      batch.count += Number(stone.count) || 1;
      batch.teeth.add(stone.tooth);
    }
    if (batches.size)
      details.push([
        'Hand-set stones',
        [...batches]
          .map(
            ([desc, b]) =>
              `${b.count} × ${desc}` +
              (b.teeth.size < g.teeth.length ? ' · FDI ' + [...b.teeth].join(', ') : ''),
          )
          .join('; ') + (g.setting ? ` · ${g.setting}` : ''),
      ]);
    if (g.stoneNotes) details.push(['Stone notes', g.stoneNotes]);
    return details;
  }
  function toothCaption(g) {
    const summary = toothDetails(g).map(([k, v]) =>
      ['Material', 'Complexity', 'Stone setting'].includes(k) ? v : `${k}: ${v}`,
    );
    return `<div class="group-sub"><strong>FDI ${esc(g.teeth.join(' · '))}</strong><br>${esc(summary.join(' / '))}</div>`;
  }
  // Group by layer identity, not the display name (two independent designs may share a name).
  function designSections() {
    return state.designLayers.map((layer) => ({
      layer,
      groups: state.groups.filter((g) => g.layerId === layer.id),
    }));
  }
  function renderGroups() {
    const host = $('#design-groups'),
      summary = $('#summary-groups');
    const sections = designSections().filter((s) => s.groups.length);
    host.innerHTML =
      sections
        .map(({ layer, groups }, i) => {
          const tone = GROUP_TONES[i % GROUP_TONES.length];
          return `<article class="design-group" style="--group-tone:${tone[0]};--group-bg:${tone[1]}"><div class="group-swatch">${String(i + 1).padStart(2, '0')}</div><div><h3 class="group-title">${esc(layer.name)}</h3>${groups.map(toothCaption).join('')}</div><div class="group-actions"><button type="button" class="icon-btn" data-action="edit-group" data-id="${esc(groups[0].id)}">${layer.recipe ? 'Draw' : 'Edit'}</button><button type="button" class="icon-btn" data-action="remove-group" data-id="${esc(groups[0].id)}">Remove</button></div></article>`;
        })
        .join('') || '<div class="empty-designs">No applied designs yet.</div>';
    summary.innerHTML =
      sections
        .map(
          ({ layer, groups }) =>
            `<div class="summary-line"><strong>${esc(layer.name)}</strong><div>${groups.map(toothCaption).join('')}</div></div>`,
        )
        .join('') || 'No applied designs yet.';
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
  // Crop only the printed illustration. Coordinates of the editable SVG/canvas
  // never change, and freehand artwork outside a tooth must not be cropped off.
  function illustrationBounds(teeth, ink) {
    const v = chartView();
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    const include = (x, y) => {
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    };
    for (const id of teeth) {
      const b = toothBoxes.get(id);
      if (b) {
        include(b.x, b.y);
        include(b.x + b.width, b.y + b.height);
      }
    }
    for (const mark of ink)
      if (mark.clipToTooth === false) for (const p of mark.points || []) include(p.x, p.y);
    if (!Number.isFinite(left)) return [0, 0, 1, 1];
    left = Math.max(v.x, left - 18);
    top = Math.max(v.y, top - 20);
    right = Math.min(v.x + v.width, right + 18);
    bottom = Math.min(v.y + v.height, bottom + 20);
    return [
      (left - v.x) / v.width,
      (top - v.y) / v.height,
      (right - left) / v.width,
      (bottom - top) / v.height,
    ];
  }
  function createPrintDesignMaps() {
    if (!svgChart || !$('#ink-layer')) return new Map();
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
      cards = new Map();
    try {
      state.showAllDesigns = false;
      state.isolateDrawn = false;
      state.selectedTeeth = [];
      activeStroke = null;
      state.designLayers.forEach((design) => {
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
        clone.setAttribute('width', chartView().width);
        clone.setAttribute('height', chartView().height);
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
        const rect = illustrationBounds(teeth, ink),
          [x, y, w, h] = rect;
        const aspect = (w * CHART_VIEW.width) / (h * CHART_VIEW.height);
        cards.set(
          design.id,
          `<figure class="design-layer-print" data-crop="${rect.join(',')}"><div class="print-layer-map" style="--aspect:${aspect};--full-w:${100 / w}%;--full-h:${100 / h}%;--crop-x:${(-100 * x) / w}%;--crop-y:${(-100 * y) / h}%"><img class="print-layer-teeth" src="${svgImage}" alt="FDI tooth outlines"><img class="print-layer-ink" src="${inkImage}" alt="Artwork for ${esc(design.name)}"></div></figure>`,
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
    return cards;
  }
  function renderPrint(captureDesignMaps = false) {
    if (!captureDesignMaps && $('#print-sheet').hidden) return;
    if ((captureDesignMaps || printDesignMapDirty) && svgChart) {
      printDesignMaps = createPrintDesignMaps();
      printDesignMapDirty = false;
    }
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
        ...state.groups.map((g) => CalcEngine.levelKey(g.level)),
        ...(state.selectedTeeth.length ? [CalcEngine.levelKey(state.editor.level)] : []),
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
          ? `<div class="rollup-item"><img src="${assetUrl('levels', ASSET_LEVEL[level])}" alt=""><span>${esc(CalcEngine.levelName(level))}</span></div>`
          : '',
      )
      .join('');
    const gemKinds = [
      ...new Map(
        (state.gems || []).map((g) => {
          const key = [gemCut(g), g.color || 'clear', gemSize(g), Number(g.rotation) || 0].join('|');
          return [
            key,
            {
              cut: gemCut(g),
              size: gemSize(g),
              color: g.color || 'clear',
              rotation: Number(g.rotation) || 0,
            },
          ];
        }),
      ).values(),
    ];
    const gemPics = gemKinds
      .map(({ cut, color, size, rotation }) => {
        const cutName = GEM_CUTS.find((x) => x[0] === cut)?.[1] || cut;
        const photo = gemSpriteCache.get(`${cut}:${color}`)?.url || DIAMOND_FILE(cut);
        return `<div class="rollup-item gem-rollup"><img src="${photo}" alt=""><i style="--gem-color:${GEM_COLORS.find((x) => x[0] === color)?.[1] || '#f6f8fb'}"></i><span>${esc(colorLabel(color))} · ${esc(cutName)} · ${size.toFixed(1)} mm · ${esc(rotation)}°</span></div>`;
      })
      .join('');
    const groupHtml = designSections()
      .filter(({ layer, groups }) => groups.length || printDesignMaps.has(layer.id))
      .map(({ layer, groups }) => {
        const rows = groups
          .map(
            (g) =>
              `<article class="print-group"><div class="print-group-head"><h5>FDI ${esc(g.teeth.join(' · '))}</h5></div><div class="print-details">${toothDetails(
                g,
              )
                .map(
                  ([k, v]) => `<div class="print-detail"><span>${esc(k)}</span><span>${esc(v)}</span></div>`,
                )
                .join('')}</div></article>`,
          )
          .join('');
        return `<section class="print-design"><h4>${esc(layer.name)}</h4>${printDesignMaps.get(layer.id) || ''}${rows || '<p>Drawing in progress · details not yet issued.</p>'}</section>`;
      })
      .join('');
    const signature = state.signatureLines?.length
      ? `<img src="${signatureImage()}" alt="Client signature">`
      : '';
    const toothIds = [...new Set([...all, ...state.selectedTeeth])].sort((a, b) => a - b).join(', ') || '—';
    const depositPct =
      Number(state.price) > 0 ? Math.round((Number(state.deposit || 0) / Number(state.price)) * 100) : 0;
    host.innerHTML = `<div class="print-header"><img class="print-logo" src="/logo/logo_black.png" alt="EGYGRILLZ"><div class="print-heading"><h2>CLIENT ORDER SHEET</h2><div><strong>${esc(state.orderNo)}</strong><br>${esc(state.status)} · ${esc(state.date || '')}</div></div></div><div class="print-meta"><div><span>Client</span><br><strong>${esc(state.clientName || '—')}</strong>${state.clientPhone ? `<br>${esc(state.clientPhone)}` : ''}</div><div><span>Delivery</span><br><strong>${esc(state.deliveryDate || 'To confirm')}</strong></div><div><span>Teeth · FDI</span><br><strong>${esc(toothIds)}</strong></div><div><span>Reference</span><br><strong>${esc(state.reference || '—')}</strong></div></div>${groupHtml}<div class="print-notes"><h3 class="print-section-title" style="margin:0">Notes &amp; special requests</h3><p>${esc(state.notes || '—')}</p><p><strong>Production:</strong> ${esc(productionNotes())}</p>${state.services.length ? `<p><strong>Services:</strong> ${state.services.map((x, i) => `${esc(x.name)} ×${Number(x.qty) || 1} · ${formatMoney(currentOrder?.services[i]?.subtotal ?? CalcEngine.calculateService(OrderPricing.serviceSpec(x, CalcEngine)).subtotal)}`).join(' · ')}</p>` : ''}<p><strong>Payment:</strong> ${esc(state.paymentMethod)} · Deposit ${esc(Number(state.deposit || 0).toLocaleString('en-US'))} EGP due · Paid ${esc(formatMoney(CalcEngine.paymentSummary(saved?.quote).paid))} · Outstanding ${esc(formatMoney(Math.max(0, Number(state.price) - CalcEngine.paymentSummary(saved?.quote).paid)))}</p></div><div class="print-price"><span>${state.priceMode === 'manual' ? 'Agreed price' : 'Estimated price'} · ${depositPct}% deposit due</span><strong>${esc(formatMoney(state.price))}</strong></div><section class="print-material-rollup"><strong>Materials &amp; finishes used</strong><div class="rollup-row">${materialPics}${platingPics}${levelPics}${gemPics || '<span class="rollup-empty">No placed diamonds</span>'}</div></section><div class="print-signatures"><div class="signature-line">${signature}<span>Client approval</span></div></div><div class="print-legal">${state.agreement ? 'DESIGN SPECIFICATIONS REVIEWED BY CLIENT.' : 'CLIENT REVIEW PENDING.'}</div>`;
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
    const el = $('#order-timeline');
    el.replaceChildren(
      ...Object.keys(CalcEngine.get().timelinePct).map(
        (k) => new Option(CalcEngine.LABELS.timeline[k] || k, k),
      ),
    );
    el.value = state.timeline;
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
    $('#edit-palette').onclick = () =>
      withScope([], chooseEnamel, { reason: 'Changing the saved enamel palette makes a new design.' });
    renderGemOptions();
    setTool(state.tool || 'select');
    $('#save-current-design').addEventListener('click', saveCurrentDesignTemplate);
    $('#load-saved-design').addEventListener('click', loadSelectedDesignTemplate);
    document.addEventListener('click', (e) => {
      const chip = e.target.closest('.material-chip');
      if (chip) {
        if (chip.disabled) return;
        if (!state.newDesignSelection && activeLayer().customized)
          activeLayer().nextMaterial = chip.dataset.material;
        state.editor.materialKey = chip.dataset.material;
        state.editor.material = MATERIALS[chip.dataset.material].label;
        $('#material').value = state.editor.material;
        renderTeeth();
        persist();
        return;
      }
      const rotateBtn = e.target.closest('[data-rotate]'),
        sizeBtn = e.target.closest('[data-size-step]');
      if (rotateBtn)
        return setGemRotation((Number(selectedGem()?.rotation) || 0) + Number(rotateBtn.dataset.rotate));
      if (sizeBtn && selectedGem())
        return setGemSize(gemSize(selectedGem()) + Number(sizeBtn.dataset.sizeStep));
      const tool = e.target.closest('[data-tool]');
      if (tool) {
        if (tool.disabled) return;
        if (
          tool.dataset.tool === 'enamel' &&
          activeLayer().recipe &&
          !activeLayer().recipe.slots.some((s) => s.colors.length)
        ) {
          withScope([], chooseEnamel, { reason: 'Enamel is not in the saved design.' });
          return;
        }
        if (tool.dataset.tool === 'enamel' && !activeLayer().recipe) {
          chooseEnamel();
          return;
        }
        state.reviewLayerId = '';
        if (tool.dataset.tool !== 'gem-edit') state.selectedGemId = '';
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
        if (l && (l.teeth.length || l.recipe || l.customized)) activateLayer(l);
        return;
      }
      const cut = e.target.closest('[data-cut]'),
        color = e.target.closest('[data-gem-color]');
      if (cut) changeStone('cut', cut.dataset.cut);
      if (color) changeStone('color', color.dataset.gemColor);
    });
    $('#next-gem').onclick = () => {
      const gems = state.gems.filter(onEditableLayer);
      if (gems.length) selectGem(gems[(gems.indexOf(selectedGem()) + 1) % gems.length]);
    };
    let draggingGemId = null,
      dragStart = null,
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
          dragPreview = null;
          draggingGemId = dragOrigin = dragStart = tapAction = activeStroke = drawingPointer = null;
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
      if (state.newDesignSelection || (!activeLayer()?.teeth.length && !acceptsNewTooth(activeLayer()))) {
        notify('Add a design before drawing');
        return;
      }
      const coords = svgCoordFromEvent(e);
      if (!coords) return;
      if (!state.freeDraw && state.isolateDesign && !pointInActiveDesignBounds(coords)) return;
      drawingPointer = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      if (state.tool === 'gem' || state.tool === 'gem-edit') {
        e.preventDefault();
        const editing = state.tool === 'gem-edit',
          touch = e.pointerType === 'touch';
        const gem = gemAt(coords.x, coords.y, editing ? (touch ? 16 : 9) : touch ? 5 : 3);
        if (gem) {
          // Do not expand controls above the canvas under a moving finger. Commit
          // the selection on pointerup; a second finger can still cancel the drag.
          draggingGemId = gem.id;
          dragOrigin = { x: gem.x, y: gem.y, tooth: gem.tooth };
          dragStart = { x: coords.x, y: coords.y, clientX: e.clientX, clientY: e.clientY };
        } else if (editing) {
          tapAction = () => selectGem(null); // an empty tap must never create a stone in Edit
        } else {
          const point = pointOnTooth(e);
          if (!point || (!acceptsNewTooth(activeLayer()) && !activeLayer().teeth.includes(point.tooth)))
            return;
          tapAction = () => addGem(point.tooth, point.x, point.y);
        }
        return;
      }
      const toothPoint = pointOnTooth(e);
      if (toothPoint && !acceptsNewTooth(activeLayer()) && !activeLayer().teeth.includes(toothPoint.tooth))
        return;
      if (state.tool === 'pave' && (!toothPoint || !eligibleStone(activeLayer(), toothPoint.tooth))) {
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
            const tooth = toothPoint.tooth;
            const colors = OrderRecipe.slotAt(activeLayer(), tooth)?.colors;
            withScope([{ tooth, tool: 'enamel' }], (l) => {
              state.ink.push({
                effect: 'enamel',
                designId: l.id,
                tooth,
                colors: [...(colors?.length ? colors : state.editor.palette || ['#b32841'])],
                createdAt: Date.now(),
              });
            });
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
        clipTeeth: acceptsNewTooth(layer) ? [...UPPER, ...LOWER] : clipTeeth,
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
        if (!p || !gem || Math.hypot(e.clientX - dragStart.clientX, e.clientY - dragStart.clientY) < 3)
          return;
        const x = dragOrigin.x + p.x - dragStart.x,
          y = dragOrigin.y + p.y - dragStart.y;
        const tooth = pointInAnyTooth(x, y);
        if (
          tooth &&
          (acceptsNewTooth(activeLayer()) || activeLayer().teeth.includes(tooth)) &&
          eligibleStone(activeLayer(), tooth) &&
          (tooth === gem.tooth ||
            (gem.kind !== 'iced' && gemCountOnTooth(gem.designId, tooth) < MAX_STONES_PER_TOOTH))
        ) {
          dragPreview = { ...gem, x, y, tooth };
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
        dragPreview = null;
        activeStroke = draggingGemId = tapAction = dragOrigin = dragStart = null;
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
        const g = state.gems.find((s) => s.id === draggingGemId);
        draggingGemId = dragStart = null;
        const move = dragPreview;
        dragPreview = null;
        const select = () => {
          selectGem(g);
          canvas.focus({ preventScroll: true });
        };
        if (move && move.tooth !== g.tooth) {
          const tool = g.kind === 'pave' ? 'pave' : 'gem';
          withScope(
            [{ ...move, tool }],
            () => {
              Object.assign(g, move);
              select();
            },
            { excludeId: g.id },
          );
        } else {
          if (move) Object.assign(g, move);
          select();
          renderTeeth();
          renderPrint();
          persist();
        }
        return;
      }
      if (!activeStroke) return;
      const stroke = activeStroke;
      activeStroke = null;
      if (stroke.kind === 'pave') placePaveAlong(stroke.points, stroke.tooth);
      else {
        if (acceptsNewTooth(activeLayer()) || stroke.effect === 'laser' || stroke.effect === 'emboss') {
          const touched = new Set();
          let prev = stroke.points[0];
          for (const p of stroke.points) {
            const steps = Math.max(1, Math.ceil(Math.hypot(p.x - prev.x, p.y - prev.y) / 3));
            for (let i = 1; i <= steps; i++) {
              const id = pointInAnyTooth(
                prev.x + ((p.x - prev.x) * i) / steps,
                prev.y + ((p.y - prev.y) * i) / steps,
              );
              if (id && (acceptsNewTooth(activeLayer()) || activeLayer().teeth.includes(id))) touched.add(id);
            }
            prev = p;
          }
          stroke.touchedTeeth = [...touched];
        }
        const ids = stroke.touchedTeeth?.length ? stroke.touchedTeeth : [stroke.tooth];
        withScope(
          ids.map((tooth) => ({ tooth, tool: stroke.kind })),
          (l) => {
            stroke.designId = l.id;
            stroke.material = slotMaterial(l, stroke.tooth);
            if (stroke.clipToTooth) stroke.clipTeeth = [...l.teeth];
            stroke.createdAt = Date.now();
            state.ink.push(stroke);
          },
        );
      }
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
    canvas.addEventListener('keydown', (e) => {
      if (!selectedGem()) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        return deleteSelectedGem();
      }
      if (e.key === 'Escape') return selectGem(null);
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
    function changeStone(field, value) {
      const g = selectedGem(),
        l = activeLayer();
      if (!g && state.tool === 'gem-edit') return;
      const tool = g
        ? g.kind === 'iced'
          ? 'ice'
          : g.kind === 'pave'
            ? 'pave'
            : 'gem'
        : ['ice', 'pave'].includes(state.tool)
          ? state.tool
          : 'gem';
      const old = g ? { cut: gemCut(g), sizeMm: gemSize(g), color: g.color } : stoneBrush(tool);
      if (old[field] === value) return;
      const brush = { ...old, [field]: value };
      const actions = g ? [{ tooth: g.tooth, tool, ...brush }] : [];
      const inRecipe = l.recipe?.slots.some((s) =>
        (tool === 'ice' ? [s.ice].filter(Boolean) : s.stones.filter((b) => b.tool === tool)).some(
          (b) => OrderRecipe.signature(tool, b) === OrderRecipe.signature(tool, brush),
        ),
      );
      withScope(
        actions,
        (layer) => {
          if (g)
            g[
              g.kind === 'iced' && field !== 'color'
                ? field === 'cut'
                  ? 'visualCut'
                  : 'visualSizeMm'
                : field
            ] = value;
          else if (layer.recipe) brushOverride = { tool, brush };
          else {
            state.editor.gemSize = brush.sizeMm;
            state.editor.gemColor = brush.color;
            if (tool === 'gem') state.editor.diamondCut = brush.cut;
          }
          renderGemOptions();
        },
        {
          excludeId: g?.id,
          reason:
            l.recipe && !g && !inRecipe
              ? 'This diamond cut, colour or size is outside the saved design.'
              : '',
        },
      );
    }
    function setGemSize(value) {
      const n = Math.max(0.5, Math.min(5, Math.round(Number(value) * 10) / 10));
      changeStone('sizeMm', n);
    }
    $('#gem-size').addEventListener('input', (e) => setGemSize(e.target.value));
    function setGemRotation(value) {
      const gem = selectedGem();
      if (!gem) return;
      gem.rotation = ((Math.round(Number(value) || 0) % 360) + 360) % 360;
      $('#gem-rotation').value = gem.rotation;
      $('#gem-rotation-value').textContent = `${gem.rotation}°`;
      renderInk();
      persist();
      renderPrint();
    }
    $('#gem-rotation').addEventListener('input', (e) => setGemRotation(e.target.value));
    $('#gem-spacing').addEventListener(
      'input',
      (e) => ($('#gem-spacing-value').textContent = `${Number(e.target.value).toFixed(1)} mm`),
    );
    function deleteSelectedGem() {
      const g = selectedGem();
      if (!g) return;
      state.gems.splice(state.gems.indexOf(g), 1);
      if (g.kind === 'iced') {
        const rec = state.icedTeeth?.find(
          (i) => i.designId === g.designId && Number(i.tooth) === Number(g.tooth),
        );
        if (rec) {
          rec.count = state.gems.filter(
            (s) => s.kind === 'iced' && s.designId === g.designId && s.tooth === g.tooth,
          ).length;
          if (!rec.count) state.icedTeeth.splice(state.icedTeeth.indexOf(rec), 1);
        }
      }
      state.selectedGemId = '';
      reconcileRemovedMark(activeLayer());
      renderGemOptions();
      renderAll();
      persist();
      notify('Selected diamond deleted');
    }
    $('#delete-selected-gem').addEventListener('click', deleteSelectedGem);
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
        if (!selectedGem()) state.selectedGemId = '';
        renderGemOptions();
      } else if (strokeIndex >= 0) state.ink.splice(strokeIndex, 1);
      state.icedTeeth = (state.icedTeeth || [])
        .map((rec) => ({
          ...rec,
          count: state.gems.filter(
            (g) => g.designId === rec.designId && Number(g.tooth) === Number(rec.tooth) && g.kind === 'iced',
          ).length,
        }))
        .filter((rec) => rec.count > 0);
      reconcileRemovedMark(layer);
      renderAll();
      persist();
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
    'Sign in to <a href="/editx.html" target="_blank" rel="noopener">EditX</a> to use studio records, or enter details manually.';
  let directoryVersion = 0;
  function useClient(c) {
    if (saved?.quote && (state.clientId !== (c.id || '') || state.clientName !== (c.name || ''))) {
      notify('Start a new order for a different client.');
      return;
    }
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
      state.signatureLines = [];
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
        records = await import('/assets/order-records.js?v=3');
        records.watchUser(async (user) => {
          if (staffUser && staffUser.uid !== user?.uid) resetSheet();
          staffUser = user;
          legacyFiles = [];
          $('#legacy-files').hidden = true;
          $('#legacy-files').open = false;
          $('#legacy-picker').replaceChildren();
          appointmentClients = [];
          savedDesignDocs.clear();
          $('#client-results').replaceChildren();
          $('#client-results').hidden = true;
          refreshOrder();
          refreshDirectory();
          loadSavedDesignTemplates();
          populateDrafts();
          initialPrices.then(() => {
            if (user !== staffUser) return;
            if (stopPrices) stopPrices();
            stopPrices = records.watchPrices(applyLivePrices, () => {
              if (pricingSource === 'firestore') {
                pricingSource = 'stale-cache';
                refreshOrder();
              }
            });
          });
          const sheetId = new URLSearchParams(location.search).get('sheet');
          if (sheetId && !saved && /^EGZ-\d{6}-[A-F\d]{12}$/i.test(sheetId)) {
            // Direct Telegram links use the same sign-in, without putting a token in the URL.
            try {
              const granted = await records.signInToStudio();
              if (staffUser === user && user?.uid === granted.uid) await loadDraft(sheetId);
            } catch (e) {
              notify(recordError(e, 'open the studio order'));
            }
          }
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
  // Normalised pen coordinates survive a change of screen size. Rasterise only
  // when the user previews, prints or downloads a PDF; no signature PNG goes into storage.
  function drawSignature(c) {
    const ctx = c.getContext('2d'),
      w = c.width,
      h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#161616';
    ctx.lineWidth = Math.max(1, h / 62);
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const line of state.signatureLines || []) {
      ctx.beginPath();
      for (let i = 0; i < line.length; i += 2) {
        const x = (line[i] * w) / 10000,
          y = (line[i + 1] * h) / 10000;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
  function syncSignature(force = false) {
    const c = $('#signature-pad'),
      r = c.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const scale = Math.min(2, window.devicePixelRatio || 1),
      w = Math.round(r.width * scale),
      h = Math.round(r.height * scale);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
      force = true;
    }
    if (force) drawSignature(c);
  }
  function signatureImage() {
    const c = document.createElement('canvas');
    c.width = 720;
    c.height = 180;
    drawSignature(c);
    return c.toDataURL('image/png');
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
      savedDesignDocs = new Map();
      for (const d of docs) {
        try {
          savedDesignDocs.set(d.id, OrderRecipe.read(d));
        } catch {
          /* Skip an unusable old entry, not the whole library. */
        }
      }
      const current = select.value;
      select.innerHTML =
        '<option value="">Choose a saved design</option>' +
        [...savedDesignDocs.entries()]
          .map(
            ([id, d]) =>
              `<option value="${esc(id)}">${esc(d.name || 'Design')} · ${(d.slots || d.teeth || []).length} teeth · ${esc(id.slice(0, 6))}</option>`,
          )
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
    const groups = state.groups.filter((g) => g.layerId === layer.id);
    if (!groups.length || layerPending(layer)) {
      notify('Apply the design details before saving a template');
      return;
    }
    try {
      if (layer.recipe) return notify('These details are already in the studio library.');
      const template = OrderRecipe.fromLayer(layer, state, groups);
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
      const recipe = OrderRecipe.read(source);
      const layer = {
        id: crypto.randomUUID(),
        name: recipe.name,
        recipe,
        mode: recipe.mode,
        materials: {},
        details: {},
        teeth: [],
        draft: true,
        visible: true,
      };
      state.designLayers = state.designLayers.filter((l) => l.teeth.length || l.recipe || l.customized);
      state.designLayers.push(layer);
      activateLayer(layer);
      $('#chart-viewport').scrollIntoView({ block: 'center' });
      notify(`Draw “${layer.name}” on any ${recipe.slots.length} teeth.`);
    } catch (e) {
      console.error('Load design template:', e);
      notify('Could not load the saved design');
    }
  }
  let sheetCursor = null,
    listVersion = 0;
  async function populateDrafts(append = false) {
    const select = $('#saved-drafts'),
      user = staffUser,
      version = ++listVersion;
    if (!append) {
      sheetCursor = null;
      select.replaceChildren(
        new Option(user ? 'Choose a studio order' : 'Sign in to open studio orders', ''),
      );
    }
    if (!records || !user) return;
    try {
      const { rows, more } = await records.sheets(append ? sheetCursor : null);
      if (user !== staffUser || version !== listVersion) return;
      select.querySelector('[value=":more"]')?.remove();
      const ids = new Set(Array.from(select.options, (x) => x.value));
      for (const r of rows) if (!ids.has(r.id)) select.add(new Option(r.label || r.id, r.id));
      sheetCursor = more;
      if (more) select.add(new Option('Load earlier orders…', ':more'));
      select.value = saved ? state.orderNo : '';
      offerLegacyFiles();
    } catch (e) {
      if (user === staffUser && version === listVersion) {
        $('#save-status').textContent = recordError(e, 'list saved orders');
        select.value = '';
      }
    }
  }
  function resetSheet() {
    state = blankState();
    saved = null;
    lockedTerms = '';
    repriceRequested = false;
    pendingReceipt = null;
    printDesignMaps = new Map();
    brushOverride = null;
    $('#print-sheet').replaceChildren();
    clearDraftLinks();
    for (const id of ['receipt-status', 'receipt-amount', 'client-search']) {
      const e = $('#' + id);
      if (e.tagName === 'INPUT') e.value = '';
      else e.textContent = '';
    }
    $('#saved-drafts').value = '';
    history.replaceState(null, '', location.pathname);
    normalizeDesignState();
    fileBase();
    syncInputs();
    renderAll();
    showStep('client', false);
  }
  async function loadDraft(id) {
    if (!staffUser || busy) return;
    if (dirty && !confirm('Discard unsaved changes and open this saved order?')) {
      $('#saved-drafts').value = saved ? state.orderNo : '';
      return;
    }
    return deskAction(() => restoreFile(id));
  }
  async function restoreFile(id) {
    const user = staffUser,
      file = await records.openSheet(id);
    if (user !== staffUser) return;
    const fields = OrderFile.unpack(file.sheetJson);
    resetSheet();
    state = Object.assign(blankState(), fields, { orderNo: id });
    normalizeDesignState();
    saved = { revision: file.revision, quote: file.quote };
    lockedTerms = file.locked && file.quote ? OrderFile.termsKey(state) : '';
    fileBase();
    syncInputs();
    renderAll();
    showStep(steps.includes(file.step) ? file.step : 'review', false);
    $('#saved-drafts').value = id;
    history.replaceState(null, '', location.pathname + '?sheet=' + encodeURIComponent(id));
    notify('Studio order opened');
  }
  // Read-only bridge for people with v1 files. Never automatically upload/delete
  // an old consultation. No device write, raster signature or old payment claim.
  const oldActive = 'egygz_order_sheet_active_v1',
    oldDrafts = 'egygz_order_sheet_drafts_v1';
  let legacyFiles = [];
  function offerLegacyFiles() {
    try {
      $('#legacy-files').hidden =
        !staffUser || !(localStorage.getItem(oldActive) || localStorage.getItem(oldDrafts));
    } catch {
      $('#legacy-files').hidden = true;
    }
  }
  $('#legacy-files').ontoggle = () => {
    const el = $('#legacy-files'),
      picker = $('#legacy-picker');
    legacyFiles = [];
    picker.replaceChildren();
    if (el.hidden || !el.open || !staffUser) return;
    try {
      const drafts = JSON.parse(localStorage.getItem(oldDrafts) || '[]');
      const candidates = [
        JSON.parse(localStorage.getItem(oldActive) || 'null'),
        ...drafts.map((d) => d.state),
      ];
      const seen = new Set();
      for (const file of candidates) {
        if (
          !file?.orderNo ||
          seen.has(file.orderNo) ||
          !(
            file.clientName ||
            file.groups?.length ||
            file.services?.length ||
            file.ink?.length ||
            file.notes ||
            file.clientPhone
          )
        )
          continue;
        seen.add(file.orderNo);
        picker.add(new Option(OrderFile.label(file), String(legacyFiles.length)));
        legacyFiles.push(file);
      }
      $('#legacy-open').disabled = !legacyFiles.length;
      if (!legacyFiles.length) picker.add(new Option('No earlier sheets found', ''));
    } catch {
      picker.add(new Option('Could not read earlier sheets', ''));
      $('#legacy-open').disabled = true;
    }
  };
  $('#legacy-open').onclick = () =>
    deskAction(async () => {
      requireDesk();
      const old = legacyFiles[Number($('#legacy-picker').value)],
        user = staffUser;
      if (!old) return;
      const note = old.quoteId ? ' Its earlier quotation remains separate in Quotes.' : '';
      if (
        !confirm(
          'Open this older draft as an editable studio order? The old image signature will not transfer. Review current prices and sign again before saving.' +
            note +
            (dirty ? ' Unsaved changes here will be discarded.' : ''),
        )
      )
        return;
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(old.orderNo)));
      const tag = Array.from(new Uint8Array(hash).slice(0, 6), (b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
      const day = String(old.orderNo).match(/^EGZ-(\d{6})-/)?.[1] || today().replaceAll('-', '').slice(2),
        id = `EGZ-${day}-${tag}`;
      const exists = await records.hasSheet(id);
      if (user !== staffUser) return;
      if (exists) {
        await restoreFile(id);
        return;
      }
      resetSheet();
      state = Object.assign(blankState(), OrderFile.unpack(OrderFile.pack(old)), {
        orderNo: id,
        signatureLines: [],
        agreement: false,
      });
      if (state.mold && state.mold !== 'none') {
        const type = 'mold:' + state.mold;
        state.services.push({
          id: crypto.randomUUID(),
          type,
          qty: 1,
          name: OrderPricing.serviceCatalog(CalcEngine)[type]?.name || 'Mold',
        });
        state.mold = 'none';
      }
      normalizeDesignState();
      syncInputs();
      renderAll();
      showStep('client', false);
      notify('Earlier draft opened. Review and save to the studio.');
    });
  function applyLivePrices(pricing, site) {
    CalcEngine.reset();
    CalcEngine.set(pricing || {});
    SiteConfig.data = { ...SiteConfig.DEFAULTS, ...site };
    SiteConfig.source = site ? 'firestore' : 'defaults';
    CalcEngine.syncServiceDefaults(SiteConfig.data);
    const gold = window.MetalRates?.goldEgpPerGram24();
    if (gold > 0) CalcEngine.set({ goldPrice: gold });
    pricingSource = pricing ? 'firestore' : 'defaults';
    renderOrderOptions();
    renderAll();
  }
  function removeGroup(id) {
    const group = state.groups.find((g) => g.id === id);
    if (!group || !confirm(`Remove the entire “${group.name}” design and its drawing from this order?`))
      return;
    for (const k of ['ink', 'gems', 'icedTeeth'])
      state[k] = state[k].filter((x) => x.designId !== group.layerId);
    state.groups = state.groups.filter((g) => g.layerId !== group.layerId);
    state.designLayers = state.designLayers.filter((l) => l.id !== group.layerId);
    state.toothMaterials = Object.assign({}, ...state.designLayers.map((l) => l.materials));
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
    if (['clientName', 'clientPhone'].includes(key) && el.value !== state[key]) {
      state.clientId = '';
      state.agreement = false;
      state.signatureLines = [];
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
    if (
      e.target.matches('[data-fork-metal]') &&
      activeLayer().customized &&
      state.reviewLayerId === activeLayer().id
    ) {
      activeLayer().materials[e.target.dataset.forkMetal] = materialForGroup(e.target.value);
      renderAll();
      persist();
      return;
    }
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
    if (e.target.value === ':more') populateDrafts(true);
    else if (e.target.value) loadDraft(e.target.value);
  });
  $('#save-draft').onclick = () => deskAction(() => saveFile(false));
  $('#new-sheet').onclick = () => {
    if (busy || (dirty && !confirm('Discard unsaved changes and start a new order?'))) return;
    resetSheet();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  let printPrepared = false;
  const deskTitle = document.title;
  $('#print-sheet-btn').onclick = () =>
    deskAction(async () => {
      if (!(await saveFile(true))) return;
      renderPrint(true);
      printPrepared = true;
      try {
        await Promise.allSettled([...$('#print-sheet').querySelectorAll('img')].map((img) => img.decode()));
        window.print();
      } finally {
        printPrepared = false;
      }
    });
  $('#create-proforma-btn').onclick = () =>
    deskAction(async () => {
      const q = await saveFile(true);
      if (q) {
        busy = false;
        location.assign('/invoice.html?quote=' + encodeURIComponent(q.id));
      }
    });
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
    state.signatureLines = [];
    syncSignature(true);
    persist();
    renderPrint();
  });
  const pad = $('#signature-pad');
  let signing = null;
  const signaturePoint = (e) => {
    const r = pad.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height].map((v) =>
      Math.round(Math.max(0, Math.min(1, v)) * 10000),
    );
  };
  pad.onpointerdown = (e) => {
    if (signing !== null) return;
    e.preventDefault();
    signing = e.pointerId;
    pad.setPointerCapture(signing);
    state.signatureLines.push(signaturePoint(e));
  };
  pad.onpointermove = (e) => {
    if (e.pointerId !== signing) return;
    state.signatureLines.at(-1).push(...signaturePoint(e));
    drawSignature(pad);
  };
  pad.onpointerup = pad.onpointercancel = (e) => {
    if (e.pointerId !== signing) return;
    signing = null;
    if (pad.hasPointerCapture(e.pointerId)) pad.releasePointerCapture(e.pointerId);
    persist();
    renderPrint();
  };
  window.addEventListener('resize', () => syncSignature(true));
  window.addEventListener('afterprint', () => {
    document.title = deskTitle;
  });
  window.addEventListener('beforeprint', () => {
    document.title = CalcEngine.documentFilename('Order', state).replace(/\.pdf$/i, '');
    if (!printPrepared) renderPrint(true);
  });

  const steps = ['client', 'design', 'pricing', 'review'];
  function showStep(step, scroll = true) {
    const i = steps.indexOf(step);
    if (i < 0) return;
    state.step = step;
    document.body.dataset.workspace = step;
    $('#order-summary').hidden = step === 'client';
    $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== step));
    $$('[data-step]').forEach((b) => {
      if (b.dataset.step === step) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    $('#step-back').hidden = i === 0;
    $('#step-next').hidden = i === 3;
    $('#step-next').textContent = `Continue to ${steps[i + 1] || ''}`;
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
  $('#quote-pdf-btn').onclick = () =>
    deskAction(async () => {
      const q = await saveFile(true);
      if (q) CalcEngine.downloadQuotePdf(q.order, { ...q, date: q.issuedAt });
    });
  $('#save-quote-btn').onclick = () => deskAction(() => saveFile(true));
  $('#order-pdf-btn').onclick = () =>
    deskAction(async () => {
      const q = await saveFile(true);
      if (q) {
        const { download, blob } = await productionDocument(q);
        download(blob, CalcEngine.documentFilename('Order', q));
      }
    });
  $('#email-order').onclick = () => deskAction(openOrderDraft);
  $('#payment-form').onsubmit = (e) => {
    e.preventDefault();
    deskAction(recordPayment);
  };
  $('#reprice').onclick = () => {
    if (
      !confirm(
        'Recalculate this order at the current EditX rates? The saved quotation changes only when you save.',
      )
    )
      return;
    lockedTerms = '';
    repriceRequested = true;
    refreshOrder();
    persist();
  };
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
  fileBase();
  renderOrderOptions();
  syncInputs();
  populateDrafts();
  renderAll();
  showStep(steps.includes(state.step) ? state.step : 'client', false);
  loadChart();
  const initialPrices = loadPricing(true);
  setupAppointments();
  if (window.MetalRates) {
    MetalRates.attach(CalcEngine);
    MetalRates.onChange(() => {
      refreshOrder();
      renderPrint();
    });
  }
})();
