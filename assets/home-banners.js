/* ═══════════════════════════════════════════════════════════════════════════
 *  EGYGRILLZ — HOME SECTION BANNERS
 *  ---------------------------------------------------------------------------
 *  The wide banner at the top of each collection section on the home page
 *  (Golds / Silvers / Diamonds) is chosen in /editx → "Home Banners".
 *
 *  The choice is stored in Firestore  settings/banners :
 *      { golds:    { images: ["/assets/banners/golds-1.jpg"], name: "…", desc: "…" },
 *        silvers:  { … },
 *        diamonds: { … } }
 *
 *  When a section has no banner the home page falls back to the first design
 *  assigned to that page — exactly what it did before this file existed.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PROJECT = 'egygrillz-studio';
  /* Public web key of the project (already shipped in every page).
     Firestore's REST API refuses keyless reads, which made the banner
     document unreachable — the home page then always fell back to the
     first design, so a banner saved in /editx never showed up. */
  var API_KEY = 'AIzaSyDg8i3Bk1LVvScITFL1rDd5NSa0B5TjBZk';
  var DOC_URL = 'https://firestore.googleapis.com/v1/projects/' + PROJECT +
    '/databases/(default)/documents/settings/banners?key=' + API_KEY;
  var TIERS = ['golds', 'silvers', 'diamonds'];
  var CACHE_KEY = 'egygz_banners_v1';
  var CACHE_TTL = 20 * 1000;         // seconds — so a saved banner shows up fast
  var ready = null;

  /** Firestore REST value → plain JS */
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

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.at || Date.now() - o.at > CACHE_TTL) return null;
      return normalise(o.data || {});
    } catch (e) { return null; }
  }

  function writeCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: data, at: Date.now() })); } catch (e) {}
  }

  function load() {
    if (ready) return ready;
    var cached = readCache();
    if (cached) { ready = Promise.resolve(cached); return ready; }
    ready = new Promise(function (resolve) {
      if (!window.fetch) return resolve(normalise({}));
      var timer = setTimeout(function () { resolve(normalise({})); }, 2500);
      window.fetch(DOC_URL, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (doc) {
          var data = doc && doc.fields ? val({ mapValue: { fields: doc.fields } }) : {};
          var clean = normalise(data || {});
          writeCache(data || {});
          clearTimeout(timer);
          resolve(clean);
        })
        .catch(function () { clearTimeout(timer); resolve(normalise({})); });
    });
    return ready;
  }

  /** site path for a banner image (absolute URLs pass through) */
  function srcOf(path) {
    var p = String(path || '').trim();
    if (!p) return '';
    if (/^https?:\/\//i.test(p) || p.charAt(0) === '/') return p;
    return '/' + p;
  }

  window.HomeBanners = {
    TIERS: TIERS,
    load: load,
    get: function (tier) {
      return load().then(function (all) { return (all && all[tier]) || { images: [], name: '', desc: '' }; });
    },
    srcOf: srcOf,
  };
})();
