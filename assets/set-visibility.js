/* ═══════════════════════════════════════════════════════════════════════════
 *  EGYGRILLZ — SET VISIBILITY
 *  ---------------------------------------------------------------------------
 *  /editx and the Telegram bot both write the "hidden on the site" list to
 *  Firestore  settings/visibility  →  { hidden: ["folder-id", …] }.
 *
 *  Every request for catalog.json (and Catalog.load()) filters out hidden
 *  designs using an O(1) Set, backed by a localStorage cache and 429 cooldown
 *  so the site stays fast and never burns Firestore quota.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PROJECT = 'egygrillz-studio';
  var API_KEY = 'AIzaSyDg8i3Bk1LVvScITFL1rDd5NSa0B5TjBZk';
  var DOC_URL = 'https://firestore.googleapis.com/v1/projects/' + PROJECT +
    '/databases/(default)/documents/settings/visibility?key=' + API_KEY;
  var CACHE_KEY = 'egygz_visibility_v1';
  var QUOTA_KEY = 'egygz_fs_quota_until_v1';
  var CACHE_TTL = 30 * 60 * 1000;       // 30 minutes
  var QUOTA_COOLDOWN = 15 * 60 * 1000;  // 15 min backoff on HTTP 429
  var TIMEOUT = 4000;

  var ready = null;
  var nativeFetch = global.fetch ? global.fetch.bind(global) : null;

  function isQuotaCooling() {
    try { return Number(localStorage.getItem(QUOTA_KEY) || 0) > Date.now(); } catch (e) { return false; }
  }
  function markQuotaHit() {
    try { localStorage.setItem(QUOTA_KEY, String(Date.now() + QUOTA_COOLDOWN)); } catch (e) {}
  }

  function readCache(allowStale) {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !Array.isArray(o.hidden) || !o.at) return null;
      if (!allowStale && (Date.now() - o.at > CACHE_TTL)) return null;
      return o.hidden.map(function (s) { return String(s || '').trim().toLowerCase(); }).filter(Boolean);
    } catch (e) { return null; }
  }

  function writeCache(hidden) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ hidden: hidden, at: Date.now() }));
    } catch (e) {}
  }

  function load(force) {
    if (!force && ready) return ready;
    if (!force) {
      var cached = readCache(false);
      if (cached) { ready = Promise.resolve(cached); return ready; }
    }
    var stale = readCache(true);
    if (!force && isQuotaCooling()) {
      ready = Promise.resolve(stale || []);
      return ready;
    }

    ready = new Promise(function (resolve) {
      if (!nativeFetch) return resolve(stale || []);
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (ctrl) { try { ctrl.abort(); } catch (e) {} }
      }, TIMEOUT);

      nativeFetch(DOC_URL, ctrl ? { signal: ctrl.signal } : undefined)
        .then(function (r) {
          if (r.status === 429) { markQuotaHit(); return null; }
          if (r.status === 404) { writeCache([]); return { __empty: true }; }
          return r.ok ? r.json() : null;
        })
        .then(function (doc) {
          clearTimeout(timer);
          if (!doc) return resolve(stale || []);
          if (doc.__empty) return resolve([]);
          var values = doc.fields && doc.fields.hidden &&
            doc.fields.hidden.arrayValue && doc.fields.hidden.arrayValue.values;
          var hidden = (values || []).map(function (v) {
            return String(v.stringValue || '').trim().toLowerCase();
          }).filter(Boolean);
          writeCache(hidden);
          resolve(hidden);
        })
        .catch(function () { clearTimeout(timer); resolve(stale || []); });
    });
    return ready;
  }

  /** Keys that identify an item in settings/visibility (handles grillz-gallery shared folder "000001") */
  function keysOf(item) {
    if (!item) return [];
    var out = [];
    var id = String(item.id || '').trim().toLowerCase();
    var folder = String(item.folder || '').trim().toLowerCase();
    var cat = String(item.category || item.page || '').trim().toLowerCase();
    if (id) out.push(id);
    if (folder && folder !== id) {
      /* In grillz-gallery, seed items gallery1..gallery8 all share folder "000001";
         only match folder when it is actually unique to the item. */
      if (!(cat === 'grillz-gallery' && folder === '000001')) {
        out.push(folder);
      } else if (id === 'gallery1') {
        out.push(folder);
      }
    }
    return out;
  }

  function isItemHidden(item, hiddenSet) {
    if (!item || !hiddenSet || !hiddenSet.size) return false;
    var keys = keysOf(item);
    for (var i = 0; i < keys.length; i++) {
      if (hiddenSet.has(keys[i])) return true;
    }
    return false;
  }

  function filterCatalogue(list, hidden) {
    if (!Array.isArray(list) || !Array.isArray(hidden) || !hidden.length) return list;
    var set = new Set(hidden.map(function (s) { return String(s || '').trim().toLowerCase(); }).filter(Boolean));
    if (!set.size) return list;
    return list.filter(function (item) { return !isItemHidden(item, set); });
  }

  if (nativeFetch && typeof Response === 'function') {
    global.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var isCatalogue = /(?:^|\/)catalog\.json(?:$|\?)/i.test(url);
      var run = nativeFetch(input, init);
      if (!isCatalogue) return run;
      return load().then(function (hidden) {
        if (!hidden.length) return run;
        return run.then(function (res) {
          if (!res || !res.ok) return res;
          return res.clone().json().then(function (json) {
            var body = JSON.stringify(filterCatalogue(json, hidden));
            return new Response(body, {
              status: res.status,
              statusText: res.statusText,
              headers: { 'Content-Type': 'application/json' },
            });
          }).catch(function () { return res; });
        });
      });
    };
  }

  function invalidate() {
    try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
    ready = null;
  }

  global.EGYGZ = global.EGYGZ || {};
  global.EGYGZ.visibility = {
    load: load,
    filter: function (list) {
      return load().then(function (hidden) { return filterCatalogue(list, hidden); });
    },
    isHidden: function (item) {
      return load().then(function (hidden) {
        return isItemHidden(item, new Set(hidden));
      });
    },
    invalidate: invalidate,
    clearCache: invalidate,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
