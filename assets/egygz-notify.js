/**
 * EGYGRILLZ — Worker notifier (booking, contact message, mould order).
 * Non-blocking with a hard 10s AbortController timeout so slow networks never
 * stall client confirmation screens. Nothing secret is exposed here.
 */
(function (global) {
  'use strict';

  var ENDPOINT = 'https://egygillz-api.egygrillz.workers.dev/api/notify';
  var TIMEOUT_MS = 10000;

  function turnstileToken() {
    try {
      return (global.turnstile && global.turnstile.getResponse && global.turnstile.getResponse()) || '';
    } catch (e) { return ''; }
  }

  function send(type, data) {
    if (!global.fetch) return Promise.resolve({ ok: false, error: 'no-fetch' });
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (ctrl) { try { ctrl.abort(); } catch (e) {} }
    }, TIMEOUT_MS);

    var opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: type, data: data || {}, turnstile: turnstileToken() })
    };
    if (ctrl) opts.signal = ctrl.signal;

    return global.fetch(ENDPOINT, opts)
      .then(function (r) {
        return r.json().catch(function () { return { ok: r.ok, status: r.status }; });
      })
      .catch(function (e) {
        console.warn('[EGYGZ] notify failed (non-blocking):', e && e.message ? e.message : e);
        return { ok: false, error: String((e && e.message) || e) };
      })
      .finally(function () { clearTimeout(timer); });
  }

  global.EGYGZ = global.EGYGZ || {};
  global.EGYGZ.notify = {
    booking: function (d) { return send('booking', d); },
    message: function (d) { return send('message', d); },
    mould: function (d) { return send('mould', d); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
