/* ═══════════════════════════════════════════════════════════════════════════
 *  EGYGRILLZ — SET VISIBILITY
 *  ---------------------------------------------------------------------------
 *  /editx and the Telegram bot both write the "hidden on the site" list to
 *  Firestore  settings/visibility  →  { hidden: ["folder-id", …] }.
 *
 *  The catalogue itself is a static file (assets/images/catalog.json), so this
 *  script sits in front of it: every request for catalog.json waits for the
 *  hidden list (once, cached) and returns the catalogue without those designs.
 *  Nothing else on the page has to change — including the lazy loaders.
 *
 *  Load it BEFORE the page's own scripts:
 *      <script src="/assets/set-visibility.js"></script>
 *  If the database is unreachable the catalogue is returned untouched, so the
 *  site can never be blocked by this file.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PROJECT = 'egygrillz-studio';
  /* Public web key — Firestore REST rejects keyless reads. */
  var API_KEY = 'AIzaSyDg8i3Bk1LVvScITFL1rDd5NSa0B5TjBZk';
  var DOC_URL = 'https://firestore.googleapis.com/v1/projects/' + PROJECT +
    '/databases/(default)/documents/settings/visibility?key=' + API_KEY;
  var CACHE_KEY = 'egygz_visibility_v1';
  var CACHE_TTL = 5 * 60 * 1000;   // 5 minutes, so a toggle shows up quickly

  var ready = null;                 // Promise<string[]>
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !Array.isArray(o.hidden) || !o.at) return null;
      if (Date.now() - o.at > CACHE_TTL) return null;
      return o.hidden;
    } catch (e) { return null; }
  }

  function writeCache(hidden) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ hidden: hidden, at: Date.now() }));
    } catch (e) { /* private mode — cost nothing */ }
  }

  function load() {
    if (ready) return ready;
    var cached = readCache();
    if (cached) { ready = Promise.resolve(cached); return ready; }

    ready = new Promise(function (resolve) {
      if (!nativeFetch) return resolve([]);
      var timer = setTimeout(function () { resolve([]); }, 2500);   // never stall the page
      nativeFetch(DOC_URL)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (doc) {
          var values = doc && doc.fields && doc.fields.hidden &&
            doc.fields.hidden.arrayValue && doc.fields.hidden.arrayValue.values;
          var hidden = (values || []).map(function (v) {
            return String(v.stringValue || '').toLowerCase();
          }).filter(Boolean);
          writeCache(hidden);
          clearTimeout(timer);
          resolve(hidden);
        })
        .catch(function () { clearTimeout(timer); resolve([]); });
    });
    return ready;
  }

  function keyOf(item) {
    if (!item) return '';
    return String(item.folder || item.id || '').trim().toLowerCase();
  }

  function filterCatalogue(list, hidden) {
    if (!Array.isArray(list) || !hidden.length) return list;
    return list.filter(function (item) { return hidden.indexOf(keyOf(item)) === -1; });
  }

  if (nativeFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var isCatalogue = /catalog\.json/i.test(url);
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

  window.EGYGZ = window.EGYGZ || {};
  window.EGYGZ.visibility = {
    /** Promise<string[]> — the hidden design keys */
    load: load,
    /** filter any catalogue array with the current hidden list */
    filter: function (list) {
      return load().then(function (hidden) { return filterCatalogue(list, hidden); });
    },
    /** true when a design is hidden */
    isHidden: function (item) {
      return load().then(function (hidden) { return hidden.indexOf(keyOf(item)) !== -1; });
    },
  };
})();
