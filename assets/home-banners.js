/* ═══════════════════════════════════════════════════════════════════════════
 *  EGYGRILLZ — HOME SECTION BANNERS
 *  ---------------------------------------------------------------------------
 *  The wide banner at the top of each collection section on the home page
 *  (Golds / Silvers / Diamonds) is chosen in /editx → "Home Banners" and
 *  stored in Firestore  settings/banners.
 *
 *  Backed by a 10-minute localStorage cache, stale fallback, and shared 429
 *  cooldown so visitor traffic stays instant and never burns quota.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PROJECT = 'egygrillz-studio';
  var API_KEY = 'AIzaSyDg8i3Bk1LVvScITFL1rDd5NSa0B5TjBZk';
  var DOC_URL = 'https://firestore.googleapis.com/v1/projects/' + PROJECT +
    '/databases/(default)/documents/settings/banners?key=' + API_KEY;
  var TIERS = ['golds', 'silvers', 'diamonds'];
  var CACHE_KEY = 'egygz_banners_v1';
  var QUOTA_KEY = 'egygz_fs_quota_until_v1';
  var CACHE_TTL = 30 * 60 * 1000;
  var QUOTA_COOLDOWN = 15 * 60 * 1000;
  var TIMEOUT = 4000;
  var ready = null;

  function isQuotaCooling() {
    try { return Number(localStorage.getItem(QUOTA_KEY) || 0) > Date.now(); } catch (e) { return false; }
  }
  function markQuotaHit() {
    try { localStorage.setItem(QUOTA_KEY, String(Date.now() + QUOTA_COOLDOWN)); } catch (e) {}
  }

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

  function normalise(raw) {
    var out = {};
    TIERS.forEach(function (tier) {
      var conf = (raw && raw[tier]) || {};
      var images = Array.isArray(conf.images) ? conf.images : (conf.image ? [conf.image] : []);
      out[tier] = {
        images: images.map(String).map(function (s) { return s.trim(); }).filter(Boolean),
        name: String(conf.name || '').trim(),
        desc: String(conf.desc || '').trim(),
      };
    });
    return out;
  }

  function readCache(allowStale) {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.at) return null;
      if (!allowStale && (Date.now() - o.at > CACHE_TTL)) return null;
      return normalise(o.data || {});
    } catch (e) { return null; }
  }

  function writeCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: data, at: Date.now() })); } catch (e) {}
  }

  function load(force) {
    if (!force && ready) return ready;
    if (!force) {
      var cached = readCache(false);
      if (cached) { ready = Promise.resolve(cached); return ready; }
    }
    var stale = readCache(true);
    if (!force && isQuotaCooling()) {
      ready = Promise.resolve(stale || normalise({}));
      return ready;
    }

    ready = new Promise(function (resolve) {
      if (!global.fetch) return resolve(stale || normalise({}));
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (ctrl) { try { ctrl.abort(); } catch (e) {} }
      }, TIMEOUT);

      global.fetch(DOC_URL, ctrl ? { signal: ctrl.signal } : undefined)
        .then(function (r) {
          if (r.status === 429) { markQuotaHit(); return null; }
          if (r.status === 404) { writeCache({}); return { __empty: true }; }
          return r.ok ? r.json() : null;
        })
        .then(function (doc) {
          clearTimeout(timer);
          if (!doc) return resolve(stale || normalise({}));
          if (doc.__empty) return resolve(normalise({}));
          var data = doc.fields ? val({ mapValue: { fields: doc.fields } }) : {};
          var clean = normalise(data || {});
          writeCache(data || {});
          resolve(clean);
        })
        .catch(function () { clearTimeout(timer); resolve(stale || normalise({})); });
    });
    return ready;
  }

  /** site path for a banner image (absolute and data URLs pass through) */
  function srcOf(path) {
    var p = String(path || '').trim();
    if (!p) return '';
    if (/^(https?:|data:|blob:|\/)/i.test(p)) return p;
    return '/' + p;
  }

  function invalidate() {
    try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
    ready = null;
  }

  global.HomeBanners = {
    TIERS: TIERS,
    load: load,
    get: function (tier) {
      return load().then(function (all) { return (all && all[tier]) || { images: [], name: '', desc: '' }; });
    },
    srcOf: srcOf,
    invalidate: invalidate,
    clearCache: invalidate,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
