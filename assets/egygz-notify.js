/**
 * EGYGRILLZ — Worker notifier (booking, contact message, mould order).
 * Non-blocking with a hard 10s AbortController timeout so slow networks never
 * stall client confirmation screens. Nothing secret is exposed here.
 */
(function (global) {
  'use strict';

  var ENDPOINT = 'https://egygillz-api.egygrillz.workers.dev/api/notify';
  var TIMEOUT_MS = 10000;

  var widgetId, preparing;
  // The site key is public; its matching secret never leaves the Worker. The
  // optional challenge is presented on review, not after the booking is saved.
  function prepareBookingAlert() {
    var host = document.getElementById('booking-alert-widget'),
      note = document.getElementById('booking-alert-note');
    if (!host || preparing) return preparing;
    preparing = (async function () {
      var res = await fetch(new URL('/api/health', ENDPOINT), { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error('health');
      var config = await res.json();
      if (!config.channels || !config.channels.turnstile) return;
      if (!config.turnstileSiteKey) throw new Error('no-site-key');
      note.textContent = 'Complete this check for an instant studio alert.';
      if (!global.turnstile)
        await new Promise(function (resolve, reject) {
          var script = document.createElement('script');
          script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      global.turnstile.ready(function () {
        widgetId = global.turnstile.render(host, { sitekey: config.turnstileSiteKey });
      });
    })().catch(function () {
      note.textContent = 'Instant alerts may be unavailable. Your appointment can still be booked.';
      preparing = null;
    });
    return preparing;
  }

  function turnstileToken() {
    try {
      return (global.turnstile && global.turnstile.getResponse && global.turnstile.getResponse(widgetId)) || '';
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
    prepareBookingAlert:prepareBookingAlert,
    booking: function (d) { return send('booking', d); },
    message: function (d) { return send('message', d); },
    mould: function (d) { return send('mould', d); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
