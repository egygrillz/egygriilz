/* ═══════════════════════════════════════════════════════════════════════════
 *  EGYGRILLZ — CATALOGUE
 *  ---------------------------------------------------------------------------
 *  The designs live in two places:
 *
 *    • assets/images/catalog.json   the seed that ships with the repo
 *    • Firestore  settings/catalog  everything saved from /editx
 *
 *  This file merges the two for the public pages, so a price, a description
 *  or a “which page is this design on?” change made in /editx shows up in
 *  seconds — no GitHub token, no redeploy.
 *
 *  Shape written by /editx:
 *      { items: [ …catalogue entries… ], deleted: ["id", …], updatedAt: "…" }
 *      items    overlay: same id → that entry wins, new id → appended
 *      deleted  tombstones: a design removed in /editx stays removed even
 *               though it is still inside the seed file
 *
 *  If Firestore is unreachable the seed file is served untouched, so the site
 *  can never be blocked by this script.
 *
 *  Load it BEFORE the page's own scripts, after /assets/set-visibility.js:
 *      <script src="/assets/set-visibility.js?v=2"></script>
 *      <script src="/assets/catalog.js?v=1"></script>
 *  …then  await Catalog.load()  → array of designs.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PROJECT = 'egygrillz-studio';
  /* Public web key — Firestore REST rejects keyless reads. */
  var API_KEY = 'AIzaSyDg8i3Bk1LVvScITFL1rDd5NSa0B5TjBZk';
  var DOC_URL = 'https://firestore.googleapis.com/v1/projects/' + PROJECT +
    '/databases/(default)/documents/settings/catalog?key=' + API_KEY;
  var SEED = 'assets/images/catalog.json';
  var TTL = 15 * 1000;          // one page view, several sections
  var TIMEOUT = 2500;           // never stall the grid on a slow database
  /* Firestore's free plan stops answering after 50,000 reads a day, so the
     saved copy of the overlay is reused for 10 minutes — browsing five pages
     costs one read instead of five. /editx clears it after every save. */
  var OVERLAY_KEY = 'egygz_catalog_overlay_v1';
  var OVERLAY_TTL = 10 * 60 * 1000;

  var cache = null;             // last merged list
  var cachedAt = 0;
  var inflight = null;

  /* ── Firestore REST → plain JS ─────────────────────────────────────────── */
  /* a single Firestore *value* */
  function decodeValue(value) {
    if (!value || typeof value !== 'object') return null;
    if ('nullValue' in value) return null;
    if ('stringValue' in value) return value.stringValue;
    if ('booleanValue' in value) return !!value.booleanValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('timestampValue' in value) return value.timestampValue;
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
    if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
    return null;
  }

  /* a Firestore *field map* (the `fields` object of a document or a mapValue) */
  function decodeFields(fields) {
    var out = {};
    Object.keys(fields || {}).forEach(function (k) { out[k] = decodeValue(fields[k]); });
    return out;
  }

  /* ── sources ───────────────────────────────────────────────────────────── */
  function readSeed() {
    return fetch(SEED + '?t=' + Date.now())
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (j) { return Array.isArray(j) ? j : []; })
      .catch(function () { return []; });
  }

  function readOverlayCache() {
    try {
      var o = JSON.parse(localStorage.getItem(OVERLAY_KEY) || 'null');
      if (!o || !Array.isArray(o.items) || !o.at) return null;
      if (Date.now() - o.at > OVERLAY_TTL) return null;
      return { items: o.items, deleted: Array.isArray(o.deleted) ? o.deleted : [] };
    } catch (e) { return null; }
  }

  function writeOverlayCache(overlay) {
    try {
      localStorage.setItem(OVERLAY_KEY, JSON.stringify({
        at: Date.now(), items: overlay.items, deleted: overlay.deleted,
      }));
    } catch (e) { /* quota / private mode — cost nothing */ }
  }

  function readOverlay() {
    var empty = { items: [], deleted: [] };
    var saved = readOverlayCache();
    if (saved) return Promise.resolve(saved);
    if (!window.fetch) return Promise.resolve(empty);
    var timer;
    var slow = new Promise(function (resolve) {
      timer = setTimeout(function () { resolve(empty); }, TIMEOUT);
    });
    var real = fetch(DOC_URL)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (doc) {
        if (!doc) return empty;
        var data = decodeFields(doc.fields || {});
        var overlay = {
          items: Array.isArray(data.items) ? data.items : [],
          deleted: Array.isArray(data.deleted) ? data.deleted : [],
        };
        writeOverlayCache(overlay);
        return overlay;
      })
      .catch(function () { return empty; });
    return Promise.race([real, slow]).then(function (v) { clearTimeout(timer); return v || empty; });
  }

  /* ── merge ─────────────────────────────────────────────────────────────── */
  function merge(seed, overlay) {
    var byId = {};
    var order = [];
    (seed || []).forEach(function (item) {
      if (!item || !item.id) return;
      if (!byId[item.id]) order.push(item.id);
      byId[item.id] = item;
    });
    ((overlay && overlay.items) || []).forEach(function (item) {
      if (!item || !item.id) return;
      var prev = byId[item.id];
      if (!prev) order.push(item.id);
      byId[item.id] = prev ? Object.assign({}, prev, item) : item;
    });
    ((overlay && overlay.deleted) || []).forEach(function (id) { delete byId[id]; });
    return order.filter(function (id) { return byId[id]; })
      .map(function (id) { return byId[id]; });
  }

  /* designs the studio hid in /editx must stay hidden, even when they come
     from the Firestore overlay (the seed file is filtered by set-visibility,
     the overlay is not) */
  function applyVisibility(list) {
    var vis = window.EGYGZ && window.EGYGZ.visibility;
    if (!vis || typeof vis.filter !== 'function') return Promise.resolve(list);
    return vis.filter(list).catch(function () { return list; });
  }

  function load(force) {
    var now = Date.now();
    if (!force && cache && (now - cachedAt) < TTL) return Promise.resolve(cache);
    if (inflight) return inflight;
    inflight = Promise.all([readSeed(), readOverlay()])
      .then(function (r) { return applyVisibility(merge(r[0], r[1])); })
      .catch(function () { return cache || []; })
      .then(function (list) {
        inflight = null;
        if (list) { cache = list; cachedAt = Date.now(); }
        return cache || [];
      });
    return inflight;
  }

  window.Catalog = {
    seedUrl: SEED,
    /** Promise<design[]> — seed file merged with everything saved in /editx */
    load: load,
    /** the merge rule, exposed for tools that already have both halves */
    merge: merge,
    /** forget the saved overlay — /editx calls this after a save */
    clearCache: function (force) {
      try { localStorage.removeItem(OVERLAY_KEY); } catch (e) {}
      cache = null; cachedAt = 0;
      if (force) inflight = null;
    },
  };
})();
