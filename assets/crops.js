/* ═══════════════════════════════════════════════════════════════════════════
 *  EGYGRILLZ — NON-DESTRUCTIVE IMAGE CROPS
 *  ---------------------------------------------------------------------------
 *  Every image the site shows can be re-framed from /editx without touching
 *  the file itself: the studio drags/zooms a preview and we store the numbers.
 *  The full-original file stays untouched, so a crop can be changed or thrown
 *  away at any time.
 *
 *  Crops are stored per *placement*, so the same photo can be framed one way
 *  as a page hero, another way as a home banner, and a third way as a design
 *  card:
 *
 *      settings/crops → { items: [
 *          { slot: "hero:index",              x: 50, y: 42, zoom: 1.15 },
 *          { slot: "banner:golds",            x: 50, y: 50, zoom: 1.00 },
 *          { slot: "card:golds/golds12",            x: 44, y: 50, zoom: 1.20 },  // every photo
 *          { slot: "card:golds/golds12::000001.jpg", x: 60, y: 50, zoom: 1.00 }   // one photo
 *      ] }
 *
 *  How an element is matched:
 *    1. closest [data-crop="slot"]   → that slot (heroes, banners, anything
 *                                      the page marks explicitly)
 *    2. an image that belongs to a design → "card:<category>/<folder>" or,
 *       when a per-photo entry exists, "card:<category>/<folder>::<file>"
 *    3. anything else (modals, logos, …) is left alone
 *
 *  The rendering rule is shared with the /editx editor through
 *  Crops.applyStyles(), so the preview is exactly what visitors get.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PROJECT = 'egygrillz-studio';
  var API_KEY = 'AIzaSyDg8i3Bk1LVvScITFL1rDd5NSa0B5TjBZk';
  var DOC_URL = 'https://firestore.googleapis.com/v1/projects/' + PROJECT +
    '/databases/(default)/documents/settings/crops?key=' + API_KEY;
  var CACHE_KEY = 'egygz_crops_v1';
  var CACHE_TTL = 20 * 1000;      // seconds — edits show up on the next visit
  var SKIP = '.modal-slide, .modal, [data-crop="off"]';

  var map = {};                   // slot → { x, y, zoom }
  var pathIndex = null;           // normalised image path → design folder
  var started = false;
  var ready = null;

  /* ── paths ─────────────────────────────────────────────────────────── */

  function normPath(u) {
    var s = String(u || '').trim();
    if (!s) return '';
    s = s.split('#')[0].split('?')[0];
    s = s.replace(/^https?:\/\/[^/]+/i, '');
    s = s.replace(/^\.?\//, '');
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

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.at || Date.now() - o.at > CACHE_TTL) return null;
      return Array.isArray(o.items) ? o.items : null;
    } catch (e) { return null; }
  }

  function writeCache(items) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ items: items, at: Date.now() })); } catch (e) {}
  }

  function load() {
    if (ready) return ready;
    var cached = readCache();
    if (cached) {
      indexItems(cached);
      ready = Promise.resolve(map);
      return ready;
    }
    ready = new Promise(function (resolve) {
      if (!window.fetch) { resolve(map); return; }
      var timer = setTimeout(function () { resolve(map); }, 2500);
      window.fetch(DOC_URL, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (doc) {
          var items = doc && doc.fields && doc.fields.items
            ? (val(doc.fields.items) || [])
            : [];
          indexItems(items);
          writeCache(items);
          clearTimeout(timer);
          resolve(map);
        })
        .catch(function () { clearTimeout(timer); resolve(map); });
    });
    return ready;
  }

  /* ── design index (for "card:" slots) ─────────────────────────────── */

  function buildPathIndex() {
    if (pathIndex) return Promise.resolve(pathIndex);
    pathIndex = {};
    /* no cache-buster: the pages already fetch this file, so the browser
       reuses it instead of downloading the catalogue twice */
    var url = 'assets/images/catalog.json';
    return fetch(url)
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (all) {
        (Array.isArray(all) ? all : []).forEach(function (item) {
          var cat = item.category || item.page || 'sets';
          var folder = item.folder || item.id || '';
          if (!folder) return;
          var key = cat + '/' + folder;
          (item.images || []).forEach(function (f) {
            if (!f) return;
            /* the pages address the same photo three ways depending on the
               section: category/folder/file, category/file (gallery) or
               folder/file — index all of them */
            pathIndex[normPath('assets/images/' + cat + '/' + folder + '/' + f)] = key;
            pathIndex[normPath('assets/images/' + cat + '/' + f)] = key;
            pathIndex[normPath('assets/images/' + folder + '/' + f)] = key;
          });
        });
        return pathIndex;
      })
      .catch(function () { return pathIndex; });
  }

  /* ── rendering ────────────────────────────────────────────────────── */

  /**
   * Apply one crop to one element. Shared with /editx, so the editor preview
   * and the live page are always identical.
   *
   * object-position moves the visible window inside the image; the box is
   * scaled up for the zoom and offset so the pan stays anchored. Nothing is
   * written to the file and no transform is used — the card/hero hover
   * effects keep working.
   */
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

  function hasPhotoCrop(slot) {
    return !!map[slot];
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
    var folder = pathIndex && pathIndex[path];
    if (!folder) return '';
    var perPhoto = 'card:' + folder + '::' + fileOf(path);
    return hasPhotoCrop(perPhoto) ? perPhoto : 'card:' + folder;
  }

  function apply(img) {
    if (!img || img.tagName !== 'IMG') return;
    var slot = slotFor(img);
    if (!slot) return;
    if (!img.getAttribute('data-crop-slot')) img.setAttribute('data-crop-slot', slot);
    applyStyles(img, map[slot]);
  }

  function applyAll(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('img').forEach(apply);
  }

  function observe() {
    if (typeof MutationObserver !== 'function' || !document.body) return;
    var obs = new MutationObserver(function (records) {
      records.forEach(function (rec) {
        (rec.addedNodes || []).forEach(function (node) {
          if (!node || node.nodeType !== 1) return;
          if (node.tagName === 'IMG') apply(node);
          else if (node.querySelectorAll) {
            node.querySelectorAll('img').forEach(apply);
            if (node.tagName === 'IMG') apply(node);
          }
        });
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function boot() {
    if (started) return;
    started = true;
    observe();
    load()
      .then(buildPathIndex)
      .then(function () {
        applyAll(document);
        /* late images (slideshows, lazy strips) are caught by the observer,
           but one more pass after the page settles helps the tall galleries */
        setTimeout(function () { applyAll(document); }, 800);
        setTimeout(function () { applyAll(document); }, 2500);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.Crops = {
    load: load,
    get: function (slot) { return map[slot] || null; },
    all: function () { return Object.assign({}, map); },
    index: function (items) { indexItems(items); applyAll(document); },
    apply: apply,
    applyAll: applyAll,
    applyStyles: applyStyles,
    slotFor: slotFor,
    normPath: normPath,
    refresh: function () { try { localStorage.removeItem(CACHE_KEY); } catch (e) {} ready = null; }
  };
})();
