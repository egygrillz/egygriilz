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
 *  If Firestore is unreachable or rate-limited, the cached overlay (or the
 *  seed file untouched) is served immediately so the site is never blocked.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PROJECT = 'egygrillz-studio';
  /* Public web key — Firestore REST rejects keyless reads. */
  var API_KEY = 'AIzaSyDg8i3Bk1LVvScITFL1rDd5NSa0B5TjBZk';
  var DOC_URL = 'https://firestore.googleapis.com/v1/projects/' + PROJECT +
    '/databases/(default)/documents/settings/catalog?key=' + API_KEY;
  var SEED = '/assets/images/catalog.json';
  var TTL = 60 * 1000;                  // in-memory reuse across sections on same page
  var TIMEOUT = 5000;                   // never stall the grid on a slow database
  var OVERLAY_KEY = 'egygz_catalog_overlay_v1';
  var SEED_SESSION_KEY = 'egygz_catalog_seed_v1';
  var QUOTA_KEY = 'egygz_fs_quota_until_v1';
  var OVERLAY_TTL = 30 * 60 * 1000;     // 30 min reuse to protect free 50k/day quota
  var QUOTA_COOLDOWN = 15 * 60 * 1000;  // 15 min backoff after HTTP 429

  var cache = null;
  var cachedAt = 0;
  var seedMem = null;
  var inflight = null;

  function isQuotaCooling() {
    try {
      var until = Number(localStorage.getItem(QUOTA_KEY) || 0);
      return until > Date.now();
    } catch (e) { return false; }
  }

  function markQuotaHit() {
    try { localStorage.setItem(QUOTA_KEY, String(Date.now() + QUOTA_COOLDOWN)); } catch (e) {}
  }

  function fetchWithTimeout(url, opts, ms) {
    if (!global.fetch) return Promise.reject(new Error('no-fetch'));
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) { try { ctrl.abort(); } catch (e) {} } }, ms || TIMEOUT);
    var init = Object.assign({}, opts || {});
    if (ctrl) init.signal = ctrl.signal;
    return global.fetch(url, init).finally(function () { clearTimeout(timer); });
  }

  /* ── Firestore REST → plain JS ─────────────────────────────────────────── */
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

  function decodeFields(fields) {
    var out = {};
    Object.keys(fields || {}).forEach(function (k) { out[k] = decodeValue(fields[k]); });
    return out;
  }

  /* ── sources ───────────────────────────────────────────────────────────── */
  function readSeed(force) {
    if (!force && Array.isArray(seedMem)) return Promise.resolve(seedMem);
    if (!force) {
      try {
        var raw = sessionStorage.getItem(SEED_SESSION_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) {
            seedMem = parsed;
            return Promise.resolve(parsed);
          }
        }
      } catch (e) {}
    }
    var url = force ? (SEED + '?v=' + Date.now()) : SEED;
    return fetchWithTimeout(url, force ? { cache: 'no-cache' } : undefined, 8000)
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (j) {
        var arr = Array.isArray(j) ? j : [];
        if (arr.length) {
          seedMem = arr;
          try { sessionStorage.setItem(SEED_SESSION_KEY, JSON.stringify(arr)); } catch (e) {}
        }
        return arr;
      })
      .catch(function () {
        if (Array.isArray(seedMem)) return seedMem;
        return [];
      });
  }

  function readOverlayCache(allowStale) {
    try {
      var o = JSON.parse(localStorage.getItem(OVERLAY_KEY) || 'null');
      if (!o || !Array.isArray(o.items) || !o.at) return null;
      if (!allowStale && (Date.now() - o.at > OVERLAY_TTL)) return null;
      return { items: o.items, deleted: Array.isArray(o.deleted) ? o.deleted : [] };
    } catch (e) { return null; }
  }

  function writeOverlayCache(overlay) {
    try {
      localStorage.setItem(OVERLAY_KEY, JSON.stringify({
        at: Date.now(), items: overlay.items, deleted: overlay.deleted,
      }));
    } catch (e) {}
  }

  function readOverlay(force) {
    var empty = { items: [], deleted: [] };
    if (!force) {
      var saved = readOverlayCache(false);
      if (saved) return Promise.resolve(saved);
    }
    var stale = readOverlayCache(true);
    if (!force && isQuotaCooling()) return Promise.resolve(stale || empty);
    if (!global.fetch) return Promise.resolve(stale || empty);

    return fetchWithTimeout(DOC_URL, undefined, TIMEOUT)
      .then(function (r) {
        if (r.status === 429) { markQuotaHit(); return null; }
        if (r.status === 404) { writeOverlayCache(empty); return { __empty: true }; }
        return r.ok ? r.json() : null;
      })
      .then(function (doc) {
        if (!doc) return stale || empty;
        if (doc.__empty) return empty;
        var data = decodeFields(doc.fields || {});
        var overlay = {
          items: Array.isArray(data.items) ? data.items : [],
          deleted: Array.isArray(data.deleted) ? data.deleted : [],
        };
        writeOverlayCache(overlay);
        return overlay;
      })
      .catch(function () { return stale || empty; });
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

  /** Resolve a design image/video path across standard folders, grillz-gallery, and uploaded URLs */
  function mediaPath(item, file) {
    var f = String(file || '').trim();
    if (!f) return '';
    if (/^(https?:|data:|blob:|\/)/i.test(f)) return f;
    if (/^assets\//i.test(f)) return f;
    var cat = String((item && (item.catFolder || item.category || item.page)) || 'sets').trim();
    var folder = String((item && (item.folder || item.id)) || '').trim();
    /* grillz-gallery seed items live directly under assets/images/grillz-gallery/<file>
       and all share folder "000001"; new gallery items added in /editx get their own folder */
    if (cat === 'grillz-gallery' && (!folder || folder === '000001')) {
      return 'assets/images/grillz-gallery/' + f;
    }
    if (!folder) return 'assets/images/' + cat + '/' + f;
    return 'assets/images/' + cat + '/' + folder + '/' + f;
  }

  function applyVisibility(list) {
    var vis = global.EGYGZ && global.EGYGZ.visibility;
    if (!vis || typeof vis.filter !== 'function') return Promise.resolve(list);
    return vis.filter(list).catch(function () { return list; });
  }

  function load(force) {
    var now = Date.now();
    if (!force && cache && (now - cachedAt) < TTL) return Promise.resolve(cache);
    if (!force && inflight) return inflight;
    var p = Promise.all([readSeed(!!force), readOverlay(!!force)])
      .then(function (r) { return applyVisibility(merge(r[0], r[1])); })
      .catch(function () { return cache || []; })
      .then(function (list) {
        if (inflight === p) inflight = null;
        if (Array.isArray(list)) { cache = list; cachedAt = Date.now(); }
        return cache || [];
      });
    inflight = p;
    return p;
  }

  /**
   * Public price display helper respecting per-design `showPrice` (Yes / No) set in /editx.
   * When `item.showPrice === false` (No), always shows "Contact for Quotation" → /contact.
   */
  function priceInfo(item, opts) {
    var o = opts || {};
    var name = String((item && (item.name || item.id)) || '').trim();
    var href = '/contact' + (name ? ('?design=' + encodeURIComponent(name)) : '');
    if (!item || item.showPrice === false) {
      return { show: false, isQuote: true, text: 'Contact for Quotation', href: href };
    }
    var raw = String(item.price || '').trim();
    if (raw) {
      if (/contact|quot|inquir|upon request|ask|dm/i.test(raw)) {
        return { show: false, isQuote: true, text: 'Contact for Quotation', href: href };
      }
      var num = parseFloat(raw.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(num) && num > 0) {
        var curMatch = raw.match(/\b(EGP|USD|EUR|GBP|AED|SAR)\b/i);
        var cur = curMatch ? curMatch[1].toUpperCase() : 'EGP';
        var formatted = Math.round(num).toLocaleString('en-US') + ' ' + cur;
        return { show: true, isQuote: false, text: formatted, href: href };
      }
    }
    if (o.fallbackQuote) {
      return { show: false, isQuote: true, text: 'Contact for Quotation', href: href };
    }
    return { show: false, isQuote: false, text: '', href: href };
  }

  global.Catalog = {
    seedUrl: 'assets/images/catalog.json',
    load: load,
    merge: merge,
    mediaPath: mediaPath,
    priceInfo: priceInfo,
    invalidate: function (force) {
      try { localStorage.removeItem(OVERLAY_KEY); } catch (e) {}
      try { sessionStorage.removeItem(SEED_SESSION_KEY); } catch (e) {}
      cache = null; cachedAt = 0; seedMem = null;
      if (force !== false) inflight = null;
    },
    clearCache: function (force) {
      try { localStorage.removeItem(OVERLAY_KEY); } catch (e) {}
      try { sessionStorage.removeItem(SEED_SESSION_KEY); } catch (e) {}
      cache = null; cachedAt = 0; seedMem = null;
      if (force !== false) inflight = null;
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
