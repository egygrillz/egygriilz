/* ═══════════════════════════════════════════════════════════════════════════
 *  EGYGRILLZ — NON-DESTRUCTIVE IMAGE CROPS
 *  ---------------------------------------------------------------------------
 *  Every image the site shows can be re-framed from /editx without touching
 *  the file itself: the studio drags/zooms a preview and we store the numbers
 *  in Firestore  settings/crops → { items: [ { slot, x, y, zoom } ] }.
 *
 *  Backed by a 10-minute localStorage cache, stale fallback, and shared 429
 *  quota cooldown so visitor page views never burn through Firestore quota.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PROJECT = 'egygrillz-studio';
  var API_KEY = 'AIzaSyDg8i3Bk1LVvScITFL1rDd5NSa0B5TjBZk';
  var DOC_URL = 'https://firestore.googleapis.com/v1/projects/' + PROJECT +
    '/databases/(default)/documents/settings/crops?key=' + API_KEY;
  var CACHE_KEY = 'egygz_crops_v1';
  var QUOTA_KEY = 'egygz_fs_quota_until_v1';
  var CACHE_TTL = 30 * 60 * 1000;
  var QUOTA_COOLDOWN = 15 * 60 * 1000;
  var TIMEOUT = 4000;
  var SKIP = '.modal-slide, .modal, [data-crop="off"]';

  var map = {};                   // slot → { x, y, zoom }
  var pathIndex = null;           // normalised image path → [primaryKey, legacyKey?]
  var pathPromise = null;
  var started = false;
  var ready = null;

  function isQuotaCooling() {
    try { return Number(localStorage.getItem(QUOTA_KEY) || 0) > Date.now(); } catch (e) { return false; }
  }
  function markQuotaHit() {
    try { localStorage.setItem(QUOTA_KEY, String(Date.now() + QUOTA_COOLDOWN)); } catch (e) {}
  }

  /* ── paths ─────────────────────────────────────────────────────────── */

  function normPath(u) {
    var s = String(u || '').trim();
    if (!s) return '';
    s = s.split('#')[0].split('?')[0];
    s = s.replace(/^https?:\/\/[^/]+/i, '');
    s = s.replace(/^\.?\//, '');
    try { s = decodeURIComponent(s); } catch (e) {}
    return s;
  }

  function fileOf(path) {
    var parts = String(path || '').split('/');
    return parts[parts.length - 1] || '';
  }

  /* ── firestore rest ───────────────────────────────────────────────── */

  function val(v) {
    if (!v) return undefined;
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.doubleValue !== undefined) return Number(v.doubleValue);
    if (v.booleanValue !== undefined) return !!v.booleanValue;
    if (v.nullValue !== undefined) return null;
    if (v.arrayValue) return (v.arrayValue.values || []).map(val);
    if (v.mapValue) {
      var out = {};
      Object.keys(v.mapValue.fields || {}).forEach(function (k) { out[k] = val(v.mapValue.fields[k]); });
      return out;
    }
    return undefined;
  }

  function calm(v, lo, hi, dflt) {
    var n = Number(v);
    if (!isFinite(n)) return dflt;
    return Math.max(lo, Math.min(hi, n));
  }

  function normaliseCrop(c) {
    return {
      x: calm(c && c.x, 0, 100, 50),
      y: calm(c && c.y, 0, 100, 50),
      zoom: calm(c && c.zoom, 1, 3, 1)
    };
  }

  function indexItems(items) {
    map = {};
    (items || []).forEach(function (it) {
      var slot = String((it && it.slot) || '').trim();
      if (!slot) return;
      map[slot] = normaliseCrop(it);
    });
  }

  function readCache(allowStale) {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.at || !Array.isArray(o.items)) return null;
      if (!allowStale && (Date.now() - o.at > CACHE_TTL)) return null;
      return o.items;
    } catch (e) { return null; }
  }

  function writeCache(items) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ items: items, at: Date.now() })); } catch (e) {}
  }

  function load(force) {
    if (!force && ready) return ready;
    if (!force) {
      var cached = readCache(false);
      if (cached) {
        indexItems(cached);
        ready = Promise.resolve(map);
        return ready;
      }
    }
    var stale = readCache(true);
    if (stale) indexItems(stale);
    if (!force && isQuotaCooling()) {
      ready = Promise.resolve(map);
      return ready;
    }

    ready = new Promise(function (resolve) {
      if (!global.fetch) { resolve(map); return; }
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (ctrl) { try { ctrl.abort(); } catch (e) {} }
      }, TIMEOUT);

      global.fetch(DOC_URL, ctrl ? { signal: ctrl.signal } : undefined)
        .then(function (r) {
          if (r.status === 429) { markQuotaHit(); return null; }
          if (r.status === 404) { writeCache([]); indexItems([]); return { __empty: true }; }
          return r.ok ? r.json() : null;
        })
        .then(function (doc) {
          clearTimeout(timer);
          if (!doc || doc.__empty) { resolve(map); return; }
          var items = doc.fields && doc.fields.items ? (val(doc.fields.items) || []) : [];
          indexItems(items);
          writeCache(items);
          resolve(map);
        })
        .catch(function () { clearTimeout(timer); resolve(map); });
    });
    return ready;
  }

  /* ── design index (for "card:" slots) ─────────────────────────────── */

  function designKeysForItem(item) {
    var cat = item.catFolder || item.category || item.page || 'sets';
    var folder = item.folder || item.id || '';
    var id = item.id || folder;
    if (!folder && !id) return [];
    /* grillz-gallery seed items all share folder "000001"; give each item its own
       unique key grillz-gallery/<id>, while keeping legacy grillz-gallery/000001
       and grillz-gallery/<fileNoExt> as fallbacks. */
    if (cat === 'grillz-gallery' && folder === '000001' && id) {
      return [cat + '/' + id, cat + '/' + folder];
    }
    var primary = cat + '/' + folder;
    return (id && id !== folder) ? [primary, cat + '/' + id] : [primary];
  }

  function buildPathIndex() {
    if (pathIndex) return Promise.resolve(pathIndex);
    if (pathPromise) return pathPromise;
    var source = (global.Catalog && typeof global.Catalog.load === 'function')
      ? global.Catalog.load()
      : (global.fetch
          ? global.fetch('/assets/images/catalog.json').then(function (r) { return r.ok ? r.json() : []; })
          : Promise.resolve([]));
    pathPromise = source
      .then(function (all) {
        var idx = {};
        (Array.isArray(all) ? all : []).forEach(function (item) {
          var cat = item.catFolder || item.category || item.page || 'sets';
          var folder = item.folder || item.id || '';
          var keys = designKeysForItem(item);
          if (!keys.length) return;
          (item.images || []).forEach(function (f) {
            if (!f) return;
            var fileNoExt = fileOf(f).replace(/\.[^.]+$/, '');
            var entryKeys = keys.slice();
            if (fileNoExt && entryKeys.indexOf(cat + '/' + fileNoExt) === -1) {
              entryKeys.push(cat + '/' + fileNoExt);
            }
            if (/^https?:\/\//i.test(f) || f.charAt(0) === '/') {
              idx[normPath(f)] = entryKeys;
              return;
            }
            if (folder) idx[normPath('assets/images/' + cat + '/' + folder + '/' + f)] = entryKeys;
            idx[normPath('assets/images/' + cat + '/' + f)] = entryKeys;
            if (folder) idx[normPath('assets/images/' + folder + '/' + f)] = entryKeys;
          });
        });
        pathIndex = idx;
        pathPromise = null;
        return idx;
      })
      .catch(function () { pathIndex = pathIndex || {}; pathPromise = null; return pathIndex; });
    return pathPromise;
  }

  /* ── rendering ────────────────────────────────────────────────────── */

  function applyStyles(img, crop) {
    if (!img || !img.style) return;
    var st = img.style;
    var c = crop ? normaliseCrop(crop) : null;

    if (!c || (c.x === 50 && c.y === 50 && c.zoom === 1)) {
      st.objectPosition = '';
      st.width = '';
      st.height = '';
      st.left = '';
      st.top = '';
      st.maxWidth = '';
      st.maxHeight = '';
      return;
    }

    st.objectPosition = c.x + '% ' + c.y + '%';
    st.maxWidth = 'none';
    st.maxHeight = 'none';

    if (c.zoom > 1) {
      var pct = function (n) { return (Math.round(n * 1000) / 1000) + '%'; };
      st.width = pct(c.zoom * 100);
      st.height = pct(c.zoom * 100);
      st.left = pct(-(c.zoom - 1) * c.x);
      st.top = pct(-(c.zoom - 1) * c.y);
    } else {
      st.width = '';
      st.height = '';
      st.left = '';
      st.top = '';
    }
  }

  /** which slot does this <img> belong to? '' when it is not croppable */
  function slotFor(img) {
    if (!img || img.tagName !== 'IMG') return '';
    if (img.closest && img.closest(SKIP)) return '';
    var host = img.closest ? img.closest('[data-crop]') : null;
    if (host) {
      var s = host.getAttribute('data-crop');
      return s && s !== 'off' ? s : '';
    }
    var path = normPath(img.currentSrc || img.src || '');
    var keys = pathIndex && pathIndex[path];
    if (!keys || !keys.length) return '';
    var list = Array.isArray(keys) ? keys : [keys];
    var file = fileOf(path);
    for (var i = 0; i < list.length; i++) {
      var perPhoto = 'card:' + list[i] + '::' + file;
      if (map[perPhoto]) return perPhoto;
      var whole = 'card:' + list[i];
      if (map[whole]) return whole;
    }
    return 'card:' + list[0];
  }

  function apply(img) {
    if (!img || img.tagName !== 'IMG') return;
    var slot = slotFor(img);
    if (!slot) return;
    img.setAttribute('data-crop-slot', slot);
    applyStyles(img, map[slot]);
  }

  function applyAll(root) {
    if (typeof document === 'undefined') return;
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('img').forEach(apply);
  }

  function observe() {
    if (typeof MutationObserver !== 'function' || typeof document === 'undefined' || !document.body) return;
    var obs = new MutationObserver(function (records) {
      if (!Object.keys(map).length) return;
      records.forEach(function (rec) {
        (rec.addedNodes || []).forEach(function (node) {
          if (!node || node.nodeType !== 1) return;
          if (node.tagName === 'IMG') apply(node);
          else if (node.querySelectorAll) node.querySelectorAll('img').forEach(apply);
        });
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function boot() {
    if (started || typeof document === 'undefined') return;
    started = true;
    observe();
    load().then(function () {
      /* Skip building the catalog path index if no card: crops exist at all */
      var hasCardCrop = Object.keys(map).some(function (k) { return k.indexOf('card:') === 0; });
      if (!hasCardCrop) {
        if (Object.keys(map).length) applyAll(document);
        return;
      }
      return buildPathIndex().then(function () { applyAll(document); });
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

  global.Crops = {
    load: load,
    get: function (slot) { return map[slot] || null; },
    all: function () { return Object.assign({}, map); },
    index: function (items) {
      indexItems(items);
      buildPathIndex().then(function () { applyAll(typeof document !== 'undefined' ? document : null); });
    },
    apply: apply,
    applyAll: applyAll,
    applyStyles: applyStyles,
    slotFor: slotFor,
    normPath: normPath,
    designKey: function (item) { return designKeysForItem(item)[0] || ''; },
    refresh: function () {
      try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
      ready = null;
      pathIndex = null;
    },
    invalidate: function () {
      try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
      ready = null;
      pathIndex = null;
    },
    clearCache: function () {
      try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
      ready = null;
      pathIndex = null;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
