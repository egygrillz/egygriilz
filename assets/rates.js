/* ═══════════════════════════════════════════════════════════════════════════
 *  EGYGRILLZ — LIVE METAL RATES
 *  ---------------------------------------------------------------------------
 *  One place that answers "what is 24K gold worth per gram, in EGP, today".
 *
 *  Gold is quoted on the world market in US dollars per troy ounce, and the
 *  studio bills in Egyptian pounds, so the EGP rate is ALWAYS derived:
 *
 *      EGP per gram (24K) = (XAU/USD per ounce ÷ 31.1034768) × USD/EGP
 *
 *  Nothing in the site should be able to hold a hand-typed gold rate, and no
 *  stored rate should ever win over this one — a stale figure is how a quote
 *  silently loses money.
 *
 *  Sources (both free, no key):
 *    · api.gold-api.com/price/XAU                    → { price }
 *    · cdn.jsdelivr.net/npm/@fawazahmed0/currency-api → { usd: { egp } }
 *
 *  The site's own Worker proxies both at /api/rates, which avoids browser CORS
 *  surprises and lets Cloudflare cache at the edge. If the Worker is
 *  unreachable the two upstreams are called directly instead, and if
 *  everything fails the last good pair is reused and honestly labelled stale.
 * ═══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  /* troy ounce in grams — the conversion everyone forgets */
  var GRAMS_PER_OZT = 31.1034768;

  /* how long a fetched pair stays "fresh" before we go looking again */
  var TTL_MS = 15 * 60 * 1000;
  var REQUEST_TIMEOUT_MS = 8000;
  var LS_KEY = 'egygz_rates_v1';

  var WORKER_BASE = 'https://egygillz-api.egygrillz.workers.dev';
  var WORKER_PATH = '/api/rates';
  var GOLD_URL = 'https://api.gold-api.com/price/XAU';
  var FX_URL = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json';

  /* Plausibility windows. A feed that returns 0, null or a wildly wrong figure
     must never reach a price — a bad gold rate is worse than no gold rate. */
  var OK_GOLD_OZT = { min: 100, max: 20000 };
  var OK_USD_EGP = { min: 1, max: 500 };

  var state = {
    goldUsdPerOz: 0,
    usdEgp: 0,
    at: 0,          /* ms timestamp of the data */
    source: 'none', /* 'worker' | 'direct' | 'cache' | 'none' */
    error: null,
  };

  var listeners = [];
  var inflight = null;

  function inRange(n, w) {
    return Number.isFinite(n) && n >= w.min && n <= w.max;
  }

  /** 24K gold in EGP per gram, from the two market numbers. */
  function egpPerGram24(goldUsdPerOz, usdEgp) {
    var g = Number(goldUsdPerOz);
    var fx = Number(usdEgp);
    if (!inRange(g, OK_GOLD_OZT) || !inRange(fx, OK_USD_EGP)) return 0;
    return (g / GRAMS_PER_OZT) * fx;
  }

  /** Any karat from the 24K figure. 21K = 24K × 21/24, and so on. */
  function forKarat(karat) {
    var k = Number(karat);
    var r = state.egpPerGram24 || 0;
    if (!r || !Number.isFinite(k) || k <= 0 || k > 24) return 0;
    return r * (k / 24);
  }

  function compute() {
    state.egpPerGram24 = egpPerGram24(state.goldUsdPerOz, state.usdEgp);
    return state.egpPerGram24;
  }

  function read() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var v = JSON.parse(raw);
      if (!v || typeof v !== 'object') return null;
      var g = Number(v.goldUsdPerOz);
      var fx = Number(v.usdEgp);
      if (!inRange(g, OK_GOLD_OZT) || !inRange(fx, OK_USD_EGP)) return null;
      return { goldUsdPerOz: g, usdEgp: fx, at: Number(v.at) || 0, stale: v.stale === true };
    } catch (e) { return null; }
  }

  function write() {
    try {
      if (!global.localStorage) return;
      global.localStorage.setItem(LS_KEY, JSON.stringify({
        goldUsdPerOz: state.goldUsdPerOz,
        usdEgp: state.usdEgp,
        at: state.at, stale: !!state.error,
      }));
    } catch (e) { /* private mode — the in-memory copy is still fine */ }
  }

  /** fetch with a hard timeout, because a hanging rate must not hang the page */
  function fetchJson(url, opts) {
    var o = opts || {};
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, REQUEST_TIMEOUT_MS) : null;
    var init = { method: 'GET', mode: 'cors', cache: 'no-store' };
    if (ctl) init.signal = ctl.signal;
    if (o.token) init.headers = { Authorization: 'Bearer ' + o.token };

    return fetch(url, init).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
      return res.json();
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function notify() {
    listeners.slice().forEach(function (fn) {
      try { fn(snapshot()); } catch (e) { /* a bad listener must not break the rest */ }
    });
  }

  function snapshot() {
    return {
      goldUsdPerOz: state.goldUsdPerOz,
      usdEgp: state.usdEgp,
      egpPerGram24: state.egpPerGram24 || 0,
      at: state.at,
      source: state.source,
      error: state.error,
      fresh: !!state.at && !state.error && (Date.now() - state.at) < TTL_MS,
      forKarat: forKarat,
      stale: !!state.at && (!!state.error || (Date.now() - state.at) >= TTL_MS),
    };
  }

  /**
   * Try the studio Worker first (server-side fetch, edge-cached, no CORS
   * question at all), then the two upstreams directly.
   */
  function fetchViaWorker(force) {
    return fetchJson(WORKER_BASE + WORKER_PATH + (force ? '?refresh=1' : '')).then(function (d) {
      var g = Number(d && d.goldUsdPerOz);
      var fx = Number(d && d.usdEgp);
      if (!inRange(g, OK_GOLD_OZT) || !inRange(fx, OK_USD_EGP)) {
        throw new Error('worker returned an implausible rate');
      }
      return { goldUsdPerOz: g, usdEgp: fx, at: Number(d.at) || Date.now(), source: 'worker', stale: d.stale === true };
    });
  }

  function fetchDirect() {
    return Promise.all([fetchJson(GOLD_URL), fetchJson(FX_URL)]).then(function (out) {
      var gold = out[0];
      var fxDoc = out[1];
      var g = Number(gold && (gold.price != null ? gold.price : gold.ask));
      var fx = Number(fxDoc && fxDoc.usd && fxDoc.usd.egp);
      if (!inRange(g, OK_GOLD_OZT)) throw new Error('gold feed returned ' + g);
      if (!inRange(fx, OK_USD_EGP)) throw new Error('fx feed returned ' + fx);
      return { goldUsdPerOz: g, usdEgp: fx, at: Date.now(), source: 'direct' };
    });
  }

  /**
   * Refresh the rates.
   *   load()          → uses the cache while it is fresh, otherwise fetches
   *   load({force:1}) → always fetches
   * Resolves with a snapshot; never rejects.
   */
  function load(opts) {
    var o = opts || {};
    var cached = read();

    if (cached && !o.force) {
      state.goldUsdPerOz = cached.goldUsdPerOz;
      state.usdEgp = cached.usdEgp;
      state.at = cached.at;
      state.source = 'cache';
      state.error = cached.stale ? 'Last known rate' : null;
      compute();
      /* fresh enough: answer immediately, and top up quietly in the background */
      if (!cached.stale && (Date.now() - cached.at) < TTL_MS) {
        notify();
        return Promise.resolve(snapshot());
      }
      notify();
    }

    if (inflight) return inflight;

    inflight = fetchViaWorker(o.force)
      .catch(function () { return fetchDirect(); })
      .then(function (got) {
        state.goldUsdPerOz = got.goldUsdPerOz;
        state.usdEgp = got.usdEgp;
        state.at = got.at;
        state.source = got.source;
        state.error = got.stale ? 'Market feed returned a last known rate' : null;
        compute();
        write();
        notify();
        return snapshot();
      })
      .catch(function (err) {
        state.error = String((err && err.message) || err);
        /* keep whatever we already had — a stale number beats no number, but
           it is labelled stale everywhere it is shown */
        if (cached) {
          state.goldUsdPerOz = cached.goldUsdPerOz;
          state.usdEgp = cached.usdEgp;
          state.at = cached.at;
          state.source = 'cache';
          compute();
        }
        notify();
        return snapshot();
      })
      .then(function (snap) {
        inflight = null;
        return snap;
      });

    return inflight;
  }

  /** Subscribe. Fires on every successful or failed refresh. */
  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function off() {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /* ── display helpers ──────────────────────────────────────────────────── */

  function fmtNum(n, dp) {
    var v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return v.toLocaleString('en-EG', {
      minimumFractionDigits: dp == null ? 0 : dp,
      maximumFractionDigits: dp == null ? 0 : dp,
    });
  }

  function fmtEgpPerGram() {
    return state.egpPerGram24 ? fmtNum(state.egpPerGram24, 0) : '—';
  }

  function fmtTime(ts) {
    var t = Number(ts);
    if (!t) return '—';
    try {
      return new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return '—'; }
  }

  /** "updated 14:32" or "last known 09:10 — could not refresh" */
  function statusLine() {
    if (!state.at) return 'rate unavailable';
    var t = fmtTime(state.at);
    if (state.source === 'none') return 'rate unavailable';
    if (snapshot().stale) return 'last known ' + t + (state.error ? ' — could not refresh' : '');
    return 'updated ' + t;
  }

  /**
   * Start using live rates. Safe to call more than once.
   * Writes the derived 24K EGP/gram into CalcEngine on every refresh, so every
   * page that prices anything is reading the same number.
   */
  function attach(engine, opts) {
    var o = opts || {};
    onChange(function (snap) {
      if (!engine || typeof engine.set !== 'function') return;
      if (snap.egpPerGram24 > 0) engine.set({ goldPrice: snap.egpPerGram24 });
    });
    var snap = load({ force: !!o.force });
    snap.then(function (s) {
      if (engine && typeof engine.set === 'function' && s.egpPerGram24 > 0) {
        engine.set({ goldPrice: s.egpPerGram24 });
      }
    });
    if (o.interval !== false) {
      var every = Number(o.interval) || 5 * 60 * 1000;
      setInterval(function () { load({ force: true }); }, every);
      /* a laptop lid closing hides the tab; refresh on the way back */
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) load();
      });
    }
    return snap;
  }

  global.MetalRates = {
    GRAMS_PER_OZT: GRAMS_PER_OZT,
    load: load,
    attach: attach,
    onChange: onChange,
    snapshot: snapshot,
    current: function () { return state; },
    goldEgpPerGram24: function () { return state.egpPerGram24 || 0; },
    egpPerGram24: egpPerGram24,
    forKarat: forKarat,
    statusLine: statusLine,
    fmtNum: fmtNum,
    fmtEgpPerGram: fmtEgpPerGram,
    fmtTime: fmtTime,
    LS_KEY: LS_KEY,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
